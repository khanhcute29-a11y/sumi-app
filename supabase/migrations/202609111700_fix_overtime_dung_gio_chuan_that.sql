-- Phát hiện khi làm audit "Tổng quan KPI" (11/9/2026, theo yêu cầu sếp kiểm
-- tra lại toàn bộ số liệu/công thức): get_staff_kpi_v2 đang tính TĂNG CA dựa
-- vào bảng shift_configs — bảng này CHỈ có "Ca Sáng /Chiều /Tối " cho 2 chi
-- nhánh bán hàng (Quốc lộ 13, Vĩnh Phú 42), KHÔNG hề có Bếp Lạnh/Bếp Nóng/
-- Xưởng 41/Xưởng 42/Vận Tải. Trong khi đó giờ ca CHUẨN THẬT của các bộ phận
-- này (và giờ riêng từng người) đã có sẵn, đang chạy sống ở bảng khác:
-- sumi_quy_dinh_ca (bảng mà trigger tính "đi trễ" đang dùng đúng).
--
-- Vì tra nhầm bảng, MỌI nhân viên bếp/xưởng không khớp được shift_configs
-- nên rơi vào công thức dự phòng "sau 16h tính tăng ca" — sai với giờ chuẩn
-- thật đã cấu hình. Bằng chứng: Đào Thị Bích Nga 03/9 chỉ có 1 ca duy nhất
-- 16:23->20:09 (không có ca sáng nào khác cùng ngày) nhưng công thức cũ tính
-- TOÀN BỘ ca này là tăng ca, dù đây là ca làm việc bình thường của cô.
--
-- Lỗi thứ 2 liên quan: quy tắc "ca tên có chữ Bakery/Thu Ngân thì không trừ
-- nghỉ trưa VÀ không tính tăng ca" (migration 202609111000, làm riêng cho
-- chị Lê Thị Hải Vân - thu ngân) so khớp theo CHỮ trong tên ca. Nhưng tên ca
-- "Bakery (Thu ngân · Bếp lạnh · Bếp nóng)" đang dùng CHUNG bởi 4 người, 3
-- vai trò khác nhau (thu ngân + 3 người bếp: Phạm Thị Kim Tiến, Bùi Nghĩa 2,
-- Ngô Tống Thanh Vân) -> 3 người bếp bị lây nhầm "không nghỉ trưa, không
-- tăng ca", dù cấu hình riêng của chính họ trong sumi_quy_dinh_ca ghi rõ
-- khong_nghi_trua=false (có nghỉ trưa bình thường).
--
-- CÁCH SỬA (thêm, không xoá đường cũ - an toàn cho các ca đã tính đúng):
--   Ưu tiên 1: cấu hình RIÊNG từng người trong sumi_quy_dinh_ca (bo_phan =
--     chính uuid nhân viên) - đúng nhất vì sếp cấu hình tay cho từng người.
--   Ưu tiên 2: shift_configs khớp label+chi nhánh (đường cũ, giữ nguyên cho
--     Ca Sáng/Chiều/Tối ở 2 chi nhánh bán hàng đang chạy đúng).
--   Ưu tiên 3: cấu hình theo BỘ PHẬN trong sumi_quy_dinh_ca, suy ra từ
--     profiles.station (lanh->bep_lanh, nong->bep_nong, xuong41/42 giữ
--     nguyên) hoặc profiles.role (cashier->thu_ngan, sale->ban_hang,
--     shipper->van_tai). Bộ phận có 2 ca (sáng/chiều) thì chọn ca có giờ
--     bắt đầu gần giờ chấm vào thực tế nhất.
--   Ưu tiên 4 (không đổi): chưa khớp gì cả -> giữ nguyên quy tắc cũ (sau 16h
--     tính tăng ca, trừ ca có chữ Bakery/Thu Ngân thì 0) - lưới an toàn cho
--     các trường hợp hiếm không nằm trong 2 bảng cấu hình trên (vd tài khoản
--     admin/owner test).
-- Trừ nghỉ trưa cũng đổi theo cùng thứ tự ưu tiên: có cấu hình thật
-- (khong_nghi_trua) thì dùng đúng cờ đó, không có thì giữ quy tắc chữ cũ.
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
  select work_date, shift_label, checkin_ts, checkout_ts, moc_4h_chieu, legacy_start, legacy_end, so_gio_chuan, khong_nghi_trua, lunch_minutes,
   greatest(0, gross_minutes - lunch_minutes) as net_minutes
  from pairs_net
 ), session_overtime as (
  select work_date, net_minutes,
   case
     when legacy_start is not null and legacy_end is not null and legacy_end <> legacy_start then
       greatest(0, net_minutes - (case when legacy_end < legacy_start
         then (extract(epoch from legacy_end)/60 + 1440) - extract(epoch from legacy_start)/60
         else extract(epoch from legacy_end)/60 - extract(epoch from legacy_start)/60
       end))
     when so_gio_chuan is not null then
       greatest(0, net_minutes - (so_gio_chuan * 60 - (case when khong_nghi_trua then 0 else 60 end)))
     when shift_label not ilike '%bakery%' then
       greatest(0, extract(epoch from (checkout_ts - greatest(checkin_ts, moc_4h_chieu)))/60)
     else 0
   end as ot_minutes
  from pairs_net2
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
values('202609111700_fix_overtime_dung_gio_chuan_that', 'completed', now(),
  'Fix tinh tang ca dung nham bang shift_configs (chi co 2 chi nhanh ban hang) thay vi sumi_quy_dinh_ca (bang that dang dung cho tinh di tre, co day du Bep Lanh/Nong/Xuong41/42/Van tai + gio rieng tung nguoi). Them uu tien: 1) cau hinh rieng tung nguoi trong sumi_quy_dinh_ca, 2) shift_configs cu (giu nguyen), 3) cau hinh theo bo phan (station/role) trong sumi_quy_dinh_ca, 4) fallback cu sau-16h/bakery-0 cho truong hop khong khop gi ca. Cung fix loi lay: quy tac "Bakery/Thu Ngan khong nghi trua" (lam rieng cho thu ngan Le Thi Hai Van) dang bi lay sang 3 nguoi bep dung chung ten ca "Bakery (Thu ngan - Bep lanh - Bep nong)" (Pham Thi Kim Tien, Bui Nghia 2, Ngo Tong Thanh Van) - gio uu tien dung cau hinh rieng tung nguoi (khong_nghi_trua that) thay vi so khop chu trong ten ca.')
on conflict(migration_key) do update set status='completed', finished_at=now(), notes=excluded.notes;

commit;
