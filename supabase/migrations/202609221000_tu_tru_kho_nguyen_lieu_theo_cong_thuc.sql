-- Kho nguyên liệu + công thức (yêu cầu Giám đốc 21-22/09/2026, theo nhận xét
-- "sản phẩm không biết cấu thành từ đâu, phải nhập tay không số hoá được"):
--   1) Ngưỡng cảnh báo tồn thấp cho từng nguyên liệu (warehouse_stock).
--   2) Công tắc tắt/bật tự trừ kho theo công thức (product_recipes), CÙNG MẪU
--      công tắc production_photo_required (202609201500) — bật thử, không ổn
--      thì Giám đốc tắt ngay bằng 1 dòng SQL, không cần deploy lại code.
--   3) complete_work_package_and_order: sau khi hoàn thành mẻ, nếu công tắc
--      bật thì với TỪNG sản phẩm trong mẻ ĐÃ CÓ công thức, trừ đúng
--      package_quantity × qty_per_unit từ warehouse_stock của nguyên liệu đó.
--      Sản phẩm CHƯA có công thức thì bỏ qua (không đoán/không chặn).
--      Không đủ nguyên liệu để trừ: trừ tới 0 (không cho âm), KHÔNG chặn
--      hoàn thành mẻ, chỉ ghi lại domain_event 'ingredient_shortfall' để
--      Giám đốc/Bếp trưởng biết cần nhập thêm.
--      Mỗi lần trừ cũng ghi vào warehouse_stock_out_log (đã có sẵn UI xem lịch
--      sử ở màn Kho Hàng) để nhìn thấy dòng "Tự động trừ theo công thức".
begin;
set local lock_timeout = '10s';
set local statement_timeout = '30s';

alter table public.warehouse_stock
  add column if not exists low_stock_threshold numeric;

insert into public.feature_flags(key, enabled, description, rollout_percentage)
values('auto_deduct_ingredients_by_recipe', true,
  'Tu tru kho nguyen lieu theo cong thuc (product_recipes) khi bep hoan thanh me banh. Tat = chi ghi nhan hoan thanh, khong dung den kho nguyen lieu.', 100)
on conflict (key) do nothing;

create or replace function public.auto_deduct_ingredients_enabled()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select enabled from public.feature_flags where key = 'auto_deduct_ingredients_by_recipe'), true);
$$;
revoke all on function public.auto_deduct_ingredients_enabled() from public, anon;
grant execute on function public.auto_deduct_ingredients_enabled() to authenticated;

create or replace function public.complete_work_package_and_order(
  p_package_id uuid,
  p_order_id uuid,
  p_staff_id uuid,
  p_staff_name text,
  p_proof_paths text[] default null
)
returns json as $$
declare
  v_actor uuid := auth.uid();
  -- auth.uid() null = chạy từ SQL Editor/service role (quản trị) → cho qua như Giám đốc.
  v_bypass boolean := (auth.uid() is null) or coalesce(public.is_business_director(), false);
  v_need boolean := public.production_photo_required();
  v_wp public.order_work_packages%rowtype;
  v_path text;
  v_all_done boolean;
  v_order_code text;
  v_item record;
  v_recipe record;
  v_needed numeric;
  v_deducted numeric;
  v_shortfall numeric;
begin
  select * into v_wp from public.order_work_packages where id = p_package_id;
  if v_wp.id is null or v_wp.order_id <> p_order_id then
    return json_build_object('success', false, 'error', 'Không tìm thấy mẻ bánh của đơn này.', 'message', 'Không tìm thấy mẻ bánh của đơn này.');
  end if;

  -- Lưu ảnh (nếu có): chỉ nhận path CÓ THẬT trong storage (chặn gửi path giả để lách).
  foreach v_path in array coalesce(p_proof_paths, '{}'::text[]) loop
    continue when v_path is null or trim(v_path) = '';
    if not exists (select 1 from storage.objects where bucket_id = 'uploads' and name = v_path) then
      raise exception 'Ảnh thành phẩm chưa tải lên được, vui lòng chụp lại.';
    end if;
    insert into public.order_attachments(order_id, work_package_id, attachment_type, storage_path, created_by)
    values(p_order_id, p_package_id, 'production_proof', v_path, v_actor);
  end loop;

  if v_need and not public.work_package_has_production_proof(p_package_id) then
    if not v_bypass then
      raise exception 'Phải chụp ảnh thành phẩm trước khi hoàn thành. Nếu không thấy khung chụp ảnh, hãy tắt hẳn app rồi mở lại để cập nhật bản mới.';
    end if;
    insert into public.domain_events(event_type, entity_type, entity_id, actor_id, payload, idempotency_key)
    values('work_package_completed_without_photo', 'order', p_order_id, v_actor,
           jsonb_build_object('work_package_id', p_package_id, 'staff_name', p_staff_name),
           'wp-no-photo:' || p_package_id || ':' || extract(epoch from clock_timestamp())::bigint)
    on conflict (idempotency_key) do nothing;
  end if;

  update public.order_work_packages
  set
    status = 'completed',
    completed_at = now(),
    completed_by_staff_id = p_staff_id,
    completed_by_staff_name = p_staff_name
  where id = p_package_id;

  -- Tự trừ kho nguyên liệu theo công thức (chỉ sản phẩm ĐÃ có công thức, không chặn hoàn thành).
  if public.auto_deduct_ingredients_enabled() then
    select order_code into v_order_code from public.orders where id = p_order_id;
    for v_item in
      select oi.product_id, oi.name_snapshot, wpi.quantity as package_quantity
      from public.work_package_items wpi
      join public.order_items oi on oi.id = wpi.order_item_id
      where wpi.work_package_id = p_package_id and oi.product_id is not null
    loop
      for v_recipe in
        select r.ingredient_id, r.qty_per_unit, w.name as ing_name, w.unit as ing_unit, w.qty as ing_qty
        from public.product_recipes r
        join public.warehouse_stock w on w.id = r.ingredient_id
        where r.product_id = v_item.product_id
      loop
        v_needed := v_item.package_quantity * v_recipe.qty_per_unit;
        continue when v_needed <= 0;
        v_deducted := least(v_needed, greatest(0, v_recipe.ing_qty));
        v_shortfall := v_needed - v_deducted;
        update public.warehouse_stock
        set qty = greatest(0, qty - v_needed), qty_label = greatest(0, qty - v_needed)::text || ' ' || unit
        where id = v_recipe.ingredient_id;
        if v_deducted > 0 then
          insert into public.warehouse_stock_out_log(stock_id, name, qty, unit, order_code, note, staff_name)
          values(v_recipe.ingredient_id, v_recipe.ing_name, v_deducted, v_recipe.ing_unit, v_order_code,
                 'Tự động trừ theo công thức · ' || coalesce(v_item.name_snapshot, 'sản phẩm') || ' × ' || v_item.package_quantity, p_staff_name);
        end if;
        if v_shortfall > 0 then
          insert into public.domain_events(event_type, entity_type, entity_id, actor_id, payload, idempotency_key)
          values('ingredient_shortfall', 'order', p_order_id, v_actor,
                 jsonb_build_object('work_package_id', p_package_id, 'ingredient_id', v_recipe.ingredient_id,
                   'ingredient_name', v_recipe.ing_name, 'product_name', v_item.name_snapshot,
                   'needed', v_needed, 'shortfall', v_shortfall, 'unit', v_recipe.ing_unit),
                 'ing-short:' || p_package_id || ':' || v_recipe.ingredient_id)
          on conflict (idempotency_key) do nothing;
        end if;
      end loop;
    end loop;
  end if;

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
    'message', SQLERRM,
    'code', SQLSTATE
  );
end;
$$ language plpgsql security definer set search_path = public;

grant execute on function public.complete_work_package_and_order(uuid, uuid, uuid, text, text[]) to authenticated;

-- Danh sách nguyên liệu đang dưới ngưỡng cảnh báo — Giám đốc/Bếp trưởng xem ở màn Kho Hàng.
create or replace function public.list_low_stock_ingredients()
returns table(id uuid, name text, branch text, qty numeric, unit text, low_stock_threshold numeric)
language sql stable security definer set search_path = public as $$
  select id, name, branch, qty, unit, low_stock_threshold
  from public.warehouse_stock
  where low_stock_threshold is not null and qty < low_stock_threshold
  order by (qty / nullif(low_stock_threshold, 0)) asc;
$$;
revoke all on function public.list_low_stock_ingredients() from public, anon;
grant execute on function public.list_low_stock_ingredients() to authenticated;

insert into public.migration_runs(migration_key, status, finished_at, notes)
values('202609221000_tu_tru_kho_nguyen_lieu_theo_cong_thuc', 'completed', now(),
  'Them low_stock_threshold vao warehouse_stock; cong tac auto_deduct_ingredients_by_recipe; complete_work_package_and_order tu tru kho nguyen lieu theo product_recipes (khong chan hoan thanh, ghi domain_event ingredient_shortfall khi thieu); RPC list_low_stock_ingredients cho canh bao ton thap.')
on conflict(migration_key) do update set status='completed', finished_at=now(), notes=excluded.notes;

commit;
