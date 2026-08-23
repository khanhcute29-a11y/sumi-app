-- SUMI APP M27 â€” recurring personal/managed to-do lists and secured task commands.
begin;

alter table public.task_templates add column if not exists assignee_id uuid references public.profiles(id) on delete cascade;
alter table public.task_templates add column if not exists description text;
alter table public.task_templates add column if not exists recurrence text not null default 'daily';
alter table public.task_templates add column if not exists weekdays smallint[] not null default '{}';
alter table public.task_templates add column if not exists day_of_month smallint;
alter table public.task_templates add column if not exists scheduled_time time;
alter table public.task_templates add column if not exists remind_minutes integer not null default 15;
alter table public.task_templates add column if not exists source text not null default 'manager';
alter table public.task_templates add column if not exists locked boolean not null default true;
alter table public.task_templates drop constraint if exists task_templates_recurrence_check;
alter table public.task_templates add constraint task_templates_recurrence_check check(recurrence in ('daily','weekly','monthly'));
alter table public.task_templates drop constraint if exists task_templates_source_check;
alter table public.task_templates add constraint task_templates_source_check check(source in ('personal','manager'));
create index if not exists idx_task_templates_assignee_active on public.task_templates(assignee_id,active);

alter table public.tasks add column if not exists reminder_at timestamptz;
alter table public.tasks drop constraint if exists tasks_category_check;
alter table public.tasks add constraint tasks_category_check check(category in ('assigned','adhoc','order_work'));

create or replace function public.create_recurring_todo(
 p_title text,p_description text,p_assignee_id uuid,p_station text,p_recurrence text,
 p_weekdays smallint[],p_day_of_month smallint,p_scheduled_time time,p_remind_minutes integer
) returns uuid language plpgsql security definer set search_path=public as $$
declare v_actor uuid:=auth.uid();v_id uuid;v_manager boolean;
begin
 if v_actor is null or not public.is_approved() then raise exception 'not authorized'; end if;
 select public.is_business_director() or exists(select 1 from public.profiles p where p.id=v_actor and (p.role in ('owner','admin') or p.extra_roles&&array['owner','admin'])) into v_manager;
 if trim(coalesce(p_title,''))='' then raise exception 'title required'; end if;
 if p_recurrence not in ('daily','weekly','monthly') then raise exception 'invalid recurrence'; end if;
 if p_assignee_id is distinct from v_actor and not v_manager then raise exception 'manager permission required'; end if;
 if p_assignee_id is null and not v_manager then raise exception 'assignee required'; end if;
 insert into public.task_templates(title,description,station,assignee_id,recurrence,weekdays,day_of_month,scheduled_time,remind_minutes,source,locked,created_by)
 values(trim(p_title),nullif(trim(coalesce(p_description,'')),''),nullif(p_station,''),p_assignee_id,p_recurrence,coalesce(p_weekdays,'{}'),p_day_of_month,p_scheduled_time,
  greatest(0,least(coalesce(p_remind_minutes,15),1440)),case when p_assignee_id=v_actor and not v_manager then 'personal' else 'manager' end,
  not(p_assignee_id=v_actor and not v_manager),v_actor) returning id into v_id;
 return v_id;
end $$;

create or replace function public.delete_recurring_todo(p_template_id uuid)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_actor uuid:=auth.uid();v_row public.task_templates%rowtype;v_manager boolean;
begin
 select * into v_row from public.task_templates where id=p_template_id for update;
 if v_row.id is null then raise exception 'todo not found'; end if;
 select public.is_business_director() or exists(select 1 from public.profiles p where p.id=v_actor and (p.role in ('owner','admin') or p.extra_roles&&array['owner','admin'])) into v_manager;
 if not v_manager and not(v_row.source='personal' and v_row.created_by=v_actor and v_row.assignee_id=v_actor) then raise exception 'managed todo cannot be deleted'; end if;
 update public.task_templates set active=false where id=p_template_id;
 return p_template_id;
end $$;

create or replace function public.set_daily_todo_completion(p_template_id uuid,p_date date,p_completed boolean)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_actor uuid:=auth.uid();v_id uuid;
begin
 if v_actor is null or not public.is_approved() then raise exception 'not authorized'; end if;
 if not exists(select 1 from public.task_templates t where t.id=p_template_id and t.active and (t.assignee_id is null or t.assignee_id=v_actor)) then raise exception 'todo is not assigned to caller'; end if;
 insert into public.task_completions(template_id,staff_id,date,completed_at)
 values(p_template_id,v_actor,coalesce(p_date,current_date),case when p_completed then now() else null end)
 on conflict(template_id,staff_id,date) do update set completed_at=excluded.completed_at,confirmed_at=null,confirmed_by=null
 returning id into v_id;
 return v_id;
end $$;

create or replace function public.create_general_task(
 p_category text,p_title text,p_description text,p_order_code text,p_assignee_id uuid,p_deadline timestamptz,p_reminder_at timestamptz
) returns uuid language plpgsql security definer set search_path=public as $$
declare v_actor uuid:=auth.uid();v_id uuid;v_manager boolean;
begin
 if v_actor is null or not public.is_approved() then raise exception 'not authorized'; end if;
 select public.is_business_director() or exists(select 1 from public.profiles p where p.id=v_actor and (p.role in ('owner','admin') or p.extra_roles&&array['owner','admin'])) into v_manager;
 if p_category not in ('assigned','adhoc') then raise exception 'invalid category'; end if;
 if trim(coalesce(p_title,''))='' then raise exception 'title required'; end if;
 if p_category='adhoc' and p_assignee_id<>v_actor then raise exception 'personal task must belong to caller'; end if;
 if p_category='assigned' and not v_manager then raise exception 'manager permission required'; end if;
 insert into public.tasks(category,title,description,order_code,assignee_id,deadline,reminder_at,status,created_by,version)
 values(p_category,trim(p_title),nullif(trim(coalesce(p_description,'')),''),nullif(trim(coalesce(p_order_code,'')),''),p_assignee_id,p_deadline,p_reminder_at,'open',v_actor,1)
 returning id into v_id;
 if p_category='assigned' then
  insert into public.notifications(event_key,recipient_profile_id,notification_type,sound_key,title,body,entity_type,entity_id,deep_link)
  values('general-task:'||v_id,p_assignee_id,'task_assigned','ting','Báº¡n cÃ³ viá»‡c má»›i',p_title,'task',v_id,'/tasks/'||v_id)
  on conflict(event_key) do nothing;
 end if;
 return v_id;
end $$;

create or replace function public.delete_personal_task(p_task_id uuid)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_actor uuid:=auth.uid();v_row public.tasks%rowtype;v_manager boolean;
begin
 select * into v_row from public.tasks where id=p_task_id for update;
 if v_row.id is null then raise exception 'task not found'; end if;
 select public.is_business_director() or exists(select 1 from public.profiles p where p.id=v_actor and (p.role in ('owner','admin') or p.extra_roles&&array['owner','admin'])) into v_manager;
 if not v_manager and not(v_row.category='adhoc' and v_row.created_by=v_actor and v_row.assignee_id=v_actor and v_row.work_package_id is null) then raise exception 'assigned task cannot be deleted'; end if;
 delete from public.tasks where id=p_task_id;
 return p_task_id;
end $$;

create or replace function public.process_task_reminders()
returns integer language plpgsql security definer set search_path=public as $$
declare v_count integer:=0;v_added integer:=0;v_today date:=(now() at time zone 'Asia/Bangkok')::date;v_dow integer:=extract(dow from (now() at time zone 'Asia/Bangkok'));
begin
 insert into public.notifications(event_key,recipient_profile_id,notification_type,sound_key,title,body,entity_type,entity_id,deep_link)
 select 'task-reminder:'||t.id,t.assignee_id,'task_reminder','ting','Äáº¿n giá» lÃ m viá»‡c',t.title,'task',t.id,'/tasks/'||t.id
 from public.tasks t where t.status='open' and t.reminder_at is not null and t.reminder_at<=now()
 on conflict(event_key) do nothing;
 get diagnostics v_count=row_count;
 insert into public.notifications(event_key,recipient_profile_id,notification_type,sound_key,title,body,entity_type,entity_id,deep_link)
 select 'todo-reminder:'||tt.id||':'||p.id||':'||v_today,p.id,'task_reminder','ting','Checklist cáº§n lÃ m',tt.title,'task_template',tt.id,'/tasks'
 from public.task_templates tt join public.profiles p on p.approved and p.active
  and (tt.assignee_id=p.id or (tt.assignee_id is null and (tt.station is null or tt.station=p.station)))
 where tt.active and tt.scheduled_time is not null
  and ((v_today+tt.scheduled_time) at time zone 'Asia/Bangkok')-make_interval(mins=>tt.remind_minutes)<=now()
  and (tt.recurrence='daily' or (tt.recurrence='weekly' and v_dow::smallint=any(tt.weekdays)) or (tt.recurrence='monthly' and tt.day_of_month=extract(day from v_today)))
  and not exists(select 1 from public.task_completions tc where tc.template_id=tt.id and tc.staff_id=p.id and tc.date=v_today and tc.completed_at is not null)
 on conflict(event_key) do nothing;
 get diagnostics v_added=row_count;
 v_count:=v_count+v_added;
 return v_count;
end $$;

create extension if not exists pg_cron with schema extensions;
do $$ begin
 if not exists(select 1 from cron.job where jobname='sumi-task-reminders-every-minute') then
  perform cron.schedule('sumi-task-reminders-every-minute','* * * * *','select public.process_task_reminders()');
 end if;
end $$;

revoke all on function public.create_recurring_todo(text,text,uuid,text,text,smallint[],smallint,time,integer) from public,anon;
revoke all on function public.delete_recurring_todo(uuid) from public,anon;
revoke all on function public.set_daily_todo_completion(uuid,date,boolean) from public,anon;
revoke all on function public.create_general_task(text,text,text,text,uuid,timestamptz,timestamptz) from public,anon;
revoke all on function public.delete_personal_task(uuid) from public,anon;
grant execute on function public.create_recurring_todo(text,text,uuid,text,text,smallint[],smallint,time,integer) to authenticated;
grant execute on function public.delete_recurring_todo(uuid) to authenticated;
grant execute on function public.set_daily_todo_completion(uuid,date,boolean) to authenticated;
grant execute on function public.create_general_task(text,text,text,text,uuid,timestamptz,timestamptz) to authenticated;
grant execute on function public.delete_personal_task(uuid) to authenticated;
revoke all on function public.process_task_reminders() from public,anon,authenticated;

insert into public.migration_runs(migration_key,status,finished_at,notes)
values('202608230027_recurring_todo_tasks','completed',now(),'Added recurring personal/managed to-do lists and secured task creation/deletion commands.')
on conflict(migration_key) do update set status='completed',finished_at=now(),notes=excluded.notes;
commit;

