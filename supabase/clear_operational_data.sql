-- Xóa TOÀN BỘ dữ liệu vận hành để app sạch như mới cài.
-- GIỮ NGUYÊN: tài khoản đăng nhập (profiles), danh mục sản phẩm & giá (products/
-- product_variants), cấu hình ca làm việc (shift_configs), cấu hình tiệm/vị trí
-- (shop_settings), đăng ký nhận thông báo đẩy (push_subscriptions), nhật ký hoạt
-- động (audit_log — giữ lại làm lịch sử, không phải "dữ liệu vận hành").
--
-- LƯU Ý QUAN TRỌNG: xóa warehouse_stock sẽ tự động xóa luôn product_recipes
-- (công thức/giá vốn đang gắn theo từng nguyên liệu cụ thể, do ràng buộc khóa
-- ngoại) — sau khi chạy, sản phẩm vẫn còn nguyên nhưng phần "Công thức & giá vốn"
-- ở màn Sản Phẩm sẽ trống, cần nhập lại nếu muốn dùng tiếp tính năng đó.
--
-- Chạy 1 lần trong Supabase SQL Editor. Không thể hoàn tác.

begin;

truncate table
  order_notes,
  order_items,
  order_deletion_log,
  orders,
  customers,
  warehouse_stock_out_log,
  product_recipes,
  warehouse_stock,
  cashbook_entries,
  debts,
  cash_reconciliations,
  shift_logs,
  approval_requests,
  incident_reports
cascade;

commit;
