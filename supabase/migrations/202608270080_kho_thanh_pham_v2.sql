-- KHO THÀNH PHẨM V2 — theo mockup docs/mockups/SUMI-finished-goods-inventory-v2-handoff/
-- finished-goods-inventory-v2-approved.html + README.md (HANDOFF_INDEX.md 27/08).
--
-- Schema `finished_goods_stock` hiện tại (product_id, size, branch, qty) chỉ đủ
-- cho panel cũ (FinishedGoodsPanel.jsx) — không có hạn dùng, ảnh, ngày sản
-- xuất, màu (Macaron), quy cách, hay cửa hàng (Vĩnh Phú 42 / Quốc Lộ 13) mà
-- mockup V2 cần hiển thị trên từng thẻ sản phẩm.
--
-- GIỚI HẠN CÓ CHỦ Ý (ghi rõ để không ai tưởng nhầm là bug): mỗi dòng
-- product_id+size+branch+store_location vẫn là MỘT dòng tồn kho gộp (không
-- theo dõi nhiều lô/FIFO riêng biệt). production_date/expiry_date/photo_url
-- lưu theo LẦN NHẬP GẦN NHẤT — nhập chồng lên nhau thì hạn dùng hiển thị là
-- của lần nhập mới nhất, không phải trung bình các lô. Đủ dùng cho nhu cầu
-- "cảnh báo cận hạn" hiện tại; nếu sau này cần FIFO nhiều lô thật sự thì phải
-- tách bảng lô riêng — không cố nhét vào đây.
begin;
set local lock_timeout = '10s';
set local statement_timeout = '60s';

alter table public.finished_goods_stock
  add column if not exists production_date timestamptz,
  add column if not exists expiry_date timestamptz,
  add column if not exists photo_url text,
  add column if not exists color text,
  add column if not exists packing text,
  add column if not exists store_location text;

alter table public.finished_goods_stock_in_log
  add column if not exists production_date timestamptz,
  add column if not exists expiry_date timestamptz,
  add column if not exists photo_url text,
  add column if not exists color text,
  add column if not exists packing text,
  add column if not exists store_location text;

-- Rộng khoá duy nhất ra thêm store_location — mỗi cửa hàng tồn kho riêng,
-- không gộp chung Vĩnh Phú 42 với Quốc Lộ 13 nữa. Dòng cũ chưa gán cửa hàng
-- (store_location null) coi như một "cửa hàng" riêng biệt (NULLS NOT DISTINCT
-- giữ đúng hành vi cũ, tránh sinh 2 dòng trùng nếu chạy lại).
-- Đây là index đứng SAU một unique CONSTRAINT cùng tên (không phải index trần) —
-- DROP INDEX bị Postgres chặn ("2BP01: cannot drop index ... because
-- constraint ... requires it"). Phải gỡ đúng constraint.
alter table public.finished_goods_stock
  drop constraint if exists finished_goods_stock_product_id_size_branch_key;
create unique index if not exists finished_goods_stock_product_size_branch_store_key
  on public.finished_goods_stock (product_id, size, branch, store_location) nulls not distinct;

insert into public.migration_runs(migration_key, status, finished_at, notes)
values('202608270080_kho_thanh_pham_v2', 'completed', now(),
  'Adds production_date/expiry_date/photo_url/color/packing/store_location to finished_goods_stock and finished_goods_stock_in_log to support the approved Kho Thanh Pham V2 mockup (expiry countdown per card, per-store branch tabs Vinh Phu 42 / Quoc Lo 13, macaron color/size). Widens the stock unique key to include store_location so the two physical stores track separate inventory instead of sharing one pooled row. Deliberately keeps one aggregated row per product+size+branch+store rather than per-batch/FIFO lots - see comment at top of file.')
on conflict(migration_key) do update
  set status = 'completed', finished_at = now(), notes = excluded.notes;

commit;
