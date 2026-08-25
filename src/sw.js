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
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientsArr) => {
      const existing = clientsArr.find((c) => c.url.includes(self.location.origin));
      if (existing) {
        // LỖI CŨ: chỉ focus() — mở app lên nhưng đứng nguyên màn hình cũ, nhân
        // viên không biết thông báo nói về đơn nào. Giờ báo cho app biết cần mở
        // gì; app tự điều hướng bằng đúng cơ chế deep link sẵn có.
        existing.postMessage({ type: 'SUMI_OPEN', url });
        return existing.focus();
      }
      // App đang đóng hẳn: mở kèm địa chỉ, app đọc địa chỉ đó lúc khởi động.
      return self.clients.openWindow(url);
    })
  );
});
