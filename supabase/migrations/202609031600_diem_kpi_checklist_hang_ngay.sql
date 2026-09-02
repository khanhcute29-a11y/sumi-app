-- Nối Checklist hàng ngày (task_templates/task_completions) vào Sổ KPI công
-- việc (task_kpi_logs) — hiện tại checklist đang hoàn toàn 0 điểm, tách biệt
-- với sumi_chot_kpi_thang() (202608270050). KHÔNG sửa RPC chốt lương đó —
-- nó chỉ SUM(diem) từ task_kpi_logs where su_kien='hoan_thanh', nên chỉ cần
-- ghi đúng vào bảng đó là tự động chảy vào lương, không cần đụng chỗ nhạy
-- cảm nhất của hệ thống.
--
-- Quy tắc (đã xác nhận với Giám đốc):
--   - Mỗi checklist có 1 ô "Điểm KPI" do Giám đốc tự nhập lúc tạo việc.
--   - Nhân viên tick xong + Quản lý bấm "Xác nhận" -> CỘNG đúng số điểm đó.
--   - Áp dụng hôm đó mà không tick -> TRỪ đúng số điểm đó (cùng số, ngược dấu).
--   - Việc trừ chạy TỰ ĐỘNG mỗi tối 23:55 giờ VN qua pg_cron (đã có sẵn cơ chế
--     này cho process_task_reminders, tái dùng đúng pattern), không cần đợi
--     tới lúc chốt sổ cuối tháng.
begin;
set local lock_timeout = '10s';
set local statement_timeout = '60s';

-- ---------------------------------------------------------------------------
-- 1. Thêm cột điểm KPI vào template checklist.
-- ---------------------------------------------------------------------------
alter table public.task_templates add column if not exists kpi_diem integer not null default 0;

-- ---------------------------------------------------------------------------
-- 2. create_recurring_todo — thêm tham số p_kpi_diem. Đổi chữ ký hàm (thêm 1
--    tham số) nên PHẢI drop hàm cũ trước — "create or replace" không thay
--    thế được hàm có chữ ký khác.
-- ---------------------------------------------------------------------------
drop function if exists public.create_recurring_todo(text,text,uuid,text,text,smallint[],smallint,time,integer);

create or replace function public.create_recurring_todo(
 p_title text,p_description text,p_assignee_id uuid,p_station text,p_recurrence text,
 p_weekdays smallint[],p_day_of_month smallint,p_scheduled_time time,p_remind_minutes integer,
 p_kpi_diem integer default 0
) returns uuid language plpgsql security definer set search_path=public as $$
declare v_actor uuid:=auth.uid();v_id uuid;v_manager boolean;
begin
 if v_actor is null or not public.is_approved() then raise exception 'not authorized'; end if;
 select public.is_business_director() or exists(select 1 from public.profiles p where p.id=v_actor and (p.role in ('owner','admin') or p.extra_roles&&array['owner','admin'])) into v_manager;
 if trim(coalesce(p_title,''))='' then raise exception 'title required'; end if;
 if p_recurrence not in ('daily','weekly','monthly') then raise exception 'invalid recurrence'; end if;
 if p_assignee_id is distinct from v_actor and not v_manager then raise exception 'manager permission required'; end if;
 if p_assignee_id is null and not v_manager then raise exception 'assignee required'; end if;
 -- Chỉ Quản lý mới được gán điểm KPI (checklist cá nhân tự thêm — source
 -- 'personal' — không được tự thưởng điểm cho mình).
 if p_kpi_diem is distinct from 0 and not v_manager then p_kpi_diem := 0; end if;
 insert into public.task_templates(title,description,station,assignee_id,recurrence,weekdays,day_of_month,scheduled_time,remind_minutes,source,locked,created_by,kpi_diem)
 values(trim(p_title),nullif(trim(coalesce(p_description,'')),''),nullif(p_station,''),p_assignee_id,p_recurrence,coalesce(p_weekdays,'{}'),p_day_of_month,p_scheduled_time,
  greatest(0,least(coalesce(p_remind_minutes,15),1440)),case when p_assignee_id=v_actor and not v_manager then 'personal' else 'manager' end,
  not(p_assignee_id=v_actor and not v_manager),v_actor,coalesce(p_kpi_diem,0)) returning id into v_id;
 return v_id;
end $$;

revoke all on function public.create_recurring_todo(text,text,uuid,text,text,smallint[],smallint,time,integer,integer) from public,anon;
grant execute on function public.create_recurring_todo(text,text,uuid,text,text,smallint[],smallint,time,integer,integer) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Xác nhận checklist + ghi điểm KPI — thay cho việc UPDATE thẳng bảng
--    task_completions ở phía client (queries.js confirmTaskCompletion cũ).
--    Idempotent: xác nhận 2 lần không cộng điểm 2 lần.
-- ---------------------------------------------------------------------------
create or replace function public.sumi_xac_nhan_checklist(p_completion_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_actor uuid := auth.uid();
  v_manager boolean;
  v_row record;
begin
  if v_actor is null or not public.is_approved() then
    return jsonb_build_object('thanh_cong', false, 'thong_bao', 'Chưa đăng nhập.');
  end if;
  select public.is_business_director() or exists(select 1 from public.profiles p where p.id=v_actor and (p.role in ('owner','admin') or p.extra_roles&&array['owner','admin'])) into v_manager;
  if not v_manager then
    return jsonb_build_object('thanh_cong', false, 'thong_bao', 'Chỉ Quản lý/Giám đốc mới xác nhận được checklist.');
  end if;

  select tc.id, tc.completed_at, tc.confirmed_at, tc.staff_id, tt.kpi_diem, tt.title,
         coalesce(p.full_name, '?') as staff_name
  into v_row
  from public.task_completions tc
  join public.task_templates tt on tt.id = tc.template_id
  left join public.profiles p on p.id = tc.staff_id
  where tc.id = p_completion_id
  for update of tc;

  if v_row.id is null then
    return jsonb_build_object('thanh_cong', false, 'thong_bao', 'Không tìm thấy lượt hoàn thành checklist.');
  end if;
  if v_row.completed_at is null then
    return jsonb_build_object('thanh_cong', false, 'thong_bao', 'Việc này chưa được nhân viên tick hoàn thành.');
  end if;
  if v_row.confirmed_at is not null then
    return jsonb_build_object('thanh_cong', true, 'thong_bao', 'Đã xác nhận trước đó rồi.');
  end if;

  update public.task_completions set confirmed_by = v_actor, confirmed_at = now() where id = p_completion_id;

  if coalesce(v_row.kpi_diem, 0) <> 0 then
    insert into public.task_kpi_logs(task_id, staff_id, staff_name, su_kien, diem, ly_do, approved_by)
    values (null, v_row.staff_id, v_row.staff_name, 'hoan_thanh', v_row.kpi_diem,
            'Checklist: ' || v_row.title, v_actor);
  end if;

  return jsonb_build_object('thanh_cong', true, 'thong_bao', 'Đã xác nhận.');
end;
$fn$;

revoke all on function public.sumi_xac_nhan_checklist(uuid) from public, anon;
grant execute on function public.sumi_xac_nhan_checklist(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Trừ điểm tự động cho checklist áp dụng hôm nay mà KHÔNG được tick —
--    chạy qua pg_cron mỗi tối 23:55 giờ VN (16:55 UTC), tái dùng đúng cách
--    tính "applicable" của process_task_reminders (202608230027) để không
--    lệch logic. Idempotent qua unique(template_id,staff_id,date) của
--    task_completions — chạy lại trong cùng ngày không trừ điểm 2 lần, và
--    nếu nhân viên tick sau giờ trừ điểm thì KHÔNG tự cộng lại điểm đã trừ
--    (chấp nhận có mốc giờ cắt, giống mọi hệ thống chấm công có giờ chốt).
-- ---------------------------------------------------------------------------
create or replace function public.sumi_tinh_diem_tru_checklist_ngay()
returns integer language plpgsql security definer set search_path = public as $fn$
declare
  v_ngay date := (now() at time zone 'Asia/Bangkok')::date;
  v_dow int := extract(dow from (now() at time zone 'Asia/Bangkok'));
  v_so int := 0;
begin
  with ap as (
    select tt.id as template_id, tt.title, tt.kpi_diem, p.id as staff_id, p.full_name as staff_name
    from public.task_templates tt
    join public.profiles p on p.approved and p.active is not false
      and (tt.assignee_id = p.id or (tt.assignee_id is null and (tt.station is null or tt.station = p.station)))
    where tt.active
      and (tt.recurrence = 'daily'
        or (tt.recurrence = 'weekly' and v_dow::smallint = any(tt.weekdays))
        or (tt.recurrence = 'monthly' and tt.day_of_month = extract(day from v_ngay)))
      and coalesce(tt.kpi_diem, 0) <> 0
  ),
  moi_thieu as (
    insert into public.task_completions(template_id, staff_id, date, completed_at)
    select ap.template_id, ap.staff_id, v_ngay, null
    from ap
    where not exists (
      select 1 from public.task_completions tc
      where tc.template_id = ap.template_id and tc.staff_id = ap.staff_id and tc.date = v_ngay
    )
    on conflict (template_id, staff_id, date) do nothing
    returning template_id, staff_id
  )
  insert into public.task_kpi_logs(task_id, staff_id, staff_name, su_kien, diem, ly_do)
  select null, ap.staff_id, ap.staff_name, 'hoan_thanh', -ap.kpi_diem,
         'Thiếu checklist: ' || ap.title || ' (' || to_char(v_ngay, 'DD/MM/YYYY') || ')'
  from moi_thieu join ap on ap.template_id = moi_thieu.template_id and ap.staff_id = moi_thieu.staff_id;

  get diagnostics v_so = row_count;
  return v_so;
end;
$fn$;

revoke all on function public.sumi_tinh_diem_tru_checklist_ngay() from public, anon, authenticated;

create extension if not exists pg_cron with schema extensions;
do $$ begin
  if not exists (select 1 from cron.job where jobname = 'sumi-checklist-phat-thieu-hang-ngay') then
    perform cron.schedule('sumi-checklist-phat-thieu-hang-ngay', '55 16 * * *', 'select public.sumi_tinh_diem_tru_checklist_ngay()');
  end if;
end $$;

insert into public.migration_runs(migration_key, status, finished_at, notes)
values('202609031600_diem_kpi_checklist_hang_ngay', 'completed', now(),
  'Nối checklist hàng ngày vào task_kpi_logs (su_kien=hoan_thanh) — cộng điểm lúc Quản lý xác nhận qua sumi_xac_nhan_checklist(), trừ điểm tự động mỗi tối 23:55 VN qua cron sumi-checklist-phat-thieu-hang-ngay cho việc áp dụng mà không tick. Không sửa sumi_chot_kpi_thang() — nó tự nhặt số này vì cùng SUM(diem) where su_kien=hoan_thanh.')
on conflict(migration_key) do update set status='completed', finished_at=now(), notes=excluded.notes;

commit;
