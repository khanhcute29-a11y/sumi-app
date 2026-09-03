-- KHO MACARON XƯỞNG 41 — module TỰ CHỨA, cố ý KHÔNG dùng chung
-- finished_goods_stock/adjustFinishedGoodsStock của kho thành phẩm chung:
-- hàm đó khớp dòng theo (product_id + branch + size) và BỎ QUA cột color,
-- nên 12 màu macaron sẽ đụng nhau vào cùng 1 dòng. Tách riêng để không phải
-- sửa luồng kho chung đang chạy ổn định.
--
-- ĐƠN VỊ: lưu trong DB theo CẶP (số nguyên, không sai số), giao diện quy đổi
-- ra "khay + cặp lẻ" theo chốt của chủ tiệm: 1 KHAY = 36 CẶP = 72 bánh đơn.
-- Lưu theo cặp vì mỗi lần mix chỉ lấy 3–6 cặp mỗi màu (3/36 khay), lưu theo
-- khay sẽ ra số thập phân vô hạn và trôi số sau vài chục lần trộn.
--
-- MỌI thay đổi tồn ĐỀU đi qua macaron_stock_log (kể cả kiểm kê ghi đè) —
-- không có đường nào sửa thẳng số tồn mà mất dấu vết.
begin;
set local lock_timeout = '10s';
set local statement_timeout = '30s';

-- ── 1. Danh mục 12 màu đơn + 4 loại mix ────────────────────────────────────
create table if not exists public.macaron_catalog (
  ma        text primary key,
  ten       text not null,
  loai      text not null check (loai in ('mau_don', 'mix')),
  so_mau    int,
  thu_tu    int not null default 0,
  active    boolean not null default true
);

insert into public.macaron_catalog(ma, ten, loai, so_mau, thu_tu) values
  ('cam',         'Cam',        'mau_don', null, 1),
  ('vang_nhat',   'Vàng nhạt',  'mau_don', null, 2),
  ('vang_dam',    'Vàng đậm',   'mau_don', null, 3),
  ('hong',        'Hồng',       'mau_don', null, 4),
  ('trang',       'Trắng',      'mau_don', null, 5),
  ('tim',         'Tím',        'mau_don', null, 6),
  ('do',          'Đỏ',         'mau_don', null, 7),
  ('xanh_la',     'Xanh lá',    'mau_don', null, 8),
  ('nau',         'Nâu',        'mau_don', null, 9),
  ('den',         'Đen',        'mau_don', null, 10),
  ('xanh_dam',    'Xanh đậm',   'mau_don', null, 11),
  ('xanh_nhat',   'Xanh nhạt',  'mau_don', null, 12),
  ('mix_12',      'Mix 12 màu', 'mix',       12, 21),
  ('mix_10',      'Mix 10 màu', 'mix',       10, 22),
  ('mix_9',       'Mix 9 màu',  'mix',        9, 23),
  ('mix_6',       'Mix 6 màu',  'mix',        6, 24)
on conflict (ma) do update set ten = excluded.ten, loai = excluded.loai,
  so_mau = excluded.so_mau, thu_tu = excluded.thu_tu;

-- ── 2. Tồn kho (đơn vị: CẶP) ───────────────────────────────────────────────
create table if not exists public.macaron_stock (
  ma         text primary key references public.macaron_catalog(ma) on delete restrict,
  so_cap     numeric not null default 0 check (so_cap >= 0),
  updated_at timestamptz not null default now()
);
insert into public.macaron_stock(ma, so_cap)
select ma, 0 from public.macaron_catalog on conflict (ma) do nothing;

-- ── 3. Sổ giao dịch — nguồn sự thật của lịch sử ────────────────────────────
create table if not exists public.macaron_stock_log (
  id            uuid primary key default gen_random_uuid(),
  ma            text not null,
  loai_gd       text not null check (loai_gd in ('nhap','xuat','mix_tru','mix_nhap','hao_hut','kiem_ke')),
  so_cap_thay_doi numeric not null,
  so_cap_truoc  numeric,
  so_cap_sau    numeric,
  mix_batch_id  uuid,
  order_code    text,
  ghi_chu       text,
  staff_id      uuid,
  staff_name    text,
  created_at    timestamptz not null default now()
);
create index if not exists idx_macaron_log_ma_time on public.macaron_stock_log(ma, created_at desc);

-- ── 4. Mỗi lần trộn màu ────────────────────────────────────────────────────
create table if not exists public.macaron_mix_batches (
  id             uuid primary key default gen_random_uuid(),
  ma_mix         text not null references public.macaron_catalog(ma),
  so_khay        numeric not null check (so_khay > 0),
  kieu           text not null check (kieu in ('ton_kho','theo_don')),
  order_code     text,
  tong_cap_dung  numeric not null default 0,
  tong_hao_hut   numeric not null default 0,
  chi_tiet       jsonb,
  ghi_chu        text,
  staff_id       uuid,
  staff_name     text,
  created_at     timestamptz not null default now()
);

-- ── 5. Quyền ───────────────────────────────────────────────────────────────
-- Thao tác kho (nhập/mix/xuất): người của Xưởng 41 + quản lý khâu + Giám đốc.
create or replace function public.sumi_macaron_duoc_thao_tac()
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

alter table public.macaron_catalog     enable row level security;
alter table public.macaron_stock       enable row level security;
alter table public.macaron_stock_log   enable row level security;
alter table public.macaron_mix_batches enable row level security;

-- Đọc: ai đã được duyệt cũng xem được (số liệu kho không phải bí mật lương).
-- GHI: KHÔNG cấp policy insert/update/delete cho ai — mọi thay đổi bắt buộc
-- đi qua 4 RPC bên dưới (security definer), nên không có đường ghi thẳng làm
-- lệch tồn mà không có log.
drop policy if exists "doc danh muc macaron" on public.macaron_catalog;
create policy "doc danh muc macaron" on public.macaron_catalog for select using (public.is_approved());
drop policy if exists "doc ton macaron" on public.macaron_stock;
create policy "doc ton macaron" on public.macaron_stock for select using (public.is_approved());
drop policy if exists "doc so gd macaron" on public.macaron_stock_log;
create policy "doc so gd macaron" on public.macaron_stock_log for select using (public.is_approved());
drop policy if exists "doc me tron macaron" on public.macaron_mix_batches;
create policy "doc me tron macaron" on public.macaron_mix_batches for select using (public.is_approved());

-- ── 6. Hàm nội bộ: cộng/trừ tồn + ghi log (không expose ra client) ────────
create or replace function public.sumi_macaron_ghi_so(
  p_ma text, p_loai_gd text, p_thay_doi numeric,
  p_mix_batch_id uuid default null, p_order_code text default null, p_ghi_chu text default null
)
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
  select so_cap into v_truoc from public.macaron_stock where ma = p_ma for update;
  if v_truoc is null then
    raise exception 'Mã macaron "%" chưa có trong danh mục.', p_ma;
  end if;

  v_sau := v_truoc + p_thay_doi;
  if v_sau < 0 then
    raise exception 'Không đủ tồn cho "%": còn % cặp, cần % cặp.', p_ma, v_truoc, abs(p_thay_doi);
  end if;

  update public.macaron_stock set so_cap = v_sau, updated_at = now() where ma = p_ma;

  select full_name into v_ten from public.profiles where id = auth.uid();
  insert into public.macaron_stock_log(ma, loai_gd, so_cap_thay_doi, so_cap_truoc, so_cap_sau,
    mix_batch_id, order_code, ghi_chu, staff_id, staff_name)
  values (p_ma, p_loai_gd, p_thay_doi, v_truoc, v_sau,
    p_mix_batch_id, p_order_code, p_ghi_chu, auth.uid(), v_ten);
end;
$function$;

-- ── 7. Nhập kho (bếp nướng xong đưa vào kho màu đơn, hoặc nhập thẳng mix) ──
create or replace function public.sumi_macaron_nhap(p_ma text, p_so_cap numeric, p_ghi_chu text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not public.sumi_macaron_duoc_thao_tac() then
    return jsonb_build_object('thanh_cong', false, 'thong_bao', 'Chỉ nhân sự Xưởng 41 hoặc quản lý mới nhập kho được.');
  end if;
  if p_so_cap is null or p_so_cap <= 0 then
    return jsonb_build_object('thanh_cong', false, 'thong_bao', 'Số cặp nhập phải lớn hơn 0.');
  end if;

  perform public.sumi_macaron_ghi_so(p_ma, 'nhap', p_so_cap, null, null, p_ghi_chu);
  return jsonb_build_object('thanh_cong', true, 'thong_bao', 'Đã nhập ' || p_so_cap || ' cặp.');
end;
$function$;

-- ── 8. Xuất kho (bán/giao đi) ──────────────────────────────────────────────
create or replace function public.sumi_macaron_xuat(
  p_ma text, p_so_cap numeric, p_order_code text default null, p_ghi_chu text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not public.sumi_macaron_duoc_thao_tac() then
    return jsonb_build_object('thanh_cong', false, 'thong_bao', 'Chỉ nhân sự Xưởng 41 hoặc quản lý mới xuất kho được.');
  end if;
  if p_so_cap is null or p_so_cap <= 0 then
    return jsonb_build_object('thanh_cong', false, 'thong_bao', 'Số cặp xuất phải lớn hơn 0.');
  end if;

  perform public.sumi_macaron_ghi_so(p_ma, 'xuat', -p_so_cap, null, p_order_code, p_ghi_chu);
  return jsonb_build_object('thanh_cong', true, 'thong_bao', 'Đã xuất ' || p_so_cap || ' cặp.');
end;
$function$;

-- ── 9. TRỘN MÀU ───────────────────────────────────────────────────────────
-- p_chi_tiet: [{"ma":"cam","cap":3,"hao_hut":1}, ...] — thủ kho tự nhập số
-- cặp TỪNG MÀU (36 không chia hết cho 10 màu nên không ép công thức cứng) và
-- hao hụt RIÊNG từng màu (bánh vỡ/móp lúc ghép).
-- Công thức trừ kho: tồn_mới = tồn_cũ − số_cặp_dùng − hao_hụt (theo từng màu).
-- p_kieu='ton_kho'  -> cộng số khay mix vào tồn mix (trộn trước để sẵn).
-- p_kieu='theo_don' -> KHÔNG cộng vào tồn mix (trộn xong giao thẳng theo đơn).
create or replace function public.sumi_macaron_mix(
  p_ma_mix text, p_so_khay numeric, p_kieu text, p_chi_tiet jsonb,
  p_order_code text default null, p_ghi_chu text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_batch_id  uuid;
  v_dong      jsonb;
  v_ma        text;
  v_cap       numeric;
  v_hao       numeric;
  v_tong_dung numeric := 0;
  v_tong_hao  numeric := 0;
  v_ten       text;
  v_loai_mix  text;
begin
  if not public.sumi_macaron_duoc_thao_tac() then
    return jsonb_build_object('thanh_cong', false, 'thong_bao', 'Chỉ nhân sự Xưởng 41 hoặc quản lý mới trộn màu được.');
  end if;
  if p_kieu not in ('ton_kho', 'theo_don') then
    return jsonb_build_object('thanh_cong', false, 'thong_bao', 'Kiểu trộn không hợp lệ.');
  end if;
  if p_so_khay is null or p_so_khay <= 0 then
    return jsonb_build_object('thanh_cong', false, 'thong_bao', 'Số khay trộn phải lớn hơn 0.');
  end if;
  select loai into v_loai_mix from public.macaron_catalog where ma = p_ma_mix and active;
  if v_loai_mix is distinct from 'mix' then
    return jsonb_build_object('thanh_cong', false, 'thong_bao', 'Loại mix không hợp lệ.');
  end if;
  if p_chi_tiet is null or jsonb_typeof(p_chi_tiet) <> 'array' or jsonb_array_length(p_chi_tiet) = 0 then
    return jsonb_build_object('thanh_cong', false, 'thong_bao', 'Chưa nhập số cặp từng màu.');
  end if;

  select full_name into v_ten from public.profiles where id = auth.uid();

  insert into public.macaron_mix_batches(ma_mix, so_khay, kieu, order_code, chi_tiet, ghi_chu, staff_id, staff_name)
  values (p_ma_mix, p_so_khay, p_kieu, p_order_code, p_chi_tiet, p_ghi_chu, auth.uid(), v_ten)
  returning id into v_batch_id;

  for v_dong in select * from jsonb_array_elements(p_chi_tiet)
  loop
    v_ma  := v_dong->>'ma';
    v_cap := coalesce((v_dong->>'cap')::numeric, 0);
    v_hao := coalesce((v_dong->>'hao_hut')::numeric, 0);
    if v_cap < 0 or v_hao < 0 then
      raise exception 'Số cặp/hao hụt của màu "%" không được âm.', v_ma;
    end if;
    if v_cap + v_hao <= 0 then continue; end if;

    -- Trừ phần ĐƯA VÀO KHAY và phần HAO HỤT thành 2 dòng sổ riêng để về sau
    -- thống kê được màu nào hay vỡ, tỷ lệ hao hụt bao nhiêu.
    if v_cap > 0 then
      perform public.sumi_macaron_ghi_so(v_ma, 'mix_tru', -v_cap, v_batch_id, p_order_code, p_ghi_chu);
    end if;
    if v_hao > 0 then
      perform public.sumi_macaron_ghi_so(v_ma, 'hao_hut', -v_hao, v_batch_id, p_order_code,
        coalesce(p_ghi_chu, '') || ' (hao hụt khi trộn)');
    end if;
    v_tong_dung := v_tong_dung + v_cap;
    v_tong_hao  := v_tong_hao + v_hao;
  end loop;

  if p_kieu = 'ton_kho' then
    perform public.sumi_macaron_ghi_so(p_ma_mix, 'mix_nhap', p_so_khay * 36, v_batch_id, null, p_ghi_chu);
  end if;

  update public.macaron_mix_batches
  set tong_cap_dung = v_tong_dung, tong_hao_hut = v_tong_hao
  where id = v_batch_id;

  return jsonb_build_object('thanh_cong', true, 'batch_id', v_batch_id,
    'tong_cap_dung', v_tong_dung, 'tong_hao_hut', v_tong_hao,
    'thong_bao', 'Đã trộn ' || p_so_khay || ' khay · dùng ' || v_tong_dung ||
                 ' cặp · hao hụt ' || v_tong_hao || ' cặp.');
end;
$function$;

-- ── 10. KIỂM KÊ & ĐIỀU CHỈNH THỦ CÔNG — chỉ QUẢN LÝ Xưởng 41/Giám đốc ─────
-- Ghi ĐÈ số tồn bằng số đếm thực tế trên kệ, nhưng KHÔNG xoá lịch sử: phần
-- chênh lệch được ghi thành 1 dòng sổ loai_gd='kiem_ke' (dương = phát hiện
-- thừa, âm = phát hiện thiếu).
create or replace function public.sumi_macaron_kiem_ke(
  p_ma text, p_so_cap_thuc_te numeric, p_ghi_chu text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_truoc numeric;
  v_lech  numeric;
begin
  if not public.la_quan_ly_cua_khau('xuong41') then
    return jsonb_build_object('thanh_cong', false,
      'thong_bao', 'Chỉ Quản lý Xưởng 41 hoặc Giám đốc mới điều chỉnh tồn kho thủ công được.');
  end if;
  if p_so_cap_thuc_te is null or p_so_cap_thuc_te < 0 then
    return jsonb_build_object('thanh_cong', false, 'thong_bao', 'Số đếm thực tế không hợp lệ.');
  end if;
  if nullif(btrim(coalesce(p_ghi_chu, '')), '') is null then
    return jsonb_build_object('thanh_cong', false, 'thong_bao', 'Bắt buộc ghi lý do điều chỉnh (VD: kiểm kê cuối ngày thiếu 3 cặp).');
  end if;

  select so_cap into v_truoc from public.macaron_stock where ma = p_ma;
  if v_truoc is null then
    return jsonb_build_object('thanh_cong', false, 'thong_bao', 'Mã macaron không có trong danh mục.');
  end if;

  v_lech := p_so_cap_thuc_te - v_truoc;
  if v_lech = 0 then
    return jsonb_build_object('thanh_cong', true, 'thong_bao', 'Số đếm khớp tồn hiện tại, không cần điều chỉnh.');
  end if;

  perform public.sumi_macaron_ghi_so(p_ma, 'kiem_ke', v_lech, null, null, p_ghi_chu);

  return jsonb_build_object('thanh_cong', true, 'lech', v_lech,
    'thong_bao', 'Đã điều chỉnh ' || (case when v_lech > 0 then '+' else '' end) || v_lech ||
                 ' cặp (từ ' || v_truoc || ' → ' || p_so_cap_thuc_te || ').');
end;
$function$;

insert into public.migration_runs(migration_key, status, finished_at, notes)
values('202609042000_kho_macaron_xuong41', 'completed', now(),
  'Kho Macaron Xuong 41 tu chua: macaron_catalog (12 mau + 4 loai mix), macaron_stock (luu theo CAP, 1 khay=36 cap), macaron_stock_log (moi thay doi deu co log), macaron_mix_batches. RPC: nhap/xuat/mix (thu kho tu nhap so cap + hao hut TUNG MAU)/kiem_ke (chi quan ly Xuong 41 qua la_quan_ly_cua_khau). Khong ghi thang duoc vao bang — chi qua RPC.')
on conflict(migration_key) do update set status='completed', finished_at=now(), notes=excluded.notes;

commit;
