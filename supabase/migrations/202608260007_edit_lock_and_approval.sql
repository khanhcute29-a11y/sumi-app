-- Edit lock after 30 minutes + approval workflow

begin;

-- Table: order_edit_requests (track edit approval requests)
create table if not exists public.order_edit_requests (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  requested_by_id uuid not null,
  requested_by_name text not null,
  reason text,
  status text default 'pending', -- pending, approved, rejected
  created_at timestamp default now(),
  approved_by_id uuid,
  approved_by_name text,
  approved_at timestamp
);

create index if not exists idx_order_edit_requests_order_id on public.order_edit_requests(order_id);
create index if not exists idx_order_edit_requests_status on public.order_edit_requests(status);

-- Enable RLS
alter table public.order_edit_requests enable row level security;

-- RLS Policy: Authenticated users can read and create
drop policy if exists "Read and create edit requests" on public.order_edit_requests;

create policy "Read and create edit requests" on public.order_edit_requests
  for all using (auth.role() = 'authenticated');

-- RPC: Check if order can be edited (within 30 min)
create or replace function public.check_order_edit_lock(p_order_id uuid)
returns json as $$
declare
  v_created_at timestamp;
  v_can_edit boolean;
  v_minutes_elapsed int;
begin
  -- Get order creation time
  select created_at into v_created_at
  from public.orders
  where id = p_order_id;

  if v_created_at is null then
    return json_build_object('success', false, 'error', 'Order not found');
  end if;

  -- Calculate minutes elapsed
  v_minutes_elapsed := extract(epoch from (now() - v_created_at)) / 60;

  -- Can edit if within 30 minutes
  v_can_edit := v_minutes_elapsed < 30;

  return json_build_object(
    'success', true,
    'can_edit', v_can_edit,
    'minutes_elapsed', v_minutes_elapsed,
    'minutes_remaining', greatest(0, 30 - v_minutes_elapsed),
    'created_at', v_created_at
  );

exception when others then
  return json_build_object('success', false, 'error', SQLERRM);
end;
$$ language plpgsql security definer set search_path = public;

grant execute on function public.check_order_edit_lock to authenticated;

-- RPC: Request edit approval (when beyond 30 min)
create or replace function public.request_order_edit_approval(
  p_order_id uuid,
  p_user_id uuid,
  p_user_name text,
  p_reason text
)
returns json as $$
declare
  v_request_id uuid;
begin
  -- Create edit request
  insert into public.order_edit_requests (
    order_id, requested_by_id, requested_by_name, reason, status
  ) values (
    p_order_id, p_user_id, p_user_name, p_reason, 'pending'
  )
  returning id into v_request_id;

  -- Log KPI: edit_approval_requested
  insert into public.kpi_logs (
    order_id, staff_id, staff_name, event_type, notes
  ) values (
    p_order_id, p_user_id, p_user_name, 'edit_approval_requested',
    'User requested edit approval: ' || p_reason
  ) on conflict do nothing;

  return json_build_object(
    'success', true,
    'message', 'Edit approval requested',
    'request_id', v_request_id,
    'timestamp', now()
  );

exception when others then
  return json_build_object('success', false, 'error', SQLERRM);
end;
$$ language plpgsql security definer set search_path = public;

grant execute on function public.request_order_edit_approval to authenticated;

-- RPC: Approve/reject edit request (by director)
create or replace function public.approve_order_edit_request(
  p_request_id uuid,
  p_director_id uuid,
  p_director_name text,
  p_approved boolean
)
returns json as $$
declare
  v_order_id uuid;
begin
  -- Update request
  update public.order_edit_requests
  set
    status = case when p_approved then 'approved' else 'rejected' end,
    approved_by_id = p_director_id,
    approved_by_name = p_director_name,
    approved_at = now()
  where id = p_request_id
  returning order_id into v_order_id;

  if v_order_id is null then
    return json_build_object('success', false, 'error', 'Request not found');
  end if;

  -- Log KPI: edit_approval_processed
  insert into public.kpi_logs (
    order_id, staff_id, staff_name, event_type, notes
  ) values (
    v_order_id, p_director_id, p_director_name, 'edit_approval_processed',
    'Edit approval ' || (case when p_approved then 'APPROVED' else 'REJECTED' end)
  ) on conflict do nothing;

  return json_build_object(
    'success', true,
    'message', 'Edit request ' || (case when p_approved then 'approved' else 'rejected' end),
    'request_id', p_request_id,
    'order_id', v_order_id,
    'timestamp', now()
  );

exception when others then
  return json_build_object('success', false, 'error', SQLERRM);
end;
$$ language plpgsql security definer set search_path = public;

grant execute on function public.approve_order_edit_request to authenticated;

-- Log migration
insert into public.migration_runs(migration_key, status, finished_at, notes)
values('202608260007_edit_lock_and_approval', 'completed', now(), 'Add 30min edit lock + approval workflow')
on conflict(migration_key) do update set status='completed', finished_at=now();

commit;
