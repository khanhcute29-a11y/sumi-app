-- SUMI APP — Bắt buộc ảnh khi hoàn thành việc được giao + báo cáo tiến độ (%)

alter table public.tasks add column if not exists photo_url text;

create table if not exists public.task_progress_reports (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  staff_id uuid not null references public.profiles(id) on delete set null,
  percent int not null check (percent between 0 and 100),
  note text,
  created_at timestamptz not null default now()
);

create index if not exists idx_task_progress_reports_task on public.task_progress_reports(task_id, created_at);

alter table public.task_progress_reports enable row level security;

drop policy if exists "staff insert own progress reports" on public.task_progress_reports;
create policy "staff insert own progress reports" on public.task_progress_reports
  for insert with check (staff_id = auth.uid());

drop policy if exists "read progress reports for related task" on public.task_progress_reports;
create policy "read progress reports for related task" on public.task_progress_reports
  for select using (
    exists(select 1 from public.tasks t where t.id = task_id and (t.assignee_id = auth.uid() or t.created_by = auth.uid()))
    or public.is_business_director()
  );

-- complete_task_v2 đổi chữ ký (thêm p_photo_url) — drop bản cũ trước để tránh
-- tạo overload trùng (đã từng gây lỗi "function is not unique" với notify_push).
drop function if exists public.complete_task_v2(text, uuid, integer, text);

create or replace function public.complete_task_v2(
  p_idempotency_key text,
  p_task_id uuid,
  p_expected_version integer,
  p_note text default null,
  p_photo_url text default null
) returns uuid language plpgsql security definer set search_path=public as $$
declare
  v_actor uuid := auth.uid();
  v_task public.tasks%rowtype;
begin
  select * into v_task from public.tasks where id = p_task_id for update;
  if v_task.id is null then raise exception 'Task không tồn tại'; end if;
  if v_task.status = 'done' then return p_task_id; end if;
  if p_photo_url is null or length(trim(p_photo_url)) = 0 then
    raise exception 'Cần chụp ảnh xác nhận trước khi hoàn thành việc';
  end if;

  update public.tasks
  set status = 'done', completed_at = now(), version = version + 1,
      photo_url = p_photo_url,
      description = case when p_note is null then description else concat_ws(E'\n', description, p_note) end
  where id = p_task_id;

  insert into public.domain_events(event_type, entity_type, entity_id, actor_id, payload, idempotency_key)
  values(
    'task_completed', 'task', p_task_id, v_actor,
    jsonb_build_object('work_package_id', v_task.work_package_id),
    p_idempotency_key || ':event'
  )
  on conflict(idempotency_key) do nothing;

  return p_task_id;
end $$;

revoke all on function public.complete_task_v2(text, uuid, integer, text, text) from public, anon;
grant execute on function public.complete_task_v2(text, uuid, integer, text, text) to authenticated;
