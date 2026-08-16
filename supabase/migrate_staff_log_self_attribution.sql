-- Run manually in Supabase SQL Editor. Safe to re-run (idempotent).
-- Prevents a staff member from logging production/shift entries under someone
-- else's name — the row's staff_id must match the inserting user's own id.

drop policy if exists "insert production_logs" on production_logs;
create policy "insert production_logs" on production_logs for insert
  with check (
    auth.role() = 'authenticated' and public.is_approved()
    and staff_id = auth.uid()
    and exists (
      select 1 from profiles
      where id = auth.uid()
        and (
          role in ('kitchen', 'bakery', 'kitchen_lead', 'kitchen_deputy', 'owner', 'admin')
          or extra_roles && array['kitchen', 'bakery', 'kitchen_lead', 'kitchen_deputy', 'owner', 'admin']
        )
    )
  );

drop policy if exists "insert shift_logs" on shift_logs;
create policy "insert shift_logs" on shift_logs for insert
  with check (auth.role() = 'authenticated' and staff_id = auth.uid());
