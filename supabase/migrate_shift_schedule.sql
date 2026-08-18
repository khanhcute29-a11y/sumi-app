-- Run manually in Supabase SQL Editor. Safe to re-run (idempotent).

create table if not exists shift_schedule (
  id uuid primary key default gen_random_uuid(),
  station text not null check (station in ('bakery','nong','lanh','xuong41','xuong42')),
  work_date date not null,
  shift_config_id uuid not null references shift_configs(id) on delete cascade,
  staff_id uuid not null references profiles(id) on delete cascade,
  staff_name text not null,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create unique index if not exists uniq_shift_schedule_bakery_single
  on shift_schedule (station, work_date, shift_config_id)
  where station = 'bakery';

create unique index if not exists uniq_shift_schedule_no_dup_staff
  on shift_schedule (station, work_date, shift_config_id, staff_id);

alter table shift_schedule enable row level security;

drop policy if exists "read shift_schedule" on shift_schedule;
create policy "read shift_schedule" on shift_schedule for select
  using (auth.role() = 'authenticated' and public.is_approved());

drop policy if exists "owner insert shift_schedule" on shift_schedule;
create policy "owner insert shift_schedule" on shift_schedule for insert
  with check (exists (select 1 from profiles where id = auth.uid() and role in ('owner','admin')));

drop policy if exists "owner delete shift_schedule" on shift_schedule;
create policy "owner delete shift_schedule" on shift_schedule for delete
  using (exists (select 1 from profiles where id = auth.uid() and role in ('owner','admin')));

alter table profiles add column if not exists station text
  check (station in ('bakery','nong','lanh','xuong41','xuong42'));

alter table approval_requests drop constraint if exists approval_requests_type_check;
alter table approval_requests add constraint approval_requests_type_check
  check (type in ('order_edit','order_cancel','order_delete','shift_recheck','leave_request'));

alter table approval_requests add column if not exists leave_date date;
