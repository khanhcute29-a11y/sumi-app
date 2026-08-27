-- BƯỚC 3 (Realtime) — mockup task-lifecycle-v2-approved.
--
-- ═══ LỖI THẬT PHÁT HIỆN KHI RÀ SOÁT TRƯỚC KHI VIẾT MIGRATION NÀY ═══
--
-- `CongViecV2.jsx` đã có sẵn từ trước một kênh `.channel('cong-viec-v2')`
-- lắng nghe `postgres_changes` trên bảng `tasks` — nhìn mã nguồn thì ĐÚNG,
-- "subscribe" không báo lỗi gì. Nhưng rà lại TOÀN BỘ migration mới thấy:
-- bảng `tasks` CHƯA BAO GIỜ được thêm vào publication `supabase_realtime`.
-- Chỉ có `chat_messages` (202608260095) và `task_progress_reports`
-- (202608260140) được bật đúng cách.
--
-- Hậu quả: kênh đó đã "sống" từ trước tới giờ mà KHÔNG BAO GIỜ nhận được sự
-- kiện nào từ database — danh sách việc sở dĩ vẫn cập nhật được là nhờ mỗi
-- màn hình tự gọi lại `tai()` ngay sau khi RPC của MÀN HÌNH ĐÓ chạy xong
-- (`onDoi?.()`), không phải nhờ Realtime. Nghĩa là: người A giao việc thì
-- người B đang mở sẵn tab Việc SẼ KHÔNG thấy việc mới hiện ra cho tới khi
-- tự bấm tải lại hoặc rời màn hình quay lại — đúng thiếu sót mà Bước 3 yêu
-- cầu phải vá.
--
-- Vá cùng lúc: bảng `projects` — danh sách dự án ở màn Giám đốc hiện chỉ
-- tải một lần lúc mở màn hình, không có kênh nào theo dõi thay đổi.
begin;
set local lock_timeout = '10s';
set local statement_timeout = '60s';

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'tasks'
  ) then
    alter publication supabase_realtime add table public.tasks;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'projects'
  ) then
    alter publication supabase_realtime add table public.projects;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Cho luôn "Nhận giao kiêm nhiệm" (Bước 2) — nhiều nhân viên có thể cùng mở
-- tab Chờ nhận một lúc. Không có Realtime trên `orders`, hai người có thể
-- cùng bấm "Nhận giao" một đơn gần như đồng thời trước khi ai kịp tải lại.
-- RPC accept_delivery_assignment_flexible xử lý được việc đó (không sinh dữ
-- liệu sai), nhưng trải nghiệm xấu — người bấm sau vẫn tưởng đơn còn trống.
-- Bật Realtime để đơn biến khỏi danh sách của người khác NGAY khi ai đó
-- nhận, giảm hẳn khả năng đụng nhau.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'orders'
  ) then
    alter publication supabase_realtime add table public.orders;
  end if;
end $$;

insert into public.migration_runs(migration_key, status, finished_at, notes)
values('202608270060_realtime_viec_va_du_an', 'completed', now(),
  'Fixes a latent bug found while implementing Step 3 (Realtime) of the task-lifecycle-v2 rollout: CongViecV2.jsx has subscribed to postgres_changes on public.tasks since it was built, and the subscribe call never errors, but the tasks table was never actually added to the supabase_realtime publication - only chat_messages and task_progress_reports were (202608260095, 202608260140). The channel has therefore never received a single real event; the task list has only ever refreshed via each screen calling tai() right after its own RPC succeeds, so a second viewer with the tab already open never saw new/changed tasks without a manual reload. Adds tasks, projects (director dashboard project list currently only loads once on mount), and orders (so the new "kiêm nhiệm" delivery-claim list in the Chờ nhận tab drops a claimed order for other viewers instantly, reducing the race where two staff try to claim the same order) to the publication, guarded so re-running is a no-op if a table is already present.')
on conflict(migration_key) do update
  set status = 'completed', finished_at = now(), notes = excluded.notes;

commit;
