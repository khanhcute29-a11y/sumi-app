-- Chuông báo (push notification) hiện tại chỉ được kích hoạt từ
-- useOrderNotifications.js — một React hook lắng nghe Supabase Realtime
-- và gọi /api/send-push. Hook này CHỈ chạy khi có người đang mở app
-- (tab trình duyệt còn sống). Hệ quả:
--   - Ai không mở app lúc đó thì không hề có request gửi push nào được
--     tạo ra, dù họ đã bật "Nhận thông báo" trong Cài đặt — không phải
--     lỗi gửi thất bại, mà lỗi là không ai gọi gửi.
--   - Nếu 2-3 người đang mở app cùng lúc, mỗi người gọi 1 lần → mọi
--     thiết bị nhận trùng 2-3 thông báo cho cùng 1 sự kiện.
-- Fix: chuyển việc kích hoạt sang phía server — trigger Postgres gọi
-- thẳng /api/send-push qua pg_net ngay khi có đơn/ghi chú/sự cố mới,
-- không phụ thuộc có ai đang mở app hay không.
begin;

create extension if not exists pg_net with schema extensions;

create or replace function public.notify_push(p_title text, p_body text, p_url text default '/')
returns void language plpgsql as $$
begin
  perform net.http_post(
    url := 'https://sumibakery.shop/api/send-push',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := jsonb_build_object('title', p_title, 'body', p_body, 'url', p_url),
    timeout_milliseconds := 8000
  );
exception when others then
  -- Không để lỗi gửi push (mạng, timeout...) làm hỏng giao dịch tạo đơn/ghi chú gốc
  raise warning 'notify_push failed: %', SQLERRM;
end;
$$;

-- 1. Đơn hàng mới
create or replace function public.trg_notify_new_order()
returns trigger language plpgsql as $$
begin
  perform public.notify_push('🔔 Đơn hàng mới', 'Mã đơn ' || coalesce(new.order_code, '') || ' vừa được tạo.', '/');
  return new;
end;
$$;

drop trigger if exists notify_new_order on public.orders;
create trigger notify_new_order
  after insert on public.orders
  for each row execute function public.trg_notify_new_order();

-- 2. Đơn hàng hoàn thành (cả cờ status cũ 'hoan_thanh' lẫn status_v2 'completed')
create or replace function public.trg_notify_order_completed()
returns trigger language plpgsql as $$
begin
  if (new.status = 'hoan_thanh' and coalesce(old.status, '') <> 'hoan_thanh')
     or (new.status_v2 = 'completed' and coalesce(old.status_v2, '') <> 'completed') then
    perform public.notify_push('✅ Giao hàng hoàn thành', 'Đơn ' || coalesce(new.order_code, '') || ' đã giao xong.', '/');
  end if;
  return new;
end;
$$;

drop trigger if exists notify_order_completed on public.orders;
create trigger notify_order_completed
  after update on public.orders
  for each row execute function public.trg_notify_order_completed();

-- 3. Ghi chú đơn hàng mới
create or replace function public.trg_notify_order_note()
returns trigger language plpgsql as $$
declare
  v_code text;
begin
  select order_code into v_code from public.orders where id = new.order_id;
  perform public.notify_push(
    '💬 Ghi chú đơn hàng mới',
    coalesce(new.author_name, 'Nhân viên') || ' vừa ghi chú đơn ' || coalesce(v_code, '') || ': ' || coalesce(new.message, ''),
    '/'
  );
  return new;
end;
$$;

drop trigger if exists notify_order_note on public.order_notes;
create trigger notify_order_note
  after insert on public.order_notes
  for each row execute function public.trg_notify_order_note();

-- 4. Báo sự cố mới
create or replace function public.trg_notify_incident_report()
returns trigger language plpgsql as $$
begin
  perform public.notify_push(
    '⚠ Báo sự cố mới',
    coalesce(new.reporter_name, 'Nhân viên') || ' báo ' || coalesce(new.code, '') || ' - ' || coalesce(new.label, ''),
    '/'
  );
  return new;
end;
$$;

drop trigger if exists notify_incident_report on public.incident_reports;
create trigger notify_incident_report
  after insert on public.incident_reports
  for each row execute function public.trg_notify_incident_report();

insert into public.migration_runs(migration_key, status, finished_at, notes)
values('202608260015_server_side_push_notifications', 'completed', now(),
  'Push notifications (chuông) now fire from Postgres triggers via pg_net -> /api/send-push, independent of any client having the app open. Previously only fired from a client-side realtime listener, so staff without the app open never got notified.')
on conflict(migration_key) do update set status='completed', finished_at=now(), notes=excluded.notes;

commit;
