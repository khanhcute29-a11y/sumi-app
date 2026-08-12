// Trả về ngày dạng YYYY-MM-DD theo giờ ĐỊA PHƯƠNG của trình duyệt, không phải UTC.
// Không dùng d.toISOString().slice(0,10) — cách đó lấy ngày theo giờ UTC, ở VN (UTC+7)
// khung 00:00-06:59 sáng sẽ bị lùi về ngày hôm trước.
export function localDateStr(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
