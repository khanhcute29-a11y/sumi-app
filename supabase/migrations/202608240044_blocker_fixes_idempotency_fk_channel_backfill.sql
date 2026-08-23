-- Giai Đoạn 1 SQL Blocker Fixes
-- 1. Fix command_idempotency unique constraint (Blocker A)
-- 2. Fix FK on delete restrict → cascade (Blocker B)
-- 3. Backfill orders.channel + order_items.size/category (Giai Đoạn 2)

-- ============================================================================
-- BLOCKER A: Add unique constraint to command_idempotency
-- ============================================================================
alter table public.command_idempotency
add constraint uk_idempotency_key_actor unique (idempotency_key, actor_id);

-- ============================================================================
-- BLOCKER B: Change FK on delete restrict → cascade
-- ============================================================================
-- work_package_items.order_item_id FK
alter table public.work_package_items
drop constraint if exists work_package_items_order_item_id_fkey;

alter table public.work_package_items
add constraint work_package_items_order_item_id_fkey
foreign key (order_item_id) references public.order_items(id) on delete cascade;

-- delivery_stops.order_id FK
alter table public.delivery_stops
drop constraint if exists delivery_stops_order_id_fkey;

alter table public.delivery_stops
add constraint delivery_stops_order_id_fkey
foreign key (order_id) references public.orders(id) on delete cascade;

-- ============================================================================
-- BACKFILL: orders.channel from order_type
-- Map: cake→'Sếp Lẻ', bakery→'Sếp Lẻ', macaron→'Macaron Sỉ',
--      school→'Trường học', teabreak→'Teabreak', mixed→'Khác'
-- ============================================================================
update public.orders
set channel = case
  when order_type = 'macaron' then 'Macaron Sỉ'
  when order_type = 'teabreak' then 'Teabreak'
  when order_type = 'school' then 'Trường học'
  when order_type in ('cake', 'bakery') then 'Sếp Lẻ'
  when order_type = 'mixed' then 'Khác'
  else 'Khác'
end
where channel is null;

-- ============================================================================
-- BACKFILL: order_items.size from specification
-- Extract specification->>'size' into size column
-- ============================================================================
update public.order_items
set size = specification->>'size'
where size is null and specification ? 'size' and specification->>'size' is not null;

-- ============================================================================
-- BACKFILL: order_items.category from specification or products table
-- First: copy specification->>'catalog_category' if exists
-- Second: left join to products.category if product_id exists
-- ============================================================================
update public.order_items oi
set category = case
  when oi.specification ? 'catalog_category' then oi.specification->>'catalog_category'
  when p.id is not null then p.category
  else null
end
from public.products p
where oi.category is null
  and (oi.specification ? 'catalog_category' or oi.product_id is not null)
  and oi.product_id = p.id;

-- Fallback: if no match from products, use specification->>'product_flow'
update public.order_items
set category = specification->>'product_flow'
where category is null and specification ? 'product_flow';

-- ============================================================================
-- Verify backfills
-- ============================================================================
-- SELECT count(*) FILTER (WHERE channel IS NULL) as channels_still_null,
--        count(*) FILTER (WHERE size IS NULL) as sizes_still_null,
--        count(*) FILTER (WHERE category IS NULL) as cats_still_null
-- FROM public.orders o
-- FULL OUTER JOIN public.order_items oi ON oi.order_id = o.id;
