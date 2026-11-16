-- Bán tại quầy: (1) tiền đầu ca lấy theo số ca trước đã đếm (chống nhập khống để rút két),
-- (2) "Tổng quan" của nhân viên như app KiotViet — chỉ doanh số của CHÍNH MÌNH, lưu theo từng ca / từng ngày.
-- Chạy SAU 202611161010. Chỉ thêm cột/hàm, không xoá gì.
begin;
set local lock_timeout = '10s';

-- Số nhân viên tự gõ lúc vào ca (để đối chiếu); opening_cash = số máy dùng để tính két.
alter table public.pos_shifts add column if not exists opening_cash_entered numeric(14,0);
alter table public.pos_shifts add column if not exists opening_prev_shift uuid references public.pos_shifts(id) on delete set null;

-- Tiền két ca trước để màn Vào ca điền sẵn.
create or replace function public.pos_tien_dau_ca(p_store text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v public.pos_shifts;
begin
  if public.pos_cap_do() is null then raise exception 'Tài khoản chưa được duyệt'; end if;
  select * into v from public.pos_shifts
    where store_location = p_store and status = 'closed' and counted_cash is not null
    order by closed_at desc nulls last limit 1;
  if v.id is null then return jsonb_build_object('co', false); end if;
  return jsonb_build_object('co', true, 'so', v.counted_cash, 'ca', v.code, 'ten', v.closed_by_name, 'luc', v.closed_at);
end $$;

-- ───────── Vào ca (thay bản 202611151010) ─────────
-- Có ca trước → két tính theo số ca trước đã đếm; nhân viên gõ khác thì vẫn lưu số gõ + báo Giám đốc.
create or replace function public.pos_vao_ca(p_store text, p_opening_cash numeric, p_photo_url text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_cap text := public.pos_cap_do(); v_set public.pos_settings; v_row public.pos_shifts; v_truoc public.pos_shifts;
  v_loai text; v_nhanh text; v_dau numeric; v_lech numeric := 0; f text := 'FM999G999G999';
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
  select * into v_truoc from public.pos_shifts
    where store_location = p_store and status = 'closed' and counted_cash is not null
    order by closed_at desc nulls last limit 1;
  v_dau := coalesce(v_truoc.counted_cash, round(p_opening_cash));
  if v_truoc.id is not null then v_lech := round(p_opening_cash) - v_truoc.counted_cash; end if;
  insert into public.pos_shifts(code, store_location, opened_by, opened_by_name, opening_cash, opening_cash_entered, opening_prev_shift, opening_photo)
  values ('PGC' || lpad(nextval('public.pos_shift_seq')::text, 6, '0'), p_store, auth.uid(), public.pos_ten_toi(),
    v_dau, round(p_opening_cash), v_truoc.id, trim(p_photo_url))
  returning * into v_row;
  perform public.pos__ghi_nhat_ky(p_store, 'mo_ca', v_row.code, jsonb_build_object('tien_dau_ca', v_row.opening_cash,
    'nhan_vien_nhap', v_row.opening_cash_entered, 'ca_truoc', v_truoc.code, 'lech', v_lech));
  if v_lech <> 0 then
    perform public.pos__bao_sep('pos-dau-ca:' || v_row.id,
      '⚠️ Tiền đầu ca ' || case when v_lech > 0 then 'nhập DƯ ' else 'nhập THIẾU ' end || to_char(abs(v_lech), f) || 'đ — ' || p_store,
      coalesce(v_row.opened_by_name, '') || ' vào ca ' || v_row.code || ' nhập ' || to_char(v_row.opening_cash_entered, f)
        || 'đ, nhưng ca trước ' || coalesce(v_truoc.code, '') || ' (' || coalesce(v_truoc.closed_by_name, '') || ') đếm két '
        || to_char(v_truoc.counted_cash, f) || 'đ. Máy tính két theo số ca trước. Xem ảnh két lúc vào ca để kiểm.',
      v_row.id, 'warning');
  end if;
  return to_jsonb(v_row);
end $$;

-- ───────── Tổng quan của tôi (nhân viên) ─────────
-- Chỉ hoá đơn / ca / bánh đặt của chính người gọi (auth.uid()) — cách tính doanh số y như pos_doanh_so_nv.
create or replace function public.pos_tong_quan_cua_toi(p_from timestamptz, p_to timestamptz)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_toi uuid := auth.uid(); v jsonb;
begin
  if public.pos_cap_do() is null then raise exception 'Tài khoản chưa được duyệt'; end if;
  if p_from is null or p_to is null or p_to <= p_from then raise exception 'Khoảng ngày không hợp lệ'; end if;
  if p_to - p_from > interval '93 days' then raise exception 'Chọn tối đa 3 tháng'; end if;
  with hd as (select * from public.pos__ds_hd(p_from, p_to) d where d.cashier_id = v_toi),
  dat as (select o.total, o.completed_at from public.pos_counter_orders c join public.orders o on o.id = c.order_id
          where c.created_by = v_toi and o.status_v2 = 'completed' and o.completed_at >= p_from and o.completed_at < p_to),
  ca as (select * from public.pos_shifts s where s.opened_by = v_toi and s.opened_at >= p_from and s.opened_at < p_to)
  select jsonb_build_object(
    'so_hd', (select count(*) from hd),
    'ban_tinh', (select coalesce(sum(tinh), 0) from hd),
    'ck_cho', (select coalesce(sum(ck_cho), 0) from hd),
    'no_chua_tra', (select coalesce(sum(no_chua_tra), 0) from hd),
    'bi_loai', (select coalesce(sum(tinh_goc), 0) from hd where loai or mua_nv),
    'dat_quay', (select coalesce(sum(total), 0) from dat),
    'so_don_dat', (select count(*) from dat),
    'hd', coalesce((select jsonb_agg(jsonb_build_object('luc', created_at, 'tien', tinh + ck_cho) order by created_at) from hd), '[]'::jsonb),
    'ca', coalesce((select jsonb_agg(r order by r->>'opened_at' desc) from (
      select jsonb_build_object('id', s.id, 'code', s.code, 'store', s.store_location, 'opened_at', s.opened_at, 'closed_at', s.closed_at,
        'status', s.status, 'tien_dau', s.opening_cash, 'dem', s.counted_cash, 'lech', s.diff,
        'so_hd', (select count(*) from public.pos__ds_hd(s.opened_at - interval '3 days', coalesce(s.closed_at, now()) + interval '1 minute') d
                   where d.shift_id = s.id and d.cashier_id = v_toi),
        'ban_tinh', (select coalesce(sum(tinh), 0) from public.pos__ds_hd(s.opened_at - interval '3 days', coalesce(s.closed_at, now()) + interval '1 minute') d
                   where d.shift_id = s.id and d.cashier_id = v_toi),
        'ck_cho', (select coalesce(sum(ck_cho), 0) from public.pos__ds_hd(s.opened_at - interval '3 days', coalesce(s.closed_at, now()) + interval '1 minute') d
                   where d.shift_id = s.id and d.cashier_id = v_toi)
      ) as r from ca s) t), '[]'::jsonb)
  ) into v;
  return v;
end $$;

do $$
declare f text;
begin
  foreach f in array array['pos_tien_dau_ca(text)', 'pos_vao_ca(text,numeric,text)', 'pos_tong_quan_cua_toi(timestamptz,timestamptz)'] loop
    execute 'revoke all on function public.' || f || ' from public, anon';
    execute 'grant execute on function public.' || f || ' to authenticated';
  end loop;
end $$;

insert into public.migration_runs(migration_key, status, finished_at, notes)
values ('202611161020_ban_hang_quay_tong_quan_nv_va_dau_ca', 'completed', now(),
  'Bán tại quầy: tiền đầu ca lấy theo số ca trước đã đếm (gõ khác thì báo GĐ), Tổng quan của nhân viên (pos_tong_quan_cua_toi — chỉ doanh số của mình, theo ca/ngày).')
on conflict (migration_key) do update set status = 'completed', finished_at = now(), notes = excluded.notes;

commit;
