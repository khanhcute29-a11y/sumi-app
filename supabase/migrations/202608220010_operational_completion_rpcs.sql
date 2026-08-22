-- SUMI APP M10 — task completion, production receipt and delivery completion commands.

begin;

create or replace function public.complete_task_v2(p_idempotency_key text,p_task_id uuid,p_expected_version integer,p_note text default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_actor uuid:=auth.uid(); v_task public.tasks%rowtype; v_missing text[];
begin
 select * into v_task from public.tasks where id=p_task_id for update;
 if v_task.id is null or v_task.assignee_id<>v_actor then raise exception 'task is not assigned to caller'; end if;
 if v_task.version<>p_expected_version then raise exception 'task version conflict'; end if;
 if v_task.status='done' then return p_task_id; end if;
 select array_agg(x) into v_missing from unnest(v_task.required_proof_types) x
 where not exists(select 1 from public.task_proofs tp where tp.task_id=p_task_id and tp.proof_type=x);
 if coalesce(array_length(v_missing,1),0)>0 then raise exception 'missing required proof: %',v_missing; end if;
 update public.tasks set status='done',completed_at=now(),version=version+1,
  description=case when p_note is null then description else concat_ws(E'\n',description,p_note) end where id=p_task_id;
 insert into public.domain_events(event_type,entity_type,entity_id,actor_id,payload,idempotency_key)
 values('task_completed','task',p_task_id,v_actor,jsonb_build_object('work_package_id',v_task.work_package_id),p_idempotency_key||':event')
 on conflict(idempotency_key) do nothing;
 return p_task_id;
end $$;

create or replace function public.approve_partial_fulfillment(p_idempotency_key text,p_order_id uuid,p_expected_version integer,p_reason text)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_actor uuid:=auth.uid(); v_version int; v_conf text;
begin
 if not public.is_business_director() then raise exception 'director permission required'; end if;
 select version,confidentiality into v_version,v_conf from public.orders where id=p_order_id for update;
 if v_version<>p_expected_version then raise exception 'order version conflict'; end if;
 update public.orders set allow_partial_fulfillment=true,partial_fulfillment_approved_by=v_actor,
  partial_fulfillment_approved_at=now(),version=version+1 where id=p_order_id;
 insert into public.domain_events(event_type,entity_type,entity_id,actor_id,payload,idempotency_key,confidentiality)
 values('partial_fulfillment_approved','order',p_order_id,v_actor,jsonb_build_object('reason',p_reason),p_idempotency_key||':event',v_conf)
 on conflict(idempotency_key) do nothing;
 return p_order_id;
end $$;

create or replace function public.approve_work_package_completion(p_idempotency_key text,p_package_id uuid,p_expected_version integer)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_actor uuid:=auth.uid(); v_wp public.order_work_packages%rowtype; v_unit_code text; v_wh uuid; v_doc uuid; v_line uuid;
 v_item record; v_inventory_item uuid; v_all_done boolean; v_conf text; v_order_code text;
begin
 select * into v_wp from public.order_work_packages where id=p_package_id for update;
 if v_wp.id is null or v_wp.version<>p_expected_version then raise exception 'package version conflict'; end if;
 if not public.is_business_director() and not exists(select 1 from public.profile_assignments pa where pa.profile_id=v_actor
  and pa.unit_id=v_wp.unit_id and pa.position_code in ('kitchen_lead','kitchen_deputy') and pa.valid_to is null)
 then raise exception 'kitchen lead permission required'; end if;
 if exists(select 1 from public.tasks t where t.work_package_id=p_package_id and t.status not in ('done','exempted'))
 then raise exception 'all assigned tasks must be completed'; end if;
 select code into v_unit_code from public.organization_units where id=v_wp.unit_id;
 select id into v_wh from public.warehouses where code=case
  when v_unit_code='X41_KITCHEN' then 'X41_MACARON_FG'
  when v_unit_code='X42_KITCHEN' then 'X42_BLIND_DISPATCH'
  else 'BAKERY_FG' end;
 select order_code,confidentiality into v_order_code,v_conf from public.orders where id=v_wp.order_id for update;
 insert into public.inventory_documents(document_code,document_type,destination_warehouse_id,order_id,work_package_id,status,
  created_by,approved_by,approval_status,received_at,reason,idempotency_key)
 values('PROD-'||upper(substr(md5(p_idempotency_key),1,12)),'production_receipt',v_wh,v_wp.order_id,p_package_id,'completed',
  v_actor,v_actor,'approved',now(),'Completed production package',p_idempotency_key||':inventory') returning id into v_doc;
 for v_item in select oi.*,wpi.quantity package_quantity from public.work_package_items wpi join public.order_items oi on oi.id=wpi.order_item_id
  where wpi.work_package_id=p_package_id loop
  insert into public.inventory_items(sku,name,item_type,base_unit,legacy_source_type,legacy_source_id)
  values('ORDERITEM-'||upper(substr(md5(v_item.id::text),1,12)),v_item.name_snapshot,'finished_product',v_item.unit,'order_item',v_item.id)
  on conflict(legacy_source_type,legacy_source_id) do update set name=excluded.name returning id into v_inventory_item;
  insert into public.inventory_document_lines(document_id,inventory_item_id,planned_quantity,received_quantity,unit)
  values(v_doc,v_inventory_item,v_item.package_quantity,v_item.package_quantity,v_item.unit) returning id into v_line;
  insert into public.inventory_ledger(warehouse_id,inventory_item_id,document_line_id,quantity_delta)
  values(v_wh,v_inventory_item,v_line,v_item.package_quantity);
 end loop;
 update public.order_work_packages set status='completed',completed_at=now(),approved_by=v_actor,approved_at=now(),version=version+1 where id=p_package_id;
 select not exists(select 1 from public.order_work_packages where order_id=v_wp.order_id and status not in ('completed','cancelled')) into v_all_done;
 if v_all_done then update public.orders set status_v2='ready_for_fulfillment',version=version+1 where id=v_wp.order_id; end if;
 insert into public.domain_events(event_type,entity_type,entity_id,actor_id,payload,idempotency_key,confidentiality)
 values('work_package_completed','order',v_wp.order_id,v_actor,jsonb_build_object('work_package_id',p_package_id,'warehouse_id',v_wh),p_idempotency_key||':event',v_conf);
 if v_all_done then
  insert into public.notifications(event_key,recipient_unit_id,notification_type,sound_key,title,body,entity_type,entity_id,deep_link)
  select p_idempotency_key||':transport',id,'order_ready','ting','Đơn chờ vận chuyển','Đơn '||coalesce(v_order_code,'')||' đã đủ hàng','order',v_wp.order_id,'/orders/'||v_wp.order_id
  from public.organization_units where code='TRANSPORT';
 end if;
 return p_package_id;
end $$;

create or replace function public.complete_delivery_stop(p_idempotency_key text,p_stop_id uuid,p_proof_attachment_id uuid,
 p_lat numeric,p_lng numeric,p_recipient text)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_actor uuid:=auth.uid(); v_stop public.delivery_stops%rowtype; v_run public.delivery_runs%rowtype; v_remaining int; v_conf text;
begin
 select * into v_stop from public.delivery_stops where id=p_stop_id for update;
 select * into v_run from public.delivery_runs where id=v_stop.delivery_run_id for update;
 if v_run.assigned_driver_id<>v_actor and not exists(select 1 from public.delivery_delegations d where d.order_id=v_stop.order_id
  and d.delegate_profile_id=v_actor and d.status='approved' and d.valid_from<=now() and (d.valid_to is null or d.valid_to>now()))
 then raise exception 'delivery permission required'; end if;
 update public.delivery_stops set status='delivered',delivered_at=now(),recipient_name=p_recipient,
  proof_attachment_id=p_proof_attachment_id,destination_lat=p_lat,destination_lng=p_lng where id=p_stop_id;
 update public.orders set status='hoan_thanh',status_v2='completed',completed_at=now(),version=version+1 where id=v_stop.order_id;
 select confidentiality into v_conf from public.orders where id=v_stop.order_id;
 select count(*) into v_remaining from public.delivery_stops where delivery_run_id=v_run.id and id<>p_stop_id and status<>'delivered';
 if v_remaining=0 then update public.delivery_runs set status='completed',completed_at=now(),end_lat=p_lat,end_lng=p_lng,version=version+1 where id=v_run.id; end if;
 insert into public.domain_events(event_type,entity_type,entity_id,actor_id,payload,idempotency_key,confidentiality)
 values('delivery_completed','order',v_stop.order_id,v_actor,jsonb_build_object('delivery_stop_id',p_stop_id,'recipient',p_recipient),p_idempotency_key||':event',v_conf);
 insert into public.notifications(event_key,recipient_role,notification_type,sound_key,title,body,entity_type,entity_id,deep_link)
 values(p_idempotency_key||':cash','owner','delivery_completed','cash_complete','Giao hàng thành công','Đơn đã giao và hoàn thành','order',v_stop.order_id,'/orders/'||v_stop.order_id);
 return p_stop_id;
end $$;

revoke all on function public.complete_task_v2(text,uuid,integer,text) from public,anon;
revoke all on function public.approve_partial_fulfillment(text,uuid,integer,text) from public,anon;
revoke all on function public.approve_work_package_completion(text,uuid,integer) from public,anon;
revoke all on function public.complete_delivery_stop(text,uuid,uuid,numeric,numeric,text) from public,anon;
grant execute on function public.complete_task_v2(text,uuid,integer,text) to authenticated;
grant execute on function public.approve_partial_fulfillment(text,uuid,integer,text) to authenticated;
grant execute on function public.approve_work_package_completion(text,uuid,integer) to authenticated;
grant execute on function public.complete_delivery_stop(text,uuid,uuid,numeric,numeric,text) to authenticated;

insert into public.migration_runs(migration_key,status,finished_at,notes)
values('202608220010_operational_completion_rpcs','completed',now(),'Added atomic task completion, production receipt, partial fulfillment and delivery completion commands.')
on conflict(migration_key) do update set status='completed',finished_at=now(),notes=excluded.notes;
commit;
