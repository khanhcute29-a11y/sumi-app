-- =====================================================================
-- KHÔI PHỤC KHẨN CẤP — trả mọi thứ về đúng như trước khi chạy bước 1 & 2
-- Chỉ dùng khi thấy có vấn đề. Dán vào SQL Editor > Run.
-- =====================================================================
--
-- File này lấy lại đúng bản sao lưu đã tạo ở bước 1 và bước 2.
-- An toàn: nếu không tìm thấy bản sao lưu, nó báo lỗi rõ ràng và
-- KHÔNG thay đổi gì cả.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- (1) Trả 2 hàm về định nghĩa cũ
-- ---------------------------------------------------------------------
do $$
declare
  v_def   text;
  v_count int := 0;
begin
  if to_regclass('public.function_backups') is null then
    raise exception 'Chưa có bảng sao lưu — nghĩa là bước 1 chưa từng chạy. Không có gì để khôi phục.';
  end if;

  for v_def in
    select definition
    from public.function_backups
    where label = '202608260020_kitchen_accept'
    order by id
  loop
    execute v_def;
    v_count := v_count + 1;
  end loop;

  if v_count = 0 then
    raise exception 'Không tìm thấy bản sao lưu hàm. Chưa khôi phục gì cả.';
  end if;

  raise notice 'Đã khôi phục % hàm về bản cũ.', v_count;
end $$;

-- ---------------------------------------------------------------------
-- (2) Trả trạng thái các đơn đã dọn ở bước 2 về như cũ
--     (bỏ qua nếu bro chưa chạy bước 2)
-- ---------------------------------------------------------------------
-- Bọc trong khối kiểm tra: nếu bro chưa chạy bước 2 thì bảng sao lưu đơn
-- chưa tồn tại. Trước đây chỗ này làm cả file khôi phục chết giữa chừng và
-- KHÔNG khôi phục được gì. Giờ nó chỉ bỏ qua và chạy tiếp.
do $$
declare
  v_count int := 0;
begin
  if to_regclass('public.order_status_backups') is null then
    raise notice 'Chưa chạy bước 2 — bỏ qua phần khôi phục trạng thái đơn.';
    return;
  end if;

  update public.orders o
  set status_v2 = b.old_status_v2,
      version   = version + 1
  from public.order_status_backups b
  where b.order_id = o.id
    and b.label = '202608260020_backfill'
    and o.status_v2 = 'in_production';

  get diagnostics v_count = row_count;
  raise notice 'Đã trả % đơn về trạng thái cũ.', v_count;
end $$;

-- Xoá dấu vết migration để hệ thống coi như chưa từng chạy
delete from public.migration_runs
where migration_key = '202608260020_kitchen_accept_sets_order_in_production';

commit;

-- ---------------------------------------------------------------------
-- KIỂM TRA SAU KHI KHÔI PHỤC
-- ---------------------------------------------------------------------
select
  'Số hàm CÒN logic mới (mong đợi: 0)' as kiem_tra,
  count(*)::text                        as ket_qua
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('accept_work_package_self', 'accept_delegate_work_package')
  and pg_get_functiondef(p.oid) like '%in_production%';
