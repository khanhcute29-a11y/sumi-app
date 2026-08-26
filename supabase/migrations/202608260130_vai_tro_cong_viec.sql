-- Ai xem màn hình Công việc dưới góc nhìn nào?
--
-- VÌ SAO CẦN: giao diện đang đoán vai trò từ `profiles.role` và `profiles.station`.
-- Cả hai đều không đáng tin — Đăng Khánh 2 giữ chức `kitchen_lead` trong sơ đồ tổ
-- chức nhưng `profiles.role` lại ghi `sale`, còn cột `station` thì gần như cả tiệm
-- bỏ trống. Kết quả: bếp trưởng bị đẩy vào màn hình của thợ.
--
-- Hàm này dùng ĐÚNG nguồn mà hàng rào RLS đang dùng (`profile_assignments`),
-- nên góc nhìn trên màn hình luôn khớp với dữ liệu người đó thật sự đọc được.
begin;
set local lock_timeout = '10s';

create or replace function public.sumi_vai_tro_cong_viec()
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare
  v_uid uuid := auth.uid();
  v_p   public.profiles%rowtype;
  v_vai text[];
  v_gd  boolean;
  v_ql  boolean;
  v_dv  text;
begin
  if v_uid is null then
    return jsonb_build_object('la_giam_doc', false, 'la_quan_ly', false, 'don_vi', null);
  end if;

  select * into v_p from public.profiles where id = v_uid;
  v_vai := array_remove(array[v_p.role]::text[] || coalesce(v_p.extra_roles, '{}')::text[], null);

  -- Giám đốc / Quản lý: theo chức danh HOẶC theo sơ đồ tổ chức.
  v_gd := (v_vai && array['owner', 'admin'])
       or exists (select 1 from public.profile_assignments pa
                  where pa.profile_id = v_uid and pa.valid_to is null
                    and pa.position_code in ('owner', 'admin', 'manager'));

  -- Quản lý khâu: bếp trưởng / phó bếp / trợ lý giám đốc xưởng.
  v_ql := (not v_gd) and (
       v_vai && array['kitchen_lead', 'deputy_director_x41', 'deputy_director_x42']
    or exists (select 1 from public.profile_assignments pa
               where pa.profile_id = v_uid and pa.valid_to is null
                 and pa.position_code in ('kitchen_lead', 'kitchen_deputy'))
  );

  select u.name into v_dv
  from public.profile_assignments pa
  join public.organization_units u on u.id = pa.unit_id
  where pa.profile_id = v_uid and pa.valid_to is null
    and pa.position_code in ('kitchen_lead', 'kitchen_deputy', 'manager')
  limit 1;

  return jsonb_build_object(
    'la_giam_doc', v_gd,
    'la_quan_ly',  v_ql,
    'don_vi',      v_dv,
    'ten',         coalesce(v_p.full_name, ''));
end;
$fn$;

grant execute on function public.sumi_vai_tro_cong_viec to authenticated;

insert into public.migration_runs(migration_key, status, finished_at, notes)
values('202608260130_vai_tro_cong_viec', 'completed', now(),
  'Adds sumi_vai_tro_cong_viec so the task screen picks the right role view from the same source the RLS uses (profile_assignments), instead of guessing from profiles.role and profiles.station. Those two columns disagree with the org chart - one kitchen lead is recorded as role=sale - and station is blank for nearly the whole shop, so leads were being shown the worker screen.')
on conflict(migration_key) do update set status='completed', finished_at=now(), notes=excluded.notes;

commit;
