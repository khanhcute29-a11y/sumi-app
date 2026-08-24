-- Bắt buộc chụp ảnh khi Ghi Nhận Sản Xuất — thêm cột lưu ảnh bằng chứng.
begin;

alter table public.production_logs add column if not exists photo_url text;

insert into public.migration_runs(migration_key, status, finished_at, notes)
values('202608260023_production_log_photo', 'completed', now(),
  'Added photo_url to production_logs — Ghi Nhận Sản Xuất now requires a photo attached to each entry.')
on conflict(migration_key) do update set status='completed', finished_at=now(), notes=excluded.notes;

commit;
