-- VÁ 2 LỖI NGHIÊM TRỌNG trong luồng "Đơn Từ / Xin Nghỉ" 2 cấp, phát hiện
-- 04/09/2026 khi Bếp trưởng báo thấy đơn xin nghỉ của bộ phận KHÁC hiện ra
-- ở màn của mình.
--
-- NGUYÊN NHÂN GỐC: sumi_la_cap1_cua(requester) đang gọi
-- sumi_cung_don_vi_voi_toi(requester), hàm này dựa vào bảng
-- profile_assignments — bảng đó chỉ có 14 dòng DỮ LIỆU MẪU/THỬ NGHIỆM cũ,
-- KHÔNG khớp với station thật của nhân sự đang chạy (không có Phạm Thị Kim
-- Tiến/Nguyễn Thị Kim Cúc/Bùi Nghĩa 2 — những Bếp trưởng thật). Kết quả:
--
--   1. sumi_duyet_de_xuat() dùng CHÍNH hàm này để cho phép duyệt cấp 1 ->
--      MỌI Bếp trưởng/Quản lý xưởng THẬT hiện KHÔNG duyệt được đơn nào cả
--      (kể cả đúng khâu mình), báo lỗi "Bạn không phụ trách nhân sự này".
--      Đây là lỗi NẶNG HƠN cả điều Bếp trưởng báo — chặn luôn nghiệp vụ.
--   2. Vì (1) luôn sai nên RLS phải dựa vào policy "read approval_requests"
--      (authenticated + is_approved(), KHÔNG lọc gì thêm) để không khoá
--      chết màn hình — nhưng policy đó cho phép TẤT CẢ người đã duyệt đọc
--      TOÀN BỘ approval_requests, không phân biệt khâu -> rò rỉ đúng như
--      Bếp trưởng thấy: đơn xin nghỉ bộ phận khác cũng hiện ra.
--
-- FIX: đổi sumi_la_cap1_cua sang dùng la_quan_ly_cua_ho_so() — hàm ĐANG CHẠY
-- ĐÚNG dựa trên profiles.station thật (đã dùng cho RLS bảng tasks, StaffScreen
-- cấp lại mật khẩu...). Sau đó xoá policy đọc rộng, chỉ còn policy đã lọc
-- đúng theo (của mình HOẶC cấp 2 HOẶC cấp 1 của người gửi).
begin;
set local lock_timeout = '10s';
set local statement_timeout = '30s';

create or replace function public.sumi_la_cap1_cua(p_nguoi_gui uuid)
returns boolean
language sql
stable security definer
set search_path to 'public'
as $function$
  select public.la_quan_ly_cua_ho_so(p_nguoi_gui)
      or public.is_payroll_manager();
$function$;

drop policy if exists "read approval_requests" on public.approval_requests;

insert into public.migration_runs(migration_key, status, finished_at, notes)
values('202609042400_fix_cap1_duyet_va_ro_ri_don_tu', 'completed', now(),
  'sumi_la_cap1_cua doi tu sumi_cung_don_vi_voi_toi (dua vao profile_assignments cu, khong khop station that) sang la_quan_ly_cua_ho_so (dung station that, dang chay dung o noi khac). Xoa policy "read approval_requests" (qua rong: authenticated+is_approved khong loc gi) tren approval_requests, chi con lai policy da loc dung "doc de xuat cua minh hoac cap duoi". Fix ca 2: (1) Bep truong/Quan ly xuong that truoc gio duyet KHONG duoc do sumi_la_cap1_cua luon tra false, (2) ro ri thay don xin nghi/mien tru bo phan khac.')
on conflict(migration_key) do update set status='completed', finished_at=now(), notes=excluded.notes;

commit;
