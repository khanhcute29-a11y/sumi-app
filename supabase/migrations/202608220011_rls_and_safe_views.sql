-- SUMI APP M11 — least-privilege RLS and security-invoker read models.

begin;

drop policy if exists "read order_items" on public.order_items;
create policy "read order_items" on public.order_items for select to authenticated
using(public.is_approved() and exists(select 1 from public.orders o where o.id=order_id));

drop policy if exists "read order_stages" on public.order_stages;
create policy "read order_stages" on public.order_stages for select to authenticated
using(public.is_approved() and exists(select 1 from public.orders o where o.id=order_id));

drop policy if exists "read order_notes" on public.order_notes;
create policy "read order_notes" on public.order_notes for select to authenticated
using(public.is_approved() and exists(select 1 from public.orders o where o.id=order_id));

drop policy if exists "read own or owner tasks" on public.tasks;
drop policy if exists "read assigned or managed tasks" on public.tasks;
create policy "read assigned or managed tasks" on public.tasks for select to authenticated using(
 assignee_id=auth.uid() or created_by=auth.uid() or public.is_business_director()
 or exists(select 1 from public.order_work_packages wp join public.profile_assignments pa on pa.unit_id=wp.unit_id
   where wp.id=work_package_id and pa.profile_id=auth.uid() and pa.position_code in ('kitchen_lead','kitchen_deputy') and pa.valid_to is null));

drop policy if exists "read incident_reports" on public.incident_reports;
create policy "read incident_reports" on public.incident_reports for select to authenticated using(
 public.is_approved() and (order_id is null or exists(select 1 from public.orders o where o.id=order_id)));

-- All state changes now go through audited SECURITY DEFINER commands.
revoke insert,update,delete on public.orders from authenticated;
revoke insert,update,delete on public.order_items from authenticated;
revoke insert,update,delete on public.order_work_packages from authenticated;
revoke insert,update,delete on public.work_package_items from authenticated;
revoke insert,update,delete on public.production_batches from authenticated;
revoke insert,update,delete on public.inventory_documents from authenticated;
revoke insert,update,delete on public.inventory_document_lines from authenticated;
revoke insert,update,delete on public.delivery_runs from authenticated;
revoke insert,update,delete on public.delivery_stops from authenticated;
revoke insert,update,delete on public.tasks from authenticated;

create or replace view public.order_operations_list
with (security_invoker=true) as
select o.id,o.order_code,o.order_type,o.status_v2,o.required_at,o.fulfillment_method_v2,o.address,
 o.confidentiality,o.created_by_name,o.created_at,o.completed_at,
 coalesce((select sum(oi.quantity) from public.order_items oi where oi.order_id=o.id),0) as total_quantity,
 (select count(*) from public.order_work_packages wp where wp.order_id=o.id) as package_count,
 (select count(*) from public.order_work_packages wp where wp.order_id=o.id and wp.status='completed') as completed_package_count
from public.orders o;

create or replace view public.my_task_queue
with (security_invoker=true) as
select t.id,t.title,t.description,t.status,t.deadline,t.started_at,t.completed_at,t.required_proof_types,
 t.work_package_id,wp.order_id,o.order_code,o.order_type,wp.unit_id,t.assignee_id
from public.tasks t
left join public.order_work_packages wp on wp.id=t.work_package_id
left join public.orders o on o.id=wp.order_id
where t.assignee_id=auth.uid();

create or replace view public.school_kitchen_queue
with (security_invoker=true) as
select wp.id as work_package_id,wp.status as package_status,wp.due_at,wp.version,
 o.id as order_id,o.order_code,o.required_at,
 oi.id as order_item_id,oi.name_snapshot,oi.quantity,oi.unit,oi.specification,wpi.quantity as assigned_quantity
from public.order_work_packages wp
join public.organization_units ou on ou.id=wp.unit_id and ou.code='X42_KITCHEN'
join public.orders o on o.id=wp.order_id and o.confidentiality='school_restricted'
join public.work_package_items wpi on wpi.work_package_id=wp.id
join public.order_items oi on oi.id=wpi.order_item_id;

create or replace view public.director_order_financials
with (security_invoker=true) as
select o.id as order_id,o.order_code,o.order_type,f.total_amount,f.deposit_amount,f.paid_amount,
 f.shipping_amount,f.payment_method,f.payment_status,f.updated_at
from public.orders o join public.order_financials f on f.order_id=o.id
where o.confidentiality<>'school_restricted';

revoke all on public.order_operations_list,public.my_task_queue,public.school_kitchen_queue,public.director_order_financials from anon;
grant select on public.order_operations_list,public.my_task_queue,public.school_kitchen_queue,public.director_order_financials to authenticated;

-- Prevent accidental exposure through default grants for future objects.
alter default privileges for role postgres in schema public revoke select,insert,update,delete on tables from anon;
alter default privileges for role postgres in schema public revoke execute on functions from public,anon;
alter default privileges for role postgres in schema public revoke usage,select on sequences from anon;

insert into public.migration_runs(migration_key,status,finished_at,notes)
values('202608220011_rls_and_safe_views','completed',now(),'Restricted direct writes and created security-invoker operational, task, school and finance read models.')
on conflict(migration_key) do update set status='completed',finished_at=now(),notes=excluded.notes;
commit;
