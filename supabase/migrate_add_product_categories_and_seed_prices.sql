-- 1. Mở rộng danh mục sản phẩm để chứa các dòng bánh mới từ bảng giá anh gửi.
alter table products drop constraint if exists products_category_check;
alter table products add constraint products_category_check
  check (category in (
    'banh_kem','banh_kem_bap_choco','mousse_tiramisu','set_mousse','banh_su','cupcake',
    'banh_man_ngot','teabreak','khac','macaron'
  ));

-- 2. Bánh Su Singapore (tính theo viên, không theo size)
insert into products (name, category, unit, price) values
  ('Bánh Su Singapore — Trên 25 viên, trang trí trái cây (đặt tối thiểu 12 viên)', 'banh_su', 'viên', 11000),
  ('Bánh Su Singapore — Trên 25 viên, trang trí vẽ chủ đề (đặt tối thiểu 12 viên)', 'banh_su', 'viên', 12000),
  ('Bánh Su Singapore — Dưới 25 viên (đặt tối thiểu 12 viên)', 'banh_su', 'viên', 15000);

-- 3. Cupcake (tính theo bánh, giá theo kiểu trang trí + số lượng)
insert into products (name, category, unit, price) values
  ('Cupcake trang trí rắc kẹo/trái cây (20-50 bánh)', 'cupcake', 'bánh', 15000),
  ('Cupcake trang trí rắc kẹo/trái cây (dưới 20 bánh)', 'cupcake', 'bánh', 20000),
  ('Cupcake trang trí hình/theo chủ đề', 'cupcake', 'bánh', 25000);

-- 4. Set Mousse ly nhỏ (giá cơ bản; chính sách tặng hộp theo số lượng: 4 ly/hủ +20k hộp,
--    từ 6 ly/hủ trở lên free hộp — chưa hỗ trợ tự động trong hệ thống, ghi chú để sếp/sale nhớ áp dụng tay)
insert into products (name, category, unit, price) values
  ('Set Mousse Ly Tim (4 ly +hộp 20k · từ 6 ly free hộp) — vị: dâu, chanh dây, nhãn, dưa lưới, xoài, chocolate, vải, việt quất, tiramisu', 'set_mousse', 'ly', 30000),
  ('Set Mousse Ly Tròn (4 hủ +hộp 20k · từ 6 hủ free hộp) — vị: dâu, chanh dây, nhãn, dưa lưới, xoài, chocolate, vải, việt quất, tiramisu', 'set_mousse', 'hủ', 45000);

-- 5. Mousse & Tiramisu — 8 vị, cùng 1 bảng giá theo size (16-30cm)
with flavors(name) as (
  values ('Mousse Dâu'), ('Mousse Chanh Dây'), ('Mousse Xoài'), ('Mousse Vải'),
         ('Mousse Dưa Lưới'), ('Mousse Chocolate'), ('Tiramisu Chocolate'), ('Tiramisu Trà Xanh')
),
sizes(label, price) as (
  values ('16cm', 280000), ('18cm', 320000), ('20cm', 360000), ('22cm', 450000),
         ('24cm', 550000), ('26cm', 700000), ('28cm', 850000), ('30cm', 1000000)
),
new_products as (
  insert into products (name, category, unit, price)
  select name, 'mousse_tiramisu', 'bánh', 280000 from flavors
  returning id, name
)
insert into product_variants (product_id, label, price)
select new_products.id, sizes.label, sizes.price
from new_products cross join sizes;

-- 6. Bánh kem bắp / kem chocolate — 2 vị, cùng 1 bảng giá theo size (12-40cm)
with flavors(name) as (
  values ('Bánh Kem Bắp'), ('Bánh Kem Chocolate')
),
sizes(label, price) as (
  values ('12cm', 170000), ('14cm', 200000), ('16cm', 240000), ('18cm', 280000), ('20cm', 320000),
         ('22cm', 360000), ('24cm', 400000), ('26cm', 500000), ('28cm', 650000), ('30cm', 750000),
         ('32cm', 800000), ('34cm', 850000), ('36cm', 900000), ('38cm', 950000), ('40cm', 1000000)
),
new_products as (
  insert into products (name, category, unit, price)
  select name, 'banh_kem_bap_choco', 'bánh', 170000 from flavors
  returning id, name
)
insert into product_variants (product_id, label, price)
select new_products.id, sizes.label, sizes.price
from new_products cross join sizes;

-- Ghi chú: bảng "Bánh sinh nhật kem tươi, bánh trứng muối" trong ảnh KHÔNG cần nhập —
-- đã có sẵn trong hệ thống từ trước (src/lib/cakePricing.js), dùng công thức tính giá
-- tự động theo Size/Cốt/Vị ngay lúc tạo đơn "Bánh Kem" thường, số liệu khớp 100% với ảnh.
