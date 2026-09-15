-- FIX LỖI THẬT trên máy sếp (15/9/2026): shipper mở chi tiết đơn trường học
-- báo lỗi "Cannot coerce the result to a single JSON object" — đúng lỗi
-- PostgREST khi .single() nhận về 0 dòng vì RLS chặn.
--
-- Gốc: sếp đã dặn trước đó (11/9/2026) "shipper được thấy toàn bộ đơn hàng
-- của tất cả bộ phận để họ ship" — nhưng bản vá RLS orders trước
-- (202609141100/1200) chỉ thêm nhánh cho shipper xem đơn ĐÃ CÓ delivery_run
-- gán cho họ (dr.assigned_driver_id). Đơn trường học còn đang "Bếp đang
-- làm" (chưa tới lúc tạo delivery_run) thì shipper KHÔNG thấy được — đúng
-- kịch bản lỗi trong ảnh sếp gửi (đơn #SUMI-20260912-48576, trạng thái
-- "Bếp đang làm", chưa gán tài xế).
--
-- Sửa đúng theo yêu cầu ban đầu: shipper (role chính = shipper HOẶC
-- extra_roles có shipper/shipper_school - đã xác nhận qua dữ liệu thật:
-- Trần Thanh Thảo, Nguyen Quoc Duy) THẤY TOÀN BỘ đơn, bỏ qua giới hạn
-- confidentiality/xưởng - không cần chờ được gán delivery_run.
begin;
set local lock_timeout = '10s';
set local statement_timeout = '30s';

drop policy if exists "read orders" on public.orders;
create policy "read orders" on public.orders for select using (
  is_approved() and (
    confidentiality <> 'school_restricted'
    or is_business_director()
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and (p.role = 'shipper' or p.extra_roles && array['shipper', 'shipper_school']::text[])
    )
    or exists (
      select 1 from public.order_work_packages wp
      join public.profile_assignments pa on pa.unit_id = wp.unit_id
      where wp.order_id = orders.id
        and pa.profile_id = auth.uid()
        and pa.position_code in ('kitchen_lead', 'kitchen_deputy', 'bakery', 'deputy_director_x41', 'deputy_director_x42')
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
    or exists (
      select 1 from public.delivery_stops ds
      join public.delivery_runs dr on dr.id = ds.delivery_run_id
      where ds.order_id = orders.id and dr.assigned_driver_id = auth.uid()
    )
  )
);

insert into public.migration_runs(migration_key, status, finished_at, notes)
values('202609150900_shipper_xem_toan_bo_don', 'completed', now(),
  'Fix loi that: shipper mo chi tiet don truong hoc bao "Cannot coerce the result to a single JSON object" (RLS chan .single() ve 0 dong) khi don con dang "Bep dang lam", chua tao delivery_run gan tai xe. Them dung nhanh sep da dan truoc do 11/9/2026: shipper (role hoac extra_roles co shipper/shipper_school) thay TOAN BO don, khong can cho duoc gan delivery_run.')
on conflict(migration_key) do update set status='completed', finished_at=now(), notes=excluded.notes;

commit;
