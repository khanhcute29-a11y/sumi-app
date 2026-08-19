-- Run manually in Supabase SQL Editor. Safe to re-run (idempotent).

alter table shift_configs add column if not exists end_time time;
