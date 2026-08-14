-- Ghi nhận xuất kho theo đơn hàng (đối lập với nhập kho ở bảng warehouse_stock)
create table if not exists warehouse_stock_out_log (
  id uuid primary key default gen_random_uuid(),
  stock_id uuid references warehouse_stock(id) on delete set null,
  name text not null,
  qty numeric(12,3) not null default 0,
  unit text not null default 'g',
  order_code text,
  note text,
  staff_name text,
  created_at timestamptz not null default now()
);

alter table warehouse_stock_out_log enable row level security;

create policy "read warehouse_stock_out_log" on warehouse_stock_out_log
  for select using (auth.role() = 'authenticated' and public.is_approved());

create policy "insert warehouse_stock_out_log" on warehouse_stock_out_log
  for insert with check (auth.role() = 'authenticated');
