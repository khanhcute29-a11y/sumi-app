-- SUMI APP M29 — operational timing, overdue accountability and external delivery.
begin;

alter table public.delivery_runs add column if not exists provider text not null default 'internal';
alter table public.delivery_runs add column if not exists provider_label text;
alter table public.delivery_runs add column if not exists shipping_fee numeric(14,2);
alter table public.delivery_runs drop constraint if exists delivery_runs_provider_check;
alter table public.delivery_runs add constraint delivery_runs_provider_check check(provider in ('internal','grab','external'));
alter table public.delivery_runs drop constraint if exists delivery_runs_shipping_fee_check;
alter table public.delivery_runs add constraint delivery_runs_shipping_fee_check check(shipping_fee is null or shipping_fee>=0);

create or replace view public.order_operations_list
with (security_invoker=true) as
select o.id,o.order_code,o.order_type,o.status_v2,o.required_at,o.fulfillment_method_v2,o.address,
 o.confidentiality,o.created_by_name,o.created_at,o.completed_at,
 coalesce((select sum(oi.quantity) from public.order_items oi where oi.order_id=o.id),0) as total_quantity,
 (select count(*) from public.order_work_packages wp where wp.order_id=o.id) as package_count,
 (select count(*) from public.order_work_packages wp where wp.order_id=o.id and wp.status='completed') as completed_package_count,
 prod.started_at as production_started_at,prod.completed_at as production_completed_at,
 case when prod.started_at is not null and prod.completed_at is not null then greatest(0,floor(extract(epoch from (prod.completed_at-prod.started_at))/60))::int end as production_minutes,
 delivery.started_at as delivery_started_at,coalesce(delivery.delivered_at,o.completed_at) as delivery_completed_at,
 case when delivery.started_at is not null and coalesce(delivery.delivered_at,o.completed_at) is not null then greatest(0,floor(extract(epoch from (coalesce(delivery.delivered_at,o.completed_at)-delivery.started_at))/60))::int end as delivery_minutes,
 delivery.provider as delivery_provider,delivery.provider_label,delivery.shipping_fee,delivery.driver_name,
 (o.status_v2 not in ('completed','cancelled') and o.required_at is not null and o.required_at<now()) as is_overdue,
 case when o.status_v2 not in ('completed','cancelled') and o.required_at is not null and o.required_at<now() then case o.status_v2
  when 'awaiting_assignment' then 'Chưa phân bếp'
  when 'awaiting_acceptance' then 'Bếp chưa nhận'
  when 'in_production' then 'Bếp chưa hoàn thành'
  when 'ready_for_fulfillment' then 'Vận tải chưa nhận'
  when 'in_delivery' then 'Vận tải chưa hoàn thành'
  else 'Chưa thực hiện' end end as overdue_stage,
 case when o.status_v2 not in ('completed','cancelled') and o.required_at is not null and o.required_at<now() then floor(extract(epoch from (now()-o.required_at))/60)::int else 0 end as overdue_minutes
from public.orders o
left join lateral(select min(wp.accepted_at) started_at,case when count(*)>0 and bool_and(wp.completed_at is not null) then max(wp.completed_at) end completed_at from public.order_work_packages wp where wp.order_id=o.id and wp.status<>'cancelled') prod on true
left join lateral(
 select r.started_at,s.delivered_at,r.provider,r.provider_label,r.shipping_fee,p.full_name driver_name
 from public.delivery_stops s join public.delivery_runs r on r.id=s.delivery_run_id
 left join public.profiles p on p.id=r.assigned_driver_id where s.order_id=o.id order by r.created_at desc limit 1
) delivery on true;

create or replace function public.create_delivery_run_v3(p_idempotency_key text,p_driver_id uuid,p_order_ids uuid[],p_planned_distance_km numeric,p_provider text,p_provider_label text,p_shipping_fee numeric)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_actor uuid:=auth.uid();v_run uuid;v_order uuid;v_seq int:=0;v_provider text:=coalesce(p_provider,'internal');
begin
 if not public.is_business_director() and not exists(select 1 from public.profile_assignments pa join public.organization_units ou on ou.id=pa.unit_id where pa.profile_id=v_actor and ou.code='TRANSPORT_LEAD' and pa.valid_to is null) then raise exception 'delivery assignment permission required'; end if;
 if v_provider not in ('internal','grab','external') then raise exception 'invalid delivery provider'; end if;
 if v_provider='internal' and not exists(select 1 from public.profiles where id=p_driver_id and approved and active) then raise exception 'driver inactive'; end if;
 if v_provider<>'internal' and trim(coalesce(p_provider_label,''))='' then raise exception 'provider name required'; end if;
 if coalesce(array_length(p_order_ids,1),0)=0 then raise exception 'orders required'; end if;
 select result_entity_id into v_run from public.command_idempotency where idempotency_key=p_idempotency_key and actor_id=v_actor;
 if v_run is not null then return v_run; end if;
 if exists(select 1 from public.orders where id=any(p_order_ids) and status_v2<>'ready_for_fulfillment' and not allow_partial_fulfillment) then raise exception 'order is not ready for delivery'; end if;
 insert into public.delivery_runs(run_code,assigned_driver_id,assigned_by,status,planned_distance_km,distance_source,provider,provider_label,shipping_fee)
 values('RUN-'||to_char(now(),'YYMMDD-HH24MI')||'-'||upper(substr(md5(p_idempotency_key),1,4)),case when v_provider='internal' then p_driver_id end,v_actor,'planned',p_planned_distance_km,case when p_planned_distance_km is null then null else 'planned' end,v_provider,nullif(trim(coalesce(p_provider_label,'')),''),p_shipping_fee) returning id into v_run;
 foreach v_order in array p_order_ids loop v_seq:=v_seq+1;
  insert into public.delivery_stops(delivery_run_id,order_id,sequence_no,status,destination_address,destination_lat,destination_lng) select v_run,id,v_seq,'pending',address,delivery_lat,delivery_lng from public.orders where id=v_order;
  update public.orders set status_v2='ready_for_fulfillment',shipper_staff_name=case when v_provider='internal' then (select full_name from public.profiles where id=p_driver_id) else coalesce(nullif(trim(p_provider_label),''),upper(v_provider)) end,version=version+1 where id=v_order;
  insert into public.domain_events(event_type,entity_type,entity_id,actor_id,payload,idempotency_key,confidentiality) select 'delivery_assigned','order',id,v_actor,jsonb_build_object('delivery_run_id',v_run,'driver_id',p_driver_id,'provider',v_provider,'provider_label',p_provider_label,'shipping_fee',p_shipping_fee),p_idempotency_key||':event:'||id,confidentiality from public.orders where id=v_order;
 end loop;
 if v_provider='internal' then insert into public.notifications(event_key,recipient_profile_id,notification_type,sound_key,title,body,entity_type,entity_id,deep_link) values(p_idempotency_key||':notify',p_driver_id,'delivery_assigned','ting','Bạn có chuyến giao mới',v_seq||' điểm giao','delivery_run',v_run,'/shipping/'||v_run); end if;
 insert into public.command_idempotency values(p_idempotency_key,'create_delivery_run_v3',v_actor,v_run,now());return v_run;
end $$;

create or replace function public.start_delivery_run_v3(p_idempotency_key text,p_run_id uuid,p_expected_version integer,p_lat numeric,p_lng numeric)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_actor uuid:=auth.uid();v_run public.delivery_runs%rowtype;
begin select * into v_run from public.delivery_runs where id=p_run_id for update;
 if v_run.id is null or v_run.version<>p_expected_version then raise exception 'run version conflict'; end if;
 if v_run.provider='internal' then
  if v_run.assigned_driver_id<>v_actor or v_run.status<>'accepted' then raise exception 'run cannot be started'; end if;
 elsif not public.is_business_director() and not exists(select 1 from public.profile_assignments pa join public.organization_units ou on ou.id=pa.unit_id where pa.profile_id=v_actor and ou.code='TRANSPORT_LEAD' and pa.valid_to is null) then raise exception 'external delivery permission required';
 end if;
 update public.delivery_runs set status='in_transit',started_at=now(),start_lat=p_lat,start_lng=p_lng,version=version+1 where id=p_run_id;
 update public.orders set status='dang_giao',status_v2='in_delivery',version=version+1 where id in(select order_id from public.delivery_stops where delivery_run_id=p_run_id);
 return p_run_id;end $$;

create or replace function public.complete_delivery_stop(p_idempotency_key text,p_stop_id uuid,p_proof_attachment_id uuid,p_lat numeric,p_lng numeric,p_recipient text)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_actor uuid:=auth.uid();v_stop public.delivery_stops%rowtype;v_run public.delivery_runs%rowtype;v_remaining int;v_conf text;
begin
 select * into v_stop from public.delivery_stops where id=p_stop_id for update;select * into v_run from public.delivery_runs where id=v_stop.delivery_run_id for update;
 if v_run.assigned_driver_id<>v_actor and not (v_run.provider<>'internal' and public.is_business_director()) and not exists(select 1 from public.delivery_delegations d where d.order_id=v_stop.order_id and d.delegate_profile_id=v_actor and d.status='approved' and d.valid_from<=now() and (d.valid_to is null or d.valid_to>now())) then raise exception 'delivery permission required'; end if;
 update public.delivery_stops set status='delivered',delivered_at=now(),recipient_name=p_recipient,proof_attachment_id=p_proof_attachment_id,destination_lat=p_lat,destination_lng=p_lng where id=p_stop_id;
 update public.orders set status='hoan_thanh',status_v2='completed',completed_at=now(),version=version+1 where id=v_stop.order_id;
 select confidentiality into v_conf from public.orders where id=v_stop.order_id;select count(*) into v_remaining from public.delivery_stops where delivery_run_id=v_run.id and id<>p_stop_id and status<>'delivered';
 if v_remaining=0 then update public.delivery_runs set status='completed',completed_at=now(),end_lat=p_lat,end_lng=p_lng,version=version+1 where id=v_run.id; end if;
 insert into public.domain_events(event_type,entity_type,entity_id,actor_id,payload,idempotency_key,confidentiality) values('delivery_completed','order',v_stop.order_id,v_actor,jsonb_build_object('delivery_stop_id',p_stop_id,'recipient',p_recipient,'delivery_minutes',case when v_run.started_at is null then null else floor(extract(epoch from (now()-v_run.started_at))/60)::int end),p_idempotency_key||':event',v_conf);
 insert into public.notifications(event_key,recipient_role,notification_type,sound_key,title,body,entity_type,entity_id,deep_link) values(p_idempotency_key||':cash','owner','delivery_completed','cash_complete','Giao hàng thành công','Đơn đã giao và hoàn thành','order',v_stop.order_id,'/orders/'||v_stop.order_id);return p_stop_id;
end $$;

revoke all on function public.create_delivery_run_v3(text,uuid,uuid[],numeric,text,text,numeric) from public,anon;
revoke all on function public.start_delivery_run_v3(text,uuid,integer,numeric,numeric) from public,anon;
grant execute on function public.create_delivery_run_v3(text,uuid,uuid[],numeric,text,text,numeric) to authenticated;
grant execute on function public.start_delivery_run_v3(text,uuid,integer,numeric,numeric) to authenticated;

insert into public.migration_runs(migration_key,status,finished_at,notes) values('202608230029_order_operational_timing','completed',now(),'Added order timing, overdue accountability, delivery providers and shipping fees.') on conflict(migration_key) do update set status='completed',finished_at=now(),notes=excluded.notes;
commit;
