-- SUMI APP M14 — remove legacy financial columns from authenticated Data API access.
begin;
revoke select on public.orders from authenticated;
grant select(id,customer_id,channel,status,status_v2,sla_label,flagged,order_code,address,delivery_method,
 delivery_date,delivery_time,kitchen_staff_name,kitchen_photo_url,shipper_staff_name,pickup_photo_url,
 delivery_photo_url,signed_doc_photo_url,pickup_lat,pickup_lng,delivery_lat,delivery_lng,completed_at,
 late_reason,note,cancel_reason,cancel_photo_url,cancel_staff_name,created_by_name,created_at,order_type,
 created_by,required_at,fulfillment_method_v2,confidentiality,version,allow_partial_fulfillment,
 partial_fulfillment_approved_by,partial_fulfillment_approved_at,cancelled_at,cancelled_by,legacy_status,legacy_import_key)
on public.orders to authenticated;
revoke select on public.order_items from authenticated;
grant select(id,order_id,product_id,name,qty,size,cot,vi,ref_photo_url,category,content,candle,
 quantity,unit,specification,name_snapshot,display_order) on public.order_items to authenticated;
insert into public.migration_runs(migration_key,status,finished_at,notes)
values('202608220014_hide_legacy_financial_columns','completed',now(),'Removed legacy price columns from authenticated Data API; finance remains in protected order_financials.')
on conflict(migration_key) do update set status='completed',finished_at=now(),notes=excluded.notes;
commit;
