-- SUMI APP M12 — seven-day hot storage lifecycle and verified backup queue.

begin;

create table if not exists public.attachment_backup_attempts (
  id bigint generated always as identity primary key,
  attachment_id uuid not null references public.order_attachments(id) on delete cascade,
  attempted_at timestamptz not null default now(),
  status text not null check(status in ('started','verified','failed','cleanup_completed')),
  error_message text,
  drive_file_id text,
  checksum text
);
create index if not exists idx_attachment_backup_attempts_attachment on public.attachment_backup_attempts(attachment_id,attempted_at desc);
alter table public.attachment_backup_attempts enable row level security;

create or replace view public.attachments_due_for_backup
with (security_invoker=true) as
select a.id,a.order_id,a.storage_path,a.legacy_storage_url,a.checksum,a.size_bytes,a.hot_storage_expires_at,
 a.backup_status,o.order_code,o.confidentiality
from public.order_attachments a join public.orders o on o.id=a.order_id
where a.backup_status in ('pending','failed') and a.hot_storage_expires_at<=now()+interval '24 hours';

revoke all on public.attachment_backup_attempts,public.attachments_due_for_backup from public,anon,authenticated;
grant select,insert,update on public.attachment_backup_attempts to service_role;
grant select on public.attachments_due_for_backup to service_role;
grant select,update on public.order_attachments to service_role;

insert into public.migration_runs(migration_key,status,finished_at,notes)
values('202608220012_attachment_backup_lifecycle','completed',now(),'Added seven-day backup queue; hot files may be cleaned only after Drive verification.')
on conflict(migration_key) do update set status='completed',finished_at=now(),notes=excluded.notes;
commit;
