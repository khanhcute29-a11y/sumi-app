// ============================================================
// Truy vấn dữ liệu THẬT cho Employee Overview V4 — cô lập trong
// 1 file riêng (không đụng queries.js dùng chung) để tránh xung
// đột với đồng nghiệp. Mọi hàm ở đây chỉ trả về dữ liệu của
// CHÍNH nhân viên đang đăng nhập (self-only), không lộ dữ liệu
// của người khác.
// ============================================================
import { supabase } from './supabaseClient';
import { fetchShiftLogsRange, fetchShiftConfigs, fetchShiftSchedule } from './queries';
import { computeShiftHours } from './kpi';

const pad2 = (n) => String(n).padStart(2, '0');
const toDateStr = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

function monthRange(base = new Date()) {
  const from = new Date(base.getFullYear(), base.getMonth(), 1);
  const to = base;
  return { from: toDateStr(from), to: toDateStr(to) };
}

function weekRange(base = new Date()) {
  const day = base.getDay(); // 0=CN
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(base);
  monday.setDate(base.getDate() + diffToMonday);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return { from: toDateStr(monday), to: toDateStr(sunday) };
}

// ---- Hồ sơ & phân cấp quản lý ----
export async function fetchManagerName(managerId) {
  if (!managerId) return null;
  const { data, error } = await supabase.from('profiles').select('full_name').eq('id', managerId).maybeSingle();
  if (error) return null;
  return data?.full_name || null;
}

// ---- KPI: giờ làm tháng này ----
export async function fetchMyHoursThisMonth(profileId) {
  const { from, to } = monthRange();
  const [logs, configs] = await Promise.all([fetchShiftLogsRange(from, to), fetchShiftConfigs()]);
  const result = computeShiftHours(logs, configs, profileId, from, to);
  return Math.round((result.hoursWorked || 0) * 10) / 10;
}

// ---- KPI: doanh thu cá nhân tháng này (đơn do chính mình tạo) ----
export async function fetchMyRevenueThisMonth(profileId) {
  const { from, to } = monthRange();
  const { data, error } = await supabase
    .from('orders')
    .select('id, order_financials(total_amount)')
    .eq('created_by', profileId)
    .gte('created_at', `${from}T00:00:00+07:00`)
    .lte('created_at', `${to}T23:59:59.999+07:00`);
  if (error) throw error;
  const orderCount = data?.length || 0;
  const total = (data || []).reduce((s, o) => s + Number(o.order_financials?.[0]?.total_amount || o.order_financials?.total_amount || 0), 0);
  return { total, orderCount };
}

// ---- Lịch sử chấm công (14 ngày gần nhất) ----
export async function fetchMyAttendanceHistory(profileId, days = 14) {
  const to = new Date();
  const from = new Date();
  from.setDate(to.getDate() - days);
  const logs = await fetchShiftLogsRange(toDateStr(from), toDateStr(to));
  const mine = logs.filter((l) => l.staff_id === profileId);
  const byDate = new Map();
  for (const l of mine) {
    const row = byDate.get(l.work_date) || { date: l.work_date, checkin: null, checkout: null, lateMinutes: 0 };
    if (l.type === 'checkin') { row.checkin = l.checkin_time; row.lateMinutes = l.late_minutes || 0; }
    if (l.type === 'checkout') row.checkout = l.checkin_time;
    byDate.set(l.work_date, row);
  }
  return Array.from(byDate.values()).sort((a, b) => (a.date < b.date ? 1 : -1));
}

// ---- Lịch phân ca tuần này ----
export async function fetchMySchedule(profileId, station) {
  if (!station) return [];
  const { from, to } = weekRange();
  const [rows, configs] = await Promise.all([fetchShiftSchedule({ station, from, to }), fetchShiftConfigs()]);
  const configById = Object.fromEntries(configs.map((c) => [c.id, c]));
  return rows
    .filter((r) => r.staff_id === profileId)
    .map((r) => ({ date: r.work_date, config: configById[r.shift_config_id] || null }));
}

// ---- Bảng lương tháng hiện tại ----
export async function fetchMyPayroll(profileId) {
  const now = new Date();
  const periodMonth = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-01`;
  const { data: period, error: periodErr } = await supabase.from('payroll_periods').select('*').eq('period_month', periodMonth).maybeSingle();
  if (periodErr) throw periodErr;
  if (!period) return null;
  const { data: entry, error: entryErr } = await supabase
    .from('payroll_entries').select('*').eq('period_id', period.id).eq('employee_id', profileId).maybeSingle();
  if (entryErr) throw entryErr;
  return entry;
}

// ---- Tạm ứng lương ----
export async function fetchMyAdvanceRequests(profileId, limit = 10) {
  const { data, error } = await supabase
    .from('salary_advance_requests').select('*').eq('employee_id', profileId)
    .order('created_at', { ascending: false }).limit(limit);
  if (error) throw error;
  return data || [];
}

export async function submitMyAdvanceRequest({ amount, reason, neededOn }) {
  const { data, error } = await supabase.rpc('submit_salary_advance', {
    p_amount: amount, p_reason: reason, p_needed_on: neededOn, p_payment_method: 'cash',
  });
  if (error) throw error;
  return data;
}

// ---- Xin nghỉ phép ----
export async function fetchMyLeaveRequests(profileId, limit = 10) {
  const { data, error } = await supabase
    .from('approval_requests').select('*').eq('requester_id', profileId).eq('type', 'leave_request')
    .order('created_at', { ascending: false }).limit(limit);
  if (error) throw error;
  return data || [];
}

export async function submitMyLeaveRequest({ profile, leaveDate, reason }) {
  const { error } = await supabase.from('approval_requests').insert({
    type: 'leave_request', requester_id: profile.id, requester_name: profile.full_name,
    requester_role: profile.role, reason, leave_date: leaveDate,
  });
  if (error) throw error;
}

// ---- Báo cáo cuối ca ----
export async function submitMyShiftReport({ profile, revenue, stockRemaining, cashHandover, note }) {
  const { error } = await supabase.from('staff_shift_reports').insert({
    staff_id: profile.id, staff_name: profile.full_name,
    revenue: Number(revenue) || 0, stock_remaining: stockRemaining === '' ? null : Number(stockRemaining),
    cash_handover: Number(cashHandover) || 0, note: note || null,
  });
  if (error) throw error;
}

// ---- Vi phạm ----
export async function fetchMyViolations(profileId, limit = 20) {
  const { data, error } = await supabase
    .from('staff_violations').select('*').eq('staff_id', profileId)
    .order('occurred_on', { ascending: false }).limit(limit);
  if (error) throw error;
  return data || [];
}

// ---- Thưởng nóng ----
export async function fetchMyRewards(profileId, limit = 20) {
  const { data, error } = await supabase
    .from('staff_rewards').select('*').eq('staff_id', profileId)
    .order('awarded_on', { ascending: false }).limit(limit);
  if (error) throw error;
  return data || [];
}
export async function fetchMyRewardsTotalThisMonth(profileId) {
  const { from, to } = monthRange();
  const { data, error } = await supabase
    .from('staff_rewards').select('amount').eq('staff_id', profileId)
    .gte('awarded_on', from).lte('awarded_on', to);
  if (error) throw error;
  return (data || []).reduce((s, r) => s + Number(r.amount || 0), 0);
}

// ---- Bảng tin công ty (dùng bảng thật company_feed_posts, chỉ đọc, không
// composer/comment/react — nằm ngoài phạm vi trang tổng quan này) ----
export async function fetchCompanyFeed(limit = 5) {
  const { data, error } = await supabase
    .from('company_feed_posts').select('id, title, body, post_type, severity, pinned, created_at')
    .is('deleted_at', null).order('pinned', { ascending: false }).order('created_at', { ascending: false }).limit(limit);
  if (error) throw error;
  return data || [];
}

// ---- Đơn hàng liên quan tới nhân viên (khớp theo tên người tạo — cùng cách
// KPI báo cáo bếp/shipper trong lib/kpi.js đang khớp, vì view order_operations_list
// chỉ lưu created_by_name chứ không có created_by uuid) ----
const STATUS_LABELS = {
  awaiting_assignment: 'Đơn chờ làm',
  in_production: 'Bếp đang làm',
  ready_for_fulfillment: 'Chờ vận chuyển',
  in_delivery: 'Đang vận chuyển',
  completed: 'Giao thành công',
};

export async function fetchMyOrders(fullName, { days = 30 } = {}) {
  const from = new Date();
  from.setDate(from.getDate() - days);
  const { data, error } = await supabase
    .from('order_operations_list')
    .select('id, order_code, status_v2, created_by_name, created_at, is_overdue, total_quantity')
    .gte('created_at', from.toISOString())
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || [])
    .filter((o) => o.created_by_name === fullName)
    .map((o) => ({
      code: o.order_code,
      status: o.status_v2,
      statusLabel: STATUS_LABELS[o.status_v2] || o.status_v2,
      isOverdue: !!o.is_overdue,
      quantity: o.total_quantity,
    }));
}

// ── Chấm công HÔM NAY — trạng thái trực tiếp cho widget trang chủ ───────────
// Khác với `fetchMyAttendanceHistory` (14 ngày, chỉ để xem lại): hàm này lấy
// đúng nhật ký của ngày hôm nay + bảng quy định ca đang bật, để widget trang
// chủ biết ngay "chưa chấm / đang trong ca / đã xong" mà không cần đợi mở
// riêng màn hình Chấm Công.
//
// ⚠️ Ngày "hôm nay" tính theo GIỜ VIỆT NAM (UTC+7), không phải giờ máy hay
// giờ UTC — nhân viên chấm ca 05:30 sáng mà lấy theo UTC sẽ bị lùi một ngày
// (05:30 giờ VN = 22:30 UTC hôm TRƯỚC). Dùng đúng cách `ShiftTodayCard.jsx`
// đã làm, không tự chế cách tính ngày khác.
function todayVN() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());
}

export async function fetchMyTodayAttendance(staffId) {
  if (!staffId) return { logs: [], caRows: [] };
  const homNay = todayVN();
  const [logsRes, caRes] = await Promise.all([
    supabase.from('shift_logs')
      .select('id,staff_id,type,checkin_time,late_minutes,expected_start,shift_label')
      .eq('staff_id', staffId).eq('work_date', homNay)
      .order('checkin_time', { ascending: true }),
    supabase.from('sumi_quy_dinh_ca').select('*').eq('active', true),
  ]);
  if (logsRes.error) throw logsRes.error;
  if (caRes.error) throw caRes.error;
  return { logs: logsRes.data || [], caRows: caRes.data || [] };
}
