-- SUMI APP M26 — one order may contain products for several production flows.
begin;

create or replace function public.create_order_v2(
  p_idempotency_key text,p_order_code text,p_order_type text,p_customer_id uuid,
  p_required_at timestamptz,p_fulfillment_method text,p_address text,p_note text,
  p_confidentiality text,p_items jsonb
) returns uuid language plpgsql security definer set search_path=public as $$
declare v_actor uuid:=auth.uid(); v_order uuid; v_item jsonb; v_flow text; v_flow_count integer; v_invalid_flow boolean;
begin
 if v_actor is null or not public.is_approved() then raise exception 'not authorized'; end if;
 if p_order_type not in ('cake','bakery','teabreak','macaron','school','mixed') then raise exception 'invalid order type'; end if;
 if p_confidentiality='school_restricted' and p_order_type<>'school' then raise exception 'invalid confidentiality'; end if;
 if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then raise exception 'order items required'; end if;
 if p_order_type='mixed' then
  select count(distinct value->'specification'->>'product_flow'),
         bool_or(coalesce(value->'specification'->>'product_flow','') not in ('cake','bakery','teabreak','macaron'))
   into v_flow_count,v_invalid_flow from jsonb_array_elements(p_items);
  if v_invalid_flow or v_flow_count<2 then raise exception 'mixed order requires at least two valid product flows'; end if;
 elsif p_order_type='school' and exists(
   select 1 from jsonb_array_elements(p_items) where coalesce(value->'specification'->>'product_flow','school')<>'school'
 ) then raise exception 'school order cannot mix product flows';
 end if;
 select result_entity_id into v_order from public.command_idempotency where idempotency_key=p_idempotency_key and actor_id=v_actor;
 if v_order is not null then return v_order; end if;
 insert into public.orders(order_code,order_type,customer_id,created_by,created_by_name,required_at,fulfillment_method_v2,address,note,status_v2,confidentiality)
 select p_order_code,p_order_type,p_customer_id,v_actor,p.full_name,p_required_at,p_fulfillment_method,p_address,p_note,'awaiting_assignment',
  case when p_order_type='school' then 'school_restricted' else coalesce(p_confidentiality,'normal') end
 from public.profiles p where p.id=v_actor returning id into v_order;
 if v_order is null then raise exception 'profile missing'; end if;
 for v_item in select value from jsonb_array_elements(p_items) loop
  v_flow:=coalesce(v_item->'specification'->>'product_flow',p_order_type);
  if v_flow not in ('cake','bakery','teabreak','macaron','school') then raise exception 'invalid product flow'; end if;
  insert into public.order_items(order_id,product_id,name,qty,quantity,unit,name_snapshot,specification,display_order)
  values(v_order,(v_item->>'product_id')::uuid,coalesce(v_item->>'name','Sản phẩm'),greatest(1,ceil((v_item->>'quantity')::numeric)::int),
   (v_item->>'quantity')::numeric,coalesce(v_item->>'unit','cái'),coalesce(v_item->>'name','Sản phẩm'),
   coalesce(v_item->'specification','{}'::jsonb)||jsonb_build_object('product_flow',v_flow),coalesce((v_item->>'display_order')::int,0));
 end loop;
 insert into public.domain_events(event_type,entity_type,entity_id,actor_id,occurred_at,payload,idempotency_key,confidentiality)
 values('order_created','order',v_order,v_actor,now(),jsonb_build_object('order_code',p_order_code,'order_type',p_order_type,'product_flows',
  (select jsonb_agg(distinct value->'specification'->>'product_flow') from jsonb_array_elements(p_items))),p_idempotency_key||':event',
  case when p_order_type='school' then 'school_restricted' else 'normal' end);
 insert into public.command_idempotency values(p_idempotency_key,'create_order_v2',v_actor,v_order,now());
 return v_order;
end $$;

revoke all on function public.create_order_v2(text,text,text,uuid,timestamptz,text,text,text,text,jsonb) from public,anon;
grant execute on function public.create_order_v2(text,text,text,uuid,timestamptz,text,text,text,text,jsonb) to authenticated;

insert into public.migration_runs(migration_key,status,finished_at,notes)
values('202608230026_mixed_product_orders','completed',now(),'Enabled multi-flow orders with per-item production routing; school orders remain isolated.')
on conflict(migration_key) do update set status='completed',finished_at=now(),notes=excluded.notes;
commit;
