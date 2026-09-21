-- Đối chiếu màn "KPI" cũ đang chạy (src/lib/kpi.js, computeShiftHours) với
-- get_staff_kpi_v2 vừa sửa hôm qua — phát hiện bản sửa còn THIẾU 2 thứ bản
-- cũ đã làm đúng:
--   1. Trừ giờ nghỉ trưa cố định 11:30-12:30 (nếu ca vắt qua khung này).
--   2. So tăng ca với ĐÚNG giờ ca đã cấu hình riêng cho từng người
--      (shift_configs theo label+branch), không dùng cứng 8 tiếng cho
--      mọi người.
-- Thiếu 2 cái này làm "tăng ca" trong Tổng quan KPI vẫn cao hơn thực tế.
--
-- Đồng thời sửa nguồn "sản lượng": production_batches (đã seed trước đó)
-- XÁC NHẬN 0 dòng dữ liệu gần đây — bản cũ đang thật sự dùng bảng
-- production_logs (có dữ liệu thật, staff_id đầy đủ). Đổi sang bảng đó.
--
-- Chú ý: checkin_time là timestamptz nhưng khung giờ nghỉ trưa 11:30-12:30
-- là giờ VIỆT NAM — phải quy đổi qua 'Asia/Ho_Chi_Minh' trước khi so, không
-- được so thẳng theo giờ UTC lưu trong DB.
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
  select work_date, type, checkin_time, shift_label, branch,
   lag(type) over (partition by staff_id order by checkin_time) as prev_type,
   lag(checkin_time) over (partition by staff_id order by checkin_time) as prev_time
  from public.shift_logs
  where staff_id=p_profile_id and work_date between p_from and p_to and checkin_time is not null
 ), pairs as (
  select
    work_date, prev_time as checkin_ts, checkin_time as checkout_ts, shift_label, branch,
    greatest(0, extract(epoch from (checkin_time - prev_time))/60) as gross_minutes,
    -- Khung nghỉ trưa 11:30-12:30 GIỜ VIỆT NAM, quy đổi đúng ngày lịch VN
    -- của lần chấm vào, rồi so khoảng chồng lấn với [checkin_ts, checkout_ts].
    greatest(0, extract(epoch from (
      least(checkin_time, ((prev_time at time zone 'Asia/Ho_Chi_Minh')::date + time '12:30') at time zone 'Asia/Ho_Chi_Minh')
      - greatest(prev_time, ((prev_time at time zone 'Asia/Ho_Chi_Minh')::date + time '11:30') at time zone 'Asia/Ho_Chi_Minh')
    ))/60) as lunch_minutes
  from events
  where type = 'checkout' and prev_type = 'checkin'
 ), pairs_net as (
  select p.work_date, greatest(0, p.gross_minutes - p.lunch_minutes) as net_minutes,
   sc.start_time, sc.end_time
  from pairs p
  left join public.shift_configs sc on sc.label = p.shift_label and sc.branch is not distinct from p.branch
 ), per_day as (
  select work_date, sum(net_minutes) as day_minutes,
   -- Giờ ca chuẩn từ shift_configs (phút) — ca qua đêm (end < start) cộng thêm 24h.
   sum(case when start_time is not null and end_time is not null and end_time <> start_time then
     (case when end_time < start_time
       then (extract(epoch from end_time)/60 + 1440) - extract(epoch from start_time)/60
       else extract(epoch from end_time)/60 - extract(epoch from start_time)/60
     end)
   else null end) as expected_minutes_sum,
   count(*) filter (where start_time is not null and end_time is not null and end_time <> start_time) as expected_minutes_n
  from pairs_net group by work_date
 ), time_stats as (
  select count(*) as work_days, coalesce(sum(day_minutes),0)::bigint as work_minutes,
   coalesce(sum(
     case when expected_minutes_n > 0 then greatest(0, day_minutes - expected_minutes_sum)
     else 0 end
   ),0)::bigint as overtime_minutes
  from per_day
 ), production_stats as (
  -- Đổi nguồn: production_batches xac nhan 0 dong du lieu gan day; ban cu
  -- (kpi.js computeKitchenKpi) dang dung that production_logs.
  select coalesce(sum(qty),0) as output_quantity from public.production_logs
  where staff_id=p_profile_id and work_date between p_from and p_to
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
values('202609101300_kpi_v2_match_legacy_hours_and_output', 'completed', now(),
  'get_staff_kpi_v2 v3: them tru gio nghi trua 11:30-12:30 (VN timezone) va so tang ca theo dung shift_configs tung nguoi (khop cong thuc kpi.js computeShiftHours dang chay that). Doi nguon san luong tu production_batches (0 dong) sang production_logs (co du lieu that).')
on conflict(migration_key) do update set status='completed', finished_at=now(), notes=excluded.notes;

commit;
