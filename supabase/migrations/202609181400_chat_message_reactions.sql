-- Thả cảm xúc đa dạng (👍❤️😂😮😢😡) cho tin nhắn, kiểu Zalo — mỗi người chỉ
-- được 1 cảm xúc / 1 tin nhắn (chọn cảm xúc khác thì THAY THẾ, bấm lại đúng
-- cảm xúc cũ thì bỏ đi — xử lý ở phía client bằng upsert/delete).
begin;
set local lock_timeout = '10s';
set local statement_timeout = '30s';

create table if not exists public.chat_message_reactions (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.chat_messages(id) on delete cascade,
  -- Lưu thêm room_id (thay vì join ngược qua chat_messages mỗi lần) để:
  -- (1) lọc Realtime theo đúng phòng đang mở dễ dàng bằng room_id=eq.xxx,
  -- (2) viết policy RLS gọn bằng is_chat_room_participant(room_id) có sẵn.
  room_id uuid not null references public.chat_rooms(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  emoji text not null,
  created_at timestamptz not null default now(),
  unique (message_id, profile_id)
);

create index if not exists chat_message_reactions_message_id_idx on public.chat_message_reactions(message_id);
create index if not exists chat_message_reactions_room_id_idx on public.chat_message_reactions(room_id);

alter table public.chat_message_reactions enable row level security;

-- Chặn giả mạo room_id: room_id gửi lên PHẢI đúng là room_id thật của
-- message_id — nếu không, 1 người có thể ghi room_id của phòng mình đang ở
-- (qua được is_chat_room_participant) nhưng lại trỏ message_id sang phòng
-- khác họ không có quyền, thả cảm xúc "ké" vào tin nhắn không thuộc về họ.
create or replace function public.validate_chat_reaction_room()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.room_id is distinct from (select room_id from public.chat_messages where id = new.message_id) then
    raise exception 'room_id không khớp với message_id của cảm xúc';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_validate_chat_reaction_room on public.chat_message_reactions;
create trigger trg_validate_chat_reaction_room
  before insert or update on public.chat_message_reactions
  for each row execute function public.validate_chat_reaction_room();

drop policy if exists "participants read reactions" on public.chat_message_reactions;
create policy "participants read reactions" on public.chat_message_reactions for select using (
  public.is_chat_room_participant(room_id)
);

drop policy if exists "participants insert own reaction" on public.chat_message_reactions;
create policy "participants insert own reaction" on public.chat_message_reactions for insert with check (
  profile_id = auth.uid() and public.is_chat_room_participant(room_id)
);

drop policy if exists "participants update own reaction" on public.chat_message_reactions;
create policy "participants update own reaction" on public.chat_message_reactions for update using (
  profile_id = auth.uid()
) with check (
  profile_id = auth.uid()
);

drop policy if exists "participants delete own reaction" on public.chat_message_reactions;
create policy "participants delete own reaction" on public.chat_message_reactions for delete using (
  profile_id = auth.uid()
);

alter publication supabase_realtime add table public.chat_message_reactions;

insert into public.migration_runs(migration_key, status, finished_at, notes)
values('202609181400_chat_message_reactions', 'completed', now(),
  'Chat: thêm bảng chat_message_reactions (1 cảm xúc/người/tin nhắn, unique(message_id,profile_id)) + trigger chặn giả mạo room_id + RLS tự đọc/ghi/sửa/xoá đúng dòng của mình + bật Realtime.')
on conflict(migration_key) do update set status='completed', finished_at=now(), notes=excluded.notes;

commit;
