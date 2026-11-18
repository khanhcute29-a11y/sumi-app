-- Bán tại quầy: PHIẾU CHI TIỀN TỪ KÉT (như "Phiếu chi" của KiotViet).
-- Lỗi gặp thật 18/11: ca trước đếm két 1.424.000, sau đó có người chi tiền ra lúc chưa ai vào ca → két còn 1.060.000.
-- Người vào ca nhập đúng số thật nhưng máy vẫn tính két theo ca trước (chống gõ khống) → cuối ca sẽ "thiếu" 364.000
-- đổ lên đầu người không làm. Trước giờ chi tiền chỉ ghi được vào "ghi chú" lúc kết ca, máy không trừ.
--  • Phiếu chi trong ca: người đang giữ ca ghi số tiền + lý do (+ ảnh hoá đơn nếu có) → máy trừ vào tiền két phải có.
--  • Lúc vào ca mà két ÍT hơn ca trước: khai "đã chi gì" ngay trong hộp Vào ca → máy tạo phiếu chi "trước khi vào ca"
--    cho đúng phần thiếu, két ca mới tính đúng số thật. Không khai lý do → như cũ (tính theo ca trước + báo GĐ).
--  • Mọi phiếu chi: báo Giám đốc, ghi nhật ký, in trên phiếu bàn giao ca. Huỷ được khi ca còn mở.
-- Chỉ THÊM bảng + hàm (pos_vao_ca giữ chữ ký cũ, gọi sang pos_vao_ca_v2). Chạy được trước khi code lên.
begin;
set local lock_timeout = '10s';

create table if not exists public.pos_cash_outs (
  id uuid primary key,
  code text not null unique,
  store_location text not null references public.pos_settings(store_location),
  shift_id uuid not null references public.pos_shifts(id) on delete restrict,
  truoc_ca boolean not null default false,           -- chi lúc chưa có ai vào ca (khai lúc vào ca)
  amount numeric(14,0) not null check (amount > 0),
  reason text not null,
  photo_url text,
  status text not null default 'xong' check (status in ('xong', 'huy')),
  created_by uuid references public.profiles(id) on delete set null,
  created_by_name text,
  created_at timestamptz not null default now(),
  cancelled_by_name text,
  cancelled_at timestamptz,
  cancel_reason text
);
create index if not exists pos_cash_outs_shift on public.pos_cash_outs(shift_id);
create index if not exists pos_cash_outs_store on public.pos_cash_outs(store_location, created_at desc);
alter table public.pos_cash_outs enable row level security;
revoke all on public.pos_cash_outs from anon, authenticated;   -- RLS không chặn TRUNCATE → thu hồi hết
grant select on public.pos_cash_outs to authenticated;
drop policy if exists pos_cash_outs_doc on public.pos_cash_outs;
create policy pos_cash_outs_doc on public.pos_cash_outs for select to authenticated using (public.pos_cap_do() is not null);

-- Ghi 1 phiếu chi (nội bộ, đã kiểm quyền ở hàm gọi).
create or replace function public.pos__ghi_chi_ket(p_id uuid, p_shift public.pos_shifts, p_amount numeric, p_reason text,
  p_photo text, p_truoc_ca boolean)
returns public.pos_cash_outs language plpgsql security definer set search_path = public as $$
declare v public.pos_cash_outs; f text := 'FM999G999G999';
begin
  insert into public.pos_cash_outs(id, code, store_location, shift_id, truoc_ca, amount, reason, photo_url, created_by, created_by_name)
  values (p_id, 'PC' || lpad(nextval('public.pos_doc_seq')::text, 6, '0'), p_shift.store_location, p_shift.id, p_truoc_ca,
    round(p_amount), p_reason, nullif(trim(coalesce(p_photo, '')), ''), auth.uid(), public.pos_ten_toi())
  returning * into v;
  perform public.pos__ghi_nhat_ky(v.store_location, 'chi_ket', v.code,
    jsonb_build_object('so_tien', v.amount, 'ly_do', v.reason, 'ca', p_shift.code, 'truoc_ca', p_truoc_ca));
  perform public.pos__bao_sep('pos-chi-ket:' || v.id,
    '💸 Chi từ két ' || to_char(v.amount, f) || 'đ — ' || v.store_location,
    coalesce(v.created_by_name, '') || case when p_truoc_ca then ' khai lúc vào ca ' || p_shift.code || ': két ít hơn ca trước vì đã chi — '
      else ' ghi phiếu ' || v.code || ' (ca ' || p_shift.code || '): ' end || v.reason
      || case when v.photo_url is null then ' (không có ảnh)' else '' end,
    v.id, 'warning');
  return v;
end $$;

-- Phiếu chi trong ca. p_id do máy tạo → bấm 2 lần / gửi lại lúc có mạng không bị ghi trùng.
create or replace function public.pos_chi_ket(p_id uuid, p_shift uuid, p_amount numeric, p_reason text, p_photo_url text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_cap text := public.pos_cap_do(); v_s public.pos_shifts; v public.pos_cash_outs;
  v_ly text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if v_cap is null then raise exception 'Tài khoản chưa được duyệt'; end if;
  if p_id is null then raise exception 'Thiếu mã phiếu'; end if;
  select * into v from public.pos_cash_outs where id = p_id;
  if v.id is not null then return to_jsonb(v); end if;
  select * into v_s from public.pos_shifts where id = p_shift for update;
  if v_s.id is null then raise exception 'Không tìm thấy ca'; end if;
  if v_s.status <> 'open' then raise exception 'Ca này đã kết, không ghi chi được nữa'; end if;
  if v_cap = 'nv' and v_s.opened_by is distinct from auth.uid() then
    raise exception 'Ca này của % — chỉ người đang giữ ca hoặc Quản lý ghi chi từ két', coalesce(v_s.opened_by_name, 'người khác');
  end if;
  if p_amount is null or p_amount <= 0 or p_amount > 50000000 then raise exception 'Số tiền chi không hợp lệ'; end if;
  if v_ly is null or length(v_ly) < 3 then raise exception 'Ghi rõ chi tiền làm gì'; end if;
  if length(v_ly) > 300 then raise exception 'Lý do dài quá (tối đa 300 chữ)'; end if;
  v := public.pos__ghi_chi_ket(p_id, v_s, p_amount, v_ly, p_photo_url, false);
  return to_jsonb(v);
end $$;

-- Huỷ phiếu chi (ghi nhầm) — chỉ khi ca còn mở; người ghi hoặc Quản lý / Giám đốc.
create or replace function public.pos_huy_chi_ket(p_id uuid, p_reason text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_cap text := public.pos_cap_do(); v public.pos_cash_outs; v_s public.pos_shifts;
  v_ly text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if v_cap is null then raise exception 'Tài khoản chưa được duyệt'; end if;
  select * into v from public.pos_cash_outs where id = p_id for update;
  if v.id is null then raise exception 'Không tìm thấy phiếu chi'; end if;
  if v.status = 'huy' then return to_jsonb(v); end if;
  select * into v_s from public.pos_shifts where id = v.shift_id;
  if v_s.status <> 'open' then raise exception 'Ca đã kết — phiếu chi của ca này không huỷ được nữa'; end if;
  if v_cap = 'nv' and v.created_by is distinct from auth.uid() then raise exception 'Chỉ người ghi phiếu hoặc Quản lý huỷ được'; end if;
  if v_ly is null then raise exception 'Ghi lý do huỷ'; end if;
  update public.pos_cash_outs set status = 'huy', cancelled_by_name = public.pos_ten_toi(), cancelled_at = now(), cancel_reason = v_ly
    where id = p_id returning * into v;
  perform public.pos__ghi_nhat_ky(v.store_location, 'huy_chi_ket', v.code, jsonb_build_object('so_tien', v.amount, 'ly_do', v_ly));
  perform public.pos__bao_sep('pos-huy-chi-ket:' || v.id, 'Huỷ phiếu chi ' || v.code || ' — ' || v.store_location,
    coalesce(v.cancelled_by_name, '') || ' huỷ phiếu chi ' || to_char(v.amount, 'FM999G999G999') || 'đ (' || v.reason || '): ' || v_ly, v.id, 'info');
  return to_jsonb(v);
end $$;

-- ───────── Vào ca v2: như pos_vao_ca (202611161020) + khai "đã chi trước khi vào ca" ─────────
create or replace function public.pos_vao_ca_v2(p_store text, p_opening_cash numeric, p_photo_url text, p_ly_do_chi text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_cap text := public.pos_cap_do(); v_set public.pos_settings; v_row public.pos_shifts; v_truoc public.pos_shifts;
  v_loai text; v_nhanh text; v_dau numeric; v_lech numeric := 0; f text := 'FM999G999G999';
  v_ly text := nullif(btrim(coalesce(p_ly_do_chi, '')), ''); v_chi public.pos_cash_outs;
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
  if v_ly is not null and v_lech < 0 then
    if length(v_ly) < 3 then raise exception 'Ghi rõ đã chi tiền làm gì'; end if;
    if length(v_ly) > 300 then raise exception 'Lý do dài quá (tối đa 300 chữ)'; end if;
  end if;
  insert into public.pos_shifts(code, store_location, opened_by, opened_by_name, opening_cash, opening_cash_entered, opening_prev_shift, opening_photo)
  values ('PGC' || lpad(nextval('public.pos_shift_seq')::text, 6, '0'), p_store, auth.uid(), public.pos_ten_toi(),
    v_dau, round(p_opening_cash), v_truoc.id, trim(p_photo_url))
  returning * into v_row;
  perform public.pos__ghi_nhat_ky(p_store, 'mo_ca', v_row.code, jsonb_build_object('tien_dau_ca', v_row.opening_cash,
    'nhan_vien_nhap', v_row.opening_cash_entered, 'ca_truoc', v_truoc.code, 'lech', v_lech,
    'ly_do_chi', case when v_lech < 0 then v_ly end));
  if v_lech < 0 and v_ly is not null then
    -- Két ít hơn ca trước và người vào ca khai đã chi: phần thiếu thành phiếu chi "trước khi vào ca" của ca này.
    -- Két ca này = ca trước đếm − phiếu chi = đúng số đang có.
    v_chi := public.pos__ghi_chi_ket(gen_random_uuid(), v_row, -v_lech, v_ly, trim(p_photo_url), true);
  elsif v_lech <> 0 then
    perform public.pos__bao_sep('pos-dau-ca:' || v_row.id,
      '⚠️ Tiền đầu ca ' || case when v_lech > 0 then 'nhập DƯ ' else 'nhập THIẾU ' end || to_char(abs(v_lech), f) || 'đ — ' || p_store,
      coalesce(v_row.opened_by_name, '') || ' vào ca ' || v_row.code || ' nhập ' || to_char(v_row.opening_cash_entered, f)
        || 'đ, nhưng ca trước ' || coalesce(v_truoc.code, '') || ' (' || coalesce(v_truoc.closed_by_name, '') || ') đếm két '
        || to_char(v_truoc.counted_cash, f) || 'đ. Máy tính két theo số ca trước. Xem ảnh két lúc vào ca để kiểm.',
      v_row.id, 'warning');
  end if;
  return to_jsonb(v_row) || jsonb_build_object('chi_truoc_ca', case when v_chi.id is null then null else to_jsonb(v_chi) end);
end $$;

-- Bản cũ (máy chưa cập nhật app) giữ nguyên chữ ký, chạy cùng logic.
create or replace function public.pos_vao_ca(p_store text, p_opening_cash numeric, p_photo_url text)
returns jsonb language sql security definer set search_path = public as $$
  select public.pos_vao_ca_v2(p_store, p_opening_cash, p_photo_url, null)
$$;

-- pos__so_lieu_ca: bản mới nhất lấy từ 202611161010_ban_hang_quay_vi_va_ma_pn.sql, chỉ THÊM phiếu chi từ két
-- ('chi_ket', 'so_phieu_chi') và trừ nó khỏi 'tien_mat_trong_ca' → kết ca tự tính đúng két phải có.
create or replace function public.pos__so_lieu_ca(p_shift uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  with s as (select * from public.pos_shifts where id = p_shift),
  hd as (select * from public.pos_invoices where shift_id = p_shift and status = 'xong'),
  tn as (select * from public.pos_debt_entries where shift_id = p_shift and entry_type = 'thu_no'),
  dn as (select * from public.pos_order_payments where shift_id = p_shift),
  pc as (select * from public.pos_cash_outs where shift_id = p_shift and status = 'xong'),
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
      'vi', (select coalesce(sum(paid_amount), 0) from hd where pay_method = 'vi'),
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
    'chi_ket', (select coalesce(sum(amount), 0) from pc),
    'so_phieu_chi', (select count(*) from pc),
    'phieu_chi', coalesce((select jsonb_agg(jsonb_build_object('code', code, 'so_tien', amount, 'ly_do', reason, 'truoc_ca', truoc_ca,
      'nguoi', created_by_name, 'luc', created_at) order by created_at) from pc), '[]'::jsonb),
    'tien_mat_trong_ca',
      (select coalesce(sum(paid_amount), 0) from hd where pay_method = 'tien_mat')
      + (select coalesce(-sum(amount), 0) from tn where pay_method = 'tien_mat')
      + (select coalesce(sum(amount), 0) from dn where pay_method = 'tien_mat')
      - (select coalesce(sum(paid_amount), 0) from ht)
      - (select coalesce(sum(amount), 0) from pc))
$$;

revoke all on function public.pos__ghi_chi_ket(uuid, public.pos_shifts, numeric, text, text, boolean) from public, anon, authenticated;
do $$
declare f text;
begin
  foreach f in array array['pos_chi_ket(uuid,uuid,numeric,text,text)', 'pos_huy_chi_ket(uuid,text)',
    'pos_vao_ca_v2(text,numeric,text,text)', 'pos_vao_ca(text,numeric,text)'] loop
    execute 'revoke all on function public.' || f || ' from public, anon';
    execute 'grant execute on function public.' || f || ' to authenticated';
  end loop;
end $$;

insert into public.migration_runs(migration_key, status, finished_at, notes)
values ('202611181020_ban_hang_quay_chi_tien_ket', 'completed', now(),
  'Bán tại quầy: phiếu chi tiền từ két (trừ vào két phải có lúc kết ca) + khai đã chi lúc vào ca khi két ít hơn ca trước (pos_vao_ca_v2).')
on conflict (migration_key) do update set status = 'completed', finished_at = now(), notes = excluded.notes;

commit;
