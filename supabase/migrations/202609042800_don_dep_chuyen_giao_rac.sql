-- Dọn dữ liệu rác: các chuyến giao (delivery_runs) không có bất kỳ điểm dừng
-- (delivery_stops) nào — phát hiện khi rà lỗi "Đơn hàng của tôi" của nhân
-- viên vận tải luôn ra 0 dù có chuyến giao (04/09/2026). Đã xác minh bằng
-- SELECT trước khi xoá: 16 chuyến, toàn bộ status='in_transit', 0 điểm dừng,
-- rải rác nhiều tài khoản (Bùi Nghĩa, Bùi Nghĩa 2, Nguyen Quoc Duy...) — rõ
-- ràng là chuyến test tạo dở rồi bỏ, chưa từng gắn đơn hàng thật nào, xoá an
-- toàn (không có khoá ngoại nào tham chiếu delivery_runs).
delete from public.delivery_runs r
where not exists (
  select 1 from public.delivery_stops s where s.delivery_run_id = r.id
);
