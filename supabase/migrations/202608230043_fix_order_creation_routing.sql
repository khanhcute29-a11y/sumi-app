-- SUMI APP M43 â€” Fix Order Creation Routing and Cleanup Phantom Packages
begin;

-- 1. Drop the premature trigger
drop trigger if exists trg_auto_route_order_packages on public.orders;

-- 2. Update create_order_v2 to call auto_create_kitchen_work_packages AFTER items are inserted
create or replace function public.create_order_v2(
  p_idempotency_key text,
  p_order_code text,
  p_order_type text,
  p_customer_id uuid,
  p_required_at timestamptz,
  p_fulfillment_method text,
  p_address text,
  p_note text,
  p_confidentiality text,
  p_items jsonb
) returns uuid language plpgsql security definer set search_path=public as $$
declare
  v_actor uuid := auth.uid();
  v_order uuid;
  v_item jsonb;
  v_actor_profile public.profiles%rowtype;
begin
  if v_actor is null then raise exception 'not authorized'; end if;
  select * into v_actor_profile from public.profiles where id = v_actor;
  if v_actor_profile.id is null or not v_actor_profile.approved or v_actor_profile.active = false then
    raise exception 'TÃ i khoáº£n chÆ°a Ä‘Æ°á»£c kÃ­ch hoáº¡t hoáº·c Ä‘Ã£ bá»‹ khÃ³a';
  end if;

  if p_order_type not in ('cake', 'bakery', 'teabreak', 'macaron', 'school', 'mixed') then
    raise exception 'Loáº¡i Ä‘Æ¡n hÃ ng khÃ´ng há»£p lá»‡: %', p_order_type;
  end if;

  select result_entity_id into v_order
  from public.command_idempotency
  where idempotency_key = p_idempotency_key and actor_id = v_actor;
  if v_order is not null then return v_order; end if;

  insert into public.orders(
    order_code, order_type, customer_id, created_by, created_by_name,
    required_at, fulfillment_method_v2, address, note, status, status_v2, confidentiality
  )
  values (
    p_order_code, p_order_type, p_customer_id, v_actor, v_actor_profile.full_name,
    p_required_at, p_fulfillment_method, p_address, p_note, 'moi', 'awaiting_assignment',
    case when p_order_type = 'school' then 'school_restricted' else coalesce(p_confidentiality, 'normal') end
  )
  returning id into v_order;

  for v_item in select value from jsonb_array_elements(p_items) loop
    insert into public.order_items(
      order_id, product_id, name, qty, quantity, unit, name_snapshot, specification, display_order
    )
    values(
      v_order,
      case when (v_item->>'product_id') is not null and (v_item->>'product_id') <> '' then (v_item->>'product_id')::uuid else null end,
      coalesce(v_item->>'name', 'Sáº£n pháº©m'),
      greatest(1, ceil(coalesce((v_item->>'quantity')::numeric, 1))::int),
      coalesce((v_item->>'quantity')::numeric, 1),
      coalesce(v_item->>'unit', 'cÃ¡i'),
      coalesce(v_item->>'name', 'Sáº£n pháº©m'),
      coalesce(v_item->'specification', '{}'::jsonb),
      coalesce((v_item->>'display_order')::int, 0)
    );
  end loop;

  insert into public.domain_events(event_type, entity_type, entity_id, actor_id, occurred_at, payload, idempotency_key, confidentiality)
  values(
    'order_created', 'order', v_order, v_actor, now(),
    jsonb_build_object('order_code', p_order_code, 'order_type', p_order_type),
    p_idempotency_key || ':event',
    case when p_order_type = 'school' then 'school_restricted' else 'normal' end
  )
  on conflict(idempotency_key) do nothing;

  insert into public.command_idempotency(idempotency_key, command_name, actor_id, result_entity_id, created_at)
  values(p_idempotency_key, 'create_order_v2', v_actor, v_order, now())
  on conflict(idempotency_key, actor_id) do nothing;

  -- BÆ¯á»šC QUAN TRá»ŒNG: Gá»i tá»± Ä‘á»™ng chia báº¿p sau khi Ä‘Ã£ cÃ³ Ä‘áº§y Ä‘á»§ danh sÃ¡ch order_items!
  perform public.auto_create_kitchen_work_packages(v_order);

  return v_order;
end $$;

-- 3. Cleanup existing phantom empty packages that have no work_package_items
delete from public.order_work_packages
where not exists (select 1 from public.work_package_items wpi where wpi.work_package_id = order_work_packages.id)
and status in ('assigned', 'accepted')
and not exists (select 1 from public.order_items where order_id = order_work_packages.order_id having count(*) = 0); -- Do not delete if order actually has 0 items

-- 4. Advance orders that are stuck in 'in_production' but all their remaining valid packages are 'completed'
update public.orders o
set status_v2 = 'ready_for_fulfillment', status = 'cho_giao', production_completed_at = coalesce(production_completed_at, now())
where o.status_v2 = 'in_production'
and not exists (
  select 1 from public.order_work_packages wp
  where wp.order_id = o.id and wp.status not in ('completed', 'cancelled')
);

insert into public.migration_runs(migration_key, status, finished_at, notes)
values('202608230043_fix_order_creation_routing', 'completed', now(), 'Moved auto routing to the end of create_order_v2 and removed the premature trigger. Cleaned up phantom packages.')
on conflict(migration_key) do update set status='completed', finished_at=now(), notes=excluded.notes;

commit;

