-- Fix: đăng ký bằng số điện thoại báo lỗi 500 (AuthRetryableFetchError).
--
-- Nguyên nhân: hàm handle_new_user() (cập nhật ở migrate_phone_auth.sql) ghi vào cột
-- profiles.phone, nhưng cột này chỉ có trong schema.sql (tài liệu tham khảo trong repo) —
-- chưa chắc đã được thêm thật vào database qua ALTER TABLE. Khi trigger insert thất bại vì
-- cột không tồn tại, toàn bộ transaction tạo tài khoản bị rollback và Supabase Auth trả về
-- lỗi 500 chung chung.
--
-- An toàn: IF NOT EXISTS nên chạy lại nhiều lần không sao, không ảnh hưởng dữ liệu cũ.
alter table profiles add column if not exists phone text;
