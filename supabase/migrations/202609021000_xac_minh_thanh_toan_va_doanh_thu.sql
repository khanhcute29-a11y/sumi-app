-- Tổng Hợp Doanh Thu Giám Đốc & Xác Minh Thanh Toán Camera.
--
-- ═══ TẠI SAO CẦN CỘT MỚI, KHÔNG DÙNG order_financials CÓ SẴN ═══
-- Bảng `order_financials` (migration 202608220004) trông giống chỗ chứa nhưng
-- CHỈ được backfill MỘT LẦN lúc tạo bảng (insert ... on conflict do nothing),
-- không có trigger nào giữ nó đồng bộ với đơn mới — kiểm tra qua toàn bộ
-- src/ chỉ thấy DUY NHẤT 1 chỗ đọc `total_amount` cho KPI cá nhân, không nơi
-- nào ghi hay đọc `payment_status`. Dựng tính năng xác minh thanh toán lên
-- bảng đã "chết" này sẽ cho số liệu sai ngay từ đơn đầu tiên sau ngày build.
-- Thêm cột thẳng trên `orders` — nguồn dữ liệu ĐANG SỐNG, đã có RLS/RPC xử lý.
--
-- ═══ QUY TẮC MỚI ═══
-- "Hoàn thành giao" (complete_delivery_assignment) vẫn set status_v2='completed'
-- như cũ — KHÔNG đổi, để không phá luồng vận chuyển/KPI/kho đang chạy. Chỉ
-- thêm ĐIỀU KIỆN THỨ HAI `payment_verified=true` để một đơn được tính vào
-- "Doanh thu thuần". Đơn đã giao nhưng chưa xác minh vẫn nằm ở "Doanh thu dự
-- tính" cho tới khi ai đó xác minh qua RPC verify_order_payment.
begin;
set local lock_timeout = '10s';
set local statement_timeout = '120s';

-- ---------------------------------------------------------------------------
-- 1. Cột xác minh thanh toán trên orders.
-- ---------------------------------------------------------------------------
alter table public.orders add column if not exists payment_verified boolean not null default false;
alter table public.orders add column if not exists payment_verified_at timestamptz;
alter table public.orders add column if not exists payment_verified_by uuid references public.profiles(id) on delete set null;
alter table public.orders add column if not exists payment_proof_url text;

-- Đơn ĐÃ hoàn thành TRƯỚC khi tính năng này tồn tại: coi như đã xác minh theo
-- luật cũ (chỉ cần completed là tính doanh thu) — không hồi tố bắt xác minh
-- lại hàng trăm đơn cũ, và không làm "Doanh thu thuần" của các ngày trước
-- 01/09/2026 đột nhiên tụt về 0 khi lên bản mới.
update public.orders
set payment_verified = true, payment_verified_at = coalesce(completed_at, now())
where status_v2 = 'completed' and payment_verified = false;

-- ---------------------------------------------------------------------------
-- 2. Cổng xác minh thanh toán — RPC duy nhất được phép bật payment_verified.
--    Bắt buộc có ảnh chứng từ (URL đã upload sẵn từ trình duyệt qua
--    uploadPhoto() có sẵn — RPC chỉ kiểm tra có URL, không tự xử lý file).
-- ---------------------------------------------------------------------------
create or replace function public.verify_order_payment(
  p_order_id      uuid,
  p_payment_method text,
  p_proof_url      text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_toi   uuid := auth.uid();
  v_order public.orders%rowtype;
begin
  if v_toi is null then
    return jsonb_build_object('thanh_cong', false, 'thong_bao', 'Chưa đăng nhập.');
  end if;

  if p_payment_method not in ('cod', 'bank_transfer') then
    return jsonb_build_object('thanh_cong', false, 'thong_bao', 'Hình thức thanh toán không hợp lệ.');
  end if;

  if nullif(btrim(coalesce(p_proof_url, '')), '') is null then
    return jsonb_build_object('thanh_cong', false, 'thong_bao',
      case when p_payment_method = 'bank_transfer'
        then 'Cần ảnh chụp màn hình chuyển khoản trước khi xác minh.'
        else 'Cần chụp ảnh nhận tiền mặt trước khi xác minh.'
      end);
  end if;

  select * into v_order from public.orders where id = p_order_id;
  if not found then
    return jsonb_build_object('thanh_cong', false, 'thong_bao', 'Không tìm thấy đơn hàng.');
  end if;

  if v_order.status_v2 <> 'completed' then
    return jsonb_build_object('thanh_cong', false, 'thong_bao', 'Chỉ xác minh được đơn đã hoàn thành giao.');
  end if;

  update public.orders
  set payment_method = p_payment_method,
      payment_verified = true,
      payment_verified_at = now(),
      payment_verified_by = v_toi,
      payment_proof_url = p_proof_url
  where id = p_order_id;

  return jsonb_build_object('thanh_cong', true, 'thong_bao', 'Đã xác minh thanh toán.');
end;
$fn$;

revoke all on function public.verify_order_payment(uuid, text, text) from public, anon;
grant execute on function public.verify_order_payment(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Lộ thêm total/deposit/payment_* qua order_operations_list — view đã
--    dùng chung cho toàn bộ danh sách đơn (listOrdersV2 select('*')). CHỈ
--    THÊM cột vào cuối SELECT — không đổi thứ tự/xoá cột cũ, an toàn với mọi
--    nơi đang đọc view này bằng tên cột (không ai SELECT * rồi destructure
--    theo vị trí).
-- ---------------------------------------------------------------------------
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
    o.payment_proof_url
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
     LEFT JOIN LATERAL ( SELECT string_agg(DISTINCT ou.name, ', '::text) AS kitchen_names
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
values('202609021000_xac_minh_thanh_toan_va_doanh_thu', 'completed', now(),
  'Payment Verification Gateway: thêm payment_verified/payment_verified_at/payment_verified_by/payment_proof_url vào orders (backfill payment_verified=true cho đơn completed cũ để không làm sai lệch doanh thu lịch sử). RPC verify_order_payment bắt buộc có ảnh chứng từ trước khi bật payment_verified. Thêm total/deposit/payment_* vào cuối SELECT của view order_operations_list (không đổi cột cũ) để Dashboard Giám đốc tính Doanh thu dự tính/thuần từ allOrders có sẵn, không cần query riêng.')
on conflict(migration_key) do update set status='completed', finished_at=now(), notes=excluded.notes;

commit;
