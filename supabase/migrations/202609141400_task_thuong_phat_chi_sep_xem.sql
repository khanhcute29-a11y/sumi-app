-- Sếp chốt: Thưởng/Phạt (staff_rewards/staff_violations) và Công việc (tasks)
-- của người KHÁC chỉ giám đốc/kế toán (payroll manager) mới xem được — quản
-- lý cùng đơn vị (qua profile_assignments) KHÔNG được xem, dù profile_assignments
-- giờ đã điền đầy đủ (migration 202609141300) để phục vụ RIÊNG việc xem đơn
-- hàng đúng xưởng, không phải để mở rộng quyền xem thưởng/phạt/việc.
--
-- 3 bảng này có policy "quản lý cùng đơn vị" dùng sumi_cung_don_vi_voi_toi()
-- (đọc profile_assignments) - trước đây bảng đó gần như trống nên policy
-- này gần như không có hiệu lực; từ khi điền đầy đủ ở 202609141300, NHIỀU
-- kitchen_lead/kitchen_deputy hơn (kể cả Kim Tiến kiêm nhiệm) sẽ bắt đầu
-- xem được thưởng/phạt/việc của người khác cùng đơn vị - sếp không muốn vậy.
--
-- Xoá 3 policy "quản lý cùng đơn vị", GIỮ NGUYÊN policy còn lại (tự xem của
-- mình HOẶC giám đốc/kế toán qua is_payroll_manager()/is_business_director())
-- - is_payroll_manager() cho phép owner/admin/accountant, đã có từ trước,
-- không đụng tới (không phải phần sếp yêu cầu thu hẹp).
--
-- Đã kiểm tra: không có màn hình nào trong code hiện tại (TasksScreen.jsx,
-- StaffTasksAssignedScreen.jsx...) dùng tính năng "quản lý xem việc của cả
-- đơn vị" - an toàn để xoá, không có UI nào phụ thuộc.
begin;
set local lock_timeout = '10s';
set local statement_timeout = '30s';

drop policy if exists "quan ly doc viec cua don vi minh" on public.tasks;
drop policy if exists "quan ly don vi doc thuong cua tho" on public.staff_rewards;
drop policy if exists "quan ly don vi doc phat cua tho" on public.staff_violations;

insert into public.migration_runs(migration_key, status, finished_at, notes)
values('202609141400_task_thuong_phat_chi_sep_xem', 'completed', now(),
  'Sep chot: thuong/phat (staff_rewards/staff_violations) va cong viec (tasks) cua nguoi khac chi giam doc/ke toan (is_payroll_manager/is_business_director) xem duoc, khong mo rong cho "quan ly cung don vi" qua profile_assignments (sumi_cung_don_vi_voi_toi) - tranh tac dung phu tu viec dien profile_assignments day du o 202609141300 (lam de xem don hang dung xuong, khong phai de mo quyen xem thuong/phat/viec).')
on conflict(migration_key) do update set status='completed', finished_at=now(), notes=excluded.notes;

commit;
