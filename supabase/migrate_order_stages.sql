-- Run manually in Supabase SQL Editor. Safe to re-run (idempotent).

create table if not exists order_stages (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  stage_index int not null,
  stage_name text not null,
  assignee_id uuid references profiles(id) on delete set null,
  assignee_name text not null,
  status text not null default 'cho_lam' check (status in ('cho_lam','dang_lam','hoan_thanh')),
  started_at timestamptz,
  ended_at timestamptz,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (order_id, stage_index)
);

alter table order_stages enable row level security;

drop policy if exists "read order_stages" on order_stages;
create policy "read order_stages" on order_stages for select
  using (auth.role() = 'authenticated' and public.is_approved());

drop policy if exists "kitchen_lead insert order_stages" on order_stages;
create policy "kitchen_lead insert order_stages" on order_stages for insert
  with check (
    auth.role() = 'authenticated' and public.is_approved()
    and exists (
      select 1 from profiles
      where id = auth.uid()
        and (role in ('kitchen_lead','owner','admin') or extra_roles && array['kitchen_lead','owner','admin'])
    )
  );

drop policy if exists "assignee or lead update order_stages" on order_stages;
create policy "assignee or lead update order_stages" on order_stages for update
  using (
    assignee_id = auth.uid()
    or exists (
      select 1 from profiles
      where id = auth.uid()
        and (role in ('kitchen_lead','owner','admin') or extra_roles && array['kitchen_lead','owner','admin'])
    )
  )
  with check (auth.role() = 'authenticated' and public.is_approved());

drop policy if exists "kitchen_lead delete order_stages" on order_stages;
create policy "kitchen_lead delete order_stages" on order_stages for delete
  using (
    exists (
      select 1 from profiles
      where id = auth.uid()
        and (role in ('kitchen_lead','owner','admin') or extra_roles && array['kitchen_lead','owner','admin'])
    )
  );

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'order_stages'
  ) then
    alter publication supabase_realtime add table order_stages;
  end if;
end $$;
