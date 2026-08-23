-- SUMI APP M35 — Auto Kitchen Package Trigger and Stream-Specific Kitchen Lead Roles
begin;

-- 1. Hàm tự động định tuyến và tạo work package cho order khi được tạo
create or replace function public.auto_create_kitchen_work_packages(p_order_id uuid)
returns void
language plpgsql
security definer
as \$\$
declare
  v_order record;
  v_item record;
  v_cold_unit uuid;
  v_hot_unit uuid;
  v_x41_unit uuid;
  v_x42_unit uuid;
  v_unit_id uuid;
  v_package_id uuid;
  v_flow text;
begin
  select * into v_order from public.orders where id = p_order_id;
  if not found then
    return;
  end if;

  -- Lấy ID các bếp từ organization_units
  select id into v_cold_unit from public.organization_units where code = 'BAKERY_COLD' or name ilike '%lạnh%' limit 1;
  select id into v_hot_unit from public.organization_units where code = 'BAKERY_HOT' or name ilike '%nóng%' limit 1;
  select id into v_x41_unit from public.organization_units where code = 'X41_KITCHEN' or name ilike '%41%' limit 1;
  select id into v_x42_unit from public.organization_units where code = 'X42_KITCHEN' or name ilike '%42%' limit 1;

  if v_cold_unit is null then
    select id into v_cold_unit from public.organization_units where unit_type = 'kitchen' limit 1;
  end if;
  if v_hot_unit is null then v_hot_unit := v_cold_unit; end if;
  if v_x41_unit is null then v_x41_unit := v_cold_unit; end if;
  if v_x42_unit is null then v_x42_unit := v_hot_unit; end if;

  -- Nếu đơn chưa có work packages nào, tạo theo luồng món
  if not exists (select 1 from public.order_work_packages where order_id = p_order_id) then
    for v_item in select * from public.order_items where order_id = p_order_id loop
      v_flow := coalesce(v_item.specification->>'product_flow', v_order.order_type, 'cake');
      if v_flow = 'cake' then
        v_unit_id := v_cold_unit;
      elsif v_flow = 'bakery' then
        v_unit_id := v_hot_unit;
      elsif v_flow = 'macaron' then
        v_unit_id := v_x41_unit;
      elsif v_flow = 'school' or v_flow = 'teabreak' then
        v_unit_id := v_x42_unit;
      else
        v_unit_id := v_cold_unit;
      end if;

      -- Tìm hoặc tạo package cho unit_id này trong đơn
      select id into v_package_id from public.order_work_packages where order_id = p_order_id and unit_id = v_unit_id limit 1;
      if v_package_id is null then
        insert into public.order_work_packages (order_id, unit_id, status, due_at, version)
        values (p_order_id, v_unit_id, 'assigned', v_order.required_at, 1)
        returning id into v_package_id;
      end if;

      -- Gắn item vào package
      insert into public.work_package_items (work_package_id, order_item_id, quantity)
      values (v_package_id, v_item.id, v_item.quantity)
      on conflict (work_package_id, order_item_id) do nothing;
    end loop;

    -- Nếu đơn không có items (đơn cũ hoặc tổng hợp), tạo 1 package mặc định theo order_type
    if not exists (select 1 from public.order_work_packages where order_id = p_order_id) then
      v_flow := coalesce(v_order.order_type, 'cake');
      if v_flow = 'cake' then
        v_unit_id := v_cold_unit;
      elsif v_flow = 'bakery' then
        v_unit_id := v_hot_unit;
      elsif v_flow = 'macaron' then
        v_unit_id := v_x41_unit;
      elsif v_flow = 'school' or v_flow = 'teabreak' then
        v_unit_id := v_x42_unit;
      else
        v_unit_id := v_cold_unit;
      end if;

      insert into public.order_work_packages (order_id, unit_id, status, due_at, version)
      values (p_order_id, v_unit_id, 'assigned', v_order.required_at, 1);
    end if;
  end if;
end;
\$\$;

-- 2. Trigger tự động chạy khi tạo đơn mới
create or replace function public.trg_auto_route_order_packages()
returns trigger
language plpgsql
security definer
as \$\$
begin
  perform public.auto_create_kitchen_work_packages(new.id);
  return new;
end;
\$\$;

drop trigger if exists trg_auto_route_order_packages on public.orders;
create trigger trg_auto_route_order_packages
after insert on public.orders
for each row
execute function public.trg_auto_route_order_packages();

-- 3. Backfill toàn bộ đơn hiện có chưa có package
do \$\$
declare
  r record;
begin
  for r in select id from public.orders loop
    perform public.auto_create_kitchen_work_packages(r.id);
  end loop;
end;
\$\$;

insert into public.migration_runs(migration_key,status,finished_at,notes)
values('202608230035_auto_kitchen_routing_and_roles','completed',now(),'Auto create work packages for kitchen leads on order creation and backfill existing orders.')
on conflict(migration_key) do update set status='completed',finished_at=now(),notes=excluded.notes;

commit;
