-- Mở rộng Kho Macaron Xưởng 41 (tiếp theo 202609042000):
--   1. Ngày SX / HSD cho từng lượt NHẬP kho macaron MÀU ĐƠN.
--   2. Cho phép Quản lý Xưởng 41/Giám đốc SỬA lại 1 dòng "nhập" đã ghi sai
--      (số cặp, Ngày SX, HSD) — tồn kho hiện hành tự cộng/trừ lại đúng phần
--      chênh lệch, KHÔNG viết lại toàn bộ sổ (macaron_stock_log vẫn là sổ
--      TĂNG DẦN — xem migration gốc: "không có đường nào sửa thẳng làm mất
--      dấu vết"). Sửa ở đây là sửa CÓ DẤU VẾT: giữ lại số cặp gốc trước khi
--      sửa (so_cap_thay_doi_goc) + ai sửa + lúc nào, không âm thầm ghi đè.
begin;
set local lock_timeout = '10s';
set local statement_timeout = '30s';

alter table public.macaron_stock_log
  add column if not exists ngay_sx        date,
  add column if not exists han_su_dung    date,
  add column if not exists da_sua         boolean not null default false,
  add column if not exists sua_luc        timestamptz,
  add column if not exists sua_boi        uuid,
  add column if not exists sua_boi_ten    text,
  -- Giữ NGUYÊN số cặp gốc trước lần sửa đầu tiên — sửa lần 2 trở đi không
  -- ghi đè giá trị gốc này, để luôn truy ngược lại được số liệu ban đầu.
  add column if not exists so_cap_thay_doi_goc numeric;

-- ── Hàm nội bộ: cộng/trừ tồn + ghi log — bổ sung 2 tham số ngày SX/HSD.
-- Thay hẳn chữ ký cũ (thêm tham số CUỐI có default) nên mọi lệnh gọi hiện
-- có (sumi_macaron_nhap/xuat/mix/kiem_ke) không cần sửa vẫn chạy đúng.
create or replace function public.sumi_macaron_ghi_so(
  p_ma text, p_loai_gd text, p_thay_doi numeric,
  p_mix_batch_id uuid default null, p_order_code text default null, p_ghi_chu text default null,
  p_ngay_sx date default null, p_han_su_dung date default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_truoc  numeric;
  v_sau    numeric;
  v_ten    text;
  v_log_id uuid;
begin
  select so_cap into v_truoc from public.macaron_stock where ma = p_ma for update;
  if v_truoc is null then
    raise exception 'Mã macaron "%" chưa có trong danh mục.', p_ma;
  end if;

  v_sau := v_truoc + p_thay_doi;
  if v_sau < 0 then
    raise exception 'Không đủ tồn cho "%": còn % cặp, cần % cặp.', p_ma, v_truoc, abs(p_thay_doi);
  end if;

  update public.macaron_stock set so_cap = v_sau, updated_at = now() where ma = p_ma;

  select full_name into v_ten from public.profiles where id = auth.uid();
  insert into public.macaron_stock_log(ma, loai_gd, so_cap_thay_doi, so_cap_truoc, so_cap_sau,
    mix_batch_id, order_code, ghi_chu, staff_id, staff_name, ngay_sx, han_su_dung)
  values (p_ma, p_loai_gd, p_thay_doi, v_truoc, v_sau,
    p_mix_batch_id, p_order_code, p_ghi_chu, auth.uid(), v_ten, p_ngay_sx, p_han_su_dung)
  returning id into v_log_id;

  return v_log_id;
end;
$function$;

-- ── Nhập kho — thêm Ngày SX/HSD (chỉ có ý nghĩa với macaron màu đơn, nhưng
-- không chặn cứng ở RPC vì cho phép ghi cả khi nhập thẳng khay mix nếu thủ
-- kho muốn — màn hình phía client mới là nơi ẩn/hiện 2 ô này theo loại).
create or replace function public.sumi_macaron_nhap(
  p_ma text, p_so_cap numeric, p_ghi_chu text default null,
  p_ngay_sx date default null, p_han_su_dung date default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not public.sumi_macaron_duoc_thao_tac() then
    return jsonb_build_object('thanh_cong', false, 'thong_bao', 'Chỉ nhân sự Xưởng 41 hoặc quản lý mới nhập kho được.');
  end if;
  if p_so_cap is null or p_so_cap <= 0 then
    return jsonb_build_object('thanh_cong', false, 'thong_bao', 'Số cặp nhập phải lớn hơn 0.');
  end if;
  if p_ngay_sx is not null and p_han_su_dung is not null and p_han_su_dung < p_ngay_sx then
    return jsonb_build_object('thanh_cong', false, 'thong_bao', 'Hạn sử dụng không được sớm hơn Ngày sản xuất.');
  end if;

  perform public.sumi_macaron_ghi_so(p_ma, 'nhap', p_so_cap, null, null, p_ghi_chu, p_ngay_sx, p_han_su_dung);
  return jsonb_build_object('thanh_cong', true, 'thong_bao', 'Đã nhập ' || p_so_cap || ' cặp.');
end;
$function$;

-- ── Sửa 1 dòng NHẬP đã ghi sai — chỉ Quản lý Xưởng 41/Giám đốc, chỉ áp dụng
-- cho loai_gd='nhap' (mix_tru/mix_nhap/hao_hut/xuat/kiem_ke gắn liền với 1
-- mẻ trộn hoặc 1 đơn hàng cụ thể, sửa tay dễ làm lệch dữ liệu liên quan
-- khác — ngoài phạm vi yêu cầu này, chưa cần mở).
-- Tồn kho hiện hành (macaron_stock.so_cap) tự cộng/trừ đúng PHẦN CHÊNH LỆCH
-- giữa số cũ và số mới — không phải tính lại từ đầu toàn bộ sổ.
create or replace function public.sumi_macaron_sua_lo_nhap(
  p_log_id uuid, p_so_cap_moi numeric,
  p_ngay_sx date default null, p_han_su_dung date default null, p_ghi_chu text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_log    public.macaron_stock_log%rowtype;
  v_ton    numeric;
  v_lech   numeric;
  v_ten    text;
begin
  if not public.la_quan_ly_cua_khau('xuong41') then
    return jsonb_build_object('thanh_cong', false,
      'thong_bao', 'Chỉ Quản lý Xưởng 41 hoặc Giám đốc mới sửa được lịch sử nhập kho.');
  end if;
  if p_so_cap_moi is null or p_so_cap_moi <= 0 then
    return jsonb_build_object('thanh_cong', false, 'thong_bao', 'Số cặp phải lớn hơn 0.');
  end if;
  if p_ngay_sx is not null and p_han_su_dung is not null and p_han_su_dung < p_ngay_sx then
    return jsonb_build_object('thanh_cong', false, 'thong_bao', 'Hạn sử dụng không được sớm hơn Ngày sản xuất.');
  end if;
  if nullif(btrim(coalesce(p_ghi_chu, '')), '') is null then
    return jsonb_build_object('thanh_cong', false, 'thong_bao', 'Bắt buộc ghi lý do sửa (VD: gõ nhầm số lúc nhập ca sáng).');
  end if;

  select * into v_log from public.macaron_stock_log where id = p_log_id for update;
  if v_log.id is null then
    return jsonb_build_object('thanh_cong', false, 'thong_bao', 'Không tìm thấy dòng lịch sử này.');
  end if;
  if v_log.loai_gd <> 'nhap' then
    return jsonb_build_object('thanh_cong', false, 'thong_bao', 'Chỉ sửa được dòng "Nhập kho".');
  end if;

  -- Chênh lệch cần cộng/trừ thêm vào tồn hiện hành so với số cặp CŨ của
  -- đúng dòng này (không phải so với tồn hiện tại nói chung).
  v_lech := p_so_cap_moi - v_log.so_cap_thay_doi;

  select so_cap into v_ton from public.macaron_stock where ma = v_log.ma for update;
  if v_ton + v_lech < 0 then
    return jsonb_build_object('thanh_cong', false,
      'thong_bao', 'Không sửa được: tồn hiện tại (' || v_ton || ' cặp) sẽ âm nếu giảm dòng này xuống ' || p_so_cap_moi || ' cặp.');
  end if;

  update public.macaron_stock set so_cap = v_ton + v_lech, updated_at = now() where ma = v_log.ma;

  select full_name into v_ten from public.profiles where id = auth.uid();
  update public.macaron_stock_log set
    so_cap_thay_doi_goc = coalesce(so_cap_thay_doi_goc, v_log.so_cap_thay_doi),
    so_cap_thay_doi = p_so_cap_moi,
    so_cap_sau      = so_cap_truoc + p_so_cap_moi,
    ngay_sx         = coalesce(p_ngay_sx, ngay_sx),
    han_su_dung     = coalesce(p_han_su_dung, han_su_dung),
    ghi_chu         = coalesce(ghi_chu, '') || ' [Sửa ' || to_char(now(), 'DD/MM HH24:MI') || ' bởi ' || coalesce(v_ten, '?') || ': ' || p_ghi_chu || ']',
    da_sua          = true,
    sua_luc         = now(),
    sua_boi         = auth.uid(),
    sua_boi_ten     = v_ten
  where id = p_log_id;

  return jsonb_build_object('thanh_cong', true, 'lech', v_lech,
    'thong_bao', 'Đã sửa dòng nhập · tồn ' || v_log.ma || ' ' ||
                 (case when v_lech >= 0 then '+' else '' end) || v_lech || ' cặp (còn ' || (v_ton + v_lech) || ' cặp).');
end;
$function$;

grant execute on function public.sumi_macaron_sua_lo_nhap(uuid, numeric, date, date, text) to authenticated;

insert into public.migration_runs(migration_key, status, finished_at, notes)
values('202609043000_kho_macaron_lo_ngay_sx_hsd', 'completed', now(),
  'Kho Macaron X41: them ngay_sx/han_su_dung vao macaron_stock_log (ap dung khi nhap mau don); RPC sumi_macaron_nhap nhan them 2 tham so nay; them RPC sumi_macaron_sua_lo_nhap (chi Quan ly X41/Giam doc) sua so cap/ngay SX/HSD 1 dong da nhap, tu dong cong/tru dung phan chenh lech vao macaron_stock.so_cap, giu vet so cap goc + nguoi sua + luc sua, khong xoa lich su cu.')
on conflict(migration_key) do update set status='completed', finished_at=now(), notes=excluded.notes;

commit;
