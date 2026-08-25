-- Khi bếp nhận việc, hai RPC accept_work_package_self và
-- accept_delegate_work_package (M-202608260006) CHỈ sửa bảng
-- order_work_packages mà không đụng tới public.orders.
--
-- Hệ quả 1 (dữ liệu): đơn vẫn nằm ở 'awaiting_assignment'/'awaiting_acceptance'
--   trong khi bếp đã bắt đầu làm, nên bộ lọc "Bếp đang làm" (status_v2 =
--   'in_production') trong OrdersV2Screen/MobileHomeScreen không bao giờ đếm
--   được các đơn này.
-- Hệ quả 2 (thông báo): bảng order_work_packages KHÔNG nằm trong publication
--   supabase_realtime (chỉ orders, order_notes, incident_reports... có), nên
--   không máy nào nhận được tín hiệu -> chuông "nhận đơn" im lặng.
--
-- Sửa: cho hai RPC này chuyển đơn sang 'in_production' đúng như bản chất
-- nghiệp vụ. Có bảo vệ: chỉ chuyển khi đơn còn ở giai đoạn trước sản xuất,
-- để không kéo ngược một đơn đã 'ready_for_fulfillment'/'in_delivery'/
-- 'completed' về lại 'in_production' khi thêm bếp phối hợp.
begin;

create or replace function public.accept_delegate_work_package(
  p_package_id uuid,
  p_staff_id uuid,
  p_staff_name text
)
returns json as $$
declare
  v_order_id uuid;
begin
  update public.order_work_packages
  set
    status = 'in_progress',
    accepted_at = now(),
    assigned_to_staff_id = p_staff_id,
    assigned_to_staff_name = p_staff_name,
    assigned_at = now()
  where id = p_package_id
  returning order_id into v_order_id;

  update public.orders
  set status_v2 = 'in_production', version = version + 1
  where id = v_order_id
    and status_v2 in ('pending', 'awaiting_assignment', 'awaiting_acceptance');

  return json_build_object(
    'success', true,
    'message', 'Work package delegated to staff',
    'package_id', p_package_id,
    'order_id', v_order_id,
    'staff_name', p_staff_name,
    'timestamp', now()
  );

exception when others then
  return json_build_object('success', false, 'error', SQLERRM, 'code', SQLSTATE);
end;
$$ language plpgsql security definer set search_path = public;

grant execute on function public.accept_delegate_work_package to authenticated;

create or replace function public.accept_work_package_self(
  p_package_id uuid,
  p_staff_id uuid,
  p_staff_name text
)
returns json as $$
declare
  v_order_id uuid;
begin
  update public.order_work_packages
  set
    status = 'in_progress',
    accepted_at = now(),
    assigned_to_staff_id = p_staff_id,
    assigned_to_staff_name = p_staff_name,
    assigned_at = now()
  where id = p_package_id
  returning order_id into v_order_id;

  update public.orders
  set status_v2 = 'in_production', version = version + 1
  where id = v_order_id
    and status_v2 in ('pending', 'awaiting_assignment', 'awaiting_acceptance');

  return json_build_object(
    'success', true,
    'message', 'Work package accepted by kitchen lead',
    'package_id', p_package_id,
    'order_id', v_order_id,
    'timestamp', now()
  );

exception when others then
  return json_build_object('success', false, 'error', SQLERRM, 'code', SQLSTATE);
end;
$$ language plpgsql security definer set search_path = public;

grant execute on function public.accept_work_package_self to authenticated;

insert into public.migration_runs(migration_key, status, finished_at, notes)
values('202608260020_kitchen_accept_sets_order_in_production', 'completed', now(),
  'accept_work_package_self / accept_delegate_work_package now move orders.status_v2 to in_production (guarded to pre-production statuses) so the "Bếp đang làm" filter works and realtime notifies every device.')
on conflict(migration_key) do update set status='completed', finished_at=now(), notes=excluded.notes;

commit;
