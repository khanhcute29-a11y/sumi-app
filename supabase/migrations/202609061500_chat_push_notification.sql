-- Push notification thật cho tin nhắn Chat Messenger — theo review vòng 2
-- (06/09/2026, mục 2.6): "Đóng app là không biết có tin — không dùng thật
-- được." Hạ tầng push (VAPID, service worker, api/send-push.js, hướng dẫn
-- iOS "Thêm vào Màn hình chính" ở PushStatusPanel.jsx) ĐÃ CÓ SẴN và đang
-- chạy thật cho Bảng tin + Giao việc (migration 202608260021) — chat_messages
-- là bảng DUY NHẤT chưa có trigger nối vào. Không xây lại gì, chỉ nối thêm.
--
-- notify_push() cũ chỉ gửi cho 1 người (p_staff_id) hoặc TOÀN CÔNG TY (null)
-- — không có kiểu "N người cụ thể" mà 1 phòng chat cần (mọi thành viên TRỪ
-- người gửi). notify_push_multi() mới gửi kèm mảng staffIds trong 1 lượt gọi
-- HTTP duy nhất (api/send-push.js đã được mở rộng hỗ trợ staffIds) — tránh
-- phải gọi net.http_post riêng cho từng người trong phòng đông (tốn + chậm).
begin;
set local lock_timeout = '10s';
set local statement_timeout = '30s';

create or replace function public.notify_push_multi(p_title text, p_body text, p_url text, p_staff_ids uuid[])
returns void language plpgsql as $$
begin
  if p_staff_ids is null or array_length(p_staff_ids, 1) is null then return; end if;
  perform net.http_post(
    url := 'https://sumibakery.shop/api/send-push',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := jsonb_build_object('title', p_title, 'body', p_body, 'url', p_url, 'staffIds', to_jsonb(p_staff_ids)),
    timeout_milliseconds := 8000
  );
exception when others then
  raise warning 'notify_push_multi failed: %', SQLERRM;
end;
$$;

create or replace function public.trg_notify_new_chat_message()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_sender_name text;
  v_room public.chat_rooms%rowtype;
  v_recipients uuid[];
  v_title text;
  v_body text;
begin
  select * into v_room from public.chat_rooms where id = new.room_id;

  select array_agg(profile_id) into v_recipients
  from public.chat_participants
  where room_id = new.room_id and profile_id <> new.sender_id;

  if v_recipients is null or array_length(v_recipients, 1) is null then
    return new;
  end if;

  select full_name into v_sender_name from public.profiles where id = new.sender_id;
  v_body := coalesce(new.content, case when new.attachment_url is not null then '📷 Đã gửi ảnh' else '' end);

  -- Nhóm: "Tên người gửi @ Tên nhóm" (biết ngay tin từ nhóm nào, đúng kiểu
  -- Zalo) — Chat riêng 1-1: chỉ tên người gửi, không cần lặp lại vì đã rõ.
  v_title := case
    when v_room.room_type = 'direct' then coalesce(v_sender_name, 'Tin nhắn mới')
    else coalesce(v_sender_name, 'Ai đó') || ' @ ' || coalesce(v_room.name, 'Nhóm chat')
  end;

  perform public.notify_push_multi(v_title, left(v_body, 160), '/messenger/' || new.room_id, v_recipients);
  return new;
end;
$$;

drop trigger if exists notify_new_chat_message on public.chat_messages;
create trigger notify_new_chat_message
  after insert on public.chat_messages
  for each row execute function public.trg_notify_new_chat_message();

insert into public.migration_runs(migration_key, status, finished_at, notes)
values('202609061500_chat_push_notification', 'completed', now(),
  'Chat: noi chat_messages INSERT vao he thong push san co (notify_push_multi goi api/send-push.js voi staffIds) - moi tin nhan chat gio bao push that cho tat ca thanh vien phong TRU nguoi gui, mo dung phong qua deep link /messenger/<room_id> da co san.')
on conflict(migration_key) do update set status='completed', finished_at=now(), notes=excluded.notes;

commit;
