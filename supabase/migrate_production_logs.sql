-- Run manually in Supabase SQL Editor. Safe to re-run (idempotent).
create table if not exists production_logs (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references products(id) on delete set null,
  product_name text not null,
  qty numeric not null check (qty > 0),
  staff_id uuid references profiles(id) on delete set null,
  staff_name text not null,
  work_date date not null default current_date,
  created_at timestamptz not null default now()
);

alter table production_logs enable row level security;

drop policy if exists "read production_logs" on production_logs;
create policy "read production_logs" on production_logs for select
  using (auth.role() = 'authenticated' and public.is_approved());

drop policy if exists "insert production_logs" on production_logs;
create policy "insert production_logs" on production_logs for insert
  with check (
    auth.role() = 'authenticated' and public.is_approved()
    and exists (
      select 1 from profiles
      where id = auth.uid()
        and (
          role in ('kitchen', 'bakery', 'kitchen_lead', 'kitchen_deputy', 'owner', 'admin')
          or extra_roles && array['kitchen', 'bakery', 'kitchen_lead', 'kitchen_deputy', 'owner', 'admin']
        )
    )
  );

drop policy if exists "delete production_logs" on production_logs;
create policy "delete production_logs" on production_logs for delete
  using (
    exists (
      select 1 from profiles
      where id = auth.uid()
        and (
          role in ('owner', 'admin')
          or extra_roles && array['owner', 'admin']
        )
    )
  );

drop policy if exists "update production_logs" on production_logs;
create policy "update production_logs" on production_logs for update
  using (
    exists (
      select 1 from profiles
      where id = auth.uid()
        and (
          role in ('owner', 'admin')
          or extra_roles && array['owner', 'admin']
        )
    )
  );
