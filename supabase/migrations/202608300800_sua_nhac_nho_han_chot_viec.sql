-- Cho phép sửa "Nhắc nhở tôi" (reminder_at) và "Hạn chót" (deadline) trên 1
-- công việc ĐÃ TỒN TẠI — trước đây 2 ô này trong TheViecNhanVien.jsx chỉ là
-- chữ tĩnh, không có RPC/nút nào để sửa sau khi tạo việc (chỉ đặt được lúc
-- tạo mới qua GiaoViecModal/AssignTaskModal).
--
-- Không dùng update thẳng qua PostgREST dù RLS bảng tasks hiện đang mở toang
-- (policy allow_authenticated_all_tasks: using(true) with check(true), xem
-- migration 202608230042) — đó là lỗ hổng có sẵn cần tránh mở rộng thêm, nên
-- bọc qua RPC kiểm tra quyền: chỉ người NHẬN việc, người GIAO việc, hoặc
-- Giám đốc mới sửa được.

begin;

create or replace function public.sumi_dat_nhac_han(
  p_task_id uuid,
  p_reminder_at timestamptz default null,
  p_deadline timestamptz default null,
  p_xoa_nhac boolean default false,
  p_xoa_han boolean default false
)
returns public.tasks language plpgsql security definer set search_path = public as $fn$
declare
  v_uid uuid := auth.uid();
  v_t   public.tasks%rowtype;
  v_row public.tasks%rowtype;
begin
  if v_uid is null then raise exception 'Chưa đăng nhập.'; end if;

  select * into v_t from public.tasks where id = p_task_id;
  if v_t.id is null then raise exception 'Không tìm thấy công việc.'; end if;

  if v_uid is distinct from v_t.assignee_id
     and v_uid is distinct from v_t.created_by
     and not public.is_business_director() then
    raise exception 'Bạn không có quyền sửa nhắc nhở/hạn chót của việc này.';
  end if;

  update public.tasks set
    reminder_at = case when p_xoa_nhac then null when p_reminder_at is not null then p_reminder_at else reminder_at end,
    deadline    = case when p_xoa_han  then null when p_deadline    is not null then p_deadline    else deadline end,
    version     = version + 1
  where id = p_task_id
  returning * into v_row;

  return v_row;
end;
$fn$;

grant execute on function public.sumi_dat_nhac_han(uuid,timestamptz,timestamptz,boolean,boolean) to authenticated;

insert into public.migration_runs(migration_key, status, finished_at, notes)
values('202608300800_sua_nhac_nho_han_chot_viec', 'completed', now(),
  'RPC sumi_dat_nhac_han cho phép người nhận việc/người giao việc/Giám đốc sửa hoặc xoá reminder_at + deadline của 1 task đã tồn tại — trước đây chỉ đặt được lúc tạo mới, không sửa lại được.')
on conflict(migration_key) do update set status='completed', finished_at=now(), notes=excluded.notes;

commit;
