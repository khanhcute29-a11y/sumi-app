-- Vẫn còn lỗi "structure of query does not match function result type" sau
-- migration trước (202609091610) — RETURN QUERY trong PL/pgSQL đòi khớp
-- CHÍNH XÁC kiểu dữ liệu từng cột với RETURNS TABLE(...), không tự ép kiểu
-- bigint -> numeric như phép gán thường (khác với INSERT/SELECT thường).
-- sum(so_sao) trả về bigint nhưng cột khai báo là numeric -> ép kiểu rõ ràng.
begin;
set local lock_timeout = '10s';
set local statement_timeout = '30s';

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
    (coalesce(st.cong, 0) - coalesce(st.tru, 0))::numeric,
    (coalesce(st.cong_tien, 0) - coalesce(st.tru_tien, 0))::numeric,
    coalesce(tre.so_lan, 0)::bigint
  from public.profiles p
  left join lateral (
    select count(*) filter (where tk.status = 'done') as completed
    from public.tasks tk where tk.assignee_id = p.id and tk.created_at::date between p_from and p_to
  ) t on true
  left join lateral (
    select
      sum(stx.so_sao) filter (where stx.loai = 'cong') as cong,
      sum(stx.so_tien) filter (where stx.loai = 'cong') as cong_tien,
      sum(stx.so_sao) filter (where stx.loai = 'tru') as tru,
      sum(stx.so_tien) filter (where stx.loai = 'tru') as tru_tien
    from public.star_transactions stx where stx.staff_id = p.id and stx.ngay between p_from and p_to
  ) st on true
  left join lateral (
    select count(*) filter (where sl.late_minutes > 0) as so_lan
    from public.shift_logs sl where sl.staff_id = p.id and sl.type = 'checkin' and sl.work_date between p_from and p_to
  ) tre on true
  where p.approved = true and coalesce(p.active, true) <> false
  order by (coalesce(st.cong, 0) - coalesce(st.tru, 0)) desc, p.full_name asc;
end;
$fn$;

revoke all on function public.list_staff_kpi_overview(date, date) from public, anon;
grant execute on function public.list_staff_kpi_overview(date, date) to authenticated;

insert into public.migration_runs(migration_key, status, finished_at, notes)
values('202609091620_fix_list_staff_kpi_type_mismatch', 'completed', now(),
  'Fix "structure of query does not match function result type" - ep kieu ::bigint/::numeric ro rang cho tung cot vi RETURN QUERY doi khop chinh xac kieu, khong tu dong cast bigint->numeric nhu phep gan thuong.')
on conflict(migration_key) do update set status='completed', finished_at=now(), notes=excluded.notes;

commit;
