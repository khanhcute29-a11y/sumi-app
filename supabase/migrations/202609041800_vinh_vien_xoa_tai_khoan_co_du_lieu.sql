-- Vá lỗi thật: "Xoá VĨNH VIỄN tài khoản" báo lỗi Postgres thô ra màn hình
-- ("update or delete on table profiles violates foreign key constraint
-- payroll_entries_employee_id_fkey...") vì tài khoản đã có dữ liệu nghiệp vụ
-- thật (lương, tạm ứng, chấm công, đơn từ...) — RPC cũ xoá thẳng
-- `profiles` không kiểm tra gì trước.
--
-- Đối chiếu toàn bộ khoá ngoại trỏ vào profiles(id): có 16 cột ở nhiều bảng
-- (payroll_entries, salary_advance_requests, expense_claims, task_proofs,
-- permission_grants, delivery_delegations, company_feed_posts/comments,
-- daily_cash_closes, task_overdue_logs, third_party_shipments,
-- visual_work_guides...) sẽ CHẶN xoá nếu tài khoản có dòng nào ở đó — đây
-- đều là dữ liệu tài chính/nghiệp vụ/lịch sử THẬT, KHÔNG được tự ý cho
-- cascade xoá theo (mất dấu vết kế toán/kiểm toán).
--
-- Quyết định: KHÔNG cascade xoá — chặn hẳn việc xoá vĩnh viễn khi tài khoản
-- còn dữ liệu nghiệp vụ thật, hướng dẫn dùng "Khoá tài khoản (nghỉ việc)"
-- thay thế (đã có sẵn, giữ nguyên lịch sử, chỉ chặn đăng nhập). Bắt lỗi
-- foreign_key_violation chung (23503) thay vì liệt kê tay từng bảng — vừa
-- đơn giản, vừa tự động đúng nếu sau này có thêm bảng tham chiếu mới.
begin;
set local lock_timeout = '10s';
set local statement_timeout = '30s';

create or replace function public.sumi_xoa_tai_khoan_nhan_su(p_staff_id uuid, p_xac_nhan_ten text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
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

  begin
    delete from public.profiles where id = p_staff_id;
  exception when foreign_key_violation then
    return jsonb_build_object('thanh_cong', false, 'thong_bao',
      'Tài khoản "' || v_p.full_name || '" đã có dữ liệu nghiệp vụ thật trong hệ thống ' ||
      '(lương, tạm ứng, chấm công, đơn từ, hoạt động khác...) nên KHÔNG thể xoá vĩnh viễn — ' ||
      'xoá sẽ làm mất dấu vết những dữ liệu đó. Hãy dùng "Khoá tài khoản (nghỉ việc)" thay thế: ' ||
      'tài khoản bị khoá không đăng nhập được nhưng vẫn giữ nguyên toàn bộ lịch sử.');
  end;

  delete from auth.users where id = p_staff_id;

  return jsonb_build_object('thanh_cong', true, 'thong_bao', 'Đã xoá vĩnh viễn tài khoản ' || v_p.full_name);
end;
$function$;

insert into public.migration_runs(migration_key, status, finished_at, notes)
values('202609041800_vinh_vien_xoa_tai_khoan_co_du_lieu', 'completed', now(),
  'sumi_xoa_tai_khoan_nhan_su: bat foreign_key_violation khi tai khoan da co du lieu nghiep vu that (payroll/tam ung/dat...), tra thong bao ro rang huong dan dung Khoa tai khoan thay vi de lo loi Postgres tho.')
on conflict(migration_key) do update set status='completed', finished_at=now(), notes=excluded.notes;

commit;
