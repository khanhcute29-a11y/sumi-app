-- Add staff assignment tracking to work packages

begin;

-- Add columns to track who staff member is assigned and who completes
alter table public.order_work_packages
add column if not exists assigned_to_staff_id uuid,
add column if not exists assigned_to_staff_name text,
add column if not exists assigned_at timestamp,
add column if not exists completed_by_staff_id uuid,
add column if not exists completed_by_staff_name text;

-- Log migration
insert into public.migration_runs(migration_key, status, finished_at, notes)
values('202608260005_add_staff_to_work_packages', 'completed', now(), 'Add staff assignment tracking columns to order_work_packages')
on conflict(migration_key) do update set status='completed', finished_at=now();

commit;
