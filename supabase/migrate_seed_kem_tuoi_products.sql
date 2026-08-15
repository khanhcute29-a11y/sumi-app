-- Nhập bảng giá "Bánh sinh nhật kem tươi, bánh trứng muối" vào danh mục Sản Phẩm
-- (trước đây chỉ tồn tại dưới dạng công thức tính giá trong code, chưa có trong catalog).
-- Chỉ thêm mức giá theo SIZE — phần phụ phí theo nhân (mứt/trái cây tươi) vẫn tính tự
-- động như cũ lúc tạo đơn, không nằm trong bảng biến thể này.
with new_products as (
  insert into products (name, category, unit, price)
  values ('Bánh Kem Tươi / Trứng Muối (giá gốc theo size, chưa gồm phụ phí nhân)', 'banh_kem', 'bánh', 150000)
  returning id
),
sizes(label, price) as (
  values ('12cm', 150000), ('14cm', 180000), ('16cm', 220000), ('18cm', 260000), ('20cm', 300000),
         ('22cm', 360000), ('24cm', 420000), ('26cm', 480000), ('28cm', 600000), ('30cm', 700000),
         ('32cm', 750000), ('34cm', 800000), ('36cm', 850000), ('38cm', 900000), ('40cm', 1000000)
)
insert into product_variants (product_id, label, price)
select new_products.id, sizes.label, sizes.price
from new_products cross join sizes;
