-- Run manually in Supabase SQL Editor. Safe to re-run (idempotent).

create table if not exists task_templates (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  station text check (station in ('bakery','nong','lanh','xuong41','xuong42')),
  active boolean not null default true,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table task_templates enable row level security;

drop policy if exists "read task_templates" on task_templates;
create policy "read task_templates" on task_templates for select
  using (auth.role() = 'authenticated' and public.is_approved());

drop policy if exists "owner manage task_templates" on task_templates;
create policy "owner manage task_templates" on task_templates for all
  using (
    exists (
      select 1 from profiles
      where id = auth.uid()
        and (role in ('owner','admin') or extra_roles && array['owner','admin'])
    )
  )
  with check (
    auth.role() = 'authenticated' and public.is_approved()
    and exists (
      select 1 from profiles
      where id = auth.uid()
        and (role in ('owner','admin') or extra_roles && array['owner','admin'])
    )
  );

create table if not exists task_completions (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references task_templates(id) on delete cascade,
  staff_id uuid not null references profiles(id) on delete cascade,
  date date not null default current_date,
  completed_at timestamptz,
  confirmed_by uuid references profiles(id) on delete set null,
  confirmed_at timestamptz,
  unique (template_id, staff_id, date)
);

alter table task_completions enable row level security;

drop policy if exists "read task_completions" on task_completions;
create policy "read task_completions" on task_completions for select
  using (auth.role() = 'authenticated' and public.is_approved());

drop policy if exists "self insert task_completions" on task_completions;
create policy "self insert task_completions" on task_completions for insert
  with check (
    auth.role() = 'authenticated' and public.is_approved()
    and staff_id = auth.uid()
  );

drop policy if exists "self or owner update task_completions" on task_completions;
create policy "self or owner update task_completions" on task_completions for update
  using (
    staff_id = auth.uid()
    or exists (
      select 1 from profiles
      where id = auth.uid()
        and (role in ('owner','admin') or extra_roles && array['owner','admin'])
    )
  )
  with check (auth.role() = 'authenticated' and public.is_approved());

create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  category text not null check (category in ('assigned','adhoc')),
  title text not null,
  description text,
  order_code text,
  assignee_id uuid not null references profiles(id) on delete cascade,
  deadline timestamptz,
  batch_id uuid,
  status text not null default 'open' check (status in ('open','done','exempted')),
  completed_at timestamptz,
  late boolean,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table tasks enable row level security;

drop policy if exists "read own or owner tasks" on tasks;
create policy "read own or owner tasks" on tasks for select
  using (
    assignee_id = auth.uid()
    or exists (
      select 1 from profiles
      where id = auth.uid()
        and (role in ('owner','admin') or extra_roles && array['owner','admin'])
    )
  );

drop policy if exists "insert tasks" on tasks;
create policy "insert tasks" on tasks for insert
  with check (
    auth.role() = 'authenticated' and public.is_approved()
    and (
      (category = 'adhoc' and assignee_id = auth.uid())
      or exists (
        select 1 from profiles
        where id = auth.uid()
          and (role in ('owner','admin') or extra_roles && array['owner','admin'])
      )
    )
  );

drop policy if exists "assignee or owner update tasks" on tasks;
create policy "assignee or owner update tasks" on tasks for update
  using (
    assignee_id = auth.uid()
    or exists (
      select 1 from profiles
      where id = auth.uid()
        and (role in ('owner','admin') or extra_roles && array['owner','admin'])
    )
  )
  with check (auth.role() = 'authenticated' and public.is_approved());

drop policy if exists "owner delete tasks" on tasks;
create policy "owner delete tasks" on tasks for delete
  using (
    exists (
      select 1 from profiles
      where id = auth.uid()
        and (role in ('owner','admin') or extra_roles && array['owner','admin'])
    )
  );

alter table approval_requests drop constraint if exists approval_requests_type_check;
alter table approval_requests add constraint approval_requests_type_check
  check (type in ('order_edit','order_cancel','order_delete','shift_recheck','leave_request','task_exemption'));

alter table approval_requests add column if not exists task_id uuid references tasks(id) on delete set null;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'task_templates'
  ) then
    alter publication supabase_realtime add table task_templates;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'task_completions'
  ) then
    alter publication supabase_realtime add table task_completions;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'tasks'
  ) then
    alter publication supabase_realtime add table tasks;
  end if;
end $$;
