-- SỔ KẾT TOÁN KPI THÁNG — mảnh còn thiếu duy nhất so với mockup
-- "task-lifecycle-v2-approved.html" sau khi đối chiếu toàn bộ hệ thống.
--
-- ═══ BỐI CẢNH — TẠI SAO CHỈ THÊM ĐÚNG MỘT BẢNG ═══
--
-- Đối chiếu mockup với hệ thống thật (26–27/08/2026) cho thấy phần lớn đã có:
--   • Vòng đời việc (Giao→Nhận→Làm→Báo xong→Duyệt)  -> đã có: tasks.status,
--     accepted_at/approved_at/approved_by (migration 202608260100)
--   • Việc hằng ngày (checklist lặp)                  -> đã có: migration
--     202608230027, RPC create_recurring_todo
--   • Việc tự tạo, quản lý xác nhận KPI                -> đã có: category 'adhoc'
--   • Dự án + tiến độ + KPI dự án                      -> đã có: bảng projects,
--     tasks.project_id
--   • "Nhận giao kiêm nhiệm" (bất kỳ ai bấm nhận giao
--     đơn Bakery, bắt buộc ảnh+GPS)                    -> ĐÃ CÓ SẴN VÀ ĐANG CHẠY,
--     không liên quan gì tới migration này: RPC
--     accept_delivery_assignment_flexible (từ
--     202608260001, sửa tiếp ở 202608260008/202608260018)
--     — comment gốc của nó ghi rõ "Any staff can accept
--     & deliver ... KPI logging". Xây thêm ở đây là tạo
--     RA HAI NƠI ghi nhận giao hàng khác nhau.
--
-- Mảnh DUY NHẤT chưa có: "Sổ kết toán KPI tháng" nối vào lương. Hiện có HAI
-- sổ KPI tách rời, chưa ai gộp:
--   • kpi_logs       — sự kiện liên quan đơn hàng/giao hàng
--   • task_kpi_logs  — sự kiện liên quan việc được giao/duyệt (202608260100)
--
-- ═══ VÌ SAO LÀ BẢNG THẬT, KHÔNG PHẢI VIEW ═══
--
-- Anh Nghĩa chọn: bảng thật, CHỐT cuối tháng. Một khi đã chốt để trả lương,
-- sửa task hay đơn của tháng đó về sau KHÔNG được làm đổi số đã trả. Một VIEW
-- luôn tính lại từ dữ liệu sống sẽ vi phạm đúng nguyên tắc này — số trên "sổ
-- kết toán" phải là ảnh chụp đông cứng tại thời điểm chốt, không phải phép
-- tính động.
begin;
set local lock_timeout = '10s';
set local statement_timeout = '120s';

-- ---------------------------------------------------------------------------
-- 1. Bảng sổ kết toán — mỗi dòng là MỘT nhân sự CHO MỘT tháng
-- ---------------------------------------------------------------------------
create table if not exists public.payroll_kpi_ledger (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.profiles(id) on delete cascade,
  staff_name text not null,
  thang int not null check (thang between 1 and 12),
  nam int not null check (nam between 2024 and 2100),

  -- Số liệu ĐÔNG CỨNG tại thời điểm chốt — không tự tính lại sau này.
  so_viec_xong int not null default 0,
  so_lan_tre_co_ly_do int not null default 0,
  so_lan_giao_hang int not null default 0,
  tong_diem_kpi numeric not null default 0,
  quy_doi_tien numeric not null default 0,   -- điểm × đơn giá tại thời điểm chốt

  -- Chi tiết để đối chiếu khi có thắc mắc — không dùng để tính lại, chỉ để xem.
  chi_tiet jsonb not null default '[]'::jsonb,

  trang_thai text not null default 'nhap' check (trang_thai in ('nhap', 'da_chot')),
  chot_boi uuid references public.profiles(id) on delete set null,
  chot_luc timestamptz,
  created_at timestamptz not null default now(),

  unique (staff_id, thang, nam)
);

create index if not exists payroll_kpi_ledger_thang_idx
  on public.payroll_kpi_ledger(nam, thang);

comment on table public.payroll_kpi_ledger is
  'Sổ kết toán KPI tháng — ảnh chụp đông cứng tại thời điểm Giám đốc chốt, dùng làm căn cứ trả lương. KHÔNG tự động tính lại; sửa task/đơn của tháng đã chốt không ảnh hưởng số ở đây.';

alter table public.payroll_kpi_ledger enable row level security;
revoke all on public.payroll_kpi_ledger from anon, authenticated;

-- Đọc: chính mình, quản lý cùng đơn vị (dùng lại hàm đã có từ phân hệ Việc),
-- hoặc Giám đốc.
drop policy if exists "doc so ket toan cua minh hoac cap duoi" on public.payroll_kpi_ledger;
create policy "doc so ket toan cua minh hoac cap duoi" on public.payroll_kpi_ledger
  for select to authenticated
  using (
    staff_id = auth.uid()
    or public.is_business_director()
    or public.sumi_cung_don_vi_voi_toi(staff_id)
  );

grant select on public.payroll_kpi_ledger to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Cổng CHỐT SỔ — chỉ Giám đốc, gộp cả hai sổ KPI hiện có
--
--    Chạy lại trên tháng ĐÃ CHỐT sẽ bị từ chối — đúng ý "chốt xong thì thôi",
--    tránh bấm nhầm làm trôi số đã dùng để trả lương. Muốn sửa số đã chốt
--    (hiếm, có lý do rõ) phải mở khoá riêng bằng tay dưới SQL Editor, không
--    có nút bấm cho việc này — cố ý, để không ai bấm nhầm.
-- ---------------------------------------------------------------------------
create or replace function public.sumi_chot_kpi_thang(p_thang int, p_nam int)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_toi   uuid := auth.uid();
  v_dau   date;
  v_cuoi  date;
  v_so    int := 0;
begin
  if v_toi is null then
    return jsonb_build_object('thanh_cong', false, 'thong_bao', 'Chưa đăng nhập.');
  end if;

  if not public.is_business_director() then
    return jsonb_build_object('thanh_cong', false,
      'thong_bao', 'Chỉ Giám đốc mới được chốt sổ kết toán.');
  end if;

  if p_thang is null or p_thang not between 1 and 12 or p_nam is null then
    return jsonb_build_object('thanh_cong', false, 'thong_bao', 'Tháng/năm không hợp lệ.');
  end if;

  if exists (
    select 1 from public.payroll_kpi_ledger
    where thang = p_thang and nam = p_nam and trang_thai = 'da_chot'
  ) then
    return jsonb_build_object('thanh_cong', false,
      'thong_bao', 'Tháng ' || p_thang || '/' || p_nam || ' đã được chốt trước đó rồi.');
  end if;

  v_dau  := make_date(p_nam, p_thang, 1);
  v_cuoi := (v_dau + interval '1 month')::date;

  with tu_viec as (
    select
      k.staff_id, coalesce(k.staff_name, p.full_name) as staff_name,
      -- 'hoan_thanh' = quản lý đã duyệt xong việc; 'nhan_viec' = lúc bấm nhận
      -- việc (đây là nơi ghi nhận trễ NHẬN việc, không phải trễ nộp bài).
      count(*) filter (where k.su_kien = 'hoan_thanh') as so_viec_xong,
      count(*) filter (where k.su_kien = 'nhan_viec' and k.phut_lech > 15) as so_lan_tre,
      sum(k.diem) filter (where k.su_kien = 'hoan_thanh') as diem
    from public.task_kpi_logs k
    left join public.profiles p on p.id = k.staff_id
    where k.created_at >= v_dau and k.created_at < v_cuoi
    group by k.staff_id, coalesce(k.staff_name, p.full_name)
  ),
  tu_giao_hang as (
    select
      g.staff_id, coalesce(g.staff_name, p.full_name) as staff_name,
      count(*) filter (where g.event_type = 'delivery_assigned') as so_lan_giao
    from public.kpi_logs g
    left join public.profiles p on p.id = g.staff_id
    where g.created_at >= v_dau and g.created_at < v_cuoi
      and g.staff_id is not null
    group by g.staff_id, coalesce(g.staff_name, p.full_name)
  ),
  gop as (
    select
      coalesce(v.staff_id, gh.staff_id) as staff_id,
      coalesce(v.staff_name, gh.staff_name, 'Không rõ') as staff_name,
      coalesce(v.so_viec_xong, 0) as so_viec_xong,
      coalesce(v.so_lan_tre, 0) as so_lan_tre,
      coalesce(gh.so_lan_giao, 0) as so_lan_giao,
      coalesce(v.diem, 0) as diem
    from tu_viec v
    full outer join tu_giao_hang gh on gh.staff_id = v.staff_id
  )
  insert into public.payroll_kpi_ledger(
    staff_id, staff_name, thang, nam,
    so_viec_xong, so_lan_tre_co_ly_do, so_lan_giao_hang,
    tong_diem_kpi, quy_doi_tien,
    chi_tiet, trang_thai, chot_boi, chot_luc)
  select
    staff_id, staff_name, p_thang, p_nam,
    so_viec_xong, so_lan_tre, so_lan_giao,
    diem, diem * 1000,   -- quy đổi tạm 1 điểm = 1.000đ, giống quy ước sao thưởng chấm công
    jsonb_build_object(
      'so_viec_xong', so_viec_xong, 'so_lan_tre', so_lan_tre,
      'so_lan_giao', so_lan_giao, 'diem', diem),
    'da_chot', v_toi, now()
  from gop
  where staff_id is not null
  on conflict (staff_id, thang, nam) do update set
    staff_name = excluded.staff_name,
    so_viec_xong = excluded.so_viec_xong,
    so_lan_tre_co_ly_do = excluded.so_lan_tre_co_ly_do,
    so_lan_giao_hang = excluded.so_lan_giao_hang,
    tong_diem_kpi = excluded.tong_diem_kpi,
    quy_doi_tien = excluded.quy_doi_tien,
    chi_tiet = excluded.chi_tiet,
    trang_thai = 'da_chot',
    chot_boi = excluded.chot_boi,
    chot_luc = excluded.chot_luc
  where public.payroll_kpi_ledger.trang_thai <> 'da_chot';

  get diagnostics v_so = row_count;

  return jsonb_build_object('thanh_cong', true, 'so_nhan_su', v_so,
    'thong_bao', 'Đã chốt sổ KPI tháng ' || p_thang || '/' || p_nam ||
                 ' cho ' || v_so || ' nhân sự.');
end;
$fn$;

revoke all on function public.sumi_chot_kpi_thang(int, int) from public, anon;
grant execute on function public.sumi_chot_kpi_thang(int, int) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Xem trước số liệu MỘT tháng (chưa chốt) — Giám đốc dùng để coi số dự
--    kiến trước khi bấm chốt, không ghi gì xuống payroll_kpi_ledger.
-- ---------------------------------------------------------------------------
create or replace function public.sumi_xem_truoc_kpi_thang(p_thang int, p_nam int)
returns table(
  staff_id uuid, staff_name text, so_viec_xong bigint,
  so_lan_tre_co_ly_do bigint, so_lan_giao_hang bigint, tong_diem_kpi numeric
)
language sql
stable
security definer
set search_path = public
as $fn$
  with pham_vi as (
    select make_date(p_nam, p_thang, 1) as dau,
           (make_date(p_nam, p_thang, 1) + interval '1 month')::date as cuoi
  ),
  tu_viec as (
    select
      k.staff_id, coalesce(k.staff_name, p.full_name) as staff_name,
      count(*) filter (where k.su_kien = 'hoan_thanh') as so_viec_xong,
      count(*) filter (where k.su_kien = 'nhan_viec' and k.phut_lech > 15) as so_lan_tre,
      sum(k.diem) filter (where k.su_kien = 'hoan_thanh') as diem
    from public.task_kpi_logs k, pham_vi
    left join public.profiles p on p.id = k.staff_id
    where k.created_at >= pham_vi.dau and k.created_at < pham_vi.cuoi
    group by k.staff_id, coalesce(k.staff_name, p.full_name)
  ),
  tu_giao_hang as (
    select
      g.staff_id, coalesce(g.staff_name, p.full_name) as staff_name,
      count(*) filter (where g.event_type = 'delivery_assigned') as so_lan_giao
    from public.kpi_logs g, pham_vi
    left join public.profiles p on p.id = g.staff_id
    where g.created_at >= pham_vi.dau and g.created_at < pham_vi.cuoi
      and g.staff_id is not null
    group by g.staff_id, coalesce(g.staff_name, p.full_name)
  )
  select
    coalesce(v.staff_id, gh.staff_id),
    coalesce(v.staff_name, gh.staff_name, 'Không rõ'),
    coalesce(v.so_viec_xong, 0), coalesce(v.so_lan_tre, 0),
    coalesce(gh.so_lan_giao, 0), coalesce(v.diem, 0)
  from tu_viec v
  full outer join tu_giao_hang gh on gh.staff_id = v.staff_id
  where public.is_business_director()
  order by coalesce(v.diem, 0) desc;
$fn$;

revoke all on function public.sumi_xem_truoc_kpi_thang(int, int) from public, anon;
grant execute on function public.sumi_xem_truoc_kpi_thang(int, int) to authenticated;

insert into public.migration_runs(migration_key, status, finished_at, notes)
values('202608270050_so_ket_toan_kpi_thang', 'completed', now(),
  'Adds payroll_kpi_ledger, the one genuinely missing piece after reconciling the task-lifecycle-v2-approved mockup against the live system: task lifecycle states, daily recurring todos, adhoc tasks, projects, and per-event KPI logging (task_kpi_logs) already existed from migration 202608260100 and earlier. The mockup''s cross-department delivery-claim flow ("nhận giao kiêm nhiệm") also already exists in full via accept_delivery_assignment_flexible (202608260001/8/18) with mandatory GPS+photo and its own kpi_logs entries - nothing new was built for that to avoid a second delivery-tracking source of truth. This migration only adds the monthly settled ledger the owner asked for: a real table (not a view, per explicit decision) that a director locks via sumi_chot_kpi_thang, aggregating both kpi_logs (delivery events) and task_kpi_logs (task events) into one frozen per-staff-per-month snapshot used for payroll, immune to later edits of the underlying tasks/orders. sumi_xem_truoc_kpi_thang lets the director preview numbers before locking.')
on conflict(migration_key) do update
  set status = 'completed', finished_at = now(), notes = excluded.notes;

commit;
