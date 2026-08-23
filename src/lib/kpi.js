import { haversineKm } from './geo';
import { localDateStr } from './date';

export function computeShipperKpi(orders, staffFullName, shopSettings) {
  const matched = orders.filter((o) => (o.shipper_staff_name === staffFullName || o.driver_name === staffFullName) && (o.status === 'hoan_thanh' || o.status_v2 === 'completed'));
  const orderCount = matched.length;

  let totalMinutes = 0;
  const totalKm = matched.reduce((sum, o) => {
    let km = 0;
    if (o.pickup_lat != null && o.delivery_lat != null) {
      km = haversineKm(o.pickup_lat, o.pickup_lng, o.delivery_lat, o.delivery_lng);
    } else if (shopSettings?.shop_lat != null && o.delivery_lat != null) {
      km = haversineKm(shopSettings.shop_lat, shopSettings.shop_lng, o.delivery_lat, o.delivery_lng);
    } else if (o.planned_distance_km != null) {
      km = Number(o.planned_distance_km);
    }

    // Tính thời gian di chuyển
    const startIso = o.pickup_at || o.created_at;
    const endIso = o.completed_at;
    if (startIso && endIso) {
      const mins = (new Date(endIso).getTime() - new Date(startIso).getTime()) / 60000;
      if (mins > 0 && mins < 600) { // trong ngưỡng hợp lệ dưới 10 tiếng
        totalMinutes += mins;
      }
    }

    return sum + (km || 0);
  }, 0);

  const ordersWithProof = matched.filter(o => o.delivery_photo_url || o.has_proof).length;
  const avgMinutes = orderCount > 0 ? Math.round(totalMinutes / orderCount) : 0;

  return {
    orderCount,
    totalKm: Math.round(totalKm * 10) / 10,
    totalMinutes: Math.round(totalMinutes),
    avgMinutesPerOrder: avgMinutes,
    ordersWithProof
  };
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

// Tính trừ giờ nghỉ trưa cố định 11:30 - 12:30 nếu ca làm vắt qua khung giờ này
function calculateLunchDeductionHours(inDate, outDate) {
  if (!inDate || !outDate) return 0;
  const start = new Date(inDate);
  const end = new Date(outDate);
  if (end <= start) return 0;

  const lunchStart = new Date(start);
  lunchStart.setHours(11, 30, 0, 0);
  const lunchEnd = new Date(start);
  lunchEnd.setHours(12, 30, 0, 0);

  const overlapStart = Math.max(start.getTime(), lunchStart.getTime());
  const overlapEnd = Math.min(end.getTime(), lunchEnd.getTime());

  if (overlapEnd > overlapStart) {
    return (overlapEnd - overlapStart) / (1000 * 60 * 60);
  }
  return 0;
}

// Ghép cặp checkin/checkout theo thứ tự thời gian để tính giờ làm thực tế,
// tự động trừ 1 giờ nghỉ trưa cố định (11:30 - 12:30) nếu ca làm việc vắt qua khung giờ này.
export function computeShiftHours(shiftLogs, shiftConfigs, staffId, periodFrom, periodTo) {
  const mine = shiftLogs.filter((l) => l.staff_id === staffId && l.checkin_time);
  const byTime = (a, b) => new Date(a.checkin_time) - new Date(b.checkin_time);
  const checkins = mine.filter((l) => l.type === 'checkin').sort(byTime);
  const checkouts = mine.filter((l) => l.type === 'checkout').sort(byTime);
  const usedCheckout = new Set();

  let hoursWorked = 0;
  let overtimeHours = 0;
  let lateHours = 0;
  let totalLunchDeducted = 0;
  let hasUnconfiguredShift = false;

  for (const checkin of checkins) {
    const inDate = new Date(checkin.checkin_time);
    const inMs = inDate.getTime();
    const inPeriod = isCheckinInPeriod(checkin, inMs, periodFrom, periodTo);

    let matchIdx = -1;
    for (let i = 0; i < checkouts.length; i += 1) {
      if (usedCheckout.has(i)) continue;
      const outMs = new Date(checkouts[i].checkin_time).getTime();
      if (outMs <= inMs) continue;
      if (outMs - inMs > MAX_SHIFT_PAIR_HOURS * MS_PER_HOUR) break;
      matchIdx = i;
      break;
    }

    if (inPeriod) lateHours += (checkin.late_minutes || 0) / 60;

    if (matchIdx === -1) continue;
    usedCheckout.add(matchIdx);
    if (!inPeriod) continue;

    const outDate = new Date(checkouts[matchIdx].checkin_time);
    const grossHours = (outDate - inDate) / MS_PER_HOUR;
    if (grossHours <= 0) continue;

    // Trừ giờ nghỉ trưa cố định 11:30 - 12:30
    const lunchDeduction = calculateLunchDeductionHours(inDate, outDate);
    const actualNetHours = Math.max(0, grossHours - lunchDeduction);

    hoursWorked += actualNetHours;
    totalLunchDeducted += lunchDeduction;

    const config = (shiftConfigs || []).find((c) => c.label === checkin.shift_label && (c.branch || null) === (checkin.branch || null));
    if (config && config.end_time && config.end_time !== config.start_time) {
      const startMin = timeStrToMinutes(config.start_time);
      let endMin = timeStrToMinutes(config.end_time);
      if (endMin < startMin) endMin += 24 * 60;
      const expectedHours = (endMin - startMin) / 60;
      overtimeHours += Math.max(0, actualNetHours - expectedHours);
    }
  }

  return {
    hoursWorked: Math.round(hoursWorked * 10) / 10,
    overtimeHours: Math.round(overtimeHours * 10) / 10,
    lateHours: Math.round(lateHours * 10) / 10,
    lunchDeductedHours: Math.round(totalLunchDeducted * 10) / 10,
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
