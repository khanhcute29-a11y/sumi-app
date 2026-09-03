-- KHẨN: sumi_kiem_tra_geofence() lọc điểm định vị THEO bo_phan của người
-- chấm công. Migration 202609041700 (tách bo_phan 'bakery' thành bep_lanh/
-- bep_nong/thu_ngan/ban_hang) làm 4 nhóm này không còn khớp bo_phan nào
-- trong work_locations (bảng vẫn giữ nguyên 'bakery') — hệ quả: 4 nhóm này
-- ĐANG KHÔNG bị chặn gì cả (fail-open), còn Xưởng 41/42/Vận tải vẫn bị bó
-- cứng vào ĐÚNG 1 điểm của riêng mình dù cả 4 điểm định vị thực tế nằm sát
-- nhau (cùng một khuôn viên, vài chục mét).
--
-- Theo đúng yêu cầu chủ tiệm (04/09/2026): AI CŨNG được chấm công (vào ca
-- LẪN kết thúc ca) khi đứng gần BẤT KỲ 1 trong các vị trí đã định vị, không
-- lọc riêng theo khâu nữa. Đồng thời bật kiểm tra luôn cho checkout (trước
-- đây chỉ kiểm tra checkin — checkout đã gửi GPS sẵn từ client, chỉ chưa có
-- gì đọc để kiểm tra).
begin;
set local lock_timeout = '10s';
set local statement_timeout = '30s';

create or replace function public.sumi_kiem_tra_geofence()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_bp         text;
  v_loc        record;
  v_km         numeric;
  v_m          int;
  v_co_diem    boolean := false;
  v_gan_nhat   record;
  v_m_gan_nhat int;
begin
  if NEW.type not in ('checkin', 'checkout') then return NEW; end if;
  if NEW.gps_lat is null or NEW.gps_lng is null then return NEW; end if;
  if NEW.reason like '[BỔ SUNG]%' then return NEW; end if;

  -- Không theo ca cố định (Giám đốc, kế toán...) -> không ép geofence, giữ
  -- nguyên hành vi cũ.
  v_bp := public.sumi_bo_phan_cham_cong(NEW.staff_id);
  if v_bp is null then return NEW; end if;

  -- Cho qua nếu gần BẤT KỲ 1 trong các vị trí đã định vị — KHÔNG lọc theo
  -- bo_phan của người chấm công nữa.
  for v_loc in
    select * from public.work_locations where active and lat is not null and lng is not null
  loop
    v_co_diem := true;
    v_km := 2 * 6371 * asin(sqrt(
      power(sin(radians(v_loc.lat - NEW.gps_lat) / 2), 2) +
      cos(radians(NEW.gps_lat)) * cos(radians(v_loc.lat)) *
      power(sin(radians(v_loc.lng - NEW.gps_lng) / 2), 2)
    ));
    v_m := round(v_km * 1000)::int;

    if v_m <= v_loc.radius_m then
      return NEW; -- trong bán kính của MỘT điểm bất kỳ -> cho qua ngay
    end if;

    if v_gan_nhat is null or v_m < v_m_gan_nhat then
      v_gan_nhat := v_loc; v_m_gan_nhat := v_m;
    end if;
  end loop;

  if not v_co_diem then return NEW; end if; -- chưa định vị điểm nào -> không chặn

  raise exception 'Bạn đang cách % gần nhất khoảng %m — vượt quá bán kính cho phép (%m). Vui lòng tới đúng vị trí làm việc rồi chấm công lại.',
    v_gan_nhat.name, v_m_gan_nhat, v_gan_nhat.radius_m;
end;
$function$;

insert into public.migration_runs(migration_key, status, finished_at, notes)
values('202609041902_geofence_cham_cong_4_vi_tri', 'completed', now(),
  'sumi_kiem_tra_geofence: bo loc theo bo_phan, cho qua khi gan BAT KY 1/4 vi tri da dinh vi; bat kiem tra ca cho checkout (truoc chi checkin). Va luon regression tu 202609041700 (bo_phan bakery tach 4 nhom khien geofence fail-open cho bep lanh/nong/thu ngan/ban hang).')
on conflict(migration_key) do update set status='completed', finished_at=now(), notes=excluded.notes;

commit;
