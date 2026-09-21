-- Đối chiếu tiếp với màn "KPI" cũ (kpi.js) — bổ sung 3 nhóm số liệu có
-- dữ liệu thật nhưng Tổng quan KPI đang thiếu hoàn toàn:
--   1. Shipper: số đơn giao, quãng đường GPS, thời gian di chuyển, tỷ lệ có
--      ảnh chứng minh (computeShipperKpi) — CHỈ tính khi vai trò là shipper,
--      vì các trường GPS/ảnh hiện tại thực tế đều = 0 (đã kiểm tra), không
--      ép hiện số vô nghĩa cho vai trò khác.
--   2. Ngày nghỉ phép đã duyệt (computeLeaveDayCount) — qua 2 nguồn giống
--      bản cũ: approval_requests đã duyệt + shift_logs ghi nghỉ đột xuất.
--   3. Giờ làm cùng nhau (computeCoworkingHours) — thời gian trùng công
--      đoạn cùng đơn nhưng khác người phụ trách, phản ánh phối hợp bếp.
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

  -- 1. Shipper: chỉ tính khi vai trò là shipper (giữ đúng cách bản cũ lọc
  -- theo tên khớp shipper_staff_name/driver_name — chưa có cột staff_id
  -- trực tiếp trên orders cho người giao).
  if v_role = 'shipper' then
    with don_giao as (
      select o.*
      from public.orders o
      where (o.shipper_staff_name = v_ten or o.driver_name = v_ten)
        and (o.status = 'hoan_thanh' or o.status_v2 = 'completed')
        and o.completed_at::date between p_from and p_to
    )
    select jsonb_build_object(
      'shipper_order_count', count(*),
      'shipper_total_km', round(coalesce(sum(
        case when pickup_lat is not null and delivery_lat is not null then
          6371 * acos(least(1, greatest(-1,
            cos(radians(pickup_lat)) * cos(radians(delivery_lat)) * cos(radians(delivery_lng) - radians(pickup_lng))
            + sin(radians(pickup_lat)) * sin(radians(delivery_lat))
          )))
        when planned_distance_km is not null then planned_distance_km
        else 0 end
      ), 0)::numeric, 1),
      'shipper_orders_with_proof', count(*) filter (where delivery_photo_url is not null)
    ) into v_shipper
    from don_giao;
  end if;

  -- 2. Ngày nghỉ phép đã duyệt — 2 nguồn giống bản cũ.
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

  -- 3. Giờ làm cùng nhau — trùng công đoạn cùng đơn, khác người phụ trách.
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
values('202609101310_kpi_overview_shipper_leave_coworking', 'completed', now(),
  'get_employee_kpi_overview v3: them shipper_order_count/shipper_total_km/shipper_orders_with_proof (chi tinh khi role=shipper), leave_day_count (2 nguon giong ban cu), coworking_hours (trung cong doan cung don khac nguoi phu trach) - dua theo doi chieu voi man KPI cu (kpi.js) dang chay that.')
on conflict(migration_key) do update set status='completed', finished_at=now(), notes=excluded.notes;

commit;
