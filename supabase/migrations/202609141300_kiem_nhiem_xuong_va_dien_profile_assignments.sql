-- Nối tiếp 202609141100/1200 — sếp chốt lại đúng gốc yêu cầu Kim Tiến từ đầu
-- phiên hôm nay (11/9/2026): "phân vai trò bếp chung cũng như thợ chung 3
-- xưởng" — cơ chế profile_assignments đã được policy "read orders" đọc sẵn,
-- chỉ là bảng đang TRỐNG cho Bếp Lạnh/Nóng/Xưởng 41/42. Migration này:
--   1. Mở rộng "read orders": trước chỉ tính position_code kitchen_lead/
--      kitchen_deputy (bếp trưởng/phó quản lý toàn xưởng) - sếp chốt THỢ
--      THƯỜNG (role bakery) cũng phải thấy đúng đơn xưởng mình, không chỉ
--      đơn giao riêng cho họ. Thêm bakery/deputy_director_x41/x42.
--   2. ĐIỀN MẶC ĐỊNH: mỗi nhân viên bếp có sẵn `station` -> 1 dòng
--      profile_assignments đúng xưởng đó (dùng role thật làm position_code).
--      Đây chính là hành vi "thợ xưởng nào thấy đúng xưởng đó" sếp mô tả -
--      lẽ ra đã có từ đầu, giờ điền lại cho đúng.
--   3. KIÊM NHIỆM: Phạm Thị Kim Tiến (bếp Lạnh) được sếp xác nhận kiêm thêm
--      Bếp Nóng + Xưởng 41 (Macaron) - thêm riêng 2 dòng cho cô.
--
-- CƠ CHẾ DÙNG LÂU DÀI: từ nay, kiêm nhiệm ai thêm khâu nào chỉ cần thêm 1
-- dòng profile_assignments (profile_id, unit_id, position_code=role, active
-- valid_to=null) - không cần sửa code gì nữa.
--
-- AN TOÀN: script điền mặc định có kiểm tra "chưa có dòng active cho đúng
-- unit đó" trước khi insert (idempotent, chạy lại không tạo trùng).
begin;
set local lock_timeout = '10s';
set local statement_timeout = '30s';

-- ── 1. Mở rộng policy "read orders" ────────────────────────────────────────
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

-- ── 2. Điền mặc định profile_assignments theo station (idempotent) ────────
with mapping(station, unit_code) as (
  values ('lanh', 'BAKERY_COLD'), ('nong', 'BAKERY_HOT'), ('xuong41', 'X41_KITCHEN'), ('xuong42', 'X42_KITCHEN')
), ung_vien as (
  select p.id as profile_id, ou.id as unit_id, p.role as position_code
  from public.profiles p
  join mapping m on m.station = p.station
  join public.organization_units ou on ou.code = m.unit_code
  where p.approved = true and coalesce(p.active, true) = true
)
insert into public.profile_assignments(profile_id, unit_id, position_code, valid_from)
select uv.profile_id, uv.unit_id, uv.position_code, now()
from ung_vien uv
where not exists (
  select 1 from public.profile_assignments pa
  where pa.profile_id = uv.profile_id and pa.unit_id = uv.unit_id and pa.valid_to is null
);

-- ── 3. Kiêm nhiệm Kim Tiến: Bếp Nóng + Xưởng 41 ───────────────────────────
insert into public.profile_assignments(profile_id, unit_id, position_code, valid_from)
select '93ac07d0-f3f9-47ae-b848-0d6ea870d13e', ou.id, 'kitchen_lead', now()
from public.organization_units ou
where ou.code in ('BAKERY_HOT', 'X41_KITCHEN')
  and not exists (
    select 1 from public.profile_assignments pa
    where pa.profile_id = '93ac07d0-f3f9-47ae-b848-0d6ea870d13e' and pa.unit_id = ou.id and pa.valid_to is null
  );

insert into public.migration_runs(migration_key, status, finished_at, notes)
values('202609141300_kiem_nhiem_xuong_va_dien_profile_assignments', 'completed', now(),
  'Mo rong read orders (bakery/deputy_director_x41/x42 duoc tinh, khong chi kitchen_lead/deputy) va DIEN DU LIEU profile_assignments dang trong: moi nhan vien bep co station -> 1 dong dung xuong (idempotent, khong trung). Rieng Pham Thi Kim Tien them 2 dong kiem nhiem Bep Nong + Xuong 41 (Macaron) theo xac nhan sep. Co che dung lau dai: kiem nhiem ai them khau nao tu nay chi can them 1 dong profile_assignments, khong can sua code.')
on conflict(migration_key) do update set status='completed', finished_at=now(), notes=excluded.notes;

commit;
