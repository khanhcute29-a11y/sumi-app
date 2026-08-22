-- SUMI APP M02 — organization hierarchy and scoped permissions
-- Additive, compatible with legacy profiles.role/extra_roles/station.

begin;

create table if not exists public.organization_units (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  unit_type text not null
    check (unit_type in ('company', 'branch', 'kitchen', 'warehouse', 'store', 'transport', 'accounting')),
  parent_id uuid references public.organization_units(id) on delete restrict,
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.profile_assignments (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  unit_id uuid not null references public.organization_units(id) on delete restrict,
  position_code text not null,
  is_primary boolean not null default false,
  valid_from timestamptz not null default now(),
  valid_to timestamptz,
  approved_by uuid references public.profiles(id) on delete set null,
  approved_at timestamptz,
  legacy_source_key text unique,
  created_at timestamptz not null default now(),
  check (valid_to is null or valid_to > valid_from)
);

create table if not exists public.permission_grants (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  permission_code text not null,
  scope_type text not null
    check (scope_type in ('global', 'unit', 'order', 'kitchen', 'warehouse', 'task')),
  scope_id uuid,
  valid_from timestamptz not null default now(),
  valid_to timestamptz,
  reason text not null,
  granted_by uuid not null references public.profiles(id) on delete restrict,
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_by uuid references public.profiles(id) on delete set null,
  revoke_reason text,
  check (valid_to is null or valid_to > valid_from),
  check ((scope_type = 'global' and scope_id is null) or (scope_type <> 'global' and scope_id is not null))
);

create unique index if not exists uniq_profile_primary_assignment_active
  on public.profile_assignments (profile_id)
  where is_primary = true and valid_to is null;

create index if not exists idx_profile_assignments_profile_active
  on public.profile_assignments (profile_id, valid_from, valid_to);

create index if not exists idx_profile_assignments_unit_active
  on public.profile_assignments (unit_id, valid_from, valid_to);

create index if not exists idx_permission_grants_lookup
  on public.permission_grants (profile_id, permission_code, scope_type, scope_id, valid_from, valid_to)
  where revoked_at is null;

create or replace function public.has_active_permission(
  requested_permission text,
  requested_scope_type text default 'global',
  requested_scope_id uuid default null
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    auth.uid() is not null and (
      public.profile_has_legacy_role(array['owner', 'admin'])
      or exists (
      select 1
      from public.permission_grants pg
      where pg.profile_id = auth.uid()
        and pg.permission_code = requested_permission
        and pg.revoked_at is null
        and pg.valid_from <= now()
        and (pg.valid_to is null or pg.valid_to > now())
        and (
          pg.scope_type = 'global'
          or (
            pg.scope_type = requested_scope_type
            and pg.scope_id = requested_scope_id
          )
        )
      )
    ),
    false
  );
$$;

create or replace function public.is_business_director()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    auth.uid() is not null and (
      public.profile_has_legacy_role(array['owner', 'admin'])
      or exists (
      select 1
      from public.profile_assignments pa
      where pa.profile_id = auth.uid()
        and pa.position_code = 'business_director'
        and pa.valid_from <= now()
        and (pa.valid_to is null or pa.valid_to > now())
      )
    ),
    false
  );
$$;

revoke all on function public.has_active_permission(text, text, uuid) from public, anon;
revoke all on function public.is_business_director() from public, anon;
grant execute on function public.has_active_permission(text, text, uuid) to authenticated;
grant execute on function public.is_business_director() to authenticated;

-- Root and first-level units.
insert into public.organization_units (code, name, unit_type, parent_id)
values ('SUMI', 'SUMI Bakery', 'company', null)
on conflict (code) do update set name = excluded.name, unit_type = excluded.unit_type, active = true, updated_at = now();

insert into public.organization_units (code, name, unit_type, parent_id)
select v.code, v.name, v.unit_type, root.id
from (
  values
    ('BAKERY', 'Bakery', 'branch'),
    ('X41', 'Xưởng 41 — Macaron', 'branch'),
    ('X42', 'Xưởng 42 — Trường học', 'branch'),
    ('TRANSPORT', 'Bộ phận Vận tải', 'transport'),
    ('ACCOUNTING', 'Phòng Kế toán', 'accounting')
) as v(code, name, unit_type)
cross join public.organization_units root
where root.code = 'SUMI'
on conflict (code) do update
set name = excluded.name, unit_type = excluded.unit_type,
    parent_id = excluded.parent_id, active = true, updated_at = now();

-- Bakery units.
insert into public.organization_units (code, name, unit_type, parent_id)
select v.code, v.name, v.unit_type, parent.id
from (
  values
    ('BAKERY_HOT', 'Bakery — Bếp nóng', 'kitchen'),
    ('BAKERY_COLD', 'Bakery — Bếp lạnh', 'kitchen'),
    ('BAKERY_INGREDIENT', 'Bakery — Kho nguyên liệu', 'warehouse'),
    ('BAKERY_FG', 'Bakery — Kho thành phẩm', 'warehouse'),
    ('STORE_VP42', 'Cửa hàng Vĩnh Phú 42', 'store'),
    ('STORE_DAILO', 'Cửa hàng Đại Lộ Bình Dương', 'store')
) as v(code, name, unit_type)
cross join public.organization_units parent
where parent.code = 'BAKERY'
on conflict (code) do update
set name = excluded.name, unit_type = excluded.unit_type,
    parent_id = excluded.parent_id, active = true, updated_at = now();

-- Xưởng 41 units.
insert into public.organization_units (code, name, unit_type, parent_id)
select v.code, v.name, v.unit_type, parent.id
from (
  values
    ('X41_KITCHEN', 'Xưởng 41 — Bếp Macaron', 'kitchen'),
    ('X41_INGREDIENT', 'Xưởng 41 — Kho nguyên liệu', 'warehouse'),
    ('X41_MACARON_FG', 'Xưởng 41 — Kho thành phẩm Macaron', 'warehouse')
) as v(code, name, unit_type)
cross join public.organization_units parent
where parent.code = 'X41'
on conflict (code) do update
set name = excluded.name, unit_type = excluded.unit_type,
    parent_id = excluded.parent_id, active = true, updated_at = now();

-- Xưởng 42 units.
insert into public.organization_units (code, name, unit_type, parent_id, metadata)
select v.code, v.name, v.unit_type, parent.id, v.metadata
from (
  values
    ('X42_KITCHEN', 'Xưởng 42 — Bếp Trường học', 'kitchen', '{"confidentiality":"school_restricted"}'::jsonb),
    ('X42_INGREDIENT_CENTRAL', 'Xưởng 42 — Kho NVL trung tâm', 'warehouse', '{}'::jsonb),
    ('X42_BLIND_DISPATCH', 'Xưởng 42 — Kho mù đi thẳng', 'warehouse', '{"blind_dispatch":true,"tracks_available_stock":false}'::jsonb)
) as v(code, name, unit_type, metadata)
cross join public.organization_units parent
where parent.code = 'X42'
on conflict (code) do update
set name = excluded.name, unit_type = excluded.unit_type,
    parent_id = excluded.parent_id, metadata = excluded.metadata,
    active = true, updated_at = now();

-- Transport hierarchy.
insert into public.organization_units (code, name, unit_type, parent_id)
select v.code, v.name, 'transport', parent.id
from (
  values
    ('TRANSPORT_LEAD', 'Vận tải — Đội trưởng'),
    ('TRANSPORT_DEPUTY', 'Vận tải — Đội phó'),
    ('TRANSPORT_DRIVER', 'Vận tải — Nhân viên giao hàng')
) as v(code, name)
cross join public.organization_units parent
where parent.code = 'TRANSPORT'
on conflict (code) do update
set name = excluded.name, unit_type = excluded.unit_type,
    parent_id = excluded.parent_id, active = true, updated_at = now();

-- Backfill one deterministic primary assignment per legacy profile.
with mapped_profiles as (
  select
    p.id as profile_id,
    p.role as position_code,
    case
      when p.role in ('owner', 'admin') then 'SUMI'
      when p.role = 'accountant' then 'ACCOUNTING'
      when p.role = 'shipper' then 'TRANSPORT_DRIVER'
      when p.role = 'kho_xuong41' then 'X41_INGREDIENT'
      when p.role = 'kho_xuong42' then 'X42_INGREDIENT_CENTRAL'
      when p.role = 'kho_bakery' then 'BAKERY_INGREDIENT'
      when p.role = 'warehouse' and p.station = 'xuong41' then 'X41_INGREDIENT'
      when p.role = 'warehouse' and p.station = 'xuong42' then 'X42_INGREDIENT_CENTRAL'
      when p.role = 'warehouse' then 'BAKERY_INGREDIENT'
      when p.station = 'nong' then 'BAKERY_HOT'
      when p.station = 'lanh' then 'BAKERY_COLD'
      when p.station = 'xuong41' then 'X41_KITCHEN'
      when p.station = 'xuong42' then 'X42_KITCHEN'
      when p.station = 'bakery' then 'BAKERY'
      when p.role in ('cashier', 'sale') then 'BAKERY'
      else null
    end as unit_code
  from public.profiles p
), inserted as (
  insert into public.profile_assignments (
    profile_id, unit_id, position_code, is_primary,
    valid_from, approved_at, legacy_source_key
  )
  select
    mp.profile_id, ou.id, mp.position_code, true,
    now(), now(), 'profile:' || mp.profile_id::text || ':primary'
  from mapped_profiles mp
  join public.organization_units ou on ou.code = mp.unit_code
  where mp.unit_code is not null
    and not exists (
      select 1 from public.profile_assignments existing
      where existing.profile_id = mp.profile_id
        and existing.is_primary = true
        and existing.valid_to is null
    )
  on conflict (legacy_source_key) do nothing
  returning 1
)
select count(*) from inserted;

insert into public.migration_anomalies (
  anomaly_key, source_table, source_id, anomaly_code, severity, details
)
select
  'm02:profile:' || p.id::text || ':unmapped',
  'profiles', p.id::text, 'PROFILE_UNIT_UNMAPPED', 'blocker',
  jsonb_build_object(
    'full_name', p.full_name,
    'role', p.role,
    'extra_roles', p.extra_roles,
    'station', p.station
  )
from public.profiles p
where not exists (
  select 1 from public.profile_assignments pa
  where pa.profile_id = p.id and pa.is_primary = true and pa.valid_to is null
)
on conflict (anomaly_key) do update
set details = excluded.details,
    detected_at = now(),
    resolved_at = null,
    resolved_by = null,
    resolution_note = null;

update public.migration_anomalies ma
set resolved_at = now(),
    resolution_note = 'Profile now has an active primary organization assignment.'
where ma.anomaly_code = 'PROFILE_UNIT_UNMAPPED'
  and ma.resolved_at is null
  and exists (
    select 1
    from public.profile_assignments pa
    where pa.profile_id::text = ma.source_id
      and pa.is_primary = true
      and pa.valid_to is null
  );

alter table public.organization_units enable row level security;
alter table public.profile_assignments enable row level security;
alter table public.permission_grants enable row level security;

drop policy if exists "approved staff read organization units" on public.organization_units;
create policy "approved staff read organization units"
  on public.organization_units for select
  to authenticated
  using (public.is_approved());

drop policy if exists "directors manage organization units" on public.organization_units;
create policy "directors manage organization units"
  on public.organization_units for all
  to authenticated
  using (public.is_business_director())
  with check (public.is_business_director());

drop policy if exists "staff read own or directors read assignments" on public.profile_assignments;
create policy "staff read own or directors read assignments"
  on public.profile_assignments for select
  to authenticated
  using (profile_id = auth.uid() or public.is_business_director());

drop policy if exists "directors manage assignments" on public.profile_assignments;
create policy "directors manage assignments"
  on public.profile_assignments for all
  to authenticated
  using (public.is_business_director())
  with check (public.is_business_director());

drop policy if exists "staff read own or directors read grants" on public.permission_grants;
create policy "staff read own or directors read grants"
  on public.permission_grants for select
  to authenticated
  using (profile_id = auth.uid() or public.is_business_director());

drop policy if exists "directors manage grants" on public.permission_grants;
create policy "directors manage grants"
  on public.permission_grants for all
  to authenticated
  using (public.is_business_director())
  with check (public.is_business_director() and granted_by = auth.uid());

insert into public.migration_runs (
  migration_key, status, finished_at, row_counts, notes
)
values (
  '202608220002_organization_and_scoped_permissions',
  'completed',
  now(),
  jsonb_build_object(
    'organization_units', (select count(*) from public.organization_units),
    'profile_assignments', (select count(*) from public.profile_assignments),
    'unmapped_profiles', (
      select count(*) from public.migration_anomalies
      where anomaly_code = 'PROFILE_UNIT_UNMAPPED' and resolved_at is null
    )
  ),
  'Created organization hierarchy, scoped grants and deterministic legacy profile assignments.'
)
on conflict (migration_key) do update
set status = 'completed',
    finished_at = now(),
    row_counts = excluded.row_counts,
    notes = excluded.notes;

commit;
