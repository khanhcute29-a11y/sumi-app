-- Rà soát tính toàn vẹn dữ liệu đơn hàng khi đẩy sang Đội vận chuyển.
--
-- 2 lỗi THẬT tìm được (đối chiếu dữ liệu thật, không phải giả định):
--
-- 1) Đơn TỰ ĐẾN LẤY (fulfillment_method_v2='pickup') đang bị đẩy LẪN vào
--    hàng chờ điều phối giao hàng — kiểm tra dữ liệu thật (04/09/2026) thấy
--    7/20 đơn "ready_for_fulfillment" là pickup, không cần shipper nhưng vẫn
--    hiện trong danh sách chọn ở DispatchPanel (ShippingV2Screen.jsx). Nguyên
--    nhân: câu query thiếu điều kiện lọc fulfillment_method_v2. Vá cả 2 lớp:
--    RPC create_delivery_run_v3 (chặn cứng, không cho tạo chuyến cho đơn
--    pickup dù client có lỡ gửi lên) + client (không hiện đơn pickup để chọn
--    từ đầu) — sửa client ở phần code JS đính kèm sau migration này.
--
-- 2) Vai trò transport_lead (Quản lý Vận Tải, KHÁC owner/admin) bị chặn nhầm
--    ở CẢ 2 RPC (create_delivery_run_v3, start_delivery_run_v3) LẪN policy
--    RLS đọc delivery_runs — cả 3 chỗ cùng kiểm tra qua bảng
--    `profile_assignments` (đang HOÀN TOÀN RỖNG — bug pattern lặp lại đã ghi
--    nhận nhiều lần trong dự án này) nên vai trò này dù được gán cũng không
--    bao giờ điều phối được chuyến giao, và không thấy được chuyến của tài
--    xế khác ngoài chuyến của chính mình — đúng triệu chứng "có luồng thấy,
--    có luồng không" khi xét theo vai trò Quản lý Vận Tải. Hiện chưa ai được
--    gán role này (chưa lộ ra ngoài thực tế) nhưng là lỗ hổng có sẵn, vá luôn
--    bằng 1 hàm dùng chung is_transport_manager() (đọc thẳng profiles.role/
--    extra_roles, không qua profile_assignments) — cùng mẫu với
--    is_payroll_manager()/la_quan_ly_cua_ho_so() đã dùng ở các tính năng
--    trước.
begin;
set local lock_timeout = '10s';
set local statement_timeout = '30s';

create or replace function public.is_transport_manager()
returns boolean
language sql
stable security definer
set search_path to 'public'
as $function$
  select public.is_business_director() or exists(
    select 1 from public.profiles p
    where p.id = auth.uid() and p.approved = true and coalesce(p.active, true) = true
      and (p.role = 'transport_lead' or 'transport_lead' = any(coalesce(p.extra_roles, '{}'::text[])))
  );
$function$;

drop policy if exists "delivery participants read runs" on public.delivery_runs;
create policy "delivery participants read runs" on public.delivery_runs
  for select
  using (
    public.is_business_director()
    or assigned_driver_id = auth.uid()
    or public.is_transport_manager()
  );

create or replace function public.create_delivery_run_v3(
  p_idempotency_key text, p_driver_id uuid, p_order_ids uuid[],
  p_planned_distance_km numeric, p_provider text, p_provider_label text, p_shipping_fee numeric
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_actor uuid:=auth.uid();v_run uuid;v_order uuid;v_seq int:=0;v_provider text:=coalesce(p_provider,'internal');
begin
 if not public.is_transport_manager() then raise exception 'delivery assignment permission required'; end if;
 if v_provider not in ('internal','grab','external') then raise exception 'invalid delivery provider'; end if;
 if v_provider='internal' and not exists(select 1 from public.profiles where id=p_driver_id and approved and active) then raise exception 'driver inactive'; end if;
 if v_provider<>'internal' and trim(coalesce(p_provider_label,''))='' then raise exception 'provider name required'; end if;
 if coalesce(array_length(p_order_ids,1),0)=0 then raise exception 'orders required'; end if;
 select result_entity_id into v_run from public.command_idempotency where idempotency_key=p_idempotency_key and actor_id=v_actor;
 if v_run is not null then return v_run; end if;
 if exists(select 1 from public.orders where id=any(p_order_ids) and status_v2<>'ready_for_fulfillment' and not allow_partial_fulfillment) then raise exception 'order is not ready for delivery'; end if;
 -- Chặn cứng: đơn tự đến lấy (pickup) không được đưa vào chuyến giao —
 -- vá lỗi thật ngày 04/09/2026 (đơn pickup lẫn vào hàng chờ điều phối).
 if exists(select 1 from public.orders where id=any(p_order_ids) and fulfillment_method_v2 <> 'delivery') then raise exception 'order is pickup, not delivery'; end if;
 insert into public.delivery_runs(run_code,assigned_driver_id,assigned_by,status,planned_distance_km,distance_source,provider,provider_label,shipping_fee)
 values('RUN-'||to_char(now(),'YYMMDD-HH24MI')||'-'||upper(substr(md5(p_idempotency_key),1,4)),case when v_provider='internal' then p_driver_id end,v_actor,'planned',p_planned_distance_km,case when p_planned_distance_km is null then null else 'planned' end,v_provider,nullif(trim(coalesce(p_provider_label,'')),''),p_shipping_fee) returning id into v_run;
 foreach v_order in array p_order_ids loop v_seq:=v_seq+1;
  insert into public.delivery_stops(delivery_run_id,order_id,sequence_no,status,destination_address,destination_lat,destination_lng) select v_run,id,v_seq,'pending',address,delivery_lat,delivery_lng from public.orders where id=v_order;
  update public.orders set status_v2='ready_for_fulfillment',shipper_staff_name=case when v_provider='internal' then (select full_name from public.profiles where id=p_driver_id) else coalesce(nullif(trim(p_provider_label),''),upper(v_provider)) end,version=version+1 where id=v_order;
  insert into public.domain_events(event_type,entity_type,entity_id,actor_id,payload,idempotency_key,confidentiality) select 'delivery_assigned','order',id,v_actor,jsonb_build_object('delivery_run_id',v_run,'driver_id',p_driver_id,'provider',v_provider,'provider_label',p_provider_label,'shipping_fee',p_shipping_fee),p_idempotency_key||':event:'||id,confidentiality from public.orders where id=v_order;
 end loop;
 if v_provider='internal' then insert into public.notifications(event_key,recipient_profile_id,notification_type,sound_key,title,body,entity_type,entity_id,deep_link) values(p_idempotency_key||':notify',p_driver_id,'delivery_assigned','ting','Bạn có chuyến giao mới',v_seq||' điểm giao','delivery_run',v_run,'/shipping/'||v_run); end if;
 insert into public.command_idempotency values(p_idempotency_key,'create_delivery_run_v3',v_actor,v_run,now());return v_run;
end $function$;

create or replace function public.start_delivery_run_v3(
  p_idempotency_key text, p_run_id uuid, p_expected_version integer, p_lat numeric, p_lng numeric
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_actor uuid:=auth.uid();v_run public.delivery_runs%rowtype;
begin select * into v_run from public.delivery_runs where id=p_run_id for update;
 if v_run.id is null or v_run.version<>p_expected_version then raise exception 'run version conflict'; end if;
 if v_run.provider='internal' then
  if v_run.assigned_driver_id<>v_actor or v_run.status<>'accepted' then raise exception 'run cannot be started'; end if;
 elsif not public.is_transport_manager() then raise exception 'external delivery permission required';
 end if;
 update public.delivery_runs set status='in_transit',started_at=now(),start_lat=p_lat,start_lng=p_lng,version=version+1 where id=p_run_id;
 update public.orders set status='dang_giao',status_v2='in_delivery',version=version+1 where id in(select order_id from public.delivery_stops where delivery_run_id=p_run_id);
 return p_run_id;end $function$;

insert into public.migration_runs(migration_key, status, finished_at, notes)
values('202609041700_toan_ven_du_lieu_don_giao_van_tai', 'completed', now(),
  'Chan don pickup vao hang cho dieu phoi giao hang (them dieu kien fulfillment_method_v2=delivery trong create_delivery_run_v3). Them ham is_transport_manager() thay the kiem tra qua profile_assignments (rong) dang chan nham vai tro transport_lead o create_delivery_run_v3/start_delivery_run_v3/RLS delivery_runs select.')
on conflict(migration_key) do update set status='completed', finished_at=now(), notes=excluded.notes;

commit;
