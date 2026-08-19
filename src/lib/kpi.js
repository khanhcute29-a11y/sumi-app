import { haversineKm } from './geo';

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

// Ghép cặp checkin/checkout theo work_date để tính giờ làm, giờ tăng ca (so với
// shift_configs.end_time nếu đã cấu hình), và giờ trễ (late_minutes trên dòng checkin).
export function computeShiftHours(shiftLogs, shiftConfigs, staffId) {
  const mine = shiftLogs.filter((l) => l.staff_id === staffId);
  const byDate = {};
  for (const log of mine) {
    if (!byDate[log.work_date]) byDate[log.work_date] = {};
    if (log.type === 'checkin') byDate[log.work_date].checkin = log;
    if (log.type === 'checkout') byDate[log.work_date].checkout = log;
  }
  let hoursWorked = 0;
  let overtimeHours = 0;
  let lateHours = 0;
  let hasUnconfiguredShift = false;
  for (const workDate of Object.keys(byDate)) {
    const { checkin, checkout } = byDate[workDate];
    if (checkin) lateHours += (checkin.late_minutes || 0) / 60;
    if (!checkin || !checkout) continue;
    const actualHours = (new Date(checkout.checkin_time) - new Date(checkin.checkin_time)) / MS_PER_HOUR;
    if (actualHours <= 0) continue;
    hoursWorked += actualHours;
    const config = shiftConfigs.find((c) => c.label === checkin.shift_label && (c.branch || null) === (checkin.branch || null));
    if (!config || !config.end_time) { hasUnconfiguredShift = true; continue; }
    const startMin = timeStrToMinutes(config.start_time);
    let endMin = timeStrToMinutes(config.end_time);
    if (endMin <= startMin) endMin += 24 * 60; // ca qua đêm
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

export function computeLeaveDayCount(approvalRequests, staffId, from, to) {
  const dates = new Set();
  for (const r of approvalRequests) {
    if (r.type !== 'leave_request' || r.status !== 'approved') continue;
    if (r.requester_id !== staffId) continue;
    if (!r.leave_date) continue;
    if (from && r.leave_date < from) continue;
    if (to && r.leave_date > to) continue;
    dates.add(r.leave_date);
  }
  return dates.size;
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
