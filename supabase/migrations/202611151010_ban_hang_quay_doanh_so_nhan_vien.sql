-- BÁN TẠI QUẦY — doanh số theo NHÂN VIÊN + chốt chặn chống bán ảo (Giám đốc duyệt 15/11/2026).
-- Chỉ THÊM cột/bảng + THAY hàm pos_*; không xoá gì. Phần hoa hồng Giám đốc tự tính từ số liệu này.
--
-- 1. Vào ca (pos_vao_ca): tài khoản riêng, đếm két + ẢNH KÉT; (tuỳ chọn) phải đang chấm công ở đúng cửa hàng.
--    Ca của người khác đang mở → người đó phải kết ca trước. pos_mo_ca cũ ngừng dùng.
-- 2. Bán (pos_ban): mỗi hoá đơn bắt 1 ẢNH (bánh / tiền mặt / màn hình chuyển khoản — chọn từ thư viện được),
--    không dùng lại ảnh của hoá đơn khác; nhân viên chỉ bán trong ca CỦA MÌNH. Mất mạng: vẫn ghi + gắn cờ.
-- 3. Kết ca (pos_ket_ca): đếm két + ẢNH KÉT + đếm nhanh bánh trên kệ (lệch → báo Giám đốc). pos_dong_ca cũ ngừng dùng.
-- 4. Bánh đặt nhận tại quầy (pos_ghi_don_quay): ghi ai nhận đặt → tính toàn bộ giá trị đơn khi đơn Hoàn thành.
-- 5. Doanh số tính = tiền thực thu (không VAT/thu khác): chuyển khoản chỉ khi tiền đã về, ghi nợ chỉ phần khách
--    đã trả (trả nợ trừ món cũ trước), bỏ hoá đơn huỷ, khách trùng SĐT nhân viên, hoá đơn Giám đốc "Loại".
--    Tính theo NGÀY BÁN (hoá đơn) / ngày HOÀN THÀNH (bánh đặt).
-- 6. pos_doanh_so_nv: từng ca · từng người · khoảng ngày (tuần/tháng) cho GĐ/QL/Kế toán.
--    pos_xep_hang_thang: nhân viên thấy hạng + tên, KHÔNG thấy tiền người khác.
--
-- Chạy thử trước: thay "commit;" cuối file bằng "rollback;" rồi chạy, không lỗi mới chạy thật.

begin;
set local lock_timeout = '10s';
set local statement_timeout = '120s';

alter table public.pos_settings add column if not exists bat_cham_cong boolean not null default false;
comment on column public.pos_settings.bat_cham_cong is 'Bật: nhân viên phải đang chấm công (shift_logs) hôm nay mới vào ca bán được.';

alter table public.pos_shifts add column if not exists opening_photo text;
alter table public.pos_shifts add column if not exists closing_photo text;
alter table public.pos_shifts add column if not exists stock_check jsonb;

alter table public.pos_invoices add column if not exists photo_url text;
alter table public.pos_invoices add column if not exists photo_hash text;
alter table public.pos_invoices add column if not exists ds_loai boolean not null default false;
alter table public.pos_invoices add column if not exists ds_loai_ly_do text;
alter table public.pos_invoices add column if not exists ds_loai_boi text;
alter table public.pos_invoices add column if not exists ds_loai_luc timestamptz;
create unique index if not exists pos_invoices_anh_1_lan on public.pos_invoices(photo_hash) where photo_hash is not null and status = 'xong';
create index if not exists pos_invoices_thu_ngan on public.pos_invoices(cashier_id, created_at);

create table if not exists public.pos_counter_orders (
  order_id uuid primary key references public.orders(id) on delete cascade,
  store_location text not null,
  shift_id uuid references public.pos_shifts(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  created_by_name text,
  created_at timestamptz not null default now()
);
alter table public.pos_counter_orders enable row level security;
revoke all on public.pos_counter_orders from anon, authenticated;
grant select on public.pos_counter_orders to authenticated;
drop policy if exists pos_counter_orders_doc on public.pos_counter_orders;
create policy pos_counter_orders_doc on public.pos_counter_orders for select to authenticated using (public.pos_cap_do() is not null);

-- SĐT về dạng 0xxxxxxxxx để so khách với nhân viên.
create or replace function public.pos__sdt(p text)
returns text language sql immutable as $$
  select case when d ~ '^84[0-9]{9}$' then '0' || substr(d, 3) else d end
  from (select regexp_replace(coalesce(p, ''), '[^0-9]', '', 'g') as d) x
$$;

-- ───────── Vào ca ─────────
create or replace function public.pos_vao_ca(p_store text, p_opening_cash numeric, p_photo_url text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_cap text := public.pos_cap_do(); v_set public.pos_settings; v_row public.pos_shifts;
  v_loai text; v_nhanh text;
begin
  if v_cap is null then raise exception 'Tài khoản chưa được duyệt'; end if;
  select * into v_set from public.pos_settings where store_location = p_store;
  if v_set.store_location is null then raise exception 'Chi nhánh không hợp lệ'; end if;
  if p_opening_cash is null or p_opening_cash < 0 then raise exception 'Nhập số tiền mặt đang có trong két'; end if;
  perform pg_advisory_xact_lock(hashtext('pos_ca:' || p_store));
  select * into v_row from public.pos_shifts where store_location = p_store and status = 'open';
  if v_row.id is not null then
    if v_row.opened_by = auth.uid() then return to_jsonb(v_row); end if;   -- bấm lại / máy khác của chính mình
    raise exception 'Ca của % đang mở — % phải kết ca (đếm két) trước rồi bạn mới vào ca', coalesce(v_row.opened_by_name, 'người khác'), coalesce(v_row.opened_by_name, 'người đó');
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
  insert into public.pos_shifts(code, store_location, opened_by, opened_by_name, opening_cash, opening_photo)
  values ('PGC' || lpad(nextval('public.pos_shift_seq')::text, 6, '0'), p_store, auth.uid(), public.pos_ten_toi(),
    round(p_opening_cash), trim(p_photo_url))
  returning * into v_row;
  perform public.pos__ghi_nhat_ky(p_store, 'mo_ca', v_row.code, jsonb_build_object('tien_dau_ca', v_row.opening_cash));
  return to_jsonb(v_row);
end $$;

-- Hàm cũ: ngừng dùng (không có ảnh két / không kiểm chủ ca).
create or replace function public.pos_mo_ca(p_store text, p_opening_cash numeric default 0)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  raise exception 'Màn bán hàng đã có bản mới — tải lại trang rồi bấm "Vào ca" (cần ảnh két)';
end $$;
create or replace function public.pos_dong_ca(p_shift uuid, p_counted numeric, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  raise exception 'Màn bán hàng đã có bản mới — tải lại trang rồi bấm "Kết ca" (cần ảnh két + đếm bánh)';
end $$;

-- ───────── Bán ─────────
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
-- ───────── Doanh số từng hoá đơn (nội bộ) ─────────
-- tinh = phần được tính doanh số (đã 0 nếu bị Loại / khách là nhân viên); tinh_goc = trước khi loại.
create or replace function public.pos__ds_hd(p_from timestamptz, p_to timestamptz)
returns table(invoice_id uuid, code text, shift_id uuid, cashier_id uuid, cashier_name text, store_location text,
  created_at timestamptz, pay_method text, total numeric, gia_tri numeric, tinh numeric, tinh_goc numeric, ck_cho numeric,
  no_chua_tra numeric, loai boolean, mua_nv boolean, offline boolean, canh_bao jsonb, photo_url text, customer_name text, ly_do_loai text)
language sql stable security definer set search_path = public as $$
  with sdt_nv as (
    select distinct public.pos__sdt(phone) as s from public.profiles where coalesce(phone, '') <> '' and active is not false
  ),
  tra as (select customer_id, -sum(amount) as da_tra from public.pos_debt_entries where entry_type = 'thu_no' group by customer_id),
  no_hd as (   -- trả nợ trừ món nợ cũ nhất trước (FIFO)
    select d.invoice_id,
      greatest(least(coalesce(t.da_tra, 0)
        - (sum(d.amount) over (partition by d.customer_id order by d.created_at, d.id) - d.amount), d.amount), 0) as da_tra
    from public.pos_debt_entries d
    join public.pos_invoices i on i.id = d.invoice_id and i.status = 'xong'
    left join tra t on t.customer_id = d.customer_id
    where d.entry_type = 'ban_no'
  ),
  x as (
    select i.*, coalesce(n.da_tra, 0) as no_da_tra,
      case when i.total > 0 then greatest(i.total - i.vat_amount - i.other_fee, 0) / i.total else 0 end as ty_le,
      case when i.pay_method = 'chuyen_khoan' and i.transfer_status <> 'da_ve' then 0 else i.paid_amount end as thu_ngay,
      (coalesce(i.customer_phone, '') <> '' and public.pos__sdt(i.customer_phone) in (select s from sdt_nv)) as la_nv
    from public.pos_invoices i
    left join no_hd n on n.invoice_id = i.id
    where i.status = 'xong' and i.created_at >= p_from and i.created_at < p_to
  )
  select x.id, x.code, x.shift_id, x.cashier_id, x.cashier_name, x.store_location, x.created_at, x.pay_method, x.total,
    round(x.total * x.ty_le),
    case when x.ds_loai or x.la_nv then 0 else round((x.thu_ngay + x.no_da_tra) * x.ty_le) end,
    round((x.thu_ngay + x.no_da_tra) * x.ty_le),
    case when x.ds_loai or x.la_nv then 0 when x.pay_method = 'chuyen_khoan' and x.transfer_status = 'cho_xac_nhan' then round(x.paid_amount * x.ty_le) else 0 end,
    case when x.ds_loai or x.la_nv then 0 else round(greatest(x.debt_amount - x.no_da_tra, 0) * x.ty_le) end,
    x.ds_loai, x.la_nv, x.offline, x.canh_bao, x.photo_url, x.customer_name, x.ds_loai_ly_do
  from x
$$;

-- ───────── Kết ca ─────────
-- p_stock: [{product_id, size, name, dem}] — số bánh đếm được trên kệ.
create or replace function public.pos_ket_ca(p_shift uuid, p_counted numeric, p_note text, p_photo_url text, p_stock jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_cap text := public.pos_cap_do(); v_s public.pos_shifts; v_sl jsonb; v_expected numeric; v_diff numeric;
  v_l jsonb; v_kiem jsonb := '[]'; v_ht numeric; v_dem numeric; v_lech_txt text := ''; v_so_lech int := 0;
  v_ds numeric; v_ck numeric; v_no numeric; f text := 'FM999G999G999';
begin
  if v_cap is null then raise exception 'Tài khoản chưa được duyệt'; end if;
  select * into v_s from public.pos_shifts where id = p_shift for update;
  if v_s.id is null then raise exception 'Không tìm thấy ca'; end if;
  if v_s.status <> 'open' then raise exception 'Ca này đã đóng rồi'; end if;
  if v_cap = 'nv' and v_s.opened_by is distinct from auth.uid() then
    raise exception 'Ca này của % — chỉ người đó hoặc Quản lý / Giám đốc kết ca được', coalesce(v_s.opened_by_name, 'người khác');
  end if;
  if p_counted is null or p_counted < 0 then raise exception 'Nhập số tiền mặt đếm được trong két'; end if;
  if coalesce(trim(p_photo_url), '') = '' then raise exception 'Chụp ảnh két tiền trước khi kết ca'; end if;
  if jsonb_typeof(coalesce(p_stock, '[]'::jsonb)) <> 'array' then raise exception 'Danh sách đếm bánh không hợp lệ'; end if;
  if jsonb_array_length(coalesce(p_stock, '[]'::jsonb)) = 0 and exists (
      select 1 from public.finished_goods_stock where store_location = v_s.store_location and is_semi_finished = false and qty > 0) then
    raise exception 'Đếm nhanh bánh trên kệ trước khi kết ca';
  end if;
  for v_l in select value from jsonb_array_elements(coalesce(p_stock, '[]'::jsonb)) loop
    v_dem := nullif(v_l->>'dem', '')::numeric;
    if v_dem is null or v_dem < 0 then raise exception 'Nhập số đếm được của "%"', coalesce(v_l->>'name', 'bánh'); end if;
    v_ht := public.pos__ton(v_s.store_location, (v_l->>'product_id')::uuid, v_l->>'size');
    v_kiem := v_kiem || jsonb_build_array(jsonb_build_object('product_id', v_l->>'product_id', 'size', nullif(v_l->>'size', ''),
      'name', v_l->>'name', 'he_thong', v_ht, 'dem', v_dem, 'lech', v_dem - v_ht));
    if v_dem <> v_ht then
      v_so_lech := v_so_lech + 1;
      if v_so_lech <= 5 then
        v_lech_txt := v_lech_txt || case when v_so_lech > 1 then ', ' else '' end || coalesce(v_l->>'name', 'bánh')
          || ' (máy ' || to_char(v_ht, 'FM999G990') || ', đếm ' || to_char(v_dem, 'FM999G990') || ')';
      end if;
    end if;
  end loop;

  v_sl := public.pos__so_lieu_ca(p_shift);
  v_expected := v_s.opening_cash + (v_sl->>'tien_mat_trong_ca')::numeric;
  v_diff := p_counted - v_expected;
  select coalesce(sum(tinh), 0), coalesce(sum(ck_cho), 0), coalesce(sum(no_chua_tra), 0) into v_ds, v_ck, v_no
    from public.pos__ds_hd(v_s.opened_at - interval '3 days', now() + interval '1 minute') d
    where d.shift_id = p_shift and d.cashier_id is not distinct from v_s.opened_by;
  v_sl := v_sl || jsonb_build_object('doanh_so_tinh', v_ds, 'ck_cho', v_ck, 'no_chua_tra', v_no, 'so_banh_lech', v_so_lech);
  update public.pos_shifts set status = 'closed', closed_by = auth.uid(), closed_by_name = public.pos_ten_toi(),
    closed_at = now(), expected_cash = v_expected, counted_cash = round(p_counted), diff = round(v_diff), summary = v_sl, note = p_note,
    closing_photo = trim(p_photo_url), stock_check = v_kiem
  where id = p_shift returning * into v_s;
  perform public.pos__ghi_nhat_ky(v_s.store_location, 'dong_ca', v_s.code,
    jsonb_build_object('he_thong', v_expected, 'dem', p_counted, 'chenh', v_diff, 'banh_lech', v_so_lech));
  perform public.pos__bao_sep('pos-dong-ca:' || v_s.id,
    case when v_diff < 0 then '⚠️ Thiếu két ' || to_char(-v_diff, f) || 'đ — ' || v_s.store_location
         when v_so_lech > 0 then '⚠️ Lệch ' || v_so_lech || ' món bánh lúc kết ca — ' || v_s.store_location
         when v_diff > 0 then 'Dư két ' || to_char(v_diff, f) || 'đ — ' || v_s.store_location
         else 'Đã kết ca ' || v_s.store_location end,
    coalesce(v_s.opened_by_name, '') || ' · ca ' || v_s.code || ': ' || (v_sl->>'so_hoa_don') || ' hoá đơn, doanh số tính '
      || to_char(v_ds, f) || 'đ' || case when v_ck > 0 then ' (+' || to_char(v_ck, f) || 'đ CK chờ xác nhận)' else '' end
      || '. Tiền mặt máy ' || to_char(v_expected, f) || 'đ, đếm ' || to_char(p_counted, f) || 'đ.'
      || case when v_so_lech > 0 then ' Bánh lệch: ' || v_lech_txt || case when v_so_lech > 5 then '…' else '' end || '.' else '' end
      || case when v_s.closed_by is distinct from v_s.opened_by then ' (Người kết ca: ' || coalesce(v_s.closed_by_name, '') || ')' else '' end,
    v_s.id, case when v_diff <> 0 or v_so_lech > 0 then 'warning' else 'info' end);
  return to_jsonb(v_s);
end $$;

-- ───────── Bánh đặt nhận tại quầy ─────────
create or replace function public.pos_ghi_don_quay(p_order uuid, p_store text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_o public.orders;
begin
  if public.pos_cap_do() is null then raise exception 'Tài khoản chưa được duyệt'; end if;
  if not exists (select 1 from public.pos_settings where store_location = p_store) then raise exception 'Chi nhánh không hợp lệ'; end if;
  select * into v_o from public.orders where id = p_order;
  if v_o.id is null then raise exception 'Không tìm thấy đơn'; end if;
  if v_o.created_by is distinct from auth.uid() or v_o.created_at < now() - interval '30 minutes' then
    raise exception 'Chỉ ghi được đơn chính bạn vừa tạo tại quầy';
  end if;
  insert into public.pos_counter_orders(order_id, store_location, shift_id, created_by, created_by_name)
  values (p_order, p_store, public.pos__ca_mo(p_store), auth.uid(), public.pos_ten_toi())
  on conflict (order_id) do nothing;
  return jsonb_build_object('order_code', v_o.order_code);
end $$;

-- ───────── Giám đốc / Quản lý loại 1 hoá đơn khỏi doanh số (ảnh không hợp lệ…) ─────────
create or replace function public.pos_loai_doanh_so(p_invoice uuid, p_loai boolean, p_ly_do text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_h public.pos_invoices;
begin
  if coalesce(public.pos_cap_do(), '') not in ('gd', 'ql') then raise exception 'Chỉ Quản lý / Giám đốc loại doanh số'; end if;
  if p_loai and coalesce(trim(p_ly_do), '') = '' then raise exception 'Ghi lý do loại (VD: ảnh không phải bánh bán)'; end if;
  update public.pos_invoices set ds_loai = p_loai,
    ds_loai_ly_do = case when p_loai then trim(p_ly_do) end,
    ds_loai_boi = public.pos_ten_toi(), ds_loai_luc = now()
  where id = p_invoice returning * into v_h;
  if v_h.id is null then raise exception 'Không tìm thấy hoá đơn'; end if;
  perform public.pos__ghi_nhat_ky(v_h.store_location, case when p_loai then 'loai_doanh_so' else 'bo_loai_doanh_so' end, v_h.code,
    jsonb_build_object('ly_do', p_ly_do, 'thu_ngan', v_h.cashier_name));
  return jsonb_build_object('id', v_h.id, 'ds_loai', v_h.ds_loai);
end $$;

-- ───────── Báo cáo doanh số nhân viên (GĐ / QL / Kế toán) ─────────
create or replace function public.pos_doanh_so_nv(p_from timestamptz, p_to timestamptz, p_store text default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v jsonb;
begin
  if coalesce(public.pos_cap_do(), '') not in ('gd', 'ql') and not public.pos_la_ke_toan() then
    raise exception 'Chỉ Giám đốc / Quản lý / Kế toán xem doanh số nhân viên';
  end if;
  if p_from is null or p_to is null or p_to <= p_from then raise exception 'Khoảng ngày không hợp lệ'; end if;
  with hd as (select * from public.pos__ds_hd(p_from, p_to) d where p_store is null or d.store_location = p_store),
  dat as (select c.created_by, c.created_by_name, o.total from public.pos_counter_orders c join public.orders o on o.id = c.order_id
          where o.status_v2 = 'completed' and o.completed_at >= p_from and o.completed_at < p_to
            and (p_store is null or c.store_location = p_store)),
  ca as (select * from public.pos_shifts s where s.opened_at >= p_from and s.opened_at < p_to and (p_store is null or s.store_location = p_store)),
  nv as (select id, max(ten) as ten from (
          select cashier_id as id, cashier_name as ten from hd
          union all select created_by, created_by_name from dat
          union all select opened_by, opened_by_name from ca) u where id is not null group by id)
  select jsonb_build_object(
    'tu', p_from, 'den', p_to,
    'nhan_vien', coalesce((select jsonb_agg(r order by (r->>'tong')::numeric desc) from (
      select jsonb_build_object('staff_id', n.id, 'ten', n.ten,
        'so_ca', (select count(*) from ca where ca.opened_by = n.id),
        'so_hd', (select count(*) from hd where hd.cashier_id = n.id),
        'ban_tinh', (select coalesce(sum(tinh), 0) from hd where hd.cashier_id = n.id),
        'ck_cho', (select coalesce(sum(ck_cho), 0) from hd where hd.cashier_id = n.id),
        'no_chua_tra', (select coalesce(sum(no_chua_tra), 0) from hd where hd.cashier_id = n.id),
        'bi_loai', (select coalesce(sum(tinh_goc), 0) from hd where hd.cashier_id = n.id and (hd.loai or hd.mua_nv)),
        'so_hd_loai', (select count(*) from hd where hd.cashier_id = n.id and (hd.loai or hd.mua_nv)),
        'so_hd_canh_bao', (select count(*) from hd where hd.cashier_id = n.id and hd.canh_bao is not null),
        'dat_quay', (select coalesce(sum(total), 0) from dat where dat.created_by = n.id),
        'so_don_dat', (select count(*) from dat where dat.created_by = n.id),
        'tong', (select coalesce(sum(tinh), 0) from hd where hd.cashier_id = n.id) + (select coalesce(sum(total), 0) from dat where dat.created_by = n.id)
      ) as r from nv n) t), '[]'::jsonb),
    'ca', coalesce((select jsonb_agg(r order by r->>'opened_at' desc) from (
      select jsonb_build_object('id', s.id, 'code', s.code, 'store', s.store_location, 'staff_id', s.opened_by, 'ten', s.opened_by_name,
        'opened_at', s.opened_at, 'closed_at', s.closed_at, 'status', s.status, 'tien_dau', s.opening_cash, 'dem', s.counted_cash,
        'lech', s.diff, 'anh_vao', s.opening_photo, 'anh_ket', s.closing_photo, 'kiem_banh', s.stock_check,
        'so_banh_lech', (select count(*) from jsonb_array_elements(coalesce(s.stock_check, '[]'::jsonb)) k where (k->>'lech')::numeric <> 0),
        'so_hd', (select count(*) from public.pos__ds_hd(s.opened_at - interval '3 days', coalesce(s.closed_at, now()) + interval '1 minute') d
                   where d.shift_id = s.id and d.cashier_id is not distinct from s.opened_by),
        'ban_tinh', (select coalesce(sum(tinh), 0) from public.pos__ds_hd(s.opened_at - interval '3 days', coalesce(s.closed_at, now()) + interval '1 minute') d
                   where d.shift_id = s.id and d.cashier_id is not distinct from s.opened_by),
        'ck_cho', (select coalesce(sum(ck_cho), 0) from public.pos__ds_hd(s.opened_at - interval '3 days', coalesce(s.closed_at, now()) + interval '1 minute') d
                   where d.shift_id = s.id and d.cashier_id is not distinct from s.opened_by),
        'nguoi_khac', (select coalesce(sum(tinh), 0) from public.pos__ds_hd(s.opened_at - interval '3 days', coalesce(s.closed_at, now()) + interval '1 minute') d
                   where d.shift_id = s.id and d.cashier_id is distinct from s.opened_by)
      ) as r from ca s) t), '[]'::jsonb)
  ) into v;
  return v;
end $$;

-- Hoá đơn của 1 ca kèm ảnh + phần tính doanh số (màn soát ảnh).
create or replace function public.pos_hd_ca(p_shift uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_s public.pos_shifts;
begin
  if coalesce(public.pos_cap_do(), '') not in ('gd', 'ql') and not public.pos_la_ke_toan() then
    raise exception 'Chỉ Giám đốc / Quản lý / Kế toán xem';
  end if;
  select * into v_s from public.pos_shifts where id = p_shift;
  if v_s.id is null then raise exception 'Không tìm thấy ca'; end if;
  return coalesce((select jsonb_agg(to_jsonb(d) order by d.created_at)
    from public.pos__ds_hd(v_s.opened_at - interval '3 days', coalesce(v_s.closed_at, now()) + interval '1 minute') d
    where d.shift_id = p_shift), '[]'::jsonb);
end $$;

-- ───────── Xếp hạng tháng: ai cũng xem được hạng + tên; chỉ thấy tiền của CHÍNH MÌNH ─────────
create or replace function public.pos_xep_hang_thang(p_thang date default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_dau date := date_trunc('month', coalesce(p_thang, (now() at time zone 'Asia/Ho_Chi_Minh')::date))::date;
  v_tu timestamptz; v_den timestamptz; v jsonb;
begin
  if public.pos_cap_do() is null then raise exception 'Tài khoản chưa được duyệt'; end if;
  v_tu := v_dau::timestamp at time zone 'Asia/Ho_Chi_Minh';
  v_den := (v_dau + interval '1 month')::timestamp at time zone 'Asia/Ho_Chi_Minh';
  with ds as (
    select id, sum(tien) as tong from (
      select cashier_id as id, tinh as tien from public.pos__ds_hd(v_tu, v_den)
      union all
      select c.created_by, o.total from public.pos_counter_orders c join public.orders o on o.id = c.order_id
        where o.status_v2 = 'completed' and o.completed_at >= v_tu and o.completed_at < v_den) u
    where id is not null group by id
  ),
  bang as (
    select ds.id, coalesce(p.full_name, 'Nhân viên') as ten, ds.tong, rank() over (order by ds.tong desc) as hang
    from ds join public.profiles p on p.id = ds.id
    where p.role not in ('owner', 'admin', 'deputy_director_x41', 'deputy_director_x42')
      and not (coalesce(p.extra_roles, '{}') && array['owner', 'admin', 'deputy_director_x41', 'deputy_director_x42'])
      and ds.tong > 0
  )
  select jsonb_build_object('thang', to_char(v_dau, 'MM/YYYY'),
    'bang', coalesce((select jsonb_agg(jsonb_build_object('hang', hang, 'ten', ten, 'la_toi', id = auth.uid()) order by hang, ten) from bang), '[]'::jsonb),
    'cua_toi', (select jsonb_build_object('hang', hang, 'tong', tong) from bang where id = auth.uid()),
    'tong_cua_toi', coalesce((select tong from ds where id = auth.uid()), 0))
  into v;
  return v;
end $$;

-- Giám đốc bật/tắt "phải chấm công mới vào ca".
create or replace function public.pos_bat_cham_cong(p_store text, p_bat boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if public.pos_cap_do() is distinct from 'gd' then raise exception 'Chỉ Giám đốc đổi thiết lập'; end if;
  update public.pos_settings set bat_cham_cong = coalesce(p_bat, false), updated_by = auth.uid(), updated_at = now() where store_location = p_store;
  if not found then raise exception 'Chi nhánh không hợp lệ'; end if;
  perform public.pos__ghi_nhat_ky(p_store, 'thiet_lap', p_store, jsonb_build_object('bat_cham_cong', p_bat));
end $$;

revoke all on function public.pos__ds_hd(timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function public.pos__sdt(text) from public, anon, authenticated;
do $$
declare f text;
begin
  foreach f in array array['pos_vao_ca(text,numeric,text)', 'pos_ket_ca(uuid,numeric,text,text,jsonb)', 'pos_ghi_don_quay(uuid,text)',
    'pos_loai_doanh_so(uuid,boolean,text)', 'pos_doanh_so_nv(timestamptz,timestamptz,text)', 'pos_hd_ca(uuid)',
    'pos_xep_hang_thang(date)', 'pos_bat_cham_cong(text,boolean)'] loop
    execute 'revoke all on function public.' || f || ' from public, anon';
    execute 'grant execute on function public.' || f || ' to authenticated';
  end loop;
end $$;

insert into public.migration_runs(migration_key, status, finished_at, notes)
values ('202611151010_ban_hang_quay_doanh_so_nhan_vien', 'completed', now(),
  'Bán tại quầy: doanh số theo nhân viên (pos_doanh_so_nv, pos_xep_hang_thang), vào/kết ca có ảnh két + đếm bánh (pos_vao_ca, pos_ket_ca), ảnh bắt buộc mỗi hoá đơn, bánh đặt tại quầy (pos_counter_orders), GĐ loại doanh số (pos_loai_doanh_so). pos_mo_ca/pos_dong_ca cũ ngừng dùng.')
on conflict (migration_key) do update set status = 'completed', finished_at = now(), notes = excluded.notes;

commit;
