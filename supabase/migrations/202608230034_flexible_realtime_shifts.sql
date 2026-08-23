-- SUMI APP M34 — flexible realtime shift attendance, lunch break deduction, and start-time tracking
begin;

drop index if exists public.uniq_shift_checkin_per_shift;
drop index if exists public.uniq_shift_checkout_per_shift;
drop index if exists public.uniq_shift_checkin_per_day;
drop index if exists public.uniq_shift_checkout_per_day;

-- Cho phép nhân viên chấm công nhiều ca linh hoạt trong ngày
create index if not exists idx_shift_logs_staff_work_date on public.shift_logs(staff_id, work_date, type);

insert into public.migration_runs(migration_key,status,finished_at,notes)
values('202608230034_flexible_realtime_shifts','completed',now(),'Flexible realtime attendance without fixed morning/afternoon/night shifts, supporting lunch break 11:30-12:30.')
on conflict(migration_key) do update set status='completed',finished_at=now(),notes=excluded.notes;

commit;
