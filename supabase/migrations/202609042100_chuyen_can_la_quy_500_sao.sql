-- Sửa đúng bản chất khoản CHUYÊN CẦN theo chủ tiệm (04/09/2026):
--
--   Chuyên cần KHÔNG phải bậc thang theo số lỗi (0 lỗi:500K | 1-2:300K |
--   3:100K | >3:0) như bản đầu tôi làm theo ghi chú trong file Excel.
--   Thực tế: mỗi tháng nhân sự được cấp sẵn QUỸ 500.000đ = 500 SAO chuyên
--   cần. Sao ĐƯỢC CỘNG trong tháng (Gieo hạt khen thưởng) nhập luôn vào quỹ
--   này, rồi mọi lần bị trừ sao / ghi lỗi vi phạm mới trừ ra từ quỹ chung
--   đó.
--
--     Quỹ = 500.000đ + tiền sao được cộng trong tháng
--     Chuyên cần còn lại = max(0, Quỹ − tiền sao bị trừ / vi phạm)
--
--   Vì sao thưởng đã nằm TRONG quỹ, nó KHÔNG còn được cộng riêng một dòng
--   nữa — cộng cả hai chỗ là cộng hai lần.
--
-- HỆ QUẢ QUAN TRỌNG — bản cũ TRỪ HAI LẦN:
--   (1) hạ bậc chuyên cần theo số lỗi, VÀ (2) trừ tiếp `phat_sao` như một
--   khoản riêng. Cùng một lần bị trừ sao bị tính 2 lần vào lương. Bản này
--   bỏ hẳn khoản trừ riêng — phạt CHỈ ăn vào quỹ chuyên cần.
--
-- Nguồn dữ liệu: mọi lần trừ sao của Gieo hạt (sumi_dieu_chinh_sao, loại
-- 'tru') đều ghi vào ĐÚNG bảng staff_violations cùng chỗ với vi phạm nội
-- quy, 1 sao = 1.000đ — nên chỉ cần cộng penalty_amount của bảng đó, không
-- có nguồn thứ hai để lo đếm trùng.
--
-- Trường hợp phạt VƯỢT quá 500 sao: quỹ về 0, phần vượt hiện riêng ở
-- `phat_vuot_chuyen_can` để Giám đốc nhìn thấy, nhưng CHƯA tự trừ thêm vào
-- lương — chủ tiệm chưa nêu luật cho phần vượt, không tự bịa.
begin;
set local lock_timeout = '10s';
set local statement_timeout = '30s';

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
  v_co_cau_hinh boolean := true;
  v_lcb         numeric := 0;
  v_ngay_chuan  int := 26;
  v_gio_chuan   numeric := 9;
  v_ngay_cong   int := 0;
  v_luong_ngay  numeric := 0;
  v_com         numeric := 0;
  v_gio_tc      numeric := 0;
  v_don_gia_tc  numeric := 0;
  v_tien_tc     numeric := 0;
  v_thuong_sao  numeric := 0;
  v_thuong_so   int := 0;
  v_phat_tien   numeric := 0;
  v_phat_so     int := 0;
  v_so_vi_pham  int := 0;
  v_quy_goc     numeric := 500000;   -- 500 sao = 500.000đ cấp sẵn mỗi tháng
  v_quy_cc      numeric := 0;        -- quỹ gốc + sao được cộng trong tháng
  v_chuyen_can  numeric := 0;
  v_phat_vuot   numeric := 0;
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
    v_co_cau_hinh := false;
  else
    v_lcb := v_cfg.luong_co_ban;
    v_ngay_chuan := v_cfg.ngay_cong_chuan;
    v_gio_chuan := v_cfg.gio_chuan_moi_ngay;
  end if;

  select count(distinct work_date) into v_ngay_cong
  from public.shift_logs
  where staff_id = p_staff_id and type = 'checkin'
    and work_date >= v_dau_thang and work_date < v_cuoi_thang;

  v_luong_ngay := round(v_lcb / v_ngay_chuan * v_ngay_cong);
  v_com := v_ngay_cong * 30000;

  select coalesce(sum(planned_minutes), 0) / 60.0 into v_gio_tc
  from public.overtime_requests
  where employee_id = p_staff_id and status = 'approved'
    and work_date >= v_dau_thang and work_date < v_cuoi_thang;
  v_don_gia_tc := round(v_lcb / v_ngay_chuan / v_gio_chuan * 1.5);
  v_tien_tc := round(v_don_gia_tc * v_gio_tc);

  -- Sao CỘNG (Gieo hạt khen thưởng) — NHẬP VÀO quỹ chuyên cần, không cộng
  -- riêng một dòng nữa.
  select coalesce(sum(amount), 0), coalesce(sum(coalesce(so_sao, round(amount / 1000))), 0)
    into v_thuong_sao, v_thuong_so
  from public.staff_rewards
  where staff_id = p_staff_id and awarded_on >= v_dau_thang and awarded_on < v_cuoi_thang;

  -- Sao TRỪ + vi phạm nội quy — trừ ra từ quỹ chung, không trừ riêng.
  select coalesce(sum(penalty_amount), 0), coalesce(sum(coalesce(so_sao, round(penalty_amount / 1000))), 0), count(*)
    into v_phat_tien, v_phat_so, v_so_vi_pham
  from public.staff_violations
  where staff_id = p_staff_id and occurred_on >= v_dau_thang and occurred_on < v_cuoi_thang;

  v_quy_cc := v_quy_goc + v_thuong_sao;
  v_chuyen_can := greatest(0, v_quy_cc - v_phat_tien);
  v_phat_vuot := greatest(0, v_phat_tien - v_quy_cc);

  select coalesce(sum(amount), 0) into v_tam_ung
  from public.salary_advance_requests
  where employee_id = p_staff_id and status = 'paid'
    and paid_at >= v_dau_thang and paid_at < v_cuoi_thang;

  return jsonb_build_object(
    'co_cau_hinh', v_co_cau_hinh,
    'thang', to_char(v_dau_thang, 'YYYY-MM'),
    'luong_co_ban', v_lcb,
    'ngay_cong_chuan', v_ngay_chuan,
    'ngay_cong_thuc_te', v_ngay_cong,
    'luong_ngay_cong', v_luong_ngay,
    'tien_com', v_com,
    'gio_tang_ca', round(v_gio_tc, 2),
    'don_gia_gio_tang_ca', v_don_gia_tc,
    'tien_tang_ca', v_tien_tc,
    'thuong_sao', v_thuong_sao,
    'thuong_so_sao', v_thuong_so,
    'quy_chuyen_can_goc', v_quy_goc,
    'quy_chuyen_can_sao', 500,
    'quy_chuyen_can', v_quy_cc,
    'phat_tien', v_phat_tien,
    'phat_so_sao', v_phat_so,
    'so_vi_pham', v_so_vi_pham,
    'chuyen_can', v_chuyen_can,
    'phat_vuot_chuyen_can', v_phat_vuot,
    'tam_ung', v_tam_ung,
    -- Thưởng sao KHÔNG cộng riêng, phạt KHÔNG trừ riêng: cả hai đã nằm trọn
    -- trong quỹ chuyên cần (cộng vào quỹ / bào mòn quỹ).
    'tong_du_kien', v_luong_ngay + v_com + v_tien_tc + v_chuyen_can - v_tam_ung
  );
end;
$function$;

insert into public.migration_runs(migration_key, status, finished_at, notes)
values('202609042100_chuyen_can_la_quy_500_sao', 'completed', now(),
  'Chuyen can = quy 500 sao (500.000d) + sao duoc cong trong thang, moi lan tru sao (Gieo hat) hoac vi pham deu tru ra tu quy chung nay. Bo cong rieng thuong_sao va bo tru rieng phat — ban cu tinh HAI LAN. Phat vuot quy hien o phat_vuot_chuyen_can, chua tu tru them.')
on conflict(migration_key) do update set status='completed', finished_at=now(), notes=excluded.notes;

commit;
