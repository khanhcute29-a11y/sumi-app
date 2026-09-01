-- Định Vị GPS: Chấm Công Geofencing, Đo Lường Vận Tải & Giám Sát Thời Gian Thực.
--
-- ═══ 4 VIỆC CHÍNH ═══
--
-- 1) `work_locations` — toạ độ CHUẨN của 4 điểm làm việc (Xưởng 41, Xưởng 42,
--    Cửa hàng Vĩnh Phú 42, Quốc lộ 13). KHÔNG bịa toạ độ thật — seed 4 dòng
--    với lat/lng RỖNG, Giám đốc tự "Lấy vị trí hiện tại" khi đứng tại chỗ
--    (UI trong SettingsScreen.jsx) để hiệu chuẩn đúng thực địa. Khi CHƯA hiệu
--    chuẩn, geofence KHÔNG chặn ai cả (fail-open) — tránh khoá cả tiệm vì
--    thiếu dữ liệu, giống bài học "version.json lệch khoá màn hình" đã có.
--
-- 2) Trigger geofence trên `shift_logs`: BEFORE INSERT lúc chấm công vào ca —
--    tính khoảng cách Haversine tới điểm làm việc CỦA ĐÚNG BỘ PHẬN (dùng lại
--    sumi_bo_phan_cham_cong đã có), > bán kính cho phép (mặc định 20m) thì
--    RAISE EXCEPTION chặn hẳn, không cho ghi dòng chấm công.
--
-- 3) KM giao hàng THẬT: tận dụng cột GPS đã có sẵn nhưng CHƯA bao giờ được
--    tính (delivery_runs.start_lat/start_lng/end_lat/end_lng/distance_km/
--    distance_source — có từ migration 202608220007, distance_source='gps'
--    đã khai báo trong CHECK nhưng chưa ai từng ghi giá trị này). Bổ sung
--    ĐIỂM ĐI vào accept_delivery_assignment_flexible và ĐIỂM ĐẾN vào
--    complete_delivery_assignment (additive — không đổi tham số/return cũ),
--    rồi 1 trigger tự tính Haversine khi cả hai điểm đã có. CHỈ tính khi
--    distance_km đang RỖNG — không đè lên số km dispatcher đã nhập tay.
--
-- 4) `staff_location_pings` — vị trí định kỳ trong ca, ghi qua client mỗi ~5
--    phút (src/lib/liveTracking.js). Giám đốc xem lại ở đúng hộp "Chi Tiết
--    Nhân Sự" đã có (ChiTietNhanSuModal.jsx) — KHÔNG dựng bản đồ nhúng mới,
--    dùng lại đúng cách link Google Maps mà ShippingV2Screen.jsx đã dùng.
--    LƯU Ý THẬT: đây là công cụ ĐỐI CHIẾU, không phải bằng chứng chống gian
--    lận tuyệt đối — điện thoại để 1 chỗ vẫn tiếp tục gửi được ping.
begin;
set local lock_timeout = '10s';
set local statement_timeout = '120s';

-- ---------------------------------------------------------------------------
-- 1. work_locations
-- ---------------------------------------------------------------------------
create table if not exists public.work_locations (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,
  name        text not null,
  bo_phan     text not null check (bo_phan in ('bakery','xuong41','xuong42','van_tai')),
  lat         numeric,
  lng         numeric,
  radius_m    int not null default 20,
  active      boolean not null default true,
  updated_at  timestamptz not null default now()
);

insert into public.work_locations (code, name, bo_phan) values
  ('xuong41',   'Xưởng 41',                 'xuong41'),
  ('xuong42',   'Xưởng 42',                 'xuong42'),
  ('vinh_phu42','Cửa hàng Vĩnh Phú 42',     'bakery'),
  ('ql13',      'Quốc lộ 13',                'van_tai')
on conflict (code) do nothing;

alter table public.work_locations enable row level security;

drop policy if exists "ai cung doc duoc vi tri chuan" on public.work_locations;
create policy "ai cung doc duoc vi tri chuan" on public.work_locations
  for select to authenticated using (public.is_approved());

drop policy if exists "giam doc sua vi tri chuan" on public.work_locations;
create policy "giam doc sua vi tri chuan" on public.work_locations
  for all to authenticated
  using (public.is_business_director())
  with check (public.is_business_director());

-- Cổng ghi toạ độ chuẩn (bọc thêm RPC dù RLS đã chặn owner/admin, để validate
-- bán kính hợp lý và trả thông báo tiếng Việt rõ ràng thay vì lỗi Postgres thô).
create or replace function public.sumi_dat_toa_do_vi_tri(
  p_location_id uuid, p_lat numeric, p_lng numeric, p_radius_m int default null
)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare v_ten text;
begin
  if not public.is_business_director() then
    return jsonb_build_object('thanh_cong', false, 'thong_bao', 'Chỉ Giám đốc/Quản lý mới đặt được toạ độ chuẩn.');
  end if;
  if p_lat is null or p_lng is null or abs(p_lat) > 90 or abs(p_lng) > 180 then
    return jsonb_build_object('thanh_cong', false, 'thong_bao', 'Toạ độ không hợp lệ.');
  end if;

  update public.work_locations
  set lat = p_lat, lng = p_lng,
      radius_m = coalesce(p_radius_m, radius_m),
      updated_at = now()
  where id = p_location_id
  returning name into v_ten;

  if v_ten is null then
    return jsonb_build_object('thanh_cong', false, 'thong_bao', 'Không tìm thấy vị trí.');
  end if;

  return jsonb_build_object('thanh_cong', true, 'thong_bao', 'Đã lưu toạ độ chuẩn cho ' || v_ten || '.');
end;
$fn$;

revoke all on function public.sumi_dat_toa_do_vi_tri(uuid, numeric, numeric, int) from public, anon;
grant execute on function public.sumi_dat_toa_do_vi_tri(uuid, numeric, numeric, int) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Geofence khi chấm công vào ca — Haversine, đơn vị mét.
-- ---------------------------------------------------------------------------
create or replace function public.sumi_kiem_tra_geofence()
returns trigger language plpgsql security definer set search_path = public as $fn$
declare
  v_bp   text;
  v_loc  record;
  v_km   numeric;
  v_m    int;
begin
  if NEW.type is distinct from 'checkin' then return NEW; end if;
  -- Không có GPS (thiết bị chặn định vị...) -> KHÔNG chặn, giữ đúng hành vi
  -- cũ trước khi có tính năng này. Đây là lưới an toàn, không phải khoá cứng.
  if NEW.gps_lat is null or NEW.gps_lng is null then return NEW; end if;
  if NEW.reason like '[BỔ SUNG]%' then return NEW; end if;

  v_bp := public.sumi_bo_phan_cham_cong(NEW.staff_id);
  if v_bp is null then return NEW; end if;

  select * into v_loc from public.work_locations
    where bo_phan = v_bp and active and lat is not null and lng is not null
    limit 1;
  if v_loc is null then return NEW; end if; -- chưa hiệu chuẩn toạ độ -> không chặn

  v_km := 2 * 6371 * asin(sqrt(
    power(sin(radians(v_loc.lat - NEW.gps_lat) / 2), 2) +
    cos(radians(NEW.gps_lat)) * cos(radians(v_loc.lat)) *
    power(sin(radians(v_loc.lng - NEW.gps_lng) / 2), 2)
  ));
  v_m := round(v_km * 1000)::int;

  if v_m > v_loc.radius_m then
    raise exception 'Bạn đang cách % khoảng %m — vượt quá bán kính cho phép (%m). Vui lòng tới đúng vị trí làm việc rồi chấm công lại.',
      v_loc.name, v_m, v_loc.radius_m;
  end if;

  return NEW;
end;
$fn$;

drop trigger if exists sumi_kiem_tra_geofence_tg on public.shift_logs;
create trigger sumi_kiem_tra_geofence_tg
  before insert on public.shift_logs
  for each row execute function public.sumi_kiem_tra_geofence();

-- ---------------------------------------------------------------------------
-- 3. KM giao hàng thật — bổ sung điểm đi/điểm đến vào 2 RPC đã có, cộng 1
--    trigger tự tính khi cả hai điểm đã sẵn sàng.
-- ---------------------------------------------------------------------------
alter table public.delivery_runs add column if not exists vehicle_type text not null default 'xe_may' check (vehicle_type in ('xe_may','o_to'));
alter table public.shop_settings add column if not exists avg_speed_kmh_oto numeric not null default 35;

create or replace function public.accept_delivery_assignment_flexible(
  p_order_id uuid,
  p_assigned_staff_id uuid,
  p_assigned_staff_name text,
  p_gps_latitude numeric,
  p_gps_longitude numeric,
  p_photo_url text
)
returns json as $$
declare
  v_order_id uuid := p_order_id;
  v_delivery_run_id uuid;
  v_started_at timestamp;
begin
  v_started_at := now();

  select dr.id into v_delivery_run_id
  from public.delivery_runs dr
  join public.delivery_stops ds on ds.delivery_run_id = dr.id
  where ds.order_id = v_order_id
  limit 1;

  if v_delivery_run_id is null then
    insert into public.delivery_runs (
      id, branch_id, assigned_driver_id, status, started_at, start_lat, start_lng
    ) values (
      gen_random_uuid(),
      (select branch_id from public.orders where id = v_order_id),
      p_assigned_staff_id,
      'in_progress',
      v_started_at,
      p_gps_latitude, p_gps_longitude
    )
    returning id into v_delivery_run_id;
  else
    update public.delivery_runs
    set
      assigned_driver_id = p_assigned_staff_id,
      status = 'in_progress',
      started_at = v_started_at,
      start_lat = coalesce(start_lat, p_gps_latitude),
      start_lng = coalesce(start_lng, p_gps_longitude)
    where id = v_delivery_run_id;
  end if;

  insert into public.delivery_stops(delivery_run_id, order_id, sequence_no, status, destination_address, destination_lat, destination_lng)
  select v_delivery_run_id, v_order_id, 1, 'pending', o.address, o.delivery_lat, o.delivery_lng
  from public.orders o where o.id = v_order_id
  on conflict (delivery_run_id, order_id) do nothing;

  update public.delivery_stops
  set
    gps_latitude = p_gps_latitude,
    gps_longitude = p_gps_longitude,
    photo_proof_url = p_photo_url,
    started_at = v_started_at,
    status = 'in_transit'
  where order_id = v_order_id;

  update public.orders
  set status_v2 = 'in_delivery'
  where id = v_order_id;

  return json_build_object('success', true, 'delivery_run_id', v_delivery_run_id);
exception when others then
  return json_build_object('success', false, 'error', SQLERRM);
end;
$$ language plpgsql security definer set search_path = public;

create or replace function public.complete_delivery_assignment(
  p_order_id uuid,
  p_staff_id uuid,
  p_staff_name text,
  p_gps_latitude numeric,
  p_gps_longitude numeric,
  p_photo_url text
)
returns json as $$
declare v_run_id uuid;
begin
  update public.orders
  set status_v2 = 'completed', status = 'hoan_thanh', completed_at = now()
  where id = p_order_id;

  update public.delivery_stops
  set status = 'delivered', delivered_at = now()
  where order_id = p_order_id and status <> 'delivered'
  returning delivery_run_id into v_run_id;

  if v_run_id is null then
    select delivery_run_id into v_run_id from public.delivery_stops where order_id = p_order_id limit 1;
  end if;

  if v_run_id is not null then
    update public.delivery_runs
    set end_lat = p_gps_latitude, end_lng = p_gps_longitude,
        status = case when status <> 'completed' then 'completed' else status end,
        completed_at = coalesce(completed_at, now())
    where id = v_run_id;
  end if;

  insert into public.kpi_logs (
    id, order_id, staff_id, staff_name, event_type,
    gps_latitude, gps_longitude, photo_url, notes, created_at
  ) values (
    gen_random_uuid(),
    p_order_id,
    p_staff_id,
    p_staff_name,
    'delivery_completed',
    p_gps_latitude,
    p_gps_longitude,
    p_photo_url,
    'Delivery completed by ' || p_staff_name,
    now()
  ) on conflict do nothing;

  return json_build_object(
    'success', true,
    'message', 'Delivery completed',
    'order_id', p_order_id,
    'timestamp', now()
  );

exception when others then
  return json_build_object(
    'success', false,
    'error', SQLERRM,
    'code', SQLSTATE
  );
end;
$$ language plpgsql security definer set search_path = public;

-- Tự tính km THẬT khi cả điểm đi lẫn điểm đến đã có — KHÔNG đè số dispatcher
-- đã nhập tay (chỉ chạy khi distance_km đang rỗng).
create or replace function public.sumi_tinh_km_giao_hang()
returns trigger language plpgsql security definer set search_path = public as $fn$
declare v_km numeric;
begin
  if NEW.distance_km is not null then return NEW; end if;
  if NEW.start_lat is null or NEW.start_lng is null or NEW.end_lat is null or NEW.end_lng is null then return NEW; end if;

  v_km := 2 * 6371 * asin(sqrt(
    power(sin(radians(NEW.end_lat - NEW.start_lat) / 2), 2) +
    cos(radians(NEW.start_lat)) * cos(radians(NEW.end_lat)) *
    power(sin(radians(NEW.end_lng - NEW.start_lng) / 2), 2)
  ));

  NEW.distance_km := round(v_km::numeric, 2);
  NEW.distance_source := 'gps';
  return NEW;
end;
$fn$;

drop trigger if exists sumi_tinh_km_giao_hang_tg on public.delivery_runs;
create trigger sumi_tinh_km_giao_hang_tg
  before update on public.delivery_runs
  for each row execute function public.sumi_tinh_km_giao_hang();

-- ---------------------------------------------------------------------------
-- 4. Giám sát vị trí thời gian thực trong ca.
-- ---------------------------------------------------------------------------
create table if not exists public.staff_location_pings (
  id           uuid primary key default gen_random_uuid(),
  staff_id     uuid not null references public.profiles(id) on delete cascade,
  lat          numeric not null,
  lng          numeric not null,
  accuracy_m   numeric,
  recorded_at  timestamptz not null default now()
);

create index if not exists idx_staff_location_pings_staff_time
  on public.staff_location_pings(staff_id, recorded_at desc);

alter table public.staff_location_pings enable row level security;

drop policy if exists "nhan su tu ghi vi tri cua minh" on public.staff_location_pings;
create policy "nhan su tu ghi vi tri cua minh" on public.staff_location_pings
  for insert to authenticated with check (staff_id = auth.uid());

drop policy if exists "doc vi tri cua minh hoac quan ly" on public.staff_location_pings;
create policy "doc vi tri cua minh hoac quan ly" on public.staff_location_pings
  for select to authenticated
  using (staff_id = auth.uid() or public.is_payroll_manager() or public.sumi_cung_don_vi_voi_toi(staff_id));

revoke update, delete on public.staff_location_pings from authenticated;
grant select, insert on public.staff_location_pings to authenticated;

-- Dọn ping cũ hơn 2 ngày — gộp vào ĐÚNG cron mỗi phút đã có, không tạo job mới.
create or replace function public.process_task_reminders_and_deadlines()
returns integer language plpgsql security definer set search_path=public as $$
declare v1 integer; v2 integer; v3 integer;
begin
 v1 := public.process_task_reminders();
 v2 := public.process_task_deadline_alerts();
 v3 := public.process_late_checkin_alerts();
 delete from public.staff_location_pings where recorded_at < now() - interval '2 days';
 return coalesce(v1,0) + coalesce(v2,0) + coalesce(v3,0);
end $$;

insert into public.migration_runs(migration_key, status, finished_at, notes)
values('202609030000_gps_geofencing_km_giam_sat_truc_tuyen', 'completed', now(),
  'GPS Geofencing: work_locations (4 điểm, toạ độ rỗng chờ Giám đốc hiệu chuẩn qua sumi_dat_toa_do_vi_tri) + trigger chặn chấm công ngoài bán kính (fail-open khi chưa hiệu chuẩn/không có GPS). KM giao hàng thật: accept_delivery_assignment_flexible ghi start_lat/lng, complete_delivery_assignment ghi end_lat/lng vào delivery_runs (trước đây các cột này tồn tại từ 202608220007 nhưng chưa ai từng ghi), trigger sumi_tinh_km_giao_hang tự tính Haversine khi distance_km đang rỗng (không đè số dispatcher nhập tay). Thêm delivery_runs.vehicle_type + shop_settings.avg_speed_kmh_oto để ước tính thời gian theo phương tiện phía client. Giám sát thời gian thực: staff_location_pings (ghi mỗi ~5 phút lúc đang trong ca), dọn dữ liệu >2 ngày gộp vào cron process_task_reminders_and_deadlines có sẵn.')
on conflict(migration_key) do update set status='completed', finished_at=now(), notes=excluded.notes;

commit;
