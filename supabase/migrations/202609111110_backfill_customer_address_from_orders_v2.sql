-- Thay cho 202609111100 (viết ra nhưng chưa áp dụng, phát hiện lỗi trước
-- khi chạy nên sửa ở đây thay vì sửa file cũ theo đúng quy ước repo).
--
-- Vá lại địa chỉ hồ sơ cho khách lẻ ĐÃ có lịch sử đơn hàng nhưng chưa từng
-- được lưu địa chỉ hồ sơ (trước đây không có luồng nào ghi customers.address
-- — đã vá ở commit trước, chỉ áp dụng cho đơn MỚI từ nay về sau). Đây là vá
-- 1 LẦN cho dữ liệu cũ, sếp đã xem số liệu và đồng ý.
--
-- ⚠️ PHÁT HIỆN quan trọng trước khi chạy: nhiều đơn "tự lấy tại xưởng"
-- (fulfillment_method_v2='pickup') lại bị ghi orders.address = TÊN TIỆM
-- (vd "Tiệm bánh Sumi VP42") thay vì địa chỉ khách — nếu lấy thẳng sẽ lưu
-- NHẦM địa chỉ tiệm vào hồ sơ khách hàng. Đã lọc bỏ:
--   1. Đơn không phải fulfillment_method_v2='delivery'.
--   2. Địa chỉ chứa "sumi"/"tiệm bánh"/"tiem banh" (placeholder tên tiệm).
-- Sau khi lọc: 74 khách đủ điều kiện (thay vì 96 nếu không lọc) — sếp đã
-- xem số liệu và đồng ý chạy với 74 khách này.
--
-- Quy tắc chọn địa chỉ: đơn GẦN NHẤT (created_at desc) trong số đơn hợp lệ.
-- KHÔNG đụng khách trường học (is_school=true, đã có address từ trước) và
-- KHÔNG ghi đè khách ĐÃ có address (chỉ điền cho ai đang trống).
begin;
set local lock_timeout = '10s';
set local statement_timeout = '30s';

with dia_chi_that as (
  select distinct on (o.customer_id) o.customer_id, o.address
  from public.orders o
  where o.address is not null and length(trim(o.address)) > 0
    and o.fulfillment_method_v2 = 'delivery'
    and o.address not ilike '%sumi%'
    and o.address not ilike '%tiệm bánh%'
    and o.address not ilike '%tiem banh%'
  order by o.customer_id, o.created_at desc
)
update public.customers c
set address = d.address
from dia_chi_that d
where c.id = d.customer_id
  and (c.address is null or length(trim(c.address)) = 0)
  and coalesce(c.is_school, false) = false;

insert into public.migration_runs(migration_key, status, finished_at, notes)
values('202609111110_backfill_customer_address_from_orders_v2', 'completed', now(),
  'Va 1 lan dia chi ho so cho 74 khach le da co lich su don hang delivery voi dia chi that (loai bo don pickup va dia chi gia ten tiem "Tiem banh Sumi..." - phat hien truoc khi chay, xac nhan voi sep). Lay dia chi tu don gan nhat (created_at desc). Khong dung khach truong hoc, khong ghi de khach da co address. Thay the 202609111100 (viet nham, chua tung ap dung).')
on conflict(migration_key) do update set status='completed', finished_at=now(), notes=excluded.notes;

commit;
