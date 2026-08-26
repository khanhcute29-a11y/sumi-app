-- SỬA LỖI: màn hình Công việc của Quản lý trống trơn, trông như ảnh tĩnh.
--
-- ĐO ĐƯỢC TRÊN BẢN THẬT (26/08):
--   Tổng số việc (assigned + adhoc) : 60
--   Giám đốc nhìn thấy             : 60/60   ✅
--   BẾP TRƯỞNG nhìn thấy           :  4/60   ❌  <- màn hình gần như trống
--   Việc đã có station_id           :  0/60   ❌
--
-- HAI NGUYÊN NHÂN CHỒNG NHAU:
--
-- 1) HÀNG RÀO RLS. Chính sách đọc bảng `tasks` chỉ cho phép:
--       assignee_id = tôi  HOẶC  created_by = tôi  HOẶC  là giám đốc
--       HOẶC (việc gắn với gói bếp của xưởng tôi phụ trách — chỉ áp cho
--             category 'order_work')
--    Nên bếp trưởng KHÔNG đọc được việc giao tay của thợ mình, trừ khi chính
--    họ tạo ra. Màn hình quản lý vì thế trả về danh sách rỗng.
--
-- 2) CỘT `station_id` RỖNG. Trigger tôi viết hôm nay chỉ điền khâu cho việc MỚI
--    tạo, còn 60 việc cũ để trống hết. Tệ hơn: nó lấy từ `profiles.station`, mà
--    cột đó gần như cả tiệm bỏ trống — kể cả chính bếp trưởng.
--
-- CÁCH SỬA: dùng ĐÚNG cấu trúc tổ chức mà hệ thống vốn đã có và đã có dữ liệu:
--   `profile_assignments` (ai thuộc đơn vị nào, giữ chức gì)
--   + `organization_units` (BAKERY_HOT, TRANSPORT_DRIVER, X41_KITCHEN...)
-- Đây cũng chính là cấu trúc mà chính sách order_work cũ đang dùng — nên nhất
-- quán với phần còn lại của hệ thống, không đẻ thêm khái niệm mới.
begin;
set local lock_timeout = '10s';
set local statement_timeout = '120s';

-- ---------------------------------------------------------------------------
-- 1. Quản lý đọc được việc của người CÙNG ĐƠN VỊ
--
-- ⚠️ PHẢI BỌC TRONG HÀM SECURITY DEFINER. Bảng `profile_assignments` cũng có
-- hàng rào riêng: `profile_id = auth.uid() OR is_business_director()`. Nên bếp
-- trưởng chỉ đọc được ĐÚNG DÒNG CỦA CHÍNH MÌNH (1/14 dòng). Nếu viết câu kiểm
-- tra thẳng trong chính sách, nó chạy bằng quyền của người gọi và sẽ không tìm
-- thấy đồng nghiệp nào — chính sách trở nên vô dụng.
-- Đây đúng là cách `is_business_director()` đã làm; giữ cho nhất quán.
-- ---------------------------------------------------------------------------
create or replace function public.sumi_cung_don_vi_voi_toi(p_nguoi uuid)
returns boolean language sql stable security definer set search_path = public as $fn$
  select exists (
    select 1
    from public.profile_assignments toi
    join public.profile_assignments nv
      on nv.unit_id = toi.unit_id
     and nv.valid_to is null
    where toi.profile_id = auth.uid()
      and toi.valid_to is null
      and toi.position_code in ('kitchen_lead', 'kitchen_deputy', 'manager', 'admin', 'owner')
      and nv.profile_id = p_nguoi
  );
$fn$;

grant execute on function public.sumi_cung_don_vi_voi_toi to authenticated;

drop policy if exists "quan ly doc viec cua don vi minh" on public.tasks;
create policy "quan ly doc viec cua don vi minh" on public.tasks
  for select to authenticated
  using (public.sumi_cung_don_vi_voi_toi(assignee_id));

-- ---------------------------------------------------------------------------
-- 2. Điền khâu cho việc MỚI — lấy từ đơn vị trong sơ đồ tổ chức,
--    KHÔNG lấy từ `profiles.station` (cột đó gần như cả tiệm bỏ trống).
-- ---------------------------------------------------------------------------
create or replace function public.sumi_tu_dien_khau_viec()
returns trigger language plpgsql security definer set search_path = public as $fn$
begin
  if NEW.station_id is null and NEW.assignee_id is not null then
    -- Ưu tiên đơn vị cụ thể (bếp/kho/vận tải) hơn là đơn vị bao trùm
    -- (chi nhánh / công ty), để việc được xếp đúng khâu làm ra nó.
    select u.code into NEW.station_id
    from public.profile_assignments pa
    join public.organization_units u on u.id = pa.unit_id
    where pa.profile_id = NEW.assignee_id
      and pa.valid_to is null
      and coalesce(u.active, true)
    order by case u.unit_type
               when 'kitchen'   then 1
               when 'warehouse' then 2
               when 'transport' then 3
               when 'store'     then 4
               when 'branch'    then 5
               else 6
             end
    limit 1;

    -- Không có trong sơ đồ tổ chức thì mới dùng tới cột station cũ.
    if NEW.station_id is null then
      select nullif(btrim(station), '') into NEW.station_id
      from public.profiles where id = NEW.assignee_id;
    end if;
  end if;
  return NEW;
end;
$fn$;

-- ---------------------------------------------------------------------------
-- 3. Điền bù khâu cho 60 việc cũ, dùng đúng quy tắc trên
-- ---------------------------------------------------------------------------
with khau_cua_nguoi as (
  select distinct on (pa.profile_id) pa.profile_id, u.code
  from public.profile_assignments pa
  join public.organization_units u on u.id = pa.unit_id
  where pa.valid_to is null and coalesce(u.active, true)
  order by pa.profile_id,
           case u.unit_type
             when 'kitchen'   then 1
             when 'warehouse' then 2
             when 'transport' then 3
             when 'store'     then 4
             when 'branch'    then 5
             else 6
           end
)
update public.tasks t
set station_id = coalesce(
      (select k.code from khau_cua_nguoi k where k.profile_id = t.assignee_id),
      (select nullif(btrim(p.station), '') from public.profiles p where p.id = t.assignee_id))
where t.station_id is null
  and t.assignee_id is not null;

-- ---------------------------------------------------------------------------
-- 4. Danh sách khâu cho bộ lọc — lấy từ dữ liệu THẬT, không gõ cứng trong code
-- ---------------------------------------------------------------------------
create or replace function public.sumi_danh_sach_khau_viec()
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare v jsonb;
begin
  if auth.uid() is null then return '[]'::jsonb; end if;
  select coalesce(jsonb_agg(x order by x->>'ten'), '[]'::jsonb) into v
  from (
    select jsonb_build_object(
             'ma',  coalesce(t.station_id, '_khac'),
             'ten', coalesce(u.name, 'Chưa gán khâu'),
             'so_viec', count(*)) as x
    from public.tasks t
    left join public.organization_units u on u.code = t.station_id
    where t.category in ('assigned', 'adhoc')
    group by coalesce(t.station_id, '_khac'), coalesce(u.name, 'Chưa gán khâu')
  ) s;
  return v;
end;
$fn$;

grant execute on function public.sumi_danh_sach_khau_viec to authenticated;

insert into public.migration_runs(migration_key, status, finished_at, notes)
values('202608260120_quan_ly_doc_duoc_viec_cua_don_vi', 'completed', now(),
  'Fixes the manager task screen showing an empty list that looked like a static mockup. Measured on production: a kitchen lead could see only 4 of 60 tasks because the tasks SELECT policy covered assignee/creator/director plus an order_work-only unit rule, and tasks.station_id was NULL on all 60 rows. Adds a SELECT policy letting leads read tasks of anyone in the same organizational unit, rewrites the station trigger to read the unit code from profile_assignments + organization_units instead of profiles.station (which is blank for nearly the whole shop), backfills the existing rows, and exposes sumi_danh_sach_khau_viec so the department filter is built from live data instead of a hardcoded list.')
on conflict(migration_key) do update
  set status = 'completed', finished_at = now(), notes = excluded.notes;

commit;
