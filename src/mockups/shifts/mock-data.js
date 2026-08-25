// ============================================================
// MOCKUP ONLY — Shifts & Attendance Mock Data
// Không kết nối database thật
// ============================================================

// ── Danh sách nhân viên giả lập ────────────────────────────
export const MOCK_STAFF = [
  // Giám đốc
  { id: 'u-01', name: 'Anh Minh', role: 'owner',           dept: null,         dept_label: 'Ban Giám Đốc',  avatar: 'AM', phone: '0901 000 001' },
  { id: 'u-02', name: 'Chị Hà',   role: 'admin',           dept: null,         dept_label: 'Quản Lý',       avatar: 'CH', phone: '0901 000 002' },

  // Bếp Lạnh
  { id: 'u-03', name: 'Chị Lan',   role: 'kitchen_lead_cold', dept: 'cold',   dept_label: 'Bếp Lạnh',      avatar: 'CL', phone: '0901 000 003' },
  { id: 'u-04', name: 'Em Ngọc',   role: 'baker_cold',        dept: 'cold',   dept_label: 'Bếp Lạnh',      avatar: 'EN', phone: '0901 000 004' },
  { id: 'u-05', name: 'Em Thảo',   role: 'baker_cold',        dept: 'cold',   dept_label: 'Bếp Lạnh',      avatar: 'ET', phone: '0901 000 005' },
  { id: 'u-06', name: 'Anh Khoa',  role: 'baker_cold',        dept: 'cold',   dept_label: 'Bếp Lạnh',      avatar: 'AK', phone: '0901 000 006' },

  // Bếp Nóng
  { id: 'u-07', name: 'Anh Hùng',  role: 'kitchen_lead_hot',  dept: 'hot',    dept_label: 'Bếp Nóng',      avatar: 'AH', phone: '0901 000 007' },
  { id: 'u-08', name: 'Em Tú',     role: 'baker_hot',          dept: 'hot',    dept_label: 'Bếp Nóng',      avatar: 'ET', phone: '0901 000 008' },
  { id: 'u-09', name: 'Em Linh',   role: 'baker_hot',          dept: 'hot',    dept_label: 'Bếp Nóng',      avatar: 'EL', phone: '0901 000 009' },

  // Xưởng 41 - Macaron
  { id: 'u-10', name: 'Chị Phương', role: 'kitchen_lead_macaron', dept: 'macaron', dept_label: 'Macaron X41', avatar: 'CP', phone: '0901 000 010' },
  { id: 'u-11', name: 'Em Quỳnh',   role: 'baker_macaron',        dept: 'macaron', dept_label: 'Macaron X41', avatar: 'EQ', phone: '0901 000 011' },
  { id: 'u-12', name: 'Em Diễm',    role: 'baker_macaron',        dept: 'macaron', dept_label: 'Macaron X41', avatar: 'ED', phone: '0901 000 012' },

  // Xưởng 42
  { id: 'u-13', name: 'Anh Tuấn',  role: 'kitchen_lead_x42',  dept: 'x42',    dept_label: 'Xưởng 42',      avatar: 'AT', phone: '0901 000 013' },
  { id: 'u-14', name: 'Em Bình',   role: 'baker_x42',          dept: 'x42',    dept_label: 'Xưởng 42',      avatar: 'EB', phone: '0901 000 014' },
  { id: 'u-15', name: 'Em Yến',    role: 'baker_x42',          dept: 'x42',    dept_label: 'Xưởng 42',      avatar: 'EY', phone: '0901 000 015' },

  // Shipper
  { id: 'u-16', name: 'Anh Đức',   role: 'shipper',            dept: 'ship',   dept_label: 'Vận Chuyển',    avatar: 'AD', phone: '0901 000 016' },
  { id: 'u-17', name: 'Anh Vũ',    role: 'shipper',            dept: 'ship',   dept_label: 'Vận Chuyển',    avatar: 'AV', phone: '0901 000 017' },
];

// ── Cấu hình ca ────────────────────────────────────────────
export const SHIFTS = {
  morning:   { key: 'morning',   label: 'Ca Sáng',   time: '6:00–14:00',  startTime: '06:00', endTime: '14:00', durationHours: 8, color: '#3b82f6', bg: '#eff6ff',  icon: '🌅' },
  afternoon: { key: 'afternoon', label: 'Ca Chiều',  time: '14:00–22:00', startTime: '14:00', endTime: '22:00', durationHours: 8, color: '#f97316', bg: '#fff7ed',  icon: '☀️' },
  night:     { key: 'night',     label: 'Ca Tối',    time: '21:30–5:30',  startTime: '21:30', endTime: '05:30', durationHours: 8, color: '#7c3aed', bg: '#f5f3ff',  icon: '🌙' },
};

// Chuyển HH:MM sang phút trong ngày
function parseTimeToMinutes(t) {
  if (!t) return null;
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

// Tính chênh lệch thời gian so với quy định
export function calcShiftDeviation(shiftKey, checkin, checkout) {
  const shift = SHIFTS[shiftKey];
  if (!shift) return null;

  const planStartMin = parseTimeToMinutes(shift.startTime);
  const planEndMin = parseTimeToMinutes(shift.endTime);

  let checkinDiff = null; // số phút so với giờ chuẩn vào
  let checkinLabel = 'Đúng giờ';
  let checkinType = 'on_time'; // 'early' | 'late' | 'on_time'

  if (checkin) {
    const actStartMin = parseTimeToMinutes(checkin);
    checkinDiff = actStartMin - planStartMin;
    if (checkinDiff > 0) {
      checkinLabel = `Muộn +${checkinDiff} phút`;
      checkinType = 'late';
    } else if (checkinDiff < 0) {
      checkinLabel = `Sớm ${Math.abs(checkinDiff)} phút`;
      checkinType = 'early';
    } else {
      checkinLabel = 'Đúng 06:00';
      checkinType = 'on_time';
    }
  }

  let checkoutDiff = null;
  let checkoutLabel = 'Chưa ra ca';
  let checkoutType = 'pending'; // 'early' | 'ot' | 'on_time' | 'pending'

  if (checkout) {
    const actEndMin = parseTimeToMinutes(checkout);
    // Xử lý ca qua đêm (night shift)
    const endNorm = planEndMin < planStartMin ? planEndMin + 1440 : planEndMin;
    const actEndNorm = actEndMin < planStartMin ? actEndMin + 1440 : actEndMin;
    checkoutDiff = actEndNorm - endNorm;

    if (checkoutDiff > 0) {
      checkoutLabel = `Tăng ca +${checkoutDiff} phút (OT)`;
      checkoutType = 'ot';
    } else if (checkoutDiff < 0) {
      checkoutLabel = `Về sớm ${Math.abs(checkoutDiff)} phút`;
      checkoutType = 'early';
    } else {
      checkoutLabel = 'Đúng giờ ra ca';
      checkoutType = 'on_time';
    }
  }

  return {
    planStart: shift.startTime,
    planEnd: shift.endTime,
    durationHours: shift.durationHours,
    checkinDiff,
    checkinLabel,
    checkinType,
    checkoutDiff,
    checkoutLabel,
    checkoutType,
  };
}

// ── Dữ liệu chấm công hôm nay (25/08/2026) ─────────────────
export const TODAY_ATTENDANCE = {
  'u-01': { shift: 'morning',   checkin: '05:58', checkout: null,    status: 'working',   note: '' },
  'u-02': { shift: 'morning',   checkin: '06:05', checkout: null,    status: 'working',   note: '' },
  'u-03': { shift: 'morning',   checkin: '05:55', checkout: null,    status: 'working',   note: '' },
  'u-04': { shift: 'morning',   checkin: '06:12', checkout: null,    status: 'late',      note: 'Kẹt xe' },
  'u-05': { shift: 'morning',   checkin: '05:59', checkout: null,    status: 'working',   note: '' },
  'u-06': { shift: 'afternoon', checkin: null,     checkout: null,    status: 'upcoming',  note: '' },
  'u-07': { shift: 'morning',   checkin: '06:01', checkout: null,    status: 'working',   note: '' },
  'u-08': { shift: 'morning',   checkin: null,     checkout: null,    status: 'absent',    note: 'Nghỉ không phép' },
  'u-09': { shift: 'afternoon', checkin: null,     checkout: null,    status: 'upcoming',  note: '' },
  'u-10': { shift: 'morning',   checkin: '05:50', checkout: '14:02', status: 'done',      note: '' },
  'u-11': { shift: 'morning',   checkin: '06:00', checkout: null,    status: 'working',   note: '' },
  'u-12': { shift: 'morning',   checkin: '06:08', checkout: null,    status: 'late',      note: '' },
  'u-13': { shift: 'morning',   checkin: '05:58', checkout: null,    status: 'working',   note: '' },
  'u-14': { shift: 'morning',   checkin: '06:01', checkout: null,    status: 'working',   note: '' },
  'u-15': { shift: 'night',     checkin: null,     checkout: null,    status: 'upcoming',  note: '' },
  'u-16': { shift: 'morning',   checkin: '06:03', checkout: null,    status: 'working',   note: '' },
  'u-17': { shift: 'afternoon', checkin: null,     checkout: null,    status: 'upcoming',  note: '' },
};

// ── Dữ liệu lịch sử tháng 8 (cá nhân nhân viên u-04 — Em Ngọc) ──
export const MY_MONTHLY_HISTORY = [
  { date: '2026-08-01', shift: 'morning',   checkin: '06:00', checkout: '14:05', status: 'done',    ot: 0 },
  { date: '2026-08-02', shift: 'morning',   checkin: '06:02', checkout: '14:00', status: 'done',    ot: 0 },
  { date: '2026-08-03', shift: 'morning',   checkin: '06:15', checkout: '14:10', status: 'late',    ot: 0 },
  { date: '2026-08-04', shift: null,        checkin: null,    checkout: null,    status: 'off',     ot: 0 },
  { date: '2026-08-05', shift: null,        checkin: null,    checkout: null,    status: 'off',     ot: 0 },
  { date: '2026-08-06', shift: 'afternoon', checkin: '14:00', checkout: '22:30', status: 'done',   ot: 30 },
  { date: '2026-08-07', shift: 'afternoon', checkin: '14:05', checkout: '22:00', status: 'done',    ot: 0 },
  { date: '2026-08-08', shift: 'morning',   checkin: '05:58', checkout: '14:00', status: 'done',    ot: 0 },
  { date: '2026-08-09', shift: 'morning',   checkin: '06:00', checkout: '14:00', status: 'done',    ot: 0 },
  { date: '2026-08-10', shift: 'morning',   checkin: '06:00', checkout: '16:00', status: 'done',    ot: 120 },
  { date: '2026-08-11', shift: null,        checkin: null,    checkout: null,    status: 'leave',   ot: 0 },
  { date: '2026-08-12', shift: null,        checkin: null,    checkout: null,    status: 'off',     ot: 0 },
  { date: '2026-08-13', shift: 'morning',   checkin: '06:01', checkout: '14:00', status: 'done',    ot: 0 },
  { date: '2026-08-14', shift: 'morning',   checkin: '06:00', checkout: '14:00', status: 'done',    ot: 0 },
  { date: '2026-08-15', shift: 'morning',   checkin: '06:00', checkout: '14:00', status: 'done',    ot: 0 },
  { date: '2026-08-16', shift: 'morning',   checkin: '06:10', checkout: '14:00', status: 'late',    ot: 0 },
  { date: '2026-08-17', shift: 'morning',   checkin: '05:55', checkout: '14:00', status: 'done',    ot: 0 },
  { date: '2026-08-18', shift: null,        checkin: null,    checkout: null,    status: 'off',     ot: 0 },
  { date: '2026-08-19', shift: null,        checkin: null,    checkout: null,    status: 'off',     ot: 0 },
  { date: '2026-08-20', shift: 'morning',   checkin: '06:00', checkout: '14:00', status: 'done',    ot: 0 },
  { date: '2026-08-21', shift: 'morning',   checkin: '06:00', checkout: '14:00', status: 'done',    ot: 0 },
  { date: '2026-08-22', shift: 'morning',   checkin: '06:00', checkout: '14:00', status: 'done',    ot: 0 },
  { date: '2026-08-23', shift: 'morning',   checkin: '06:00', checkout: '14:00', status: 'done',    ot: 0 },
  { date: '2026-08-24', shift: 'morning',   checkin: '06:00', checkout: '14:00', status: 'done',    ot: 0 },
  { date: '2026-08-25', shift: 'morning',   checkin: '06:12', checkout: null,    status: 'late',    ot: 0 },
];

// ── Role configs ────────────────────────────────────────────
export const ROLES = {
  owner: {
    key: 'owner', label: 'Giám Đốc', icon: '👑',
    desc: 'Thấy tất cả nhân viên toàn xưởng',
    userId: 'u-01', dept: null,
  },
  kitchen_lead_cold: {
    key: 'kitchen_lead_cold', label: 'Bếp Trưởng Bếp Lạnh', icon: '🧊',
    desc: 'Thấy bản thân + nhân viên Bếp Lạnh',
    userId: 'u-03', dept: 'cold',
  },
  kitchen_lead_hot: {
    key: 'kitchen_lead_hot', label: 'Bếp Trưởng Bếp Nóng', icon: '🔥',
    desc: 'Thấy bản thân + nhân viên Bếp Nóng',
    userId: 'u-07', dept: 'hot',
  },
  kitchen_lead_macaron: {
    key: 'kitchen_lead_macaron', label: 'Bếp Trưởng Macaron', icon: '🧁',
    desc: 'Thấy bản thân + nhân viên Macaron X41',
    userId: 'u-10', dept: 'macaron',
  },
  baker_cold: {
    key: 'baker_cold', label: 'Nhân Viên Bếp Lạnh', icon: '👤',
    desc: 'Chỉ thấy chấm công của bản thân',
    userId: 'u-04', dept: 'cold',
  },
};

// ── Helpers ─────────────────────────────────────────────────
export const STATUS_CONFIG = {
  working:  { label: 'Đang làm',    color: '#16a34a', bg: '#f0fdf4', border: '#86efac', dot: '#16a34a', icon: '🟢' },
  done:     { label: 'Hoàn thành',  color: '#3b82f6', bg: '#eff6ff', border: '#93c5fd', dot: '#3b82f6', icon: '✅' },
  late:     { label: 'Đi muộn',     color: '#f59e0b', bg: '#fffbeb', border: '#fcd34d', dot: '#f59e0b', icon: '⏰' },
  absent:   { label: 'Vắng',        color: '#dc2626', bg: '#fef2f2', border: '#fca5a5', dot: '#dc2626', icon: '❌' },
  upcoming: { label: 'Chưa đến ca', color: '#6b7280', bg: '#f9fafb', border: '#e5e7eb', dot: '#d1d5db', icon: '⏳' },
  leave:    { label: 'Nghỉ phép',   color: '#7c3aed', bg: '#f5f3ff', border: '#c4b5fd', dot: '#7c3aed', icon: '🏖' },
  off:      { label: 'Ngày nghỉ',   color: '#9ca3af', bg: '#f9fafb', border: '#e5e7eb', dot: '#e5e7eb', icon: '—'  },
};

export const MONTH_DOT_COLOR = {
  done: '#16a34a', late: '#f59e0b', absent: '#dc2626',
  leave: '#7c3aed', off: '#e5d9c9', working: '#16a34a', upcoming: '#d1d5db',
};

// Lấy nhân viên hiển thị theo role
export function getVisibleStaff(roleKey) {
  const role = ROLES[roleKey];
  if (!role) return [];
  if (role.key === 'owner') return MOCK_STAFF; // thấy tất cả
  if (!role.dept) return MOCK_STAFF.filter(s => s.id === role.userId);
  // quản lý khâu: bản thân + nhân viên cùng dept
  return MOCK_STAFF.filter(s => s.id === role.userId || s.dept === role.dept);
}

export function isManager(roleKey) {
  return roleKey === 'owner' || roleKey.startsWith('kitchen_lead');
}

export function fmtDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('vi-VN', { weekday: 'short', day: '2-digit', month: '2-digit' });
}

export function calcMonthlySummary(history) {
  const worked  = history.filter(d => ['done','late','working'].includes(d.status)).length;
  const late    = history.filter(d => d.status === 'late').length;
  const absent  = history.filter(d => d.status === 'absent').length;
  const leave   = history.filter(d => d.status === 'leave').length;
  const otMins  = history.reduce((s, d) => s + (d.ot || 0), 0);
  const totalH  = worked * 8;
  return { worked, late, absent, leave, otMins, totalH };
}
