-- 1. Vai trò mới "Trợ Lý Giám Đốc" (deputy_director) — gần như toàn quyền như
--    Quản lý, ngoại trừ duyệt chi tiêu và xem doanh thu (chặn ở phía code UI,
--    các RPC duyệt chi vẫn chỉ kiểm tra owner/admin nên tự động không cho
--    deputy_director duyệt được). Vai trò này là người DUY NHẤT (ngoài
--    owner/admin) được tạo đơn Macaron / Bánh Quy.
begin;

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in (
    'owner','cashier','kitchen','shipper','admin','deputy_director','accountant',
    'warehouse','sale','bakery','kitchen_lead','kitchen_deputy',
    'kho_bakery','kho_xuong41','kho_xuong42'
  ));

-- 2. Sản phẩm Macaron sỉ + Bánh Quy Socola (xếp chung danh mục 'macaron' theo
--    yêu cầu chủ shop — "bên anh nhập cookie vào macaron").
--    Giá theo bảng giá lẻ (Hộp x cặp, x cm) có bậc giá theo số lượng đặt —
--    hệ thống không có cơ chế bậc giá tự động, nên mỗi bậc số lượng được lưu
--    thành 1 mức giá riêng (product_variants) để nhân viên tự chọn đúng bậc.
with items(name, unit, v1_label, v1_price, v2_label, v2_price, v3_label, v3_price) as (
  values
    ('Macaron Hạnh Nhân - Hộp 100 cặp (2cm, 1 màu)', 'hộp',
      '5-10 hộp', 210000, '≥10 hộp', 185000, null, null),
    ('Macaron Hạnh Nhân - Hộp 12 cặp (2cm)', 'hộp',
      '20-50 hộp', 28300, '≥50 hộp', 27000, null, null),
    ('Macaron Hạnh Nhân - Hộp 18 cặp (2cm)', 'hộp',
      '20-50 hộp', 39700, '≥50 hộp', 39000, null, null),
    ('Macaron Hạnh Nhân - Hộp 12 cặp (4cm)', 'hộp',
      '<20 hộp', 110000, '20-50 hộp', 102000, '≥50 hộp', 98000),
    ('Macaron Mix Màu - Khay 36 cặp (4cm)', 'thùng',
      'Thùng nhỏ - 6 khay (456.000đ/thùng)', 456000, 'Thùng lớn - 36 khay (2.124.000đ/thùng)', 2124000, null, null),
    ('Bánh Quy Socola - Hộp 180g', 'hộp',
      '27.000đ/hộp (từ 3 thùng, 22 hộp/thùng)', 27000, '25.000đ/hộp (từ 5 thùng)', 25000, null, null)
),
new_products as (
  insert into products (name, category, unit, price)
  select i.name, 'macaron', i.unit, i.v1_price from items i
  where not exists (select 1 from products p where p.name = i.name and p.category = 'macaron')
  returning id, name
),
all_products as (
  select np.id, np.name from new_products np
  union all
  select p.id, p.name from products p
  join items i on i.name = p.name and p.category = 'macaron'
  where p.id not in (select id from new_products)
)
insert into product_variants (product_id, label, price)
select ap.id, v.label, v.price
from all_products ap
join items i on i.name = ap.name
cross join lateral (
  values (i.v1_label, i.v1_price), (i.v2_label, i.v2_price), (i.v3_label, i.v3_price)
) as v(label, price)
where v.label is not null
  and not exists (
    select 1 from product_variants pv where pv.product_id = ap.id and pv.label = v.label
  );

insert into public.migration_runs(migration_key, status, finished_at, notes)
values('202608260018_deputy_director_role_and_macaron_catalog', 'completed', now(),
  'Added deputy_director role (profiles.role check constraint) and seeded wholesale macaron + chocolate cookie products under the macaron category with quantity-tier price variants.')
on conflict(migration_key) do update set status='completed', finished_at=now(), notes=excluded.notes;

commit;
