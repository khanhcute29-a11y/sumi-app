# SUMI APP — Bàn giao trạng thái dự án

**Cập nhật:** 23/08/2026 (Asia/Bangkok)  
**Production:** https://sumibakery.shop  
**Repository:** https://github.com/khanhcute29-a11y/sumi-app  
**Nhánh triển khai:** `main`  
**Commit mới nhất:** `4f00620` — tách màn Tổng quan đơn và danh sách trạng thái  
**Supabase project:** `rcmrfwjasrjfopbgdsbm`  
**Vercel project:** `sumi-app-zyjk` (`prj_oQjRrZX40b73Vqu6OC98nOt9bMHv`)  

## 1. Mục tiêu sản phẩm

Webapp vận hành mobile-first cho SUMI Bakery. Nhân sự chủ yếu dùng điện thoại, có người lớn tuổi hoặc đọc chữ hạn chế nên giao diện dùng nút lớn, biểu tượng rõ, ảnh và giọng nói. Hệ thống theo dõi xuyên suốt đơn hàng, bếp, kho, vận tải, công việc, KPI, chấm công, chi phí, bảng tin và hướng dẫn bằng hình ảnh.

Không được đưa giá đơn Trường học vào luồng vận hành. Dữ liệu Trường học chỉ Giám đốc Kinh doanh và Bếp trưởng Xưởng 42 được xem.

## 2. Luồng đơn chính

Trạng thái chuẩn:

1. Chờ nhận đơn (`awaiting_assignment`, `awaiting_acceptance`)
2. Bếp đang làm (`in_production`)
3. Hoàn thành chờ vận chuyển (`ready_for_fulfillment`)
4. Đang vận chuyển (`in_delivery`)
5. Giao thành công (`completed`)
6. Hủy/chưa thực hiện (`cancelled` hoặc quá giờ)

Một đơn có thể gồm nhiều nhóm sản phẩm và nhiều bếp cùng làm. Chỉ hoàn thành đơn khi đủ các phần; Giám đốc có quyền quyết định giao trước một phần.

Trang Đơn hàng hiện có 6 ô Tổng quan. Bấm một ô sẽ chuyển sang danh sách riêng; nút `← Tổng quan` quay lại. Thẻ đơn hiển thị loại đơn, khách, địa chỉ, giờ tạo, giờ bếp nhận/xong, giờ bắt đầu giao/giao xong.

## 3. Tạo đơn và danh mục sản phẩm

Nhóm chính:

- Bánh kem & bánh lạnh
- Bánh mặn/ngọt & bánh khác
- Teabreak
- Macaron
- Trường học
- Đơn nhiều loại (`mixed`)

Dropdown tên bánh được lọc theo nhóm đang nhập nhưng luôn cho phép nhập tên mới. Quản lý bổ sung danh mục sau.

Bánh Trung Thu viết tắt `BTT`, có các trường: tên/nhân, gram, 0–2 trứng, số lượng, đơn giá tùy nhập, ghi chú linh hoạt.

Mọi sản phẩm ngoài Trường học có `Đơn giá (có thể để trống)`. Trường học không có và không hiển thị giá.

File chính: `src/components/CreateOrderV2Modal.jsx`, danh mục tĩnh: `src/data/orderCatalogs.js`, trường học: `src/data/schoolCatalog.js`.

## 4. Chấm công

Đã hỗ trợ chấm riêng 3 ca Sáng/Chiều/Tối, mỗi ca có bắt đầu và kết thúc. Ca tối mặc định 21:30–05:30 tại Quốc lộ 13 và Vĩnh Phú 42; quản lý có thể sửa cấu hình. Ca qua đêm được quy về ngày bắt đầu ca.

File chính: `src/screens/ShiftsScreen.jsx`.

## 5. Cảnh báo vận hành

RPC `enqueue_order_operational_alerts()` tạo cảnh báo lặp theo chu kỳ 5 phút khi app đang mở:

- Đơn tạo quá 30 phút chưa có bếp nhận.
- Bếp hoàn thành quá 30 phút chưa bắt đầu giao.
- Còn tối đa 45 phút tới giờ khách hẹn nhưng bước liên quan chưa xác nhận.

Cảnh báo dừng khi trạng thái chuyển bước. Migration: `202608230031_order_overview_alerts_three_shifts.sql`.

## 6. Migration production gần nhất

- M21: attendance/overtime/payroll/avatar
- M22: comment đơn hàng
- M23: chi phí và ứng lương
- M24: bảng tin công ty
- M25: hướng dẫn bằng hình ảnh
- M26: đơn nhiều nhóm sản phẩm
- M27: todo lặp
- M28: xin nghỉ theo ngày + giờ
- M29: thời gian vận hành đơn và giao ngoài/Grab
- M30: ảnh hướng dẫn theo vai trò
- M31: tổng quan đơn, cảnh báo, chấm nhiều ca
- M32: cấu hình ca tối

M31 và M32 đã chạy thành công trên Supabase production.

## 7. Các vai trò và nguyên tắc quyền

- Giám đốc/owner: tổng quan toàn hệ thống, giao/điều phối, duyệt, tài chính nhạy cảm.
- Bếp trưởng: nhận phần đơn của bếp, giao việc, duyệt hoàn thành mẻ.
- Nhân viên bếp: thực hiện phần việc và báo hoàn thành.
- Kho: nhập/xuất/tồn theo kho; Xưởng 42 là kho NVL chính; Xưởng 41 Macaron; Bakery gồm bếp nóng/lạnh và cửa hàng.
- Vận tải: nhận đơn sẵn sàng, bắt đầu giao, chụp ảnh/định vị, hoàn thành.
- Thu ngân/người được cấp quyền: tạo đơn nhưng không tự giao xuống bếp.
- Kiêm nhiệm chỉ khi Giám đốc cấp quyền; việc tự tạo cần yêu cầu duyệt.

Không nới RLS hoặc bỏ kiểm tra quyền để “chữa nhanh” lỗi permission.

## 8. Chức năng đã có

- Mobile shell theo vai trò, logo SUMI, hiệu ứng chạm.
- Đơn hàng V2 và chi tiết/timeline/comment.
- KDS, giao việc, kho, vận tải/Grab, ảnh giao hàng.
- Todo ngày/tuần/tháng, việc được giao, việc phát sinh.
- Check-in/out, nghỉ theo giờ, tăng ca, KPI, bảng lương.
- Chi phí nhỏ, duyệt từ 500.000đ; ứng lương luôn duyệt; bổ sung ngoài ca/ngày sau cần xác nhận.
- Bảng tin Công ty và Nhật ký SUMI; avatar/ảnh, thông báo ghim.
- Hướng dẫn hình ảnh lọc theo vai trò.

## 9. Kiểm tra ngay sau bàn giao

1. Trên điện thoại tải lại/đóng mở PWA để nhận service worker mới.
2. Tạo thử một đơn mỗi nhóm; kiểm tra dropdown đúng nhóm và ô giá.
3. Tạo đơn mixed gồm bánh kem + Macaron + bánh mặn/ngọt.
4. Kiểm tra 6 ô Tổng quan: bấm vào chỉ thấy danh sách riêng, không nối dài dưới Tổng quan.
5. Đăng nhập vai trò Giám đốc: các thẻ trạng thái phải bấm được.
6. Chấm thử Sáng/Chiều/Tối, đặc biệt ca tối qua 00:00.
7. Kiểm tra cảnh báo bằng dữ liệu test có thời gian quá ngưỡng.
8. Kiểm tra đơn Trường học tuyệt đối không lộ giá với mọi vai trò.

## 10. Lệnh kiểm tra trước khi đẩy

```powershell
npm run build
git diff --check
```

Chỉ commit các file liên quan; workspace có nhiều tài liệu và file tạm chưa tracked, không xóa hoặc gom vào commit. Dùng migration mới, không sửa migration đã chạy production. Sau khi push `main`, kiểm tra Vercel deployment phải ở trạng thái `READY`.

## 11. File giao diện trọng tâm

- `src/screens/OrdersV2Screen.jsx`
- `src/components/CreateOrderV2Modal.jsx`
- `src/components/OrderV2DetailModal.jsx`
- `src/screens/MobileHomeScreen.jsx`
- `src/screens/ShiftsScreen.jsx`
- `src/screens/KdsScreen.jsx`
- `src/screens/ShippingScreen.jsx`
- `src/screens/TasksV2Screen.jsx`
- `src/screens/CompanyFeedScreen.jsx`
- `src/lib/featureFlags.js`
- `src/lib/queries.js`
- `src/order-overview.css`

## 12. Cách làm việc tiếp

Mọi người đang nhập dữ liệu thật song song với cách cũ. Ưu tiên sửa lỗi gây mất dữ liệu, sai quyền, sai trạng thái hoặc cản thao tác mobile. Không thay đổi lớn giao diện đã thống nhất nếu chưa có xác nhận của người phụ trách SUMI. Mỗi phản hồi test nên ghi: vai trò, thiết bị, thao tác, kết quả mong muốn, ảnh màn hình, mã đơn và thời điểm xảy ra.
