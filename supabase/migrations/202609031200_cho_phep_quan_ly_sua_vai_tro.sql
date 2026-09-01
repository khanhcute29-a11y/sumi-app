-- Trigger prevent_self_role_change (chặn tự đổi vai trò của chính mình) trước
-- đây chỉ cho phép role='owner' đổi vai trò người khác — Quản lý (role='admin')
-- dù đã thấy được form sửa phân quyền trên UI (StaffScreen.jsx gate dùng
-- canDeactivate = hasAnyRole(['owner','admin'])) vẫn bị DB từ chối, hiện đúng
-- thông báo "chỉ Chủ sở hữu mới có quyền này." Dùng lại is_business_director()
-- (đã có sẵn, coi owner+admin đều là cấp quản lý điều hành) để đồng bộ với
-- toàn bộ phần còn lại của hệ thống.
begin;
set local lock_timeout = '10s';
set local statement_timeout = '60s';

create or replace function public.prevent_self_role_change()
returns trigger language plpgsql security definer set search_path = public as $fn$
begin
  if (new.role is distinct from old.role or new.extra_roles is distinct from old.extra_roles) then
    if not public.is_business_director() then
      raise exception 'Không thể tự đổi vai trò — chỉ Giám đốc/Quản lý mới có quyền này.';
    end if;
  end if;
  return new;
end;
$fn$;

insert into public.migration_runs(migration_key, status, finished_at, notes)
values('202609031200_cho_phep_quan_ly_sua_vai_tro', 'completed', now(),
  'Sửa trigger prevent_self_role_change: trước đây chỉ role literal owner mới đổi được vai trò nhân sự khác, giờ dùng is_business_director() (owner hoặc admin) — khớp với UI đã cho phép Quản lý thấy form sửa phân quyền nhưng DB lại từ chối.')
on conflict(migration_key) do update set status='completed', finished_at=now(), notes=excluded.notes;

commit;
