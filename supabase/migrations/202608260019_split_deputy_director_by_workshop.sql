-- "Trợ Lý Giám Đốc" (deputy_director) split into 2 workshop-specific roles per
-- owner's instruction: Xưởng 41 (Macaron) and Xưởng 42 (Trường học), each with
-- an exclusive price/visibility scope handled in the app code:
--   - deputy_director_x41 (+ owner/admin): the only ones who see Macaron
--     product PRICES. Other staff still see Macaron orders, just not price.
--   - deputy_director_x42 (+ owner/admin): the only ones who can see School
--     orders AT ALL (not just price) — nobody else in the company sees them.
-- The old generic 'deputy_director' role value is kept allowed here (not
-- removed) only so this migration doesn't fail if a staff member was already
-- assigned it — reassign that person to the correct workshop-specific role
-- from the Nhân Viên screen after running this.
begin;

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in (
    'owner','cashier','kitchen','shipper','admin','deputy_director',
    'deputy_director_x41','deputy_director_x42','accountant',
    'warehouse','sale','bakery','kitchen_lead','kitchen_deputy',
    'kho_bakery','kho_xuong41','kho_xuong42'
  ));

insert into public.migration_runs(migration_key, status, finished_at, notes)
values('202608260019_split_deputy_director_by_workshop', 'completed', now(),
  'Split deputy_director role into deputy_director_x41/deputy_director_x42; if any staff had the old generic role, reassign them from the Nhân Viên screen.')
on conflict(migration_key) do update set status='completed', finished_at=now(), notes=excluded.notes;

commit;
