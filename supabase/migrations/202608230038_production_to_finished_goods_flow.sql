-- SUMI APP M38 — Streamlined Production to Finished Goods Warehouse & Transport Notification
begin;

-- 1. RPC: Chuyển đơn thành phẩm có sẵn thẳng vào Kho Thành Phẩm & Báo Vận Tải
create or replace function public.mark_order_ready_from_stock(p_order_id uuid)
returns uuid language plpgsql security definer set search_path=public as 
declare
  v_actor uuid := auth.uid();
  v_order public.orders%rowtype;
  v_unit_code text;
  v_wh uuid;
  v_doc uuid;
  v_line uuid;
  v_item record;
  v_inventory_item uuid;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if v_order.id is null then raise exception 'Order not found'; end if;

  -- Xác định kho thành phẩm phù hợp
  v_wh := (select id from public.warehouses where code = case
    when v_order.order_type = 'macaron' then 'X41_MACARON_FG'
    when v_order.order_type = 'school' then 'X42_BLIND_DISPATCH'
    else 'BAKERY_FG' end limit 1);

  -- Ghi nhận chứng từ xuất kho có sẵn / thành phẩm vào kho
  if v_wh is not null then
    insert into public.inventory_documents(document_code, document_type, destination_warehouse_id, order_id, status,
      created_by, approved_by, approval_status, received_at, reason, idempotency_key)
    values('STOCK-' || upper(substr(md5(p_order_id::text || now()::text), 1, 12)), 'stock_dispatch', v_wh, p_order_id, 'completed',
      v_actor, v_actor, 'approved', now(), 'Hàng có sẵn từ kho thành phẩm xuất giao', p_order_id::text || ':stock')
    returning id into v_doc;
  end if;

  -- Hoàn tất tất cả gói việc
  update public.order_work_packages
  set status = 'completed', completed_at = now(), approved_by = v_actor, approved_at = now(), version = version + 1
  where order_id = p_order_id and status not in ('completed', 'cancelled');

  -- Cập nhật trạng thái đơn
  update public.orders
  set status = 'cho_giao', status_v2 = 'ready_for_fulfillment',
      production_completed_at = coalesce(production_completed_at, now()),
      version = version + 1
  where id = p_order_id;

  -- Báo Đội Vận Tải (Shipper)
  insert into public.notifications(event_key, recipient_unit_id, notification_type, sound_key, title, body, entity_type, entity_id, deep_link)
  select 'order-ready-stock:' || p_order_id || ':' || extract(epoch from now())::bigint,
         id, 'order_ready', 'ting', 'Đơn hàng có sẵn trong kho thành phẩm',
         'Đơn ' || coalesce(v_order.order_code, '') || ' có sẵn tại kho thành phẩm, sẵn sàng giao',
         'order', p_order_id, '/orders/' || p_order_id
  from public.organization_units where code = 'TRANSPORT';

  -- Bắn domain event
  insert into public.domain_events(event_type, entity_type, entity_id, actor_id, payload, idempotency_key, confidentiality)
  values('order_ready_from_stock', 'order', p_order_id, v_actor,
         jsonb_build_object('order_id', p_order_id, 'is_ready_stock', true),
         'ready-stock:' || p_order_id || ':' || extract(epoch from now())::bigint, v_order.confidentiality);

  return p_order_id;
end ;

-- 2. RPC: Hoàn tất gói bếp -> Bàn giao Kho Thành Phẩm -> Chốt KPI Bếp -> Báo Vận Tải
create or replace function public.complete_kitchen_work_package_with_proof(
  p_package_id uuid,
  p_proof_storage_path text default null
)
returns uuid language plpgsql security definer set search_path=public as 
declare
  v_actor uuid := auth.uid();
  v_wp public.order_work_packages%rowtype;
  v_order public.orders%rowtype;
  v_unit_code text;
  v_wh uuid;
  v_doc uuid;
  v_line uuid;
  v_item record;
  v_inventory_item uuid;
  v_all_done boolean;
begin
  select * into v_wp from public.order_work_packages where id = p_package_id for update;
  if v_wp.id is null then raise exception 'Work package not found'; end if;

  select * into v_order from public.orders where id = v_wp.order_id for update;

  -- 1. Lưu ảnh bằng chứng thành phẩm nếu có
  if p_proof_storage_path is not null and trim(p_proof_storage_path) <> '' then
    insert into public.order_attachments(order_id, work_package_id, attachment_type, storage_path, created_by)
    values(v_wp.order_id, p_package_id, 'production_proof', p_proof_storage_path, v_actor);
  end if;

  -- 2. Đánh dấu hoàn tất toàn bộ tasks trong gói việc này
  update public.tasks
  set status = 'done', completed_at = coalesce(completed_at, now()), version = version + 1
  where work_package_id = p_package_id and status not in ('done', 'exempted');

  -- 3. Nhập bánh vào Kho Thành Phẩm / Kho Mù tương ứng
  select code into v_unit_code from public.organization_units where id = v_wp.unit_id;
  select id into v_wh from public.warehouses where code = case
    when v_unit_code = 'X41_KITCHEN' then 'X41_MACARON_FG'
    when v_unit_code = 'X42_KITCHEN' then 'X42_BLIND_DISPATCH'
    else 'BAKERY_FG' end;

  if v_wh is not null then
    insert into public.inventory_documents(document_code, document_type, destination_warehouse_id, order_id, work_package_id, status,
      created_by, approved_by, approval_status, received_at, reason, idempotency_key)
    values('PROD-' || upper(substr(md5(p_package_id::text || now()::text), 1, 12)), 'production_receipt', v_wh, v_wp.order_id, p_package_id, 'completed',
      v_actor, v_actor, 'approved', now(), 'Bếp bàn giao vào kho thành phẩm', p_package_id::text || ':complete')
    returning id into v_doc;

    for v_item in select oi.*, wpi.quantity package_quantity from public.work_package_items wpi join public.order_items oi on oi.id = wpi.order_item_id
      where wpi.work_package_id = p_package_id loop
      insert into public.inventory_items(sku, name, item_type, base_unit, legacy_source_type, legacy_source_id)
      values('ORDERITEM-' || upper(substr(md5(v_item.id::text), 1, 12)), v_item.name_snapshot, 'finished_product', v_item.unit, 'order_item', v_item.id)
      on conflict(legacy_source_type, legacy_source_id) do update set name = excluded.name returning id into v_inventory_item;

      insert into public.inventory_document_lines(document_id, inventory_item_id, planned_quantity, received_quantity, unit)
      values(v_doc, v_inventory_item, v_item.package_quantity, v_item.package_quantity, v_item.unit) returning id into v_line;

      insert into public.inventory_ledger(warehouse_id, inventory_item_id, document_line_id, quantity_delta)
      values(v_wh, v_inventory_item, v_line, v_item.package_quantity);
    end loop;
  end if;

  -- 4. Hoàn tất gói việc
  update public.order_work_packages
  set status = 'completed', completed_at = now(), approved_by = v_actor, approved_at = now(), version = version + 1
  where id = p_package_id;

  -- 5. Kiểm tra nếu tất cả các bếp của đơn đều đã giao vào kho thành phẩm
  select not exists(
    select 1 from public.order_work_packages
    where order_id = v_wp.order_id and status not in ('completed', 'cancelled')
  ) into v_all_done;

  if v_all_done then
    update public.orders
    set status = 'cho_giao', status_v2 = 'ready_for_fulfillment',
        production_completed_at = coalesce(production_completed_at, now()),
        version = version + 1
    where id = v_wp.order_id;

    -- Bắn chuông báo Đội Vận Tải (Shipper)
    insert into public.notifications(event_key, recipient_unit_id, notification_type, sound_key, title, body, entity_type, entity_id, deep_link)
    select 'order-ready:' || v_wp.order_id || ':' || extract(epoch from now())::bigint,
           id, 'order_ready', 'ting', 'Đơn đã vào Kho Thành Phẩm - Chờ Vận Chuyển',
           'Đơn ' || coalesce(v_order.order_code, '') || ' đã hoàn thành xong bánh tại kho, sẵn sàng xuất bến',
           'order', v_wp.order_id, '/orders/' || v_wp.order_id
    from public.organization_units where code = 'TRANSPORT';
  end if;

  -- 6. Ghi domain event
  insert into public.domain_events(event_type, entity_type, entity_id, actor_id, payload, idempotency_key, confidentiality)
  values('work_package_completed', 'order', v_wp.order_id, v_actor,
         jsonb_build_object('work_package_id', p_package_id, 'warehouse_id', v_wh, 'all_done', v_all_done),
         p_package_id::text || ':event:' || extract(epoch from now())::bigint, v_order.confidentiality);

  return p_package_id;
end ;

grant execute on function public.mark_order_ready_from_stock(uuid) to authenticated;
grant execute on function public.complete_kitchen_work_package_with_proof(uuid, text) to authenticated;

insert into public.migration_runs(migration_key, status, finished_at, notes)
values('202608230038_production_to_finished_goods_flow', 'completed', now(), 'Streamlined workflow from production to finished goods warehouse and transport dispatch with KPI tracking.')
on conflict(migration_key) do update set status='completed', finished_at=now(), notes=excluded.notes;

commit;
