-- Bán tại quầy — TRẢ HÀNG như KiotViet (sếp đồng ý làm lại 22/11, thay quyết định 06/11).
-- Khách mang hàng đã mua trả lại: chọn hoá đơn → chọn món + số lượng trả → máy tính "Cần trả khách"
-- (giá đã trừ giảm giá hoá đơn / khuyến mại / điểm), trừ phí trả hàng nếu có.
--   • Khách còn nợ hoá đơn đó → trừ nợ trước, phần còn lại mới trả tiền.
--   • Trả tiền mặt → ra khỏi két ca đang mở (kết ca tự trừ). Chuyển khoản → không đụng két.
--   • Hàng trả về lại tồn quầy, đúng lô hạn dùng hoá đơn gốc đã trừ. Điểm khách đã tích từ phần trả bị trừ lại.
--   • Doanh số nhân viên bán hoá đơn đó trừ phần khách trả. Sổ quỹ / báo cáo cuối ngày ghi phiếu chi trả hàng.
--   • Nhân viên trả hàng hoá đơn trong 7 ngày, phải đang ở ca của mình; quá 7 ngày nhờ Quản lý / Giám đốc.
--   • Mỗi phiếu trả báo Giám đốc. Hoá đơn đã có phiếu trả thì không huỷ hoá đơn nữa.
-- Chạy sau 202611221045. Chỉ thêm bảng / thay hàm, không xoá gì.
begin;
set local lock_timeout = '10s';

create sequence if not exists public.pos_return_seq;
revoke all on sequence public.pos_return_seq from anon, authenticated;

create table if not exists public.pos_returns (
  id uuid primary key,
  code text not null unique,
  store_location text not null references public.pos_settings(store_location),
  invoice_id uuid references public.pos_invoices(id) on delete set null,
  invoice_code text,
  shift_id uuid references public.pos_shifts(id) on delete set null,
  customer_id uuid references public.customers(id) on delete set null,
  customer_name text,
  goods_value numeric(14,0) not null default 0,   -- tiền hàng trả (theo giá trả)
  fee numeric(14,0) not null default 0,           -- phí trả hàng
  debt_offset numeric(14,0) not null default 0,   -- trừ vào nợ hoá đơn
  refund numeric(14,0) not null default 0,        -- tiền thật trả khách
  points_back int not null default 0,             -- điểm trừ lại
  pay_method text not null default 'tien_mat' check (pay_method in ('tien_mat', 'chuyen_khoan')),
  note text,
  status text not null default 'xong' check (status in ('xong', 'huy')),
  created_by uuid references public.profiles(id) on delete set null,
  created_by_name text,
  created_at timestamptz not null default now()
);
create index if not exists pos_returns_hd on public.pos_returns(invoice_id);
create index if not exists pos_returns_ca on public.pos_returns(shift_id);
create index if not exists pos_returns_ngay on public.pos_returns(store_location, created_at desc);

create table if not exists public.pos_return_lines (
  id bigserial primary key,
  return_id uuid not null references public.pos_returns(id) on delete cascade,
  invoice_line_id bigint references public.pos_invoice_lines(id) on delete set null,
  product_id uuid references public.products(id) on delete set null,
  variant_id uuid references public.product_variants(id) on delete set null,
  size text,
  name text not null,
  qty numeric(12,2) not null check (qty > 0),
  unit_price numeric(14,0) not null,   -- giá trả 1 cái
  max_price numeric(14,0) not null,    -- giá khách đã thực mua 1 cái (trần)
  line_total numeric(14,0) not null,
  is_gift boolean not null default false
);
create index if not exists pos_return_lines_tra on public.pos_return_lines(return_id);
create index if not exists pos_return_lines_dong on public.pos_return_lines(invoice_line_id);

alter table public.pos_returns enable row level security;
alter table public.pos_return_lines enable row level security;
drop policy if exists pos_returns_doc on public.pos_returns;
create policy pos_returns_doc on public.pos_returns for select to authenticated using (public.pos_cap_do() is not null);
drop policy if exists pos_return_lines_doc on public.pos_return_lines;
create policy pos_return_lines_doc on public.pos_return_lines for select to authenticated using (public.pos_cap_do() is not null);
revoke all on public.pos_returns, public.pos_return_lines from anon, authenticated;
grant select on public.pos_returns, public.pos_return_lines to authenticated;

-- ───────── Tồn: trả về đúng lô hoá đơn gốc ─────────
create or replace function public.pos__lo_cong(p_store text, p_product uuid, p_size text, p_name text, p_delta numeric,
  p_ref_type text, p_ref_code text, p_ton_moi numeric)
returns void language plpgsql security definer set search_path = public as $$
declare v_size text := nullif(p_size, ''); v_con numeric; v_lay numeric; r record; v_lot bigint;
  v_het numeric; v_tong numeric; v_hd public.pos_invoices; v_refs text[];
begin
  if p_store is null or coalesce(p_delta, 0) = 0 then return; end if;

  if p_delta > 0 then
    v_con := p_delta;
    if p_ref_type in ('huy_hd', 'huy_phieu', 'tra_hang') then
      -- Trả lại đúng lô chứng từ này đã trừ. Trả hàng: lô hoá đơn gốc đã trừ, bớt phần các phiếu trả trước đã trả về.
      v_refs := array[p_ref_code];
      if p_ref_type = 'tra_hang' then
        select array_agg(x) into v_refs from (
          select i.code x from public.pos_returns t join public.pos_invoices i on i.id = t.invoice_id where t.code = p_ref_code
          union select t2.code from public.pos_returns t2
            where t2.invoice_id = (select invoice_id from public.pos_returns where code = p_ref_code)) z;
        v_refs := coalesce(v_refs, array[p_ref_code]);
      end if;
      for r in select m.lot_id, -sum(m.delta) as da_tru
          from public.pos_stock_lot_moves m join public.pos_stock_lots l on l.id = m.lot_id
          where m.ref_code = any(v_refs) and l.store_location = p_store and l.product_id = p_product
            and l.size is not distinct from v_size
          group by m.lot_id having -sum(m.delta) > 0 order by m.lot_id desc loop
        v_lay := least(v_con, r.da_tru);
        update public.pos_stock_lots set qty = qty + v_lay where id = r.lot_id;
        insert into public.pos_stock_lot_moves(lot_id, delta, ref_type, ref_code) values (r.lot_id, v_lay, p_ref_type, p_ref_code);
        v_con := v_con - v_lay;
        exit when v_con <= 0;
      end loop;
    end if;
    if v_con > 0 then
      insert into public.pos_stock_lots(store_location, product_id, size, name, qty_in, qty, expiry_at, ref_type, ref_code)
      values (p_store, p_product, v_size, p_name, v_con, v_con,
        case when p_ref_type = 'nhan_hang' then public.pos__hsd_cua(p_product) end, p_ref_type, p_ref_code)
      returning id into v_lot;
      insert into public.pos_stock_lot_moves(lot_id, delta, ref_type, ref_code) values (v_lot, v_con, p_ref_type, p_ref_code);
    end if;
  else
    v_con := -p_delta;
    if p_ref_type = 'ban' then
      -- Còn bánh quá hạn mà bánh còn hạn không đủ → không cho bán (mất mạng thì ghi + báo).
      select coalesce(sum(qty), 0) into v_het from public.pos_stock_lots
        where store_location = p_store and product_id = p_product and size is not distinct from v_size
          and qty > 0 and expiry_at <= now();
      if v_het > 0 and (p_ton_moi - p_delta) - v_het < v_con then
        select * into v_hd from public.pos_invoices where code = p_ref_code;
        if not coalesce(v_hd.offline, false) then
          raise exception '"%" còn % cái QUÁ HẠN, chỉ còn % cái còn hạn — xuất huỷ bánh quá hạn, không bán cho khách',
            coalesce(p_name, 'Bánh'), to_char(v_het, 'FM999G990'), to_char(greatest((p_ton_moi - p_delta) - v_het, 0), 'FM999G990');
        end if;
        update public.pos_invoices set canh_bao = coalesce(canh_bao, '[]'::jsonb)
          || jsonb_build_array(jsonb_build_object('loai', 'ban_qua_han', 'mon', p_name, 'sl', v_con, 'qua_han', v_het))
          where id = v_hd.id;
        perform public.pos__bao_sep('pos-ban-qua-han:' || v_hd.id || ':' || p_product || ':' || coalesce(v_size, ''),
          '⚠️ Bán bánh quá hạn lúc mất mạng · ' || p_store,
          v_hd.code || ' · ' || coalesce(v_hd.cashier_name, '') || ' — "' || coalesce(p_name, 'Bánh') || '" bán ' || v_con
            || ' cái trong khi quầy chỉ còn bánh quá hạn. Kiểm lại với thu ngân.',
          v_hd.id, 'warning');
      end if;
    end if;
    if p_ref_type = 'huy_phieu' then
      -- Huỷ phiếu nhận hàng: bớt đúng lô phiếu đó tạo ra trước.
      for r in select id, qty from public.pos_stock_lots
          where ref_code = p_ref_code and store_location = p_store and product_id = p_product
            and size is not distinct from v_size and qty > 0 order by id desc for update loop
        v_lay := least(v_con, r.qty);
        update public.pos_stock_lots set qty = qty - v_lay where id = r.id;
        insert into public.pos_stock_lot_moves(lot_id, delta, ref_type, ref_code) values (r.id, -v_lay, p_ref_type, p_ref_code);
        v_con := v_con - v_lay;
        exit when v_con <= 0;
      end loop;
    end if;
    if v_con > 0 then
      for r in select id, qty from public.pos_stock_lots
          where store_location = p_store and product_id = p_product and size is not distinct from v_size and qty > 0
          order by case when p_ref_type = 'ban' and expiry_at <= now() then 1 else 0 end,   -- bán: lô còn hạn trước
                   expiry_at asc nulls last, id
          for update loop
        v_lay := least(v_con, r.qty);
        update public.pos_stock_lots set qty = qty - v_lay where id = r.id;
        insert into public.pos_stock_lot_moves(lot_id, delta, ref_type, ref_code) values (r.id, -v_lay, p_ref_type, p_ref_code);
        v_con := v_con - v_lay;
        exit when v_con <= 0;
      end loop;
    end if;
  end if;

  -- Tổng lô không được vượt tồn quầy (tồn bị sửa ở màn khác) → cắt lô cũ nhất cho khớp.
  select coalesce(sum(qty), 0) into v_tong from public.pos_stock_lots
    where store_location = p_store and product_id = p_product and size is not distinct from v_size and qty > 0;
  v_con := v_tong - greatest(coalesce(p_ton_moi, 0), 0);
  if v_con > 0 then
    for r in select id, qty from public.pos_stock_lots
        where store_location = p_store and product_id = p_product and size is not distinct from v_size and qty > 0
        order by expiry_at asc nulls last, id for update loop
      v_lay := least(v_con, r.qty);
      update public.pos_stock_lots set qty = qty - v_lay where id = r.id;
      insert into public.pos_stock_lot_moves(lot_id, delta, ref_type, ref_code) values (r.id, -v_lay, 'khop_ton', p_ref_code);
      v_con := v_con - v_lay;
      exit when v_con <= 0;
    end loop;
  end if;
end $$;

-- ───────── Trả hàng ─────────
create or replace function public.pos_tra_hang(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_cap text := public.pos_cap_do(); v_id uuid := nullif(p->>'id', '')::uuid; v_store text := p->>'store';
  v_h public.pos_invoices; v_t public.pos_returns; v_ca uuid; v_chu uuid; v_ten_chu text;
  v_x jsonb; v_l public.pos_invoice_lines; v_qty numeric; v_da numeric; v_max numeric; v_gia numeric;
  v_ty numeric; v_net numeric; v_goods numeric := 0; v_fee numeric; v_can numeric; v_tru numeric := 0; v_hoan numeric;
  v_pt text := coalesce(nullif(p->>'pay_method', ''), 'tien_mat'); v_dong jsonb := '[]'; v_ids bigint[] := '{}';
  v_pts int := 0; v_code text; v_so_mon numeric := 0; d jsonb; f text := 'FM999G999G999';
begin
  if v_cap is null then raise exception 'Tài khoản chưa được duyệt'; end if;
  if v_id is null then raise exception 'Thiếu mã phiếu trả'; end if;
  select * into v_t from public.pos_returns where id = v_id;
  if v_t.id is not null then return to_jsonb(v_t) || jsonb_build_object('da_co', true); end if;   -- bấm 2 lần
  if not exists (select 1 from public.pos_settings where store_location = v_store) then raise exception 'Chi nhánh không hợp lệ'; end if;
  if v_pt not in ('tien_mat', 'chuyen_khoan') then raise exception 'Chọn trả khách bằng tiền mặt hoặc chuyển khoản'; end if;
  select * into v_h from public.pos_invoices where id = nullif(p->>'invoice_id', '')::uuid for update;
  if v_h.id is null then raise exception 'Chọn hoá đơn khách đã mua để trả hàng'; end if;
  if v_h.status <> 'xong' then raise exception 'Hoá đơn % đã huỷ — không trả hàng được', v_h.code; end if;
  if v_cap = 'nv' and v_h.created_at < now() - interval '7 days' then
    raise exception 'Hoá đơn % đã quá 7 ngày — nhờ Quản lý / Giám đốc trả hàng', v_h.code;
  end if;
  v_ca := public.pos__ca_mo(v_store);
  if v_cap = 'nv' then
    select s.opened_by, s.opened_by_name into v_chu, v_ten_chu from public.pos_shifts s where s.id = v_ca;
    if v_ca is null then raise exception 'Bạn chưa vào ca — vào ca rồi mới trả hàng được'; end if;
    if v_chu is distinct from auth.uid() then
      raise exception 'Ca đang mở là của % — bấm Nhận ca rồi mới trả hàng được', coalesce(v_ten_chu, 'người khác');
    end if;
  end if;
  if jsonb_typeof(p->'lines') <> 'array' or jsonb_array_length(p->'lines') = 0 then raise exception 'Chọn ít nhất 1 món khách trả'; end if;

  -- Giá khách thực trả cho 1 cái = giá trên dòng × (tiền hàng − giảm giá hoá đơn/khuyến mại − điểm) / tiền hàng.
  v_net := greatest(v_h.subtotal - v_h.invoice_discount - v_h.points_value, 0);
  v_ty := case when v_h.subtotal > 0 then v_net / v_h.subtotal else 0 end;
  for v_x in select value from jsonb_array_elements(p->'lines') loop
    v_qty := nullif(v_x->>'qty', '')::numeric;
    if v_qty is null or v_qty <= 0 then continue; end if;
    select * into v_l from public.pos_invoice_lines where id = nullif(v_x->>'line_id', '')::bigint and invoice_id = v_h.id;
    if v_l.id is null then raise exception 'Món trả không thuộc hoá đơn %', v_h.code; end if;
    if v_l.id = any(v_ids) then raise exception 'Món "%" bị chọn 2 lần', v_l.name; end if;
    v_ids := v_ids || v_l.id;
    select coalesce(sum(rl.qty), 0) into v_da from public.pos_return_lines rl join public.pos_returns t on t.id = rl.return_id
      where rl.invoice_line_id = v_l.id and t.status = 'xong';
    if v_qty > v_l.qty - v_da then
      raise exception '"%" khách mua %, đã trả %, chỉ còn trả được %', v_l.name, to_char(v_l.qty, 'FM999G990.##'),
        to_char(v_da, 'FM999G990.##'), to_char(greatest(v_l.qty - v_da, 0), 'FM999G990.##');
    end if;
    v_max := case when v_l.is_gift then 0 else round(v_l.unit_price * v_ty) end;
    v_gia := coalesce(round(nullif(v_x->>'unit_price', '')::numeric), v_max);
    if v_gia < 0 then raise exception 'Giá trả "%" không hợp lệ', v_l.name; end if;
    if v_gia > v_max then
      raise exception 'Giá trả "%" không được cao hơn giá khách đã mua (% đ/cái)', v_l.name, to_char(v_max, f);
    end if;
    v_goods := v_goods + round(v_gia * v_qty);
    v_so_mon := v_so_mon + v_qty;
    v_dong := v_dong || jsonb_build_array(jsonb_build_object('l', to_jsonb(v_l), 'qty', v_qty, 'gia', v_gia, 'max', v_max));
  end loop;
  if jsonb_array_length(v_dong) = 0 then raise exception 'Chọn ít nhất 1 món khách trả'; end if;
  v_fee := round(coalesce(nullif(p->>'fee', '')::numeric, 0));
  if v_fee < 0 or v_fee > v_goods then raise exception 'Phí trả hàng phải từ 0 đến % đ', to_char(v_goods, f); end if;
  v_can := v_goods - v_fee;

  -- Khách còn nợ hoá đơn này → trừ nợ trước.
  if v_h.customer_id is not null and v_h.debt_amount > 0 then
    v_tru := least(v_can,
      greatest(v_h.debt_amount - coalesce((select sum(debt_offset) from public.pos_returns where invoice_id = v_h.id and status = 'xong'), 0), 0),
      greatest(public.pos__no_cua(v_h.customer_id), 0));
  end if;
  v_hoan := v_can - v_tru;

  -- Điểm đã tích từ phần hàng trả → trừ lại (không trừ quá số đã tích).
  if v_h.customer_id is not null and v_h.points_earned > 0 and v_net > 0 then
    v_pts := least(floor(v_h.points_earned * v_goods / v_net)::int,
      v_h.points_earned - coalesce((select sum(points_back) from public.pos_returns where invoice_id = v_h.id and status = 'xong'), 0)::int);
    v_pts := greatest(v_pts, 0);
  end if;

  v_code := 'TH' || lpad(nextval('public.pos_return_seq')::text, 6, '0');
  insert into public.pos_returns(id, code, store_location, invoice_id, invoice_code, shift_id, customer_id, customer_name,
    goods_value, fee, debt_offset, refund, points_back, pay_method, note, created_by, created_by_name)
  values (v_id, v_code, v_store, v_h.id, v_h.code, v_ca, v_h.customer_id, coalesce(v_h.customer_name, 'Khách lẻ'),
    v_goods, v_fee, v_tru, v_hoan, v_pts, v_pt, nullif(btrim(coalesce(p->>'note', '')), ''), auth.uid(), public.pos_ten_toi())
  returning * into v_t;
  for d in select value from jsonb_array_elements(v_dong) loop
    insert into public.pos_return_lines(return_id, invoice_line_id, product_id, variant_id, size, name, qty, unit_price, max_price, line_total, is_gift)
    values (v_id, (d->'l'->>'id')::bigint, nullif(d->'l'->>'product_id', '')::uuid, nullif(d->'l'->>'variant_id', '')::uuid,
      nullif(d->'l'->>'size', ''), d->'l'->>'name', (d->>'qty')::numeric, (d->>'gia')::numeric, (d->>'max')::numeric,
      round((d->>'gia')::numeric * (d->>'qty')::numeric), coalesce((d->'l'->>'is_gift')::boolean, false));
    if nullif(d->'l'->>'product_id', '') is not null then
      perform public.pos__ton_cong(v_store, (d->'l'->>'product_id')::uuid, d->'l'->>'size', d->'l'->>'name', (d->>'qty')::numeric, 'tra_hang', v_code);
    end if;
  end loop;
  if v_tru > 0 then
    insert into public.pos_debt_entries(id, customer_id, invoice_id, entry_type, amount, store_location, shift_id, note, created_by, created_by_name)
    values (gen_random_uuid(), v_h.customer_id, v_h.id, 'dieu_chinh', -v_tru, v_store, v_ca, 'Trả hàng ' || v_code || ' (' || v_h.code || ')',
      auth.uid(), public.pos_ten_toi());
  end if;
  if v_pts > 0 then
    insert into public.pos_points_entries(customer_id, invoice_id, points, note) values (v_h.customer_id, v_h.id, -v_pts, 'Trả hàng ' || v_code);
  end if;
  perform public.pos__ghi_nhat_ky(v_store, 'tra_hang', v_code, jsonb_build_object('hoa_don', v_h.code, 'tien_hang', v_goods,
    'phi', v_fee, 'tru_no', v_tru, 'tra_khach', v_hoan, 'pt', v_pt, 'diem', v_pts));
  perform public.pos__bao_sep('pos-tra-hang:' || v_id,
    '↩️ Trả hàng ' || v_code || ' — ' || v_store,
    coalesce(public.pos_ten_toi(), '') || ' nhận trả ' || to_char(v_so_mon, 'FM999G990.##') || ' món của ' || v_h.code
      || ' (' || coalesce(v_h.customer_name, 'Khách lẻ') || ', bán ' || to_char(v_h.created_at at time zone 'Asia/Ho_Chi_Minh', 'DD/MM HH24:MI') || '). '
      || case when v_hoan > 0 then 'Trả khách ' || to_char(v_hoan, f) || 'đ ' || case when v_pt = 'tien_mat' then 'tiền mặt' else 'chuyển khoản' end else 'Không trả tiền' end
      || case when v_tru > 0 then ', trừ nợ ' || to_char(v_tru, f) || 'đ' else '' end
      || case when v_fee > 0 then ', phí trả hàng ' || to_char(v_fee, f) || 'đ' else '' end
      || coalesce('. Lý do: ' || v_t.note, '') || '.',
    v_id, case when v_hoan > 0 then 'warning' else 'info' end);
  return to_jsonb(v_t) || jsonb_build_object('lines',
    (select coalesce(jsonb_agg(to_jsonb(rl) order by rl.id), '[]') from public.pos_return_lines rl where rl.return_id = v_id));
end $$;
revoke all on function public.pos_tra_hang(jsonb) from public, anon;
grant execute on function public.pos_tra_hang(jsonb) to authenticated;

-- ───────── Két ca trừ tiền mặt trả khách ─────────
create or replace function public.pos__so_lieu_ca(p_shift uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  with s as (select * from public.pos_shifts where id = p_shift),
  hd as (select * from public.pos_invoices where shift_id = p_shift and status = 'xong'),
  tn as (select * from public.pos_debt_entries where shift_id = p_shift and entry_type = 'thu_no'),
  dn as (select * from public.pos_order_payments where shift_id = p_shift),
  pc as (select * from public.pos_cash_outs where shift_id = p_shift and status = 'xong' and kind = 'chi'),
  pt as (select * from public.pos_cash_outs where shift_id = p_shift and status = 'xong' and kind = 'thu'),
  th as (select * from public.pos_returns where shift_id = p_shift and status = 'xong'),
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
    'thu_ket', (select coalesce(sum(amount), 0) from pt),
    'phieu_thu', coalesce((select jsonb_agg(jsonb_build_object('code', code, 'so_tien', amount, 'ly_do', reason,
      'nguoi', created_by_name, 'luc', created_at) order by created_at) from pt), '[]'::jsonb),
    'phieu_chi', coalesce((select jsonb_agg(jsonb_build_object('code', code, 'so_tien', amount, 'ly_do', reason, 'truoc_ca', truoc_ca,
      'nguoi', created_by_name, 'luc', created_at) order by created_at) from pc), '[]'::jsonb),
    'tra_hang', jsonb_build_object('so', (select count(*) from th),
      'tien_mat', (select coalesce(sum(refund), 0) from th where pay_method = 'tien_mat'),
      'chuyen_khoan', (select coalesce(sum(refund), 0) from th where pay_method = 'chuyen_khoan')),
    'tien_mat_trong_ca',
      (select coalesce(sum(public.pos__tt(pay_method, paid_amount, pay_parts, 'tien_mat')), 0) from hd)
      + (select coalesce(-sum(amount), 0) from tn where pay_method = 'tien_mat')
      + (select coalesce(sum(amount), 0) from dn where pay_method = 'tien_mat')
      - (select coalesce(sum(public.pos__tt(pay_method, paid_amount, pay_parts, 'tien_mat')), 0) from ht)
      - (select coalesce(sum(amount), 0) from pc)
      + (select coalesce(sum(amount), 0) from pt)
      - (select coalesce(sum(refund), 0) from th where pay_method = 'tien_mat'))
$$;

-- ───────── Doanh số nhân viên trừ phần khách trả ─────────
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
  th as (select invoice_id, sum(refund) as hoan, sum(debt_offset) as tru_no
           from public.pos_returns where status = 'xong' and invoice_id is not null group by invoice_id),
  x as (
    select i.*, coalesce(n.da_tra, 0) as no_da_tra, coalesce(th.hoan, 0) as tra_hoan, coalesce(th.tru_no, 0) as tra_tru_no,
      case when i.total > 0 then greatest(i.total - i.vat_amount - i.other_fee, 0) / i.total else 0 end as ty_le,
      case when i.pay_method = 'chuyen_khoan' and i.transfer_status <> 'da_ve' then 0 else i.paid_amount end as thu_ngay,
      (coalesce(i.customer_phone, '') <> '' and public.pos__sdt(i.customer_phone) in (select s from sdt_nv)) as la_nv
    from public.pos_invoices i
    left join no_hd n on n.invoice_id = i.id
    left join th on th.invoice_id = i.id
    where i.status = 'xong' and i.created_at >= p_from and i.created_at < p_to
  )
  select x.id, x.code, x.shift_id, x.cashier_id, x.cashier_name, x.store_location, x.created_at, x.pay_method, x.total,
    round(greatest(x.total - x.tra_hoan - x.tra_tru_no, 0) * x.ty_le),
    case when x.ds_loai or x.la_nv then 0 else round(greatest(x.thu_ngay + x.no_da_tra - x.tra_hoan, 0) * x.ty_le) end,
    round(greatest(x.thu_ngay + x.no_da_tra - x.tra_hoan, 0) * x.ty_le),
    case when x.ds_loai or x.la_nv then 0 when x.pay_method = 'chuyen_khoan' and x.transfer_status = 'cho_xac_nhan' then round(x.paid_amount * x.ty_le) else 0 end,
    case when x.ds_loai or x.la_nv then 0 else round(greatest(x.debt_amount - x.no_da_tra - x.tra_tru_no, 0) * x.ty_le) end,
    x.ds_loai, x.la_nv, x.offline, x.canh_bao, x.photo_url, x.customer_name, x.ds_loai_ly_do
  from x
$$;

-- ───────── Sổ quỹ ─────────
create or replace function public.pos_so_quy(p_store text, p_from timestamptz, p_to timestamptz)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_cap text := public.pos_cap_do(); v jsonb;
begin
  if not (v_cap in ('gd', 'ql') or public.pos_la_ke_toan()) then raise exception 'Chỉ Quản lý / Giám đốc / Kế toán xem sổ quỹ'; end if;
  if p_from is null or p_to is null or p_to <= p_from then raise exception 'Khoảng ngày không hợp lệ'; end if;
  if p_to - p_from > interval '93 days' then raise exception 'Chọn tối đa 3 tháng'; end if;
  with dong as (
    select 'ban_hang'::text loai, i.code ma, i.created_at luc, x.pt, x.tien thu, 0::numeric chi,
           i.customer_name doi_tuong, coalesce(i.seller_name, i.cashier_name) nguoi, i.store_location cn, null::text ghi_chu
      from public.pos_invoices i cross join lateral public.pos__cac_pt(i.pay_method, i.paid_amount, i.pay_parts) x
      where i.status = 'xong' and x.tien > 0 and i.created_at < p_to and (p_store is null or i.store_location = p_store)
    union all
    select 'thu_no', coalesce(i.code, ''), d.created_at, coalesce(d.pay_method, 'tien_mat'), -d.amount, 0, c.name, d.created_by_name, d.store_location, d.note
      from public.pos_debt_entries d left join public.pos_invoices i on i.id = d.invoice_id left join public.customers c on c.id = d.customer_id
      where d.entry_type = 'thu_no' and d.amount < 0 and d.created_at < p_to and (p_store is null or d.store_location = p_store)
    union all
    select case when p.kind = 'coc' then 'thu_coc' else 'lay_banh' end, coalesce(p.order_code, ''), p.created_at, p.pay_method, p.amount, 0,
           null, p.created_by_name, p.store_location, null
      from public.pos_order_payments p where p.created_at < p_to and (p_store is null or p.store_location = p_store)
    union all
    select case when o.kind = 'thu' then 'phieu_thu' else 'phieu_chi' end, o.code, o.created_at, 'tien_mat',
           case when o.kind = 'thu' then o.amount else 0 end, case when o.kind = 'thu' then 0 else o.amount end,
           o.doi_tuong, o.created_by_name, o.store_location, concat_ws(' · ', o.loai, o.reason)
      from public.pos_cash_outs o where o.status = 'xong' and o.created_at < p_to and (p_store is null or o.store_location = p_store)
    union all
    select 'tra_hang', t.code, t.created_at, t.pay_method, 0, t.refund, t.customer_name, t.created_by_name, t.store_location,
           concat_ws(' · ', 'Trả hàng ' || coalesce(t.invoice_code, ''), t.note)
      from public.pos_returns t where t.status = 'xong' and t.refund > 0 and t.created_at < p_to and (p_store is null or t.store_location = p_store)
  ), q as (
    select d.*, case when d.pt in ('chuyen_khoan', 'the') then 'ngan_hang' when d.pt = 'vi' then 'vi' else 'tien_mat' end quy from dong d
  )
  select jsonb_build_object(
    'quy', (select jsonb_object_agg(k, jsonb_build_object(
        'dau_ky', (select coalesce(sum(thu - chi), 0) from q where (k = 'tong' or quy = k) and luc < p_from),
        'thu', (select coalesce(sum(thu), 0) from q where (k = 'tong' or quy = k) and luc >= p_from),
        'chi', (select coalesce(sum(chi), 0) from q where (k = 'tong' or quy = k) and luc >= p_from)))
      from unnest(array['tien_mat', 'ngan_hang', 'vi', 'tong']) k),
    'so_dong', (select count(*) from q where luc >= p_from),
    'dong', (select coalesce(jsonb_agg(r order by r->>'luc' desc), '[]') from (
        select jsonb_build_object('loai', loai, 'ma', ma, 'luc', luc, 'pt', pt, 'quy', quy, 'thu', thu, 'chi', chi,
          'doi_tuong', doi_tuong, 'nguoi', nguoi, 'cn', cn, 'ghi_chu', ghi_chu) r
        from q where luc >= p_from order by luc desc limit 1000) t)
  ) into v;
  return v;
end $$;
revoke all on function public.pos_so_quy(text, timestamptz, timestamptz) from public, anon;
grant execute on function public.pos_so_quy(text, timestamptz, timestamptz) to authenticated;

-- ───────── Báo cáo cuối ngày ─────────
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
  ln as (select l.* from public.pos_invoice_lines l join hd on hd.id = l.invoice_id),
  th as (
    select t.* from public.pos_returns t
    where t.status = 'xong' and (p_store is null or t.store_location = p_store) and t.created_at >= p_from and t.created_at < p_to
      and (v_tao is null or t.created_by = any(v_tao))
      and (v_nv is null or t.created_by_name = any(v_nv))
      and (v_ban is null or 'khong_giao' = any(v_ban))
  ),
  chi as (select 'tra_hang'::text as loai, code as ma, created_at as luc, -refund as tien, pay_method as pt, created_by_name as nguoi, customer_name as khach
          from th where refund > 0 and (v_pt is null or pay_method = any(v_pt)))
  select jsonb_build_object(
    'tong_thu', (select coalesce(sum(tien), 0) from thu),
    'tong_chi', (select coalesce(-sum(tien), 0) from chi),
    'pttt', jsonb_build_object(
      'tien_mat', (select coalesce(sum(tien), 0) from thu where pt = 'tien_mat') + (select coalesce(sum(tien), 0) from chi where pt = 'tien_mat'),
      'chuyen_khoan', (select coalesce(sum(tien), 0) from thu where pt = 'chuyen_khoan') + (select coalesce(sum(tien), 0) from chi where pt = 'chuyen_khoan'),
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
    'tra_hang', jsonb_build_object('so', (select count(*) from th), 'tien_hang', (select coalesce(sum(goods_value), 0) from th),
      'phi', (select coalesce(sum(fee), 0) from th), 'tra_khach', (select coalesce(sum(refund), 0) from th),
      'tru_no', (select coalesce(sum(debt_offset), 0) from th),
      'so_luong', (select coalesce(sum(l.qty), 0) from public.pos_return_lines l join th on th.id = l.return_id)),
    'phieu', (select coalesce(jsonb_agg(r order by r->>'luc' desc), '[]') from (
        select jsonb_build_object('loai', loai, 'ma', ma, 'luc', luc, 'tien', tien, 'pt', pt, 'nguoi', nguoi, 'khach', khach) r
        from (select * from thu union all select * from chi) u order by luc desc limit 300) t),
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

-- ───────── Báo cáo Giám đốc ─────────
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
    'tra_hang', (select jsonb_build_object('so', count(*), 'tien_hang', coalesce(sum(goods_value), 0), 'tra_khach', coalesce(sum(refund), 0))
        from public.pos_returns where status = 'xong' and (p_store is null or store_location = p_store)
          and created_at >= p_from and created_at < p_to),
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
revoke all on function public.pos_bao_cao(text, timestamptz, timestamptz) from public, anon;
grant execute on function public.pos_bao_cao(text, timestamptz, timestamptz) to authenticated;

-- ───────── Hoá đơn đã có phiếu trả hàng thì không huỷ nữa (tránh trả tồn / tiền 2 lần) ─────────
create or replace function public.pos_huy_hd(p_id uuid, p_reason text, p_approval_id uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_cap text := public.pos_cap_do(); v_h public.pos_invoices; v_l record; v_ap public.pos_approvals;
begin
  if v_cap is null then raise exception 'Tài khoản chưa được duyệt'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'Ghi lý do huỷ'; end if;
  select * into v_h from public.pos_invoices where id = p_id for update;
  if v_h.id is null then raise exception 'Không tìm thấy hoá đơn'; end if;
  if v_h.status = 'huy' then return to_jsonb(v_h); end if;
  if exists (select 1 from public.pos_returns where invoice_id = p_id and status = 'xong') then
    raise exception 'Hoá đơn % đã có phiếu trả hàng — không huỷ được nữa. Khách trả thêm thì làm Trả hàng tiếp', v_h.code;
  end if;
  if v_cap = 'nv' and v_h.shift_id is distinct from public.pos__ca_mo(v_h.store_location) then
    select * into v_ap from public.pos_approvals where id = p_approval_id for update;
    if v_ap.id is null or v_ap.kind <> 'huy_hd' or v_ap.status <> 'dong_y' or v_ap.requested_by <> auth.uid()
      or v_ap.payload->>'invoice_id' <> p_id::text then
      raise exception 'Hoá đơn của ca đã đóng — cần Quản lý / Giám đốc duyệt huỷ';
    end if;
    update public.pos_approvals set status = 'da_dung' where id = v_ap.id;
  end if;
  update public.pos_invoices set status = 'huy', cancel_reason = trim(p_reason), cancelled_by = auth.uid(),
    cancelled_by_name = public.pos_ten_toi(), cancelled_at = now() where id = p_id returning * into v_h;
  for v_l in select * from public.pos_invoice_lines where invoice_id = p_id loop
    if v_l.product_id is not null then
      perform public.pos__ton_cong(v_h.store_location, v_l.product_id, v_l.size, v_l.name, v_l.qty, 'huy_hd', v_h.code);
    end if;
  end loop;
  if v_h.debt_amount > 0 then
    insert into public.pos_debt_entries(id, customer_id, invoice_id, entry_type, amount, store_location, shift_id, note, created_by, created_by_name)
    values (gen_random_uuid(), v_h.customer_id, v_h.id, 'huy_hd', -v_h.debt_amount, v_h.store_location,
      public.pos__ca_mo(v_h.store_location), 'Huỷ ' || v_h.code, auth.uid(), public.pos_ten_toi());
  end if;
  if v_h.customer_id is not null and (v_h.points_earned > 0 or v_h.points_used > 0) then
    insert into public.pos_points_entries(customer_id, invoice_id, points, note)
    values (v_h.customer_id, v_h.id, v_h.points_used - v_h.points_earned, 'Huỷ ' || v_h.code);
  end if;
  perform public.pos__ghi_nhat_ky(v_h.store_location, 'huy_hd', v_h.code,
    jsonb_build_object('ly_do', p_reason, 'tong', v_h.total, 'thu_ngan', v_h.cashier_name, 'duyet', p_approval_id));
  if v_h.shift_id is distinct from public.pos__ca_mo(v_h.store_location) then
    perform public.pos__bao_sep('pos-huy-hd:' || v_h.id, '🧾 Huỷ hoá đơn ca cũ ' || v_h.code,
      public.pos_ten_toi() || ' huỷ ' || v_h.code || ' (' || to_char(v_h.total, 'FM999G999G999') || 'đ). Lý do: ' || p_reason, v_h.id, 'warning');
  end if;
  return to_jsonb(v_h);
end $$;
revoke all on function public.pos_huy_hd(uuid, text, uuid) from public, anon;
grant execute on function public.pos_huy_hd(uuid, text, uuid) to authenticated;

insert into public.migration_runs(migration_key, status, finished_at, notes)
values ('202611221046_ban_hang_quay_tra_hang', 'completed', now(),
  'Bán tại quầy: Trả hàng như KiotViet (pos_returns TH…, pos_tra_hang): trừ nợ trước, trả tiền mặt/CK, tồn về lô gốc, trừ điểm, két ca / sổ quỹ / báo cáo / doanh số trừ phần trả; hoá đơn đã trả hàng thì không huỷ.')
on conflict (migration_key) do update set status = 'completed', finished_at = now(), notes = excluded.notes;

commit;
