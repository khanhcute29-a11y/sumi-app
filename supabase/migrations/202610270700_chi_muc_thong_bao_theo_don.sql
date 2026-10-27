-- KHẨN 27/10/2026 — shipper bấm "Nhận giao" / "Hoàn thành giao" bị huỷ
-- ("canceling statement due to statement timeout"), hỏng nhiều lần mỗi đơn,
-- 26–27/10 (nhật ký Postgres: 46 lần / 1 giờ).
--
-- NGUYÊN NHÂN: mỗi lần đơn đổi trạng thái, trigger z_notify_order_history tìm
-- `notifications where entity_id = <đơn> and notification_type = …` để chống
-- ghi trùng. Bảng notifications đã ~249.000 dòng / 143 MB (task_deadline_alert
-- 170k, order_waiting 68k…) mà KHÔNG có chỉ mục theo entity_id -> lục cả bảng,
-- cộng lúc database đang bận (xem 202610270701) là vượt 8 giây.
--
-- CHẠY RIÊNG FILE NÀY, KHÔNG bọc begin/commit: CREATE INDEX CONCURRENTLY không
-- chạy được trong transaction, nhưng đổi lại KHÔNG khoá bảng — app, chuông,
-- trigger vẫn ghi thông báo bình thường trong lúc tạo chỉ mục.
-- Nếu báo lỗi "invalid" (bị ngắt giữa chừng): drop index concurrently
-- if exists public.idx_notifications_entity_type; rồi chạy lại.
create index concurrently if not exists idx_notifications_entity_type
  on public.notifications (entity_id, notification_type);
