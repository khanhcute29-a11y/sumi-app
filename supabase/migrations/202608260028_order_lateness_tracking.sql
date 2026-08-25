-- SUMI APP — Đơn trễ vẫn cho nhận/giao bình thường, nhưng hệ thống tự đánh dấu
-- trễ và ghi lại đúng nhân viên nào trễ đơn nào (dựa trên dấu thời gian đã có
-- sẵn, không chặn bất kỳ hành động nào — chỉ ghi nhận để xem lại).

create or replace view public.order_lateness_detail with (security_invoker=true) as
select
  o.id order_id, o.order_code, o.required_at,
  wp.id work_package_id, ou.name kitchen_name,
  wp.accepted_by kitchen_staff_id, pk.full_name kitchen_staff_name,
  wp.completed_at kitchen_completed_at,
  (o.required_at is not null and wp.completed_at is not null and wp.completed_at > o.required_at) kitchen_late,
  case when o.required_at is not null and wp.completed_at is not null and wp.completed_at > o.required_at
    then greatest(0, floor(extract(epoch from(wp.completed_at - o.required_at))/60))::int end kitchen_late_minutes,
  r.id delivery_run_id, r.assigned_driver_id shipper_staff_id, ps.full_name shipper_staff_name,
  s.delivered_at shipper_delivered_at,
  (o.required_at is not null and s.delivered_at is not null and s.delivered_at > o.required_at) shipper_late,
  case when o.required_at is not null and s.delivered_at is not null and s.delivered_at > o.required_at
    then greatest(0, floor(extract(epoch from(s.delivered_at - o.required_at))/60))::int end shipper_late_minutes
from public.orders o
left join public.order_work_packages wp on wp.order_id = o.id and wp.status <> 'cancelled'
left join public.organization_units ou on ou.id = wp.unit_id
left join public.profiles pk on pk.id = wp.accepted_by
left join public.delivery_stops s on s.order_id = o.id
left join public.delivery_runs r on r.id = s.delivery_run_id
left join public.profiles ps on ps.id = r.assigned_driver_id;

-- Tóm tắt trễ trên danh sách đơn (order_operations_list) — không chặn nhận/giao,
-- chỉ hiện badge "Trễ" kèm tên nhân viên đã trễ.
create or replace view public.order_operations_list with (security_invoker=true) as
select o.id,o.order_code,o.order_type,o.status_v2,o.required_at,o.fulfillment_method_v2,o.address,o.confidentiality,o.created_by_name,o.created_at,o.completed_at,
 coalesce((select sum(oi.quantity) from public.order_items oi where oi.order_id=o.id),0) total_quantity,
 (select count(*) from public.order_work_packages wp where wp.order_id=o.id) package_count,
 (select count(*) from public.order_work_packages wp where wp.order_id=o.id and wp.status='completed') completed_package_count,
 prod.started_at production_started_at,prod.completed_at production_completed_at,
 case when prod.started_at is not null and prod.completed_at is not null then greatest(0,floor(extract(epoch from(prod.completed_at-prod.started_at))/60))::int end production_minutes,
 delivery.started_at delivery_started_at,coalesce(delivery.delivered_at,o.completed_at) delivery_completed_at,
 case when delivery.started_at is not null and coalesce(delivery.delivered_at,o.completed_at) is not null then greatest(0,floor(extract(epoch from(coalesce(delivery.delivered_at,o.completed_at)-delivery.started_at))/60))::int end delivery_minutes,
 delivery.provider delivery_provider,delivery.provider_label,delivery.shipping_fee,delivery.driver_name,
 (o.status_v2 not in('completed','cancelled') and o.required_at is not null and o.required_at<now()) is_overdue,
 case when o.status_v2 not in('completed','cancelled') and o.required_at is not null and o.required_at<now() then case o.status_v2 when 'awaiting_assignment' then 'Chưa phân bếp' when 'awaiting_acceptance' then 'Bếp chưa nhận' when 'in_production' then 'Bếp chưa hoàn thành' when 'ready_for_fulfillment' then 'Vận tải chưa nhận' when 'in_delivery' then 'Vận tải chưa hoàn thành' else 'Chưa thực hiện' end end overdue_stage,
 case when o.status_v2 not in('completed','cancelled') and o.required_at is not null and o.required_at<now() then floor(extract(epoch from(now()-o.required_at))/60)::int else 0 end overdue_minutes,
 coalesce(c.name,nullif(substring(o.note from 'Khách hàng: ([^·]+)'),'') ,o.created_by_name) customer_name,
 case o.order_type when 'cake' then 'Bánh kem & bánh lạnh' when 'bakery' then 'Bánh mặn/ngọt & bánh khác' when 'macaron' then 'Macaron' when 'school' then 'Trường học' when 'teabreak' then 'Teabreak' when 'mixed' then 'Đơn nhiều loại' else o.order_type end order_type_label,
 items.product_names,
 kitchens.kitchen_names,
 late.was_late,
 late.late_staff_names
from public.orders o left join public.customers c on c.id=o.customer_id
left join lateral(select min(wp.accepted_at) started_at,case when count(*)>0 and bool_and(wp.completed_at is not null) then max(wp.completed_at) end completed_at from public.order_work_packages wp where wp.order_id=o.id and wp.status<>'cancelled') prod on true
left join lateral(select r.started_at,s.delivered_at,r.provider,r.provider_label,r.shipping_fee,p.full_name driver_name from public.delivery_stops s join public.delivery_runs r on r.id=s.delivery_run_id left join public.profiles p on p.id=r.assigned_driver_id where s.order_id=o.id order by r.created_at desc limit 1) delivery on true
left join lateral(select string_agg(distinct oi.name, ', ') product_names from public.order_items oi where oi.order_id=o.id) items on true
left join lateral(select string_agg(distinct ou.name, ', ') kitchen_names from public.order_work_packages wp join public.organization_units ou on ou.id=wp.unit_id where wp.order_id=o.id and wp.status<>'cancelled') kitchens on true
left join lateral(
  select
    bool_or(coalesce(d.kitchen_late,false) or coalesce(d.shipper_late,false)) was_late,
    (select string_agg(distinct name, ', ') from (
       select kitchen_staff_name as name from public.order_lateness_detail where order_id = o.id and kitchen_late and kitchen_staff_name is not null
       union
       select shipper_staff_name as name from public.order_lateness_detail where order_id = o.id and shipper_late and shipper_staff_name is not null
     ) names) late_staff_names
  from public.order_lateness_detail d where d.order_id = o.id
) late on true;

insert into public.migration_runs(migration_key,status,finished_at,notes) values('202608260028_order_lateness_tracking','completed',now(),'Added order_lateness_detail view + was_late/late_staff_names summary on order_operations_list — reporting only, does not block accept/deliver actions.') on conflict(migration_key) do update set status='completed',finished_at=now(),notes=excluded.notes;
