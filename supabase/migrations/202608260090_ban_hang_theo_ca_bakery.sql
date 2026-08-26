-- Nhân viên BÁN HÀNG (sale) theo ca Bakery.
--
-- Quy định ngày 26/08 ghi "Bakery (Tiệm bánh: Thu Ngân, bếp lạnh, bếp nóng)",
-- không nhắc tới bán hàng, nên bản trước để họ ngoài mọi ca — tức là không bị
-- tính đi muộn.
--
-- Dữ liệu chấm công thật cho thấy đó là thiếu sót: chị Phan Trương Tường Vy
-- (chức danh sale) chấm vào lúc 05:29, sát ca sáng Bakery (05:15). Anh Nghĩa
-- xác nhận bán hàng làm cùng ca với tiệm bánh.
--
-- Ảnh hưởng: 4 người chức danh sale từ nay được tính đi muộn theo ca Bakery
-- (sáng 05:15 / chiều 13:30). Chỉ áp dụng cho lần chấm MỚI — bản ghi cũ không
-- tính lại.
begin;

create or replace function public.sumi_bo_phan_cham_cong(p_staff_id uuid)
returns text language plpgsql stable security definer set search_path = public as $fn$
declare
  v_st   text;
  v_role text;
begin
  select nullif(btrim(station), ''), role into v_st, v_role
  from public.profiles where id = p_staff_id;

  -- Đã gán khâu thì lấy theo khâu.
  if v_st in ('lanh', 'nong')            then return 'bakery';  end if;
  if v_st = 'xuong41'                    then return 'xuong41'; end if;
  if v_st = 'xuong42'                    then return 'xuong42'; end if;

  -- Chưa gán khâu -> suy từ chức danh.
  if v_role = 'shipper'                  then return 'van_tai'; end if;
  -- 'sale' = bán hàng tại tiệm, làm cùng ca với thu ngân và bếp.
  if v_role in ('cashier', 'sale', 'bakery', 'kitchen_lead') then return 'bakery'; end if;
  if v_role in ('kho_xuong42', 'deputy_director_x42') then return 'xuong42'; end if;
  if v_role = 'deputy_director_x41'      then return 'xuong41'; end if;

  -- Giám đốc, quản lý, kế toán, kho... không thuộc ca cố định.
  return null;
end;
$fn$;

grant execute on function public.sumi_bo_phan_cham_cong to authenticated;

insert into public.migration_runs(migration_key, status, finished_at, notes)
values('202608260090_ban_hang_theo_ca_bakery', 'completed', now(),
  'Maps the sale role to the bakery shift group. The 26/08 rules named only cashier and the two kitchens, so sales staff were left outside every shift and never marked late - but real attendance data showed a sales employee checking in at 05:29, right on the bakery morning shift. Confirmed by the owner. Affects 4 profiles, future check-ins only.')
on conflict(migration_key) do update
  set status = 'completed', finished_at = now(), notes = excluded.notes;

commit;
