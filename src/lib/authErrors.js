const RULES = [
  [/invalid login credentials/i, 'Sai số điện thoại/email hoặc mật khẩu.'],
  [/email not confirmed/i, 'Tài khoản chưa được xác nhận — liên hệ quản trị viên để kích hoạt, hoặc kiểm tra cài đặt "Confirm email" trong Supabase.'],
  [/user already registered/i, 'Tài khoản này đã tồn tại — hãy bấm "Đăng nhập" thay vì đăng ký.'],
  [/password should be at least/i, 'Mật khẩu phải có ít nhất 6 ký tự.'],
  [/email address .* is invalid/i, 'Địa chỉ email không hợp lệ (một số domain thử nghiệm bị chặn) — thử dùng Gmail thật.'],
  [/unable to validate email address/i, 'Định dạng email không hợp lệ.'],
  [/signup requires a valid password/i, 'Cần nhập mật khẩu hợp lệ.'],
  [/failed to fetch/i, 'Không thể kết nối tới máy chủ — kiểm tra lại mạng hoặc cấu hình Supabase (.env).'],
  [/for security purposes.*seconds/i, 'Vì lý do bảo mật, vui lòng thử lại sau ít giây.'],
  [/rate limit/i, 'Thao tác quá nhanh — vui lòng thử lại sau ít phút.'],
];

export function translateAuthError(message) {
  if (!message) return 'Đã có lỗi xảy ra, vui lòng thử lại.';
  const rule = RULES.find(([pattern]) => pattern.test(message));
  return rule ? rule[1] : message;
}
