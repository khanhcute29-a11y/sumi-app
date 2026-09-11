-- Theo yêu cầu sếp (11/9/2026): màn "Tổng quan KPI" muốn xem được chi tiết
-- từng giờ vào/ra ca của 1 nhân viên, theo từng ngày trong khoảng ngày đang
-- xem — hiện tại mục "⏱️ Giờ làm & Chuyên cần" chỉ có số tổng hợp (tổng giờ,
-- tăng ca, số lần đi trễ), không xem được từng lần chấm công cụ thể.
--
-- Nguồn dữ liệu: shift_logs (đúng bảng get_staff_kpi_v2 đang dùng để tính
-- tổng giờ làm). Ghép cặp checkin/checkout theo ĐÚNG cách get_staff_kpi_v2
-- đang làm (order theo checkin_time, không partition theo work_date, để xử lý
-- đúng ca xuyên đêm) — không ghép lại theo cách khác để tránh ra số lệch với
-- phần tổng hợp đã có phía trên.
--
-- Bảo mật: SECURITY DEFINER + tự kiểm tra actor (giống hệt get_staff_kpi_v2/
-- get_employee_kpi_overview) — chỉ chính chủ hoặc giám đốc mới gọi được, vì
-- RLS "read shift_logs" hiện cho phép MỌI nhân viên đã duyệt đọc TOÀN BỘ bảng
-- (không lọc theo staff_id) nên KHÔNG được để client tự query bảng này thẳng.
begin;
set local lock_timeout = '10s';
set local statement_timeout = '30s';

create or replace function public.get_staff_attendance_detail(p_staff_id uuid, p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  v_actor uuid := auth.uid();
  v_result jsonb;
begin
  if v_actor is null or (v_actor <> p_staff_id and not public.is_business_director()) then
    raise exception 'KPI access denied';
  end if;
  if p_to < p_from or p_to - p_from > 366 then
    raise exception 'invalid date range';
  end if;

  with events as (
    select id, work_date, type, checkin_time, shift_label, branch, late_minutes, gps_lat, gps_lng,
      lag(type) over (order by checkin_time) as prev_type,
      lag(id) over (order by checkin_time) as prev_id,
      lag(checkin_time) over (order by checkin_time) as prev_time,
      lag(shift_label) over (order by checkin_time) as prev_shift,
      lag(branch) over (order by checkin_time) as prev_branch,
      lag(late_minutes) over (order by checkin_time) as prev_late,
      lag(gps_lat) over (order by checkin_time) as prev_lat,
      lag(gps_lng) over (order by checkin_time) as prev_lng,
      lead(type) over (order by checkin_time) as next_type
    from public.shift_logs
    where staff_id = p_staff_id and type in ('checkin', 'checkout')
      and checkin_time is not null and work_date between p_from and p_to
  ),
  full_pairs as (
    select prev_id as id, work_date, coalesce(prev_shift, shift_label) as shift_label,
      coalesce(prev_branch, branch) as branch, prev_time as vao, checkin_time as ra,
      coalesce(prev_late, 0) as late_minutes,
      prev_lat as vao_lat, prev_lng as vao_lng, gps_lat as ra_lat, gps_lng as ra_lng,
      'full' as trang_thai
    from events where type = 'checkout' and prev_type = 'checkin'
  ),
  chua_cham_ra as (
    select id, work_date, shift_label, branch, checkin_time as vao, null::timestamptz as ra,
      coalesce(late_minutes, 0) as late_minutes,
      gps_lat as vao_lat, gps_lng as vao_lng, null::numeric as ra_lat, null::numeric as ra_lng,
      'missing_checkout' as trang_thai
    from events where type = 'checkin' and (next_type is null or next_type <> 'checkout')
  ),
  xin_nghi as (
    select id, work_date, shift_label, branch, leave_from_at as vao, leave_to_at as ra,
      0 as late_minutes,
      null::numeric as vao_lat, null::numeric as vao_lng, null::numeric as ra_lat, null::numeric as ra_lng,
      'leave' as trang_thai
    from public.shift_logs
    where staff_id = p_staff_id and type = 'leave_request' and work_date between p_from and p_to
  ),
  gop as (
    select * from full_pairs
    union all select * from chua_cham_ra
    union all select * from xin_nghi
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', id, 'work_date', work_date, 'shift_label', shift_label, 'branch', branch,
    'vao', vao, 'ra', ra, 'late_minutes', late_minutes,
    'vao_lat', vao_lat, 'vao_lng', vao_lng, 'ra_lat', ra_lat, 'ra_lng', ra_lng,
    'trang_thai', trang_thai
  ) order by work_date desc, vao desc nulls last), '[]'::jsonb)
  into v_result
  from gop;

  return v_result;
end;
$fn$;

revoke all on function public.get_staff_attendance_detail(uuid, date, date) from public, anon;
grant execute on function public.get_staff_attendance_detail(uuid, date, date) to authenticated;

insert into public.migration_runs(migration_key, status, finished_at, notes)
values('202609111200_kpi_chi_tiet_cham_ca', 'completed', now(),
  'Them RPC get_staff_attendance_detail: tra ve tung lan cham cong (gio vao/ra, tre bao nhieu phut, ca, chi nhanh, GPS) cho 1 nhan vien trong khoang ngay - phuc vu man Tong quan KPI muon xem chi tiet cham ca thay vi chi so tong hop. Ghep cap checkin/checkout dung y het cach get_staff_kpi_v2 dang lam (khong partition theo work_date) de khop so voi phan tong hop da co. Actor check SECURITY DEFINER vi RLS shift_logs cho doc toan bang.')
on conflict(migration_key) do update set status='completed', finished_at=now(), notes=excluded.notes;

commit;
