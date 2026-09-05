-- Bảng lương cá nhân: LUÔN hiện đủ khung, người chưa nhập lương cơ bản thì
-- để 0 (yêu cầu Giám đốc 04/09/2026) thay vì thoát sớm kèm một dòng thông
-- báo như bản đầu — để nhân sự nào mở ra cũng thấy đúng bố cục bảng lương,
-- Giám đốc nhập lương cơ bản sau thì số tự chạy vào.
--
-- Vẫn giữ cờ `co_cau_hinh` để giao diện ghi chú nhỏ "chưa nhập lương cơ bản"
-- — hiện số 0 mà không nói gì thì nhân sự dễ hiểu nhầm là lương bằng 0.
--
-- Lưu ý: các khoản KHÔNG phụ thuộc lương cơ bản (tiền cơm, sao thưởng/phạt,
-- chuyên cần, tạm ứng) vẫn tính bình thường cho cả người chưa nhập LCB — đó
-- là dữ liệu thật, không có lý do gì phải giấu đi.
begin;
set local lock_timeout = '10s';
set local statement_timeout = '30s';

-- Gỡ 8 dòng lương cơ bản đã nạp sẵn từ file Excel ở migration
-- 202609041900: Giám đốc đang rà soát lại bảng lương cho TOÀN BỘ nhân sự nên
-- tạm thời để mọi người về 0 hết, tránh cảnh người có số người không rồi
-- nhân sự thắc mắc. Giám đốc nhập lại từng người qua nút "⚙️ Cấu hình lương
-- cơ bản" ở màn Tăng ca & lương tháng.
--
-- CHỈ xoá đúng những dòng do migration kia nạp (lọc theo ghi_chu) — dòng nào
-- Giám đốc/Kế toán đã tự nhập tay thì GIỮ NGUYÊN, không đụng tới.
delete from public.staff_salary_config
where ghi_chu like 'Nạp từ file bảng lương 2026%';

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
    v_co_cau_hinh := false;   -- chưa nhập lương cơ bản -> để 0, vẫn hiện đủ khung
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
    'phat_sao', v_phat_sao,
    'so_vi_pham', v_so_vi_pham,
    'chuyen_can', v_chuyen_can,
    'tam_ung', v_tam_ung,
    'tong_du_kien', v_luong_ngay + v_com + v_tien_tc + v_thuong_sao + v_chuyen_can - v_phat_sao - v_tam_ung
  );
end;
$function$;

insert into public.migration_runs(migration_key, status, finished_at, notes)
values('202609042000_luong_du_kien_hien_du_0', 'completed', now(),
  'sumi_luong_du_kien_thang: nguoi chua nhap luong co ban van tra ve DU khung voi luong_co_ban=0 (thay vi thoat som), de bang luong luon hien day du tren man hinh chinh. Dong thoi go 8 dong luong nap san tu file Excel — Giam doc dang ra soat lai bang luong toan bo nhan su, tam de tat ca ve 0.')
on conflict(migration_key) do update set status='completed', finished_at=now(), notes=excluded.notes;

commit;
