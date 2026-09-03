-- Cho phép quản lý theo khâu (kitchen_lead/deputy_director_x41/x42) SỬA được
-- việc họ đã giao cho nhân sự thuộc khâu mình — không chỉ Xoá.
--
-- Bối cảnh: delete_personal_task (202609040900) đã dùng
-- la_quan_ly_cua_ho_so(assignee_id) để cho quản lý xoá việc đã giao đúng khâu
-- mình. Nhưng updateTask() (src/lib/queries.js) gọi thẳng
-- supabase.from('tasks').update(...) — đi qua RLS, không qua RPC nào cả — và
-- policy UPDATE "assignee or owner update tasks" CHỈ cho phép chính người
-- được giao (assignee_id=auth.uid()) hoặc owner/admin sửa. Quản lý khâu tạo
-- việc cho NGƯỜI KHÁC (assignee_id != quản lý) nên bị chặn — y hệt lớp lỗi đã
-- vá cho create_general_task/delete_personal_task/create_recurring_todo,
-- lần này lộ ra ở RLS thay vì RPC.
begin;
set local lock_timeout = '10s';
set local statement_timeout = '30s';

drop policy if exists "assignee or owner update tasks" on public.tasks;
create policy "assignee or owner update tasks" on public.tasks
  for update
  using (
    assignee_id = auth.uid()
    or public.la_quan_ly_cua_ho_so(assignee_id)
    or exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and (profiles.role = any(array['owner','admin'])
             or profiles.extra_roles && array['owner','admin'])
    )
  )
  with check (auth.role() = 'authenticated' and is_approved());

insert into public.migration_runs(migration_key, status, finished_at, notes)
values('202609041400_quan_ly_sua_viec_da_giao', 'completed', now(),
  'Policy UPDATE tasks: thêm la_quan_ly_cua_ho_so(assignee_id) — quản lý theo khâu sửa được việc đã giao cho nhân sự khâu mình, không chỉ xoá.')
on conflict(migration_key) do update set status='completed', finished_at=now(), notes=excluded.notes;

commit;
