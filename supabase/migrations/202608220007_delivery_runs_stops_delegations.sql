-- SUMI APP M07 — delivery runs, stops, GPS evidence and approved delegation.

begin;

create table if not exists public.delivery_runs (
  id uuid primary key default gen_random_uuid(),
  run_code text not null unique,
  assigned_driver_id uuid references public.profiles(id) on delete set null,
  assigned_by uuid references public.profiles(id) on delete set null,
  status text not null default 'planned' check(status in ('planned','accepted','loading','in_transit','completed','cancelled')),
  started_at timestamptz,
  completed_at timestamptz,
  start_lat numeric,
  start_lng numeric,
  end_lat numeric,
  end_lng numeric,
  distance_km numeric check(distance_km is null or distance_km>=0),
  distance_source text check(distance_source is null or distance_source in ('gps','planned','manual_approved','legacy_unknown')),
  planned_origin_lat numeric,
  planned_origin_lng numeric,
  planned_destination_lat numeric,
  planned_destination_lng numeric,
  planned_distance_km numeric check(planned_distance_km is null or planned_distance_km>=0),
  created_at timestamptz not null default now(),
  version integer not null default 1,
  legacy_source_key text unique
);

create table if not exists public.delivery_stops (
  id uuid primary key default gen_random_uuid(),
  delivery_run_id uuid not null references public.delivery_runs(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete restrict,
  sequence_no integer not null check(sequence_no>0),
  status text not null default 'pending' check(status in ('pending','arrived','delivered','failed','cancelled')),
  arrived_at timestamptz,
  delivered_at timestamptz,
  recipient_name text,
  proof_attachment_id uuid references public.order_attachments(id) on delete set null,
  failure_reason text,
  destination_address text,
  destination_lat numeric,
  destination_lng numeric,
  unique(delivery_run_id,sequence_no),
  unique(delivery_run_id,order_id)
);

create table if not exists public.delivery_delegations (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  delegate_profile_id uuid not null references public.profiles(id) on delete restrict,
  requested_by uuid not null references public.profiles(id) on delete restrict,
  requested_at timestamptz not null default now(),
  approved_by uuid references public.profiles(id) on delete set null,
  approved_at timestamptz,
  valid_from timestamptz not null default now(),
  valid_to timestamptz,
  reason text not null,
  status text not null default 'pending' check(status in ('pending','approved','rejected','revoked','completed')),
  check(valid_to is null or valid_to>valid_from)
);

create index if not exists idx_delivery_runs_driver_status on public.delivery_runs(assigned_driver_id,status);
create index if not exists idx_delivery_stops_order on public.delivery_stops(order_id,status);
create unique index if not exists uniq_active_delivery_delegation on public.delivery_delegations(order_id,delegate_profile_id)
 where status in ('pending','approved');

-- Preserve legacy delivery history without guessing profile identity from a display name.
insert into public.delivery_runs(run_code,status,started_at,completed_at,start_lat,start_lng,end_lat,end_lng,distance_source,legacy_source_key)
select 'LEGACY-'||coalesce(nullif(o.order_code,''),upper(substr(md5(o.id::text),1,10))),
 case when o.status='hoan_thanh' then 'completed' else 'in_transit' end,
 null,o.completed_at,o.pickup_lat,o.pickup_lng,o.delivery_lat,o.delivery_lng,'legacy_unknown','legacy:order:'||o.id
from public.orders o where o.status in ('dang_giao','hoan_thanh') and nullif(o.shipper_staff_name,'') is not null
on conflict(legacy_source_key) do nothing;

insert into public.delivery_stops(delivery_run_id,order_id,sequence_no,status,delivered_at,proof_attachment_id,destination_address,destination_lat,destination_lng)
select r.id,o.id,1,case when o.status='hoan_thanh' then 'delivered' else 'pending' end,o.completed_at,a.id,o.address,o.delivery_lat,o.delivery_lng
from public.orders o join public.delivery_runs r on r.legacy_source_key='legacy:order:'||o.id
left join public.order_attachments a on a.legacy_source_key='legacy:orders:'||o.id||':delivery_photo_url'
on conflict(delivery_run_id,order_id) do nothing;

insert into public.migration_anomalies(anomaly_key,source_table,source_id,anomaly_code,severity,details)
select 'legacy-driver:'||o.id,'orders',o.id::text,'LEGACY_DRIVER_PROFILE_UNRESOLVED','warning',jsonb_build_object('shipper_name',o.shipper_staff_name)
from public.orders o join public.delivery_runs r on r.legacy_source_key='legacy:order:'||o.id
where r.assigned_driver_id is null
on conflict(anomaly_key) do nothing;

alter table public.delivery_runs enable row level security;
alter table public.delivery_stops enable row level security;
alter table public.delivery_delegations enable row level security;

drop policy if exists "delivery participants read runs" on public.delivery_runs;
create policy "delivery participants read runs" on public.delivery_runs for select to authenticated using(
 public.is_business_director() or assigned_driver_id=auth.uid() or exists(select 1 from public.profile_assignments pa
 join public.organization_units ou on ou.id=pa.unit_id where pa.profile_id=auth.uid() and ou.code like 'TRANSPORT%' and pa.valid_to is null));
drop policy if exists "delivery participants read stops" on public.delivery_stops;
create policy "delivery participants read stops" on public.delivery_stops for select to authenticated using(
 exists(select 1 from public.delivery_runs r where r.id=delivery_run_id));
drop policy if exists "staff read own delegations" on public.delivery_delegations;
create policy "staff read own delegations" on public.delivery_delegations for select to authenticated using(
 delegate_profile_id=auth.uid() or requested_by=auth.uid() or public.is_business_director());
drop policy if exists "staff request delegation" on public.delivery_delegations;
create policy "staff request delegation" on public.delivery_delegations for insert to authenticated with check(
 requested_by=auth.uid() and status='pending' and public.is_approved());
drop policy if exists "director approves delegation" on public.delivery_delegations;
create policy "director approves delegation" on public.delivery_delegations for update to authenticated
 using(public.is_business_director()) with check(public.is_business_director());

revoke all on public.delivery_runs,public.delivery_stops,public.delivery_delegations from anon;
grant select on public.delivery_runs,public.delivery_stops,public.delivery_delegations to authenticated;
grant insert on public.delivery_delegations to authenticated;

insert into public.migration_runs(migration_key,status,finished_at,notes)
values('202608220007_delivery_runs_stops_delegations','completed',now(),'Created delivery runs, multi-stop tracking, GPS fields and director-approved delivery delegation.')
on conflict(migration_key) do update set status='completed',finished_at=now(),notes=excluded.notes;

commit;
