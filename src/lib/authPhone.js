// Supabase's real phone-based auth (OTP qua SMS) cần dịch vụ SMS trả phí (Twilio...) chưa
// được cấu hình cho project này. Để vẫn cho nhân viên đăng nhập bằng số điện thoại + mật khẩu
// mà không cần SMS, ta chuyển số điện thoại thành "email nội bộ" giả rồi dùng auth email
// (miễn phí, không cần OTP) — số điện thoại thật vẫn được lưu ở cột profiles.phone.
export const PHONE_EMAIL_DOMAIN = 'phone.sumibakery.internal';

export function normalizePhoneDigits(raw) {
  return (raw || '').replace(/\D/g, '');
}

export function phoneToSyntheticEmail(raw) {
  return `${normalizePhoneDigits(raw)}@${PHONE_EMAIL_DOMAIN}`;
}

export function isSyntheticPhoneEmail(email) {
  return !!email && email.endsWith(`@${PHONE_EMAIL_DOMAIN}`);
}

// { email } nếu identifier là email thật, { email: <email giả> } nếu là số điện thoại —
// Supabase auth luôn nhận field `email`, số điện thoại chỉ là lớp vỏ ở tầng UI.
export function toAuthField(identifier) {
  const trimmed = (identifier || '').trim();
  return trimmed.includes('@') ? { email: trimmed } : { email: phoneToSyntheticEmail(trimmed) };
}
