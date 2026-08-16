-- Run manually in Supabase SQL Editor. Safe to re-run (idempotent).
alter table order_notes add column if not exists attachments jsonb;
