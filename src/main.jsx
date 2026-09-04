import React from 'react'
import ReactDOM from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import App from './App.jsx'
import { ErrorBoundary } from './components/ErrorBoundary.jsx'
import '../design-system/styles.css'
import './App.css'
import './mobile-shell.css'
import './order-flow.css'
import './order-overview.css'
import './brand-assets.css'
import './interaction-feedback.css'
import './workforce.css'
import './finance-requests.css'
import './company-feed.css'
import './pinned-announcement.css'
import './bottom-nav-five.css'
import { newId } from './lib/ids'

// Android browsers opened over the local HTTP address expose crypto but not
// randomUUID. Keep every mobile workflow operational during staging tests.
if (globalThis.crypto && !globalThis.crypto.randomUUID) {
  Object.defineProperty(globalThis.crypto, 'randomUUID', { value: newId, configurable: true })
}

const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    updateSW(true);
  },
  // Trình duyệt mặc định chỉ tự kiểm tra bản Service Worker mới khi điều
  // hướng trang — nếu nhân viên cứ để app mở nguyên cả ca làm việc (rất phổ
  // biến trên điện thoại bếp/vận tải), không bao giờ tự hỏi lại server xem
  // có bản mới chưa, phải xoá cache/gỡ app mới thấy cập nhật. Chủ động hỏi
  // định kỳ + mỗi khi app quay lại từ nền để không ai phải làm vậy nữa.
  onRegisteredSW(swUrl, registration) {
    if (!registration) return;
    const checkForUpdate = () => registration.update().catch(() => {});
    setInterval(checkForUpdate, 60_000);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') checkForUpdate();
    });
  },
});

// ── MOCKUP SANDBOX ────────────────────────────────────────────────
// Chỉ active khi có ?mockup=orders trong URL.
// Production không có param này → App chạy y hệt như cũ.
const _mkParam = new URLSearchParams(window.location.search).get('mockup');

async function mountApp() {
  let RootComponent = App;
  let wrapWithErrorBoundary = true;

  if (_mkParam === 'orders') {
    const mod = await import('./mockups/orders/index.jsx');
    RootComponent = mod.default;
    wrapWithErrorBoundary = false;
  } else if (_mkParam === 'shifts' || _mkParam === '1') {
    const mod = await import('./mockups/shifts/index.jsx');
    RootComponent = mod.default;
    wrapWithErrorBoundary = false;
  } else if (_mkParam === 'notifications') {
    const mod = await import('./mockups/notifications/index.jsx');
    RootComponent = mod.default;
    wrapWithErrorBoundary = false;
  } else if (_mkParam === 'boss-dashboard') {
    const mod = await import('./components/mockups/BossDashboard/BossDashboard.jsx');
    RootComponent = mod.default;
    wrapWithErrorBoundary = false;
  } else if (_mkParam === 'boss-v3' || _mkParam === 'boss-overview-v3') {
    const mod = await import('./components/mockups/BossDashboardV3/BossOverviewV3.tsx');
    RootComponent = mod.default;
    wrapWithErrorBoundary = false;
  } else if (_mkParam === 'employee-v4') {
    const mod = await import('./components/mockups/EmployeeDashboard/EmployeeOverviewV4.jsx');
    RootComponent = mod.default;
    wrapWithErrorBoundary = false;
  } else if (_mkParam === 'cham-cong-v2') {
    const mod = await import('./components/mockups/ChamCongV2Demo.jsx');
    RootComponent = mod.default;
    wrapWithErrorBoundary = false;
  } else if (_mkParam === 'viec-lifecycle') {
    const mod = await import('./components/mockups/ViecLifecycleDemo.jsx');
    RootComponent = mod.default;
    wrapWithErrorBoundary = false;
  } else if (_mkParam === 'accountant' || _mkParam === 'accountant-v1') {
    const mod = await import('./components/mockups/AccountantDashboard/AccountantOverviewV1.tsx');
    RootComponent = mod.default;
    wrapWithErrorBoundary = false;
  }

  ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      {wrapWithErrorBoundary ? (
        <ErrorBoundary><RootComponent /></ErrorBoundary>
      ) : (
        <RootComponent />
      )}
    </React.StrictMode>,
  );
}

mountApp();
// ─────────────────────────────────────────────────────────────────
