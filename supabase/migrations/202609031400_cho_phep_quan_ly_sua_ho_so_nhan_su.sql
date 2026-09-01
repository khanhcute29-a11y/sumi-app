-- Sửa tiếp lỗ hổng phân quyền cùng gốc với migration trước (202609031200):
-- trigger restrict_admin_profile_updates() (định nghĩa gốc ở file thủ công
-- migrate_staff_active.sql, không nằm trong supabase/migrations/) cho phép
-- actor không phải chủ tài khoản sửa hồ sơ người khác (theo RLS policy
-- "staff update own profile"), NHƯNG chỉ actor có role='owner' literal mới
-- được sửa MỌI cột — actor khác (kể cả admin/Quản lý) chỉ được đổi đúng cột
-- `active` (khoá/mở tài khoản), mọi cột khác (role, extra_roles,
-- responsibilities, start_date, station...) đều bị chặn với đúng thông báo
-- "Chỉ Chủ sở hữu mới đổi được thông tin này." — đây là lớp chặn THỨ HAI,
-- độc lập với prevent_self_role_change đã sửa ở 202609031200, nên dù trigger
-- kia đã cho phép admin đổi role, trigger này vẫn chặn trước. Dùng lại
-- is_business_director() (owner hoặc admin) để đồng bộ.
begin;
set local lock_timeout = '10s';
set local statement_timeout = '60s';

create or replace function public.restrict_admin_profile_updates()
returns trigger language plpgsql security definer set search_path = public as $fn$
declare
  actor_is_director boolean;
  allowed_cols text[];
  changed_keys text[];
begin
  if new.active is distinct from old.active
     and new.active = false
     and (old.role = 'owner' or 'owner' = any(old.extra_roles)) then
    raise exception 'Không thể khoá tài khoản Chủ sở hữu.';
  end if;

  if auth.uid() is not null and new.id = auth.uid() and old.id = auth.uid() then
    if new.approved is distinct from old.approved or new.active is distinct from old.active then
      raise exception 'Không thể tự duyệt hoặc tự mở khoá tài khoản của chính mình.';
    end if;
    return new;
  end if;

  if auth.uid() is null then
    return new;
  end if;

  actor_is_director := public.is_business_director();
  if actor_is_director then
    return new;
  end if;

  allowed_cols := array['active'];
  select array_agg(n.key) into changed_keys
  from jsonb_each(to_jsonb(new)) n
  join jsonb_each(to_jsonb(old)) o on n.key = o.key
  where n.value is distinct from o.value;

  if changed_keys is not null and exists (select 1 from unnest(changed_keys) k where k <> all (allowed_cols)) then
    raise exception 'Chỉ Giám đốc/Quản lý mới đổi được thông tin này.';
  end if;
  return new;
end;
$fn$;

insert into public.migration_runs(migration_key, status, finished_at, notes)
values('202609031400_cho_phep_quan_ly_sua_ho_so_nhan_su', 'completed', now(),
  'Sửa trigger restrict_admin_profile_updates (lớp chặn thứ 2, độc lập với prevent_self_role_change đã sửa ở 202609031200): trước đây chỉ actor role literal owner mới sửa được MỌI cột hồ sơ nhân sự khác (role/extra_roles/responsibilities/start_date/station...), admin chỉ đổi được cột active. Giờ dùng is_business_director() (owner hoặc admin) — khớp với phần còn lại của hệ thống, thông báo lỗi cũng đổi từ "chỉ Chủ sở hữu" sang "Giám đốc/Quản lý".')
on conflict(migration_key) do update set status='completed', finished_at=now(), notes=excluded.notes;

commit;
