-- Luồng trao đổi tiến độ giữa thợ và quản lý phải nảy lên ngay.
--
-- Đặc tả yêu cầu: "Bọc trong Realtime subscription để nhân viên báo cáo xong,
-- nếu Quản lý trả lời thì tin nhắn nảy lên ngay lập tức."
-- Nhưng bảng `task_progress_reports` KHÔNG có trong kênh thời gian thực, nên
-- hai bên phải đóng/mở lại thẻ việc mới thấy tin của nhau.
--
-- ⚠️ KHÔNG đụng tới bảng nào của phân hệ Chat. `chat_messages` vốn đã có sẵn
-- trong kênh này và giữ nguyên.
begin;
set local lock_timeout = '10s';

do $$
begin
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and schemaname = 'public'
                   and tablename = 'task_progress_reports') then
    alter publication supabase_realtime add table public.task_progress_reports;
  end if;
end $$;

insert into public.migration_runs(migration_key, status, finished_at, notes)
values('202608260140_luong_bao_cao_thoi_gian_thuc', 'completed', now(),
  'Adds task_progress_reports to the supabase_realtime publication so the worker/manager progress thread updates live, as the spec required. The task screen subscribes on its own channels (cong-viec-v2 and bao-cao-<task id>) which do not collide with the chat channels (chat-my-rooms-* and chat-room-*). No chat table or channel is touched.')
on conflict(migration_key) do update set status='completed', finished_at=now(), notes=excluded.notes;

commit;
