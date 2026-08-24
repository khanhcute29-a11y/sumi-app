-- "Giao nhân viên" trong OrderV2DetailModal đọc danh sách nhân viên của 1 bếp
-- từ profile_assignments. Migration gốc (202608220002) đã có 1 lần backfill
-- y hệt việc này cho profile lúc đó, nhưng là INSERT một lần — nhân viên được
-- thêm/đổi station SAU thời điểm đó chưa từng được đồng bộ lại, nên nhiều bếp
-- hiện "chưa có nhân viên" dù đã có người thật. Dùng lại đúng cách map
-- station -> unit code của migration gốc (khớp theo code, không dùng ilike mờ).
begin;

with mapped_profiles as (
  select
    p.id as profile_id,
    p.role as position_code,
    case
      when p.station = 'nong' then 'BAKERY_HOT'
      when p.station = 'lanh' then 'BAKERY_COLD'
      when p.station = 'xuong41' then 'X41_KITCHEN'
      when p.station = 'xuong42' then 'X42_KITCHEN'
      else null
    end as unit_code
  from public.profiles p
  where p.role in ('baker', 'bakery', 'kitchen_lead', 'kitchen_deputy')
    and p.active is distinct from false
)
insert into public.profile_assignments (profile_id, unit_id, position_code, is_primary)
select mp.profile_id, ou.id, mp.position_code, false
from mapped_profiles mp
join public.organization_units ou on ou.code = mp.unit_code and ou.active = true
where mp.unit_code is not null
  and not exists (
    select 1 from public.profile_assignments existing
    where existing.profile_id = mp.profile_id and existing.unit_id = ou.id and existing.valid_to is null
  );

insert into public.migration_runs(migration_key, status, finished_at, notes)
values('202608260010_backfill_kitchen_staff_assignments', 'completed', now(),
  'Re-ran the kitchen-staff profile_assignments backfill from M-202608220002 for profiles created/changed since that one-time insert — "Giao nhân viên" had no staff to pick from for anyone assigned to a station after the original backfill ran.')
on conflict(migration_key) do update set status='completed', finished_at=now(), notes=excluded.notes;

commit;
