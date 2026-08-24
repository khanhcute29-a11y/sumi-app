-- kpi_logs (M-202608260003) chỉ có policy SELECT, không có policy INSERT.
-- 3 chỗ trong OrderV2DetailModal.jsx ghi kpi_logs trực tiếp từ trình duyệt
-- (không qua RPC security-definer) nên luôn bị RLS chặn âm thầm — "Lịch sử
-- cập nhật" của đơn hàng không bao giờ hiện sự kiện bếp nhận/hoàn thành việc.
begin;

drop policy if exists "Insert kpi_logs" on public.kpi_logs;
create policy "Insert kpi_logs" on public.kpi_logs
  for insert to authenticated with check (true);

insert into public.migration_runs(migration_key, status, finished_at, notes)
values('202608260009_kpi_logs_insert_policy', 'completed', now(),
  'Added missing INSERT policy on kpi_logs — client-side inserts from OrderV2DetailModal were silently blocked by RLS.')
on conflict(migration_key) do update set status='completed', finished_at=now(), notes=excluded.notes;

commit;
