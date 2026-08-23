-- SUMI APP M37 — Drop profiles_role_check constraint to allow all stream-specific roles
begin;

alter table public.profiles drop constraint if exists profiles_role_check;

insert into public.migration_runs(migration_key,status,finished_at,notes)
values('202608230037_drop_profiles_role_check','completed',now(),'Dropped check constraint on profiles.role to allow stream-specific role codes.')
on conflict(migration_key) do update set status='completed',finished_at=now(),notes=excluded.notes;

commit;
