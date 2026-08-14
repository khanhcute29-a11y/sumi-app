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
