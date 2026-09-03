-- Fix: accept_delivery_assignment_flexible (redefined in
-- 202609030000_gps_geofencing_km_giam_sat_truc_tuyen.sql) inserts a new
-- delivery_runs row without run_code, but delivery_runs.run_code is
-- `text not null unique` — this raises:
--   null value in column "run_code" of relation "delivery_runs"
--   violates not-null constraint
-- for every order that doesn't already have a delivery_run (i.e. most
-- first-time "Nhận giao" actions), blocking shippers from accepting
-- deliveries. Re-adds the run_code generation that an earlier fix
-- (202608260018_fix_delivery_branch_id_from_orders.sql) had, lost when
-- the function was rewritten from scratch in today's GPS migration.

-- Also seen live: delivery_runs_status_check and delivery_stops_status_check
-- still reject 'in_progress'/'in_transit'. An earlier migration
-- (202608230042_clean_legacy_constraints_and_triggers.sql) already decided to
-- drop both constraints outright, but neither drop actually took effect on
-- production — drop them here too (idempotent) so the status values this RPC
-- uses ('in_progress', 'in_transit', 'completed', etc.) are accepted.
alter table public.delivery_runs drop constraint if exists delivery_runs_status_check;
alter table public.delivery_stops drop constraint if exists delivery_stops_status_check;

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
  v_run_code text;
begin
  v_started_at := now();

  select dr.id into v_delivery_run_id
  from public.delivery_runs dr
  join public.delivery_stops ds on ds.delivery_run_id = dr.id
  where ds.order_id = v_order_id
  limit 1;

  if v_delivery_run_id is null then
    v_run_code := 'RUN-' || to_char(v_started_at, 'YYMMDD-HH24MISS') || '-' || upper(substr(md5(v_order_id::text), 1, 4));

    insert into public.delivery_runs (
      id, run_code, branch_id, assigned_driver_id, status, started_at, start_lat, start_lng
    ) values (
      gen_random_uuid(),
      v_run_code,
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
