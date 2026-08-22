-- SUMI APP M21 - avatar, overtime approval and monthly payroll.

begin;

alter table public.profiles add column if not exists avatar_path text;

create or replace function public.is_payroll_manager()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.approved = true
      and p.active is distinct from false
      and (p.role in ('owner','admin','accountant') or p.extra_roles && array['owner','admin','accountant']::text[])
  );
$$;

revoke all on function public.is_payroll_manager() from public, anon;
grant execute on function public.is_payroll_manager() to authenticated;

create table if not exists public.overtime_requests (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.profiles(id) on delete cascade,
  work_date date not null default current_date,
  planned_minutes integer not null check (planned_minutes between 30 and 720),
  reason text not null,
  related_order_code text,
  status text not null default 'pending' check (status in ('pending','approved','rejected','cancelled')),
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists overtime_requests_employee_date_idx
  on public.overtime_requests(employee_id, work_date desc);

create table if not exists public.payroll_periods (
  id uuid primary key default gen_random_uuid(),
  period_month date not null unique check (period_month = date_trunc('month', period_month)::date),
  status text not null default 'draft' check (status in ('draft','review','locked')),
  note text,
  locked_by uuid references public.profiles(id) on delete set null,
  locked_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.payroll_entries (
  id uuid primary key default gen_random_uuid(),
  period_id uuid not null references public.payroll_periods(id) on delete cascade,
  employee_id uuid not null references public.profiles(id) on delete restrict,
  regular_minutes integer not null default 0 check (regular_minutes >= 0),
  overtime_minutes integer not null default 0 check (overtime_minutes >= 0),
  completed_tasks integer not null default 0 check (completed_tasks >= 0),
  output_quantity numeric(14,3) not null default 0 check (output_quantity >= 0),
  base_pay numeric(14,0) not null default 0,
  overtime_pay numeric(14,0) not null default 0,
  allowance numeric(14,0) not null default 0,
  kpi_bonus numeric(14,0) not null default 0,
  output_bonus numeric(14,0) not null default 0,
  delegation_bonus numeric(14,0) not null default 0,
  other_bonus numeric(14,0) not null default 0,
  advance_amount numeric(14,0) not null default 0,
  deduction_amount numeric(14,0) not null default 0,
  note text,
  prepared_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  unique(period_id, employee_id)
);

alter table public.overtime_requests enable row level security;
alter table public.payroll_periods enable row level security;
alter table public.payroll_entries enable row level security;

drop policy if exists "read own or manage overtime" on public.overtime_requests;
create policy "read own or manage overtime" on public.overtime_requests
  for select using (employee_id = auth.uid() or public.is_payroll_manager());

drop policy if exists "request own overtime" on public.overtime_requests;
create policy "request own overtime" on public.overtime_requests
  for insert with check (employee_id = auth.uid() and status = 'pending' and public.is_approved());

drop policy if exists "manage overtime" on public.overtime_requests;
create policy "manage overtime" on public.overtime_requests
  for update using (public.is_payroll_manager()) with check (public.is_payroll_manager());

drop policy if exists "read visible payroll periods" on public.payroll_periods;
create policy "read visible payroll periods" on public.payroll_periods
  for select using (status = 'locked' or public.is_payroll_manager());

drop policy if exists "manage payroll periods" on public.payroll_periods;
create policy "manage payroll periods" on public.payroll_periods
  for all using (public.is_payroll_manager()) with check (public.is_payroll_manager());

drop policy if exists "read own locked payroll or manage" on public.payroll_entries;
create policy "read own locked payroll or manage" on public.payroll_entries
  for select using (
    public.is_payroll_manager()
    or (
      employee_id = auth.uid()
      and exists (select 1 from public.payroll_periods p where p.id = period_id and p.status = 'locked')
    )
  );

drop policy if exists "manage payroll entries" on public.payroll_entries;
create policy "manage payroll entries" on public.payroll_entries
  for all using (public.is_payroll_manager()) with check (public.is_payroll_manager());

insert into public.migration_runs(migration_key,status,finished_at,notes)
values('202608220021_mobile_attendance_overtime_payroll','completed',now(),'Avatar path, approved overtime requests and private monthly payroll.')
on conflict(migration_key) do update
set status='completed',finished_at=now(),notes=excluded.notes;

commit;
