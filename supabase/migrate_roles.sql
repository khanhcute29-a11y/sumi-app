-- Migration: mở rộng profiles.role để chấp nhận 6 vai trò mới,
-- đồng thời cập nhật các RLS policy để nhận diện vai trò mới tương đương vai trò cũ.
-- An toàn: không đổi dữ liệu hiện có, chỉ mở rộng constraint + policy.

-- 1. Mở rộng CHECK constraint trên profiles.role
alter table profiles drop constraint if exists profiles_role_check;
alter table profiles add constraint profiles_role_check
  check (role in ('owner','cashier','kitchen','shipper','admin','accountant','warehouse','sale','bakery'));

-- 2. Cập nhật các policy đang check role in ('owner','cashier') để nhận thêm role mới tương đương
--    (admin ~ owner, sale ~ cashier)

drop policy if exists "update customers" on customers;
create policy "update customers" on customers for update
  using (exists (select 1 from profiles where id = auth.uid() and role in ('owner','cashier','admin','sale')));

drop policy if exists "delete customers" on customers;
create policy "delete customers" on customers for delete
  using (exists (select 1 from profiles where id = auth.uid() and role in ('owner','cashier','admin','sale')));

drop policy if exists "delete warehouse_stock" on warehouse_stock;
create policy "delete warehouse_stock" on warehouse_stock for delete
  using (exists (select 1 from profiles where id = auth.uid() and role in ('owner','cashier','admin','sale','warehouse')));

drop policy if exists "update shift_logs" on shift_logs;
create policy "update shift_logs" on shift_logs for update
  using (exists (select 1 from profiles where id = auth.uid() and role in ('owner','admin')));

drop policy if exists "delete shift_logs" on shift_logs;
create policy "delete shift_logs" on shift_logs for delete
  using (exists (select 1 from profiles where id = auth.uid() and role in ('owner','admin')));

drop policy if exists "delete orders" on orders;
create policy "delete orders" on orders for delete
  using (status <> 'huy' and exists (select 1 from profiles where id = auth.uid() and role in ('owner','cashier','admin','sale')));

drop policy if exists "update order_items" on order_items;
create policy "update order_items" on order_items for update
  using (exists (select 1 from profiles where id = auth.uid() and role in ('owner','cashier','admin','sale')));

drop policy if exists "delete order_items" on order_items;
create policy "delete order_items" on order_items for delete
  using (exists (select 1 from profiles where id = auth.uid() and role in ('owner','cashier','admin','sale')));

drop policy if exists "write products" on products;
create policy "write products" on products for insert
  with check (exists (select 1 from profiles where id = auth.uid() and role in ('owner','cashier','admin','sale')));
drop policy if exists "update products" on products;
create policy "update products" on products for update
  using (exists (select 1 from profiles where id = auth.uid() and role in ('owner','cashier','admin','sale')));
drop policy if exists "delete products" on products;
create policy "delete products" on products for delete
  using (exists (select 1 from profiles where id = auth.uid() and role in ('owner','cashier','admin','sale')));

drop policy if exists "write product_variants" on product_variants;
create policy "write product_variants" on product_variants for insert
  with check (exists (select 1 from profiles where id = auth.uid() and role in ('owner','cashier','admin','sale')));
drop policy if exists "update product_variants" on product_variants;
create policy "update product_variants" on product_variants for update
  using (exists (select 1 from profiles where id = auth.uid() and role in ('owner','cashier','admin','sale')));
drop policy if exists "delete product_variants" on product_variants;
create policy "delete product_variants" on product_variants for delete
  using (exists (select 1 from profiles where id = auth.uid() and role in ('owner','cashier','admin','sale')));

drop policy if exists "write product_recipes" on product_recipes;
create policy "write product_recipes" on product_recipes for insert
  with check (exists (select 1 from profiles where id = auth.uid() and role in ('owner','cashier','admin','sale')));
drop policy if exists "update product_recipes" on product_recipes;
create policy "update product_recipes" on product_recipes for update
  using (exists (select 1 from profiles where id = auth.uid() and role in ('owner','cashier','admin','sale')));
drop policy if exists "delete product_recipes" on product_recipes;
create policy "delete product_recipes" on product_recipes for delete
  using (exists (select 1 from profiles where id = auth.uid() and role in ('owner','cashier','admin','sale')));

drop policy if exists "write cashbook_entries" on cashbook_entries;
create policy "write cashbook_entries" on cashbook_entries for insert
  with check (exists (select 1 from profiles where id = auth.uid() and role in ('owner','cashier','admin','sale','accountant')));
drop policy if exists "update cashbook_entries" on cashbook_entries;
create policy "update cashbook_entries" on cashbook_entries for update
  using (exists (select 1 from profiles where id = auth.uid() and role in ('owner','cashier','admin','sale','accountant')));
drop policy if exists "delete cashbook_entries" on cashbook_entries;
create policy "delete cashbook_entries" on cashbook_entries for delete
  using (exists (select 1 from profiles where id = auth.uid() and role in ('owner','cashier','admin','sale','accountant')));

drop policy if exists "write debts" on debts;
create policy "write debts" on debts for insert
  with check (exists (select 1 from profiles where id = auth.uid() and role in ('owner','cashier','admin','sale','accountant')));
drop policy if exists "update debts" on debts;
create policy "update debts" on debts for update
  using (exists (select 1 from profiles where id = auth.uid() and role in ('owner','cashier','admin','sale','accountant')));
drop policy if exists "delete debts" on debts;
create policy "delete debts" on debts for delete
  using (exists (select 1 from profiles where id = auth.uid() and role in ('owner','cashier','admin','sale','accountant')));

drop policy if exists "write cash_reconciliations" on cash_reconciliations;
create policy "write cash_reconciliations" on cash_reconciliations for insert
  with check (exists (select 1 from profiles where id = auth.uid() and role in ('owner','cashier','admin','sale','accountant')));

drop policy if exists "read order_deletion_log" on order_deletion_log;
create policy "read order_deletion_log" on order_deletion_log for select
  using (exists (select 1 from profiles where id = auth.uid() and role in ('owner','admin')));

drop policy if exists "write shift_configs" on shift_configs;
create policy "write shift_configs" on shift_configs for insert
  with check (exists (select 1 from profiles where id = auth.uid() and role in ('owner','admin')));
drop policy if exists "update shift_configs" on shift_configs;
create policy "update shift_configs" on shift_configs for update
  using (exists (select 1 from profiles where id = auth.uid() and role in ('owner','admin')));
drop policy if exists "delete shift_configs" on shift_configs;
create policy "delete shift_configs" on shift_configs for delete
  using (exists (select 1 from profiles where id = auth.uid() and role in ('owner','admin')));

drop policy if exists "update shop_settings" on shop_settings;
create policy "update shop_settings" on shop_settings for update
  using (exists (select 1 from profiles where id = auth.uid() and role in ('owner','admin')));

drop policy if exists "update incident_reports" on incident_reports;
create policy "update incident_reports" on incident_reports for update
  using (exists (select 1 from profiles where id = auth.uid() and role in ('owner','admin')));
