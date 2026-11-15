-- BÁN TẠI QUẦY — hạn sử dụng theo LÔ (Giám đốc duyệt 15/11/2026). Chỉ THÊM bảng + THAY 1 hàm nội bộ.
--
-- 1. pos_shelf_life: mỗi loại bánh cài "bán được trong N ngày" (tính cả ngày nhận). Quản lý / Giám đốc sửa.
-- 2. pos_stock_lots: mỗi lần quầy NHẬN HÀNG từ bếp = 1 lô, HSD tự tính = 0h ngày (nhận + N) giờ VN.
--    (N = 1 → hết hạn 0h đêm nay.) Món chưa cài N → lô không có HSD (không cảnh báo, không chặn).
-- 3. pos__ton_cong (chỗ DUY NHẤT tồn quầy thay đổi) giờ ghi luôn vào lô:
--      bán            → trừ lô CÒN HẠN cũ nhất trước; còn bánh quá hạn mà không đủ bánh còn hạn → CHẶN BÁN
--                       (bán lúc mất mạng thì vẫn ghi, gắn cờ canh_bao 'ban_qua_han' + báo Giám đốc)
--      xuất huỷ / nội bộ / kiểm kho thiếu → trừ lô hết hạn sớm nhất trước
--      huỷ hoá đơn / huỷ phiếu xuất  → trả về ĐÚNG lô đã trừ
--      huỷ phiếu nhận hàng           → bớt đúng lô phiếu đó tạo ra
--    Luôn giữ: tổng lô ≤ tồn quầy (tồn bị sửa ở màn khác thì lô cũ nhất bị cắt bớt cho khớp).
-- 4. pos_bao_qua_han(): 23:00 mỗi tối, còn bánh hết hạn (tới hết hôm nay) chưa xuất huỷ → báo Giám đốc.
--
-- Tồn cũ trước khi chạy file này không có lô → không cảnh báo cho tới lần nhận hàng sau. Muốn tính ngay thì
-- làm 1 phiếu kiểm kho rồi nhận hàng lại, hoặc cứ để hàng cũ bán hết.
--
-- Chạy thử trước: thay "commit;" cuối file bằng "rollback;" rồi chạy, không lỗi mới chạy thật.

begin;
set local lock_timeout = '10s';
set local statement_timeout = '120s';

create table if not exists public.pos_shelf_life (
  product_id uuid primary key references public.products(id) on delete cascade,
  days int not null check (days between 1 and 365),
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists public.pos_stock_lots (
  id bigserial primary key,
  store_location text not null,
  product_id uuid not null,
  size text,
  name text,
  qty_in numeric(12,2) not null,
  qty numeric(12,2) not null,              -- còn lại
  received_at timestamptz not null default now(),
  expiry_at timestamptz,                   -- null = không theo dõi hạn
  ref_type text,
  ref_code text
);
create index if not exists pos_stock_lots_con on public.pos_stock_lots(store_location, product_id, size) where qty > 0;
create index if not exists pos_stock_lots_ref on public.pos_stock_lots(ref_code);

create table if not exists public.pos_stock_lot_moves (
  id bigserial primary key,
  at timestamptz not null default now(),
  lot_id bigint not null references public.pos_stock_lots(id) on delete cascade,
  delta numeric(12,2) not null,
  ref_type text,
  ref_code text
);
create index if not exists pos_stock_lot_moves_ref on public.pos_stock_lot_moves(ref_code);

do $$
declare t text;
begin
  foreach t in array array['pos_shelf_life', 'pos_stock_lots', 'pos_stock_lot_moves'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);   -- RLS không chặn TRUNCATE → thu hồi hết
    execute format('grant select on public.%I to authenticated', t);
    execute format('drop policy if exists %I on public.%I', t || '_doc', t);
  end loop;
end $$;
revoke all on sequence public.pos_stock_lots_id_seq, public.pos_stock_lot_moves_id_seq from anon, authenticated;
create policy pos_shelf_life_doc on public.pos_shelf_life for select to authenticated using (public.pos_cap_do() is not null);
create policy pos_stock_lots_doc on public.pos_stock_lots for select to authenticated using (public.pos_cap_do() is not null);
create policy pos_stock_lot_moves_doc on public.pos_stock_lot_moves for select to authenticated using (public.pos_cap_do() in ('gd', 'ql'));

-- HSD cho lô nhận hôm nay của 1 món (null nếu món chưa cài số ngày).
create or replace function public.pos__hsd_cua(p_product uuid)
returns timestamptz language sql stable security definer set search_path = public as $$
  select (((now() at time zone 'Asia/Ho_Chi_Minh')::date + s.days)::timestamp at time zone 'Asia/Ho_Chi_Minh')
  from public.pos_shelf_life s where s.product_id = p_product
$$;

-- Ghi lô cho 1 lần tồn quầy đổi. Gọi trong pos__ton_cong (đã giữ khoá tư vấn theo món/size/cửa hàng).
create or replace function public.pos__lo_cong(p_store text, p_product uuid, p_size text, p_name text, p_delta numeric,
  p_ref_type text, p_ref_code text, p_ton_moi numeric)
returns void language plpgsql security definer set search_path = public as $$
declare v_size text := nullif(p_size, ''); v_con numeric; v_lay numeric; r record; v_lot bigint;
  v_het numeric; v_tong numeric; v_hd public.pos_invoices;
begin
  if p_store is null or coalesce(p_delta, 0) = 0 then return; end if;

  if p_delta > 0 then
    v_con := p_delta;
    if p_ref_type in ('huy_hd', 'huy_phieu') then
      -- Trả lại đúng lô chứng từ này đã trừ.
      for r in select m.lot_id, -sum(m.delta) as da_tru
          from public.pos_stock_lot_moves m join public.pos_stock_lots l on l.id = m.lot_id
          where m.ref_code = p_ref_code and l.store_location = p_store and l.product_id = p_product
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

-- Thay pos__ton_cong: giữ y nguyên phần tồn tổng, thêm 1 dòng gọi pos__lo_cong.
create or replace function public.pos__ton_cong(p_store text, p_product uuid, p_size text, p_name text, p_delta numeric,
  p_ref_type text, p_ref_code text)
returns numeric language plpgsql security definer set search_path = public as $$
declare v_branch text := coalesce(public.pos__kho_cua(p_product), 'bakery');
  v_size text := nullif(p_size, ''); v_id uuid; v_qty numeric;
begin
  perform pg_advisory_xact_lock(hashtext('pos_ton:' || p_product || ':' || coalesce(v_size, '') || ':' || coalesce(p_store, '')));
  select id, qty into v_id, v_qty from public.finished_goods_stock
    where product_id = p_product and branch = v_branch and is_semi_finished = false
      and size is not distinct from v_size and store_location is not distinct from p_store
    order by updated_at desc nulls last limit 1 for update;
  if v_id is null then
    insert into public.finished_goods_stock(product_id, size, branch, store_location, qty, is_semi_finished)
    values (p_product, v_size, v_branch, p_store, p_delta, false) returning qty into v_qty;
  else
    update public.finished_goods_stock set qty = coalesce(qty, 0) + p_delta, updated_at = now()
      where id = v_id returning qty into v_qty;
  end if;
  insert into public.pos_stock_ledger(store_location, product_id, size, name, delta, balance_after, ref_type, ref_code, actor_name)
  values (p_store, p_product, v_size, p_name, p_delta, v_qty, p_ref_type, p_ref_code, public.pos_ten_toi());
  perform public.pos__lo_cong(p_store, p_product, v_size, p_name, p_delta, p_ref_type, p_ref_code, v_qty);
  return v_qty;
end $$;

-- Quản lý / Giám đốc cài số ngày bán được của 1 loại bánh (null/0 = bỏ theo dõi). Lô đã nhận giữ HSD cũ.
create or replace function public.pos_luu_han_dung(p_product uuid, p_days int)
returns void language plpgsql security definer set search_path = public as $$
begin
  if coalesce(public.pos_cap_do(), '') not in ('gd', 'ql') then raise exception 'Chỉ Quản lý / Giám đốc sửa hạn dùng'; end if;
  if not exists (select 1 from public.products where id = p_product) then raise exception 'Không tìm thấy món'; end if;
  if coalesce(p_days, 0) <= 0 then
    delete from public.pos_shelf_life where product_id = p_product;
  elsif p_days > 365 then
    raise exception 'Hạn dùng tối đa 365 ngày';
  else
    insert into public.pos_shelf_life(product_id, days, updated_by) values (p_product, p_days, auth.uid())
    on conflict (product_id) do update set days = excluded.days, updated_by = auth.uid(), updated_at = now();
  end if;
  perform public.pos__ghi_nhat_ky(null, 'han_dung', p_product::text, jsonb_build_object('so_ngay', p_days));
end $$;

-- 23:00 mỗi tối: bánh hết hạn (tới hết hôm nay) còn trên quầy chưa xuất huỷ → báo Giám đốc.
create or replace function public.pos_bao_qua_han()
returns int language plpgsql security definer set search_path = public as $$
declare r record; v_mai timestamptz := (((now() at time zone 'Asia/Ho_Chi_Minh')::date + 1)::timestamp at time zone 'Asia/Ho_Chi_Minh');
  v_ngay text := to_char(now() at time zone 'Asia/Ho_Chi_Minh', 'YYYYMMDD'); v_dem int := 0;
begin
  for r in
    select store_location, sum(sl) as tong, string_agg(ten || ' ×' || to_char(sl, 'FM999G990'), ', ' order by sl desc) as ds
    from (select store_location, coalesce(name, 'Bánh') || coalesce(' - ' || size, '') as ten, sum(qty) as sl
          from public.pos_stock_lots where qty > 0 and expiry_at <= v_mai
          group by store_location, coalesce(name, 'Bánh') || coalesce(' - ' || size, '')) x
    group by store_location
  loop
    perform public.pos__bao_sep('pos-qua-han:' || r.store_location || ':' || v_ngay,
      '🗑️ ' || r.store_location || ': ' || to_char(r.tong, 'FM999G990') || ' bánh hết hạn chưa xuất huỷ',
      r.ds || '. Ca sau mở máy sẽ thấy ô "Cần xuất huỷ" — chụp ảnh rồi làm phiếu xuất huỷ.',
      md5('pos-qua-han:' || r.store_location || ':' || v_ngay)::uuid, 'warning');
    v_dem := v_dem + 1;
  end loop;
  return v_dem;
end $$;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    if exists (select 1 from cron.job where jobname = 'sumi-pos-bao-qua-han') then
      perform cron.unschedule('sumi-pos-bao-qua-han');
    end if;
    perform cron.schedule('sumi-pos-bao-qua-han', '0 16 * * *', 'select public.pos_bao_qua_han()');  -- 16:00 UTC = 23:00 VN
  end if;
end $$;

revoke all on function public.pos__hsd_cua(uuid) from public, anon, authenticated;
revoke all on function public.pos__lo_cong(text, uuid, text, text, numeric, text, text, numeric) from public, anon, authenticated;
revoke all on function public.pos__ton_cong(text, uuid, text, text, numeric, text, text) from public, anon, authenticated;
revoke all on function public.pos_bao_qua_han() from public, anon, authenticated;
revoke all on function public.pos_luu_han_dung(uuid, int) from public, anon;
grant execute on function public.pos_luu_han_dung(uuid, int) to authenticated;

insert into public.migration_runs(migration_key, status, finished_at, notes)
values ('202611151000_ban_hang_quay_lo_hsd', 'completed', now(),
  'Bán tại quầy: HSD theo lô (pos_stock_lots), số ngày bán được theo món (pos_shelf_life), chặn bán bánh quá hạn, xuất huỷ trừ lô hết hạn trước, 23:00 báo GĐ bánh hết hạn chưa huỷ.')
on conflict (migration_key) do update set status = 'completed', finished_at = now(), notes = excluded.notes;

commit;
