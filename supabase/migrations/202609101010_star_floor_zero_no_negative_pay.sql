-- Rủi ro pháp lý: Điều 127 Bộ luật Lao động 2019 cấm "phạt tiền, cắt lương
-- thay việc xử lý kỷ luật lao động". Màn Tổng quan KPI đang hiện thẳng
-- "-1.350.000đ" cho hành vi đi trễ — đọc như một khoản TRỪ LƯƠNG, dù bản
-- chất dữ liệu vẫn đúng (ghi nhận qua trg_auto_phat_di_tre của đồng đội).
--
-- Không đụng tới dữ liệu gốc (staff_violations/staff_rewards/trigger tự động
-- trừ sao khi trễ giờ) — giữ nguyên lịch sử để còn tra cứu/audit. Chỉ đổi
-- CÁCH TỔNG HỢP hiển thị ra cho người dùng: sao ròng không bao giờ xuống
-- dưới 0 (kẹp sàn), và không quy đổi phần "chưa đạt" ra số tiền âm nữa —
-- đúng theo đề xuất "Quỹ thưởng chuyên cần" (thưởng do người sử dụng lao
-- động tự quyết, không phải cắt lương) thay vì mô hình "trừ lương".
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
begin
  if v_actor is null or (v_actor <> p_staff_id and not public.is_business_director()) then
    raise exception 'KPI access denied';
  end if;
  if p_to < p_from or p_to - p_from > 366 then
    raise exception 'invalid KPI date range';
  end if;

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

  -- Sàn 0: "chưa đạt" không bao giờ hiện thành số âm/tiền bị trừ — chỉ là
  -- chưa đủ điều kiện nhận thưởng chuyên cần, không phải cắt lương cứng.
  select jsonb_build_object(
    'star_cong_sao', v_cong, 'star_cong_tien', v_cong * 1000,
    'star_chua_dat_sao', v_tru, 'star_chua_dat_tien', v_tru * 1000,
    'star_rong_sao', greatest(0, v_cong - v_tru),
    'star_rong_tien', greatest(0, v_cong - v_tru) * 1000
  ) into v_sao;

  return v_base || v_tre || v_sao;
end;
$fn$;

revoke all on function public.get_employee_kpi_overview(uuid, date, date) from public, anon;
grant execute on function public.get_employee_kpi_overview(uuid, date, date) to authenticated;

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
    coalesce(t.completed, 0)::bigint,
    greatest(0, coalesce(st.cong, 0) - coalesce(st.tru, 0))::numeric,
    (greatest(0, coalesce(st.cong, 0) - coalesce(st.tru, 0)) * 1000)::numeric,
    coalesce(tre.so_lan, 0)::bigint
  from public.profiles p
  left join lateral (
    select count(*) filter (where tk.status = 'done') as completed
    from public.tasks tk where tk.assignee_id = p.id and tk.created_at::date between p_from and p_to
  ) t on true
  left join lateral (
    select
      sum(stx.so_sao) filter (where stx.loai = 'cong') as cong,
      sum(stx.so_sao) filter (where stx.loai = 'tru') as tru
    from public.star_transactions stx where stx.staff_id = p.id and stx.ngay between p_from and p_to
  ) st on true
  left join lateral (
    select count(*) filter (where sl.late_minutes > 0) as so_lan
    from public.shift_logs sl where sl.staff_id = p.id and sl.type = 'checkin' and sl.work_date between p_from and p_to
  ) tre on true
  where p.approved = true and coalesce(p.active, true) <> false
  order by greatest(0, coalesce(st.cong, 0) - coalesce(st.tru, 0)) desc, p.full_name asc;
end;
$fn$;

revoke all on function public.list_staff_kpi_overview(date, date) from public, anon;
grant execute on function public.list_staff_kpi_overview(date, date) to authenticated;

insert into public.migration_runs(migration_key, status, finished_at, notes)
values('202609101010_star_floor_zero_no_negative_pay', 'completed', now(),
  'Sao rong kep san 0, khong con hien tien am cho phan chua dat - tranh doc nhu tru luong (rui ro Dieu 127 BLLD 2019). Khong dung toi du lieu goc staff_violations/trigger tu dong, chi doi cach tong hop hien thi.')
on conflict(migration_key) do update set status='completed', finished_at=now(), notes=excluded.notes;

commit;
