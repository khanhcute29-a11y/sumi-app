// Trả về ngày dạng YYYY-MM-DD theo giờ ĐỊA PHƯƠNG của trình duyệt, không phải UTC.
// Không dùng d.toISOString().slice(0,10) — cách đó lấy ngày theo giờ UTC, ở VN (UTC+7)
// khung 00:00-06:59 sáng sẽ bị lùi về ngày hôm trước.
export function localDateStr(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Format ngày giao (YYYY-MM-DD) + giờ giao (HH:mm) thành "dd/mm/yyyy · HH:mm" theo giờ VN —
// dùng chung cho OrdersScreen/KdsScreen/ShippingScreen/KanbanCard thay vì lặp lại
// new Date(...).toLocaleDateString(...) ở từng nơi.
export function formatDeliveryDateTime(deliveryDate, deliveryTime) {
  const datePart = deliveryDate
    ? new Date(`${deliveryDate}T00:00:00+07:00`).toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })
    : '';
  return [datePart, deliveryTime].filter(Boolean).join(' · ');
}

// Thứ Hai của tuần chứa `date` (getDay(): 0=CN...6=T7, nên Chủ Nhật lùi 6 ngày,
// các ngày khác lùi về đúng thứ Hai của tuần đó).
export function mondayOf(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

// Mảng 7 ngày (Date objects) từ thứ Hai truyền vào đến Chủ Nhật.
export function weekDates(monday) {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(d.getDate() + i);
    return d;
  });
}

export function startOfMonth(date) {
  const d = new Date(date);
  d.setDate(1);
  return d;
}

export function endOfMonth(date) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + 1, 0);
  return d;
}

// Khoảng {from, to} (chuỗi YYYY-MM-DD) cho 1 đơn vị kỳ (ngày/tuần/tháng) neo tại `anchor`.
// Dùng chung cho các màn có bộ lọc Ngày/Tuần/Tháng (KPI, Ghi Sản Xuất).
export function periodRangeFor(unit, anchor) {
  if (unit === 'day') {
    const s = localDateStr(anchor);
    return { from: s, to: s };
  }
  if (unit === 'week') {
    const days = weekDates(mondayOf(anchor));
    return { from: localDateStr(days[0]), to: localDateStr(days[6]) };
  }
  return { from: localDateStr(startOfMonth(anchor)), to: localDateStr(endOfMonth(anchor)) };
}

export function periodLabelFor(unit, anchor) {
  if (unit === 'day') return anchor.toLocaleDateString('vi-VN');
  if (unit === 'week') {
    const days = weekDates(mondayOf(anchor));
    return `${days[0].toLocaleDateString('vi-VN')} - ${days[6].toLocaleDateString('vi-VN')}`;
  }
  return `Tháng ${anchor.getMonth() + 1}/${anchor.getFullYear()}`;
}

export function shiftAnchor(unit, anchor, dir) {
  const d = new Date(anchor);
  if (unit === 'day') { d.setDate(d.getDate() + dir); return d; }
  if (unit === 'week') { d.setDate(d.getDate() + dir * 7); return d; }
  d.setDate(1);
  d.setMonth(d.getMonth() + dir);
  return d;
}
