-- SỬA LẠI migration 202609062100: đã xác nhận qua test trực tiếp là
-- `revoke select (col1,col2) on orders from authenticated` KHÔNG có tác
-- dụng khi role đó đang có GRANT ALL (bảng, không phải cột) từ migration
-- 202608230042 — Postgres không cho phép REVOKE cột "cắt" ra khỏi 1 quyền
-- đã cấp Ở CẤP BẢNG; phải revoke hẳn quyền cấp bảng rồi GRANT LẠI đúng danh
-- sách cột an toàn (đúng cách M14 làm ban đầu). Bài học: luôn xác minh lại
-- bằng information_schema sau khi revoke, không tin ngay câu lệnh chạy
-- không lỗi là đã có tác dụng.
begin;
set local lock_timeout = '10s';
set local statement_timeout = '30s';

revoke select, update on public.orders from authenticated;
grant select(id,customer_id,channel,status,sla_label,flagged,address,delivery_date,delivery_time,
  delivery_photo_url,note,created_at,kitchen_staff_name,kitchen_photo_url,shipper_staff_name,
  pickup_photo_url,order_code,delivery_method,cancel_reason,cancel_photo_url,cancel_staff_name,
  pickup_lat,pickup_lng,delivery_lat,delivery_lng,completed_at,late_reason,created_by_name,
  order_type,created_by,required_at,fulfillment_method_v2,status_v2,confidentiality,version,
  allow_partial_fulfillment,partial_fulfillment_approved_by,partial_fulfillment_approved_at,
  cancelled_at,cancelled_by,legacy_status,legacy_import_key,signed_doc_photo_url,branch_id,
  is_internal,target_store,promotion_note,tax_code)
on public.orders to authenticated;
grant update(id,customer_id,channel,status,sla_label,flagged,address,delivery_date,delivery_time,
  delivery_photo_url,note,created_at,kitchen_staff_name,kitchen_photo_url,shipper_staff_name,
  pickup_photo_url,order_code,delivery_method,cancel_reason,cancel_photo_url,cancel_staff_name,
  pickup_lat,pickup_lng,delivery_lat,delivery_lng,completed_at,late_reason,created_by_name,
  order_type,created_by,required_at,fulfillment_method_v2,status_v2,confidentiality,version,
  allow_partial_fulfillment,partial_fulfillment_approved_by,partial_fulfillment_approved_at,
  cancelled_at,cancelled_by,legacy_status,legacy_import_key,signed_doc_photo_url,branch_id,
  is_internal,target_store,promotion_note,tax_code)
on public.orders to authenticated;
-- Không đụng INSERT/DELETE (vẫn giữ ở cấp bảng như trước) — RLS policy
-- insert/delete đã tự lọc đúng (is_approved()/is_business_director()), tạo
-- đơn mới vẫn cần ghi được deposit/total ban đầu (sale nhập lúc tạo đơn).

revoke select, update on public.order_items from authenticated;
grant select(id,order_id,name,qty,size,cot,vi,product_id,ref_photo_url,category,content,candle,
  quantity,unit,specification,name_snapshot,display_order) on public.order_items to authenticated;
grant update(id,order_id,name,qty,size,cot,vi,product_id,ref_photo_url,category,content,candle,
  quantity,unit,specification,name_snapshot,display_order) on public.order_items to authenticated;

insert into public.migration_runs(migration_key, status, finished_at, notes)
values('202609062110_orders_column_grant_fix', 'completed', now(),
  'Sua lai 202609062100: column-level REVOKE khong co tac dung khi con GRANT ALL cap bang - da revoke het roi GRANT LAI dung danh sach 48 cot an toan tren orders (47 tren order_items) thay vi revoke rieng le, xac minh qua information_schema truoc khi coi la xong.')
on conflict(migration_key) do update set status='completed', finished_at=now(), notes=excluded.notes;

commit;
