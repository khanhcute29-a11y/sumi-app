-- BÁN HÀNG TẠI QUẦY — chạy thật (POS). Chỉ THÊM bảng/hàm mới tiền tố pos_, không sửa/xoá bảng cũ.
--
-- Nguyên tắc:
--  * Mọi thao tác ghi đều đi qua hàm SECURITY DEFINER dùng auth.uid() — trình duyệt KHÔNG tự quyết
--    giá, giảm giá, quyền huỷ, tiền phải thu. Bảng pos_* chỉ cho SELECT, không cho insert/update/delete trực tiếp.
--  * Tồn kho dùng CHUNG bảng finished_goods_stock (cột store_location = 'Vĩnh Phú 42' / 'Quốc Lộ 13',
--    store_location NULL = kho bếp) — không lập sổ kho thứ hai.
--  * Cấp quyền: pos_cap_do() → 'gd' (owner) · 'ql' (admin, trợ lý GĐ) · 'nv' (mọi tài khoản đã duyệt).
--  * Mọi lệnh tạo đều idempotent theo id do máy gửi lên → bán lúc mất mạng, đồng bộ lại không bị trùng.
--  * Công nợ quầy dùng sổ riêng pos_debt_entries (không đụng công nợ trường học customer_debt_entries).
--  * Bật/tắt chạy thật bằng feature_flags.key = 'pos_ban_hang_that' (mặc định TẮT).
--
-- Chạy thử trước:  thay "commit;" cuối file bằng "rollback;" rồi chạy, không lỗi mới chạy thật.

begin;
set local lock_timeout = '10s';
set local statement_timeout = '120s';

-- ───────────────────────── 0. Cờ bật/tắt ─────────────────────────
insert into public.feature_flags(key, enabled, description)
values ('pos_ban_hang_that', false, 'Bán hàng tại quầy ghi dữ liệu thật (hoá đơn, tồn kho, ca, công nợ). Tắt = màn bán hàng chỉ là bản xem trước.')
on conflict (key) do nothing;

-- ───────────────────────── 1. Quyền ─────────────────────────
create or replace function public.pos_cap_do()
returns text language sql stable security definer set search_path = public as $$
  select case
    when p.id is null or not coalesce(p.approved, false) or p.active is false then null
    when p.role = 'owner' or coalesce(p.extra_roles, '{}') && array['owner'] then 'gd'
    when p.role in ('admin', 'deputy_director_x41', 'deputy_director_x42')
      or coalesce(p.extra_roles, '{}') && array['admin', 'deputy_director_x41', 'deputy_director_x42'] then 'ql'
    else 'nv' end
  from (select auth.uid() as uid) u
  left join public.profiles p on p.id = u.uid
$$;

create or replace function public.pos_la_ke_toan()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and coalesce(p.approved, false)
    and p.active is not false and (p.role = 'accountant' or coalesce(p.extra_roles, '{}') && array['accountant']))
$$;

create or replace function public.pos_ten_toi()
returns text language sql stable security definer set search_path = public as $$
  select coalesce(full_name, 'Nhân viên') from public.profiles where id = auth.uid()
$$;

-- ───────────────────────── 2. Bảng ─────────────────────────
create table if not exists public.pos_settings (
  store_location text primary key,
  staff_discount_pct numeric(5,2) not null default 10 check (staff_discount_pct between 0 and 100),
  eod_discount_pct numeric(5,2) not null default 30 check (eod_discount_pct between 0 and 100),
  eod_from time not null default '20:00',
  bank_bin text,
  bank_account text,
  bank_account_name text,
  points_enabled boolean not null default false,
  points_per_amount numeric(14,0) not null default 10000 check (points_per_amount > 0),
  point_value numeric(14,0) not null default 100 check (point_value >= 0),
  debt_limit numeric(14,0) not null default 2000000 check (debt_limit >= 0),
  debt_days int not null default 30 check (debt_days > 0),
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);
insert into public.pos_settings(store_location) values ('Vĩnh Phú 42'), ('Quốc Lộ 13') on conflict do nothing;

create sequence if not exists public.pos_invoice_seq;
create sequence if not exists public.pos_shift_seq;
create sequence if not exists public.pos_doc_seq;

create table if not exists public.pos_shifts (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  store_location text not null references public.pos_settings(store_location),
  opened_by uuid references public.profiles(id) on delete set null,
  opened_by_name text,
  opened_at timestamptz not null default now(),
  opening_cash numeric(14,0) not null default 0,
  status text not null default 'open' check (status in ('open', 'closed')),
  closed_by uuid references public.profiles(id) on delete set null,
  closed_by_name text,
  closed_at timestamptz,
  expected_cash numeric(14,0),
  counted_cash numeric(14,0),
  diff numeric(14,0),
  summary jsonb,
  note text,
  approved_by uuid references public.profiles(id) on delete set null,
  approved_by_name text,
  approved_at timestamptz,
  approve_note text
);
-- Một két tiền mỗi cửa hàng → mỗi cửa hàng chỉ một ca đang mở.
create unique index if not exists pos_shifts_mot_ca_mo on public.pos_shifts(store_location) where status = 'open';

create table if not exists public.pos_price_lists (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create table if not exists public.pos_price_list_items (
  price_list_id uuid not null references public.pos_price_lists(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  variant_id uuid references public.product_variants(id) on delete cascade,
  price numeric(14,0) not null check (price >= 0)
);
create unique index if not exists pos_price_list_items_key on public.pos_price_list_items(price_list_id, product_id, variant_id) nulls not distinct;

create table if not exists public.pos_product_costs (
  product_id uuid not null references public.products(id) on delete cascade,
  variant_id uuid references public.product_variants(id) on delete cascade,
  cost numeric(14,0) not null check (cost >= 0),
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);
create unique index if not exists pos_product_costs_key on public.pos_product_costs(product_id, variant_id) nulls not distinct;

create table if not exists public.pos_approvals (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('giam_gia', 'huy_hd', 'huy_phieu')),
  store_location text not null,
  requested_by uuid references public.profiles(id) on delete set null,
  requested_by_name text,
  payload jsonb not null default '{}',
  status text not null default 'cho' check (status in ('cho', 'dong_y', 'tu_choi', 'da_dung')),
  decided_by uuid references public.profiles(id) on delete set null,
  decided_by_name text,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists pos_approvals_cho on public.pos_approvals(store_location, created_at desc) where status = 'cho';

create table if not exists public.pos_invoices (
  id uuid primary key,
  code text not null unique,
  store_location text not null references public.pos_settings(store_location),
  shift_id uuid references public.pos_shifts(id) on delete set null,
  cashier_id uuid references public.profiles(id) on delete set null,
  cashier_name text,
  seller_name text,
  customer_id uuid references public.customers(id) on delete set null,
  customer_name text,
  customer_phone text,
  price_list_id uuid references public.pos_price_lists(id) on delete set null,
  price_list_name text not null default 'Bảng giá chung',
  gross numeric(14,0) not null,          -- Σ giá niêm yết × SL
  line_discount numeric(14,0) not null default 0,
  eod_discount numeric(14,0) not null default 0,
  invoice_discount numeric(14,0) not null default 0,
  subtotal numeric(14,0) not null,       -- tổng tiền hàng sau giảm dòng
  vat_amount numeric(14,0) not null default 0,
  other_fee numeric(14,0) not null default 0,
  other_fee_detail jsonb not null default '[]',
  points_used int not null default 0,
  points_value numeric(14,0) not null default 0,
  total numeric(14,0) not null,          -- khách cần trả
  pay_method text not null check (pay_method in ('tien_mat', 'chuyen_khoan', 'the')),
  paid_amount numeric(14,0) not null default 0,   -- tiền thực thu (đã trừ tiền thừa)
  received_amount numeric(14,0) not null default 0, -- khách đưa
  change_amount numeric(14,0) not null default 0,
  debt_amount numeric(14,0) not null default 0,
  points_earned int not null default 0,
  transfer_status text not null default 'khong' check (transfer_status in ('khong', 'cho_xac_nhan', 'da_ve', 'khong_thay')),
  transfer_checked_by_name text,
  transfer_checked_at timestamptz,
  note text,
  status text not null default 'xong' check (status in ('xong', 'huy')),
  cancel_reason text,
  cancelled_by uuid references public.profiles(id) on delete set null,
  cancelled_by_name text,
  cancelled_at timestamptz,
  offline boolean not null default false,
  client_created_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists pos_invoices_store_time on public.pos_invoices(store_location, created_at desc);
create index if not exists pos_invoices_shift on public.pos_invoices(shift_id);
create index if not exists pos_invoices_customer on public.pos_invoices(customer_id) where customer_id is not null;
create index if not exists pos_invoices_ck_cho on public.pos_invoices(store_location) where transfer_status = 'cho_xac_nhan';

create table if not exists public.pos_invoice_lines (
  id bigserial primary key,
  invoice_id uuid not null references public.pos_invoices(id) on delete cascade,
  line_no int not null,
  product_id uuid references public.products(id) on delete set null,
  variant_id uuid references public.product_variants(id) on delete set null,
  size text,
  name text not null,
  qty numeric(12,2) not null check (qty > 0),
  list_price numeric(14,0) not null,
  unit_price numeric(14,0) not null,
  line_discount numeric(14,0) not null default 0,
  line_total numeric(14,0) not null,
  eod boolean not null default false,
  note text
);
create index if not exists pos_invoice_lines_invoice on public.pos_invoice_lines(invoice_id);
create index if not exists pos_invoice_lines_product on public.pos_invoice_lines(product_id);

create table if not exists public.pos_debt_entries (
  id uuid primary key,
  customer_id uuid not null references public.customers(id) on delete restrict,
  invoice_id uuid references public.pos_invoices(id) on delete set null,
  entry_type text not null check (entry_type in ('ban_no', 'thu_no', 'huy_hd', 'dieu_chinh')),
  amount numeric(14,0) not null,          -- +: nợ tăng · −: nợ giảm (âm = khách đang dư tiền)
  pay_method text check (pay_method in ('tien_mat', 'chuyen_khoan', 'the')),
  store_location text,
  shift_id uuid references public.pos_shifts(id) on delete set null,
  note text,
  created_by uuid references public.profiles(id) on delete set null,
  created_by_name text,
  created_at timestamptz not null default now()
);
create index if not exists pos_debt_entries_customer on public.pos_debt_entries(customer_id, created_at desc);

create table if not exists public.pos_points_entries (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  invoice_id uuid references public.pos_invoices(id) on delete set null,
  points int not null,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists pos_points_entries_customer on public.pos_points_entries(customer_id);

create table if not exists public.pos_stock_docs (
  id uuid primary key,
  code text not null unique,
  doc_type text not null check (doc_type in ('bep_giao', 'xuat_huy', 'kiem_kho', 'noi_bo')),
  store_location text not null references public.pos_settings(store_location),
  status text not null check (status in ('tam', 'cho_nhan', 'xong', 'huy')),
  lines jsonb not null default '[]',      -- [{product_id, variant_id, size, name, qty, qty_received, system_qty, delta}]
  reason text,
  note text,
  photo_url text,
  shift_id uuid references public.pos_shifts(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  created_by_name text,
  created_at timestamptz not null default now(),
  done_by uuid references public.profiles(id) on delete set null,
  done_by_name text,
  done_at timestamptz,
  cancelled_by_name text,
  cancelled_at timestamptz,
  cancel_reason text
);
create index if not exists pos_stock_docs_store on public.pos_stock_docs(store_location, created_at desc);

-- Thẻ kho của quầy: mọi lần tồn cửa hàng thay đổi do quầy.
create table if not exists public.pos_stock_ledger (
  id bigserial primary key,
  at timestamptz not null default now(),
  store_location text,                    -- NULL = kho bếp
  product_id uuid,
  size text,
  name text,
  delta numeric(12,2) not null,
  balance_after numeric(12,2),
  ref_type text not null,                 -- ban · huy_hd · bep_giao · nhan_hang · xuat_huy · kiem_kho · noi_bo · huy_phieu
  ref_code text,
  actor_name text
);
create index if not exists pos_stock_ledger_store on public.pos_stock_ledger(store_location, at desc);

create table if not exists public.pos_order_payments (
  id uuid primary key,
  order_id uuid not null references public.orders(id) on delete restrict,
  order_code text,
  kind text not null check (kind in ('coc', 'thu_con_lai')),
  amount numeric(14,0) not null check (amount > 0),
  pay_method text not null check (pay_method in ('tien_mat', 'chuyen_khoan', 'the')),
  store_location text not null,
  shift_id uuid references public.pos_shifts(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  created_by_name text,
  created_at timestamptz not null default now()
);
create index if not exists pos_order_payments_order on public.pos_order_payments(order_id);

create table if not exists public.pos_audit_log (
  id bigserial primary key,
  at timestamptz not null default now(),
  actor uuid,
  actor_name text,
  store_location text,
  action text not null,
  ref text,
  detail jsonb not null default '{}'
);
create index if not exists pos_audit_log_at on public.pos_audit_log(at desc);

-- ───────────────────────── 3. RLS: chỉ đọc; ghi qua hàm ─────────────────────────
do $$
declare t text;
begin
  foreach t in array array['pos_settings','pos_shifts','pos_price_lists','pos_price_list_items','pos_product_costs',
    'pos_approvals','pos_invoices','pos_invoice_lines','pos_debt_entries','pos_points_entries','pos_stock_docs',
    'pos_stock_ledger','pos_order_payments','pos_audit_log'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);   -- RLS không chặn TRUNCATE → thu hồi hết
    execute format('grant select on public.%I to authenticated', t);
    execute format('drop policy if exists %I on public.%I', t || '_doc', t);
  end loop;
end $$;
revoke all on sequence public.pos_invoice_seq, public.pos_shift_seq, public.pos_doc_seq from anon, authenticated;

create policy pos_settings_doc on public.pos_settings for select to authenticated using (public.pos_cap_do() is not null);
create policy pos_shifts_doc on public.pos_shifts for select to authenticated using (public.pos_cap_do() is not null);
create policy pos_price_lists_doc on public.pos_price_lists for select to authenticated using (public.pos_cap_do() is not null);
create policy pos_price_list_items_doc on public.pos_price_list_items for select to authenticated using (public.pos_cap_do() is not null);
create policy pos_product_costs_doc on public.pos_product_costs for select to authenticated using (public.pos_cap_do() = 'gd');
create policy pos_approvals_doc on public.pos_approvals for select to authenticated
  using (public.pos_cap_do() in ('gd', 'ql') or requested_by = auth.uid());
create policy pos_invoices_doc on public.pos_invoices for select to authenticated using (public.pos_cap_do() is not null);
create policy pos_invoice_lines_doc on public.pos_invoice_lines for select to authenticated using (public.pos_cap_do() is not null);
create policy pos_debt_entries_doc on public.pos_debt_entries for select to authenticated using (public.pos_cap_do() is not null);
create policy pos_points_entries_doc on public.pos_points_entries for select to authenticated using (public.pos_cap_do() is not null);
create policy pos_stock_docs_doc on public.pos_stock_docs for select to authenticated using (public.pos_cap_do() is not null);
create policy pos_stock_ledger_doc on public.pos_stock_ledger for select to authenticated using (public.pos_cap_do() is not null);
create policy pos_order_payments_doc on public.pos_order_payments for select to authenticated using (public.pos_cap_do() is not null);
create policy pos_audit_log_doc on public.pos_audit_log for select to authenticated using (public.pos_cap_do() in ('gd', 'ql'));

-- ───────────────────────── 4. Hàm nội bộ ─────────────────────────
create or replace function public.pos__ghi_nhat_ky(p_store text, p_action text, p_ref text, p_detail jsonb)
returns void language sql security definer set search_path = public as $$
  insert into public.pos_audit_log(actor, actor_name, store_location, action, ref, detail)
  values (auth.uid(), public.pos_ten_toi(), p_store, p_action, p_ref, coalesce(p_detail, '{}'))
$$;

create or replace function public.pos__bao_sep(p_key text, p_title text, p_body text, p_entity uuid, p_severity text default 'info')
returns void language plpgsql security definer set search_path = public as $$
declare r record;
begin
  for r in select id from public.profiles
    where coalesce(approved, false) and active is not false
      and (role = 'owner' or coalesce(extra_roles, '{}') && array['owner']) loop
    insert into public.notifications(event_key, recipient_profile_id, notification_type, severity, sound_key,
      title, body, entity_type, entity_id, deep_link)
    values (p_key || ':' || r.id, r.id, 'pos_ban_hang', p_severity, 'ting', p_title, p_body, 'pos', p_entity, '/?mockup=ban-hang')
    on conflict (event_key) do nothing;
  end loop;
end $$;

create or replace function public.pos__bao_quan_ly(p_key text, p_title text, p_body text, p_entity uuid)
returns void language plpgsql security definer set search_path = public as $$
declare r record;
begin
  for r in select id from public.profiles
    where coalesce(approved, false) and active is not false
      and (role in ('owner', 'admin', 'deputy_director_x41', 'deputy_director_x42')
        or coalesce(extra_roles, '{}') && array['owner', 'admin', 'deputy_director_x41', 'deputy_director_x42']) loop
    insert into public.notifications(event_key, recipient_profile_id, notification_type, severity, sound_key,
      title, body, entity_type, entity_id, deep_link)
    values (p_key || ':' || r.id, r.id, 'pos_duyet', 'warning', 'ting', p_title, p_body, 'pos', p_entity, '/?mockup=ban-hang')
    on conflict (event_key) do nothing;
  end loop;
end $$;

-- Kho của product: macaron → xuong41, teabreak → xuong42, còn lại bakery (khớp branchForCategory phía app).
create or replace function public.pos__kho_cua(p_product uuid)
returns text language sql stable security definer set search_path = public as $$
  select case p.category when 'macaron' then 'xuong41' when 'teabreak' then 'xuong42' else 'bakery' end
  from public.products p where p.id = p_product
$$;

-- Cộng/trừ tồn một dòng finished_goods_stock (thành phẩm, đúng cửa hàng; p_store NULL = kho bếp). Trả về tồn mới.
create or replace function public.pos__ton_cong(p_store text, p_product uuid, p_size text, p_name text, p_delta numeric,
  p_ref_type text, p_ref_code text)
returns numeric language plpgsql security definer set search_path = public as $$
declare v_branch text := coalesce(public.pos__kho_cua(p_product), 'bakery');
  v_size text := nullif(p_size, ''); v_id uuid; v_qty numeric;
begin
  perform pg_advisory_xact_lock(hashtext('pos_ton:' || p_product || ':' || coalesce(v_size, '') || ':' || coalesce(p_store, '')));
  select id, qty into v_id, v_qty from public.finished_goods_stock
    where product_id = p_product and branch = v_branch and is_semi_finished = false
      and size is not distinct from v_size and store_location is not distinct from p_store
    order by updated_at desc nulls last limit 1 for update;
  if v_id is null then
    insert into public.finished_goods_stock(product_id, size, branch, store_location, qty, is_semi_finished)
    values (p_product, v_size, v_branch, p_store, p_delta, false) returning qty into v_qty;
  else
    update public.finished_goods_stock set qty = coalesce(qty, 0) + p_delta, updated_at = now()
      where id = v_id returning qty into v_qty;
  end if;
  insert into public.pos_stock_ledger(store_location, product_id, size, name, delta, balance_after, ref_type, ref_code, actor_name)
  values (p_store, p_product, v_size, p_name, p_delta, v_qty, p_ref_type, p_ref_code, public.pos_ten_toi());
  return v_qty;
end $$;

create or replace function public.pos__ton(p_store text, p_product uuid, p_size text)
returns numeric language sql stable security definer set search_path = public as $$
  select coalesce((select qty from public.finished_goods_stock
    where product_id = p_product and branch = coalesce(public.pos__kho_cua(p_product), 'bakery') and is_semi_finished = false
      and size is not distinct from nullif(p_size, '') and store_location is not distinct from p_store
    order by updated_at desc nulls last limit 1), 0)
$$;

create or replace function public.pos__ca_mo(p_store text)
returns uuid language sql stable security definer set search_path = public as $$
  select id from public.pos_shifts where store_location = p_store and status = 'open' limit 1
$$;

create or replace function public.pos__no_cua(p_customer uuid)
returns numeric language sql stable security definer set search_path = public as $$
  select coalesce(sum(amount), 0) from public.pos_debt_entries where customer_id = p_customer
$$;

create or replace function public.pos__diem_cua(p_customer uuid)
returns int language sql stable security definer set search_path = public as $$
  select coalesce(sum(points), 0)::int from public.pos_points_entries where customer_id = p_customer
$$;

-- Giá niêm yết theo bảng giá (không có trong bảng giá → giá gốc biến thể/sản phẩm).
create or replace function public.pos__gia(p_price_list uuid, p_product uuid, p_variant uuid)
returns numeric language sql stable security definer set search_path = public as $$
  select coalesce(
    (select i.price from public.pos_price_list_items i where p_price_list is not null and i.price_list_id = p_price_list
       and i.product_id = p_product and i.variant_id is not distinct from p_variant),
    (select nullif(v.price, 0) from public.product_variants v where p_variant is not null and v.id = p_variant),
    (select p.price from public.products p where p.id = p_product), 0)
$$;

-- ───────────────────────── 5. Ca làm ─────────────────────────
create or replace function public.pos_mo_ca(p_store text, p_opening_cash numeric default 0)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_cap text := public.pos_cap_do(); v_row public.pos_shifts;
begin
  if v_cap is null then raise exception 'Tài khoản chưa được duyệt'; end if;
  perform pg_advisory_xact_lock(hashtext('pos_ca:' || p_store));
  select * into v_row from public.pos_shifts where store_location = p_store and status = 'open';
  if v_row.id is not null then return to_jsonb(v_row); end if;
  insert into public.pos_shifts(code, store_location, opened_by, opened_by_name, opening_cash)
  values ('PGC' || lpad(nextval('public.pos_shift_seq')::text, 6, '0'), p_store, auth.uid(), public.pos_ten_toi(),
    greatest(coalesce(p_opening_cash, 0), 0))
  returning * into v_row;
  perform public.pos__ghi_nhat_ky(p_store, 'mo_ca', v_row.code, jsonb_build_object('tien_dau_ca', v_row.opening_cash));
  return to_jsonb(v_row);
end $$;

-- Số liệu tiền của một ca (dùng cho kết ca & phiếu bàn giao).
create or replace function public.pos__so_lieu_ca(p_shift uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  with s as (select * from public.pos_shifts where id = p_shift),
  hd as (select * from public.pos_invoices where shift_id = p_shift and status = 'xong'),
  tn as (select * from public.pos_debt_entries where shift_id = p_shift and entry_type = 'thu_no'),
  dn as (select * from public.pos_order_payments where shift_id = p_shift),
  -- Huỷ trong ca này một hoá đơn của ca KHÁC đã thu tiền mặt → tiền trả lại khách đi ra từ két ca này.
  ht as (select i.* from public.pos_invoices i, s where i.status = 'huy' and i.store_location = s.store_location
           and i.shift_id is distinct from p_shift and i.pay_method = 'tien_mat'
           and i.cancelled_at >= s.opened_at and i.cancelled_at < coalesce(s.closed_at, now()))
  select jsonb_build_object(
    'so_hoa_don', (select count(*) from hd),
    'so_huy', (select count(*) from public.pos_invoices where shift_id = p_shift and status = 'huy'),
    'doanh_thu', (select coalesce(sum(total), 0) from hd),
    'ban', jsonb_build_object(
      'tien_mat', (select coalesce(sum(paid_amount), 0) from hd where pay_method = 'tien_mat'),
      'chuyen_khoan', (select coalesce(sum(paid_amount), 0) from hd where pay_method = 'chuyen_khoan'),
      'the', (select coalesce(sum(paid_amount), 0) from hd where pay_method = 'the'),
      'ghi_no', (select coalesce(sum(debt_amount), 0) from hd)),
    'thu_no', jsonb_build_object(
      'tien_mat', (select coalesce(-sum(amount), 0) from tn where pay_method = 'tien_mat'),
      'chuyen_khoan', (select coalesce(-sum(amount), 0) from tn where pay_method = 'chuyen_khoan'),
      'the', (select coalesce(-sum(amount), 0) from tn where pay_method = 'the')),
    'don_dat', jsonb_build_object(
      'tien_mat', (select coalesce(sum(amount), 0) from dn where pay_method = 'tien_mat'),
      'chuyen_khoan', (select coalesce(sum(amount), 0) from dn where pay_method = 'chuyen_khoan'),
      'the', (select coalesce(sum(amount), 0) from dn where pay_method = 'the')),
    'ck_chua_xac_nhan', (select count(*) from hd where transfer_status = 'cho_xac_nhan'),
    'tien_dau_ca', (select opening_cash from s),
    'hoan_tien_huy', (select coalesce(sum(paid_amount), 0) from ht),
    'tien_mat_trong_ca',
      (select coalesce(sum(paid_amount), 0) from hd where pay_method = 'tien_mat')
      + (select coalesce(-sum(amount), 0) from tn where pay_method = 'tien_mat')
      + (select coalesce(sum(amount), 0) from dn where pay_method = 'tien_mat')
      - (select coalesce(sum(paid_amount), 0) from ht))
$$;

create or replace function public.pos_dong_ca(p_shift uuid, p_counted numeric, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_cap text := public.pos_cap_do(); v_s public.pos_shifts; v_sl jsonb; v_expected numeric; v_diff numeric;
begin
  if v_cap is null then raise exception 'Tài khoản chưa được duyệt'; end if;
  select * into v_s from public.pos_shifts where id = p_shift for update;
  if v_s.id is null then raise exception 'Không tìm thấy ca'; end if;
  if v_s.status <> 'open' then raise exception 'Ca này đã đóng rồi'; end if;
  if p_counted is null or p_counted < 0 then raise exception 'Nhập số tiền mặt đếm được trong két'; end if;
  v_sl := public.pos__so_lieu_ca(p_shift);
  v_expected := v_s.opening_cash + (v_sl->>'tien_mat_trong_ca')::numeric;
  v_diff := p_counted - v_expected;
  update public.pos_shifts set status = 'closed', closed_by = auth.uid(), closed_by_name = public.pos_ten_toi(),
    closed_at = now(), expected_cash = v_expected, counted_cash = p_counted, diff = v_diff, summary = v_sl, note = p_note
  where id = p_shift returning * into v_s;
  perform public.pos__ghi_nhat_ky(v_s.store_location, 'dong_ca', v_s.code,
    jsonb_build_object('he_thong', v_expected, 'dem', p_counted, 'chenh', v_diff));
  perform public.pos__bao_sep('pos-dong-ca:' || v_s.id,
    case when v_diff < 0 then '⚠️ Thiếu két ' || to_char(-v_diff, 'FM999G999G999') || 'đ — ' || v_s.store_location
         when v_diff > 0 then 'Dư két ' || to_char(v_diff, 'FM999G999G999') || 'đ — ' || v_s.store_location
         else 'Đã đóng ca ' || v_s.store_location end,
    v_s.closed_by_name || ' đóng ca ' || v_s.code || ': ' || (v_sl->>'so_hoa_don') || ' hoá đơn, doanh thu '
      || to_char((v_sl->>'doanh_thu')::numeric, 'FM999G999G999') || 'đ. Tiền mặt hệ thống '
      || to_char(v_expected, 'FM999G999G999') || 'đ, đếm được ' || to_char(p_counted, 'FM999G999G999') || 'đ.'
      || case when (v_sl->>'ck_chua_xac_nhan')::int > 0 then ' Còn ' || (v_sl->>'ck_chua_xac_nhan') || ' chuyển khoản chưa xác nhận tiền về.' else '' end,
    v_s.id, case when v_diff <> 0 then 'warning' else 'info' end);
  return to_jsonb(v_s);
end $$;

create or replace function public.pos_duyet_ca(p_shift uuid, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_s public.pos_shifts;
begin
  if public.pos_cap_do() not in ('gd', 'ql') then raise exception 'Chỉ Quản lý / Giám đốc duyệt ca'; end if;
  update public.pos_shifts set approved_by = auth.uid(), approved_by_name = public.pos_ten_toi(), approved_at = now(),
    approve_note = p_note where id = p_shift and status = 'closed' returning * into v_s;
  if v_s.id is null then raise exception 'Ca chưa đóng hoặc không tồn tại'; end if;
  perform public.pos__ghi_nhat_ky(v_s.store_location, 'duyet_ca', v_s.code, jsonb_build_object('ghi_chu', p_note, 'chenh', v_s.diff));
  return to_jsonb(v_s);
end $$;

-- ───────────────────────── 6. Duyệt tại chỗ (giảm giá vượt mức, huỷ ngoài ca) ─────────────────────────
create or replace function public.pos_xin_duyet(p_kind text, p_store text, p_payload jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_ten text := public.pos_ten_toi();
begin
  if public.pos_cap_do() is null then raise exception 'Tài khoản chưa được duyệt'; end if;
  insert into public.pos_approvals(kind, store_location, requested_by, requested_by_name, payload)
  values (p_kind, p_store, auth.uid(), v_ten, coalesce(p_payload, '{}')) returning id into v_id;
  perform public.pos__bao_quan_ly('pos-xin-duyet:' || v_id,
    case p_kind when 'giam_gia' then '🏷️ Xin duyệt giảm giá' when 'huy_hd' then '🧾 Xin duyệt huỷ hoá đơn' else '📦 Xin duyệt huỷ phiếu kho' end,
    v_ten || ' (' || p_store || ') ' || coalesce(p_payload->>'mo_ta', '') || ' — mở Bán hàng → Chờ duyệt.', v_id);
  return v_id;
end $$;

create or replace function public.pos_quyet_duyet(p_id uuid, p_dong_y boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_a public.pos_approvals;
begin
  if public.pos_cap_do() not in ('gd', 'ql') then raise exception 'Chỉ Quản lý / Giám đốc duyệt được'; end if;
  update public.pos_approvals set status = case when p_dong_y then 'dong_y' else 'tu_choi' end,
    decided_by = auth.uid(), decided_by_name = public.pos_ten_toi(), decided_at = now()
  where id = p_id and status = 'cho' returning * into v_a;
  if v_a.id is null then raise exception 'Yêu cầu đã được xử lý rồi'; end if;
  perform public.pos__ghi_nhat_ky(v_a.store_location, case when p_dong_y then 'dong_y_' else 'tu_choi_' end || v_a.kind,
    v_a.id::text, v_a.payload || jsonb_build_object('nguoi_xin', v_a.requested_by_name));
  return to_jsonb(v_a);
end $$;

-- ───────────────────────── 7. Bán hàng ─────────────────────────
-- p jsonb: {id, store, customer_id, price_list_id, seller_name, lines:[{product_id, variant_id, size, name, qty,
--   list_price, unit_price, eod, note}], invoice_discount, vat, other_fees:[{ten, tien}], points_used,
--   pay_method, received, note, approval_id, offline, client_created_at}
create or replace function public.pos_ban(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_cap text := public.pos_cap_do(); v_ten text := public.pos_ten_toi();
  v_id uuid := (p->>'id')::uuid; v_store text := p->>'store';
  v_set public.pos_settings; v_old public.pos_invoices; v_line jsonb; v_no int := 0;
  v_pl uuid := nullif(p->>'price_list_id', '')::uuid; v_pl_name text := 'Bảng giá chung';
  v_cust uuid := nullif(p->>'customer_id', '')::uuid; v_cust_row public.customers;
  v_gross numeric := 0; v_line_disc numeric := 0; v_eod numeric := 0; v_sub numeric := 0;
  v_list numeric; v_unit numeric; v_qty numeric; v_inv_disc numeric; v_vat numeric; v_fee numeric := 0;
  v_pts int; v_pts_val numeric := 0; v_total numeric; v_method text; v_recv numeric; v_paid numeric; v_change numeric := 0;
  v_debt numeric := 0; v_code text; v_now_vn time := (now() at time zone 'Asia/Ho_Chi_Minh')::time;
  v_ap public.pos_approvals; v_pct numeric; v_earn int := 0; v_no_cu numeric;
begin
  if v_cap is null then raise exception 'Tài khoản chưa được duyệt'; end if;
  if v_id is null then raise exception 'Thiếu mã hoá đơn'; end if;
  select * into v_old from public.pos_invoices where id = v_id;
  if v_old.id is not null then return jsonb_build_object('id', v_old.id, 'code', v_old.code, 'trung', true); end if;
  select * into v_set from public.pos_settings where store_location = v_store;
  if v_set.store_location is null then raise exception 'Chi nhánh không hợp lệ'; end if;
  if jsonb_array_length(coalesce(p->'lines', '[]')) = 0 then raise exception 'Hoá đơn chưa có hàng'; end if;
  if v_pl is not null then
    select name into v_pl_name from public.pos_price_lists where id = v_pl and active;
    if v_pl_name is null then raise exception 'Bảng giá không còn dùng'; end if;
  end if;
  if v_cust is not null then select * into v_cust_row from public.customers where id = v_cust; end if;

  -- Giá niêm yết phải khớp database (chống sửa giá bên trình duyệt). Giảm giá dòng = niêm yết − đơn giá bán.
  for v_line in select value from jsonb_array_elements(p->'lines') loop
    v_qty := (v_line->>'qty')::numeric;
    if v_qty is null or v_qty <= 0 then raise exception 'Số lượng phải lớn hơn 0'; end if;
    v_list := public.pos__gia(v_pl, (v_line->>'product_id')::uuid, nullif(v_line->>'variant_id', '')::uuid);
    if round((v_line->>'list_price')::numeric) <> v_list then
      raise exception 'Giá "%" đã thay đổi (đúng là %đ). Tải lại trang rồi bán lại.', v_line->>'name', to_char(v_list, 'FM999G999G999');
    end if;
    v_unit := least(greatest(round(coalesce((v_line->>'unit_price')::numeric, v_list)), 0), v_list);
    if coalesce((v_line->>'eod')::boolean, false) then
      if v_now_vn < v_set.eod_from then raise exception 'Chưa tới giờ giảm giá cuối ngày (%)', to_char(v_set.eod_from, 'HH24:MI'); end if;
      if v_unit < round(v_list * (1 - v_set.eod_discount_pct / 100)) then
        raise exception 'Giảm giá cuối ngày tối đa %%%', v_set.eod_discount_pct; end if;
      v_eod := v_eod + (v_list - v_unit) * v_qty;
    else
      v_line_disc := v_line_disc + (v_list - v_unit) * v_qty;
    end if;
    v_gross := v_gross + v_list * v_qty;
    v_sub := v_sub + v_unit * v_qty;
  end loop;

  v_inv_disc := least(greatest(round(coalesce((p->>'invoice_discount')::numeric, 0)), 0), v_sub);
  select coalesce(sum(greatest(round((f->>'tien')::numeric), 0)), 0) into v_fee from jsonb_array_elements(coalesce(p->'other_fees', '[]')) f;
  v_vat := case when coalesce((p->>'vat')::boolean, false) then round((v_sub - v_inv_disc) * 0.08) else 0 end;

  -- Hạn mức giảm giá: nhân viên vượt % cho phép phải có phiếu duyệt của Quản lý/GĐ.
  v_pct := case when v_gross > 0 then (v_line_disc + v_inv_disc) * 100 / v_gross else 0 end;
  if v_cap = 'nv' and v_pct > v_set.staff_discount_pct then
    select * into v_ap from public.pos_approvals where id = nullif(p->>'approval_id', '')::uuid for update;
    if v_ap.id is null or v_ap.kind <> 'giam_gia' or v_ap.status <> 'dong_y' or v_ap.requested_by <> auth.uid()
      or coalesce((v_ap.payload->>'tien')::numeric, 0) < v_line_disc + v_inv_disc then
      raise exception 'Giảm %%% vượt mức cho phép (%%%). Bấm "Xin duyệt" để Quản lý duyệt.',
        round(v_pct, 1), v_set.staff_discount_pct;
    end if;
    update public.pos_approvals set status = 'da_dung' where id = v_ap.id;
  end if;

  -- Điểm thưởng
  v_pts := greatest(coalesce((p->>'points_used')::int, 0), 0);
  if v_pts > 0 then
    if not v_set.points_enabled or v_cust is null then raise exception 'Không dùng được điểm cho hoá đơn này'; end if;
    if v_pts > public.pos__diem_cua(v_cust) then raise exception 'Khách không đủ điểm'; end if;
    v_pts_val := least(v_pts * v_set.point_value, v_sub - v_inv_disc + v_vat + v_fee);
  end if;

  v_total := v_sub - v_inv_disc + v_vat + v_fee - v_pts_val;
  v_method := coalesce(p->>'pay_method', 'tien_mat');
  if v_method not in ('tien_mat', 'chuyen_khoan', 'the') then raise exception 'Phương thức thanh toán không hợp lệ'; end if;
  v_recv := greatest(round(coalesce((p->>'received')::numeric, v_total)), 0);
  if v_recv >= v_total then
    v_paid := v_total;
    v_change := case when v_method = 'tien_mat' then v_recv - v_total else 0 end;
  else
    v_paid := v_recv; v_debt := v_total - v_recv;
    if v_cust is null then raise exception 'Khách lẻ không được ghi nợ — chọn khách có tên + SĐT hoặc thu đủ tiền.'; end if;
    v_no_cu := public.pos__no_cua(v_cust);
    if v_no_cu + v_debt > v_set.debt_limit and v_cap = 'nv' then
      raise exception 'Vượt hạn mức nợ %đ của khách (đang nợ %đ). Cần Quản lý / Giám đốc bán.',
        to_char(v_set.debt_limit, 'FM999G999G999'), to_char(v_no_cu, 'FM999G999G999');
    end if;
  end if;

  v_code := 'HD' || lpad(nextval('public.pos_invoice_seq')::text, 6, '0');
  insert into public.pos_invoices(id, code, store_location, shift_id, cashier_id, cashier_name, seller_name,
    customer_id, customer_name, customer_phone, price_list_id, price_list_name,
    gross, line_discount, eod_discount, invoice_discount, subtotal, vat_amount, other_fee, other_fee_detail,
    points_used, points_value, total, pay_method, paid_amount, received_amount, change_amount, debt_amount,
    transfer_status, note, offline, client_created_at)
  values (v_id, v_code, v_store, public.pos__ca_mo(v_store), auth.uid(), v_ten, coalesce(nullif(p->>'seller_name', ''), v_ten),
    v_cust, coalesce(v_cust_row.name, 'Khách lẻ'), v_cust_row.phone, v_pl, v_pl_name,
    v_gross, v_line_disc, v_eod, v_inv_disc, v_sub, v_vat, v_fee, coalesce(p->'other_fees', '[]'),
    v_pts, v_pts_val, v_total, v_method, v_paid, v_recv, v_change, v_debt,
    case when v_method = 'chuyen_khoan' and v_paid > 0 then 'cho_xac_nhan' else 'khong' end,
    nullif(p->>'note', ''), coalesce((p->>'offline')::boolean, false), nullif(p->>'client_created_at', '')::timestamptz);

  for v_line in select value from jsonb_array_elements(p->'lines') loop
    v_no := v_no + 1;
    v_qty := (v_line->>'qty')::numeric;
    v_list := public.pos__gia(v_pl, (v_line->>'product_id')::uuid, nullif(v_line->>'variant_id', '')::uuid);
    v_unit := least(greatest(round(coalesce((v_line->>'unit_price')::numeric, v_list)), 0), v_list);
    insert into public.pos_invoice_lines(invoice_id, line_no, product_id, variant_id, size, name, qty, list_price, unit_price,
      line_discount, line_total, eod, note)
    values (v_id, v_no, (v_line->>'product_id')::uuid, nullif(v_line->>'variant_id', '')::uuid, nullif(v_line->>'size', ''),
      coalesce(v_line->>'name', 'Hàng hoá'), v_qty, v_list, v_unit, (v_list - v_unit) * v_qty, v_unit * v_qty,
      coalesce((v_line->>'eod')::boolean, false), nullif(v_line->>'note', ''));
    perform public.pos__ton_cong(v_store, (v_line->>'product_id')::uuid, v_line->>'size', v_line->>'name', -v_qty, 'ban', v_code);
  end loop;

  if v_debt > 0 then
    insert into public.pos_debt_entries(id, customer_id, invoice_id, entry_type, amount, store_location, shift_id, note, created_by, created_by_name)
    values (gen_random_uuid(), v_cust, v_id, 'ban_no', v_debt, v_store, public.pos__ca_mo(v_store), v_code, auth.uid(), v_ten);
  end if;
  if v_pts > 0 then
    insert into public.pos_points_entries(customer_id, invoice_id, points, note) values (v_cust, v_id, -v_pts, 'Dùng điểm ' || v_code);
  end if;
  if v_set.points_enabled and v_cust is not null and v_paid > 0 then
    v_earn := floor(v_paid / v_set.points_per_amount)::int;
    if v_earn > 0 then
      insert into public.pos_points_entries(customer_id, invoice_id, points, note) values (v_cust, v_id, v_earn, 'Tích điểm ' || v_code);
      update public.pos_invoices set points_earned = v_earn where id = v_id;
    end if;
  end if;

  if v_line_disc + v_inv_disc > 0 or v_debt > 0 or v_eod > 0 or coalesce((p->>'offline')::boolean, false) then
    perform public.pos__ghi_nhat_ky(v_store, 'ban', v_code, jsonb_build_object('giam', v_line_disc + v_inv_disc, 'giam_cuoi_ngay', v_eod,
      'ghi_no', v_debt, 'tong', v_total, 'offline', coalesce((p->>'offline')::boolean, false),
      'duyet', nullif(p->>'approval_id', '')));
  end if;
  return jsonb_build_object('id', v_id, 'code', v_code, 'total', v_total, 'debt', v_debt, 'change', v_change,
    'points_earned', v_earn, 'transfer_status', case when v_method = 'chuyen_khoan' and v_paid > 0 then 'cho_xac_nhan' else 'khong' end);
end $$;

-- Huỷ hoá đơn: nhân viên chỉ huỷ hoá đơn của ca đang mở; ngoài ca cần phiếu duyệt hoặc Quản lý/GĐ.
-- Công nợ được bù bằng một dòng âm — nếu khách đã trả bớt, số dư thành âm (= khách đang dư tiền), không mất dấu.
create or replace function public.pos_huy_hd(p_id uuid, p_reason text, p_approval_id uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_cap text := public.pos_cap_do(); v_h public.pos_invoices; v_l record; v_ap public.pos_approvals;
begin
  if v_cap is null then raise exception 'Tài khoản chưa được duyệt'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'Ghi lý do huỷ'; end if;
  select * into v_h from public.pos_invoices where id = p_id for update;
  if v_h.id is null then raise exception 'Không tìm thấy hoá đơn'; end if;
  if v_h.status = 'huy' then return to_jsonb(v_h); end if;
  if v_cap = 'nv' and v_h.shift_id is distinct from public.pos__ca_mo(v_h.store_location) then
    select * into v_ap from public.pos_approvals where id = p_approval_id for update;
    if v_ap.id is null or v_ap.kind <> 'huy_hd' or v_ap.status <> 'dong_y' or v_ap.requested_by <> auth.uid()
      or v_ap.payload->>'invoice_id' <> p_id::text then
      raise exception 'Hoá đơn của ca đã đóng — cần Quản lý / Giám đốc duyệt huỷ';
    end if;
    update public.pos_approvals set status = 'da_dung' where id = v_ap.id;
  end if;
  update public.pos_invoices set status = 'huy', cancel_reason = trim(p_reason), cancelled_by = auth.uid(),
    cancelled_by_name = public.pos_ten_toi(), cancelled_at = now() where id = p_id returning * into v_h;
  for v_l in select * from public.pos_invoice_lines where invoice_id = p_id loop
    if v_l.product_id is not null then
      perform public.pos__ton_cong(v_h.store_location, v_l.product_id, v_l.size, v_l.name, v_l.qty, 'huy_hd', v_h.code);
    end if;
  end loop;
  if v_h.debt_amount > 0 then
    insert into public.pos_debt_entries(id, customer_id, invoice_id, entry_type, amount, store_location, shift_id, note, created_by, created_by_name)
    values (gen_random_uuid(), v_h.customer_id, v_h.id, 'huy_hd', -v_h.debt_amount, v_h.store_location,
      public.pos__ca_mo(v_h.store_location), 'Huỷ ' || v_h.code, auth.uid(), public.pos_ten_toi());
  end if;
  if v_h.customer_id is not null and (v_h.points_earned > 0 or v_h.points_used > 0) then
    insert into public.pos_points_entries(customer_id, invoice_id, points, note)
    values (v_h.customer_id, v_h.id, v_h.points_used - v_h.points_earned, 'Huỷ ' || v_h.code);
  end if;
  perform public.pos__ghi_nhat_ky(v_h.store_location, 'huy_hd', v_h.code,
    jsonb_build_object('ly_do', p_reason, 'tong', v_h.total, 'thu_ngan', v_h.cashier_name, 'duyet', p_approval_id));
  if v_h.shift_id is distinct from public.pos__ca_mo(v_h.store_location) then
    perform public.pos__bao_sep('pos-huy-hd:' || v_h.id, '🧾 Huỷ hoá đơn ca cũ ' || v_h.code,
      public.pos_ten_toi() || ' huỷ ' || v_h.code || ' (' || to_char(v_h.total, 'FM999G999G999') || 'đ). Lý do: ' || p_reason, v_h.id, 'warning');
  end if;
  return to_jsonb(v_h);
end $$;

-- Xác nhận tiền chuyển khoản đã về tài khoản (Quản lý / GĐ / Kế toán xem app ngân hàng).
create or replace function public.pos_xac_nhan_ck(p_id uuid, p_da_ve boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_h public.pos_invoices;
begin
  if not (public.pos_cap_do() in ('gd', 'ql') or public.pos_la_ke_toan()) then
    raise exception 'Chỉ Quản lý / Giám đốc / Kế toán xác nhận tiền về'; end if;
  update public.pos_invoices set transfer_status = case when p_da_ve then 'da_ve' else 'khong_thay' end,
    transfer_checked_by_name = public.pos_ten_toi(), transfer_checked_at = now()
  where id = p_id and pay_method = 'chuyen_khoan' returning * into v_h;
  if v_h.id is null then raise exception 'Không phải hoá đơn chuyển khoản'; end if;
  perform public.pos__ghi_nhat_ky(v_h.store_location, case when p_da_ve then 'ck_da_ve' else 'ck_khong_thay' end, v_h.code,
    jsonb_build_object('tien', v_h.paid_amount, 'thu_ngan', v_h.cashier_name));
  if not p_da_ve then
    perform public.pos__bao_sep('pos-ck-khong-thay:' || v_h.id, '🚨 Không thấy tiền chuyển khoản ' || v_h.code,
      to_char(v_h.paid_amount, 'FM999G999G999') || 'đ, thu ngân ' || coalesce(v_h.cashier_name, '') || ', ' || v_h.store_location || '.', v_h.id, 'urgent');
  end if;
  return to_jsonb(v_h);
end $$;

-- Thu nợ khách
create or replace function public.pos_thu_no(p_id uuid, p_customer uuid, p_amount numeric, p_method text, p_store text, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_no numeric;
begin
  if public.pos_cap_do() is null then raise exception 'Tài khoản chưa được duyệt'; end if;
  if exists (select 1 from public.pos_debt_entries where id = p_id) then
    return jsonb_build_object('id', p_id, 'trung', true, 'con_no', public.pos__no_cua(p_customer)); end if;
  if p_method not in ('tien_mat', 'chuyen_khoan', 'the') then raise exception 'Phương thức không hợp lệ'; end if;
  perform pg_advisory_xact_lock(hashtext('pos_no:' || p_customer));
  v_no := public.pos__no_cua(p_customer);
  if coalesce(p_amount, 0) <= 0 then raise exception 'Nhập số tiền thu'; end if;
  if p_amount > v_no then raise exception 'Khách chỉ đang nợ %đ', to_char(v_no, 'FM999G999G999'); end if;
  insert into public.pos_debt_entries(id, customer_id, entry_type, amount, pay_method, store_location, shift_id, note, created_by, created_by_name)
  values (p_id, p_customer, 'thu_no', -p_amount, p_method, p_store, public.pos__ca_mo(p_store), p_note, auth.uid(), public.pos_ten_toi());
  perform public.pos__ghi_nhat_ky(p_store, 'thu_no', p_id::text, jsonb_build_object('khach', p_customer, 'tien', p_amount, 'pt', p_method));
  return jsonb_build_object('id', p_id, 'con_no', v_no - p_amount);
end $$;

-- Tạo khách hàng nhanh tại quầy (tên + SĐT). Trùng SĐT → trả khách cũ.
create or replace function public.pos_tao_khach(p_name text, p_phone text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_c public.customers; v_phone text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
begin
  if public.pos_cap_do() is null then raise exception 'Tài khoản chưa được duyệt'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'Nhập tên khách'; end if;
  if length(v_phone) < 9 then raise exception 'Số điện thoại chưa đúng'; end if;
  select * into v_c from public.customers where regexp_replace(coalesce(phone, ''), '\D', '', 'g') = v_phone limit 1;
  if v_c.id is null then
    insert into public.customers(name, phone) values (trim(p_name), v_phone) returning * into v_c;
  end if;
  return jsonb_build_object('id', v_c.id, 'name', v_c.name, 'phone', v_c.phone);
end $$;

-- ───────────────────────── 8. Phiếu kho ─────────────────────────
-- p: {id, type, store, status('tam'|'xong'|'cho_nhan'), lines:[{product_id, variant_id, size, name, qty}], reason, note, photo_url}
create or replace function public.pos_luu_phieu(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_cap text := public.pos_cap_do(); v_id uuid := (p->>'id')::uuid; v_d public.pos_stock_docs;
  v_type text := p->>'type'; v_store text := p->>'store'; v_status text := coalesce(p->>'status', 'xong');
  v_lines jsonb := '[]'; v_l jsonb; v_ton numeric; v_delta numeric; v_qty numeric;
begin
  if v_cap is null then raise exception 'Tài khoản chưa được duyệt'; end if;
  if v_type not in ('bep_giao', 'xuat_huy', 'kiem_kho', 'noi_bo') then raise exception 'Loại phiếu không hợp lệ'; end if;
  if v_type = 'bep_giao' then v_status := 'cho_nhan'; end if;
  if v_status not in ('tam', 'xong', 'cho_nhan') then raise exception 'Trạng thái phiếu không hợp lệ'; end if;
  select * into v_d from public.pos_stock_docs where id = v_id for update;
  if v_d.id is not null and v_d.status <> 'tam' then return to_jsonb(v_d); end if;   -- đã chốt (gửi lại khi mất mạng)
  if jsonb_array_length(coalesce(p->'lines', '[]')) = 0 then raise exception 'Phiếu chưa có hàng'; end if;
  if v_status = 'xong' and v_type = 'xuat_huy' then
    if coalesce(trim(p->>'reason'), '') = '' then raise exception 'Ghi lý do huỷ (VD: hết date)'; end if;
    if coalesce(p->>'photo_url', '') = '' then raise exception 'Chụp ảnh bánh huỷ trước khi hoàn thành'; end if;
  end if;

  for v_l in select value from jsonb_array_elements(p->'lines') loop
    v_qty := coalesce((v_l->>'qty')::numeric, 0);
    if v_qty < 0 or (v_type <> 'kiem_kho' and v_qty = 0) then raise exception 'Số lượng "%" không hợp lệ', v_l->>'name'; end if;
    v_lines := v_lines || jsonb_build_array(v_l);
  end loop;

  if v_d.id is null then
    insert into public.pos_stock_docs(id, code, doc_type, store_location, status, lines, reason, note, photo_url, shift_id, created_by, created_by_name)
    values (v_id, case v_type when 'bep_giao' then 'BG' when 'xuat_huy' then 'XH' when 'kiem_kho' then 'KK' else 'XNB' end
        || lpad(nextval('public.pos_doc_seq')::text, 6, '0'),
      v_type, v_store, 'tam', v_lines, nullif(trim(p->>'reason'), ''), nullif(p->>'note', ''), nullif(p->>'photo_url', ''),
      public.pos__ca_mo(v_store), auth.uid(), public.pos_ten_toi())
    returning * into v_d;
  else
    update public.pos_stock_docs set lines = v_lines, reason = nullif(trim(p->>'reason'), ''), note = nullif(p->>'note', ''),
      photo_url = nullif(p->>'photo_url', '') where id = v_id returning * into v_d;
  end if;
  if v_status = 'tam' then return to_jsonb(v_d); end if;
  if v_status = 'cho_nhan' then
    update public.pos_stock_docs set status = 'cho_nhan' where id = v_id returning * into v_d;
    perform public.pos__ghi_nhat_ky(v_store, 'bep_giao', v_d.code, jsonb_build_object('so_dong', jsonb_array_length(v_lines)));
    return to_jsonb(v_d);
  end if;

  -- Chốt phiếu: tác động tồn cửa hàng.
  v_lines := '[]';
  for v_l in select value from jsonb_array_elements(v_d.lines) loop
    v_qty := coalesce((v_l->>'qty')::numeric, 0);
    if v_type = 'kiem_kho' then
      v_ton := public.pos__ton(v_store, (v_l->>'product_id')::uuid, v_l->>'size');
      v_delta := v_qty - v_ton;
    else
      v_ton := null; v_delta := -v_qty;
    end if;
    if v_delta <> 0 then
      perform public.pos__ton_cong(v_store, (v_l->>'product_id')::uuid, v_l->>'size', v_l->>'name', v_delta, v_type, v_d.code);
    end if;
    v_lines := v_lines || jsonb_build_array(v_l || jsonb_build_object('system_qty', v_ton, 'delta', v_delta));
  end loop;
  update public.pos_stock_docs set status = 'xong', lines = v_lines, done_by = auth.uid(), done_by_name = public.pos_ten_toi(), done_at = now()
  where id = v_id returning * into v_d;
  perform public.pos__ghi_nhat_ky(v_store, v_type, v_d.code, jsonb_build_object('ly_do', v_d.reason, 'dong', v_lines));
  return to_jsonb(v_d);
end $$;

-- Quầy nhận hàng bếp giao: nhập số THỰC NHẬN từng dòng. Cửa hàng + thực nhận, kho bếp − số bếp ghi giao.
-- Lệch → báo Giám đốc.
create or replace function public.pos_nhan_hang(p_id uuid, p_received jsonb, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_d public.pos_stock_docs; v_l jsonb; v_lines jsonb := '[]'; v_nhan numeric; v_giao numeric; v_lech text := '';
begin
  if public.pos_cap_do() is null then raise exception 'Tài khoản chưa được duyệt'; end if;
  select * into v_d from public.pos_stock_docs where id = p_id for update;
  if v_d.id is null or v_d.doc_type <> 'bep_giao' then raise exception 'Không tìm thấy phiếu bếp giao'; end if;
  if v_d.status <> 'cho_nhan' then return to_jsonb(v_d); end if;
  for v_l in select value from jsonb_array_elements(v_d.lines) loop
    v_giao := coalesce((v_l->>'qty')::numeric, 0);
    v_nhan := coalesce((p_received->>((v_l->>'product_id') || ':' || coalesce(v_l->>'size', '')))::numeric, v_giao);
    if v_nhan < 0 then raise exception 'Số thực nhận không hợp lệ'; end if;
    if v_nhan > 0 then perform public.pos__ton_cong(v_d.store_location, (v_l->>'product_id')::uuid, v_l->>'size', v_l->>'name', v_nhan, 'nhan_hang', v_d.code); end if;
    perform public.pos__ton_cong(null, (v_l->>'product_id')::uuid, v_l->>'size', v_l->>'name', -v_giao, 'bep_giao', v_d.code);
    if v_nhan <> v_giao then v_lech := v_lech || (v_l->>'name') || ' giao ' || v_giao || ' nhận ' || v_nhan || '; '; end if;
    v_lines := v_lines || jsonb_build_array(v_l || jsonb_build_object('qty_received', v_nhan));
  end loop;
  update public.pos_stock_docs set status = 'xong', lines = v_lines, done_by = auth.uid(), done_by_name = public.pos_ten_toi(),
    done_at = now(), note = coalesce(nullif(p_note, ''), note) where id = p_id returning * into v_d;
  perform public.pos__ghi_nhat_ky(v_d.store_location, 'nhan_hang', v_d.code, jsonb_build_object('lech', nullif(v_lech, '')));
  if v_lech <> '' then
    perform public.pos__bao_sep('pos-lech-giao:' || v_d.id, '📦 Bếp giao lệch số — ' || v_d.store_location,
      v_d.code || ' (' || coalesce(v_d.created_by_name, '') || ' giao, ' || public.pos_ten_toi() || ' nhận): ' || v_lech, v_d.id, 'warning');
  end if;
  return to_jsonb(v_d);
end $$;

-- Huỷ phiếu kho: hoàn lại tồn. Người lập huỷ được phiếu của ca đang mở; còn lại Quản lý/GĐ.
create or replace function public.pos_huy_phieu(p_id uuid, p_reason text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_cap text := public.pos_cap_do(); v_d public.pos_stock_docs; v_l jsonb; v_delta numeric;
begin
  if v_cap is null then raise exception 'Tài khoản chưa được duyệt'; end if;
  select * into v_d from public.pos_stock_docs where id = p_id for update;
  if v_d.id is null then raise exception 'Không tìm thấy phiếu'; end if;
  if v_d.status = 'huy' then return to_jsonb(v_d); end if;
  if v_cap = 'nv' and not (v_d.created_by = auth.uid() and v_d.shift_id is not distinct from public.pos__ca_mo(v_d.store_location)) then
    raise exception 'Chỉ người lập phiếu (trong ca) hoặc Quản lý / Giám đốc huỷ được';
  end if;
  if v_d.status = 'xong' then
    for v_l in select value from jsonb_array_elements(v_d.lines) loop
      if v_d.doc_type = 'bep_giao' then
        v_delta := coalesce((v_l->>'qty_received')::numeric, 0);
        if v_delta <> 0 then perform public.pos__ton_cong(v_d.store_location, (v_l->>'product_id')::uuid, v_l->>'size', v_l->>'name', -v_delta, 'huy_phieu', v_d.code); end if;
        perform public.pos__ton_cong(null, (v_l->>'product_id')::uuid, v_l->>'size', v_l->>'name', coalesce((v_l->>'qty')::numeric, 0), 'huy_phieu', v_d.code);
      else
        v_delta := coalesce((v_l->>'delta')::numeric, 0);
        if v_delta <> 0 then perform public.pos__ton_cong(v_d.store_location, (v_l->>'product_id')::uuid, v_l->>'size', v_l->>'name', -v_delta, 'huy_phieu', v_d.code); end if;
      end if;
    end loop;
  end if;
  update public.pos_stock_docs set status = 'huy', cancelled_by_name = public.pos_ten_toi(), cancelled_at = now(),
    cancel_reason = nullif(trim(p_reason), '') where id = p_id returning * into v_d;
  perform public.pos__ghi_nhat_ky(v_d.store_location, 'huy_phieu', v_d.code, jsonb_build_object('ly_do', p_reason));
  return to_jsonb(v_d);
end $$;

-- ───────────────────────── 9. Đặt bánh lấy cọc / thu tiền khi lấy ─────────────────────────
-- Đơn tạo bằng create_order_v2 như mục Đơn hàng; hàm này chỉ ghi khoản tiền quầy thu (vào két ca).
create or replace function public.pos_thu_don(p_id uuid, p_order uuid, p_kind text, p_amount numeric, p_method text, p_store text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_code text;
begin
  if public.pos_cap_do() is null then raise exception 'Tài khoản chưa được duyệt'; end if;
  if exists (select 1 from public.pos_order_payments where id = p_id) then return jsonb_build_object('id', p_id, 'trung', true); end if;
  select order_code into v_code from public.orders where id = p_order;
  if v_code is null then raise exception 'Không tìm thấy đơn đặt'; end if;
  insert into public.pos_order_payments(id, order_id, order_code, kind, amount, pay_method, store_location, shift_id, created_by, created_by_name)
  values (p_id, p_order, v_code, p_kind, p_amount, p_method, p_store, public.pos__ca_mo(p_store), auth.uid(), public.pos_ten_toi());
  perform public.pos__ghi_nhat_ky(p_store, 'thu_don_' || p_kind, v_code, jsonb_build_object('tien', p_amount, 'pt', p_method));
  return jsonb_build_object('id', p_id, 'order_code', v_code);
end $$;

-- ───────────────────────── 10. Thiết lập (Giám đốc) ─────────────────────────
create or replace function public.pos_luu_thiet_lap(p_store text, p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_s public.pos_settings;
begin
  if public.pos_cap_do() <> 'gd' then raise exception 'Chỉ Giám đốc đổi thiết lập'; end if;
  update public.pos_settings set
    staff_discount_pct = coalesce((p->>'staff_discount_pct')::numeric, staff_discount_pct),
    eod_discount_pct = coalesce((p->>'eod_discount_pct')::numeric, eod_discount_pct),
    eod_from = coalesce((p->>'eod_from')::time, eod_from),
    bank_bin = case when p ? 'bank_bin' then nullif(trim(p->>'bank_bin'), '') else bank_bin end,
    bank_account = case when p ? 'bank_account' then nullif(regexp_replace(p->>'bank_account', '\s', '', 'g'), '') else bank_account end,
    bank_account_name = case when p ? 'bank_account_name' then nullif(upper(trim(p->>'bank_account_name')), '') else bank_account_name end,
    points_enabled = coalesce((p->>'points_enabled')::boolean, points_enabled),
    points_per_amount = coalesce((p->>'points_per_amount')::numeric, points_per_amount),
    point_value = coalesce((p->>'point_value')::numeric, point_value),
    debt_limit = coalesce((p->>'debt_limit')::numeric, debt_limit),
    debt_days = coalesce((p->>'debt_days')::int, debt_days),
    updated_by = auth.uid(), updated_at = now()
  where store_location = p_store returning * into v_s;
  perform public.pos__ghi_nhat_ky(p_store, 'thiet_lap', p_store, p - 'bank_account');
  return to_jsonb(v_s);
end $$;

create or replace function public.pos_luu_gia_von(p_product uuid, p_variant uuid, p_cost numeric)
returns void language plpgsql security definer set search_path = public as $$
begin
  if public.pos_cap_do() <> 'gd' then raise exception 'Chỉ Giám đốc sửa giá vốn'; end if;
  insert into public.pos_product_costs(product_id, variant_id, cost, updated_by) values (p_product, p_variant, greatest(p_cost, 0), auth.uid())
  on conflict (product_id, variant_id) do update set cost = excluded.cost, updated_by = auth.uid(), updated_at = now();
end $$;

create or replace function public.pos_luu_bang_gia(p_id uuid, p_name text, p_items jsonb, p_active boolean default true)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid := coalesce(p_id, gen_random_uuid()); v_i jsonb;
begin
  if public.pos_cap_do() <> 'gd' then raise exception 'Chỉ Giám đốc sửa bảng giá'; end if;
  insert into public.pos_price_lists(id, name, active) values (v_id, trim(p_name), p_active)
  on conflict (id) do update set name = excluded.name, active = excluded.active;
  delete from public.pos_price_list_items where price_list_id = v_id;
  for v_i in select value from jsonb_array_elements(coalesce(p_items, '[]')) loop
    insert into public.pos_price_list_items(price_list_id, product_id, variant_id, price)
    values (v_id, (v_i->>'product_id')::uuid, nullif(v_i->>'variant_id', '')::uuid, (v_i->>'price')::numeric);
  end loop;
  perform public.pos__ghi_nhat_ky(null, 'bang_gia', p_name, jsonb_build_object('so_dong', jsonb_array_length(coalesce(p_items, '[]'))));
  return v_id;
end $$;

-- ───────────────────────── 11. Báo cáo ─────────────────────────
create or replace function public.pos_bao_cao(p_store text, p_from timestamptz, p_to timestamptz)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_cap text := public.pos_cap_do(); v_len interval := p_to - p_from; v jsonb;
begin
  if v_cap not in ('gd', 'ql') then raise exception 'Chỉ Quản lý / Giám đốc xem báo cáo'; end if;
  with hd as (select * from public.pos_invoices where (p_store is null or store_location = p_store)
                and created_at >= p_from and created_at < p_to),
       ok as (select * from hd where status = 'xong'),
       ln as (select l.* from public.pos_invoice_lines l join ok on ok.id = l.invoice_id),
       truoc as (select * from public.pos_invoices where (p_store is null or store_location = p_store) and status = 'xong'
                and created_at >= p_from - v_len and created_at < p_from),
       huy as (select d.* from public.pos_stock_docs d where (p_store is null or d.store_location = p_store)
                and d.doc_type = 'xuat_huy' and d.status = 'xong' and d.done_at >= p_from and d.done_at < p_to),
       huy_dong as (select (x->>'product_id')::uuid as product_id, nullif(x->>'variant_id', '')::uuid as variant_id,
                      x->>'name' as name, coalesce((x->>'qty')::numeric, 0) as qty from huy, jsonb_array_elements(huy.lines) x)
  select jsonb_build_object(
    'so_hd', (select count(*) from ok), 'so_huy', (select count(*) from hd where status = 'huy'),
    'tien_huy_hd', (select coalesce(sum(total), 0) from hd where status = 'huy'),
    'tong_hang', (select coalesce(sum(gross), 0) from ok),
    'giam', (select coalesce(sum(line_discount + invoice_discount), 0) from ok),
    'giam_cuoi_ngay', (select coalesce(sum(eod_discount), 0) from ok),
    'diem', (select coalesce(sum(points_value), 0) from ok),
    'doanh_thu', (select coalesce(sum(total - vat_amount - other_fee), 0) from ok),
    'vat', (select coalesce(sum(vat_amount), 0) from ok), 'thu_khac', (select coalesce(sum(other_fee), 0) from ok),
    'tien_mat', (select coalesce(sum(paid_amount), 0) from ok where pay_method = 'tien_mat'),
    'chuyen_khoan', (select coalesce(sum(paid_amount), 0) from ok where pay_method = 'chuyen_khoan'),
    'ck_cho', (select coalesce(sum(paid_amount), 0) from ok where transfer_status = 'cho_xac_nhan'),
    'ck_khong_thay', (select coalesce(sum(paid_amount), 0) from ok where transfer_status = 'khong_thay'),
    'the', (select coalesce(sum(paid_amount), 0) from ok where pay_method = 'the'),
    'ghi_no', (select coalesce(sum(debt_amount), 0) from ok),
    'thu_no', (select coalesce(-sum(amount), 0) from public.pos_debt_entries where entry_type = 'thu_no'
                 and (p_store is null or store_location = p_store) and created_at >= p_from and created_at < p_to),
    'thu_don', (select coalesce(sum(amount), 0) from public.pos_order_payments where (p_store is null or store_location = p_store)
                 and created_at >= p_from and created_at < p_to),
    'ky_truoc', jsonb_build_object('so_hd', (select count(*) from truoc), 'doanh_thu', (select coalesce(sum(total - vat_amount - other_fee), 0) from truoc)),
    'theo_gio', (select coalesce(jsonb_agg(g order by g->>'gio'), '[]') from (
        select jsonb_build_object('gio', gio, 'so_hd', count(*), 'tien', sum(total)) g
        from (select to_char(created_at at time zone 'Asia/Ho_Chi_Minh', 'HH24') as gio, total from ok) x group by gio) t),
    'theo_mon', (select coalesce(jsonb_agg(m), '[]') from (
        select jsonb_build_object('product_id', product_id, 'variant_id', variant_id, 'ten', name || coalesce(' ' || size, ''),
          'sl', sum(qty), 'tien', sum(line_total)) m from ln group by product_id, variant_id, name, size order by sum(line_total) desc limit 50) t),
    'theo_nv', (select coalesce(jsonb_agg(n), '[]') from (
        select jsonb_build_object('ten', coalesce(seller_name, cashier_name), 'so_hd', count(*), 'tien', sum(total)) n
        from ok group by coalesce(seller_name, cashier_name) order by sum(total) desc) t),
    'huy_hang', (select coalesce(jsonb_agg(h), '[]') from (
        select jsonb_build_object('ten', name, 'sl', sum(qty)) h from huy_dong group by name order by sum(qty) desc) t),
    'chenh_ca', (select coalesce(jsonb_agg(c), '[]') from (
        select jsonb_build_object('ma', code, 'nguoi', closed_by_name, 'chenh', diff, 'duyet', approved_by_name is not null) c
        from public.pos_shifts where (p_store is null or store_location = p_store) and closed_at >= p_from and closed_at < p_to
          and coalesce(diff, 0) <> 0 order by closed_at) t),
    'gia_von', case when v_cap = 'gd' then (select coalesce(sum(ln.qty * coalesce(c.cost, 0)), 0) from ln
        left join public.pos_product_costs c on c.product_id = ln.product_id and c.variant_id is not distinct from ln.variant_id) end,
    'chua_co_gia_von', case when v_cap = 'gd' then (select count(distinct (ln.product_id, ln.variant_id)) from ln
        left join public.pos_product_costs c on c.product_id = ln.product_id and c.variant_id is not distinct from ln.variant_id
        where c.product_id is null) end,
    'huy_gia_von', case when v_cap = 'gd' then (select coalesce(sum(h.qty * coalesce(c.cost, 0)), 0) from huy_dong h
        left join public.pos_product_costs c on c.product_id = h.product_id and c.variant_id is not distinct from h.variant_id) end
  ) into v;
  return v;
end $$;

-- ───────────────────────── 12. Quyền gọi hàm ─────────────────────────
do $$
declare f text;
begin
  foreach f in array array['pos__ghi_nhat_ky(text,text,text,jsonb)','pos__bao_sep(text,text,text,uuid,text)',
    'pos__bao_quan_ly(text,text,text,uuid)','pos__ton_cong(text,uuid,text,text,numeric,text,text)',
    'pos__ton(text,uuid,text)','pos__ca_mo(text)','pos__no_cua(uuid)','pos__diem_cua(uuid)','pos__gia(uuid,uuid,uuid)',
    'pos__kho_cua(uuid)','pos__so_lieu_ca(uuid)'] loop
    execute 'revoke all on function public.' || f || ' from public, anon, authenticated';
  end loop;
  foreach f in array array['pos_cap_do()','pos_la_ke_toan()','pos_ten_toi()','pos_mo_ca(text,numeric)',
    'pos_dong_ca(uuid,numeric,text)','pos_duyet_ca(uuid,text)','pos_xin_duyet(text,text,jsonb)','pos_quyet_duyet(uuid,boolean)',
    'pos_ban(jsonb)','pos_huy_hd(uuid,text,uuid)','pos_xac_nhan_ck(uuid,boolean)','pos_thu_no(uuid,uuid,numeric,text,text,text)',
    'pos_tao_khach(text,text)','pos_luu_phieu(jsonb)','pos_nhan_hang(uuid,jsonb,text)','pos_huy_phieu(uuid,text)',
    'pos_thu_don(uuid,uuid,text,numeric,text,text)','pos_luu_thiet_lap(text,jsonb)','pos_luu_gia_von(uuid,uuid,numeric)',
    'pos_luu_bang_gia(uuid,text,jsonb,boolean)','pos_bao_cao(text,timestamptz,timestamptz)'] loop
    execute 'revoke all on function public.' || f || ' from public, anon';
    execute 'grant execute on function public.' || f || ' to authenticated';
  end loop;
end $$;

-- Số dư nợ & điểm của khách (đọc nhanh cho màn quầy).
create or replace view public.pos_customer_balances with (security_invoker = true) as
select customer_id, sum(amount) as no, max(created_at) as lan_cuoi,
  min(created_at) filter (where entry_type = 'ban_no') as no_tu
from public.pos_debt_entries group by customer_id;
grant select on public.pos_customer_balances to authenticated;

insert into public.migration_runs(migration_key, status, finished_at, notes)
values ('202611141000_ban_hang_quay_that', 'completed', now(),
  'Bán hàng tại quầy chạy thật: bảng pos_* (ca, hoá đơn, công nợ quầy, điểm, phiếu kho, thẻ kho, bảng giá, giá vốn, duyệt, nhật ký) + hàm pos_* SECURITY DEFINER. Tồn kho dùng chung finished_goods_stock theo store_location. Cờ pos_ban_hang_that mặc định TẮT.')
on conflict (migration_key) do update set status = 'completed', finished_at = now(), notes = excluded.notes;

commit;
