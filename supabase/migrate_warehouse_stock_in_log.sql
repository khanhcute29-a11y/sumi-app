-- Nhật ký nhập kho theo từng lần (đối lập với warehouse_stock_out_log) — trước đây
-- mỗi lần "Thêm nguyên liệu" tạo hẳn 1 dòng warehouse_stock mới dù nguyên liệu đã có
-- sẵn, nên không có 1 con số tồn kho duy nhất đáng tin cậy. Từ giờ nhập thêm nguyên
-- liệu đã tồn tại sẽ cộng dồn vào dòng cũ, và mỗi lần nhập được ghi log riêng ở đây.
create table if not exists warehouse_stock_in_log (
  id uuid primary key default gen_random_uuid(),
  stock_id uuid references warehouse_stock(id) on delete set null,
  name text not null,
  qty numeric(12,3) not null default 0,
  unit text not null default 'g',
  cost_per_unit numeric(12,2) not null default 0,
  photo_url text,
  staff_name text,
  created_at timestamptz not null default now()
);

alter table warehouse_stock_in_log enable row level security;

create policy "read warehouse_stock_in_log" on warehouse_stock_in_log
  for select using (auth.role() = 'authenticated' and public.is_approved());

create policy "insert warehouse_stock_in_log" on warehouse_stock_in_log
  for insert with check (auth.role() = 'authenticated');
