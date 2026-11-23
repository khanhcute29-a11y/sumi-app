-- Bán tại quầy — giờ ca như KiotViet, sếp chốt 23/11:
-- • Ca 1: 05:30 → 13:30 · Ca 2: 13:30 → 21:30 · cả 2 quầy dùng chung giờ (Giám đốc sửa được trong Thiết lập quầy).
-- • Hết giờ ca máy TỰ KẾT CA (mỗi phút kiểm một lần) → người ca sau vào ca bán luôn, không phải chờ ai.
--   Ca tự kết vẫn giữ đủ hoá đơn, doanh số tính cho người mở ca, báo Giám đốc như "Nhận ca".
-- • Vào ca sớm tối đa 30 phút vẫn tính là ca sau (13:00 vào là Ca 2, hết lúc 21:30).
--   Vào ca sau giờ ca cuối (sau 21:30) thì không tự kết theo giờ — 2 giờ sáng máy kết như cũ.
-- • Người bán đang đếm két dở mà máy vừa tự kết: vẫn bấm Kết ca được trong 3 tiếng (ghi số đếm thật).
-- Chạy sau 202611221047. Chỉ thêm cột / thay hàm, không xoá gì.
begin;
set local lock_timeout = '10s';

alter table public.pos_settings add column if not exists khung_ca jsonb not null
  default '[{"ten":"Ca 1","tu":"05:30","den":"13:30"},{"ten":"Ca 2","tu":"13:30","den":"21:30"}]'::jsonb;
alter table public.pos_shifts add column if not exists ends_at timestamptz;   -- giờ máy tự kết ca (theo giờ ca lúc vào ca)
alter table public.pos_shifts add column if not exists khung_ten text;        -- 'Ca 1' / 'Ca 2'
update public.pos_settings set khung_ca = '[{"ten":"Ca 1","tu":"05:30","den":"13:30"},{"ten":"Ca 2","tu":"13:30","den":"21:30"}]'::jsonb;

-- Vào ca lúc p_luc thì thuộc ca nào, hết lúc mấy giờ (giờ Việt Nam).
create or replace function public.pos__khung_cua(p_luc timestamptz, p_khung jsonb, out ten text, out het timestamptz)
language plpgsql stable set search_path = public as $$
declare v_ngay date := (p_luc at time zone 'Asia/Ho_Chi_Minh')::date; v_gio time := (p_luc at time zone 'Asia/Ho_Chi_Minh')::time;
  k jsonb; v_tu time; v_den time; v_dau_tu time; v_dau_ten text; v_dau_den time;
begin
  for k in select value from jsonb_array_elements(case when jsonb_typeof(p_khung) = 'array' then p_khung else '[]'::jsonb end)
      order by (value->>'tu')::time loop
    v_tu := (k->>'tu')::time; v_den := (k->>'den')::time;
    if v_dau_tu is null then v_dau_tu := v_tu; v_dau_ten := k->>'ten'; v_dau_den := v_den; end if;
    -- Ca sau ghi đè ca trước: vào sớm 30 phút trước giờ ca sau thì tính là ca sau.
    if v_gio >= v_tu - interval '30 minutes' and v_gio < v_den then
      ten := k->>'ten'; het := (v_ngay + v_den) at time zone 'Asia/Ho_Chi_Minh';
    end if;
  end loop;
  if het is null and v_dau_tu is not null and v_gio < v_dau_tu then   -- vào ca trước giờ ca đầu (vd 4:30) → ca đầu
    ten := v_dau_ten; het := (v_ngay + v_dau_den) at time zone 'Asia/Ho_Chi_Minh';
  end if;
end $$;
revoke all on function public.pos__khung_cua(timestamptz, jsonb) from public, anon, authenticated;

-- Mỗi ca mới tự ghi giờ hết ca — không phải sửa hàm Vào ca / Nhận ca.
create or replace function public.pos__dat_gio_het_ca()
returns trigger language plpgsql security definer set search_path = public as $$
declare r record;
begin
  if new.status = 'open' and new.ends_at is null then
    select * into r from public.pos__khung_cua(coalesce(new.opened_at, now()),
      (select s.khung_ca from public.pos_settings s where s.store_location = new.store_location));
    new.ends_at := r.het; new.khung_ten := r.ten;
  end if;
  return new;
end $$;
drop trigger if exists pos_shifts_gio_het_ca on public.pos_shifts;
create trigger pos_shifts_gio_het_ca before insert on public.pos_shifts for each row execute function public.pos__dat_gio_het_ca();

-- Ca đang mở lúc chạy: ghi giờ hết ca, nhưng chừa ít nhất 15 phút để người đang bán kịp kết ca.
update public.pos_shifts s set (khung_ten, ends_at) = (
    select r.ten, case when r.het is null then null else greatest(r.het, now() + interval '15 minutes') end
    from public.pos__khung_cua(s.opened_at, (select st.khung_ca from public.pos_settings st where st.store_location = s.store_location)) r)
  where s.status = 'open' and s.ends_at is null;

-- Máy kết hộ — thêm kiểu 'het_gio'.
create or replace function public.pos__ket_ca_ho(p_shift uuid, p_dem numeric, p_anh text, p_kieu text, p_nguoi text)
returns public.pos_shifts language plpgsql security definer set search_path = public as $$
declare v_s public.pos_shifts; v_sl jsonb; v_expected numeric; v_ds numeric; v_ck numeric; v_no numeric; f text := 'FM999G999G999'; v_het text;
begin
  select * into v_s from public.pos_shifts where id = p_shift for update;
  if v_s.id is null or v_s.status <> 'open' then return v_s; end if;
  v_het := to_char(v_s.ends_at at time zone 'Asia/Ho_Chi_Minh', 'HH24:MI');
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
                when p_kieu = 'het_gio' then 'Hết giờ ' || coalesce(v_s.khung_ten, 'ca') || ' (' || coalesce(v_het, '') || ') — máy tự kết ca'
                else 'Không kết ca — máy tự kết lúc 2 giờ sáng' end,
    closing_photo = nullif(trim(coalesce(p_anh, '')), ''), auto_closed = p_kieu
  where id = p_shift returning * into v_s;
  perform public.pos__ghi_nhat_ky(v_s.store_location, 'dong_ca_ho', v_s.code,
    jsonb_build_object('kieu', p_kieu, 'he_thong', v_expected, 'dem', p_dem, 'chenh', v_s.diff, 'nguoi_nhan', p_nguoi));
  perform public.pos__bao_sep('pos-dong-ca:' || v_s.id,
    '⚠️ ' || coalesce(v_s.opened_by_name, 'Người bán') || ' không kết ca — ' || v_s.store_location,
    'Ca ' || v_s.code || ' (vào lúc ' || to_char(v_s.opened_at at time zone 'Asia/Ho_Chi_Minh', 'HH24:MI DD/MM') || '): '
      || (v_sl->>'so_hoa_don') || ' hoá đơn, doanh số tính ' || to_char(v_ds, f) || 'đ. '
      || case when p_kieu = 'nhan_ca' then coalesce(p_nguoi, '') || ' nhận ca, máy kết hộ. '
              when p_kieu = 'het_gio' then 'Hết giờ ' || coalesce(v_s.khung_ten, 'ca') || ' (' || coalesce(v_het, '') || '), máy tự kết ca. '
              else 'Máy tự kết lúc 2 giờ sáng. ' end
      || 'Tiền mặt máy tính ' || to_char(v_expected, f) || 'đ'
      || case when p_dem is null then ' — chưa ai đếm két, chưa đếm bánh.'
              else ', người nhận ca đếm ' || to_char(p_dem, f) || 'đ'
                || case when v_s.diff <> 0 then ' (' || case when v_s.diff > 0 then 'dư ' else 'THIẾU ' end || to_char(abs(v_s.diff), f) || 'đ)' else '' end
                || '. Chưa đếm bánh.' end,
    v_s.id, 'warning');
  return v_s;
end $$;
revoke all on function public.pos__ket_ca_ho(uuid, numeric, text, text, text) from public, anon, authenticated;

-- Kết ca thường — thêm: máy vừa tự kết vì hết giờ mà người bán đang đếm dở thì vẫn ghi số đếm được.
create or replace function public.pos_ket_ca(p_shift uuid, p_counted numeric, p_note text, p_photo_url text, p_stock jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_cap text := public.pos_cap_do(); v_s public.pos_shifts; v_sl jsonb; v_expected numeric; v_diff numeric;
  v_l jsonb; v_kiem jsonb := '[]'; v_ht numeric; v_dem numeric; v_lech_txt text := ''; v_so_lech int := 0;
  v_ds numeric; v_ck numeric; v_no numeric; f text := 'FM999G999G999'; v_ket_lai boolean := false;
begin
  if v_cap is null then raise exception 'Tài khoản chưa được duyệt'; end if;
  select * into v_s from public.pos_shifts where id = p_shift for update;
  if v_s.id is null then raise exception 'Không tìm thấy ca'; end if;
  if v_s.status <> 'open' then
    -- Hết giờ ca máy vừa tự kết mà người bán đang đếm két dở → vẫn cho kết (ghi số đếm thật) trong 3 tiếng.
    if not (v_s.auto_closed = 'het_gio' and v_s.counted_cash is null and v_s.closed_at > now() - interval '3 hours') then
      raise exception 'Ca này đã đóng rồi';
    end if;
    v_ket_lai := true;
  end if;
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
    closed_at = case when v_ket_lai then closed_at else now() end, auto_closed = case when v_ket_lai then null else auto_closed end, expected_cash = v_expected, counted_cash = round(p_counted), diff = round(v_diff), summary = v_sl, note = p_note,
    closing_photo = nullif(trim(coalesce(p_photo_url, '')), ''), stock_check = v_kiem
  where id = p_shift returning * into v_s;
  perform public.pos__ghi_nhat_ky(v_s.store_location, 'dong_ca', v_s.code,
    jsonb_build_object('he_thong', v_expected, 'dem', p_counted, 'chenh', v_diff, 'banh_lech', v_so_lech, 'sau_het_gio', v_ket_lai));
  perform public.pos__bao_sep('pos-dong-ca:' || v_s.id || case when v_ket_lai then ':dem' else '' end,
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

-- Mỗi phút: kết các ca đã hết giờ.
create or replace function public.pos_tu_ket_ca_het_gio()
returns int language plpgsql security definer set search_path = public as $$
declare r record; n int := 0;
begin
  for r in select id, store_location from public.pos_shifts
      where status = 'open' and ends_at is not null and ends_at <= now() order by opened_at loop
    perform pg_advisory_xact_lock(hashtext('pos_ca:' || r.store_location));
    perform public.pos__ket_ca_ho(r.id, null, null, 'het_gio', null);
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function public.pos_tu_ket_ca_het_gio() from public, anon, authenticated;

-- Giám đốc đổi giờ ca (dùng chung cho mọi quầy). Ca đang mở tính lại giờ hết ca theo giờ mới.
create or replace function public.pos_luu_khung_ca(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare k jsonb; v jsonb := '[]'::jsonb; v_tu time; v_den time; v_truoc time; v_ten text; i int := 0;
begin
  if public.pos_cap_do() is distinct from 'gd' then raise exception 'Chỉ Giám đốc đổi giờ ca'; end if;
  if jsonb_typeof(p) <> 'array' or jsonb_array_length(p) < 1 or jsonb_array_length(p) > 4 then
    raise exception 'Cần từ 1 đến 4 ca'; end if;
  for k in select value from jsonb_array_elements(p) loop
    i := i + 1;
    if coalesce(k->>'tu', '') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or coalesce(k->>'den', '') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
      raise exception 'Giờ ca % chưa đúng (vd 05:30)', i; end if;
    v_tu := (k->>'tu')::time; v_den := (k->>'den')::time;
    v_ten := coalesce(nullif(left(trim(coalesce(k->>'ten', '')), 30), ''), 'Ca ' || i);
    if v_den <= v_tu then raise exception '% phải hết sau giờ bắt đầu (ca qua đêm chưa hỗ trợ)', v_ten; end if;
    if v_tu < '01:00' then raise exception '% bắt đầu từ 01:00 trở đi', v_ten; end if;
    if v_truoc is not null and v_tu < v_truoc then raise exception '% bắt đầu trước khi ca trước hết — xếp ca theo giờ, không chồng nhau', v_ten; end if;
    v_truoc := v_den;
    v := v || jsonb_build_array(jsonb_build_object('ten', v_ten, 'tu', to_char(v_tu, 'HH24:MI'), 'den', to_char(v_den, 'HH24:MI')));
  end loop;
  update public.pos_settings set khung_ca = v, updated_by = auth.uid(), updated_at = now();
  update public.pos_shifts s set (khung_ten, ends_at) = (
      select r.ten, case when r.het is null then null else greatest(r.het, now() + interval '15 minutes') end
      from public.pos__khung_cua(s.opened_at, v) r)
    where s.status = 'open';
  return v;
end $$;
revoke all on function public.pos_luu_khung_ca(jsonb) from public, anon;
grant execute on function public.pos_luu_khung_ca(jsonb) to authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    if exists (select 1 from cron.job where jobname = 'sumi-pos-het-gio-ca') then
      perform cron.unschedule('sumi-pos-het-gio-ca');
    end if;
    perform cron.schedule('sumi-pos-het-gio-ca', '* * * * *', 'select public.pos_tu_ket_ca_het_gio()');
  end if;
end $$;

insert into public.migration_runs(migration_key, status, finished_at, notes)
values ('202611231000_ban_hang_quay_khung_gio_ca', 'completed', now(),
  'Bán tại quầy: giờ ca chung (Ca 1 05:30-13:30, Ca 2 13:30-21:30), hết giờ máy tự kết ca mỗi phút; GĐ sửa giờ ca; kết ca trễ sau khi máy tự kết vẫn ghi được số đếm.')
on conflict (migration_key) do update set status = 'completed', finished_at = now(), notes = excluded.notes;

commit;
