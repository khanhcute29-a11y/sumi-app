-- Run manually in Supabase SQL Editor. Safe to re-run (idempotent).
-- Adds "Nội dung" (chữ viết trên bánh) and "Loại nến" to each bánh kem order
-- item, so the kitchen sees them clearly on the order instead of guessing
-- or hunting through a chat message.

alter table order_items add column if not exists content text;
alter table order_items add column if not exists candle text;
