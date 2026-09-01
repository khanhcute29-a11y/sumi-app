-- SUMI APP — Ghim hội thoại (mỗi người tự ghim riêng, không ảnh hưởng người
-- khác) + cho phép tự tạo nhóm chat với người mình chọn (khác 4 nhóm mặc
-- định cố định tạo lúc 202608260095_internal_messenger_chat).
begin;

alter table public.chat_participants
  add column if not exists pinned boolean not null default false;

-- Ghim/bỏ ghim 1 phòng chat cho CHÍNH MÌNH — chỉ được sửa dòng participant
-- của chính mình, không đụng được người khác (khớp RLS "participants read
-- participants" vốn chỉ cho SELECT, chưa có UPDATE nên phải thêm policy).
drop policy if exists "self update own participant row" on public.chat_participants;
create policy "self update own participant row" on public.chat_participants for update using (
  profile_id = auth.uid()
) with check (
  profile_id = auth.uid()
);

-- Tự tạo nhóm chat với người mình chọn — khác 4 nhóm mặc định cố định.
-- SECURITY DEFINER vì chat_rooms/chat_participants chưa có policy INSERT
-- cho user thường (giống cách get_or_create_dm_room đã làm cho chat riêng).
create or replace function public.create_chat_group(p_name text, p_member_ids uuid[])
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_room uuid;
  v_name text := nullif(btrim(p_name), '');
begin
  if v_me is null then
    raise exception 'Chưa đăng nhập';
  end if;
  if p_member_ids is null or array_length(p_member_ids, 1) is null then
    raise exception 'Chưa chọn thành viên nào cho nhóm';
  end if;

  insert into public.chat_rooms(name, room_type, avatar_emoji, created_by)
  values (coalesce(v_name, 'Nhóm chat mới'), 'group', '👥', v_me)
  returning id into v_room;

  insert into public.chat_participants(room_id, profile_id)
  select v_room, id from (select unnest(p_member_ids) as id union select v_me) as m
  on conflict (room_id, profile_id) do nothing;

  return v_room;
end;
$$;

revoke all on function public.create_chat_group(text, uuid[]) from public, anon;
grant execute on function public.create_chat_group(text, uuid[]) to authenticated;

insert into public.migration_runs(migration_key, status, finished_at, notes)
values('202609010100_ghim_chat_va_tao_nhom', 'completed', now(),
  'Chat: thêm cột chat_participants.pinned (ghim riêng từng người, self-update RLS) + RPC create_chat_group(name, member_ids) cho tự tạo nhóm chat tuỳ ý.')
on conflict(migration_key) do update set status='completed', finished_at=now(), notes=excluded.notes;

commit;
