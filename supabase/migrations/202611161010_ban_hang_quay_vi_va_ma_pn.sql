-- BÁN TẠI QUẦY — giống KiotViet (Giám đốc duyệt 16/11/2026: "Như kiot việt cho anh hết nhé"):
--  1) Thêm phương thức thanh toán "Ví" (pay_method = 'vi', ví điện tử MoMo/ZaloPay/VNPay…) cho hoá đơn bán.
--     Ví giống Thẻ: tiền không vào két, không cần ai xác nhận như chuyển khoản.
--     - pos_invoices: nới ràng buộc pay_method cho phép 'vi'.
--     - pos_ban: chấp nhận 'vi' (chỉ sửa đúng dòng kiểm tra phương thức).
--     - pos__so_lieu_ca, pos_bao_cao: thêm dòng tổng 'vi' (cạnh 'the') để kết ca / báo cáo tách riêng Ví.
--  2) Phiếu bếp giao ra quầy (Nhập hàng) đánh mã PN… như KiotViet thay vì BG… (phiếu BG cũ giữ nguyên mã).
--     - pos_luu_phieu: chỉ đổi tiền tố 'BG' → 'PN'.
-- Chỉ thêm / nới, không xoá dữ liệu. Chạy lại nhiều lần được.
begin;
set local lock_timeout = '10s';

do $do$
declare c text;
begin
  for c in select conname from pg_constraint
           where conrelid = 'public.pos_invoices'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%pay_method%'
  loop
    execute format('alter table public.pos_invoices drop constraint %I', c);
  end loop;
end
$do$;
alter table public.pos_invoices add constraint pos_invoices_pay_method_check
  check (pay_method in ('tien_mat', 'chuyen_khoan', 'the', 'vi'));

-- pos_ban: bản mới nhất lấy từ 202611151010_ban_hang_quay_doanh_so_nhan_vien.sql, chỉ sửa đúng chỗ ghi ở đầu file.
create or replace function public.pos_ban(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_cap text := public.pos_cap_do(); v_ten text := public.pos_ten_toi();
  v_id uuid := (p->>'id')::uuid; v_store text := p->>'store';
  v_set public.pos_settings; v_old public.pos_invoices; v_line jsonb; v_no int := 0;
  v_pl uuid := nullif(p->>'price_list_id', '')::uuid; v_pl_name text := 'Bảng giá chung';
  v_cust uuid := nullif(p->>'customer_id', '')::uuid; v_cust_row public.customers;
  v_gross numeric := 0; v_line_disc numeric := 0; v_eod numeric := 0; v_sub numeric := 0;
  v_list numeric; v_unit numeric; v_qty numeric; v_inv_disc numeric; v_vat numeric; v_fee numeric := 0;
  v_pts int; v_pts_val numeric := 0; v_total numeric; v_method text; v_recv numeric; v_paid numeric; v_change numeric := 0;
  v_debt numeric := 0; v_code text; v_now_vn time := (now() at time zone 'Asia/Ho_Chi_Minh')::time;
  v_ap public.pos_approvals; v_pct numeric; v_earn int := 0; v_no_cu numeric;
  -- Bán lúc MẤT MẠNG: tiền đã thu, bánh đã giao. Gửi lại mà gặp giá/giờ/hạn mức đã đổi thì vẫn GHI
  -- (không được mất hoá đơn), gắn cờ cảnh báo + báo Giám đốc ngay để kiểm.
  v_off boolean := coalesce((p->>'offline')::boolean, false); v_canh jsonb := '[]'::jsonb;
  v_luc timestamptz := now(); v_ca uuid;
  v_anh text := nullif(trim(coalesce(p->>'photo_url', '')), ''); v_hash text := nullif(trim(coalesce(p->>'photo_hash', '')), '');
  v_trung_anh text; v_chu_ca uuid; v_ten_chu_ca text;
begin
  if v_cap is null then raise exception 'Tài khoản chưa được duyệt'; end if;
  if v_id is null then raise exception 'Thiếu mã hoá đơn'; end if;
  select * into v_old from public.pos_invoices where id = v_id;
  if v_old.id is not null then return jsonb_build_object('id', v_old.id, 'code', v_old.code, 'trung', true); end if;
  select * into v_set from public.pos_settings where store_location = v_store;
  if v_set.store_location is null then raise exception 'Chi nhánh không hợp lệ'; end if;
  if jsonb_array_length(coalesce(p->'lines', '[]')) = 0 then raise exception 'Hoá đơn chưa có hàng'; end if;
  -- Mỗi hoá đơn phải có 1 ảnh (bánh giao khách / tiền mặt / màn hình chuyển khoản) — chống ghi bán ảo.
  if v_anh is null then raise exception 'Chụp hoặc chọn 1 ảnh bán hàng (bánh giao khách, tiền mặt hoặc màn hình chuyển khoản) rồi mới thanh toán'; end if;
  if v_hash is not null then
    select code into v_trung_anh from public.pos_invoices where photo_hash = v_hash and status = 'xong' limit 1;
    if v_trung_anh is not null then
      if not v_off then raise exception 'Ảnh này đã dùng cho hoá đơn % — chụp ảnh khác', v_trung_anh; end if;
      v_canh := v_canh || jsonb_build_object('loai', 'anh_trung', 'hd', v_trung_anh);
      v_hash := null;
    end if;
  end if;
  -- Nhân viên chỉ bán trong ca CỦA MÌNH (doanh số tính theo người bấm thanh toán).
  if v_cap = 'nv' then
    select s.opened_by, s.opened_by_name into v_chu_ca, v_ten_chu_ca from public.pos_shifts s
      where s.store_location = v_store and s.status = 'open' limit 1;
    if v_chu_ca is distinct from auth.uid() then
      if not v_off then
        raise exception '%', case when v_chu_ca is null then 'Bạn chưa vào ca — bấm "Vào ca", đếm két và chụp ảnh két trước khi bán'
          else 'Ca đang mở là của ' || coalesce(v_ten_chu_ca, 'người khác') || ' — người đó kết ca (đếm két) rồi bạn mới vào ca bán được' end;
      end if;
      v_canh := v_canh || jsonb_build_object('loai', 'khong_phai_ca_minh', 'chu_ca', v_ten_chu_ca);
    end if;
  end if;
  if v_off then
    -- Giờ bán thật = giờ trên máy lúc bán (không ở tương lai, không cũ quá 3 ngày).
    v_luc := greatest(least(coalesce(nullif(p->>'client_created_at', '')::timestamptz, now()), now()), now() - interval '3 days');
    v_now_vn := (v_luc at time zone 'Asia/Ho_Chi_Minh')::time;
  end if;
  if v_pl is not null then
    select name into v_pl_name from public.pos_price_lists where id = v_pl and active;
    if v_pl_name is null and v_off then
      select name into v_pl_name from public.pos_price_lists where id = v_pl;
      v_canh := v_canh || jsonb_build_object('loai', 'bang_gia_tat', 'chi_tiet', coalesce(v_pl_name, '?'));
    end if;
    if v_pl_name is null then raise exception 'Bảng giá không còn dùng'; end if;
  end if;
  if v_cust is not null then select * into v_cust_row from public.customers where id = v_cust; end if;

  -- Giá niêm yết phải khớp database (chống sửa giá bên trình duyệt). Giảm giá dòng = niêm yết − đơn giá bán.
  for v_line in select value from jsonb_array_elements(p->'lines') loop
    v_qty := (v_line->>'qty')::numeric;
    if v_qty is null or v_qty <= 0 then raise exception 'Số lượng phải lớn hơn 0'; end if;
    v_list := public.pos__gia(v_pl, (v_line->>'product_id')::uuid, nullif(v_line->>'variant_id', '')::uuid);
    if round((v_line->>'list_price')::numeric) <> v_list and v_off then
      v_canh := v_canh || jsonb_build_object('loai', 'gia_lech', 'mon', v_line->>'name', 'gia_may', round((v_line->>'list_price')::numeric), 'gia_dung', v_list);
      v_list := greatest(round((v_line->>'list_price')::numeric), 0);
    elsif round((v_line->>'list_price')::numeric) <> v_list then
      raise exception 'Giá "%" đã thay đổi (đúng là %đ). Tải lại trang rồi bán lại.', v_line->>'name', to_char(v_list, 'FM999G999G999');
    end if;
    v_unit := least(greatest(round(coalesce((v_line->>'unit_price')::numeric, v_list)), 0), v_list);
    if coalesce((v_line->>'eod')::boolean, false) then
      if v_now_vn < v_set.eod_from then
        if not v_off then raise exception 'Chưa tới giờ giảm giá cuối ngày (%)', to_char(v_set.eod_from, 'HH24:MI'); end if;
        v_canh := v_canh || jsonb_build_object('loai', 'giam_cuoi_ngay_som', 'mon', v_line->>'name');
      end if;
      if v_unit < round(v_list * (1 - v_set.eod_discount_pct / 100)) then
        if not v_off then raise exception 'Giảm giá cuối ngày tối đa %%%', v_set.eod_discount_pct; end if;
        v_canh := v_canh || jsonb_build_object('loai', 'giam_cuoi_ngay_qua_muc', 'mon', v_line->>'name');
      end if;
      v_eod := v_eod + (v_list - v_unit) * v_qty;
    else
      v_line_disc := v_line_disc + (v_list - v_unit) * v_qty;
    end if;
    v_gross := v_gross + v_list * v_qty;
    v_sub := v_sub + v_unit * v_qty;
  end loop;

  v_inv_disc := least(greatest(round(coalesce((p->>'invoice_discount')::numeric, 0)), 0), v_sub);
  select coalesce(sum(greatest(round((f->>'tien')::numeric), 0)), 0) into v_fee from jsonb_array_elements(coalesce(p->'other_fees', '[]')) f;
  v_vat := case when coalesce((p->>'vat')::boolean, false) then round((v_sub - v_inv_disc) * 0.08) else 0 end;

  -- Hạn mức giảm giá: nhân viên vượt % cho phép phải có phiếu duyệt của Quản lý/GĐ.
  v_pct := case when v_gross > 0 then (v_line_disc + v_inv_disc) * 100 / v_gross else 0 end;
  if v_cap = 'nv' and v_pct > v_set.staff_discount_pct then
    select * into v_ap from public.pos_approvals where id = nullif(p->>'approval_id', '')::uuid for update;
    if (v_ap.id is null or v_ap.kind <> 'giam_gia' or v_ap.status <> 'dong_y' or v_ap.requested_by <> auth.uid()
      or coalesce((v_ap.payload->>'tien')::numeric, 0) < v_line_disc + v_inv_disc) and v_off then
      v_canh := v_canh || jsonb_build_object('loai', 'giam_qua_muc', 'phan_tram', round(v_pct, 1), 'muc', v_set.staff_discount_pct);
    elsif v_ap.id is null or v_ap.kind <> 'giam_gia' or v_ap.status <> 'dong_y' or v_ap.requested_by <> auth.uid()
      or coalesce((v_ap.payload->>'tien')::numeric, 0) < v_line_disc + v_inv_disc then
      raise exception 'Giảm %%% vượt mức cho phép (%%%). Bấm "Xin duyệt" để Quản lý duyệt.',
        round(v_pct, 1), v_set.staff_discount_pct;
    end if;
    if v_ap.id is not null then update public.pos_approvals set status = 'da_dung' where id = v_ap.id; end if;
  end if;

  -- Điểm thưởng
  v_pts := greatest(coalesce((p->>'points_used')::int, 0), 0);
  if v_pts > 0 then
    if v_cust is null then raise exception 'Không dùng được điểm cho hoá đơn này'; end if;
    if not v_set.points_enabled then
      if not v_off then raise exception 'Không dùng được điểm cho hoá đơn này'; end if;
      v_canh := v_canh || jsonb_build_object('loai', 'diem_tat');
    end if;
    if v_pts > public.pos__diem_cua(v_cust) then
      if not v_off then raise exception 'Khách không đủ điểm'; end if;
      v_canh := v_canh || jsonb_build_object('loai', 'diem_khong_du', 'dung', v_pts, 'con', public.pos__diem_cua(v_cust));
    end if;
    v_pts_val := least(v_pts * v_set.point_value, v_sub - v_inv_disc + v_vat + v_fee);
  end if;

  v_total := v_sub - v_inv_disc + v_vat + v_fee - v_pts_val;
  v_method := coalesce(p->>'pay_method', 'tien_mat');
  if v_method not in ('tien_mat', 'chuyen_khoan', 'the', 'vi') then raise exception 'Phương thức thanh toán không hợp lệ'; end if;
  v_recv := greatest(round(coalesce((p->>'received')::numeric, v_total)), 0);
  if v_recv >= v_total then
    v_paid := v_total;
    v_change := case when v_method = 'tien_mat' then v_recv - v_total else 0 end;
  else
    v_paid := v_recv; v_debt := v_total - v_recv;
    if v_cust is null then raise exception 'Khách lẻ không được ghi nợ — chọn khách có tên + SĐT hoặc thu đủ tiền.'; end if;
    v_no_cu := public.pos__no_cua(v_cust);
    if v_no_cu + v_debt > v_set.debt_limit and v_cap = 'nv' and v_off then
      v_canh := v_canh || jsonb_build_object('loai', 'vuot_han_muc_no', 'no_cu', v_no_cu, 'no_moi', v_debt, 'han_muc', v_set.debt_limit);
    elsif v_no_cu + v_debt > v_set.debt_limit and v_cap = 'nv' then
      raise exception 'Vượt hạn mức nợ %đ của khách (đang nợ %đ). Cần Quản lý / Giám đốc bán.',
        to_char(v_set.debt_limit, 'FM999G999G999'), to_char(v_no_cu, 'FM999G999G999');
    end if;
  end if;

  v_ca := public.pos__ca_mo(v_store);
  if v_off and nullif(p->>'shift_id', '') is not null and (p->>'shift_id')::uuid is distinct from v_ca then
    v_canh := v_canh || jsonb_build_object('loai', 'khac_ca', 'ca_luc_ban', (select code from public.pos_shifts where id = (p->>'shift_id')::uuid),
      'ca_ghi_vao', (select code from public.pos_shifts where id = v_ca));
  end if;
  v_code := 'HD' || lpad(nextval('public.pos_invoice_seq')::text, 6, '0');
  insert into public.pos_invoices(id, code, store_location, shift_id, cashier_id, cashier_name, seller_name,
    customer_id, customer_name, customer_phone, price_list_id, price_list_name,
    gross, line_discount, eod_discount, invoice_discount, subtotal, vat_amount, other_fee, other_fee_detail,
    points_used, points_value, total, pay_method, paid_amount, received_amount, change_amount, debt_amount,
    transfer_status, note, offline, client_created_at, created_at, canh_bao, photo_url, photo_hash)
  values (v_id, v_code, v_store, v_ca, auth.uid(), v_ten, coalesce(nullif(p->>'seller_name', ''), v_ten),
    v_cust, coalesce(v_cust_row.name, 'Khách lẻ'), v_cust_row.phone, v_pl, v_pl_name,
    v_gross, v_line_disc, v_eod, v_inv_disc, v_sub, v_vat, v_fee, coalesce(p->'other_fees', '[]'),
    v_pts, v_pts_val, v_total, v_method, v_paid, v_recv, v_change, v_debt,
    case when v_method = 'chuyen_khoan' and v_paid > 0 then 'cho_xac_nhan' else 'khong' end,
    nullif(p->>'note', ''), v_off, nullif(p->>'client_created_at', '')::timestamptz, v_luc, case when jsonb_array_length(v_canh) > 0 then v_canh end,
    v_anh, v_hash);

  for v_line in select value from jsonb_array_elements(p->'lines') loop
    v_no := v_no + 1;
    v_qty := (v_line->>'qty')::numeric;
    v_list := public.pos__gia(v_pl, (v_line->>'product_id')::uuid, nullif(v_line->>'variant_id', '')::uuid);
    if v_off and round((v_line->>'list_price')::numeric) <> v_list then v_list := greatest(round((v_line->>'list_price')::numeric), 0); end if;
    v_unit := least(greatest(round(coalesce((v_line->>'unit_price')::numeric, v_list)), 0), v_list);
    insert into public.pos_invoice_lines(invoice_id, line_no, product_id, variant_id, size, name, qty, list_price, unit_price,
      line_discount, line_total, eod, note)
    values (v_id, v_no, (v_line->>'product_id')::uuid, nullif(v_line->>'variant_id', '')::uuid, nullif(v_line->>'size', ''),
      coalesce(v_line->>'name', 'Hàng hoá'), v_qty, v_list, v_unit, (v_list - v_unit) * v_qty, v_unit * v_qty,
      coalesce((v_line->>'eod')::boolean, false), nullif(v_line->>'note', ''));
    perform public.pos__ton_cong(v_store, (v_line->>'product_id')::uuid, v_line->>'size', v_line->>'name', -v_qty, 'ban', v_code);
  end loop;

  if v_debt > 0 then
    insert into public.pos_debt_entries(id, customer_id, invoice_id, entry_type, amount, store_location, shift_id, note, created_by, created_by_name)
    values (gen_random_uuid(), v_cust, v_id, 'ban_no', v_debt, v_store, v_ca, v_code, auth.uid(), v_ten);
  end if;
  if v_pts > 0 then
    insert into public.pos_points_entries(customer_id, invoice_id, points, note) values (v_cust, v_id, -v_pts, 'Dùng điểm ' || v_code);
  end if;
  if v_set.points_enabled and v_cust is not null and v_paid > 0 then
    v_earn := floor(v_paid / v_set.points_per_amount)::int;
    if v_earn > 0 then
      insert into public.pos_points_entries(customer_id, invoice_id, points, note) values (v_cust, v_id, v_earn, 'Tích điểm ' || v_code);
      update public.pos_invoices set points_earned = v_earn where id = v_id;
    end if;
  end if;

  if jsonb_array_length(v_canh) > 0 then
    perform public.pos__bao_sep('pos-mat-mang:' || v_id, '⚠️ Hoá đơn bán lúc mất mạng cần kiểm · ' || v_store,
      v_code || ' · ' || v_ten || ' · ' || to_char(v_total, 'FM999G999G999') || 'đ — ' ||
      (select string_agg(case x->>'loai'
          when 'gia_lech' then 'giá "' || (x->>'mon') || '" trên máy ' || to_char((x->>'gia_may')::numeric, 'FM999G999G999') || 'đ, đúng ' || to_char((x->>'gia_dung')::numeric, 'FM999G999G999') || 'đ'
          when 'khac_ca' then 'bán trong ca ' || coalesce(x->>'ca_luc_ban', '?') || ' nhưng ca đã đóng, ghi vào ca ' || coalesce(x->>'ca_ghi_vao', 'chưa mở')
          when 'giam_qua_muc' then 'giảm ' || (x->>'phan_tram') || '% vượt mức ' || (x->>'muc') || '%'
          when 'vuot_han_muc_no' then 'ghi nợ vượt hạn mức'
          when 'diem_khong_du' then 'khách dùng điểm quá số đang có'
          when 'bang_gia_tat' then 'bảng giá đã tắt'
          when 'diem_tat' then 'dùng điểm khi tích điểm đã tắt'
          when 'anh_trung' then 'ảnh trùng hoá đơn ' || coalesce(x->>'hd', '?')
          when 'khong_phai_ca_minh' then 'bán khi ca đang mở là của ' || coalesce(x->>'chu_ca', 'chưa ai') || ' (doanh số cần kiểm)'
          else 'giảm giá cuối ngày sai giờ/mức' end, '; ') from jsonb_array_elements(v_canh) x),
      v_id, 'warning');
  end if;
  if v_line_disc + v_inv_disc > 0 or v_debt > 0 or v_eod > 0 or v_off then
    perform public.pos__ghi_nhat_ky(v_store, 'ban', v_code, jsonb_build_object('giam', v_line_disc + v_inv_disc, 'giam_cuoi_ngay', v_eod,
      'ghi_no', v_debt, 'tong', v_total, 'offline', v_off, 'canh_bao', v_canh,
      'duyet', nullif(p->>'approval_id', '')));
  end if;
  return jsonb_build_object('id', v_id, 'code', v_code, 'total', v_total, 'debt', v_debt, 'change', v_change,
    'points_earned', v_earn, 'canh_bao', v_canh, 'transfer_status', case when v_method = 'chuyen_khoan' and v_paid > 0 then 'cho_xac_nhan' else 'khong' end);
end $$;

-- pos__so_lieu_ca: bản mới nhất lấy từ 202611141010_ban_hang_quay_mat_mang_va_thu_don.sql, chỉ sửa đúng chỗ ghi ở đầu file.
create or replace function public.pos__so_lieu_ca(p_shift uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  with s as (select * from public.pos_shifts where id = p_shift),
  hd as (select * from public.pos_invoices where shift_id = p_shift and status = 'xong'),
  tn as (select * from public.pos_debt_entries where shift_id = p_shift and entry_type = 'thu_no'),
  dn as (select * from public.pos_order_payments where shift_id = p_shift),
  -- Huỷ trong ca này một hoá đơn của ca KHÁC đã thu tiền mặt → tiền trả lại khách đi ra từ két ca này.
  ht as (select i.* from public.pos_invoices i, s where i.status = 'huy' and i.store_location = s.store_location
           and i.shift_id is distinct from p_shift and i.pay_method = 'tien_mat'
           and i.cancelled_at >= s.opened_at and i.cancelled_at < coalesce(s.closed_at, 'infinity'::timestamptz))
  select jsonb_build_object(
    'so_hoa_don', (select count(*) from hd),
    'so_huy', (select count(*) from public.pos_invoices where shift_id = p_shift and status = 'huy'),
    'doanh_thu', (select coalesce(sum(total), 0) from hd),
    'ban', jsonb_build_object(
      'tien_mat', (select coalesce(sum(paid_amount), 0) from hd where pay_method = 'tien_mat'),
      'chuyen_khoan', (select coalesce(sum(paid_amount), 0) from hd where pay_method = 'chuyen_khoan'),
      'the', (select coalesce(sum(paid_amount), 0) from hd where pay_method = 'the'),
      'vi', (select coalesce(sum(paid_amount), 0) from hd where pay_method = 'vi'),
      'ghi_no', (select coalesce(sum(debt_amount), 0) from hd)),
    'thu_no', jsonb_build_object(
      'tien_mat', (select coalesce(-sum(amount), 0) from tn where pay_method = 'tien_mat'),
      'chuyen_khoan', (select coalesce(-sum(amount), 0) from tn where pay_method = 'chuyen_khoan'),
      'the', (select coalesce(-sum(amount), 0) from tn where pay_method = 'the')),
    'don_dat', jsonb_build_object(
      'tien_mat', (select coalesce(sum(amount), 0) from dn where pay_method = 'tien_mat'),
      'chuyen_khoan', (select coalesce(sum(amount), 0) from dn where pay_method = 'chuyen_khoan'),
      'the', (select coalesce(sum(amount), 0) from dn where pay_method = 'the')),
    'ck_chua_xac_nhan', (select count(*) from hd where transfer_status = 'cho_xac_nhan'),
    'tien_dau_ca', (select opening_cash from s),
    'hoan_tien_huy', (select coalesce(sum(paid_amount), 0) from ht),
    'tien_mat_trong_ca',
      (select coalesce(sum(paid_amount), 0) from hd where pay_method = 'tien_mat')
      + (select coalesce(-sum(amount), 0) from tn where pay_method = 'tien_mat')
      + (select coalesce(sum(amount), 0) from dn where pay_method = 'tien_mat')
      - (select coalesce(sum(paid_amount), 0) from ht))
$$;

-- pos_bao_cao: bản mới nhất lấy từ 202611141000_ban_hang_quay_that.sql, chỉ sửa đúng chỗ ghi ở đầu file.
create or replace function public.pos_bao_cao(p_store text, p_from timestamptz, p_to timestamptz)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_cap text := public.pos_cap_do(); v_len interval := p_to - p_from; v jsonb;
begin
  if v_cap not in ('gd', 'ql') then raise exception 'Chỉ Quản lý / Giám đốc xem báo cáo'; end if;
  with hd as (select * from public.pos_invoices where (p_store is null or store_location = p_store)
                and created_at >= p_from and created_at < p_to),
       ok as (select * from hd where status = 'xong'),
       ln as (select l.* from public.pos_invoice_lines l join ok on ok.id = l.invoice_id),
       truoc as (select * from public.pos_invoices where (p_store is null or store_location = p_store) and status = 'xong'
                and created_at >= p_from - v_len and created_at < p_from),
       huy as (select d.* from public.pos_stock_docs d where (p_store is null or d.store_location = p_store)
                and d.doc_type = 'xuat_huy' and d.status = 'xong' and d.done_at >= p_from and d.done_at < p_to),
       huy_dong as (select (x->>'product_id')::uuid as product_id, nullif(x->>'variant_id', '')::uuid as variant_id,
                      x->>'name' as name, coalesce((x->>'qty')::numeric, 0) as qty from huy, jsonb_array_elements(huy.lines) x)
  select jsonb_build_object(
    'so_hd', (select count(*) from ok), 'so_huy', (select count(*) from hd where status = 'huy'),
    'tien_huy_hd', (select coalesce(sum(total), 0) from hd where status = 'huy'),
    'tong_hang', (select coalesce(sum(gross), 0) from ok),
    'giam', (select coalesce(sum(line_discount + invoice_discount), 0) from ok),
    'giam_cuoi_ngay', (select coalesce(sum(eod_discount), 0) from ok),
    'diem', (select coalesce(sum(points_value), 0) from ok),
    'doanh_thu', (select coalesce(sum(total - vat_amount - other_fee), 0) from ok),
    'vat', (select coalesce(sum(vat_amount), 0) from ok), 'thu_khac', (select coalesce(sum(other_fee), 0) from ok),
    'tien_mat', (select coalesce(sum(paid_amount), 0) from ok where pay_method = 'tien_mat'),
    'chuyen_khoan', (select coalesce(sum(paid_amount), 0) from ok where pay_method = 'chuyen_khoan'),
    'ck_cho', (select coalesce(sum(paid_amount), 0) from ok where transfer_status = 'cho_xac_nhan'),
    'ck_khong_thay', (select coalesce(sum(paid_amount), 0) from ok where transfer_status = 'khong_thay'),
    'the', (select coalesce(sum(paid_amount), 0) from ok where pay_method = 'the'),
      'vi', (select coalesce(sum(paid_amount), 0) from ok where pay_method = 'vi'),
    'ghi_no', (select coalesce(sum(debt_amount), 0) from ok),
    'thu_no', (select coalesce(-sum(amount), 0) from public.pos_debt_entries where entry_type = 'thu_no'
                 and (p_store is null or store_location = p_store) and created_at >= p_from and created_at < p_to),
    'thu_don', (select coalesce(sum(amount), 0) from public.pos_order_payments where (p_store is null or store_location = p_store)
                 and created_at >= p_from and created_at < p_to),
    'ky_truoc', jsonb_build_object('so_hd', (select count(*) from truoc), 'doanh_thu', (select coalesce(sum(total - vat_amount - other_fee), 0) from truoc)),
    'theo_gio', (select coalesce(jsonb_agg(g order by g->>'gio'), '[]') from (
        select jsonb_build_object('gio', gio, 'so_hd', count(*), 'tien', sum(total)) g
        from (select to_char(created_at at time zone 'Asia/Ho_Chi_Minh', 'HH24') as gio, total from ok) x group by gio) t),
    'theo_mon', (select coalesce(jsonb_agg(m), '[]') from (
        select jsonb_build_object('product_id', product_id, 'variant_id', variant_id, 'ten', name || coalesce(' ' || size, ''),
          'sl', sum(qty), 'tien', sum(line_total)) m from ln group by product_id, variant_id, name, size order by sum(line_total) desc limit 50) t),
    'theo_nv', (select coalesce(jsonb_agg(n), '[]') from (
        select jsonb_build_object('ten', coalesce(seller_name, cashier_name), 'so_hd', count(*), 'tien', sum(total)) n
        from ok group by coalesce(seller_name, cashier_name) order by sum(total) desc) t),
    'huy_hang', (select coalesce(jsonb_agg(h), '[]') from (
        select jsonb_build_object('ten', name, 'sl', sum(qty)) h from huy_dong group by name order by sum(qty) desc) t),
    'chenh_ca', (select coalesce(jsonb_agg(c), '[]') from (
        select jsonb_build_object('ma', code, 'nguoi', closed_by_name, 'chenh', diff, 'duyet', approved_by_name is not null) c
        from public.pos_shifts where (p_store is null or store_location = p_store) and closed_at >= p_from and closed_at < p_to
          and coalesce(diff, 0) <> 0 order by closed_at) t),
    'gia_von', case when v_cap = 'gd' then (select coalesce(sum(ln.qty * coalesce(c.cost, 0)), 0) from ln
        left join public.pos_product_costs c on c.product_id = ln.product_id and c.variant_id is not distinct from ln.variant_id) end,
    'chua_co_gia_von', case when v_cap = 'gd' then (select count(distinct (ln.product_id, ln.variant_id)) from ln
        left join public.pos_product_costs c on c.product_id = ln.product_id and c.variant_id is not distinct from ln.variant_id
        where c.product_id is null) end,
    'huy_gia_von', case when v_cap = 'gd' then (select coalesce(sum(h.qty * coalesce(c.cost, 0)), 0) from huy_dong h
        left join public.pos_product_costs c on c.product_id = h.product_id and c.variant_id is not distinct from h.variant_id) end
  ) into v;
  return v;
end $$;

-- pos_luu_phieu: bản mới nhất lấy từ 202611141000_ban_hang_quay_that.sql, chỉ sửa đúng chỗ ghi ở đầu file.
create or replace function public.pos_luu_phieu(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_cap text := public.pos_cap_do(); v_id uuid := (p->>'id')::uuid; v_d public.pos_stock_docs;
  v_type text := p->>'type'; v_store text := p->>'store'; v_status text := coalesce(p->>'status', 'xong');
  v_lines jsonb := '[]'; v_l jsonb; v_ton numeric; v_delta numeric; v_qty numeric;
begin
  if v_cap is null then raise exception 'Tài khoản chưa được duyệt'; end if;
  if v_type not in ('bep_giao', 'xuat_huy', 'kiem_kho', 'noi_bo') then raise exception 'Loại phiếu không hợp lệ'; end if;
  if v_type = 'bep_giao' then v_status := 'cho_nhan'; end if;
  if v_status not in ('tam', 'xong', 'cho_nhan') then raise exception 'Trạng thái phiếu không hợp lệ'; end if;
  select * into v_d from public.pos_stock_docs where id = v_id for update;
  if v_d.id is not null and v_d.status <> 'tam' then return to_jsonb(v_d); end if;   -- đã chốt (gửi lại khi mất mạng)
  if jsonb_array_length(coalesce(p->'lines', '[]')) = 0 then raise exception 'Phiếu chưa có hàng'; end if;
  if v_status = 'xong' and v_type = 'xuat_huy' then
    if coalesce(trim(p->>'reason'), '') = '' then raise exception 'Ghi lý do huỷ (VD: hết date)'; end if;
    if coalesce(p->>'photo_url', '') = '' then raise exception 'Chụp ảnh bánh huỷ trước khi hoàn thành'; end if;
  end if;

  for v_l in select value from jsonb_array_elements(p->'lines') loop
    v_qty := coalesce((v_l->>'qty')::numeric, 0);
    if v_qty < 0 or (v_type <> 'kiem_kho' and v_qty = 0) then raise exception 'Số lượng "%" không hợp lệ', v_l->>'name'; end if;
    v_lines := v_lines || jsonb_build_array(v_l);
  end loop;

  if v_d.id is null then
    insert into public.pos_stock_docs(id, code, doc_type, store_location, status, lines, reason, note, photo_url, shift_id, created_by, created_by_name)
    values (v_id, case v_type when 'bep_giao' then 'PN' when 'xuat_huy' then 'XH' when 'kiem_kho' then 'KK' else 'XNB' end
        || lpad(nextval('public.pos_doc_seq')::text, 6, '0'),
      v_type, v_store, 'tam', v_lines, nullif(trim(p->>'reason'), ''), nullif(p->>'note', ''), nullif(p->>'photo_url', ''),
      public.pos__ca_mo(v_store), auth.uid(), public.pos_ten_toi())
    returning * into v_d;
  else
    update public.pos_stock_docs set lines = v_lines, reason = nullif(trim(p->>'reason'), ''), note = nullif(p->>'note', ''),
      photo_url = nullif(p->>'photo_url', '') where id = v_id returning * into v_d;
  end if;
  if v_status = 'tam' then return to_jsonb(v_d); end if;
  if v_status = 'cho_nhan' then
    update public.pos_stock_docs set status = 'cho_nhan' where id = v_id returning * into v_d;
    perform public.pos__ghi_nhat_ky(v_store, 'bep_giao', v_d.code, jsonb_build_object('so_dong', jsonb_array_length(v_lines)));
    return to_jsonb(v_d);
  end if;

  -- Chốt phiếu: tác động tồn cửa hàng.
  v_lines := '[]';
  for v_l in select value from jsonb_array_elements(v_d.lines) loop
    v_qty := coalesce((v_l->>'qty')::numeric, 0);
    if v_type = 'kiem_kho' then
      v_ton := public.pos__ton(v_store, (v_l->>'product_id')::uuid, v_l->>'size');
      v_delta := v_qty - v_ton;
    else
      v_ton := null; v_delta := -v_qty;
    end if;
    if v_delta <> 0 then
      perform public.pos__ton_cong(v_store, (v_l->>'product_id')::uuid, v_l->>'size', v_l->>'name', v_delta, v_type, v_d.code);
    end if;
    v_lines := v_lines || jsonb_build_array(v_l || jsonb_build_object('system_qty', v_ton, 'delta', v_delta));
  end loop;
  update public.pos_stock_docs set status = 'xong', lines = v_lines, done_by = auth.uid(), done_by_name = public.pos_ten_toi(), done_at = now()
  where id = v_id returning * into v_d;
  perform public.pos__ghi_nhat_ky(v_store, v_type, v_d.code, jsonb_build_object('ly_do', v_d.reason, 'dong', v_lines));
  return to_jsonb(v_d);
end $$;

insert into public.migration_runs(migration_key, status, finished_at, notes)
values ('202611161010_ban_hang_quay_vi_va_ma_pn', 'completed', now(),
  'Bán tại quầy giống KiotViet: thêm thanh toán Ví (pay_method vi) + phiếu nhập hàng mã PN thay BG.')
on conflict (migration_key) do update set status = 'completed', finished_at = now(), notes = excluded.notes;

commit;
