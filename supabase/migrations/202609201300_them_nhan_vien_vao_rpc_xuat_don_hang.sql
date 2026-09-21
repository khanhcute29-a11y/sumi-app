-- Xuất chi tiết đơn (Mom/Giám đốc 20/09/2026) thêm 3 cột nhân viên:
--   • created_by_name  — nhân viên lên đơn (đã có sẵn trong order_operations_list)
--   • worker_names     — nhân viên làm = người BẤM HOÀN THÀNH work package
--                        (completed_by_staff_name); gói chưa hoàn thành thì lấy
--                        người được giao (assigned_to_staff_name). Nhiều bếp → nối bằng ", ".
--   • driver_name      — nhân viên giao (đã có sẵn trong order_operations_list)
-- Postgres không cho đổi kiểu trả về bằng create or replace → drop rồi tạo lại
-- (cùng mẫu 202609201200). Giữ nguyên mọi cột cũ, chỉ thêm 3 cột ở cuối.
begin;
set local lock_timeout = '10s';
set local statement_timeout = '30s';

drop function if exists public.orders_export_rows(date, date);
create function public.orders_export_rows(p_from date, p_to date)
returns table(
  id uuid, order_code text, order_type text, status_v2 text, required_at timestamptz,
  customer_name text, product_names text, total_quantity numeric,
  total numeric, deposit numeric, target_store text, payment_verified boolean,
  address text, created_by_name text, worker_names text, driver_name text
)
language sql stable security definer set search_path = public as $$
  select v.id, v.order_code, v.order_type, v.status_v2, v.required_at,
         v.customer_name, v.product_names::text, v.total_quantity::numeric,
         v.total, v.deposit, v.target_store, v.payment_verified,
         v.address::text, v.created_by_name::text,
         (select string_agg(distinct coalesce(nullif(trim(wp.completed_by_staff_name), ''), nullif(trim(wp.assigned_to_staff_name), '')), ', ')
            from public.order_work_packages wp
           where wp.order_id = v.id and wp.status <> 'cancelled'),
         v.driver_name::text
  from public.order_operations_list v
  where public.is_business_director()
    and v.required_at is not null
    and (v.required_at at time zone 'Asia/Ho_Chi_Minh')::date between p_from and p_to
  order by v.required_at;
$$;

revoke all on function public.orders_export_rows(date, date) from public, anon;
grant execute on function public.orders_export_rows(date, date) to authenticated;

insert into public.migration_runs(migration_key, status, finished_at, notes)
values('202609201300_them_nhan_vien_vao_rpc_xuat_don_hang', 'completed', now(),
  'Them created_by_name, worker_names, driver_name vao orders_export_rows (drop+create vi doi kieu tra ve) - cot nhan vien len don/lam/giao trong file xuat don hang.')
on conflict(migration_key) do update set status='completed', finished_at=now(), notes=excluded.notes;

commit;
