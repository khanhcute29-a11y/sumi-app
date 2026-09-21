-- Nối tiếp 202609111700 (đã áp dụng, chưa đủ đúng). Sếp phát hiện qua ví dụ
-- thật: Nguyen Quoc Duy (shipper) 03/9 chạy sáng 05:38->16:48 (~11 tiếng,
-- đã dư giờ chuẩn), về nghỉ, rồi tối chạy thêm 1 chuyến 16:49->18:40
-- (~1h52). Version 202609111700 so TỪNG PHIÊN riêng với giờ chuẩn 1 ngày
-- (9 tiếng) -> chuyến tối chỉ 1h52, chưa đủ 9 tiếng NÊN BỊ TÍNH 0 PHÚT TĂNG
-- CA - dù thực tế đây là giờ làm THÊM sau khi đã xong nguyên 1 ngày, phải
-- được tính tăng ca.
--
-- SỬA: gộp NET MINUTES của tất cả các phiên trong CÙNG 1 NGÀY LÀM VIỆC lại
-- trước, trừ giờ chuẩn CHỈ 1 LẦN cho cả ngày (dùng giờ chuẩn của phiên sớm
-- nhất trong ngày làm mốc chung, vì đó là ca chính trong ngày), phần dư mới
-- tính là tăng ca. Chỉ áp dụng gộp-theo-ngày cho các phiên ĐÃ khớp được cấu
-- hình thật (shift_configs cũ hoặc sumi_quy_dinh_ca) - phiên nào rơi vào
-- lưới an toàn cũ (không khớp gì, dùng tạm "sau 16h") vẫn giữ tính riêng lẻ
-- như cũ, vì quy tắc đó vốn dựa theo mốc giờ trong ngày chứ không phải một
-- ngưỡng số phút cố định, không gộp theo ngày được.
begin;
set local lock_timeout = '10s';
set local statement_timeout = '30s';

create or replace function public.get_staff_kpi_v2(p_profile_id uuid, p_from date, p_to date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_actor uuid := auth.uid();
  v_result jsonb;
  v_role text;
  v_station text;
begin
 if v_actor is null or (v_actor <> p_profile_id and not public.is_business_director()) then raise exception 'KPI access denied'; end if;
 if p_to < p_from or p_to - p_from > 366 then raise exception 'invalid KPI date range'; end if;

 select role, station into v_role, v_station from public.profiles where id = p_profile_id;

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
    ))/60) as overlap_lunch_minutes,
    ((prev_time at time zone 'Asia/Ho_Chi_Minh')::date + time '16:00') at time zone 'Asia/Ho_Chi_Minh' as moc_4h_chieu
  from events
  where type = 'checkout' and prev_type = 'checkin'
 ), pairs_cfg as (
  select p.*,
    sc.start_time as legacy_start, sc.end_time as legacy_end,
    qc.so_gio_chuan, qc.khong_nghi_trua
  from pairs p
  left join public.shift_configs sc on sc.label = p.shift_label and sc.branch is not distinct from p.branch
  left join lateral (
    select q.so_gio_chuan, q.khong_nghi_trua
    from public.sumi_quy_dinh_ca q
    where q.active and (
      q.bo_phan = p_profile_id::text
      or q.bo_phan = (case v_station when 'lanh' then 'bep_lanh' when 'nong' then 'bep_nong' else v_station end)
      or (v_role = 'cashier' and q.bo_phan = 'thu_ngan')
      or (v_role = 'sale' and q.bo_phan = 'ban_hang')
      or (v_role = 'shipper' and q.bo_phan = 'van_tai')
    )
    order by (q.bo_phan = p_profile_id::text) desc,
      abs(extract(epoch from ((p.checkin_ts at time zone 'Asia/Ho_Chi_Minh')::time - q.gio_bat_dau)))
    limit 1
  ) qc on true
 ), pairs_net as (
  select work_date, shift_label, checkin_ts, checkout_ts, moc_4h_chieu, legacy_start, legacy_end, so_gio_chuan, khong_nghi_trua,
   gross_minutes,
   case
     when khong_nghi_trua is true then 0
     when khong_nghi_trua is false then overlap_lunch_minutes
     when shift_label ilike '%bakery%' or shift_label ilike '%thu ng%' then 0
     else overlap_lunch_minutes
   end as lunch_minutes
  from pairs_cfg
 ), pairs_net2 as (
  select work_date, shift_label, checkin_ts, checkout_ts, moc_4h_chieu, legacy_start, legacy_end, so_gio_chuan, khong_nghi_trua,
   greatest(0, gross_minutes - lunch_minutes) as net_minutes
  from pairs_net
 ), pairs_std as (
  select *,
   case
     when legacy_start is not null and legacy_end is not null and legacy_end <> legacy_start then
       (case when legacy_end < legacy_start
         then (extract(epoch from legacy_end)/60 + 1440) - extract(epoch from legacy_start)/60
         else extract(epoch from legacy_end)/60 - extract(epoch from legacy_start)/60
       end)
     when so_gio_chuan is not null then
       so_gio_chuan * 60 - (case when khong_nghi_trua then 0 else 60 end)
     else null
   end as standard_minutes
  from pairs_net2
 ), matched_days as (
  -- Có cấu hình giờ chuẩn thật -> gộp toàn bộ phiên trong ngày, trừ giờ
  -- chuẩn 1 LẦN cho cả ngày (lấy giờ chuẩn của phiên chấm vào sớm nhất
  -- ngày đó làm mốc chung, vì đó là ca chính).
  select work_date,
   sum(net_minutes) as net_minutes,
   (array_agg(standard_minutes order by checkin_ts))[1] as standard_minutes
  from pairs_std
  where standard_minutes is not null
  group by work_date
 ), unmatched_sessions as (
  -- Không khớp cấu hình nào -> giữ nguyên lưới an toàn cũ, tính riêng từng
  -- phiên theo mốc "sau 16h" (không gộp theo ngày được vì quy tắc này dựa
  -- theo giờ trong ngày, không phải một ngưỡng phút cố định).
  select work_date, net_minutes,
   case when shift_label not ilike '%bakery%' then
     greatest(0, extract(epoch from (checkout_ts - greatest(checkin_ts, moc_4h_chieu)))/60)
   else 0 end as ot_minutes
  from pairs_std
  where standard_minutes is null
 ), session_overtime as (
  select work_date, net_minutes, greatest(0, net_minutes - standard_minutes) as ot_minutes
  from matched_days
  union all
  select work_date, net_minutes, ot_minutes from unmatched_sessions
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
values('202609111800_gop_tang_ca_theo_ngay', 'completed', now(),
  'Noi tiep 202609111700: gop tat ca phien chong cong trong CUNG 1 NGAY lai truoc khi tru gio chuan (chi ap dung cho phien da khop cau hinh that - shift_configs hoac sumi_quy_dinh_ca), thay vi tru gio chuan tung phien rieng le. Fix vi du that: shipper chay du 1 ngay roi ve, toi chay them 1 chuyen ngan - truoc bi tinh 0 phut tang ca vi phien ngan chua du gio chuan mot minh, gio duoc gop chung voi phien chinh trong ngay de tinh dung phan du la tang ca. Phien khong khop cau hinh nao van giu nguyen tinh rieng le theo mot 16h (khong gop duoc vi quy tac do dua theo moc gio trong ngay).')
on conflict(migration_key) do update set status='completed', finished_at=now(), notes=excluded.notes;

commit;
