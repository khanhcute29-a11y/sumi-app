-- SUMI APP M15 — scoped task assignment and start commands.
begin;
create or replace function public.assign_package_task(p_idempotency_key text,p_package_id uuid,p_assignee_id uuid,
 p_title text,p_description text,p_deadline timestamptz,p_required_proof_types text[] default '{}')
returns uuid language plpgsql security definer set search_path=public as $$
declare v_actor uuid:=auth.uid();v_unit uuid;v_order uuid;v_task uuid;v_conf text;
begin
 select unit_id,order_id into v_unit,v_order from public.order_work_packages where id=p_package_id for update;
 if v_unit is null then raise exception 'package not found'; end if;
 if not public.is_business_director() and not exists(select 1 from public.profile_assignments where profile_id=v_actor and unit_id=v_unit
  and position_code in ('kitchen_lead','kitchen_deputy') and valid_to is null) then raise exception 'task assignment permission required'; end if;
 if not exists(select 1 from public.profiles p where p.id=p_assignee_id and p.approved and p.active) then raise exception 'assignee is inactive'; end if;
 if not exists(select 1 from public.profile_assignments where profile_id=p_assignee_id and unit_id=v_unit and valid_to is null)
  and not exists(select 1 from public.permission_grants pg where pg.profile_id=p_assignee_id and pg.permission_code='cross_duty'
   and pg.revoked_at is null and pg.valid_from<=now() and (pg.valid_to is null or pg.valid_to>now())
   and (pg.scope_type='global' or (pg.scope_type='unit' and pg.scope_id=v_unit)))
 then raise exception 'director must grant cross-duty permission'; end if;
 select result_entity_id into v_task from public.command_idempotency where idempotency_key=p_idempotency_key and actor_id=v_actor;
 if v_task is not null then return v_task; end if;
 insert into public.tasks(category,title,description,assignee_id,deadline,status,created_by,work_package_id,required_proof_types,version)
 values('order_work',p_title,p_description,p_assignee_id,p_deadline,'open',v_actor,p_package_id,coalesce(p_required_proof_types,'{}'),1) returning id into v_task;
 update public.order_work_packages set status=case when status='accepted' then 'in_progress' else status end,version=version+1 where id=p_package_id;
 select confidentiality into v_conf from public.orders where id=v_order;
 insert into public.domain_events(event_type,entity_type,entity_id,actor_id,payload,idempotency_key,confidentiality)
 values('task_assigned','order',v_order,v_actor,jsonb_build_object('task_id',v_task,'assignee_id',p_assignee_id,'work_package_id',p_package_id),p_idempotency_key||':event',v_conf);
 insert into public.notifications(event_key,recipient_profile_id,notification_type,sound_key,title,body,entity_type,entity_id,deep_link)
 values(p_idempotency_key||':notify',p_assignee_id,'task_assigned','ting','Bạn có việc mới',p_title,'task',v_task,'/tasks/'||v_task);
 insert into public.command_idempotency values(p_idempotency_key,'assign_package_task',v_actor,v_task,now());
 return v_task;
end $$;

create or replace function public.start_task_v2(p_idempotency_key text,p_task_id uuid,p_expected_version integer)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_actor uuid:=auth.uid();v_task public.tasks%rowtype;
begin
 select * into v_task from public.tasks where id=p_task_id for update;
 if v_task.assignee_id<>v_actor then raise exception 'task is not assigned to caller'; end if;
 if v_task.version<>p_expected_version then raise exception 'task version conflict'; end if;
 if v_task.started_at is null then update public.tasks set started_at=now(),version=version+1 where id=p_task_id; end if;
 insert into public.domain_events(event_type,entity_type,entity_id,actor_id,payload,idempotency_key)
 values('task_started','task',p_task_id,v_actor,jsonb_build_object('work_package_id',v_task.work_package_id),p_idempotency_key||':event')
 on conflict(idempotency_key) do nothing;
 return p_task_id;
end $$;
revoke all on function public.assign_package_task(text,uuid,uuid,text,text,timestamptz,text[]) from public,anon;
revoke all on function public.start_task_v2(text,uuid,integer) from public,anon;
grant execute on function public.assign_package_task(text,uuid,uuid,text,text,timestamptz,text[]) to authenticated;
grant execute on function public.start_task_v2(text,uuid,integer) to authenticated;
insert into public.migration_runs(migration_key,status,finished_at,notes) values
('202608220015_task_assignment_start_rpcs','completed',now(),'Added scoped task assignment, cross-duty enforcement and task start command.')
on conflict(migration_key) do update set status='completed',finished_at=now(),notes=excluded.notes;
commit;
