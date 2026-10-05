// Giới hạn thời gian chờ cho 1 lời gọi mạng (yêu cầu Giám đốc 05/10/2026).
//
// supabase-js không tự đặt giới hạn: mạng chập chờn đúng lúc đang tải ảnh /
// gọi hàm là promise treo mãi, nút đứng ở "Đang xử lý..." và tài xế chỉ còn
// cách thoát ra làm lại. Quá giờ thì báo lỗi rõ để người dùng bấm lại.
//
// Lưu ý: hết giờ chỉ là THÔI CHỜ phía app — yêu cầu đã gửi đi có thể vẫn tới
// máy chủ. Chỉ dùng cho thao tác bấm lại an toàn (vd complete_delivery_assignment
// đã tự chặn chốt trùng, migration 202610051000).
export function trongThoiGian(promise, ms, thongBao) {
  let hengio;
  const hetGio = new Promise((_, reject) => {
    hengio = setTimeout(() => reject(new Error(thongBao)), ms);
  });
  return Promise.race([promise, hetGio]).finally(() => clearTimeout(hengio));
}
