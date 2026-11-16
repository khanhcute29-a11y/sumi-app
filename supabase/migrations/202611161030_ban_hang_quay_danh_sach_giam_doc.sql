-- Bán tại quầy: danh sách Giám đốc riêng của quầy.
-- Có người là Giám đốc nhưng vai trò trên app là vai trò khác (vd kế toán) → không đổi vai trò cả app,
-- chỉ thêm vào bảng này để ở quầy họ được như Giám đốc: bán không cần vào ca, xem báo cáo, thiết lập quầy, nhận cảnh báo.
-- Tài khoản role/extra_roles 'owner' vẫn là Giám đốc như cũ. Thêm người: chủ tiệm tự chạy insert (không ghi tên vào file này).
-- Chạy SAU 202611161020. Chỉ thêm, không xoá gì.
begin;
set local lock_timeout = '10s';

create table if not exists public.pos_giam_doc (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  added_at timestamptz not null default now()
);
alter table public.pos_giam_doc enable row level security;   -- không có policy: chỉ đọc qua hàm security definer
revoke all on table public.pos_giam_doc from public, anon, authenticated;

create or replace function public.pos_cap_do()
returns text language sql stable security definer set search_path = public as $$
  select case
    when p.id is null or not coalesce(p.approved, false) or p.active is false then null
    when p.role = 'owner' or coalesce(p.extra_roles, '{}') && array['owner']
      or exists (select 1 from public.pos_giam_doc g where g.profile_id = p.id) then 'gd'
    when p.role in ('admin', 'deputy_director_x41', 'deputy_director_x42')
      or coalesce(p.extra_roles, '{}') && array['admin', 'deputy_director_x41', 'deputy_director_x42'] then 'ql'
    else 'nv' end
  from (select auth.uid() as uid) u
  left join public.profiles p on p.id = u.uid
$$;

-- Cảnh báo cho Giám đốc: gửi cả người trong danh sách GĐ quầy.
create or replace function public.pos__bao_sep(p_key text, p_title text, p_body text, p_entity uuid, p_severity text default 'info')
returns void language plpgsql security definer set search_path = public as $$
declare r record;
begin
  for r in select p.id from public.profiles p
    where coalesce(p.approved, false) and p.active is not false
      and (p.role = 'owner' or coalesce(p.extra_roles, '{}') && array['owner']
        or exists (select 1 from public.pos_giam_doc g where g.profile_id = p.id)) loop
    insert into public.notifications(event_key, recipient_profile_id, notification_type, severity, sound_key,
      title, body, entity_type, entity_id, deep_link)
    values (p_key || ':' || r.id, r.id, 'pos_ban_hang', p_severity, 'ting', p_title, p_body, 'pos', p_entity, '/?mockup=ban-hang')
    on conflict (event_key) do nothing;
  end loop;
end $$;

-- Việc chờ duyệt cho quản lý: GĐ quầy cũng nhận.
create or replace function public.pos__bao_quan_ly(p_key text, p_title text, p_body text, p_entity uuid)
returns void language plpgsql security definer set search_path = public as $$
declare r record;
begin
  for r in select p.id from public.profiles p
    where coalesce(p.approved, false) and p.active is not false
      and (p.role in ('owner', 'admin', 'deputy_director_x41', 'deputy_director_x42')
        or coalesce(p.extra_roles, '{}') && array['owner', 'admin', 'deputy_director_x41', 'deputy_director_x42']
        or exists (select 1 from public.pos_giam_doc g where g.profile_id = p.id)) loop
    insert into public.notifications(event_key, recipient_profile_id, notification_type, severity, sound_key,
      title, body, entity_type, entity_id, deep_link)
    values (p_key || ':' || r.id, r.id, 'pos_duyet', 'warning', 'ting', p_title, p_body, 'pos', p_entity, '/?mockup=ban-hang')
    on conflict (event_key) do nothing;
  end loop;
end $$;

revoke all on function public.pos_cap_do() from public, anon;
grant execute on function public.pos_cap_do() to authenticated;
revoke all on function public.pos__bao_sep(text, text, text, uuid, text) from public, anon, authenticated;
revoke all on function public.pos__bao_quan_ly(text, text, text, uuid) from public, anon, authenticated;

insert into public.migration_runs(migration_key, status, finished_at, notes)
values ('202611161030_ban_hang_quay_danh_sach_giam_doc', 'completed', now(),
  'Bán tại quầy: bảng pos_giam_doc (GĐ của quầy dù vai trò app khác) — pos_cap_do trả gd, nhận cảnh báo GĐ + việc chờ duyệt.')
on conflict (migration_key) do update set status = 'completed', finished_at = now(), notes = excluded.notes;

commit;
