-- SUMI APP M41 — Drop profiles_station_check and all legacy check constraints on profiles
begin;

alter table public.profiles drop constraint if exists profiles_station_check;
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles drop constraint if exists profiles_extra_roles_check;

insert into public.migration_runs(migration_key, status, finished_at, notes)
values('202608230041_drop_profiles_station_check', 'completed', now(), 'Dropped check constraint on profiles.station to allow Vietnamese stream station names (Bếp Lạnh, Bếp Nóng, Xưởng 41, Xưởng 42, Vận Tải, Bán Hàng, Kho).')
on conflict(migration_key) do update set status='completed', finished_at=now(), notes=excluded.notes;

commit;
