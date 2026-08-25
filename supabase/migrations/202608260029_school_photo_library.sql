-- Kho ảnh mẫu bánh Trường học dùng chung, cùng mẫu với macaron_photo_library —
-- người tạo đơn Trường học chọn từ ảnh đã lưu sẵn thay vì chụp/tải mới mỗi lần.
begin;

create table if not exists public.school_photo_library (
  id uuid primary key default gen_random_uuid(),
  storage_path text not null,
  caption text,
  uploaded_by uuid references public.profiles(id) on delete set null,
  uploaded_by_name text,
  created_at timestamptz not null default now()
);

alter table public.school_photo_library enable row level security;

drop policy if exists "authenticated read school_photo_library" on public.school_photo_library;
create policy "authenticated read school_photo_library"
  on public.school_photo_library for select
  using (auth.role() = 'authenticated');

drop policy if exists "authenticated insert school_photo_library" on public.school_photo_library;
create policy "authenticated insert school_photo_library"
  on public.school_photo_library for insert
  with check (auth.role() = 'authenticated');

drop policy if exists "authenticated delete school_photo_library" on public.school_photo_library;
create policy "authenticated delete school_photo_library"
  on public.school_photo_library for delete
  using (auth.role() = 'authenticated');

grant select, insert, delete on public.school_photo_library to authenticated;

insert into public.migration_runs(migration_key, status, finished_at, notes)
values('202608260029_school_photo_library', 'completed', now(),
  'Added school_photo_library table, mirroring macaron_photo_library, for reusable sample photos on School orders.')
on conflict(migration_key) do update set status='completed', finished_at=now(), notes=excluded.notes;

commit;
