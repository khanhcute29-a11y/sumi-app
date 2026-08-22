-- Read-only verification for SUMI M01–M02.
-- Expected: all boolean checks true; unmapped profiles must be reviewed before Orders V2.

select
  to_regclass('public.migration_runs') is not null as has_migration_runs,
  to_regclass('public.migration_anomalies') is not null as has_migration_anomalies,
  to_regclass('public.backfill_checkpoints') is not null as has_backfill_checkpoints,
  to_regclass('public.organization_units') is not null as has_organization_units,
  to_regclass('public.profile_assignments') is not null as has_profile_assignments,
  to_regclass('public.permission_grants') is not null as has_permission_grants;

select migration_key, status, started_at, finished_at, row_counts, notes
from public.migration_runs
where migration_key in (
  '202608220001_migration_infrastructure',
  '202608220002_organization_and_scoped_permissions'
)
order by migration_key;

select code, name, unit_type, parent_id, active, metadata
from public.organization_units
order by code;

select
  count(*) as active_profiles,
  count(*) filter (where pa.id is not null) as profiles_with_primary_assignment,
  count(*) filter (where pa.id is null) as profiles_without_primary_assignment
from public.profiles p
left join public.profile_assignments pa
  on pa.profile_id = p.id
 and pa.is_primary = true
 and pa.valid_to is null
where coalesce(p.active, true) = true;

select
  p.id, p.full_name, p.role, p.extra_roles, p.station,
  ma.anomaly_code, ma.severity, ma.details
from public.migration_anomalies ma
join public.profiles p on p.id::text = ma.source_id
where ma.anomaly_code = 'PROFILE_UNIT_UNMAPPED'
  and ma.resolved_at is null
order by p.full_name nulls last;

select
  p.full_name,
  p.role as legacy_role,
  p.station as legacy_station,
  pa.position_code,
  ou.code as unit_code,
  ou.name as unit_name,
  pa.is_primary,
  pa.valid_from,
  pa.valid_to
from public.profile_assignments pa
join public.profiles p on p.id = pa.profile_id
join public.organization_units ou on ou.id = pa.unit_id
order by p.full_name nulls last, pa.is_primary desc, ou.code;

select
  profile_id,
  count(*) as active_primary_count
from public.profile_assignments
where is_primary = true and valid_to is null
group by profile_id
having count(*) > 1;
