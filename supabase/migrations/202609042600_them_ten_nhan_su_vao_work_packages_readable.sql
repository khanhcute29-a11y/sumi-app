-- Fix: OrderV2DetailModal.jsx đã có sẵn code "Đánh giá nhanh — Sản xuất:
-- {tên nhân sự}" (StarRateBar) và dòng "✋ Giao cho: {tên nhân sự}" cho mỗi
-- bếp thực hiện, nhưng KHÔNG BAO GIỜ hiện ra khi mở lại đơn — vì view
-- order_work_packages_readable (202609041000_bep_phoi_hop_cung_lam.sql) chỉ
-- select id, order_id, unit_id, status, due_at, accepted_at, completed_at,
-- version, is_collaborative — thiếu hẳn assigned_to_staff_id/
-- assigned_to_staff_name mà component cần. Phản hồi thật: chủ shop yêu cầu
-- "thêm đánh giá sao cho bếp" tưởng là tính năng thiếu, thực ra tính năng đã
-- có sẵn nhưng bị 2 cột thiếu này chặn không tải được dữ liệu.
--
-- Thêm 2 cột này vào view — không có gì nhạy cảm (tên người nhận việc đã
-- hiển thị công khai ở nhiều màn khác), an toàn để thêm.
create or replace view public.order_work_packages_readable as
select id, order_id, unit_id, status, due_at, accepted_at, completed_at, version, is_collaborative,
  assigned_to_staff_id, assigned_to_staff_name
from public.order_work_packages;
