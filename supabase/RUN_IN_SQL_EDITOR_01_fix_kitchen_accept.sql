-- =====================================================================
-- BƯỚC 1/2 — SỬA LỖI "NHẬN ĐƠN TỪ BẾP" + TAB "BẾP ĐANG LÀM" TRỐNG
-- Dán toàn bộ file này vào Supabase Dashboard > SQL Editor > Run
-- =====================================================================
--
-- File này làm ĐÚNG 2 việc, không hơn:
--   (1) SAO LƯU nguyên trạng 2 hàm sắp sửa, vào bảng public.function_backups
--   (2) Sửa 2 hàm đó để khi bếp nhận việc thì đơn chuyển sang 'in_production'
--
-- KHÔNG đụng tới: dữ liệu đơn hàng, hệ thống âm thanh, đăng nhập, tên miền,
-- hay bất kỳ hàm nào khác. Không xoá gì. Chạy lại nhiều lần vẫn an toàn.
--
-- Toàn bộ nằm trong 1 transaction: nếu có bất kỳ lỗi nào ở giữa chừng,
-- PostgreSQL tự động huỷ sạch, database quay về y như trước khi chạy.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- (1) SAO LƯU — lưu lại định nghĩa hiện tại của 2 hàm trước khi thay
-- ---------------------------------------------------------------------
create table if not exists public.function_backups (
  id            bigserial primary key,
  backed_up_at  timestamptz not null default now(),
  label         text        not null,
  function_name text        not null,
  definition    text        not null
);

-- Chỉ sao lưu lần đầu. Nếu lỡ chạy file này 2 lần thì bản sao lưu gốc
-- vẫn được giữ nguyên, không bị bản đã-sửa ghi đè lên.
insert into public.function_backups (label, function_name, definition)
select
  '202608260020_kitchen_accept',
  p.oid::regprocedure::text,
  pg_get_functiondef(p.oid)
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('accept_work_package_self', 'accept_delegate_work_package')
  and not exists (
    select 1 from public.function_backups
    where label = '202608260020_kitchen_accept'
  );

-- ---------------------------------------------------------------------
-- (2) SỬA — cho 2 hàm cập nhật trạng thái đơn khi bếp nhận việc
-- ---------------------------------------------------------------------
-- Vì sao cần sửa: trước đây 2 hàm này chỉ ghi vào bảng order_work_packages
-- mà không đụng tới bảng orders. Hệ quả:
--   * Tab "Bếp đang làm" (lọc theo status_v2 = 'in_production') luôn trống,
--     vì đơn vẫn nằm ở 'awaiting_acceptance' dù bếp đã bắt đầu làm.
--   * Bảng order_work_packages KHÔNG được phát realtime (chỉ orders mới có),
--     nên không máy nào nhận được tín hiệu -> chuông "nhận đơn" im lặng.
--
-- Bảo vệ: câu UPDATE có điều kiện chỉ chuyển khi đơn còn ở giai đoạn
-- TRƯỚC sản xuất. Nhờ vậy nếu thêm bếp phối hợp vào một đơn đã giao xong,
-- đơn sẽ KHÔNG bị kéo ngược về 'in_production'.

create or replace function public.accept_delegate_work_package(
  p_package_id uuid,
  p_staff_id   uuid,
  p_staff_name text
)
returns json as $$
declare
  v_order_id uuid;
begin
  update public.order_work_packages
  set
    status                 = 'in_progress',
    accepted_at            = now(),
    assigned_to_staff_id   = p_staff_id,
    assigned_to_staff_name = p_staff_name,
    assigned_at            = now()
  where id = p_package_id
  returning order_id into v_order_id;

  update public.orders
  set status_v2 = 'in_production',
      version   = version + 1
  where id = v_order_id
    and status_v2 in ('pending', 'awaiting_assignment', 'awaiting_acceptance');

  return json_build_object(
    'success',    true,
    'message',    'Work package delegated to staff',
    'package_id', p_package_id,
    'order_id',   v_order_id,
    'staff_name', p_staff_name,
    'timestamp',  now()
  );

exception when others then
  return json_build_object('success', false, 'error', SQLERRM, 'code', SQLSTATE);
end;
$$ language plpgsql security definer set search_path = public;

grant execute on function public.accept_delegate_work_package to authenticated;

create or replace function public.accept_work_package_self(
  p_package_id uuid,
  p_staff_id   uuid,
  p_staff_name text
)
returns json as $$
declare
  v_order_id uuid;
begin
  update public.order_work_packages
  set
    status                 = 'in_progress',
    accepted_at            = now(),
    assigned_to_staff_id   = p_staff_id,
    assigned_to_staff_name = p_staff_name,
    assigned_at            = now()
  where id = p_package_id
  returning order_id into v_order_id;

  update public.orders
  set status_v2 = 'in_production',
      version   = version + 1
  where id = v_order_id
    and status_v2 in ('pending', 'awaiting_assignment', 'awaiting_acceptance');

  return json_build_object(
    'success',    true,
    'message',    'Work package accepted by kitchen lead',
    'package_id', p_package_id,
    'order_id',   v_order_id,
    'timestamp',  now()
  );

exception when others then
  return json_build_object('success', false, 'error', SQLERRM, 'code', SQLSTATE);
end;
$$ language plpgsql security definer set search_path = public;

grant execute on function public.accept_work_package_self to authenticated;

-- Ghi nhận đã chạy
insert into public.migration_runs(migration_key, status, finished_at, notes)
values('202608260020_kitchen_accept_sets_order_in_production', 'completed', now(),
  'accept_work_package_self / accept_delegate_work_package now move orders.status_v2 to in_production (guarded to pre-production statuses).')
on conflict(migration_key) do update
  set status = 'completed', finished_at = now(), notes = excluded.notes;

commit;

-- ---------------------------------------------------------------------
-- KIỂM TRA SAU KHI CHẠY — kết quả mong đợi ghi rõ ở cột "mong_doi"
-- ---------------------------------------------------------------------
select
  'Số hàm đã sao lưu'                          as kiem_tra,
  count(*)::text                               as ket_qua,
  '2'                                          as mong_doi
from public.function_backups
where label = '202608260020_kitchen_accept'

union all

select
  'Số hàm đã có logic mới',
  count(*)::text,
  '2'
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('accept_work_package_self', 'accept_delegate_work_package')
  and pg_get_functiondef(p.oid) like '%in_production%';
