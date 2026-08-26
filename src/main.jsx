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
  } else if (_mkParam === 'employee' || _mkParam === 'staff') {
    const mod = await import('./components/mockups/EmployeeDashboard/EmployeeDashboard.jsx');
    RootComponent = mod.default;
    wrapWithErrorBoundary = false;
  } else if (_mkParam === 'multi-role' || _mkParam === 'roles') {
    const mod = await import('./components/mockups/MultiRoleWorkspace/MultiRoleWorkspace.jsx');
    RootComponent = mod.default;
    wrapWithErrorBoundary = false;
  } else if (_mkParam === 'work-management' || _mkParam === 'tasks') {
    const mod = await import('./components/mockups/WorkManagement/WorkManagement.jsx');
    RootComponent = mod.default;
    wrapWithErrorBoundary = false;
  } else if (_mkParam === 'enterprise-workflow' || _mkParam === 'enterprise') {
    const mod = await import('./components/mockups/EnterpriseWorkflow/EnterpriseWorkflow.jsx');
    RootComponent = mod.default;
    wrapWithErrorBoundary = false;
  } else if (_mkParam === 'work-studio' || _mkParam === 'new') {
    const mod = await import('./components/mockups/WorkStudio/WorkStudio.jsx');
    RootComponent = mod.default;
    wrapWithErrorBoundary = false;
  } else if (_mkParam === 'mobile-workspace' || _mkParam === 'mobile') {
    const mod = await import('./components/mockups/MobileMultiRoleWorkspace/MobileMultiRoleWorkspace.jsx');
    RootComponent = mod.default;
    wrapWithErrorBoundary = false;
  } else if (_mkParam === 'workflow-simulator' || _mkParam === 'simulator') {
    const mod = await import('./components/mockups/WorkFlowSimulator/WorkFlowSimulator.jsx');
    RootComponent = mod.default;
    wrapWithErrorBoundary = false;
  } else if (_mkParam === 'task-flow-v3' || _mkParam === 'tasks-v3') {
    const mod = await import('./components/mockups/WorkFlowSystem/TaskFlowV3.tsx');
    RootComponent = mod.default;
    wrapWithErrorBoundary = false;
  } else if (_mkParam === 'executive-finance-ops' || _mkParam === 'finance-ops' || _mkParam === 'finance') {
    const mod = await import('./components/mockups/ExecutiveFinanceOps/ExecutiveFinanceOps.jsx');
    RootComponent = mod.default;
    wrapWithErrorBoundary = false;
  } else if (_mkParam === 'messenger-chat' || _mkParam === 'chat-box' || _mkParam === 'chat') {
    const mod = await import('./components/mockups/MessengerChatBox/MessengerChatBox.jsx');
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
