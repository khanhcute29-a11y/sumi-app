-- Bước tiếp theo phân hệ Việc V2:
--   1. Giám đốc can thiệp trực tiếp việc quá hạn >= 1 ngày (xoá mềm / gia hạn).
--   2. Ghi lịch sử quá hạn (overdue_count, task_overdue_logs) phục vụ KPI phạt.
--   3. Khung chat: KHÔNG cần bảng mới — task_progress_reports đã cho phép bất
--      kỳ ai đọc được việc cũng insert được (policy "ai doc duoc viec thi gop y
--      duoc", migration 202608260100), đã bật realtime (202608260140). Chỉ
--      cần UI thêm ô nhập cho quản lý/giám đốc, không đổi gì ở đây.
begin;
set local lock_timeout = '10s';
set local statement_timeout = '60s';

alter table public.tasks
  add column if not exists overdue_count int not null default 0,
  add column if not exists deleted_at timestamptz;

create table if not exists public.task_overdue_logs (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  han_cu timestamptz,
  han_moi timestamptz,
  qua_han_luc timestamptz not null default now(),
  hanh_dong text not null check (hanh_dong in ('gia_han', 'xoa')),
  created_by uuid references public.profiles(id),
  created_by_name text,
  created_at timestamptz not null default now()
);
create index if not exists idx_task_overdue_logs_task on public.task_overdue_logs(task_id, created_at);

alter table public.task_overdue_logs enable row level security;
drop policy if exists "doc lich su qua han" on public.task_overdue_logs;
create policy "doc lich su qua han" on public.task_overdue_logs
  for select to authenticated using (true);
-- Không có policy insert cho client — chỉ ghi qua RPC SECURITY DEFINER bên dưới.

-- Xoá mềm / gia hạn — chỉ Giám đốc (owner/admin), chỉ cho việc THẬT SỰ quá hạn
-- >= 1 ngày và chưa xong (đúng điều kiện anh Nghĩa yêu cầu). Ghi log TRƯỚC khi
-- đổi tasks, để lỡ RPC lỗi giữa chừng vẫn không có log "ma" không khớp dữ liệu.
create or replace function public.sumi_can_thiep_qua_han(
  p_task_id uuid, p_hanh_dong text, p_han_moi timestamptz default null
) returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_uid  uuid := auth.uid();
  v_p    public.profiles%rowtype;
  v_vai  text[];
  v_t    public.tasks%rowtype;
  v_ten  text;
begin
  if v_uid is null then raise exception 'Chưa đăng nhập.'; end if;
  select * into v_p from public.profiles where id = v_uid;
  v_vai := array_remove(array[v_p.role]::text[] || coalesce(v_p.extra_roles,'{}')::text[], null);
  if not (v_vai && array['owner','admin']) then
    raise exception 'Chỉ Giám đốc mới can thiệp trực tiếp việc quá hạn.';
  end if;
  if p_hanh_dong not in ('gia_han','xoa') then
    raise exception 'Hành động không hợp lệ.';
  end if;

  select * into v_t from public.tasks where id = p_task_id for update;
  if v_t.id is null then raise exception 'Không tìm thấy công việc.'; end if;
  if v_t.deleted_at is not null then raise exception 'Việc này đã bị xoá rồi.'; end if;
  if v_t.status in ('done','exempted') then raise exception 'Việc đã xong/miễn trừ, không cần can thiệp.'; end if;
  if v_t.deadline is null or v_t.deadline > now() - interval '1 day' then
    raise exception 'Chỉ can thiệp được việc đã quá hạn từ 1 ngày trở lên.';
  end if;

  select full_name into v_ten from public.profiles where id = v_uid;

  if p_hanh_dong = 'xoa' then
    update public.tasks set deleted_at = now() where id = p_task_id;
    insert into public.task_overdue_logs(task_id, han_cu, han_moi, hanh_dong, created_by, created_by_name)
    values (p_task_id, v_t.deadline, null, 'xoa', v_uid, v_ten);
    return jsonb_build_object('thanh_cong', true, 'thong_bao', 'Đã xoá việc quá hạn.');
  end if;

  -- gia_han
  if p_han_moi is null or p_han_moi <= now() then
    raise exception 'Hạn mới phải là một thời điểm ở tương lai.';
  end if;
  update public.tasks
  set deadline = p_han_moi, overdue_count = overdue_count + 1, version = version + 1
  where id = p_task_id;
  insert into public.task_overdue_logs(task_id, han_cu, han_moi, hanh_dong, created_by, created_by_name)
  values (p_task_id, v_t.deadline, p_han_moi, 'gia_han', v_uid, v_ten);

  begin
    insert into public.task_progress_reports(task_id, staff_id, note, percent, author_role)
    values (p_task_id, v_uid,
            '📅 ' || coalesce(v_ten,'Giám đốc') || ' gia hạn việc quá hạn — hạn mới: ' || to_char(p_han_moi, 'HH24:MI DD/MM/YYYY'),
            null, 'giam_doc');
  exception when others then
    raise warning 'Ghi vào luồng báo cáo bỏ qua lỗi: %', SQLERRM;
  end;

  return jsonb_build_object('thanh_cong', true, 'thong_bao', 'Đã gia hạn việc.', 'overdue_count', v_t.overdue_count + 1);
end;
$fn$;

grant execute on function public.sumi_can_thiep_qua_han(uuid, text, timestamptz) to authenticated;

insert into public.migration_runs(migration_key, status, finished_at, notes)
values('202608270090_can_thiep_qua_han_va_chat', 'completed', now(),
  'Adds tasks.overdue_count and tasks.deleted_at, plus task_overdue_logs (read-only to clients, written only via the new RPC) to track reschedule/delete history for KPI penalty calculations later. New RPC sumi_can_thiep_qua_han(task_id, hanh_dong, han_moi) lets owner/admin soft-delete or reschedule a task that is at least 1 day overdue and not yet done/exempted, logging old/new deadline and incrementing overdue_count on reschedule. Deliberately does NOT touch task_progress_reports RLS or realtime for the chat feature - the existing "ai doc duoc viec thi gop y duoc" insert policy already lets any authenticated user (manager/director included) post into that table for a task they can read, so the chat feed is a UI-only addition on top of infrastructure that already exists.')
on conflict(migration_key) do update
  set status = 'completed', finished_at = now(), notes = excluded.notes;

commit;
