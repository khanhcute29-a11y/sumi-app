-- Công tắc BẬT/TẮT quy tắc "bắt buộc ảnh thành phẩm" (202609201400) — để Giám đốc tắt
-- tạm bằng 1 dòng SQL khi tiệm đang nghẽn đơn, KHÔNG cần deploy lại code:
--   TẮT:  update public.feature_flags set enabled = false where key = 'production_photo_required';
--   BẬT:  update public.feature_flags set enabled = true  where key = 'production_photo_required';
-- (có sẵn 2 file supabase/RUN_IN_SQL_EDITOR_TAT_ANH_THANH_PHAM.sql và ..._BAT_...)
--
-- Không có dòng cờ (hoặc không đọc được) thì MẶC ĐỊNH LÀ BẬT — an toàn hơn cho việc
-- kiểm soát. Cờ tắt: RPC và trigger không đòi ảnh; app cho hoàn thành không cần ảnh
-- (ảnh chụp thêm vẫn được lưu). Đồng thời sửa câu báo lỗi của bản app cũ còn nằm trong
-- bộ nhớ đệm để nhân viên biết cách xử lý (tải lại app).
begin;
set local lock_timeout = '10s';
set local statement_timeout = '30s';

insert into public.feature_flags(key, enabled, description, rollout_percentage)
values('production_photo_required', true,
  'Bat buoc anh thanh pham khi bep bam Hoan thanh mẻ banh. Tat = bep hoan thanh khong can anh.', 100)
on conflict (key) do nothing;

create or replace function public.production_photo_required()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select enabled from public.feature_flags where key = 'production_photo_required'), true);
$$;
revoke all on function public.production_photo_required() from public, anon;
grant execute on function public.production_photo_required() to authenticated;

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
    -- Giám đốc hoàn thành hộ không ảnh → ghi lại để truy vết.
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

create or replace function public.trg_bat_buoc_anh_thanh_pham()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'completed'
     and old.status in ('accepted', 'in_progress', 'awaiting_approval')
     and auth.uid() is not null
     and public.production_photo_required()
     and not coalesce(public.is_business_director(), false)
     and not public.work_package_has_production_proof(new.id) then
    raise exception 'Phải chụp ảnh thành phẩm trước khi hoàn thành mẻ bánh.';
  end if;
  return new;
end;
$$;

insert into public.migration_runs(migration_key, status, finished_at, notes)
values('202609201500_cong_tat_bat_buoc_anh_thanh_pham', 'completed', now(),
  'Them cong tat feature_flags.production_photo_required + ham production_photo_required(); RPC complete_work_package_and_order va trigger doc co nay; sua cau bao loi cho app ban cu.')
on conflict(migration_key) do update set status='completed', finished_at=now(), notes=excluded.notes;

commit;
