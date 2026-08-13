-- Migration: hỗ trợ đăng nhập bằng số điện thoại mà không cần dịch vụ SMS trả phí.
--
-- Vấn đề: app dùng phone auth thật của Supabase (auth.users.phone), nhưng tính năng này
-- yêu cầu cấu hình nhà cung cấp SMS trả phí (Twilio...) để gửi OTP — chưa được bật, nên
-- mọi lượt đăng ký/đăng nhập bằng SĐT đều bị từ chối ngay từ đầu.
--
-- Giải pháp: chuyển số điện thoại thành "email nội bộ" giả (vd 0901234567@phone.
-- sumibakery.internal) ở tầng frontend, dùng email+password auth miễn phí của Supabase —
-- số điện thoại thật vẫn được gửi kèm trong metadata lúc đăng ký và cần lưu vào
-- profiles.phone để hiển thị lại đúng cho người dùng.
--
-- Migration này cập nhật trigger tạo hồ sơ nhân viên để đọc phone từ metadata.

create or replace function public.handle_new_user()
returns trigger as $$
declare
  is_first boolean;
begin
  select not exists(select 1 from public.profiles) into is_first;
  insert into public.profiles (id, full_name, phone, role, approved)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    new.raw_user_meta_data->>'phone',
    case when is_first then 'owner' else 'cashier' end,
    is_first
  );
  return new;
end;
$$ language plpgsql security definer;

-- Lưu ý quan trọng (không thể làm bằng SQL, cần đổi thủ công trong Supabase Dashboard):
-- Vào Authentication → Providers → Email → tắt "Confirm email".
-- Lý do: tài khoản đăng ký bằng SĐT dùng email giả (@phone.sumibakery.internal), không có
-- hộp thư thật để nhận link xác nhận — nếu để bật, tài khoản sẽ kẹt vĩnh viễn ở trạng thái
-- "chưa xác nhận" và không đăng nhập được. App đã có sẵn bước "Chủ sở hữu duyệt nhân viên
-- mới" (profiles.approved) nên tắt xác nhận email không làm giảm an toàn.
