-- Quét codebase phát hiện: order_work_packages/work_package_items có policy
-- INSERT dư thừa với check(true) (owp_insert, wpi_insert) — cho phép BẤT KỲ
-- ai đăng nhập insert dòng tuỳ ý vào 2 bảng phân công việc bếp, trong khi đã
-- có policy INSERT đúng phạm vi khác (chỉ giám đốc/quản lý qua
-- "directors assign work packages" / "package managers write work package
-- items"). Vì Postgres OR các permissive policy cho cùng 1 lệnh, policy
-- check(true) làm policy đúng phạm vi kia vô nghĩa.
--
-- Xác minh trước khi xoá: không có nơi nào trong client code gọi
-- .from('order_work_packages').insert(...)/.from('work_package_items').insert(...)
-- trực tiếp — mọi thao tác ghi đều đi qua RPC SECURITY DEFINER (vd
-- complete_kitchen_work_package_with_proof, accept_work_package_self...),
-- các RPC này không bị ảnh hưởng vì SECURITY DEFINER không chịu RLS của
-- caller. Xoá 2 policy dư này an toàn, không phá luồng nào đang chạy thật.
begin;
set local lock_timeout = '10s';
set local statement_timeout = '30s';

drop policy if exists owp_insert on public.order_work_packages;
drop policy if exists wpi_insert on public.work_package_items;

insert into public.migration_runs(migration_key, status, finished_at, notes)
values('202609062200_siet_insert_work_packages', 'completed', now(),
  'Xoa 2 policy INSERT check(true) du thua tren order_work_packages/work_package_items - da co policy dung pham vi khac, khong co client insert truc tiep nao dung toi.')
on conflict(migration_key) do update set status='completed', finished_at=now(), notes=excluded.notes;

commit;
