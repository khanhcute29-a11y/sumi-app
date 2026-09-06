-- Vá 3 lỗ bảo mật thật trên hệ thống push (review vòng 3, 06/09/2026):
--
-- 1. push_subscriptions.SELECT policy hiện tại là `using (true)` cho role
--    `public` — BẤT KỲ AI cầm anon key (key public, nhúng sẵn trong code
--    client, ai cũng lấy được) ĐỌC ĐƯỢC TOÀN BỘ endpoint/p256dh/auth_key
--    (khoá đẩy thật) của CẢ CÔNG TY qua PostgREST. Cầm được các khoá này là
--    giả mạo server gửi push tuỳ ý cho bất kỳ nhân viên nào.
-- 2. INSERT/DELETE trên push_subscriptions chỉ check `auth.role()='authenticated'`
--    — KHÔNG check staff_id — nghĩa là 1 nhân viên đăng nhập bất kỳ chèn/xoá
--    được subscription của NGƯỜI KHÁC.
-- 3. notify_push/notify_push_multi là PUBLIC EXECUTE (mặc định của Postgres
--    cho function không revoke) — anon gọi thẳng qua PostgREST RPC được,
--    tự bắn push tuỳ ý nội dung/người nhận mà không cần qua chat_messages.
--
-- Sửa: RLS đúng cho push_subscriptions (mỗi người chỉ đọc/sửa/xoá đúng dòng
-- của mình; service_role trong api/send-push.js bỏ qua RLS nên vẫn đọc được
-- hết như cũ). Thu hồi PUBLIC execute trên notify_push/notify_push_multi —
-- chỉ trigger SECURITY DEFINER mới gọi được. notify_push_multi gửi kèm
-- header x-push-secret để api/send-push.js xác thực yêu cầu tới từ DB thật
-- (đi cùng: thêm PUSH_API_SECRET trên Vercel + code check trong
-- api/send-push.js — xem CHAT_FEATURE_CODE.md).
--
-- LƯU Ý: `app.push_secret` (khoá bí mật dùng chung với PUSH_API_SECRET bên
-- Vercel) KHÔNG đặt trong migration này — không để secret thật lọt vào lịch
-- sử git. Chạy riêng 1 lần, KHÔNG lưu file, ngay sau khi apply migration này
-- (giá trị phải khớp CHÍNH XÁC với PUSH_API_SECRET đã lưu trên Vercel):
--   alter database postgres set app.push_secret = '<giá trị PUSH_API_SECRET thật>';
begin;
set local lock_timeout = '10s';
set local statement_timeout = '30s';

drop policy if exists "server reads push_subscriptions" on public.push_subscriptions;
drop policy if exists "authenticated insert own push_subscriptions" on public.push_subscriptions;
drop policy if exists "authenticated delete own push_subscriptions" on public.push_subscriptions;

create policy "own push_subscriptions select" on public.push_subscriptions
  for select to authenticated
  using (staff_id = auth.uid());

create policy "own push_subscriptions insert" on public.push_subscriptions
  for insert to authenticated
  with check (staff_id = auth.uid());

create policy "own push_subscriptions delete" on public.push_subscriptions
  for delete to authenticated
  using (staff_id = auth.uid());

-- Không cho anon đụng bảng này ở bất kỳ thao tác nào (trước đây SELECT mở
-- toang cho public bao gồm cả anon).
revoke all on public.push_subscriptions from anon;

revoke all on function public.notify_push(text, text, text, uuid) from public, anon, authenticated;
revoke all on function public.notify_push_multi(text, text, text, uuid[]) from public, anon, authenticated;

create or replace function public.notify_push(p_title text, p_body text, p_url text default '/', p_staff_id uuid default null)
returns void language plpgsql as $$
begin
  perform net.http_post(
    url := 'https://sumibakery.shop/api/send-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-push-secret', current_setting('app.push_secret', true)
    ),
    body := jsonb_build_object('title', p_title, 'body', p_body, 'url', p_url, 'staffId', p_staff_id),
    timeout_milliseconds := 8000
  );
exception when others then
  raise warning 'notify_push failed: %', SQLERRM;
end;
$$;

create or replace function public.notify_push_multi(p_title text, p_body text, p_url text, p_staff_ids uuid[], p_tag text default null)
returns void language plpgsql as $$
begin
  if p_staff_ids is null or array_length(p_staff_ids, 1) is null then return; end if;
  perform net.http_post(
    url := 'https://sumibakery.shop/api/send-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-push-secret', current_setting('app.push_secret', true)
    ),
    body := jsonb_build_object('title', p_title, 'body', p_body, 'url', p_url,
                               'staffIds', to_jsonb(p_staff_ids), 'tag', p_tag),
    timeout_milliseconds := 8000
  );
exception when others then
  raise warning 'notify_push_multi failed: %', SQLERRM;
end;
$$;

-- Cập nhật trigger chat để gửi kèm tag riêng theo phòng (đã tự hoạt động từ
-- trước qua url-fallback trong sw.js, nhưng đặt tường minh cho rõ ràng).
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

  v_title := case
    when v_room.room_type = 'direct' then coalesce(v_sender_name, 'Tin nhắn mới')
    else coalesce(v_sender_name, 'Ai đó') || ' @ ' || coalesce(v_room.name, 'Nhóm chat')
  end;

  perform public.notify_push_multi(v_title, left(v_body, 160), '/messenger/' || new.room_id, v_recipients, 'chat-' || new.room_id);
  return new;
end;
$$;

insert into public.migration_runs(migration_key, status, finished_at, notes)
values('202609061800_chat_push_security_hardening', 'completed', now(),
  'Va 3 lo hong bao mat that: push_subscriptions RLS mo toang cho anon doc/sua/xoa bat ky dong nao -> gio chi cho tu doc/sua/xoa dong cua chinh minh; notify_push/notify_push_multi tu PUBLIC EXECUTE (anon goi thang qua) -> revoke het, chi trigger goi duoc; them x-push-secret header xac thuc api/send-push.js.')
on conflict(migration_key) do update set status='completed', finished_at=now(), notes=excluded.notes;

commit;
