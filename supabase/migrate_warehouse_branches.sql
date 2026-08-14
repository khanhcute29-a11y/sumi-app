-- 1. Chia kho hàng thành 3 luồng: Kho Bakery / Kho Xưởng 42 / Kho Xưởng 41
alter table warehouse_stock add column if not exists branch text not null default 'bakery'
  check (branch in ('bakery', 'xuong41', 'xuong42'));

-- 2. Thêm 3 vai trò nhân viên kho theo từng luồng
alter table profiles drop constraint if exists profiles_role_check;
alter table profiles add constraint profiles_role_check
  check (role in (
    'owner','cashier','kitchen','shipper','admin','accountant','warehouse','sale','bakery',
    'kitchen_lead','kitchen_deputy','kho_bakery','kho_xuong41','kho_xuong42'
  ));
