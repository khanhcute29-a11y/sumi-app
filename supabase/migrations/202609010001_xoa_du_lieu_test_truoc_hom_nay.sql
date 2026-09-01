-- Dọn dữ liệu ĐƠN HÀNG TEST — xóa hẳn toàn bộ đơn tạo TRƯỚC ngày hôm nay
-- (2026-09-01, giờ VN), giữ nguyên đơn tạo từ hôm nay trở đi.
--
-- Đã kiểm tra bằng query read-only trước khi viết script này:
--   - 57 đơn sẽ bị xóa (từ 25/8 tới hết 31/8), 3 đơn giữ lại (tạo từ 1/9).
--   - KHÔNG có customer_debt_entries (công nợ trường học) nào gắn với các
--     đơn test này — an toàn, không để lại công nợ "ma" không gắn đơn.
--
-- Mốc giờ dùng literal tường minh '2026-09-01T00:00:00+07:00', KHÔNG dùng
-- current_date/now() — script này chỉ chạy ĐÚNG 1 LẦN cho đúng ngày hôm nay
-- lúc yêu cầu, không phải logic lặp lại cho "mọi ngày sau này".
--
-- Cùng cơ chế dọn dẹp như RPC delete_order_by_director (migration
-- 202608300900): gỡ liên kết kpi_logs.order_id (ON DELETE NO ACTION, trở
-- ngại FK thật duy nhất, giữ nguyên lịch sử KPI nhân sự) trước khi xóa —
-- mọi bảng khác tham chiếu orders đều tự dọn (CASCADE) hoặc set null.

begin;

update public.kpi_logs
set order_id = null
where order_id in (select id from public.orders where created_at < '2026-09-01T00:00:00+07:00'::timestamptz);

delete from public.orders where created_at < '2026-09-01T00:00:00+07:00'::timestamptz;

insert into public.migration_runs(migration_key, status, finished_at, notes)
values('202609010001_xoa_du_lieu_test_truoc_hom_nay', 'completed', now(),
  'Xóa hẳn 57 đơn hàng test tạo trước 2026-09-01 (giữ 3 đơn tạo từ hôm nay). Đã xác nhận không có công nợ trường học nào gắn với các đơn này trước khi xóa.')
on conflict(migration_key) do update set status='completed', finished_at=now(), notes=excluded.notes;

commit;
