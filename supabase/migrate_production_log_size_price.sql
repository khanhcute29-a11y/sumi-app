-- Run manually in Supabase SQL Editor. Safe to re-run (idempotent).
-- Adds size + price to each production log entry so the owner can see not just
-- how many items were made in a day, but which size and how much value.

alter table production_logs add column if not exists size text;
alter table production_logs add column if not exists price numeric(12,0);
