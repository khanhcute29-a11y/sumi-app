import React, { lazy, useState } from 'react';

// Nạp màn hình theo nhu cầu (yêu cầu Giám đốc 29/09/2026: app mở chậm vì
// App.jsx import thẳng ~30 màn hình -> 1 file JS 1,8MB phải tải + chạy hết
// trước khi hiện được màn "Hôm nay").
//
// Khác React.lazy thường ở 2 điểm, để KHÔNG đổi hành vi của các chỗ đang mở
// màn hình bằng hẹn giờ ngắn (MobileHomeScreen hẹn 0ms, ShiftTodayCard 60ms,
// App.jsx 80/250/500ms rồi mới bắn 'sumi-open-order'...):
//  1. Màn nào đã nạp xong (tai() — App.jsx gọi ngầm cho tất cả ngay sau khi
//     mở app) thì render THẲNG component thật, đồng bộ y như import tĩnh
//     trước đây, không qua Suspense.
//  2. Mỗi lần hiện màn hình chốt 1 cách render từ lúc mount (useState), để
//     màn đang mở qua Suspense không bị đổi kiểu component giữa chừng -> không
//     bị mount lại (mất trạng thái, tải lại dữ liệu).
//
// Sau mỗi lần cập nhật app, file JS cũ bị xoá khỏi Vercel và đường dẫn cũ trả
// về index.html (vercel.json rewrite /:path* -> 200 text/html), nên máy đang
// chạy bản cũ nạp màn hình mới sẽ lỗi. Khi đó tải lại trang 1 lần để lấy bản
// mới; khoá bằng sessionStorage để không lặp vô hạn nếu lỗi vì lý do khác.
const KHOA_TAI_LAI = 'sumi-tai-lai-vi-loi-nap-man-hinh';

export function napManHinh(loader) {
  let Thuc = null;
  let dangNap = null;
  const tai = () => {
    if (!dangNap) {
      dangNap = loader().then(
        (m) => {
          Thuc = m.default;
          try { sessionStorage.removeItem(KHOA_TAI_LAI); } catch { /* bỏ qua */ }
          return m;
        },
        (err) => {
          dangNap = null;
          let daTaiLai = false;
          try { daTaiLai = !!sessionStorage.getItem(KHOA_TAI_LAI); } catch { /* bỏ qua */ }
          if (!daTaiLai) {
            try { sessionStorage.setItem(KHOA_TAI_LAI, '1'); } catch { /* bỏ qua */ }
            window.location.reload();
            return new Promise(() => {}); // đang tải lại trang, không làm gì thêm
          }
          throw err;
        },
      );
    }
    return dangNap;
  };
  const Lazy = lazy(tai);
  function ManHinh(props) {
    const [DaNap] = useState(() => Thuc);
    return DaNap ? <DaNap {...props} /> : <Lazy {...props} />;
  }
  ManHinh.tai = tai;
  ManHinh.daNap = () => Thuc !== null;
  return ManHinh;
}
