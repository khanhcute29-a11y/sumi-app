-- Bắt buộc ẢNH THÀNH PHẨM khi bếp bấm "Hoàn thành" mẻ bánh (yêu cầu Giám đốc
-- 20/09/2026): mọi đơn, mọi bếp, ít nhất 1 ảnh; Giám đốc (owner/admin) hoàn thành
-- hộ được không cần ảnh nhưng hệ thống GHI LẠI là "hoàn thành không ảnh".
--
-- Phát hiện khi đọc DB thật: order_attachments CHƯA có cột work_package_id (dù
-- migration 202608230038 đã insert vào cột này → complete_kitchen_work_package_
-- with_proof chưa từng chạy được). Thêm cột ở đây, để ảnh gắn đúng với mẻ bánh
-- của từng bếp (đơn nhiều bếp mỗi bếp ảnh riêng).
--
-- Chặn ở 2 lớp:
--  1) complete_work_package_and_order (đường nút "Hoàn thành") — nhận thêm
--     p_proof_paths, kiểm file ảnh THẬT SỰ có trong storage 'uploads' rồi mới cho
--     hoàn thành. Chữ ký cũ 4 tham số bị drop, thay bằng 5 tham số (thêm
--     p_proof_paths mặc định null).
--  2) Trigger trên order_work_packages: mẻ đang làm (accepted/in_progress/
--     awaiting_approval) chuyển sang completed mà chưa có ảnh → từ chối, bắt cả
--     các RPC duyệt hoàn thành khác. CỐ Ý KHÔNG chặn đường "Bánh có sẵn"
--     (mark_order_ready_from_stock hoàn thành mẻ từ trạng thái 'assigned', bếp
--     chưa hề làm nên không có gì để chụp).
-- Ảnh lưu vào order_attachments (production_proof), không xoá — xem lại được khi
-- khách khiếu nại.
begin;
set local lock_timeout = '10s';
set local statement_timeout = '30s';

alter table public.order_attachments
  add column if not exists work_package_id uuid references public.order_work_packages(id) on delete set null;
create index if not exists idx_order_attachments_work_package
  on public.order_attachments(work_package_id) where work_package_id is not null;

-- Mẻ này đã có ít nhất 1 ảnh thành phẩm mà file ảnh còn tồn tại thật trong storage?
create or replace function public.work_package_has_production_proof(p_package_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.order_attachments a
    join storage.objects so on so.bucket_id = 'uploads' and so.name = a.storage_path
    where a.work_package_id = p_package_id and a.attachment_type = 'production_proof'
  );
$$;
revoke all on function public.work_package_has_production_proof(uuid) from public, anon;
grant execute on function public.work_package_has_production_proof(uuid) to authenticated;

drop function if exists public.complete_work_package_and_order(uuid, uuid, uuid, text);
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
  v_wp public.order_work_packages%rowtype;
  v_path text;
  v_all_done boolean;
begin
  select * into v_wp from public.order_work_packages where id = p_package_id;
  if v_wp.id is null or v_wp.order_id <> p_order_id then
    return json_build_object('success', false, 'error', 'Không tìm thấy mẻ bánh của đơn này.', 'message', 'Không tìm thấy mẻ bánh của đơn này.');
  end if;

  -- Lưu ảnh: chỉ nhận path CÓ THẬT trong storage (chặn gửi path giả để lách).
  foreach v_path in array coalesce(p_proof_paths, '{}'::text[]) loop
    continue when v_path is null or trim(v_path) = '';
    if not exists (select 1 from storage.objects where bucket_id = 'uploads' and name = v_path) then
      raise exception 'Ảnh thành phẩm chưa tải lên được, vui lòng chụp lại.';
    end if;
    insert into public.order_attachments(order_id, work_package_id, attachment_type, storage_path, created_by)
    values(p_order_id, p_package_id, 'production_proof', v_path, v_actor);
  end loop;

  if not public.work_package_has_production_proof(p_package_id) then
    if not v_bypass then
      raise exception 'Phải chụp ảnh thành phẩm trước khi hoàn thành.';
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
    'message', SQLERRM,
    'code', SQLSTATE
  );
end;
$$ language plpgsql security definer set search_path = public;

grant execute on function public.complete_work_package_and_order(uuid, uuid, uuid, text, text[]) to authenticated;

-- Lớp 2: chốt ở bảng, bắt cả các đường hoàn thành mẻ khác.
create or replace function public.trg_bat_buoc_anh_thanh_pham()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'completed'
     and old.status in ('accepted', 'in_progress', 'awaiting_approval')
     and auth.uid() is not null
     and not coalesce(public.is_business_director(), false)
     and not public.work_package_has_production_proof(new.id) then
    raise exception 'Phải chụp ảnh thành phẩm trước khi hoàn thành mẻ bánh.';
  end if;
  return new;
end;
$$;

drop trigger if exists bat_buoc_anh_thanh_pham on public.order_work_packages;
create trigger bat_buoc_anh_thanh_pham
  before update of status on public.order_work_packages
  for each row
  when (new.status = 'completed' and old.status is distinct from new.status)
  execute function public.trg_bat_buoc_anh_thanh_pham();

insert into public.migration_runs(migration_key, status, finished_at, notes)
values('202609201400_bat_buoc_anh_thanh_pham_khi_bep_hoan_thanh', 'completed', now(),
  'Them cot order_attachments.work_package_id; complete_work_package_and_order nhan p_proof_paths va bat buoc anh thanh pham (Giam doc duoc mien, ghi domain_event); trigger bat_buoc_anh_thanh_pham tren order_work_packages.')
on conflict(migration_key) do update set status='completed', finished_at=now(), notes=excluded.notes;

commit;
