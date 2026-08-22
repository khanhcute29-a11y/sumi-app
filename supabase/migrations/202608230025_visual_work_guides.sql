-- SUMI APP M25 — Hướng dẫn công việc bằng hình ảnh, âm thanh và ảnh kết quả.
begin;

create table if not exists public.visual_work_guides(
 id uuid primary key default gen_random_uuid(),
 title text not null,
 summary text,
 category text not null default 'general',
 audience_roles text[] not null default '{}',
 cover_storage_path text,
 active boolean not null default true,
 version integer not null default 1 check(version > 0),
 created_by uuid not null references public.profiles(id),
 updated_by uuid references public.profiles(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 deleted_at timestamptz
);

create table if not exists public.visual_work_guide_steps(
 id uuid primary key default gen_random_uuid(),
 guide_id uuid not null references public.visual_work_guides(id) on delete cascade,
 step_order integer not null check(step_order > 0),
 title text not null,
 instruction text not null,
 image_storage_path text,
 warning_text text,
 created_at timestamptz not null default now(),
 unique(guide_id, step_order)
);

create table if not exists public.visual_work_guide_progress(
 guide_id uuid not null references public.visual_work_guides(id) on delete cascade,
 profile_id uuid not null references public.profiles(id) on delete cascade,
 guide_version integer not null,
 last_step integer not null default 1,
 completed_at timestamptz,
 result_storage_path text,
 updated_at timestamptz not null default now(),
 primary key(guide_id, profile_id)
);

create index if not exists idx_visual_guides_active_category on public.visual_work_guides(active,category) where deleted_at is null;
create index if not exists idx_visual_guide_steps_order on public.visual_work_guide_steps(guide_id,step_order);

alter table public.visual_work_guides enable row level security;
alter table public.visual_work_guide_steps enable row level security;
alter table public.visual_work_guide_progress enable row level security;

create policy "approved staff read active visual guides" on public.visual_work_guides for select to authenticated
 using(public.is_approved() and (active=true or public.is_business_director()));
create policy "director manages visual guides" on public.visual_work_guides for all to authenticated
 using(public.is_business_director()) with check(public.is_business_director());
create policy "approved staff read visual guide steps" on public.visual_work_guide_steps for select to authenticated
 using(public.is_approved() and exists(select 1 from public.visual_work_guides g where g.id=guide_id and (g.active=true or public.is_business_director())));
create policy "director manages visual guide steps" on public.visual_work_guide_steps for all to authenticated
 using(public.is_business_director()) with check(public.is_business_director());
create policy "staff read own guide progress" on public.visual_work_guide_progress for select to authenticated
 using(profile_id=(select auth.uid()) or public.is_business_director());
create policy "staff create own guide progress" on public.visual_work_guide_progress for insert to authenticated
 with check(profile_id=(select auth.uid()) and public.is_approved());
create policy "staff update own guide progress" on public.visual_work_guide_progress for update to authenticated
 using(profile_id=(select auth.uid())) with check(profile_id=(select auth.uid()));

grant select,insert,update,delete on public.visual_work_guides,public.visual_work_guide_steps to authenticated;
grant select,insert,update on public.visual_work_guide_progress to authenticated;

insert into public.migration_runs(migration_key,status,finished_at,notes)
 values('202608230025_visual_work_guides','completed',now(),'Mobile visual SOP guides, spoken instructions and employee result photos.')
 on conflict(migration_key) do update set status='completed',finished_at=now(),notes=excluded.notes;
commit;
