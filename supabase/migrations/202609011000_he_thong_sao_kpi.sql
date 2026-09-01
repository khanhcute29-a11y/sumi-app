-- Hệ thống Thưởng/Phạt KPI (Star System) & Tính Lương
--
-- ═══ KHÔNG ĐẺ BẢNG SONG SONG ═══
-- Bảng `staff_rewards` (Cộng) và `staff_violations` (Trừ) đã có sẵn từ migration
-- 202608260150 + 202608262210 (đồng đội) — đúng là "nhật ký giao dịch" phân tách
-- Cộng/Trừ theo yêu cầu, chỉ còn thiếu cột `so_sao` trên staff_violations (bên
-- staff_rewards đã có). Không tạo bảng `star_transactions` mới chồng lên.
--
-- ═══ 3 PHẦN CHÍNH ═══
--   1) Thêm cột còn thiếu cho staff_violations + cột liên kết nguồn gốc
--      (link_type/link_id) cho cả 2 bảng, để biết sao này sinh ra từ đơn/việc nào.
--   2) RPC sumi_dieu_chinh_sao — cổng ghi CHUNG cho cả Cộng & Trừ thủ công (dùng ở
--      Duyệt việc / Đơn hàng / Chấm công). KHÔNG sửa sumi_tang_sao_ca của đồng đội
--      (màn Chấm công V2 đang chạy tốt, giữ nguyên).
--   3) Trigger tự động trừ sao khi chấm công trễ (AFTER INSERT trên shift_logs,
--      không đụng vào addShiftCheckin phía client) + phạt chuyên cần 500 sao/tháng.
begin;
set local lock_timeout = '10s';
set local statement_timeout = '120s';

-- ---------------------------------------------------------------------------
-- 1. Cột còn thiếu
-- ---------------------------------------------------------------------------
alter table public.staff_violations add column if not exists so_sao int not null default 0;
alter table public.staff_violations add column if not exists note text;
alter table public.staff_violations add column if not exists shift_log_id uuid;
alter table public.staff_violations add column if not exists monthly_key text;
alter table public.staff_violations add column if not exists link_type text;
alter table public.staff_violations add column if not exists link_id uuid;
alter table public.staff_violations add column if not exists auto_generated boolean not null default false;

alter table public.staff_rewards add column if not exists link_type text;
alter table public.staff_rewards add column if not exists link_id uuid;

-- Quy đổi ngược cho các dòng phạt cũ (trước migration này) đã có penalty_amount
-- nhưng chưa có so_sao — giữ đúng tỷ lệ cố định 1 sao = 1.000đ toàn hệ thống.
update public.staff_violations set so_sao = round(penalty_amount / 1000)
  where so_sao = 0 and coalesce(penalty_amount, 0) > 0;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'staff_violations_shift_log_fk') then
    execute 'alter table public.staff_violations
             add constraint staff_violations_shift_log_fk
             foreign key (shift_log_id) references public.shift_logs(id) on delete set null';
  end if;
end $$;

-- Phạt chuyên cần tháng chỉ được ghi ĐÚNG 1 LẦN mỗi (nhân sự, tháng) — chặn
-- trùng lặp nếu trigger chạy lại nhiều lần trong cùng tháng.
create unique index if not exists uq_staff_violations_monthly_key
  on public.staff_violations(staff_id, monthly_key) where monthly_key is not null;

create index if not exists idx_staff_violations_link on public.staff_violations(link_type, link_id) where link_id is not null;
create index if not exists idx_staff_rewards_link on public.staff_rewards(link_type, link_id) where link_id is not null;

-- ---------------------------------------------------------------------------
-- 2. Cổng ghi CHUNG cho Cộng/Trừ thủ công — dùng ở Duyệt việc, Đơn hàng, Chấm công.
--    Cùng nguyên tắc quyền như sumi_tang_sao_ca của đồng đội: quản lý lương
--    (owner/admin/accountant) HOẶC quản lý cùng đơn vị; không tự chấm cho mình.
-- ---------------------------------------------------------------------------
create or replace function public.sumi_dieu_chinh_sao(
  p_staff_id  uuid,
  p_so_sao    int,
  p_loai      text,               -- 'cong' | 'tru'
  p_ghi_chu   text default null,
  p_link_type text default null,
  p_link_id   uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
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
    insert into public.staff_rewards(staff_id, title, amount, awarded_on, created_by, note, so_sao, link_type, link_id)
    values (p_staff_id, 'Đánh giá +' || p_so_sao || ' sao', v_tien, current_date, v_toi,
            nullif(btrim(coalesce(p_ghi_chu, '')), ''), p_so_sao, p_link_type, p_link_id)
    returning id into v_id;

    insert into public.notifications(event_key, recipient_profile_id, notification_type, severity, sound_key, title, body, entity_type, entity_id, deep_link)
    values('star_reward:' || v_id, p_staff_id, 'star_reward', 'info', 'star_reward',
      '🌟 Bạn vừa được +' || p_so_sao || ' sao (' || to_char(v_tien, 'FM999G999') || 'đ)',
      coalesce(nullif(btrim(coalesce(p_ghi_chu, '')), ''), 'Đánh giá từ quản lý'),
      coalesce(p_link_type, 'staff_reward'), coalesce(p_link_id, v_id), '/tasks')
    on conflict(event_key) do nothing;
  else
    insert into public.staff_violations(staff_id, title, description, penalty_amount, occurred_on, created_by, so_sao, note, link_type, link_id, auto_generated)
    values (p_staff_id, 'Đánh giá -' || p_so_sao || ' sao', nullif(btrim(coalesce(p_ghi_chu, '')), ''),
            v_tien, current_date, v_toi, p_so_sao, nullif(btrim(coalesce(p_ghi_chu, '')), ''), p_link_type, p_link_id, false)
    returning id into v_id;

    -- Không dùng chuông ồn ào cho phần trừ — tránh ảnh hưởng tâm lý ngay lập
    -- tức, nhưng vẫn ghi nhận để nhân sự xem lại được trong Bảng lương.
    insert into public.notifications(event_key, recipient_profile_id, notification_type, severity, sound_key, title, body, entity_type, entity_id, deep_link)
    values('star_penalty:' || v_id, p_staff_id, 'star_penalty', 'warning', 'silent',
      'Bạn vừa bị trừ ' || p_so_sao || ' sao (' || to_char(v_tien, 'FM999G999') || 'đ)',
      coalesce(nullif(btrim(coalesce(p_ghi_chu, '')), ''), 'Đánh giá từ quản lý'),
      coalesce(p_link_type, 'staff_violation'), coalesce(p_link_id, v_id), '/payroll')
    on conflict(event_key) do nothing;
  end if;

  return jsonb_build_object(
    'thanh_cong', true, 'id', v_id, 'so_sao', p_so_sao, 'so_tien', v_tien,
    'thong_bao', (case when p_loai = 'cong' then 'Đã cộng ' else 'Đã trừ ' end) ||
                 p_so_sao || ' sao (' || to_char(v_tien, 'FM999G999') || 'đ) cho ' || v_ten || '.');
end;
$fn$;

revoke all on function public.sumi_dieu_chinh_sao(uuid, int, text, text, text, uuid) from public, anon;
grant execute on function public.sumi_dieu_chinh_sao(uuid, int, text, text, text, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Chấm công tự động: trễ 1 phút = trừ 5 sao. Trễ >3 phút quá 3 lần trong
--    tháng -> thêm 1 lần trừ 500 sao (500.000đ) tiền chuyên cần, CHỈ 1 LẦN/tháng.
--
--    SECURITY DEFINER vì người chấm công (chính nhân sự đi trễ) không có quyền
--    is_payroll_manager()/cùng đơn vị với chính mình để ghi vào staff_violations
--    theo RLS gốc — trigger cần vượt qua RLS giống hệt cơ chế sumi_tang_sao_ca.
-- ---------------------------------------------------------------------------
create or replace function public.trg_auto_phat_di_tre()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_so_sao_tre   int;
  v_id           uuid;
  v_thang_key    text;
  v_dem_thang    int;
  v_id_thang     uuid;
begin
  if new.type <> 'checkin' or coalesce(new.late_minutes, 0) < 1 then
    return new;
  end if;

  v_so_sao_tre := new.late_minutes * 5;

  insert into public.staff_violations(
    staff_id, title, description, penalty_amount, occurred_on, created_by,
    so_sao, shift_log_id, link_type, link_id, auto_generated)
  values (
    new.staff_id,
    'Trễ giờ tự động · ' || to_char(new.work_date, 'DD/MM/YYYY'),
    'Trễ ' || new.late_minutes || ' phút' || coalesce(' · ca ' || new.shift_label, ''),
    v_so_sao_tre * 1000, new.work_date, null,
    v_so_sao_tre, new.id, 'shift_log', new.id, true)
  returning id into v_id;

  insert into public.notifications(event_key, recipient_profile_id, notification_type, severity, sound_key, title, body, entity_type, entity_id, deep_link)
  values('star_penalty_auto:' || v_id, new.staff_id, 'star_penalty', 'warning', 'silent',
    'Trễ ' || new.late_minutes || ' phút · tự động trừ ' || v_so_sao_tre || ' sao',
    to_char(v_so_sao_tre * 1000, 'FM999G999') || 'đ · ca ' || to_char(new.work_date, 'DD/MM/YYYY'),
    'shift_log', new.id, '/payroll')
  on conflict(event_key) do nothing;

  -- Đếm số lần trễ > 3 phút trong đúng tháng của lần chấm công này (đã gồm
  -- dòng vừa chấm, vì trigger chạy SAU khi shift_logs đã ghi xong).
  v_thang_key := to_char(new.work_date, 'YYYY-MM');
  select count(*) into v_dem_thang
  from public.shift_logs
  where staff_id = new.staff_id and type = 'checkin' and late_minutes > 3
    and work_date >= date_trunc('month', new.work_date)::date
    and work_date < (date_trunc('month', new.work_date) + interval '1 month')::date;

  if v_dem_thang > 3 then
    insert into public.staff_violations(
      staff_id, title, description, penalty_amount, occurred_on, created_by,
      so_sao, monthly_key, link_type, link_id, auto_generated)
    values (
      new.staff_id,
      'Phạt chuyên cần tháng ' || to_char(new.work_date, 'MM/YYYY'),
      'Trễ hơn 3 phút quá 3 lần trong tháng (' || v_dem_thang || ' lần).',
      500000, new.work_date, null, 500, v_thang_key, 'shift_log', new.id, true)
    on conflict (staff_id, monthly_key) where monthly_key is not null do nothing
    returning id into v_id_thang;

    if v_id_thang is not null then
      insert into public.notifications(event_key, recipient_profile_id, notification_type, severity, sound_key, title, body, entity_type, entity_id, deep_link)
      values('star_penalty_monthly:' || v_id_thang, new.staff_id, 'star_penalty', 'warning', 'silent',
        'Phạt chuyên cần tháng ' || to_char(new.work_date, 'MM/YYYY') || ' · trừ 500 sao',
        'Trễ hơn 3 phút quá 3 lần trong tháng này (500.000đ).',
        'shift_log', new.id, '/payroll')
      on conflict(event_key) do nothing;
    end if;
  end if;

  return new;
end;
$fn$;

drop trigger if exists trg_shift_logs_auto_phat_di_tre on public.shift_logs;
create trigger trg_shift_logs_auto_phat_di_tre
  after insert on public.shift_logs
  for each row execute function public.trg_auto_phat_di_tre();

-- sound_key CHECK — thêm 'star_reward' cho giai điệu tặng sao (bên trừ dùng
-- 'silent' có sẵn, không thêm giai điệu mới để tránh gây tâm lý tiêu cực).
alter table public.notifications drop constraint if exists notifications_sound_key_check;
alter table public.notifications add constraint notifications_sound_key_check
  check (sound_key = any (array['new_order_voice','cash_complete','ting','silent','task_progress','task_deadline','star_reward']));

insert into public.migration_runs(migration_key, status, finished_at, notes)
values('202609011000_he_thong_sao_kpi', 'completed', now(),
  'Hệ thống Thưởng/Phạt KPI (Star System): thêm so_sao/link_type/link_id vào staff_violations (staff_rewards đã có so_sao từ trước), RPC sumi_dieu_chinh_sao dùng chung cho Cộng/Trừ thủ công tại Duyệt việc/Đơn hàng/Chấm công (không đụng sumi_tang_sao_ca cũ), trigger tự động trừ sao khi chấm công trễ (5 sao/phút trễ) + phạt chuyên cần 500 sao/tháng khi trễ >3 phút quá 3 lần (idempotent qua unique index staff_id+monthly_key).')
on conflict(migration_key) do update set status='completed', finished_at=now(), notes=excluded.notes;

commit;
