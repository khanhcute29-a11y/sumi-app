-- 1. Thêm 2 vai trò Bếp trưởng / Bếp phó
alter table profiles drop constraint if exists profiles_role_check;
alter table profiles add constraint profiles_role_check
  check (role in ('owner','cashier','kitchen','shipper','admin','accountant','warehouse','sale','bakery','kitchen_lead','kitchen_deputy'));

-- 2. shift_logs: thêm loại "checkout" (Kết thúc ca), khoá 1 lần bắt đầu / 1 lần kết thúc mỗi ngày
alter table shift_logs drop constraint if exists shift_logs_type_check;
alter table shift_logs add constraint shift_logs_type_check
  check (type in ('checkin','checkout','leave_request'));

-- Dọn các lần chấm công trùng ngày có sẵn trước khi khoá (giữ lại lần chấm mới nhất mỗi ngày).
delete from shift_logs a using shift_logs b
  where a.type = 'checkin' and b.type = 'checkin'
    and a.staff_id = b.staff_id and a.work_date = b.work_date
    and a.created_at < b.created_at;
delete from shift_logs a using shift_logs b
  where a.type = 'checkout' and b.type = 'checkout'
    and a.staff_id = b.staff_id and a.work_date = b.work_date
    and a.created_at < b.created_at;

create unique index if not exists uniq_shift_checkin_per_day on shift_logs(staff_id, work_date) where type = 'checkin';
create unique index if not exists uniq_shift_checkout_per_day on shift_logs(staff_id, work_date) where type = 'checkout';

-- 3. orders: lưu tên người tạo đơn để truy vết
alter table orders add column if not exists created_by_name text;

-- 3b. Sửa lỗi có sẵn: trigger enforce_order_update_permissions chưa nhận diện role mới
--     (admin/sale/bakery) nên bakery không cập nhật được trạng thái đơn ở bếp. Bổ sung
--     admin~owner, sale~cashier, bakery/kitchen_lead/kitchen_deputy~kitchen.
create or replace function public.enforce_order_update_permissions()
returns trigger as $$
declare
  my_role text;
  allowed_cols text[];
  changed_keys text[];
begin
  select role into my_role from profiles where id = auth.uid();

  if my_role in ('owner', 'cashier', 'admin', 'sale') then
    return new;
  end if;

  if my_role in ('kitchen', 'bakery', 'kitchen_lead', 'kitchen_deputy') then
    if not (old.status in ('moi', 'dang_lam') and new.status in ('moi', 'dang_lam', 'cho_giao')) then
      raise exception 'Bếp chỉ được thao tác đơn ở bước Mới / Đang làm / chuyển sang Chờ giao.';
    end if;
    allowed_cols := array['status', 'kitchen_staff_name', 'kitchen_photo_url'];
  elsif my_role = 'shipper' then
    if not (old.status in ('cho_giao', 'dang_giao') and new.status in ('cho_giao', 'dang_giao', 'hoan_thanh')) then
      raise exception 'Vận chuyển chỉ được thao tác đơn ở bước Chờ giao / Đang giao / Hoàn thành.';
    end if;
    allowed_cols := array['status', 'shipper_staff_name', 'pickup_photo_url', 'delivery_photo_url', 'signed_doc_photo_url',
      'pickup_lat', 'pickup_lng', 'delivery_lat', 'delivery_lng', 'completed_at', 'late_reason'];
  else
    raise exception 'Bạn không có quyền sửa đơn hàng.';
  end if;

  select array_agg(n.key) into changed_keys
  from jsonb_each(to_jsonb(new)) n
  join jsonb_each(to_jsonb(old)) o on n.key = o.key
  where n.value is distinct from o.value;

  if changed_keys is not null and exists (select 1 from unnest(changed_keys) k where k <> all (allowed_cols)) then
    raise exception 'Bạn không có quyền sửa các trường: %', array_to_string(changed_keys, ', ');
  end if;

  return new;
end;
$$ language plpgsql security definer set search_path = public;

-- 3c. Sản phẩm: chỉ Chủ sở hữu được thêm/sửa/xoá (trước đây admin/cashier/sale cũng ghi được).
drop policy if exists "write products" on products;
create policy "write products" on products for insert
  with check (exists (select 1 from profiles where id = auth.uid() and role = 'owner'));
drop policy if exists "update products" on products;
create policy "update products" on products for update
  using (exists (select 1 from profiles where id = auth.uid() and role = 'owner'));
drop policy if exists "delete products" on products;
create policy "delete products" on products for delete
  using (exists (select 1 from profiles where id = auth.uid() and role = 'owner'));

drop policy if exists "write product_variants" on product_variants;
create policy "write product_variants" on product_variants for insert
  with check (exists (select 1 from profiles where id = auth.uid() and role = 'owner'));
drop policy if exists "update product_variants" on product_variants;
create policy "update product_variants" on product_variants for update
  using (exists (select 1 from profiles where id = auth.uid() and role = 'owner'));
drop policy if exists "delete product_variants" on product_variants;
create policy "delete product_variants" on product_variants for delete
  using (exists (select 1 from profiles where id = auth.uid() and role = 'owner'));

drop policy if exists "write product_recipes" on product_recipes;
create policy "write product_recipes" on product_recipes for insert
  with check (exists (select 1 from profiles where id = auth.uid() and role = 'owner'));
drop policy if exists "update product_recipes" on product_recipes;
create policy "update product_recipes" on product_recipes for update
  using (exists (select 1 from profiles where id = auth.uid() and role = 'owner'));
drop policy if exists "delete product_recipes" on product_recipes;
create policy "delete product_recipes" on product_recipes for delete
  using (exists (select 1 from profiles where id = auth.uid() and role = 'owner'));

-- 4. Luồng "Yêu cầu duyệt" hợp nhất — thay cho việc gửi yêu cầu qua bình luận đơn hàng
create table if not exists approval_requests (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('order_edit','order_cancel','order_delete','shift_recheck')),
  order_id uuid references orders(id) on delete set null,
  order_code text,
  shift_log_id uuid references shift_logs(id) on delete set null,
  requester_id uuid references profiles(id) on delete set null,
  requester_name text,
  requester_role text,
  reason text,
  photo_url text,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  resolved_by text,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

alter table approval_requests enable row level security;

create policy "read approval_requests" on approval_requests
  for select using (auth.role() = 'authenticated' and public.is_approved());

create policy "insert approval_requests" on approval_requests
  for insert with check (auth.role() = 'authenticated');

create policy "update approval_requests" on approval_requests
  for update using (exists (select 1 from profiles where id = auth.uid() and role in ('owner','admin')));
