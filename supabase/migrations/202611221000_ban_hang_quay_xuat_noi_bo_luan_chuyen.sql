-- Bán tại quầy: XUẤT DÙNG NỘI BỘ chạy thật cho nhân viên (như KiotViet) + LUÂN CHUYỂN BÁNH GIỮA CÁC CỬA HÀNG.
--  • Phiếu xuất dùng nội bộ (mã XD…): chọn bánh + số lượng + LOẠI XUẤT (đúng danh sách KiotViet của tiệm) + ghi chú.
--    Hoàn thành → trừ tồn cửa hàng lập phiếu.
--  • Loại xuất "Luân chuyển bánh giữa các cửa hàng": chọn CỬA HÀNG NHẬN. Hoàn thành → trừ tồn bên gửi và tạo
--    PHIẾU CHỜ NHẬN (mã NC…) ở cửa hàng nhận. Bên nhận đếm bánh thật, bấm "Nhận hàng" mới cộng tồn (lệch → báo GĐ).
--    Lô / hạn dùng đi theo bánh: lô bên nhận lấy hạn sớm nhất của lô bên gửi đã trừ.
--  • Huỷ phiếu XD luân chuyển: chỉ được khi bên nhận CHƯA nhận (huỷ luôn phiếu chờ nhận). Đã nhận → không huỷ, kiểm kho.
--    Phiếu NC không huỷ riêng (huỷ từ phiếu XD bên gửi).
-- Chỉ THÊM cột + mở rộng hàm (giữ nguyên chữ ký pos_luu_phieu / pos_nhan_hang / pos_huy_phieu).
-- Code cũ vẫn chạy với SQL này (không gửi loai_xuat → ghi như cũ). Chạy trước hay sau khi code lên đều được.
begin;
set local lock_timeout = '10s';

alter table public.pos_stock_docs add column if not exists loai_xuat text;
alter table public.pos_stock_docs add column if not exists to_store text;
alter table public.pos_stock_docs add column if not exists from_store text;
alter table public.pos_stock_docs add column if not exists ref_doc uuid;

-- Thêm loại phiếu 'nhan_chuyen' (phiếu chờ nhận ở cửa hàng nhận). Đổi ràng buộc kiểm tra, không đụng dữ liệu.
do $$
declare r record;
begin
  for r in select c.conname from pg_constraint c
    where c.conrelid = 'public.pos_stock_docs'::regclass and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%doc_type%' loop
    execute format('alter table public.pos_stock_docs drop constraint %I', r.conname);
  end loop;
end $$;
alter table public.pos_stock_docs add constraint pos_stock_docs_doc_type_check
  check (doc_type in ('bep_giao', 'xuat_huy', 'kiem_kho', 'noi_bo', 'nhan_chuyen'));
create index if not exists pos_stock_docs_ref_doc_idx on public.pos_stock_docs(ref_doc) where ref_doc is not null;

-- ───────── Lưu / chốt phiếu kho (bản 161010 + loại xuất + luân chuyển) ─────────
create or replace function public.pos_luu_phieu(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_cap text := public.pos_cap_do(); v_id uuid := (p->>'id')::uuid; v_d public.pos_stock_docs;
  v_type text := p->>'type'; v_store text := p->>'store'; v_status text := coalesce(p->>'status', 'xong');
  v_lines jsonb := '[]'; v_l jsonb; v_ton numeric; v_delta numeric; v_qty numeric;
  v_loai text := nullif(btrim(coalesce(p->>'loai_xuat', '')), '');
  v_den text := nullif(btrim(coalesce(p->>'to_store', '')), '');
  v_lc boolean; v_nc public.pos_stock_docs; v_nc_lines jsonb := '[]'; v_tong numeric := 0;
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
  if v_type <> 'noi_bo' then v_loai := null; v_den := null; end if;
  if v_loai is not null and length(v_loai) > 80 then raise exception 'Loại xuất không hợp lệ'; end if;
  v_lc := v_type = 'noi_bo' and lower(coalesce(v_loai, '')) like 'luân chuyển%';
  if not v_lc then v_den := null; end if;
  if v_status = 'xong' and v_type = 'noi_bo' and p ? 'loai_xuat' and v_loai is null then
    raise exception 'Chọn loại xuất trước khi hoàn thành';
  end if;
  if v_lc and v_status = 'xong' then
    if v_den is null then raise exception 'Chọn cửa hàng nhận bánh'; end if;
    if v_den = v_store then raise exception 'Cửa hàng nhận phải khác cửa hàng đang xuất'; end if;
    if not exists (select 1 from public.pos_settings where store_location = v_den) then raise exception 'Cửa hàng nhận không hợp lệ'; end if;
  end if;

  for v_l in select value from jsonb_array_elements(p->'lines') loop
    v_qty := coalesce((v_l->>'qty')::numeric, 0);
    if v_qty < 0 or (v_type <> 'kiem_kho' and v_qty = 0) then raise exception 'Số lượng "%" không hợp lệ', v_l->>'name'; end if;
    v_lines := v_lines || jsonb_build_array(v_l);
  end loop;

  if v_d.id is null then
    insert into public.pos_stock_docs(id, code, doc_type, store_location, status, lines, reason, note, photo_url, shift_id,
      created_by, created_by_name, loai_xuat, to_store)
    values (v_id, case v_type when 'bep_giao' then 'PN' when 'xuat_huy' then 'XH' when 'kiem_kho' then 'KK' else 'XD' end
        || lpad(nextval('public.pos_doc_seq')::text, 6, '0'),
      v_type, v_store, 'tam', v_lines, nullif(trim(p->>'reason'), ''), nullif(p->>'note', ''), nullif(p->>'photo_url', ''),
      public.pos__ca_mo(v_store), auth.uid(), public.pos_ten_toi(), v_loai, v_den)
    returning * into v_d;
  else
    update public.pos_stock_docs set lines = v_lines, reason = nullif(trim(p->>'reason'), ''), note = nullif(p->>'note', ''),
      photo_url = nullif(p->>'photo_url', ''), loai_xuat = v_loai, to_store = v_den where id = v_id returning * into v_d;
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
    if v_lc then
      v_nc_lines := v_nc_lines || jsonb_build_array(jsonb_build_object('product_id', v_l->'product_id', 'variant_id', v_l->'variant_id',
        'size', v_l->'size', 'name', v_l->'name', 'qty', v_qty));
      v_tong := v_tong + v_qty;
    end if;
  end loop;
  update public.pos_stock_docs set status = 'xong', lines = v_lines, done_by = auth.uid(), done_by_name = public.pos_ten_toi(), done_at = now()
  where id = v_id returning * into v_d;

  if v_lc then
    insert into public.pos_stock_docs(id, code, doc_type, store_location, status, lines, note, created_by, created_by_name,
      from_store, ref_doc, loai_xuat)
    values (gen_random_uuid(), 'NC' || lpad(nextval('public.pos_doc_seq')::text, 6, '0'), 'nhan_chuyen', v_den, 'cho_nhan',
      v_nc_lines, v_d.note, auth.uid(), public.pos_ten_toi(), v_store, v_d.id, v_d.loai_xuat)
    returning * into v_nc;
    update public.pos_stock_docs set ref_doc = v_nc.id where id = v_d.id returning * into v_d;
    perform public.pos__bao_quan_ly('pos-chuyen-banh:' || v_nc.id, '🚚 ' || v_store || ' chuyển bánh sang ' || v_den,
      v_d.code || ' · ' || coalesce(v_d.created_by_name, '') || ' gửi ' || trim(to_char(v_tong, 'FM999G990')) || ' bánh. '
        || v_den || ' đếm rồi bấm Nhận hàng ở phiếu ' || v_nc.code || '.', v_nc.id);
  end if;
  perform public.pos__ghi_nhat_ky(v_store, v_type, v_d.code,
    jsonb_build_object('ly_do', v_d.reason, 'loai_xuat', v_d.loai_xuat, 'den', v_d.to_store, 'dong', v_lines));
  return to_jsonb(v_d);
end $$;

-- ───────── Nhận hàng: phiếu bếp giao (như cũ) + phiếu chuyển từ cửa hàng khác ─────────
create or replace function public.pos_nhan_hang(p_id uuid, p_received jsonb, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_d public.pos_stock_docs; v_l jsonb; v_lines jsonb := '[]'; v_nhan numeric; v_giao numeric; v_lech text := '';
  v_nguon public.pos_stock_docs; v_hsd timestamptz;
begin
  if public.pos_cap_do() is null then raise exception 'Tài khoản chưa được duyệt'; end if;
  select * into v_d from public.pos_stock_docs where id = p_id for update;
  if v_d.id is null or v_d.doc_type not in ('bep_giao', 'nhan_chuyen') then raise exception 'Không tìm thấy phiếu chờ nhận'; end if;
  if v_d.status <> 'cho_nhan' then return to_jsonb(v_d); end if;
  if v_d.doc_type = 'nhan_chuyen' then select * into v_nguon from public.pos_stock_docs where id = v_d.ref_doc; end if;
  for v_l in select value from jsonb_array_elements(v_d.lines) loop
    v_giao := coalesce((v_l->>'qty')::numeric, 0);
    v_nhan := coalesce((p_received->>((v_l->>'product_id') || ':' || coalesce(v_l->>'size', '')))::numeric, v_giao);
    if v_nhan < 0 then raise exception 'Số thực nhận không hợp lệ'; end if;
    if v_d.doc_type = 'bep_giao' then
      if v_nhan > 0 then perform public.pos__ton_cong(v_d.store_location, (v_l->>'product_id')::uuid, v_l->>'size', v_l->>'name', v_nhan, 'nhan_hang', v_d.code); end if;
      perform public.pos__ton_cong(null, (v_l->>'product_id')::uuid, v_l->>'size', v_l->>'name', -v_giao, 'bep_giao', v_d.code);
    elsif v_nhan > 0 then
      perform public.pos__ton_cong(v_d.store_location, (v_l->>'product_id')::uuid, v_l->>'size', v_l->>'name', v_nhan, 'nhan_chuyen', v_d.code);
      -- Hạn dùng đi theo bánh: lấy hạn sớm nhất của lô bên gửi đã trừ cho phiếu XD.
      select min(l.expiry_at) into v_hsd from public.pos_stock_lot_moves m join public.pos_stock_lots l on l.id = m.lot_id
        where m.ref_code = v_nguon.code and m.delta < 0 and l.product_id = (v_l->>'product_id')::uuid
          and l.size is not distinct from nullif(v_l->>'size', '');
      if v_hsd is not null then
        update public.pos_stock_lots set expiry_at = v_hsd
          where ref_code = v_d.code and store_location = v_d.store_location and product_id = (v_l->>'product_id')::uuid
            and size is not distinct from nullif(v_l->>'size', '') and expiry_at is null;
      end if;
    end if;
    if v_nhan <> v_giao then v_lech := v_lech || (v_l->>'name') || case when v_d.doc_type = 'nhan_chuyen' then ' gửi ' else ' giao ' end || v_giao || ' nhận ' || v_nhan || '; '; end if;
    v_lines := v_lines || jsonb_build_array(v_l || jsonb_build_object('qty_received', v_nhan,
      'delta', case when v_d.doc_type = 'nhan_chuyen' then v_nhan end));
  end loop;
  update public.pos_stock_docs set status = 'xong', lines = v_lines, done_by = auth.uid(), done_by_name = public.pos_ten_toi(),
    done_at = now(), note = coalesce(nullif(p_note, ''), note) where id = p_id returning * into v_d;
  perform public.pos__ghi_nhat_ky(v_d.store_location, case when v_d.doc_type = 'nhan_chuyen' then 'nhan_chuyen' else 'nhan_hang' end,
    v_d.code, jsonb_build_object('lech', nullif(v_lech, ''), 'tu', v_d.from_store));
  if v_lech <> '' then
    perform public.pos__bao_sep('pos-lech-giao:' || v_d.id,
      case when v_d.doc_type = 'nhan_chuyen' then '🚚 Chuyển bánh lệch số — ' || coalesce(v_d.from_store, '') || ' → ' || v_d.store_location
        else '📦 Bếp giao lệch số — ' || v_d.store_location end,
      v_d.code || ' (' || coalesce(v_d.created_by_name, '') || ' gửi, ' || public.pos_ten_toi() || ' nhận): ' || v_lech, v_d.id, 'warning');
  end if;
  return to_jsonb(v_d);
end $$;

-- ───────── Huỷ phiếu kho (bản 141000 + luân chuyển) ─────────
create or replace function public.pos_huy_phieu(p_id uuid, p_reason text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_cap text := public.pos_cap_do(); v_d public.pos_stock_docs; v_l jsonb; v_delta numeric; v_nc public.pos_stock_docs;
begin
  if v_cap is null then raise exception 'Tài khoản chưa được duyệt'; end if;
  select * into v_d from public.pos_stock_docs where id = p_id for update;
  if v_d.id is null then raise exception 'Không tìm thấy phiếu'; end if;
  if v_d.status = 'huy' then return to_jsonb(v_d); end if;
  if v_d.doc_type = 'nhan_chuyen' then
    raise exception 'Phiếu nhận chuyển không huỷ riêng — bên gửi huỷ phiếu xuất % (khi bạn chưa bấm Nhận hàng)',
      coalesce((select code from public.pos_stock_docs where id = v_d.ref_doc), 'gốc');
  end if;
  if v_cap = 'nv' and not (v_d.created_by = auth.uid() and v_d.shift_id is not distinct from public.pos__ca_mo(v_d.store_location)) then
    raise exception 'Chỉ người lập phiếu (trong ca) hoặc Quản lý / Giám đốc huỷ được';
  end if;
  if v_d.doc_type = 'noi_bo' and v_d.ref_doc is not null then
    select * into v_nc from public.pos_stock_docs where id = v_d.ref_doc for update;
    if v_nc.status = 'xong' then
      raise exception '% đã nhận bánh (phiếu %) — không huỷ được nữa. Sai số thì kiểm kho ở 2 cửa hàng', v_nc.store_location, v_nc.code;
    end if;
    if v_nc.id is not null and v_nc.status <> 'huy' then
      update public.pos_stock_docs set status = 'huy', cancelled_by_name = public.pos_ten_toi(), cancelled_at = now(),
        cancel_reason = 'Bên gửi huỷ ' || v_d.code || coalesce(': ' || nullif(trim(p_reason), ''), '') where id = v_nc.id;
    end if;
  end if;
  if v_d.status = 'xong' then
    for v_l in select value from jsonb_array_elements(v_d.lines) loop
      if v_d.doc_type = 'bep_giao' then
        v_delta := coalesce((v_l->>'qty_received')::numeric, 0);
        if v_delta <> 0 then perform public.pos__ton_cong(v_d.store_location, (v_l->>'product_id')::uuid, v_l->>'size', v_l->>'name', -v_delta, 'huy_phieu', v_d.code); end if;
        perform public.pos__ton_cong(null, (v_l->>'product_id')::uuid, v_l->>'size', v_l->>'name', coalesce((v_l->>'qty')::numeric, 0), 'huy_phieu', v_d.code);
      else
        v_delta := coalesce((v_l->>'delta')::numeric, 0);
        if v_delta <> 0 then perform public.pos__ton_cong(v_d.store_location, (v_l->>'product_id')::uuid, v_l->>'size', v_l->>'name', -v_delta, 'huy_phieu', v_d.code); end if;
      end if;
    end loop;
  end if;
  update public.pos_stock_docs set status = 'huy', cancelled_by_name = public.pos_ten_toi(), cancelled_at = now(),
    cancel_reason = nullif(trim(p_reason), '') where id = p_id returning * into v_d;
  perform public.pos__ghi_nhat_ky(v_d.store_location, 'huy_phieu', v_d.code, jsonb_build_object('ly_do', p_reason));
  return to_jsonb(v_d);
end $$;

revoke all on function public.pos_luu_phieu(jsonb) from public, anon;
revoke all on function public.pos_nhan_hang(uuid, jsonb, text) from public, anon;
revoke all on function public.pos_huy_phieu(uuid, text) from public, anon;
grant execute on function public.pos_luu_phieu(jsonb) to authenticated;
grant execute on function public.pos_nhan_hang(uuid, jsonb, text) to authenticated;
grant execute on function public.pos_huy_phieu(uuid, text) to authenticated;

insert into public.migration_runs(migration_key, status, finished_at, notes)
values ('202611221000_ban_hang_quay_xuat_noi_bo_luan_chuyen', 'completed', now(),
  'Bán tại quầy: xuất dùng nội bộ (XD) có loại xuất như KiotViet; luân chuyển bánh giữa cửa hàng → phiếu chờ nhận NC ở bên nhận, nhận mới cộng tồn, hạn dùng đi theo lô.')
on conflict (migration_key) do update set status = 'completed', finished_at = now(), notes = excluded.notes;

commit;
