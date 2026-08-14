-- "Kiêm nhiệm" — 1 người giữ thêm vai trò phụ ngoài vai trò chính, chỉ Chủ sở hữu gán được.
alter table profiles add column if not exists extra_roles text[] not null default '{}';

-- Khoá extra_roles giống hệt cột role — chỉ Chủ sở hữu mới sửa được của người khác (hoặc của chính mình).
create or replace function public.prevent_self_role_change()
returns trigger as $$
begin
  if (new.role is distinct from old.role or new.extra_roles is distinct from old.extra_roles) then
    if not exists (select 1 from profiles where id = auth.uid() and role = 'owner') then
      raise exception 'Không thể tự đổi vai trò — chỉ Chủ sở hữu mới có quyền này.';
    end if;
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;
