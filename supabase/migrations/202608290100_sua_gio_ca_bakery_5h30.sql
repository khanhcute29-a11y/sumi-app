-- SUMI APP M100 (29/08) — Sửa giờ ca chuẩn Bakery: 05:15 → 05:30.
--
-- Migration 202608260070 seed nhầm giờ bắt đầu ca sáng Bakery là 05:15, cộng
-- thêm 10 phút "đến sớm tối thiểu" khiến mốc không-muộn thực tế là 05:05.
-- Theo xác nhận của chủ tiệm (29/08/2026): giờ chuẩn quy định thật của Bakery
-- (gồm Thu Ngân · Bếp Lạnh · Bếp Nóng) là 05:30–13:30 (sáng) và 13:30–21:30
-- (chiều) — không có khái niệm "đến sớm tối thiểu" tách rời, đến trước giờ
-- quy định là đến sớm, đến từ giờ quy định trở đi mới tính muộn.
--
-- Hệ quả trước khi sửa: nhân viên Bakery chấm công lúc 05:14 (thật ra đến
-- SỚM 16 phút so với giờ chuẩn thật 05:30) lại bị hệ thống báo "Muộn 9 phút"
-- (so với mốc sai 05:05). Chỉ sửa DỮ LIỆU cấu hình ở đây — hàm tính toán
-- (sumi_bo_phan_cham_cong, trigger chấm công) đã đọc động từ bảng này nên
-- không cần sửa code.
--
-- KHÔNG hồi tố dữ liệu chấm công cũ đã ghi (late_minutes cũ vẫn giữ nguyên
-- trong lịch sử) — nếu cần miễn phạt cho lần chấm công cụ thể nào đã bị tính
-- sai, dùng nút "Bỏ Qua Lý Do Chính Đáng" có sẵn ở Boss Dashboard (RPC
-- waive_late_penalty), không tự động sửa hàng loạt ở đây.

begin;

update public.sumi_quy_dinh_ca
set gio_bat_dau = '05:30',
    phut_den_som_toi_thieu = 0,
    updated_at = now()
where bo_phan = 'bakery' and ma_ca = 'sang';

update public.sumi_quy_dinh_ca
set phut_den_som_toi_thieu = 0,
    updated_at = now()
where bo_phan = 'bakery' and ma_ca = 'chieu';

insert into public.migration_runs(migration_key, status, finished_at, notes)
values('202608290100_sua_gio_ca_bakery_5h30', 'completed', now(),
  'Sửa giờ ca sáng Bakery từ 05:15 thành 05:30 (đúng giờ chuẩn quy định thật), và bỏ khái niệm "đến sớm tối thiểu" cho cả ca sáng/chiều Bakery (đặt phut_den_som_toi_thieu=0) — đến trước giờ quy định là đến sớm, không có mốc riêng. Không đụng tới lịch sử chấm công đã ghi; dùng waive_late_penalty cho từng trường hợp cần miễn phạt riêng lẻ.')
on conflict(migration_key) do update set status='completed', finished_at=now(), notes=excluded.notes;
commit;
