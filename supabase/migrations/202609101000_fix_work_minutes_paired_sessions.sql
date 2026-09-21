-- Xác minh trực tiếp trên dữ liệu thật (Nguyễn Tuấn Anh, 01-10/9/2026): nhiều
-- ngày có 2 dòng "checkin" liên tiếp không có "checkout" ở giữa (quên chấm ra,
-- hoặc tách ca). get_staff_kpi_v2 (202608220017) tính work_minutes bằng
-- min(checkin_time)..max(checkin_time) GỘP CHUNG cả 2 loại type — không phân
-- biệt checkin/checkout — nên khi có checkin lẻ không cặp được, khoảng cách
-- bị tính TỪ checkin sớm nhất TỚI checkout muộn nhất, kể cả khoảng trống ở
-- giữa không hề làm việc. Ví dụ thật: checkin 06:04 → checkin 16:47 (không
-- rõ đã checkout ca sáng chưa) → checkout 19:33 → span bị tính 13h29 thay vì
-- đúng phiên làm việc thật.
--
-- Sửa: ghép ĐÚNG cặp (checkin gần nhất) -> (checkout ngay sau đó) bằng
-- LAG() theo thời gian, chỉ cộng dồn khoảng cách khi dòng sau là 'checkout'
-- VÀ dòng liền trước (theo thời gian) là 'checkin' — checkin không có
-- checkout theo sau bị bỏ qua (không tính oan giờ làm), thà thiếu còn hơn
-- thổi phồng giờ tăng ca của nhân viên.
--
-- KHÔNG đổi chữ ký hàm (vẫn get_staff_kpi_v2(uuid,date,date)) — KpiV2Screen
-- và get_employee_kpi_overview đang gọi nguyên trạng, không cần sửa gì thêm.
begin;
set local lock_timeout = '10s';
set local statement_timeout = '30s';

create or replace function public.get_staff_kpi_v2(p_profile_id uuid, p_from date, p_to date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_actor uuid := auth.uid(); v_result jsonb;
begin
 if v_actor is null or (v_actor <> p_profile_id and not public.is_business_director()) then raise exception 'KPI access denied'; end if;
 if p_to < p_from or p_to - p_from > 366 then raise exception 'invalid KPI date range'; end if;
 with task_stats as (
  select count(*) as assigned,
   count(*) filter(where status='done') as completed,
   count(*) filter(where status='done' and (deadline is null or completed_at<=deadline)) as on_time,
   count(*) filter(where status='exempted' and exclusion_reason_code in ('natural_disaster','government_policy','traffic','illness') and exclusion_approved_by is not null) as approved_exclusions
  from public.tasks where assignee_id=p_profile_id and created_at::date between p_from and p_to
 ), daily_stats as (
  select count(*) as daily_completed from public.task_completions where staff_id=p_profile_id and completed_at is not null and date between p_from and p_to
 ), events as (
  select work_date, type, checkin_time,
   lag(type) over (partition by staff_id order by checkin_time) as prev_type,
   lag(checkin_time) over (partition by staff_id order by checkin_time) as prev_time
  from public.shift_logs
  where staff_id=p_profile_id and work_date between p_from and p_to and checkin_time is not null
 ), paired_sessions as (
  select work_date, greatest(0, extract(epoch from (checkin_time - prev_time))/60) as minutes
  from events
  where type = 'checkout' and prev_type = 'checkin'
 ), per_day as (
  select work_date, sum(minutes) as day_minutes from paired_sessions group by work_date
 ), time_stats as (
  select count(*) as work_days, coalesce(sum(day_minutes),0)::bigint as work_minutes,
   coalesce(sum(greatest(0, day_minutes-480)),0)::bigint as overtime_minutes from per_day
 ), production_stats as (
  select coalesce(sum(actual_quantity),0) as output_quantity from public.production_batches
  where created_by=p_profile_id and completed_at::date between p_from and p_to and status='completed'
 )
 select jsonb_build_object('profile_id',p_profile_id,'from',p_from,'to',p_to,'assigned_tasks',t.assigned,
  'completed_tasks',t.completed,'on_time_tasks',t.on_time,'approved_exclusions',t.approved_exclusions,
  'daily_tasks_completed',d.daily_completed,'work_days',s.work_days,'work_minutes',s.work_minutes,
  'overtime_minutes',s.overtime_minutes,'output_quantity',p.output_quantity,
  'completion_rate',case when t.assigned-t.approved_exclusions<=0 then 100 else round(t.completed*100.0/(t.assigned-t.approved_exclusions),1) end)
 into v_result from task_stats t cross join daily_stats d cross join time_stats s cross join production_stats p;
 return v_result;
end $$;

revoke all on function public.get_staff_kpi_v2(uuid,date,date) from public,anon;
grant execute on function public.get_staff_kpi_v2(uuid,date,date) to authenticated;

insert into public.migration_runs(migration_key, status, finished_at, notes)
values('202609101000_fix_work_minutes_paired_sessions', 'completed', now(),
  'Fix get_staff_kpi_v2: work_minutes/overtime_minutes gio tinh dung theo cap checkin->checkout ke tiep (LAG), khong con lay min/max tho lam thoi gian tang ca bi thoi phong khi du lieu cham cong bi thieu checkout hoac tach ca.')
on conflict(migration_key) do update set status='completed', finished_at=now(), notes=excluded.notes;

commit;
