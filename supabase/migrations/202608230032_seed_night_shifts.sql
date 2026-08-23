begin;
insert into public.shift_configs(label,branch,start_time,end_time,wage_per_shift)
select 'Ca Tối ',b.branch,'21:30','05:30',0 from (values('Quốc lộ 13'),('Vĩnh Phú 42')) b(branch)
where not exists(select 1 from public.shift_configs s where s.branch=b.branch and lower(s.label) like '%tối%');
insert into public.migration_runs(migration_key,status,finished_at,notes) values('202608230032_seed_night_shifts','completed',now(),'Added configurable night shift frame for both operating branches.') on conflict(migration_key) do update set status='completed',finished_at=now(),notes=excluded.notes;
commit;
