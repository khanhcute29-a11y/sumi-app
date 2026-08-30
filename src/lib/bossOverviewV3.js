import { supabase } from './supabaseClient';
import { ORDER_FLOWS } from '../data/orderCatalogs';
import { createAssignedTasks, fetchApprovalRequests, resolveApprovalRequest, fetchShiftSchedule, fetchShiftConfigs } from './queries';
import { localDateStr, mondayOf, weekDates } from './date';

const STATIONS = [
  { key: 'bakery', label: 'Bakery' },
  { key: 'nong', label: 'Bếp Nóng' },
  { key: 'lanh', label: 'Bếp Lạnh' },
  { key: 'xuong41', label: 'Xưởng 41' },
  { key: 'xuong42', label: 'Xưởng 42' },
];
const DOW_LABELS = ['Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy', 'Chủ Nhật'];

const todayStr = () => new Date().toISOString().slice(0, 10);
const monthStart = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`; };

// ---- 1. Doanh thu theo 5 kênh (orders.order_type khớp ORDER_FLOWS) ----
export async function fetchRevenueByChannel({ from, to } = {}) {
  const fromIso = from || `${todayStr()}T00:00:00`;
  const toIso = to || new Date().toISOString();
  const { data, error } = await supabase
    .from('orders')
    .select('order_type, total')
    .eq('status_v2', 'completed')
    .gte('completed_at', fromIso)
    .lte('completed_at', toIso);
  if (error) throw error;
  const rows = data || [];
  const byKey = {};
  ORDER_FLOWS.forEach((f) => { byKey[f.key] = { ...f, amount: 0, count: 0 }; });
  byKey.other = { key: 'other', icon: '🧺', title: 'Khác', amount: 0, count: 0 };
  rows.forEach((o) => {
    const bucket = byKey[o.order_type] || byKey.other;
    bucket.amount += Number(o.total) || 0;
    bucket.count += 1;
  });
  const total = rows.reduce((s, o) => s + (Number(o.total) || 0), 0);
  const channels = [...ORDER_FLOWS.map((f) => byKey[f.key]), byKey.other]
    .filter((b) => b.count > 0)
    .map((b) => ({ ...b, percentage: total > 0 ? `${((b.amount / total) * 100).toFixed(1)}%` : '0%' }))
    .sort((a, b) => b.amount - a.amount);
  return { channels, total };
}

// ---- 2. Sổ cái khoản chi (expense_claims) ----
export async function fetchExpenseClaimsToday() {
  const { data, error } = await supabase
    .from('expense_claims')
    .select('*')
    .gte('created_at', `${todayStr()}T00:00:00`)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function reviewExpenseClaim(id, approve, note) {
  const { data, error } = await supabase.rpc('review_expense_claim', { p_id: id, p_approve: approve, p_note: note || null });
  if (error) throw error;
  return data;
}

// ---- 2b. Sổ cái hợp nhất: expense_claims + salary_advance_requests hôm nay ----
// Trước đây widget "Sổ Cái Khoản Chi Tiêu Hôm Nay" chỉ đọc expense_claims nên
// tạm ứng lương đã chi (salary_advance_requests) "biến mất" khỏi mắt Giám đốc
// dù đã ghi sổ đúng trong database (có cashbook_entry_id, đã trừ lương).
export async function fetchExpenseAndAdvanceLedgerToday() {
  const since = `${todayStr()}T00:00:00`;
  const [claimsRes, advancesRes] = await Promise.all([
    supabase.from('expense_claims').select('*').gte('created_at', since).order('created_at', { ascending: false }),
    supabase.from('salary_advance_requests').select('*').gte('created_at', since).order('created_at', { ascending: false }),
  ]);
  if (claimsRes.error) throw claimsRes.error;
  if (advancesRes.error) throw advancesRes.error;
  const claims = (claimsRes.data || []).map((c) => ({ ...c, source: 'expense', person_id: c.claimant_id }));
  const advances = (advancesRes.data || []).map((a) => ({
    ...a,
    source: 'advance',
    description: `Tạm ứng lương — ${a.reason || ''}`.trim(),
    claimant_name: a.employee_name,
    occurred_at: a.paid_at || a.created_at,
    person_id: a.employee_id,
    // 'paid' của tạm ứng tương đương 'recorded' của khoản chi (đã ghi sổ xong) — gộp nhãn hiển thị.
    status: a.status === 'paid' ? 'recorded' : a.status,
  }));
  const merged = [...claims, ...advances];

  // Ảnh đại diện người chi — lấy thật từ profiles (avatar_path), không dùng
  // ảnh mockup tĩnh. Chỉ query 1 lần cho toàn bộ danh sách, không N+1.
  const personIds = [...new Set(merged.map((r) => r.person_id).filter(Boolean))];
  let profileById = {};
  if (personIds.length > 0) {
    const { data: profs } = await supabase.from('profiles').select('id, full_name, avatar_path').in('id', personIds);
    (profs || []).forEach((p) => { profileById[p.id] = p; });
  }

  return merged
    .map((r) => ({ ...r, claimantProfile: profileById[r.person_id] || null }))
    .sort((x, y) => new Date(y.occurred_at || y.created_at).getTime() - new Date(x.occurred_at || x.created_at).getTime());
}

// ---- 3. Trạng thái chấm công toàn công ty hôm nay ----
export async function fetchTodayStaffStatus() {
  const today = todayStr();
  const [profilesRes, logsRes] = await Promise.all([
    supabase.from('profiles').select('id, full_name, role, station').eq('approved', true).neq('active', false),
    supabase.from('shift_logs').select('*').eq('work_date', today),
  ]);
  if (profilesRes.error) throw profilesRes.error;
  if (logsRes.error) throw logsRes.error;
  const profiles = profilesRes.data || [];
  const logs = logsRes.data || [];

  const working = [];
  const late = [];
  const off = [];

  for (const p of profiles) {
    const mine = logs.filter((l) => l.staff_id === p.id);
    const checkin = mine.find((l) => l.type === 'checkin');
    const leave = mine.find((l) => l.type === 'leave_request');
    if (leave) {
      off.push({ ...p, shiftLogId: leave.id, reason: leave.reason || 'Nghỉ ca' });
    } else if (checkin) {
      const entry = {
        ...p,
        shiftLogId: checkin.id,
        checkinTime: checkin.checkin_time
          ? new Date(checkin.checkin_time).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
          : '--:--',
        checkinDate: checkin.checkin_time
          ? new Date(checkin.checkin_time).toLocaleDateString('vi-VN')
          : (checkin.work_date ? new Date(checkin.work_date).toLocaleDateString('vi-VN') : ''),
        lateMinutes: checkin.late_minutes || 0,
        reason: checkin.reason || '',
        shiftLabel: checkin.shift_label || '',
      };
      if ((checkin.late_minutes || 0) > 0) late.push(entry); else working.push(entry);
    }
    // Không có bản ghi nào hôm nay -> chưa chấm công, không xếp vào nhóm nào cả
    // (khác với "nghỉ ca" — chỉ tính là nghỉ khi có leave_request thật).
  }

  return { total: profiles.length, working, late, off };
}

// ---- Hành động thật cho nhân sự đi trễ ----
export async function remindStaff(staffId, message) {
  const { error } = await supabase.rpc('remind_staff', { p_staff_id: staffId, p_message: message || null });
  if (error) throw error;
}

export async function waiveLatePenalty(shiftLogId) {
  const { error } = await supabase.rpc('waive_late_penalty', { p_shift_log_id: shiftLogId });
  if (error) throw error;
}

// ---- 3b. Tạm ứng lương đang chờ duyệt ----
export async function fetchPendingSalaryAdvances() {
  const { data, error } = await supabase
    .from('salary_advance_requests')
    .select('*')
    .eq('status', 'pending_director')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function reviewSalaryAdvance(id, approve, note) {
  const { error } = await supabase.rpc('review_salary_advance', { p_id: id, p_approve: approve, p_note: note || null });
  if (error) throw error;
}

// ---- 3c. Đơn xin nghỉ phép đang chờ duyệt ----
export async function fetchPendingLeaveRequests() {
  return fetchApprovalRequests({ status: 'pending', type: 'leave_request' });
}

export async function reviewLeaveRequest(id, approved, note) {
  await resolveApprovalRequest(id, { status: approved ? 'approved' : 'rejected', note });
}

// ---- 4. Giao việc nhanh cho 1 nhân viên ----
export async function fetchAssignableStaff() {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, role, station')
    .eq('approved', true)
    .neq('active', false)
    .order('full_name');
  if (error) throw error;
  return data || [];
}

export async function assignTaskToStaff({ assigneeId, title, description }) {
  await createAssignedTasks([{ assignee_id: assigneeId, title, description }]);
}

// ---- 5. Bảng tin công ty (company_feed_posts) ----
export async function fetchRecentFeedPosts(limit = 10) {
  const { data, error } = await supabase
    .from('company_feed_posts')
    .select('id, author_name, title, body, severity, created_at')
    .eq('post_type', 'announcement')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data || [];
}

export async function postCompanyAnnouncement({ authorId, authorName, body, severity = 'important' }) {
  const { error } = await supabase.from('company_feed_posts').insert({
    author_id: authorId,
    author_name: authorName,
    post_type: 'announcement',
    title: 'Chỉ đạo từ Sếp',
    body,
    severity,
    pinned: severity !== 'normal',
    safe_for_company: true,
  });
  if (error) throw error;
}

// ---- 6. Đơn hàng ưu tiên (order_operations_list, dùng chung listOrdersV2) ----
export function summarizeOrderCounts(orders) {
  return {
    total: orders.length,
    waiting: orders.filter((o) => ['awaiting_assignment', 'awaiting_acceptance'].includes(o.status_v2) && !o.is_overdue).length,
    production: orders.filter((o) => o.status_v2 === 'in_production' && !o.is_overdue).length,
    ready: orders.filter((o) => o.status_v2 === 'ready_for_fulfillment' && !o.is_overdue).length,
    delivery: orders.filter((o) => o.status_v2 === 'in_delivery' && !o.is_overdue).length,
    completed: orders.filter((o) => o.status_v2 === 'completed').length,
    overdue: orders.filter((o) => Boolean(o.is_overdue)).length,
  };
}

export function sortOrdersByPriority(orders) {
  return [...orders].sort((a, b) => {
    const aRank = a.is_overdue ? 0 : 1;
    const bRank = b.is_overdue ? 0 : 1;
    if (aRank !== bRank) return aRank - bRank;
    return new Date(a.required_at || 0) - new Date(b.required_at || 0);
  });
}

// ---- 7. Báo cáo cuối ca hôm nay (staff_shift_reports) ----
export async function fetchTodayShiftReports() {
  const [reportsRes, profilesRes] = await Promise.all([
    supabase
      .from('staff_shift_reports')
      .select('*')
      .eq('work_date', todayStr())
      .order('created_at', { ascending: false }),
    supabase.from('profiles').select('id, station'),
  ]);
  if (reportsRes.error) throw reportsRes.error;
  if (profilesRes.error) throw profilesRes.error;
  const stationById = {};
  (profilesRes.data || []).forEach((p) => { stationById[p.id] = p.station; });
  return (reportsRes.data || []).map((r) => ({ ...r, station: stationById[r.staff_id] || null }));
}

// ---- 8. Lịch phân ca tuần — toàn công ty (5 khu vực gộp lại) ----
export async function fetchWeeklyScheduleAllStations() {
  const days = weekDates(mondayOf(new Date()));
  const from = localDateStr(days[0]);
  const to = localDateStr(days[6]);

  const [configs, ...perStation] = await Promise.all([
    fetchShiftConfigs(),
    ...STATIONS.map((s) => fetchShiftSchedule({ station: s.key, from, to })),
  ]);

  const configById = {};
  configs.forEach((c) => { configById[c.id] = c; });

  const stationLabelByKey = {};
  STATIONS.forEach((s) => { stationLabelByKey[s.key] = s.label; });

  const rows = [];
  perStation.forEach((entries, i) => {
    entries.forEach((e) => {
      const cfg = configById[e.shift_config_id];
      const startHour = cfg?.start_time ? Number(String(cfg.start_time).slice(0, 2)) : null;
      const period = startHour == null ? 'Khác' : startHour < 13 ? 'Sáng' : 'Chiều';
      rows.push({
        ...e,
        stationLabel: stationLabelByKey[STATIONS[i].key],
        shiftLabel: cfg?.label || 'Ca',
        period,
      });
    });
  });

  const byDate = {};
  days.forEach((d) => {
    const dateStr = localDateStr(d);
    byDate[dateStr] = { date: dateStr, dow: DOW_LABELS[d.getDay() === 0 ? 6 : d.getDay() - 1], Sáng: [], Chiều: [], Khác: [] };
  });
  rows.forEach((r) => {
    if (byDate[r.work_date]) byDate[r.work_date][r.period].push(r);
  });

  return { from, to, days: Object.values(byDate), totalAssignments: rows.length };
}

// ---- Thả tim đơn hàng (đánh dấu đã xem) ----
export async function fetchOrderHearts(orderIds) {
  if (!orderIds || orderIds.length === 0) return {};
  const { data, error } = await supabase.from('order_hearts').select('order_id, staff_id, staff_name').in('order_id', orderIds);
  if (error) throw error;
  const byOrder = {};
  (data || []).forEach((h) => {
    if (!byOrder[h.order_id]) byOrder[h.order_id] = [];
    byOrder[h.order_id].push(h);
  });
  return byOrder;
}

export async function addOrderHeart(orderId) {
  const { data, error } = await supabase.rpc('add_order_heart', { p_order_id: orderId });
  if (error) throw error;
  return data;
}

// ---- Xóa đơn hàng — chỉ Giám đốc (owner/admin) ----
export async function deleteOrderByDirector(orderId) {
  const { error } = await supabase.rpc('delete_order_by_director', { p_order_id: orderId });
  if (error) throw error;
}

export { monthStart, todayStr };
