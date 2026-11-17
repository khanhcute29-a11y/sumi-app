-- Bán tại quầy: "Báo cáo cuối ngày" như app KiotViet (Khác → Báo cáo → Cuối ngày).
--  Tổng thu / Tổng chi / Thu − Chi · tiền theo phương thức thanh toán · Tổng kết bán hàng.
--  Bộ lọc: Nhân viên (người bán) · Người tạo (thu ngân) · Phương thức thanh toán · Phương thức bán hàng (Giao / Không giao).
--  Nhân viên: database tự khoá chỉ số liệu của CHÍNH MÌNH (bỏ qua lọc nhân viên / người tạo gửi lên).
--  Quản lý / Giám đốc: cả cửa hàng, lọc được theo người.
-- Chạy SAU 202611161030. Chỉ thêm hàm, không đổi bảng.
begin;
set local lock_timeout = '10s';

create or replace function public.pos_bao_cao_cuoi_ngay(p_store text, p_from timestamptz, p_to timestamptz, p_loc jsonb default '{}'::jsonb)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_cap text := public.pos_cap_do(); v_toi uuid := auth.uid();
  v_nv text[]; v_tao uuid[]; v_pt text[]; v_ban text[]; v jsonb;
begin
  if v_cap is null then raise exception 'Tài khoản chưa được duyệt'; end if;
  if p_from is null or p_to is null or p_to <= p_from then raise exception 'Khoảng ngày không hợp lệ'; end if;
  if p_to - p_from > interval '93 days' then raise exception 'Chọn tối đa 3 tháng'; end if;
  p_loc := coalesce(p_loc, '{}'::jsonb);
  if jsonb_typeof(p_loc->'pttt') = 'array' and jsonb_array_length(p_loc->'pttt') > 0 then
    select array_agg(x) into v_pt from jsonb_array_elements_text(p_loc->'pttt') x;
  end if;
  if jsonb_typeof(p_loc->'ban') = 'array' then
    select coalesce(array_agg(x), '{}') into v_ban from jsonb_array_elements_text(p_loc->'ban') x;
  end if;
  if v_cap = 'nv' then
    v_tao := array[v_toi];   -- nhân viên chỉ xem của mình
  else
    if jsonb_typeof(p_loc->'nhan_vien') = 'array' and jsonb_array_length(p_loc->'nhan_vien') > 0 then
      select array_agg(x) into v_nv from jsonb_array_elements_text(p_loc->'nhan_vien') x;
    end if;
    if jsonb_typeof(p_loc->'nguoi_tao') = 'array' and jsonb_array_length(p_loc->'nguoi_tao') > 0 then
      select array_agg(x::uuid) into v_tao from jsonb_array_elements_text(p_loc->'nguoi_tao') x;
    end if;
  end if;

  with
  hd_all as (
    select i.* from public.pos_invoices i
    where (p_store is null or i.store_location = p_store) and i.created_at >= p_from and i.created_at < p_to
      and (v_tao is null or i.cashier_id = any(v_tao))
      and (v_nv is null or coalesce(i.seller_name, i.cashier_name) = any(v_nv))
      and (v_ban is null or 'khong_giao' = any(v_ban))           -- bán tại quầy = không giao hàng
  ),
  hd as (select * from hd_all where status = 'xong' and (v_pt is null or pay_method = any(v_pt))),
  -- Phiếu thu: tiền bán hàng + thu nợ + thu đơn đặt (cọc / lấy bánh)
  thu as (
    select 'hd'::text as loai, h.code as ma, h.created_at as luc, h.paid_amount as tien, h.pay_method as pt,
           coalesce(h.seller_name, h.cashier_name) as nguoi, h.customer_name as khach
      from hd h where h.paid_amount > 0
    union all
    select 'thu_no', coalesce(i.code, ''), d.created_at, -d.amount, coalesce(d.pay_method, 'tien_mat'), d.created_by_name, c.name
      from public.pos_debt_entries d
      left join public.pos_invoices i on i.id = d.invoice_id
      left join public.customers c on c.id = d.customer_id
      where d.entry_type = 'thu_no' and d.amount < 0
        and (p_store is null or d.store_location = p_store) and d.created_at >= p_from and d.created_at < p_to
        and (v_tao is null or d.created_by = any(v_tao))
        and (v_nv is null or d.created_by_name = any(v_nv))
        and (v_pt is null or coalesce(d.pay_method, 'tien_mat') = any(v_pt))
        and (v_ban is null or 'khong_giao' = any(v_ban))
    union all
    select case when p.kind = 'coc' then 'coc' else 'lay_banh' end, coalesce(p.order_code, ''), p.created_at, p.amount, p.pay_method,
           p.created_by_name, null
      from public.pos_order_payments p
      left join public.orders o on o.id = p.order_id
      where (p_store is null or p.store_location = p_store) and p.created_at >= p_from and p.created_at < p_to
        and (v_tao is null or p.created_by = any(v_tao))
        and (v_nv is null or p.created_by_name = any(v_nv))
        and (v_pt is null or p.pay_method = any(v_pt))
        and (v_ban is null or (case when o.delivery_method = 'giao_tan_noi' then 'giao' else 'khong_giao' end) = any(v_ban))
  ),
  ln as (select l.* from public.pos_invoice_lines l join hd on hd.id = l.invoice_id)
  select jsonb_build_object(
    'tong_thu', (select coalesce(sum(tien), 0) from thu),
    'tong_chi', 0,
    'pttt', jsonb_build_object(
      'tien_mat', (select coalesce(sum(tien), 0) from thu where pt = 'tien_mat'),
      'chuyen_khoan', (select coalesce(sum(tien), 0) from thu where pt = 'chuyen_khoan'),
      'the', (select coalesce(sum(tien), 0) from thu where pt = 'the'),
      'diem', (select coalesce(sum(points_value), 0) from hd),
      'voucher', 0,
      'vi', (select coalesce(sum(tien), 0) from thu where pt = 'vi')),
    'hd', jsonb_build_object(
      'so', (select count(*) from hd),
      'tong_hang', (select coalesce(sum(gross), 0) from hd),
      'giam', (select coalesce(sum(line_discount + invoice_discount + eod_discount), 0) from hd),
      'thu_khac', (select coalesce(sum(other_fee), 0) from hd),
      'doanh_thu', (select coalesce(sum(total), 0) from hd),
      'ghi_no', (select coalesce(sum(debt_amount), 0) from hd),
      'so_huy', (select count(*) from hd_all where status = 'huy'),
      'tien_huy', (select coalesce(sum(total), 0) from hd_all where status = 'huy')),
    'hang', jsonb_build_object(
      'so_mat_hang', (select count(distinct (product_id, variant_id)) from ln),
      'so_luong', (select coalesce(sum(qty), 0) from ln),
      'ds', (select coalesce(jsonb_agg(m), '[]') from (
        select jsonb_build_object('ten', name || coalesce(' ' || size, ''), 'sl', sum(qty), 'tien', sum(line_total)) m
        from ln group by product_id, variant_id, name, size order by sum(qty) desc limit 200) t)),
    'dat', jsonb_build_object(
      'so', (select count(*) from thu where loai in ('coc', 'lay_banh')),
      'tien', (select coalesce(sum(tien), 0) from thu where loai in ('coc', 'lay_banh'))),
    'thu_no', (select coalesce(sum(tien), 0) from thu where loai = 'thu_no'),
    'phieu', (select coalesce(jsonb_agg(r order by r->>'luc' desc), '[]') from (
        select jsonb_build_object('loai', loai, 'ma', ma, 'luc', luc, 'tien', tien, 'pt', pt, 'nguoi', nguoi, 'khach', khach) r
        from thu order by luc desc limit 300) t),
    -- danh sách để chọn trong Bộ lọc (chỉ Quản lý / Giám đốc)
    'ds_nhan_vien', case when v_cap = 'nv' then '[]'::jsonb else (select coalesce(jsonb_agg(distinct n), '[]') from (
        select coalesce(seller_name, cashier_name) n from public.pos_invoices
        where (p_store is null or store_location = p_store) and created_at >= p_from - interval '31 days' and created_at < p_to
          and coalesce(seller_name, cashier_name) is not null) t) end,
    'ds_nguoi_tao', case when v_cap = 'nv' then '[]'::jsonb else (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'ten', ten) order by ten), '[]') from (
        select distinct cashier_id as id, cashier_name as ten from public.pos_invoices
        where (p_store is null or store_location = p_store) and created_at >= p_from - interval '31 days' and created_at < p_to
          and cashier_id is not null) t) end,
    'chi_cua_toi', v_cap = 'nv'
  ) into v;
  return v;
end $$;

revoke all on function public.pos_bao_cao_cuoi_ngay(text, timestamptz, timestamptz, jsonb) from public, anon;
grant execute on function public.pos_bao_cao_cuoi_ngay(text, timestamptz, timestamptz, jsonb) to authenticated;

insert into public.migration_runs(migration_key, status, finished_at, notes)
values ('202611171000_ban_hang_quay_bao_cao_cuoi_ngay', 'completed', now(),
  'Bán tại quầy: pos_bao_cao_cuoi_ngay — Báo cáo cuối ngày như KiotViet (thu/chi, phương thức thanh toán, tổng kết bán hàng, bộ lọc). Nhân viên chỉ thấy số của mình.')
on conflict (migration_key) do update set status = 'completed', finished_at = now(), notes = excluded.notes;

commit;
