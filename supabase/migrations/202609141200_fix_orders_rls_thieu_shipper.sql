-- Nối tiếp 202609141100 — sếp hỏi lại "shipper chỉ thấy đơn trường học
-- thôi à" khiến em rà lại và phát hiện THIẾU: bản vá trước chỉ thêm nhánh
-- cho phép xem đơn trường học dựa vào order_work_packages (bên BẾP), quên
-- hẳn bên GIAO HÀNG (Vận Chuyển V2: delivery_runs/delivery_stops).
--
-- Kiểm tra dữ liệu thật: hầu hết tài xế được giao đơn trường học (qua
-- delivery_runs.assigned_driver_id) KHÔNG có work package bếp gắn với họ
-- (VD: Trần Thanh Thảo, phần lớn đơn của Nguyen Quoc Duy) -> sau bản vá
-- trước, họ sẽ KHÔNG mở được chi tiết đơn trường học mình đang đi giao.
--
-- Thêm 1 nhánh nữa vào "read orders": staff là tài xế được giao
-- (assigned_driver_id) 1 delivery_run có điểm giao (delivery_stop) của đơn
-- đó. Không cần thêm nhánh "chưa ai nhận" như bên bếp vì Vận Chuyển V2 gán
-- tài xế trực tiếp lúc tạo chuyến (dispatcher gán, không phải tài xế tự
-- nhận) - xác nhận qua dữ liệu: hoàn toàn không có work package nào cho đơn
-- vị vận tải, nghĩa là đây là luồng độc lập, không qua cơ chế "tự nhận".
begin;
set local lock_timeout = '10s';
set local statement_timeout = '30s';

drop policy if exists "read orders" on public.orders;
create policy "read orders" on public.orders for select using (
  is_approved() and (
    confidentiality <> 'school_restricted'
    or is_business_director()
    or exists (
      select 1 from public.order_work_packages wp
      join public.profile_assignments pa on pa.unit_id = wp.unit_id
      where wp.order_id = orders.id
        and pa.profile_id = auth.uid()
        and pa.position_code in ('kitchen_lead', 'kitchen_deputy')
        and pa.valid_from <= now()
        and (pa.valid_to is null or pa.valid_to > now())
    )
    or exists (
      select 1 from public.order_work_packages wp
      where wp.order_id = orders.id and wp.assigned_to_staff_id = auth.uid()
    )
    or exists (
      select 1 from public.order_work_packages wp
      join public.organization_units ou on ou.id = wp.unit_id
      join public.profiles p on p.id = auth.uid()
      where wp.order_id = orders.id
        and wp.assigned_to_staff_id is null
        and p.approved = true and coalesce(p.active, true) = true
        and (
          (ou.code in ('X41', 'X41_KITCHEN') and p.station = 'xuong41')
          or (ou.code in ('X42', 'X42_KITCHEN') and p.station = 'xuong42')
          or (ou.code = 'BAKERY_COLD' and p.station = 'lanh')
          or (ou.code = 'BAKERY_HOT' and p.station = 'nong')
        )
    )
    -- MỚI: tài xế được giao chuyến giao hàng (Vận Chuyển V2) chứa đơn này.
    or exists (
      select 1 from public.delivery_stops ds
      join public.delivery_runs dr on dr.id = ds.delivery_run_id
      where ds.order_id = orders.id and dr.assigned_driver_id = auth.uid()
    )
  )
);

insert into public.migration_runs(migration_key, status, finished_at, notes)
values('202609141200_fix_orders_rls_thieu_shipper', 'completed', now(),
  'Noi tiep 202609141100: them nhanh cho phep tai xe duoc giao (delivery_runs.assigned_driver_id) xem don truong hoc minh dang giao qua delivery_stops - ban truoc bo sot, chi xu ly ben bep (order_work_packages). Xac nhan qua du lieu that: hau het tai xe giao don truong hoc khong co work package bep gan voi ho.')
on conflict(migration_key) do update set status='completed', finished_at=now(), notes=excluded.notes;

commit;
