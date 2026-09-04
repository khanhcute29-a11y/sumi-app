-- Dọn hàm trùng: migration trước (202609043000) dùng "create or replace
-- function" nhưng THÊM tham số mới (p_ngay_sx/p_han_su_dung) — Postgres coi
-- đây là chữ ký khác nên TẠO THÊM bản mới bên cạnh bản cũ, không thay hẳn.
-- Kết quả: sumi_macaron_nhap/sumi_macaron_ghi_so tồn tại 2 bản chồng nhau
-- (bản cũ 3/6 tham số + bản mới 5/8 tham số) — dễ gây lỗi "function is not
-- unique" hoặc nhầm lẫn khi bảo trì sau này. Client (khoMacaron.js) giờ chỉ
-- còn gọi bản mới (luôn truyền đủ 5 tham số) nên xoá an toàn bản cũ.
begin;
set local lock_timeout = '10s';
set local statement_timeout = '30s';

drop function if exists public.sumi_macaron_nhap(text, numeric, text);
drop function if exists public.sumi_macaron_ghi_so(text, text, numeric, uuid, text, text);

insert into public.migration_runs(migration_key, status, finished_at, notes)
values('202609043100_don_ham_macaron_trung_chu_ky', 'completed', now(),
  'Xoa ban CU cua sumi_macaron_nhap(4 tham so)/sumi_macaron_ghi_so(6 tham so) sinh ra do create-or-replace voi chu ky khac o migration 202609043000 — chi giu ban MOI co ngay_sx/han_su_dung.')
on conflict(migration_key) do update set status='completed', finished_at=now(), notes=excluded.notes;

commit;
