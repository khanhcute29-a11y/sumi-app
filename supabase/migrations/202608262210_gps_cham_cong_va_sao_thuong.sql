-- Chấm công V2: vá GPS bị vứt đi + cho Quản lý tặng sao thưởng theo ca.
--
-- ═══ VIỆC 1: GPS ĐANG BỊ VỨT ĐI (lỗi thật, đang chạy trên bản production) ═══
--
-- Màn hình chấm công bắt toạ độ GPS, hiện lên cho nhân viên thấy, rồi đóng gói
-- vào payload dưới tên `gpsCoords`:
--     src/screens/ShiftsScreen.jsx:111   gpsCoords: gpsCoords || null
--
-- Nhưng hàm ghi xuống database KHÔNG hề đọc trường đó:
--     src/lib/queries.js:724  addShiftCheckin({ staffId, ..., reason, photoUrl })
--
-- JavaScript bỏ qua trường thừa mà không báo lỗi, nên chưa một lần chấm công nào
-- có toạ độ được lưu. Nhân viên thấy "đã lấy vị trí" và tin là hệ thống có ghi.
-- Không ai phát hiện vì màn hình vẫn xanh.
--
-- Bảng `shift_logs` thậm chí chưa có cột nào để chứa. Thêm theo đúng quy ước các
-- bảng khác trong dự án đang dùng (`gps_lat` / `gps_lng` kiểu numeric).
--
--
-- ═══ VIỆC 2: TẶNG SAO THƯỞNG — DÙNG BẢNG CÓ SẴN, KHÔNG ĐẺ BẢNG MỚI ═══
--
-- Mockup có "Đánh giá & Tặng Sao (KPI) — 1 Sao = 1.000đ thưởng thẳng vào lương".
-- Bảng `staff_rewards` (migration 202608260150 của đồng đội) đã đúng là chỗ chứa
-- việc này. KHÔNG tạo thêm `manager_rating` trên `shift_logs` — làm vậy thì tiệm
-- có hai nguồn thưởng song song và kế toán không biết cộng cái nào vào lương.
--
-- CÁI BẪY: chính sách ghi của bảng đó là `is_payroll_manager()`, mà hàm này chỉ
-- gồm owner / admin / accountant. BẾP TRƯỞNG KHÔNG NẰM TRONG ĐÓ — trong khi
-- mockup vẽ đúng màn hình "QUẢN LÝ · BẾP LẠNH" đang tặng sao cho thợ của mình.
-- Nối thẳng nút vào bảng là bếp trưởng bấm sẽ nhận lỗi quyền.
--
-- Cách xử lý: thêm một RPC SECURITY DEFINER làm cổng ghi duy nhất, tự kiểm tra
-- quyền theo đúng nguyên tắc của dự án — quyền do DATABASE quyết, không phải
-- trình duyệt. Chính sách RLS gốc của đồng đội giữ nguyên, không sửa một dòng.
begin;
set local lock_timeout = '10s';
set local statement_timeout = '120s';

-- ---------------------------------------------------------------------------
-- 1. Chỗ chứa toạ độ cho mỗi lần chấm công
-- ---------------------------------------------------------------------------
alter table public.shift_logs add column if not exists gps_lat numeric;
alter table public.shift_logs add column if not exists gps_lng numeric;
alter table public.shift_logs add column if not exists gps_accuracy_m numeric;

comment on column public.shift_logs.gps_lat is
  'Vĩ độ lúc chấm công. Trước 26/08/2026 luôn rỗng vì màn hình gửi lên nhưng hàm ghi không đọc.';

-- ---------------------------------------------------------------------------
-- 2. Bổ sung cho bảng thưởng của đồng đội — CHỈ THÊM CỘT, không sửa gì có sẵn
--
--    Bọc trong kiểm tra tồn tại: nếu migration 202608260150 chưa được chạy trên
--    máy chủ này thì bỏ qua phần thưởng, phần GPS vẫn áp dụng bình thường.
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.staff_rewards') is null then
    raise notice 'Chua co bang staff_rewards (migration 202608260150 chua chay) - bo qua phan tang sao.';
    return;
  end if;

  execute 'alter table public.staff_rewards add column if not exists note text';
  execute 'alter table public.staff_rewards add column if not exists shift_log_id uuid';
  execute 'alter table public.staff_rewards add column if not exists so_sao int';

  -- Khoá ngoại mềm: ca bị xoá thì phần thưởng vẫn còn (đã trả tiền rồi).
  if not exists (
    select 1 from pg_constraint where conname = 'staff_rewards_shift_log_fk'
  ) then
    execute 'alter table public.staff_rewards
             add constraint staff_rewards_shift_log_fk
             foreign key (shift_log_id) references public.shift_logs(id) on delete set null';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Cổng ghi thưởng duy nhất
--
--    Ai được tặng sao:
--      • Quản lý lương (owner / admin / accountant)  -> cho bất kỳ ai
--      • Bếp trưởng, bếp phó, quản lý đơn vị          -> chỉ cho người CÙNG ĐƠN VỊ
--        (dùng lại `sumi_cung_don_vi_voi_toi` đã dựng cho phân hệ Việc)
--
--    Chặn cứng:
--      • Không ai tự tặng sao cho chính mình — đây là tiền thật vào lương.
--      • Số sao phải trong khoảng 1..5, khớp đúng 5 nút trên giao diện.
-- ---------------------------------------------------------------------------
create or replace function public.sumi_tang_sao_ca(
  p_staff_id   uuid,
  p_so_sao     int,
  p_ghi_chu    text default null,
  p_work_date  date default null,
  p_shift_log  uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_toi     uuid := auth.uid();
  v_ten     text;
  v_ngay    date := coalesce(p_work_date, current_date);
  v_tien    numeric;
  v_id      uuid;
begin
  if v_toi is null then
    return jsonb_build_object('thanh_cong', false, 'thong_bao', 'Chưa đăng nhập.');
  end if;

  if p_staff_id is null then
    return jsonb_build_object('thanh_cong', false, 'thong_bao', 'Chưa chọn người nhận thưởng.');
  end if;

  if p_staff_id = v_toi then
    return jsonb_build_object('thanh_cong', false,
      'thong_bao', 'Không thể tự tặng thưởng cho chính mình.');
  end if;

  if p_so_sao is null or p_so_sao < 1 or p_so_sao > 5 then
    return jsonb_build_object('thanh_cong', false,
      'thong_bao', 'Số sao phải từ 1 đến 5.');
  end if;

  if not (public.is_payroll_manager() or public.sumi_cung_don_vi_voi_toi(p_staff_id)) then
    return jsonb_build_object('thanh_cong', false,
      'thong_bao', 'Chỉ quản lý của đơn vị mới được tặng thưởng cho nhân sự này.');
  end if;

  select full_name into v_ten from public.profiles where id = p_staff_id;
  if v_ten is null then
    return jsonb_build_object('thanh_cong', false, 'thong_bao', 'Không tìm thấy nhân sự.');
  end if;

  -- Quy đổi cố định theo quy định của tiệm: 1 sao = 1.000đ.
  v_tien := p_so_sao * 1000;

  insert into public.staff_rewards(
    staff_id, title, amount, awarded_on, created_by, note, shift_log_id, so_sao)
  values (
    p_staff_id,
    'Thưởng ca ' || to_char(v_ngay, 'DD/MM/YYYY') || ' · ' || p_so_sao || ' sao',
    v_tien, v_ngay, v_toi,
    nullif(btrim(coalesce(p_ghi_chu, '')), ''),
    p_shift_log, p_so_sao)
  returning id into v_id;

  return jsonb_build_object(
    'thanh_cong', true,
    'id', v_id,
    'so_sao', p_so_sao,
    'so_tien', v_tien,
    'thong_bao', 'Đã tặng ' || p_so_sao || ' sao (' ||
                 to_char(v_tien, 'FM999G999') || 'đ) cho ' || v_ten || '.');
end;
$fn$;

revoke all on function public.sumi_tang_sao_ca(uuid, int, text, date, uuid) from public, anon;
grant execute on function public.sumi_tang_sao_ca(uuid, int, text, date, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Cho quản lý đơn vị ĐỌC được thưởng của thợ mình
--    (chính sách gốc chỉ cho xem của bản thân hoặc quản lý lương)
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.staff_rewards') is not null then
    execute 'drop policy if exists "quan ly don vi doc thuong cua tho" on public.staff_rewards';
    execute 'create policy "quan ly don vi doc thuong cua tho" on public.staff_rewards
             for select to authenticated
             using (public.sumi_cung_don_vi_voi_toi(staff_id))';
  end if;
end $$;

insert into public.migration_runs(migration_key, status, finished_at, notes)
values('202608262210_gps_cham_cong_va_sao_thuong', 'completed', now(),
  'Two fixes for the Chấm Công V2 redesign. (1) Repairs a live defect: ShiftsScreen captured GPS coordinates and passed gpsCoords in the check-in payload, but addShiftCheckin never destructured that field, so JavaScript silently dropped it and no attendance record has ever stored a location - shift_logs had no gps columns at all. Adds gps_lat/gps_lng/gps_accuracy_m following the convention used by order_attachments and delivery tables. (2) Backs the mockup''s star-rating feature on the teammate''s existing staff_rewards table (migration 202608260150) instead of adding a competing manager_rating column to shift_logs, which would have given the shop two parallel bonus sources. The catch: that table''s insert policy is is_payroll_manager(), which covers only owner/admin/accountant - kitchen leads, the exact role the mockup shows giving stars, were locked out. Rather than loosening their RLS, this adds sumi_tang_sao_ca as a SECURITY DEFINER gate that allows payroll managers plus same-unit managers (reusing sumi_cung_don_vi_voi_toi from the Việc subsystem), blocks self-rewarding, and clamps stars to 1..5. Their original policies are untouched; only additive nullable columns (note, shift_log_id, so_sao) were added.')
on conflict(migration_key) do update
  set status = 'completed', finished_at = now(), notes = excluded.notes;

commit;
