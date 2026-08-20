-- Run manually in Supabase SQL Editor. Safe to re-run (idempotent).
--
-- Bug: Bếp Trưởng (kitchen_lead) không bấm "Nhận đơn" được. `enforce_order_update_permissions`
-- (migrate_task_management.sql) đã nhận diện kitchen_lead/kitchen_deputy tương đương kitchen,
-- nhưng policy RLS "update orders" (migrate_orders_security.sql, tái khai báo ở
-- migrate_staff_active.sql) chưa từng liệt kê 2 role này — nên bị chặn ngay ở tầng RLS,
-- trước khi trigger kịp chạy. `enforce_order_self_claim_columns`'s ops allowlist
-- (migrate_task_management.sql) và trigger khoá trường tài chính
-- `enforce_order_update_rules` (migrate_orders_security.sql) cũng có cùng lỗ hổng.

drop policy if exists "update orders" on orders;
create policy "update orders" on orders for update
  using (
    public.is_approved()
    and exists (
      select 1 from profiles
      where id = auth.uid()
        and (
          role in ('owner','admin','cashier','sale','kitchen','bakery','shipper','kitchen_lead','kitchen_deputy')
          or extra_roles && array['owner','admin','cashier','sale','kitchen','bakery','shipper','kitchen_lead','kitchen_deputy']
        )
    )
  );

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

  if actor_role in ('kitchen','bakery','shipper','kitchen_lead','kitchen_deputy') then
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

create or replace function public.enforce_order_self_claim_columns()
returns trigger as $$
declare
  is_ops boolean;
  my_name text;
  allowed_cols text[];
  changed_keys text[];
begin
  if auth.uid() is null then
    return new; -- service role / SQL editor
  end if;

  select exists (
    select 1 from profiles
    where id = auth.uid()
      and (
        role in ('owner','admin','cashier','sale','kitchen','bakery','shipper','kitchen_lead','kitchen_deputy')
        or extra_roles && array['owner','admin','cashier','sale','kitchen','bakery','shipper','kitchen_lead','kitchen_deputy']
      )
  ) into is_ops;

  if is_ops then
    return new;
  end if;

  -- Người ngoài nhóm vận hành đơn: chỉ được đổi đúng các cột của thao tác nhận giao hộ
  -- (xuất bến) và của thao tác hoàn tất chính đơn mình đang giao.
  select full_name into my_name from profiles where id = auth.uid();

  if old.status = 'cho_giao' and new.status = 'dang_giao'
     and my_name is not null and new.shipper_staff_name = my_name then
    allowed_cols := array['status', 'shipper_staff_name', 'pickup_photo_url', 'pickup_lat', 'pickup_lng'];
  elsif old.status = 'dang_giao' and new.status in ('dang_giao', 'hoan_thanh')
     and my_name is not null and old.shipper_staff_name = my_name then
    allowed_cols := array['status', 'shipper_staff_name', 'pickup_photo_url', 'pickup_lat', 'pickup_lng',
      'delivery_photo_url', 'delivery_lat', 'delivery_lng', 'completed_at', 'late_reason', 'signed_doc_photo_url'];
  else
    raise exception 'Bạn chỉ được nhận giao hộ, hoặc hoàn tất đơn chính mình đang giao.';
  end if;

  select array_agg(n.key) into changed_keys
  from jsonb_each(to_jsonb(new)) n
  join jsonb_each(to_jsonb(old)) o on n.key = o.key
  where n.value is distinct from o.value;

  if changed_keys is not null and exists (select 1 from unnest(changed_keys) k where k <> all (allowed_cols)) then
    raise exception 'Bạn chỉ được nhận giao hộ đơn này, không được sửa thông tin khác của đơn.';
  end if;

  return new;
end;
$$ language plpgsql security definer set search_path = public;
