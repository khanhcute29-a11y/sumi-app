-- Sếp muốn thêm 1 luồng "Tổng quan KPI" xem đủ mọi mặt của 1 nhân viên trong
-- 1 màn: việc (giao/xong/đúng hạn), giờ làm/tăng ca, chuyên cần (đi trễ), và
-- sao thưởng/phạt (Gieo Hạt) — quy ra tiền.
--
-- KHÔNG viết lại logic tasks/giờ làm/tăng ca/sản lượng — những cái đó
-- get_staff_kpi_v2 (202608220017) đã tính đúng và KpiV2Screen đang phụ thuộc
-- đúng shape của nó (dù đang tắt qua feature flag, không chắc mai đồng đội có
-- bật lại hay không) — gọi lại hàm đó rồi CỘNG THÊM 2 nhóm số mới (chuyên
-- cần + sao), tránh 2 nơi tính cùng 1 thứ rồi lệch nhau về sau (bài học từ
-- vụ hero-metrics/dsHopLe trước đây).
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
begin
  if v_actor is null or (v_actor <> p_staff_id and not public.is_business_director()) then
    raise exception 'KPI access denied';
  end if;
  if p_to < p_from or p_to - p_from > 366 then
    raise exception 'invalid KPI date range';
  end if;

  -- Tái dùng nguyên hàm KPI việc/giờ làm/tăng ca/sản lượng đã có, không viết lại.
  v_base := public.get_staff_kpi_v2(p_staff_id, p_from, p_to);

  select jsonb_build_object(
    'late_count', count(*) filter (where late_minutes > 0),
    'late_minutes_total', coalesce(sum(late_minutes) filter (where late_minutes > 0), 0)
  ) into v_tre
  from public.shift_logs
  where staff_id = p_staff_id and type = 'checkin' and work_date between p_from and p_to;

  select jsonb_build_object(
    'star_cong_sao', coalesce(sum(so_sao) filter (where loai = 'cong'), 0),
    'star_cong_tien', coalesce(sum(so_tien) filter (where loai = 'cong'), 0),
    'star_tru_sao', coalesce(sum(so_sao) filter (where loai = 'tru'), 0),
    'star_tru_tien', coalesce(sum(so_tien) filter (where loai = 'tru'), 0)
  ) into v_sao
  from public.star_transactions
  where staff_id = p_staff_id and ngay between p_from and p_to;

  return v_base || v_tre || v_sao
    || jsonb_build_object(
         'star_rong_sao', (coalesce((v_sao->>'star_cong_sao')::numeric, 0) - coalesce((v_sao->>'star_tru_sao')::numeric, 0)),
         'star_rong_tien', (coalesce((v_sao->>'star_cong_tien')::numeric, 0) - coalesce((v_sao->>'star_tru_tien')::numeric, 0))
       );
end;
$fn$;

revoke all on function public.get_employee_kpi_overview(uuid, date, date) from public, anon;
grant execute on function public.get_employee_kpi_overview(uuid, date, date) to authenticated;

-- Danh sách rút gọn cho Giám đốc lướt xem TẤT CẢ nhân viên cùng lúc (bảng xếp
-- hạng) — bảng đầy đủ (tasks/giờ làm) chỉ tính khi bấm vào 1 người cụ thể qua
-- get_employee_kpi_overview ở trên, tránh N+1 query nặng khi liệt kê 30+ người.
create or replace function public.list_staff_kpi_overview(p_from date, p_to date)
returns table(
  staff_id uuid, full_name text, role text,
  completed_tasks bigint, star_rong_sao numeric, star_rong_tien numeric, late_count bigint
)
language plpgsql
stable
security definer
set search_path = public
as $fn$
begin
  if not public.is_business_director() then
    raise exception 'KPI list access denied';
  end if;
  if p_to < p_from or p_to - p_from > 366 then
    raise exception 'invalid KPI date range';
  end if;

  return query
  select
    p.id, p.full_name, p.role,
    coalesce(t.completed, 0),
    coalesce(st.cong, 0) - coalesce(st.tru, 0),
    coalesce(st.cong_tien, 0) - coalesce(st.tru_tien, 0),
    coalesce(tre.so_lan, 0)
  from public.profiles p
  left join lateral (
    select count(*) filter (where status = 'done') as completed
    from public.tasks where assignee_id = p.id and created_at::date between p_from and p_to
  ) t on true
  left join lateral (
    select
      sum(so_sao) filter (where loai = 'cong') as cong,
      sum(so_tien) filter (where loai = 'cong') as cong_tien,
      sum(so_sao) filter (where loai = 'tru') as tru,
      sum(so_tien) filter (where loai = 'tru') as tru_tien
    from public.star_transactions where staff_id = p.id and ngay between p_from and p_to
  ) st on true
  left join lateral (
    select count(*) filter (where late_minutes > 0) as so_lan
    from public.shift_logs where staff_id = p.id and type = 'checkin' and work_date between p_from and p_to
  ) tre on true
  where p.approved = true and coalesce(p.active, true) <> false
  order by (coalesce(st.cong, 0) - coalesce(st.tru, 0)) desc, p.full_name asc;
end;
$fn$;

revoke all on function public.list_staff_kpi_overview(date, date) from public, anon;
grant execute on function public.list_staff_kpi_overview(date, date) to authenticated;

insert into public.migration_runs(migration_key, status, finished_at, notes)
values('202609091600_kpi_tong_quan_overview_rpc', 'completed', now(),
  'Them 2 RPC cho luong Tong quan KPI moi: get_employee_kpi_overview (tai dung get_staff_kpi_v2 + cong them chuyen can/sao thuong-phat cho 1 nhan vien) va list_staff_kpi_overview (bang xep hang rut gon cho giam doc luot xem tat ca nhan vien).')
on conflict(migration_key) do update set status='completed', finished_at=now(), notes=excluded.notes;

commit;
