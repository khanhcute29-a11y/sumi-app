-- Khách hàng không tự lưu địa chỉ — báo lỗi ngày 12/10/2026 (1 khách quen có
-- 3 đơn giao đều ghi địa chỉ mà hồ sơ khách vẫn trống).
--
-- NGUYÊN NHÂN: policy "update customers" chỉ xét CỘT profiles.role
-- (owner/cashier/admin/sale), bỏ qua extra_roles (AGENTS Bẫy 3). Người tạo đơn
-- có vai trò chính khác (phó GĐ xưởng có admin là vai trò phụ, bếp trưởng...)
-- bị RLS lọc mất dòng -> UPDATE sửa 0 dòng, KHÔNG báo lỗi -> app tưởng đã lưu.
-- Đo thật: 18 khách / 22 đơn giao, toàn bộ do 2 người có vai trò chính khác tạo.
--
-- 1) sumi_luu_dia_chi_khach: lưu địa chỉ đơn giao vào hồ sơ khách KHI HỒ SƠ
--    ĐANG TRỐNG, cho bất kỳ nhân sự nào vừa tạo đơn giao cho khách đó (database
--    tự kiểm tra có đúng đơn giao của chính người gọi, cùng địa chỉ, trong 1
--    ngày) — không cần mở quyền sửa khách cho mọi người.
-- 2) policy "update customers" xét cả vai trò phụ (màn Khách hàng): ai có
--    owner/admin/cashier/sale ở vai trò chính HOẶC phụ đều sửa được. Không đụng
--    policy xoá khách.
-- 3) Điền bù địa chỉ cho khách lẻ đang trống từ đơn giao gần nhất (cùng cách
--    lọc với 202609111110). Không ghi đè khách đã có địa chỉ, không đụng trường học.
begin;
set local lock_timeout = '10s';
set local statement_timeout = '30s';

-- Kiểm tra vai trò (chính + phụ) — SECURITY DEFINER để không bị RLS profiles
-- chặn khi chạy bên trong policy (AGENTS Bẫy 2).
create or replace function public.sumi_co_vai_tro(p_vai_tro text[])
returns boolean language sql stable security definer set search_path = public as $fn$
  select coalesce(exists (
    select 1 from public.profiles p
     where p.id = auth.uid()
       and coalesce(p.approved, false)
       and p.active is not false
       and (p.role = any(p_vai_tro) or coalesce(p.extra_roles, '{}') && p_vai_tro)
  ), false);
$fn$;
revoke all on function public.sumi_co_vai_tro(text[]) from public, anon;
grant execute on function public.sumi_co_vai_tro(text[]) to authenticated;

-- ── 1. Lưu địa chỉ khách khi tạo đơn giao ─────────────────────────────────
create or replace function public.sumi_luu_dia_chi_khach(p_customer_id uuid, p_address text)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_uid   uuid := auth.uid();
  v_dc    text := nullif(btrim(coalesce(p_address, '')), '');
  v_khach public.customers%rowtype;
begin
  if v_uid is null or not exists (
    select 1 from public.profiles where id = v_uid and coalesce(approved, false) and active is not false
  ) then
    raise exception 'Tài khoản chưa được kích hoạt.' using errcode = 'P0001';
  end if;
  if p_customer_id is null or v_dc is null then
    return jsonb_build_object('da_luu', false, 'ly_do', 'thieu_du_lieu');
  end if;

  select * into v_khach from public.customers where id = p_customer_id for update;
  if v_khach.id is null then
    return jsonb_build_object('da_luu', false, 'ly_do', 'khong_thay_khach');
  end if;
  if coalesce(v_khach.is_school, false) then
    return jsonb_build_object('da_luu', false, 'ly_do', 'truong_hoc');
  end if;
  if nullif(btrim(coalesce(v_khach.address, '')), '') is not null then
    return jsonb_build_object('da_luu', false, 'ly_do', 'da_co_dia_chi');
  end if;

  -- Chỉ lưu khi chính người gọi vừa tạo đơn GIAO cho khách này với đúng địa chỉ đó.
  if not exists (
    select 1 from public.orders o
     where o.customer_id = p_customer_id
       and o.created_by = v_uid
       and o.fulfillment_method_v2 = 'delivery'
       and btrim(coalesce(o.address, '')) = v_dc
       and o.created_at > now() - interval '1 day'
  ) then
    return jsonb_build_object('da_luu', false, 'ly_do', 'khong_co_don_giao');
  end if;

  update public.customers set address = v_dc where id = p_customer_id;
  return jsonb_build_object('da_luu', true);
end;
$fn$;
revoke all on function public.sumi_luu_dia_chi_khach(uuid, text) from public, anon;
grant execute on function public.sumi_luu_dia_chi_khach(uuid, text) to authenticated;

-- ── 2. Policy sửa khách xét cả vai trò phụ ────────────────────────────────
drop policy if exists "update customers" on public.customers;
create policy "update customers" on public.customers for update
  using (public.sumi_co_vai_tro(array['owner', 'admin', 'cashier', 'sale']));

-- ── 3. Điền bù địa chỉ còn trống ──────────────────────────────────────────
with dia_chi_that as (
  select distinct on (o.customer_id) o.customer_id, btrim(o.address) as address
  from public.orders o
  where o.address is not null and length(btrim(o.address)) > 0
    and o.fulfillment_method_v2 = 'delivery'
    and o.address not ilike '%sumi%'
    and o.address not ilike '%tiệm bánh%'
    and o.address not ilike '%tiem banh%'
  order by o.customer_id, o.created_at desc
)
update public.customers c
set address = d.address
from dia_chi_that d
where c.id = d.customer_id
  and (c.address is null or length(btrim(c.address)) = 0)
  and coalesce(c.is_school, false) = false;

insert into public.migration_runs(migration_key, status, finished_at, notes)
values ('202610131000_luu_dia_chi_khach_theo_vai_tro_phu', 'completed', now(),
  'Policy update customers chi xet profiles.role -> nguoi co vai tro phu (phó GĐ co admin, bep truong) update 0 dong im lang, dia chi khach khong bao gio duoc luu (18 khach/22 don). Them sumi_co_vai_tro(text[]) (role + extra_roles, SECURITY DEFINER), sumi_luu_dia_chi_khach (luu khi ho so trong, chi khi chinh nguoi goi vua tao don giao cung dia chi trong 1 ngay), policy update customers xet ca vai tro phu, dien bu dia chi tu don giao gan nhat cho khach le dang trong.')
on conflict (migration_key) do update set status = 'completed', finished_at = now(), notes = excluded.notes;

commit;
