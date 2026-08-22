-- SUMI APP M06 — warehouse master, inventory documents and append-only ledger.

begin;

create table if not exists public.warehouses (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  unit_id uuid not null references public.organization_units(id) on delete restrict,
  warehouse_type text not null check (warehouse_type in ('ingredient','finished_goods','display','blind_dispatch')),
  tracks_available_stock boolean not null default true,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

insert into public.warehouses(code,name,unit_id,warehouse_type,tracks_available_stock)
select v.code,v.name,ou.id,v.warehouse_type,v.tracks
from (values
 ('BAKERY_INGREDIENT','Kho nguyên liệu Bakery','BAKERY_INGREDIENT','ingredient',true),
 ('BAKERY_FG','Kho thành phẩm Bakery','BAKERY_FG','finished_goods',true),
 ('X41_INGREDIENT','Kho nguyên liệu Xưởng 41','X41_INGREDIENT','ingredient',true),
 ('X41_MACARON_FG','Kho thành phẩm Macaron','X41_MACARON_FG','finished_goods',true),
 ('X42_INGREDIENT_CENTRAL','Kho nguyên liệu trung tâm Xưởng 42','X42_INGREDIENT_CENTRAL','ingredient',true),
 ('X42_BLIND_DISPATCH','Kho mù Xưởng 42','X42_BLIND_DISPATCH','blind_dispatch',false)
) v(code,name,unit_code,warehouse_type,tracks)
join public.organization_units ou on ou.code=v.unit_code
on conflict(code) do update set name=excluded.name, unit_id=excluded.unit_id,
 warehouse_type=excluded.warehouse_type, tracks_available_stock=excluded.tracks_available_stock, active=true;

create table if not exists public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  sku text not null unique,
  name text not null,
  item_type text not null check (item_type in ('ingredient','finished_product','packaging','accessory')),
  base_unit text not null,
  lot_tracking boolean not null default false,
  expiry_tracking boolean not null default false,
  legacy_source_type text,
  legacy_source_id uuid,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique(legacy_source_type,legacy_source_id)
);

create table if not exists public.inventory_documents (
  id uuid primary key default gen_random_uuid(),
  document_code text not null unique,
  document_type text not null check (document_type in ('opening_balance','receipt','issue','transfer','production_receipt','delivery_issue','adjustment')),
  source_warehouse_id uuid references public.warehouses(id) on delete restrict,
  destination_warehouse_id uuid references public.warehouses(id) on delete restrict,
  order_id uuid references public.orders(id) on delete set null,
  work_package_id uuid references public.order_work_packages(id) on delete set null,
  production_batch_id uuid references public.production_batches(id) on delete set null,
  status text not null default 'draft' check (status in ('draft','awaiting_issue','in_transit','awaiting_receipt','completed','disputed','cancelled')),
  created_by uuid references public.profiles(id) on delete set null,
  approved_by uuid references public.profiles(id) on delete set null,
  issued_by uuid references public.profiles(id) on delete set null,
  received_by uuid references public.profiles(id) on delete set null,
  approval_status text not null default 'pending' check (approval_status in ('pending','approved','rejected')),
  created_at timestamptz not null default now(),
  issued_at timestamptz,
  received_at timestamptz,
  reason text,
  discrepancy_note text,
  idempotency_key text not null unique,
  check (source_warehouse_id is not null or destination_warehouse_id is not null),
  check (source_warehouse_id is distinct from destination_warehouse_id)
);

create table if not exists public.inventory_document_lines (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.inventory_documents(id) on delete cascade,
  inventory_item_id uuid not null references public.inventory_items(id) on delete restrict,
  planned_quantity numeric not null check (planned_quantity >= 0),
  issued_quantity numeric check (issued_quantity >= 0),
  received_quantity numeric check (received_quantity >= 0),
  unit text not null,
  lot_code text,
  expiry_date date,
  unique(document_id,inventory_item_id,lot_code)
);

create table if not exists public.inventory_ledger (
  id bigint generated always as identity primary key,
  warehouse_id uuid not null references public.warehouses(id) on delete restrict,
  inventory_item_id uuid not null references public.inventory_items(id) on delete restrict,
  document_line_id uuid not null references public.inventory_document_lines(id) on delete restrict,
  quantity_delta numeric not null check (quantity_delta <> 0),
  occurred_at timestamptz not null default now(),
  balance_after numeric,
  unique(warehouse_id,document_line_id)
);

create index if not exists idx_inventory_documents_route_status on public.inventory_documents(source_warehouse_id,destination_warehouse_id,status);
create index if not exists idx_inventory_ledger_balance on public.inventory_ledger(warehouse_id,inventory_item_id,occurred_at,id);
create unique index if not exists uniq_inventory_line_item_lot
  on public.inventory_document_lines(document_id,inventory_item_id,coalesce(lot_code,''));

create or replace function public.prevent_inventory_ledger_mutation()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  raise exception 'inventory_ledger is append-only';
end; $$;
revoke all on function public.prevent_inventory_ledger_mutation() from public,anon,authenticated;

drop trigger if exists trg_inventory_ledger_append_only on public.inventory_ledger;
create trigger trg_inventory_ledger_append_only before update or delete on public.inventory_ledger
for each row execute function public.prevent_inventory_ledger_mutation();

-- Deterministic legacy item mapping; safe to re-run.
insert into public.inventory_items(sku,name,item_type,base_unit,lot_tracking,expiry_tracking,legacy_source_type,legacy_source_id)
select 'NVL-'||upper(substr(md5(ws.id::text),1,12)),ws.name,'ingredient',coalesce(nullif(ws.unit,''),'unit'),true,true,'warehouse_stock',ws.id
from public.warehouse_stock ws
on conflict(legacy_source_type,legacy_source_id) do update set name=excluded.name,base_unit=excluded.base_unit;

insert into public.inventory_items(sku,name,item_type,base_unit,legacy_source_type,legacy_source_id)
select 'FG-'||upper(substr(md5(p.id::text),1,12)),p.name,'finished_product',coalesce(nullif(p.unit,''),'cái'),'product',p.id
from public.products p where exists(select 1 from public.finished_goods_stock fg where fg.product_id=p.id)
on conflict(legacy_source_type,legacy_source_id) do update set name=excluded.name,base_unit=excluded.base_unit;

-- Opening documents for legacy raw-material balances.
insert into public.inventory_documents(document_code,document_type,destination_warehouse_id,status,approval_status,reason,idempotency_key)
select 'OPEN-NVL-'||upper(substr(md5(ws.id::text),1,12)),'opening_balance',w.id,'completed','approved','Legacy warehouse_stock opening balance','legacy:warehouse_stock:'||ws.id
from public.warehouse_stock ws
join public.warehouses w on w.code=case
 when lower(coalesce(ws.branch,'')) like '%41%' then 'X41_INGREDIENT'
 when lower(coalesce(ws.branch,'')) like '%42%' then 'X42_INGREDIENT_CENTRAL'
 else 'BAKERY_INGREDIENT' end
on conflict(idempotency_key) do nothing;

insert into public.inventory_document_lines(document_id,inventory_item_id,planned_quantity,received_quantity,unit)
select d.id,i.id,greatest(ws.qty,0),greatest(ws.qty,0),i.base_unit
from public.warehouse_stock ws join public.inventory_items i on i.legacy_source_type='warehouse_stock' and i.legacy_source_id=ws.id
join public.inventory_documents d on d.idempotency_key='legacy:warehouse_stock:'||ws.id
on conflict do nothing;

insert into public.inventory_ledger(warehouse_id,inventory_item_id,document_line_id,quantity_delta,balance_after)
select d.destination_warehouse_id,l.inventory_item_id,l.id,l.received_quantity,l.received_quantity
from public.inventory_document_lines l join public.inventory_documents d on d.id=l.document_id
where d.idempotency_key like 'legacy:warehouse_stock:%' and coalesce(l.received_quantity,0)>0
on conflict(warehouse_id,document_line_id) do nothing;

alter table public.warehouses enable row level security;
alter table public.inventory_items enable row level security;
alter table public.inventory_documents enable row level security;
alter table public.inventory_document_lines enable row level security;
alter table public.inventory_ledger enable row level security;

drop policy if exists "staff read warehouse master" on public.warehouses;
create policy "staff read warehouse master" on public.warehouses for select to authenticated using(public.is_approved());
drop policy if exists "staff read inventory items" on public.inventory_items;
create policy "staff read inventory items" on public.inventory_items for select to authenticated using(public.is_approved());
drop policy if exists "participants read inventory documents" on public.inventory_documents;
create policy "participants read inventory documents" on public.inventory_documents for select to authenticated using(
 public.is_business_director() or exists(select 1 from public.profile_assignments pa join public.warehouses w on w.unit_id=pa.unit_id
 where pa.profile_id=auth.uid() and (w.id=source_warehouse_id or w.id=destination_warehouse_id) and pa.valid_to is null));
drop policy if exists "participants read inventory lines" on public.inventory_document_lines;
create policy "participants read inventory lines" on public.inventory_document_lines for select to authenticated using(
 exists(select 1 from public.inventory_documents d where d.id=document_id));
drop policy if exists "participants read inventory ledger" on public.inventory_ledger;
create policy "participants read inventory ledger" on public.inventory_ledger for select to authenticated using(
 public.is_business_director() or exists(select 1 from public.profile_assignments pa join public.warehouses w on w.unit_id=pa.unit_id
 where pa.profile_id=auth.uid() and w.id=warehouse_id and pa.valid_to is null));

revoke all on public.warehouses,public.inventory_items,public.inventory_documents,public.inventory_document_lines,public.inventory_ledger from anon;
grant select on public.warehouses,public.inventory_items,public.inventory_documents,public.inventory_document_lines,public.inventory_ledger to authenticated;
revoke insert,update,delete on public.inventory_ledger from anon,authenticated;

insert into public.migration_runs(migration_key,status,finished_at,notes)
values('202608220006_inventory_documents_ledger','completed',now(),'Created warehouse routing, auditable documents and append-only inventory ledger.')
on conflict(migration_key) do update set status='completed',finished_at=now(),notes=excluded.notes;

commit;
