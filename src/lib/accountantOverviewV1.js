import { supabase } from './supabaseClient';
import { fetchCashbookEntries } from './queries';

const pad2 = (n) => String(n).padStart(2, '0');
const monthKeyOf = (d = new Date()) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
const monthStartOf = (monthKey) => `${monthKey}-01`;
const monthEndOf = (monthKey) => {
  const [y, m] = monthKey.split('-').map(Number);
  const d = new Date(y, m, 0); // ngày cuối tháng
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};

// ---- 1. Chờ chi: expense_claims đã qua ngưỡng duyệt (GĐ duyệt hoặc tự động < 500k) ----
export async function fetchReadyToPayExpenses() {
  const { data, error } = await supabase
    .from('expense_claims')
    .select('*')
    .eq('status', 'pending_accounting')
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function markExpensePaid(id, paymentMethod, receiptUrl) {
  const { data, error } = await supabase.rpc('record_expense_claim', {
    p_id: id, p_payment_method: paymentMethod, p_receipt_url: receiptUrl,
  });
  if (error) throw error;
  return data;
}

// ---- 2. Tạm ứng: đã GĐ duyệt, chờ Kế toán chi thật ----
export async function fetchReadyToPayAdvances() {
  const { data, error } = await supabase
    .from('salary_advance_requests')
    .select('*')
    .eq('status', 'pending_accounting')
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function payAdvance(id, paymentMethod, receiptUrl) {
  const { data, error } = await supabase.rpc('pay_salary_advance', {
    p_id: id, p_payment_method: paymentMethod, p_receipt_url: receiptUrl,
  });
  if (error) throw error;
  return data;
}

// ---- 3. Đơn đang chờ Giám đốc (chưa tới lượt Kế toán) — dùng cho ô "Cần duyệt" ----
export async function fetchPendingDirectorTotals() {
  const [claimsRes, advancesRes] = await Promise.all([
    supabase.from('expense_claims').select('amount').eq('status', 'pending_director'),
    supabase.from('salary_advance_requests').select('amount').eq('status', 'pending_director'),
  ]);
  if (claimsRes.error) throw claimsRes.error;
  if (advancesRes.error) throw advancesRes.error;
  const claims = claimsRes.data || [];
  const advances = advancesRes.data || [];
  return {
    count: claims.length + advances.length,
    total: claims.reduce((s, c) => s + (Number(c?.amount) || 0), 0) + advances.reduce((s, a) => s + (Number(a?.amount) || 0), 0),
  };
}

// ---- 4. Sổ chi (cashbook_entries thật) — lọc theo kỳ tháng ----
// cashbook_entries không lưu ảnh chứng từ (ảnh nằm ở expense_claims /
// salary_advance_requests.disbursed_receipt_url) — join ngược qua
// cashbook_entry_id để dòng sổ chi bấm vào xem lại được ảnh đã chi.
export async function fetchLedgerForMonth(monthKey = monthKeyOf()) {
  const from = monthStartOf(monthKey);
  const to = monthEndOf(monthKey);
  const rows = await fetchCashbookEntries({ since: `${from}T00:00:00` });
  const filtered = (rows || []).filter((r) => {
    const d = String(r?.occurred_at || '').slice(0, 10);
    return d >= from && d <= to;
  });
  const entryIds = filtered.map((r) => r.id).filter(Boolean);
  if (entryIds.length === 0) return filtered;

  const [claimsRes, advancesRes] = await Promise.all([
    supabase.from('expense_claims').select('cashbook_entry_id, disbursed_receipt_url, disbursed_payment_method').in('cashbook_entry_id', entryIds),
    supabase.from('salary_advance_requests').select('cashbook_entry_id, disbursed_receipt_url, disbursed_payment_method').in('cashbook_entry_id', entryIds),
  ]);
  const receiptByEntry = {};
  [...(claimsRes.data || []), ...(advancesRes.data || [])].forEach((row) => {
    if (row.disbursed_receipt_url) receiptByEntry[row.cashbook_entry_id] = row;
  });
  return filtered.map((r) => ({ ...r, receiptUrl: receiptByEntry[r.id]?.disbursed_receipt_url || null, paymentMethod: receiptByEntry[r.id]?.disbursed_payment_method || null }));
}

// ---- 5. Lương/KPI: tổng hợp tạm ứng đã trả + chi hộ đã ghi sổ trong tháng, theo nhân sự ----
export async function fetchWagesSummaryForMonth(monthKey = monthKeyOf()) {
  const from = `${monthKey}-01T00:00:00`;
  const to = `${monthEndOf(monthKey)}T23:59:59.999`;

  const [periodRes, paidAdvancesRes, recordedClaimsRes] = await Promise.all([
    supabase.from('payroll_periods').select('*').eq('period_month', monthStartOf(monthKey)).maybeSingle(),
    supabase.from('salary_advance_requests').select('employee_id, employee_name, amount, paid_at')
      .eq('status', 'paid').gte('paid_at', from).lte('paid_at', to),
    supabase.from('expense_claims').select('claimant_id, claimant_name, amount, accounted_at')
      .eq('status', 'recorded').gte('accounted_at', from).lte('accounted_at', to),
  ]);
  if (paidAdvancesRes.error) throw paidAdvancesRes.error;
  if (recordedClaimsRes.error) throw recordedClaimsRes.error;

  let entries = [];
  if (periodRes?.data && !periodRes.error) {
    const entriesRes = await supabase.from('payroll_entries').select('*').eq('period_id', periodRes.data.id);
    if (entriesRes.error) throw entriesRes.error;
    entries = entriesRes.data || [];
  }

  const byEmployee = {};
  const ensure = (id, name) => {
    if (!id) return null;
    if (!byEmployee[id]) byEmployee[id] = { employeeId: id, employeeName: name || 'Không rõ', advancePaid: 0, expensesRecorded: 0, netPay: null };
    return byEmployee[id];
  };
  (paidAdvancesRes.data || []).forEach((a) => { const row = ensure(a?.employee_id, a?.employee_name); if (row) row.advancePaid += Number(a?.amount) || 0; });
  (recordedClaimsRes.data || []).forEach((c) => { const row = ensure(c?.claimant_id, c?.claimant_name); if (row) row.expensesRecorded += Number(c?.amount) || 0; });
  entries.forEach((e) => {
    const row = byEmployee[e?.employee_id];
    if (row) {
      row.netPay = (Number(e?.base_pay) || 0) + (Number(e?.overtime_pay) || 0) + (Number(e?.allowance) || 0) + (Number(e?.kpi_bonus) || 0)
        + (Number(e?.output_bonus) || 0) + (Number(e?.delegation_bonus) || 0) + (Number(e?.other_bonus) || 0)
        - (Number(e?.advance_amount) || 0) - (Number(e?.deduction_amount) || 0);
    }
  });

  return { periodStatus: periodRes?.data?.status || null, rows: Object.values(byEmployee) };
}

// ---- Kế toán tự ghi 1 khoản chi (vd: chi phát sinh ngoài quy trình nhân sự gửi lên) ----
export async function submitMyExpenseClaim({ amount, description, note, occurredAt }) {
  const { data, error } = await supabase.rpc('submit_expense_claim', {
    p_amount: amount,
    p_description: description,
    p_note: note || null,
    p_related_order_code: null,
    p_receipt_attachments: null,
    p_occurred_at: occurredAt || new Date().toISOString(),
  });
  if (error) throw error;
  return data;
}

export { monthKeyOf };
