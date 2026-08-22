-- SUMI APP M04 — compatible order V2 fields, specifications, attachments and finance.

begin;

alter table public.orders add column if not exists order_type text;
alter table public.orders add column if not exists created_by uuid references public.profiles(id) on delete set null;
alter table public.orders add column if not exists required_at timestamptz;
alter table public.orders add column if not exists fulfillment_method_v2 text;
alter table public.orders add column if not exists status_v2 text;
alter table public.orders add column if not exists confidentiality text not null default 'normal';
alter table public.orders add column if not exists version integer not null default 1;
alter table public.orders add column if not exists allow_partial_fulfillment boolean not null default false;
alter table public.orders add column if not exists partial_fulfillment_approved_by uuid references public.profiles(id) on delete set null;
alter table public.orders add column if not exists partial_fulfillment_approved_at timestamptz;
alter table public.orders add column if not exists cancelled_at timestamptz;
alter table public.orders add column if not exists cancelled_by uuid references public.profiles(id) on delete set null;
alter table public.orders add column if not exists legacy_status text;
alter table public.orders add column if not exists legacy_import_key text;

update public.orders
set legacy_status = coalesce(legacy_status, status),
    status_v2 = coalesce(status_v2, case status
      when 'moi' then 'awaiting_assignment'
      when 'dang_lam' then 'in_production'
      when 'cho_giao' then 'ready_for_fulfillment'
      when 'dang_giao' then 'in_delivery'
      when 'hoan_thanh' then 'completed'
      when 'huy' then 'cancelled'
      else 'awaiting_assignment' end),
    fulfillment_method_v2 = coalesce(fulfillment_method_v2,
      case when delivery_method = 'lay_tai_xuong' then 'pickup' else 'delivery' end),
    required_at = coalesce(required_at,
      case when delivery_date ~ '^\d{4}-\d{2}-\d{2}$'
        then (delivery_date || ' ' || coalesce(nullif(delivery_time, ''), '00:00'))::timestamptz
        else null end);

alter table public.order_items add column if not exists quantity numeric;
alter table public.order_items add column if not exists unit text;
alter table public.order_items add column if not exists specification jsonb not null default '{}'::jsonb;
alter table public.order_items add column if not exists name_snapshot text;
alter table public.order_items add column if not exists display_order integer not null default 0;

update public.order_items
set quantity = coalesce(quantity, qty),
    unit = coalesce(unit, 'cái'),
    name_snapshot = coalesce(name_snapshot, name),
    specification = coalesce(specification, '{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object(
      'size', size, 'cot', cot, 'vi', vi, 'content', content, 'candle', candle, 'category', category
    ));

create table if not exists public.order_attachments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  attachment_type text not null check (attachment_type in ('customer_sample','production_proof','warehouse_proof','delivery_proof','signed_document')),
  storage_path text,
  legacy_storage_url text,
  mime_type text,
  size_bytes bigint,
  checksum text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  visibility_scope text not null default 'order_participants',
  gps_lat numeric,
  gps_lng numeric,
  hot_storage_expires_at timestamptz not null default (now() + interval '7 days'),
  backup_status text not null default 'pending' check (backup_status in ('pending','processing','verified','failed')),
  drive_file_id text,
  backup_checksum text,
  backed_up_at timestamptz,
  legacy_source_key text unique,
  check (storage_path is not null or legacy_storage_url is not null)
);

alter table public.order_attachments add column if not exists legacy_source_key text;
create unique index if not exists uniq_order_attachments_legacy_source
  on public.order_attachments(legacy_source_key) where legacy_source_key is not null;

insert into public.order_attachments(order_id,attachment_type,legacy_storage_url,visibility_scope,gps_lat,gps_lng,legacy_source_key)
select o.id,v.attachment_type,v.url,'order_participants',v.lat,v.lng,'legacy:orders:'||o.id||':'||v.source_column
from public.orders o
cross join lateral (values
 ('customer_sample',o.kitchen_photo_url,null::numeric,null::numeric,'kitchen_photo_url'),
 ('warehouse_proof',o.pickup_photo_url,o.pickup_lat,o.pickup_lng,'pickup_photo_url'),
 ('delivery_proof',o.delivery_photo_url,o.delivery_lat,o.delivery_lng,'delivery_photo_url'),
 ('signed_document',o.signed_doc_photo_url,o.delivery_lat,o.delivery_lng,'signed_doc_photo_url')
) v(attachment_type,url,lat,lng,source_column)
where nullif(v.url,'') is not null
on conflict do nothing;

create table if not exists public.order_financials (
  order_id uuid primary key references public.orders(id) on delete cascade,
  total_amount numeric,
  deposit_amount numeric,
  paid_amount numeric,
  shipping_amount numeric,
  payment_method text,
  payment_status text,
  entered_by uuid references public.profiles(id) on delete set null,
  entered_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into public.order_financials(order_id,total_amount,deposit_amount,paid_amount,shipping_amount,payment_method,payment_status)
select id,total,deposit,paid_amount,ship_fee,payment_method,
 case when paid_amount>=total then 'paid' when paid_amount>0 or deposit>0 then 'partial' else 'unpaid' end
from public.orders
where coalesce(order_type,'')<>'school' and confidentiality<>'school_restricted'
on conflict(order_id) do nothing;

insert into public.migration_anomalies(anomaly_key,source_table,source_id,anomaly_code,severity,details)
select 'school-price:'||id,'orders',id::text,'SCHOOL_PRICE_PRESENT','blocker',
 jsonb_build_object('message','School order contains legacy financial values; director must handle outside the app.')
from public.orders
where (order_type='school' or confidentiality='school_restricted')
 and (coalesce(total,0)<>0 or coalesce(deposit,0)<>0 or coalesce(paid_amount,0)<>0 or coalesce(ship_fee,0)<>0)
on conflict(anomaly_key) do nothing;

create table if not exists public.order_change_requests (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  requested_by uuid not null references public.profiles(id) on delete restrict,
  requested_at timestamptz not null default now(),
  reason text not null,
  proposed_changes jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending','approved','rejected','cancelled')),
  resolved_by uuid references public.profiles(id) on delete set null,
  resolved_at timestamptz,
  resolution_note text
);

create index if not exists idx_orders_status_v2_required on public.orders(status_v2, required_at);
create index if not exists idx_order_attachments_order on public.order_attachments(order_id, created_at);
create index if not exists idx_order_change_requests_pending on public.order_change_requests(status, requested_at) where status = 'pending';

alter table public.order_attachments enable row level security;
alter table public.order_financials enable row level security;
alter table public.order_change_requests enable row level security;

drop policy if exists "read order attachments" on public.order_attachments;
create policy "read order attachments" on public.order_attachments for select to authenticated
using (public.is_approved() and exists (select 1 from public.orders o where o.id = order_id));

drop policy if exists "write order attachments" on public.order_attachments;
create policy "write order attachments" on public.order_attachments for insert to authenticated
with check (public.is_approved() and created_by = auth.uid());

drop policy if exists "directors manage order financials" on public.order_financials;
create policy "directors manage order financials" on public.order_financials for all to authenticated
using (public.is_business_director() or public.has_active_permission('order.finance.read'))
with check (public.is_business_director() or public.has_active_permission('order.finance.write'));

drop policy if exists "requesters read own order changes" on public.order_change_requests;
create policy "requesters read own order changes" on public.order_change_requests for select to authenticated
using (requested_by = auth.uid() or public.is_business_director());

drop policy if exists "staff request order changes" on public.order_change_requests;
create policy "staff request order changes" on public.order_change_requests for insert to authenticated
with check (requested_by = auth.uid() and public.is_approved());

drop policy if exists "directors resolve order changes" on public.order_change_requests;
create policy "directors resolve order changes" on public.order_change_requests for update to authenticated
using (public.is_business_director()) with check (public.is_business_director());

insert into public.migration_runs(migration_key,status,finished_at,notes)
values ('202608220004_orders_v2_and_details','completed',now(),'Added compatible order workflow, item specification, attachments, finance and change requests.')
on conflict(migration_key) do update set status='completed', finished_at=now(), notes=excluded.notes;

commit;
