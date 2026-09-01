-- Cho phép Giám đốc/Quản lý (owner/admin) SỬA giờ quy định ca làm việc
-- (`sumi_quy_dinh_ca`) thẳng từ màn Nhân Viên trên điện thoại.
--
-- Bảng này đã tồn tại từ migration 202608260070 với chủ đích ghi rõ trong
-- comment "để Giám đốc sửa giờ giấc mà KHÔNG cần lập trình lại", nhưng
-- CHƯA TỪNG có policy UPDATE/INSERT nào cả — chỉ có "ai cũng đọc được".
-- Rà toàn bộ src/ xác nhận KHÔNG nơi nào từng ghi vào bảng này. Thêm policy
-- còn thiếu, theo đúng mẫu đã dùng cho `organization_units`
-- (chỉ is_business_director() mới toàn quyền).
begin;
set local lock_timeout = '10s';
set local statement_timeout = '120s';

drop policy if exists "giam doc sua quy dinh ca" on public.sumi_quy_dinh_ca;
create policy "giam doc sua quy dinh ca" on public.sumi_quy_dinh_ca
  for all to authenticated
  using (public.is_business_director())
  with check (public.is_business_director());

insert into public.migration_runs(migration_key, status, finished_at, notes)
values('202609022200_cho_phep_sua_quy_dinh_ca', 'completed', now(),
  'Thêm policy UPDATE/INSERT/DELETE cho sumi_quy_dinh_ca (chỉ owner/admin qua is_business_director()) — bảng này trước đó chỉ có policy SELECT dù comment gốc đã ghi rõ ý định cho Giám đốc sửa được, không ai từng ghi được vào bảng qua UI vì thiếu policy.')
on conflict(migration_key) do update set status='completed', finished_at=now(), notes=excluded.notes;

commit;
