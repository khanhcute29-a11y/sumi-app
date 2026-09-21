-- Siết lại: chỉ giám đốc mới được ghi nhận bánh lỗi/khiếu nại GẮN CHO NGƯỜI
-- KHÁC (staff_id != chính mình) — tránh đồng nghiệp tự do gán lỗi cho nhau
-- không qua ai kiểm soát. Tự khai về chính mình thì ai cũng làm được (đúng
-- tinh thần khuyến khích tự thú theo P6.3).
begin;
set local lock_timeout = '10s';
set local statement_timeout = '30s';

drop policy if exists "staff insert defect logs" on public.product_defect_logs;
create policy "staff insert defect logs" on public.product_defect_logs
  for insert with check (
    auth.role() = 'authenticated'
    and reported_by = auth.uid()
    and tu_khai = (staff_id = auth.uid())
    and (staff_id = auth.uid() or public.is_business_director())
  );

insert into public.migration_runs(migration_key, status, finished_at, notes)
values('202609101210_restrict_defect_report_on_others', 'completed', now(),
  'Siet policy insert product_defect_logs: chi giam doc moi duoc ghi nhan loi gan cho nguoi khac, tu khai ve chinh minh thi ai cung lam duoc.')
on conflict(migration_key) do update set status='completed', finished_at=now(), notes=excluded.notes;

commit;
