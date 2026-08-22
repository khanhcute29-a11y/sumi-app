-- SUMI APP M08 — domain event timeline, actionable notifications and incidents.

begin;

create table if not exists public.domain_events (
  id bigint generated always as identity primary key,
  event_type text not null,
  entity_type text not null,
  entity_id uuid not null,
  actor_id uuid references public.profiles(id) on delete set null,
  actor_role text,
  actor_unit_id uuid references public.organization_units(id) on delete set null,
  occurred_at timestamptz not null default now(),
  payload jsonb not null default '{}'::jsonb,
  correlation_id uuid not null default gen_random_uuid(),
  idempotency_key text not null unique,
  confidentiality text not null default 'normal'
    check(confidentiality in ('normal','school_restricted')),
  check(not (payload ?| array['price','unit_price','total','total_amount','deposit','paid_amount','ship_fee','shipping_amount']))
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  event_key text not null unique,
  recipient_profile_id uuid references public.profiles(id) on delete cascade,
  recipient_unit_id uuid references public.organization_units(id) on delete cascade,
  recipient_role text,
  notification_type text not null,
  severity text not null default 'info' check(severity in ('info','warning','urgent')),
  sound_key text not null default 'ting' check(sound_key in ('new_order_voice','cash_complete','ting','silent')),
  title text not null,
  body text not null,
  entity_type text not null,
  entity_id uuid not null,
  deep_link text not null,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  acknowledged_at timestamptz,
  check(num_nonnulls(recipient_profile_id,recipient_unit_id,recipient_role)=1)
);

create table if not exists public.incidents_v2 (
  id uuid primary key default gen_random_uuid(),
  incident_code text not null unique,
  entity_type text not null,
  entity_id uuid not null,
  category text not null,
  severity text not null default 'medium' check(severity in ('low','medium','high','critical')),
  status text not null default 'open' check(status in ('open','investigating','resolved','rejected')),
  reported_by uuid references public.profiles(id) on delete set null,
  reported_at timestamptz not null default now(),
  description text not null,
  cause text,
  resolution text,
  resolved_by uuid references public.profiles(id) on delete set null,
  resolved_at timestamptz,
  kpi_exclusion_reason text check(kpi_exclusion_reason is null or kpi_exclusion_reason in
    ('natural_disaster','government_policy','traffic','illness')),
  exclusion_approved_by uuid references public.profiles(id) on delete set null,
  exclusion_approved_at timestamptz,
  legacy_source_key text unique
);

create index if not exists idx_domain_events_entity_timeline on public.domain_events(entity_type,entity_id,occurred_at,id);
create index if not exists idx_notifications_profile_unread on public.notifications(recipient_profile_id,created_at desc) where read_at is null;
create index if not exists idx_notifications_unit_unread on public.notifications(recipient_unit_id,created_at desc) where read_at is null;
create index if not exists idx_incidents_open on public.incidents_v2(status,severity,reported_at) where status in ('open','investigating');

create or replace function public.prevent_domain_event_mutation()
returns trigger language plpgsql security definer set search_path=public as $$
begin raise exception 'domain_events is append-only'; end; $$;
revoke all on function public.prevent_domain_event_mutation() from public,anon,authenticated;
drop trigger if exists trg_domain_events_append_only on public.domain_events;
create trigger trg_domain_events_append_only before update or delete on public.domain_events
for each row execute function public.prevent_domain_event_mutation();

-- Reconstruct only facts that actually exist; do not invent intermediate timestamps.
insert into public.domain_events(event_type,entity_type,entity_id,occurred_at,payload,idempotency_key,confidentiality)
select 'order_created','order',o.id,o.created_at,
 jsonb_strip_nulls(jsonb_build_object('order_code',o.order_code,'order_type',o.order_type)),
 'legacy:order_created:'||o.id,o.confidentiality
from public.orders o on conflict(idempotency_key) do nothing;

insert into public.domain_events(event_type,entity_type,entity_id,occurred_at,payload,idempotency_key,confidentiality)
select case when o.status_v2='completed' then 'order_completed' when o.status_v2='cancelled' then 'order_cancelled' else 'order_current_status' end,
 'order',o.id,coalesce(case when o.status_v2='completed' then o.completed_at when o.status_v2='cancelled' then o.cancelled_at end,o.created_at),
 jsonb_strip_nulls(jsonb_build_object('status',o.status_v2,'legacy_status',o.legacy_status)),
 'legacy:order_status:'||o.id||':'||coalesce(o.status_v2,'unknown'),o.confidentiality
from public.orders o on conflict(idempotency_key) do nothing;

insert into public.incidents_v2(incident_code,entity_type,entity_id,category,severity,status,reported_by,reported_at,description,resolved_at,legacy_source_key)
select case
  when nullif(ir.code,'') is null then 'LEGACY-'||upper(substr(md5(ir.id::text),1,10))
  when count(*) over(partition by nullif(ir.code,'')) > 1 then ir.code||'-'||upper(substr(md5(ir.id::text),1,6))
  else ir.code end,
 case when ir.order_id is null then 'incident' else 'order' end,coalesce(ir.order_id,ir.id),ir.category,'medium',
 case when ir.status='resolved' then 'resolved' else 'open' end,ir.reporter_id,ir.created_at,
 coalesce(nullif(ir.note,''),ir.label),ir.resolved_at,'legacy:incident_reports:'||ir.id
from public.incident_reports ir on conflict(legacy_source_key) do nothing;

alter table public.domain_events enable row level security;
alter table public.notifications enable row level security;
alter table public.incidents_v2 enable row level security;

drop policy if exists "participants read domain timeline" on public.domain_events;
create policy "participants read domain timeline" on public.domain_events for select to authenticated using(
 public.is_approved() and (confidentiality<>'school_restricted' or public.is_business_director() or
  (entity_type='order' and exists(select 1 from public.order_work_packages wp join public.profile_assignments pa on pa.unit_id=wp.unit_id
   where wp.order_id=entity_id and pa.profile_id=auth.uid() and pa.position_code in ('kitchen_lead','kitchen_deputy') and pa.valid_to is null))));

drop policy if exists "recipients read notifications" on public.notifications;
create policy "recipients read notifications" on public.notifications for select to authenticated using(
 recipient_profile_id=auth.uid()
 or exists(select 1 from public.profile_assignments pa where pa.profile_id=auth.uid() and pa.unit_id=recipient_unit_id and pa.valid_to is null)
 or exists(select 1 from public.profiles p where p.id=auth.uid() and (p.role=recipient_role or recipient_role=any(p.extra_roles))));
drop policy if exists "recipients acknowledge notifications" on public.notifications;
create policy "recipients acknowledge notifications" on public.notifications for update to authenticated
 using(recipient_profile_id=auth.uid() or exists(select 1 from public.profile_assignments pa where pa.profile_id=auth.uid() and pa.unit_id=recipient_unit_id and pa.valid_to is null))
 with check(recipient_profile_id=auth.uid() or exists(select 1 from public.profile_assignments pa where pa.profile_id=auth.uid() and pa.unit_id=recipient_unit_id and pa.valid_to is null));

drop policy if exists "approved staff read incidents" on public.incidents_v2;
create policy "approved staff read incidents" on public.incidents_v2 for select to authenticated using(public.is_approved());
drop policy if exists "approved staff report incidents" on public.incidents_v2;
create policy "approved staff report incidents" on public.incidents_v2 for insert to authenticated with check(reported_by=auth.uid() and public.is_approved());
drop policy if exists "directors resolve incidents" on public.incidents_v2;
create policy "directors resolve incidents" on public.incidents_v2 for update to authenticated
 using(public.is_business_director()) with check(public.is_business_director());

revoke all on public.domain_events,public.notifications,public.incidents_v2 from anon;
grant select on public.domain_events,public.notifications,public.incidents_v2 to authenticated;
grant update(read_at,acknowledged_at) on public.notifications to authenticated;
grant insert on public.incidents_v2 to authenticated;
revoke insert,update,delete on public.domain_events from authenticated;
revoke insert,delete on public.notifications from authenticated;

insert into public.migration_runs(migration_key,status,finished_at,notes)
values('202608220008_events_notifications_incidents','completed',now(),'Created append-only timeline, actionable notifications with sound cues, and governed incidents.')
on conflict(migration_key) do update set status='completed',finished_at=now(),notes=excluded.notes;

commit;
