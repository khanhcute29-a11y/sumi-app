-- Xuất chi tiết đơn (Giám đốc 20/09/2026) cần thêm ĐỊA CHỈ GIAO vào
-- orders_export_rows. Postgres không cho đổi kiểu trả về của "returns
-- table(...)" bằng create or replace → phải drop rồi tạo lại (cùng mẫu
-- 202609200900). Giữ nguyên mọi cột cũ, chỉ thêm `address` ở cuối.
begin;
set local lock_timeout = '10s';
set local statement_timeout = '30s';

drop function if exists public.orders_export_rows(date, date);
create function public.orders_export_rows(p_from date, p_to date)
returns table(
  id uuid, order_code text, order_type text, status_v2 text, required_at timestamptz,
  customer_name text, product_names text, total_quantity numeric,
  total numeric, deposit numeric, target_store text, payment_verified boolean,
  address text
)
language sql stable security definer set search_path = public as $$
  select v.id, v.order_code, v.order_type, v.status_v2, v.required_at,
         v.customer_name, v.product_names::text, v.total_quantity::numeric,
         v.total, v.deposit, v.target_store, v.payment_verified,
         v.address::text
  from public.order_operations_list v
  where public.is_business_director()
    and v.required_at is not null
    and (v.required_at at time zone 'Asia/Ho_Chi_Minh')::date between p_from and p_to
  order by v.required_at;
$$;

revoke all on function public.orders_export_rows(date, date) from public, anon;
grant execute on function public.orders_export_rows(date, date) to authenticated;

insert into public.migration_runs(migration_key, status, finished_at, notes)
values('202609201200_them_dia_chi_vao_rpc_xuat_don_hang', 'completed', now(),
  'Them cot address vao orders_export_rows (drop+create vi doi kieu tra ve) - phuc vu xuat chi tiet don co dia chi giao.')
on conflict(migration_key) do update set status='completed', finished_at=now(), notes=excluded.notes;

commit;
