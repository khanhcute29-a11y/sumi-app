create role anon; create role authenticated;
create schema auth;
create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
create table public.profiles(id uuid primary key, full_name text, role text, extra_roles text[] default '{}', approved boolean default true, active boolean default true, phone text);
create table public.customers(id uuid primary key default gen_random_uuid(), name text, phone text, is_school boolean default false);
create table public.products(id uuid primary key default gen_random_uuid(), name text, category text, unit text default 'cái', price numeric, active boolean default true, created_at timestamptz default now());
create table public.product_variants(id uuid primary key default gen_random_uuid(), product_id uuid references products(id), label text, price numeric);
create table public.orders(id uuid primary key default gen_random_uuid(), order_code text, delivery_method text, customer_id uuid, required_at timestamptz, status_v2 text, total numeric, deposit numeric, confidentiality text default 'normal', created_at timestamptz default now(), status text, completed_at timestamptz, created_by uuid);
create table public.order_items(id uuid primary key default gen_random_uuid(), order_id uuid, name text, qty int, size text);
create table public.finished_goods_stock(id uuid primary key default gen_random_uuid(), product_id uuid, size text, branch text, qty numeric, updated_at timestamptz default now(), store_location text, is_semi_finished boolean not null default false, expiry_date timestamptz);
create unique index on public.finished_goods_stock(product_id,size,branch,store_location) nulls not distinct;
create table public.feature_flags(key text primary key, enabled boolean not null default false, description text not null);
create table public.notifications(id uuid primary key default gen_random_uuid(), event_key text unique not null, recipient_profile_id uuid, notification_type text, severity text, sound_key text, title text, body text, entity_type text, entity_id uuid not null, deep_link text, created_at timestamptz default now());
create table public.migration_runs(migration_key text primary key, status text, finished_at timestamptz, notes text);

create table public.shift_logs(id uuid primary key default gen_random_uuid(), staff_id uuid, staff_name text, work_date date, shift_label text, branch text, type text, checkin_time timestamptz default now(), reason text);

-- Web Push nền (giả): ghi lại thay vì gửi thật. Bật test.push_loi = '1' để giả lỗi gửi.
create table public.thu_push(staff_id uuid, title text, body text, url text, luc timestamptz default now());
create or replace function public.notify_push(p_title text, p_body text, p_url text default '/', p_staff_id uuid default null)
returns void language plpgsql as $$
begin
  if current_setting('test.push_loi', true) = '1' then raise exception 'push hỏng'; end if;
  insert into public.thu_push(staff_id, title, body, url) values (p_staff_id, p_title, p_body, p_url);
end $$;
