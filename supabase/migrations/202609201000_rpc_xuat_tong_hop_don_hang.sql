-- Xuất tổng hợp đơn hàng theo ngày/tuần (yêu cầu Giám đốc 20/09/2026).
-- Cột tiền (total/deposit) của orders bị khoá ở tầng DB, nên cần 1 RPC riêng
-- CHỈ Giám đốc (is_business_director) gọi được — cùng mẫu với 4 RPC
-- orders_*_rows đã có (202609062130). Lọc theo NGÀY CẦN GIAO (required_at)
-- tính theo giờ Việt Nam, không phụ thuộc múi giờ session.
begin;
set local lock_timeout = '10s';
set local statement_timeout = '30s';

create or replace function public.orders_export_rows(p_from date, p_to date)
returns table(
  id uuid, order_code text, order_type text, status_v2 text, required_at timestamptz,
  customer_name text, product_names text, total_quantity numeric,
  total numeric, deposit numeric, target_store text, payment_verified boolean
)
language sql stable security definer set search_path = public as $$
  select v.id, v.order_code, v.order_type, v.status_v2, v.required_at,
         v.customer_name, v.product_names::text, v.total_quantity::numeric,
         v.total, v.deposit, v.target_store, v.payment_verified
  from public.order_operations_list v
  where public.is_business_director()
    and v.required_at is not null
    and (v.required_at at time zone 'Asia/Ho_Chi_Minh')::date between p_from and p_to
  order by v.required_at;
$$;

revoke all on function public.orders_export_rows(date, date) from public, anon;
grant execute on function public.orders_export_rows(date, date) to authenticated;

insert into public.migration_runs(migration_key, status, finished_at, notes)
values('202609201000_rpc_xuat_tong_hop_don_hang', 'completed', now(),
  'RPC orders_export_rows(p_from,p_to) chi Giam doc - phuc vu xuat CSV tong hop don hang theo ngay/tuan (lay ca total/deposit bi khoa cot).')
on conflict(migration_key) do update set status='completed', finished_at=now(), notes=excluded.notes;

commit;
