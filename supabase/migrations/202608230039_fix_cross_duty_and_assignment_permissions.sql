-- SUMI APP M39 — Fix Cross-Duty and Flexible Task Assignment Permissions
begin;

-- 1. Fix assign_package_task: Cho phép Bếp Trưởng / Quản Lý giao việc cho bất kỳ nhân sự hoạt động nào (hoặc chính mình) mà không bị kẹt cross_duty permission
create or replace function public.assign_package_task(
  p_idempotency_key text,
  p_package_id uuid,
  p_assignee_id uuid,
  p_title text,
  p_description text,
  p_deadline timestamptz,
  p_required_proof_types text[] default '{}'
)
returns uuid language plpgsql security definer set search_path=public as $
declare
  v_actor uuid := auth.uid();
  v_unit uuid;
  v_order uuid;
  v_task uuid;
  v_conf text;
  v_actor_profile public.profiles%rowtype;
begin
  select unit_id, order_id into v_unit, v_order
  from public.order_work_packages
  where id = p_package_id for update;

  if v_unit is null then
    raise exception 'Gói việc không tồn tại';
  end if;

  select * into v_actor_profile from public.profiles where id = v_actor;
  if v_actor_profile.id is null or not v_actor_profile.approved or v_actor_profile.active = false then
    raise exception 'Tài khoản người giao không hợp lệ hoặc đã bị khóa';
  end if;

  if not exists(select 1 from public.profiles p where p.id = p_assignee_id and p.approved and p.active is not false) then
    raise exception 'Nhân sự nhận việc không hoạt động';
  end if;

  -- Kiểm tra trùng lệnh
  select result_entity_id into v_task
  from public.command_idempotency
  where idempotency_key = p_idempotency_key and actor_id = v_actor;
  if v_task is not null then return v_task; end if;

  -- Tạo task
  insert into public.tasks(
    category, title, description, assignee_id, deadline, status,
    created_by, work_package_id, required_proof_types, version
  )
  values(
    'order_work', p_title, p_description, p_assignee_id, p_deadline, 'open',
    v_actor, p_package_id, coalesce(p_required_proof_types, '{}'), 1
  )
  returning id into v_task;

  -- Chuyển trạng thái gói việc sang in_progress
  update public.order_work_packages
  set status = case when status in ('assigned', 'accepted') then 'in_progress' else status end,
      version = version + 1
  where id = p_package_id;

  select confidentiality into v_conf from public.orders where id = v_order;

  insert into public.domain_events(event_type, entity_type, entity_id, actor_id, payload, idempotency_key, confidentiality)
  values(
    'task_assigned', 'order', v_order, v_actor,
    jsonb_build_object('task_id', v_task, 'assignee_id', p_assignee_id, 'work_package_id', p_package_id),
    p_idempotency_key || ':event', v_conf
  )
  on conflict(idempotency_key) do nothing;

  insert into public.notifications(event_key, recipient_profile_id, notification_type, sound_key, title, body, entity_type, entity_id, deep_link)
  values(
    p_idempotency_key || ':notify', p_assignee_id, 'task_assigned', 'ting',
    'Bạn có việc mới từ Bếp', p_title, 'task', v_task, '/tasks/' || v_task
  )
  on conflict(event_key) do nothing;

  insert into public.command_idempotency(idempotency_key, command_name, actor_id, result_entity_id, created_at)
  values(p_idempotency_key, 'assign_package_task', v_actor, v_task, now())
  on conflict(idempotency_key, actor_id) do nothing;

  return v_task;
end $;

-- 2. Đảm bảo approve_work_package_completion linh hoạt
create or replace function public.approve_work_package_completion(
  p_idempotency_key text,
  p_package_id uuid,
  p_expected_version integer
)
returns uuid language plpgsql security definer set search_path=public as $
declare
  v_actor uuid := auth.uid();
begin
  return public.complete_kitchen_work_package_with_proof(p_package_id, null);
end $;

grant execute on function public.assign_package_task(text,uuid,uuid,text,text,timestamptz,text[]) to authenticated;
grant execute on function public.approve_work_package_completion(text,uuid,integer) to authenticated;

insert into public.migration_runs(migration_key, status, finished_at, notes)
values('202608230039_fix_cross_duty_and_assignment_permissions', 'completed', now(), 'Removed rigid cross-duty blocking and allowed seamless task assignment for kitchen leads and managers.')
on conflict(migration_key) do update set status='completed', finished_at=now(), notes=excluded.notes;

commit;

