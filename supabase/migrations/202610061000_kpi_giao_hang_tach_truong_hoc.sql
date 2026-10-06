-- KPI giao hàng tách 2 luồng: TRƯỜNG HỌC / ĐƠN KHÁC (yêu cầu Giám đốc
-- 06/10/2026) cho file xuất KPI và màn Tổng quan KPI.
--
-- Chỉ đổi khối Shipper của get_employee_kpi_overview: THÊM 8 khoá
-- shipper_th_* / shipper_khac_*, 4 khoá shipper_* cũ giữ nguyên giá trị. Mọi
-- phần khác của hàm giữ NGUYÊN VĂN bản đang chạy (migration 202609111900).
-- Chữ ký hàm không đổi. Cách tính km giữ nguyên (distance_km theo GPS).
begin;
set local lock_timeout = '10s';
set local statement_timeout = '30s';

create or replace function public.get_employee_kpi_overview(p_staff_id uuid, p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  v_actor  uuid := auth.uid();
  v_base   jsonb;
  v_tre    jsonb;
  v_sao    jsonb;
  v_cong   numeric;
  v_tru    numeric;
  v_role   text;
  v_ten    text;
  v_shipper jsonb := '{}'::jsonb;
  v_nghi    jsonb;
  v_cung    jsonb;
  v_thieu   jsonb;
begin
  if v_actor is null or (v_actor <> p_staff_id and not public.is_business_director()) then
    raise exception 'KPI access denied';
  end if;
  if p_to < p_from or p_to - p_from > 366 then
    raise exception 'invalid KPI date range';
  end if;

  select role, full_name into v_role, v_ten from public.profiles where id = p_staff_id;

  v_base := public.get_staff_kpi_v2(p_staff_id, p_from, p_to);

  select jsonb_build_object(
    'late_count', count(*) filter (where late_minutes > 0),
    'late_minutes_total', coalesce(sum(late_minutes) filter (where late_minutes > 0), 0)
  ) into v_tre
  from public.shift_logs
  where staff_id = p_staff_id and type = 'checkin' and work_date between p_from and p_to;

  select coalesce(sum(so_sao) filter (where loai = 'cong'), 0), coalesce(sum(so_sao) filter (where loai = 'tru'), 0)
    into v_cong, v_tru
  from public.star_transactions
  where staff_id = p_staff_id and ngay between p_from and p_to;

  select jsonb_build_object(
    'star_cong_sao', v_cong, 'star_cong_tien', v_cong * 1000,
    'star_chua_dat_sao', v_tru, 'star_chua_dat_tien', v_tru * 1000,
    'star_rong_sao', greatest(0, v_cong - v_tru),
    'star_rong_tien', greatest(0, v_cong - v_tru) * 1000
  ) into v_sao;

  -- Shipper: đổi nguồn từ orders.shipper_staff_name (chết) sang
  -- delivery_runs/delivery_stops (Vận Chuyển V2, đang chạy thật).
  if v_role = 'shipper' then
    -- Tách 2 luồng TRƯỜNG HỌC (orders.order_type = 'school') / ĐƠN KHÁC — yêu
    -- cầu Giám đốc 06/10/2026. 4 khoá shipper_* cũ GIỮ NGUYÊN giá trị (tổng).
    -- Km/phút gắn theo CHUYẾN: tháng 9/2026 mọi chuyến đều 1 đơn nên tách
    -- chính xác; nếu sau này 1 chuyến chở lẫn 2 loại thì chia theo tỉ lệ số
    -- điểm đã giao. Chuyến không có điểm giao nào tính vào ĐƠN KHÁC. Luồng
    -- khác = TỔNG − trường học để 2 luồng cộng lại luôn đúng bằng tổng.
    with chuyen as (
      select * from public.delivery_runs
      where assigned_driver_id = p_staff_id
        and status = 'completed'
        and completed_at::date between p_from and p_to
    ), diem_giao as (
      select ds.*, coalesce(o.order_type = 'school', false) as la_truong_hoc
      from public.delivery_stops ds
      join chuyen c on c.id = ds.delivery_run_id
      left join public.orders o on o.id = ds.order_id
      where ds.status = 'delivered'
    ), ti_le as (
      select c.id, c.distance_km, c.started_at, c.completed_at,
        case when count(d.id) > 0
          then (count(d.id) filter (where d.la_truong_hoc))::numeric / count(d.id)
          else 0 end as phan_truong_hoc
      from chuyen c
      left join diem_giao d on d.delivery_run_id = c.id
      group by c.id, c.distance_km, c.started_at, c.completed_at
    ), so as (
      select
        (select count(*) from diem_giao) as don_tong,
        (select count(*) from diem_giao where la_truong_hoc) as don_th,
        (select count(*) from diem_giao where photo_proof_url is not null) as anh_tong,
        (select count(*) from diem_giao where photo_proof_url is not null and la_truong_hoc) as anh_th,
        coalesce((select round(sum(distance_km)::numeric, 1) from chuyen), 0) as km_tong,
        coalesce((select round(sum(distance_km * phan_truong_hoc)::numeric, 1) from ti_le), 0) as km_th,
        coalesce((select round(sum(extract(epoch from (completed_at - started_at)))/60) from chuyen where started_at is not null), 0) as phut_tong,
        coalesce((select round(sum(extract(epoch from (completed_at - started_at)) * phan_truong_hoc)/60) from ti_le where started_at is not null), 0) as phut_th
    )
    select jsonb_build_object(
      'shipper_order_count', don_tong,
      'shipper_total_km', km_tong,
      'shipper_orders_with_proof', anh_tong,
      'shipper_total_minutes', phut_tong,
      'shipper_th_order_count', don_th,
      'shipper_th_km', km_th,
      'shipper_th_orders_with_proof', anh_th,
      'shipper_th_minutes', phut_th,
      'shipper_khac_order_count', don_tong - don_th,
      'shipper_khac_km', km_tong - km_th,
      'shipper_khac_orders_with_proof', anh_tong - anh_th,
      'shipper_khac_minutes', phut_tong - phut_th
    ) into v_shipper
    from so;
  end if;

  select jsonb_build_object('leave_day_count', count(distinct ngay))
  into v_nghi
  from (
    select ar.leave_date::date as ngay
    from public.approval_requests ar
    where ar.type = 'leave_request' and ar.status = 'approved' and ar.requester_id = p_staff_id
      and ar.leave_date between p_from and p_to
    union
    select sl.work_date as ngay
    from public.shift_logs sl
    where sl.type = 'leave_request' and sl.staff_id = p_staff_id
      and sl.work_date between p_from and p_to
  ) x;

  select jsonb_build_object('coworking_hours', round(coalesce(sum(
    greatest(0, extract(epoch from (
      least(m.ended_at, o2.ended_at) - greatest(m.started_at, o2.started_at)
    )))
  ), 0) / 3600, 1))
  into v_cung
  from public.order_stages m
  join public.order_stages o2 on o2.order_id = m.order_id and o2.assignee_id is not null and o2.assignee_id <> p_staff_id
    and o2.started_at is not null and o2.ended_at is not null
  where m.assignee_id = p_staff_id and m.started_at is not null and m.ended_at is not null
    and m.started_at::date between p_from and p_to;

  with events as (
    select type, checkin_time,
      lead(type) over (order by checkin_time) as next_type
    from public.shift_logs
    where staff_id = p_staff_id and type in ('checkin', 'checkout')
      and checkin_time is not null and work_date between p_from and p_to
  )
  select jsonb_build_object('missing_checkout_count', count(*))
  into v_thieu
  from events
  where type = 'checkin' and (next_type is null or next_type <> 'checkout');

  return v_base || v_tre || v_sao || v_shipper || v_nghi || v_cung || v_thieu;
end;
$fn$;

revoke all on function public.get_employee_kpi_overview(uuid, date, date) from public, anon;
grant execute on function public.get_employee_kpi_overview(uuid, date, date) to authenticated;

insert into public.migration_runs(migration_key, status, finished_at, notes)
values('202610061000_kpi_giao_hang_tach_truong_hoc', 'completed', now(),
  'get_employee_kpi_overview: them shipper_th_* va shipper_khac_* (so don, km, phut, don co anh) tach theo orders.order_type = school; 4 khoa shipper_* cu giu nguyen; luong khac = tong - truong hoc; chuyen tron 2 loai chia theo ti le so diem giao.')
on conflict(migration_key) do update set status='completed', finished_at=now(), notes=excluded.notes;

commit;
