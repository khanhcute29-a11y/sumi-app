-- Bán tại quầy: báo về điện thoại Giám đốc MỖI hoá đơn bán xong, như app KiotViet:
--   "Tường Vy bán đơn hàng với giá trị 18,000 tại Vĩnh Phú 42"
-- Dùng lại hàm notify_push sẵn có (Web Push nền) — không sửa luồng push.
-- Người nhận: Giám đốc của quầy (role/extra owner + bảng pos_giam_doc), trừ chính người vừa bán.
-- Lỗi gửi thông báo KHÔNG BAO GIỜ làm hỏng hoá đơn (bọc exception).
-- Chạy SAU 202611171000. Chỉ thêm hàm + trigger, không đổi bảng.
begin;
set local lock_timeout = '10s';

create or replace function public.pos__trg_bao_hoa_don_moi()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  r record;
  v_than text;
begin
  if new.status is distinct from 'xong' then return new; end if;
  v_than := coalesce(nullif(trim(coalesce(new.seller_name, new.cashier_name)), ''), 'Nhân viên')
    || ' bán đơn hàng với giá trị ' || to_char(coalesce(new.total, 0), 'FM999,999,999,990')
    || ' tại ' || new.store_location
    || case when new.offline then ' (bán lúc mất mạng)' else '' end;
  for r in select p.id from public.profiles p
    where coalesce(p.approved, false) and p.active is not false
      and p.id is distinct from new.cashier_id
      and (p.role = 'owner' or coalesce(p.extra_roles, '{}') && array['owner']
        or exists (select 1 from public.pos_giam_doc g where g.profile_id = p.id)) loop
    begin
      perform public.notify_push('Bán hàng · ' || new.code, v_than, '/?mockup=ban-hang', r.id);
    exception when others then
      raise warning 'pos bao hoa don loi: %', sqlerrm;
    end;
  end loop;
  return new;
exception when others then
  raise warning 'pos bao hoa don loi: %', sqlerrm;
  return new;
end $$;

revoke all on function public.pos__trg_bao_hoa_don_moi() from public, anon, authenticated;

drop trigger if exists pos_bao_hoa_don_moi on public.pos_invoices;
create trigger pos_bao_hoa_don_moi
  after insert on public.pos_invoices
  for each row execute function public.pos__trg_bao_hoa_don_moi();

insert into public.migration_runs(migration_key, status, finished_at, notes)
values ('202611171010_ban_hang_quay_bao_moi_hoa_don', 'completed', now(),
  'Bán tại quầy: mỗi hoá đơn bán xong đẩy thông báo về điện thoại Giám đốc (notify_push) như KiotViet.')
on conflict (migration_key) do update set status = 'completed', finished_at = now(), notes = excluded.notes;

commit;
