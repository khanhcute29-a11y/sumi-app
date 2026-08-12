-- Migration: khóa RLS cho bảng orders + chặn giảm tiền đã thu/đặt cọc.
--
-- Vấn đề: policy "update orders" cũ (auth.role() = 'authenticated') cho phép
-- BẤT KỲ tài khoản nào đã đăng nhập (kể cả bếp, shipper) sửa MỌI cột của đơn
-- hàng qua API trực tiếp — kể cả paid_amount, total, deposit. Migration này:
--   1. Giới hạn quyền update ở tầng row cho đúng các vai trò vận hành đơn.
--   2. Thêm trigger chặn ở tầng cột: không cho GIẢM paid_amount/deposit trừ
--      owner/admin, và không cho bếp/shipper đụng vào trường tài chính.
--
-- An toàn: không xoá/sửa dữ liệu hiện có, chỉ siết thêm quyền ghi.

-- 1. Thu hẹp policy "update orders" — chỉ các vai trò thao tác đơn mới được sửa
drop policy if exists "update orders" on orders;
create policy "update orders" on orders for update
  using (exists (
    select 1 from profiles
    where id = auth.uid()
      and role in ('owner','admin','cashier','sale','kitchen','bakery','shipper')
  ));

-- 2. Trigger chặn ở tầng cột: giảm tiền đã thu / đặt cọc phải là owner hoặc admin,
--    và bếp/shipper không được đụng vào trường tài chính của đơn.
create or replace function public.enforce_order_update_rules()
returns trigger as $$
declare
  actor_role text;
begin
  select role into actor_role from profiles where id = auth.uid();

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

drop trigger if exists trg_enforce_order_update_rules on orders;
create trigger trg_enforce_order_update_rules
  before update on orders
  for each row execute procedure public.enforce_order_update_rules();
