-- Run manually in Supabase SQL Editor. Safe to re-run (idempotent).
-- Kho bánh thành phẩm: tồn kho hiện tại theo (sản phẩm, size, chi nhánh),
-- nhập tự động từ Ghi Nhận Sản Xuất, xuất tự động khi đơn Hoàn thành.
-- Hoàn toàn thêm mới — không đụng đến profiles/orders/order_items/products/
-- production_logs/warehouse_stock đang có dữ liệu thật.

create table if not exists finished_goods_stock (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  size text,
  branch text not null check (branch in ('bakery','xuong41','xuong42')),
  qty numeric(12,0) not null default 0,
  updated_at timestamptz not null default now(),
  unique (product_id, size, branch)
);

create table if not exists finished_goods_stock_in_log (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references products(id) on delete set null,
  product_name text not null,
  size text,
  branch text not null,
  qty numeric(12,0) not null,
  source text not null default 'production_log',
  source_id uuid,
  staff_name text,
  note text,
  created_at timestamptz not null default now()
);

create table if not exists finished_goods_stock_out_log (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references products(id) on delete set null,
  product_name text not null,
  size text,
  branch text not null,
  qty numeric(12,0) not null,
  order_id uuid references orders(id) on delete set null,
  order_code text,
  note text,
  created_at timestamptz not null default now()
);

alter table finished_goods_stock enable row level security;
alter table finished_goods_stock_in_log enable row level security;
alter table finished_goods_stock_out_log enable row level security;

drop policy if exists "read finished_goods_stock" on finished_goods_stock;
create policy "read finished_goods_stock" on finished_goods_stock
  for select using (auth.role() = 'authenticated' and public.is_approved());

drop policy if exists "insert finished_goods_stock" on finished_goods_stock;
create policy "insert finished_goods_stock" on finished_goods_stock
  for insert with check (auth.role() = 'authenticated');

drop policy if exists "update finished_goods_stock" on finished_goods_stock;
create policy "update finished_goods_stock" on finished_goods_stock
  for update using (auth.role() = 'authenticated');

drop policy if exists "read finished_goods_stock_in_log" on finished_goods_stock_in_log;
create policy "read finished_goods_stock_in_log" on finished_goods_stock_in_log
  for select using (auth.role() = 'authenticated' and public.is_approved());

drop policy if exists "insert finished_goods_stock_in_log" on finished_goods_stock_in_log;
create policy "insert finished_goods_stock_in_log" on finished_goods_stock_in_log
  for insert with check (auth.role() = 'authenticated');

drop policy if exists "read finished_goods_stock_out_log" on finished_goods_stock_out_log;
create policy "read finished_goods_stock_out_log" on finished_goods_stock_out_log
  for select using (auth.role() = 'authenticated' and public.is_approved());

drop policy if exists "insert finished_goods_stock_out_log" on finished_goods_stock_out_log;
create policy "insert finished_goods_stock_out_log" on finished_goods_stock_out_log
  for insert with check (auth.role() = 'authenticated');
