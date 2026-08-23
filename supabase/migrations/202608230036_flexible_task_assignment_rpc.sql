-- SUMI APP M36 — Flexible Task Assignment for Kitchen Leads and Subordinates
begin;

create or replace function public.assign_package_task(
  p_idempotency_key text,
  p_package_id uuid,
  p_assignee_id uuid,
  p_title text,
  p_description text,
  p_deadline timestamptz,
  p_required_proof_types text[] default '{}'
)
returns uuid
language plpgsql
security definer
set search_path=public
as \$\$
declare
  v_actor uuid := auth.uid();
  v_unit uuid;
  v_order uuid;
  v_task uuid;
  v_conf text;
  v_actor_role text;
  v_actor_extra text[];
  v_is_lead boolean := false;
begin
  select unit_id, order_id into v_unit, v_order
  from public.order_work_packages
  where id = p_package_id
  for update;

  if v_unit is null then
    raise exception 'Work package not found';
  end if;

  -- Kiểm tra quyền giao việc của Actor
  select role, extra_roles into v_actor_role, v_actor_extra
  from public.profiles
  where id = v_actor;

  if public.is_business_director()
     or v_actor_role in ('owner', 'admin', 'kitchen_lead', 'kitchen_lead_cold', 'kitchen_lead_hot', 'kitchen_lead_macaron', 'kitchen_lead_x42', 'kitchen_deputy', 'kitchen_deputy_cold', 'kitchen_deputy_hot')
     or (v_actor_extra && array['owner', 'admin', 'kitchen_lead', 'kitchen_lead_cold', 'kitchen_lead_hot', 'kitchen_lead_macaron', 'kitchen_lead_x42', 'kitchen_deputy', 'kitchen_deputy_cold', 'kitchen_deputy_hot'])
     or exists (select 1 from public.profile_assignments where profile_id = v_actor and (unit_id = v_unit or unit_id is null) and valid_to is null)
  then
    v_is_lead := true;
  end if;

  if not v_is_lead then
    raise exception 'Bạn không có quyền giao việc ở khâu này';
  end if;

  -- Kiểm tra người nhận việc (active & approved)
  if not exists (select 1 from public.profiles p where p.id = p_assignee_id and p.approved and p.active) then
    raise exception 'Nhân viên nhận việc không tồn tại hoặc đã bị khóa';
  end if;

  -- Idempotency check
  select result_entity_id into v_task
  from public.command_idempotency
  where idempotency_key = p_idempotency_key and actor_id = v_actor;
  if v_task is not null then
    return v_task;
  end if;

  -- Tạo Task mới kèm Deadline đo lường KPI
  insert into public.tasks (
    category,
    title,
    description,
    assignee_id,
    deadline,
    status,
    created_by,
    work_package_id,
    required_proof_types,
    version
  ) values (
    'order_work',
    p_title,
    p_description,
    p_assignee_id,
    p_deadline,
    'open',
    v_actor,
    p_package_id,
    coalesce(p_required_proof_types, '{}'),
    1
  ) returning id into v_task;

  -- Cập nhật work package sang in_progress
  update public.order_work_packages
  set status = case when status in ('assigned', 'accepted') then 'in_progress' else status end,
      accepted_at = coalesce(accepted_at, now()),
      version = version + 1
  where id = p_package_id;

  -- Cập nhật order sang in_production nếu chưa
  update public.orders
  set status_v2 = case when status_v2 in ('awaiting_assignment', 'awaiting_acceptance') then 'in_production' else status_v2 end,
      version = version + 1
  where id = v_order;

  -- Bắn sự kiện domain
  select confidentiality into v_conf from public.orders where id = v_order;
  insert into public.domain_events (event_type, entity_type, entity_id, actor_id, payload, idempotency_key, confidentiality)
  values (
    'task_assigned',
    'order',
    v_order,
    v_actor,
    jsonb_build_object('task_id', v_task, 'assignee_id', p_assignee_id, 'work_package_id', p_package_id, 'deadline', p_deadline),
    p_idempotency_key || ':event',
    v_conf
  );

  -- Bắn thông báo chuông cho người nhận việc
  insert into public.notifications (event_key, recipient_profile_id, notification_type, sound_key, title, body, entity_type, entity_id, deep_link)
  values (
    p_idempotency_key || ':notify',
    p_assignee_id,
    'task_assigned',
    'ting',
    'Bạn có việc mới từ Bếp trưởng',
    p_title,
    'task',
    v_task,
    '/tasks/' || v_task
  );

  insert into public.command_idempotency values (p_idempotency_key, 'assign_package_task', v_actor, v_task, now());
  return v_task;
end;
\$\$
;

revoke all on function public.assign_package_task(text,uuid,uuid,text,text,timestamptz,text[]) from public,anon;
grant execute on function public.assign_package_task(text,uuid,uuid,text,text,timestamptz,text[]) to authenticated;

insert into public.migration_runs(migration_key,status,finished_at,notes)
values('202608230036_flexible_task_assignment_rpc','completed',now(),'Support flexible task assignment by stream leads with deadline.')
on conflict(migration_key) do update set status='completed',finished_at=now(),notes=excluded.notes;

commit;
