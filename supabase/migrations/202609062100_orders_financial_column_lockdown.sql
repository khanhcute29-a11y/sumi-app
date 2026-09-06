-- Vá lỗ hổng thật (quét codebase 06/09/2026): migration 202608230042 đã
-- `grant all on public.orders/order_items to authenticated` + policy
-- `using(true)` — đè lên phần "ẩn cột tài chính" đã làm đúng ở migration
-- 202608220014 (M14). Xác nhận bằng query trực tiếp: authenticated hiện có
-- SELECT/UPDATE trên total, deposit, paid_amount, ship_fee, payment_method
-- và order_items.unit_price — và OrderV2DetailModal.jsx (màn xem chi tiết
-- đơn MỞ ĐƯỢC BỞI MỌI VAI TRÒ kể cả bếp/kho/shipper) đang lấy thẳng các cột
-- này không lọc gì.
--
-- KHÔNG revoke rồi để trống — vì Postgres chỉ có 1 role DB "authenticated"
-- dùng chung cho MỌI vai trò ứng dụng, không thể phân biệt sale/shipper ở
-- tầng GRANT cột. Test code thật cho thấy 2 luồng nghiệp vụ ĐANG SỐNG phụ
-- thuộc các cột này:
--   1. markOrderPaid() (queries.js) — UPDATE paid_amount trực tiếp.
--   2. Shipper cần thấy total/deposit để biết thu COD bao nhiêu (quyền
--      confirm_cod_receipt trong roles.js) — khoá thẳng tay là hỏng luồng
--      giao hàng thu tiền thật đang chạy mỗi ngày.
-- Giải pháp: revoke cột tài chính khỏi truy cập trực tiếp, thay bằng RPC
-- SECURITY DEFINER tự kiểm tra vai trò người gọi rồi mới trả đúng phần được
-- phép thấy — đúng mẫu is_business_director()/is_approved() đã dùng khắp
-- codebase, không phải kỹ thuật mới.
begin;
set local lock_timeout = '10s';
set local statement_timeout = '30s';

-- ── Nhóm vai trò được thấy ĐẦY ĐỦ tài chính từng đơn ───────────────────────
-- Khớp permissions.js: admin/accountant có view_revenue|view_costs|view_profit,
-- sale có view_prices, deputy_director_x41/x42 "xem giá đơn Macaron/Trường
-- học của mình" (nhưng KHÔNG xem doanh thu tổng — xem is_business_director()
-- bên dưới, cố tình KHÔNG gồm deputy_director). cashier xử lý thu chi (đã có
-- trong policy update order_items cũ) nên cũng thuộc nhóm này.
create or replace function public.can_view_order_financials()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(
    auth.uid() is not null and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.approved = true and p.active is not false
        and (
          p.role = any(array['owner','admin','accountant','sale','cashier','deputy_director_x41','deputy_director_x42'])
          or p.extra_roles && array['owner','admin','accountant','sale','cashier','deputy_director_x41','deputy_director_x42']
        )
    ), false
  );
$$;
revoke all on function public.can_view_order_financials() from public, anon;
grant execute on function public.can_view_order_financials() to authenticated;

-- ── Nhóm vai trò CHỈ được thấy tổng tiền/đã cọc (để tính COD) ─────────────
-- KHÔNG thấy hình thức thanh toán/giảm giá/thuế — không cần cho việc giao
-- hàng, chỉ cần biết số tiền cần thu.
create or replace function public.can_view_order_cod_amount()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(
    auth.uid() is not null and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.approved = true and p.active is not false
        and (
          p.role = any(array['shipper','shipper_school','transport_lead'])
          or p.extra_roles && array['shipper','shipper_school','transport_lead']
        )
    ), false
  );
$$;
revoke all on function public.can_view_order_cod_amount() from public, anon;
grant execute on function public.can_view_order_cod_amount() to authenticated;

-- ── Khoá cột tài chính thật trên orders/order_items ────────────────────────
-- Cắt cả SELECT lẫn UPDATE — trước đây "grant all" + policy using(true) cho
-- phép bất kỳ ai gọi thẳng REST API sửa total/paid_amount không qua
-- markOrderPaid()/mark_order_paid(), không chỉ đọc được mà còn SỬA được.
revoke select (total, deposit, paid_amount, ship_fee, payment_method,
  discount_amount, vat_amount, payment_verified, payment_verified_at,
  payment_verified_by, payment_proof_url) on public.orders from authenticated;
revoke update (total, deposit, paid_amount, ship_fee, payment_method,
  discount_amount, vat_amount, payment_verified, payment_verified_at,
  payment_verified_by, payment_proof_url) on public.orders from authenticated;

revoke select (unit_price, price) on public.order_items from authenticated;
revoke update (unit_price, price) on public.order_items from authenticated;

-- ── RPC đọc tài chính 1 đơn — trả đúng phần theo vai trò người gọi ────────
create or replace function public.get_order_financials(p_order_id uuid)
returns table(
  total numeric, deposit numeric, paid_amount numeric, ship_fee numeric,
  payment_method text, discount_amount numeric, vat_amount numeric,
  payment_verified boolean, payment_verified_at timestamptz, payment_proof_url text
)
language plpgsql stable security definer set search_path = public as $$
declare
  v_order public.orders%rowtype;
begin
  if not (public.can_view_order_financials() or public.can_view_order_cod_amount()) then
    return;
  end if;
  select * into v_order from public.orders where id = p_order_id;
  if v_order.id is null then return; end if;

  if public.can_view_order_financials() then
    return query select v_order.total, v_order.deposit, v_order.paid_amount, v_order.ship_fee,
      v_order.payment_method, v_order.discount_amount, v_order.vat_amount,
      v_order.payment_verified, v_order.payment_verified_at, v_order.payment_proof_url;
  else
    return query select v_order.total, v_order.deposit, null::numeric, null::numeric,
      null::text, null::numeric, null::numeric,
      v_order.payment_verified, null::timestamptz, null::text;
  end if;
end;
$$;
revoke all on function public.get_order_financials(uuid) from public, anon;
grant execute on function public.get_order_financials(uuid) to authenticated;

-- ── RPC đọc giá từng món trong đơn — chỉ nhóm ĐẦY ĐỦ (COD không cần) ──────
create or replace function public.get_order_item_prices(p_order_id uuid)
returns table(item_id uuid, unit_price numeric)
language sql stable security definer set search_path = public as $$
  select oi.id, oi.unit_price
  from public.order_items oi
  where oi.order_id = p_order_id and public.can_view_order_financials();
$$;
revoke all on function public.get_order_item_prices(uuid) from public, anon;
grant execute on function public.get_order_item_prices(uuid) to authenticated;

-- ── RPC ghi "đã thu tiền" — thay UPDATE trực tiếp paid_amount ─────────────
-- Nhóm đầy đủ: luôn được. Nhóm COD: chỉ đơn CHÍNH MÌNH đang giao (khớp
-- shipper_staff_name) — đúng nghiệp vụ "shipper thu COD xong tự đánh dấu".
create or replace function public.mark_order_paid(p_order_id uuid, p_amount numeric)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_order public.orders%rowtype;
  v_me text;
begin
  select * into v_order from public.orders where id = p_order_id;
  if v_order.id is null then raise exception 'Không tìm thấy đơn hàng.'; end if;

  if public.can_view_order_financials() then
    update public.orders set paid_amount = p_amount where id = p_order_id;
    return;
  end if;

  if public.can_view_order_cod_amount() then
    select full_name into v_me from public.profiles where id = auth.uid();
    if v_order.shipper_staff_name is distinct from v_me then
      raise exception 'Chỉ shipper đang giao đơn này mới xác nhận thu tiền được.';
    end if;
    update public.orders set paid_amount = p_amount where id = p_order_id;
    return;
  end if;

  raise exception 'Bạn không có quyền cập nhật số tiền đã thu.';
end;
$$;
revoke all on function public.mark_order_paid(uuid, numeric) from public, anon;
grant execute on function public.mark_order_paid(uuid, numeric) to authenticated;

-- ── RPC doanh thu tổng cho widget Trang chủ — CHỈ owner/admin ─────────────
-- Thay MobileHomeScreen.jsx đang .select('order_type,total') trực tiếp.
create or replace function public.fetch_revenue_by_order_type(p_from timestamptz, p_to timestamptz)
returns table(order_type text, total numeric)
language sql stable security definer set search_path = public as $$
  select o.order_type, o.total
  from public.orders o
  where public.is_business_director()
    and o.status_v2 = 'completed'
    and o.completed_at >= p_from and o.completed_at <= p_to;
$$;
revoke all on function public.fetch_revenue_by_order_type(timestamptz, timestamptz) from public, anon;
grant execute on function public.fetch_revenue_by_order_type(timestamptz, timestamptz) to authenticated;

insert into public.migration_runs(migration_key, status, finished_at, notes)
values('202609062100_orders_financial_column_lockdown', 'completed', now(),
  'Vá lo hong that: orders/order_items cot tai chinh (total,deposit,paid_amount,ship_fee,payment_method,discount_amount,vat_amount,unit_price...) bi mo cho MOI authenticated do migration 202608230042 (grant all + using(true)) de len M14. Da revoke select/update cac cot nay, thay bang RPC get_order_financials/get_order_item_prices/mark_order_paid/fetch_revenue_by_order_type kiem tra dung vai tro nguoi goi - giu nguyen luong shipper thu COD va markOrderPaid dang chay that.')
on conflict(migration_key) do update set status='completed', finished_at=now(), notes=excluded.notes;

commit;
