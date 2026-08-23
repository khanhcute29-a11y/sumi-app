-- SUMI APP M33 — auto-route orders to kitchen work packages, streamline kitchen lead acceptance
begin;

create or replace function public.create_order_v2(
  p_idempotency_key text,p_order_code text,p_order_type text,p_customer_id uuid,
  p_required_at timestamptz,p_fulfillment_method text,p_address text,p_note text,
  p_confidentiality text,p_items jsonb
) returns uuid language plpgsql security definer set search_path=public as 
declare
  v_actor uuid:=auth.uid();
  v_order uuid;
  v_item jsonb;
  v_flow text;
  v_flow_count integer;
  v_invalid_flow boolean;
  v_unit_cold uuid;
  v_unit_hot uuid;
  v_unit_x41 uuid;
  v_unit_x42 uuid;
  v_target_unit uuid;
  v_wp_id uuid;
  v_distinct_flows text[];
  v_curr_flow text;
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

  -- Lấy ID các bếp
  select id into v_unit_cold from public.organization_units where code='BAKERY_COLD' limit 1;
  select id into v_unit_hot from public.organization_units where code='BAKERY_HOT' limit 1;
  select id into v_unit_x41 from public.organization_units where code='X41_KITCHEN' limit 1;
  select id into v_unit_x42 from public.organization_units where code='X42_KITCHEN' limit 1;

  -- Tạo đơn hàng với trạng thái awaiting_acceptance sẵn sàng cho bếp nhận
  insert into public.orders(order_code,order_type,customer_id,created_by,created_by_name,required_at,fulfillment_method_v2,address,note,status_v2,confidentiality)
  select p_order_code,p_order_type,p_customer_id,v_actor,p.full_name,p_required_at,p_fulfillment_method,p_address,p_note,'awaiting_acceptance',
   case when p_order_type='school' then 'school_restricted' else coalesce(p_confidentiality,'normal') end
  from public.profiles p where p.id=v_actor returning id into v_order;
  if v_order is null then raise exception 'profile missing'; end if;

  -- Thêm các món trong đơn
  for v_item in select value from jsonb_array_elements(p_items) loop
    v_flow:=coalesce(v_item->'specification'->>'product_flow',p_order_type);
    if v_flow not in ('cake','bakery','teabreak','macaron','school') then raise exception 'invalid product flow'; end if;
    insert into public.order_items(order_id,product_id,name,qty,quantity,unit,name_snapshot,specification,display_order)
    values(v_order,(v_item->>'product_id')::uuid,coalesce(v_item->>'name','Sản phẩm'),greatest(1,ceil((v_item->>'quantity')::numeric)::int),
     (v_item->>'quantity')::numeric,coalesce(v_item->>'unit','cái'),coalesce(v_item->>'name','Sản phẩm'),
     coalesce(v_item->'specification','{}'::jsonb)||jsonb_build_object('product_flow',v_flow),coalesce((v_item->>'display_order')::int,0));
  end loop;

  -- Tự động định tuyến tạo Work Package cho bếp tương ứng
  select array_agg(distinct coalesce(specification->>'product_flow', p_order_type))
  into v_distinct_flows
  from public.order_items where order_id=v_order;

  if v_distinct_flows is not null then
    foreach v_curr_flow in array v_distinct_flows loop
      v_target_unit:=case v_curr_flow
        when 'cake' then coalesce(v_unit_cold, v_unit_hot)
        when 'bakery' then coalesce(v_unit_hot, v_unit_cold)
        when 'macaron' then coalesce(v_unit_x41, v_unit_cold)
        when 'school' then coalesce(v_unit_x42, v_unit_hot)
        when 'teabreak' then coalesce(v_unit_x42, v_unit_hot)
        else coalesce(v_unit_cold, v_unit_hot)
      end;

      if v_target_unit is not null then
        insert into public.order_work_packages(order_id,unit_id,assigned_by,due_at,status)
        values(v_order,v_target_unit,v_actor,p_required_at,'assigned')
        returning id into v_wp_id;

        -- Gán các order_items thuộc luồng này vào work_package
        insert into public.work_package_items(work_package_id,order_item_id,quantity)
        select v_wp_id, oi.id, oi.quantity
        from public.order_items oi
        where oi.order_id=v_order and coalesce(oi.specification->>'product_flow', p_order_type)=v_curr_flow;
      end if;
    end loop;
  end if;

  insert into public.domain_events(event_type,entity_type,entity_id,actor_id,occurred_at,payload,idempotency_key,confidentiality)
  values('order_created','order',v_order,v_actor,now(),jsonb_build_object('order_code',p_order_code,'order_type',p_order_type,'product_flows',
   (select jsonb_agg(distinct value->'specification'->>'product_flow') from jsonb_array_elements(p_items))),p_idempotency_key||':event',
   case when p_order_type='school' then 'school_restricted' else 'normal' end);

  insert into public.command_idempotency values(p_idempotency_key,'create_order_v2',v_actor,v_order,now());
  return v_order;
end ;

-- Nâng cấp accept_order_package: cho phép Bếp trưởng / Thợ bếp / Quản lý nhận đơn mượt mà
create or replace function public.accept_order_package(p_idempotency_key text,p_package_id uuid,p_expected_version integer)
returns uuid language plpgsql security definer set search_path=public as 
declare
  v_actor uuid:=auth.uid();
  v_unit uuid;
  v_order uuid;
  v_version int;
  v_conf text;
  v_is_authorized boolean;
begin
  select unit_id,order_id,version into v_unit,v_order,v_version from public.order_work_packages where id=p_package_id for update;
  if v_version<>p_expected_version then raise exception 'package version conflict'; end if;

  -- Kiểm tra quyền: Director, bếp trưởng/bếp phó theo assignment hoặc theo profile role/station
  select bool_or(
    public.is_business_director() or
    exists(select 1 from public.profile_assignments where profile_id=v_actor and unit_id=v_unit and position_code in ('kitchen_lead','kitchen_deputy','baker') and valid_to is null) or
    exists(select 1 from public.profiles where id=v_actor and (
      role in ('owner','admin','kitchen_lead','kitchen_deputy','baker') or
      exists(select 1 from unnest(coalesce(extra_roles,array[]::text[])) x where x in ('owner','admin','kitchen_lead','kitchen_deputy','baker'))
    ))
  ) into v_is_authorized;

  if not coalesce(v_is_authorized, false) then
    raise exception 'kitchen lead permission required';
  end if;

  update public.order_work_packages set status='accepted',accepted_by=v_actor,accepted_at=now(),version=version+1 where id=p_package_id;
  update public.orders set status_v2='in_production',version=version+1 where id=v_order;
  select confidentiality into v_conf from public.orders where id=v_order;

  insert into public.domain_events(event_type,entity_type,entity_id,actor_id,payload,idempotency_key,confidentiality)
  values('work_package_accepted','order',v_order,v_actor,jsonb_build_object('work_package_id',p_package_id),p_idempotency_key||':event',v_conf)
  on conflict(idempotency_key) do nothing;

  return p_package_id;
end ;

-- Backfill: Tự động phân công work package cho tất cả các đơn chưa có package
do 
declare
  r record;
  v_unit_cold uuid;
  v_unit_hot uuid;
  v_unit_x41 uuid;
  v_unit_x42 uuid;
  v_target_unit uuid;
  v_wp_id uuid;
  v_curr_flow text;
  v_distinct_flows text[];
begin
  select id into v_unit_cold from public.organization_units where code='BAKERY_COLD' limit 1;
  select id into v_unit_hot from public.organization_units where code='BAKERY_HOT' limit 1;
  select id into v_unit_x41 from public.organization_units where code='X41_KITCHEN' limit 1;
  select id into v_unit_x42 from public.organization_units where code='X42_KITCHEN' limit 1;

  for r in (
    select o.id as order_id, o.order_type, o.required_at, o.created_by
    from public.orders o
    where not exists (select 1 from public.order_work_packages wp where wp.order_id=o.id and wp.status<>'cancelled')
      and o.status_v2 not in ('completed','cancelled')
  ) loop
    select array_agg(distinct coalesce(specification->>'product_flow', r.order_type))
    into v_distinct_flows
    from public.order_items where order_id=r.order_id;

    if v_distinct_flows is not null then
      foreach v_curr_flow in array v_distinct_flows loop
        v_target_unit:=case v_curr_flow
          when 'cake' then coalesce(v_unit_cold, v_unit_hot)
          when 'bakery' then coalesce(v_unit_hot, v_unit_cold)
          when 'macaron' then coalesce(v_unit_x41, v_unit_cold)
          when 'school' then coalesce(v_unit_x42, v_unit_hot)
          when 'teabreak' then coalesce(v_unit_x42, v_unit_hot)
          else coalesce(v_unit_cold, v_unit_hot)
        end;

        if v_target_unit is not null then
          insert into public.order_work_packages(order_id,unit_id,assigned_by,due_at,status)
          values(r.order_id,v_target_unit,coalesce(r.created_by,auth.uid()),r.required_at,'assigned')
          returning id into v_wp_id;

          insert into public.work_package_items(work_package_id,order_item_id,quantity)
          select v_wp_id, oi.id, oi.quantity
          from public.order_items oi
          where oi.order_id=r.order_id and coalesce(oi.specification->>'product_flow', r.order_type)=v_curr_flow;
        end if;
      end loop;

      update public.orders set status_v2='awaiting_acceptance' where id=r.order_id and status_v2='awaiting_assignment';
    end if;
  end loop;
end ;

revoke all on function public.create_order_v2(text,text,text,uuid,timestamptz,text,text,text,text,jsonb) from public,anon;
revoke all on function public.accept_order_package(text,uuid,integer) from public,anon;
grant execute on function public.create_order_v2(text,text,text,uuid,timestamptz,text,text,text,text,jsonb) to authenticated;
grant execute on function public.accept_order_package(text,uuid,integer) to authenticated;

insert into public.migration_runs(migration_key,status,finished_at,notes)
values('202608230033_auto_assign_kitchen_packages','completed',now(),'Auto-route orders to kitchen work packages on creation, allow kitchen leads to accept directly, backfill existing unassigned orders.')
on conflict(migration_key) do update set status='completed',finished_at=now(),notes=excluded.notes;

commit;
