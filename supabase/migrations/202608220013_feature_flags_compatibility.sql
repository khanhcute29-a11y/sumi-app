-- SUMI APP M13 — staged cutover flags and compatibility read models.

begin;

create table if not exists public.feature_flags (
  key text primary key,
  enabled boolean not null default false,
  description text not null,
  rollout_percentage integer not null default 0 check(rollout_percentage between 0 and 100),
  allowed_profile_ids uuid[] not null default '{}',
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into public.feature_flags(key,enabled,description) values
 ('orders_v2_read',false,'Read order lists from V2 safe views'),
 ('orders_v2_write',false,'Create and mutate orders through V2 RPCs'),
 ('inventory_ledger_write',false,'Write inventory through V2 documents and ledger'),
 ('notifications_v2',false,'Use V2 inbox and sound cues'),
 ('school_lockdown',false,'Enforce restricted school-order UI'),
 ('delivery_v2',false,'Use delivery runs and stops'),
 ('kpi_v2',false,'Calculate KPI from events, tasks and shifts')
on conflict(key) do nothing;

alter table public.feature_flags enable row level security;
drop policy if exists "signed in read feature flags" on public.feature_flags;
create policy "signed in read feature flags" on public.feature_flags for select to authenticated using(true);
drop policy if exists "directors manage feature flags" on public.feature_flags;
create policy "directors manage feature flags" on public.feature_flags for all to authenticated
 using(public.is_business_director()) with check(public.is_business_director());

create or replace function public.is_feature_enabled(p_key text)
returns boolean language sql stable security definer set search_path=public as $$
 select coalesce((select enabled and (rollout_percentage=100 or auth.uid()=any(allowed_profile_ids))
  from public.feature_flags where key=p_key),false);
$$;
revoke all on function public.is_feature_enabled(text) from public,anon;
grant execute on function public.is_feature_enabled(text) to authenticated;

create or replace view public.orders_v1_compat
with (security_invoker=true) as
select o.*,
 case o.status_v2 when 'awaiting_assignment' then 'moi' when 'awaiting_acceptance' then 'moi'
  when 'in_production' then 'dang_lam' when 'ready_for_fulfillment' then 'cho_giao'
  when 'in_delivery' then 'dang_giao' when 'completed' then 'hoan_thanh' when 'cancelled' then 'huy'
  else o.status end as derived_legacy_status
from public.orders o;

create or replace view public.order_status_summary
with (security_invoker=true) as
select status_v2,count(*)::bigint as order_count,
 min(required_at) filter(where status_v2 not in ('completed','cancelled')) as nearest_required_at
from public.orders group by status_v2;

revoke all on public.feature_flags,public.orders_v1_compat,public.order_status_summary from anon;
grant select on public.feature_flags,public.orders_v1_compat,public.order_status_summary to authenticated;

insert into public.migration_runs(migration_key,status,finished_at,notes)
values('202608220013_feature_flags_compatibility','completed',now(),'Created opt-in cutover flags and compatibility views; all V2 flags default off.')
on conflict(migration_key) do update set status='completed',finished_at=now(),notes=excluded.notes;
commit;
