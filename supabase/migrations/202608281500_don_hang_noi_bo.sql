-- Đơn hàng nội bộ / Kho thành phẩm (Phase 1) — nối tiếp đúng việc anh Khánh
-- đã để lại comment "CHƯA LÀM: Oder bếp (gửi yêu cầu sản xuất cho bếp)" trong
-- FinishedGoodsInventoryV2.jsx. Hoàn toàn additive: KHÔNG sửa create_order_v2,
-- KHÔNG sửa auto_create_kitchen_work_packages, KHÔNG đụng order_hearts/
-- delete_order_by_director của Khánh — chỉ thêm cột mới (default an toàn) và
-- 2 RPC mới, tái dùng đúng các hàm/bảng thật đã có.
begin;
set local lock_timeout = '10s';
set local statement_timeout = '60s';

-- 1) Đánh dấu đơn nội bộ (không có khách hàng) + cửa hàng đích, dùng đúng
-- nhãn thật đã có ở FinishedGoodsInventoryV2.jsx (STORES) / ShiftsScreen.jsx
-- (BRANCHES) — không bịa danh sách cửa hàng mới.
alter table public.orders
  add column if not exists is_internal boolean not null default false,
  add column if not exists target_store text;

-- 2) Nhánh "Cần sản xuất": tạo đơn nội bộ + đẩy xuống đúng bếp thật, y hệt
-- cách create_order_v2 làm (tái dùng auto_create_kitchen_work_packages —
-- hàm này hoàn toàn chung, không cần sửa). Bếp thấy đơn nội bộ LẪN chung với
-- đơn khách trong danh sách Nhận đơn, phân biệt qua is_internal (UI tô màu
-- nhãn "NỘI BỘ").
create or replace function public.create_internal_order(
  p_idempotency_key text,
  p_order_code text,
  p_order_type text,          -- 'bakery' | 'cake' | 'macaron' — tái dùng đúng luồng bếp có thật
  p_target_store text,        -- 'Vĩnh Phú 42' | 'Quốc Lộ 13' | null (Xưởng 41 không cần cửa hàng)
  p_required_at timestamptz,
  p_note text,
  p_items jsonb                -- [{name, quantity, unit, size, unit_price, product_id, ref_photo_url}]
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_actor uuid := auth.uid();
  v_actor_profile public.profiles%rowtype;
  v_order uuid;
  v_item jsonb;
begin
  if v_actor is null then raise exception 'not authorized'; end if;
  select * into v_actor_profile from public.profiles where id = v_actor;
  if v_actor_profile.id is null or not v_actor_profile.approved or v_actor_profile.active = false then
    raise exception 'Tài khoản chưa được kích hoạt hoặc đã bị khóa';
  end if;
  if p_order_type not in ('cake', 'bakery', 'macaron') then
    raise exception 'Loại đơn nội bộ không hợp lệ: %', p_order_type;
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Cần ít nhất 1 loại bánh';
  end if;

  select result_entity_id into v_order
  from public.command_idempotency
  where idempotency_key = p_idempotency_key and actor_id = v_actor;
  if v_order is not null then return v_order; end if;

  insert into public.orders(
    order_code, order_type, customer_id, created_by, created_by_name,
    required_at, fulfillment_method_v2, note, status, status_v2, confidentiality,
    channel, is_internal, target_store
  )
  values (
    p_order_code, p_order_type, null, v_actor, v_actor_profile.full_name,
    p_required_at, 'pickup', p_note, 'moi', 'awaiting_assignment', 'normal',
    'Nội bộ', true, p_target_store
  )
  returning id into v_order;

  for v_item in select value from jsonb_array_elements(p_items) loop
    insert into public.order_items(
      order_id, product_id, name, qty, quantity, unit, size, price, unit_price,
      name_snapshot, specification, ref_photo_url, category
    )
    values(
      v_order,
      case when (v_item->>'product_id') is not null and (v_item->>'product_id') <> '' then (v_item->>'product_id')::uuid else null end,
      coalesce(v_item->>'name', 'Sản phẩm'),
      greatest(1, ceil(coalesce((v_item->>'quantity')::numeric, 1))::int),
      coalesce((v_item->>'quantity')::numeric, 1),
      coalesce(v_item->>'unit', 'cái'),
      nullif(v_item->>'size', ''),
      coalesce((v_item->>'unit_price')::numeric, 0),
      nullif((v_item->>'unit_price')::text, '')::numeric,
      coalesce(v_item->>'name', 'Sản phẩm'),
      '{}'::jsonb,
      nullif(v_item->>'ref_photo_url', ''),
      p_order_type
    );
  end loop;

  insert into public.domain_events(event_type, entity_type, entity_id, actor_id, occurred_at, payload, idempotency_key, confidentiality)
  values('order_created', 'order', v_order, v_actor, now(),
    jsonb_build_object('order_code', p_order_code, 'order_type', p_order_type, 'is_internal', true),
    p_idempotency_key || ':event', 'normal')
  on conflict(idempotency_key) do nothing;

  insert into public.command_idempotency(idempotency_key, command_name, actor_id, result_entity_id, created_at)
  values(p_idempotency_key, 'create_internal_order', v_actor, v_order, now())
  on conflict(idempotency_key, actor_id) do nothing;

  perform public.auto_create_kitchen_work_packages(v_order);

  return v_order;
end $$;

revoke all on function public.create_internal_order(text, text, text, text, timestamptz, text, jsonb) from public, anon;
grant execute on function public.create_internal_order(text, text, text, text, timestamptz, text, jsonb) to authenticated;

-- 3) Nhánh "Có sẵn trong kho": trừ thẳng finished_goods_stock, KHÔNG tạo
-- work package bếp — đơn vào thẳng trạng thái 'ready_for_fulfillment', tự
-- xuất hiện ở đúng màn "Đơn cần giao — ai rảnh nhận" (DonKiemNhiem.jsx) đã có
-- sẵn, không cần dựng thêm màn giao hàng riêng cho luồng này.
create or replace function public.create_internal_order_from_stock(
  p_idempotency_key text,
  p_order_code text,
  p_stock_id uuid,
  p_qty numeric,
  p_target_store text,
  p_required_at timestamptz,
  p_note text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_actor uuid := auth.uid();
  v_actor_profile public.profiles%rowtype;
  v_order uuid;
  v_stock public.finished_goods_stock%rowtype;
  v_product public.products%rowtype;
begin
  if v_actor is null then raise exception 'not authorized'; end if;
  select * into v_actor_profile from public.profiles where id = v_actor;
  if v_actor_profile.id is null or not v_actor_profile.approved or v_actor_profile.active = false then
    raise exception 'Tài khoản chưa được kích hoạt hoặc đã bị khóa';
  end if;
  if coalesce(p_qty, 0) <= 0 then raise exception 'Số lượng phải lớn hơn 0'; end if;

  select result_entity_id into v_order
  from public.command_idempotency
  where idempotency_key = p_idempotency_key and actor_id = v_actor;
  if v_order is not null then return v_order; end if;

  select * into v_stock from public.finished_goods_stock where id = p_stock_id for update;
  if not found then raise exception 'Không tìm thấy bánh trong kho'; end if;
  if v_stock.qty < p_qty then raise exception 'Kho chỉ còn %, không đủ % yêu cầu', v_stock.qty, p_qty; end if;

  select * into v_product from public.products where id = v_stock.product_id;

  update public.finished_goods_stock set qty = qty - p_qty, updated_at = now() where id = p_stock_id;

  insert into public.orders(
    order_code, order_type, customer_id, created_by, created_by_name,
    required_at, fulfillment_method_v2, note, status, status_v2, confidentiality,
    channel, is_internal, target_store
  )
  values (
    p_order_code, coalesce(v_stock.branch, 'bakery'), null, v_actor, v_actor_profile.full_name,
    p_required_at, 'delivery', p_note, 'moi', 'ready_for_fulfillment', 'normal',
    'Nội bộ', true, p_target_store
  )
  returning id into v_order;

  insert into public.order_items(
    order_id, product_id, name, qty, quantity, unit, size, price, unit_price,
    name_snapshot, specification, category
  )
  values(
    v_order, v_stock.product_id, coalesce(v_product.name, 'Sản phẩm'),
    greatest(1, ceil(p_qty)::int), p_qty, 'cái', v_stock.size, 0, null,
    coalesce(v_product.name, 'Sản phẩm'), jsonb_build_object('from_stock_id', p_stock_id), coalesce(v_stock.branch, 'bakery')
  );

  insert into public.domain_events(event_type, entity_type, entity_id, actor_id, occurred_at, payload, idempotency_key, confidentiality)
  values('order_created', 'order', v_order, v_actor, now(),
    jsonb_build_object('order_code', p_order_code, 'is_internal', true, 'from_stock_id', p_stock_id),
    p_idempotency_key || ':event', 'normal')
  on conflict(idempotency_key) do nothing;

  insert into public.command_idempotency(idempotency_key, command_name, actor_id, result_entity_id, created_at)
  values(p_idempotency_key, 'create_internal_order_from_stock', v_actor, v_order, now())
  on conflict(idempotency_key, actor_id) do nothing;

  return v_order;
end $$;

revoke all on function public.create_internal_order_from_stock(text, text, uuid, numeric, text, timestamptz, text) from public, anon;
grant execute on function public.create_internal_order_from_stock(text, text, uuid, numeric, text, timestamptz, text) to authenticated;

-- 4) Cho danh sách Đơn Hàng (order_operations_list, dùng bởi OrdersV2Screen.jsx
-- listOrdersV2()) thấy được is_internal/target_store để tô nhãn "NỘI BỘ" nổi
-- bật trên thẻ đơn — CREATE OR REPLACE VIEW chỉ được PHÉP thêm cột mới ở
-- cuối, không được đổi/xoá cột cũ, nên copy y nguyên toàn bộ view hiện tại
-- rồi thêm đúng 2 cột vào cuối, không đụng logic nào khác của view.
create or replace view public.order_operations_list as
 SELECT o.id,
    o.order_code,
    o.order_type,
    o.status_v2,
    o.required_at,
    o.fulfillment_method_v2,
    o.address,
    o.confidentiality,
    o.created_by_name,
    o.created_at,
    o.completed_at,
    COALESCE(( SELECT sum(oi.quantity) AS sum
           FROM order_items oi
          WHERE oi.order_id = o.id), 0::numeric) AS total_quantity,
    ( SELECT count(*) AS count
           FROM order_work_packages wp
          WHERE wp.order_id = o.id) AS package_count,
    ( SELECT count(*) AS count
           FROM order_work_packages wp
          WHERE wp.order_id = o.id AND wp.status = 'completed'::text) AS completed_package_count,
    prod.started_at AS production_started_at,
    prod.completed_at AS production_completed_at,
        CASE
            WHEN prod.started_at IS NOT NULL AND prod.completed_at IS NOT NULL THEN GREATEST(0::numeric, floor(EXTRACT(epoch FROM prod.completed_at - prod.started_at) / 60::numeric))::integer
            ELSE NULL::integer
        END AS production_minutes,
    delivery.started_at AS delivery_started_at,
    COALESCE(delivery.delivered_at, o.completed_at) AS delivery_completed_at,
        CASE
            WHEN delivery.started_at IS NOT NULL AND COALESCE(delivery.delivered_at, o.completed_at) IS NOT NULL THEN GREATEST(0::numeric, floor(EXTRACT(epoch FROM COALESCE(delivery.delivered_at, o.completed_at) - delivery.started_at) / 60::numeric))::integer
            ELSE NULL::integer
        END AS delivery_minutes,
    delivery.provider AS delivery_provider,
    delivery.provider_label,
    delivery.shipping_fee,
    delivery.driver_name,
    (o.status_v2 <> ALL (ARRAY['completed'::text, 'cancelled'::text])) AND o.required_at IS NOT NULL AND o.required_at < now() AS is_overdue,
        CASE
            WHEN (o.status_v2 <> ALL (ARRAY['completed'::text, 'cancelled'::text])) AND o.required_at IS NOT NULL AND o.required_at < now() THEN
            CASE o.status_v2
                WHEN 'awaiting_assignment'::text THEN 'Chưa phân bếp'::text
                WHEN 'awaiting_acceptance'::text THEN 'Bếp chưa nhận'::text
                WHEN 'in_production'::text THEN 'Bếp chưa hoàn thành'::text
                WHEN 'ready_for_fulfillment'::text THEN 'Vận tải chưa nhận'::text
                WHEN 'in_delivery'::text THEN 'Vận tải chưa hoàn thành'::text
                ELSE 'Chưa thực hiện'::text
            END
            ELSE NULL::text
        END AS overdue_stage,
        CASE
            WHEN (o.status_v2 <> ALL (ARRAY['completed'::text, 'cancelled'::text])) AND o.required_at IS NOT NULL AND o.required_at < now() THEN floor(EXTRACT(epoch FROM now() - o.required_at) / 60::numeric)::integer
            ELSE 0
        END AS overdue_minutes,
    COALESCE(c.name, NULLIF("substring"(o.note, 'Khách hàng: ([^·]+)'::text), ''::text), o.created_by_name) AS customer_name,
        CASE o.order_type
            WHEN 'cake'::text THEN 'Bánh kem & bánh lạnh'::text
            WHEN 'bakery'::text THEN 'Bánh mặn/ngọt & bánh khác'::text
            WHEN 'macaron'::text THEN 'Macaron'::text
            WHEN 'school'::text THEN 'Trường học'::text
            WHEN 'teabreak'::text THEN 'Teabreak'::text
            WHEN 'mixed'::text THEN 'Đơn nhiều loại'::text
            ELSE o.order_type
        END AS order_type_label,
    items.product_names,
    kitchens.kitchen_names,
    late.was_late,
    late.late_staff_names,
    o.is_internal,
    o.target_store
   FROM orders o
     LEFT JOIN customers c ON c.id = o.customer_id
     LEFT JOIN LATERAL ( SELECT min(wp.accepted_at) AS started_at,
                CASE
                    WHEN count(*) > 0 AND bool_and(wp.completed_at IS NOT NULL) THEN max(wp.completed_at)
                    ELSE NULL::timestamp with time zone
                END AS completed_at
           FROM order_work_packages wp
          WHERE wp.order_id = o.id AND wp.status <> 'cancelled'::text) prod ON true
     LEFT JOIN LATERAL ( SELECT r.started_at,
            s.delivered_at,
            r.provider,
            r.provider_label,
            r.shipping_fee,
            p.full_name AS driver_name
           FROM delivery_stops s
             JOIN delivery_runs r ON r.id = s.delivery_run_id
             LEFT JOIN profiles p ON p.id = r.assigned_driver_id
          WHERE s.order_id = o.id
          ORDER BY r.created_at DESC
         LIMIT 1) delivery ON true
     LEFT JOIN LATERAL ( SELECT string_agg(DISTINCT oi.name, ', '::text) AS product_names
           FROM order_items oi
          WHERE oi.order_id = o.id) items ON true
     LEFT JOIN LATERAL ( SELECT string_agg(DISTINCT ou.name, ', '::text) AS kitchen_names
           FROM order_work_packages wp
             JOIN organization_units ou ON ou.id = wp.unit_id
          WHERE wp.order_id = o.id AND wp.status <> 'cancelled'::text) kitchens ON true
     LEFT JOIN LATERAL ( SELECT bool_or(COALESCE(d.kitchen_late, false) OR COALESCE(d.shipper_late, false)) AS was_late,
            ( SELECT string_agg(DISTINCT names.name, ', '::text) AS string_agg
                   FROM ( SELECT order_lateness_detail.kitchen_staff_name AS name
                           FROM order_lateness_detail
                          WHERE order_lateness_detail.order_id = o.id AND order_lateness_detail.kitchen_late AND order_lateness_detail.kitchen_staff_name IS NOT NULL
                        UNION
                         SELECT order_lateness_detail.shipper_staff_name AS name
                           FROM order_lateness_detail
                          WHERE order_lateness_detail.order_id = o.id AND order_lateness_detail.shipper_late AND order_lateness_detail.shipper_staff_name IS NOT NULL) names) AS late_staff_names
           FROM order_lateness_detail d
          WHERE d.order_id = o.id) late ON true;

insert into public.migration_runs(migration_key, status, finished_at, notes)
values (
  '202608281500_don_hang_noi_bo',
  'completed',
  now(),
  'Phase 1 Đơn hàng nội bộ: cột orders.is_internal/target_store + 2 RPC (create_internal_order đẩy bếp qua auto_create_kitchen_work_packages có sẵn; create_internal_order_from_stock trừ finished_goods_stock, đặt status_v2=ready_for_fulfillment để vào thẳng luồng giao hàng DonKiemNhiem.jsx có sẵn, không tạo work package bếp) + thêm is_internal/target_store vào cuối view order_operations_list (chỉ append cột, không đổi cột cũ) để OrdersV2Screen.jsx tô nhãn NỘI BỘ. Không sửa create_order_v2/order_hearts/delete_order_by_director của Khánh.'
)
on conflict (migration_key) do update
  set status = 'completed', finished_at = now(), notes = excluded.notes;

commit;
