-- RPC to accept and delegate work package to staff

begin;

create or replace function public.accept_delegate_work_package(
  p_package_id uuid,
  p_staff_id uuid,
  p_staff_name text
)
returns json as $$
begin
  -- Update work package: assign to staff + status in_progress
  update public.order_work_packages
  set
    status = 'in_progress',
    accepted_at = now(),
    assigned_to_staff_id = p_staff_id,
    assigned_to_staff_name = p_staff_name,
    assigned_at = now()
  where id = p_package_id;

  return json_build_object(
    'success', true,
    'message', 'Work package delegated to staff',
    'package_id', p_package_id,
    'staff_name', p_staff_name,
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
grant execute on function public.accept_delegate_work_package to authenticated;

-- RPC to complete work package and update order status
create or replace function public.complete_work_package_and_order(
  p_package_id uuid,
  p_order_id uuid,
  p_staff_id uuid,
  p_staff_name text
)
returns json as $$
begin
  -- Update work package: mark as completed
  update public.order_work_packages
  set
    status = 'completed',
    completed_at = now(),
    completed_by_staff_id = p_staff_id,
    completed_by_staff_name = p_staff_name
  where id = p_package_id;

  -- Update order status to ready_for_fulfillment (chờ vận chuyển)
  update public.orders
  set status_v2 = 'ready_for_fulfillment'
  where id = p_order_id;

  return json_build_object(
    'success', true,
    'message', 'Work package completed and order ready for fulfillment',
    'package_id', p_package_id,
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
grant execute on function public.complete_work_package_and_order to authenticated;

-- RPC to accept work package by kitchen lead (tự làm)
create or replace function public.accept_work_package_self(
  p_package_id uuid,
  p_staff_id uuid,
  p_staff_name text
)
returns json as $$
begin
  -- Update work package: status in_progress, chef accepts for themselves
  update public.order_work_packages
  set
    status = 'in_progress',
    accepted_at = now(),
    assigned_to_staff_id = p_staff_id,
    assigned_to_staff_name = p_staff_name,
    assigned_at = now()
  where id = p_package_id;

  return json_build_object(
    'success', true,
    'message', 'Work package accepted by kitchen lead',
    'package_id', p_package_id,
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
grant execute on function public.accept_work_package_self to authenticated;

-- Log migration
insert into public.migration_runs(migration_key, status, finished_at, notes)
values('202608260006_rpc_accept_delegate_work_package', 'completed', now(), 'Add RPC to accept and delegate work package')
on conflict(migration_key) do update set status='completed', finished_at=now();

commit;
