// Dịch một đường dẫn (từ thông báo đẩy) thành lệnh điều hướng của app.
//
// App là dạng một-trang: không có địa chỉ thật kiểu /orders/<id>. Nhưng thông
// báo đẩy và bảng lịch sử đều lưu đường dẫn dạng đó. File này làm cầu nối,
// dùng lại ĐÚNG cơ chế 'sumi-navigate' đang chạy tốt cho bản web — không dựng
// thêm cơ chế điều hướng nào mới.

const LUAT = [
  { re: /^\/orders\/([0-9a-f-]{36})/i,        tab: 'orders' },
  { re: /^\/company-feed\/([0-9a-f-]{36})/i,  tab: 'feed' },
  { re: /^\/tasks\/([0-9a-f-]{36})/i,         tab: 'tasks' },
  { re: /^\/finance-requests\/([0-9a-f-]{36})/i, tab: 'financeRequests' },
  // Tin nhắn Chat nội bộ (chat_message/chat_mention) — deep_link server gửi
  // '/messenger/<room_id>' (xem migration 202608300500) nhưng TRƯỚC ĐÂY
  // không có luật nào khớp ở đây, nên bấm thông báo đẩy (lúc màn hình tắt/
  // app đóng) rơi vào nhánh dự phòng của sw.js và chỉ mở lại trang mặc định
  // (Trang chủ) thay vì đúng phòng chat. 'messenger' (không phải 'chat') để
  // khớp đúng tên tab App.jsx đang tự đổi thành 'chat' + mở phòng qua entityId.
  { re: /^\/messenger\/([0-9a-f-]{36})/i,     tab: 'messenger' },
  // Chuyến giao được phân cho shipper (delivery_assigned) — deep_link
  // '/shipping/<delivery_run_id>' (xem 202608220016/202608230040), cũng
  // chưa từng có luật khớp. Chưa có cơ chế mở thẳng đúng chuyến (chỉ mở
  // đúng trang Vận Chuyển) — vẫn hơn hẳn rơi về Trang chủ như trước.
  { re: /^\/shipping\/([0-9a-f-]{36})/i,      tab: 'shipping' },
  // Đường dẫn KHÔNG kèm mã: chỉ mở đúng trang, không cuộn tới mục nào.
  // Cần có vì một số thông báo cũ vẫn gửi dạng này.
  { re: /^\/feed\/?$/i,      tab: 'feed' },
  { re: /^\/tasks\/?$/i,     tab: 'tasks' },
  { re: /^\/orders\/?$/i,    tab: 'orders' },
  { re: /^\/messenger\/?$/i, tab: 'messenger' },
];

// Chỉ nhận đường dẫn nội bộ. Đường dẫn từ bên ngoài (http://...) bị bỏ qua để
// không bị lợi dụng điều hướng người dùng đi chỗ khác.
export function parseDeepLink(raw) {
  if (!raw || typeof raw !== 'string') return null;
  let duongDan = raw;
  try {
    if (/^https?:\/\//i.test(raw)) {
      const u = new URL(raw);
      if (u.origin !== window.location.origin) return null;
      duongDan = u.pathname + u.search;
    }
  } catch { return null; }
  if (!duongDan.startsWith('/')) return null;

  for (const l of LUAT) {
    const m = duongDan.match(l.re);
    if (m) return { tab: l.tab, entityId: m[1] || undefined };
  }
  return null;
}

export function goDeepLink(raw) {
  const dich = parseDeepLink(raw);
  if (!dich) return false;
  window.dispatchEvent(new CustomEvent('sumi-navigate', { detail: dich }));
  return true;
}

// Gắn một lần lúc mở app. Xử lý hai tình huống:
//  1. App ĐANG mở, nhân viên bấm thông báo -> Service Worker gửi tin nhắn sang
//  2. App ĐANG ĐÓNG, bấm thông báo -> hệ điều hành mở app kèm địa chỉ
export function initDeepLinkFromPush() {
  // (1) tin nhắn từ Service Worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', (e) => {
      if (e.data?.type === 'SUMI_OPEN') {
        // Chờ một nhịp cho app kịp dựng xong màn hình rồi mới điều hướng
        setTimeout(() => goDeepLink(e.data.url), 300);
      }
    });
  }

  // (2) app vừa được mở bằng đường dẫn từ thông báo
  const duongDanMoDau = window.location.pathname + window.location.search;
  if (duongDanMoDau && duongDanMoDau !== '/') {
    setTimeout(() => {
      if (goDeepLink(duongDanMoDau)) {
        // Dọn địa chỉ trên thanh trình duyệt để lần tải lại sau không nhảy lại
        window.history.replaceState({}, '', '/');
      }
    }, 600);
  }
}
