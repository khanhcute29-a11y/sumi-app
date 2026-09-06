-- api/send-push.js (sau vá P0.1) giờ TỪ CHỐI mọi yêu cầu không có staffId,
-- staffIds, hay broadcast:true — chặn lỗi "quên lọc thì gửi hết". Nhưng
-- notify_push() cũ (dùng cho Bảng tin — cố ý gửi TOÀN CÔNG TY khi
-- p_staff_id là null) chưa gửi kèm `broadcast:true`, nên sau khi deploy
-- code mới, mọi thông báo Bảng tin sẽ bị API từ chối (400) — vá NGAY trong
-- migration này, cùng lúc với P0.1, không để 2 thay đổi lệch pha nhau như
-- sự cố push-broadcast lần trước.
begin;
set local lock_timeout = '10s';
set local statement_timeout = '30s';

create or replace function public.notify_push(p_title text, p_body text, p_url text default '/', p_staff_id uuid default null)
returns void language plpgsql as $$
begin
  perform net.http_post(
    url := 'https://sumibakery.shop/api/send-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-push-secret', private.get_push_secret()
    ),
    body := case
      when p_staff_id is not null then jsonb_build_object('title', p_title, 'body', p_body, 'url', p_url, 'staffId', p_staff_id)
      else jsonb_build_object('title', p_title, 'body', p_body, 'url', p_url, 'broadcast', true)
    end,
    timeout_milliseconds := 8000
  );
exception when others then
  raise warning 'notify_push failed: %', SQLERRM;
end;
$$;

insert into public.migration_runs(migration_key, status, finished_at, notes)
values('202609061820_notify_push_broadcast_flag', 'completed', now(),
  'notify_push() gui kem broadcast:true khi p_staff_id la null (thong bao Bang tin toan cong ty) - dong bo voi api/send-push.js sau khi tu choi request khong co staffId/staffIds/broadcast.')
on conflict(migration_key) do update set status='completed', finished_at=now(), notes=excluded.notes;

commit;
