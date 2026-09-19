-- Xuất chi tiết từng SẢN PHẨM của đơn (yêu cầu Giám đốc 20/09/2026): mỗi món
-- 1 dòng kèm số lượng + đơn giá. order_items.unit_price bị khoá cột ở DB
-- (202609062100) nên cần RPC riêng CHỈ Giám đốc (is_business_director) gọi được,
-- cùng khoảng ngày cần giao (giờ VN) với orders_export_rows.
begin;
set local lock_timeout = '10s';
set local statement_timeout = '30s';

create or replace function public.orders_export_item_rows(p_from date, p_to date)
returns table(
  order_id uuid, item_name text, quantity numeric, unit text, unit_price numeric
)
language sql stable security definer set search_path = public as $$
  select oi.order_id, coalesce(oi.name_snapshot, oi.name), oi.quantity, oi.unit, oi.unit_price
  from public.order_items oi
  join public.orders o on o.id = oi.order_id
  where public.is_business_director()
    and o.required_at is not null
    and (o.required_at at time zone 'Asia/Ho_Chi_Minh')::date between p_from and p_to
  order by o.required_at, oi.order_id, oi.display_order;
$$;

revoke all on function public.orders_export_item_rows(date, date) from public, anon;
grant execute on function public.orders_export_item_rows(date, date) to authenticated;

insert into public.migration_runs(migration_key, status, finished_at, notes)
values('202609201100_rpc_xuat_chi_tiet_san_pham_don_hang', 'completed', now(),
  'RPC orders_export_item_rows(p_from,p_to) chi Giam doc - xuat tung san pham cua don kem so luong + don gia (unit_price bi khoa cot).')
on conflict(migration_key) do update set status='completed', finished_at=now(), notes=excluded.notes;

commit;
