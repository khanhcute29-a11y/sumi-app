-- Hỗ trợ tính năng "Cấp lại mật khẩu nhanh" — phần THU HỒI PHIÊN ĐĂNG NHẬP CŨ.
--
-- Đổi mật khẩu thật (hash) là việc của Supabase Auth Admin API
-- (auth.admin.updateUserById), gọi từ Edge Function
-- supabase/functions/admin-reset-password — KHÔNG tự viết SQL ghi thẳng
-- auth.users.encrypted_password (không được hỗ trợ chính thức, dễ sai định
-- dạng hash và khoá tài khoản vĩnh viễn).
--
-- Nhưng đổi mật khẩu qua Admin API KHÔNG tự huỷ access token/refresh token cũ
-- đang tồn tại — nhân sự có thể vẫn đăng nhập được bằng phiên cũ cho tới khi
-- token hết hạn tự nhiên. Hàm này xoá thẳng phiên (auth.sessions) + refresh
-- token (auth.refresh_tokens) của người đó để bắt đăng nhập lại ngay —
-- tương đương "force logout" — chỉ gọi được từ service_role (Edge Function),
-- không lộ ra client.
begin;
set local lock_timeout = '10s';
set local statement_timeout = '30s';

create or replace function public.sumi_force_logout(p_target uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from auth.refresh_tokens where user_id = p_target::text;
  delete from auth.sessions where user_id = p_target;
end;
$$;

revoke all on function public.sumi_force_logout(uuid) from public, anon, authenticated;
grant execute on function public.sumi_force_logout(uuid) to service_role;

insert into public.migration_runs(migration_key, status, finished_at, notes)
values('202609040930_force_logout_ho_tro_cap_lai_mat_khau', 'completed', now(),
  'Thêm sumi_force_logout(uuid) — xoá auth.sessions/auth.refresh_tokens của 1 người, chỉ gọi được từ service_role. Dùng bởi Edge Function admin-reset-password để buộc đăng xuất phiên cũ sau khi Quản lý cấp lại mật khẩu.')
on conflict(migration_key) do update set status='completed', finished_at=now(), notes=excluded.notes;

commit;
