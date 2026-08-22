// Supabase's real phone-based auth (OTP qua SMS) cần dịch vụ SMS trả phí (Twilio...) chưa
// được cấu hình cho project này. Để vẫn cho nhân viên đăng nhập bằng số điện thoại + mật khẩu
// mà không cần SMS, ta chuyển số điện thoại thành "email nội bộ" giả rồi dùng auth email
// (miễn phí, không cần OTP) — số điện thoại thật vẫn được lưu ở cột profiles.phone.
// `.internal` is rejected by Supabase's current email validator. Keep it as a
// legacy login candidate because older projects may already contain accounts
// created before that validation was tightened.
export const PHONE_EMAIL_DOMAIN = 'phone.sumibakery.app';
export const LEGACY_PHONE_EMAIL_DOMAIN = 'phone.sumibakery.internal';

// Chuẩn hoá về dạng bắt đầu bằng số 0 (VD: +84912345678, 84912345678, 0912345678
// đều phải cho ra cùng 1 tài khoản — nếu không, đăng ký bằng "0912..." rồi đăng
// nhập lại bằng "+84912..." sẽ tạo ra 2 tài khoản khác nhau / báo sai mật khẩu).
export function normalizePhoneDigits(raw) {
  const digits = (raw || '').replace(/\D/g, '');
  if (digits.startsWith('84') && digits.length === 11) return `0${digits.slice(2)}`;
  return digits;
}

export function phoneToSyntheticEmail(raw) {
  return `${normalizePhoneDigits(raw)}@${PHONE_EMAIL_DOMAIN}`;
}

export function isSyntheticPhoneEmail(email) {
  return !!email && (
    email.endsWith(`@${PHONE_EMAIL_DOMAIN}`)
    || email.endsWith(`@${LEGACY_PHONE_EMAIL_DOMAIN}`)
  );
}

export function toLegacyAuthField(identifier) {
  const trimmed = (identifier || '').trim();
  return trimmed.includes('@')
    ? { email: trimmed }
    : { email: `${normalizePhoneDigits(trimmed)}@${LEGACY_PHONE_EMAIL_DOMAIN}` };
}

// { email } nếu identifier là email thật, { email: <email giả> } nếu là số điện thoại —
// Supabase auth luôn nhận field `email`, số điện thoại chỉ là lớp vỏ ở tầng UI.
export function toAuthField(identifier) {
  const trimmed = (identifier || '').trim();
  return trimmed.includes('@') ? { email: trimmed } : { email: phoneToSyntheticEmail(trimmed) };
}
