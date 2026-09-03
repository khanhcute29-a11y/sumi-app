-- Fix bug: Bếp trưởng (role='kitchen_lead') và Phó Giám đốc Xưởng 41/42
-- (deputy_director_x41/x42) bấm "Giao Việc Mới" bị chặn "manager permission
-- required" — vì create_general_task() (và 3 hàm anh em cùng file
-- 202608230027) chỉ công nhận role in ('owner','admin') là "quản lý", không
-- hề biết tới các vai trò quản lý theo xưởng này.
--
-- KHÔNG xoá role 'kitchen_lead'/'bakery' khỏi DB như đề xuất ban đầu — đó là
-- giá trị role THẬT đang gán cho 1 Bếp trưởng + 9 nhân viên bakery đang làm
-- việc, xoá sẽ khoá tài khoản của họ ngay lập tức. "Bếp Trưởng Bếp Lạnh" chỉ
-- là tên hiển thị suy ra từ role+station ở phía client (roles.js), không
-- phải giá trị DB riêng.
--
-- Cũng KHÔNG dùng organization_units/profile_assignments (sơ đồ tổ chức) —
-- 2 bảng đó đang HOÀN TOÀN RỖNG (chưa ai gán ai vào đó), dùng sẽ luôn trả về
-- false cho tất cả mọi người.
--
-- Phạm vi quản lý đã xác nhận với Giám đốc: CHỈ nhân sự CÙNG station (không
-- mở rộng ra cả nhóm Bakery lanh+nong+x41+x42).
begin;
set local lock_timeout = '10s';
set local statement_timeout = '60s';

-- ---------------------------------------------------------------------------
-- 1. Hàm quyền dùng chung — quản lý theo xưởng (kitchen_lead/phó GĐ xưởng)
--    HOẶC Giám đốc/Admin toàn quyền (is_business_director()).
-- ---------------------------------------------------------------------------
create or replace function public.la_quan_ly_cua_ho_so(p_target uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_business_director() or exists(
    select 1
    from public.profiles caller
    join public.profiles target on target.id = p_target
    where caller.id = auth.uid()
      and caller.approved = true
      and coalesce(caller.active, true) = true
      and caller.role in ('kitchen_lead', 'deputy_director_x41', 'deputy_director_x42')
      and caller.station is not null
      and caller.station = target.station
  );
$$;

create or replace function public.la_quan_ly_cua_khau(p_station text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_business_director() or (
    p_station is not null and exists(
      select 1 from public.profiles caller
      where caller.id = auth.uid()
        and caller.approved = true
        and coalesce(caller.active, true) = true
        and caller.role in ('kitchen_lead', 'deputy_director_x41', 'deputy_director_x42')
        and caller.station = p_station
    )
  );
$$;

revoke all on function public.la_quan_ly_cua_ho_so(uuid) from public, anon;
revoke all on function public.la_quan_ly_cua_khau(text) from public, anon;
grant execute on function public.la_quan_ly_cua_ho_so(uuid) to authenticated;
grant execute on function public.la_quan_ly_cua_khau(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. create_general_task — RPC đứng sau màn "Giao Việc Mới". v_manager giờ
--    tính theo ĐÚNG người được giao (p_assignee_id), không phải role chung
--    chung như trước.
-- ---------------------------------------------------------------------------
create or replace function public.create_general_task(
 p_category text,p_title text,p_description text,p_order_code text,p_assignee_id uuid,p_deadline timestamptz,p_reminder_at timestamptz
) returns uuid language plpgsql security definer set search_path=public as $$
declare v_actor uuid:=auth.uid();v_id uuid;v_manager boolean;
begin
 if v_actor is null or not public.is_approved() then raise exception 'not authorized'; end if;
 select public.la_quan_ly_cua_ho_so(p_assignee_id) into v_manager;
 if p_category not in ('assigned','adhoc') then raise exception 'invalid category'; end if;
 if trim(coalesce(p_title,''))='' then raise exception 'title required'; end if;
 if p_category='adhoc' and p_assignee_id<>v_actor then raise exception 'personal task must belong to caller'; end if;
 if p_category='assigned' and not v_manager then raise exception 'manager permission required'; end if;
 insert into public.tasks(category,title,description,order_code,assignee_id,deadline,reminder_at,status,created_by,version)
 values(p_category,trim(p_title),nullif(trim(coalesce(p_description,'')),''),nullif(trim(coalesce(p_order_code,'')),''),p_assignee_id,p_deadline,p_reminder_at,'open',v_actor,1)
 returning id into v_id;
 if p_category='assigned' then
  insert into public.notifications(event_key,recipient_profile_id,notification_type,sound_key,title,body,entity_type,entity_id,deep_link)
  values('general-task:'||v_id,p_assignee_id,'task_assigned','ting','Bạn có việc mới',p_title,'task',v_id,'/tasks/'||v_id)
  on conflict(event_key) do nothing;
 end if;
 return v_id;
end $$;

-- ---------------------------------------------------------------------------
-- 3. delete_personal_task — quyền xoá việc assigned tính theo đúng người
--    đang được giao việc đó (v_row.assignee_id), không phải role chung.
-- ---------------------------------------------------------------------------
create or replace function public.delete_personal_task(p_task_id uuid)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_actor uuid:=auth.uid();v_row public.tasks%rowtype;v_manager boolean;
begin
 select * into v_row from public.tasks where id=p_task_id for update;
 if v_row.id is null then raise exception 'task not found'; end if;
 select public.la_quan_ly_cua_ho_so(v_row.assignee_id) into v_manager;
 if not v_manager and not(v_row.category='adhoc' and v_row.created_by=v_actor and v_row.assignee_id=v_actor and v_row.work_package_id is null) then raise exception 'assigned task cannot be deleted'; end if;
 delete from public.tasks where id=p_task_id;
 return p_task_id;
end $$;

-- ---------------------------------------------------------------------------
-- 4. create_recurring_todo — checklist hàng ngày. v_manager giữ nghĩa "có
--    phải quản lý nói chung không" (dùng để phân loại source/locked như cũ),
--    còn quyền giao cho người/khâu cụ thể tách riêng ra kiểm tra bên dưới.
-- ---------------------------------------------------------------------------
create or replace function public.create_recurring_todo(
 p_title text,p_description text,p_assignee_id uuid,p_station text,p_recurrence text,
 p_weekdays smallint[],p_day_of_month smallint,p_scheduled_time time,p_remind_minutes integer,
 p_kpi_diem integer default 0
) returns uuid language plpgsql security definer set search_path=public as $$
declare v_actor uuid:=auth.uid();v_id uuid;v_manager boolean;
begin
 if v_actor is null or not public.is_approved() then raise exception 'not authorized'; end if;
 select public.is_business_director() or exists(
   select 1 from public.profiles p where p.id=v_actor
     and p.role in ('kitchen_lead','deputy_director_x41','deputy_director_x42')
     and p.station is not null
 ) into v_manager;
 if trim(coalesce(p_title,''))='' then raise exception 'title required'; end if;
 if p_recurrence not in ('daily','weekly','monthly') then raise exception 'invalid recurrence'; end if;
 if p_assignee_id is distinct from v_actor then
   if p_assignee_id is null then
     if not public.la_quan_ly_cua_khau(p_station) then raise exception 'manager permission required'; end if;
   else
     if not public.la_quan_ly_cua_ho_so(p_assignee_id) then raise exception 'manager permission required'; end if;
   end if;
 end if;
 if p_assignee_id is null and not v_manager then raise exception 'assignee required'; end if;
 if p_kpi_diem is distinct from 0 and not v_manager then p_kpi_diem := 0; end if;
 insert into public.task_templates(title,description,station,assignee_id,recurrence,weekdays,day_of_month,scheduled_time,remind_minutes,source,locked,created_by,kpi_diem)
 values(trim(p_title),nullif(trim(coalesce(p_description,'')),''),nullif(p_station,''),p_assignee_id,p_recurrence,coalesce(p_weekdays,'{}'),p_day_of_month,p_scheduled_time,
  greatest(0,least(coalesce(p_remind_minutes,15),1440)),case when p_assignee_id=v_actor and not v_manager then 'personal' else 'manager' end,
  not(p_assignee_id=v_actor and not v_manager),v_actor,coalesce(p_kpi_diem,0)) returning id into v_id;
 return v_id;
end $$;

-- ---------------------------------------------------------------------------
-- 5. delete_recurring_todo — quyền xoá checklist tính theo đúng người/khâu
--    của template đó.
-- ---------------------------------------------------------------------------
create or replace function public.delete_recurring_todo(p_template_id uuid)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_actor uuid:=auth.uid();v_row public.task_templates%rowtype;v_manager boolean;
begin
 select * into v_row from public.task_templates where id=p_template_id for update;
 if v_row.id is null then raise exception 'todo not found'; end if;
 if v_row.assignee_id is not null then
   select public.la_quan_ly_cua_ho_so(v_row.assignee_id) into v_manager;
 else
   select public.la_quan_ly_cua_khau(v_row.station) into v_manager;
 end if;
 if not v_manager and not(v_row.source='personal' and v_row.created_by=v_actor and v_row.assignee_id=v_actor) then raise exception 'managed todo cannot be deleted'; end if;
 update public.task_templates set active=false where id=p_template_id;
 return p_template_id;
end $$;

insert into public.migration_runs(migration_key, status, finished_at, notes)
values('202609040900_bep_truong_giao_viec_theo_station', 'completed', now(),
  'Fix "manager permission required" chặn nhầm Bếp trưởng/Phó GĐ xưởng khi giao việc — thêm la_quan_ly_cua_ho_so()/la_quan_ly_cua_khau() (quản lý = cùng station), áp vào create_general_task/delete_personal_task/create_recurring_todo/delete_recurring_todo. KHÔNG xoá role kitchen_lead/bakery (đang gán cho 10 nhân sự thật).')
on conflict(migration_key) do update set status='completed', finished_at=now(), notes=excluded.notes;

commit;
