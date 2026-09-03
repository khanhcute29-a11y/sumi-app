-- Tuỳ chỉnh ca làm & Logic nhận diện giờ nghỉ trưa.
--
-- 1) staff_shift_overrides có thêm giờ KẾT THÚC riêng (trước đây chỉ có giờ
--    bắt đầu) — Giám đốc đặt "hôm nay Nghĩa làm tới 20h" thì hệ thống tính
--    tăng ca dựa trên mốc RIÊNG đó thay vì giờ tan ca mặc định của bộ phận.
--
-- 2) Nghỉ trưa kiểu bấm 2 lần (Kết thúc ca -> Bắt đầu ca mới, KHÔNG cần nút
--    riêng): trước migration này, lần checkin THỨ HAI trong ngày bị trigger
--    `sumi_tu_tinh_di_muon` so với giờ vào ca GỐC (vd 05:15 sáng) và tính ra
--    hàng trăm phút "đi muộn" sai — phá thẳng KPI/chuyên cần. Vá bằng cách
--    nhận diện: nếu có 1 lần checkout gần nhất CÙNG NGÀY, khoảng hở tới lần
--    checkin này <=1 tiếng, và CẢ hai mốc (giờ ra + giờ vào lại) đều nằm
--    trong khung 11h00–13h00, thì đây là nghỉ trưa hợp lệ — không tính đi
--    muộn cho lần checkin đó.
--
-- 3) sumi_gio_lam_trong_ngay (giờ làm hôm nay, hiển thị realtime) tính lại
--    theo TỔNG các phiên (checkin->checkout) trong ngày thay vì chỉ phiên
--    đầu/cuối — người có bấm nghỉ trưa thì khoảng hở giữa 2 phiên tự động
--    không được cộng vào giờ làm, khỏi cần trừ cứng khung 11:30–12:30 nữa.
--    Người KHÔNG bấm nghỉ trưa (chỉ 1 phiên/ngày, đúng thói quen cũ) vẫn
--    tính y hệt công thức cũ — không đổi số giờ công của họ.
begin;
set local lock_timeout = '10s';
set local statement_timeout = '30s';

alter table public.staff_shift_overrides
  add column if not exists gio_ket_thuc time without time zone;

-- ── 1) Giờ làm riêng: thêm tham số giờ kết thúc ─────────────────────────────
create or replace function public.sumi_dat_gio_lam_rieng(
  p_staff_id uuid, p_ngay date, p_gio_bat_dau time without time zone,
  p_gio_ket_thuc time without time zone default null, p_ly_do text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_toi uuid := auth.uid();
  v_ten text;
begin
  if v_toi is null then
    return jsonb_build_object('thanh_cong', false, 'thong_bao', 'Chưa đăng nhập.');
  end if;
  if not (public.is_payroll_manager() or public.sumi_cung_don_vi_voi_toi(p_staff_id)) then
    return jsonb_build_object('thanh_cong', false, 'thong_bao', 'Chỉ quản lý của đơn vị mới đặt được giờ làm riêng cho nhân sự này.');
  end if;
  if p_ngay < (now() at time zone 'Asia/Ho_Chi_Minh')::date then
    return jsonb_build_object('thanh_cong', false, 'thong_bao', 'Không đặt giờ làm riêng cho ngày đã qua.');
  end if;
  if p_gio_ket_thuc is not null and p_gio_ket_thuc <= p_gio_bat_dau then
    return jsonb_build_object('thanh_cong', false, 'thong_bao', 'Giờ kết thúc phải sau giờ bắt đầu.');
  end if;

  select full_name into v_ten from public.profiles where id = p_staff_id;
  if v_ten is null then
    return jsonb_build_object('thanh_cong', false, 'thong_bao', 'Không tìm thấy nhân sự.');
  end if;

  insert into public.staff_shift_overrides(staff_id, work_date, gio_bat_dau, gio_ket_thuc, ly_do, created_by)
  values (p_staff_id, p_ngay, p_gio_bat_dau, p_gio_ket_thuc, nullif(btrim(coalesce(p_ly_do, '')), ''), v_toi)
  on conflict (staff_id, work_date) do update
    set gio_bat_dau = excluded.gio_bat_dau, gio_ket_thuc = excluded.gio_ket_thuc,
        ly_do = excluded.ly_do, created_by = excluded.created_by, created_at = now();

  return jsonb_build_object('thanh_cong', true, 'thong_bao',
    'Đã đặt giờ làm riêng ' || to_char(p_ngay, 'DD/MM/YYYY') || ' cho ' || v_ten || ' lúc ' || to_char(p_gio_bat_dau, 'HH24:MI')
    || case when p_gio_ket_thuc is not null then ' – ' || to_char(p_gio_ket_thuc, 'HH24:MI') else '' end || '.');
end;
$function$;

-- sumi_doi_chieu_cham_cong: dùng giờ kết thúc RIÊNG (nếu có) thay vì giờ tan
-- ca mặc định của bộ phận khi trả về 'gio_ket_thuc' — client (tinhChenhLech)
-- vẫn tự quyết mốc tính tăng ca, hàm này chỉ cấp đúng số liệu.
create or replace function public.sumi_doi_chieu_cham_cong(p_staff_id uuid, p_luc timestamp with time zone)
returns jsonb
language plpgsql
stable security definer
set search_path to 'public'
as $function$
declare
  v_bp      text;
  v_ngay    date;
  v_rieng   record;
  v_phut    int;
  v_r       record;
  v_tot     record;
  v_lech    int;
  v_min     int := 2147483647;
  v_moc     int;
  v_d       int;
  v_gio_bat_dau_hieu_luc time;
  v_gio_ket_thuc_hieu_luc time;
begin
  v_bp := public.sumi_bo_phan_cham_cong(p_staff_id);
  if v_bp is null then
    return jsonb_build_object('co_ca', false, 'ly_do', 'khong_thuoc_ca_co_dinh',
      'thong_bao', 'Bộ phận này không theo ca cố định nên không tính đi muộn.');
  end if;

  v_ngay := (p_luc at time zone 'Asia/Ho_Chi_Minh')::date;
  select gio_bat_dau, gio_ket_thuc, ly_do into v_rieng
    from public.staff_shift_overrides where staff_id = p_staff_id and work_date = v_ngay;

  v_phut := extract(hour from (p_luc at time zone 'Asia/Ho_Chi_Minh'))::int * 60
          + extract(minute from (p_luc at time zone 'Asia/Ho_Chi_Minh'))::int;

  for v_r in
    select * from public.sumi_quy_dinh_ca where bo_phan = v_bp and active
  loop
    v_moc := extract(hour from v_r.gio_bat_dau)::int * 60
           + extract(minute from v_r.gio_bat_dau)::int
           - v_r.phut_den_som_toi_thieu;
    v_d := abs(v_phut - v_moc);
    if v_d > 720 then v_d := 1440 - v_d; end if;
    if v_d < v_min then v_min := v_d; v_tot := v_r; end if;
  end loop;

  if v_tot is null then
    return jsonb_build_object('co_ca', false, 'ly_do', 'chua_khai_bao_ca',
      'thong_bao', 'Bộ phận ' || v_bp || ' chưa khai báo ca nào.');
  end if;

  v_gio_bat_dau_hieu_luc := coalesce(v_rieng.gio_bat_dau, v_tot.gio_bat_dau);
  v_gio_ket_thuc_hieu_luc := coalesce(v_rieng.gio_ket_thuc, v_tot.gio_bat_dau + (v_tot.so_gio_chuan || ' hour')::interval);
  v_moc := extract(hour from v_gio_bat_dau_hieu_luc)::int * 60
         + extract(minute from v_gio_bat_dau_hieu_luc)::int
         - v_tot.phut_den_som_toi_thieu;
  v_d := abs(v_phut - v_moc);
  if v_d > 720 then v_d := 1440 - v_d; end if;
  v_lech := v_phut - v_moc;

  if v_rieng.gio_bat_dau is null and v_min > 180 then
    return jsonb_build_object('co_ca', false, 'ly_do', 'ngoai_khung_ca', 'bo_phan', v_bp,
      'thong_bao', 'Chấm công ngoài khung ca của bộ phận nên không tính đi muộn.');
  end if;

  if v_lech > 720  then v_lech := v_lech - 1440; end if;
  if v_lech < -720 then v_lech := v_lech + 1440; end if;

  return jsonb_build_object(
    'co_ca', true,
    'bo_phan', v_bp,
    'ma_ca', v_tot.ma_ca,
    'ten_ca', v_tot.ten_ca || case when v_rieng.gio_bat_dau is not null then ' (giờ riêng hôm nay)' else '' end,
    'gio_bat_dau', to_char(v_gio_bat_dau_hieu_luc, 'HH24:MI'),
    'gio_ket_thuc', to_char(v_gio_ket_thuc_hieu_luc, 'HH24:MI'),
    'moc_khong_muon', to_char(v_gio_bat_dau_hieu_luc - (v_tot.phut_den_som_toi_thieu || ' minute')::interval, 'HH24:MI'),
    'so_gio_chuan', v_tot.so_gio_chuan,
    'phut_den_som_toi_thieu', v_tot.phut_den_som_toi_thieu,
    'phut_lech_so_voi_moc', v_lech,
    'di_muon', v_lech > 0,
    'phut_muon', greatest(0, v_lech),
    'vi_pham_di_tre', v_lech > 15,
    'gio_lam_rieng', v_rieng.gio_bat_dau is not null,
    'thong_bao', case
      when v_lech > 0 then 'Đi muộn ' || v_lech || ' phút (quá mốc ' ||
        to_char(v_gio_bat_dau_hieu_luc - (v_tot.phut_den_som_toi_thieu || ' minute')::interval, 'HH24:MI') || ')'
      when v_lech = 0 then 'Đúng mốc ' ||
        to_char(v_gio_bat_dau_hieu_luc - (v_tot.phut_den_som_toi_thieu || ' minute')::interval, 'HH24:MI')
      else 'Đến sớm ' || abs(v_lech) || ' phút trước mốc' end
  );
end;
$function$;

-- ── 2) Nhận diện nghỉ trưa hợp lệ trong trigger tính đi muộn ────────────────
create or replace function public.sumi_tu_tinh_di_muon()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_q          jsonb;
  v_luc        timestamptz;
  v_phut_bam   int;
  v_phut_goc   int;
  v_lech_goc   int;
  v_gio_goc    time;
  v_ra_gan_nhat timestamptz;
  v_ho_gio     numeric;
  v_phut_ra    int;
  v_phut_vao   int;
begin
  if NEW.type is distinct from 'checkin' then return NEW; end if;
  if NEW.staff_id is null then return NEW; end if;

  -- Ca BỔ SUNG (quên chấm, quản lý nhập bù): giữ nguyên như người nhập đã ghi.
  if NEW.reason like '[BỔ SUNG]%' then return NEW; end if;

  v_luc := coalesce(NEW.checkin_time, now());

  -- Nghỉ trưa kiểu bấm 2 lần: "Kết thúc ca" rồi "Bắt đầu ca mới", KHÔNG cần
  -- bấm nút riêng. Lấy lần CHECKOUT GẦN NHẤT cùng work_date, trước lần
  -- checkin này; nếu khoảng hở <=1 tiếng và CẢ giờ ra lẫn giờ vào lại đều
  -- nằm trong khung 11h00–13h00 (660–780 phút) thì coi là nghỉ trưa hợp lệ —
  -- không tính đi muộn theo giờ vào ca gốc, giữ nguyên checkin_time thật.
  if NEW.work_date is not null then
    select max(checkin_time) into v_ra_gan_nhat
      from public.shift_logs
     where staff_id = NEW.staff_id and type = 'checkout'
       and work_date = NEW.work_date and checkin_time < v_luc;

    if v_ra_gan_nhat is not null then
      v_ho_gio := extract(epoch from (v_luc - v_ra_gan_nhat)) / 3600.0;
      v_phut_ra := extract(hour from (v_ra_gan_nhat at time zone 'Asia/Ho_Chi_Minh'))::int * 60
                 + extract(minute from (v_ra_gan_nhat at time zone 'Asia/Ho_Chi_Minh'))::int;
      v_phut_vao := extract(hour from (v_luc at time zone 'Asia/Ho_Chi_Minh'))::int * 60
                  + extract(minute from (v_luc at time zone 'Asia/Ho_Chi_Minh'))::int;
      if v_ho_gio <= 1 and v_phut_ra between 660 and 780 and v_phut_vao between 660 and 780 then
        NEW.expected_start := null;
        NEW.late_minutes := 0;
        return NEW;
      end if;
    end if;
  end if;

  v_q := public.sumi_doi_chieu_cham_cong(NEW.staff_id, v_luc);

  if (v_q->>'co_ca')::boolean then
    v_gio_goc := (v_q->>'gio_bat_dau')::time;
    v_phut_bam := extract(hour from (v_luc at time zone 'Asia/Ho_Chi_Minh'))::int * 60
                + extract(minute from (v_luc at time zone 'Asia/Ho_Chi_Minh'))::int;
    v_phut_goc := extract(hour from v_gio_goc)::int * 60 + extract(minute from v_gio_goc)::int;
    v_lech_goc := v_phut_bam - v_phut_goc;
    if v_lech_goc > 720 then v_lech_goc := v_lech_goc - 1440; end if;
    if v_lech_goc < -720 then v_lech_goc := v_lech_goc + 1440; end if;

    if v_lech_goc > 20 and v_lech_goc <= 30 then
      NEW.checkin_time := ((NEW.work_date::text || ' ' || to_char(v_gio_goc, 'HH24:MI') || ':00')::timestamp
                           at time zone 'Asia/Ho_Chi_Minh') + interval '30 minutes';
      v_q := public.sumi_doi_chieu_cham_cong(NEW.staff_id, NEW.checkin_time);
    end if;
  end if;

  if (v_q->>'co_ca')::boolean then
    NEW.expected_start := (v_q->>'gio_bat_dau')::time;
    NEW.late_minutes   := (v_q->>'phut_muon')::int;
  else
    NEW.expected_start := null;
    NEW.late_minutes   := 0;
  end if;
  return NEW;
end;
$function$;

-- ── 3) Giờ làm hôm nay: tính theo tổng các phiên trong ngày ─────────────────
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
    -- Đúng 1 phiên (không bấm nghỉ trưa) — giữ công thức CŨ: trừ cứng phần
    -- giao nhau với khung 11:30–12:30, không đổi số giờ công của người
    -- không dùng tính năng nghỉ trưa kiểu mới.
    if v_ra_cuoi - v_vao_dau <= interval '0' then
      return jsonb_build_object('co_du_lieu', true, 'gio_lam', 0, 'canh_bao', 'Giờ ra sớm hơn giờ vào');
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

  -- Nhiều phiên (đã dùng Kết thúc ca / Bắt đầu ca mới giữa buổi) — khoảng hở
  -- GIỮA các phiên không được cộng vào giờ làm, khỏi cần trừ cứng khung
  -- 11:30–12:30 nữa vì phần nghỉ thật đã tự loại ra khi cộng riêng từng phiên.
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
values('202609041500_gio_lam_rieng_va_nghi_trua', 'completed', now(),
  'staff_shift_overrides thêm gio_ket_thuc; sumi_doi_chieu_cham_cong dùng giờ kết thúc riêng cho mốc tăng ca; sumi_tu_tinh_di_muon nhận diện nghỉ trưa hợp lệ (checkout->checkin <=1h trong khung 11h-13h) để không tính đi muộn sai; sumi_gio_lam_trong_ngay tính theo tổng phiên trong ngày.')
on conflict(migration_key) do update set status='completed', finished_at=now(), notes=excluded.notes;

commit;
