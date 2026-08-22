-- SUMI APP M20 — recognize kitchen leadership in the legacy self-claim guard.
begin;
create or replace function public.enforce_order_self_claim_columns()
returns trigger language plpgsql security definer set search_path=public as $$
declare is_ops boolean;my_name text;allowed_cols text[];changed_keys text[];
begin
 if auth.uid() is null then return new;end if;
 select exists(select 1 from profiles where id=auth.uid() and (
  role in('owner','admin','cashier','sale','kitchen','bakery','shipper','kitchen_lead','kitchen_deputy')
  or extra_roles && array['owner','admin','cashier','sale','kitchen','bakery','shipper','kitchen_lead','kitchen_deputy'])) into is_ops;
 if is_ops then return new;end if;
 select full_name into my_name from profiles where id=auth.uid();
 if old.status='cho_giao' and new.status='dang_giao' and my_name is not null and new.shipper_staff_name=my_name then
  allowed_cols:=array['status','status_v2','version','shipper_staff_name','pickup_photo_url','pickup_lat','pickup_lng'];
 elsif old.status='dang_giao' and new.status in('dang_giao','hoan_thanh') and my_name is not null and old.shipper_staff_name=my_name then
  allowed_cols:=array['status','status_v2','version','shipper_staff_name','pickup_photo_url','pickup_lat','pickup_lng',
   'delivery_photo_url','delivery_lat','delivery_lng','completed_at','late_reason','signed_doc_photo_url'];
 else raise exception 'Bạn chỉ được nhận giao hộ, hoặc hoàn tất đơn chính mình đang giao.';end if;
 select array_agg(n.key) into changed_keys from jsonb_each(to_jsonb(new)) n join jsonb_each(to_jsonb(old)) o on n.key=o.key where n.value is distinct from o.value;
 if changed_keys is not null and exists(select 1 from unnest(changed_keys) k where k<>all(allowed_cols)) then
  raise exception 'Bạn chỉ được nhận giao hộ đơn này, không được sửa thông tin khác của đơn.';end if;
 return new;
end $$;
revoke all on function public.enforce_order_self_claim_columns() from public,anon,authenticated;
insert into public.migration_runs(migration_key,status,finished_at,notes) values
('202608220020_recognize_kitchen_lead_v2','completed',now(),'Added kitchen lead/deputy to the legacy operational guard and V2 fields to delegated delivery transitions.')
on conflict(migration_key) do update set status='completed',finished_at=now(),notes=excluded.notes;
commit;
