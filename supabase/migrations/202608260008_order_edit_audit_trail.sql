-- Order edit audit trail + change logs

begin;

-- Table: order_change_logs (track all order edits)
create table if not exists public.order_change_logs (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  edited_by_id uuid not null,
  edited_by_name text not null,
  field_name text not null, -- e.g., "address", "required_at", "note"
  old_value text,
  new_value text,
  change_type text, -- 'update', 'add_item', 'remove_item'
  created_at timestamp default now()
);

create index if not exists idx_order_change_logs_order_id on public.order_change_logs(order_id);
create index if not exists idx_order_change_logs_created_at on public.order_change_logs(created_at);

alter table public.order_change_logs enable row level security;

create policy "Read change logs" on public.order_change_logs
  for select using (auth.role() = 'authenticated');

-- RPC: Edit order field (with permission + 30min check)
create or replace function public.edit_order_field(
  p_order_id uuid,
  p_editor_id uuid,
  p_editor_name text,
  p_field_name text,
  p_old_value text,
  p_new_value text
)
returns json as $$
declare
  v_created_by_id uuid;
  v_minutes_elapsed int;
  v_can_edit boolean;
  v_last_approval_at timestamp;
begin
  -- Get order creator
  select created_by_id, created_at into v_created_by_id, v_last_approval_at
  from public.orders where id = p_order_id;

  if v_created_by_id is null then
    return json_build_object('success', false, 'error', 'Order not found');
  end if;

  -- Check permission: only creator or kitchen lead can edit
  -- (kitchen lead check would need to query work packages - simplified for now)
  if p_editor_id != v_created_by_id then
    return json_build_object('success', false, 'error', 'Only order creator can edit');
  end if;

  -- Check 30min lock
  v_minutes_elapsed := extract(epoch from (now() - v_last_approval_at)) / 60;
  if v_minutes_elapsed >= 30 then
    return json_build_object('success', false, 'error', 'Edit window closed - requires director approval',
                           'minutes_elapsed', v_minutes_elapsed);
  end if;

  -- Update field in orders table
  execute 'update public.orders set ' || quote_ident(p_field_name) || ' = $1 where id = $2'
  using p_new_value, p_order_id;

  -- Log change
  insert into public.order_change_logs (
    order_id, edited_by_id, edited_by_name, field_name, old_value, new_value, change_type
  ) values (
    p_order_id, p_editor_id, p_editor_name, p_field_name, p_old_value, p_new_value, 'update'
  );

  -- Log KPI
  insert into public.kpi_logs (
    order_id, staff_id, staff_name, event_type, notes
  ) values (
    p_order_id, p_editor_id, p_editor_name, 'order_edited',
    p_field_name || ': ' || p_old_value || ' → ' || p_new_value
  ) on conflict do nothing;

  return json_build_object(
    'success', true,
    'message', 'Order field updated',
    'order_id', p_order_id,
    'timestamp', now()
  );

exception when others then
  return json_build_object('success', false, 'error', SQLERRM);
end;
$$ language plpgsql security definer set search_path = public;

grant execute on function public.edit_order_field to authenticated;

-- RPC: Get order change history
create or replace function public.get_order_change_history(p_order_id uuid)
returns table (
  id uuid,
  field_name text,
  old_value text,
  new_value text,
  edited_by_name text,
  created_at timestamp
) as $$
begin
  return query
  select cl.id, cl.field_name, cl.old_value, cl.new_value, cl.edited_by_name, cl.created_at
  from public.order_change_logs cl
  where cl.order_id = p_order_id
  order by cl.created_at desc;
end;
$$ language plpgsql security definer set search_path = public;

grant execute on function public.get_order_change_history to authenticated;

-- Log migration
insert into public.migration_runs(migration_key, status, finished_at, notes)
values('202608260008_order_edit_audit_trail', 'completed', now(), 'Add order edit audit trail + change logs')
on conflict(migration_key) do update set status='completed', finished_at=now();

commit;
