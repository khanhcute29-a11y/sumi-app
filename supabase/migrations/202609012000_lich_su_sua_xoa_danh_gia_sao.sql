-- Lịch sử đánh giá sao + Sửa/Xóa — khắc phục lỗi đánh giá trùng lặp vì không
-- thấy lịch sử ngay dưới ô đánh giá (Duyệt việc / Đơn hàng / Chấm công).
--
-- TẤT CẢ 3 LUỒNG DÙNG CHUNG 1 CƠ CHẾ (view + 2 RPC dưới đây) — không tách
-- riêng lịch sử/sửa/xóa cho từng màn hình, đúng yêu cầu "phải liên kết với
-- nhau". Component StarRateBar.jsx (dùng chung cả 3 nơi) sẽ tự hiện lịch sử
-- ngay dưới form, lọc theo đúng công đoạn (link_type + link_id) đang xem.
begin;
set local lock_timeout = '10s';
set local statement_timeout = '120s';

-- ---------------------------------------------------------------------------
-- 1. Quản lý cùng đơn vị hiện đang ĐỌC được staff_rewards (bổ sung 202608262210)
--    nhưng CHƯA đọc được staff_violations -> bếp trưởng ghi phạt được nhưng
--    không xem lại được lịch sử phạt của chính đội mình. Bổ sung đối xứng.
-- ---------------------------------------------------------------------------
drop policy if exists "quan ly don vi doc phat cua tho" on public.staff_violations;
create policy "quan ly don vi doc phat cua tho" on public.staff_violations
  for select to authenticated
  using (public.sumi_cung_don_vi_voi_toi(staff_id));

-- ---------------------------------------------------------------------------
-- 2. View gộp Cộng + Trừ làm MỘT nguồn lịch sử duy nhất — cả 3 màn hình query
--    chung view này, không tự viết 3 câu SELECT khác nhau dễ lệch nhau.
--    security_invoker=true -> tự áp RLS đúng của người đang xem, không cần
--    grant thêm gì đặc biệt.
-- ---------------------------------------------------------------------------
create or replace view public.star_transactions with (security_invoker=true) as
select
  r.id, r.staff_id, 'cong'::text as loai, r.so_sao, r.amount as so_tien,
  r.note, r.created_by, cp.full_name as created_by_name, r.created_at, r.awarded_on as ngay,
  r.link_type, r.link_id, false as auto_generated
from public.staff_rewards r
left join public.profiles cp on cp.id = r.created_by
union all
select
  v.id, v.staff_id, 'tru'::text as loai, v.so_sao, v.penalty_amount as so_tien,
  coalesce(v.note, v.description) as note, v.created_by, cp.full_name as created_by_name, v.created_at, v.occurred_on as ngay,
  v.link_type, v.link_id, v.auto_generated
from public.staff_violations v
left join public.profiles cp on cp.id = v.created_by;

grant select on public.star_transactions to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Sửa đánh giá — chỉ người tạo HOẶC quản lý lương mới sửa được, KHÔNG cho
--    sửa các dòng hệ thống tự sinh (phạt trễ giờ tự động) để tránh việc lách
--    xoá dấu vết chấm công trễ qua đường "sửa đánh giá".
-- ---------------------------------------------------------------------------
create or replace function public.sumi_sua_danh_gia_sao(
  p_id uuid, p_loai text, p_so_sao int, p_ghi_chu text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
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
          title = 'Đánh giá +' || p_so_sao || ' sao'
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
          title = 'Đánh giá -' || p_so_sao || ' sao'
      where id = p_id;
  end if;

  return jsonb_build_object('thanh_cong', true, 'thong_bao', 'Đã cập nhật đánh giá.');
end;
$fn$;

revoke all on function public.sumi_sua_danh_gia_sao(uuid, text, int, text) from public, anon;
grant execute on function public.sumi_sua_danh_gia_sao(uuid, text, int, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Xóa đánh giá — cùng nguyên tắc quyền, cũng chặn xoá dòng tự động.
-- ---------------------------------------------------------------------------
create or replace function public.sumi_xoa_danh_gia_sao(p_id uuid, p_loai text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_toi uuid := auth.uid();
  v_row record;
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
    delete from public.staff_violations where id = p_id;
  end if;

  return jsonb_build_object('thanh_cong', true, 'thong_bao', 'Đã xoá đánh giá.');
end;
$fn$;

revoke all on function public.sumi_xoa_danh_gia_sao(uuid, text) from public, anon;
grant execute on function public.sumi_xoa_danh_gia_sao(uuid, text) to authenticated;

insert into public.migration_runs(migration_key, status, finished_at, notes)
values('202609012000_lich_su_sua_xoa_danh_gia_sao', 'completed', now(),
  'Thêm view star_transactions (gộp staff_rewards + staff_violations làm 1 nguồn lịch sử chung cho cả 3 luồng Duyệt việc/Đơn hàng/Chấm công), RPC sumi_sua_danh_gia_sao + sumi_xoa_danh_gia_sao (chỉ người tạo hoặc quản lý lương, chặn sửa/xoá phạt tự động), và policy đọc staff_violations cho quản lý cùng đơn vị (đối xứng với staff_rewards đã có) — khắc phục lỗi đánh giá trùng lặp vì không thấy lịch sử.')
on conflict(migration_key) do update set status='completed', finished_at=now(), notes=excluded.notes;

commit;
