-- Employee Overview V4 (src/components/mockups/EmployeeDashboard/EmployeeOverviewV4.jsx)
-- đang hiển thị "Vi phạm", "Thưởng nóng" và "Báo cáo cuối ca" bằng mock data —
-- không có bảng nào backing 3 phần này. (`reports`/createReport() trong queries.js
-- gọi bảng public.reports nhưng bảng đó CHƯA TỪNG được migrate — đã rà toàn bộ
-- supabase/migrations/*.sql, không có `create table ... reports` nào cả — nên
-- không thể tái dùng, phải tạo bảng riêng cho báo cáo cuối ca.)
begin;

create table if not exists public.staff_shift_reports (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.profiles(id) on delete cascade,
  staff_name text,
  work_date date not null default current_date,
  revenue numeric not null default 0,
  stock_remaining int,
  cash_handover numeric not null default 0,
  note text,
  created_at timestamptz not null default now()
);

create index if not exists idx_staff_shift_reports_staff on public.staff_shift_reports(staff_id, work_date desc);

alter table public.staff_shift_reports enable row level security;

drop policy if exists "read own or payroll shift reports" on public.staff_shift_reports;
create policy "read own or payroll shift reports" on public.staff_shift_reports
  for select using (staff_id = auth.uid() or public.is_payroll_manager());

drop policy if exists "staff submits own shift report" on public.staff_shift_reports;
create policy "staff submits own shift report" on public.staff_shift_reports
  for insert with check (staff_id = auth.uid());

revoke all on public.staff_shift_reports from anon, authenticated;
grant select, insert on public.staff_shift_reports to authenticated;

create table if not exists public.staff_violations (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  description text,
  penalty_amount numeric not null default 0,
  occurred_on date not null default current_date,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.staff_rewards (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  amount numeric not null default 0,
  awarded_on date not null default current_date,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_staff_violations_staff on public.staff_violations(staff_id, occurred_on desc);
create index if not exists idx_staff_rewards_staff on public.staff_rewards(staff_id, awarded_on desc);

alter table public.staff_violations enable row level security;
alter table public.staff_rewards enable row level security;

-- Nhân viên tự xem của mình; quản lý lương (đã có sẵn is_payroll_manager() từ
-- migration salary_advance_requests) xem + ghi được cho mọi người, vì đây cũng
-- là dữ liệu ảnh hưởng tới lương/thưởng.
drop policy if exists "read own or payroll violations" on public.staff_violations;
create policy "read own or payroll violations" on public.staff_violations
  for select using (staff_id = auth.uid() or public.is_payroll_manager());

drop policy if exists "payroll manager writes violations" on public.staff_violations;
create policy "payroll manager writes violations" on public.staff_violations
  for insert with check (public.is_payroll_manager());

drop policy if exists "payroll manager updates violations" on public.staff_violations;
create policy "payroll manager updates violations" on public.staff_violations
  for update using (public.is_payroll_manager());

drop policy if exists "payroll manager deletes violations" on public.staff_violations;
create policy "payroll manager deletes violations" on public.staff_violations
  for delete using (public.is_payroll_manager());

drop policy if exists "read own or payroll rewards" on public.staff_rewards;
create policy "read own or payroll rewards" on public.staff_rewards
  for select using (staff_id = auth.uid() or public.is_payroll_manager());

drop policy if exists "payroll manager writes rewards" on public.staff_rewards;
create policy "payroll manager writes rewards" on public.staff_rewards
  for insert with check (public.is_payroll_manager());

drop policy if exists "payroll manager updates rewards" on public.staff_rewards;
create policy "payroll manager updates rewards" on public.staff_rewards
  for update using (public.is_payroll_manager());

drop policy if exists "payroll manager deletes rewards" on public.staff_rewards;
create policy "payroll manager deletes rewards" on public.staff_rewards
  for delete using (public.is_payroll_manager());

revoke all on public.staff_violations, public.staff_rewards from anon, authenticated;
grant select, insert, update, delete on public.staff_violations, public.staff_rewards to authenticated;

insert into public.migration_runs(migration_key, status, finished_at, notes)
values('202608260150_staff_violations_rewards_shift_reports', 'completed', now(),
  'Added staff_violations, staff_rewards, and staff_shift_reports tables (self-read + payroll-manager read/write via existing is_payroll_manager()) — backing the "Vi phạm", "Thưởng", and "Báo cáo cuối ca" tiles in EmployeeOverviewV4, which previously had no real data source in the app (reports/createReport() in queries.js referenced a public.reports table that was never actually migrated).')
on conflict(migration_key) do update set status='completed', finished_at=now(), notes=excluded.notes;

commit;
