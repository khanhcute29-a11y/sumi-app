-- chat_participants trước đó chỉ có policy SELECT — UPDATE last_read_at (để
-- tính huy hiệu tin nhắn chưa đọc trên nút chat nổi) bị RLS chặn âm thầm
-- (không lỗi, chỉ 0 dòng bị ảnh hưởng). Thêm policy cho phép tự cập nhật
-- đúng dòng của chính mình.
begin;

drop policy if exists "participants update own last_read" on public.chat_participants;
create policy "participants update own last_read"
  on public.chat_participants for update
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

insert into public.migration_runs(migration_key, status, finished_at, notes)
values('202608260099_chat_participants_update_last_read', 'completed', now(),
  'Added UPDATE RLS policy on chat_participants so a user can mark their own last_read_at when opening a chat room/DM — needed for the Messenger unread-badge + notification-bell feature (previously only a SELECT policy existed, so the update silently affected 0 rows).')
on conflict(migration_key) do update set status='completed', finished_at=now(), notes=excluded.notes;

commit;
