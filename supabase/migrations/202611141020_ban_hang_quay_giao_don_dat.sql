-- BÁN TẠI QUẦY — khách đến quầy lấy bánh đặt → đơn bên mục Đơn hàng tự "Hoàn thành" (Giám đốc duyệt 14/11/2026).
-- Chỉ THÊM 1 hàm mới, không sửa bảng/hàm của luồng đơn hàng.
--
-- Làm GIỐNG HỆT lúc shipper bấm "Hoàn Thành Giao" (complete_delivery_assignment, migration 202610051000):
--   orders.status_v2 = 'completed', status = 'hoan_thanh', completed_at = now(); khoá dòng đơn, đơn đã xong thì
--   trả về already_completed, không ghi gì thêm. Các trigger sẵn có (thông báo đơn xong, lịch sử đơn, công nợ
--   trường) chạy như mọi lần đơn hoàn thành. KHÔNG trừ kho — luồng đơn V2 đã trừ lúc đơn sẵn sàng.
--   KHÔNG bật payment_verified — xác minh thanh toán vẫn đi đúng cổng verify_order_payment như cũ.
-- Điều kiện: bếp đã báo xong (ready_for_fulfillment) và đã thu đủ (cọc + thu tại quầy ≥ tổng đơn).
--
-- Chạy thử trước: thay "commit;" cuối file bằng "rollback;" rồi chạy, không lỗi mới chạy thật.

begin;
set local lock_timeout = '10s';
set local statement_timeout = '30s';

create or replace function public.pos_giao_don(p_order uuid, p_store text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_o public.orders; v_da numeric; v_con numeric;
begin
  if public.pos_cap_do() is null then raise exception 'Tài khoản chưa được duyệt'; end if;
  if not exists (select 1 from public.pos_settings where store_location = p_store) then raise exception 'Chi nhánh không hợp lệ'; end if;
  select * into v_o from public.orders where id = p_order for update;
  if v_o.id is null then raise exception 'Không tìm thấy đơn đặt'; end if;
  if v_o.status_v2 = 'completed' then
    return jsonb_build_object('order_code', v_o.order_code, 'already_completed', true, 'completed_at', v_o.completed_at);
  end if;
  if v_o.status_v2 = 'cancelled' then raise exception 'Đơn % đã bị huỷ', v_o.order_code; end if;
  if v_o.status_v2 = 'in_delivery' then raise exception 'Đơn % đang giao cho shipper — báo điều phối trước khi đưa bánh', v_o.order_code; end if;
  if v_o.status_v2 is distinct from 'ready_for_fulfillment' then
    raise exception 'Bếp chưa báo xong đơn % — nhắn bếp bấm xong trên app rồi bấm "Giao bánh" lại (tiền đã thu vẫn giữ)', v_o.order_code;
  end if;
  select coalesce(sum(amount), 0) into v_da from public.pos_order_payments where order_id = p_order and kind = 'thu_con_lai';
  v_con := coalesce(v_o.total, 0) - coalesce(v_o.deposit, 0) - v_da;
  if v_con > 0 then raise exception 'Đơn % còn phải thu %đ — thu trước rồi giao bánh', v_o.order_code, to_char(v_con, 'FM999G999G999'); end if;

  update public.orders set status_v2 = 'completed', status = 'hoan_thanh', completed_at = now() where id = p_order;
  perform public.pos__ghi_nhat_ky(p_store, 'giao_don_dat', v_o.order_code, jsonb_build_object('tong', v_o.total, 'coc', v_o.deposit, 'thu_quay', v_da));
  return jsonb_build_object('order_code', v_o.order_code, 'already_completed', false, 'completed_at', now());
end $$;

revoke all on function public.pos_giao_don(uuid, text) from public, anon;
grant execute on function public.pos_giao_don(uuid, text) to authenticated;

insert into public.migration_runs(migration_key, status, finished_at, notes)
values ('202611141020_ban_hang_quay_giao_don_dat', 'completed', now(),
  'pos_giao_don: khách lấy bánh đặt tại quầy (bếp đã xong + đã thu đủ) → orders.status_v2 completed giống shipper Hoàn Thành Giao.')
on conflict (migration_key) do update set status = 'completed', finished_at = now(), notes = excluded.notes;

commit;
