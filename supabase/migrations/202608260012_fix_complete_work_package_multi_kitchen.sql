-- complete_work_package_and_order (M-202608260006) unconditionally set
-- orders.status_v2 = 'ready_for_fulfillment' as soon as ONE work package
-- was completed. On orders with multiple kitchens (e.g. "Thêm bếp phối
-- hợp thực hiện"), completing the first kitchen's package prematurely
-- marked the whole order ready for delivery while the other kitchen(s)
-- hadn't started/finished yet. Fix: only flip the order once every other
-- non-cancelled work package for that order is also completed, matching
-- the guard already used by complete_kitchen_work_package_with_proof
-- (M-202608230038).
begin;

create or replace function public.complete_work_package_and_order(
  p_package_id uuid,
  p_order_id uuid,
  p_staff_id uuid,
  p_staff_name text
)
returns json as $$
declare
  v_all_done boolean;
begin
  -- Update work package: mark as completed
  update public.order_work_packages
  set
    status = 'completed',
    completed_at = now(),
    completed_by_staff_id = p_staff_id,
    completed_by_staff_name = p_staff_name
  where id = p_package_id;

  -- Chỉ chuyển đơn sang "chờ vận chuyển" khi TẤT CẢ các bếp phối hợp
  -- của đơn này đều đã hoàn thành (hoặc bị hủy) — tránh báo giao hàng
  -- khi bếp khác chưa xong.
  select not exists(
    select 1 from public.order_work_packages
    where order_id = p_order_id and status not in ('completed', 'cancelled')
  ) into v_all_done;

  if v_all_done then
    update public.orders
    set status_v2 = 'ready_for_fulfillment'
    where id = p_order_id;
  end if;

  return json_build_object(
    'success', true,
    'message', 'Work package completed',
    'package_id', p_package_id,
    'order_id', p_order_id,
    'order_ready', v_all_done,
    'timestamp', now()
  );

exception when others then
  return json_build_object(
    'success', false,
    'error', SQLERRM,
    'code', SQLSTATE
  );
end;
$$ language plpgsql security definer set search_path = public;

grant execute on function public.complete_work_package_and_order to authenticated;

insert into public.migration_runs(migration_key, status, finished_at, notes)
values('202608260012_fix_complete_work_package_multi_kitchen', 'completed', now(),
  'complete_work_package_and_order now only flips orders.status_v2 to ready_for_fulfillment once every non-cancelled work package on the order is completed, instead of on the first one — fixes premature "ready for delivery" on multi-kitchen orders.')
on conflict(migration_key) do update set status='completed', finished_at=now(), notes=excluded.notes;

commit;
