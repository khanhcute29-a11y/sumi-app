-- Bán tại quầy: TRẢ TIỀN KẾT HỢP như KiotViet — 1 hoá đơn trả nhiều cách (VD 100k tiền mặt + 150k chuyển khoản).
--  • pos_invoices: thêm cột pay_parts (null = hoá đơn 1 cách như cũ), pay_method thêm giá trị 'ket_hop'.
--  • Tiền thừa chỉ thối từ phần tiền mặt; phần tiền mặt lưu = số thật vào két (đã trừ tiền thối).
--  • Két ca / báo cáo / báo cáo cuối ngày / xác nhận chuyển khoản tính đúng từng phần.
-- Chỉ thêm cột + thay hàm (giữ nguyên chữ ký). Hoá đơn cũ không đổi. Code cũ vẫn chạy với SQL này.
begin;
set local lock_timeout = '10s';

alter table public.pos_invoices add column if not exists pay_parts jsonb;
do $$
declare r record;
begin
  for r in select conname from pg_constraint where conrelid = 'public.pos_invoices'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) like '%pay_method%' loop
    execute format('alter table public.pos_invoices drop constraint %I', r.conname);
  end loop;
end $$;
alter table public.pos_invoices add constraint pos_invoices_pay_method_check
  check (pay_method in ('tien_mat', 'chuyen_khoan', 'the', 'vi', 'ket_hop'));

-- Các phần tiền của 1 hoá đơn: hoá đơn thường = 1 dòng (cách trả, số đã trả); kết hợp = mỗi cách 1 dòng.
create or replace function public.pos__cac_pt(p_method text, p_paid numeric, p_parts jsonb)
returns table(pt text, tien numeric) language sql immutable set search_path = public as $$
  select p_method, coalesce(p_paid, 0) where p_parts is null
  union all
  select key, (value #>> '{}')::numeric from jsonb_each(p_parts) where p_parts is not null
$$;
create or replace function public.pos__tt(p_method text, p_paid numeric, p_parts jsonb, p_pt text)
returns numeric language sql immutable set search_path = public as $$
  select coalesce(sum(tien), 0) from public.pos__cac_pt(p_method, p_paid, p_parts) where pt = p_pt
$$;

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
  v_parts jsonb; v_k text; v_n int;
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
  -- Trả tiền KẾT HỢP (như KiotViet): pay_parts = {"tien_mat":…, "chuyen_khoan":…, "the":…, "vi":…}.
  -- 1 cách có tiền → ghi như hoá đơn thường; từ 2 cách → pay_method 'ket_hop' + lưu từng phần.
  if jsonb_typeof(p->'pay_parts') = 'object' then
    if exists (select 1 from jsonb_object_keys(p->'pay_parts') k where k not in ('tien_mat', 'chuyen_khoan', 'the', 'vi')) then
      raise exception 'Phương thức thanh toán không hợp lệ'; end if;
    select jsonb_object_agg(key, t) into v_parts from (
      select key, round((value #>> '{}')::numeric) t from jsonb_each(p->'pay_parts')) x where t > 0;
    v_n := coalesce((select count(*) from jsonb_object_keys(coalesce(v_parts, '{}'::jsonb))), 0);
    if v_n = 0 then
      p := p || jsonb_build_object('pay_method', 'tien_mat', 'received', 0); v_parts := null;
    elsif v_n = 1 then
      select key into v_k from jsonb_each(v_parts);
      p := p || jsonb_build_object('pay_method', v_k, 'received', (v_parts->>v_k)::numeric); v_parts := null;
    else
      p := p || jsonb_build_object('pay_method', 'ket_hop', 'received', (select sum((value #>> '{}')::numeric) from jsonb_each(v_parts)));
    end if;
  end if;
  v_method := coalesce(p->>'pay_method', 'tien_mat');
  if v_method not in ('tien_mat', 'chuyen_khoan', 'the', 'vi') and not (v_method = 'ket_hop' and v_parts is not null) then
    raise exception 'Phương thức thanh toán không hợp lệ'; end if;
  v_recv := greatest(round(coalesce((p->>'received')::numeric, v_total)), 0);
  if v_recv >= v_total then
    v_paid := v_total;
    v_change := case when v_method in ('tien_mat', 'ket_hop') then v_recv - v_total else 0 end;
    if v_parts is not null and v_change > 0 then
      -- Tiền thừa chỉ thối được từ phần tiền mặt.
      if v_change > coalesce((v_parts->>'tien_mat')::numeric, 0) then
        raise exception 'Chỉ tiền mặt mới thối lại được — số chuyển khoản / thẻ / ví đang nhiều hơn tiền khách cần trả'; end if;
      v_parts := case when (v_parts->>'tien_mat')::numeric - v_change > 0
        then jsonb_set(v_parts, '{tien_mat}', to_jsonb((v_parts->>'tien_mat')::numeric - v_change)) else v_parts - 'tien_mat' end;
    end if;
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
    points_used, points_value, total, pay_method, pay_parts, paid_amount, received_amount, change_amount, debt_amount,
    transfer_status, note, offline, client_created_at, created_at, canh_bao, photo_url, photo_hash)
  values (v_id, v_code, v_store, v_ca, auth.uid(), v_ten, coalesce(nullif(p->>'seller_name', ''), v_ten),
    v_cust, coalesce(v_cust_row.name, 'Khách lẻ'), v_cust_row.phone, v_pl, v_pl_name,
    v_gross, v_line_disc, v_eod, v_inv_disc, v_sub, v_vat, v_fee, coalesce(p->'other_fees', '[]'),
    v_pts, v_pts_val, v_total, v_method, v_parts, v_paid, v_recv, v_change, v_debt,
    case when (v_method = 'chuyen_khoan' or coalesce(v_parts ? 'chuyen_khoan', false)) and v_paid > 0 then 'cho_xac_nhan' else 'khong' end,
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
    'points_earned', v_earn, 'pay_parts', v_parts, 'canh_bao', v_canh, 'transfer_status', case when (v_method = 'chuyen_khoan' or coalesce(v_parts ? 'chuyen_khoan', false)) and v_paid > 0 then 'cho_xac_nhan' else 'khong' end);
end $$;

create or replace function public.pos__so_lieu_ca(p_shift uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  with s as (select * from public.pos_shifts where id = p_shift),
  hd as (select * from public.pos_invoices where shift_id = p_shift and status = 'xong'),
  tn as (select * from public.pos_debt_entries where shift_id = p_shift and entry_type = 'thu_no'),
  dn as (select * from public.pos_order_payments where shift_id = p_shift),
  pc as (select * from public.pos_cash_outs where shift_id = p_shift and status = 'xong'),
  -- Huỷ trong ca này một hoá đơn của ca KHÁC đã thu tiền mặt → tiền trả lại khách đi ra từ két ca này.
  ht as (select i.* from public.pos_invoices i, s where i.status = 'huy' and i.store_location = s.store_location
           and i.shift_id is distinct from p_shift and public.pos__tt(i.pay_method, i.paid_amount, i.pay_parts, 'tien_mat') > 0
           and i.cancelled_at >= s.opened_at and i.cancelled_at < coalesce(s.closed_at, 'infinity'::timestamptz))
  select jsonb_build_object(
    'so_hoa_don', (select count(*) from hd),
    'so_huy', (select count(*) from public.pos_invoices where shift_id = p_shift and status = 'huy'),
    'doanh_thu', (select coalesce(sum(total), 0) from hd),
    'ban', jsonb_build_object(
      'tien_mat', (select coalesce(sum(public.pos__tt(pay_method, paid_amount, pay_parts, 'tien_mat')), 0) from hd),
      'chuyen_khoan', (select coalesce(sum(public.pos__tt(pay_method, paid_amount, pay_parts, 'chuyen_khoan')), 0) from hd),
      'the', (select coalesce(sum(public.pos__tt(pay_method, paid_amount, pay_parts, 'the')), 0) from hd),
      'vi', (select coalesce(sum(public.pos__tt(pay_method, paid_amount, pay_parts, 'vi')), 0) from hd),
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
    'hoan_tien_huy', (select coalesce(sum(public.pos__tt(pay_method, paid_amount, pay_parts, 'tien_mat')), 0) from ht),
    'chi_ket', (select coalesce(sum(amount), 0) from pc),
    'so_phieu_chi', (select count(*) from pc),
    'phieu_chi', coalesce((select jsonb_agg(jsonb_build_object('code', code, 'so_tien', amount, 'ly_do', reason, 'truoc_ca', truoc_ca,
      'nguoi', created_by_name, 'luc', created_at) order by created_at) from pc), '[]'::jsonb),
    'tien_mat_trong_ca',
      (select coalesce(sum(public.pos__tt(pay_method, paid_amount, pay_parts, 'tien_mat')), 0) from hd)
      + (select coalesce(-sum(amount), 0) from tn where pay_method = 'tien_mat')
      + (select coalesce(sum(amount), 0) from dn where pay_method = 'tien_mat')
      - (select coalesce(sum(public.pos__tt(pay_method, paid_amount, pay_parts, 'tien_mat')), 0) from ht)
      - (select coalesce(sum(amount), 0) from pc))
$$;

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
    'tien_mat', (select coalesce(sum(public.pos__tt(pay_method, paid_amount, pay_parts, 'tien_mat')), 0) from ok),
    'chuyen_khoan', (select coalesce(sum(public.pos__tt(pay_method, paid_amount, pay_parts, 'chuyen_khoan')), 0) from ok),
    'ck_cho', (select coalesce(sum(public.pos__tt(pay_method, paid_amount, pay_parts, 'chuyen_khoan')), 0) from ok where transfer_status = 'cho_xac_nhan'),
    'ck_khong_thay', (select coalesce(sum(public.pos__tt(pay_method, paid_amount, pay_parts, 'chuyen_khoan')), 0) from ok where transfer_status = 'khong_thay'),
    'the', (select coalesce(sum(public.pos__tt(pay_method, paid_amount, pay_parts, 'the')), 0) from ok),
      'vi', (select coalesce(sum(public.pos__tt(pay_method, paid_amount, pay_parts, 'vi')), 0) from ok),
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
    -- danh sách để chọn trong Bộ lọc (chỉ Quản lý / Giám đốc): MỌI tài khoản được bán hàng thật
    -- (cờ pos_ban_hang_that) + ai từng bán ở cửa hàng này — không chỉ người đã có hoá đơn trong kỳ.
    'ds_nhan_vien', case when v_cap = 'nv' then '[]'::jsonb else (select coalesce(jsonb_agg(n order by n), '[]') from (
        select distinct n from (
          select coalesce(seller_name, cashier_name) n from public.pos_invoices
            where (p_store is null or store_location = p_store)
          union all
          select p.full_name from public.profiles p
            where p.id = any(coalesce((select allowed_profile_ids from public.feature_flags where key = 'pos_ban_hang_that'), '{}'))
              and coalesce(p.approved, false) and p.active is not false
        ) x where nullif(trim(n), '') is not null) t) end,
    'ds_nguoi_tao', case when v_cap = 'nv' then '[]'::jsonb else (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'ten', ten) order by ten), '[]') from (
        select distinct on (id) id, ten from (
          select cashier_id as id, cashier_name as ten, 1 as uu from public.pos_invoices
            where (p_store is null or store_location = p_store) and cashier_id is not null
          union all
          select p.id, p.full_name, 0 from public.profiles p
            where p.id = any(coalesce((select allowed_profile_ids from public.feature_flags where key = 'pos_ban_hang_that'), '{}'))
              and coalesce(p.approved, false) and p.active is not false
        ) x where nullif(trim(ten), '') is not null order by id, uu) t) end,
    'chi_cua_toi', v_cap = 'nv'
  ) into v;
  return v;
end $$;

create or replace function public.pos_xac_nhan_ck(p_id uuid, p_da_ve boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_h public.pos_invoices; v_ck numeric;
begin
  if not (public.pos_cap_do() in ('gd', 'ql') or public.pos_la_ke_toan()) then
    raise exception 'Chỉ Quản lý / Giám đốc / Kế toán xác nhận tiền về'; end if;
  update public.pos_invoices set transfer_status = case when p_da_ve then 'da_ve' else 'khong_thay' end,
    transfer_checked_by_name = public.pos_ten_toi(), transfer_checked_at = now()
  where id = p_id and public.pos__tt(pay_method, paid_amount, pay_parts, 'chuyen_khoan') > 0 returning * into v_h;
  if v_h.id is null then raise exception 'Không phải hoá đơn chuyển khoản'; end if;
  v_ck := public.pos__tt(v_h.pay_method, v_h.paid_amount, v_h.pay_parts, 'chuyen_khoan');
  perform public.pos__ghi_nhat_ky(v_h.store_location, case when p_da_ve then 'ck_da_ve' else 'ck_khong_thay' end, v_h.code,
    jsonb_build_object('tien', v_ck, 'thu_ngan', v_h.cashier_name));
  if not p_da_ve then
    perform public.pos__bao_sep('pos-ck-khong-thay:' || v_h.id, '🚨 Không thấy tiền chuyển khoản ' || v_h.code,
      to_char(v_ck, 'FM999G999G999') || 'đ, thu ngân ' || coalesce(v_h.cashier_name, '') || ', ' || v_h.store_location || '.', v_h.id, 'urgent');
  end if;
  return to_jsonb(v_h);
end $$;

revoke all on function public.pos_ban(jsonb) from public, anon;
grant execute on function public.pos_ban(jsonb) to authenticated;
revoke all on function public.pos_bao_cao(text, timestamptz, timestamptz) from public, anon;
grant execute on function public.pos_bao_cao(text, timestamptz, timestamptz) to authenticated;
revoke all on function public.pos_bao_cao_cuoi_ngay(text, timestamptz, timestamptz, jsonb) from public, anon;
grant execute on function public.pos_bao_cao_cuoi_ngay(text, timestamptz, timestamptz, jsonb) to authenticated;
revoke all on function public.pos_xac_nhan_ck(uuid, boolean) from public, anon;
grant execute on function public.pos_xac_nhan_ck(uuid, boolean) to authenticated;

insert into public.migration_runs(migration_key, status, finished_at, notes)
values ('202611221010_ban_hang_quay_tra_tien_ket_hop', 'completed', now(),
  'Bán tại quầy: trả tiền kết hợp nhiều cách trong 1 hoá đơn (pay_parts), két ca + báo cáo + xác nhận CK tính theo từng phần.')
on conflict (migration_key) do update set status = 'completed', finished_at = now(), notes = excluded.notes;

commit;
