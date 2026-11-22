-- Bán tại quầy — kết ca gọn như KiotViet, sếp đồng ý 22/11:
-- • Vào ca / Nhận ca / Kết ca: ảnh két không bắt buộc. Ai chụp thì vẫn lưu và Giám đốc xem được như cũ.
-- • Kết ca: đếm bánh trên kệ không bắt buộc. Món nào có đếm thì vẫn so với máy, lệch thì báo Giám đốc.
-- • Đếm tiền két lúc kết ca vẫn giữ. Chạy sau 202611221040. Chỉ thay hàm, không xoá gì.
begin;
set local lock_timeout = '10s';

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
    v_dau, round(p_opening_cash), v_truoc.id, nullif(trim(coalesce(p_photo_url, '')), ''))
  returning * into v_row;
  perform public.pos__ghi_nhat_ky(p_store, 'mo_ca', v_row.code, jsonb_build_object('tien_dau_ca', v_row.opening_cash,
    'nhan_vien_nhap', v_row.opening_cash_entered, 'ca_truoc', v_truoc.code, 'lech', v_lech,
    'ly_do_chi', case when v_lech < 0 then v_ly end));
  if v_lech < 0 and v_ly is not null then
    -- Két ít hơn ca trước và người vào ca khai đã chi: phần thiếu thành phiếu chi "trước khi vào ca" của ca này.
    v_chi := public.pos__ghi_chi_ket(gen_random_uuid(), v_row, -v_lech, v_ly, p_photo_url, true);
  elsif v_lech <> 0 then
    perform public.pos__bao_sep('pos-dau-ca:' || v_row.id,
      '⚠️ Tiền đầu ca ' || case when v_lech > 0 then 'nhập DƯ ' else 'nhập THIẾU ' end || to_char(abs(v_lech), f) || 'đ — ' || p_store,
      coalesce(v_row.opened_by_name, '') || ' vào ca ' || v_row.code || ' nhập ' || to_char(v_row.opening_cash_entered, f)
        || 'đ, nhưng ca trước ' || coalesce(v_truoc.code, '') || ' (' || coalesce(v_truoc.closed_by_name, '') || ') '
        || case when v_truoc.counted_cash is null then 'máy tính két ' else 'đếm két ' end
        || to_char(v_goc, f) || 'đ. Máy tính két theo số ca trước.' || case when v_row.opening_photo is not null then ' Xem ảnh két lúc vào ca để kiểm.' else '' end,
      v_row.id, 'warning');
  end if;
  return to_jsonb(v_row) || jsonb_build_object('chi_truoc_ca', case when v_chi.id is null then null else to_jsonb(v_chi) end);
end $$;
revoke all on function public.pos_vao_ca_v2(text, numeric, text, text) from public, anon;
grant execute on function public.pos_vao_ca_v2(text, numeric, text, text) to authenticated;

create or replace function public.pos_nhan_ca(p_store text, p_shift uuid, p_dem numeric, p_photo_url text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_cap text := public.pos_cap_do(); v_s public.pos_shifts; v_ten text := public.pos_ten_toi();
  v_hom_nay date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
begin
  if v_cap is null then raise exception 'Tài khoản chưa được duyệt'; end if;
  if p_dem < 0 then raise exception 'Số tiền trong két không hợp lệ'; end if;
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
  if jsonb_typeof(coalesce(p_stock, '[]'::jsonb)) <> 'array' then raise exception 'Danh sách đếm bánh không hợp lệ'; end if;
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
    closing_photo = nullif(trim(coalesce(p_photo_url, '')), ''), stock_check = v_kiem
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
revoke all on function public.pos_ket_ca(uuid, numeric, text, text, jsonb) from public, anon;
grant execute on function public.pos_ket_ca(uuid, numeric, text, text, jsonb) to authenticated;

insert into public.migration_runs(migration_key, status, finished_at, notes)
values ('202611221045_ban_hang_quay_ket_ca_gon_nhu_kiotviet', 'completed', now(),
  'Bán tại quầy: ảnh két không bắt buộc ở vào ca / nhận ca / kết ca; đếm bánh lúc kết ca không bắt buộc (như KiotViet).')
on conflict (migration_key) do update set status = 'completed', finished_at = now(), notes = excluded.notes;

commit;
