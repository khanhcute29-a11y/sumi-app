-- Nối "GIEO HẠT" (sumi_dieu_chinh_sao) vào 3 luồng thật theo yêu cầu chủ
-- tiệm (04/09/2026):
--   1) KPI: mỗi lần Cộng/Trừ ghi thêm 1 dòng vào task_kpi_logs (su_kien
--      'gieo_hat') — sumi_chot_kpi_thang() cộng luôn dòng này vào tổng điểm
--      KPI tháng, y hệt việc hoàn thành (đã cùng quy ước 1 điểm = 1.000đ).
--   2) Lương thực nhận: thêm 2 cột star_bonus/star_penalty vào
--      payroll_entries — TỰ ĐỘNG đồng bộ mỗi khi Cộng/Trừ/Sửa/Xoá, KHÔNG
--      phải trường Kế toán gõ tay (khác các cột thưởng/phạt thủ công khác)
--      — tránh đụng độ khi Kế toán tự nhập số khác cho các khoản đó.
--   3) Âm thanh: BÁO CHO TOÀN CÔNG TY (không chỉ người được/bị đánh giá) —
--      "kích lệ" (khen thì mọi người cùng biết) và "đảm bảo đúng quy định"
--      (phạt thì công khai, có tính răn đe) — tái dùng đúng cách
--      broadcast_company_announcement() đã làm cho Bảng tin công ty.
begin;
set local lock_timeout = '10s';
set local statement_timeout = '30s';

alter table public.payroll_entries add column if not exists star_bonus numeric not null default 0;
alter table public.payroll_entries add column if not exists star_penalty numeric not null default 0;
alter table public.task_kpi_logs add column if not exists link_type text;
alter table public.task_kpi_logs add column if not exists link_id uuid;

-- ── Đồng bộ sao -> lương của 1 người, đúng kỳ chứa ngày p_ngay. Không có kỳ
-- lương / chưa lập bảng lương tháng đó thì bỏ qua (không có gì để đồng bộ).
create or replace function public.sumi_dong_bo_sao_1_nguoi(p_staff_id uuid, p_ngay date)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_dau  date := date_trunc('month', p_ngay)::date;
  v_cuoi date := (date_trunc('month', p_ngay) + interval '1 month')::date;
begin
  update public.payroll_entries e set
    star_bonus = coalesce((select sum(r.amount) from public.staff_rewards r
                            where r.staff_id = p_staff_id and r.awarded_on >= v_dau and r.awarded_on < v_cuoi), 0),
    star_penalty = coalesce((select sum(v.penalty_amount) from public.staff_violations v
                              where v.staff_id = p_staff_id and v.occurred_on >= v_dau and v.occurred_on < v_cuoi), 0),
    updated_at = now()
  from public.payroll_periods p
  where e.period_id = p.id and p.period_month = v_dau and e.employee_id = p_staff_id;
end;
$function$;

-- ── Đồng bộ lại CẢ KỲ (dùng khi Kế toán vừa lập bảng lương tháng mới — kéo
-- sẵn sao đã gieo TRƯỚC khi bảng lương được tạo vào đúng kỳ của nó). ──
create or replace function public.sumi_dong_bo_sao_thang(p_period_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_dau  date;
  v_cuoi date;
  v_so   int;
begin
  if not (public.is_business_director() or public.is_payroll_manager()) then
    return jsonb_build_object('thanh_cong', false, 'thong_bao', 'Chỉ Kế toán/Giám đốc mới đồng bộ được.');
  end if;
  select period_month, (period_month + interval '1 month')::date into v_dau, v_cuoi
  from public.payroll_periods where id = p_period_id;
  if v_dau is null then
    return jsonb_build_object('thanh_cong', false, 'thong_bao', 'Không tìm thấy kỳ lương.');
  end if;
  update public.payroll_entries e set
    star_bonus = coalesce((select sum(r.amount) from public.staff_rewards r
                            where r.staff_id = e.employee_id and r.awarded_on >= v_dau and r.awarded_on < v_cuoi), 0),
    star_penalty = coalesce((select sum(v.penalty_amount) from public.staff_violations v
                              where v.staff_id = e.employee_id and v.occurred_on >= v_dau and v.occurred_on < v_cuoi), 0),
    updated_at = now()
  where e.period_id = p_period_id;
  get diagnostics v_so = row_count;
  return jsonb_build_object('thanh_cong', true, 'so_nhan_su', v_so);
end;
$function$;

-- ── sumi_dieu_chinh_sao: thêm KPI + đồng bộ lương + báo toàn công ty ────────
create or replace function public.sumi_dieu_chinh_sao(
  p_staff_id uuid, p_so_sao integer, p_loai text, p_ghi_chu text default null,
  p_link_type text default null, p_link_id uuid default null, p_photo_url text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_toi   uuid := auth.uid();
  v_ten   text;
  v_tien  numeric;
  v_id    uuid;
begin
  if v_toi is null then
    return jsonb_build_object('thanh_cong', false, 'thong_bao', 'Chưa đăng nhập.');
  end if;

  if p_staff_id is null then
    return jsonb_build_object('thanh_cong', false, 'thong_bao', 'Chưa chọn nhân sự để đánh giá.');
  end if;

  if p_staff_id = v_toi then
    return jsonb_build_object('thanh_cong', false, 'thong_bao', 'Không thể tự đánh giá cho chính mình.');
  end if;

  if p_loai not in ('cong', 'tru') then
    return jsonb_build_object('thanh_cong', false, 'thong_bao', 'Loại đánh giá không hợp lệ.');
  end if;

  if p_so_sao is null or p_so_sao < 1 or p_so_sao > 999 then
    return jsonb_build_object('thanh_cong', false, 'thong_bao', 'Số sao phải từ 1 đến 999.');
  end if;

  if not (public.is_payroll_manager() or public.sumi_cung_don_vi_voi_toi(p_staff_id)) then
    return jsonb_build_object('thanh_cong', false, 'thong_bao', 'Chỉ quản lý của đơn vị mới được đánh giá nhân sự này.');
  end if;

  select full_name into v_ten from public.profiles where id = p_staff_id;
  if v_ten is null then
    return jsonb_build_object('thanh_cong', false, 'thong_bao', 'Không tìm thấy nhân sự.');
  end if;

  v_tien := p_so_sao * 1000;

  if p_loai = 'cong' then
    insert into public.staff_rewards(staff_id, title, amount, awarded_on, created_by, note, so_sao, link_type, link_id, photo_url)
    values (p_staff_id, 'Đánh giá +' || p_so_sao || ' sao', v_tien, current_date, v_toi,
            nullif(btrim(coalesce(p_ghi_chu, '')), ''), p_so_sao, p_link_type, p_link_id, p_photo_url)
    returning id into v_id;

    insert into public.notifications(event_key, recipient_profile_id, notification_type, severity, sound_key, title, body, entity_type, entity_id, deep_link)
    values('star_reward:' || v_id, p_staff_id, 'star_reward', 'info', 'star_reward',
      '🌟 Bạn vừa được +' || p_so_sao || ' sao (' || to_char(v_tien, 'FM999G999') || 'đ)',
      coalesce(nullif(btrim(coalesce(p_ghi_chu, '')), ''), 'Đánh giá từ quản lý'),
      coalesce(p_link_type, 'staff_reward'), coalesce(p_link_id, v_id), '/tasks')
    on conflict(event_key) do nothing;
  else
    insert into public.staff_violations(staff_id, title, description, penalty_amount, occurred_on, created_by, so_sao, note, link_type, link_id, auto_generated, photo_url)
    values (p_staff_id, 'Đánh giá -' || p_so_sao || ' sao', nullif(btrim(coalesce(p_ghi_chu, '')), ''),
            v_tien, current_date, v_toi, p_so_sao, nullif(btrim(coalesce(p_ghi_chu, '')), ''), p_link_type, p_link_id, false, p_photo_url)
    returning id into v_id;

    -- TRƯỚC ĐÂY dùng sound_key='silent' cho phần trừ (tránh ảnh hưởng tâm
    -- lý). Đổi theo yêu cầu chủ tiệm 04/09/2026: phạt phải RÕ RÀNG, có tính
    -- răn đe — người bị trừ cũng nghe được, không im lặng nữa.
    insert into public.notifications(event_key, recipient_profile_id, notification_type, severity, sound_key, title, body, entity_type, entity_id, deep_link)
    values('star_penalty:' || v_id, p_staff_id, 'star_penalty', 'warning', 'star_penalty',
      'Bạn vừa bị trừ ' || p_so_sao || ' sao (' || to_char(v_tien, 'FM999G999') || 'đ)',
      coalesce(nullif(btrim(coalesce(p_ghi_chu, '')), ''), 'Đánh giá từ quản lý'),
      coalesce(p_link_type, 'staff_violation'), coalesce(p_link_id, v_id), '/payroll')
    on conflict(event_key) do nothing;
  end if;

  -- 1) KPI — cộng/trừ điểm y hệt quy ước "hoàn thành việc" (1 điểm=1.000đ),
  -- sumi_chot_kpi_thang() gom dòng này vào tổng điểm KPI tháng.
  insert into public.task_kpi_logs(task_id, staff_id, staff_name, su_kien, diem, ly_do, approved_by, link_type, link_id)
  values (null, p_staff_id, v_ten, 'gieo_hat', case when p_loai = 'cong' then p_so_sao else -p_so_sao end,
          'Gieo hạt: ' || coalesce(nullif(btrim(coalesce(p_ghi_chu, '')), ''), (case when p_loai='cong' then 'Khen thưởng' else 'Nhắc nhở' end)),
          v_toi, 'gieo_hat', v_id);

  -- 2) Lương — đồng bộ ngay nếu tháng này đã lập bảng lương.
  perform public.sumi_dong_bo_sao_1_nguoi(p_staff_id, current_date);

  -- 3) Âm thanh — báo cho TOÀN CÔNG TY (trừ người tạo và người được/bị đánh
  -- giá, cả 2 đã có thông báo riêng ở trên), theo đúng cách
  -- broadcast_company_announcement() đang làm cho Bảng tin công ty.
  insert into public.notifications(event_key, recipient_profile_id, notification_type, severity, sound_key, title, body, entity_type, entity_id, deep_link)
  select
    'gieo_hat_broadcast:' || v_id || ':' || p.id, p.id,
    case when p_loai = 'cong' then 'star_reward' else 'star_penalty' end,
    case when p_loai = 'cong' then 'info' else 'warning' end,
    case when p_loai = 'cong' then 'star_reward' else 'star_penalty' end,
    case when p_loai = 'cong'
      then '🌟 ' || v_ten || ' vừa được +' || p_so_sao || ' sao'
      else '⚠️ ' || v_ten || ' vừa bị trừ ' || p_so_sao || ' sao' end,
    coalesce(nullif(btrim(coalesce(p_ghi_chu, '')), ''), ''),
    'staff_reward', v_id, '/tasks'
  from public.profiles p
  where p.approved = true and p.active is distinct from false
    and p.id <> v_toi and p.id <> p_staff_id
  on conflict(event_key) do nothing;

  return jsonb_build_object(
    'thanh_cong', true, 'id', v_id, 'so_sao', p_so_sao, 'so_tien', v_tien,
    'thong_bao', (case when p_loai = 'cong' then 'Đã cộng ' else 'Đã trừ ' end) ||
                 p_so_sao || ' sao (' || to_char(v_tien, 'FM999G999') || 'đ) cho ' || v_ten || '.');
end;
$function$;

-- ── sumi_sua_danh_gia_sao: sửa xong đồng bộ lại điểm KPI + lương ───────────
create or replace function public.sumi_sua_danh_gia_sao(
  p_id uuid, p_loai text, p_so_sao integer, p_ghi_chu text default null, p_photo_url text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_toi     uuid := auth.uid();
  v_tien    numeric;
  v_row     record;
  v_staff   uuid;
  v_ngay    date;
begin
  if v_toi is null then
    return jsonb_build_object('thanh_cong', false, 'thong_bao', 'Chưa đăng nhập.');
  end if;
  if p_loai not in ('cong', 'tru') then
    return jsonb_build_object('thanh_cong', false, 'thong_bao', 'Loại đánh giá không hợp lệ.');
  end if;
  if p_so_sao is null or p_so_sao < 1 or p_so_sao > 999 then
    return jsonb_build_object('thanh_cong', false, 'thong_bao', 'Số sao phải từ 1 đến 999.');
  end if;

  v_tien := p_so_sao * 1000;

  if p_loai = 'cong' then
    select * into v_row from public.staff_rewards where id = p_id;
    if not found then
      return jsonb_build_object('thanh_cong', false, 'thong_bao', 'Không tìm thấy đánh giá.');
    end if;
    if not (v_row.created_by = v_toi or public.is_payroll_manager()) then
      return jsonb_build_object('thanh_cong', false, 'thong_bao', 'Chỉ người đã đánh giá hoặc quản lý lương mới sửa được.');
    end if;
    update public.staff_rewards
      set so_sao = p_so_sao, amount = v_tien, note = nullif(btrim(coalesce(p_ghi_chu, '')), ''),
          title = 'Đánh giá +' || p_so_sao || ' sao', photo_url = p_photo_url
      where id = p_id;
    v_staff := v_row.staff_id; v_ngay := v_row.awarded_on;
    update public.task_kpi_logs set diem = p_so_sao where link_type = 'gieo_hat' and link_id = p_id;
  else
    select * into v_row from public.staff_violations where id = p_id;
    if not found then
      return jsonb_build_object('thanh_cong', false, 'thong_bao', 'Không tìm thấy đánh giá.');
    end if;
    if v_row.auto_generated then
      return jsonb_build_object('thanh_cong', false, 'thong_bao', 'Không thể sửa phạt do hệ thống tự động ghi.');
    end if;
    if not (v_row.created_by = v_toi or public.is_payroll_manager()) then
      return jsonb_build_object('thanh_cong', false, 'thong_bao', 'Chỉ người đã đánh giá hoặc quản lý lương mới sửa được.');
    end if;
    update public.staff_violations
      set so_sao = p_so_sao, penalty_amount = v_tien,
          note = nullif(btrim(coalesce(p_ghi_chu, '')), ''), description = nullif(btrim(coalesce(p_ghi_chu, '')), ''),
          title = 'Đánh giá -' || p_so_sao || ' sao', photo_url = p_photo_url
      where id = p_id;
    v_staff := v_row.staff_id; v_ngay := v_row.occurred_on;
    update public.task_kpi_logs set diem = -p_so_sao where link_type = 'gieo_hat' and link_id = p_id;
  end if;

  perform public.sumi_dong_bo_sao_1_nguoi(v_staff, v_ngay);

  return jsonb_build_object('thanh_cong', true, 'thong_bao', 'Đã cập nhật đánh giá.');
end;
$function$;

-- ── sumi_xoa_danh_gia_sao: xoá xong gỡ luôn điểm KPI + đồng bộ lại lương ───
create or replace function public.sumi_xoa_danh_gia_sao(p_id uuid, p_loai text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_toi   uuid := auth.uid();
  v_row   record;
  v_staff uuid;
  v_ngay  date;
begin
  if v_toi is null then
    return jsonb_build_object('thanh_cong', false, 'thong_bao', 'Chưa đăng nhập.');
  end if;
  if p_loai not in ('cong', 'tru') then
    return jsonb_build_object('thanh_cong', false, 'thong_bao', 'Loại đánh giá không hợp lệ.');
  end if;

  if p_loai = 'cong' then
    select * into v_row from public.staff_rewards where id = p_id;
    if not found then
      return jsonb_build_object('thanh_cong', false, 'thong_bao', 'Không tìm thấy đánh giá.');
    end if;
    if not (v_row.created_by = v_toi or public.is_payroll_manager()) then
      return jsonb_build_object('thanh_cong', false, 'thong_bao', 'Chỉ người đã đánh giá hoặc quản lý lương mới xoá được.');
    end if;
    v_staff := v_row.staff_id; v_ngay := v_row.awarded_on;
    delete from public.staff_rewards where id = p_id;
  else
    select * into v_row from public.staff_violations where id = p_id;
    if not found then
      return jsonb_build_object('thanh_cong', false, 'thong_bao', 'Không tìm thấy đánh giá.');
    end if;
    if v_row.auto_generated then
      return jsonb_build_object('thanh_cong', false, 'thong_bao', 'Không thể xoá phạt do hệ thống tự động ghi.');
    end if;
    if not (v_row.created_by = v_toi or public.is_payroll_manager()) then
      return jsonb_build_object('thanh_cong', false, 'thong_bao', 'Chỉ người đã đánh giá hoặc quản lý lương mới xoá được.');
    end if;
    v_staff := v_row.staff_id; v_ngay := v_row.occurred_on;
    delete from public.staff_violations where id = p_id;
  end if;

  delete from public.task_kpi_logs where link_type = 'gieo_hat' and link_id = p_id;
  perform public.sumi_dong_bo_sao_1_nguoi(v_staff, v_ngay);

  return jsonb_build_object('thanh_cong', true, 'thong_bao', 'Đã xoá đánh giá.');
end;
$function$;

-- ── sumi_chot_kpi_thang: gom thêm điểm "gieo_hat" vào tổng KPI tháng ───────
create or replace function public.sumi_chot_kpi_thang(p_thang integer, p_nam integer)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
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
      count(*) filter (where k.su_kien = 'hoan_thanh') as so_viec_xong,
      count(*) filter (where k.su_kien = 'nhan_viec' and k.phut_lech > 15) as so_lan_tre,
      -- 'gieo_hat' = sao Cộng/Trừ trực tiếp từ Giám đốc — gộp CHUNG vào điểm
      -- KPI tháng, cùng quy ước 1 điểm = 1.000đ với việc hoàn thành.
      sum(k.diem) filter (where k.su_kien in ('hoan_thanh', 'gieo_hat')) as diem
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
    diem, diem * 1000,
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
$function$;

insert into public.migration_runs(migration_key, status, finished_at, notes)
values('202609041900_gieo_hat_lien_ket_kpi_luong_am_thanh', 'completed', now(),
  'Gieo hat noi vao 3 luong: (1) task_kpi_logs su_kien=gieo_hat, sumi_chot_kpi_thang gom vao tong diem KPI thang; (2) payroll_entries.star_bonus/star_penalty tu dong dong bo qua sumi_dong_bo_sao_1_nguoi/sumi_dong_bo_sao_thang; (3) thong bao am thanh cho TOAN CONG TY (khong chi nguoi duoc/bi danh gia), doi sound_key tru tu silent sang star_penalty.')
on conflict(migration_key) do update set status='completed', finished_at=now(), notes=excluded.notes;

commit;
