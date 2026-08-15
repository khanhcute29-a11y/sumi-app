-- Thêm ảnh sản phẩm cho danh mục Sản Phẩm — để nhân viên xem hình biết đúng món.
alter table products add column if not exists photo_url text;
