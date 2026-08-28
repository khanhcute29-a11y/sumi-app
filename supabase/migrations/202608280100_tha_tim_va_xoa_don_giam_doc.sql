-- SUMI APP M100b (28/08) — Thả tim đơn hàng (đánh dấu đã xem) + Sếp xóa hẳn đơn hàng.
--
-- Lưu ý bảo mật quan trọng: migration 202608230042 đã tạo policy
-- "allow_authenticated_all_orders ... for all to authenticated using(true) with check(true)"
-- trên bảng orders — nghĩa là HIỆN TẠI bất kỳ nhân viên nào cũng có thể gọi thẳng
-- supabase.from('orders').delete() và xóa được bất kỳ đơn nào, không chỉ Sếp.
-- Để "chỉ Sếp được xóa" là thật (không chỉ ẩn nút trên UI), migration này TÁCH policy
-- "for all" đó thành 4 policy riêng theo từng thao tác: select/insert/update giữ nguyên
-- permissive như cũ (không đổi hành vi hiện tại), CHỈ delete bị siết lại còn
-- is_business_director(). Không đụng tới order_items/work_packages/... — các bảng đó
-- vẫn giữ nguyên policy "for all" như trước, ngoài phạm vi yêu cầu lần này.

begin;

-- 1) Siết quyền XÓA đơn hàng — chỉ Giám đốc.
drop policy if exists allow_authenticated_all_orders on public.orders;
create policy "orders select cho nhan vien" on public.orders for select to authenticated using (true);
create policy "orders insert cho nhan vien" on public.orders for insert to authenticated with check (true);
create policy "orders update cho nhan vien" on public.orders for update to authenticated using (true) with check (true);
create policy "orders xoa chi giam doc" on public.orders for delete to authenticated using (public.is_business_director());

-- 2) RPC xóa đơn: kiểm tra quyền + chặn xóa nếu đơn đã có lượt giao hàng
-- (delivery_stops.order_id là on delete restrict — xóa thẳng sẽ vỡ lỗi khó hiểu
-- cho người dùng), báo lỗi thân thiện thay vì để lỗi FK gốc lộ ra ngoài.
create or replace function public.delete_order_by_director(p_order_id uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
  if not public.is_business_director() then
    raise exception 'Chỉ Giám đốc mới được xóa đơn hàng';
  end if;
  if exists(select 1 from public.delivery_stops where order_id=p_order_id) then
    raise exception 'Không thể xóa: đơn hàng này đã có lượt giao hàng liên kết. Cần xử lý phần giao hàng trước.';
  end if;
  delete from public.orders where id=p_order_id;
  if not found then
    raise exception 'Đơn hàng không tồn tại hoặc đã bị xóa trước đó';
  end if;
exception
  when foreign_key_violation then
    raise exception 'Không thể xóa: đơn hàng này vẫn còn dữ liệu liên kết ở nơi khác trong hệ thống';
end $$;

revoke all on function public.delete_order_by_director(uuid) from public, anon, authenticated;
grant execute on function public.delete_order_by_director(uuid) to authenticated;

-- 3) Thả tim đơn hàng — đánh dấu "đã xem", mỗi nhân sự chỉ thả được 1 lần/đơn,
-- không thu hồi lại được (đúng ý "chỉ 1 lần").
create table if not exists public.order_hearts (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  staff_id uuid not null references public.profiles(id) on delete cascade,
  staff_name text not null,
  created_at timestamptz not null default now(),
  unique(order_id, staff_id)
);
create index if not exists idx_order_hearts_order on public.order_hearts(order_id);

alter table public.order_hearts enable row level security;
revoke all on public.order_hearts from anon, authenticated;

drop policy if exists "xem tat ca luot tha tim" on public.order_hearts;
create policy "xem tat ca luot tha tim" on public.order_hearts for select to authenticated using (true);
grant select on public.order_hearts to authenticated;
-- Không cấp insert/update/delete trực tiếp trên bảng — bắt buộc đi qua RPC bên dưới
-- để staff_name luôn lấy đúng từ hồ sơ thật, không tin dữ liệu client gửi lên.

create or replace function public.add_order_heart(p_order_id uuid)
returns public.order_hearts language plpgsql security definer set search_path=public as $$
declare v_profile public.profiles%rowtype; v_row public.order_hearts%rowtype;
begin
  select * into v_profile from public.profiles where id=auth.uid() and approved=true and active is distinct from false;
  if not found then raise exception 'Tài khoản chưa được phép thả tim'; end if;
  if not exists(select 1 from public.orders where id=p_order_id) then
    raise exception 'Đơn hàng không tồn tại';
  end if;
  insert into public.order_hearts(order_id, staff_id, staff_name)
  values(p_order_id, auth.uid(), v_profile.full_name)
  on conflict (order_id, staff_id) do nothing
  returning * into v_row;
  if v_row.id is null then
    select * into v_row from public.order_hearts where order_id=p_order_id and staff_id=auth.uid();
  end if;
  return v_row;
end $$;

revoke all on function public.add_order_heart(uuid) from public, anon, authenticated;
grant execute on function public.add_order_heart(uuid) to authenticated;

insert into public.migration_runs(migration_key,status,finished_at,notes) values('202608280100_tha_tim_va_xoa_don_giam_doc','completed',now(),'Thả tim đơn hàng (order_hearts, đánh dấu đã xem, 1 lần/người) + siết quyền xóa đơn chỉ Giám đốc (tách policy orders khỏi allow_authenticated_all_orders permissive cũ), RPC delete_order_by_director chặn đơn đã có giao hàng.')
on conflict(migration_key) do update set status='completed',finished_at=now(),notes=excluded.notes;
commit;
