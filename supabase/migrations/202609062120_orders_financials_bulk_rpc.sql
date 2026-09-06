-- Bổ sung cho 202609062100/202609062110: `fetchOrders()`/`fetchOrderById()`
-- trong queries.js dùng CHUNG 1 hằng số ORDER_SELECT (`select('*')`) cho RẤT
-- NHIỀU màn hình khác nhau (Dashboard, Báo cáo, Sổ cái công nợ, Khách hàng,
-- Duyệt chi, Vận chuyển bản cũ...) — trong đó nhiều màn ĐANG DÙNG THẬT các
-- cột tài chính đã khoá ở 2 migration trước (vd Sổ cái tính công nợ
-- `total - paid_amount`, Vận chuyển bản cũ hiện số tiền COD cần thu). Khoá
-- cột mà không thay chỗ khác là làm VỠ các màn hình đang chạy thật này.
--
-- Giải pháp: thêm RPC dạng BULK (nhiều đơn/lần) để queries.js chỉ cần vá
-- ĐÚNG 1 CHỖ (fetchOrders/fetchOrderById) — mọi màn hình gọi qua 2 hàm này
-- tự động được vá theo, không cần sửa từng file riêng lẻ.
begin;
set local lock_timeout = '10s';
set local statement_timeout = '30s';

create or replace function public.get_orders_financials_bulk(p_order_ids uuid[])
returns table(
  order_id uuid, total numeric, deposit numeric, paid_amount numeric, ship_fee numeric,
  payment_method text, discount_amount numeric, vat_amount numeric,
  payment_verified boolean, payment_verified_at timestamptz, payment_proof_url text
)
language plpgsql stable security definer set search_path = public as $$
begin
  if public.can_view_order_financials() then
    return query
      select o.id, o.total, o.deposit, o.paid_amount, o.ship_fee, o.payment_method,
             o.discount_amount, o.vat_amount, o.payment_verified, o.payment_verified_at, o.payment_proof_url
      from public.orders o where o.id = any(p_order_ids);
  elsif public.can_view_order_cod_amount() then
    return query
      select o.id, o.total, o.deposit, null::numeric, null::numeric, null::text,
             null::numeric, null::numeric, o.payment_verified, null::timestamptz, null::text
      from public.orders o where o.id = any(p_order_ids);
  end if;
  -- vai trò khác: không trả dòng nào cả (client tự coi là không có dữ liệu).
end;
$$;
revoke all on function public.get_orders_financials_bulk(uuid[]) from public, anon;
grant execute on function public.get_orders_financials_bulk(uuid[]) to authenticated;

create or replace function public.get_order_item_prices_bulk(p_order_ids uuid[])
returns table(item_id uuid, unit_price numeric)
language sql stable security definer set search_path = public as $$
  select oi.id, oi.unit_price
  from public.order_items oi
  where oi.order_id = any(p_order_ids) and public.can_view_order_financials();
$$;
revoke all on function public.get_order_item_prices_bulk(uuid[]) from public, anon;
grant execute on function public.get_order_item_prices_bulk(uuid[]) to authenticated;

insert into public.migration_runs(migration_key, status, finished_at, notes)
values('202609062120_orders_financials_bulk_rpc', 'completed', now(),
  'Bo sung RPC dang bulk (get_orders_financials_bulk, get_order_item_prices_bulk) de fetchOrders()/fetchOrderById() trong queries.js vet 1 lan cho tat ca man hinh dang dung chung ORDER_SELECT (Cashbook cong no, Dashboard/Reports doanh thu, Shipping V1 COD, Customers chi tieu...) khong bi vo sau khi khoa cot tai chinh.')
on conflict(migration_key) do update set status='completed', finished_at=now(), notes=excluded.notes;

commit;
