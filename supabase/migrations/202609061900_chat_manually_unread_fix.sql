-- LỖI THẬT đã vá (review vòng 3, P1.4): get_chat_unread_counts() đếm
-- `m.sender_id <> auth.uid()` (đúng — không tự đếm tin CHÍNH MÌNH gửi là
-- "chưa đọc"). Nhưng "Đánh dấu chưa đọc" (markRoomUnread, migration
-- 202609061xxx trước) chỉ lùi last_read_at — nếu tin CUỐI CÙNG trong phòng
-- lại là tin CHÍNH MÌNH gửi, RPC vẫn đếm ra 0 (vì điều kiện sender loại nó
-- ra), badge tự biến mất ngay ở lần tải lại kế tiếp dù vừa bấm "chưa đọc".
-- Sửa: thêm cờ riêng `manually_unread` — không phụ thuộc last_read_at hay
-- ai gửi tin cuối, chỉ tắt khi mở phòng đọc thật (markRoomRead).
begin;
set local lock_timeout = '10s';
set local statement_timeout = '30s';

alter table public.chat_participants
  add column if not exists manually_unread boolean not null default false;

create or replace function public.get_chat_unread_counts()
returns table(room_id uuid, cnt bigint)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select p.room_id,
         greatest(
           coalesce(count(m.id) filter (
             where m.sender_id <> auth.uid()
               and (p.last_read_at is null or m.created_at > p.last_read_at)
           ), 0),
           case when p.manually_unread then 1 else 0 end
         ) as cnt
  from public.chat_participants p
  left join public.chat_messages m on m.room_id = p.room_id
  where p.profile_id = auth.uid()
  group by p.room_id, p.manually_unread
  having greatest(
           coalesce(count(m.id) filter (
             where m.sender_id <> auth.uid()
               and (p.last_read_at is null or m.created_at > p.last_read_at)
           ), 0),
           case when p.manually_unread then 1 else 0 end
         ) > 0;
$function$;

revoke all on function public.get_chat_unread_counts() from public, anon;
grant execute on function public.get_chat_unread_counts() to authenticated;

insert into public.migration_runs(migration_key, status, finished_at, notes)
values('202609061900_chat_manually_unread_fix', 'completed', now(),
  'Chat: them cot chat_participants.manually_unread - "Danh dau chua doc" khong con tu dong bien mat khi tin cuoi cung trong phong la CHINH MINH gui (RPC dem cu loai tru sender=minh nen truong hop nay luon ra 0).')
on conflict(migration_key) do update set status='completed', finished_at=now(), notes=excluded.notes;

commit;
