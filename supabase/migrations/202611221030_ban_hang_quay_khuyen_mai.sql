-- Bán tại quầy: KHUYẾN MẠI như KiotViet (Quản lý / Giám đốc tạo chương trình, quầy tự áp khi thanh toán).
--  3 loại: • hd_giam   Giảm giá hoá đơn theo tổng tiền hàng (nhiều mức: từ X đ giảm Y đ hoặc Y%, có trần)
--          • hang_giam Mua đủ N cái món A → mỗi cái giảm Y đ / Y% / đồng giá Y đ
--          • tang_hang Mua N cái món A → tặng M cái món B (giá 0, vẫn trừ tồn)
--  Điều kiện: hiệu lực từ ngày–đến ngày, ngày trong tuần, khung giờ, chi nhánh. Mỗi hoá đơn 1 chương trình.
--  pos_ban (bản 202611221010 + khuyến mại): database tự tính lại số giảm / số tặng, lệch thì không cho bán
--  (mất mạng thì vẫn ghi + báo Giám đốc). Phần giảm khuyến mại KHÔNG tính vào hạn mức giảm tay của nhân viên.
--  Giảm khuyến mại gộp vào invoice_discount → mọi báo cáo cũ tự đúng; promo_discount lưu riêng để xem lại.
-- Chỉ THÊM bảng / cột / hàm. Chạy SAU 202611221010 và 202611221020.
begin;
set local lock_timeout = '10s';

create table if not exists public.pos_promotions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  kind text not null check (kind in ('hd_giam', 'hang_giam', 'tang_hang')),
  rule jsonb not null default '{}',
  active boolean not null default true,
  from_date date,
  to_date date,
  days int[],            -- 1 = Thứ 2 … 7 = Chủ nhật; rỗng = mọi ngày
  time_from time,
  time_to time,
  stores text[],         -- rỗng = mọi chi nhánh
  note text,
  created_by uuid references public.profiles(id) on delete set null,
  created_by_name text,
  created_at timestamptz not null default now(),
  updated_by_name text,
  updated_at timestamptz not null default now()
);
alter table public.pos_promotions enable row level security;
revoke all on public.pos_promotions from anon, authenticated;   -- RLS không chặn TRUNCATE → thu hồi hết
grant select on public.pos_promotions to authenticated;
drop policy if exists pos_promotions_doc on public.pos_promotions;
create policy pos_promotions_doc on public.pos_promotions for select to authenticated using (public.pos_cap_do() is not null);

alter table public.pos_invoices add column if not exists promo_id uuid references public.pos_promotions(id) on delete set null;
alter table public.pos_invoices add column if not exists promo_name text;
alter table public.pos_invoices add column if not exists promo_discount numeric(14,0) not null default 0;
alter table public.pos_invoice_lines add column if not exists is_gift boolean not null default false;
create index if not exists pos_invoices_promo on public.pos_invoices(promo_id) where promo_id is not null;

-- Tính 1 chương trình cho các dòng hàng (đơn giá đã được pos_ban kiểm). Trả {tien, ten, tang_toi_da, loi}.
-- p_ds = [{product_id, variant_id, qty, unit, eod, km}] (km = dòng hàng tặng).
create or replace function public.pos__km_tinh(p_id uuid, p_store text, p_luc timestamptz, p_ds jsonb)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v public.pos_promotions; v_vn timestamp := p_luc at time zone 'Asia/Ho_Chi_Minh'; r jsonb;
  v_sub numeric; v_sl numeric; v_tien numeric := 0; v_toi numeric; v_tang numeric; m jsonb; v_loi text;
begin
  select * into v from public.pos_promotions where id = p_id;
  if v.id is null then return jsonb_build_object('tien', 0, 'loi', 'Chương trình khuyến mại không còn — tải lại trang'); end if;
  r := v.rule;
  if not v.active then v_loi := 'Khuyến mại "' || v.name || '" đã tắt';
  elsif v.from_date is not null and v_vn::date < v.from_date then v_loi := 'Khuyến mại "' || v.name || '" chưa tới ngày áp dụng';
  elsif v.to_date is not null and v_vn::date > v.to_date then v_loi := 'Khuyến mại "' || v.name || '" đã hết hạn';
  elsif coalesce(cardinality(v.days), 0) > 0 and not (extract(isodow from v_vn)::int = any(v.days)) then v_loi := 'Khuyến mại "' || v.name || '" không áp dụng hôm nay';
  elsif (v.time_from is not null and v_vn::time < v.time_from) or (v.time_to is not null and v_vn::time >= v.time_to) then
    v_loi := 'Khuyến mại "' || v.name || '" ngoài khung giờ áp dụng';
  elsif coalesce(cardinality(v.stores), 0) > 0 and not (p_store = any(v.stores)) then v_loi := 'Khuyến mại "' || v.name || '" không áp dụng ở ' || p_store;
  end if;
  if v_loi is not null then return jsonb_build_object('tien', 0, 'ten', v.name, 'loi', v_loi); end if;

  select coalesce(sum((x->>'qty')::numeric), 0) into v_tang from jsonb_array_elements(p_ds) x where (x->>'km')::boolean;
  if v.kind <> 'tang_hang' and v_tang > 0 then
    return jsonb_build_object('tien', 0, 'ten', v.name, 'loi', 'Khuyến mại "' || v.name || '" không tặng hàng'); end if;

  if v.kind = 'hd_giam' then
    select coalesce(sum((x->>'unit')::numeric * (x->>'qty')::numeric), 0) into v_sub from jsonb_array_elements(p_ds) x where not (x->>'km')::boolean;
    select mm into m from jsonb_array_elements(r->'muc') mm where (mm->>'tu')::numeric <= v_sub order by (mm->>'tu')::numeric desc limit 1;
    if m is null then
      return jsonb_build_object('tien', 0, 'ten', v.name, 'loi', 'Hoá đơn chưa đủ tiền để được khuyến mại "' || v.name || '"'); end if;
    v_tien := case when m->>'kieu' = 'pt' then round(v_sub * (m->>'giam')::numeric / 100) else (m->>'giam')::numeric end;
    if m->>'kieu' = 'pt' and coalesce((m->>'toi_da')::numeric, 0) > 0 then v_tien := least(v_tien, (m->>'toi_da')::numeric); end if;
    v_tien := least(greatest(v_tien, 0), v_sub);
  elsif v.kind = 'hang_giam' then
    select coalesce(sum((x->>'qty')::numeric), 0),
           coalesce(sum(case r->>'kieu'
             when 'pt' then round((x->>'unit')::numeric * (r->>'giam')::numeric / 100) * (x->>'qty')::numeric
             when 'gia' then greatest((x->>'unit')::numeric - (r->>'giam')::numeric, 0) * (x->>'qty')::numeric
             else least((r->>'giam')::numeric, (x->>'unit')::numeric) * (x->>'qty')::numeric end), 0)
      into v_sl, v_tien
      from jsonb_array_elements(p_ds) x
      where not (x->>'km')::boolean and not (x->>'eod')::boolean and x->>'product_id' = r->>'product_id'
        and (nullif(r->>'variant_id', '') is null or x->>'variant_id' = r->>'variant_id');
    if v_sl < coalesce((r->>'sl_tu')::numeric, 1) then
      return jsonb_build_object('tien', 0, 'ten', v.name, 'loi', 'Mua chưa đủ số lượng để được khuyến mại "' || v.name || '"'); end if;
  else
    select coalesce(sum((x->>'qty')::numeric), 0) into v_sl from jsonb_array_elements(p_ds) x
      where not (x->>'km')::boolean and x->>'product_id' = r#>>'{mua,product_id}'
        and (nullif(r#>>'{mua,variant_id}', '') is null or x->>'variant_id' = r#>>'{mua,variant_id}');
    v_toi := floor(v_sl / greatest(coalesce((r#>>'{mua,sl}')::numeric, 1), 1)) * coalesce((r#>>'{tang,sl}')::numeric, 1);
    if exists (select 1 from jsonb_array_elements(p_ds) x where (x->>'km')::boolean and not (x->>'product_id' = r#>>'{tang,product_id}'
        and (nullif(r#>>'{tang,variant_id}', '') is null or x->>'variant_id' = r#>>'{tang,variant_id}'))) then
      return jsonb_build_object('tien', 0, 'ten', v.name, 'loi', 'Hàng tặng không đúng chương trình "' || v.name || '"'); end if;
    if v_tang > v_toi then
      return jsonb_build_object('tien', 0, 'ten', v.name, 'tang_toi_da', v_toi,
        'loi', 'Chỉ được tặng ' || to_char(v_toi, 'FM999G990') || ' cái theo "' || v.name || '"'); end if;
    if v_tang = 0 then
      return jsonb_build_object('tien', 0, 'ten', v.name, 'loi', 'Chưa có hàng tặng của khuyến mại "' || v.name || '"'); end if;
  end if;
  return jsonb_build_object('tien', v_tien, 'ten', v.name, 'tang_toi_da', v_toi);
end $$;
revoke all on function public.pos__km_tinh(uuid, text, timestamptz, jsonb) from public, anon, authenticated;

-- Lưu chương trình khuyến mại (tạo mới / sửa / bật tắt). Chỉ Quản lý / Giám đốc.
-- p = {id?, name, kind, rule, active, from_date, to_date, days[], time_from, time_to, stores[], note}
create or replace function public.pos_luu_km(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_cap text := public.pos_cap_do(); v public.pos_promotions; v_id uuid := nullif(p->>'id', '')::uuid;
  v_ten text := nullif(btrim(coalesce(p->>'name', '')), ''); v_kind text := p->>'kind'; r jsonb := coalesce(p->'rule', '{}'::jsonb);
  v_days int[]; v_stores text[]; m jsonb; v_from date := nullif(p->>'from_date', '')::date; v_to date := nullif(p->>'to_date', '')::date;
  v_tf time := nullif(p->>'time_from', '')::time; v_tt time := nullif(p->>'time_to', '')::time;
begin
  if v_cap not in ('gd', 'ql') then raise exception 'Chỉ Quản lý / Giám đốc tạo / sửa khuyến mại'; end if;
  if v_ten is null or length(v_ten) > 120 then raise exception 'Ghi tên chương trình (tối đa 120 chữ)'; end if;
  if v_kind not in ('hd_giam', 'hang_giam', 'tang_hang') then raise exception 'Chọn hình thức khuyến mại'; end if;
  if v_from is not null and v_to is not null and v_to < v_from then raise exception 'Ngày kết thúc phải sau ngày bắt đầu'; end if;
  if (v_tf is null) <> (v_tt is null) or (v_tf is not null and v_tt <= v_tf) then raise exception 'Khung giờ chưa đúng (giờ kết thúc phải sau giờ bắt đầu)'; end if;
  if jsonb_typeof(p->'days') = 'array' then
    select array_agg(distinct x::int order by x::int) into v_days from jsonb_array_elements_text(p->'days') x;
    if exists (select 1 from unnest(v_days) d where d not between 1 and 7) then raise exception 'Ngày trong tuần không hợp lệ'; end if;
  end if;
  if jsonb_typeof(p->'stores') = 'array' then
    select array_agg(distinct x) into v_stores from jsonb_array_elements_text(p->'stores') x;
    if exists (select 1 from unnest(v_stores) s where not exists (select 1 from public.pos_settings where store_location = s)) then
      raise exception 'Chi nhánh không hợp lệ'; end if;
  end if;
  if v_kind = 'hd_giam' then
    if jsonb_typeof(r->'muc') <> 'array' or jsonb_array_length(r->'muc') not between 1 and 10 then raise exception 'Thêm ít nhất 1 mức giảm (tối đa 10)'; end if;
    for m in select value from jsonb_array_elements(r->'muc') loop
      if coalesce((m->>'tu')::numeric, -1) < 0 or coalesce((m->>'giam')::numeric, 0) <= 0 or coalesce(m->>'kieu', '') not in ('tien', 'pt')
        or (m->>'kieu' = 'pt' and (m->>'giam')::numeric > 100) or coalesce((m->>'toi_da')::numeric, 0) < 0 then
        raise exception 'Mức giảm chưa đúng (tổng tiền từ, số giảm đ hoặc %% không quá 100)'; end if;
    end loop;
    r := jsonb_build_object('muc', (select jsonb_agg(jsonb_build_object('tu', round((x->>'tu')::numeric), 'giam', (x->>'giam')::numeric,
      'kieu', x->>'kieu', 'toi_da', round(coalesce((x->>'toi_da')::numeric, 0))) order by (x->>'tu')::numeric) from jsonb_array_elements(r->'muc') x));
  elsif v_kind = 'hang_giam' then
    if not exists (select 1 from public.products where id = nullif(r->>'product_id', '')::uuid) then raise exception 'Chọn món được giảm giá'; end if;
    if coalesce((r->>'sl_tu')::numeric, 0) < 1 or coalesce(r->>'kieu', '') not in ('tien', 'pt', 'gia')
      or coalesce((r->>'giam')::numeric, -1) < 0 or (r->>'kieu' <> 'gia' and (r->>'giam')::numeric <= 0)
      or (r->>'kieu' = 'pt' and (r->>'giam')::numeric > 100) then
      raise exception 'Điều kiện giảm giá hàng chưa đúng (mua từ mấy cái, giảm bao nhiêu)'; end if;
    r := jsonb_build_object('product_id', r->>'product_id', 'variant_id', nullif(r->>'variant_id', ''), 'ten', r->>'ten',
      'sl_tu', (r->>'sl_tu')::numeric, 'kieu', r->>'kieu', 'giam', round((r->>'giam')::numeric));
  else
    if not exists (select 1 from public.products where id = nullif(r#>>'{mua,product_id}', '')::uuid)
      or not exists (select 1 from public.products where id = nullif(r#>>'{tang,product_id}', '')::uuid) then
      raise exception 'Chọn món mua và món tặng'; end if;
    if coalesce((r#>>'{mua,sl}')::numeric, 0) < 1 or coalesce((r#>>'{tang,sl}')::numeric, 0) < 1 then raise exception 'Số lượng mua / tặng phải từ 1'; end if;
    r := jsonb_build_object(
      'mua', jsonb_build_object('product_id', r#>>'{mua,product_id}', 'variant_id', nullif(r#>>'{mua,variant_id}', ''), 'ten', r#>>'{mua,ten}', 'sl', (r#>>'{mua,sl}')::numeric),
      'tang', jsonb_build_object('product_id', r#>>'{tang,product_id}', 'variant_id', nullif(r#>>'{tang,variant_id}', ''), 'ten', r#>>'{tang,ten}', 'sl', (r#>>'{tang,sl}')::numeric));
  end if;

  if v_id is not null then select * into v from public.pos_promotions where id = v_id for update; end if;
  if v.id is null then
    insert into public.pos_promotions(id, code, name, kind, rule, active, from_date, to_date, days, time_from, time_to, stores, note,
      created_by, created_by_name, updated_by_name)
    values (coalesce(v_id, gen_random_uuid()), 'KM' || lpad(nextval('public.pos_doc_seq')::text, 6, '0'), v_ten, v_kind, r,
      coalesce((p->>'active')::boolean, true), v_from, v_to, v_days, v_tf, v_tt, v_stores, nullif(btrim(coalesce(p->>'note', '')), ''),
      auth.uid(), public.pos_ten_toi(), public.pos_ten_toi())
    returning * into v;
  else
    update public.pos_promotions set name = v_ten, kind = v_kind, rule = r, active = coalesce((p->>'active')::boolean, active),
      from_date = v_from, to_date = v_to, days = v_days, time_from = v_tf, time_to = v_tt, stores = v_stores,
      note = nullif(btrim(coalesce(p->>'note', '')), ''), updated_by_name = public.pos_ten_toi(), updated_at = now()
    where id = v.id returning * into v;
  end if;
  perform public.pos__ghi_nhat_ky(coalesce(v.stores[1], 'Tất cả'), 'khuyen_mai', v.code,
    jsonb_build_object('ten', v.name, 'loai', v.kind, 'bat', v.active, 'dieu_kien', v.rule));
  return to_jsonb(v);
end $$;

-- Bật / tắt nhanh một chương trình.
create or replace function public.pos_bat_km(p_id uuid, p_bat boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v public.pos_promotions;
begin
  if public.pos_cap_do() not in ('gd', 'ql') then raise exception 'Chỉ Quản lý / Giám đốc bật / tắt khuyến mại'; end if;
  update public.pos_promotions set active = p_bat, updated_by_name = public.pos_ten_toi(), updated_at = now()
    where id = p_id returning * into v;
  if v.id is null then raise exception 'Không tìm thấy chương trình'; end if;
  perform public.pos__ghi_nhat_ky(coalesce(v.stores[1], 'Tất cả'), case when p_bat then 'bat_km' else 'tat_km' end, v.code, jsonb_build_object('ten', v.name));
  return to_jsonb(v);
end $$;

-- Số hoá đơn + tổng tiền đã giảm của từng chương trình (màn Khuyến mại).
create or replace function public.pos_km_thong_ke()
returns jsonb language sql stable security definer set search_path = public as $$
  select case when public.pos_cap_do() in ('gd', 'ql') then coalesce((select jsonb_object_agg(promo_id, jsonb_build_object('so_hd', n, 'tien', t)) from (
    select promo_id, count(*) n, sum(promo_discount) t from public.pos_invoices where promo_id is not null and status = 'xong' group by promo_id) x), '{}'::jsonb)
  else '{}'::jsonb end
$$;

-- pos_ban: bản 202611221010 + khuyến mại (hàng tặng km=true giá 0; promo_id / promo_discount).
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
  -- Khuyến mại: database tự tính lại số giảm / số hàng tặng của chương trình (không tin số trình duyệt gửi).
  v_km_id uuid := nullif(p->>'promo_id', '')::uuid; v_km jsonb; v_ds jsonb := '[]'::jsonb; v_tang boolean;
  v_km_tien numeric := 0; v_km_tang numeric := 0; v_km_may numeric := greatest(round(coalesce((p->>'promo_discount')::numeric, 0)), 0);
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
    v_tang := coalesce((v_line->>'km')::boolean, false);
    if v_tang then v_unit := 0; v_km_tang := v_km_tang + v_list * v_qty; end if;   -- hàng tặng: giá 0
    v_ds := v_ds || jsonb_build_object('product_id', v_line->>'product_id', 'variant_id', nullif(v_line->>'variant_id', ''),
      'qty', v_qty, 'unit', v_unit, 'eod', coalesce((v_line->>'eod')::boolean, false), 'km', v_tang);
    if coalesce((v_line->>'eod')::boolean, false) and not v_tang then
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

  if v_km_id is not null then
    v_km := public.pos__km_tinh(v_km_id, v_store, v_luc, v_ds);
    v_km_tien := coalesce((v_km->>'tien')::numeric, 0);
    if v_km->>'loi' is not null then
      if not v_off then raise exception '%', v_km->>'loi'; end if;
      v_canh := v_canh || jsonb_build_object('loai', 'km_lech', 'chi_tiet', v_km->>'loi');
      v_km_tien := v_km_may;
    elsif v_km_may <> v_km_tien then
      if not v_off then raise exception 'Khuyến mại "%" vừa thay đổi — tải lại trang rồi bán lại', coalesce(v_km->>'ten', ''); end if;
      v_canh := v_canh || jsonb_build_object('loai', 'km_lech', 'chi_tiet', 'máy giảm ' || to_char(v_km_may, 'FM999G999G999') || 'đ, đúng ' || to_char(v_km_tien, 'FM999G999G999') || 'đ');
      v_km_tien := v_km_may;
    end if;
  elsif v_km_tang > 0 or v_km_may > 0 then
    if not v_off then raise exception 'Hàng tặng / giảm khuyến mại phải theo một chương trình khuyến mại'; end if;
    v_canh := v_canh || jsonb_build_object('loai', 'km_lech', 'chi_tiet', 'không có chương trình');
    v_km_tien := v_km_may;
  end if;
  -- Giảm khuyến mại gộp vào "giảm giá hoá đơn" (báo cáo đã có sẵn cột này), lưu riêng promo_discount để xem lại.
  v_inv_disc := least(greatest(round(coalesce((p->>'invoice_discount')::numeric, 0)), 0) + v_km_tien, v_sub);
  select coalesce(sum(greatest(round((f->>'tien')::numeric), 0)), 0) into v_fee from jsonb_array_elements(coalesce(p->'other_fees', '[]')) f;
  v_vat := case when coalesce((p->>'vat')::boolean, false) then round((v_sub - v_inv_disc) * 0.08) else 0 end;

  -- Hạn mức giảm giá: nhân viên vượt % cho phép phải có phiếu duyệt của Quản lý/GĐ.
  -- Phần giảm do chương trình khuyến mại không tính vào hạn mức giảm tay của nhân viên.
  v_pct := case when v_gross > 0 then greatest(v_line_disc + v_inv_disc - v_km_tien - v_km_tang, 0) * 100 / v_gross else 0 end;
  if v_cap = 'nv' and v_pct > v_set.staff_discount_pct then
    select * into v_ap from public.pos_approvals where id = nullif(p->>'approval_id', '')::uuid for update;
    if (v_ap.id is null or v_ap.kind <> 'giam_gia' or v_ap.status <> 'dong_y' or v_ap.requested_by <> auth.uid()
      or coalesce((v_ap.payload->>'tien')::numeric, 0) < v_line_disc + v_inv_disc - v_km_tien - v_km_tang) and v_off then
      v_canh := v_canh || jsonb_build_object('loai', 'giam_qua_muc', 'phan_tram', round(v_pct, 1), 'muc', v_set.staff_discount_pct);
    elsif v_ap.id is null or v_ap.kind <> 'giam_gia' or v_ap.status <> 'dong_y' or v_ap.requested_by <> auth.uid()
      or coalesce((v_ap.payload->>'tien')::numeric, 0) < v_line_disc + v_inv_disc - v_km_tien - v_km_tang then
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
    transfer_status, note, offline, client_created_at, created_at, canh_bao, photo_url, photo_hash,
    promo_id, promo_name, promo_discount)
  values (v_id, v_code, v_store, v_ca, auth.uid(), v_ten, coalesce(nullif(p->>'seller_name', ''), v_ten),
    v_cust, coalesce(v_cust_row.name, 'Khách lẻ'), v_cust_row.phone, v_pl, v_pl_name,
    v_gross, v_line_disc, v_eod, v_inv_disc, v_sub, v_vat, v_fee, coalesce(p->'other_fees', '[]'),
    v_pts, v_pts_val, v_total, v_method, v_parts, v_paid, v_recv, v_change, v_debt,
    case when (v_method = 'chuyen_khoan' or coalesce(v_parts ? 'chuyen_khoan', false)) and v_paid > 0 then 'cho_xac_nhan' else 'khong' end,
    nullif(p->>'note', ''), v_off, nullif(p->>'client_created_at', '')::timestamptz, v_luc, case when jsonb_array_length(v_canh) > 0 then v_canh end,
    v_anh, v_hash,
    case when v_km_id is not null and exists (select 1 from public.pos_promotions where id = v_km_id) then v_km_id end,
    v_km->>'ten', v_km_tien + v_km_tang);

  for v_line in select value from jsonb_array_elements(p->'lines') loop
    v_no := v_no + 1;
    v_qty := (v_line->>'qty')::numeric;
    v_list := public.pos__gia(v_pl, (v_line->>'product_id')::uuid, nullif(v_line->>'variant_id', '')::uuid);
    if v_off and round((v_line->>'list_price')::numeric) <> v_list then v_list := greatest(round((v_line->>'list_price')::numeric), 0); end if;
    v_unit := least(greatest(round(coalesce((v_line->>'unit_price')::numeric, v_list)), 0), v_list);
    v_tang := coalesce((v_line->>'km')::boolean, false);
    if v_tang then v_unit := 0; end if;
    insert into public.pos_invoice_lines(invoice_id, line_no, product_id, variant_id, size, name, qty, list_price, unit_price,
      line_discount, line_total, eod, note, is_gift)
    values (v_id, v_no, (v_line->>'product_id')::uuid, nullif(v_line->>'variant_id', '')::uuid, nullif(v_line->>'size', ''),
      coalesce(v_line->>'name', 'Hàng hoá'), v_qty, v_list, v_unit, (v_list - v_unit) * v_qty, v_unit * v_qty,
      coalesce((v_line->>'eod')::boolean, false) and not v_tang, coalesce(nullif(v_line->>'note', ''), case when v_tang then 'Tặng (khuyến mại)' end), v_tang);
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
          when 'km_lech' then 'khuyến mại lệch (' || coalesce(x->>'chi_tiet', '?') || ')'
          when 'khong_phai_ca_minh' then 'bán khi ca đang mở là của ' || coalesce(x->>'chu_ca', 'chưa ai') || ' (doanh số cần kiểm)'
          else 'giảm giá cuối ngày sai giờ/mức' end, '; ') from jsonb_array_elements(v_canh) x),
      v_id, 'warning');
  end if;
  if v_line_disc + v_inv_disc > 0 or v_debt > 0 or v_eod > 0 or v_off then
    perform public.pos__ghi_nhat_ky(v_store, 'ban', v_code, jsonb_build_object('giam', v_line_disc + v_inv_disc, 'giam_cuoi_ngay', v_eod,
      'ghi_no', v_debt, 'tong', v_total, 'offline', v_off, 'canh_bao', v_canh, 'khuyen_mai', v_km->>'ten', 'giam_km', v_km_tien + v_km_tang,
      'duyet', nullif(p->>'approval_id', '')));
  end if;
  return jsonb_build_object('id', v_id, 'code', v_code, 'total', v_total, 'debt', v_debt, 'change', v_change,
    'points_earned', v_earn, 'pay_parts', v_parts, 'promo_discount', v_km_tien + v_km_tang, 'canh_bao', v_canh, 'transfer_status', case when (v_method = 'chuyen_khoan' or coalesce(v_parts ? 'chuyen_khoan', false)) and v_paid > 0 then 'cho_xac_nhan' else 'khong' end);
end $$;

revoke all on function public.pos_ban(jsonb) from public, anon;
grant execute on function public.pos_ban(jsonb) to authenticated;
revoke all on function public.pos_luu_km(jsonb) from public, anon;
grant execute on function public.pos_luu_km(jsonb) to authenticated;
revoke all on function public.pos_bat_km(uuid, boolean) from public, anon;
grant execute on function public.pos_bat_km(uuid, boolean) to authenticated;
revoke all on function public.pos_km_thong_ke() from public, anon;
grant execute on function public.pos_km_thong_ke() to authenticated;

insert into public.migration_runs(migration_key, status, finished_at, notes)
values ('202611221030_ban_hang_quay_khuyen_mai', 'completed', now(),
  'Bán tại quầy: khuyến mại như KiotViet (giảm hoá đơn theo mức, giảm giá hàng theo SL, mua X tặng Y; ngày/giờ/thứ/chi nhánh). pos_ban tự tính lại.')
on conflict (migration_key) do update set status = 'completed', finished_at = now(), notes = excluded.notes;

commit;
