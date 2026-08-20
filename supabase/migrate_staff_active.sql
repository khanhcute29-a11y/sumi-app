-- Run manually in Supabase SQL Editor. Safe to re-run (idempotent).
-- Depends on migrate_shift_schedule.sql (profiles.station) and
-- migrate_add_profiles_phone.sql (profiles.phone) having already run.
--
-- Adds a "khoá tài khoản" (deactivate) mechanism for staff who left, distinct
-- from `approved` (which gates brand-new signups awaiting the owner's first
-- role assignment). A deactivated account is blocked from the app exactly
-- the same way an unapproved one is (is_approved() already gates nearly
-- every table's RLS select policy, and this migration also folds it into
-- every write policy below), but keeps every historical row it ever
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
-- which columns a non-owner actor may touch on someone else's profile, and
-- separately blocks anyone from touching their OWN approved/active columns
-- (otherwise a deactivated/unapproved account could just flip itself back
-- on with a direct API call, bypassing the UI entirely).
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

-- Column-level lock on profiles UPDATE:
--   * An owner account (role='owner' OR extra_roles contains 'owner') can
--     never be deactivated by anyone — safety net against locking the shop
--     out of its own app. Only the deactivation direction is blocked, so a
--     deactivated-then-promoted-to-owner row can still be reactivated.
--   * Nobody may flip their OWN approved/active columns — closes the
--     self-reactivation bypass (a deactivated/unapproved user updating
--     their own row would otherwise sail through the `auth.uid() = id`
--     branch of the policy above with no further check).
--   * A non-owner actor updating someone ELSE's profile (i.e. an admin
--     toggling `active`) may only change the `active` column — every other
--     column is compared via an allowlist diff (matching the pattern
--     already used by enforce_order_update_permissions()) so a new column
--     added later is locked down by default instead of silently open.
create or replace function public.restrict_admin_profile_updates()
returns trigger as $$
declare
  actor_is_owner boolean;
  allowed_cols text[];
  changed_keys text[];
begin
  if new.active is distinct from old.active
     and new.active = false
     and (old.role = 'owner' or 'owner' = any(old.extra_roles)) then
    raise exception 'Không thể khoá tài khoản Chủ sở hữu.';
  end if;

  if auth.uid() is not null and new.id = auth.uid() and old.id = auth.uid() then
    if new.approved is distinct from old.approved or new.active is distinct from old.active then
      raise exception 'Không thể tự duyệt hoặc tự mở khoá tài khoản của chính mình.';
    end if;
    return new;
  end if;

  if auth.uid() is null then
    return new;
  end if;

  select exists (
    select 1 from profiles where id = auth.uid() and (role = 'owner' or 'owner' = any(extra_roles))
  ) into actor_is_owner;
  if actor_is_owner then
    return new;
  end if;

  allowed_cols := array['active'];
  select array_agg(n.key) into changed_keys
  from jsonb_each(to_jsonb(new)) n
  join jsonb_each(to_jsonb(old)) o on n.key = o.key
  where n.value is distinct from o.value;

  if changed_keys is not null and exists (select 1 from unnest(changed_keys) k where k <> all (allowed_cols)) then
    raise exception 'Chỉ Chủ sở hữu mới đổi được thông tin này.';
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists restrict_admin_profile_updates_trigger on profiles;
create trigger restrict_admin_profile_updates_trigger
  before update on profiles
  for each row execute procedure public.restrict_admin_profile_updates();

-- ---------------------------------------------------------------------
-- is_approved() previously only gated SELECT (and a handful of newer
-- write policies). Fold it into the remaining write policies too, so a
-- deactivated account is blocked from insert/update/delete everywhere it
-- was already blocked from reading — not just cosmetically logged out of
-- the UI while still holding a live, writable session.
-- ---------------------------------------------------------------------

drop policy if exists "insert orders" on orders;
create policy "insert orders" on orders for insert with check (auth.role() = 'authenticated' and public.is_approved());

drop policy if exists "update orders" on orders;
create policy "update orders" on orders for update
  using (
    public.is_approved()
    and exists (
      select 1 from profiles
      where id = auth.uid()
        and role in ('owner','admin','cashier','sale','kitchen','bakery','shipper')
    )
  );

drop policy if exists "delete orders" on orders;
create policy "delete orders" on orders for delete
  using (
    public.is_approved()
    and status <> 'huy'
    and exists (select 1 from profiles where id = auth.uid() and role in ('owner','cashier','admin','sale'))
  );

drop policy if exists "insert order_items" on order_items;
create policy "insert order_items" on order_items for insert with check (auth.role() = 'authenticated' and public.is_approved());

drop policy if exists "update order_items" on order_items;
create policy "update order_items" on order_items for update
  using (public.is_approved() and exists (select 1 from profiles where id = auth.uid() and role in ('owner','cashier','admin','sale')));

drop policy if exists "delete order_items" on order_items;
create policy "delete order_items" on order_items for delete
  using (public.is_approved() and exists (select 1 from profiles where id = auth.uid() and role in ('owner','cashier','admin','sale')));

drop policy if exists "insert customers" on customers;
create policy "insert customers" on customers for insert with check (auth.role() = 'authenticated' and public.is_approved());

drop policy if exists "update customers" on customers;
create policy "update customers" on customers for update
  using (public.is_approved() and exists (select 1 from profiles where id = auth.uid() and role in ('owner','cashier','admin','sale')));

drop policy if exists "delete customers" on customers;
create policy "delete customers" on customers for delete
  using (public.is_approved() and exists (select 1 from profiles where id = auth.uid() and role in ('owner','cashier','admin','sale')));

drop policy if exists "insert warehouse_stock" on warehouse_stock;
create policy "insert warehouse_stock" on warehouse_stock for insert with check (auth.role() = 'authenticated' and public.is_approved());

drop policy if exists "update warehouse_stock" on warehouse_stock;
create policy "update warehouse_stock" on warehouse_stock for update using (public.is_approved());

drop policy if exists "delete warehouse_stock" on warehouse_stock;
create policy "delete warehouse_stock" on warehouse_stock for delete
  using (public.is_approved() and exists (select 1 from profiles where id = auth.uid() and role in ('owner','cashier','admin','sale','warehouse')));

drop policy if exists "insert warehouse_stock_out_log" on warehouse_stock_out_log;
create policy "insert warehouse_stock_out_log" on warehouse_stock_out_log for insert with check (auth.role() = 'authenticated' and public.is_approved());

drop policy if exists "insert warehouse_stock_in_log" on warehouse_stock_in_log;
create policy "insert warehouse_stock_in_log" on warehouse_stock_in_log for insert with check (auth.role() = 'authenticated' and public.is_approved());

drop policy if exists "insert shift_logs" on shift_logs;
create policy "insert shift_logs" on shift_logs for insert
  with check (auth.role() = 'authenticated' and public.is_approved() and staff_id = auth.uid());

drop policy if exists "update shift_logs" on shift_logs;
create policy "update shift_logs" on shift_logs for update
  using (public.is_approved() and exists (select 1 from profiles where id = auth.uid() and role in ('owner','admin')));

drop policy if exists "delete shift_logs" on shift_logs;
create policy "delete shift_logs" on shift_logs for delete
  using (public.is_approved() and exists (select 1 from profiles where id = auth.uid() and role in ('owner','admin')));

drop policy if exists "insert approval_requests" on approval_requests;
create policy "insert approval_requests" on approval_requests for insert with check (auth.role() = 'authenticated' and public.is_approved());

drop policy if exists "update approval_requests" on approval_requests;
create policy "update approval_requests" on approval_requests for update
  using (public.is_approved() and exists (select 1 from profiles where id = auth.uid() and role in ('owner','admin')));

drop policy if exists "write cashbook_entries" on cashbook_entries;
create policy "write cashbook_entries" on cashbook_entries for insert
  with check (public.is_approved() and exists (select 1 from profiles where id = auth.uid() and role in ('owner','cashier','admin','sale','accountant')));
drop policy if exists "update cashbook_entries" on cashbook_entries;
create policy "update cashbook_entries" on cashbook_entries for update
  using (public.is_approved() and exists (select 1 from profiles where id = auth.uid() and role in ('owner','cashier','admin','sale','accountant')));
drop policy if exists "delete cashbook_entries" on cashbook_entries;
create policy "delete cashbook_entries" on cashbook_entries for delete
  using (public.is_approved() and exists (select 1 from profiles where id = auth.uid() and role in ('owner','cashier','admin','sale','accountant')));

drop policy if exists "write debts" on debts;
create policy "write debts" on debts for insert
  with check (public.is_approved() and exists (select 1 from profiles where id = auth.uid() and role in ('owner','cashier','admin','sale','accountant')));
drop policy if exists "update debts" on debts;
create policy "update debts" on debts for update
  using (public.is_approved() and exists (select 1 from profiles where id = auth.uid() and role in ('owner','cashier','admin','sale','accountant')));
drop policy if exists "delete debts" on debts;
create policy "delete debts" on debts for delete
  using (public.is_approved() and exists (select 1 from profiles where id = auth.uid() and role in ('owner','cashier','admin','sale','accountant')));

drop policy if exists "write products" on products;
create policy "write products" on products for insert
  with check (public.is_approved() and exists (select 1 from profiles where id = auth.uid() and role in ('owner','cashier','admin','sale')));
drop policy if exists "update products" on products;
create policy "update products" on products for update
  using (public.is_approved() and exists (select 1 from profiles where id = auth.uid() and role in ('owner','cashier','admin','sale')));
drop policy if exists "delete products" on products;
create policy "delete products" on products for delete
  using (public.is_approved() and exists (select 1 from profiles where id = auth.uid() and role in ('owner','cashier','admin','sale')));

drop policy if exists "write product_variants" on product_variants;
create policy "write product_variants" on product_variants for insert
  with check (public.is_approved() and exists (select 1 from profiles where id = auth.uid() and role in ('owner','cashier','admin','sale')));
drop policy if exists "update product_variants" on product_variants;
create policy "update product_variants" on product_variants for update
  using (public.is_approved() and exists (select 1 from profiles where id = auth.uid() and role in ('owner','cashier','admin','sale')));
drop policy if exists "delete product_variants" on product_variants;
create policy "delete product_variants" on product_variants for delete
  using (public.is_approved() and exists (select 1 from profiles where id = auth.uid() and role in ('owner','cashier','admin','sale')));

drop policy if exists "write product_recipes" on product_recipes;
create policy "write product_recipes" on product_recipes for insert
  with check (public.is_approved() and exists (select 1 from profiles where id = auth.uid() and role in ('owner','cashier','admin','sale')));
drop policy if exists "update product_recipes" on product_recipes;
create policy "update product_recipes" on product_recipes for update
  using (public.is_approved() and exists (select 1 from profiles where id = auth.uid() and role in ('owner','cashier','admin','sale')));
drop policy if exists "delete product_recipes" on product_recipes;
create policy "delete product_recipes" on product_recipes for delete
  using (public.is_approved() and exists (select 1 from profiles where id = auth.uid() and role in ('owner','cashier','admin','sale')));

drop policy if exists "write cash_reconciliations" on cash_reconciliations;
create policy "write cash_reconciliations" on cash_reconciliations for insert
  with check (public.is_approved() and exists (select 1 from profiles where id = auth.uid() and role in ('owner','cashier','admin','sale','accountant')));

drop policy if exists "authenticated upload to uploads bucket" on storage.objects;
create policy "authenticated upload to uploads bucket" on storage.objects
  for insert with check (bucket_id = 'uploads' and auth.role() = 'authenticated' and public.is_approved());

-- Cho phép client tự lắng nghe khi hồ sơ của chính mình bị khoá/mở lại giữa phiên
-- (xem AuthContext.jsx) — không có dòng này thì subscription không nhận được sự kiện.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'profiles'
  ) then
    alter publication supabase_realtime add table profiles;
  end if;
end $$;
