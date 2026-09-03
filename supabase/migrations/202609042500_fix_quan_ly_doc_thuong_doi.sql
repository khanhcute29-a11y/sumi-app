-- CÙNG LOẠI LỖI đã vá ở 202609042400: policy đọc staff_rewards cho quản lý
-- khâu cũng đang dựa vào sumi_cung_don_vi_voi_toi() -> bảng profile_assignments
-- cũ (14 dòng mẫu, không khớp station thật) -> quản lý khâu/Bếp trưởng THẬT
-- không đọc được thưởng của đội mình (chỉ đọc được thưởng của chính mình).
--
-- Phát hiện khi dựng khối "HIỆU SUẤT BẾP" cho màn home Bếp trưởng (04/09/2026)
-- — mục Thưởng của cả đội sẽ luôn rỗng nếu không vá cái này.
begin;
set local lock_timeout = '10s';
set local statement_timeout = '30s';

drop policy if exists "quan ly don vi doc thuong cua tho" on public.staff_rewards;
create policy "quan ly don vi doc thuong cua tho" on public.staff_rewards
  for select using (public.la_quan_ly_cua_ho_so(staff_id));

insert into public.migration_runs(migration_key, status, finished_at, notes)
values('202609042500_fix_quan_ly_doc_thuong_doi', 'completed', now(),
  'Policy SELECT staff_rewards cho quan ly doi tu sumi_cung_don_vi_voi_toi (bang profile_assignments cu, khong khop station that) sang la_quan_ly_cua_ho_so (dung, da dung o nhieu noi khac) - cung nguyen nhan da vay o 202609042400.')
on conflict(migration_key) do update set status='completed', finished_at=now(), notes=excluded.notes;

commit;
