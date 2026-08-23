-- SUMI APP M28 — exact leave date/time range.
begin;
alter table public.shift_logs add column if not exists leave_from_at timestamptz;
alter table public.shift_logs add column if not exists leave_to_at timestamptz;
alter table public.shift_logs drop constraint if exists shift_logs_leave_range_check;
alter table public.shift_logs add constraint shift_logs_leave_range_check check(leave_to_at is null or leave_from_at is null or leave_to_at >= leave_from_at);
create index if not exists idx_shift_logs_leave_from on public.shift_logs(leave_from_at) where type='leave_request';
insert into public.migration_runs(migration_key,status,finished_at,notes)
values('202608230028_leave_time_range','completed',now(),'Added exact start and end timestamps for leave requests.')
on conflict(migration_key) do update set status='completed',finished_at=now(),notes=excluded.notes;
commit;
