// MỘT NGUỒN SỰ THẬT cho màu + icon của mọi trạng thái duyệt / tiến độ.
//
// Vì sao gom lại: phần lớn nhân sự trong tiệm đọc chữ rất chậm, có người
// không đọc được. Họ nhận diện kết quả bằng MÀU và HÌNH, nên một chỗ dùng
// ⛔, chỗ khác dùng ❌, chỗ khác nữa dùng chữ đỏ không có hình là họ phải
// đoán. Quy tắc chốt (yêu cầu 04/09/2026):
//
//   • ĐÃ DUYỆT / TỐT / XONG  → XANH LÁ + dấu tick ✅
//   • TỪ CHỐI / LỖI / TRỄ    → ĐỎ      + dấu X    ❌
//   • ĐANG CHỜ               → VÀNG    + đồng hồ  🕐
//
// Ai thêm trạng thái mới thì thêm vào đây, ĐỪNG tự đặt màu tại chỗ.
export const TRANG_THAI_DUYET = {
  approved: { chu: 'ĐÃ DUYỆT',   ngan: 'Đã duyệt',  icon: '✅', mau: '#0b9462', nen: '#e7f7ef', vien: '#0b9462' },
  rejected: { chu: 'KHÔNG DUYỆT', ngan: 'Từ chối',  icon: '❌', mau: '#c02a1d', nen: '#fff0ed', vien: '#d84c3f' },
  pending:  { chu: 'CHỜ DUYỆT',  ngan: 'Đang chờ',  icon: '🕐', mau: '#8a5a00', nen: '#fff2ce', vien: '#e3a008' },
};

/** Luôn trả về một bộ màu hợp lệ — trạng thái lạ thì coi như đang chờ. */
export function kieuTrangThai(ma) {
  return TRANG_THAI_DUYET[ma] || TRANG_THAI_DUYET.pending;
}

/** Việc/tiến độ đúng hạn hay không → cùng bảng màu xanh/đỏ ở trên. */
export function kieuTotXau(tot) {
  return tot ? TRANG_THAI_DUYET.approved : TRANG_THAI_DUYET.rejected;
}
