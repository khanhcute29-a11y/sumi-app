-- Flexible Delivery Assignment: Any staff can accept & deliver
-- Includes GPS, photo proof, KPI logging

begin;

-- RPC: Accept delivery assignment (any staff, not just shipper)
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
  v_order_total numeric;
  v_order_type text;
  v_started_at timestamp;
begin
  -- Start transaction
  v_started_at := now();

  -- Get delivery run for this order
  select dr.id into v_delivery_run_id
  from public.delivery_runs dr
  join public.delivery_stops ds on ds.delivery_run_id = dr.id
  where ds.order_id = v_order_id
  limit 1;

  if v_delivery_run_id is null then
    -- Create delivery run if doesn't exist
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
    -- Update existing delivery run
    update public.delivery_runs
    set
      assigned_driver_id = p_assigned_staff_id,
      status = 'in_progress',
      started_at = v_started_at
    where id = v_delivery_run_id;
  end if;

  -- Update delivery stop: GPS + photo + timestamp
  update public.delivery_stops
  set
    gps_latitude = p_gps_latitude,
    gps_longitude = p_gps_longitude,
    photo_proof_url = p_photo_url,
    started_at = v_started_at,
    status = 'in_transit'
  where order_id = v_order_id;

  -- Update order status to in_delivery
  update public.orders
  set status_v2 = 'in_delivery'
  where id = v_order_id;

  -- Log KPI: delivery_assigned
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
  );

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

-- Grant access to authenticated users
grant execute on function public.accept_delivery_assignment_flexible to authenticated;

-- Log migration
insert into public.migration_runs(migration_key, status, finished_at, notes)
values('202608260001_flexible_delivery_assignment', 'completed', now(), 'Add flexible delivery assignment RPC with GPS + photo + KPI logging')
on conflict(migration_key) do update set status='completed', finished_at=now();

commit;
