-- OrderCodePicker (src/components/OrderCodePicker.jsx) đã có sẵn từ trước
-- (migration 446c174, dropdown gợi ý mã đơn dùng chung) — chỉ THÊM số điện
-- thoại khách vào view để component tìm được theo SĐT như yêu cầu, KHÔNG đổi
-- kết cấu view. Cột mới đặt Ở CUỐI danh sách SELECT theo đúng quy ước project
-- (CREATE OR REPLACE VIEW không cho đổi thứ tự/xoá cột cũ).
begin;
set local lock_timeout = '10s';
set local statement_timeout = '30s';

create or replace view public.order_operations_list as
 SELECT o.id,
    o.order_code,
    o.order_type,
    o.status_v2,
    o.required_at,
    o.fulfillment_method_v2,
    o.address,
    o.confidentiality,
    o.created_by_name,
    o.created_at,
    o.completed_at,
    COALESCE(( SELECT sum(oi.quantity) AS sum
           FROM order_items oi
          WHERE oi.order_id = o.id), 0::numeric) AS total_quantity,
    ( SELECT count(*) AS count
           FROM order_work_packages wp
          WHERE wp.order_id = o.id) AS package_count,
    ( SELECT count(*) AS count
           FROM order_work_packages wp
          WHERE wp.order_id = o.id AND wp.status = 'completed'::text) AS completed_package_count,
    prod.started_at AS production_started_at,
    prod.completed_at AS production_completed_at,
        CASE
            WHEN prod.started_at IS NOT NULL AND prod.completed_at IS NOT NULL THEN GREATEST(0::numeric, floor(EXTRACT(epoch FROM prod.completed_at - prod.started_at) / 60::numeric))::integer
            ELSE NULL::integer
        END AS production_minutes,
    delivery.started_at AS delivery_started_at,
    COALESCE(delivery.delivered_at, o.completed_at) AS delivery_completed_at,
        CASE
            WHEN delivery.started_at IS NOT NULL AND COALESCE(delivery.delivered_at, o.completed_at) IS NOT NULL THEN GREATEST(0::numeric, floor(EXTRACT(epoch FROM COALESCE(delivery.delivered_at, o.completed_at) - delivery.started_at) / 60::numeric))::integer
            ELSE NULL::integer
        END AS delivery_minutes,
    delivery.provider AS delivery_provider,
    delivery.provider_label,
    delivery.shipping_fee,
    delivery.driver_name,
    (o.status_v2 <> ALL (ARRAY['completed'::text, 'cancelled'::text])) AND o.required_at IS NOT NULL AND o.required_at < now() AS is_overdue,
        CASE
            WHEN (o.status_v2 <> ALL (ARRAY['completed'::text, 'cancelled'::text])) AND o.required_at IS NOT NULL AND o.required_at < now() THEN
            CASE o.status_v2
                WHEN 'awaiting_assignment'::text THEN 'Chưa phân bếp'::text
                WHEN 'awaiting_acceptance'::text THEN 'Bếp chưa nhận'::text
                WHEN 'in_production'::text THEN 'Bếp chưa hoàn thành'::text
                WHEN 'ready_for_fulfillment'::text THEN 'Vận tải chưa nhận'::text
                WHEN 'in_delivery'::text THEN 'Vận tải chưa hoàn thành'::text
                ELSE 'Chưa thực hiện'::text
            END
            ELSE NULL::text
        END AS overdue_stage,
        CASE
            WHEN (o.status_v2 <> ALL (ARRAY['completed'::text, 'cancelled'::text])) AND o.required_at IS NOT NULL AND o.required_at < now() THEN floor(EXTRACT(epoch FROM now() - o.required_at) / 60::numeric)::integer
            ELSE 0
        END AS overdue_minutes,
    COALESCE(c.name, NULLIF("substring"(o.note, 'Khách hàng: ([^·]+)'::text), ''::text), o.created_by_name) AS customer_name,
        CASE o.order_type
            WHEN 'cake'::text THEN 'Bánh kem & bánh lạnh'::text
            WHEN 'bakery'::text THEN 'Bánh mặn/ngọt & bánh khác'::text
            WHEN 'macaron'::text THEN 'Macaron'::text
            WHEN 'school'::text THEN 'Trường học'::text
            WHEN 'teabreak'::text THEN 'Teabreak'::text
            WHEN 'mixed'::text THEN 'Đơn nhiều loại'::text
            ELSE o.order_type
        END AS order_type_label,
    items.product_names,
    kitchens.kitchen_names,
    late.was_late,
    late.late_staff_names,
    o.is_internal,
    o.target_store,
    o.total,
    o.deposit,
    o.payment_method,
    o.payment_verified,
    o.payment_verified_at,
    o.payment_proof_url,
    kitchens.kitchen_codes,
    c.phone AS customer_phone
   FROM orders o
     LEFT JOIN customers c ON c.id = o.customer_id
     LEFT JOIN LATERAL ( SELECT min(wp.accepted_at) AS started_at,
                CASE
                    WHEN count(*) > 0 AND bool_and(wp.completed_at IS NOT NULL) THEN max(wp.completed_at)
                    ELSE NULL::timestamp with time zone
                END AS completed_at
           FROM order_work_packages wp
          WHERE wp.order_id = o.id AND wp.status <> 'cancelled'::text) prod ON true
     LEFT JOIN LATERAL ( SELECT r.started_at,
            s.delivered_at,
            r.provider,
            r.provider_label,
            r.shipping_fee,
            p.full_name AS driver_name
           FROM delivery_stops s
             JOIN delivery_runs r ON r.id = s.delivery_run_id
             LEFT JOIN profiles p ON p.id = r.assigned_driver_id
          WHERE s.order_id = o.id
          ORDER BY r.created_at DESC
         LIMIT 1) delivery ON true
     LEFT JOIN LATERAL ( SELECT string_agg(DISTINCT oi.name, ', '::text) AS product_names
           FROM order_items oi
          WHERE oi.order_id = o.id) items ON true
     LEFT JOIN LATERAL ( SELECT string_agg(DISTINCT ou.name, ', '::text) AS kitchen_names,
            array_agg(DISTINCT ou.code) AS kitchen_codes
           FROM order_work_packages wp
             JOIN organization_units ou ON ou.id = wp.unit_id
          WHERE wp.order_id = o.id AND wp.status <> 'cancelled'::text) kitchens ON true
     LEFT JOIN LATERAL ( SELECT bool_or(COALESCE(d.kitchen_late, false) OR COALESCE(d.shipper_late, false)) AS was_late,
            ( SELECT string_agg(DISTINCT names.name, ', '::text) AS string_agg
                   FROM ( SELECT order_lateness_detail.kitchen_staff_name AS name
                           FROM order_lateness_detail
                          WHERE order_lateness_detail.order_id = o.id AND order_lateness_detail.kitchen_late AND order_lateness_detail.kitchen_staff_name IS NOT NULL
                        UNION
                         SELECT order_lateness_detail.shipper_staff_name AS name
                           FROM order_lateness_detail
                          WHERE order_lateness_detail.order_id = o.id AND order_lateness_detail.shipper_late AND order_lateness_detail.shipper_staff_name IS NOT NULL) names) AS late_staff_names
           FROM order_lateness_detail d
          WHERE d.order_id = o.id) late ON true;

insert into public.migration_runs(migration_key, status, finished_at, notes)
values('202609042100_order_picker_phone_search', 'completed', now(),
  'Them cot customer_phone (o cuoi SELECT, khong doi cot cu) vao view order_operations_list de OrderCodePicker tim duoc theo SDT khach, dung yeu cau "Ten khach, SDT, hoac mot phan Ma don".')
on conflict(migration_key) do update set status='completed', finished_at=now(), notes=excluded.notes;

commit;
