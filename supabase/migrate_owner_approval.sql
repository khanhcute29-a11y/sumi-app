-- Migration: sửa/huỷ/xoá đơn hàng chỉ owner/admin được làm trực tiếp — cashier/sale
-- phải gửi yêu cầu (qua bình luận) để sếp duyệt và tự thao tác.
--
-- Lưu ý: chỉ áp dụng cho cashier/sale. Bếp/Vận chuyển (kitchen/bakery/shipper) vẫn cần
-- UPDATE orders để cập nhật status/staff_name/photo trong quy trình vận hành bình thường —
-- không đụng vào quyền của các vai trò đó.

-- 1. Xoá đơn: chỉ owner/admin (bỏ cashier/sale khỏi policy cũ)
drop policy if exists "delete orders" on orders;
create policy "delete orders" on orders for delete
  using (status <> 'huy' and exists (select 1 from profiles where id = auth.uid() and role in ('owner','admin')));

-- 2. Sửa/huỷ đơn (UPDATE orders nói chung): chặn cashier/sale sửa MỌI trường trừ
--    paid_amount (đánh dấu đã thu COD — thao tác hàng ngày ở Sổ Quỹ, không phải "sửa đơn").
--    Bếp/Vận chuyển vẫn giữ nguyên quyền cập nhật status/staff_name/photo như cũ.
create or replace function public.enforce_order_update_rules()
returns trigger as $$
declare
  actor_role text;
begin
  select role into actor_role from profiles where id = auth.uid();

  if actor_role in ('cashier','sale') then
    if (to_jsonb(new) - 'paid_amount') is distinct from (to_jsonb(old) - 'paid_amount') then
      raise exception 'Vai trò này chỉ được cập nhật số tiền đã thu — mọi thay đổi khác (sửa/huỷ đơn) cần gửi yêu cầu cho sếp qua bình luận đơn hàng.';
    end if;
  end if;

  if (new.paid_amount < old.paid_amount or new.deposit < old.deposit)
     and coalesce(actor_role, '') not in ('owner','admin') then
    raise exception 'Không được giảm số tiền đã thu/đặt cọc — cần chủ hoặc quản lý duyệt.';
  end if;

  if actor_role in ('kitchen','bakery','shipper') then
    if new.total is distinct from old.total
       or new.ship_fee is distinct from old.ship_fee
       or new.deposit is distinct from old.deposit
       or new.paid_amount is distinct from old.paid_amount
       or new.payment_method is distinct from old.payment_method then
      raise exception 'Vai trò bếp/vận chuyển không được sửa thông tin tài chính của đơn.';
    end if;
  end if;

  return new;
end;
$$ language plpgsql security definer set search_path = public;
