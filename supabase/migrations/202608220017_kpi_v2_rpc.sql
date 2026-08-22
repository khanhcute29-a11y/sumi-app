-- SUMI APP M17 — evidence-based KPI read model.
begin;
create or replace function public.get_staff_kpi_v2(p_profile_id uuid,p_from date,p_to date)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare v_actor uuid:=auth.uid();v_result jsonb;
begin
 if v_actor is null or (v_actor<>p_profile_id and not public.is_business_director()) then raise exception 'KPI access denied'; end if;
 if p_to<p_from or p_to-p_from>366 then raise exception 'invalid KPI date range'; end if;
 with task_stats as (
  select count(*) as assigned,
   count(*) filter(where status='done') as completed,
   count(*) filter(where status='done' and (deadline is null or completed_at<=deadline)) as on_time,
   count(*) filter(where status='exempted' and exclusion_reason_code in ('natural_disaster','government_policy','traffic','illness') and exclusion_approved_by is not null) as approved_exclusions
  from public.tasks where assignee_id=p_profile_id and created_at::date between p_from and p_to
 ), daily_stats as (
  select count(*) as daily_completed from public.task_completions where staff_id=p_profile_id and completed_at is not null and date between p_from and p_to
 ), per_day as (
  select work_date,min(checkin_time) first_time,max(checkin_time) last_time
  from public.shift_logs where staff_id=p_profile_id and work_date between p_from and p_to and checkin_time is not null group by work_date
 ), time_stats as (
  select count(*) as work_days,coalesce(sum(greatest(0,extract(epoch from(last_time-first_time))/60)),0)::bigint as work_minutes,
   coalesce(sum(greatest(0,extract(epoch from(last_time-first_time))/60-480)),0)::bigint as overtime_minutes from per_day
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
insert into public.migration_runs(migration_key,status,finished_at,notes) values('202608220017_kpi_v2_rpc','completed',now(),'Added evidence-based self/director KPI calculation with governed exclusions.')
on conflict(migration_key) do update set status='completed',finished_at=now(),notes=excluded.notes;commit;
