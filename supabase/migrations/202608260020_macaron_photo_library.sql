-- Kho ảnh mẫu Macaron dùng chung — thay vì phải chụp/tải ảnh mới mỗi lần lên
-- đơn, người tạo đơn Macaron chọn từ ảnh đã lưu sẵn (VD: các kiểu mix màu,
-- mẫu khay). Bucket 'uploads' đã public-read sẵn nên không cần signed URL.
begin;

create table if not exists public.macaron_photo_library (
  id uuid primary key default gen_random_uuid(),
  storage_path text not null,
  caption text,
  uploaded_by uuid references public.profiles(id) on delete set null,
  uploaded_by_name text,
  created_at timestamptz not null default now()
);

alter table public.macaron_photo_library enable row level security;

drop policy if exists "authenticated read macaron_photo_library" on public.macaron_photo_library;
create policy "authenticated read macaron_photo_library"
  on public.macaron_photo_library for select
  using (auth.role() = 'authenticated');

drop policy if exists "authenticated insert macaron_photo_library" on public.macaron_photo_library;
create policy "authenticated insert macaron_photo_library"
  on public.macaron_photo_library for insert
  with check (auth.role() = 'authenticated');

drop policy if exists "authenticated delete macaron_photo_library" on public.macaron_photo_library;
create policy "authenticated delete macaron_photo_library"
  on public.macaron_photo_library for delete
  using (auth.role() = 'authenticated');

grant select, insert, delete on public.macaron_photo_library to authenticated;

insert into public.migration_runs(migration_key, status, finished_at, notes)
values('202608260020_macaron_photo_library', 'completed', now(),
  'Added macaron_photo_library table — shared, reusable photo library for Macaron orders (upload once, pick from saved photos on future orders). Write access is UI-gated to Macaron order creators, same pattern as other role checks in this app.')
on conflict(migration_key) do update set status='completed', finished_at=now(), notes=excluded.notes;

commit;
