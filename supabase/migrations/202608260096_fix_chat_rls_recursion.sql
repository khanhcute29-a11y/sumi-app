-- Sửa lỗi "infinite recursion detected in policy for relation
-- chat_participants" — policy select trên chat_participants lại tự query
-- chính chat_participants trong USING clause, Postgres áp RLS đệ quy vào
-- luôn subquery đó nên vòng lặp vô hạn. Cách chuẩn: đưa việc kiểm tra
-- "mình có phải thành viên phòng này không" ra 1 hàm SECURITY DEFINER
-- (bỏ qua RLS khi tự truy vấn), rồi các policy gọi hàm đó thay vì tự
-- query bảng ngay trong policy.
begin;

create or replace function public.is_chat_room_participant(p_room_id uuid)
returns boolean language sql security definer set search_path = public stable as $$
  select exists(
    select 1 from public.chat_participants
    where room_id = p_room_id and profile_id = auth.uid()
  );
$$;

revoke all on function public.is_chat_room_participant(uuid) from public, anon;
grant execute on function public.is_chat_room_participant(uuid) to authenticated;

drop policy if exists "participants read rooms" on public.chat_rooms;
create policy "participants read rooms" on public.chat_rooms for select using (
  public.is_chat_room_participant(id)
);

drop policy if exists "participants read participants" on public.chat_participants;
create policy "participants read participants" on public.chat_participants for select using (
  public.is_chat_room_participant(room_id)
);

drop policy if exists "participants read messages" on public.chat_messages;
create policy "participants read messages" on public.chat_messages for select using (
  public.is_chat_room_participant(room_id)
);

drop policy if exists "participants send messages" on public.chat_messages;
create policy "participants send messages" on public.chat_messages for insert with check (
  sender_id = auth.uid() and public.is_chat_room_participant(room_id)
);

insert into public.migration_runs(migration_key, status, finished_at, notes)
values('202608260096_fix_chat_rls_recursion', 'completed', now(),
  'Fixed infinite-recursion RLS error on chat_participants by moving the participant check into a SECURITY DEFINER helper function (is_chat_room_participant) instead of a self-referencing subquery inside the policy.')
on conflict(migration_key) do update set status='completed', finished_at=now(), notes=excluded.notes;

commit;
