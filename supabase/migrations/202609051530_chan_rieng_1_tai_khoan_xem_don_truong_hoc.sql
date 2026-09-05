-- Chặn RIÊNG một tài khoản khỏi xem đơn Trường học, bất kể role/station gì
-- (yêu cầu chủ tiệm 05/09/2026, cho Đào Thị Bích Nga — Trợ Lý Giám Đốc
-- Xưởng 41, vai trò admin nên trước đây tự động thấy hết mọi đơn kể cả
-- trường học qua isOwnerOrAdmin() trong orderVisibility.js).
--
-- Đây là NGOẠI LỆ theo từng người, không phải theo role — role admin/xuong41
-- khác vẫn thấy đơn trường học bình thường, chỉ tài khoản nào được bật cờ
-- này mới bị ẩn.
alter table public.profiles
  add column if not exists hide_school_orders boolean not null default false;
