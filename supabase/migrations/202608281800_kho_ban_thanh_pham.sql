-- Kho Bán Thành Phẩm (generic) — trước tiên áp dụng cho vỏ Macaron Hạnh Nhân
-- chờ Bếp Lạnh bơm nhân, thiết kế để dùng lại được cho luồng bánh khác sau
-- này (không hardcode riêng macaron ở tầng dữ liệu).
--
-- Thay thế cách làm tạm ở migration trước (branch='xuong41_mu' tự ghi IN rồi
-- tự OUT ngay — chỉ để log KPI, không có gì để Bếp Lạnh thao tác tiếp). Giờ
-- dùng đúng 1 cột cờ is_semi_finished trên CHÍNH bảng finished_goods_stock
-- (không tạo bảng song song) — tồn giữ lại thật, Bếp Lạnh có hàng đợi để bấm
-- "Đã bơm nhân xong" chuyển thành thành phẩm cuối.
begin;
set local lock_timeout = '10s';
set local statement_timeout = '60s';

alter table public.finished_goods_stock
  add column if not exists is_semi_finished boolean not null default false;

insert into public.migration_runs(migration_key, status, finished_at, notes)
values (
  '202608281800_kho_ban_thanh_pham',
  'completed',
  now(),
  'Thêm finished_goods_stock.is_semi_finished (generic, default false, không đổi hành vi cũ) — cho phép 1 product/branch có 2 dòng tồn tách biệt: thành phẩm và bán thành phẩm. Trước tiên áp dụng cho vỏ Macaron Hạnh Nhân (Xưởng 41) chờ Bếp Lạnh bơm nhân, có thể mở rộng cho luồng khác sau.'
)
on conflict (migration_key) do update
  set status = 'completed', finished_at = now(), notes = excluded.notes;

commit;
