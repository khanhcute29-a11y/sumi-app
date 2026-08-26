-- VÁ LỖ HỔNG: bảng gói việc Bếp đang mở cho cả người ngoài Internet.
--
-- PHÁT HIỆN (Security Advisor của Supabase, 26/08/2026):
--   order_work_packages · anon -> DELETE, INSERT, SELECT, TRUNCATE, UPDATE
--   work_package_items  · anon -> DELETE, INSERT, SELECT, TRUNCATE, UPDATE
--   và CẢ HAI BẢNG ĐỀU TẮT hàng rào RLS.
--
-- `anon` là vai trò dành cho khách CHƯA ĐĂNG NHẬP. Khoá của nó nằm công khai
-- trong mã JavaScript của trang web — ai mở trang, bấm F12 là lấy được. Nghĩa
-- là bất kỳ ai trên Internet cũng đọc, sửa, xoá được toàn bộ gói việc bếp.
--
-- CÁI BẪY: hai bảng này ĐÃ CÓ 10 chính sách được viết sẵn, nhưng vì RLS tắt nên
-- chúng nằm chơi. Tệ hơn, trong đó có mấy chính sách điều kiện chỉ là `true`:
--   owp_open        [SELECT] -> true
--   owp_select_open [SELECT] -> true
--   owp_update      [UPDATE] -> true      ← cho TẤT CẢ sửa
--   wpi_open        [SELECT] -> true
-- Các chính sách cộng dồn theo kiểu HOẶC, nên chỉ bật RLS lên là VẪN HỞ — cái
-- `true` đè lên cái chặt chẽ. Ai bấm nút "sửa nhanh" của Supabase sẽ tưởng đã
-- vá xong mà cửa vẫn mở toang.
--
-- VÌ SAO VÁ ĐƯỢC MÀ KHÔNG GÃY MÀN HÌNH BẾP:
--   • Đã soi toàn bộ mã nguồn: KHÔNG chỗ nào ghi thẳng vào hai bảng này. Mọi
--     thao tác ghi đi qua hàm RPC (SECURITY DEFINER) nên không chịu RLS.
--   • Đường ĐỌC chính của Bếp và KPI đi qua view `order_work_packages_readable`
--     và `order_work_packages_public`. Hai view này chạy quyền chủ sở hữu
--     (security_invoker không đặt) nên cũng đi vòng qua RLS của bảng gốc.
--   • Chỗ duy nhất đọc thẳng bảng là PackageTaskPanel, và nó chỉ SELECT.
--
-- LƯU Ý QUAN TRỌNG: RLS **không** chặn được TRUNCATE. Nên phải rút quyền đó ra,
-- không thể chỉ dựa vào chính sách.
begin;
set local lock_timeout = '10s';
set local statement_timeout = '60s';

-- ---------------------------------------------------------------------------
-- 1. Rút SẠCH quyền của vai trò công khai `anon`
--    App luôn bắt nhân viên đăng nhập, nên `anon` không cần gì ở đây cả.
-- ---------------------------------------------------------------------------
revoke all on public.order_work_packages          from anon;
revoke all on public.work_package_items           from anon;
revoke all on public.order_work_packages_readable from anon;
revoke all on public.order_work_packages_public   from anon;

-- ---------------------------------------------------------------------------
-- 2. Nhân viên đã đăng nhập cũng không cần quyền phá bảng.
--    TRUNCATE đi vòng qua RLS nên bắt buộc phải rút, không thể chỉ chặn bằng
--    chính sách. Giữ nguyên SELECT/INSERT/UPDATE/DELETE để RLS quản.
-- ---------------------------------------------------------------------------
revoke truncate, references, trigger on public.order_work_packages from authenticated;
revoke truncate, references, trigger on public.work_package_items  from authenticated;
revoke truncate, delete, insert, update, references, trigger
  on public.order_work_packages_readable from authenticated;
revoke truncate, delete, insert, update, references, trigger
  on public.order_work_packages_public   from authenticated;

-- ---------------------------------------------------------------------------
-- 3. Bật hàng rào
-- ---------------------------------------------------------------------------
alter table public.order_work_packages enable row level security;
alter table public.work_package_items  enable row level security;

-- Hai bảng sao lưu cũ: app không dùng tới, `anon` vốn đã không có quyền.
-- Bật RLS cho sạch cảnh báo và chặn nốt đường qua API.
do $$
begin
  if to_regclass('public.function_backups') is not null then
    execute 'alter table public.function_backups enable row level security';
    execute 'revoke all on public.function_backups from anon, authenticated';
  end if;
  if to_regclass('public.order_status_backups') is not null then
    execute 'alter table public.order_status_backups enable row level security';
    execute 'revoke all on public.order_status_backups from anon, authenticated';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 4. Bỏ các chính sách "true" — chúng vô hiệu hoá mọi chính sách chặt chẽ khác
-- ---------------------------------------------------------------------------
drop policy if exists "owp_open"        on public.order_work_packages;
drop policy if exists "owp_select_open" on public.order_work_packages;
drop policy if exists "owp_update"      on public.order_work_packages;
drop policy if exists "wpi_open"        on public.work_package_items;

-- ---------------------------------------------------------------------------
-- 5. Chính sách đọc đúng mực: nhân viên ĐÃ ĐĂNG NHẬP và ĐÃ ĐƯỢC DUYỆT
--    (giống hệt cách các bảng khác trong dự án đang làm)
-- ---------------------------------------------------------------------------
drop policy if exists "nhan vien duyet doc goi viec" on public.order_work_packages;
create policy "nhan vien duyet doc goi viec" on public.order_work_packages
  for select to authenticated using (public.is_approved());

drop policy if exists "nhan vien duyet doc mon trong goi" on public.work_package_items;
create policy "nhan vien duyet doc mon trong goi" on public.work_package_items
  for select to authenticated using (public.is_approved());

insert into public.migration_runs(migration_key, status, finished_at, notes)
values('202608260110_va_lo_hong_goi_viec_bep', 'completed', now(),
  'Closes a critical hole found by the Supabase Security Advisor: order_work_packages and work_package_items had RLS disabled while the public anon role held DELETE/INSERT/SELECT/TRUNCATE/UPDATE. Since the anon key ships inside the public website bundle, anyone could read or wipe the kitchen work queue. Enabling RLS alone was NOT enough - four dormant policies had a plain `true` qualifier that would have OR-ed past every strict policy, so they are dropped and replaced with authenticated + is_approved() read policies. TRUNCATE is revoked explicitly because RLS does not govern it. Safe for the app: no code path writes to these tables directly (all writes go through SECURITY DEFINER RPCs) and the kitchen/KPI read path goes through owner-rights views that bypass RLS.')
on conflict(migration_key) do update
  set status = 'completed', finished_at = now(), notes = excluded.notes;

commit;
