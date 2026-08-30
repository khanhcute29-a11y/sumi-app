-- SUMI APP M102 (30/08) — Chiết khấu / khuyến mãi / mã số thuế / VAT 8% cho
-- đơn Macaron, tính ngay lúc tạo đơn (khác cơ chế Công Nợ Khách Hàng của
-- migration 202608300001 — đó là VAT tính SAU khi đơn trường học giao thành
-- công, ghi vào sổ công nợ riêng; đây là VAT/chiết khấu cộng/trừ THẲNG vào
-- tổng tiền đơn Macaron ngay khi tạo, không đụng gì tới customer_debt_entries).
--
-- Yêu cầu theo tin nhắn Nga Rubi (30/08/2026):
--   "các nội dung cần bổ sung: chiết khấu/khuyến mãi/mã số thuế/... VAT 8% nữa"
--   — xác nhận: chỉ áp dụng cho đơn Macaron, chiết khấu là số tiền cố định
--   (không phải %), khuyến mãi chỉ là ghi chú, VAT tính ngay lúc tạo đơn và
--   cộng thẳng vào tổng đơn.
begin;

alter table public.orders add column if not exists discount_amount numeric(14,0) not null default 0;
alter table public.orders add column if not exists promotion_note text;
alter table public.orders add column if not exists tax_code text;
alter table public.orders add column if not exists vat_amount numeric(14,0) not null default 0;

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
  p_items jsonb,
  p_ship_fee numeric default 0,
  p_deposit numeric default 0,
  p_payment_method text default 'cod',
  p_total numeric default 0,
  p_discount_amount numeric default 0,
  p_promotion_note text default null,
  p_tax_code text default null,
  p_vat_amount numeric default 0
) returns uuid language plpgsql security definer set search_path=public as $$
declare
  v_actor uuid := auth.uid();
  v_order uuid;
  v_item jsonb;
  v_actor_profile public.profiles%rowtype;
  v_channel text;
begin
  if v_actor is null then raise exception 'not authorized'; end if;
  select * into v_actor_profile from public.profiles where id = v_actor;
  if v_actor_profile.id is null or not v_actor_profile.approved or v_actor_profile.active = false then
    raise exception 'Tài khoản chưa được kích hoạt hoặc đã bị khóa';
  end if;

  if p_order_type not in ('cake', 'bakery', 'teabreak', 'macaron', 'school', 'mixed') then
    raise exception 'Loại đơn hàng không hợp lệ: %', p_order_type;
  end if;

  select result_entity_id into v_order
  from public.command_idempotency
  where idempotency_key = p_idempotency_key and actor_id = v_actor;
  if v_order is not null then return v_order; end if;

  v_channel := case
    when p_order_type = 'macaron' then 'Macaron Sỉ'
    when p_order_type = 'teabreak' then 'Teabreak'
    when p_order_type = 'school' then 'Trường học'
    when p_order_type in ('cake', 'bakery') then 'Sếp Lẻ'
    else 'Khác'
  end;

  insert into public.orders(
    order_code, order_type, customer_id, created_by, created_by_name,
    required_at, fulfillment_method_v2, address, note, status, status_v2, confidentiality,
    channel, ship_fee, deposit, payment_method, total,
    delivery_method, discount_amount, promotion_note, tax_code, vat_amount
  )
  values (
    p_order_code, p_order_type, p_customer_id, v_actor, v_actor_profile.full_name,
    p_required_at, p_fulfillment_method, p_address, p_note, 'moi', 'awaiting_assignment',
    case when p_order_type = 'school' then 'school_restricted' else coalesce(p_confidentiality, 'normal') end,
    v_channel, coalesce(p_ship_fee, 0), coalesce(p_deposit, 0), coalesce(p_payment_method, 'cod'), coalesce(p_total, 0),
    case when p_fulfillment_method = 'pickup' then 'lay_tai_xuong' else 'giao_tan_noi' end,
    coalesce(p_discount_amount, 0), nullif(p_promotion_note, ''), nullif(p_tax_code, ''), coalesce(p_vat_amount, 0)
  )
  returning id into v_order;

  for v_item in select value from jsonb_array_elements(p_items) loop
    insert into public.order_items(
      order_id, product_id, name, qty, quantity, unit, name_snapshot, specification, display_order,
      category, size, unit_price
    )
    values(
      v_order,
      case when (v_item->>'product_id') is not null and (v_item->>'product_id') <> '' then (v_item->>'product_id')::uuid else null end,
      coalesce(v_item->>'name', 'Sản phẩm'),
      greatest(1, ceil(coalesce((v_item->>'quantity')::numeric, 1))::int),
      coalesce((v_item->>'quantity')::numeric, 1),
      coalesce(v_item->>'unit', 'cái'),
      coalesce(v_item->>'name', 'Sản phẩm'),
      coalesce(v_item->'specification', '{}'::jsonb),
      coalesce((v_item->>'display_order')::int, 0),
      coalesce(nullif(v_item->'specification'->>'catalog_category', ''), nullif(v_item->'specification'->>'product_flow', '')),
      nullif(v_item->'specification'->>'size', ''),
      nullif(v_item->>'unit_price','')::numeric
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

  perform public.auto_create_kitchen_work_packages(v_order);

  return v_order;
end $$;

insert into public.migration_runs(migration_key, status, finished_at, notes)
values('202608300300_chiet_khau_khuyen_mai_thue_vat_don_macaron', 'completed', now(),
  'Thêm orders.discount_amount/promotion_note/tax_code/vat_amount + create_order_v2 nhận 4 tham số mới (mặc định 0/null, không phá caller cũ). Dùng cho đơn Macaron: chiết khấu số tiền cố định, khuyến mãi ghi chú, VAT 8% cộng thẳng vào tổng đơn lúc tạo — KHÔNG liên quan customer_debt_entries (đó là công nợ trường học tính VAT lúc giao hàng).')
on conflict(migration_key) do update set status='completed', finished_at=now(), notes=excluded.notes;
commit;
