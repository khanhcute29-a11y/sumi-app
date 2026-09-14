-- FIX LỖ HỔNG BẢO MẬT bảng orders — phát hiện qua đợt quét chủ động 14/9/2026,
-- sếp xác nhận cho sửa.
--
-- Bảng orders có 3 policy "cho nhan vien" với điều kiện TRUE tuyệt đối
-- (USING true / WITH CHECK true) cho INSERT/UPDATE/SELECT, cộng thêm 1 policy
-- "orders_select_authenticated" (chỉ cần đăng nhập). Vì Postgres OR các policy
-- CÙNG LỆNH lại với nhau, 4 policy lỏng này làm CHẾT HẲN các policy chặt đang
-- có (giới hạn theo vai trò, giới hạn xem đơn trường học). Hậu quả thật:
--   - Bất kỳ tài khoản đăng nhập được — KỂ CẢ CHƯA ĐƯỢC DUYỆT — đều xem/tạo
--     được mọi đơn hàng, kể cả đơn trường học (confidentiality=school_restricted).
--   - UPDATE nghiêm trọng nhất: USING true + WITH CHECK true = ai đăng nhập
--     cũng sửa được BẤT KỲ trường nào của BẤT KỲ đơn nào (giá, COD, trạng
--     thái, người giao...) mà không cần đúng vai trò, không qua giao diện.
--
-- ĐÃ KIỂM TRA KỸ trước khi sửa (tránh đụng code đồng đội / phá việc đang chạy):
--   1. hàm updateOrder() trong queries.js đã có sẵn code xử lý đúng tình
--      huống "RLS chặn" (đọc data.length===0 -> báo "không có quyền") - tức
--      code app ĐÃ được viết sẵn để mong RLS chặn thật, chỉ là chưa bao giờ
--      kích hoạt được. Xóa policy lỏng là kích hoạt đúng thiết kế sẵn có,
--      không phải thay đổi hành vi mới.
--   2. Đối chiếu toàn bộ 12 role thật đang dùng hệ thống với policy chặt
--      "update orders" (role owner/admin/cashier/sale/kitchen/bakery/shipper/
--      kitchen_lead/kitchen_deputy) - 4 role không có tên trực tiếp
--      (accountant, deputy_director_x41, deputy_director_x42, warehouse) đều
--      đã có sẵn extra_roles chứa admin/bakery (nằm trong danh sách được
--      phép) -> KHÔNG ai đang dùng hệ thống bị mất quyền.
--   3. RÀ RIÊNG phần SELECT: policy chặt "read orders" hiện chỉ cho bếp xem
--      đơn trường học nếu có mặt trong bảng profile_assignments - bảng đó
--      gần như TRỐNG cho Xưởng 41/Bếp Lạnh/Bếp Nóng/Xưởng 42 (đã xác nhận
--      đầu phiên 11/9/2026, cùng gốc với vụ "chị Tiến không thấy đơn
--      macaron"). Nếu xóa policy lỏng SELECT mà không sửa gì thêm, TOÀN BỘ
--      bếp Xưởng 41/42 sẽ KHÔNG mở được chi tiết đơn trường học đang làm
--      thật mỗi ngày (OrderV2DetailModal.jsx gọi thẳng bảng orders).
--      => THÊM 2 nhánh mới vào "read orders" (không xóa nhánh cũ, chỉ cộng
--      thêm — profile_assignments để dành, sau này điền đủ vẫn dùng được):
--        a) Đang được giao trực tiếp gói việc của đơn đó
--           (order_work_packages.assigned_to_staff_id = mình).
--        b) Gói việc CHƯA CÓ AI NHẬN (assigned_to_staff_id null) nhưng thuộc
--           đúng khâu (station) của mình - để bếp còn THẤY mà bấm "Nhận đơn"
--           (nếu không có nhánh này, gói việc chưa ai nhận sẽ không ai xem
--           được từ đầu, không bấm nhận được). Ánh xạ station<->đơn vị lấy
--           TỪ DỮ LIỆU THẬT (truy vấn organization_units các gói việc đang
--           chờ nhận thật sự), không đoán: X41/X41_KITCHEN<->xuong41,
--           X42/X42_KITCHEN<->xuong42, BAKERY_COLD<->lanh, BAKERY_HOT<->nong.
--      Biết trước: nếu sau này có khâu MỚI cần logic này mà không nằm trong
--      4 cặp trên, cần bổ sung thêm dòng ánh xạ - không tự động phủ hết mọi
--      trường hợp tương lai.
begin;
set local lock_timeout = '10s';
set local statement_timeout = '30s';

-- ── 1. INSERT & UPDATE: xóa 2 policy lỏng, giữ nguyên policy chặt sẵn có ───
drop policy if exists "orders insert cho nhan vien" on public.orders;
drop policy if exists "orders update cho nhan vien" on public.orders;

-- ── 2. SELECT: mở rộng policy chặt "read orders" trước, RỒI mới xóa 2 policy
-- lỏng — tránh có khoảnh khắc nào order bị ẩn hết trong lúc chuyển đổi.
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
  )
);

drop policy if exists "orders select cho nhan vien" on public.orders;
drop policy if exists "orders_select_authenticated" on public.orders;

insert into public.migration_runs(migration_key, status, finished_at, notes)
values('202609141100_fix_orders_rls_lo_hong', 'completed', now(),
  'Fix lo hong RLS bang orders phat hien qua dot quet chu dong 14/9/2026: xoa 4 policy long (true/chi can dang nhap) tren INSERT/UPDATE/SELECT dang nuot mat cac policy chat theo vai tro va do bao mat don truong hoc. Mo rong policy read orders truoc khi xoa de bep Xuong 41/42/Bep Lanh/Nong khong mat quyen xem don truong hoc dang lam that (them nhanh assigned_to_staff_id va nhanh goi viec chua ai nhan theo dung station, anh xa lay tu du lieu that khong doan). Da doi chieu toan bo role dang dung he thong - khong ai bi mat quyen sua/tao don.')
on conflict(migration_key) do update set status='completed', finished_at=now(), notes=excluded.notes;

commit;
