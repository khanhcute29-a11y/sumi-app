-- Deactivate all staff except CEO/Executive Director
-- Keep only owner/admin roles active for testing

begin;

-- Update all profiles to inactive EXCEPT owner role
update public.profiles
set active = false, updated_at = now()
where role != 'owner' and role != 'admin';

-- Alternative: Delete all non-owner profiles if needed
-- delete from public.profiles where role != 'owner' and role != 'admin';

-- Log the action
insert into public.migration_runs(migration_key,status,finished_at,notes)
values('202608250002_deactivate_all_staff','completed',now(),'Deactivate all staff except owner/admin roles for system testing.')
on conflict(migration_key) do update set status='completed',finished_at=now(),notes=excluded.notes;

commit;
