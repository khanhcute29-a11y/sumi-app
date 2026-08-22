-- SUMI APP M05 — multi-kitchen packages, production batches and task proof.

begin;

create table if not exists public.order_work_packages (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  unit_id uuid not null references public.organization_units(id) on delete restrict,
  assigned_by uuid references public.profiles(id) on delete set null,
  assigned_at timestamptz not null default now(),
  accepted_by uuid references public.profiles(id) on delete set null,
  accepted_at timestamptz,
  status text not null default 'assigned' check (status in ('assigned','accepted','in_progress','awaiting_approval','completed','rejected','cancelled')),
  due_at timestamptz,
  completed_at timestamptz,
  approved_by uuid references public.profiles(id) on delete set null,
  approved_at timestamptz,
  rejection_reason text,
  reassignment_requested_at timestamptz,
  reassignment_requested_by uuid references public.profiles(id) on delete set null,
  reassignment_reason text,
  version integer not null default 1,
  legacy_source_key text unique
);

create table if not exists public.work_package_items (
  work_package_id uuid not null references public.order_work_packages(id) on delete cascade,
  order_item_id uuid not null references public.order_items(id) on delete restrict,
  quantity numeric not null check (quantity > 0),
  primary key(work_package_id, order_item_id)
);

create table if not exists public.production_batches (
  id uuid primary key default gen_random_uuid(),
  work_package_id uuid not null references public.order_work_packages(id) on delete cascade,
  batch_code text not null unique,
  planned_quantity numeric not null default 0,
  actual_quantity numeric,
  waste_quantity numeric not null default 0,
  status text not null default 'planned' check (status in ('planned','in_progress','completed','cancelled')),
  started_at timestamptz,
  completed_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  bom_version_id uuid,
  created_at timestamptz not null default now()
);

alter table public.tasks add column if not exists work_package_id uuid references public.order_work_packages(id) on delete set null;
alter table public.tasks add column if not exists production_batch_id uuid references public.production_batches(id) on delete set null;
alter table public.tasks add column if not exists performed_as_role text;
alter table public.tasks add column if not exists required_proof_types text[] not null default '{}';
alter table public.tasks add column if not exists started_at timestamptz;
alter table public.tasks add column if not exists version integer not null default 1;
alter table public.tasks add column if not exists exclusion_reason_code text;
alter table public.tasks add column if not exists exclusion_approved_by uuid references public.profiles(id) on delete set null;

create table if not exists public.task_proofs (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  proof_type text not null,
  storage_path text,
  note text,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  gps_lat numeric,
  gps_lng numeric,
  check (storage_path is not null or note is not null)
);

create index if not exists idx_work_packages_order_status on public.order_work_packages(order_id,status);
create index if not exists idx_work_packages_unit_status on public.order_work_packages(unit_id,status);
create index if not exists idx_tasks_work_package on public.tasks(work_package_id,status);

alter table public.order_work_packages enable row level security;
alter table public.work_package_items enable row level security;
alter table public.production_batches enable row level security;
alter table public.task_proofs enable row level security;

drop policy if exists "participants read work packages" on public.order_work_packages;
create policy "participants read work packages" on public.order_work_packages for select to authenticated
using (public.is_business_director() or exists (
  select 1 from public.profile_assignments pa where pa.profile_id=auth.uid() and pa.unit_id=unit_id
    and pa.valid_from<=now() and (pa.valid_to is null or pa.valid_to>now())
));

drop policy if exists "directors assign work packages" on public.order_work_packages;
create policy "directors assign work packages" on public.order_work_packages for insert to authenticated
with check (public.is_business_director() and assigned_by=auth.uid());

drop policy if exists "kitchen leads update work packages" on public.order_work_packages;
create policy "kitchen leads update work packages" on public.order_work_packages for update to authenticated
using (public.is_business_director() or exists (
  select 1 from public.profile_assignments pa where pa.profile_id=auth.uid() and pa.unit_id=unit_id
    and pa.position_code in ('kitchen_lead','kitchen_deputy') and pa.valid_from<=now() and (pa.valid_to is null or pa.valid_to>now())
));

drop policy if exists "participants read work package items" on public.work_package_items;
create policy "participants read work package items" on public.work_package_items for select to authenticated
using (exists (select 1 from public.order_work_packages wp where wp.id=work_package_id));

drop policy if exists "package managers write work package items" on public.work_package_items;
create policy "package managers write work package items" on public.work_package_items for all to authenticated
using (public.is_business_director()) with check (public.is_business_director());

drop policy if exists "participants read production batches" on public.production_batches;
create policy "participants read production batches" on public.production_batches for select to authenticated
using (exists (select 1 from public.order_work_packages wp where wp.id=work_package_id));

drop policy if exists "kitchen manages production batches" on public.production_batches;
create policy "kitchen manages production batches" on public.production_batches for all to authenticated
using (public.is_approved()) with check (public.is_approved() and created_by=auth.uid());

drop policy if exists "staff manage own task proofs" on public.task_proofs;
create policy "staff manage own task proofs" on public.task_proofs for all to authenticated
using (created_by=auth.uid() or public.is_business_director())
with check (created_by=auth.uid() and public.is_approved());

drop policy if exists "read orders" on public.orders;
create policy "read orders" on public.orders for select to authenticated
using (public.is_approved() and (
  confidentiality <> 'school_restricted'
  or public.is_business_director()
  or exists (
    select 1 from public.order_work_packages wp
    join public.profile_assignments pa on pa.unit_id=wp.unit_id
    where wp.order_id=orders.id and pa.profile_id=auth.uid()
      and pa.position_code in ('kitchen_lead','kitchen_deputy')
      and pa.valid_from<=now() and (pa.valid_to is null or pa.valid_to>now())
  )
));

insert into public.migration_runs(migration_key,status,finished_at,notes)
values ('202608220005_work_packages_batches_tasks','completed',now(),'Added multi-kitchen packages, batches, task proof and restricted school-order visibility.')
on conflict(migration_key) do update set status='completed', finished_at=now(), notes=excluded.notes;

commit;
