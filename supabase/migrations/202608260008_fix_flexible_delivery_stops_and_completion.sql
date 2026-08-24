-- accept_delivery_assignment_flexible (M-202608260001) writes gps_latitude,
-- gps_longitude, photo_proof_url, started_at onto delivery_stops — none of
-- these columns ever existed on that table, so the UPDATE always raised
-- "column does not exist", caught silently by the RPC's blanket exception
-- handler (success:false with no visible reason to the caller). It also only
-- UPDATEs delivery_stops, never INSERTs one when the order has none yet —
-- the common case for this new "any staff can accept" flow — so even after
-- adding the columns, the GPS/photo would still be dropped for those orders.
-- Also: complete_delivery_assignment (M-202608260004) never set
-- orders.completed_at, so orders finished through this flow never show up
-- in revenue-by-flow (which filters on completed_at).
begin;

alter table public.delivery_stops add column if not exists gps_latitude numeric;
alter table public.delivery_stops add column if not exists gps_longitude numeric;
alter table public.delivery_stops add column if not exists photo_proof_url text;
alter table public.delivery_stops add column if not exists started_at timestamptz;

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
      id, branch_id, assigned_driver_id, status, started_at
    ) values (
      gen_random_uuid(),
      (select branch_id from public.orders where id = v_order_id),
      p_assigned_staff_id,
      'in_progress',
      v_started_at
    )
    returning id into v_delivery_run_id;
  else
    update public.delivery_runs
    set
      assigned_driver_id = p_assigned_staff_id,
      status = 'in_progress',
      started_at = v_started_at
    where id = v_delivery_run_id;
  end if;

  -- Đơn qua luồng "Nhận Giao linh hoạt" thường chưa có delivery_stops nào —
  -- tạo mới nếu chưa có, thay vì chỉ UPDATE (trước đây UPDATE 0 dòng, làm
  -- mất GPS/ảnh mà không báo lỗi).
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

  insert into public.kpi_logs (
    id, order_id, staff_id, staff_name, event_type,
    gps_latitude, gps_longitude, photo_url, notes, created_at
  ) values (
    gen_random_uuid(),
    v_order_id,
    p_assigned_staff_id,
    p_assigned_staff_name,
    'delivery_assigned',
    p_gps_latitude,
    p_gps_longitude,
    p_photo_url,
    'Flexible delivery accepted by ' || p_assigned_staff_name,
    v_started_at
  ) on conflict do nothing;

  return json_build_object(
    'success', true,
    'message', 'Delivery assignment accepted',
    'order_id', v_order_id,
    'delivery_run_id', v_delivery_run_id,
    'timestamp', v_started_at
  );

exception when others then
  return json_build_object(
    'success', false,
    'error', SQLERRM,
    'code', SQLSTATE
  );
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
begin
  update public.orders
  set status_v2 = 'completed', status = 'hoan_thanh', completed_at = now()
  where id = p_order_id;

  update public.delivery_stops
  set status = 'delivered', delivered_at = now()
  where order_id = p_order_id and status <> 'delivered';

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
values('202608260008_fix_flexible_delivery_stops_and_completion', 'completed', now(),
  'Added missing gps_latitude/gps_longitude/photo_proof_url/started_at columns to delivery_stops, made accept_delivery_assignment_flexible insert a delivery_stops row when the order has none, and made complete_delivery_assignment set orders.completed_at so completed orders show up in revenue tracking.')
on conflict(migration_key) do update set status='completed', finished_at=now(), notes=excluded.notes;

commit;
