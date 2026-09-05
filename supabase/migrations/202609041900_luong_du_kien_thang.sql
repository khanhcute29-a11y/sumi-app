-- Bảng Lương Cá Nhân Realtime — phần CÒN THIẾU của tính năng lương.
--
-- Đã có sẵn (KHÔNG đụng tới): payroll_periods/payroll_entries +
-- CompensationScreen.jsx — kế toán gõ tay số liệu từng kỳ, có sẵn luồng
-- Nháp → Chờ duyệt → Khoá & công bố, và chỉ owner/admin/accountant thao tác
-- được. Yêu cầu "chốt sổ phân quyền" coi như đã xong từ trước.
--
-- Thiếu: số liệu DỰ KIẾN cộng dồn theo ngày cho nhân viên tự xem. Nguyên
-- nhân gốc là hệ thống CHƯA lưu lương cơ bản của ai cả (profiles không có
-- cột lương; payroll_entries.base_pay chỉ là số kế toán gõ theo từng kỳ).
--
-- 1) staff_salary_config: lương cơ bản cố định + ngày công chuẩn + giờ chuẩn.
--    ĐỂ BẢNG RIÊNG, không nhét vào profiles: RLS của profiles rất rộng (mọi
--    nhân sự đọc được hồ sơ nhau) nên thêm cột lương vào đó là lộ lương toàn
--    tiệm. Ở đây chỉ chính chủ + quản lý lương (owner/admin/accountant) đọc
--    được, và chỉ quản lý lương mới ghi được.
--
-- 2) sumi_luong_du_kien_thang(): tính ON-THE-FLY, KHÔNG ghi thêm dòng nào
--    vào database (không làm phình dữ liệu) — mỗi lần gọi đọc lại từ nguồn
--    thật: shift_logs (ngày công), overtime_requests (tăng ca đã duyệt),
--    staff_rewards/staff_violations (sao thưởng/phạt — dùng ĐÚNG cách tính
--    của fetchMyStarsSummary đang chạy), salary_advance_requests (tạm ứng đã
--    chi).
--
-- Công thức lấy từ file "bang luoing moi nhat 2026.xlsx" (đã kiểm chứng khớp
-- đúng 3 mẫu có sẵn trong file):
--   • Lương ngày   = LCB / ngày_công_chuẩn × ngày công thực tế
--   • Cơm          = ngày công thực tế × 30.000
--   • Giờ tăng ca  = LCB / ngày_công_chuẩn / giờ_chuẩn × 1.5   (Cường
--     10tr→64.103đ, Duy 7,5tr→48.077đ, Tiến 6tr→38.462đ — khớp 100%)
--   • Chuyên cần   = 0 lỗi:500K | 1-2:300K | 3:100K | >3:0
begin;
set local lock_timeout = '10s';
set local statement_timeout = '30s';

create table if not exists public.staff_salary_config (
  staff_id uuid primary key references public.profiles(id) on delete cascade,
  luong_co_ban numeric not null check (luong_co_ban >= 0),
  ngay_cong_chuan integer not null default 26 check (ngay_cong_chuan between 1 and 31),
  gio_chuan_moi_ngay numeric not null default 9 check (gio_chuan_moi_ngay between 1 and 24),
  ghi_chu text,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.staff_salary_config enable row level security;

drop policy if exists "doc luong co ban cua minh hoac quan ly luong" on public.staff_salary_config;
create policy "doc luong co ban cua minh hoac quan ly luong" on public.staff_salary_config
  for select using (staff_id = auth.uid() or public.is_payroll_manager());

drop policy if exists "quan ly luong ghi luong co ban" on public.staff_salary_config;
create policy "quan ly luong ghi luong co ban" on public.staff_salary_config
  for all using (public.is_payroll_manager()) with check (public.is_payroll_manager());

-- Nạp 8 người đối chiếu CHẮC CHẮN được giữa file Excel và hồ sơ thật (khớp
-- đúng họ tên đầy đủ). Những người còn lại trong file: hoặc chưa có tài
-- khoản trong app (Nhựt, Võ Thị Kim Phụng, Võ Thị Sau, Nguyễn Thị Lệ, Tưởng
-- Thị Phụng), hoặc ô lương trong file để trống (Dũng, Tình, Huyền, Tuấn Anh,
-- Hoàng Anh, Hải Vân, Bảo Long), hoặc tên gần giống nhưng KHÔNG chắc là một
-- người ("Phạm Văn Sung" ↔ "Đinh van sung", "Nguyễn Thanh Vân" ↔ "Ngo Tong
-- Thanh Van") — CỐ Ý không đoán, để Giám đốc/Kế toán tự nhập trong app.
insert into public.staff_salary_config(staff_id, luong_co_ban, ghi_chu)
values
  ('b47e7bc4-b57e-415d-8fd7-e462fa9bfe9e', 10000000, 'Nạp từ file bảng lương 2026 — QL Xưởng'),
  ('f7bee6e3-d774-4b93-8b29-cbb2f3222a73', 10000000, 'Nạp từ file bảng lương 2026 — QL Kinh doanh'),
  ('e0aeb236-ef33-40ed-835f-a3521a290c32',  7500000, 'Nạp từ file bảng lương 2026 — QL Đóng gói'),
  ('129f5db5-fa91-4298-823b-8823d2138db8',  7500000, 'Nạp từ file bảng lương 2026 — Tài xế'),
  ('1ed96b3a-dbc6-4119-a285-54086d9d8662',  7500000, 'Nạp từ file bảng lương 2026 — Tài xế'),
  ('1449f243-35fa-4fd4-8f13-def83c55d37b',  6000000, 'Nạp từ file bảng lương 2026 — NV Xưởng 42'),
  ('9971c1fc-2c3f-4021-9875-68beef9a9542',  6000000, 'Nạp từ file bảng lương 2026 — NV Xưởng 42'),
  ('93ac07d0-f3f9-47ae-b848-0d6ea870d13e',  6000000, 'Nạp từ file bảng lương 2026 — Bếp Kem')
on conflict (staff_id) do nothing;

create or replace function public.sumi_luong_du_kien_thang(p_staff_id uuid, p_thang date default null)
returns jsonb
language plpgsql
stable security definer
set search_path to 'public'
as $function$
declare
  v_dau_thang   date;
  v_cuoi_thang  date;
  v_cfg         public.staff_salary_config%rowtype;
  v_ngay_cong   int := 0;
  v_luong_ngay  numeric := 0;
  v_com         numeric := 0;
  v_gio_tc      numeric := 0;
  v_don_gia_tc  numeric := 0;
  v_tien_tc     numeric := 0;
  v_thuong_sao  numeric := 0;
  v_phat_sao    numeric := 0;
  v_so_vi_pham  int := 0;
  v_chuyen_can  numeric := 0;
  v_tam_ung     numeric := 0;
begin
  if auth.uid() is null then raise exception 'Chưa đăng nhập.'; end if;
  if p_staff_id <> auth.uid() and not public.is_payroll_manager() then
    raise exception 'Chỉ xem được lương dự kiến của chính mình.';
  end if;

  v_dau_thang := date_trunc('month', coalesce(p_thang, (now() at time zone 'Asia/Ho_Chi_Minh')::date))::date;
  v_cuoi_thang := (v_dau_thang + interval '1 month')::date;

  select * into v_cfg from public.staff_salary_config where staff_id = p_staff_id;
  if v_cfg.staff_id is null then
    return jsonb_build_object('co_cau_hinh', false, 'thang', to_char(v_dau_thang, 'YYYY-MM'),
      'thong_bao', 'Chưa cấu hình lương cơ bản cho nhân sự này — Giám đốc/Kế toán nhập trong màn Lương tháng.');
  end if;

  -- Ngày công: đếm số NGÀY có chấm vào ca (không đếm trùng nếu nghỉ trưa bấm
  -- ra/vào nhiều lần trong cùng ngày).
  select count(distinct work_date) into v_ngay_cong
  from public.shift_logs
  where staff_id = p_staff_id and type = 'checkin'
    and work_date >= v_dau_thang and work_date < v_cuoi_thang;

  v_luong_ngay := round(v_cfg.luong_co_ban / v_cfg.ngay_cong_chuan * v_ngay_cong);
  v_com := v_ngay_cong * 30000;

  select coalesce(sum(planned_minutes), 0) / 60.0 into v_gio_tc
  from public.overtime_requests
  where employee_id = p_staff_id and status = 'approved'
    and work_date >= v_dau_thang and work_date < v_cuoi_thang;
  v_don_gia_tc := round(v_cfg.luong_co_ban / v_cfg.ngay_cong_chuan / v_cfg.gio_chuan_moi_ngay * 1.5);
  v_tien_tc := round(v_don_gia_tc * v_gio_tc);

  -- Sao thưởng/phạt: dùng ĐÚNG nguồn + cách tính của fetchMyStarsSummary
  -- (employeeOverviewV4.js) đang chạy ở Bảng Lương Tháng, để 2 nơi không ra
  -- 2 con số khác nhau.
  select coalesce(sum(amount), 0) into v_thuong_sao
  from public.staff_rewards
  where staff_id = p_staff_id and awarded_on >= v_dau_thang and awarded_on < v_cuoi_thang;

  select coalesce(sum(penalty_amount), 0), count(*) into v_phat_sao, v_so_vi_pham
  from public.staff_violations
  where staff_id = p_staff_id and occurred_on >= v_dau_thang and occurred_on < v_cuoi_thang;

  v_chuyen_can := case when v_so_vi_pham = 0 then 500000
                       when v_so_vi_pham <= 2 then 300000
                       when v_so_vi_pham = 3 then 100000
                       else 0 end;

  select coalesce(sum(amount), 0) into v_tam_ung
  from public.salary_advance_requests
  where employee_id = p_staff_id and status = 'paid'
    and paid_at >= v_dau_thang and paid_at < v_cuoi_thang;

  return jsonb_build_object(
    'co_cau_hinh', true,
    'thang', to_char(v_dau_thang, 'YYYY-MM'),
    'luong_co_ban', v_cfg.luong_co_ban,
    'ngay_cong_chuan', v_cfg.ngay_cong_chuan,
    'ngay_cong_thuc_te', v_ngay_cong,
    'luong_ngay_cong', v_luong_ngay,
    'tien_com', v_com,
    'gio_tang_ca', round(v_gio_tc, 2),
    'don_gia_gio_tang_ca', v_don_gia_tc,
    'tien_tang_ca', v_tien_tc,
    'thuong_sao', v_thuong_sao,
    'phat_sao', v_phat_sao,
    'so_vi_pham', v_so_vi_pham,
    'chuyen_can', v_chuyen_can,
    'tam_ung', v_tam_ung,
    'tong_du_kien', v_luong_ngay + v_com + v_tien_tc + v_thuong_sao + v_chuyen_can - v_phat_sao - v_tam_ung
  );
end;
$function$;

insert into public.migration_runs(migration_key, status, finished_at, notes)
values('202609041900_luong_du_kien_thang', 'completed', now(),
  'Them bang staff_salary_config (luong co ban co dinh, RLS chi chinh chu + quan ly luong) + nap 8 nguoi doi chieu chac chan tu file bang luong 2026. Them RPC sumi_luong_du_kien_thang() tinh luong du kien on-the-fly tu cham cong/tang ca/sao thuong-phat/vi pham/tam ung, khong ghi them dong nao vao DB.')
on conflict(migration_key) do update set status='completed', finished_at=now(), notes=excluded.notes;

commit;
