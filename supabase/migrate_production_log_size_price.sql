-- Run manually in Supabase SQL Editor. Safe to re-run (idempotent).
-- Adds size + price to each production log entry so the owner can see not just
-- how many items were made in a day, but which size and how much value.

alter table production_logs add column if not exists size text;
alter table production_logs add column if not exists price numeric(12,0);

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'production_logs'
  ) then
    alter publication supabase_realtime add table production_logs;
  end if;
end $$;
