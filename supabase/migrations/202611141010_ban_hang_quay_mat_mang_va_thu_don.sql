-- BÁN TẠI QUẦY — vá sau khi soát toàn bộ luồng (14/11/2026). Chỉ THÊM cột + THAY 2 hàm, không xoá gì.
--
-- 1. pos_ban: hoá đơn bán lúc MẤT MẠNG không bao giờ bị từ chối vì giá / giờ giảm cuối ngày / hạn mức /
--    điểm / bảng giá đã đổi trong lúc chờ gửi — tiền đã thu, bánh đã giao nên vẫn ghi, gắn cờ `canh_bao`
--    và báo Giám đốc ngay. Giờ bán = giờ trên máy lúc bán (chặn tương lai, chặn cũ quá 3 ngày) để báo cáo
--    đúng ngày. Có kèm ca lúc bán (shift_id) → nếu ca đó đã đóng thì cũng gắn cờ.
--    Bán khi CÓ mạng: giữ nguyên mọi chặn như cũ.
-- 2. pos_thu_don: chặn thu trùng / thu quá (khoá dòng đơn): cọc ≤ tiền cọc trên đơn, thu nốt ≤ còn phải thu.
-- 3. pos__so_lieu_ca: ca đang mở không có mốc cuối (trước dùng now() → huỷ cùng lúc đọc có thể bị sót).
--
-- Chạy thử trước: thay "commit;" cuối file bằng "rollback;" rồi chạy, không lỗi mới chạy thật.

begin;
set local lock_timeout = '10s';
set local statement_timeout = '120s';

alter table public.pos_invoices add column if not exists canh_bao jsonb;
comment on column public.pos_invoices.canh_bao is 'Bán lúc mất mạng: những điểm lệch so với database lúc gửi lại (giá, giờ, hạn mức…). Null = không lệch.';

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
begin
  if v_cap is null then raise exception 'Tài khoản chưa được duyệt'; end if;
  if v_id is null then raise exception 'Thiếu mã hoá đơn'; end if;
  select * into v_old from public.pos_invoices where id = v_id;
  if v_old.id is not null then return jsonb_build_object('id', v_old.id, 'code', v_old.code, 'trung', true); end if;
  select * into v_set from public.pos_settings where store_location = v_store;
  if v_set.store_location is null then raise exception 'Chi nhánh không hợp lệ'; end if;
  if jsonb_array_length(coalesce(p->'lines', '[]')) = 0 then raise exception 'Hoá đơn chưa có hàng'; end if;
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
  if v_method not in ('tien_mat', 'chuyen_khoan', 'the') then raise exception 'Phương thức thanh toán không hợp lệ'; end if;
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
    transfer_status, note, offline, client_created_at, created_at, canh_bao)
  values (v_id, v_code, v_store, v_ca, auth.uid(), v_ten, coalesce(nullif(p->>'seller_name', ''), v_ten),
    v_cust, coalesce(v_cust_row.name, 'Khách lẻ'), v_cust_row.phone, v_pl, v_pl_name,
    v_gross, v_line_disc, v_eod, v_inv_disc, v_sub, v_vat, v_fee, coalesce(p->'other_fees', '[]'),
    v_pts, v_pts_val, v_total, v_method, v_paid, v_recv, v_change, v_debt,
    case when v_method = 'chuyen_khoan' and v_paid > 0 then 'cho_xac_nhan' else 'khong' end,
    nullif(p->>'note', ''), v_off, nullif(p->>'client_created_at', '')::timestamptz, v_luc, case when jsonb_array_length(v_canh) > 0 then v_canh end);

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

create or replace function public.pos_thu_don(p_id uuid, p_order uuid, p_kind text, p_amount numeric, p_method text, p_store text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_o public.orders; v_da numeric; v_con numeric;
begin
  if public.pos_cap_do() is null then raise exception 'Tài khoản chưa được duyệt'; end if;
  if exists (select 1 from public.pos_order_payments where id = p_id) then return jsonb_build_object('id', p_id, 'trung', true); end if;
  -- Khoá đơn để 2 máy không cùng thu một khoản (bấm 2 lần / 2 quầy cùng mở đơn).
  select * into v_o from public.orders where id = p_order for update;
  if v_o.id is null then raise exception 'Không tìm thấy đơn đặt'; end if;
  if coalesce(p_amount, 0) <= 0 then raise exception 'Nhập số tiền thu'; end if;
  if p_kind = 'coc' then
    select coalesce(sum(amount), 0) into v_da from public.pos_order_payments where order_id = p_order and kind = 'coc';
    v_con := coalesce(v_o.deposit, 0) - v_da;
    if p_amount > v_con then raise exception 'Đơn % chỉ còn %đ tiền cọc chưa ghi thu', v_o.order_code, to_char(greatest(v_con, 0), 'FM999G999G999'); end if;
  elsif p_kind = 'thu_con_lai' then
    select coalesce(sum(amount), 0) into v_da from public.pos_order_payments where order_id = p_order and kind = 'thu_con_lai';
    v_con := coalesce(v_o.total, 0) - coalesce(v_o.deposit, 0) - v_da;
    if v_con <= 0 then raise exception 'Đơn % đã thu đủ tiền rồi — không thu thêm', v_o.order_code; end if;
    if p_amount > v_con then raise exception 'Đơn % chỉ còn phải thu %đ', v_o.order_code, to_char(v_con, 'FM999G999G999'); end if;
  else
    raise exception 'Loại thu không hợp lệ';
  end if;
  insert into public.pos_order_payments(id, order_id, order_code, kind, amount, pay_method, store_location, shift_id, created_by, created_by_name)
  values (p_id, p_order, v_o.order_code, p_kind, p_amount, p_method, p_store, public.pos__ca_mo(p_store), auth.uid(), public.pos_ten_toi());
  perform public.pos__ghi_nhat_ky(p_store, 'thu_don_' || p_kind, v_o.order_code, jsonb_build_object('tien', p_amount, 'pt', p_method));
  return jsonb_build_object('id', p_id, 'order_code', v_o.order_code);
end $$;

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
revoke all on function public.pos__so_lieu_ca(uuid) from public, anon, authenticated;

revoke all on function public.pos_ban(jsonb) from public, anon;
grant execute on function public.pos_ban(jsonb) to authenticated;
revoke all on function public.pos_thu_don(uuid,uuid,text,numeric,text,text) from public, anon;
grant execute on function public.pos_thu_don(uuid,uuid,text,numeric,text,text) to authenticated;

insert into public.migration_runs(migration_key, status, finished_at, notes)
values ('202611141010_ban_hang_quay_mat_mang_va_thu_don', 'completed', now(),
  'pos_ban: hoá đơn bán lúc mất mạng luôn được ghi (gắn cờ canh_bao + báo Giám đốc), giờ bán theo máy; pos_thu_don: chặn thu trùng/thu quá.')
on conflict (migration_key) do update set status = 'completed', finished_at = now(), notes = excluded.notes;

commit;
