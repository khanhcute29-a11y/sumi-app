import { supabase } from './supabaseClient';

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY;

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

export function isPushSupported() {
  return 'serviceWorker' in navigator && 'PushManager' in window && Boolean(VAPID_PUBLIC_KEY);
}

// iOS Safari chỉ hỗ trợ Web Push khi trang đã được "Thêm vào Màn hình chính"
// (chạy standalone như 1 app) và iOS >= 16.4 — mở bằng tab Safari thường thì
// PushManager không tồn tại, isPushSupported() trả về false dù máy hỗ trợ được.
export function isIosSafariNotInstalled() {
  const ua = window.navigator.userAgent;
  const isIos = /iPad|iPhone|iPod/.test(ua) || (ua.includes('Macintosh') && 'ontouchend' in document);
  const isStandalone = window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches;
  return isIos && !isStandalone;
}

export async function getPushSubscriptionStatus() {
  if (!isPushSupported()) return isIosSafariNotInstalled() ? 'ios_add_to_home' : 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  return sub ? 'subscribed' : 'unsubscribed';
}

export async function enablePush(staffId) {
  if (!isPushSupported()) throw new Error('Trình duyệt này không hỗ trợ thông báo đẩy.');
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Bạn chưa cho phép nhận thông báo.');
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });
  }
  const json = sub.toJSON();
  const { error } = await supabase.from('push_subscriptions').upsert({
    staff_id: staffId, endpoint: json.endpoint, p256dh: json.keys.p256dh, auth_key: json.keys.auth,
  }, { onConflict: 'endpoint' });
  if (error) throw error;
}

export async function disablePush() {
  if (!isPushSupported()) return;
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return;
  await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
  await sub.unsubscribe();
}

// ---------------------------------------------------------------------------
// TỰ ĐỘNG ĐĂNG KÝ khi nhân viên mở app.
//
// Vì sao cần: toàn bộ hạ tầng push đã có sẵn (Service Worker, API gửi, trigger
// trong database) NHƯNG không nơi nào gọi enablePush() — nên chỉ 1/30 máy từng
// đăng ký được, và khi đóng gói thì cả file này bị loại bỏ vì không ai import.
//
// Gọi hàm này một lần sau khi đăng nhập. Nó im lặng bỏ qua nếu máy không hỗ
// trợ hoặc người dùng đã từ chối — không làm phiền, không chặn màn hình.
// ---------------------------------------------------------------------------
// So khoá của đăng ký hiện có với khoá máy chủ đang dùng.
// Trả về true nếu khớp (hoặc không đọc được -> coi như khớp, tránh huỷ nhầm).
function khopKhoaHienTai(sub) {
  try {
    const cu = sub.options?.applicationServerKey;
    if (!cu) return true;
    const moi = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);
    const cuBytes = new Uint8Array(cu);
    if (cuBytes.length !== moi.length) return false;
    for (let i = 0; i < moi.length; i++) if (cuBytes[i] !== moi[i]) return false;
    return true;
  } catch (e) {
    console.warn('[Push] Không so được khoá, giữ nguyên đăng ký:', e?.message || e);
    return true;
  }
}

export async function autoEnablePush(staffId) {
  try {
    if (!staffId) return 'no_staff';
    if (!isPushSupported()) {
      return isIosSafariNotInstalled() ? 'ios_add_to_home' : 'unsupported';
    }
    if (Notification.permission === 'denied') return 'denied';

    const reg = await navigator.serviceWorker.ready;
    let existing = await reg.pushManager.getSubscription();

    // Đăng ký push bị RÀNG BUỘC với khoá VAPID lúc tạo. Nếu khoá máy chủ đã
    // đổi (ví dụ sinh khoá mới), đăng ký cũ vẫn "tồn tại" nhưng dịch vụ đẩy
    // sẽ TỪ CHỐI mọi thông báo — máy đó câm vĩnh viễn mà không ai biết.
    // Đã gặp thật: 1 máy đăng ký từ 08/08 không nhận được, 3 máy đăng ký sau
    // khi đổi khoá thì nhận bình thường.
    if (existing && !khopKhoaHienTai(existing)) {
      console.warn('[Push] Đăng ký cũ dùng khoá khác — huỷ và đăng ký lại');
      try { await existing.unsubscribe(); } catch (e) { /* bỏ qua */ }
      await supabase.from('push_subscriptions').delete().eq('endpoint', existing.endpoint);
      existing = null;
    }

    // Đã đăng ký rồi thì chỉ cần chắc chắn máy chủ vẫn còn bản ghi.
    // Endpoint có thể bị trình duyệt cấp lại, nên upsert cho chắc.
    if (existing) {
      const json = existing.toJSON();
      await supabase.from('push_subscriptions').upsert({
        staff_id: staffId,
        endpoint: json.endpoint,
        p256dh: json.keys.p256dh,
        auth_key: json.keys.auth,
      }, { onConflict: 'endpoint' });
      return 'subscribed';
    }

    // Chưa hỏi quyền bao giờ -> hỏi. Đã cho phép rồi -> đăng ký luôn.
    await enablePush(staffId);
    return 'subscribed';
  } catch (err) {
    console.warn('[Push] Không đăng ký được nhận thông báo:', err?.message || err);
    return 'error';
  }
}
