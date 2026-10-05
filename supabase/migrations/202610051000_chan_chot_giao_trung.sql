-- Chặn chốt giao trùng ở complete_delivery_assignment (yêu cầu Giám đốc
-- 05/10/2026, sau phản ánh tài xế bấm "Hoàn Thành Giao" bị đơ phải thoát ra làm
-- lại). Đo thật 14 ngày: 98 lượt chốt cho 97 đơn — đơn bfe77f4a bị chốt 2 lần
-- cách 52 giây, KPI giao hàng đếm gấp đôi.
--
-- Chỉ THÊM đoạn kiểm tra ở đầu hàm; phần còn lại giữ NGUYÊN VĂN bản đang chạy
-- (migration 202609030000). Chữ ký hàm không đổi, app cũ gọi vẫn chạy.
begin;
set local lock_timeout = '10s';
set local statement_timeout = '30s';

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
  v_trang_thai text;
  v_xong_luc   timestamptz;
begin
  -- Chặn chốt giao TRÙNG (yêu cầu Giám đốc 05/10/2026): tài xế bị đơ, thoát ra
  -- bấm lại -> trước đây ghi thêm 1 dòng KPI 'delivery_completed' (KPI đếm gấp
  -- đôi) và đè completed_at bằng giờ bấm sau. Khoá dòng đơn (for update) để 2
  -- lần bấm sát nhau không cùng lọt; đơn đã xong thì trả về thành công kèm cờ
  -- already_completed, KHÔNG ghi gì thêm.
  select status_v2, completed_at into v_trang_thai, v_xong_luc
    from public.orders where id = p_order_id for update;
  if v_trang_thai = 'completed' then
    return json_build_object(
      'success', true,
      'already_completed', true,
      'message', 'Đơn đã được ghi nhận giao xong trước đó',
      'order_id', p_order_id,
      'timestamp', v_xong_luc
    );
  end if;

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

insert into public.migration_runs(migration_key, status, finished_at, notes)
values('202610051000_chan_chot_giao_trung', 'completed', now(),
  'complete_delivery_assignment: khoá dòng đơn + đơn đã completed thì trả success kèm already_completed, không ghi thêm kpi_logs / không đè completed_at. Phần còn lại giữ nguyên bản 202609030000.')
on conflict(migration_key) do update set status='completed', finished_at=now(), notes=excluded.notes;

commit;
