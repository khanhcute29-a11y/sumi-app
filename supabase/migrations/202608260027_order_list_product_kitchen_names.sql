-- SUMI APP — Hiện tên khách, tên sản phẩm, bếp phụ trách ngay trên danh sách đơn hàng
-- (thêm product_names + kitchen_names vào view order_operations_list, giữ nguyên các cột khác)

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
 kitchens.kitchen_names
from public.orders o left join public.customers c on c.id=o.customer_id
left join lateral(select min(wp.accepted_at) started_at,case when count(*)>0 and bool_and(wp.completed_at is not null) then max(wp.completed_at) end completed_at from public.order_work_packages wp where wp.order_id=o.id and wp.status<>'cancelled') prod on true
left join lateral(select r.started_at,s.delivered_at,r.provider,r.provider_label,r.shipping_fee,p.full_name driver_name from public.delivery_stops s join public.delivery_runs r on r.id=s.delivery_run_id left join public.profiles p on p.id=r.assigned_driver_id where s.order_id=o.id order by r.created_at desc limit 1) delivery on true
left join lateral(select string_agg(distinct oi.name, ', ') product_names from public.order_items oi where oi.order_id=o.id) items on true
left join lateral(select string_agg(distinct ou.name, ', ') kitchen_names from public.order_work_packages wp join public.organization_units ou on ou.id=wp.unit_id where wp.order_id=o.id and wp.status<>'cancelled') kitchens on true;

insert into public.migration_runs(migration_key,status,finished_at,notes) values('202608260027_order_list_product_kitchen_names','completed',now(),'Added product_names and kitchen_names to order_operations_list for order list display.') on conflict(migration_key) do update set status='completed',finished_at=now(),notes=excluded.notes;
