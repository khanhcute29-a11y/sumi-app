-- Bán tại quầy — 3 điều nhân viên xin (22/11), làm như KiotViet:
-- 1) Báo cáo cuối ngày: nhân viên cũng xem được số CẢ NGÀY của cửa hàng (ca sáng + ca chiều) và lọc
--    theo Nhân viên / Người tạo để kết ca. Trước đây nhân viên chỉ thấy số của riêng mình.
-- 2) Vào ca: KHÔNG bắt nhập tiền đầu ca nữa. Để trống → máy lấy két ca trước để lại (như KiotViet).
--    Ai muốn đếm lại thì vẫn nhập; lệch thì vẫn báo Giám đốc như cũ.
-- 3) Ca người trước quên kết: người sau bấm "Nhận ca" là bán được luôn, không phải chờ.
--    Máy tự kết ca cũ (ghi rõ "không tự kết ca — X nhận ca", có ảnh két lúc nhận) và báo Giám đốc.
--    Ngoài ra 2 giờ sáng mỗi đêm máy tự kết các ca của ngày hôm trước còn để mở.
-- Chạy sau 202611221030. Chỉ thêm cột / thay hàm, không xoá gì.
begin;
set local lock_timeout = '10s';

-- Đánh dấu ca được máy kết hộ (không phải người mở ca tự đếm két).
alter table public.pos_shifts add column if not exists auto_closed text;   -- null | 'nhan_ca' | 'qua_dem'

-- ───────── 1) Báo cáo cuối ngày: ai cũng xem cả cửa hàng ─────────
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
  -- Như KiotViet: mọi người bán (cả nhân viên) xem được số cả ngày của cửa hàng để kết ca,
  -- lọc theo Nhân viên / Người tạo. Báo cáo này không có giá vốn / lãi.
  if jsonb_typeof(p_loc->'nhan_vien') = 'array' and jsonb_array_length(p_loc->'nhan_vien') > 0 then
    select array_agg(x) into v_nv from jsonb_array_elements_text(p_loc->'nhan_vien') x;
  end if;
  if jsonb_typeof(p_loc->'nguoi_tao') = 'array' and jsonb_array_length(p_loc->'nguoi_tao') > 0 then
    select array_agg(x::uuid) into v_tao from jsonb_array_elements_text(p_loc->'nguoi_tao') x;
  end if;

  with
  hd_all as (
    select i.* from public.pos_invoices i
    where (p_store is null or i.store_location = p_store) and i.created_at >= p_from and i.created_at < p_to
      and (v_tao is null or i.cashier_id = any(v_tao))
      and (v_nv is null or coalesce(i.seller_name, i.cashier_name) = any(v_nv))
      and (v_ban is null or 'khong_giao' = any(v_ban))           -- bán tại quầy = không giao hàng
  ),
  hd as (select * from hd_all h where status = 'xong' and (v_pt is null or exists (
    select 1 from public.pos__cac_pt(h.pay_method, h.paid_amount, h.pay_parts) x where x.pt = any(v_pt)))),
  -- Phiếu thu: tiền bán hàng + thu nợ + thu đơn đặt (cọc / lấy bánh)
  thu as (
    -- Hoá đơn trả kết hợp → mỗi cách trả 1 dòng thu (như sổ quỹ KiotViet).
    select 'hd'::text as loai, h.code as ma, h.created_at as luc, x.tien, x.pt,
           coalesce(h.seller_name, h.cashier_name) as nguoi, h.customer_name as khach
      from hd h cross join lateral public.pos__cac_pt(h.pay_method, h.paid_amount, h.pay_parts) x
      where x.tien > 0 and (v_pt is null or x.pt = any(v_pt))
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
    -- danh sách để chọn trong Bộ lọc: MỌI tài khoản được bán hàng thật
    -- (cờ pos_ban_hang_that) + ai từng bán ở cửa hàng này — không chỉ người đã có hoá đơn trong kỳ.
    'ds_nhan_vien', (select coalesce(jsonb_agg(n order by n), '[]') from (
        select distinct n from (
          select coalesce(seller_name, cashier_name) n from public.pos_invoices
            where (p_store is null or store_location = p_store)
          union all
          select p.full_name from public.profiles p
            where p.id = any(coalesce((select allowed_profile_ids from public.feature_flags where key = 'pos_ban_hang_that'), '{}'))
              and coalesce(p.approved, false) and p.active is not false
        ) x where nullif(trim(n), '') is not null) t),
    'ds_nguoi_tao', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'ten', ten) order by ten), '[]') from (
        select distinct on (id) id, ten from (
          select cashier_id as id, cashier_name as ten, 1 as uu from public.pos_invoices
            where (p_store is null or store_location = p_store) and cashier_id is not null
          union all
          select p.id, p.full_name, 0 from public.profiles p
            where p.id = any(coalesce((select allowed_profile_ids from public.feature_flags where key = 'pos_ban_hang_that'), '{}'))
              and coalesce(p.approved, false) and p.active is not false
        ) x where nullif(trim(ten), '') is not null order by id, uu) t),
    'chi_cua_toi', false
  ) into v;
  return v;
end $$;

revoke all on function public.pos_bao_cao_cuoi_ngay(text, timestamptz, timestamptz, jsonb) from public, anon;
grant execute on function public.pos_bao_cao_cuoi_ngay(text, timestamptz, timestamptz, jsonb) to authenticated;

-- ───────── Két ca trước để lại ─────────
-- Ca trước đếm két → lấy số đếm. Ca trước máy kết hộ (không ai đếm) → lấy số máy tính.
create or replace function public.pos__ket_ca_truoc(p_store text)
returns public.pos_shifts language sql stable security definer set search_path = public as $$
  select * from public.pos_shifts
    where store_location = p_store and status = 'closed' and coalesce(counted_cash, expected_cash) is not null
    order by closed_at desc nulls last limit 1
$$;
revoke all on function public.pos__ket_ca_truoc(text) from public, anon, authenticated;

create or replace function public.pos_tien_dau_ca(p_store text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v public.pos_shifts;
begin
  if public.pos_cap_do() is null then raise exception 'Tài khoản chưa được duyệt'; end if;
  v := public.pos__ket_ca_truoc(p_store);
  if v.id is null then return jsonb_build_object('co', false); end if;
  return jsonb_build_object('co', true, 'so', coalesce(v.counted_cash, v.expected_cash), 'ca', v.code,
    'ten', case when v.auto_closed is not null then v.opened_by_name else coalesce(v.closed_by_name, v.opened_by_name) end, 'luc', v.closed_at, 'chua_dem', v.counted_cash is null);
end $$;
revoke all on function public.pos_tien_dau_ca(text) from public, anon;
grant execute on function public.pos_tien_dau_ca(text) to authenticated;

-- ───────── 2) Vào ca: tiền đầu ca không bắt buộc ─────────
create or replace function public.pos_vao_ca_v2(p_store text, p_opening_cash numeric, p_photo_url text, p_ly_do_chi text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_cap text := public.pos_cap_do(); v_set public.pos_settings; v_row public.pos_shifts; v_truoc public.pos_shifts;
  v_loai text; v_nhanh text; v_dau numeric; v_goc numeric; v_lech numeric := 0; f text := 'FM999G999G999';
  v_ly text := nullif(btrim(coalesce(p_ly_do_chi, '')), ''); v_chi public.pos_cash_outs;
begin
  if v_cap is null then raise exception 'Tài khoản chưa được duyệt'; end if;
  select * into v_set from public.pos_settings where store_location = p_store;
  if v_set.store_location is null then raise exception 'Chi nhánh không hợp lệ'; end if;
  if p_opening_cash < 0 then raise exception 'Số tiền trong két không hợp lệ'; end if;
  perform pg_advisory_xact_lock(hashtext('pos_ca:' || p_store));
  select * into v_row from public.pos_shifts where store_location = p_store and status = 'open';
  if v_row.id is not null then
    if v_row.opened_by = auth.uid() then return to_jsonb(v_row); end if;   -- bấm lại / máy khác của chính mình
    raise exception 'Ca của % đang mở — bấm "Nhận ca" để bán tiếp, máy tự kết ca của % và báo Giám đốc', coalesce(v_row.opened_by_name, 'người khác'), coalesce(v_row.opened_by_name, 'người đó');
  end if;
  if coalesce(trim(p_photo_url), '') = '' then raise exception 'Chụp ảnh két tiền trước khi vào ca'; end if;
  if v_set.bat_cham_cong and v_cap = 'nv' then
    select l.type, l.branch into v_loai, v_nhanh from public.shift_logs l
      where l.staff_id = auth.uid() and l.work_date = (now() at time zone 'Asia/Ho_Chi_Minh')::date and l.type in ('checkin', 'checkout')
      order by l.checkin_time desc nulls last limit 1;
    if v_loai is distinct from 'checkin' then
      raise exception 'Bạn chưa chấm công vào làm hôm nay — vào mục Chấm công bấm vào ca trước, rồi quay lại mở ca bán';
    end if;
    if lower(coalesce(v_nhanh, '')) in ('vĩnh phú 42', 'quốc lộ 13') and lower(v_nhanh) <> lower(p_store) then
      raise exception 'Hôm nay bạn chấm công ở %, không vào ca bán ở % được', v_nhanh, p_store;
    end if;
  end if;
  v_truoc := public.pos__ket_ca_truoc(p_store);
  v_goc := coalesce(v_truoc.counted_cash, v_truoc.expected_cash);
  -- Không nhập → két = ca trước để lại (chưa có ca nào thì 0). Có nhập → máy vẫn tính theo ca trước, lệch thì báo.
  v_dau := coalesce(v_goc, round(p_opening_cash), 0);
  if v_goc is not null and p_opening_cash is not null then v_lech := round(p_opening_cash) - v_goc; end if;
  if v_ly is not null and v_lech < 0 then
    if length(v_ly) < 3 then raise exception 'Ghi rõ đã chi tiền làm gì'; end if;
    if length(v_ly) > 300 then raise exception 'Lý do dài quá (tối đa 300 chữ)'; end if;
  end if;
  insert into public.pos_shifts(code, store_location, opened_by, opened_by_name, opening_cash, opening_cash_entered, opening_prev_shift, opening_photo)
  values ('PGC' || lpad(nextval('public.pos_shift_seq')::text, 6, '0'), p_store, auth.uid(), public.pos_ten_toi(),
    v_dau, round(p_opening_cash), v_truoc.id, trim(p_photo_url))
  returning * into v_row;
  perform public.pos__ghi_nhat_ky(p_store, 'mo_ca', v_row.code, jsonb_build_object('tien_dau_ca', v_row.opening_cash,
    'nhan_vien_nhap', v_row.opening_cash_entered, 'ca_truoc', v_truoc.code, 'lech', v_lech,
    'ly_do_chi', case when v_lech < 0 then v_ly end));
  if v_lech < 0 and v_ly is not null then
    -- Két ít hơn ca trước và người vào ca khai đã chi: phần thiếu thành phiếu chi "trước khi vào ca" của ca này.
    v_chi := public.pos__ghi_chi_ket(gen_random_uuid(), v_row, -v_lech, v_ly, trim(p_photo_url), true);
  elsif v_lech <> 0 then
    perform public.pos__bao_sep('pos-dau-ca:' || v_row.id,
      '⚠️ Tiền đầu ca ' || case when v_lech > 0 then 'nhập DƯ ' else 'nhập THIẾU ' end || to_char(abs(v_lech), f) || 'đ — ' || p_store,
      coalesce(v_row.opened_by_name, '') || ' vào ca ' || v_row.code || ' nhập ' || to_char(v_row.opening_cash_entered, f)
        || 'đ, nhưng ca trước ' || coalesce(v_truoc.code, '') || ' (' || coalesce(v_truoc.closed_by_name, '') || ') '
        || case when v_truoc.counted_cash is null then 'máy tính két ' else 'đếm két ' end
        || to_char(v_goc, f) || 'đ. Máy tính két theo số ca trước. Xem ảnh két lúc vào ca để kiểm.',
      v_row.id, 'warning');
  end if;
  return to_jsonb(v_row) || jsonb_build_object('chi_truoc_ca', case when v_chi.id is null then null else to_jsonb(v_chi) end);
end $$;
revoke all on function public.pos_vao_ca_v2(text, numeric, text, text) from public, anon;
grant execute on function public.pos_vao_ca_v2(text, numeric, text, text) to authenticated;

-- ───────── 3) Máy kết hộ một ca bị bỏ quên ─────────
-- p_dem: người nhận ca đếm két (không bắt buộc). Không đếm → két ca cũ = số máy tính, chênh để trống.
create or replace function public.pos__ket_ca_ho(p_shift uuid, p_dem numeric, p_anh text, p_kieu text, p_nguoi text)
returns public.pos_shifts language plpgsql security definer set search_path = public as $$
declare v_s public.pos_shifts; v_sl jsonb; v_expected numeric; v_ds numeric; v_ck numeric; v_no numeric; f text := 'FM999G999G999';
begin
  select * into v_s from public.pos_shifts where id = p_shift for update;
  if v_s.id is null or v_s.status <> 'open' then return v_s; end if;
  v_sl := public.pos__so_lieu_ca(p_shift);
  v_expected := v_s.opening_cash + (v_sl->>'tien_mat_trong_ca')::numeric;
  select coalesce(sum(tinh), 0), coalesce(sum(ck_cho), 0), coalesce(sum(no_chua_tra), 0) into v_ds, v_ck, v_no
    from public.pos__ds_hd(v_s.opened_at - interval '3 days', now() + interval '1 minute') d
    where d.shift_id = p_shift and d.cashier_id is not distinct from v_s.opened_by;
  v_sl := v_sl || jsonb_build_object('doanh_so_tinh', v_ds, 'ck_cho', v_ck, 'no_chua_tra', v_no, 'so_banh_lech', 0,
    'tu_ket', p_kieu, 'nguoi_nhan_ca', p_nguoi);
  update public.pos_shifts set status = 'closed', closed_by = auth.uid(), closed_by_name = coalesce(p_nguoi, 'Máy tự kết ca'),
    closed_at = now(), expected_cash = v_expected, counted_cash = round(p_dem), diff = round(p_dem - v_expected), summary = v_sl,
    note = case when p_kieu = 'nhan_ca' then coalesce(v_s.opened_by_name, 'Người bán') || ' không kết ca — ' || coalesce(p_nguoi, '') || ' nhận ca'
                else 'Không kết ca — máy tự kết lúc 2 giờ sáng' end,
    closing_photo = nullif(trim(coalesce(p_anh, '')), ''), auto_closed = p_kieu
  where id = p_shift returning * into v_s;
  perform public.pos__ghi_nhat_ky(v_s.store_location, 'dong_ca_ho', v_s.code,
    jsonb_build_object('kieu', p_kieu, 'he_thong', v_expected, 'dem', p_dem, 'chenh', v_s.diff, 'nguoi_nhan', p_nguoi));
  perform public.pos__bao_sep('pos-dong-ca:' || v_s.id,
    '⚠️ ' || coalesce(v_s.opened_by_name, 'Người bán') || ' không kết ca — ' || v_s.store_location,
    'Ca ' || v_s.code || ' (vào lúc ' || to_char(v_s.opened_at at time zone 'Asia/Ho_Chi_Minh', 'HH24:MI DD/MM') || '): '
      || (v_sl->>'so_hoa_don') || ' hoá đơn, doanh số tính ' || to_char(v_ds, f) || 'đ. '
      || case when p_kieu = 'nhan_ca' then coalesce(p_nguoi, '') || ' nhận ca, máy kết hộ. ' else 'Máy tự kết lúc 2 giờ sáng. ' end
      || 'Tiền mặt máy tính ' || to_char(v_expected, f) || 'đ'
      || case when p_dem is null then ' — chưa ai đếm két, chưa đếm bánh.'
              else ', người nhận ca đếm ' || to_char(p_dem, f) || 'đ'
                || case when v_s.diff <> 0 then ' (' || case when v_s.diff > 0 then 'dư ' else 'THIẾU ' end || to_char(abs(v_s.diff), f) || 'đ)' else '' end
                || '. Chưa đếm bánh.' end,
    v_s.id, 'warning');
  return v_s;
end $$;
revoke all on function public.pos__ket_ca_ho(uuid, numeric, text, text, text) from public, anon, authenticated;

-- Người sau bấm "Nhận ca": kết hộ ca đang mở rồi vào ca của mình — cùng một lần, không ai bị chặn bán.
-- Ca của chính mình hôm nay thì phải tự Kết ca (đếm két) như thường.
create or replace function public.pos_nhan_ca(p_store text, p_shift uuid, p_dem numeric, p_photo_url text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_cap text := public.pos_cap_do(); v_s public.pos_shifts; v_ten text := public.pos_ten_toi();
  v_hom_nay date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
begin
  if v_cap is null then raise exception 'Tài khoản chưa được duyệt'; end if;
  if p_dem < 0 then raise exception 'Số tiền trong két không hợp lệ'; end if;
  if coalesce(trim(p_photo_url), '') = '' then raise exception 'Chụp ảnh két tiền trước khi nhận ca'; end if;
  perform pg_advisory_xact_lock(hashtext('pos_ca:' || p_store));
  select * into v_s from public.pos_shifts where store_location = p_store and status = 'open';
  if v_s.id is null then
    -- Người kia vừa kết ca xong → vào ca bình thường.
    return public.pos_vao_ca_v2(p_store, p_dem, p_photo_url, null) || jsonb_build_object('da_ket_truoc', true);
  end if;
  if v_s.id is distinct from p_shift then raise exception 'Ca ở quầy vừa thay đổi — bấm Tải lại rồi thử lại'; end if;
  if v_s.opened_by = auth.uid() and (v_s.opened_at at time zone 'Asia/Ho_Chi_Minh')::date >= v_hom_nay then
    raise exception 'Đây là ca của bạn — bấm Kết ca để đếm két như thường';
  end if;
  perform public.pos__ket_ca_ho(v_s.id, p_dem, p_photo_url, 'nhan_ca', v_ten);
  return public.pos_vao_ca_v2(p_store, p_dem, p_photo_url, null) || jsonb_build_object('ca_cu', v_s.code, 'ca_cu_cua', v_s.opened_by_name);
end $$;
revoke all on function public.pos_nhan_ca(text, uuid, numeric, text) from public, anon;
grant execute on function public.pos_nhan_ca(text, uuid, numeric, text) to authenticated;

-- 2 giờ sáng: kết hộ mọi ca mở từ hôm trước trở về trước (người bán quên bấm Kết ca).
create or replace function public.pos_tu_ket_ca_qua_dem()
returns int language plpgsql security definer set search_path = public as $$
declare r record; n int := 0;
begin
  for r in select id from public.pos_shifts where status = 'open'
      and (opened_at at time zone 'Asia/Ho_Chi_Minh')::date < (now() at time zone 'Asia/Ho_Chi_Minh')::date loop
    perform pg_advisory_xact_lock(hashtext('pos_ca:' || (select store_location from public.pos_shifts where id = r.id)));
    perform public.pos__ket_ca_ho(r.id, null, null, 'qua_dem', null);
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function public.pos_tu_ket_ca_qua_dem() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    if exists (select 1 from cron.job where jobname = 'sumi-pos-tu-ket-ca') then
      perform cron.unschedule('sumi-pos-tu-ket-ca');
    end if;
    perform cron.schedule('sumi-pos-tu-ket-ca', '0 19 * * *', 'select public.pos_tu_ket_ca_qua_dem()');  -- 19:00 UTC = 02:00 VN
  end if;
end $$;

insert into public.migration_runs(migration_key, status, finished_at, notes)
values ('202611221040_ban_hang_quay_nhan_ca_va_bao_cao_ca_ngay', 'completed', now(),
  'Bán tại quầy: nhân viên xem báo cáo cuối ngày cả cửa hàng; tiền đầu ca không bắt buộc; Nhận ca khi người trước quên kết (máy kết hộ + báo GĐ); 2h sáng tự kết ca hôm trước.')
on conflict (migration_key) do update set status = 'completed', finished_at = now(), notes = excluded.notes;

commit;
