-- Thêm mốc thời gian cho từng khoản trong "Doanh thu dự tính" (yêu cầu
-- Giám đốc 20/09/2026: dễ kiểm tra theo từng ngày) — 2/4 RPC hiện tại
-- (orders_pending_deposit_rows, orders_in_delivery_rows) chưa trả cột ngày
-- nào cả, 2 RPC còn lại (orders_unverified_completed_rows,
-- orders_revenue_by_channel_rows) đã có sẵn completed_at nên không đụng.
--
-- Postgres không cho ĐỔI kiểu trả về của "returns table(...)" bằng create
-- or replace (chỉ đổi được phần thân hàm) — phải drop rồi tạo lại.
begin;
set local lock_timeout = '10s';
set local statement_timeout = '30s';

drop function if exists public.orders_pending_deposit_rows();
create function public.orders_pending_deposit_rows()
returns table(id uuid, order_code text, order_type text, deposit numeric, target_store text, customer_name text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select o.id, o.order_code, o.order_type, o.deposit, o.target_store, c.name, o.created_at
  from public.orders o left join public.customers c on c.id = o.customer_id
  where public.is_business_director()
    and o.deposit > 0 and (o.status_v2 <> 'completed' or o.payment_verified = false);
$$;

drop function if exists public.orders_in_delivery_rows();
create function public.orders_in_delivery_rows()
returns table(id uuid, order_code text, order_type text, total numeric, target_store text, customer_name text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select o.id, o.order_code, o.order_type, o.total, o.target_store, c.name, o.created_at
  from public.orders o left join public.customers c on c.id = o.customer_id
  where public.is_business_director() and o.status_v2 = 'in_delivery';
$$;

-- "Công nợ sổ sách" (customer_debt_balances) — view đã có sẵn last_entry_at
-- (MAX created_at của các bút toán công nợ), chỉ cần SELECT thêm, không
-- cần sửa view.

revoke all on function public.orders_pending_deposit_rows() from public, anon;
revoke all on function public.orders_in_delivery_rows() from public, anon;
grant execute on function public.orders_pending_deposit_rows() to authenticated;
grant execute on function public.orders_in_delivery_rows() to authenticated;

insert into public.migration_runs(migration_key, status, finished_at, notes)
values('202609200900_them_moc_thoi_gian_doanh_thu_du_tinh', 'completed', now(),
  'Them cot created_at vao orders_pending_deposit_rows va orders_in_delivery_rows (drop+create vi doi kieu tra ve) - phuc vu hien moc thoi gian tung khoan trong Doanh thu du tinh (BossOverviewV3).')
on conflict(migration_key) do update set status='completed', finished_at=now(), notes=excluded.notes;

commit;
