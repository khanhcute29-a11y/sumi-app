-- Chị Lê Thị Hải Vân (role cashier, chấm công dưới 2 tên ca "Bakery (Thu
-- ngân · Bếp lạnh · Bếp nóng)" và "Thu Ngân" tại Vĩnh Phú 42) phản ánh: bên
-- chị KHÔNG có giờ nghỉ trưa cố định — nhưng get_staff_kpi_v2 đang trừ
-- unconditional 1 tiếng (11:30-12:30) cho MỌI ca, kể cả ca của chị.
--
-- Xác minh dữ liệu thật: nhiều phiên làm của chị dài 05:xx->21:3x (~16 tiếng
-- liên tục), luôn vắt qua khung 11:30-12:30 -> bị trừ oan 1 tiếng/ngày.
--
-- Sếp chốt: bỏ trừ nghỉ trưa cho CẢ 2 tên ca "Bakery (...)" và "Thu Ngân"
-- (không áp dụng rộng ra toàn chi nhánh, tránh ảnh hưởng người khác có thể
-- thực sự có nghỉ trưa). Các ca khác (Ca Sáng/Chiều/Tối, Xưởng 41/42...)
-- vẫn giữ nguyên hành vi trừ nghỉ trưa như trước.
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
    -- Ca "Bakery (...)"/"Thu Ngân" không có nghỉ trưa cố định (sếp xác nhận
    -- 11/9/2026) -> không trừ. Các ca khác vẫn trừ 11:30-12:30 giờ VN như cũ.
    case when shift_label ilike '%bakery%' or shift_label ilike '%thu ng%' then 0
    else greatest(0, extract(epoch from (
      least(checkin_time, ((prev_time at time zone 'Asia/Ho_Chi_Minh')::date + time '12:30') at time zone 'Asia/Ho_Chi_Minh')
      - greatest(prev_time, ((prev_time at time zone 'Asia/Ho_Chi_Minh')::date + time '11:30') at time zone 'Asia/Ho_Chi_Minh')
    ))/60) end as lunch_minutes,
    ((prev_time at time zone 'Asia/Ho_Chi_Minh')::date + time '16:00') at time zone 'Asia/Ho_Chi_Minh' as moc_4h_chieu
  from events
  where type = 'checkout' and prev_type = 'checkin'
 ), pairs_net as (
  select p.work_date, p.shift_label,
   greatest(0, p.gross_minutes - p.lunch_minutes) as net_minutes,
   sc.start_time, sc.end_time,
   greatest(0, extract(epoch from (p.checkout_ts - greatest(p.checkin_ts, p.moc_4h_chieu)))/60) as sau_4h_minutes
  from pairs p
  left join public.shift_configs sc on sc.label = p.shift_label and sc.branch is not distinct from p.branch
 ), session_overtime as (
  select work_date, net_minutes,
   case
     when start_time is not null and end_time is not null and end_time <> start_time then
       greatest(0, net_minutes - (case when end_time < start_time
         then (extract(epoch from end_time)/60 + 1440) - extract(epoch from start_time)/60
         else extract(epoch from end_time)/60 - extract(epoch from start_time)/60
       end))
     when shift_label not ilike '%bakery%' then sau_4h_minutes
     else 0
   end as ot_minutes
  from pairs_net
 ), time_stats as (
  select count(distinct work_date) as work_days,
   coalesce(sum(net_minutes),0)::bigint as work_minutes,
   coalesce(sum(ot_minutes),0)::bigint as overtime_minutes
  from session_overtime
 ), production_stats as (
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
values('202609111000_no_lunch_deduction_for_bakery_counter', 'completed', now(),
  'Bo tru nghi trua 11:30-12:30 cho ca ten chua "bakery" hoac "thu ng" (Thu Ngan) - sep xac nhan 2 loai ca nay khong co nghi trua co dinh, dang bi tru oan 1 tieng/ngay cho cac phien dai xuyen trua thuc te.')
on conflict(migration_key) do update set status='completed', finished_at=now(), notes=excluded.notes;

commit;
