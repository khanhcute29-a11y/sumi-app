-- Fix bug: sumi_chuyen_giao_don_vi_van_chuyen() (migration 202609031300) tham
-- chiếu cột "email" trên public.profiles, nhưng bảng này KHÔNG có cột email
-- (dự án dùng đăng nhập bằng số điện thoại — xem migrate_phone_auth.sql).
-- Lỗi thật gặp phải: nhân viên bấm "Xác nhận chuyển giao" ở màn Macaron ->
-- Postgres báo "column email does not exist" -> chuyển giao thất bại hoàn
-- toàn (transaction rollback, third_party_shipments không được tạo, đơn
-- không chuyển sang in_delivery).
begin;
set local lock_timeout = '10s';
set local statement_timeout = '60s';

create or replace function public.sumi_chuyen_giao_don_vi_van_chuyen(
  p_order_id uuid,
  p_carrier text,
  p_carrier_other_name text default null,
  p_tracking_id text default null,
  p_driver_name text default null,
  p_driver_phone text default null,
  p_notes text default null
) returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_status text;
  v_ten_nguoi text;
  v_id uuid;
begin
  if not public.is_business_director() then
    return jsonb_build_object('success', false, 'error', 'Chỉ Giám đốc/Quản lý mới chuyển giao được đơn vị vận chuyển.');
  end if;
  if p_carrier not in ('ghn','grab','ahamove','other') then
    return jsonb_build_object('success', false, 'error', 'Đơn vị vận chuyển không hợp lệ.');
  end if;

  select status_v2 into v_status from public.orders where id = p_order_id for update;
  if v_status is null then
    return jsonb_build_object('success', false, 'error', 'Không tìm thấy đơn hàng.');
  end if;
  if v_status <> 'ready_for_fulfillment' then
    return jsonb_build_object('success', false, 'error', 'Đơn chưa vào Kho Thành Phẩm (chưa sẵn sàng để giao) — không thể chuyển giao.');
  end if;

  select coalesce(full_name, phone, 'Không rõ') into v_ten_nguoi from public.profiles where id = auth.uid();

  insert into public.third_party_shipments(
    order_id, carrier, carrier_other_name, tracking_id, driver_name, driver_phone, notes,
    handed_off_by, handed_off_by_name
  ) values (
    p_order_id, p_carrier, nullif(btrim(coalesce(p_carrier_other_name,'')),''),
    nullif(btrim(coalesce(p_tracking_id,'')),''), nullif(btrim(coalesce(p_driver_name,'')),''),
    nullif(btrim(coalesce(p_driver_phone,'')),''), nullif(btrim(coalesce(p_notes,'')),''),
    auth.uid(), v_ten_nguoi
  ) returning id into v_id;

  update public.orders set status_v2 = 'in_delivery', version = version + 1
  where id = p_order_id;

  return jsonb_build_object('success', true, 'id', v_id, 'message', 'Đã chuyển giao đơn cho đơn vị vận chuyển.');
end;
$fn$;

insert into public.migration_runs(migration_key, status, finished_at, notes)
values('202609031500_fix_email_khong_ton_tai_chuyen_giao_dvvc', 'completed', now(),
  'Fix sumi_chuyen_giao_don_vi_van_chuyen(): cột "email" không tồn tại trên profiles (dự án dùng phone auth) gây lỗi "column email does not exist" khi nhân viên xác nhận chuyển giao ĐVVC bên thứ 3. Đổi fallback tên người chuyển giao sang coalesce(full_name, phone, ''Không rõ'').')
on conflict(migration_key) do update set status='completed', finished_at=now(), notes=excluded.notes;

commit;
