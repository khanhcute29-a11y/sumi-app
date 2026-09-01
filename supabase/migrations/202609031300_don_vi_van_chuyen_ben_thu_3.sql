-- "Đội Vận Tải Ảo" — chuyển giao đơn cho bên vận chuyển thứ 3 (GHN, Grab,
-- Ahamove...) thay vì tài xế nội bộ. Đây là phương án THỦ CÔNG (Manual
-- Fallback): kiến trúc hiện tại KHÔNG có backend riêng để tự động gọi API
-- GHN/Grab và nhận webhook cập nhật trạng thái (client gọi thẳng Supabase,
-- chỉ có 2 Supabase Edge Function sẵn có cho Gemini OCR/Google Drive — thêm
-- 1 edge function mới để tích hợp API hãng vận chuyển thật là khả thi về mặt
-- kỹ thuật nhưng cần hợp đồng/API key với từng hãng, ngoài phạm vi hôm nay).
-- Giám đốc/Quản lý tự nhập & cập nhật trạng thái tay, tra cứu chi tiết bằng
-- Mã vận đơn ở app/web riêng của hãng.
--
-- CỐ Ý KHÔNG đụng vào delivery_runs/delivery_stops (bảng đó gắn chặt với tài
-- xế NỘI BỘ — assigned_driver_id NOT NULL references profiles(id), có
-- geofence/GPS trigger giả định thiết bị nhân viên thật) — tạo bảng riêng để
-- không phá luồng giao hàng nội bộ đang chạy.
begin;
set local lock_timeout = '10s';
set local statement_timeout = '60s';

create table if not exists public.third_party_shipments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  carrier text not null check (carrier in ('ghn','grab','ahamove','other')),
  carrier_other_name text,
  tracking_id text,
  driver_name text,
  driver_phone text,
  manual_status text not null default 'cho_lay_hang'
    check (manual_status in ('cho_lay_hang','dang_giao','da_hoan_thanh','that_bai')),
  notes text,
  handed_off_by uuid references public.profiles(id),
  handed_off_by_name text,
  handed_off_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  active boolean not null default true
);

create index if not exists idx_third_party_shipments_order on public.third_party_shipments(order_id) where active;

comment on table public.third_party_shipments is
  'Đội Vận Tải Ảo — theo dõi thủ công đơn giao qua bên thứ 3 (GHN/Grab/Ahamove). Xem migration 202609031300.';

alter table public.third_party_shipments enable row level security;

drop policy if exists "staff xem shipment ben thu 3" on public.third_party_shipments;
create policy "staff xem shipment ben thu 3" on public.third_party_shipments for select to authenticated using (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.approved = true and p.active is not false)
);

drop policy if exists "giam doc tao shipment ben thu 3" on public.third_party_shipments;
create policy "giam doc tao shipment ben thu 3" on public.third_party_shipments for insert to authenticated with check (
  public.is_business_director()
);

drop policy if exists "giam doc sua shipment ben thu 3" on public.third_party_shipments;
create policy "giam doc sua shipment ben thu 3" on public.third_party_shipments for update to authenticated using (
  public.is_business_director()
) with check (
  public.is_business_director()
);

revoke all on public.third_party_shipments from public, anon;
grant select, insert, update on public.third_party_shipments to authenticated;

-- ---------------------------------------------------------------------------
-- Chuyển giao đơn cho ĐVVC — chỉ khi đơn đã "Vào Kho Thành Phẩm" (đúng điều
-- kiện với nút "Nhận Giao" nội bộ hiện có), đẩy status_v2 sang 'in_delivery'
-- (dùng lại đúng giá trị enum sẵn có -> không đụng gì UI hiển thị trạng thái
-- đơn ở chỗ khác), version+1 để khớp cơ chế optimistic-concurrency chung.
-- ---------------------------------------------------------------------------
create or replace function public.sumi_chuyen_giao_don_vi_van_chuyen(
  p_order_id uuid,
  p_carrier text,
  p_carrier_other_name text default null,
  p_tracking_id text default null,
  p_driver_name text default null,
  p_driver_phone text default null,
  p_notes text default null
) returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_status text;
  v_ten_nguoi text;
  v_id uuid;
begin
  if not public.is_business_director() then
    return jsonb_build_object('success', false, 'error', 'Chỉ Giám đốc/Quản lý mới chuyển giao được đơn vị vận chuyển.');
  end if;
  if p_carrier not in ('ghn','grab','ahamove','other') then
    return jsonb_build_object('success', false, 'error', 'Đơn vị vận chuyển không hợp lệ.');
  end if;

  select status_v2 into v_status from public.orders where id = p_order_id for update;
  if v_status is null then
    return jsonb_build_object('success', false, 'error', 'Không tìm thấy đơn hàng.');
  end if;
  if v_status <> 'ready_for_fulfillment' then
    return jsonb_build_object('success', false, 'error', 'Đơn chưa vào Kho Thành Phẩm (chưa sẵn sàng để giao) — không thể chuyển giao.');
  end if;

  select coalesce(full_name, email) into v_ten_nguoi from public.profiles where id = auth.uid();

  insert into public.third_party_shipments(
    order_id, carrier, carrier_other_name, tracking_id, driver_name, driver_phone, notes,
    handed_off_by, handed_off_by_name
  ) values (
    p_order_id, p_carrier, nullif(btrim(coalesce(p_carrier_other_name,'')),''),
    nullif(btrim(coalesce(p_tracking_id,'')),''), nullif(btrim(coalesce(p_driver_name,'')),''),
    nullif(btrim(coalesce(p_driver_phone,'')),''), nullif(btrim(coalesce(p_notes,'')),''),
    auth.uid(), v_ten_nguoi
  ) returning id into v_id;

  update public.orders set status_v2 = 'in_delivery', version = version + 1
  where id = p_order_id;

  return jsonb_build_object('success', true, 'id', v_id, 'message', 'Đã chuyển giao đơn cho đơn vị vận chuyển.');
end;
$fn$;

-- ---------------------------------------------------------------------------
-- Cập nhật trạng thái thủ công. Khi đánh dấu "Đã hoàn thành" -> đóng đơn
-- (status_v2='completed'), payment_verified giữ mặc định false (đơn COD thu
-- hộ qua hãng vận chuyển, Kế toán vẫn phải đối soát/xác minh riêng — không tự
-- tính vào Doanh thu thuần, khớp đúng luồng Payment Verification Gateway đã
-- có cho giao hàng nội bộ). Khi đánh dấu "Thất bại" -> trả đơn lại trạng thái
-- 'ready_for_fulfillment' để Giám đốc thử chuyển giao lại (ĐVVC khác hoặc
-- giao nội bộ), CHỈ khi đơn vẫn đang 'in_delivery' (an toàn nếu đã bị đổi
-- trạng thái bằng đường khác từ lúc chuyển giao).
-- ---------------------------------------------------------------------------
create or replace function public.sumi_cap_nhat_trang_thai_van_chuyen(
  p_shipment_id uuid, p_status text, p_notes text default null
) returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_order_id uuid;
  v_order_status text;
begin
  if not public.is_business_director() then
    return jsonb_build_object('success', false, 'error', 'Chỉ Giám đốc/Quản lý mới cập nhật được trạng thái vận chuyển.');
  end if;
  if p_status not in ('cho_lay_hang','dang_giao','da_hoan_thanh','that_bai') then
    return jsonb_build_object('success', false, 'error', 'Trạng thái không hợp lệ.');
  end if;

  update public.third_party_shipments
  set manual_status = p_status, notes = coalesce(nullif(btrim(coalesce(p_notes,'')),''), notes), updated_at = now()
  where id = p_shipment_id and active
  returning order_id into v_order_id;

  if v_order_id is null then
    return jsonb_build_object('success', false, 'error', 'Không tìm thấy lượt chuyển giao.');
  end if;

  select status_v2 into v_order_status from public.orders where id = v_order_id for update;

  if p_status = 'da_hoan_thanh' and v_order_status = 'in_delivery' then
    update public.orders set status_v2 = 'completed', version = version + 1 where id = v_order_id;
  elsif p_status = 'that_bai' and v_order_status = 'in_delivery' then
    update public.orders set status_v2 = 'ready_for_fulfillment', version = version + 1 where id = v_order_id;
  end if;

  return jsonb_build_object('success', true, 'message', 'Đã cập nhật trạng thái vận chuyển.');
end;
$fn$;

revoke all on function public.sumi_chuyen_giao_don_vi_van_chuyen(uuid, text, text, text, text, text, text) from public, anon;
grant execute on function public.sumi_chuyen_giao_don_vi_van_chuyen(uuid, text, text, text, text, text, text) to authenticated;
revoke all on function public.sumi_cap_nhat_trang_thai_van_chuyen(uuid, text, text) from public, anon;
grant execute on function public.sumi_cap_nhat_trang_thai_van_chuyen(uuid, text, text) to authenticated;

insert into public.migration_runs(migration_key, status, finished_at, notes)
values('202609031300_don_vi_van_chuyen_ben_thu_3', 'completed', now(),
  'Thêm bảng third_party_shipments (Đội Vận Tải Ảo — GHN/Grab/Ahamove/khác, thủ công, không đụng delivery_runs nội bộ) + 2 RPC: sumi_chuyen_giao_don_vi_van_chuyen (director-only, chỉ khi status_v2=ready_for_fulfillment, đẩy sang in_delivery), sumi_cap_nhat_trang_thai_van_chuyen (director-only, hoàn thành->completed, thất bại->trả về ready_for_fulfillment để chuyển giao lại). Đánh giá kèm theo: kiến trúc hiện tại (Supabase client-only + 2 Edge Function có sẵn cho Gemini/Google Drive) về mặt kỹ thuật CÓ thể thêm Edge Function gọi API GHN/Grab thật + webhook, nhưng cần API key/hợp đồng với hãng nên chưa làm ở migration này — module thủ công là fallback an toàn ngay bây giờ.')
on conflict(migration_key) do update set status='completed', finished_at=now(), notes=excluded.notes;

commit;
