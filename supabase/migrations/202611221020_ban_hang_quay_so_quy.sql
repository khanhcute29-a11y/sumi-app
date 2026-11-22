-- Bán tại quầy: SỔ QUỸ như KiotViet.
--  • Phiếu THU tiền mặt vào két (mã PT…) bên cạnh phiếu chi (PC…): có Loại thu/chi + Người nộp/nhận như KiotViet.
--    Phiếu thu cộng vào két phải có lúc kết ca (phiếu chi trừ như cũ).
--  • pos_so_quy: mọi khoản thu/chi của cửa hàng theo quỹ Tiền mặt / Ngân hàng (chuyển khoản + thẻ) / Ví:
--    bán hàng (tách theo từng cách trả), thu nợ, thu cọc / lấy bánh đặt, phiếu thu, phiếu chi.
--    Có quỹ đầu kỳ · tổng thu · tổng chi · tồn quỹ. Chỉ Quản lý / Giám đốc / Kế toán xem.
-- Chỉ THÊM cột (mặc định 'chi' = phiếu cũ không đổi) + hàm mới; pos__so_lieu_ca thay bằng bản có phiếu thu.
-- Cần chạy SAU 202611221010 (dùng hàm pos__cac_pt).
begin;
set local lock_timeout = '10s';

alter table public.pos_cash_outs add column if not exists kind text not null default 'chi';
alter table public.pos_cash_outs add column if not exists loai text;
alter table public.pos_cash_outs add column if not exists doi_tuong text;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'pos_cash_outs_kind_check') then
    alter table public.pos_cash_outs add constraint pos_cash_outs_kind_check check (kind in ('chi', 'thu'));
  end if;
end $$;

-- Lập phiếu thu / phiếu chi tiền mặt trong ca. p_id do máy tạo → bấm 2 lần / gửi lại không ghi trùng.
-- p = {id, shift_id, kind: 'thu'|'chi', amount, reason, loai, doi_tuong, photo_url}
create or replace function public.pos_lap_phieu_quy(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_cap text := public.pos_cap_do(); v_s public.pos_shifts; v public.pos_cash_outs;
  v_id uuid := nullif(p->>'id', '')::uuid; v_kind text := coalesce(p->>'kind', 'chi');
  v_tien numeric := round(coalesce((p->>'amount')::numeric, 0));
  v_ly text := nullif(btrim(coalesce(p->>'reason', '')), '');
  v_loai text := nullif(btrim(coalesce(p->>'loai', '')), ''); v_dt text := nullif(btrim(coalesce(p->>'doi_tuong', '')), '');
begin
  if v_cap is null then raise exception 'Tài khoản chưa được duyệt'; end if;
  if v_id is null then raise exception 'Thiếu mã phiếu'; end if;
  if v_kind not in ('thu', 'chi') then raise exception 'Loại phiếu không hợp lệ'; end if;
  select * into v from public.pos_cash_outs where id = v_id;
  if v.id is not null then return to_jsonb(v); end if;
  select * into v_s from public.pos_shifts where id = nullif(p->>'shift_id', '')::uuid for update;
  if v_s.id is null then raise exception 'Không tìm thấy ca'; end if;
  if v_s.status <> 'open' then raise exception 'Ca này đã kết, không ghi phiếu được nữa'; end if;
  if v_cap = 'nv' and v_s.opened_by is distinct from auth.uid() then
    raise exception 'Ca này của % — chỉ người đang giữ ca hoặc Quản lý ghi phiếu thu/chi', coalesce(v_s.opened_by_name, 'người khác');
  end if;
  if v_tien <= 0 or v_tien > 50000000 then raise exception 'Số tiền không hợp lệ'; end if;
  if v_ly is null or length(v_ly) < 3 then raise exception '%', case when v_kind = 'thu' then 'Ghi rõ thu tiền gì' else 'Ghi rõ chi tiền làm gì' end; end if;
  if length(v_ly) > 300 or length(coalesce(v_loai, '')) > 80 or length(coalesce(v_dt, '')) > 120 then raise exception 'Nội dung dài quá'; end if;
  if v_kind = 'chi' then
    v := public.pos__ghi_chi_ket(v_id, v_s, v_tien, v_ly, p->>'photo_url', false);
    update public.pos_cash_outs set loai = v_loai, doi_tuong = v_dt where id = v.id returning * into v;
    return to_jsonb(v);
  end if;
  insert into public.pos_cash_outs(id, code, store_location, shift_id, kind, amount, reason, loai, doi_tuong, photo_url, created_by, created_by_name)
  values (v_id, 'PT' || lpad(nextval('public.pos_doc_seq')::text, 6, '0'), v_s.store_location, v_s.id, 'thu', v_tien, v_ly, v_loai, v_dt,
    nullif(trim(coalesce(p->>'photo_url', '')), ''), auth.uid(), public.pos_ten_toi())
  returning * into v;
  perform public.pos__ghi_nhat_ky(v.store_location, 'thu_ket', v.code,
    jsonb_build_object('so_tien', v.amount, 'ly_do', v.reason, 'loai', v.loai, 'nguoi_nop', v.doi_tuong, 'ca', v_s.code));
  perform public.pos__bao_sep('pos-thu-ket:' || v.id, '💰 Thu tiền vào két ' || to_char(v.amount, 'FM999G999G999') || 'đ — ' || v.store_location,
    coalesce(v.created_by_name, '') || ' ghi phiếu ' || v.code || ' (ca ' || v_s.code || '): ' || v.reason
      || coalesce(' · ' || v.doi_tuong || ' nộp', ''), v.id, 'info');
  return to_jsonb(v);
end $$;

create or replace function public.pos__so_lieu_ca(p_shift uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  with s as (select * from public.pos_shifts where id = p_shift),
  hd as (select * from public.pos_invoices where shift_id = p_shift and status = 'xong'),
  tn as (select * from public.pos_debt_entries where shift_id = p_shift and entry_type = 'thu_no'),
  dn as (select * from public.pos_order_payments where shift_id = p_shift),
  pc as (select * from public.pos_cash_outs where shift_id = p_shift and status = 'xong' and kind = 'chi'),
  pt as (select * from public.pos_cash_outs where shift_id = p_shift and status = 'xong' and kind = 'thu'),
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
    'tien_mat_trong_ca',
      (select coalesce(sum(public.pos__tt(pay_method, paid_amount, pay_parts, 'tien_mat')), 0) from hd)
      + (select coalesce(-sum(amount), 0) from tn where pay_method = 'tien_mat')
      + (select coalesce(sum(amount), 0) from dn where pay_method = 'tien_mat')
      - (select coalesce(sum(public.pos__tt(pay_method, paid_amount, pay_parts, 'tien_mat')), 0) from ht)
      - (select coalesce(sum(amount), 0) from pc)
      + (select coalesce(sum(amount), 0) from pt))
$$;

-- Sổ quỹ: mọi khoản thu/chi theo quỹ, như màn "Sổ quỹ" KiotViet.
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

revoke all on function public.pos_lap_phieu_quy(jsonb) from public, anon;
grant execute on function public.pos_lap_phieu_quy(jsonb) to authenticated;
revoke all on function public.pos_so_quy(text, timestamptz, timestamptz) from public, anon;
grant execute on function public.pos_so_quy(text, timestamptz, timestamptz) to authenticated;

insert into public.migration_runs(migration_key, status, finished_at, notes)
values ('202611221020_ban_hang_quay_so_quy', 'completed', now(),
  'Bán tại quầy: sổ quỹ như KiotViet (tiền mặt / ngân hàng / ví) + phiếu thu tiền vào két (PT), phiếu thu/chi có loại + người nộp/nhận.')
on conflict (migration_key) do update set status = 'completed', finished_at = now(), notes = excluded.notes;

commit;
