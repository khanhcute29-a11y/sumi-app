-- Cho phép Giám đốc/Quản lý (is_business_director() = owner|admin, ĐÃ đúng
-- quyền từ trước — không mở rộng role nào thêm) xóa hẳn đơn hàng ở BẤT CỨ
-- giai đoạn nào, không chỉ đơn chưa có lượt giao. Trước đây RPC
-- delete_order_by_director (migration 202608280100) tự chặn nếu đơn đã có
-- dòng trong delivery_stops — đây là luật nghiệp vụ tự đặt ra, KHÔNG phải
-- bắt buộc kỹ thuật (delivery_stops.order_id thật ra là ON DELETE CASCADE,
-- đã kiểm tra qua information_schema, không phải RESTRICT như ghi chú cũ
-- tưởng nhầm) — gỡ bỏ theo đúng yêu cầu.
--
-- Trở ngại kỹ thuật THẬT duy nhất khi xóa đơn giữa chừng: kpi_logs.order_id
-- là ON DELETE NO ACTION (không tự dọn) — đơn đã qua bếp/giao hàng chắc
-- chắn có dòng kpi_logs (event nhận đơn/giao hàng), xóa thẳng sẽ vỡ FK. Gỡ
-- liên kết (set null) trước khi xóa — GIỮ LẠI dòng KPI của nhân sự, chỉ bỏ
-- tham chiếu tới đơn đã mất, không xóa lịch sử KPI của ai cả.
--
-- Vì giờ xóa được đơn ở MỌI giai đoạn (kể cả đang làm/đang giao — mất nhiều
-- dữ liệu vận hành hơn hẳn trước), thêm ghi log trước khi xóa (bảng
-- order_deletion_log có sẵn từ V1, V2 trước đây KHÔNG ghi log) để còn tra
-- soát lại được đơn nào đã bị xóa, ai xóa, lúc nào.

begin;

create or replace function public.delete_order_by_director(p_order_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare
  v_order public.orders%rowtype;
  v_actor_name text;
  v_customer_name text;
  v_items_summary text;
begin
  if not public.is_business_director() then
    raise exception 'Chỉ Giám đốc/Quản lý mới được xóa đơn hàng';
  end if;

  select * into v_order from public.orders where id=p_order_id;
  if not found then
    raise exception 'Đơn hàng không tồn tại hoặc đã bị xóa trước đó';
  end if;

  select full_name into v_actor_name from public.profiles where id=auth.uid();
  select c.name into v_customer_name from public.customers c where c.id=v_order.customer_id;
  select string_agg(coalesce(name,'?')||' x'||coalesce(quantity::text,'?'), ', ')
    into v_items_summary from public.order_items where order_id=p_order_id;

  insert into public.order_deletion_log(order_code, customer_name, items_summary, total, reason, deleted_by, deleted_at)
  values(v_order.order_code, coalesce(v_customer_name,'?'), v_items_summary, coalesce(v_order.total,0),
    'Xóa qua màn Đơn Hàng V2 — giai đoạn lúc xóa: '||coalesce(v_order.status_v2,'?'),
    coalesce(v_actor_name,'?'), now());

  -- Gỡ liên kết KPI trước — bảng duy nhất KHÔNG tự dọn khi đơn bị xóa
  -- (delivery_stops/order_items/order_notes/... đều đã CASCADE sẵn).
  update public.kpi_logs set order_id=null where order_id=p_order_id;

  delete from public.orders where id=p_order_id;
exception
  when foreign_key_violation then
    raise exception 'Không thể xóa: đơn hàng này vẫn còn dữ liệu liên kết ở nơi khác trong hệ thống';
end $$;

insert into public.migration_runs(migration_key,status,finished_at,notes)
values('202608300900_xoa_don_moi_giai_doan','completed',now(),
  'Bỏ chặn xóa đơn đã có lượt giao (luật nghiệp vụ tự đặt, không phải bắt buộc kỹ thuật) — Giám đốc/Quản lý xóa được đơn ở MỌI giai đoạn. Gỡ liên kết kpi_logs.order_id (NO ACTION, trở ngại FK thật duy nhất) trước khi xóa, giữ nguyên lịch sử KPI nhân sự. Thêm ghi order_deletion_log trước khi xóa (V2 trước đây không ghi log).')
on conflict(migration_key) do update set status='completed',finished_at=now(),notes=excluded.notes;

commit;
