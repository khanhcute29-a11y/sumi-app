-- Vá lỗi thật: nhân viên cửa hàng gõ tên sản phẩm MỚI (chưa có trong danh
-- mục, vd "Bánh bò nhỏ") khi Nhập kho thành phẩm bị chặn:
--   "new row violates row-level security policy for table products"
--
-- Nguyên nhân (đối chiếu RLS thật): policy "write products" (INSERT) kiểm
-- tra literal `profiles.role = 'owner'` — bug pattern lặp lại đã gặp nhiều
-- lần trong dự án (xem [[staff-permission-gate-bug-pattern]]). Chặn CẢ
-- admin, KHÔNG chỉ nhân viên cửa hàng — owner đúng nghĩa đen mới qua được.
--
-- `products` là DANH MỤC DÙNG CHUNG toàn tiệm — không có cột chi nhánh/cửa
-- hàng nào (id/name/category/unit/price/active/photo_url), nên "chỉ được
-- tạo sản phẩm thuộc đúng cửa hàng của mình" KHÔNG áp dụng ở bảng này —
-- việc gán đúng chi nhánh xảy ra đúng ở bước sau, bảng `finished_goods_stock`
-- (cột `branch`, lấy từ dropdown "Cửa hàng" trên form), bảng đó đã mở quyền
-- ghi cho mọi nhân viên đã đăng nhập từ trước, không phải chỗ bị lỗi.
--
-- Fix: nới INSERT cho mọi nhân viên ĐÃ DUYỆT (is_approved()) — khớp đúng
-- phạm vi policy "read products" đang cho phép (đọc toàn bộ danh mục, không
-- giới hạn vai trò). Thêm 1 dòng catalog (tên/đơn vị/giá mặc định 0) không
-- phải thao tác nhạy cảm — không phải giá bán, không phải COGS. GIỮ NGUYÊN
-- update/delete products vẫn chỉ owner (không nằm trong lỗi đang báo, không
-- mở rộng thêm quyền chưa được yêu cầu).
begin;
set local lock_timeout = '10s';
set local statement_timeout = '30s';

drop policy if exists "write products" on public.products;
create policy "write products" on public.products
  for insert
  with check (is_approved());

insert into public.migration_runs(migration_key, status, finished_at, notes)
values('202609042200_cap_quyen_them_san_pham_kho', 'completed', now(),
  'Policy INSERT products: doi tu literal role=owner sang is_approved() — moi nhan vien da duyet them duoc san pham moi vao danh muc dung chung khi Nhap kho thanh pham. Update/delete products van giu nguyen chi owner.')
on conflict(migration_key) do update set status='completed', finished_at=now(), notes=excluded.notes;

commit;
