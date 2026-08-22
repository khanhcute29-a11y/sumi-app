-- SUMI APP M19 — keep the legacy order status in lockstep with V2 commands.

begin;

create or replace function public.sync_legacy_order_status_from_v2()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status_v2 is distinct from old.status_v2 then
    new.status := case new.status_v2
      when 'awaiting_assignment' then 'moi'
      when 'awaiting_acceptance' then 'moi'
      when 'in_production' then 'dang_lam'
      when 'ready_for_fulfillment' then 'cho_giao'
      when 'in_delivery' then 'dang_giao'
      when 'completed' then 'hoan_thanh'
      when 'cancelled' then 'huy'
      else new.status
    end;
  end if;
  return new;
end;
$$;

drop trigger if exists a_sync_legacy_order_status_from_v2 on public.orders;
create trigger a_sync_legacy_order_status_from_v2
before update on public.orders
for each row execute function public.sync_legacy_order_status_from_v2();

-- Direct table writes are revoked from authenticated users in M11. These
-- columns are therefore reachable only through the guarded V2 commands, but
-- the legacy trigger still needs to accept the command's synchronized fields.
create or replace function public.enforce_order_update_permissions()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  my_role text;
  my_name text;
  allowed_cols text[];
  changed_keys text[];
begin
  select role into my_role from profiles where id=auth.uid();
  if my_role in ('owner','cashier','admin','sale') then return new; end if;

  if my_role in ('kitchen','bakery','kitchen_lead','kitchen_deputy') then
    if not (old.status in ('moi','dang_lam') and new.status in ('moi','dang_lam','cho_giao')) then
      raise exception 'Bếp chỉ được thao tác đơn ở bước Mới / Đang làm / chuyển sang Chờ giao.';
    end if;
    allowed_cols:=array['status','status_v2','version','kitchen_staff_name','kitchen_photo_url'];
  elsif my_role='shipper' then
    if not (old.status in ('cho_giao','dang_giao') and new.status in ('cho_giao','dang_giao','hoan_thanh')) then
      raise exception 'Vận chuyển chỉ được thao tác đơn ở bước Chờ giao / Đang giao / Hoàn thành.';
    end if;
    allowed_cols:=array['status','status_v2','version','shipper_staff_name','pickup_photo_url','delivery_photo_url','signed_doc_photo_url',
      'pickup_lat','pickup_lng','delivery_lat','delivery_lng','completed_at','late_reason'];
  else
    select full_name into my_name from profiles where id=auth.uid();
    if old.status='cho_giao' and new.status='dang_giao' and my_name is not null and new.shipper_staff_name=my_name then
      allowed_cols:=array['status','status_v2','version','shipper_staff_name','pickup_photo_url','pickup_lat','pickup_lng'];
    elsif old.status='dang_giao' and new.status in ('dang_giao','hoan_thanh') and my_name is not null and old.shipper_staff_name=my_name then
      allowed_cols:=array['status','status_v2','version','shipper_staff_name','pickup_photo_url','pickup_lat','pickup_lng',
        'delivery_photo_url','delivery_lat','delivery_lng','completed_at','late_reason','signed_doc_photo_url'];
    else
      raise exception 'Bạn không có quyền sửa đơn hàng.';
    end if;
  end if;

  select array_agg(n.key) into changed_keys
  from jsonb_each(to_jsonb(new)) n join jsonb_each(to_jsonb(old)) o on n.key=o.key
  where n.value is distinct from o.value;
  if changed_keys is not null and exists(select 1 from unnest(changed_keys) k where k<>all(allowed_cols)) then
    raise exception 'Bạn không có quyền sửa các trường: %',array_to_string(changed_keys,', ');
  end if;
  return new;
end;
$$;

revoke all on function public.sync_legacy_order_status_from_v2() from public,anon,authenticated;
revoke all on function public.enforce_order_update_permissions() from public,anon,authenticated;

insert into public.migration_runs(migration_key,status,finished_at,notes)
values('202608220019_sync_legacy_order_status','completed',now(),'Synchronized V2 and legacy order statuses before legacy role enforcement.')
on conflict(migration_key) do update set status='completed',finished_at=now(),notes=excluded.notes;

commit;
