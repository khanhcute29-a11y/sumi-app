-- Complete Delivery RPC: Update order status to completed with KPI logging

begin;

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
  -- Update order status to completed
  update public.orders
  set status_v2 = 'completed'
  where id = p_order_id;

  -- Log KPI: delivery_completed (if table exists)
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

-- Grant access to authenticated users
grant execute on function public.complete_delivery_assignment to authenticated;

-- Log migration
insert into public.migration_runs(migration_key, status, finished_at, notes)
values('202608260004_complete_delivery_rpc', 'completed', now(), 'Add RPC for delivery completion with status update + KPI logging')
on conflict(migration_key) do update set status='completed', finished_at=now();

commit;
