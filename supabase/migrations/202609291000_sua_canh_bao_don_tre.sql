-- Sửa cảnh báo đơn trễ (enqueue_order_operational_alerts) — yêu cầu Giám đốc
-- 29/09/2026. Hàm từ migration 202608230031 CHƯA TỪNG chạy được lần nào:
--   * ghi severity 'high'/'critical' trong khi notifications_severity_check chỉ
--     cho 'info'/'warning'/'urgent';
--   * ghi sound_key 'new_order' — không nằm trong notifications_sound_key_check;
--   => database từ chối cả lượt (lỗi 400), app lại không kiểm tra lỗi nên không
--   ai biết. Kiểm tra thật: 0 thông báo 'order-...' nào trong ~14 nghìn dòng.
--   * tiêu đề bị lỗi encoding ("ÄÆ¡n chÆ°a cÃ³ báº¿p nháº­n").
--   * chỉ gửi 'kitchen_lead' và 'shipper' — bỏ sót bếp trưởng/phó từng bếp,
--     shipper_school, transport_lead.
--
-- Theo Giám đốc chốt: nhắc lại mỗi 15 phút cho tới khi có người xử lý; CHỈ đơn
-- cần giao HÔM NAY (không bắn chuông cho đơn tồn từ trước); máy chủ tự rà mỗi
-- 5 phút qua pg_cron (không phụ thuộc có ai đang mở app).
--
-- Không đọc view order_operations_list nữa (rất nặng, ~1,7s cho mọi đơn) —
-- tính thẳng từ orders + order_work_packages.
begin;
set local lock_timeout = '10s';
set local statement_timeout = '30s';

create or replace function public.enqueue_order_operational_alerts()
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_count  int := 0;
  v_them   int := 0;
  v_moc    text := floor(extract(epoch from now()) / 900)::bigint::text; -- 15 phút
  v_homnay date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
  v_bep    text[] := array['kitchen_lead','kitchen_lead_cold','kitchen_lead_hot','kitchen_lead_macaron','kitchen_lead_x42','kitchen_deputy','kitchen_deputy_cold','kitchen_deputy_hot'];
  v_vc     text[] := array['shipper','shipper_school','transport_lead'];
begin
  -- 1. Đơn chờ quá 30 phút mà chưa có bếp nhận -> Bếp trưởng/phó.
  insert into public.notifications(event_key, recipient_role, notification_type, severity, sound_key, title, body, entity_type, entity_id, deep_link)
  select 'order-waiting:' || o.id || ':' || r || ':' || v_moc, r, 'order_waiting', 'warning', 'ting',
         'Đơn chưa có bếp nhận',
         coalesce(o.order_code, 'Đơn mới') || ' đã chờ hơn 30 phút mà chưa có bếp nhận',
         'order', o.id, '/orders/' || o.id
    from public.orders o
    cross join unnest(v_bep) r
   where o.status_v2 in ('awaiting_assignment', 'awaiting_acceptance')
     and o.created_at <= now() - interval '30 minutes'
     and coalesce((o.required_at at time zone 'Asia/Ho_Chi_Minh')::date,
                  (o.created_at at time zone 'Asia/Ho_Chi_Minh')::date) = v_homnay
  on conflict (event_key) do nothing;
  get diagnostics v_them = row_count; v_count := v_count + v_them;

  -- 2. Bếp làm xong quá 30 phút mà chưa ai bắt đầu giao -> Vận chuyển.
  insert into public.notifications(event_key, recipient_role, notification_type, severity, sound_key, title, body, entity_type, entity_id, deep_link)
  select 'order-ready:' || o.id || ':' || r || ':' || v_moc, r, 'delivery_waiting', 'warning', 'ting',
         'Đơn chờ giao quá 30 phút',
         coalesce(o.order_code, 'Đơn') || ' bếp đã làm xong hơn 30 phút, chưa bắt đầu giao',
         'order', o.id, '/orders/' || o.id
    from public.orders o
    join lateral (
      select max(wp.completed_at) as xong_luc
        from public.order_work_packages wp
       where wp.order_id = o.id and wp.status <> 'cancelled'
      having count(*) > 0 and bool_and(wp.completed_at is not null)
    ) sx on true
    cross join unnest(v_vc) r
   where o.status_v2 = 'ready_for_fulfillment'
     and sx.xong_luc <= now() - interval '30 minutes'
     and (o.required_at at time zone 'Asia/Ho_Chi_Minh')::date = v_homnay
  on conflict (event_key) do nothing;
  get diagnostics v_them = row_count; v_count := v_count + v_them;

  -- 3. Còn dưới 45 phút tới giờ khách hẹn mà chưa xong -> người đang giữ đơn
  --    (đã xong bếp / đang giao -> Vận chuyển, còn lại -> Bếp).
  insert into public.notifications(event_key, recipient_role, notification_type, severity, sound_key, title, body, entity_type, entity_id, deep_link)
  select 'order-due:' || o.id || ':' || r || ':' || v_moc, r, 'order_due_soon', 'urgent', 'task_deadline',
         'Đơn sắp tới giờ hẹn',
         coalesce(o.order_code, 'Đơn') || ' còn dưới 45 phút tới giờ khách hẹn',
         'order', o.id, '/orders/' || o.id
    from public.orders o
    cross join unnest(case when o.status_v2 in ('ready_for_fulfillment', 'in_delivery') then v_vc else v_bep end) r
   where o.status_v2 not in ('completed', 'cancelled')
     and o.required_at between now() and now() + interval '45 minutes'
  on conflict (event_key) do nothing;
  get diagnostics v_them = row_count; v_count := v_count + v_them;

  return v_count;
end $$;
revoke all on function public.enqueue_order_operational_alerts() from public, anon;
grant execute on function public.enqueue_order_operational_alerts() to authenticated;

-- Máy chủ tự rà mỗi 5 phút (mốc 15 phút trong event_key chặn nhắc trùng).
do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    if exists (select 1 from cron.job where jobname = 'sumi-canh-bao-don-tre-5-phut') then
      perform cron.unschedule('sumi-canh-bao-don-tre-5-phut');
    end if;
    perform cron.schedule('sumi-canh-bao-don-tre-5-phut', '*/5 * * * *', 'select public.enqueue_order_operational_alerts()');
  end if;
end $$;

insert into public.migration_runs(migration_key, status, finished_at, notes)
values('202609291000_sua_canh_bao_don_tre', 'completed', now(),
  'Sửa enqueue_order_operational_alerts chưa từng chạy được (severity high/critical + sound_key new_order vi phạm CHECK, tiêu đề lỗi encoding). Chỉ đơn cần giao hôm nay, nhắc lại mỗi 15 phút, gửi đủ vai trò bếp trưởng/phó + vận chuyển, không đọc view nặng, pg_cron chạy mỗi 5 phút.')
on conflict(migration_key) do update set status='completed', finished_at=now(), notes=excluded.notes;

commit;
