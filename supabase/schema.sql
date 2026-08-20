-- Sumi Bakery — Ops App schema
-- Chạy toàn bộ file này trong Supabase Dashboard → SQL Editor → New query → Run

-- 1. Hồ sơ nhân viên (mở rộng auth.users)
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  role text not null default 'cashier' check (role in ('owner','cashier','kitchen','shipper','admin','accountant','warehouse','sale','bakery','kitchen_lead','kitchen_deputy','kho_bakery','kho_xuong41','kho_xuong42')),
  extra_roles text[] not null default '{}',
  approved boolean not null default true,
  created_at timestamptz not null default now()
);

-- Hàm dùng chung để kiểm tra tài khoản đã được Chủ sở hữu duyệt chưa — đặt sớm vì
-- nhiều policy đọc dữ liệu bên dưới cần dùng tới.
create or replace function public.is_approved()
returns boolean as $$
  select coalesce((select approved from profiles where id = auth.uid()), false);
$$ language sql stable security definer set search_path = public;

grant execute on function public.is_approved() to authenticated;

-- 2. Khách hàng
create table if not exists customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  channel text,
  trust_score int not null default 3 check (trust_score between 0 and 5),
  vip boolean not null default false,
  locked boolean not null default false,
  note text,
  created_at timestamptz not null default now()
);

-- 3. Đơn hàng (bao gồm luôn thông tin giao hàng — không tách bảng riêng cho gọn)
create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references customers(id) on delete set null,
  channel text,
  status text not null default 'moi' check (status in ('moi','dang_lam','cho_giao','dang_giao','hoan_thanh','huy')),
  sla_label text,
  flagged boolean not null default false,
  order_code text,
  address text,
  delivery_method text not null default 'giao_tan_noi' check (delivery_method in ('giao_tan_noi','lay_tai_xuong')),
  ship_fee numeric(12,0) not null default 0,
  delivery_date text,
  delivery_time text,
  deposit numeric(12,0) not null default 0,
  payment_method text,
  kitchen_staff_name text,
  kitchen_photo_url text,
  shipper_staff_name text,
  pickup_photo_url text,
  delivery_photo_url text,
  signed_doc_photo_url text,
  pickup_lat numeric,
  pickup_lng numeric,
  delivery_lat numeric,
  delivery_lng numeric,
  completed_at timestamptz,
  late_reason text,
  total numeric(12,0) not null default 0,
  paid_amount numeric(12,0) not null default 0,
  note text,
  cancel_reason text,
  cancel_photo_url text,
  cancel_staff_name text,
  created_by_name text,
  created_at timestamptz not null default now()
);

-- 3b. Nhật ký đơn hàng bị xoá hẳn (lưu lại lý do + ảnh trước khi xoá để tra soát)
create table if not exists order_deletion_log (
  id uuid primary key default gen_random_uuid(),
  order_code text,
  customer_name text,
  items_summary text,
  total numeric(12,0) not null default 0,
  reason text,
  photo_url text,
  deleted_by text,
  deleted_at timestamptz not null default now()
);

-- 4. Danh mục sản phẩm (menu + giá) — chọn khi tạo đơn để tự động điền giá
create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null default 'khac' check (category in ('banh_kem','banh_kem_bap_choco','mousse_tiramisu','set_mousse','banh_su','cupcake','banh_man_ngot','teabreak','khac','macaron','banh_trung_thu','trung_thu_combo','phu_kien_trung_thu')),
  unit text not null default 'cái',
  price numeric(12,0) not null default 0,
  photo_url text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- 4b. Biến thể giá theo kích thước (chỉ bánh kem cần, ví dụ 18cm/22cm giá khác nhau)
create table if not exists product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  label text not null,
  price numeric(12,0) not null default 0,
  created_at timestamptz not null default now()
);

-- 4c. Sản phẩm trong đơn
create table if not exists order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  product_id uuid references products(id) on delete set null,
  name text not null,
  qty int not null default 1,
  size text,
  cot text,
  vi text,
  price numeric(12,0) not null default 0,
  ref_photo_url text,
  category text
);

-- 5. Kho nguyên liệu (FIFO) — số lượng có cấu trúc (qty/unit) + đơn giá để tính giá vốn sản phẩm
create table if not exists warehouse_stock (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  qty_label text not null,
  unit text not null default 'g',
  qty numeric(12,3) not null default 0,
  cost_per_unit numeric(12,2) not null default 0,
  status text not null default 'fresh' check (status in ('fresh','soon','expired')),
  expiry_date date,
  photo_url text,
  branch text not null default 'bakery' check (branch in ('bakery', 'xuong41', 'xuong42')),
  created_at timestamptz not null default now()
);

-- 5a. Nhật ký xuất kho theo đơn hàng (đối lập với nhập kho ở warehouse_stock)
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

-- Nhật ký nhập kho theo từng lần — nhập thêm nguyên liệu đã có sẽ cộng dồn vào dòng
-- cũ (không tạo dòng trùng), mỗi lần nhập ghi log riêng ở đây.
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

-- 5b. Công thức (BOM) — nguyên liệu cần cho 1 sản phẩm, dùng để tính giá vốn
create table if not exists product_recipes (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  ingredient_id uuid not null references warehouse_stock(id) on delete cascade,
  qty_per_unit numeric(12,3) not null default 0,
  created_at timestamptz not null default now()
);

-- 6. Sổ quỹ (thu/chi)
create table if not exists cashbook_entries (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('thu','chi')),
  label text not null,
  amount numeric(12,0) not null,
  occurred_at timestamptz not null default now()
);

-- 6b. Công nợ nhà cung cấp (khác công nợ khách hàng — công nợ khách tính trực tiếp từ orders.paid_amount)
create table if not exists debts (
  id uuid primary key default gen_random_uuid(),
  supplier_name text not null,
  amount numeric(12,0) not null default 0,
  due_date date,
  status text not null default 'chua_tra' check (status in ('chua_tra','da_tra')),
  note text,
  paid_at timestamptz,
  created_at timestamptz not null default now()
);

-- 6c. Chốt ca / đối chiếu tiền mặt cuối ngày
create table if not exists cash_reconciliations (
  id uuid primary key default gen_random_uuid(),
  work_date date not null default current_date,
  branch text,
  expected_cash numeric(12,0) not null default 0,
  actual_cash numeric(12,0) not null default 0,
  difference numeric(12,0) not null default 0,
  staff_name text,
  note text,
  created_at timestamptz not null default now()
);

-- 7. Ca làm việc: cấu hình ca (giờ bắt đầu chuẩn) do chủ quản lý
create table if not exists shift_configs (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  branch text,
  start_time time not null,
  wage_per_shift numeric(12,0) not null default 0,
  created_at timestamptz not null default now()
);

-- 7b. Ca làm việc: nhật ký chấm công + xin nghỉ đột xuất
create table if not exists shift_logs (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid references profiles(id) on delete set null,
  staff_name text,
  work_date date not null default current_date,
  shift_label text,
  branch text,
  expected_start time,
  type text not null check (type in ('checkin','checkout','leave_request')),
  checkin_time timestamptz,
  late_minutes int not null default 0,
  wage_earned numeric(12,0) not null default 0,
  reason text,
  photo_url text,
  created_at timestamptz not null default now()
);
create unique index if not exists uniq_shift_checkin_per_day on shift_logs(staff_id, work_date) where type = 'checkin';
create unique index if not exists uniq_shift_checkout_per_day on shift_logs(staff_id, work_date) where type = 'checkout';

-- 7c. Yêu cầu duyệt hợp nhất (sửa/hủy/xoá đơn, chấm công lại) — sếp duyệt/từ chối tại 1 chỗ
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

-- 8. Cấu hình tiệm: vị trí GPS + giá xăng/km + tốc độ trung bình để ước lượng thời gian giao hàng
create table if not exists shop_settings (
  id int primary key default 1,
  shop_lat numeric,
  shop_lng numeric,
  gas_price_per_km numeric not null default 5000,
  avg_speed_kmh numeric not null default 25,
  constraint shop_settings_single_row check (id = 1)
);
insert into shop_settings (id) values (1) on conflict (id) do nothing;

-- 9. Đăng ký nhận thông báo đẩy (push) — mỗi thiết bị/trình duyệt một dòng
create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid references profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth_key text not null,
  created_at timestamptz not null default now()
);

-- RLS: app nội bộ 1 cửa hàng — mọi nhân viên đã đăng nhập được đọc/ghi toàn bộ dữ liệu vận hành.
alter table profiles enable row level security;
alter table customers enable row level security;
alter table orders enable row level security;
alter table order_items enable row level security;
alter table products enable row level security;
alter table product_variants enable row level security;
alter table warehouse_stock enable row level security;
alter table warehouse_stock_out_log enable row level security;
alter table warehouse_stock_in_log enable row level security;
alter table cashbook_entries enable row level security;
alter table order_deletion_log enable row level security;
alter table shift_configs enable row level security;
alter table shift_logs enable row level security;
alter table shop_settings enable row level security;
alter table push_subscriptions enable row level security;
alter table product_recipes enable row level security;
alter table debts enable row level security;
alter table cash_reconciliations enable row level security;
alter table approval_requests enable row level security;

create policy "staff read all profiles" on profiles for select using (auth.role() = 'authenticated');
-- Nhân viên tự sửa hồ sơ của mình; Chủ sở hữu sửa được hồ sơ bất kỳ ai (cần để đổi vai trò nhân viên khác ở Thiết Lập).
-- Cột "role" được khoá riêng ở trigger prevent_self_role_change_trigger bên dưới — chỉ Chủ sở hữu mới đổi được.
create policy "staff update own profile" on profiles
  for update
  using (
    auth.uid() = id
    or exists (select 1 from profiles me where me.id = auth.uid() and me.role = 'owner')
  )
  with check (
    auth.uid() = id
    or exists (select 1 from profiles me where me.id = auth.uid() and me.role = 'owner')
  );
create policy "staff insert own profile" on profiles for insert with check (auth.uid() = id);

-- customers: đọc/tạo mở cho mọi nhân viên (cần để tạo đơn); SỬA/XOÁ (trust_score, khoá COD,
-- xoá khách) chỉ Chủ sở hữu/Thu ngân — trước đây mở cho mọi role, đã siết lại.
create policy "read customers" on customers for select using (auth.role() = 'authenticated' and public.is_approved());
create policy "insert customers" on customers for insert with check (auth.role() = 'authenticated');
create policy "update customers" on customers for update using (exists (select 1 from profiles where id = auth.uid() and role in ('owner','cashier')));
create policy "delete customers" on customers for delete using (exists (select 1 from profiles where id = auth.uid() and role in ('owner','cashier')));

-- warehouse_stock: đọc/tạo/sửa mở (Bếp cần trừ kho nguyên liệu hằng ngày); XOÁ hẳn 1 lô hàng
-- chỉ Chủ sở hữu/Thu ngân.
create policy "read warehouse_stock" on warehouse_stock for select using (auth.role() = 'authenticated' and public.is_approved());
create policy "insert warehouse_stock" on warehouse_stock for insert with check (auth.role() = 'authenticated');
create policy "update warehouse_stock" on warehouse_stock for update using (auth.role() = 'authenticated');
create policy "delete warehouse_stock" on warehouse_stock for delete using (exists (select 1 from profiles where id = auth.uid() and role in ('owner','cashier')));

-- warehouse_stock_out_log: đọc mở, tạo mở (ai xuất kho cũng ghi log được).
create policy "read warehouse_stock_out_log" on warehouse_stock_out_log for select using (auth.role() = 'authenticated' and public.is_approved());
create policy "insert warehouse_stock_out_log" on warehouse_stock_out_log for insert with check (auth.role() = 'authenticated');
create policy "read warehouse_stock_in_log" on warehouse_stock_in_log for select using (auth.role() = 'authenticated' and public.is_approved());
create policy "insert warehouse_stock_in_log" on warehouse_stock_in_log for insert with check (auth.role() = 'authenticated');

-- shift_logs: đọc/tạo mở (ai cũng tự chấm công/xin nghỉ được); SỬA/XOÁ (chỉnh giờ chấm công,
-- lương đã tính) chỉ Chủ sở hữu — dữ liệu công/lương không giao cho nhân viên khác chỉnh sửa.
create policy "read shift_logs" on shift_logs for select using (auth.role() = 'authenticated' and public.is_approved());
create policy "insert shift_logs" on shift_logs for insert with check (auth.role() = 'authenticated');
create policy "update shift_logs" on shift_logs for update using (exists (select 1 from profiles where id = auth.uid() and role = 'owner'));
create policy "delete shift_logs" on shift_logs for delete using (exists (select 1 from profiles where id = auth.uid() and role = 'owner'));

-- approval_requests: đọc mở (ai cũng xem được trạng thái yêu cầu), tạo mở; chỉ Chủ sở hữu/Admin duyệt.
create policy "read approval_requests" on approval_requests for select using (auth.role() = 'authenticated' and public.is_approved());
create policy "insert approval_requests" on approval_requests for insert with check (auth.role() = 'authenticated');
create policy "update approval_requests" on approval_requests for update using (exists (select 1 from profiles where id = auth.uid() and role in ('owner','admin')));

-- Đơn hàng: đọc/tạo mở cho mọi nhân viên; SỬA thì mở ở tầng RLS nhưng bị khoá chi tiết theo vai trò
-- bằng trigger enforce_order_update_permissions() bên dưới (Bếp/Vận chuyển chỉ đụng đúng field/bước
-- việc của mình, không đổi được tiền bạc hay tự huỷ đơn); riêng XOÁ chỉ Chủ sở hữu/Thu ngân.
create policy "read orders" on orders for select using (auth.role() = 'authenticated' and public.is_approved());
create policy "insert orders" on orders for insert with check (auth.role() = 'authenticated');
create policy "update orders" on orders for update using (auth.role() = 'authenticated');
create policy "delete orders" on orders for delete using (status <> 'huy' and exists (select 1 from profiles where id = auth.uid() and role in ('owner','cashier')));

-- Chặn chi tiết theo cột/trạng thái cho vai trò Bếp và Vận chuyển khi UPDATE orders.
-- Chủ sở hữu/Thu ngân không bị ảnh hưởng (return new ngay từ đầu).
create or replace function public.enforce_order_update_permissions()
returns trigger as $$
declare
  my_role text;
  my_name text;
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
    -- Nhận giao hộ: nhân viên ngoài nhóm vận hành đơn (kho, kế toán, bếp trưởng...) được
    -- tự nhận một đơn Chờ giao về tên mình, và sau đó hoàn tất chính đơn mình đang giao.
    -- Mọi trường hợp khác vẫn bị chặn như trước.
    select full_name into my_name from profiles where id = auth.uid();

    if old.status = 'cho_giao' and new.status = 'dang_giao'
       and my_name is not null and new.shipper_staff_name = my_name then
      allowed_cols := array['status', 'shipper_staff_name', 'pickup_photo_url', 'pickup_lat', 'pickup_lng'];
    elsif old.status = 'dang_giao' and new.status in ('dang_giao', 'hoan_thanh')
       and my_name is not null and old.shipper_staff_name = my_name then
      allowed_cols := array['status', 'shipper_staff_name', 'pickup_photo_url', 'pickup_lat', 'pickup_lng',
        'delivery_photo_url', 'delivery_lat', 'delivery_lng', 'completed_at', 'late_reason', 'signed_doc_photo_url'];
    else
      raise exception 'Bạn không có quyền sửa đơn hàng.';
    end if;
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

drop trigger if exists enforce_order_update_permissions_trigger on orders;
create trigger enforce_order_update_permissions_trigger
  before update on orders
  for each row execute procedure public.enforce_order_update_permissions();

-- Điểm tin cậy khách hàng: tính lại tự động mỗi khi đơn hàng của khách thay đổi
-- (tỉ lệ huỷ đơn + có đang nợ tiền đơn đã hoàn thành không), thay vì để cứng giá trị mặc định.
create or replace function public.recompute_customer_trust_score()
returns trigger as $$
declare
  cid uuid;
  total_cnt int;
  cancel_cnt int;
  unpaid numeric;
  new_score int;
  cancel_rate numeric;
begin
  if TG_OP = 'DELETE' then
    cid := old.customer_id;
  else
    cid := new.customer_id;
  end if;
  if cid is null then
    if TG_OP = 'DELETE' then return old; else return new; end if;
  end if;

  select count(*), count(*) filter (where status = 'huy'),
         coalesce(sum(total - paid_amount) filter (where status = 'hoan_thanh' and total > paid_amount), 0)
    into total_cnt, cancel_cnt, unpaid
  from orders where customer_id = cid;

  if total_cnt = 0 then
    new_score := 3;
  else
    cancel_rate := cancel_cnt::numeric / total_cnt;
    if cancel_rate > 0.5 then new_score := 1;
    elsif cancel_rate > 0.25 then new_score := 2;
    elsif cancel_cnt > 0 then new_score := 3;
    else new_score := 5;
    end if;
    if unpaid > 0 then new_score := least(new_score, 3); end if;
  end if;

  update customers set trust_score = new_score where id = cid;
  if TG_OP = 'DELETE' then return old; else return new; end if;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists recompute_customer_trust_score_trigger on orders;
create trigger recompute_customer_trust_score_trigger
  after insert or update of status, total, paid_amount or delete on orders
  for each row execute procedure public.recompute_customer_trust_score();

create policy "read order_items" on order_items for select using (auth.role() = 'authenticated' and public.is_approved());
create policy "insert order_items" on order_items for insert with check (auth.role() = 'authenticated');
-- order_items: Bếp/Vận chuyển không có nghiệp vụ sửa dòng sản phẩm — chỉ Chủ sở hữu/Thu ngân.
create policy "update order_items" on order_items for update using (exists (select 1 from profiles where id = auth.uid() and role in ('owner','cashier')));
create policy "delete order_items" on order_items for delete using (exists (select 1 from profiles where id = auth.uid() and role in ('owner','cashier')));

-- Menu & giá: ai cũng xem được, chỉ Chủ sở hữu/Thu ngân sửa được (tránh Bếp/Vận chuyển lỡ tay đổi giá).
create policy "read products" on products for select using (auth.role() = 'authenticated' and public.is_approved());
create policy "write products" on products for insert with check (exists (select 1 from profiles where id = auth.uid() and role = 'owner'));
create policy "update products" on products for update using (exists (select 1 from profiles where id = auth.uid() and role = 'owner'));
create policy "delete products" on products for delete using (exists (select 1 from profiles where id = auth.uid() and role = 'owner'));

create policy "read product_variants" on product_variants for select using (auth.role() = 'authenticated' and public.is_approved());
create policy "write product_variants" on product_variants for insert with check (exists (select 1 from profiles where id = auth.uid() and role = 'owner'));
create policy "update product_variants" on product_variants for update using (exists (select 1 from profiles where id = auth.uid() and role = 'owner'));
create policy "delete product_variants" on product_variants for delete using (exists (select 1 from profiles where id = auth.uid() and role = 'owner'));

create policy "read product_recipes" on product_recipes for select using (auth.role() = 'authenticated' and public.is_approved());
create policy "write product_recipes" on product_recipes for insert with check (exists (select 1 from profiles where id = auth.uid() and role = 'owner'));
create policy "update product_recipes" on product_recipes for update using (exists (select 1 from profiles where id = auth.uid() and role = 'owner'));
create policy "delete product_recipes" on product_recipes for delete using (exists (select 1 from profiles where id = auth.uid() and role = 'owner'));

-- Sổ quỹ & công nợ: chỉ Chủ sở hữu/Thu ngân được ghi sổ (nhân viên khác không có nghiệp vụ này).
create policy "read cashbook_entries" on cashbook_entries for select using (auth.role() = 'authenticated' and public.is_approved());
create policy "write cashbook_entries" on cashbook_entries for insert with check (exists (select 1 from profiles where id = auth.uid() and role in ('owner','cashier')));
create policy "update cashbook_entries" on cashbook_entries for update using (exists (select 1 from profiles where id = auth.uid() and role in ('owner','cashier')));
create policy "delete cashbook_entries" on cashbook_entries for delete using (exists (select 1 from profiles where id = auth.uid() and role in ('owner','cashier')));

create policy "read debts" on debts for select using (auth.role() = 'authenticated' and public.is_approved());
create policy "write debts" on debts for insert with check (exists (select 1 from profiles where id = auth.uid() and role in ('owner','cashier')));
create policy "update debts" on debts for update using (exists (select 1 from profiles where id = auth.uid() and role in ('owner','cashier')));
create policy "delete debts" on debts for delete using (exists (select 1 from profiles where id = auth.uid() and role in ('owner','cashier')));

create policy "read cash_reconciliations" on cash_reconciliations for select using (auth.role() = 'authenticated' and public.is_approved());
create policy "write cash_reconciliations" on cash_reconciliations for insert with check (exists (select 1 from profiles where id = auth.uid() and role in ('owner','cashier')));

-- Nhật ký xoá đơn: ai cũng ghi được (audit trail), chỉ Chủ sở hữu đọc được (tránh nhân viên xoá dấu vết rồi tự xem lại).
create policy "insert order_deletion_log" on order_deletion_log for insert with check (auth.role() = 'authenticated');
create policy "read order_deletion_log" on order_deletion_log for select using (exists (select 1 from profiles where id = auth.uid() and role = 'owner'));

-- Cấu hình ca làm & cấu hình tiệm: chỉ Chủ sở hữu được sửa.
create policy "read shift_configs" on shift_configs for select using (auth.role() = 'authenticated' and public.is_approved());
create policy "write shift_configs" on shift_configs for insert with check (exists (select 1 from profiles where id = auth.uid() and role = 'owner'));
create policy "update shift_configs" on shift_configs for update using (exists (select 1 from profiles where id = auth.uid() and role = 'owner'));
create policy "delete shift_configs" on shift_configs for delete using (exists (select 1 from profiles where id = auth.uid() and role = 'owner'));

create policy "read shop_settings" on shop_settings for select using (auth.role() = 'authenticated' and public.is_approved());
create policy "update shop_settings" on shop_settings for update using (exists (select 1 from profiles where id = auth.uid() and role = 'owner'));

-- push_subscriptions: nhân viên tự đăng ký/huỷ đăng ký thiết bị của mình; server (Vercel function,
-- không đăng nhập user nào) cần đọc được toàn bộ danh sách để gửi thông báo cho tất cả nhân viên.
create policy "authenticated insert own push_subscriptions" on push_subscriptions for insert with check (auth.role() = 'authenticated');
create policy "authenticated delete own push_subscriptions" on push_subscriptions for delete using (auth.role() = 'authenticated');
create policy "server reads push_subscriptions" on push_subscriptions for select using (true);

-- Ca mặc định: Ca sáng 07:00, Ca chiều 13:00
insert into shift_configs (label, start_time)
select 'Ca sáng', '07:00' where not exists (select 1 from shift_configs where label = 'Ca sáng');
insert into shift_configs (label, start_time)
select 'Ca chiều', '13:00' where not exists (select 1 from shift_configs where label = 'Ca chiều');

-- Khoá cột "role": chỉ Chủ sở hữu mới đổi được vai trò (của chính mình hoặc người khác).
-- Không có trigger này thì bất kỳ ai đăng nhập cũng có thể tự phong mình làm owner qua API trực tiếp.
create or replace function public.prevent_self_role_change()
returns trigger as $$
begin
  if (new.role is distinct from old.role or new.extra_roles is distinct from old.extra_roles) then
    if not exists (select 1 from profiles where id = auth.uid() and role = 'owner') then
      raise exception 'Không thể tự đổi vai trò — chỉ Chủ sở hữu mới có quyền này.';
    end if;
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists prevent_self_role_change_trigger on profiles;
create trigger prevent_self_role_change_trigger
  before update on profiles
  for each row execute procedure public.prevent_self_role_change();

-- Tự tạo hồ sơ nhân viên khi có tài khoản đăng ký mới.
-- Người đăng ký đầu tiên (chưa có ai trong profiles) tự động là "owner" — chủ cửa hàng, không cần phong tay.
create or replace function public.handle_new_user()
returns trigger as $$
declare
  is_first boolean;
begin
  select not exists(select 1 from public.profiles) into is_first;
  insert into public.profiles (id, full_name, role, approved)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', ''), case when is_first then 'owner' else 'cashier' end, is_first);
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Bucket lưu ảnh chụp (tem, bill, ảnh giao hàng) — public read để hiện ảnh trực tiếp trong app.
insert into storage.buckets (id, name, public)
values ('uploads', 'uploads', true)
on conflict (id) do nothing;

create policy "authenticated upload to uploads bucket" on storage.objects
  for insert with check (bucket_id = 'uploads' and auth.role() = 'authenticated');
create policy "public read uploads bucket" on storage.objects
  for select using (bucket_id = 'uploads');

-- Realtime: bật để app phát chuông thông báo khi có đơn mới / đơn giao xong.
alter table orders replica identity full;
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'orders'
  ) then
    alter publication supabase_realtime add table orders;
  end if;
end $$;

-- Audit log: ghi lại ai sửa gì, khi nào, trên các bảng nhạy cảm (tiền + phân quyền) —
-- để trả lời được "chênh quỹ thì chênh vì ai" thay vì chỉ biết có chênh lệch.
create table if not exists audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid,
  actor_name text,
  actor_role text,
  action text,
  table_name text,
  row_id text,
  old_data jsonb,
  new_data jsonb,
  created_at timestamptz not null default now()
);

alter table audit_log enable row level security;

create policy "read audit_log" on audit_log for select using (exists (select 1 from profiles where id = auth.uid() and role = 'owner'));
-- Không có policy insert/update/delete -> chỉ trigger security definer bên dưới ghi được.

create or replace function public.fn_audit_log()
returns trigger as $$
declare
  v_name text;
  v_role text;
begin
  select full_name, role into v_name, v_role from profiles where id = auth.uid();
  insert into audit_log (actor_id, actor_name, actor_role, action, table_name, row_id, old_data, new_data)
  values (
    auth.uid(), v_name, v_role, TG_OP, TG_TABLE_NAME,
    coalesce((case when TG_OP = 'DELETE' then old.id else new.id end)::text, ''),
    case when TG_OP in ('UPDATE','DELETE') then to_jsonb(old) else null end,
    case when TG_OP in ('UPDATE','INSERT') then to_jsonb(new) else null end
  );
  if TG_OP = 'DELETE' then return old; else return new; end if;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists audit_orders on orders;
drop trigger if exists audit_products on products;
drop trigger if exists audit_customers on customers;
drop trigger if exists audit_profiles on profiles;
drop trigger if exists audit_cashbook_entries on cashbook_entries;
drop trigger if exists audit_cash_reconciliations on cash_reconciliations;

create trigger audit_orders after insert or update or delete on orders for each row execute procedure public.fn_audit_log();
create trigger audit_products after insert or update or delete on products for each row execute procedure public.fn_audit_log();
create trigger audit_customers after insert or update or delete on customers for each row execute procedure public.fn_audit_log();
create trigger audit_profiles after insert or update or delete on profiles for each row execute procedure public.fn_audit_log();
create trigger audit_cashbook_entries after insert or update or delete on cashbook_entries for each row execute procedure public.fn_audit_log();
create trigger audit_cash_reconciliations after insert or update or delete on cash_reconciliations for each row execute procedure public.fn_audit_log();

-- Ghi chú đơn hàng: luồng trao đổi giữa người nhận đơn/bếp/vận chuyển/chủ sở hữu trên
-- từng đơn cụ thể — không cần chờ gọi điện/nhắn Zalo riêng khi có tình huống cần xử lý.
create table if not exists order_notes (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  order_code text,
  author_id uuid references profiles(id) on delete set null,
  author_name text,
  author_role text,
  message text not null,
  created_at timestamptz not null default now()
);

alter table order_notes enable row level security;

create policy "read order_notes" on order_notes for select using (auth.role() = 'authenticated' and public.is_approved());
create policy "insert order_notes" on order_notes for insert with check (auth.role() = 'authenticated' and public.is_approved());
-- Không có policy update/delete -> ghi chú đã gửi không sửa/xoá được qua API.

alter table order_notes replica identity full;
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'order_notes'
  ) then
    alter publication supabase_realtime add table order_notes;
  end if;
end $$;

-- Báo Sự Cố 1-Chạm: dùng chung cho Bếp/Vận Chuyển/Kho, phân loại theo mã LOG/KIT/INV.
create table if not exists incident_reports (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references orders(id) on delete set null,
  order_code text,
  category text not null check (category in ('log','kit','inv')),
  code text not null,
  label text not null,
  note text,
  reporter_id uuid references profiles(id) on delete set null,
  reporter_name text,
  reporter_role text,
  status text not null default 'open' check (status in ('open','resolved')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

alter table incident_reports enable row level security;

create policy "read incident_reports" on incident_reports for select using (auth.role() = 'authenticated' and public.is_approved());
create policy "insert incident_reports" on incident_reports for insert with check (auth.role() = 'authenticated' and public.is_approved());
create policy "update incident_reports" on incident_reports for update using (exists (select 1 from profiles where id = auth.uid() and role = 'owner'));

alter table incident_reports replica identity full;
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'incident_reports'
  ) then
    alter publication supabase_realtime add table incident_reports;
  end if;
end $$;
