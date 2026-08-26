-- VÁ LỖ HỔNG: đi muộn vài tiếng thì hệ thống không ghi nhận gì cả.
--
-- LỖI Ở BẢN TRƯỚC (M-202608260070, do tôi viết sáng nay):
-- Hàm `sumi_doi_chieu_cham_cong` chọn ca có MỐC gần giờ bấm nhất, rồi nếu lệch
-- QUÁ 3 TIẾNG thì trả về "ngoài khung ca" và KHÔNG tính đi muộn. Ý định ban đầu
-- là tránh in ra con số vô nghĩa. Nhưng nó tạo ra một VÙNG CHẾT:
--
--   • Bakery (mốc 05:05) chấm lúc 10:05  -> "ngoài khung ca", muộn 0 phút
--     (thực tế muộn 5 TIẾNG)
--   • Xưởng 41 (mốc 05:50) chấm lúc 09:00 -> "ngoài khung ca", muộn 0 phút
--     (thực tế muộn hơn 3 TIẾNG)
--
-- Nghĩa là ai quen đi muộn hẳn vài tiếng thì VĨNH VIỄN không bị ghi lỗi, còn
-- người muộn 16 phút lại bị tính vi phạm. Phát hiện khi soi dữ liệu chấm công
-- thật ngày 26/08.
--
-- CÁCH SỬA: bỏ cái ngưỡng 3 tiếng, thay bằng KHUNG GIỜ CỦA CA.
-- Một lần chấm thuộc về ca S nếu nó rơi vào khoảng [mốc(S) − 2 tiếng, tan ca S).
-- Rơi vào nhiều ca thì chọn ca có mốc GẦN NHẤT.
--
--   Bakery sáng  05:15 (mốc 05:05, tan 14:15) -> khung [03:05, 14:15)
--   Bakery chiều 13:30 (mốc 13:20, tan 22:30) -> khung [11:20, 22:30)
--   Xưởng/Vận tải 06:00 (mốc 05:50, tan 15:00) -> khung [03:50, 15:00)
--
-- Kết quả:
--   • Bakery 10:05 -> Ca Sáng, muộn 300 phút   (trước: không ghi nhận gì)
--   • Bakery 13:15 -> Ca Chiều, sớm 5 phút     (đúng: tới sớm cho ca chiều,
--                                               không phải muộn 8 tiếng ca sáng)
--   • Xưởng 09:00  -> muộn 190 phút            (trước: không ghi nhận gì)
--   • Chấm lúc 2 giờ sáng -> vẫn "ngoài khung ca" (không thuộc ca nào thật)
begin;

create or replace function public.sumi_doi_chieu_cham_cong(
  p_staff_id uuid, p_luc timestamptz)
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare
  v_bp    text;
  v_phut  int;     -- giờ bấm vào, quy ra số phút trong ngày (giờ Việt Nam)
  v_r     record;
  v_tot   record;
  v_lech  int;
  v_min   int := 2147483647;
  v_moc   int;     -- mốc phải có mặt
  v_tan   int;     -- giờ tan ca
  v_dau   int;     -- đầu khung nhận ca = mốc − 2 tiếng
  v_dai   int;     -- độ dài khung
  v_vitri int;     -- vị trí giờ bấm trong khung
  v_d     int;
  SOM_TOI_DA constant int := 120;   -- cho phép tới sớm nhiều nhất 2 tiếng
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
    v_tan := extract(hour from v_r.gio_bat_dau)::int * 60
           + extract(minute from v_r.gio_bat_dau)::int
           + (v_r.so_gio_chuan * 60)::int;
    v_dau := v_moc - SOM_TOI_DA;

    -- Giờ bấm có nằm trong khung [đầu, tan) không? (% 1440 để lo ca qua đêm)
    v_dai   := ((v_tan - v_dau) % 1440 + 1440) % 1440;
    if v_dai = 0 then v_dai := 1440; end if;
    v_vitri := ((v_phut - v_dau) % 1440 + 1440) % 1440;

    if v_vitri < v_dai then
      -- Thuộc khung ca này. Nhiều ca cùng nhận thì lấy ca có mốc gần nhất.
      v_d := abs(v_phut - v_moc);
      if v_d > 720 then v_d := 1440 - v_d; end if;
      if v_d < v_min then
        v_min  := v_d;
        v_tot  := v_r;
        v_lech := v_phut - v_moc;
      end if;
    end if;
  end loop;

  if v_tot is null then
    return jsonb_build_object('co_ca', false, 'ly_do', 'ngoai_khung_ca', 'bo_phan', v_bp,
      'thong_bao', 'Chấm công ngoài khung giờ của mọi ca thuộc bộ phận nên không tính đi muộn.');
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
    'vi_pham_di_tre', v_lech > 15,
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

insert into public.migration_runs(migration_key, status, finished_at, notes)
values('202608260080_va_lo_hong_di_muon', 'completed', now(),
  'Fixes a loophole introduced by M-202608260070: the +/-3h proximity cap meant a check-in 3-5 hours after the shift deadline was reported as "outside any shift" and recorded zero late minutes, so habitual heavy lateness was never penalised while a 16-minute delay counted as a violation. Replaced the cap with per-shift windows [deadline - 2h, shift end), picking the nearest deadline when several windows overlap. Found by inspecting real attendance data.')
on conflict(migration_key) do update
  set status = 'completed', finished_at = now(), notes = excluded.notes;

commit;
