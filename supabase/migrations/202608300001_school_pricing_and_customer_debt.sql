-- Đơn Hàng Trường Học, Bảng Giá Động (theo Size) & Kế Toán Công Nợ KH.
--
-- Trước migration này: "Công Nợ" trong hệ thống CHỈ là công nợ nội bộ (tạm ứng
-- lương + chi hộ nhân viên, bảng expense_claims/salary_advance_requests) —
-- CHƯA hề có công nợ khách hàng (AR). Migration này xây mới hoàn toàn, tách
-- biệt hẳn khỏi 2 bảng trên, không đụng gì tới luồng thu-chi nội bộ đã chạy.
--
-- Quyết định đã thống nhất với chủ tiệm trước khi viết migration này:
--  1. Bảng giá SM01-SM15 cũ (seed ở 202608260016) khác hẳn tên/giá so với file
--     giá mới (SM01-SM59, 55 món sau khi gộp trùng tên) -> GIỮ NGUYÊN cũ, chỉ
--     THÊM MỚI (idempotent theo tên+category), không xoá/không ghi đè.
--  2. Đơn trường học hoàn thành -> ghi Công Nợ = tổng đơn + 8% VAT (số tiền
--     xuất hoá đơn thật cho trường, không phải giá gốc).
--
-- Giá theo Size: cơ chế `products` + `product_variants` (label=size, price)
-- đã có sẵn và đang chạy thật cho đơn trường học — không cần bảng mới, chỉ
-- nạp thêm dữ liệu.

begin;

-- ============================================================
-- 1. Bảng giá trường học — bổ sung 55 món mới (SM01-SM59, đã gộp trùng tên)
-- ============================================================
with new_products as (
  insert into products (name, category, unit, price)
  select v.name, 'school', 'cái', v.price
  from (values
  ('SM01', 'SU QUE', 7000),
  ('SM02', 'SU KEM', 7000),
  ('SM03', 'BÁNH CREAM CHEESE PHO MAI', 7500),
  ('SM04', 'Bánh cam nhân đậu xanh', 8000),
  ('SM05', 'Bánh bò thốt nốt', 8000),
  ('SM06', 'Bánh chuối hạnh nhân', 9000),
  ('SM07', 'Bánh bao nướng', 8000),
  ('SM08', 'Tart trứng nhỏ', 9000),
  ('SM09', 'Tart trứng lớn', 12000),
  ('SM10', 'BÔNG LAN NHO', 7000),
  ('SM11', 'BÔNG LAN CAM', 7000),
  ('SM12', 'BÔNG LAN DÂU', 7000),
  ('SM13', 'BÔNG LAN CHOCOLATE', 7000),
  ('SM14', 'BÔNG LAN CHÀ BÔNG TRỨNG MUỐI', 7500),
  ('SM15', 'BÔNG LAN CHÀ BÔNG', 7500),
  ('SM16', 'Cup bông lan pho mai trứng muối', 7500),
  ('SM17', 'Bông lan chà bông trứng muối vuông', 8000),
  ('SM18', 'Bông lan chà bông trứng muối rong biển', 8000),
  ('SM19', 'MUFFIN CHUỐI', 7500),
  ('SM20', 'Muffin ham cheese', 7500),
  ('SM21', 'BÁNH MÌ TƯƠI NHÂN KEM CUSTARD', 7000),
  ('SM22', 'BÁNH CUỘN DỪA', 7000),
  ('SM23', 'HAMBURGER GÀ XÉ', 7500),
  ('SM24', 'HAMBURGER CHÀ BÔNG', 7500),
  ('SM25', 'BÁNH CHÀ BÔNG KẸP', 7500),
  ('SM26', 'Bánh mì cuộn xúc xích chà bông', 7500),
  ('SM27', 'BÁNH MÌ TƯƠI NHÂN KEM BƠ', 7000),
  ('SM28', 'BÁNH MÌ TƯƠI NHÂN DÂU', 7000),
  ('SM29', 'BÁNH MÌ TƯƠI NHÂN THƠM', 7000),
  ('SM30', 'BÁNH MÌ TƯƠI NHÂN ĐẬU XANH', 7000),
  ('SM31', 'BÁNH MÌ BƠ SỮA NHÂN PHO MAI', 7000),
  ('SM32', 'BÁNH MÌ TƯƠI NHÂN ĐẬU ĐỎ', 7000),
  ('SM33', 'BÁNH MÌ CHOCOLATE', 7000),
  ('SM35', 'MEXICO PUN', 7000),
  ('SM37', 'Tiramisu', 15000),
  ('SM38', 'Paparoti', 7000),
  ('SM39', 'Hotdog xúc xích cheese', 8500),
  ('SM40', 'Hamburger bò', 14000),
  ('SM41', 'Bánh mì pho mai tỏi hàn quốc mini', 9000),
  ('SM42', 'Bánh mì phô mai tan chảy', 10000),
  ('SM43', 'Bánh mì phomai hoàng kim', 10000),
  ('SM44', 'Pate Chaud', 10000),
  ('SM45', 'Ngàn lớp chà bông', 10000),
  ('SM46', 'Susingapore socola hạnh nhân', 12000),
  ('SM47', 'Croissant', 10000),
  ('SM48', 'Croissant thịt nguội', 12000),
  ('SM49', 'Bông lan cuộn khóm', 9000),
  ('SM50', 'Bông lan cuộn kem', 9000),
  ('SM51', 'Bông lan cuộn chocolate', 9000),
  ('SM52', 'Bông lan cuộn chà bông trứng muối', 10000),
  ('SM53', 'Pizza Bò / Pizza Gà / Pizza Xúc Xích', 8500),
  ('SM54', 'Donut socola chà bông', 8500),
  ('SM57', 'Bánh mì chà bông rong biển', 7500),
  ('SM58', 'Bánh mì chà bông trứng muối', 7500),
  ('SM59', 'BÁNH DONUT CHOCOLATE', 8000)
  ) as v(sku, name, price)
  where not exists (select 1 from products p where p.name = v.name and p.category = 'school')
  returning id, name
),
all_products as (
  select np.id, np.name from new_products np
  union all
  select p.id, p.name from products p
  join (values
  ('SM01', 'SU QUE', 7000),
  ('SM02', 'SU KEM', 7000),
  ('SM03', 'BÁNH CREAM CHEESE PHO MAI', 7500),
  ('SM04', 'Bánh cam nhân đậu xanh', 8000),
  ('SM05', 'Bánh bò thốt nốt', 8000),
  ('SM06', 'Bánh chuối hạnh nhân', 9000),
  ('SM07', 'Bánh bao nướng', 8000),
  ('SM08', 'Tart trứng nhỏ', 9000),
  ('SM09', 'Tart trứng lớn', 12000),
  ('SM10', 'BÔNG LAN NHO', 7000),
  ('SM11', 'BÔNG LAN CAM', 7000),
  ('SM12', 'BÔNG LAN DÂU', 7000),
  ('SM13', 'BÔNG LAN CHOCOLATE', 7000),
  ('SM14', 'BÔNG LAN CHÀ BÔNG TRỨNG MUỐI', 7500),
  ('SM15', 'BÔNG LAN CHÀ BÔNG', 7500),
  ('SM16', 'Cup bông lan pho mai trứng muối', 7500),
  ('SM17', 'Bông lan chà bông trứng muối vuông', 8000),
  ('SM18', 'Bông lan chà bông trứng muối rong biển', 8000),
  ('SM19', 'MUFFIN CHUỐI', 7500),
  ('SM20', 'Muffin ham cheese', 7500),
  ('SM21', 'BÁNH MÌ TƯƠI NHÂN KEM CUSTARD', 7000),
  ('SM22', 'BÁNH CUỘN DỪA', 7000),
  ('SM23', 'HAMBURGER GÀ XÉ', 7500),
  ('SM24', 'HAMBURGER CHÀ BÔNG', 7500),
  ('SM25', 'BÁNH CHÀ BÔNG KẸP', 7500),
  ('SM26', 'Bánh mì cuộn xúc xích chà bông', 7500),
  ('SM27', 'BÁNH MÌ TƯƠI NHÂN KEM BƠ', 7000),
  ('SM28', 'BÁNH MÌ TƯƠI NHÂN DÂU', 7000),
  ('SM29', 'BÁNH MÌ TƯƠI NHÂN THƠM', 7000),
  ('SM30', 'BÁNH MÌ TƯƠI NHÂN ĐẬU XANH', 7000),
  ('SM31', 'BÁNH MÌ BƠ SỮA NHÂN PHO MAI', 7000),
  ('SM32', 'BÁNH MÌ TƯƠI NHÂN ĐẬU ĐỎ', 7000),
  ('SM33', 'BÁNH MÌ CHOCOLATE', 7000),
  ('SM35', 'MEXICO PUN', 7000),
  ('SM37', 'Tiramisu', 15000),
  ('SM38', 'Paparoti', 7000),
  ('SM39', 'Hotdog xúc xích cheese', 8500),
  ('SM40', 'Hamburger bò', 14000),
  ('SM41', 'Bánh mì pho mai tỏi hàn quốc mini', 9000),
  ('SM42', 'Bánh mì phô mai tan chảy', 10000),
  ('SM43', 'Bánh mì phomai hoàng kim', 10000),
  ('SM44', 'Pate Chaud', 10000),
  ('SM45', 'Ngàn lớp chà bông', 10000),
  ('SM46', 'Susingapore socola hạnh nhân', 12000),
  ('SM47', 'Croissant', 10000),
  ('SM48', 'Croissant thịt nguội', 12000),
  ('SM49', 'Bông lan cuộn khóm', 9000),
  ('SM50', 'Bông lan cuộn kem', 9000),
  ('SM51', 'Bông lan cuộn chocolate', 9000),
  ('SM52', 'Bông lan cuộn chà bông trứng muối', 10000),
  ('SM53', 'Pizza Bò / Pizza Gà / Pizza Xúc Xích', 8500),
  ('SM54', 'Donut socola chà bông', 8500),
  ('SM57', 'Bánh mì chà bông rong biển', 7500),
  ('SM58', 'Bánh mì chà bông trứng muối', 7500),
  ('SM59', 'BÁNH DONUT CHOCOLATE', 8000)
  ) as v(sku, name, price) on v.name = p.name and p.category = 'school'
  where p.id not in (select id from new_products)
)
insert into product_variants (product_id, label, price)
select ap.id, v.label, v.price
from all_products ap
join (values
  ('SU QUE', '35g', 7000),
  ('SU QUE', '40g', 7500),
  ('SU QUE', '45g', 8000),
  ('SU KEM', '35g', 7000),
  ('SU KEM', '40g', 7500),
  ('SU KEM', '45g', 8000),
  ('BÁNH CREAM CHEESE PHO MAI', '40g', 7500),
  ('BÁNH CREAM CHEESE PHO MAI', '45g', 8000),
  ('BÁNH CREAM CHEESE PHO MAI', '50g', 8500),
  ('Bánh cam nhân đậu xanh', '45g', 8000),
  ('Bánh cam nhân đậu xanh', '55g', 9000),
  ('Bánh bò thốt nốt', '55g', 8000),
  ('Bánh bò thốt nốt', '65g', 9000),
  ('Bánh chuối hạnh nhân', '45g', 9000),
  ('Bánh bao nướng', '55g', 8000),
  ('Bánh bao nướng', '60g', 8500),
  ('Bánh bao nướng', '70g', 10000),
  ('Tart trứng nhỏ', '30g', 9000),
  ('Tart trứng lớn', '45g', 12000),
  ('BÔNG LAN NHO', '30g', 7000),
  ('BÔNG LAN NHO', '35g', 7500),
  ('BÔNG LAN NHO', '40g', 8000),
  ('BÔNG LAN CAM', '30g', 7000),
  ('BÔNG LAN CAM', '35g', 7500),
  ('BÔNG LAN CAM', '40g', 8000),
  ('BÔNG LAN DÂU', '30g', 7000),
  ('BÔNG LAN DÂU', '35g', 7500),
  ('BÔNG LAN DÂU', '40g', 8000),
  ('BÔNG LAN CHOCOLATE', '30g', 7000),
  ('BÔNG LAN CHOCOLATE', '35g', 7500),
  ('BÔNG LAN CHOCOLATE', '40g', 8000),
  ('BÔNG LAN CHÀ BÔNG TRỨNG MUỐI', '30g', 7500),
  ('BÔNG LAN CHÀ BÔNG TRỨNG MUỐI', '35g', 8000),
  ('BÔNG LAN CHÀ BÔNG TRỨNG MUỐI', '40g', 8500),
  ('BÔNG LAN CHÀ BÔNG', '30g', 7500),
  ('BÔNG LAN CHÀ BÔNG', '35g', 8000),
  ('BÔNG LAN CHÀ BÔNG', '40g', 8500),
  ('Cup bông lan pho mai trứng muối', '30g', 7500),
  ('Cup bông lan pho mai trứng muối', '35g', 8000),
  ('Cup bông lan pho mai trứng muối', '40g', 8500),
  ('Bông lan chà bông trứng muối vuông', '30g', 8000),
  ('Bông lan chà bông trứng muối vuông', '35g', 9000),
  ('Bông lan chà bông trứng muối vuông', '40g', 10000),
  ('Bông lan chà bông trứng muối rong biển', '30g', 8000),
  ('Bông lan chà bông trứng muối rong biển', '35g', 9000),
  ('Bông lan chà bông trứng muối rong biển', '40g', 10000),
  ('MUFFIN CHUỐI', '32g', 7500),
  ('MUFFIN CHUỐI', '38g', 8000),
  ('MUFFIN CHUỐI', '42g', 8500),
  ('Muffin ham cheese', '32g', 7500),
  ('Muffin ham cheese', '38g', 8000),
  ('Muffin ham cheese', '42g', 8500),
  ('BÁNH MÌ TƯƠI NHÂN KEM CUSTARD', '38g', 7000),
  ('BÁNH MÌ TƯƠI NHÂN KEM CUSTARD', '45g', 7500),
  ('BÁNH MÌ TƯƠI NHÂN KEM CUSTARD', '50g', 8000),
  ('BÁNH CUỘN DỪA', '38g', 7000),
  ('BÁNH CUỘN DỪA', '45g', 7500),
  ('BÁNH CUỘN DỪA', '50g', 8000),
  ('HAMBURGER GÀ XÉ', '38g', 7500),
  ('HAMBURGER GÀ XÉ', '45g', 8000),
  ('HAMBURGER GÀ XÉ', '50g', 8500),
  ('HAMBURGER CHÀ BÔNG', '38g', 7500),
  ('HAMBURGER CHÀ BÔNG', '45g', 8000),
  ('HAMBURGER CHÀ BÔNG', '50g', 8500),
  ('BÁNH CHÀ BÔNG KẸP', '38g', 7500),
  ('BÁNH CHÀ BÔNG KẸP', '45g', 8000),
  ('BÁNH CHÀ BÔNG KẸP', '50g', 8500),
  ('Bánh mì cuộn xúc xích chà bông', '38g', 7500),
  ('Bánh mì cuộn xúc xích chà bông', '45g', 8000),
  ('Bánh mì cuộn xúc xích chà bông', '50g', 8500),
  ('BÁNH MÌ TƯƠI NHÂN KEM BƠ', '38g', 7000),
  ('BÁNH MÌ TƯƠI NHÂN KEM BƠ', '45g', 7500),
  ('BÁNH MÌ TƯƠI NHÂN KEM BƠ', '50g', 8000),
  ('BÁNH MÌ TƯƠI NHÂN DÂU', '38g', 7000),
  ('BÁNH MÌ TƯƠI NHÂN DÂU', '45g', 7500),
  ('BÁNH MÌ TƯƠI NHÂN DÂU', '50g', 8000),
  ('BÁNH MÌ TƯƠI NHÂN THƠM', '38g', 7000),
  ('BÁNH MÌ TƯƠI NHÂN THƠM', '45g', 7500),
  ('BÁNH MÌ TƯƠI NHÂN THƠM', '50g', 8000),
  ('BÁNH MÌ TƯƠI NHÂN ĐẬU XANH', '38g', 7000),
  ('BÁNH MÌ TƯƠI NHÂN ĐẬU XANH', '45g', 7500),
  ('BÁNH MÌ TƯƠI NHÂN ĐẬU XANH', '50g', 8000),
  ('BÁNH MÌ BƠ SỮA NHÂN PHO MAI', '38g', 7000),
  ('BÁNH MÌ BƠ SỮA NHÂN PHO MAI', '45g', 7500),
  ('BÁNH MÌ BƠ SỮA NHÂN PHO MAI', '50g', 8000),
  ('BÁNH MÌ TƯƠI NHÂN ĐẬU ĐỎ', '38g', 7000),
  ('BÁNH MÌ TƯƠI NHÂN ĐẬU ĐỎ', '45g', 7500),
  ('BÁNH MÌ TƯƠI NHÂN ĐẬU ĐỎ', '50g', 8000),
  ('BÁNH MÌ CHOCOLATE', '38g', 7000),
  ('BÁNH MÌ CHOCOLATE', '45g', 7500),
  ('BÁNH MÌ CHOCOLATE', '50g', 8000),
  ('MEXICO PUN', '30g', 7000),
  ('MEXICO PUN', '35g', 7500),
  ('MEXICO PUN', '40g', 8000),
  ('Tiramisu', '50g', 15000),
  ('Paparoti', '30g', 7000),
  ('Paparoti', '35g', 7500),
  ('Paparoti', '40g', 8000),
  ('Hotdog xúc xích cheese', '35g', 8500),
  ('Hotdog xúc xích cheese', '40g', 9000),
  ('Hotdog xúc xích cheese', '50g', 15000),
  ('Hamburger bò', '40g', 14000),
  ('Hamburger bò', '60g', 19000),
  ('Bánh mì pho mai tỏi hàn quốc mini', '30g', 9000),
  ('Bánh mì pho mai tỏi hàn quốc mini', '40g', 12000),
  ('Bánh mì phô mai tan chảy', '30g', 10000),
  ('Bánh mì phô mai tan chảy', '40g', 12000),
  ('Bánh mì phomai hoàng kim', '30g', 10000),
  ('Bánh mì phomai hoàng kim', '40g', 12000),
  ('Pate Chaud', '40g', 10000),
  ('Ngàn lớp chà bông', '50g', 10000),
  ('Ngàn lớp chà bông', '60g', 12000),
  ('Susingapore socola hạnh nhân', '40g', 12000),
  ('Croissant', '40g', 10000),
  ('Croissant thịt nguội', '45g', 12000),
  ('Bông lan cuộn khóm', '50g', 9000),
  ('Bông lan cuộn kem', '50g', 9000),
  ('Bông lan cuộn chocolate', '50g', 9000),
  ('Bông lan cuộn chà bông trứng muối', '50g', 10000),
  ('Pizza Bò / Pizza Gà / Pizza Xúc Xích', '40g', 8500),
  ('Pizza Bò / Pizza Gà / Pizza Xúc Xích', '50g', 12000),
  ('Donut socola chà bông', '35g', 8500),
  ('Bánh mì chà bông rong biển', '38g', 7500),
  ('Bánh mì chà bông rong biển', '45g', 8000),
  ('Bánh mì chà bông rong biển', '50g', 8500),
  ('Bánh mì chà bông trứng muối', '38g', 7500),
  ('Bánh mì chà bông trứng muối', '45g', 8000),
  ('Bánh mì chà bông trứng muối', '50g', 8500)
) as v(name, label, price) on v.name = ap.name
where not exists (
  select 1 from product_variants pv where pv.product_id = ap.id and pv.label = v.label
);

-- ============================================================
-- 2. Khách hàng trường học — mở rộng bảng customers (KHÔNG tạo bảng riêng,
--    orders.customer_id đã trỏ thẳng vào đây, tái dùng toàn bộ hạ tầng có sẵn)
-- ============================================================
alter table customers add column if not exists school_code text;
alter table customers add column if not exists tax_code text;
alter table customers add column if not exists is_school boolean not null default false;
alter table customers add column if not exists address text;
create unique index if not exists idx_customers_school_code on customers(school_code) where school_code is not null;

insert into customers (name, address, tax_code, school_code, is_school, channel)
select v.name, v.address, v.tax_code, v.code, true, 'school'
from (values
  ('1TĐH', 'TRƯỜNG TIỂU HỌC TÂN ĐÔNG HIỆP', 'Đường Lê Hồng Phong , KP Đông Thành, phường Tân Đông Hiệp, TP.HCM, Việt Nam', '3701404849', 0),
  ('2TĐH B', 'TRƯỜNG TIỂU HỌC TÂN ĐÔNG HIỆP B', 'Khu phố Đông Chiêu, Phường Dĩ An, TP.HCM,  Việt Nam', '3702414945', 0),
  ('3700145694', 'CÔNG TY CP - TỔNG CÔNG TY NƯỚC - MÔI TRƯỜNG BÌNH DƯƠNG', 'Số 11, Ngô Văn Trị, Phường Phú Lợi, TP Hồ Chí Minh', '3700145694', 0),
  ('3700271265', 'Trường Trung Học Phổ Thông Thái Hòa', 'Khu Phố An Thành, Phường Tân Khánh, TP Hồ Chí Minh, Việt Nam', '3700271265', 0),
  ('3700275196', 'Trường THPT Nguyễn An Ninh-Bình Dương', 'Khu phố Bình Đường 2, Phường Dĩ An, TP Hồ Chí Minh', '3700275196', 0),
  ('3701468514', 'Trường Mầm non Hoa Mai 5', 'KP Bình Phước A, Phường An Phú, TP Hồ Chí Minh', '3701468514', 0),
  ('3TĐH C', 'TRƯỜNG TIỂU HỌC TÂN ĐÔNG HIỆP C', 'Khu phố Đông Thành, Phường Tân Đông Hiệp, TP.HCM, Việt Nam', '3702915194', 0),
  ('AB', 'TRƯỜNG TIỂU HỌC AN BÌNH', 'Số 60, Quốc lộ 1A, khu phố Bình Đường 1, Phường Dĩ An, TP.HCM, Việt Nam', '3701408931', 0),
  ('AB B', 'TRƯỜNG TIỂU HỌC AN BÌNH B', 'KP Bình Đường 2, Phường Dĩ An, Thành Phố Hồ Chí Minh, Việt Nam', '3703054893', 0),
  ('AN HỘI GÒ VẤP', 'Trường Tiểu Học An Hội', 'Số 2 Phạm Văn Chiêu, Phường Thông Tây Hội, TP Hồ Chí Minh', '0306394915', 0),
  ('an phú 2', 'TRƯỜNG TIỂU HỌC AN PHÚ 2', 'Số 298/3, đường An Phú 35, tổ 14, khu phố 2, Phường An Phú, TP Hồ Chí Minh', '3702808442', 0),
  ('an phú 3', 'TRƯỜNG TIỂU HỌC AN PHÚ 3', '404/1, đường Lê Thị Trung, khu phố 1A, Phường An Phú, TP Hồ Chí Minh,Việt Nam', '3703149182', 0),
  ('AP', 'Trường Tiểu Học An Phú', '10/2 đường An Phú 10, tổ 6, khu phố 1B, Phường An Phú, TP Hồ Chí Minh', '3701469719', 0),
  ('AS', 'Trường Tiểu Học An Sơn', 'Số 122, đường An Sơn 01, Phường Thuận An, TP Hồ Chí Minh', '3701469733', 0),
  ('AT', 'TRƯỜNG TIỂU HỌC AN THẠNH', 'Số 266/3F, Đường An Thạnh 51, Phường Thuận An, Thành phố Hồ Chí Minh', '3701470270', 0),
  ('BA', 'TRƯỜNG TIỂU HỌC BÌNH AN', 'Quốc lộ 1K, Khu phố Nội Hóa 2, Phường Đông Hòa, TP.HCM, Việt Nam', '3701490527', 0),
  ('ban đại diện', 'Ban đại diện trường Mầm Non Hoa Cúc 5', null, 'Hoa cúc 5', 0),
  ('BH', 'TRƯỜNG TIỂU HỌC BÌNH HÒA', '2A/T1 Tổ 2A Khu Phố  Bình Đức 1, Phường Bình Hòa, TP HCM, Việt Nam', '3701469691', 0),
  ('BH 2', 'TRƯỜNG TIỂU HỌC BÌNH HÒA 2', '3A/T1, Tổ 3A, Khu phố Bình Đức 1,Phường Bình Hòa, Thành phố Hồ Chí Minh', '3702412289', 0),
  ('Bình Chuẩn', 'TRƯỜNG TIỂU HỌC BÌNH CHUẨN', 'Khu phố Bình Phú, Phường Thuận Giao, Thành phố Hồ Chí Minh, Việt Nam', '3701468560', 0),
  ('Bình chuẩn 2', 'TRƯỜNG TIỂU HỌC BÌNH CHUẨN 2', 'Số 169/2 Đường PKV 57, Khu phố Bình Quới B, Phường Thuận Giao, TP Hồ Chí Minh', '3702993555', 0),
  ('Bình Nhâm', 'TRƯỜNG TIỂU HỌC BÌNH NHÂM', 'Số 02 Đường Cách Mạng Tháng Tám, Phường Lái Thiêu, Thành phố Hồ Chí Minh, Việt Nam', '3701470030', 0),
  ('Bình Thuận', 'TRƯỜNG TIỂU HỌC BÌNH THUẬN', 'Số 3/666 Thủ Khoa Huân, khu phố Hòa Lân 1, Phường Thuận Giao, Thành phố Hồ Chí Minh, Việt Nam.', '3702394167', 0),
  ('Bùi thị xuân', 'TRƯỜNG TIỂU HỌC BÙI THỊ XUÂN', 'Đường Lê Văn Mầm, Khu phố Đông Thành, Phường Tân Đông Hiệp, TP.HCM, Việt Nam', '3702925146', 0),
  ('Chánh nghĩa', 'TRƯỜNG TIỂU HỌC CHÁNH NGHĨA', ' Khu phố Chánh Nghĩa 5, Phường Thủ Dầu Một, TP Hồ Chí Minh', '3701478417', 0),
  ('công đoan HC 5', 'CÔNG ĐOÀN CƠ SỞ TRƯỜNG MẦM NON HOA CÚC 5', 'KP Hòa Long, TT Lái Thiêu, Thành phố Thuận An, Tỉnh Bình Dương, Việt Nam', '3701468627', 0),
  ('cơ sở 1 Petucky', 'Trường Trung - Tiểu Học Pétrus Ký', '704 CMT8, Phường Thủ Dầu Một, TP Hồ Chí Minh', '3700939665', 0),
  ('Cơ sở 2 Petucky', 'TRƯỜNG TRUNG - TIỂU HỌC PÉTRUS KÝ', '704 CMT8, Phường Thủ Dầu Một, Thành Phố Hồ Chí Minh, Việt Nam', '3700939665', 0),
  ('Cơ sở Mở rộng Petucky', 'TRƯỜNG TRUNG - TIỂU HỌC PÉTRUS KÝ', '704 CMT8, Phường Thủ Dầu Một, Thành Phố Hồ Chí Minh, Việt Nam', '3700939665', 0),
  ('cty Trường Hải Bình dương THACO', 'CTY TNHH THACO AUTO BÌNH DƯƠNG', 'Số 56/9 Đại lộ Bình Dương, Tổ 15, Khu phố  Bình Giao, Phường Thuận Giao, Thành phố Thuận An, Tỉnh Bình Dương, Việt Nam', '3701732783', 0),
  ('DA', 'TRƯỜNG TIỂU HỌC DĨ AN', 'Số 345 Đường Nguyễn An Ninh, khu phố Đông Tân, Phường Dĩ An, TP.HCM , Việt Nam', '3701407053', 0),
  ('DA B', 'TRƯỜNG TIỂU HỌC DĨ AN B', 'khu phố Đông Tân, Đường Nguyễn An Ninh,  Phường Dĩ An, Thành Phố Hồ Chí Minh, Việt Nam', '3703047060', 0),
  ('DA C', 'TRƯỜNG TIỂU HỌC DĨ AN C', 'Khu phố Thống Nhất 1, Phường Dĩ An, TP.HCM , Việt Nam', '3703040650', 0),
  ('ĐH', 'Trường Tiểu Học Đông Hòa', 'Đường Nguyễn Hữu Cảnh, Phường Đông Hòa, TP Hồ Chí Minh', '3701424186', 0),
  ('Đinh Hòa', 'TRƯỜNG TIỂU HỌC ĐỊNH HÒA', '46/28 khu phố Định Hòa 3, Phường Chánh Hiệp, TP Hồ Chí Minh, Việt Nam', '3700784669', 0),
  ('ĐỊNH HÒA 2 TDM', 'Trường Tiểu học Định Hòa 2', 'Đường Nguyễn Văn Thành, khu phố 7, Phường Chánh Hiệp, TP Hồ Chí Minh', '3703149986', 0),
  ('Định phước', 'Trường Tiểu Học Định Phước', 'ấp 1, Phường Hòa Lợi, TP Hồ Chí Minh', '3701636991', 0),
  ('Đông hòa B', 'Trường Tiểu Học Đông Hòa B', 'Nguyễn Bỉnh Khiêm, khu phố Tân Hòa, Phường Đông Hòa, TP Hồ Chí Minh', '3702874572', 0),
  ('Đông Hòa C', 'TRƯỜNG TIỂU HỌC ĐÔNG HÒA C', 'Khu phố Đông A, Phường Đông Hòa, Thành phố  Hồ Chí Minh, Việt Nam', '3702915148', 0),
  ('ĐTĐ', 'TRƯỜNG TIỂU HỌC ĐOÀN THỊ ĐIỂM', 'Khu phố Bình Thung 2, Phường  Đông Hòa, Thành phố  Hồ Chí Minh, Việt Nam', '3702888127', 12180000),
  ('HC 1', 'Trường Mầm Non Hoa Cúc 1', 'Nguyễn Văn Tiết, KP Bình Hòa, Phường Lái Thiêu, TP Hồ Chí Minh', '3701470048', 0),
  ('HC 10', 'TRƯỜNG MẦM NON HOA CÚC 10', 'Số 68/2, Đường An Phú 13, Khu phố 1B, Phường An Phú, TP Hồ Chí Minh', '3702906432', 0),
  ('HC 2', 'TRƯỜNG MẦM NON HOA CÚC 2', 'A9H khu phố Bình Phước, Phường Lái Thiêu, TP.HCM, Việt Nam', '3701470288', 2760000),
  ('HC 3', 'Trường Mẫu Giáo Hoa Cúc 3', 'Nguyễn Văn Tiết, KP Bình Hòa, Phường Lái Thiêu, TP Hồ Chí Minh', '3701469701', 0),
  ('HC 4', 'Trường Mẫu Giáo Hoa Cúc 4', 'ấp 1A, Phường An Phú, TP Hồ Chí Minh', '3701469797', 0),
  ('HC 5', 'Trường mầm non Hoa Cúc 5', 'KP Hòa Long, TT Lái Thiêu, Phường Lái Thiêu, TP Hồ Chí Minh', '3701468627', 0),
  ('HC 6', 'Trường Mầm Non Hoa Cúc 6', '79/6 khu phố Trung, Phường Bình Hòa, TP Hồ Chí Minh', '3701470263', 0),
  ('HC 7', 'Trường Mầm Non Hoa Cúc 7', 'KP Đông Ba, Phường Bình Hòa, TP Hồ Chí Minh', '3701470023', 0),
  ('HC 9', 'Trường Mầm Non Hoa Cúc 9', 'KP Bình Đức  1, Phường Bình Hòa, TP Hồ Chí Minh', '3702300634', 0),
  ('HĐ', 'TRƯỜNG TIỂU HỌC HƯNG ĐỊNH', 'Số 09 Đường Cách Mạng Tháng Tám, Phường Thuận An, TP Hồ Chí Minh, Việt Nam', '3701468948', 0),
  ('HL', 'TRƯỜNG TIỂU HỌC HƯNG LỘC', '299C Đường Hưng Định 24, Phường Thuận An, Thành Phố Hồ Chí Minh', '3702618794', 0),
  ('HM 1', 'Trường Mầm Non Hoa Mai I', 'Số 229A, Đường Thủ Khoa Huân, Khu phố Thạnh Hòa A, Phường Thuận An, TP Hồ Chí Minh', '3701468962', 0),
  ('HM 3', 'Trường Mầm Non Hoa Mai 3', 'Số  121A, đường An Sơn 02, Phường Thuận An, TP Hồ Chí Minh', '3701469980', 0),
  ('Hoa cúc 10 cơ sở 2', 'TRƯỜNG MẦM NON HOA CÚC 10 ( Cơ sở 2)', 'AN PHú 13, KP 1B, Phường An Phú, Thành phố Thuận An, Tỉnh Bình Dương, Việt Nam', '3702906432', 0),
  ('Hoa cúc 5 cơ sở 2', 'TRƯỜNG MẦM NON HOA CÚC 5 ( Cơ Sở 2)', 'Số 9A, KP. Bình Hòa, Phường Lái Thiêu, TP.HCM', '3701468627', 0),
  ('HOA CÚC 6 CÔNG  ĐOÀN', 'CÔNG ĐOÀN CƠ SỞ TRƯỜNG MẦM NON HOA CÚC 6', 'KP Trung, P- Vĩnh Phú, Thành phố Thuận An, Tỉnh Bình Dương, Việt Nam', null, 0),
  ('Hoa cúc 9 cơ sở 2', 'TRƯỜNG MẦM NON  HOA CÚC 9 (Cơ sở 2)', 'Khu phố Đông Ba, Phường Bình Hòa, Thành phố Thuận An, Tỉnh Bình Dương, Việt Nam', '3702300634', 0),
  ('Hoa mai 2', 'Trường Mầm non Hoa Mai 2', '399D, KP Hưng Lộc, Phường Thuận An, TP Hồ Chí Minh', '3701469973', 0),
  ('Hoa Mai 5', 'Trường Mầm non Hoa Mai 5', 'KP Bình Phước A, Phường An Phú, TP Hồ Chí Minh', '3701468514', 0),
  ('Hồ  văn  Mên', 'TRƯỜNG TIỂU HỌC HỒ VĂN MÊN', 'Số 19 Đường An Thạnh 16, Khu phố Thạnh Lợi, Phường Thuận An, Thành phố Hồ Chí Minh, Việt Nam', '3702384754', 0),
  ('HT', 'TRƯỜNG TIỂU HỌC HIỆP THÀNH', 'Số 183 Phạm Ngọc Thạch, Phường Phú Lợi, Thành phố Hồ Chí Minh, Việt Nam', '3701478544', 0),
  ('Lái Thiêu', 'TRƯỜNG TIỂU HỌC LÁI THIÊU', 'Số 11 Đường Lái Thiêu 09, khu phố Bình Hòa, Phường Lái Thiêu, Thành phố Hồ Chí Minh, Việt Nam', '3701468761', 0),
  ('Le Duc Tho', 'Trường Tiểu Học Lê Đức Thọ', '688/57/44 Lê Đức Thọ, Phường An Hội Đông, TP Hồ Chí Minh', '0313369596', 0),
  ('lê thị trung', 'TRƯỜNG TIỂU HỌC LÊ THỊ TRUNG ', '79/21 Đường Bình Chuẩn 63, Khu phố Bình Phước B, Phường An Phú, TP.HCM, Việt Nam', '3702378581', 0),
  ('lê thị trung 123', 'TRƯỜNG TIỂU HỌC LÊ THỊ TRUNG (khối 1,2,3)', '79/21 Đường Bình Chuẩn 63, Khu phố Bình Phước B, Phường An Phú, TP.HCM, Việt Nam', '3702378581', 0),
  ('lê thị trung 4,5', 'TRƯỜNG TIỂU HỌC LÊ THỊ TRUNG (khối 4,5)', '79/21 Đường Bình Chuẩn 63, Khu phố Bình Phước B, Phường An Phú, TP.HCM, Việt Nam', '3702378581', 0),
  ('LHPhong', 'TRƯỜNG TIỂU HỌC BÁN TRÚ LÊ HỒNG PHONG', 'số 266 đường Phạm Ngũ Lão, phường Hiệp Thành, Thành phố Thủ Dầu Một, Tỉnh Bình Dương, Việt Nam', '3700784676', 0),
  ('LQĐ (DA)', 'Trường Tiểu Học Lê Quý Đôn', 'Kp Thắng Lợi 2, Phường Dĩ An, TP Hồ Chí Minh', '3701409477', 0),
  ('LQD GV', 'Trường Tiểu Học Lê Quý Đôn', '237/63 Phạm Văn Chiêu, Phường An Hội Tây, TP Hồ Chí Minh', '0312898364', 0),
  ('LTK', 'TRƯỜNG TIỂU HỌC LÝ THƯỜNG KIỆT', 'Đường Lý Thường Kiệt, Kp Đông Tân, Thành phố Dĩ An, Tỉnh Bình Dương, Việt Nam', '3701408226', 0),
  ('LTV', 'TRƯỜNG TIỂU HỌC LƯƠNG THẾ VINH', 'Số 28/2F Khu phố Thạnh Bình,  Phường Thuận An, TP Hồ Chí Minh, Việt Nam.', '3701468673', 0),
  ('lương thế vinh gò vấp', 'Trường Tiểu Học Lương Thế Vinh', '2 Đường 13, Phường Thông Tây Hội, TP Hồ Chí Minh', '0306520084', 0),
  ('MN ĐTL', 'TRƯỜNG MẦN NON ĐOÀN THỊ LIÊN', '150 Đường Đoàn Thị Liên, Phú Lợi, Phường Phú Lợi, Thành phố Thủ Dầu Một, Tỉnh Bình Dương, Việt Nam', '3700689662', 0),
  ('NĐ', 'TRƯỜNG TIỂU HỌC NHỊ ĐỒNG', 'Đường Nguyễn An Ninh, khu phố Nhị Đồng, Phường Dĩ An, TP.HCM, Việt Nam', '3701471098', 0),
  ('Nguyễn Bỉnh Khiêm', 'TRƯỜNG TIỂU HỌC NGUYỄN BỈNH KHIÊM', 'Quốc lộ 1K, khu phố Tân Hòa,  Phường Đông Hòa, TP.HCM, Việt Nam', '3701422365', 0),
  ('Nguyễn Hiền', 'TRƯỜNG TIỂU HỌC NGUYỄN HIỀN', '377 Phan Đăng Lưu, khu phố Hiệp An 3, Phường Phú An, Thành phố Hồ Chí Minh, Việt Nam', '3701478590', 0),
  ('Nguyễn Thượng Hiền', 'Trường Tiểu Học Nguyễn Thượng Hiền', '76 Nguyễn Thượng Hiền, Phường Hạnh Thông, TP Hồ Chí Minh', '0306462918', 0),
  ('PCT', 'TRƯỜNG TIỂU HỌC PHAN CHU TRINH', 'Số 294B  Đường 3/2 Khu phố Nguyễn Trãi, Phường Lái Thiêu, Thành phố Hồ Chí Minh, Việt Nam', '3700744881', 0),
  ('PH 1', 'TRƯỜNG TIỂU HỌC PHÚ HÒA  1', '172 đường Trần Văn Ơn, Khu phố phú Hòa  5, Phường Phú Lợi, TP Hồ Chí Minh,Việt Nam', '3701478583', 0),
  ('PH 2', 'TRƯỜNG TIỂU HỌC PHÚ HÒA 2', 'Số 14 đường Nguyễn Thị Minh Khai, khu 8, Phường Phú Lợi, TP Hồ Chí Minh', '3700787902', 0),
  ('Phú Mỹ', 'TRƯỜNG TIỂU HỌC PHÚ MỸ', 'Số 116 đường An Mỹ - Phú Mỹ, khu phố Phú Mỹ 3, Phường Bình Dương, TP Hồ Chí Minh, Việt Nam', '3701478431', 0),
  ('PHÚ THỌ TDM', 'TRƯỜNG TIỂU HỌC PHÚ THỌ', '1025 Đường Lê Hồng Phong, Phường Thủ Dầu Một, TP Hồ Chí Minh, Việt Nam.', '3701478576', 0),
  ('PL', 'TRƯỜNG TIỂU HỌC PHÚ LONG', 'Khu phố Hòa Long,  Phường Lái Thiêu, Thành phố Hồ Chí Minh, Việt Nam.', '3701468923', 0),
  ('Tân Định', 'Trường Tiểu Học Tân Định', 'ấp 2, Tân Định, Phường Hòa Lợi, TP Hồ Chí Minh', '3701625037', 0),
  ('TB', 'TRƯỜNG TIỂU HỌC TÂN BÌNH', 'Khu Phố Tân Thắng, Phường Tân Đông Hiệp, TP.HCM, Việt Nam', '3701404831', 0),
  ('TG', 'Trường Tiểu Học Thuận Giao', 'T 13/13M tổ 13, khu phố Bình Thuận 2, Phường Thuận Giao, TP Hồ Chí Minh', '3701468867', 0),
  ('TH chi lăng', 'Trường Tiểu Học Chi Lăng', '645/2 Quang Trung, Phường Thông Tây Hội, TP Hồ Chí Minh', '0306402387', 0),
  ('Thuận giao 2', 'TRƯỜNG TIỂU HỌC THUẬN GIAO 2', 'KP. Hòa Lân 1, Phường Thuận Giao, Thành phố Hồ Chí Minh, Việt Nam', '3702475659', 0),
  ('TQK', 'Trường Tiểu Học Trần Quang Khải', '226/43/31 Nguyễn Văn Lượng, Phường Gò Vấp, TP Hồ Chí Minh', '0306657554', 0),
  ('TQT', 'TRƯỜNG TIỂU HỌC TRẦN QUỐC TOẢN', 'Số B44 đường Lái Thiêu 64, khu phố Bình Đức2, Phường Lái Thiêu, TP Hồ Chí Minh', '3701490573', 0),
  ('Trường Hải Bình dương', 'CÔNG TY TNHH MỘT THÀNH VIÊN TRƯỜNG HẢI - BÌNH DƯƠNG', 'Số 56/9 Đại lộ Bình Dương, Tổ 15, Khu phố  Bình Giao, Phường Thuận Giao, Thành phố Thuận An, Tỉnh Bình Dương, Việt Nam', '3701732783', 0),
  ('Tuy An', 'TRƯỜNG TIỂU HỌC TUY AN', 'Số 299/3 Đường An Phú 06, Khu phố 2, Phường An Phú, Thành phố Hồ Chí Minh, Việt Nam', '3702615948', 0),
  ('VPHU', 'TRƯỜNG TIỂU HỌC VĨNH PHÚ', ' Số 79/15  đường Vĩnh  Phú 37, Khu phố Tây, Phường Lái Thiêu, TP.HCM, Việt Nam', '3701470009', 0),
  ('VTSAU', 'Trường Tiểu Học Võ Thị Sáu', '17 Đường số 9, Phường An Hội Đông, TP Hồ Chí Minh', '0306512446', 0)
) as v(code, name, address, tax_code, opening_debt)
where not exists (select 1 from customers c where c.school_code = v.code);

-- ============================================================
-- 3. Công Nợ Khách Hàng (Customer AR) — bảng ledger mới, tách biệt hoàn toàn
--    khỏi công nợ nội bộ. flow hỗ trợ sẵn 4 luồng để lọc xuất hoá đơn VAT sau
--    này (yêu cầu mở rộng kiến trúc), dù hiện tại chỉ 'school' có dữ liệu.
-- ============================================================
create table if not exists public.customer_debt_entries (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete restrict,
  order_id uuid references public.orders(id) on delete set null,
  entry_type text not null check(entry_type in ('opening','order_charge','payment','adjustment')),
  flow text not null default 'school' check(flow in ('bakery','macaron','teabreak','school')),
  base_amount numeric(14,0) not null default 0,
  vat_amount numeric(14,0) not null default 0,
  amount numeric(14,0) not null, -- hiệu ứng ròng lên công nợ: +tăng (charge/opening dương), -giảm (payment)
  photo_url text,
  note text,
  created_by uuid references public.profiles(id) on delete set null,
  created_by_name text,
  created_at timestamptz not null default now()
);
create index if not exists idx_customer_debt_entries_customer on public.customer_debt_entries(customer_id, created_at desc);
create index if not exists idx_customer_debt_entries_order on public.customer_debt_entries(order_id);

-- Số dư công nợ hiện tại mỗi khách hàng trường học (view, luôn tính lại từ ledger).
create or replace view public.customer_debt_balances as
select c.id as customer_id, c.name, c.school_code, c.tax_code, c.address,
  coalesce(sum(d.amount), 0) as balance,
  max(d.created_at) as last_entry_at
from public.customers c
join public.customer_debt_entries d on d.customer_id = c.id
where c.is_school = true
group by c.id, c.name, c.school_code, c.tax_code, c.address;

-- Công nợ mở đầu (import từ file trường học, chỉ 2 trường có dư nợ sẵn khi import).
insert into public.customer_debt_entries (customer_id, entry_type, flow, base_amount, vat_amount, amount, note)
select c.id, 'opening', 'school', v.opening_debt, 0, v.opening_debt, 'Công nợ mở đầu — import từ danh sách khách hàng trường học'
from (values
  ('1TĐH', 'TRƯỜNG TIỂU HỌC TÂN ĐÔNG HIỆP', 'Đường Lê Hồng Phong , KP Đông Thành, phường Tân Đông Hiệp, TP.HCM, Việt Nam', '3701404849', 0),
  ('2TĐH B', 'TRƯỜNG TIỂU HỌC TÂN ĐÔNG HIỆP B', 'Khu phố Đông Chiêu, Phường Dĩ An, TP.HCM,  Việt Nam', '3702414945', 0),
  ('3700145694', 'CÔNG TY CP - TỔNG CÔNG TY NƯỚC - MÔI TRƯỜNG BÌNH DƯƠNG', 'Số 11, Ngô Văn Trị, Phường Phú Lợi, TP Hồ Chí Minh', '3700145694', 0),
  ('3700271265', 'Trường Trung Học Phổ Thông Thái Hòa', 'Khu Phố An Thành, Phường Tân Khánh, TP Hồ Chí Minh, Việt Nam', '3700271265', 0),
  ('3700275196', 'Trường THPT Nguyễn An Ninh-Bình Dương', 'Khu phố Bình Đường 2, Phường Dĩ An, TP Hồ Chí Minh', '3700275196', 0),
  ('3701468514', 'Trường Mầm non Hoa Mai 5', 'KP Bình Phước A, Phường An Phú, TP Hồ Chí Minh', '3701468514', 0),
  ('3TĐH C', 'TRƯỜNG TIỂU HỌC TÂN ĐÔNG HIỆP C', 'Khu phố Đông Thành, Phường Tân Đông Hiệp, TP.HCM, Việt Nam', '3702915194', 0),
  ('AB', 'TRƯỜNG TIỂU HỌC AN BÌNH', 'Số 60, Quốc lộ 1A, khu phố Bình Đường 1, Phường Dĩ An, TP.HCM, Việt Nam', '3701408931', 0),
  ('AB B', 'TRƯỜNG TIỂU HỌC AN BÌNH B', 'KP Bình Đường 2, Phường Dĩ An, Thành Phố Hồ Chí Minh, Việt Nam', '3703054893', 0),
  ('AN HỘI GÒ VẤP', 'Trường Tiểu Học An Hội', 'Số 2 Phạm Văn Chiêu, Phường Thông Tây Hội, TP Hồ Chí Minh', '0306394915', 0),
  ('an phú 2', 'TRƯỜNG TIỂU HỌC AN PHÚ 2', 'Số 298/3, đường An Phú 35, tổ 14, khu phố 2, Phường An Phú, TP Hồ Chí Minh', '3702808442', 0),
  ('an phú 3', 'TRƯỜNG TIỂU HỌC AN PHÚ 3', '404/1, đường Lê Thị Trung, khu phố 1A, Phường An Phú, TP Hồ Chí Minh,Việt Nam', '3703149182', 0),
  ('AP', 'Trường Tiểu Học An Phú', '10/2 đường An Phú 10, tổ 6, khu phố 1B, Phường An Phú, TP Hồ Chí Minh', '3701469719', 0),
  ('AS', 'Trường Tiểu Học An Sơn', 'Số 122, đường An Sơn 01, Phường Thuận An, TP Hồ Chí Minh', '3701469733', 0),
  ('AT', 'TRƯỜNG TIỂU HỌC AN THẠNH', 'Số 266/3F, Đường An Thạnh 51, Phường Thuận An, Thành phố Hồ Chí Minh', '3701470270', 0),
  ('BA', 'TRƯỜNG TIỂU HỌC BÌNH AN', 'Quốc lộ 1K, Khu phố Nội Hóa 2, Phường Đông Hòa, TP.HCM, Việt Nam', '3701490527', 0),
  ('ban đại diện', 'Ban đại diện trường Mầm Non Hoa Cúc 5', null, 'Hoa cúc 5', 0),
  ('BH', 'TRƯỜNG TIỂU HỌC BÌNH HÒA', '2A/T1 Tổ 2A Khu Phố  Bình Đức 1, Phường Bình Hòa, TP HCM, Việt Nam', '3701469691', 0),
  ('BH 2', 'TRƯỜNG TIỂU HỌC BÌNH HÒA 2', '3A/T1, Tổ 3A, Khu phố Bình Đức 1,Phường Bình Hòa, Thành phố Hồ Chí Minh', '3702412289', 0),
  ('Bình Chuẩn', 'TRƯỜNG TIỂU HỌC BÌNH CHUẨN', 'Khu phố Bình Phú, Phường Thuận Giao, Thành phố Hồ Chí Minh, Việt Nam', '3701468560', 0),
  ('Bình chuẩn 2', 'TRƯỜNG TIỂU HỌC BÌNH CHUẨN 2', 'Số 169/2 Đường PKV 57, Khu phố Bình Quới B, Phường Thuận Giao, TP Hồ Chí Minh', '3702993555', 0),
  ('Bình Nhâm', 'TRƯỜNG TIỂU HỌC BÌNH NHÂM', 'Số 02 Đường Cách Mạng Tháng Tám, Phường Lái Thiêu, Thành phố Hồ Chí Minh, Việt Nam', '3701470030', 0),
  ('Bình Thuận', 'TRƯỜNG TIỂU HỌC BÌNH THUẬN', 'Số 3/666 Thủ Khoa Huân, khu phố Hòa Lân 1, Phường Thuận Giao, Thành phố Hồ Chí Minh, Việt Nam.', '3702394167', 0),
  ('Bùi thị xuân', 'TRƯỜNG TIỂU HỌC BÙI THỊ XUÂN', 'Đường Lê Văn Mầm, Khu phố Đông Thành, Phường Tân Đông Hiệp, TP.HCM, Việt Nam', '3702925146', 0),
  ('Chánh nghĩa', 'TRƯỜNG TIỂU HỌC CHÁNH NGHĨA', ' Khu phố Chánh Nghĩa 5, Phường Thủ Dầu Một, TP Hồ Chí Minh', '3701478417', 0),
  ('công đoan HC 5', 'CÔNG ĐOÀN CƠ SỞ TRƯỜNG MẦM NON HOA CÚC 5', 'KP Hòa Long, TT Lái Thiêu, Thành phố Thuận An, Tỉnh Bình Dương, Việt Nam', '3701468627', 0),
  ('cơ sở 1 Petucky', 'Trường Trung - Tiểu Học Pétrus Ký', '704 CMT8, Phường Thủ Dầu Một, TP Hồ Chí Minh', '3700939665', 0),
  ('Cơ sở 2 Petucky', 'TRƯỜNG TRUNG - TIỂU HỌC PÉTRUS KÝ', '704 CMT8, Phường Thủ Dầu Một, Thành Phố Hồ Chí Minh, Việt Nam', '3700939665', 0),
  ('Cơ sở Mở rộng Petucky', 'TRƯỜNG TRUNG - TIỂU HỌC PÉTRUS KÝ', '704 CMT8, Phường Thủ Dầu Một, Thành Phố Hồ Chí Minh, Việt Nam', '3700939665', 0),
  ('cty Trường Hải Bình dương THACO', 'CTY TNHH THACO AUTO BÌNH DƯƠNG', 'Số 56/9 Đại lộ Bình Dương, Tổ 15, Khu phố  Bình Giao, Phường Thuận Giao, Thành phố Thuận An, Tỉnh Bình Dương, Việt Nam', '3701732783', 0),
  ('DA', 'TRƯỜNG TIỂU HỌC DĨ AN', 'Số 345 Đường Nguyễn An Ninh, khu phố Đông Tân, Phường Dĩ An, TP.HCM , Việt Nam', '3701407053', 0),
  ('DA B', 'TRƯỜNG TIỂU HỌC DĨ AN B', 'khu phố Đông Tân, Đường Nguyễn An Ninh,  Phường Dĩ An, Thành Phố Hồ Chí Minh, Việt Nam', '3703047060', 0),
  ('DA C', 'TRƯỜNG TIỂU HỌC DĨ AN C', 'Khu phố Thống Nhất 1, Phường Dĩ An, TP.HCM , Việt Nam', '3703040650', 0),
  ('ĐH', 'Trường Tiểu Học Đông Hòa', 'Đường Nguyễn Hữu Cảnh, Phường Đông Hòa, TP Hồ Chí Minh', '3701424186', 0),
  ('Đinh Hòa', 'TRƯỜNG TIỂU HỌC ĐỊNH HÒA', '46/28 khu phố Định Hòa 3, Phường Chánh Hiệp, TP Hồ Chí Minh, Việt Nam', '3700784669', 0),
  ('ĐỊNH HÒA 2 TDM', 'Trường Tiểu học Định Hòa 2', 'Đường Nguyễn Văn Thành, khu phố 7, Phường Chánh Hiệp, TP Hồ Chí Minh', '3703149986', 0),
  ('Định phước', 'Trường Tiểu Học Định Phước', 'ấp 1, Phường Hòa Lợi, TP Hồ Chí Minh', '3701636991', 0),
  ('Đông hòa B', 'Trường Tiểu Học Đông Hòa B', 'Nguyễn Bỉnh Khiêm, khu phố Tân Hòa, Phường Đông Hòa, TP Hồ Chí Minh', '3702874572', 0),
  ('Đông Hòa C', 'TRƯỜNG TIỂU HỌC ĐÔNG HÒA C', 'Khu phố Đông A, Phường Đông Hòa, Thành phố  Hồ Chí Minh, Việt Nam', '3702915148', 0),
  ('ĐTĐ', 'TRƯỜNG TIỂU HỌC ĐOÀN THỊ ĐIỂM', 'Khu phố Bình Thung 2, Phường  Đông Hòa, Thành phố  Hồ Chí Minh, Việt Nam', '3702888127', 12180000),
  ('HC 1', 'Trường Mầm Non Hoa Cúc 1', 'Nguyễn Văn Tiết, KP Bình Hòa, Phường Lái Thiêu, TP Hồ Chí Minh', '3701470048', 0),
  ('HC 10', 'TRƯỜNG MẦM NON HOA CÚC 10', 'Số 68/2, Đường An Phú 13, Khu phố 1B, Phường An Phú, TP Hồ Chí Minh', '3702906432', 0),
  ('HC 2', 'TRƯỜNG MẦM NON HOA CÚC 2', 'A9H khu phố Bình Phước, Phường Lái Thiêu, TP.HCM, Việt Nam', '3701470288', 2760000),
  ('HC 3', 'Trường Mẫu Giáo Hoa Cúc 3', 'Nguyễn Văn Tiết, KP Bình Hòa, Phường Lái Thiêu, TP Hồ Chí Minh', '3701469701', 0),
  ('HC 4', 'Trường Mẫu Giáo Hoa Cúc 4', 'ấp 1A, Phường An Phú, TP Hồ Chí Minh', '3701469797', 0),
  ('HC 5', 'Trường mầm non Hoa Cúc 5', 'KP Hòa Long, TT Lái Thiêu, Phường Lái Thiêu, TP Hồ Chí Minh', '3701468627', 0),
  ('HC 6', 'Trường Mầm Non Hoa Cúc 6', '79/6 khu phố Trung, Phường Bình Hòa, TP Hồ Chí Minh', '3701470263', 0),
  ('HC 7', 'Trường Mầm Non Hoa Cúc 7', 'KP Đông Ba, Phường Bình Hòa, TP Hồ Chí Minh', '3701470023', 0),
  ('HC 9', 'Trường Mầm Non Hoa Cúc 9', 'KP Bình Đức  1, Phường Bình Hòa, TP Hồ Chí Minh', '3702300634', 0),
  ('HĐ', 'TRƯỜNG TIỂU HỌC HƯNG ĐỊNH', 'Số 09 Đường Cách Mạng Tháng Tám, Phường Thuận An, TP Hồ Chí Minh, Việt Nam', '3701468948', 0),
  ('HL', 'TRƯỜNG TIỂU HỌC HƯNG LỘC', '299C Đường Hưng Định 24, Phường Thuận An, Thành Phố Hồ Chí Minh', '3702618794', 0),
  ('HM 1', 'Trường Mầm Non Hoa Mai I', 'Số 229A, Đường Thủ Khoa Huân, Khu phố Thạnh Hòa A, Phường Thuận An, TP Hồ Chí Minh', '3701468962', 0),
  ('HM 3', 'Trường Mầm Non Hoa Mai 3', 'Số  121A, đường An Sơn 02, Phường Thuận An, TP Hồ Chí Minh', '3701469980', 0),
  ('Hoa cúc 10 cơ sở 2', 'TRƯỜNG MẦM NON HOA CÚC 10 ( Cơ sở 2)', 'AN PHú 13, KP 1B, Phường An Phú, Thành phố Thuận An, Tỉnh Bình Dương, Việt Nam', '3702906432', 0),
  ('Hoa cúc 5 cơ sở 2', 'TRƯỜNG MẦM NON HOA CÚC 5 ( Cơ Sở 2)', 'Số 9A, KP. Bình Hòa, Phường Lái Thiêu, TP.HCM', '3701468627', 0),
  ('HOA CÚC 6 CÔNG  ĐOÀN', 'CÔNG ĐOÀN CƠ SỞ TRƯỜNG MẦM NON HOA CÚC 6', 'KP Trung, P- Vĩnh Phú, Thành phố Thuận An, Tỉnh Bình Dương, Việt Nam', null, 0),
  ('Hoa cúc 9 cơ sở 2', 'TRƯỜNG MẦM NON  HOA CÚC 9 (Cơ sở 2)', 'Khu phố Đông Ba, Phường Bình Hòa, Thành phố Thuận An, Tỉnh Bình Dương, Việt Nam', '3702300634', 0),
  ('Hoa mai 2', 'Trường Mầm non Hoa Mai 2', '399D, KP Hưng Lộc, Phường Thuận An, TP Hồ Chí Minh', '3701469973', 0),
  ('Hoa Mai 5', 'Trường Mầm non Hoa Mai 5', 'KP Bình Phước A, Phường An Phú, TP Hồ Chí Minh', '3701468514', 0),
  ('Hồ  văn  Mên', 'TRƯỜNG TIỂU HỌC HỒ VĂN MÊN', 'Số 19 Đường An Thạnh 16, Khu phố Thạnh Lợi, Phường Thuận An, Thành phố Hồ Chí Minh, Việt Nam', '3702384754', 0),
  ('HT', 'TRƯỜNG TIỂU HỌC HIỆP THÀNH', 'Số 183 Phạm Ngọc Thạch, Phường Phú Lợi, Thành phố Hồ Chí Minh, Việt Nam', '3701478544', 0),
  ('Lái Thiêu', 'TRƯỜNG TIỂU HỌC LÁI THIÊU', 'Số 11 Đường Lái Thiêu 09, khu phố Bình Hòa, Phường Lái Thiêu, Thành phố Hồ Chí Minh, Việt Nam', '3701468761', 0),
  ('Le Duc Tho', 'Trường Tiểu Học Lê Đức Thọ', '688/57/44 Lê Đức Thọ, Phường An Hội Đông, TP Hồ Chí Minh', '0313369596', 0),
  ('lê thị trung', 'TRƯỜNG TIỂU HỌC LÊ THỊ TRUNG ', '79/21 Đường Bình Chuẩn 63, Khu phố Bình Phước B, Phường An Phú, TP.HCM, Việt Nam', '3702378581', 0),
  ('lê thị trung 123', 'TRƯỜNG TIỂU HỌC LÊ THỊ TRUNG (khối 1,2,3)', '79/21 Đường Bình Chuẩn 63, Khu phố Bình Phước B, Phường An Phú, TP.HCM, Việt Nam', '3702378581', 0),
  ('lê thị trung 4,5', 'TRƯỜNG TIỂU HỌC LÊ THỊ TRUNG (khối 4,5)', '79/21 Đường Bình Chuẩn 63, Khu phố Bình Phước B, Phường An Phú, TP.HCM, Việt Nam', '3702378581', 0),
  ('LHPhong', 'TRƯỜNG TIỂU HỌC BÁN TRÚ LÊ HỒNG PHONG', 'số 266 đường Phạm Ngũ Lão, phường Hiệp Thành, Thành phố Thủ Dầu Một, Tỉnh Bình Dương, Việt Nam', '3700784676', 0),
  ('LQĐ (DA)', 'Trường Tiểu Học Lê Quý Đôn', 'Kp Thắng Lợi 2, Phường Dĩ An, TP Hồ Chí Minh', '3701409477', 0),
  ('LQD GV', 'Trường Tiểu Học Lê Quý Đôn', '237/63 Phạm Văn Chiêu, Phường An Hội Tây, TP Hồ Chí Minh', '0312898364', 0),
  ('LTK', 'TRƯỜNG TIỂU HỌC LÝ THƯỜNG KIỆT', 'Đường Lý Thường Kiệt, Kp Đông Tân, Thành phố Dĩ An, Tỉnh Bình Dương, Việt Nam', '3701408226', 0),
  ('LTV', 'TRƯỜNG TIỂU HỌC LƯƠNG THẾ VINH', 'Số 28/2F Khu phố Thạnh Bình,  Phường Thuận An, TP Hồ Chí Minh, Việt Nam.', '3701468673', 0),
  ('lương thế vinh gò vấp', 'Trường Tiểu Học Lương Thế Vinh', '2 Đường 13, Phường Thông Tây Hội, TP Hồ Chí Minh', '0306520084', 0),
  ('MN ĐTL', 'TRƯỜNG MẦN NON ĐOÀN THỊ LIÊN', '150 Đường Đoàn Thị Liên, Phú Lợi, Phường Phú Lợi, Thành phố Thủ Dầu Một, Tỉnh Bình Dương, Việt Nam', '3700689662', 0),
  ('NĐ', 'TRƯỜNG TIỂU HỌC NHỊ ĐỒNG', 'Đường Nguyễn An Ninh, khu phố Nhị Đồng, Phường Dĩ An, TP.HCM, Việt Nam', '3701471098', 0),
  ('Nguyễn Bỉnh Khiêm', 'TRƯỜNG TIỂU HỌC NGUYỄN BỈNH KHIÊM', 'Quốc lộ 1K, khu phố Tân Hòa,  Phường Đông Hòa, TP.HCM, Việt Nam', '3701422365', 0),
  ('Nguyễn Hiền', 'TRƯỜNG TIỂU HỌC NGUYỄN HIỀN', '377 Phan Đăng Lưu, khu phố Hiệp An 3, Phường Phú An, Thành phố Hồ Chí Minh, Việt Nam', '3701478590', 0),
  ('Nguyễn Thượng Hiền', 'Trường Tiểu Học Nguyễn Thượng Hiền', '76 Nguyễn Thượng Hiền, Phường Hạnh Thông, TP Hồ Chí Minh', '0306462918', 0),
  ('PCT', 'TRƯỜNG TIỂU HỌC PHAN CHU TRINH', 'Số 294B  Đường 3/2 Khu phố Nguyễn Trãi, Phường Lái Thiêu, Thành phố Hồ Chí Minh, Việt Nam', '3700744881', 0),
  ('PH 1', 'TRƯỜNG TIỂU HỌC PHÚ HÒA  1', '172 đường Trần Văn Ơn, Khu phố phú Hòa  5, Phường Phú Lợi, TP Hồ Chí Minh,Việt Nam', '3701478583', 0),
  ('PH 2', 'TRƯỜNG TIỂU HỌC PHÚ HÒA 2', 'Số 14 đường Nguyễn Thị Minh Khai, khu 8, Phường Phú Lợi, TP Hồ Chí Minh', '3700787902', 0),
  ('Phú Mỹ', 'TRƯỜNG TIỂU HỌC PHÚ MỸ', 'Số 116 đường An Mỹ - Phú Mỹ, khu phố Phú Mỹ 3, Phường Bình Dương, TP Hồ Chí Minh, Việt Nam', '3701478431', 0),
  ('PHÚ THỌ TDM', 'TRƯỜNG TIỂU HỌC PHÚ THỌ', '1025 Đường Lê Hồng Phong, Phường Thủ Dầu Một, TP Hồ Chí Minh, Việt Nam.', '3701478576', 0),
  ('PL', 'TRƯỜNG TIỂU HỌC PHÚ LONG', 'Khu phố Hòa Long,  Phường Lái Thiêu, Thành phố Hồ Chí Minh, Việt Nam.', '3701468923', 0),
  ('Tân Định', 'Trường Tiểu Học Tân Định', 'ấp 2, Tân Định, Phường Hòa Lợi, TP Hồ Chí Minh', '3701625037', 0),
  ('TB', 'TRƯỜNG TIỂU HỌC TÂN BÌNH', 'Khu Phố Tân Thắng, Phường Tân Đông Hiệp, TP.HCM, Việt Nam', '3701404831', 0),
  ('TG', 'Trường Tiểu Học Thuận Giao', 'T 13/13M tổ 13, khu phố Bình Thuận 2, Phường Thuận Giao, TP Hồ Chí Minh', '3701468867', 0),
  ('TH chi lăng', 'Trường Tiểu Học Chi Lăng', '645/2 Quang Trung, Phường Thông Tây Hội, TP Hồ Chí Minh', '0306402387', 0),
  ('Thuận giao 2', 'TRƯỜNG TIỂU HỌC THUẬN GIAO 2', 'KP. Hòa Lân 1, Phường Thuận Giao, Thành phố Hồ Chí Minh, Việt Nam', '3702475659', 0),
  ('TQK', 'Trường Tiểu Học Trần Quang Khải', '226/43/31 Nguyễn Văn Lượng, Phường Gò Vấp, TP Hồ Chí Minh', '0306657554', 0),
  ('TQT', 'TRƯỜNG TIỂU HỌC TRẦN QUỐC TOẢN', 'Số B44 đường Lái Thiêu 64, khu phố Bình Đức2, Phường Lái Thiêu, TP Hồ Chí Minh', '3701490573', 0),
  ('Trường Hải Bình dương', 'CÔNG TY TNHH MỘT THÀNH VIÊN TRƯỜNG HẢI - BÌNH DƯƠNG', 'Số 56/9 Đại lộ Bình Dương, Tổ 15, Khu phố  Bình Giao, Phường Thuận Giao, Thành phố Thuận An, Tỉnh Bình Dương, Việt Nam', '3701732783', 0),
  ('Tuy An', 'TRƯỜNG TIỂU HỌC TUY AN', 'Số 299/3 Đường An Phú 06, Khu phố 2, Phường An Phú, Thành phố Hồ Chí Minh, Việt Nam', '3702615948', 0),
  ('VPHU', 'TRƯỜNG TIỂU HỌC VĨNH PHÚ', ' Số 79/15  đường Vĩnh  Phú 37, Khu phố Tây, Phường Lái Thiêu, TP.HCM, Việt Nam', '3701470009', 0),
  ('VTSAU', 'Trường Tiểu Học Võ Thị Sáu', '17 Đường số 9, Phường An Hội Đông, TP Hồ Chí Minh', '0306512446', 0)
) as v(code, name, address, tax_code, opening_debt)
join public.customers c on c.school_code = v.code
where v.opening_debt > 0
  and not exists (
    select 1 from public.customer_debt_entries d
    where d.customer_id = c.id and d.entry_type = 'opening'
  );

-- ============================================================
-- 4. RBAC: chỉ Kế Toán (accountant) và Giám Đốc (owner) xem được Bảng Giá
--    trường học chi tiết & Công Nợ KH — KHÔNG dùng chung is_finance_operator()
--    (bao gồm cả admin/cashier) vì yêu cầu ở đây khắt khe hơn hẳn.
-- ============================================================
create or replace function public.is_accounting_or_director()
returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from public.profiles p where p.id=auth.uid() and p.approved=true and p.active is distinct from false
  and (p.role in ('owner','accountant') or p.extra_roles && array['owner','accountant']::text[]));
$$;
revoke all on function public.is_accounting_or_director() from public,anon,authenticated;
grant execute on function public.is_accounting_or_director() to authenticated;

alter table public.customer_debt_entries enable row level security;
drop policy if exists "chi ke toan giam doc xem cong no" on public.customer_debt_entries;
create policy "chi ke toan giam doc xem cong no" on public.customer_debt_entries
  for select using (public.is_accounting_or_director());
revoke all on public.customer_debt_entries from anon,authenticated;
grant select on public.customer_debt_entries to authenticated;
grant select on public.customer_debt_balances to authenticated;

-- ============================================================
-- 5. RPC: Kế toán ghi nhận đã thu tiền công nợ (bắt buộc ảnh chứng từ, giống
--    convention record_expense_claim/pay_salary_advance đã dùng cho công nợ
--    nội bộ) — giảm dư nợ của 1 trường.
-- ============================================================
create or replace function public.record_customer_debt_payment(
  p_idempotency_key text, p_customer_id uuid, p_amount numeric, p_photo_url text, p_note text default null
) returns public.customer_debt_entries language plpgsql security definer set search_path=public as $$
declare v_actor uuid; v_existing uuid; v_row public.customer_debt_entries%rowtype; v_name text;
begin
 if not public.is_accounting_or_director() then raise exception 'Chỉ Kế toán hoặc Giám đốc được ghi nhận thu công nợ'; end if;
 if p_amount<=0 then raise exception 'Số tiền thu phải lớn hơn 0'; end if;
 if coalesce(trim(p_photo_url),'')='' then raise exception 'Cần ảnh chứng từ thu tiền'; end if;
 v_actor := auth.uid();
 select id into v_existing from public.customer_debt_entries where note = 'idem:'||p_idempotency_key;
 if v_existing is not null then select * into v_row from public.customer_debt_entries where id=v_existing; return v_row; end if;
 select full_name into v_name from public.profiles where id=v_actor;
 insert into public.customer_debt_entries(customer_id,entry_type,flow,base_amount,vat_amount,amount,photo_url,note,created_by,created_by_name)
 values(p_customer_id,'payment','school',p_amount,0,-p_amount,p_photo_url,
   coalesce(nullif(trim(p_note),''),'Kế toán thu công nợ')||' · idem:'||p_idempotency_key,v_actor,v_name)
 returning * into v_row;
 return v_row;
end $$;
revoke all on function public.record_customer_debt_payment(text,uuid,numeric,text,text) from public,anon,authenticated;
grant execute on function public.record_customer_debt_payment(text,uuid,numeric,text,text) to authenticated;

-- ============================================================
-- 6. Tự động ghi Công Nợ khi đơn trường học giao thành công. Ảnh chứng từ lấy
--    từ kpi_logs (event_type='delivery_completed') — đây là nơi complete_
--    delivery_assignment() lưu ảnh thật, KHÔNG phải cột orders.delivery_photo_url
--    (cột đó không còn được luồng giao hàng V2 dùng nữa).
-- ============================================================
create or replace function public.trg_school_order_to_debt()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_customer uuid; v_photo text; v_base numeric; v_vat numeric;
begin
 if new.status_v2 is distinct from 'completed' or old.status_v2 = 'completed' then return new; end if;
 if new.order_type <> 'school' or new.customer_id is null then return new; end if;
 if exists (select 1 from public.customer_debt_entries where order_id = new.id) then return new; end if;
 select photo_url into v_photo from public.kpi_logs
  where order_id = new.id and event_type = 'delivery_completed' order by created_at desc limit 1;
 v_base := coalesce(new.total, 0);
 v_vat := round(v_base * 0.08);
 insert into public.customer_debt_entries(customer_id,order_id,entry_type,flow,base_amount,vat_amount,amount,photo_url,note)
 values(new.customer_id,new.id,'order_charge','school',v_base,v_vat,v_base+v_vat,v_photo,
   'Đơn '||coalesce(new.order_code,new.id::text)||' hoàn thành · gồm 8% VAT');
 return new;
end $$;
drop trigger if exists trg_school_order_to_debt on public.orders;
create trigger trg_school_order_to_debt after update of status_v2 on public.orders
for each row execute function public.trg_school_order_to_debt();

insert into public.migration_runs(migration_key, status, finished_at, notes)
values('202608300001_school_pricing_and_customer_debt', 'completed', now(),
  'School pricing (55 SM products + size variants), customers.school_code/tax_code, customer_debt_entries ledger (with 8% VAT auto-charge on school order completion), is_accounting_or_director() RBAC, record_customer_debt_payment RPC.')
on conflict(migration_key) do update set status='completed', finished_at=now(), notes=excluded.notes;

commit;
