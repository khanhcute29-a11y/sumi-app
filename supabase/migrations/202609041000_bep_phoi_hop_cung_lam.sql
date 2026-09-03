-- "Bếp phối hợp" — làm rõ lại đúng ý nghiệp vụ sau khi hỏi trực tiếp Giám đốc:
-- KHÔNG phải chia nhỏ số lượng còn lại (đó là cơ chế assign_order_package cũ,
-- vẫn giữ nguyên cho trường hợp thật sự cần chia bài loại trừ giữa các
-- xưởng) — mà là cho một bếp KHÁC cùng làm CHUNG đúng phần bếp chính đang
-- làm, có gói việc riêng để giao cho thợ bếp của họ (PackageTaskPanel), hỗ
-- trợ/giám sát/luyện tập.
--
-- Vì đây là quy tắc số lượng NGƯỢC HẲN với assign_order_package (được phép
-- trùng số lượng, không kiểm tra tổng), CỐ Ý tạo RPC MỚI riêng biệt thay vì
-- sửa assign_order_package — không đụng, không rủi ro gì tới luồng phân bếp
-- chính/chia bài loại trừ đang chạy đúng cho các đơn khác.
begin;
set local lock_timeout = '10s';
set local statement_timeout = '60s';

-- ---------------------------------------------------------------------------
-- 1. Cột đánh dấu gói việc nào là "cùng làm" (không giữ chỗ số lượng riêng)
--    — để báo cáo/KPI sau này phân biệt được, tránh đếm trùng sản lượng.
-- ---------------------------------------------------------------------------
alter table public.order_work_packages add column if not exists is_collaborative boolean not null default false;

create or replace view public.order_work_packages_readable as
select id, order_id, unit_id, status, due_at, accepted_at, completed_at, version, is_collaborative
from public.order_work_packages;

-- ---------------------------------------------------------------------------
-- 2. RPC mới — KHÔNG kiểm tra tổng số lượng, KHÔNG đụng orders.status_v2
--    (đơn đã qua giai đoạn "chờ nhận" từ bếp chính rồi, ép lùi lại trạng thái
--    sẽ làm rối cả luồng KDS/giao hàng — đây chính là "tác dụng phụ" phải
--    tránh).
-- ---------------------------------------------------------------------------
create or replace function public.assign_order_package_collab(
  p_idempotency_key text, p_order_id uuid, p_unit_id uuid, p_due_at timestamptz, p_items jsonb
) returns uuid language plpgsql security definer set search_path = public as $fn$
declare v_actor uuid:=auth.uid(); v_package uuid; v_order_conf text; v_item jsonb;
begin
  if not public.is_business_director() then raise exception 'director permission required'; end if;

  select confidentiality into v_order_conf from public.orders where id=p_order_id;
  if v_order_conf is null then raise exception 'order not found'; end if;

  select result_entity_id into v_package from public.command_idempotency
    where idempotency_key=p_idempotency_key and actor_id=v_actor;
  if v_package is not null then return v_package; end if;

  insert into public.order_work_packages(order_id,unit_id,assigned_by,due_at,is_collaborative)
    values(p_order_id,p_unit_id,v_actor,p_due_at,true) returning id into v_package;

  for v_item in select value from jsonb_array_elements(p_items) loop
    insert into public.work_package_items values(v_package,(v_item->>'order_item_id')::uuid,(v_item->>'quantity')::numeric);
  end loop;

  insert into public.domain_events(event_type,entity_type,entity_id,actor_id,payload,idempotency_key,confidentiality)
    values('work_package_collab_assigned','order',p_order_id,v_actor,jsonb_build_object('work_package_id',v_package,'unit_id',p_unit_id),p_idempotency_key||':event',v_order_conf);

  insert into public.notifications(event_key,recipient_unit_id,notification_type,sound_key,title,body,entity_type,entity_id,deep_link)
    values(p_idempotency_key||':notify',p_unit_id,'work_package_assigned','new_order_voice','CÙNG HỖ TRỢ ĐƠN','Bếp bạn được mời cùng hỗ trợ 1 đơn hàng','order',p_order_id,'/orders/'||p_order_id)
    on conflict(event_key) do nothing;

  insert into public.command_idempotency values(p_idempotency_key,'assign_order_package_collab',v_actor,v_package,now());

  return v_package;
end;
$fn$;

revoke all on function public.assign_order_package_collab(text,uuid,uuid,timestamptz,jsonb) from public, anon;
grant execute on function public.assign_order_package_collab(text,uuid,uuid,timestamptz,jsonb) to authenticated;

insert into public.migration_runs(migration_key, status, finished_at, notes)
values('202609041000_bep_phoi_hop_cung_lam', 'completed', now(),
  'Thêm assign_order_package_collab() — bếp phối hợp CÙNG LÀM chung phần bếp chính (không chia số lượng, không kiểm tra tổng, không đụng orders.status_v2). Tách riêng khỏi assign_order_package để không ảnh hưởng luồng chia-bài-loại-trừ đang chạy đúng. Thêm cột is_collaborative để phân biệt khi báo cáo.')
on conflict(migration_key) do update set status='completed', finished_at=now(), notes=excluded.notes;

commit;
