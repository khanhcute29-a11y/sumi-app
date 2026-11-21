-- Bán tại quầy: nhập lại DANH SÁCH BÁNH CHUẨN từ KiotViet (chủ tiệm gửi 21/11/2026, 160 món — QL13 + VP42).
--  • Cả 160 món đã có sẵn trên hệ thống theo đúng Mã hàng KiotViet (đợt nhập KV 16/11), chỉ đang bị ẨN từ 18/11
--    → HIỆN lại, cập nhật Tên / Nhóm hàng / Giá bán đúng theo file. Không tạo món mới, không xoá dòng nào.
--  • Mọi món đang hiện ở quầy mà KHÔNG có trong file (vd món nhân viên tự tạo bị trùng) → ẨN khỏi quầy,
--    TRỪ món còn tồn ở quầy nào (giữ nguyên, báo ra ở bảng đối chiếu để kiểm kho trước).
--  • Không đụng app chính (Tạo đơn / bếp lọc pos_code is null), không đụng tồn kho, hoá đơn cũ.
-- Chạy lại lần 2 không làm gì thêm.
begin;
set local lock_timeout = '10s';

create temp table _ds_banh(ma text primary key, ten text not null, nhom text not null, gia numeric not null) on commit drop;
insert into _ds_banh(ma, ten, nhom, gia) values
  ('42LT00023545', 'ĐÙI GÀ 15K -VP42', '42Bánh mì', 15000),
  ('13LT0737467', 'MACARON39K- QL13', 'Macaron', 39000),
  ('42LT0078953', 'MACARON 39K- VP42', '42Bánh lạnh', 39000),
  ('13LT69829', 'BÁNH KEM TÔ TRÁI CÂY-QL13', '13Bánh Mì', 39000),
  ('42LT48653', 'BÁNH KEM TÔ TRÁI CÂY-VP42', '42Bánh kem', 39000),
  ('13LT777445', 'HOA CÚC 65K QL13', '13Bánh Mì', 65000),
  ('13LT98545', 'CUỘN HOA VĂN LỚN 40K-QL13', '13Bông lan', 40000),
  ('13LT65656', 'CUỘN NHO LỚN 40K-QL13', '13Bông lan', 40000),
  ('42LT69565', 'CUỘN NHO LỚN 40K-VP42', '42Bông Lan', 40000),
  ('42LT55582', 'BÁNH MÌ HOA CÚC 65K', '42Bánh mì', 65000),
  ('SP000002', 'SU QUE 30K - VP42', '42Bánh lạnh', 30000),
  ('13LT45678', 'FLAN 7K-QL13', '13Bánh lạnh', 7000),
  ('42LT54986', 'SU KEM 30K-42', '42Bánh lạnh', 30000),
  ('42LT19172', 'BÁNH KEM 100K', '42Bánh kem', 100000),
  ('13LT00220', 'BENTO BẮP 80K-QL13', '13Bánh kem', 80000),
  ('42LT00219', 'BENTO BẮP 80K-VP42', '42Bánh kem', 80000),
  ('42LT23665', 'BENTO 90K VP42', '42Bánh kem', 90000),
  ('42LT000374884', 'PANNA TT 18K VP42', '42Bánh lạnh', 18000),
  ('42LT00198', 'FLAN 7K-VP42', '42Bánh lạnh', 7000),
  ('42LT7373738', 'BK 180-VP42', '42Bánh kem', 180000),
  ('42LT01291', 'SUSING DECOR 13K VP42', '42Bánh kem', 13000),
  ('42LT00176', 'SU DECOR TRÁI CÂY 13K - VP42', '42Bánh lạnh', 13000),
  ('42LT00170', 'BK 420K- VP42', '42Bánh kem', 420000),
  ('42LT00151', 'CUA NHÍ 35K- VP42', '42Bánh mì', 35000),
  ('42LT00145', 'BM BƠ SỮA- VP42', '42Bánh mì', 30000),
  ('42LT00138', 'MINI CHESSE- VP42', '42Bánh lạnh', 29000),
  ('42LT00135', 'BÁNH MÌ BƠ PHÁP- VP42', '42Bánh mì', 29000),
  ('42LT00127', 'CUA PHOMAI- VP42', '42Bánh mì', 15000),
  ('42LT00126', 'PAPA PHÔ MAI 15K- VP42', '42Bánh mì', 15000),
  ('42LT00125', 'PAPA SOCOLA 15K- VP42', '42Bánh mì', 15000),
  ('42LT00124', 'CREAMCHESSE 15K- VP42', '42Bánh mì', 15000),
  ('42LT00123', 'CUỘN HOA VĂN 25K- VP42', '42Bông Lan', 25000),
  ('42LT00120', 'BK 360- VP42', '42Bánh kem', 360000),
  ('42LT00119', 'BÁNH BÒ LỚN- VP42', '42Bánh mì', 90000),
  ('42LT00117', 'BM SẤY BƠ ĐƯỜNG- VP42', '42Bánh mì', 25000),
  ('42LT00109', 'BK 90k- VP42', '42Bánh kem', 90000),
  ('42LT00108', 'BM KẸP CB LỚN 15K- VP42', '42Bánh mì', 15000),
  ('42LT00107', 'BM CB 2 VỊ LỚN- VP42', '42Bánh mì', 15000),
  ('42LT00106', 'XX MINI 2 VỊ- VP42', '42Bánh mì', 39000),
  ('42LT00105', 'BM XX BẮP LỚN- VP42', '42Bánh mì', 15000),
  ('42LT00102', 'PHÁO 10K- VP42', '42Phụ kiện>>trang trí', 10000),
  ('42LT00097', 'CROISSANT 15K- VP42', '42Bánh mì', 15000),
  ('42LT00096', 'DONUT 15K- VP42', '42Bánh mì', 15000),
  ('42LT00095', 'SUSING DECOR 11K- VP42', '42Bánh kem', 11000),
  ('42LT00094', 'BÁNH KEM 90K- VP42', '42Bánh kem', 90000),
  ('42LT00090', 'BÁNH BÒ NHỎ- VP42', '42Bánh mì', 25000),
  ('42LT00086', 'GATO PLAN 25K- VP42', '42Bánh lạnh', 25000),
  ('42LT00081', 'NẾN XOẮN- VP42', '42Phụ kiện>>trang trí', 3000),
  ('42LT00080', 'BK 340K- VP42', '42Bánh kem', 340000),
  ('42LT00079', 'BÁNH CHUỐI 39K- VP42', '42Bánh mì', 39000),
  ('42LT00076', 'NÓN SINH NHẬT 10K- VP42', '42Phụ kiện>>trang trí', 10000),
  ('42LT00075', 'BÁNH MÌ 15K- VP42', '42Bánh mì', 15000),
  ('42LT00063', 'SHIP 50K- VP42', '42SHIP', 50000),
  ('42LT00062', 'SHIP 45K- VP42', '42SHIP', 45000),
  ('42LT00061', 'SHIP 40K- VP42', '42SHIP', 40000),
  ('42LT00060', 'SHIP 35K- VP42', '42SHIP', 35000),
  ('42LT00059', 'SHIP 30K- VP42', '42SHIP', 30000),
  ('42LT00058', 'SHIP 25K- VP42', '42SHIP', 25000),
  ('42LT00057', 'SHIP 20K- VP42', '42SHIP', 20000),
  ('42LT00056', 'SHIP 15K- VP42', '42SHIP', 15000),
  ('42LT00054', 'BK 380K- VP42', '42Bánh kem', 380000),
  ('42LT00049', 'SU QUE 30K- VP42', '42Bánh lạnh', 30000),
  ('42LT00044', 'SỮA CHUA 7K- VP42', '42Bánh lạnh', 7000),
  ('42LT00042', 'TAM GIÁC 20K- VP42', '42Bông Lan', 20000),
  ('42LT00039', 'BK 320K- VP42', '42Bánh kem', 320000),
  ('42LT00038', 'BK 300K- VP42', '42Bánh kem', 300000),
  ('42LT00037', 'SU DECOR 15K- VP42', '42Bánh lạnh', 15000),
  ('42LT00036', 'SU DECOR 12K- VP42', '42Bánh lạnh', 12000),
  ('42LT00029', 'BL TÔ 39K- VP42', '42Bông Lan', 39000),
  ('42LT00028', 'BL 2 VỊ 25K- VP42', '42Bông Lan', 25000),
  ('42LT00027', 'BMXX HÀNH 15k- VP42', '42Bánh mì', 15000),
  ('42LT00026', 'SAN CB 22K- VP42', '42Bánh mì', 22000),
  ('42LT00025', 'SAN LẠT 20k- VP42', '42Bánh mì', 20000),
  ('42LT00024', 'SU SING 35K- VP42', '42Bánh lạnh', 35000),
  ('42LT00023', 'SU QUE 40K- VP42', '42Bánh lạnh', 40000),
  ('42LT00022', 'LỘT DA 15K- VP42', '42Bánh mì', 15000),
  ('42LT00014', 'PIZZA LỚN 15k- VP42', '42Bánh mì', 15000),
  ('42LT00011', 'Bento 70k- VP42', '42Bánh kem', 70000),
  ('42LT00010', 'BK 270k- VP42', '42Bánh kem', 270000),
  ('42LT00009', 'BK 260k- VP42', '42Bánh kem', 260000),
  ('42LT00008', 'BK 280k- VP42', '42Bánh kem', 280000),
  ('42LT00007', 'BK 240k- VP42', '42Bánh kem', 240000),
  ('42LT00006', 'BK 230k- VP42', '42Bánh kem', 230000),
  ('42LT00005', 'BK 220k- VP42', '42Bánh kem', 220000),
  ('42LT00004', 'BK 200k- VP42', '42Bánh kem', 200000),
  ('42LT00002', 'BK 170k- VP42', '42Bánh kem', 170000),
  ('42LT00001', 'BK 150k- VP42', '42Bánh kem', 150000),
  ('13LT00001', 'BK 150k- QL13', '13Bánh kem', 150000),
  ('13LT00002', 'BK 170k- QL13', '13Bánh kem', 170000),
  ('13LT00003', 'BK 180k- QL13', '13Bánh kem', 180000),
  ('13LT00004', 'BK 200k- QL13', '13Bánh kem', 200000),
  ('13LT00005', 'BK 220k- QL13', '13Bánh kem', 220000),
  ('13LT00006', 'BK 230k- QL13', '13Bánh kem', 230000),
  ('13LT00007', 'BK 240k- QL13', '13Bánh kem', 240000),
  ('13LT00008', 'BK 280k- QL13', '13Bánh kem', 280000),
  ('13LT00009', 'BK 260k- QL13', '13Bánh kem', 260000),
  ('13LT00010', 'BK 270k- QL13', '13Bánh kem', 270000),
  ('13LT00011', 'Bento 70k- QL13', '13Bánh kem', 70000),
  ('13LT00014', 'PIZZA LỚN 15k- QL13', '13Bánh Mì', 15000),
  ('13LT00020', 'BÁNH DỨA ĐL 55k- QL13', '13Bánh Mì', 55000),
  ('13LT00022', 'LỘT DA 15K- QL13', '13Bánh Mì', 15000),
  ('13LT00023', 'SU QUE 40K- QL13', '13Bánh lạnh', 40000),
  ('13LT00024', 'SU SING 35K- QL13', '13Bánh lạnh', 35000),
  ('13LT00025', 'SAN LẠT 20k- QL13', '13Bánh Mì', 20000),
  ('13LT00026', 'SAN CB 22K- QL13', '13Bánh Mì', 22000),
  ('13LT00027', 'BMXX HÀNH 15k- QL13', '13Bánh Mì', 15000),
  ('13LT00028', 'BL 2 VỊ 25K- QL13', '13Bông lan', 25000),
  ('13LT00029', 'BL TÔ 39K- QL13', '13Bông lan', 39000),
  ('13LT00036', 'SU DECOR 12K- QL13', '13Bánh lạnh', 12000),
  ('13LT00037', 'SU DECOR 15K- QL13', '13Bánh lạnh', 15000),
  ('13LT00038', 'BK 300K- QL13', '13Bánh kem', 300000),
  ('13LT00039', 'BK 320K- QL13', '13Bánh kem', 320000),
  ('13LT00042', 'TAM GIÁC 20K- QL13', '13Bông lan', 20000),
  ('13LT00043', 'PANNA TT 18K- QL13', '13Bánh lạnh', 18000),
  ('13LT00044', 'SỮA CHUA 7K- QL13', '13Bánh lạnh', 7000),
  ('13LT00048', 'BK 250K- QL13', '13Bánh kem', 250000),
  ('13LT00054', 'BK 380K- QL13', '13Bánh kem', 380000),
  ('13LT00055', 'BK 400K- QL13', '13Bánh kem', 400000),
  ('13LT00056', 'SHIP 15K- QL13', '13SHIP', 15000),
  ('13LT00057', 'SHIP 20K- QL13', '13SHIP', 20000),
  ('13LT00058', 'SHIP 25K- QL13', '13SHIP', 25000),
  ('13LT00059', 'SHIP 30K- QL13', '13SHIP', 30000),
  ('13LT000600', 'SHIP 35K- QL13', '13SHIP', 35000),
  ('13LT00061', 'SHIP 40K- QL13', '13SHIP', 40000),
  ('13LT00062', 'SHIP 45K- QL13', '13SHIP', 45000),
  ('13LT00063', 'SHIP 50K- QL13', '13SHIP', 50000),
  ('13LT00075', 'BÁNH MÌ 15K- QL13', '13Bánh Mì', 15000),
  ('13LT00076', 'NÓN SINH NHẬT 10K- QL13', '13Phụ kiện>>trang trí', 10000),
  ('13LT00079', 'BÁNH CHUỐI 39K- QL13', '13Bánh Mì', 39000),
  ('13LT00080', 'BK 340K- QL13', '13Bánh kem', 340000),
  ('13LT00081', 'NẾN XOẮN- QL13', '13Phụ kiện>>trang trí', 3000),
  ('13LT00086', 'GATO PLAN 25K- QL13', '13Bánh lạnh', 25000),
  ('13LT00090', 'BÁNH BÒ NHỎ- QL13', '13Bánh Mì', 25000),
  ('13LT00091', 'SUKEM 18K- QL13', '13Bánh lạnh', 18000),
  ('13LT00094', 'BÁNH KEM 90K- QL13', '13Bánh kem', 90000),
  ('13LT00095', 'SUSING DECOR 11K- QL13', '13Bánh kem', 11000),
  ('13LT00096', 'DONUT 15K- QL13', '13Bánh Mì', 15000),
  ('13LT00097', 'CROISSANT 15K- QL13', '13Bánh Mì', 15000),
  ('13LT00099', 'SHIP 10K- QL13', '13SHIP', 10000),
  ('13LT00102', 'PHÁO 10K', '13Phụ kiện>>trang trí', 10000),
  ('13LT00104', 'SU TRANG TRÍ 11K- QL13', '13Bánh lạnh', 11000),
  ('13LT00105', 'BM XX BẮP LỚN- QL13', '13Bánh Mì', 15000),
  ('13LT00106', 'XX MINI 2 VỊ- QL13', '13Bánh Mì', 39000),
  ('13LT00107', 'BM CB 2 VỊ LỚN- QL13', '13Bánh Mì', 15000),
  ('13LT00108', 'BM KẸP CB LỚN 15K- QL13', '13Bánh Mì', 15000),
  ('13LT00110', 'SU DAI 8K- QL13', '13Bánh Mì', 8000),
  ('13LT00119', 'BÁNH BÒ LỚN- QL13', '13Bánh Mì', 90000),
  ('13LT00120', 'BK 360- QL13', '13Bánh kem', 360000),
  ('13LT00124', 'CREAMCHESSE 15K- QL13', '13Bánh Mì', 15000),
  ('13LT00125', 'PAPA SOCOLA 15K- QL13', '13Bánh Mì', 15000),
  ('13LT00126', 'PAPA PHÔ MAI 15K- QL13', '13Bánh Mì', 15000),
  ('13LT00127', 'CUA PHOMAI- QL13', '13Bánh Mì', 15000),
  ('13LT00135', 'BÁNH MÌ BƠ PHÁP- QL13', '13Bánh Mì', 29000),
  ('13LT00137', 'BK 210K- QL13', '13Bánh kem', 210000),
  ('13LT00138', 'MINI CHESSE- QL13', '13Bánh lạnh', 29000),
  ('13LT00145', 'BM BƠ SỮA- QL13', '13Bánh Mì', 30000),
  ('13LT00151', 'CUA NHÍ 35K- QL13', '13Bánh Mì', 35000),
  ('13LT00168', 'BÁNH KEM 480K- QL13', '13Bánh kem', 480000),
  ('13LT00170', 'BK 420K- QL13', '13Bánh kem', 420000),
  ('13LT00173', 'BK 290k - QL13', '13Bánh kem', 290000);

-- Bảo hiểm: mã nào trong file không có trên hệ thống → dừng, không làm nửa vời.
do $$
declare v_thieu text;
begin
  select string_agg(d.ma, ', ') into v_thieu from _ds_banh d
    where not exists (select 1 from public.products p where upper(p.pos_code) = upper(d.ma));
  if v_thieu is not null then raise exception 'Các mã sau chưa có trên hệ thống: %', v_thieu; end if;
end $$;

-- 1) Hiện lại + cập nhật đúng theo file.
update public.products p
  set pos_an = false, active = true, name = d.ten, pos_group = d.nhom, price = d.gia
  from _ds_banh d
  where upper(p.pos_code) = upper(d.ma)
    and (p.pos_an or not coalesce(p.active, false) or p.name is distinct from d.ten
         or p.pos_group is distinct from d.nhom or p.price is distinct from d.gia);

-- 2) Ẩn món quầy không có trong file (không còn tồn ở quầy nào).
update public.products p set pos_an = true
  where p.pos_code is not null and not p.pos_an
    and not exists (select 1 from _ds_banh d where upper(d.ma) = upper(p.pos_code))
    and not exists (select 1 from public.finished_goods_stock f
      where f.product_id = p.id and f.store_location is not null and f.is_semi_finished = false and coalesce(f.qty, 0) <> 0);

-- Đối chiếu: dang_hien_o_quay phải = 160; khong_trong_file_con_hien phải = 0 (nếu > 0 là món còn tồn, xem danh sách).
select
  (select count(*) from public.products where pos_code is not null and not pos_an and active) as dang_hien_o_quay,
  (select count(*) from public.products p join _ds_banh d on upper(d.ma) = upper(p.pos_code)
     where not p.pos_an and p.name = d.ten and p.price = d.gia and p.pos_group = d.nhom) as khop_file,
  (select count(*) from public.products p where p.pos_code is not null and not p.pos_an
     and not exists (select 1 from _ds_banh d where upper(d.ma) = upper(p.pos_code))) as khong_trong_file_con_hien,
  (select string_agg(p.pos_code || ' ' || p.name, ' · ') from public.products p where p.pos_code is not null and not p.pos_an
     and not exists (select 1 from _ds_banh d where upper(d.ma) = upper(p.pos_code))) as danh_sach_con_hien;

insert into public.migration_runs(migration_key, status, finished_at, notes)
values ('202611211000_ban_hang_quay_nhap_danh_sach_kiotviet', 'completed', now(),
  'Bán tại quầy: hiện lại 160 món chuẩn KiotViet (QL13 + VP42) theo file chủ tiệm 21/11, cập nhật tên/nhóm/giá; ẩn món quầy không có trong file (trùng).')
on conflict (migration_key) do update set status = 'completed', finished_at = now(), notes = excluded.notes;

commit;
