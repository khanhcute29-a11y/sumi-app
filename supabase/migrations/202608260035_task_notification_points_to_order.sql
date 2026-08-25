-- Giao việc TRONG ĐƠN HÀNG: cho thông báo dẫn về chi tiết ĐƠN, không phải
-- trang Công việc.
--
-- Vì sao: assign_package_task tạo đầu việc với category='order_work', nhưng
-- tab "Việc được giao" (AssignedTasksTab) chỉ nạp category='assigned'. Nên
-- việc giao trong đơn KHÔNG BAO GIỜ hiện ở trang Công việc — bấm vào thông
-- báo sẽ tới một trang trống, không thấy đầu việc đâu.
-- Nơi thợ bếp thật sự nhìn thấy và làm đầu việc này là bảng "Phân công công
-- việc thợ bếp" nằm TRONG hộp chi tiết đơn hàng (PackageTaskPanel).
--
-- Thay đổi DUY NHẤT: câu insert vào notifications trỏ sang đơn hàng.
-- Mọi phần khác của hàm giữ nguyên từng ký tự.
begin;

create or replace function public.assign_package_task(
  p_idempotency_key text, p_package_id uuid, p_assignee_id uuid, p_title text,
  p_description text, p_deadline timestamp with time zone,
  p_required_proof_types text[] DEFAULT '{}'::text[]
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
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

  select result_entity_id into v_task
  from public.command_idempotency
  where idempotency_key = p_idempotency_key and actor_id = v_actor;
  if v_task is not null then return v_task; end if;

  insert into public.tasks(
    category, title, description, assignee_id, deadline, status,
    created_by, work_package_id, required_proof_types, version
  )
  values(
    'order_work', p_title, p_description, p_assignee_id, p_deadline, 'open',
    v_actor, p_package_id, coalesce(p_required_proof_types, '{}'), 1
  )
  returning id into v_task;

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

  -- THAY ĐỔI DUY NHẤT so với bản cũ: trỏ về ĐƠN HÀNG thay vì /tasks/<id>,
  -- vì đầu việc loại 'order_work' chỉ hiển thị bên trong chi tiết đơn.
  -- Giữ task_id trong body để vẫn tra ngược được.
  insert into public.notifications(event_key, recipient_profile_id, notification_type, sound_key, title, body, entity_type, entity_id, deep_link)
  values(
    p_idempotency_key || ':notify', p_assignee_id, 'task_assigned', 'ting',
    'Bạn có việc mới từ Bếp', p_title, 'order', v_order, '/orders/' || v_order
  )
  on conflict(event_key) do nothing;

  insert into public.command_idempotency(idempotency_key, command_name, actor_id, result_entity_id, created_at)
  values(p_idempotency_key, 'assign_package_task', v_actor, v_task, now())
  on conflict(idempotency_key, actor_id) do nothing;

  return v_task;
end
$function$;

grant execute on function public.assign_package_task to authenticated;

insert into public.migration_runs(migration_key, status, finished_at, notes)
values('202608260035_task_notification_points_to_order', 'completed', now(),
  'assign_package_task notification now deep-links to the ORDER (where order_work tasks are actually visible via PackageTaskPanel) instead of /tasks/<id>, which never renders them because AssignedTasksTab filters category=assigned.')
on conflict(migration_key) do update set status='completed', finished_at=now(), notes=excluded.notes;

commit;

select 'Tro ve don hang' as kiem_tra,
       case when pg_get_functiondef(p.oid) like '%''order'', v_order, ''/orders/''%' then 'CO' else 'CHUA' end as ket_qua,
       'CO' as mong_doi
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname='assign_package_task';
