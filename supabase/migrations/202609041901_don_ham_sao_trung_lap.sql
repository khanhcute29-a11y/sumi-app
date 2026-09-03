-- Dọn dẹp: 2 migration trước (202609041800, 202609041900) dùng "create or
-- replace function" nhưng THÊM tham số mới (p_photo_url) — Postgres coi
-- khác chữ ký (số tham số khác nhau) là HÀM KHÁC, không thay thế, nên bản
-- CŨ (6 tham số, không có ảnh/KPI/lương) vẫn còn tồn tại song song, trùng
-- tên với bản MỚI (7 tham số). Xoá hẳn 2 bản cũ, chỉ giữ bản mới nhất.
begin;
set local lock_timeout = '10s';
set local statement_timeout = '30s';

drop function if exists public.sumi_dieu_chinh_sao(uuid, integer, text, text, text, uuid);
drop function if exists public.sumi_sua_danh_gia_sao(uuid, text, integer, text);

insert into public.migration_runs(migration_key, status, finished_at, notes)
values('202609041901_don_ham_sao_trung_lap', 'completed', now(),
  'Xoa 2 ham qua thoi sumi_dieu_chinh_sao/6-tham-so va sumi_sua_danh_gia_sao/4-tham-so — chi con lai ban 7/5 tham so co anh+KPI+luong.')
on conflict(migration_key) do update set status='completed', finished_at=now(), notes=excluded.notes;

commit;
