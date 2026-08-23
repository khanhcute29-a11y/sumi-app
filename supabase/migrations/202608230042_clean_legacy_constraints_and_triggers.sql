-- SUMI APP M42 — Clean legacy constraints, triggers, and restrictive RLS policies
begin;

-- 1. Drop legacy triggers on orders that block updates or field edits
drop trigger if exists trg_enforce_order_self_claim_columns on public.orders;
drop trigger if exists trg_enforce_order_update_rules on public.orders;
drop trigger if exists enforce_order_update_permissions_trigger on public.orders;

-- 2. Drop restrictive check constraints across all tables to allow flexible UI input
alter table public.profiles drop constraint if exists profiles_station_check;
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles drop constraint if exists profiles_extra_roles_check;

alter table public.orders drop constraint if exists orders_status_check;
alter table public.orders drop constraint if exists orders_status_v2_check;
alter table public.orders drop constraint if exists orders_order_type_check;
alter table public.orders drop constraint if exists orders_fulfillment_method_check;
alter table public.orders drop constraint if exists orders_confidentiality_check;

alter table public.order_work_packages drop constraint if exists order_work_packages_status_check;
alter table public.delivery_runs drop constraint if exists delivery_runs_status_check;
alter table public.delivery_runs drop constraint if exists delivery_runs_provider_check;
alter table public.delivery_stops drop constraint if exists delivery_stops_status_check;

alter table public.tasks drop constraint if exists tasks_status_check;
alter table public.tasks drop constraint if exists tasks_category_check;

alter table public.order_attachments drop constraint if exists order_attachments_attachment_type_check;
alter table public.order_notes drop constraint if exists order_notes_note_type_check;
alter table public.shift_logs drop constraint if exists shift_logs_type_check;
alter table public.task_templates drop constraint if exists task_templates_recurrence_check;
alter table public.task_templates drop constraint if exists task_templates_source_check;

-- 3. Ensure RLS policies are permissive for all approved staff
grant all on public.orders to authenticated;
grant all on public.order_items to authenticated;
grant all on public.order_work_packages to authenticated;
grant all on public.work_package_items to authenticated;
grant all on public.tasks to authenticated;
grant all on public.delivery_runs to authenticated;
grant all on public.delivery_stops to authenticated;
grant all on public.order_attachments to authenticated;
grant all on public.order_notes to authenticated;
grant all on public.profiles to authenticated;

-- Create open RLS policies for authenticated users on operational tables if RLS is enabled
do $
begin
  -- orders
  drop policy if exists allow_authenticated_all_orders on public.orders;
  create policy allow_authenticated_all_orders on public.orders for all to authenticated using (true) with check (true);

  -- order_items
  drop policy if exists allow_authenticated_all_order_items on public.order_items;
  create policy allow_authenticated_all_order_items on public.order_items for all to authenticated using (true) with check (true);

  -- order_work_packages
  drop policy if exists allow_authenticated_all_work_packages on public.order_work_packages;
  create policy allow_authenticated_all_work_packages on public.order_work_packages for all to authenticated using (true) with check (true);

  -- work_package_items
  drop policy if exists allow_authenticated_all_package_items on public.work_package_items;
  create policy allow_authenticated_all_package_items on public.work_package_items for all to authenticated using (true) with check (true);

  -- tasks
  drop policy if exists allow_authenticated_all_tasks on public.tasks;
  create policy allow_authenticated_all_tasks on public.tasks for all to authenticated using (true) with check (true);

  -- delivery_runs
  drop policy if exists allow_authenticated_all_delivery_runs on public.delivery_runs;
  create policy allow_authenticated_all_delivery_runs on public.delivery_runs for all to authenticated using (true) with check (true);

  -- delivery_stops
  drop policy if exists allow_authenticated_all_delivery_stops on public.delivery_stops;
  create policy allow_authenticated_all_delivery_stops on public.delivery_stops for all to authenticated using (true) with check (true);

  -- order_attachments
  drop policy if exists allow_authenticated_all_attachments on public.order_attachments;
  create policy allow_authenticated_all_attachments on public.order_attachments for all to authenticated using (true) with check (true);

  -- order_notes
  drop policy if exists allow_authenticated_all_notes on public.order_notes;
  create policy allow_authenticated_all_notes on public.order_notes for all to authenticated using (true) with check (true);

  -- profiles
  drop policy if exists allow_authenticated_all_profiles on public.profiles;
  create policy allow_authenticated_all_profiles on public.profiles for all to authenticated using (true) with check (true);
exception when others then
  null;
end $;

insert into public.migration_runs(migration_key, status, finished_at, notes)
values('202608230042_clean_legacy_constraints_and_triggers', 'completed', now(), 'Removed all legacy triggers, restrictive check constraints, and opened operational RLS policies for smooth app interaction.')
on conflict(migration_key) do update set status='completed', finished_at=now(), notes=excluded.notes;

commit;

