-- recall_chat_message() (migration 202609062000) đặt content=null VÀ
-- attachment_url=null cùng lúc — vi phạm ràng buộc có sẵn từ migration gốc
-- 202608260095: `check (content is not null or attachment_url is not null)`
-- (1 tin nhắn luôn phải có CHỮ hoặc ẢNH, không được cả hai đều rỗng). Phát
-- hiện ngay khi test thật (không phải đoán) — sửa bằng cách đặt content =
-- '' (chuỗi rỗng, khác null, qua được check) thay vì null; client đã dựa
-- hẳn vào cờ recalled_at để quyết định hiển thị "Tin nhắn đã được thu hồi",
-- không đọc content khi recalled_at khác null, nên chuỗi rỗng không hiện ra
-- đâu cả.
begin;
set local lock_timeout = '10s';
set local statement_timeout = '30s';

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
  set content = '', attachment_url = null, order_code = null, recalled_at = now()
  where id = p_message_id;
end;
$$;

insert into public.migration_runs(migration_key, status, finished_at, notes)
values('202609062010_recall_chat_message_check_fix', 'completed', now(),
  'recall_chat_message(): sua loi vi pham check constraint chat_messages_check (content is not null or attachment_url is not null) - dat content = chuoi rong thay vi null, phat hien qua test truc tiep.')
on conflict(migration_key) do update set status='completed', finished_at=now(), notes=excluded.notes;

commit;
