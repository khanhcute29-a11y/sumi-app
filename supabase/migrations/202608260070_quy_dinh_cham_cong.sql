-- QUY ĐỊNH CHẤM CÔNG THEO BỘ PHẬN — đưa xuống database làm nguồn sự thật.
--
-- VÌ SAO PHẢI ĐẶT Ở ĐÂY, KHÔNG ĐẶT Ở GIAO DIỆN:
-- Trước ngày 26/08, màn hình chấm công ghi `expected_start` BẰNG CHÍNH GIỜ NHÂN
-- VIÊN BẤM VÀO và ghi cứng `late_minutes = 0`. Kết quả: suốt thời gian qua hệ
-- thống KHÔNG BAO GIỜ ghi nhận được một phút đi muộn nào, và chỉ số "giờ đi
-- muộn" trong KPI luôn bằng 0. Đó là hậu quả của việc để phía trình duyệt tự
-- quyết. Bản này chuyển hẳn xuống database bằng một trigger, nên dù chấm công
-- từ điện thoại, máy tính hay bổ sung thủ công, con số vẫn ra như nhau.
--
-- QUY ĐỊNH (theo yêu cầu ngày 26/08/2026):
--   • Ca chuẩn 9 tiếng CÓ MẶT (= 8 tiếng làm + 1 tiếng nghỉ trưa 11:30–12:30)
--   • Phải có mặt TRƯỚC giờ vào ca ít nhất 10 phút, muộn hơn mốc đó là ĐI MUỘN
--   • Xưởng 41, Xưởng 42, Vận tải : vào 06:00  (mốc 05:50)
--   • Bakery (Thu ngân, Bếp lạnh, Bếp nóng) : sáng 05:15 (mốc 05:05)
--                                             chiều 13:30 (mốc 13:20)
begin;

-- ---------------------------------------------------------------------------
-- 1. Bảng quy định — để Giám đốc sửa giờ giấc mà KHÔNG cần lập trình lại
-- ---------------------------------------------------------------------------
create table if not exists public.sumi_quy_dinh_ca(
  id                    uuid primary key default gen_random_uuid(),
  bo_phan               text not null,           -- bakery | xuong41 | xuong42 | van_tai
  ma_ca                 text not null,           -- sang | chieu
  ten_ca                text not null,
  gio_bat_dau           time not null,
  so_gio_chuan          numeric not null default 9,   -- số giờ CÓ MẶT
  phut_den_som_toi_thieu int  not null default 10,    -- phải tới trước ngần này phút
  active                boolean not null default true,
  updated_at            timestamptz not null default now(),
  unique (bo_phan, ma_ca)
);

alter table public.sumi_quy_dinh_ca enable row level security;
drop policy if exists "ai cung doc duoc quy dinh ca" on public.sumi_quy_dinh_ca;
create policy "ai cung doc duoc quy dinh ca" on public.sumi_quy_dinh_ca
  for select to authenticated using (public.is_approved());

insert into public.sumi_quy_dinh_ca(bo_phan, ma_ca, ten_ca, gio_bat_dau)
values
  ('bakery',  'sang',  'Ca Sáng Bakery',  '05:15'),
  ('bakery',  'chieu', 'Ca Chiều Bakery', '13:30'),
  ('xuong41', 'sang',  'Ca Xưởng 41',     '06:00'),
  ('xuong42', 'sang',  'Ca Xưởng 42',     '06:00'),
  ('van_tai', 'sang',  'Ca Vận Tải',      '06:00')
on conflict (bo_phan, ma_ca) do update
  set ten_ca = excluded.ten_ca,
      gio_bat_dau = excluded.gio_bat_dau,
      updated_at = now();

-- ---------------------------------------------------------------------------
-- 2. Nhân viên này thuộc bộ phận nào?
--    Ưu tiên `station`; hồ sơ chưa gán khâu (hiện 21/25) thì suy từ chức danh.
-- ---------------------------------------------------------------------------
create or replace function public.sumi_bo_phan_cham_cong(p_staff_id uuid)
returns text language plpgsql stable security definer set search_path = public as $fn$
declare
  v_st  text;
  v_role text;
begin
  select nullif(btrim(station), ''), role into v_st, v_role
  from public.profiles where id = p_staff_id;

  if v_st in ('lanh', 'nong')            then return 'bakery';  end if;
  if v_st = 'xuong41'                    then return 'xuong41'; end if;
  if v_st = 'xuong42'                    then return 'xuong42'; end if;

  -- Chưa gán khâu -> suy từ chức danh
  if v_role = 'shipper'                  then return 'van_tai'; end if;
  if v_role in ('cashier', 'bakery', 'kitchen_lead') then return 'bakery'; end if;
  if v_role in ('kho_xuong42', 'deputy_director_x42') then return 'xuong42'; end if;
  if v_role = 'deputy_director_x41'      then return 'xuong41'; end if;

  -- Giám đốc, kế toán, bán hàng, kho... không thuộc ca cố định.
  return null;
end;
$fn$;

grant execute on function public.sumi_bo_phan_cham_cong to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Đối chiếu một lần chấm vào với quy định
--    Chọn ca có MỐC gần giờ bấm nhất. Lệch quá 3 tiếng thì coi như chấm ngoài
--    khung ca — KHÔNG bịa ra con số "muộn 295 phút" hay "sớm 200 phút".
-- ---------------------------------------------------------------------------
create or replace function public.sumi_doi_chieu_cham_cong(
  p_staff_id uuid, p_luc timestamptz)
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare
  v_bp    text;
  v_phut  int;      -- giờ bấm vào, quy ra số phút trong ngày (giờ Việt Nam)
  v_r     record;
  v_tot   record;
  v_lech  int;
  v_min   int := 2147483647;
  v_moc   int;
  v_d     int;
begin
  v_bp := public.sumi_bo_phan_cham_cong(p_staff_id);
  if v_bp is null then
    return jsonb_build_object('co_ca', false, 'ly_do', 'khong_thuoc_ca_co_dinh',
      'thong_bao', 'Bộ phận này không theo ca cố định nên không tính đi muộn.');
  end if;

  v_phut := extract(hour from (p_luc at time zone 'Asia/Ho_Chi_Minh'))::int * 60
          + extract(minute from (p_luc at time zone 'Asia/Ho_Chi_Minh'))::int;

  for v_r in
    select * from public.sumi_quy_dinh_ca where bo_phan = v_bp and active
  loop
    v_moc := extract(hour from v_r.gio_bat_dau)::int * 60
           + extract(minute from v_r.gio_bat_dau)::int
           - v_r.phut_den_som_toi_thieu;
    v_d := abs(v_phut - v_moc);
    if v_d > 720 then v_d := 1440 - v_d; end if;   -- vòng qua nửa đêm
    if v_d < v_min then v_min := v_d; v_tot := v_r; v_lech := v_phut - v_moc; end if;
  end loop;

  if v_tot is null then
    return jsonb_build_object('co_ca', false, 'ly_do', 'chua_khai_bao_ca',
      'thong_bao', 'Bộ phận ' || v_bp || ' chưa khai báo ca nào.');
  end if;

  if v_min > 180 then
    return jsonb_build_object('co_ca', false, 'ly_do', 'ngoai_khung_ca', 'bo_phan', v_bp,
      'thong_bao', 'Chấm công ngoài khung ca của bộ phận nên không tính đi muộn.');
  end if;

  if v_lech > 720  then v_lech := v_lech - 1440; end if;
  if v_lech < -720 then v_lech := v_lech + 1440; end if;

  return jsonb_build_object(
    'co_ca', true,
    'bo_phan', v_bp,
    'ma_ca', v_tot.ma_ca,
    'ten_ca', v_tot.ten_ca,
    'gio_bat_dau', to_char(v_tot.gio_bat_dau, 'HH24:MI'),
    'gio_ket_thuc', to_char(v_tot.gio_bat_dau + (v_tot.so_gio_chuan || ' hour')::interval, 'HH24:MI'),
    'moc_khong_muon', to_char(v_tot.gio_bat_dau - (v_tot.phut_den_som_toi_thieu || ' minute')::interval, 'HH24:MI'),
    'so_gio_chuan', v_tot.so_gio_chuan,
    'phut_den_som_toi_thieu', v_tot.phut_den_som_toi_thieu,
    'phut_lech_so_voi_moc', v_lech,
    'di_muon', v_lech > 0,
    'phut_muon', greatest(0, v_lech),
    'vi_pham_di_tre', v_lech > 15,   -- BẢNG VI PHẠM: "Đi trễ >15 phút"
    'thong_bao', case
      when v_lech > 0 then 'Đi muộn ' || v_lech || ' phút (quá mốc ' ||
        to_char(v_tot.gio_bat_dau - (v_tot.phut_den_som_toi_thieu || ' minute')::interval, 'HH24:MI') || ')'
      when v_lech = 0 then 'Đúng mốc ' ||
        to_char(v_tot.gio_bat_dau - (v_tot.phut_den_som_toi_thieu || ' minute')::interval, 'HH24:MI')
      else 'Đến sớm ' || abs(v_lech) || ' phút trước mốc' end
  );
end;
$fn$;

grant execute on function public.sumi_doi_chieu_cham_cong to authenticated;

-- ---------------------------------------------------------------------------
-- 4. TRIGGER: mỗi lần chấm vào, database tự điền giờ chuẩn + số phút muộn.
--    Trình duyệt không còn quyền quyết mấy con số này nữa.
-- ---------------------------------------------------------------------------
create or replace function public.sumi_tu_tinh_di_muon()
returns trigger language plpgsql security definer set search_path = public as $fn$
declare v_q jsonb;
begin
  if NEW.type is distinct from 'checkin' then return NEW; end if;
  if NEW.staff_id is null then return NEW; end if;

  -- Ca BỔ SUNG (quên chấm, quản lý nhập bù): `checkin_time` là lúc BẤM NÚT chứ
  -- không phải giờ nhân viên thật sự tới, nên tính đi muộn ở đây là oan cho họ.
  -- Giữ nguyên những gì người nhập bù đã ghi.
  if NEW.reason like '[BỔ SUNG]%' then return NEW; end if;

  v_q := public.sumi_doi_chieu_cham_cong(
           NEW.staff_id, coalesce(NEW.checkin_time, now()));

  if (v_q->>'co_ca')::boolean then
    NEW.expected_start := (v_q->>'gio_bat_dau')::time;
    NEW.late_minutes   := (v_q->>'phut_muon')::int;
  else
    -- Không thuộc ca cố định: để trống giờ chuẩn thay vì ghi bừa giờ bấm vào,
    -- để sau này nhìn vào là biết ngay bản ghi nào có mốc đối chiếu thật.
    NEW.expected_start := null;
    NEW.late_minutes   := 0;
  end if;
  return NEW;
end;
$fn$;

drop trigger if exists sumi_tu_tinh_di_muon_tg on public.shift_logs;
create trigger sumi_tu_tinh_di_muon_tg
  before insert on public.shift_logs
  for each row execute function public.sumi_tu_tinh_di_muon();

-- ---------------------------------------------------------------------------
-- 5. Tổng giờ làm thực tế trong ngày của một nhân viên.
--    Công thức: (giờ ra − giờ vào) − phần GIAO NHAU với khung nghỉ trưa
--    11:30–12:30. Ca chiều (13:30–22:30) không chạm khung này nên không bị trừ
--    — trừ 1 tiếng của người không hề nghỉ trưa là tính thiếu công cho họ.
-- ---------------------------------------------------------------------------
create or replace function public.sumi_gio_lam_trong_ngay(
  p_staff_id uuid, p_ngay date)
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare
  v_vao   timestamptz;
  v_ra    timestamptz;
  v_tho   numeric;
  v_trua_d timestamptz;
  v_trua_c timestamptz;
  v_tru   numeric := 0;
begin
  select min(checkin_time) into v_vao from public.shift_logs
   where staff_id = p_staff_id and work_date = p_ngay and type = 'checkin';
  select max(checkin_time) into v_ra from public.shift_logs
   where staff_id = p_staff_id and work_date = p_ngay and type = 'checkout';

  if v_vao is null then
    return jsonb_build_object('co_du_lieu', false, 'gio_lam', 0);
  end if;
  if v_ra is null then
    return jsonb_build_object('co_du_lieu', true, 'dang_trong_ca', true,
      'gio_vao', to_char(v_vao at time zone 'Asia/Ho_Chi_Minh', 'HH24:MI'), 'gio_lam', 0);
  end if;

  v_tho := extract(epoch from (v_ra - v_vao)) / 3600.0;
  if v_tho <= 0 then
    return jsonb_build_object('co_du_lieu', true, 'gio_lam', 0, 'canh_bao', 'Giờ ra sớm hơn giờ vào');
  end if;

  v_trua_d := (p_ngay::text || ' 11:30')::timestamp at time zone 'Asia/Ho_Chi_Minh';
  v_trua_c := (p_ngay::text || ' 12:30')::timestamp at time zone 'Asia/Ho_Chi_Minh';
  if least(v_ra, v_trua_c) > greatest(v_vao, v_trua_d) then
    v_tru := extract(epoch from (least(v_ra, v_trua_c) - greatest(v_vao, v_trua_d))) / 3600.0;
  end if;

  return jsonb_build_object(
    'co_du_lieu', true,
    'dang_trong_ca', false,
    'gio_vao', to_char(v_vao at time zone 'Asia/Ho_Chi_Minh', 'HH24:MI'),
    'gio_ra',  to_char(v_ra  at time zone 'Asia/Ho_Chi_Minh', 'HH24:MI'),
    'gio_co_mat', round(v_tho::numeric, 2),
    'gio_nghi_trua', round(v_tru::numeric, 2),
    'gio_lam', round((v_tho - v_tru)::numeric, 2)
  );
end;
$fn$;

grant execute on function public.sumi_gio_lam_trong_ngay to authenticated;

insert into public.migration_runs(migration_key, status, finished_at, notes)
values('202608260070_quy_dinh_cham_cong', 'completed', now(),
  'Attendance rules moved into the database: sumi_quy_dinh_ca table (editable shift times per department), department resolution from profiles.station/role, 10-minute early-arrival deadline, and a BEFORE INSERT trigger on shift_logs that fills expected_start and late_minutes authoritatively. Fixes the long-standing defect where the client wrote expected_start = the check-in time and late_minutes = 0, which made the KPI late-hours metric permanently zero. Also adds sumi_gio_lam_trong_ngay: worked hours minus the actual overlap with the 11:30-12:30 lunch window.')
on conflict(migration_key) do update
  set status = 'completed', finished_at = now(), notes = excluded.notes;

commit;
