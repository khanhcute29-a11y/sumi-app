-- Run manually in Supabase SQL Editor. Safe to re-run (idempotent).
alter table incident_reports add column if not exists photos jsonb;
