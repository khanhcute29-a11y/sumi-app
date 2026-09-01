-- Hồ sơ Nhân sự (Giám đốc) — Vị trí/Trách nhiệm/Ngày bắt đầu/Ca làm việc quy
-- định + Yêu cầu giờ làm riêng cho từng ngày cụ thể.
--
-- ═══ 3 VIỆC ═══
--
-- 1) Thêm 2 cột mô tả hồ sơ trên `profiles` — Vị trí đã có sẵn (role+station,
--    không thêm cột trùng), chỉ thiếu Trách nhiệm và Ngày bắt đầu làm việc.
--
-- 2) Bảng `staff_shift_overrides` — giờ vào ca RIÊNG cho 1 nhân sự, 1 ngày cụ
--    thể, KHÁC với giờ mặc định của cả bộ phận trong `sumi_quy_dinh_ca`. Ví
--    dụ: NV A bếp lạnh giờ chuẩn 7h, ngày mai có đơn đặc biệt cần vào sớm 6h.
--
-- 3) `sumi_doi_chieu_cham_cong` (migration 202608260070) — ĐIỂM DUY NHẤT tính
--    "giờ gốc" của mọi lần chấm công — được sửa để ưu tiên đọc
--    staff_shift_overrides của đúng ngày trước khi dùng giờ mặc định bộ
--    phận. Nhờ vậy, làm tròn +30 phút (202609020100) và Audio Push nhắc trễ
--    (202609020000) đều TỰ ĐỘNG ăn theo giờ riêng này — không phải sửa thêm
--    ở 2 chỗ kia, vì cả hai đều đọc lại từ đúng hàm này.
begin;
set local lock_timeout = '10s';
set local statement_timeout = '120s';

-- ---------------------------------------------------------------------------
-- 1. Hồ sơ nhân sự — Trách nhiệm + Ngày bắt đầu làm việc.
-- ---------------------------------------------------------------------------
alter table public.profiles add column if not exists responsibilities text;
alter table public.profiles add column if not exists start_date date;

-- ---------------------------------------------------------------------------
-- 2. Giờ làm riêng theo ngày.
-- ---------------------------------------------------------------------------
create table if not exists public.staff_shift_overrides (
  id            uuid primary key default gen_random_uuid(),
  staff_id      uuid not null references public.profiles(id) on delete cascade,
  work_date     date not null,
  gio_bat_dau   time not null,
  ly_do         text,
  created_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  unique(staff_id, work_date)
);

create index if not exists idx_staff_shift_overrides_staff_date
  on public.staff_shift_overrides(staff_id, work_date);

alter table public.staff_shift_overrides enable row level security;

drop policy if exists "doc gio lam rieng cua minh hoac quan ly" on public.staff_shift_overrides;
create policy "doc gio lam rieng cua minh hoac quan ly" on public.staff_shift_overrides
  for select to authenticated
  using (staff_id = auth.uid() or public.is_payroll_manager() or public.sumi_cung_don_vi_voi_toi(staff_id));

-- Chỉ ghi qua 2 RPC bên dưới (SECURITY DEFINER tự kiểm tra quyền) — chặn
-- authenticated ghi thẳng, giống nguyên tắc "quyền do DATABASE quyết" đã áp
-- dụng cho sumi_tang_sao_ca/sumi_dieu_chinh_sao.
revoke insert, update, delete on public.staff_shift_overrides from authenticated;
grant select on public.staff_shift_overrides to authenticated;

create or replace function public.sumi_dat_gio_lam_rieng(
  p_staff_id    uuid,
  p_ngay        date,
  p_gio_bat_dau time,
  p_ly_do       text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_toi uuid := auth.uid();
  v_ten text;
begin
  if v_toi is null then
    return jsonb_build_object('thanh_cong', false, 'thong_bao', 'Chưa đăng nhập.');
  end if;
  if not (public.is_payroll_manager() or public.sumi_cung_don_vi_voi_toi(p_staff_id)) then
    return jsonb_build_object('thanh_cong', false, 'thong_bao', 'Chỉ quản lý của đơn vị mới đặt được giờ làm riêng cho nhân sự này.');
  end if;
  if p_ngay < (now() at time zone 'Asia/Ho_Chi_Minh')::date then
    return jsonb_build_object('thanh_cong', false, 'thong_bao', 'Không đặt giờ làm riêng cho ngày đã qua.');
  end if;

  select full_name into v_ten from public.profiles where id = p_staff_id;
  if v_ten is null then
    return jsonb_build_object('thanh_cong', false, 'thong_bao', 'Không tìm thấy nhân sự.');
  end if;

  insert into public.staff_shift_overrides(staff_id, work_date, gio_bat_dau, ly_do, created_by)
  values (p_staff_id, p_ngay, p_gio_bat_dau, nullif(btrim(coalesce(p_ly_do, '')), ''), v_toi)
  on conflict (staff_id, work_date) do update
    set gio_bat_dau = excluded.gio_bat_dau, ly_do = excluded.ly_do, created_by = excluded.created_by, created_at = now();

  return jsonb_build_object('thanh_cong', true, 'thong_bao',
    'Đã đặt giờ làm riêng ' || to_char(p_ngay, 'DD/MM/YYYY') || ' cho ' || v_ten || ' lúc ' || to_char(p_gio_bat_dau, 'HH24:MI') || '.');
end;
$fn$;

revoke all on function public.sumi_dat_gio_lam_rieng(uuid, date, time, text) from public, anon;
grant execute on function public.sumi_dat_gio_lam_rieng(uuid, date, time, text) to authenticated;

create or replace function public.sumi_xoa_gio_lam_rieng(p_staff_id uuid, p_ngay date)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare v_toi uuid := auth.uid();
begin
  if v_toi is null then
    return jsonb_build_object('thanh_cong', false, 'thong_bao', 'Chưa đăng nhập.');
  end if;
  if not (public.is_payroll_manager() or public.sumi_cung_don_vi_voi_toi(p_staff_id)) then
    return jsonb_build_object('thanh_cong', false, 'thong_bao', 'Chỉ quản lý của đơn vị mới huỷ được giờ làm riêng này.');
  end if;

  delete from public.staff_shift_overrides where staff_id = p_staff_id and work_date = p_ngay;

  return jsonb_build_object('thanh_cong', true, 'thong_bao', 'Đã huỷ giờ làm riêng.');
end;
$fn$;

revoke all on function public.sumi_xoa_gio_lam_rieng(uuid, date) from public, anon;
grant execute on function public.sumi_xoa_gio_lam_rieng(uuid, date) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. sumi_doi_chieu_cham_cong ưu tiên đọc giờ làm riêng của đúng ngày trước
--    khi dùng giờ mặc định bộ phận — mọi thứ tính từ đây (làm tròn, audio
--    push, late_minutes) tự động ăn theo, không cần sửa thêm nơi khác.
-- ---------------------------------------------------------------------------
create or replace function public.sumi_doi_chieu_cham_cong(
  p_staff_id uuid, p_luc timestamptz)
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare
  v_bp      text;
  v_ngay    date;
  v_rieng   record;
  v_phut    int;      -- giờ bấm vào, quy ra số phút trong ngày (giờ Việt Nam)
  v_r       record;
  v_tot     record;
  v_lech    int;
  v_min     int := 2147483647;
  v_moc     int;
  v_d       int;
  v_gio_bat_dau_hieu_luc time;
begin
  v_bp := public.sumi_bo_phan_cham_cong(p_staff_id);
  if v_bp is null then
    return jsonb_build_object('co_ca', false, 'ly_do', 'khong_thuoc_ca_co_dinh',
      'thong_bao', 'Bộ phận này không theo ca cố định nên không tính đi muộn.');
  end if;

  v_ngay := (p_luc at time zone 'Asia/Ho_Chi_Minh')::date;
  select gio_bat_dau, ly_do into v_rieng
    from public.staff_shift_overrides where staff_id = p_staff_id and work_date = v_ngay;

  v_phut := extract(hour from (p_luc at time zone 'Asia/Ho_Chi_Minh'))::int * 60
          + extract(minute from (p_luc at time zone 'Asia/Ho_Chi_Minh'))::int;

  -- Chọn ca gần nhất theo giờ MẶC ĐỊNH của bộ phận (để lấy đúng so_gio_chuan/
  -- phut_den_som_toi_thieu) — có giờ riêng hay không cũng dùng chung một ca
  -- nền, chỉ khác mốc giờ vào cuối cùng ở bước dưới.
  for v_r in
    select * from public.sumi_quy_dinh_ca where bo_phan = v_bp and active
  loop
    v_moc := extract(hour from v_r.gio_bat_dau)::int * 60
           + extract(minute from v_r.gio_bat_dau)::int
           - v_r.phut_den_som_toi_thieu;
    v_d := abs(v_phut - v_moc);
    if v_d > 720 then v_d := 1440 - v_d; end if;
    if v_d < v_min then v_min := v_d; v_tot := v_r; end if;
  end loop;

  if v_tot is null then
    return jsonb_build_object('co_ca', false, 'ly_do', 'chua_khai_bao_ca',
      'thong_bao', 'Bộ phận ' || v_bp || ' chưa khai báo ca nào.');
  end if;

  v_gio_bat_dau_hieu_luc := coalesce(v_rieng.gio_bat_dau, v_tot.gio_bat_dau);
  v_moc := extract(hour from v_gio_bat_dau_hieu_luc)::int * 60
         + extract(minute from v_gio_bat_dau_hieu_luc)::int
         - v_tot.phut_den_som_toi_thieu;
  v_d := abs(v_phut - v_moc);
  if v_d > 720 then v_d := 1440 - v_d; end if;
  v_lech := v_phut - v_moc;

  if v_rieng.gio_bat_dau is null and v_min > 180 then
    return jsonb_build_object('co_ca', false, 'ly_do', 'ngoai_khung_ca', 'bo_phan', v_bp,
      'thong_bao', 'Chấm công ngoài khung ca của bộ phận nên không tính đi muộn.');
  end if;

  if v_lech > 720  then v_lech := v_lech - 1440; end if;
  if v_lech < -720 then v_lech := v_lech + 1440; end if;

  return jsonb_build_object(
    'co_ca', true,
    'bo_phan', v_bp,
    'ma_ca', v_tot.ma_ca,
    'ten_ca', v_tot.ten_ca || case when v_rieng.gio_bat_dau is not null then ' (giờ riêng hôm nay)' else '' end,
    'gio_bat_dau', to_char(v_gio_bat_dau_hieu_luc, 'HH24:MI'),
    'gio_ket_thuc', to_char(v_tot.gio_bat_dau + (v_tot.so_gio_chuan || ' hour')::interval, 'HH24:MI'),
    'moc_khong_muon', to_char(v_gio_bat_dau_hieu_luc - (v_tot.phut_den_som_toi_thieu || ' minute')::interval, 'HH24:MI'),
    'so_gio_chuan', v_tot.so_gio_chuan,
    'phut_den_som_toi_thieu', v_tot.phut_den_som_toi_thieu,
    'phut_lech_so_voi_moc', v_lech,
    'di_muon', v_lech > 0,
    'phut_muon', greatest(0, v_lech),
    'vi_pham_di_tre', v_lech > 15,
    'gio_lam_rieng', v_rieng.gio_bat_dau is not null,
    'thong_bao', case
      when v_lech > 0 then 'Đi muộn ' || v_lech || ' phút (quá mốc ' ||
        to_char(v_gio_bat_dau_hieu_luc - (v_tot.phut_den_som_toi_thieu || ' minute')::interval, 'HH24:MI') || ')'
      when v_lech = 0 then 'Đúng mốc ' ||
        to_char(v_gio_bat_dau_hieu_luc - (v_tot.phut_den_som_toi_thieu || ' minute')::interval, 'HH24:MI')
      else 'Đến sớm ' || abs(v_lech) || ' phút trước mốc' end
  );
end;
$fn$;

insert into public.migration_runs(migration_key, status, finished_at, notes)
values('202609022000_ho_so_nhan_su_va_gio_lam_rieng', 'completed', now(),
  'Hồ sơ Nhân sự Giám đốc: thêm profiles.responsibilities/start_date. Thêm bảng staff_shift_overrides (giờ vào ca riêng theo staff+ngày) + RPC sumi_dat_gio_lam_rieng/sumi_xoa_gio_lam_rieng (chỉ quản lý cùng đơn vị/quản lý lương). Sửa sumi_doi_chieu_cham_cong ưu tiên đọc giờ riêng của đúng ngày trước khi dùng giờ mặc định bộ phận — làm tròn +30p và audio push nhắc trễ (đã có từ trước) tự động ăn theo vì cả hai đều gọi lại đúng hàm này, không cần sửa thêm.')
on conflict(migration_key) do update set status='completed', finished_at=now(), notes=excluded.notes;

commit;
