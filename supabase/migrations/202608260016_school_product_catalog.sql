-- Đơn "Trường học" trước đây không có danh mục sản phẩm riêng — ô tìm tên bánh
-- lọc theo từ khoá mờ (FLOW_WORDS.school = ['banh mi','banh ngot','banh man'])
-- so khớp trên TOÀN BỘ sản phẩm trong hệ thống, nên các sản phẩm Trung Thu Combo
-- (có chữ "bánh ngọt" trong mô tả) bị lọt vào gợi ý của trường học dù không liên
-- quan. Migration này thêm category 'school' riêng + seed 15 sản phẩm theo bảng
-- giá bánh trường học (SM01-SM15, ngày 1/7/2026) — mỗi món có 2-3 mức trọng
-- lượng/giá. Phần lọc theo category thật (thay vì từ khoá mờ) sửa ở code.
begin;

alter table products drop constraint if exists products_category_check;
alter table products add constraint products_category_check
  check (category in (
    'banh_kem','banh_kem_bap_choco','mousse_tiramisu','set_mousse','banh_su','cupcake',
    'banh_man_ngot','teabreak','khac','macaron',
    'banh_trung_thu','trung_thu_combo','phu_kien_trung_thu',
    'school'
  ));

with items(name, w1, p1, w2, p2, w3, p3) as (
  values
    ('Bánh Mì Phô Mai',              '40g', 7500,  '45g', 8000,  '50g', 8500),
    ('Bánh Cam',                     '40g', 8000,  '50g', 9000,  null,  null),
    ('Bánh Bò Thốt Nốt',             '50g', 9000,  '60g', 10000, null,  null),
    ('Bánh Mì Paparoti',             '30g', 7500,  '35g', 8000,  '40g', 8500),
    ('Bánh Dừa Nướng',               '55g', 9000,  '60g', 9500,  '70g', 10000),
    ('Bánh Bao Nhân Mặn',            '55g', 8000,  '60g', 9000,  '70g', 10000),
    ('Tart Trứng Nhỏ',               '35g', 9000,  null,  null,  null,  null),
    ('Tart Trứng Lớn',               '45g', 12000, null,  null,  null,  null),
    ('Bông Lan Nho',                 '28g', 7500,  '32g', 8000,  '35g', 8500),
    ('Bông Lan Chà Bông Trứng Muối', '28g', 7500,  '32g', 8000,  '35g', 8500),
    ('Bánh Mì Dừa',                  '38g', 7000,  '45g', 7500,  '50g', 8000),
    ('Bánh Mì Chà Bông',             '38g', 7500,  '45g', 8000,  '50g', 8500),
    ('Bánh Mì Xúc Xích',             '38g', 8000,  '45g', 8500,  '50g', 9000),
    ('Bánh Cake Bơ',                 '40g', 9000,  '45g', 10000, null,  null),
    ('Bánh Dứa Đài Loan',            '35g', 8000,  '40g', 9000,  '50g', 12000)
),
new_products as (
  insert into products (name, category, unit, price)
  select i.name, 'school', 'cái', i.p1 from items i
  where not exists (select 1 from products p where p.name = i.name and p.category = 'school')
  returning id, name
),
all_products as (
  select np.id, np.name from new_products np
  union all
  select p.id, p.name from products p
  join items i on i.name = p.name and p.category = 'school'
  where p.id not in (select id from new_products)
)
insert into product_variants (product_id, label, price)
select ap.id, v.label, v.price
from all_products ap
join items i on i.name = ap.name
cross join lateral (
  values (i.w1, i.p1), (i.w2, i.p2), (i.w3, i.p3)
) as v(label, price)
where v.label is not null
  and not exists (
    select 1 from product_variants pv where pv.product_id = ap.id and pv.label = v.label
  );

insert into public.migration_runs(migration_key, status, finished_at, notes)
values('202608260016_school_product_catalog', 'completed', now(),
  'Added school product category + seeded 15 products (SM01-SM15) from the 1/7/2026 school price list, each with 2-3 weight/price variants.')
on conflict(migration_key) do update set status='completed', finished_at=now(), notes=excluded.notes;

commit;
