-- Cho phép Giám đốc: (1) nhập toạ độ TAY (copy từ định vị nhân sự gửi trực
-- tiếp tại chỗ, không bắt buộc phải tự đứng đó), (2) thêm địa điểm mới / đổi
-- tên / xoá địa điểm — không chỉ giới hạn đúng 4 điểm đã seed ban đầu.
--
-- SỬA QUAN TRỌNG kèm theo: trigger geofence (sumi_kiem_tra_geofence, migration
-- 202609030000) trước đây chỉ lấy "limit 1" địa điểm đầu tiên khớp bộ phận —
-- giờ 1 bộ phận có thể có NHIỀU địa điểm (VD thêm chi nhánh thứ 2 cho cùng
-- "bakery"), phải kiểm tra khoảng cách tới TẤT CẢ, cho qua nếu gần bất kỳ
-- điểm nào trong bán kính của chính điểm đó.
begin;
set local lock_timeout = '10s';
set local statement_timeout = '120s';

-- ---------------------------------------------------------------------------
-- 1. Sửa toạ độ/bán kính/tên — bổ sung p_name (tuỳ chọn, giữ nguyên nếu không
--    truyền) so với bản gốc chỉ có p_lat/p_lng/p_radius_m.
-- ---------------------------------------------------------------------------
create or replace function public.sumi_dat_toa_do_vi_tri(
  p_location_id uuid, p_lat numeric, p_lng numeric, p_radius_m int default null, p_name text default null
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
      name = coalesce(nullif(btrim(coalesce(p_name, '')), ''), name),
      updated_at = now()
  where id = p_location_id
  returning name into v_ten;

  if v_ten is null then
    return jsonb_build_object('thanh_cong', false, 'thong_bao', 'Không tìm thấy vị trí.');
  end if;

  return jsonb_build_object('thanh_cong', true, 'thong_bao', 'Đã lưu toạ độ chuẩn cho ' || v_ten || '.');
end;
$fn$;

-- ---------------------------------------------------------------------------
-- 2. Thêm địa điểm mới (không giới hạn đúng 4 điểm ban đầu).
-- ---------------------------------------------------------------------------
create or replace function public.sumi_them_vi_tri_lam_viec(
  p_name text, p_bo_phan text, p_lat numeric default null, p_lng numeric default null, p_radius_m int default 20
)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare v_id uuid; v_ma text;
begin
  if not public.is_business_director() then
    return jsonb_build_object('thanh_cong', false, 'thong_bao', 'Chỉ Giám đốc/Quản lý mới thêm được địa điểm.');
  end if;
  if nullif(btrim(coalesce(p_name, '')), '') is null then
    return jsonb_build_object('thanh_cong', false, 'thong_bao', 'Cần nhập tên địa điểm.');
  end if;
  if p_bo_phan not in ('bakery','xuong41','xuong42','van_tai') then
    return jsonb_build_object('thanh_cong', false, 'thong_bao', 'Bộ phận không hợp lệ.');
  end if;
  if p_lat is not null and (abs(p_lat) > 90 or (p_lng is not null and abs(p_lng) > 180)) then
    return jsonb_build_object('thanh_cong', false, 'thong_bao', 'Toạ độ không hợp lệ.');
  end if;

  -- Mã định danh duy nhất, không phụ thuộc extension unaccent (chưa chắc đã
  -- bật trên máy chủ) — chỉ dùng nội bộ, Giám đốc không cần thấy/nhớ mã này.
  v_ma := 'loc_' || replace(gen_random_uuid()::text, '-', '');

  insert into public.work_locations(code, name, bo_phan, lat, lng, radius_m)
  values (v_ma, btrim(p_name), p_bo_phan, p_lat, p_lng, coalesce(p_radius_m, 20))
  returning id into v_id;

  return jsonb_build_object('thanh_cong', true, 'id', v_id, 'thong_bao', 'Đã thêm địa điểm "' || p_name || '".');
end;
$fn$;

-- ---------------------------------------------------------------------------
-- 3. Xoá địa điểm — XOÁ MỀM (active=false), không mất lịch sử/không phá vỡ
--    tham chiếu nếu sau này có bảng khác trỏ vào work_locations.id.
-- ---------------------------------------------------------------------------
create or replace function public.sumi_xoa_vi_tri_lam_viec(p_location_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare v_ten text;
begin
  if not public.is_business_director() then
    return jsonb_build_object('thanh_cong', false, 'thong_bao', 'Chỉ Giám đốc/Quản lý mới xoá được địa điểm.');
  end if;

  update public.work_locations set active = false, updated_at = now()
  where id = p_location_id
  returning name into v_ten;

  if v_ten is null then
    return jsonb_build_object('thanh_cong', false, 'thong_bao', 'Không tìm thấy vị trí.');
  end if;

  return jsonb_build_object('thanh_cong', true, 'thong_bao', 'Đã xoá địa điểm "' || v_ten || '".');
end;
$fn$;

revoke all on function public.sumi_dat_toa_do_vi_tri(uuid, numeric, numeric, int, text) from public, anon;
grant execute on function public.sumi_dat_toa_do_vi_tri(uuid, numeric, numeric, int, text) to authenticated;
revoke all on function public.sumi_them_vi_tri_lam_viec(text, text, numeric, numeric, int) from public, anon;
grant execute on function public.sumi_them_vi_tri_lam_viec(text, text, numeric, numeric, int) to authenticated;
revoke all on function public.sumi_xoa_vi_tri_lam_viec(uuid) from public, anon;
grant execute on function public.sumi_xoa_vi_tri_lam_viec(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Geofence: kiểm tra TẤT CẢ địa điểm của đúng bộ phận (không chỉ 1), cho
--    qua nếu gần bất kỳ điểm nào trong bán kính CỦA CHÍNH điểm đó. Thông báo
--    lỗi nêu tên + khoảng cách tới điểm GẦN NHẤT để dễ hiểu vì sao bị chặn.
-- ---------------------------------------------------------------------------
create or replace function public.sumi_kiem_tra_geofence()
returns trigger language plpgsql security definer set search_path = public as $fn$
declare
  v_bp        text;
  v_loc       record;
  v_km        numeric;
  v_m         int;
  v_co_diem   boolean := false;
  v_gan_nhat  record;
  v_m_gan_nhat int;
begin
  if NEW.type is distinct from 'checkin' then return NEW; end if;
  if NEW.gps_lat is null or NEW.gps_lng is null then return NEW; end if;
  if NEW.reason like '[BỔ SUNG]%' then return NEW; end if;

  v_bp := public.sumi_bo_phan_cham_cong(NEW.staff_id);
  if v_bp is null then return NEW; end if;

  for v_loc in
    select * from public.work_locations
    where bo_phan = v_bp and active and lat is not null and lng is not null
  loop
    v_co_diem := true;
    v_km := 2 * 6371 * asin(sqrt(
      power(sin(radians(v_loc.lat - NEW.gps_lat) / 2), 2) +
      cos(radians(NEW.gps_lat)) * cos(radians(v_loc.lat)) *
      power(sin(radians(v_loc.lng - NEW.gps_lng) / 2), 2)
    ));
    v_m := round(v_km * 1000)::int;

    if v_m <= v_loc.radius_m then
      return NEW; -- trong bán kính CỦA MỘT điểm bất kỳ -> cho qua ngay
    end if;

    if v_gan_nhat is null or v_m < v_m_gan_nhat then
      v_gan_nhat := v_loc; v_m_gan_nhat := v_m;
    end if;
  end loop;

  if not v_co_diem then return NEW; end if; -- bộ phận chưa hiệu chuẩn điểm nào -> không chặn

  raise exception 'Bạn đang cách % gần nhất khoảng %m — vượt quá bán kính cho phép (%m). Vui lòng tới đúng vị trí làm việc rồi chấm công lại.',
    v_gan_nhat.name, v_m_gan_nhat, v_gan_nhat.radius_m;
end;
$fn$;

insert into public.migration_runs(migration_key, status, finished_at, notes)
values('202609031000_them_sua_xoa_vi_tri_lam_viec', 'completed', now(),
  'Cho phép nhập toạ độ tay (không bắt buộc GPS thiết bị owner — copy định vị nhân sự gửi tại chỗ) qua p_lat/p_lng trực tiếp trong sumi_dat_toa_do_vi_tri (đã có sẵn, không đổi hành vi). Thêm sumi_them_vi_tri_lam_viec (thêm địa điểm mới, không giới hạn 4 điểm ban đầu) và sumi_xoa_vi_tri_lam_viec (xoá mềm, active=false). Sửa quan trọng kèm theo: sumi_kiem_tra_geofence trước đây chỉ xét "limit 1" địa điểm đầu tiên của bộ phận — giờ xét TẤT CẢ địa điểm active của bộ phận, cho qua nếu gần bất kỳ điểm nào (cần thiết vì giờ 1 bộ phận có thể có nhiều địa điểm), báo lỗi kèm điểm gần nhất.')
on conflict(migration_key) do update set status='completed', finished_at=now(), notes=excluded.notes;

commit;
