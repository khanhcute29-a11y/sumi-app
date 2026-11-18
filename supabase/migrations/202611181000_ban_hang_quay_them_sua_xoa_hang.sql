-- Bán tại quầy: THÊM / SỬA / XOÁ hàng hoá ngay trên quầy (như KiotViet), KHÔNG đụng danh mục app chính.
--  • Món tạo ở quầy có Mã hàng (pos_code) → màn Tạo đơn / Sửa đơn / bếp đã lọc pos_code is null nên không thấy.
--  • "Xoá" ở quầy = ẩn khỏi quầy (cột products.pos_an), không xoá dòng: hoá đơn cũ, thẻ kho, đơn hàng vẫn nguyên.
--  • Ai được làm gì (database quyết, không tin trình duyệt):
--      Thêm món: mọi tài khoản bán hàng đã duyệt (giống quyền thêm sản phẩm ở Nhập kho).
--      Sửa / xoá món của quầy: Giám đốc + quản lý; nhân viên chỉ món CHÍNH MÌNH tạo trong 24 giờ (sửa gõ nhầm).
--      Ẩn món của app chính khỏi quầy: chỉ Giám đốc.
--      Xoá món còn tồn ở quầy nào → từ chối, phải kiểm kho về 0 trước (tránh tồn "biến mất").
-- Chỉ THÊM cột + hàm. Chạy được trước hay sau khi code lên (code cũ bỏ qua cột mới).
begin;
set local lock_timeout = '10s';

alter table public.products add column if not exists pos_an boolean not null default false;

-- Quyền sửa/xoá 1 món của quầy cho người đang gọi.
create or replace function public.pos__duoc_sua_hang(p_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select case public.pos_cap_do()
    when 'gd' then true
    when 'ql' then true
    when 'nv' then exists (select 1 from public.pos_audit_log a
      where a.action = 'them_hang' and a.actor = auth.uid() and a.detail->>'id' = p_id::text
        and a.at > now() - interval '24 hours')
    else false end
$$;

create or replace function public.pos_them_hang(p_ten text, p_nhom text, p_gia numeric,
  p_ma text default null, p_ma_vach text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_ten text := nullif(btrim(coalesce(p_ten, '')), '');
  v_nhom text := nullif(btrim(coalesce(p_nhom, '')), '');
  v_ma text := upper(nullif(btrim(coalesce(p_ma, '')), ''));
  v_vach text := nullif(btrim(coalesce(p_ma_vach, '')), '');
  v_n bigint; v_row public.products;
begin
  if public.pos_cap_do() is null then raise exception 'Tài khoản chưa được duyệt'; end if;
  if v_ten is null then raise exception 'Chưa nhập tên hàng'; end if;
  if length(v_ten) > 150 then raise exception 'Tên hàng dài quá (tối đa 150 chữ)'; end if;
  if length(coalesce(v_nhom, '')) > 60 then raise exception 'Tên nhóm hàng dài quá'; end if;
  if p_gia is null or p_gia < 0 or p_gia > 100000000 then raise exception 'Giá bán không hợp lệ'; end if;
  if v_vach is not null and length(v_vach) > 40 then raise exception 'Mã vạch dài quá'; end if;
  perform pg_advisory_xact_lock(hashtext('pos_ma_hang'));
  if v_ma is not null then
    if v_ma !~ '^[A-Z0-9._-]{1,40}$' then raise exception 'Mã hàng chỉ gồm chữ, số, dấu chấm, gạch (không dấu cách)'; end if;
    if exists (select 1 from public.products where upper(pos_code) = v_ma) then
      raise exception 'Mã % đã có, chọn mã khác hoặc để trống cho máy tự đặt', v_ma;
    end if;
  else
    select coalesce(max(substring(pos_code from 3)::bigint), 0) into v_n
      from public.products where pos_code ~ '^SP[0-9]{6}$';
    loop
      v_n := v_n + 1;
      v_ma := 'SP' || lpad(v_n::text, 6, '0');
      exit when not exists (select 1 from public.products where upper(pos_code) = v_ma);
    end loop;
  end if;
  insert into public.products(pos_code, name, pos_group, pos_barcode, price, pos_dich_vu, category, unit, active, pos_an)
  values (v_ma, v_ten, coalesce(v_nhom, 'Khác'), v_vach, round(p_gia), false, 'khac', 'cái', true, false)
  returning * into v_row;
  perform public.pos__ghi_nhat_ky(null, 'them_hang', v_ma,
    jsonb_build_object('id', v_row.id, 'ten', v_ten, 'nhom', v_row.pos_group, 'gia', v_row.price));
  return jsonb_build_object('id', v_row.id, 'pos_code', v_row.pos_code, 'name', v_row.name, 'pos_group', v_row.pos_group,
    'pos_barcode', v_row.pos_barcode, 'price', v_row.price, 'category', v_row.category, 'active', true, 'pos_an', false);
end $$;

create or replace function public.pos_sua_hang(p_id uuid, p_ten text, p_nhom text, p_gia numeric, p_ma_vach text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_ten text := nullif(btrim(coalesce(p_ten, '')), '');
  v_nhom text := nullif(btrim(coalesce(p_nhom, '')), '');
  v_vach text := nullif(btrim(coalesce(p_ma_vach, '')), '');
  v_cu public.products; v_row public.products;
begin
  if public.pos_cap_do() is null then raise exception 'Tài khoản chưa được duyệt'; end if;
  select * into v_cu from public.products where id = p_id for update;
  if v_cu.id is null or v_cu.pos_code is null or v_cu.pos_an then raise exception 'Không tìm thấy món này ở quầy'; end if;
  if not public.pos__duoc_sua_hang(p_id) then
    raise exception 'Chỉ quản lý sửa được món này (nhân viên chỉ sửa món mình vừa tạo trong 24 giờ)';
  end if;
  if v_ten is null then raise exception 'Chưa nhập tên hàng'; end if;
  if length(v_ten) > 150 then raise exception 'Tên hàng dài quá (tối đa 150 chữ)'; end if;
  if length(coalesce(v_nhom, '')) > 60 then raise exception 'Tên nhóm hàng dài quá'; end if;
  if p_gia is null or p_gia < 0 or p_gia > 100000000 then raise exception 'Giá bán không hợp lệ'; end if;
  if v_vach is not null and length(v_vach) > 40 then raise exception 'Mã vạch dài quá'; end if;
  update public.products set name = v_ten, pos_group = coalesce(v_nhom, 'Khác'), price = round(p_gia), pos_barcode = v_vach
    where id = p_id returning * into v_row;
  perform public.pos__ghi_nhat_ky(null, 'sua_hang', v_row.pos_code, jsonb_build_object('id', p_id,
    'truoc', jsonb_build_object('ten', v_cu.name, 'nhom', v_cu.pos_group, 'gia', v_cu.price, 'ma_vach', v_cu.pos_barcode),
    'sau', jsonb_build_object('ten', v_row.name, 'nhom', v_row.pos_group, 'gia', v_row.price, 'ma_vach', v_row.pos_barcode)));
  return jsonb_build_object('id', v_row.id, 'pos_code', v_row.pos_code, 'name', v_row.name, 'pos_group', v_row.pos_group,
    'pos_barcode', v_row.pos_barcode, 'price', v_row.price, 'category', v_row.category, 'active', v_row.active, 'pos_an', false);
end $$;

-- Xoá khỏi quầy (p_an = true) / hiện lại (p_an = false, chỉ Giám đốc).
create or replace function public.pos_an_hang(p_id uuid, p_an boolean default true)
returns void language plpgsql security definer set search_path = public as $$
declare v_cu public.products; v_ton record;
begin
  if public.pos_cap_do() is null then raise exception 'Tài khoản chưa được duyệt'; end if;
  select * into v_cu from public.products where id = p_id for update;
  if v_cu.id is null then raise exception 'Không tìm thấy món này'; end if;
  if v_cu.pos_an is not distinct from coalesce(p_an, true) then return; end if;
  if (v_cu.pos_code is null or p_an is false) and public.pos_cap_do() <> 'gd' then
    raise exception 'Chỉ Giám đốc làm được việc này';
  end if;
  if v_cu.pos_code is not null and not public.pos__duoc_sua_hang(p_id) then
    raise exception 'Chỉ quản lý xoá được món này (nhân viên chỉ xoá món mình vừa tạo trong 24 giờ)';
  end if;
  if coalesce(p_an, true) then
    select f.store_location, sum(f.qty) as qty into v_ton from public.finished_goods_stock f
      where f.product_id = p_id and f.store_location is not null and f.is_semi_finished = false
      group by f.store_location having sum(f.qty) <> 0 limit 1;
    if v_ton.store_location is not null then
      raise exception 'Món này còn tồn % ở %. Kiểm kho về 0 trước rồi mới xoá', trim(to_char(v_ton.qty, 'FM999999990.##')), v_ton.store_location;
    end if;
  end if;
  update public.products set pos_an = coalesce(p_an, true) where id = p_id;
  perform public.pos__ghi_nhat_ky(null, case when coalesce(p_an, true) then 'xoa_hang' else 'hien_hang' end,
    coalesce(v_cu.pos_code, v_cu.name), jsonb_build_object('id', p_id, 'ten', v_cu.name));
end $$;

revoke all on function public.pos__duoc_sua_hang(uuid) from public, anon, authenticated;
revoke all on function public.pos_them_hang(text, text, numeric, text, text) from public, anon;
revoke all on function public.pos_sua_hang(uuid, text, text, numeric, text) from public, anon;
revoke all on function public.pos_an_hang(uuid, boolean) from public, anon;
grant execute on function public.pos_them_hang(text, text, numeric, text, text) to authenticated;
grant execute on function public.pos_sua_hang(uuid, text, text, numeric, text) to authenticated;
grant execute on function public.pos_an_hang(uuid, boolean) to authenticated;

insert into public.migration_runs(migration_key, status, finished_at, notes)
values ('202611181000_ban_hang_quay_them_sua_xoa_hang', 'completed', now(),
  'Bán tại quầy: thêm/sửa/xoá (ẩn) hàng hoá ngay trên quầy; món quầy có pos_code nên không lẫn vào Tạo đơn; cột products.pos_an.')
on conflict (migration_key) do update set status = 'completed', finished_at = now(), notes = excluded.notes;

commit;
