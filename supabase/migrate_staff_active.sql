-- Run manually in Supabase SQL Editor. Safe to re-run (idempotent).
--
-- Adds a "khoá tài khoản" (deactivate) mechanism for staff who left, distinct
-- from `approved` (which gates brand-new signups awaiting the owner's first
-- role assignment). A deactivated account is blocked from the app exactly
-- the same way an unapproved one is (is_approved() already gates nearly
-- every table's RLS select policy), but keeps every historical row it ever
-- touched (orders, shift_logs, tasks, order_stages, ...) fully intact.

alter table profiles add column if not exists active boolean not null default true;

-- Extend the existing approval gate to also require an active account —
-- every RLS policy that already ANDs in is_approved() picks this up for free.
create or replace function public.is_approved()
returns boolean as $$
  select coalesce((select approved and active from profiles where id = auth.uid()), false);
$$ language sql stable security definer set search_path = public;

-- Widen the profiles UPDATE policy so an admin actor (not just owner) can
-- reach someone else's row — the trigger below then locks down exactly
-- which columns a non-owner actor may touch on someone else's profile.
drop policy if exists "staff update own profile" on profiles;
create policy "staff update own profile" on profiles
  for update
  using (
    auth.uid() = id
    or exists (
      select 1 from profiles me
      where me.id = auth.uid()
        and (me.role in ('owner','admin') or me.extra_roles && array['owner','admin'])
    )
  )
  with check (
    auth.uid() = id
    or exists (
      select 1 from profiles me
      where me.id = auth.uid()
        and (me.role in ('owner','admin') or me.extra_roles && array['owner','admin'])
    )
  );

-- Owner accounts can never be deactivated (by anyone, including another
-- owner — a safety net against locking the shop out of its own app), and a
-- non-owner actor updating someone ELSE's profile (i.e. an admin toggling
-- `active`) may only change the `active` column — role/station/full_name/
-- approved on another person's row stay Chủ sở hữu-only, same as before.
create or replace function public.restrict_admin_profile_updates()
returns trigger as $$
declare
  actor_is_owner boolean;
begin
  if new.active is distinct from old.active and old.role = 'owner' then
    raise exception 'Không thể khoá tài khoản Chủ sở hữu.';
  end if;

  if auth.uid() is null or new.id = auth.uid() then
    return new;
  end if;

  select exists (
    select 1 from profiles where id = auth.uid() and (role = 'owner' or 'owner' = any(extra_roles))
  ) into actor_is_owner;
  if actor_is_owner then
    return new;
  end if;

  if new.role is distinct from old.role
     or new.extra_roles is distinct from old.extra_roles
     or new.station is distinct from old.station
     or new.full_name is distinct from old.full_name
     or new.approved is distinct from old.approved then
    raise exception 'Chỉ Chủ sở hữu mới đổi được thông tin này.';
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists restrict_admin_profile_updates_trigger on profiles;
create trigger restrict_admin_profile_updates_trigger
  before update on profiles
  for each row execute procedure public.restrict_admin_profile_updates();
