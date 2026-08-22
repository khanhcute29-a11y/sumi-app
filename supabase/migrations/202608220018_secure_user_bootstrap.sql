-- SUMI APP M18 — deterministic first-owner bootstrap and pending staff registration.

begin;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_first boolean;
begin
  -- Serialize the empty-project bootstrap so two simultaneous registrations
  -- can never both become owner.
  perform pg_advisory_xact_lock(hashtext('sumi:first-owner-bootstrap'));
  select not exists(select 1 from public.profiles) into v_is_first;

  insert into public.profiles(id,full_name,phone,role,approved)
  values(
    new.id,
    coalesce(nullif(btrim(new.raw_user_meta_data->>'full_name'),''),'Nhân viên mới'),
    nullif(btrim(new.raw_user_meta_data->>'phone'),''),
    case when v_is_first then 'owner' else 'cashier' end,
    v_is_first
  );

  return new;
end;
$$;

revoke all on function public.handle_new_user() from public,anon,authenticated;

insert into public.migration_runs(migration_key,status,finished_at,notes)
values(
  '202608220018_secure_user_bootstrap',
  'completed',
  now(),
  'Serialized first-owner creation; every later registration remains pending until management approval.'
)
on conflict(migration_key) do update
set status='completed',finished_at=now(),notes=excluded.notes;

commit;
