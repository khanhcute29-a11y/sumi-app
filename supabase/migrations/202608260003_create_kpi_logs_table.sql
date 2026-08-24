-- Create kpi_logs table for KPI tracking (delivery, production, etc.)

begin;

create table if not exists public.kpi_logs (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references public.orders(id),
  staff_id uuid,
  staff_name text,
  event_type text,
  gps_latitude numeric,
  gps_longitude numeric,
  photo_url text,
  notes text,
  created_at timestamp default now()
);

create index if not exists idx_kpi_logs_order_id on public.kpi_logs(order_id);
create index if not exists idx_kpi_logs_event_type on public.kpi_logs(event_type);

-- Enable RLS
alter table public.kpi_logs enable row level security;

-- Drop existing policy if it exists
drop policy if exists "Read kpi_logs" on public.kpi_logs;

-- Policy: authenticated can read
create policy "Read kpi_logs" on public.kpi_logs
  for select using (auth.role() = 'authenticated');

-- Log migration
insert into public.migration_runs(migration_key, status, finished_at, notes)
values('202608260003_create_kpi_logs_table', 'completed', now(), 'Create kpi_logs table for delivery KPI tracking')
on conflict(migration_key) do update set status='completed', finished_at=now();

commit;
