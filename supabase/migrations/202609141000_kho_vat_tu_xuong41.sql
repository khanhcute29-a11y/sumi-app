-- KHO VẬT TƯ XƯỞNG 41 — module TỰ CHỨA, riêng hoàn toàn với Kho Macaron
-- (macaron_catalog/macaron_stock..., migration 202609042000). Sếp yêu cầu
-- 11/9/2026 (theo tin nhắn cô kế toán "nếu làm thì đưa mấy mã này lên...
-- nhập, xuất giống mcr"): 9 mã vật tư trang trí (Quy bơ 6 màu, Quy bơ mít,
-- Sô Cô La, Trái tim đỏ) hiện KHÔNG có ở bất kỳ đâu trong hệ thống.
--
-- KHÁC với Kho Macaron: đơn vị tính KHÔNG đồng nhất (Khay/Thùng/Hộp — mỗi
-- mã 1 đơn vị cố định riêng, không quy đổi qua lại), và KHÔNG cần theo dõi
-- lô/ngày SX/hạn dùng (chốt với sếp 11/9/2026: đây là vật tư trang trí,
-- không phải thực phẩm dễ hỏng) — nên module này ĐƠN GIẢN HƠN nhiều: chỉ có
-- danh mục + tồn kho theo mã + sổ nhập/xuất, không có bảng lô/trộn.
--
-- Mọi thay đổi tồn ĐỀU đi qua vat_tu_stock_log — không có đường ghi thẳng.
begin;
set local lock_timeout = '10s';
set local statement_timeout = '30s';

-- ── 1. Danh mục vật tư ─────────────────────────────────────────────────────
create table if not exists public.vat_tu_catalog (
  ma      text primary key,
  ten     text not null,
  don_vi  text not null,
  thu_tu  int not null default 0,
  active  boolean not null default true
);

insert into public.vat_tu_catalog(ma, ten, don_vi, thu_tu) values
  ('12000018', 'Quy bơ xanh lá',    'Khay',  1),
  ('12000019', 'Quy bơ Hồng',       'Khay',  2),
  ('12000020', 'Quy bơ xanh dương', 'Khay',  3),
  ('12000021', 'Quy bơ nâu',        'Khay',  4),
  ('12000022', 'Quy bơ đen',        'Khay',  5),
  ('12000023', 'Quy bơ vàng',       'Khay',  6),
  ('12000024', 'Quy bơ mít 6 màu',  'Thùng', 7),
  ('12000025', 'Sô Cô La',          'Hộp',   8),
  ('12000026', 'Trái tim đỏ',       'Hộp',   9)
on conflict (ma) do update set ten = excluded.ten, don_vi = excluded.don_vi, thu_tu = excluded.thu_tu;

-- ── 2. Tồn kho ─────────────────────────────────────────────────────────────
create table if not exists public.vat_tu_stock (
  ma         text primary key references public.vat_tu_catalog(ma) on delete restrict,
  so_luong   numeric not null default 0 check (so_luong >= 0),
  updated_at timestamptz not null default now()
);
insert into public.vat_tu_stock(ma, so_luong)
select ma, 0 from public.vat_tu_catalog on conflict (ma) do nothing;

-- ── 3. Sổ giao dịch — nguồn sự thật của lịch sử ────────────────────────────
create table if not exists public.vat_tu_stock_log (
  id                uuid primary key default gen_random_uuid(),
  ma                text not null,
  loai_gd           text not null check (loai_gd in ('nhap', 'xuat')),
  so_luong_thay_doi numeric not null,
  so_luong_truoc    numeric,
  so_luong_sau      numeric,
  ghi_chu           text,
  staff_id          uuid,
  staff_name        text,
  created_at        timestamptz not null default now()
);
create index if not exists idx_vat_tu_log_ma_time on public.vat_tu_stock_log(ma, created_at desc);

-- ── 4. Quyền: người Xưởng 41 + quản lý khâu + Giám đốc (giống Kho Macaron) ─
create or replace function public.sumi_vat_tu_duoc_thao_tac()
returns boolean
language sql
stable security definer
set search_path to 'public'
as $function$
  select public.la_quan_ly_cua_khau('xuong41') or exists(
    select 1 from public.profiles p
    where p.id = auth.uid() and p.approved = true and coalesce(p.active, true) = true
      and (p.station = 'xuong41' or p.role in ('deputy_director_x41', 'kho_xuong41'))
  );
$function$;

alter table public.vat_tu_catalog   enable row level security;
alter table public.vat_tu_stock     enable row level security;
alter table public.vat_tu_stock_log enable row level security;

-- Đọc: ai đã được duyệt cũng xem được. GHI: không cấp policy insert/update/
-- delete cho ai — mọi thay đổi bắt buộc đi qua 2 RPC bên dưới.
drop policy if exists "doc danh muc vat tu" on public.vat_tu_catalog;
create policy "doc danh muc vat tu" on public.vat_tu_catalog for select using (public.is_approved());
drop policy if exists "doc ton vat tu" on public.vat_tu_stock;
create policy "doc ton vat tu" on public.vat_tu_stock for select using (public.is_approved());
drop policy if exists "doc so gd vat tu" on public.vat_tu_stock_log;
create policy "doc so gd vat tu" on public.vat_tu_stock_log for select using (public.is_approved());

-- ── 5. Hàm nội bộ: cộng/trừ tồn + ghi log ─────────────────────────────────
create or replace function public.sumi_vat_tu_ghi_so(p_ma text, p_loai_gd text, p_thay_doi numeric, p_ghi_chu text default null)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_truoc numeric;
  v_sau   numeric;
  v_ten   text;
begin
  select so_luong into v_truoc from public.vat_tu_stock where ma = p_ma for update;
  if v_truoc is null then
    raise exception 'Mã vật tư "%" chưa có trong danh mục.', p_ma;
  end if;

  v_sau := v_truoc + p_thay_doi;
  if v_sau < 0 then
    raise exception 'Không đủ tồn cho "%": còn %, cần %.', p_ma, v_truoc, abs(p_thay_doi);
  end if;

  update public.vat_tu_stock set so_luong = v_sau, updated_at = now() where ma = p_ma;

  select full_name into v_ten from public.profiles where id = auth.uid();
  insert into public.vat_tu_stock_log(ma, loai_gd, so_luong_thay_doi, so_luong_truoc, so_luong_sau, ghi_chu, staff_id, staff_name)
  values (p_ma, p_loai_gd, p_thay_doi, v_truoc, v_sau, p_ghi_chu, auth.uid(), v_ten);
end;
$function$;

-- ── 6. Nhập kho ────────────────────────────────────────────────────────────
create or replace function public.sumi_vat_tu_nhap(p_ma text, p_so_luong numeric, p_ghi_chu text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not public.sumi_vat_tu_duoc_thao_tac() then
    return jsonb_build_object('thanh_cong', false, 'thong_bao', 'Chỉ nhân sự Xưởng 41 hoặc quản lý mới nhập kho được.');
  end if;
  if p_so_luong is null or p_so_luong <= 0 then
    return jsonb_build_object('thanh_cong', false, 'thong_bao', 'Số lượng nhập phải lớn hơn 0.');
  end if;

  perform public.sumi_vat_tu_ghi_so(p_ma, 'nhap', p_so_luong, p_ghi_chu);
  return jsonb_build_object('thanh_cong', true, 'thong_bao', 'Đã nhập ' || p_so_luong || '.');
end;
$function$;

-- ── 7. Xuất kho ────────────────────────────────────────────────────────────
create or replace function public.sumi_vat_tu_xuat(p_ma text, p_so_luong numeric, p_ghi_chu text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not public.sumi_vat_tu_duoc_thao_tac() then
    return jsonb_build_object('thanh_cong', false, 'thong_bao', 'Chỉ nhân sự Xưởng 41 hoặc quản lý mới xuất kho được.');
  end if;
  if p_so_luong is null or p_so_luong <= 0 then
    return jsonb_build_object('thanh_cong', false, 'thong_bao', 'Số lượng xuất phải lớn hơn 0.');
  end if;

  perform public.sumi_vat_tu_ghi_so(p_ma, 'xuat', -p_so_luong, p_ghi_chu);
  return jsonb_build_object('thanh_cong', true, 'thong_bao', 'Đã xuất ' || p_so_luong || '.');
end;
$function$;

revoke all on function public.sumi_vat_tu_duoc_thao_tac() from public, anon;
grant execute on function public.sumi_vat_tu_duoc_thao_tac() to authenticated;
revoke all on function public.sumi_vat_tu_nhap(text, numeric, text) from public, anon;
grant execute on function public.sumi_vat_tu_nhap(text, numeric, text) to authenticated;
revoke all on function public.sumi_vat_tu_xuat(text, numeric, text) from public, anon;
grant execute on function public.sumi_vat_tu_xuat(text, numeric, text) to authenticated;

insert into public.migration_runs(migration_key, status, finished_at, notes)
values('202609141000_kho_vat_tu_xuong41', 'completed', now(),
  'Kho Vat Tu Xuong 41 - module rieng hoan toan voi Kho Macaron. vat_tu_catalog (9 ma trang tri: Quy bo 6 mau, Quy bo mit, So Co La, Trai tim do - moi ma 1 don vi rieng Khay/Thung/Hop, khong quy doi qua lai), vat_tu_stock (so du don gian, khong theo lo/HSD), vat_tu_stock_log (moi thay doi deu co log). RPC: sumi_vat_tu_nhap/sumi_vat_tu_xuat, quyen giong Kho Macaron (nguoi Xuong 41 + quan ly khau + Giam doc qua sumi_vat_tu_duoc_thao_tac). Khong ghi thang duoc vao bang - chi qua RPC.')
on conflict(migration_key) do update set status='completed', finished_at=now(), notes=excluded.notes;

commit;
