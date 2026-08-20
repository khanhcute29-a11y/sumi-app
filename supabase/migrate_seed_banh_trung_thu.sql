-- Run manually in Supabase SQL Editor. Safe to re-run (idempotent) — checks for
-- existing product names before inserting so it won't duplicate rows on re-run.
-- Seeds the Trung Thu (mooncake) product line from the owner's price sheet.

-- 1. Mở rộng danh mục sản phẩm cho 3 nhóm bánh trung thu.
alter table products drop constraint if exists products_category_check;
alter table products add constraint products_category_check
  check (category in (
    'banh_kem','banh_kem_bap_choco','mousse_tiramisu','set_mousse','banh_su','cupcake',
    'banh_man_ngot','teabreak','khac','macaron',
    'banh_trung_thu','trung_thu_combo','phu_kien_trung_thu'
  ));

-- 2. Bánh trung thu theo Nhân — 8 vị thường + 4 vị cao cấp, mỗi vị có 4 mức trọng
--    lượng (150g/1 trứng, 210g/1 trứng, 220g/2 trứng, 250g/2 trứng). Giá lấy đúng
--    từng ô trong bảng giá gốc (không làm tròn theo công thức chung, vì Thập Cẩm ở
--    210g và Dừa Cốm ở 250g lệch nhẹ so với các vị cùng nhóm).
with flavors(name, w150, w210, w220, w250) as (
  values
    ('Bánh Trung Thu Mè Đen',        65000,  90000,  95000, 110000),
    ('Bánh Trung Thu Đậu Xanh',      65000,  90000,  95000, 110000),
    ('Bánh Trung Thu Đậu Xanh Lá Dứa', 65000, 90000,  95000, 110000),
    ('Bánh Trung Thu Đậu Đỏ',        65000,  90000,  95000, 110000),
    ('Bánh Trung Thu Khoai Môn',     65000,  90000,  95000, 110000),
    ('Bánh Trung Thu Sữa Dừa',       65000,  90000,  95000, 110000),
    ('Bánh Trung Thu Hạt Sen',       65000,  90000,  95000, 110000),
    ('Bánh Trung Thu Dừa Cốm',       65000,  90000,  95000, 116000),
    ('Bánh Trung Thu Thập Cẩm',      75000, 100000, 105000, 125000),
    ('Bánh Trung Thu Nam Việt Quất', 75000, 105000, 110000, 125000),
    ('Bánh Trung Thu Chanh Dây',     75000, 105000, 110000, 125000),
    ('Bánh Trung Thu Phúc Bồn Tử',   75000, 105000, 110000, 125000)
),
to_insert as (
  select f.* from flavors f
  where not exists (select 1 from products p where p.name = f.name)
),
new_products as (
  insert into products (name, category, unit, price)
  select name, 'banh_trung_thu', 'bánh', w150 from to_insert
  returning id, name
)
insert into product_variants (product_id, label, price)
select np.id, v.label, v.price
from new_products np
join to_insert ti on ti.name = np.name
cross join lateral (
  values ('150g (1 trứng)', ti.w150), ('210g (1 trứng)', ti.w210),
         ('220g (2 trứng)', ti.w220), ('250g (2 trứng)', ti.w250)
) as v(label, price);

-- 3. Hộp 4 bánh trung thu khuyến mãi (1 Thập Cẩm + 3 bánh ngọt tùy chọn + hộp).
--    Giá nhập tay lúc lên đơn nếu khách đổi sang vị cao cấp (+30k/+40k) hoặc hết
--    khuyến mãi — nhân viên ghi rõ 3 vị khách chọn vào ô Ghi chú.
insert into products (name, category, unit, price)
select * from (values
  ('Hộp 4 Bánh Trung Thu 150g — Khuyến Mãi (1 Thập Cẩm + 3 bánh ngọt tùy chọn + hộp)', 'trung_thu_combo', 'hộp', 279000),
  ('Hộp 4 Bánh Trung Thu 210g — Khuyến Mãi (1 Thập Cẩm + 3 bánh ngọt tùy chọn + hộp)', 'trung_thu_combo', 'hộp', 319000)
) as v(name, category, unit, price)
where not exists (select 1 from products p where p.name = v.name);

-- 4. Hộp/túi đựng bán riêng (nâng cấp bao bì cho khách muốn hộp đẹp hơn).
insert into products (name, category, unit, price)
select * from (values
  ('Hộp 2 Bánh Trung Thu — Basic', 'phu_kien_trung_thu', 'hộp', 45000),
  ('Hộp 4 Bánh Trung Thu — Premium', 'phu_kien_trung_thu', 'hộp', 90000),
  ('Hộp 4 Bánh Trung Thu — Luxury', 'phu_kien_trung_thu', 'hộp', 110000)
) as v(name, category, unit, price)
where not exists (select 1 from products p where p.name = v.name);
