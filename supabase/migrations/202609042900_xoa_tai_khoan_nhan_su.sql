-- Xoá VĨNH VIỄN tài khoản nhân sự — yêu cầu 04/09/2026: "cho phép xóa tài
-- khoản nhân viên". KHÁC "Khoá tài khoản" (updateProfileActive) đã có sẵn:
-- khoá chỉ chặn đăng nhập + ẩn khỏi danh sách hoạt động, VẪN giữ nguyên lịch
-- sử (đơn hàng, chấm công, lương, KPI cũ vẫn đúng tên); xoá là mất hẳn hồ sơ
-- + tài khoản đăng nhập — không thể hoàn tác.
--
-- ⚠️ profiles.id KHÔNG có ràng buộc khoá ngoại (FOREIGN KEY) chính thức từ
-- bất kỳ bảng nào khác trong schema (đã kiểm tra qua information_schema) —
-- nghĩa là DELETE sẽ không lỗi vì vi phạm khoá ngoại, nhưng các bảng lịch sử
-- (tasks.assignee_id, orders.created_by, shift_logs.staff_id, delivery_runs.
-- assigned_driver_id, task_kpi_logs...) sẽ còn "dangling" — giữ nguyên uuid
-- cũ nhưng không tra được tên (ứng dụng đã tự xử lý các chỗ này bằng
-- fallback "Chưa rõ"/"Không rõ" từ trước, không lỗi màn hình).
--
-- Có xoá luôn auth.users để tài khoản không đăng nhập được nữa VÀ giải
-- phóng lại SĐT/email đã dùng (cho phép đăng ký lại) — bảng auth.identities/
-- auth.sessions/auth.refresh_tokens của Supabase tự dọn theo qua khoá ngoại
-- CASCADE sẵn có trong schema auth, không cần dọn tay thêm.
create or replace function public.sumi_xoa_tai_khoan_nhan_su(p_staff_id uuid, p_xac_nhan_ten text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_actor uuid := auth.uid();
  v_p     public.profiles%rowtype;
begin
  if v_actor is null then raise exception 'Chưa đăng nhập.'; end if;
  if not public.is_business_director() then
    raise exception 'Chỉ Giám đốc mới xoá được tài khoản nhân sự.';
  end if;
  if p_staff_id = v_actor then
    raise exception 'Không thể tự xoá tài khoản của chính mình.';
  end if;

  select * into v_p from public.profiles where id = p_staff_id;
  if v_p.id is null then raise exception 'Không tìm thấy tài khoản.'; end if;
  if v_p.role in ('owner', 'admin') then
    raise exception 'Không thể xoá tài khoản Chủ/Quản trị qua đây.';
  end if;
  if trim(coalesce(p_xac_nhan_ten, '')) = '' or trim(p_xac_nhan_ten) <> trim(coalesce(v_p.full_name, '')) then
    raise exception 'Tên xác nhận không khớp — hãy gõ đúng tên hiển thị của tài khoản.';
  end if;

  delete from public.profiles where id = p_staff_id;
  delete from auth.users where id = p_staff_id;

  return jsonb_build_object('thanh_cong', true, 'thong_bao', 'Đã xoá vĩnh viễn tài khoản ' || v_p.full_name);
end;
$$;

grant execute on function public.sumi_xoa_tai_khoan_nhan_su(uuid, text) to authenticated;
