-- VÁ LỖI: Quản lý khâu (bếp trưởng/bếp phó...) không sửa được hạn chót/người
-- phụ trách của việc họ đã giao — dù RLS đã cho phép từ trước.
--
-- Bối cảnh (phát hiện lúc làm tính năng "Từ chối việc ngoài giờ",
-- 202609042200): migration 202609041400 đã mở policy UPDATE "assignee or
-- owner update tasks" cho quản lý khâu (la_quan_ly_cua_ho_so(assignee_id)),
-- NHƯNG trigger enforce_task_update_rules (chạy SAU khi RLS cho qua) chỉ
-- bypass cho role IN ('owner','admin') — quên hoàn toàn quản lý khâu. Kết quả
-- thật: quản lý mở được form Sửa việc (giao diện không chặn), sửa hạn chót
-- rồi Lưu là dính lỗi "Chỉ chủ hoặc quản lý mới được đổi hạn chót công việc"
-- — đúng loại bug "một lớp vá, một lớp quên" đã gặp nhiều lần trong dự án
-- này (xem staff-permission-gate-bug-pattern).
--
-- CHỈ mở thêm 2 điều kiện đã bị chặn nhầm (assignee_id, deadline) cho ĐÚNG
-- người quản lý của người đang được giao việc — khớp CHÍNH XÁC điều kiện RLS
-- đã cho phép, không mở rộng gì thêm. Điều kiện "status='exempted' phải chủ
-- duyệt" GIỮ NGUYÊN không đổi — đó là quy định cố ý, không phải lỗi.
begin;
set local lock_timeout = '10s';
set local statement_timeout = '30s';

create or replace function public.enforce_task_update_rules()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  is_boss     boolean;
  is_quan_ly  boolean;
begin
  if auth.uid() is null then
    return new; -- service role / SQL editor
  end if;

  select exists (
    select 1 from profiles
    where id = auth.uid()
      and (role in ('owner','admin') or extra_roles && array['owner','admin'])
  ) into is_boss;

  if is_boss then
    return new;
  end if;

  -- Quản lý khâu sửa việc họ giao cho nhân sự khâu mình — cùng đúng điều
  -- kiện policy UPDATE "assignee or owner update tasks" (202609041400).
  is_quan_ly := public.la_quan_ly_cua_ho_so(old.assignee_id);

  if new.assignee_id is distinct from old.assignee_id and not is_quan_ly then
    raise exception 'Chỉ chủ hoặc quản lý mới được đổi người phụ trách công việc.';
  end if;

  if new.deadline is distinct from old.deadline and not is_quan_ly then
    raise exception 'Chỉ chủ hoặc quản lý mới được đổi hạn chót công việc.';
  end if;

  if new.status is distinct from old.status and new.status = 'exempted' then
    raise exception 'Miễn trừ công việc phải được chủ duyệt — không tự đặt được.';
  end if;

  return new;
end;
$function$;

insert into public.migration_runs(migration_key, status, finished_at, notes)
values('202609042300_quan_ly_sua_han_chot_viec', 'completed', now(),
  'Va enforce_task_update_rules: mo them assignee_id/deadline cho quan ly khau (la_quan_ly_cua_ho_so(old.assignee_id)) - khop dung dieu kien RLS 202609041400 da cho phep tu truoc, trigger quen mo. Khong dong den dieu kien status=exempted (van chi owner/admin).')
on conflict(migration_key) do update set status='completed', finished_at=now(), notes=excluded.notes;

commit;
