import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { NetworkFirst } from 'workbox-strategies';

self.__WB_MANIFEST;
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// Network-first for JS/CSS — luôn lấy mới từ server trước
registerRoute(
  ({ request }) => request.destination === 'script' || request.destination === 'style',
  new NetworkFirst({ cacheName: 'assets-cache' })
);

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let payload = { title: 'Sumi Bakery', body: 'Có cập nhật mới.' };
  try {
    if (event.data) payload = { ...payload, ...event.data.json() };
  } catch (err) {
    // ignore malformed payload, dùng mặc định
  }
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      // Rung + giữ trên màn hình khoá cho tới khi nhân viên xem. Điện thoại
      // tự phát âm báo của hệ điều hành, kể cả khi đang tắt màn hình.
      vibrate: [300, 120, 300, 120, 300],
      requireInteraction: true,
      renotify: true,
      // tag theo từng đối tượng: thông báo mới về CÙNG một đơn sẽ thay thông
      // báo cũ thay vì chất đống, nhưng vẫn rung lại (renotify).
      tag: payload.tag || payload.url || 'sumi',
      data: { url: payload.url || '/' },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  // Toàn bộ khối này được bọc phòng vệ: bấm vào thông báo mà lỗi thì tệ nhất
  // cũng chỉ mở trang chủ, TUYỆT ĐỐI không để màn hình trắng.
  try {
    event.notification.close();
  } catch (e) { /* bỏ qua */ }

  // Đường dẫn TUYỆT ĐỐI. Trước đây truyền đường tương đối ('/orders/<id>') —
  // theo chuẩn thì được, nhưng một số trình duyệt/WebView trên điện thoại xử
  // lý không nhất quán. Ghép sẵn với tên miền cho chắc.
  let dich = self.location.origin + '/';
  try {
    const raw = event.notification.data && event.notification.data.url;
    if (raw) {
      const u = new URL(raw, self.location.origin);
      // Chỉ nhận đường dẫn cùng tên miền, không để thông báo dẫn đi nơi khác.
      if (u.origin === self.location.origin) dich = u.href;
    }
  } catch (e) {
    // Dữ liệu hỏng thì vẫn mở trang chủ, không crash
  }

  event.waitUntil(
    (async () => {
      try {
        const ds = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
        const dangMo = ds.find((c) => c.url.startsWith(self.location.origin));

        if (dangMo) {
          // App đang mở: báo cho app tự điều hướng (mượt, không tải lại trang).
          try {
            dangMo.postMessage({ type: 'SUMI_OPEN', url: dich });
          } catch (e) { /* bỏ qua, còn cách dưới */ }

          // Nếu tab đang ở trang khác, đưa hẳn nó tới đúng địa chỉ.
          // navigate() không phải trình duyệt nào cũng có -> bọc riêng.
          try {
            if (typeof dangMo.navigate === 'function' && dangMo.url !== dich) {
              await dangMo.navigate(dich);
            }
          } catch (e) { /* bỏ qua */ }

          try {
            await dangMo.focus();
            return;
          } catch (e) { /* rơi xuống mở cửa sổ mới */ }
        }

        await self.clients.openWindow(dich);
      } catch (e) {
        // Cứu cánh cuối cùng: mở trang chủ. Thà vào trang chủ còn hơn
        // màn hình trắng không làm gì được.
        try { await self.clients.openWindow(self.location.origin + '/'); } catch (e2) { /* chịu */ }
      }
    })()
  );
});
