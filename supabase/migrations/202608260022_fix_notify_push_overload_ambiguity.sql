-- Lỗi "function public.notify_push(unknown, text, unknown) is not unique" chặn cả
-- việc tạo đơn hàng: migration 202608260021 dùng "create or replace function
-- notify_push(text, text, text, uuid)" để thêm tham số p_staff_id — nhưng vì chữ
-- ký (số lượng tham số) khác bản gốc (text, text, text), Postgres tạo ra một hàm
-- OVERLOAD MỚI thay vì thay thế hàm cũ. Kết quả: 2 hàm notify_push cùng tồn tại,
-- và mọi lệnh gọi chỉ truyền 3 tham số (title, body, url) — như lúc tạo đơn hàng
-- mới — bị mơ hồ (ambiguous) không biết gọi bản nào, nên toàn bộ luồng tạo đơn bị
-- lỗi ngay cả khi không liên quan gì đến push. Fix: xoá hẳn bản 3-tham số cũ,
-- chỉ giữ đúng 1 bản 4-tham số (p_staff_id mặc định null).
begin;

drop function if exists public.notify_push(text, text, text);

insert into public.migration_runs(migration_key, status, finished_at, notes)
values('202608260022_fix_notify_push_overload_ambiguity', 'completed', now(),
  'Dropped the stale 3-arg notify_push() overload left behind by M-202608260021 (create or replace with a different signature creates a new overload, not a replacement) — was blocking order creation with "function notify_push(...) is not unique".')
on conflict(migration_key) do update set status='completed', finished_at=now(), notes=excluded.notes;

commit;
