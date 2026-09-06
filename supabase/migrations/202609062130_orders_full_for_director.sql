-- bossOverviewV3.js (Bảng điều khiển Giám đốc — CHỈ owner/admin dùng) có 4
-- câu query lọc TRỰC TIẾP theo total/deposit/payment_method/payment_verified
-- ngay trong WHERE (.eq/.gt/.or/.neq trên chính các cột đó) — khoá cột ở
-- migration trước làm VỠ luôn cả lọc lẫn đọc, không chỉ đọc (Postgres cần
-- quyền SELECT trên cột để so sánh nó trong WHERE, kể cả không trả về).
--
-- Viết lại 4 RPC riêng cho từng query thay vì 1 hàm chung — giữ ĐÚNG shape
-- (tên cột) mà bossOverviewV3.js đang đọc, để chỉ cần đổi .from('orders')
-- thành .from('ten_ham') là xong, KHÔNG phải viết lại logic gộp nhóm/tính
-- toán ở phía JS (đã đúng, không đụng vào).
begin;
set local lock_timeout = '10s';
set local statement_timeout = '30s';

create or replace function public.orders_revenue_by_channel_rows(p_from timestamptz, p_to timestamptz)
returns table(id uuid, order_code text, order_type text, total numeric, completed_at timestamptz, target_store text, customer_name text)
language sql stable security definer set search_path = public as $$
  select o.id, o.order_code, o.order_type, o.total, o.completed_at, o.target_store, c.name
  from public.orders o left join public.customers c on c.id = o.customer_id
  where public.is_business_director()
    and o.status_v2 = 'completed' and o.payment_verified = true
    and o.completed_at >= p_from and o.completed_at <= p_to;
$$;

create or replace function public.orders_pending_deposit_rows()
returns table(id uuid, order_code text, order_type text, deposit numeric, target_store text, customer_name text)
language sql stable security definer set search_path = public as $$
  select o.id, o.order_code, o.order_type, o.deposit, o.target_store, c.name
  from public.orders o left join public.customers c on c.id = o.customer_id
  where public.is_business_director()
    and o.deposit > 0 and (o.status_v2 <> 'completed' or o.payment_verified = false);
$$;

create or replace function public.orders_in_delivery_rows()
returns table(id uuid, order_code text, order_type text, total numeric, target_store text, customer_name text)
language sql stable security definer set search_path = public as $$
  select o.id, o.order_code, o.order_type, o.total, o.target_store, c.name
  from public.orders o left join public.customers c on c.id = o.customer_id
  where public.is_business_director() and o.status_v2 = 'in_delivery';
$$;

create or replace function public.orders_unverified_completed_rows()
returns table(id uuid, order_code text, order_type text, total numeric, deposit numeric, target_store text, completed_at timestamptz, payment_method text, customer_name text, customer_phone text)
language sql stable security definer set search_path = public as $$
  select o.id, o.order_code, o.order_type, o.total, o.deposit, o.target_store, o.completed_at, o.payment_method, c.name, c.phone
  from public.orders o left join public.customers c on c.id = o.customer_id
  where public.is_business_director() and o.status_v2 = 'completed' and o.payment_verified is distinct from true;
$$;

revoke all on function public.orders_revenue_by_channel_rows(timestamptz, timestamptz) from public, anon;
revoke all on function public.orders_pending_deposit_rows() from public, anon;
revoke all on function public.orders_in_delivery_rows() from public, anon;
revoke all on function public.orders_unverified_completed_rows() from public, anon;
grant execute on function public.orders_revenue_by_channel_rows(timestamptz, timestamptz) to authenticated;
grant execute on function public.orders_pending_deposit_rows() to authenticated;
grant execute on function public.orders_in_delivery_rows() to authenticated;
grant execute on function public.orders_unverified_completed_rows() to authenticated;

insert into public.migration_runs(migration_key, status, finished_at, notes)
values('202609062130_orders_full_for_director', 'completed', now(),
  'bossOverviewV3.js: 4 RPC rieng thay 4 cau query loc truc tiep tren cot tai chinh da khoa - giu nguyen shape (ten cot) de client chi doi .from(orders) sang .from(ten_ham), khong dung logic gop nhom/tinh toan JS.')
on conflict(migration_key) do update set status='completed', finished_at=now(), notes=excluded.notes;

commit;
