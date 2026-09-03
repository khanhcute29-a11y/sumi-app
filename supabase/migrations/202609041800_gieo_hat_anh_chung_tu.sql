-- "GIEO HẠT" — Giám đốc Cộng/Trừ sao trực tiếp cho nhân sự NGAY tại Hồ Sơ
-- Ngày (Báo Cáo Ngày), thay cho mục "Vi phạm" tĩnh cũ. Tái dùng NGUYÊN cơ
-- chế sao đã có (sumi_dieu_chinh_sao ghi vào staff_rewards/staff_violations,
-- đã tự cộng vào "Tổng thưởng/phạt" hiển thị cho nhân sự — xem
-- employeeOverviewV4.js fetchStarSummary — tức đã liên kết KPI/thu nhập cá
-- nhân sẵn, không cần bảng/luồng tính mới), chỉ bổ sung ẢNH CHỨNG TỪ vì
-- trước đây chưa hỗ trợ (Giám đốc chụp ảnh vệ sinh bẩn, ảnh sản phẩm lỗi...).
begin;
set local lock_timeout = '10s';
set local statement_timeout = '30s';

alter table public.staff_rewards add column if not exists photo_url text;
alter table public.staff_violations add column if not exists photo_url text;

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
$function$;

create or replace function public.sumi_sua_danh_gia_sao(
  p_id uuid, p_loai text, p_so_sao integer, p_ghi_chu text default null, p_photo_url text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_toi  uuid := auth.uid();
  v_tien numeric;
  v_row  record;
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
  end if;

  return jsonb_build_object('thanh_cong', true, 'thong_bao', 'Đã cập nhật đánh giá.');
end;
$function$;

create or replace view public.star_transactions as
 SELECT r.id,
    r.staff_id,
    'cong'::text AS loai,
    r.so_sao,
    r.amount AS so_tien,
    r.note,
    r.created_by,
    cp.full_name AS created_by_name,
    r.created_at,
    r.awarded_on AS ngay,
    r.link_type,
    r.link_id,
    false AS auto_generated,
    r.photo_url
   FROM (staff_rewards r
     LEFT JOIN profiles cp ON ((cp.id = r.created_by)))
UNION ALL
 SELECT v.id,
    v.staff_id,
    'tru'::text AS loai,
    v.so_sao,
    v.penalty_amount AS so_tien,
    COALESCE(v.note, v.description) AS note,
    v.created_by,
    cp.full_name AS created_by_name,
    v.created_at,
    v.occurred_on AS ngay,
    v.link_type,
    v.link_id,
    v.auto_generated,
    v.photo_url
   FROM (staff_violations v
     LEFT JOIN profiles cp ON ((cp.id = v.created_by)));

insert into public.migration_runs(migration_key, status, finished_at, notes)
values('202609041800_gieo_hat_anh_chung_tu', 'completed', now(),
  'Thêm photo_url cho staff_rewards/staff_violations + view star_transactions. sumi_dieu_chinh_sao/sumi_sua_danh_gia_sao nhận thêm p_photo_url — dùng cho mục "GIEO HẠT" mới ở Hồ Sơ Ngày (thay Vi phạm tĩnh), Giám đốc Cộng/Trừ sao kèm ảnh chứng từ trực tiếp.')
on conflict(migration_key) do update set status='completed', finished_at=now(), notes=excluded.notes;

commit;
