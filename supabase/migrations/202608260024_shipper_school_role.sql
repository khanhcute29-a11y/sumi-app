-- Vai trò mới "Nhân Viên Vận Chuyển Trường Học" — giống Shipper thường, cộng
-- thêm ngoại lệ duy nhất: được XEM đơn Trường học để đi giao (xử lý ở code,
-- xem src/lib/orderVisibility.js canViewSchoolOrder / canUserViewOrder).
begin;

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in (
    'owner','cashier','kitchen','shipper','shipper_school','admin','deputy_director',
    'deputy_director_x41','deputy_director_x42','accountant',
    'warehouse','sale','bakery','kitchen_lead','kitchen_deputy',
    'kho_bakery','kho_xuong41','kho_xuong42'
  ));

insert into public.migration_runs(migration_key, status, finished_at, notes)
values('202608260024_shipper_school_role', 'completed', now(),
  'Added shipper_school role — like shipper, but can also view School orders for delivery (everyone else except owner/admin/deputy_director_x42 is blocked from School orders entirely).')
on conflict(migration_key) do update set status='completed', finished_at=now(), notes=excluded.notes;

commit;
