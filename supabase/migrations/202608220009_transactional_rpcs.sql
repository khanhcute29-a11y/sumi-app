-- SUMI APP M09 — secured transactional commands for the mobile client.

begin;

create table if not exists public.command_idempotency (
  idempotency_key text primary key,
  command_name text not null,
  actor_id uuid not null,
  result_entity_id uuid,
  created_at timestamptz not null default now()
);
alter table public.command_idempotency enable row level security;
revoke all on public.command_idempotency from anon,authenticated;

create or replace function public.create_order_v2(
  p_idempotency_key text,p_order_code text,p_order_type text,p_customer_id uuid,
  p_required_at timestamptz,p_fulfillment_method text,p_address text,p_note text,
  p_confidentiality text,p_items jsonb
) returns uuid language plpgsql security definer set search_path=public as $$
declare v_actor uuid:=auth.uid(); v_order uuid; v_item jsonb;
begin
 if v_actor is null or not public.is_approved() then raise exception 'not authorized'; end if;
 if p_order_type not in ('cake','bakery','teabreak','macaron','school') then raise exception 'invalid order type'; end if;
 if p_confidentiality='school_restricted' and p_order_type<>'school' then raise exception 'invalid confidentiality'; end if;
 select result_entity_id into v_order from public.command_idempotency where idempotency_key=p_idempotency_key and actor_id=v_actor;
 if v_order is not null then return v_order; end if;
 insert into public.orders(order_code,order_type,customer_id,created_by,created_by_name,required_at,fulfillment_method_v2,address,note,status_v2,confidentiality)
 select p_order_code,p_order_type,p_customer_id,v_actor,p.full_name,p_required_at,p_fulfillment_method,p_address,p_note,'awaiting_assignment',
  case when p_order_type='school' then 'school_restricted' else coalesce(p_confidentiality,'normal') end
 from public.profiles p where p.id=v_actor returning id into v_order;
 if v_order is null then raise exception 'profile missing'; end if;
 for v_item in select value from jsonb_array_elements(p_items) loop
  insert into public.order_items(order_id,product_id,name,qty,quantity,unit,name_snapshot,specification,display_order)
  values(v_order,(v_item->>'product_id')::uuid,coalesce(v_item->>'name','Sản phẩm'),greatest(1,ceil((v_item->>'quantity')::numeric)::int),
   (v_item->>'quantity')::numeric,coalesce(v_item->>'unit','cái'),coalesce(v_item->>'name','Sản phẩm'),coalesce(v_item->'specification','{}'::jsonb),coalesce((v_item->>'display_order')::int,0));
 end loop;
 insert into public.domain_events(event_type,entity_type,entity_id,actor_id,occurred_at,payload,idempotency_key,confidentiality)
 values('order_created','order',v_order,v_actor,now(),jsonb_build_object('order_code',p_order_code,'order_type',p_order_type),p_idempotency_key||':event',
  case when p_order_type='school' then 'school_restricted' else 'normal' end);
 insert into public.command_idempotency values(p_idempotency_key,'create_order_v2',v_actor,v_order,now());
 return v_order;
end $$;

create or replace function public.assign_order_package(
 p_idempotency_key text,p_order_id uuid,p_unit_id uuid,p_due_at timestamptz,p_items jsonb,p_expected_version integer
) returns uuid language plpgsql security definer set search_path=public as $$
declare v_actor uuid:=auth.uid(); v_package uuid; v_order_version int; v_item jsonb; v_order_conf text;
begin
 if not public.is_business_director() then raise exception 'director permission required'; end if;
 select version,confidentiality into v_order_version,v_order_conf from public.orders where id=p_order_id for update;
 if v_order_version is null or v_order_version<>p_expected_version then raise exception 'order version conflict'; end if;
 select result_entity_id into v_package from public.command_idempotency where idempotency_key=p_idempotency_key and actor_id=v_actor;
 if v_package is not null then return v_package; end if;
 insert into public.order_work_packages(order_id,unit_id,assigned_by,due_at) values(p_order_id,p_unit_id,v_actor,p_due_at) returning id into v_package;
 for v_item in select value from jsonb_array_elements(p_items) loop
  if (select coalesce(sum(wpi.quantity),0) from public.work_package_items wpi join public.order_work_packages wp on wp.id=wpi.work_package_id
      where wpi.order_item_id=(v_item->>'order_item_id')::uuid and wp.status<>'cancelled')+(v_item->>'quantity')::numeric
     >(select quantity from public.order_items where id=(v_item->>'order_item_id')::uuid and order_id=p_order_id)
  then raise exception 'allocated quantity exceeds order quantity'; end if;
  insert into public.work_package_items values(v_package,(v_item->>'order_item_id')::uuid,(v_item->>'quantity')::numeric);
 end loop;
 update public.orders set status_v2='awaiting_acceptance',version=version+1 where id=p_order_id;
 insert into public.domain_events(event_type,entity_type,entity_id,actor_id,payload,idempotency_key,confidentiality)
 values('work_package_assigned','order',p_order_id,v_actor,jsonb_build_object('work_package_id',v_package,'unit_id',p_unit_id),p_idempotency_key||':event',v_order_conf);
 insert into public.notifications(event_key,recipient_unit_id,notification_type,sound_key,title,body,entity_type,entity_id,deep_link)
 values(p_idempotency_key||':notify',p_unit_id,'work_package_assigned','new_order_voice','CÓ ĐƠN MỚI','Bếp có đơn mới cần nhận','order',p_order_id,'/orders/'||p_order_id);
 insert into public.command_idempotency values(p_idempotency_key,'assign_order_package',v_actor,v_package,now());
 return v_package;
end $$;

create or replace function public.accept_order_package(p_idempotency_key text,p_package_id uuid,p_expected_version integer)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_actor uuid:=auth.uid(); v_unit uuid; v_order uuid; v_version int; v_conf text;
begin
 select unit_id,order_id,version into v_unit,v_order,v_version from public.order_work_packages where id=p_package_id for update;
 if v_version<>p_expected_version then raise exception 'package version conflict'; end if;
 if not exists(select 1 from public.profile_assignments where profile_id=v_actor and unit_id=v_unit and position_code in ('kitchen_lead','kitchen_deputy') and valid_to is null)
    and not public.is_business_director() then raise exception 'kitchen lead permission required'; end if;
 update public.order_work_packages set status='accepted',accepted_by=v_actor,accepted_at=now(),version=version+1 where id=p_package_id;
 update public.orders set status_v2='in_production',version=version+1 where id=v_order;
 select confidentiality into v_conf from public.orders where id=v_order;
 insert into public.domain_events(event_type,entity_type,entity_id,actor_id,payload,idempotency_key,confidentiality)
 values('work_package_accepted','order',v_order,v_actor,jsonb_build_object('work_package_id',p_package_id),p_idempotency_key||':event',v_conf)
 on conflict(idempotency_key) do nothing;
 return p_package_id;
end $$;

revoke all on function public.create_order_v2(text,text,text,uuid,timestamptz,text,text,text,text,jsonb) from public,anon;
revoke all on function public.assign_order_package(text,uuid,uuid,timestamptz,jsonb,integer) from public,anon;
revoke all on function public.accept_order_package(text,uuid,integer) from public,anon;
grant execute on function public.create_order_v2(text,text,text,uuid,timestamptz,text,text,text,text,jsonb) to authenticated;
grant execute on function public.assign_order_package(text,uuid,uuid,timestamptz,jsonb,integer) to authenticated;
grant execute on function public.accept_order_package(text,uuid,integer) to authenticated;

insert into public.migration_runs(migration_key,status,finished_at,notes)
values('202608220009_transactional_rpcs','completed',now(),'Created idempotent transactional commands for order creation, director package assignment and kitchen acceptance.')
on conflict(migration_key) do update set status='completed',finished_at=now(),notes=excluded.notes;
commit;
