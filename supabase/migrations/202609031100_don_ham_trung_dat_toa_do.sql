-- Dọn bản hàm cũ (4 tham số) của sumi_dat_toa_do_vi_tri — migration trước
-- (202609031000) thêm tham số p_name khiến Postgres tạo ra 1 overload MỚI
-- thay vì thay thế (CREATE OR REPLACE chỉ thay hàm CÙNG chữ ký tham số),
-- để lại 2 bản chồng nhau. Client chỉ còn gọi bản 5 tham số (workLocations.js
-- luôn gửi kèm p_name), bản 4 tham số giờ mồ côi — xoá cho sạch.
begin;
drop function if exists public.sumi_dat_toa_do_vi_tri(uuid, numeric, numeric, int);

insert into public.migration_runs(migration_key, status, finished_at, notes)
values('202609031100_don_ham_trung_dat_toa_do', 'completed', now(),
  'Xoá overload cũ 4 tham số của sumi_dat_toa_do_vi_tri (còn sót lại do CREATE OR REPLACE không thay hàm khác chữ ký) — chỉ giữ bản 5 tham số (có p_name) đang được client dùng thật.')
on conflict(migration_key) do update set status='completed', finished_at=now(), notes=excluded.notes;
commit;
