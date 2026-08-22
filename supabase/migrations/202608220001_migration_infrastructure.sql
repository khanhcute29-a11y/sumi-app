-- SUMI APP M01 — migration infrastructure
-- Additive and safe to re-run. Does not mutate operational data.

begin;

create table if not exists public.migration_runs (
  id uuid primary key default gen_random_uuid(),
  migration_key text not null unique,
  status text not null default 'running'
    check (status in ('running', 'completed', 'failed', 'rolled_forward')),
  checksum text,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  row_counts jsonb not null default '{}'::jsonb,
  notes text,
  error_detail text
);

create table if not exists public.migration_anomalies (
  id bigint generated always as identity primary key,
  migration_run_id uuid references public.migration_runs(id) on delete set null,
  anomaly_key text not null unique,
  source_table text not null,
  source_id text,
  anomaly_code text not null,
  severity text not null default 'warning'
    check (severity in ('info', 'warning', 'blocker')),
  details jsonb not null default '{}'::jsonb,
  detected_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references public.profiles(id) on delete set null,
  resolution_note text
);

create table if not exists public.backfill_checkpoints (
  id uuid primary key default gen_random_uuid(),
  backfill_key text not null unique,
  migration_run_id uuid references public.migration_runs(id) on delete set null,
  status text not null default 'pending'
    check (status in ('pending', 'running', 'completed', 'failed')),
  last_source_key text,
  processed_count bigint not null default 0,
  error_count bigint not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  started_at timestamptz,
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists idx_migration_anomalies_open
  on public.migration_anomalies (severity, detected_at desc)
  where resolved_at is null;

create index if not exists idx_backfill_checkpoints_status
  on public.backfill_checkpoints (status, updated_at desc);

create or replace function public.profile_has_legacy_role(required_roles text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    auth.uid() is not null and exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.approved = true
        and coalesce(p.active, true) = true
        and (
          p.role = any(required_roles)
          or coalesce(p.extra_roles, '{}'::text[]) && required_roles
        )
    ),
    false
  );
$$;

revoke all on function public.profile_has_legacy_role(text[]) from public, anon;
grant execute on function public.profile_has_legacy_role(text[]) to authenticated;

alter table public.migration_runs enable row level security;
alter table public.migration_anomalies enable row level security;
alter table public.backfill_checkpoints enable row level security;

drop policy if exists "migration metadata read by directors" on public.migration_runs;
create policy "migration metadata read by directors"
  on public.migration_runs for select
  to authenticated
  using (public.profile_has_legacy_role(array['owner', 'admin']));

drop policy if exists "migration anomalies read by directors" on public.migration_anomalies;
create policy "migration anomalies read by directors"
  on public.migration_anomalies for select
  to authenticated
  using (public.profile_has_legacy_role(array['owner', 'admin']));

drop policy if exists "backfill checkpoints read by directors" on public.backfill_checkpoints;
create policy "backfill checkpoints read by directors"
  on public.backfill_checkpoints for select
  to authenticated
  using (public.profile_has_legacy_role(array['owner', 'admin']));

revoke insert, update, delete on public.migration_runs from authenticated;
revoke insert, update, delete on public.migration_anomalies from authenticated;
revoke insert, update, delete on public.backfill_checkpoints from authenticated;

insert into public.migration_runs (
  migration_key, status, finished_at, notes
)
values (
  '202608220001_migration_infrastructure',
  'completed',
  now(),
  'Created migration run, anomaly and checkpoint infrastructure.'
)
on conflict (migration_key) do update
set status = 'completed',
    finished_at = coalesce(public.migration_runs.finished_at, excluded.finished_at),
    notes = excluded.notes;

commit;
