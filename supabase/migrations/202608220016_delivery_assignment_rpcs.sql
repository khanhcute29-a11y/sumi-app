-- SUMI APP M16 — director/transport assignment and driver run commands.
begin;
create or replace function public.create_delivery_run_v2(p_idempotency_key text,p_driver_id uuid,p_order_ids uuid[],p_planned_distance_km numeric default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_actor uuid:=auth.uid();v_run uuid;v_order uuid;v_seq int:=0;
begin
 if not public.is_business_director() and not exists(select 1 from public.profile_assignments pa join public.organization_units ou on ou.id=pa.unit_id
  where pa.profile_id=v_actor and ou.code='TRANSPORT_LEAD' and pa.valid_to is null) then raise exception 'delivery assignment permission required'; end if;
 if not exists(select 1 from public.profiles where id=p_driver_id and approved and active) then raise exception 'driver inactive'; end if;
 select result_entity_id into v_run from public.command_idempotency where idempotency_key=p_idempotency_key and actor_id=v_actor;
 if v_run is not null then return v_run; end if;
 if exists(select 1 from public.orders where id=any(p_order_ids) and status_v2<>'ready_for_fulfillment' and not allow_partial_fulfillment)
 then raise exception 'order is not ready for delivery'; end if;
 insert into public.delivery_runs(run_code,assigned_driver_id,assigned_by,status,planned_distance_km,distance_source)
 values('RUN-'||to_char(now(),'YYMMDD-HH24MI')||'-'||upper(substr(md5(p_idempotency_key),1,4)),p_driver_id,v_actor,'planned',p_planned_distance_km,
  case when p_planned_distance_km is null then null else 'planned' end) returning id into v_run;
 foreach v_order in array p_order_ids loop v_seq:=v_seq+1;
  insert into public.delivery_stops(delivery_run_id,order_id,sequence_no,status,destination_address,destination_lat,destination_lng)
  select v_run,id,v_seq,'pending',address,delivery_lat,delivery_lng from public.orders where id=v_order;
  update public.orders set status_v2='ready_for_fulfillment',version=version+1 where id=v_order;
  insert into public.domain_events(event_type,entity_type,entity_id,actor_id,payload,idempotency_key,confidentiality)
  select 'delivery_assigned','order',id,v_actor,jsonb_build_object('delivery_run_id',v_run,'driver_id',p_driver_id),p_idempotency_key||':event:'||id,confidentiality from public.orders where id=v_order;
 end loop;
 insert into public.notifications(event_key,recipient_profile_id,notification_type,sound_key,title,body,entity_type,entity_id,deep_link)
 values(p_idempotency_key||':notify',p_driver_id,'delivery_assigned','ting','Bạn có chuyến giao mới',v_seq||' điểm giao','delivery_run',v_run,'/shipping/'||v_run);
 insert into public.command_idempotency values(p_idempotency_key,'create_delivery_run_v2',v_actor,v_run,now());return v_run;
end $$;
create or replace function public.accept_delivery_run_v2(p_idempotency_key text,p_run_id uuid,p_expected_version integer)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_actor uuid:=auth.uid();v_run public.delivery_runs%rowtype;
begin select * into v_run from public.delivery_runs where id=p_run_id for update;
 if v_run.assigned_driver_id<>v_actor then raise exception 'run is not assigned to caller'; end if;
 if v_run.version<>p_expected_version then raise exception 'run version conflict'; end if;
 update public.delivery_runs set status='accepted',version=version+1 where id=p_run_id;
 return p_run_id;end $$;
create or replace function public.start_delivery_run_v2(p_idempotency_key text,p_run_id uuid,p_expected_version integer,p_lat numeric,p_lng numeric)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_actor uuid:=auth.uid();v_run public.delivery_runs%rowtype;
begin select * into v_run from public.delivery_runs where id=p_run_id for update;
 if v_run.assigned_driver_id<>v_actor or v_run.status<>'accepted' then raise exception 'run cannot be started'; end if;
 if v_run.version<>p_expected_version then raise exception 'run version conflict'; end if;
 update public.delivery_runs set status='in_transit',started_at=now(),start_lat=p_lat,start_lng=p_lng,version=version+1 where id=p_run_id;
 update public.orders set status='dang_giao',status_v2='in_delivery',version=version+1 where id in(select order_id from public.delivery_stops where delivery_run_id=p_run_id);
 return p_run_id;end $$;
revoke all on function public.create_delivery_run_v2(text,uuid,uuid[],numeric) from public,anon;
revoke all on function public.accept_delivery_run_v2(text,uuid,integer) from public,anon;
revoke all on function public.start_delivery_run_v2(text,uuid,integer,numeric,numeric) from public,anon;
grant execute on function public.create_delivery_run_v2(text,uuid,uuid[],numeric) to authenticated;
grant execute on function public.accept_delivery_run_v2(text,uuid,integer) to authenticated;
grant execute on function public.start_delivery_run_v2(text,uuid,integer,numeric,numeric) to authenticated;
insert into public.migration_runs(migration_key,status,finished_at,notes) values('202608220016_delivery_assignment_rpcs','completed',now(),'Added guarded delivery assignment, acceptance and GPS start commands.')
on conflict(migration_key) do update set status='completed',finished_at=now(),notes=excluded.notes;commit;
