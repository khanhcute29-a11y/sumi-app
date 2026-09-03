-- 1) Tách bo_phan 'bakery' (đang gộp chung Thu Ngân/Bán Hàng/Bếp Nóng/Bếp
--    Lạnh vào 1 ca duy nhất) thành 4 bo_phan riêng — theo yêu cầu Giám đốc
--    (04/09/2026): "Thu Ngân + bán hàng khác bếp lạnh, khác bếp nóng, chủ
--    động tách ra không gộp chung". Mỗi bo_phan có 2 ca (sáng/chiều), copy
--    NGUYÊN giá trị từ 2 ca Bakery cũ — KHÔNG đổi giờ/số phút của ai trong
--    ngày chạy migration, chỉ đổi việc mỗi khâu có ca RIÊNG để Giám đốc sửa
--    độc lập từ nay về sau.
--
-- 2) Thêm cột khong_nghi_trua — cho ca liên tục (vd ca bán hàng không nghỉ
--    trưa): sumi_gio_lam_trong_ngay() sẽ KHÔNG trừ cứng khung 11:30–12:30
--    của người thuộc ca này nữa.
--
-- 3) Sửa sumi_bo_phan_cham_cong() để trả về đúng 1 trong 4 bo_phan mới thay
--    vì "bakery" — đây là hàm THẬT quyết định ai theo ca nào (trigger tính đi
--    muộn, RPC đối chiếu chấm công đều gọi lại hàm này), không phải chỉ đổi
--    hiển thị. Giữ NGUYÊN mọi điều kiện gốc, chỉ đổi giá trị trả về.
begin;
set local lock_timeout = '10s';
set local statement_timeout = '30s';

alter table public.sumi_quy_dinh_ca
  add column if not exists khong_nghi_trua boolean not null default false;

-- Nhân bản 2 ca Bakery hiện có thành 8 ca (4 khâu × sáng/chiều).
insert into public.sumi_quy_dinh_ca (bo_phan, ma_ca, ten_ca, gio_bat_dau, so_gio_chuan, phut_den_som_toi_thieu, active)
select bp.ma, src.ma_ca, bp.ten || ' — ' || src.buoi, src.gio_bat_dau, src.so_gio_chuan, src.phut_den_som_toi_thieu, true
from (values
  ('bep_lanh', 'Bếp Lạnh'), ('bep_nong', 'Bếp Nóng'),
  ('thu_ngan', 'Thu Ngân'), ('ban_hang', 'Bán Hàng')
) as bp(ma, ten)
cross join (
  select ma_ca, case ma_ca when 'sang' then 'Ca Sáng' else 'Ca Chiều' end as buoi,
         gio_bat_dau, so_gio_chuan, phut_den_som_toi_thieu
  from public.sumi_quy_dinh_ca where bo_phan = 'bakery' and active
) as src
where not exists (
  select 1 from public.sumi_quy_dinh_ca q where q.bo_phan = bp.ma and q.ma_ca = src.ma_ca
);

-- Ca Bakery cũ (gộp chung) ngưng dùng — không xoá, giữ lại cho lịch sử/audit.
update public.sumi_quy_dinh_ca set active = false, updated_at = now()
where bo_phan = 'bakery' and active;

create or replace function public.sumi_bo_phan_cham_cong(p_staff_id uuid)
returns text
language plpgsql
stable security definer
set search_path to 'public'
as $function$
declare
  v_st  text;
  v_role text;
  v_extra text[];
begin
  -- Có khai báo giờ riêng cho đúng người này? Dùng luôn id làm "bộ phận".
  if exists (select 1 from public.sumi_quy_dinh_ca where bo_phan = p_staff_id::text and active) then
    return p_staff_id::text;
  end if;

  select nullif(btrim(station), ''), role, coalesce(extra_roles, '{}') into v_st, v_role, v_extra
  from public.profiles where id = p_staff_id;

  if v_st = 'lanh'                       then return 'bep_lanh'; end if;
  if v_st = 'nong'                       then return 'bep_nong'; end if;
  if v_st = 'xuong41'                    then return 'xuong41'; end if;
  if v_st = 'xuong42'                    then return 'xuong42'; end if;

  -- Chưa gán khâu -> suy từ chức danh
  if v_role = 'shipper'                  then return 'van_tai'; end if;
  if v_role = 'cashier'                  then return 'thu_ngan'; end if;
  if v_role in ('bakery', 'kitchen_lead') then return 'bep_lanh'; end if;
  -- Nhân viên bán hàng thuộc Bakery (VD Lê Thị Hải Vân) — theo ca Bán Hàng.
  if v_role = 'sale' and 'bakery' = any(v_extra) then return 'ban_hang'; end if;
  if v_role in ('kho_xuong42', 'deputy_director_x42') then return 'xuong42'; end if;
  if v_role = 'deputy_director_x41'      then return 'xuong41'; end if;

  -- Giám đốc, kế toán, bán hàng (không thuộc bakery), kho... không thuộc ca cố định.
  return null;
end;
$function$;

create or replace function public.sumi_gio_lam_trong_ngay(p_staff_id uuid, p_ngay date)
returns jsonb
language plpgsql
stable security definer
set search_path to 'public'
as $function$
declare
  v_log       record;
  v_dang_vao  timestamptz;
  v_vao_dau   timestamptz;
  v_ra_cuoi   timestamptz;
  v_tong_gio  numeric := 0;
  v_so_phien  int := 0;
  v_trua_d    timestamptz;
  v_trua_c    timestamptz;
  v_tru       numeric := 0;
  v_khong_nghi_trua boolean := false;
begin
  for v_log in
    select type, checkin_time from public.shift_logs
     where staff_id = p_staff_id and work_date = p_ngay and type in ('checkin','checkout')
     order by checkin_time asc
  loop
    if v_log.type = 'checkin' then
      if v_vao_dau is null then v_vao_dau := v_log.checkin_time; end if;
      if v_dang_vao is null then v_dang_vao := v_log.checkin_time; end if;
    elsif v_log.type = 'checkout' and v_dang_vao is not null then
      v_tong_gio := v_tong_gio + extract(epoch from (v_log.checkin_time - v_dang_vao)) / 3600.0;
      v_so_phien := v_so_phien + 1;
      v_ra_cuoi := v_log.checkin_time;
      v_dang_vao := null;
    end if;
  end loop;

  if v_vao_dau is null then
    return jsonb_build_object('co_du_lieu', false, 'gio_lam', 0);
  end if;

  if v_dang_vao is not null then
    return jsonb_build_object('co_du_lieu', true, 'dang_trong_ca', true,
      'gio_vao', to_char(v_vao_dau at time zone 'Asia/Ho_Chi_Minh', 'HH24:MI'),
      'gio_lam', round(greatest(0, v_tong_gio)::numeric, 2));
  end if;

  if v_so_phien <= 1 then
    if v_ra_cuoi - v_vao_dau <= interval '0' then
      return jsonb_build_object('co_du_lieu', true, 'gio_lam', 0, 'canh_bao', 'Giờ ra sớm hơn giờ vào');
    end if;

    -- Ca liên tục (không nghỉ trưa, vd ca bán hàng) — không trừ khung
    -- 11:30–12:30 nữa, tính đủ nguyên khoảng giờ có mặt.
    select q.khong_nghi_trua into v_khong_nghi_trua
    from public.sumi_quy_dinh_ca q
    where q.bo_phan = coalesce(public.sumi_bo_phan_cham_cong(p_staff_id), '') and q.active
    limit 1;

    if coalesce(v_khong_nghi_trua, false) then
      return jsonb_build_object(
        'co_du_lieu', true, 'dang_trong_ca', false,
        'gio_vao', to_char(v_vao_dau at time zone 'Asia/Ho_Chi_Minh', 'HH24:MI'),
        'gio_ra',  to_char(v_ra_cuoi  at time zone 'Asia/Ho_Chi_Minh', 'HH24:MI'),
        'gio_co_mat', round((extract(epoch from (v_ra_cuoi - v_vao_dau)) / 3600.0)::numeric, 2),
        'gio_nghi_trua', 0,
        'gio_lam', round((extract(epoch from (v_ra_cuoi - v_vao_dau)) / 3600.0)::numeric, 2)
      );
    end if;

    v_trua_d := (p_ngay::text || ' 11:30')::timestamp at time zone 'Asia/Ho_Chi_Minh';
    v_trua_c := (p_ngay::text || ' 12:30')::timestamp at time zone 'Asia/Ho_Chi_Minh';
    if least(v_ra_cuoi, v_trua_c) > greatest(v_vao_dau, v_trua_d) then
      v_tru := extract(epoch from (least(v_ra_cuoi, v_trua_c) - greatest(v_vao_dau, v_trua_d))) / 3600.0;
    end if;
    return jsonb_build_object(
      'co_du_lieu', true, 'dang_trong_ca', false,
      'gio_vao', to_char(v_vao_dau at time zone 'Asia/Ho_Chi_Minh', 'HH24:MI'),
      'gio_ra',  to_char(v_ra_cuoi  at time zone 'Asia/Ho_Chi_Minh', 'HH24:MI'),
      'gio_co_mat', round((extract(epoch from (v_ra_cuoi - v_vao_dau)) / 3600.0)::numeric, 2),
      'gio_nghi_trua', round(v_tru::numeric, 2),
      'gio_lam', round((extract(epoch from (v_ra_cuoi - v_vao_dau)) / 3600.0 - v_tru)::numeric, 2)
    );
  end if;

  return jsonb_build_object(
    'co_du_lieu', true, 'dang_trong_ca', false,
    'gio_vao', to_char(v_vao_dau at time zone 'Asia/Ho_Chi_Minh', 'HH24:MI'),
    'gio_ra',  to_char(v_ra_cuoi  at time zone 'Asia/Ho_Chi_Minh', 'HH24:MI'),
    'gio_co_mat', round((extract(epoch from (v_ra_cuoi - v_vao_dau)) / 3600.0)::numeric, 2),
    'gio_nghi_trua', round((extract(epoch from (v_ra_cuoi - v_vao_dau)) / 3600.0 - v_tong_gio)::numeric, 2),
    'gio_lam', round(greatest(0, v_tong_gio)::numeric, 2)
  );
end;
$function$;

insert into public.migration_runs(migration_key, status, finished_at, notes)
values('202609041700_tach_luong_bakery_va_ca_ca_nhan', 'completed', now(),
  'Tách bo_phan bakery thành bep_lanh/bep_nong/thu_ngan/ban_hang (8 ca mới, copy nguyên giờ từ 2 ca Bakery cũ, không đổi giờ ai). Sửa sumi_bo_phan_cham_cong trả đúng bo_phan mới. Thêm cột khong_nghi_trua + sumi_gio_lam_trong_ngay bỏ qua trừ nghỉ trưa cho ca liên tục.')
on conflict(migration_key) do update set status='completed', finished_at=now(), notes=excluded.notes;

commit;
