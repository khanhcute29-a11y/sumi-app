-- Chat Messenger nội bộ — sửa 2 lỗi hiệu năng nghiêm trọng + thêm quản lý
-- nhóm tự tạo, theo đánh giá 06/09/2026 từ 1 lập trình viên ngoài (xem
-- CHAT_FEATURE_CODE.md):
--
-- 1. fetchAllConversations (client) quét TOÀN BỘ chat_messages của mọi phòng
--    mỗi lần tải danh sách hội thoại (kể cả sau mỗi lần gửi tin, do
--    setRefreshTick) chỉ để lấy 1 dòng preview/phòng — cực kỳ tốn khi số tin
--    nhắn tăng. Sửa bằng cách thêm cột last_message_* vào chat_rooms, tự cập
--    nhật qua TRIGGER khi có tin mới — client chỉ cần đọc chat_rooms, không
--    quét chat_messages nữa.
-- 2. fetchUnreadCounts (client, dùng ở CẢ App.jsx cho badge nav CHUNG lẫn
--    ChatScreen) kéo MỌI tin nhắn (không limit) của mọi phòng về JS rồi đếm
--    bằng tay — cũng tốn y hệt lỗi trên, mà càng nặng hơn vì App.jsx còn tự
--    kích lại (sumi-badges-changed) trên MỌI INSERT chat_messages hệ thống,
--    không lọc theo phòng của mình. Sửa bằng 1 RPC đếm ngay trong SQL
--    (join + group by), trả về CHÍNH XÁC dù vượt quá giới hạn 1000 dòng mặc
--    định của PostgREST (đếm trong DB, không phải kéo dữ liệu về đếm).
--
-- Thêm luôn quản lý nhóm tự tạo (tạo xong trước đây không sửa được gì) —
-- CHỈ áp dụng nhóm DO NGƯỜI DÙNG TỰ TẠO (created_by is not null); 4 nhóm mặc
-- định toàn công ty (created_by null, tạo ở 202608260095) không cho đổi
-- tên/rời/kick qua các RPC này — tránh ai đó lỡ tay xoá mất kênh chung.
begin;
set local lock_timeout = '10s';
set local statement_timeout = '30s';

-- ── 1. last_message_* trên chat_rooms — tự cập nhật qua trigger ───────────
alter table public.chat_rooms
  add column if not exists last_message_at timestamptz,
  add column if not exists last_message_preview text,
  add column if not exists last_message_sender_id uuid references public.profiles(id) on delete set null;

create or replace function public.chat_rooms_update_last_message()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  update public.chat_rooms
  set last_message_at = new.created_at,
      last_message_preview = coalesce(new.content, case when new.attachment_url is not null then '📷 Đã gửi ảnh' else null end),
      last_message_sender_id = new.sender_id
  where id = new.room_id;
  return new;
end;
$function$;

drop trigger if exists trg_chat_messages_update_room_last_message on public.chat_messages;
create trigger trg_chat_messages_update_room_last_message
  after insert on public.chat_messages
  for each row execute function public.chat_rooms_update_last_message();

-- Khởi tạo lại last_message_* cho các phòng CÓ SẴN tin nhắn từ trước khi có
-- trigger này — nếu không, phòng cũ sẽ hiện trống cho tới khi có tin mới.
update public.chat_rooms r
set last_message_at = m.created_at,
    last_message_preview = coalesce(m.content, case when m.attachment_url is not null then '📷 Đã gửi ảnh' else null end),
    last_message_sender_id = m.sender_id
from (
  select distinct on (room_id) room_id, content, attachment_url, sender_id, created_at
  from public.chat_messages
  order by room_id, created_at desc
) m
where m.room_id = r.id and r.last_message_at is null;

-- ── 2. Đếm tin chưa đọc — tính hẳn trong SQL, không kéo dữ liệu về JS ─────
create or replace function public.get_chat_unread_counts()
returns table(room_id uuid, cnt bigint)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select m.room_id, count(*) as cnt
  from public.chat_messages m
  join public.chat_participants p on p.room_id = m.room_id and p.profile_id = auth.uid()
  where m.sender_id <> auth.uid()
    and (p.last_read_at is null or m.created_at > p.last_read_at)
  group by m.room_id;
$function$;

revoke all on function public.get_chat_unread_counts() from public, anon;
grant execute on function public.get_chat_unread_counts() to authenticated;

-- ── 3. Quản lý nhóm tự tạo (đổi tên/thêm/xoá thành viên/rời nhóm) ─────────
-- Chỉ áp dụng nhóm created_by IS NOT NULL (nhóm tự tạo) — chặn 4 nhóm mặc
-- định toàn công ty.
create or replace function public.rename_chat_group(p_room_id uuid, p_new_name text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_name text := nullif(btrim(p_new_name), '');
begin
  if not public.is_chat_room_participant(p_room_id) then
    raise exception 'Bạn không ở trong nhóm này.';
  end if;
  update public.chat_rooms set name = coalesce(v_name, name)
  where id = p_room_id and room_type = 'group' and created_by is not null;
  if not found then
    raise exception 'Không đổi được tên — đây có thể là nhóm mặc định của toàn công ty.';
  end if;
end;
$function$;

create or replace function public.add_chat_group_members(p_room_id uuid, p_member_ids uuid[])
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_room public.chat_rooms%rowtype;
begin
  if not public.is_chat_room_participant(p_room_id) then
    raise exception 'Bạn không ở trong nhóm này.';
  end if;
  select * into v_room from public.chat_rooms where id = p_room_id;
  if v_room.room_type <> 'group' or v_room.created_by is null then
    raise exception 'Không thêm được người — đây có thể là nhóm mặc định của toàn công ty.';
  end if;
  insert into public.chat_participants(room_id, profile_id)
  select p_room_id, id from unnest(p_member_ids) as id
  on conflict (room_id, profile_id) do nothing;
end;
$function$;

-- Rời nhóm (tự xoá chính mình) HOẶC kick người khác (chỉ người tạo nhóm).
create or replace function public.remove_chat_group_member(p_room_id uuid, p_member_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_me uuid := auth.uid();
  v_room public.chat_rooms%rowtype;
begin
  select * into v_room from public.chat_rooms where id = p_room_id;
  if v_room.id is null or v_room.room_type <> 'group' or v_room.created_by is null then
    raise exception 'Không xoá được — đây có thể là nhóm mặc định của toàn công ty.';
  end if;
  if not public.is_chat_room_participant(p_room_id) then
    raise exception 'Bạn không ở trong nhóm này.';
  end if;
  if p_member_id is distinct from v_me and v_room.created_by is distinct from v_me then
    raise exception 'Chỉ người tạo nhóm mới xoá được người khác — bạn có thể tự rời nhóm.';
  end if;
  delete from public.chat_participants where room_id = p_room_id and profile_id = p_member_id;
end;
$function$;

revoke all on function public.rename_chat_group(uuid, text) from public, anon;
revoke all on function public.add_chat_group_members(uuid, uuid[]) from public, anon;
revoke all on function public.remove_chat_group_member(uuid, uuid) from public, anon;
grant execute on function public.rename_chat_group(uuid, text) to authenticated;
grant execute on function public.add_chat_group_members(uuid, uuid[]) to authenticated;
grant execute on function public.remove_chat_group_member(uuid, uuid) to authenticated;

insert into public.migration_runs(migration_key, status, finished_at, notes)
values('202609061200_chat_last_message_unread_count_group_manage', 'completed', now(),
  'Chat: them chat_rooms.last_message_at/preview/sender_id tu cap nhat qua trigger (thay fetchAllConversations quet toan bo chat_messages); RPC get_chat_unread_counts() dem trong SQL (thay fetchUnreadCounts keo het du lieu ve JS, dung o ca App.jsx nav badge lan ChatScreen); RPC rename_chat_group/add_chat_group_members/remove_chat_group_member cho nhom tu tao (created_by not null), khong dung duoc cho 4 nhom mac dinh toan cong ty.')
on conflict(migration_key) do update set status='completed', finished_at=now(), notes=excluded.notes;

commit;
