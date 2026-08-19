import { haversineKm } from './geo';
import { localDateStr } from './date';

export function computeShipperKpi(orders, staffFullName) {
  const matched = orders.filter((o) => o.shipper_staff_name === staffFullName && o.status === 'hoan_thanh');
  const orderCount = matched.length;
  const totalKm = matched.reduce((sum, o) => {
    const km = haversineKm(o.pickup_lat, o.pickup_lng, o.delivery_lat, o.delivery_lng);
    return sum + (km || 0);
  }, 0);
  return { orderCount, totalKm: Math.round(totalKm * 10) / 10 };
}

export function computeKitchenKpi(orders, productionLogs, staffFullName) {
  const matched = orders.filter((o) => o.kitchen_staff_name === staffFullName && o.status !== 'huy');
  const orderCount = matched.length;
  const productsFromOrders = matched.reduce((sum, o) => {
    const items = o.order_items || [];
    return sum + items.reduce((s, it) => s + (Number(it.qty) || 0), 0);
  }, 0);
  const productsProduced = productionLogs
    .filter((p) => p.staff_name === staffFullName)
    .reduce((sum, p) => sum + (Number(p.qty) || 0), 0);
  return { orderCount, productsFromOrders, productsProduced };
}

const MS_PER_HOUR = 3600000;

function timeStrToMinutes(t) {
  if (!t) return null;
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

// Cửa sổ tối đa giữa checkin và checkout để coi là cùng một ca — đủ dài cho ca
// qua đêm, đủ ngắn để không ghép nhầm với ca của ngày khác.
const MAX_SHIFT_PAIR_HOURS = 18;

// Ca chỉ thuộc về kỳ đang xem nếu *bắt đầu* trong kỳ — ca bắt đầu hôm trước và
// kết thúc trong kỳ không được tính vào kỳ này.
function isCheckinInPeriod(checkin, inMs, periodFrom, periodTo) {
  if (!periodFrom && !periodTo) return true;
  const d = checkin.work_date || localDateStr(new Date(inMs));
  if (periodFrom && d < periodFrom) return false;
  if (periodTo && d > periodTo) return false;
  return true;
}

// Ghép cặp checkin/checkout theo thứ tự thời gian (không gom theo work_date, vì
// checkout của ca qua đêm được ghi sang ngày hôm sau và một ngày có thể có nhiều ca)
// để tính giờ làm, giờ tăng ca (so với shift_configs.end_time nếu đã cấu hình),
// và giờ trễ (late_minutes trên dòng checkin).
// periodFrom/periodTo (tuỳ chọn): chỉ tính những ca có checkin nằm trong khoảng này.
export function computeShiftHours(shiftLogs, shiftConfigs, staffId, periodFrom, periodTo) {
  const mine = shiftLogs.filter((l) => l.staff_id === staffId && l.checkin_time);
  const byTime = (a, b) => new Date(a.checkin_time) - new Date(b.checkin_time);
  const checkins = mine.filter((l) => l.type === 'checkin').sort(byTime);
  const checkouts = mine.filter((l) => l.type === 'checkout').sort(byTime);
  const usedCheckout = new Set();

  let hoursWorked = 0;
  let overtimeHours = 0;
  let lateHours = 0;
  let hasUnconfiguredShift = false;

  for (const checkin of checkins) {
    const inMs = new Date(checkin.checkin_time).getTime();
    // Ca nằm ngoài kỳ đang xem: vẫn ghép cặp (để "tiêu thụ" checkout của nó,
    // tránh checkout đó bị gán nhầm cho ca sau) nhưng không cộng vào tổng.
    const inPeriod = isCheckinInPeriod(checkin, inMs, periodFrom, periodTo);

    let matchIdx = -1;
    for (let i = 0; i < checkouts.length; i += 1) {
      if (usedCheckout.has(i)) continue;
      const outMs = new Date(checkouts[i].checkin_time).getTime();
      if (outMs <= inMs) continue;
      if (outMs - inMs > MAX_SHIFT_PAIR_HOURS * MS_PER_HOUR) break; // đã sắp xếp tăng dần
      matchIdx = i;
      break;
    }

    // Giờ trễ tính theo dòng checkin, độc lập với việc có checkout hay không.
    if (inPeriod) lateHours += (checkin.late_minutes || 0) / 60;

    if (matchIdx === -1) continue; // chưa checkout (hoặc quá cửa sổ) → 0 giờ cho ca này
    usedCheckout.add(matchIdx);
    if (!inPeriod) continue;

    const actualHours = (new Date(checkouts[matchIdx].checkin_time) - new Date(checkin.checkin_time)) / MS_PER_HOUR;
    if (actualHours <= 0) continue;
    hoursWorked += actualHours;
    const config = shiftConfigs.find((c) => c.label === checkin.shift_label && (c.branch || null) === (checkin.branch || null));
    if (!config || !config.end_time || config.end_time === config.start_time) { hasUnconfiguredShift = true; continue; }
    const startMin = timeStrToMinutes(config.start_time);
    let endMin = timeStrToMinutes(config.end_time);
    if (endMin < startMin) endMin += 24 * 60; // ca qua đêm
    const expectedHours = (endMin - startMin) / 60;
    overtimeHours += Math.max(0, actualHours - expectedHours);
  }
  return {
    hoursWorked: Math.round(hoursWorked * 10) / 10,
    overtimeHours: Math.round(overtimeHours * 10) / 10,
    lateHours: Math.round(lateHours * 10) / 10,
    hasUnconfiguredShift,
  };
}

export function computeAssignedTaskCount(tasks, staffId) {
  return tasks.filter((t) => t.category === 'assigned' && t.assignee_id === staffId).length;
}

// Ngày nghỉ đến từ hai đường: đơn xin nghỉ đã duyệt (approval_requests) và nghỉ
// đột xuất trong ngày (ghi thẳng vào shift_logs, không tạo approval_requests).
export function computeLeaveDayCount(approvalRequests, shiftLogs, staffId, from, to) {
  const dates = new Set();
  for (const r of approvalRequests) {
    if (r.type !== 'leave_request' || r.status !== 'approved') continue;
    if (r.requester_id !== staffId) continue;
    if (!r.leave_date) continue;
    dates.add(r.leave_date);
  }
  for (const l of shiftLogs || []) {
    if (l.type !== 'leave_request' || l.staff_id !== staffId) continue;
    if (!l.work_date) continue;
    dates.add(l.work_date);
  }
  let count = 0;
  for (const d of dates) {
    if (from && d < from) continue;
    if (to && d > to) continue;
    count += 1;
  }
  return count;
}

// Tổng thời gian trùng giờ [started_at, ended_at] giữa các công đoạn cùng đơn
// nhưng khác người phụ trách — phản ánh thời gian "làm cùng nhau" trong bếp.
export function computeCoworkingHours(orderStages, staffId) {
  const byOrder = {};
  for (const s of orderStages) {
    if (!s.started_at || !s.ended_at) continue;
    if (!byOrder[s.order_id]) byOrder[s.order_id] = [];
    byOrder[s.order_id].push(s);
  }
  let overlapMs = 0;
  for (const orderId of Object.keys(byOrder)) {
    const stages = byOrder[orderId];
    const mine = stages.filter((s) => s.assignee_id === staffId);
    const others = stages.filter((s) => s.assignee_id && s.assignee_id !== staffId);
    for (const m of mine) {
      const mStart = new Date(m.started_at).getTime();
      const mEnd = new Date(m.ended_at).getTime();
      for (const o of others) {
        const oStart = new Date(o.started_at).getTime();
        const oEnd = new Date(o.ended_at).getTime();
        const overlap = Math.min(mEnd, oEnd) - Math.max(mStart, oStart);
        if (overlap > 0) overlapMs += overlap;
      }
    }
  }
  return Math.round((overlapMs / MS_PER_HOUR) * 10) / 10;
}
