-- Mở rộng chuông (push notification) sang 2 nơi nữa, theo cùng cơ chế server-side
-- trigger đã dùng cho đơn hàng (M-202608260015) — không phụ thuộc ai đang mở app:
--   1. Bảng tin: có bài đăng "announcement" mới -> chuông cho toàn công ty.
--   2. Giao việc: có người được giao task mới (bảng tasks, dùng chung cho cả
--      giao việc bếp lẫn Quản Lý Công Việc) -> chuông CHỈ cho đúng người được giao,
--      không phải toàn công ty.
begin;

-- notify_push giờ nhận thêm p_staff_id (mặc định null = gửi toàn công ty như cũ)
create or replace function public.notify_push(p_title text, p_body text, p_url text default '/', p_staff_id uuid default null)
returns void language plpgsql as $$
begin
  perform net.http_post(
    url := 'https://sumibakery.shop/api/send-push',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := jsonb_build_object('title', p_title, 'body', p_body, 'url', p_url, 'staffId', p_staff_id),
    timeout_milliseconds := 8000
  );
exception when others then
  raise warning 'notify_push failed: %', SQLERRM;
end;
$$;

-- 1. Bảng tin: thông báo mới
create or replace function public.trg_notify_new_feed_post()
returns trigger language plpgsql as $$
begin
  if new.post_type = 'announcement' then
    perform public.notify_push(
      '📢 ' || coalesce(new.title, 'Thông báo mới'),
      left(coalesce(new.body, ''), 120),
      '/feed'
    );
  end if;
  return new;
end;
$$;

drop trigger if exists notify_new_feed_post on public.company_feed_posts;
create trigger notify_new_feed_post
  after insert on public.company_feed_posts
  for each row execute function public.trg_notify_new_feed_post();

-- 2. Giao việc: có người được giao task mới — chỉ báo đúng người đó
create or replace function public.trg_notify_task_assigned()
returns trigger language plpgsql as $$
begin
  perform public.notify_push(
    '✅ Việc mới được giao',
    coalesce(new.title, 'Bạn có việc mới cần làm'),
    '/tasks',
    new.assignee_id
  );
  return new;
end;
$$;

drop trigger if exists notify_task_assigned on public.tasks;
create trigger notify_task_assigned
  after insert on public.tasks
  for each row execute function public.trg_notify_task_assigned();

insert into public.migration_runs(migration_key, status, finished_at, notes)
values('202608260021_push_for_feed_and_tasks', 'completed', now(),
  'Server-side push now also fires for new Bảng tin announcements (company-wide) and new task assignments (targeted to the assignee only via push_subscriptions.staff_id). notify_push() gained an optional p_staff_id param for targeted sends; /api/send-push.js filters by staffId when provided.')
on conflict(migration_key) do update set status='completed', finished_at=now(), notes=excluded.notes;

commit;
