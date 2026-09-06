-- P2.1 Trả lời trích dẫn + P2.2 Thu hồi tin nhắn (review vòng 3, 06/09/2026).
begin;
set local lock_timeout = '10s';
set local statement_timeout = '30s';

alter table public.chat_messages
  add column if not exists reply_to_id uuid references public.chat_messages(id) on delete set null,
  add column if not exists recalled_at timestamptz;

-- Thu hồi: CHỈ người gửi, trong 24h kể từ lúc gửi (khớp hành vi Zalo).
-- Không xoá dòng thật — giữ lại để lịch sử phân trang không bị lệch (xoá
-- thật sẽ làm cursor (created_at,id) của các máy khác đang xem hụt mất 1
-- dòng giữa chừng) — chỉ đánh dấu recalled_at + xoá nội dung/ảnh thật khỏi
-- CSDL (không chỉ ẩn ở client) để đúng nghĩa "thu hồi".
create or replace function public.recall_chat_message(p_message_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_msg public.chat_messages%rowtype;
begin
  select * into v_msg from public.chat_messages where id = p_message_id;
  if v_msg.id is null then
    raise exception 'Không tìm thấy tin nhắn.';
  end if;
  if v_msg.sender_id is distinct from v_uid then
    raise exception 'Chỉ người gửi mới thu hồi được tin nhắn này.';
  end if;
  if v_msg.recalled_at is not null then
    return;
  end if;
  if now() - v_msg.created_at > interval '24 hours' then
    raise exception 'Tin nhắn gửi quá 24 giờ, không thu hồi được nữa.';
  end if;

  update public.chat_messages
  set content = null, attachment_url = null, order_code = null, recalled_at = now()
  where id = p_message_id;
end;
$$;

revoke all on function public.recall_chat_message(uuid) from public, anon;
grant execute on function public.recall_chat_message(uuid) to authenticated;

-- Trigger last_message_* (migration 202609061200) phải hiện đúng "Tin nhắn
-- đã thu hồi" cho phòng có tin CUỐI CÙNG vừa bị thu hồi, không phải nội
-- dung rỗng (vì content đã bị xoá ở trên). Sửa lại trigger UPDATE riêng cho
-- trường hợp recalled_at vừa được set — trigger INSERT cũ không bị đụng.
create or replace function public.chat_rooms_update_last_message_on_recall()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.recalled_at is not null and old.recalled_at is null then
    update public.chat_rooms
    set last_message_preview = 'Tin nhắn đã được thu hồi'
    where id = new.room_id and last_message_sender_id = new.sender_id
      and last_message_at = new.created_at;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_chat_messages_update_room_on_recall on public.chat_messages;
create trigger trg_chat_messages_update_room_on_recall
  after update on public.chat_messages
  for each row execute function public.chat_rooms_update_last_message_on_recall();

insert into public.migration_runs(migration_key, status, finished_at, notes)
values('202609062000_chat_reply_and_recall', 'completed', now(),
  'Chat: them reply_to_id (tra loi trich dan) + recalled_at/RPC recall_chat_message (thu hoi tin, chi nguoi gui, trong 24h, xoa that noi dung khoi DB) + trigger cap nhat last_message_preview thanh "Tin nhan da duoc thu hoi" khi tin cuoi cung bi thu hoi.')
on conflict(migration_key) do update set status='completed', finished_at=now(), notes=excluded.notes;

commit;
