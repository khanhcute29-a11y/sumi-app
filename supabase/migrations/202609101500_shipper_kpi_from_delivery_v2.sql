-- Đã xác nhận: orders.shipper_staff_name (nguồn cũ) = 0 dữ liệu thật vì
-- tiệm đã chuyển hẳn qua hệ "Vận Chuyển V2" (delivery_runs/delivery_stops).
-- Kiểm tra trực tiếp: 92 chuyến/30 ngày, 9 tài xế, ĐẦY ĐỦ distance_km,
-- 90/90 điểm giao có photo_proof_url — dữ liệu thật, đang dùng sống mỗi
-- ngày. Nối đúng vào đây thay vì nguồn cũ đã chết.
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
    with chuyen as (
      select * from public.delivery_runs
      where assigned_driver_id = p_staff_id
        and status = 'completed'
        and completed_at::date between p_from and p_to
    ), diem_giao as (
      select ds.* from public.delivery_stops ds
      join chuyen c on c.id = ds.delivery_run_id
      where ds.status = 'delivered'
    )
    select jsonb_build_object(
      'shipper_order_count', (select count(*) from diem_giao),
      'shipper_total_km', coalesce((select round(sum(distance_km)::numeric, 1) from chuyen), 0),
      'shipper_orders_with_proof', (select count(*) from diem_giao where photo_proof_url is not null),
      'shipper_total_minutes', coalesce((select round(sum(extract(epoch from (completed_at - started_at)))/60) from chuyen where started_at is not null), 0)
    ) into v_shipper;
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

  return v_base || v_tre || v_sao || v_shipper || v_nghi || v_cung;
end;
$fn$;

revoke all on function public.get_employee_kpi_overview(uuid, date, date) from public, anon;
grant execute on function public.get_employee_kpi_overview(uuid, date, date) to authenticated;

insert into public.migration_runs(migration_key, status, finished_at, notes)
values('202609101500_shipper_kpi_from_delivery_v2', 'completed', now(),
  'Doi nguon shipper KPI tu orders.shipper_staff_name (0 du lieu, da chet) sang delivery_runs/delivery_stops (Van Chuyen V2, dang chay that - 92 chuyen/30 ngay, 90/90 diem giao co anh chung minh). Them shipper_total_minutes (thoi gian chay chuyen).')
on conflict(migration_key) do update set status='completed', finished_at=now(), notes=excluded.notes;

commit;
