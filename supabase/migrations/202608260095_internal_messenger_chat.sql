-- SUMI APP — Chat Messenger nội bộ (nhóm chat theo khâu + chat riêng 1-1)
-- Bảng: chat_rooms / chat_participants / chat_messages + RLS chỉ cho thành
-- viên phòng chat đọc/gửi + bật Realtime cho chat_messages.
begin;

create table if not exists public.chat_rooms (
  id uuid primary key default gen_random_uuid(),
  name text,
  room_type text not null check (room_type in ('group','direct')),
  topic text,
  avatar_emoji text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.chat_participants (
  room_id uuid not null references public.chat_rooms(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  last_read_at timestamptz,
  primary key (room_id, profile_id)
);

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.chat_rooms(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  content text,
  attachment_url text,
  order_code text,
  created_at timestamptz not null default now(),
  check (content is not null or attachment_url is not null)
);

create index if not exists idx_chat_participants_profile on public.chat_participants(profile_id);
create index if not exists idx_chat_messages_room_created on public.chat_messages(room_id, created_at);

alter table public.chat_rooms enable row level security;
alter table public.chat_participants enable row level security;
alter table public.chat_messages enable row level security;

drop policy if exists "participants read rooms" on public.chat_rooms;
create policy "participants read rooms" on public.chat_rooms for select using (
  exists(select 1 from public.chat_participants cp where cp.room_id = id and cp.profile_id = auth.uid())
);

drop policy if exists "participants read participants" on public.chat_participants;
create policy "participants read participants" on public.chat_participants for select using (
  exists(select 1 from public.chat_participants cp2 where cp2.room_id = chat_participants.room_id and cp2.profile_id = auth.uid())
);

drop policy if exists "participants read messages" on public.chat_messages;
create policy "participants read messages" on public.chat_messages for select using (
  exists(select 1 from public.chat_participants cp where cp.room_id = chat_messages.room_id and cp.profile_id = auth.uid())
);

drop policy if exists "participants send messages" on public.chat_messages;
create policy "participants send messages" on public.chat_messages for insert with check (
  sender_id = auth.uid()
  and exists(select 1 from public.chat_participants cp where cp.room_id = chat_messages.room_id and cp.profile_id = auth.uid())
);

-- Tạo/lấy phòng chat riêng 1-1 (idempotent — 2 người chỉ có đúng 1 phòng DM).
create or replace function public.get_or_create_dm_room(p_other_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_room uuid;
begin
  if v_me is null or p_other_id is null or v_me = p_other_id then
    raise exception 'Người dùng không hợp lệ';
  end if;

  select cp1.room_id into v_room
  from public.chat_participants cp1
  join public.chat_participants cp2 on cp2.room_id = cp1.room_id
  join public.chat_rooms r on r.id = cp1.room_id
  where r.room_type = 'direct' and cp1.profile_id = v_me and cp2.profile_id = p_other_id
  limit 1;

  if v_room is not null then
    return v_room;
  end if;

  insert into public.chat_rooms(room_type, created_by) values ('direct', v_me) returning id into v_room;
  insert into public.chat_participants(room_id, profile_id) values (v_room, v_me), (v_room, p_other_id);
  return v_room;
end;
$$;

revoke all on function public.get_or_create_dm_room(uuid) from public, anon;
grant execute on function public.get_or_create_dm_room(uuid) to authenticated;

-- Phòng chat nhóm mặc định — mọi nhân viên đã duyệt & đang hoạt động đều là
-- thành viên (đây là kênh trao đổi nội bộ, không cần khoá theo khâu quá chặt
-- ở bản đầu tiên này).
do $$
declare
  v_room uuid;
  v_defs jsonb := '[
    {"code":"c_general","name":"🥐 Toàn Công Ty SUMI Bakery","topic":"Kênh thông báo & trao đổi chung toàn hệ thống","avatar":"🥐"},
    {"code":"c_kitchen","name":"👨‍🍳 Bếp Bánh & KDS Điều Phối","topic":"Trao đổi tiến độ mẻ bánh, đơn gấp, mẫu bánh đặc biệt","avatar":"👨‍🍳"},
    {"code":"c_delivery","name":"🚚 Đội Giao Vận & Shipper","topic":"Điều phối giao bánh, định vị GPS & báo kẹt xe","avatar":"🚚"},
    {"code":"c_factory41","name":"🏭 Xưởng 41 & 42 (Macaron & Trường Học)","topic":"Điều phối số lượng khay Macaron và bánh sỉ trường học","avatar":"🏭"}
  ]'::jsonb;
  v_def jsonb;
begin
  for v_def in select * from jsonb_array_elements(v_defs) loop
    select id into v_room from public.chat_rooms where room_type = 'group' and name = (v_def->>'name');
    if v_room is null then
      insert into public.chat_rooms(name, room_type, topic, avatar_emoji)
      values (v_def->>'name', 'group', v_def->>'topic', v_def->>'avatar')
      returning id into v_room;
    end if;

    insert into public.chat_participants(room_id, profile_id)
    select v_room, p.id from public.profiles p
    where p.approved = true and p.active is distinct from false
    on conflict (room_id, profile_id) do nothing;
  end loop;
end $$;

-- Bật Realtime cho tin nhắn — đẩy ngay không cần F5.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'chat_messages'
  ) then
    alter publication supabase_realtime add table public.chat_messages;
  end if;
end $$;

insert into public.migration_runs(migration_key, status, finished_at, notes)
values('202608260095_internal_messenger_chat', 'completed', now(),
  'Internal messenger chat: chat_rooms/chat_participants/chat_messages + RLS (participants-only) + Realtime on chat_messages + 4 default group rooms (all approved/active staff auto-joined) + get_or_create_dm_room() RPC for 1-1 chats.')
on conflict(migration_key) do update set status='completed', finished_at=now(), notes=excluded.notes;

commit;
