-- SUMI APP M31 — order overview, operational reminders and three daily shifts.
begin;

drop index if exists public.uniq_shift_checkin_per_day;
drop index if exists public.uniq_shift_checkout_per_day;
create unique index if not exists uniq_shift_checkin_per_shift on public.shift_logs(staff_id,work_date,shift_label) where type='checkin';
create unique index if not exists uniq_shift_checkout_per_shift on public.shift_logs(staff_id,work_date,shift_label) where type='checkout';

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
 case o.order_type when 'cake' then 'Bánh kem & bánh lạnh' when 'bakery' then 'Bánh mặn/ngọt & bánh khác' when 'macaron' then 'Macaron' when 'school' then 'Trường học' when 'teabreak' then 'Teabreak' when 'mixed' then 'Đơn nhiều loại' else o.order_type end order_type_label
from public.orders o left join public.customers c on c.id=o.customer_id
left join lateral(select min(wp.accepted_at) started_at,case when count(*)>0 and bool_and(wp.completed_at is not null) then max(wp.completed_at) end completed_at from public.order_work_packages wp where wp.order_id=o.id and wp.status<>'cancelled') prod on true
left join lateral(select r.started_at,s.delivered_at,r.provider,r.provider_label,r.shipping_fee,p.full_name driver_name from public.delivery_stops s join public.delivery_runs r on r.id=s.delivery_run_id left join public.profiles p on p.id=r.assigned_driver_id where s.order_id=o.id order by r.created_at desc limit 1) delivery on true;

create or replace function public.enqueue_order_operational_alerts() returns integer language plpgsql security definer set search_path=public as $$
declare v_count int:=0;v_bucket text:=floor(extract(epoch from now())/300)::bigint::text;
begin
 insert into public.notifications(event_key,recipient_role,notification_type,severity,sound_key,title,body,entity_type,entity_id,deep_link)
 select 'order-waiting:'||o.id||':'||v_bucket,'kitchen_lead','order_waiting','high','new_order','Đơn chưa có bếp nhận',coalesce(o.order_code,'Đơn mới')||' đã chờ trên 30 phút','order',o.id,'/orders/'||o.id from public.orders o where o.status_v2 in('awaiting_assignment','awaiting_acceptance') and o.created_at<=now()-interval '30 minutes' on conflict(event_key) do nothing; get diagnostics v_count=row_count;
 insert into public.notifications(event_key,recipient_role,notification_type,severity,sound_key,title,body,entity_type,entity_id,deep_link)
 select 'order-ready:'||v.id||':'||v_bucket,'shipper','delivery_waiting','high','ting','Đơn chờ giao quá 30 phút',coalesce(v.order_code,'Đơn')||' đã hoàn thành, chưa bắt đầu giao','order',v.id,'/orders/'||v.id from public.order_operations_list v where v.status_v2='ready_for_fulfillment' and v.production_completed_at<=now()-interval '30 minutes' on conflict(event_key) do nothing;
 insert into public.notifications(event_key,recipient_role,notification_type,severity,sound_key,title,body,entity_type,entity_id,deep_link)
 select 'order-due:'||o.id||':'||v_bucket,case when o.status_v2 in('ready_for_fulfillment','in_delivery') then 'shipper' else 'kitchen_lead' end,'order_due_soon','critical','ting','Đơn sắp tới giờ hẹn',coalesce(o.order_code,'Đơn')||' còn dưới 45 phút tới giờ khách hẹn','order',o.id,'/orders/'||o.id from public.orders o where o.status_v2 not in('completed','cancelled') and o.required_at between now() and now()+interval '45 minutes' on conflict(event_key) do nothing;
 return v_count;end $$;
revoke all on function public.enqueue_order_operational_alerts() from public,anon;grant execute on function public.enqueue_order_operational_alerts() to authenticated;

insert into public.migration_runs(migration_key,status,finished_at,notes) values('202608230031_order_overview_alerts_three_shifts','completed',now(),'Order overview details, repeating operational alerts, and morning/afternoon/night shift punches.') on conflict(migration_key) do update set status='completed',finished_at=now(),notes=excluded.notes;
commit;
