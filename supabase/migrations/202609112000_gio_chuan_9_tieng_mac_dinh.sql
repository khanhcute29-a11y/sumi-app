-- Sếp chốt lại quy tắc THẬT (11/9/2026), sau khi thấy số tăng ca của Phạm
-- Thị Kim Tiến tăng bất thường ở bản vá trước (202609111700/202609111800):
--
--   • Giờ làm MẶC ĐỊNH cho TOÀN BỘ nhân viên = 9 tiếng có mặt/ngày (không
--     phải 7-8 tiếng như bảng sumi_quy_dinh_ca đang ghi cho từng người/bộ
--     phận - bảng đó SAI, không dùng để tính giờ chuẩn tăng ca nữa).
--   • TRỪ ca "Bakery"/"Thu Ngân": vẫn 9 tiếng mặc định, nhưng KHÔNG trừ nghỉ
--     trưa và KHÔNG tính tăng ca - áp dụng THEO TỪNG PHIÊN CHẤM CÔNG (ai
--     chấm vào ca có tên Bakery/Thu Ngân ngày đó thì phiên đó được miễn,
--     không phải theo vai trò cố định của người - đúng thiết kế gốc của
--     migration 202609111000, quay lại đúng thiết kế đó thay vì ưu tiên
--     cấu hình riêng từng người như 202609111700 đã làm SAI).
--   • Ca Sáng /Chiều /Tối ở Quốc lộ 13 / Vĩnh Phú 42 (bảng shift_configs,
--     8 tiếng có mặt, giờ vào/ra cụ thể) - giữ nguyên riêng, không đổi.
--
-- Bỏ hẳn: (1) tra sumi_quy_dinh_ca theo người/bộ phận (202609111700) - bảng
-- đó không phản ánh đúng chính sách 9 tiếng mặc định sếp vừa xác nhận;
-- (2) quy tắc dự phòng "sau 16h tính tăng ca" (202609101400) - không còn
-- cần nữa vì giờ MỌI ca không phải Bakery/không phải shift_configs đều có
-- giờ chuẩn rõ ràng (9 tiếng - 1 tiếng nghỉ trưa = 8 tiếng chuẩn).
-- Giữ nguyên: gộp tăng ca theo NGÀY (202609111800, sếp đã xác nhận đúng qua
-- ví dụ Nguyen Quoc Duy 03/9) - chỉ đổi phần "standard_minutes" bên trong.
begin;
set local lock_timeout = '10s';
set local statement_timeout = '30s';

create or replace function public.get_staff_kpi_v2(p_profile_id uuid, p_from date, p_to date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_actor uuid := auth.uid();
  v_result jsonb;
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
    greatest(0, extract(epoch from (
      least(checkin_time, ((prev_time at time zone 'Asia/Ho_Chi_Minh')::date + time '12:30') at time zone 'Asia/Ho_Chi_Minh')
      - greatest(prev_time, ((prev_time at time zone 'Asia/Ho_Chi_Minh')::date + time '11:30') at time zone 'Asia/Ho_Chi_Minh')
    ))/60) as overlap_lunch_minutes
  from events
  where type = 'checkout' and prev_type = 'checkin'
 ), pairs_cfg as (
  select p.*,
    sc.start_time as legacy_start, sc.end_time as legacy_end,
    (p.shift_label ilike '%bakery%' or p.shift_label ilike '%thu ng%') as la_bakery
  from pairs p
  left join public.shift_configs sc on sc.label = p.shift_label and sc.branch is not distinct from p.branch
 ), pairs_net as (
  select work_date, checkin_ts, checkout_ts, legacy_start, legacy_end, la_bakery,
   gross_minutes,
   case when la_bakery then 0 else overlap_lunch_minutes end as lunch_minutes
  from pairs_cfg
 ), pairs_net2 as (
  select work_date, checkin_ts, legacy_start, legacy_end, la_bakery,
   greatest(0, gross_minutes - lunch_minutes) as net_minutes
  from pairs_net
 ), pairs_std as (
  select *,
   case
     when la_bakery then null
     when legacy_start is not null and legacy_end is not null and legacy_end <> legacy_start then
       (case when legacy_end < legacy_start
         then (extract(epoch from legacy_end)/60 + 1440) - extract(epoch from legacy_start)/60
         else extract(epoch from legacy_end)/60 - extract(epoch from legacy_start)/60
       end)
     else 9 * 60 - 60  -- mac dinh: 9 tieng co mat - 1 tieng nghi trua = 8 tieng chuan
   end as standard_minutes
  from pairs_net2
 ), matched_days as (
  -- Gop tat ca phien KHONG PHAI bakery trong cung 1 ngay, tru gio chuan 1
  -- lan cho ca ngay (lay chuan cua phien som nhat lam moc chung).
  select work_date,
   sum(net_minutes) as net_minutes,
   (array_agg(standard_minutes order by checkin_ts))[1] as standard_minutes
  from pairs_std
  where standard_minutes is not null
  group by work_date
 ), bakery_sessions as (
  -- Ca Bakery/Thu Ngan: khong tinh tang ca, tinh rieng tung phien (dung
  -- thiet ke goc, ap dung theo CA khong theo NGUOI).
  select work_date, net_minutes, 0::numeric as ot_minutes
  from pairs_std
  where la_bakery
 ), session_overtime as (
  select md.work_date, md.net_minutes, greatest(0, md.net_minutes - md.standard_minutes) as ot_minutes
  from matched_days md
  union all
  select bs.work_date, bs.net_minutes, bs.ot_minutes from bakery_sessions bs
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
values('202609112000_gio_chuan_9_tieng_mac_dinh', 'completed', now(),
  'Sep chot lai quy tac that: gio chuan MAC DINH cho TOAN BO nhan vien = 9 tieng co mat/ngay - 1 tieng nghi trua = 8 tieng lam chuan, tru rieng ca Bakery/Thu Ngan (van 9 tieng nhung KHONG tru nghi trua, KHONG tinh tang ca, ap dung THEO TUNG PHIEN cham cong chu khong theo nguoi co dinh). Bo han viec tra bang sumi_quy_dinh_ca theo nguoi/bo phan (202609111700 - sai vi bang do khong phan anh dung 9 tieng mac dinh) va bo quy tac du phong "sau 16h" (khong con can vi moi ca khong phai Bakery/khong phai shift_configs gio deu co gio chuan ro rang). Giu nguyen gop tang ca theo ngay (202609111800, sep da xac nhan dung qua vi du Nguyen Quoc Duy 03/9) va giu nguyen shift_configs rieng cho Ca Sang/Chieu/Toi o Quoc lo 13/Vinh Phu 42.')
on conflict(migration_key) do update set status='completed', finished_at=now(), notes=excluded.notes;

commit;
