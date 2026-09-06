-- `alter database postgres set app.push_secret = ...` bị Supabase hosted từ
-- chối (permission denied to set parameter) — kết nối qua pooler không có
-- quyền superuser cần thiết. Thay bằng 1 bảng riêng cực nhỏ trong schema
-- `private` (PostgREST mặc định KHÔNG expose schema này ra REST API — lớp
-- bảo vệ thứ nhất) + RLS bật nhưng KHÔNG có policy nào (lớp bảo vệ thứ hai:
-- chặn mọi role thường kể cả nếu schema lỡ bị expose sau này) — chỉ hàm
-- SECURITY DEFINER (notify_push/notify_push_multi) mới đọc được, vì hàm đó
-- chạy với quyền của người TẠO hàm, bỏ qua RLS hoàn toàn — y hệt cách
-- is_chat_room_participant() đã dùng cho chat.
begin;
set local lock_timeout = '10s';
set local statement_timeout = '30s';

create schema if not exists private;

create table if not exists private.app_secrets (
  key text primary key,
  value text not null
);

alter table private.app_secrets enable row level security;
revoke all on private.app_secrets from public, anon, authenticated;
revoke all on schema private from public, anon, authenticated;

create or replace function private.get_push_secret()
returns text language sql stable security definer set search_path = private as $$
  select value from private.app_secrets where key = 'push_secret';
$$;

create or replace function public.notify_push(p_title text, p_body text, p_url text default '/', p_staff_id uuid default null)
returns void language plpgsql as $$
begin
  perform net.http_post(
    url := 'https://sumibakery.shop/api/send-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-push-secret', private.get_push_secret()
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
      'x-push-secret', private.get_push_secret()
    ),
    body := jsonb_build_object('title', p_title, 'body', p_body, 'url', p_url,
                               'staffIds', to_jsonb(p_staff_ids), 'tag', p_tag),
    timeout_milliseconds := 8000
  );
exception when others then
  raise warning 'notify_push_multi failed: %', SQLERRM;
end;
$$;

insert into public.migration_runs(migration_key, status, finished_at, notes)
values('202609061810_chat_push_secret_storage', 'completed', now(),
  'ALTER DATABASE SET bi Supabase hosted tu choi quyen -> thay bang bang private.app_secrets (schema rieng khong expose PostgREST + RLS bat khong policy) + ham private.get_push_secret() SECURITY DEFINER doc gia tri, dung trong notify_push/notify_push_multi thay cho current_setting().')
on conflict(migration_key) do update set status='completed', finished_at=now(), notes=excluded.notes;

commit;
