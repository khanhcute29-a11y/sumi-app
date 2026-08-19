import React, { useEffect, useState } from 'react';
import { Sidebar } from './components/navigation/Sidebar';
import { BottomNav } from './components/navigation/BottomNav';
import { supabase } from './lib/supabaseClient';
import { initOfflineSync } from './lib/offlineQueue';
import {
  updateOrderStatus, updateOrder, addWarehouseStock, addShiftCheckin, addShiftCheckout, addLeaveRequest,
  countNewOrders, countKitchenActiveOrders, countPendingApprovals, countOpenIncidents,
} from './lib/queries';
import { navBadgeVisibility } from './lib/roles';
import { initAudioUnlock } from './lib/sound';
import { useOrderNotifications } from './lib/useOrderNotifications';
import { ConnectivityBanner } from './components/ConnectivityBanner';
import { AuthProvider, useAuth } from './lib/AuthContext';
import LoginScreen from './screens/LoginScreen';
import ResetPasswordScreen from './screens/ResetPasswordScreen';
import PendingApprovalScreen from './screens/PendingApprovalScreen';
import OrdersScreen from './screens/OrdersScreen';
import KdsScreen from './screens/KdsScreen';
import WarehouseScreen from './screens/WarehouseScreen';
import CashbookScreen from './screens/CashbookScreen';
import ShippingScreen from './screens/ShippingScreen';
import ReportsScreen from './screens/ReportsScreen';
import CustomersScreen from './screens/CustomersScreen';
import SettingsScreen from './screens/SettingsScreen';
import ProductsScreen from './screens/ProductsScreen';
import ShiftsScreen from './screens/ShiftsScreen';
import DashboardScreen from './screens/DashboardScreen';
import StaffScreen from './screens/StaffScreen';
import ApprovalRequestsScreen from './screens/ApprovalRequestsScreen';
import TasksScreen from './screens/TasksScreen';
import IncidentsScreen from './screens/IncidentsScreen';
import KpiScreen from './screens/KpiScreen';
import { applyUiScale, getUiScale } from './lib/uiScale';
import { NavBadge } from './components/navigation/NavBadge';
import { IconDashboard, IconShipping, IconProducts, IconShifts, IconReports, IconCustomers, IconStaff, IconSettings, IconCheck, IconWarning, IconClipboard } from './components/icons/FrogIcons';

const MORE_ITEMS = [
  { key: 'dashboard', label: 'Tổng Quan', Icon: IconDashboard },
  { key: 'shipping', label: 'Vận Chuyển', Icon: IconShipping },
  { key: 'products', label: 'Sản Phẩm', Icon: IconProducts },
  { key: 'shifts', label: 'Ca Làm Việc', Icon: IconShifts },
  { key: 'approvals', label: 'Yêu Cầu Duyệt', Icon: IconCheck },
  { key: 'incidents', label: 'Báo Cáo Sự Cố', Icon: IconWarning },
  { key: 'reports', label: 'Báo Cáo', Icon: IconReports },
  { key: 'kpi', label: 'KPI', Icon: IconClipboard },
  { key: 'crm', label: 'Khách Hàng', Icon: IconCustomers },
  { key: 'staff', label: 'Nhân Viên', Icon: IconStaff },
  { key: 'settings', label: 'Thiết lập', Icon: IconSettings },
];

function MoreSheet({ onClose, onSelect, badges = {} }) {
  return (
    <div className="sb-more-sheet" style={{ position: 'fixed', inset: 0, background: 'var(--surface-overlay)', zIndex: 60, display: 'flex', alignItems: 'flex-end' }} onClick={onClose}>
      <div style={{ background: 'var(--surface-card)', width: '100%', borderRadius: '20px 20px 0 0', padding: '20px', display: 'flex', flexDirection: 'column', gap: 4 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ font: 'var(--text-title)', color: 'var(--text-primary)', marginBottom: 8 }}>Thêm</div>
        {MORE_ITEMS.map((it) => (
          <button key={it.key} onClick={() => { onSelect(it.key); onClose(); }} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 6px', border: 'none', background: 'none', textAlign: 'left', font: 'var(--text-body-lg)', color: 'var(--text-primary)', cursor: 'pointer' }}>
            <it.Icon size={20} style={{ color: 'var(--text-primary)' }} /><span style={{ flex: 1 }}>{it.label}</span><NavBadge count={badges[it.key]} />
          </button>
        ))}
      </div>
    </div>
  );
}

const OFFLINE_HANDLERS = {
  updateOrderStatus: ({ id, status }) => updateOrderStatus(id, status),
  updateOrder: ({ id, fields }) => updateOrder(id, fields),
  addWarehouseStock: (payload) => addWarehouseStock(payload),
  addShiftCheckin: (payload) => addShiftCheckin(payload),
  addShiftCheckout: (payload) => addShiftCheckout(payload),
  addLeaveRequest: (payload) => addLeaveRequest(payload),
};

function OpsApp({ onSignOut }) {
  const { profile } = useAuth();
  const [tab, setTab] = useState('orders');
  const [showMore, setShowMore] = useState(false);
  const [kdsStation, setKdsStation] = useState('all');
  const [warehouseBranch, setWarehouseBranch] = useState('all');
  const [badgeCounts, setBadgeCounts] = useState({ orders: 0, kds: 0, approvals: 0, incidents: 0 });

  useOrderNotifications();

  useEffect(() => {
    initAudioUnlock();
    initOfflineSync(OFFLINE_HANDLERS, () => window.dispatchEvent(new Event('sumi-queue-changed')));
    applyUiScale(getUiScale());
  }, []);

  useEffect(() => {
    const vis = navBadgeVisibility(profile);
    const loadBadges = () => {
      Promise.all([
        vis.orders ? countNewOrders() : 0,
        vis.kds ? countKitchenActiveOrders() : 0,
        vis.approvals ? countPendingApprovals() : 0,
        vis.incidents ? countOpenIncidents(vis.incidentCategories ? { categories: vis.incidentCategories } : {}) : 0,
      ]).then(([orders, kds, approvals, incidents]) => setBadgeCounts({ orders, kds, approvals, incidents })).catch(() => {});
    };
    loadBadges();
    window.addEventListener('sumi-badges-changed', loadBadges);
    const channel = supabase
      .channel('nav-badges-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, loadBadges)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'approval_requests' }, loadBadges)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'incident_reports' }, loadBadges)
      .subscribe();
    return () => { window.removeEventListener('sumi-badges-changed', loadBadges); supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.role, (profile?.extra_roles || []).join(',')]);

  const screens = {
    dashboard: <DashboardScreen />, orders: <OrdersScreen />, kds: <KdsScreen initialStation={kdsStation} />, warehouse: <WarehouseScreen branch={warehouseBranch} onBranchChange={setWarehouseBranch} />, cashbook: <CashbookScreen />,
    shipping: <ShippingScreen />, products: <ProductsScreen />, shifts: <ShiftsScreen />, approvals: <ApprovalRequestsScreen />, tasks: <TasksScreen />, incidents: <IncidentsScreen />, reports: <ReportsScreen />, kpi: <KpiScreen />, crm: <CustomersScreen />, staff: <StaffScreen />, settings: <SettingsScreen onSignOut={onSignOut} />,
  };
  const isBottomKey = (k) => ['orders', 'kds', 'warehouse', 'cashbook'].includes(k);
  return (
    <div className="sb-shell">
      <ConnectivityBanner />
      <div className="sb-body">
        <div className="sb-sidebar"><Sidebar active={tab} activeStation={kdsStation} onSelectStation={setKdsStation} activeBranch={warehouseBranch} onSelectBranch={setWarehouseBranch} onSelect={setTab} badges={badgeCounts} /></div>
        <div className="sb-content">
          {screens[tab]}
        </div>
      </div>
      <div className="sb-bottomnav">
        <BottomNav active={isBottomKey(tab) ? tab : ''} onSelect={setTab} onMore={() => setShowMore(true)} badges={badgeCounts}
          style={{ position: 'static', left: 'auto', right: 'auto', bottom: 'auto', width: '100%', flexShrink: 0 }} />
      </div>
      {showMore && <MoreSheet onClose={() => setShowMore(false)} onSelect={setTab} badges={badgeCounts} />}
    </div>
  );
}

function AuthGate({ onSignOut }) {
  const { profile, loading } = useAuth();
  if (loading) {
    return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--surface-app)', color: 'var(--text-muted)', font: 'var(--text-body)' }}>Đang tải...</div>;
  }
  if (profile?.approved === false) {
    return <PendingApprovalScreen profile={profile} onSignOut={onSignOut} />;
  }
  return <OpsApp onSignOut={onSignOut} />;
}

export default function App() {
  const [session, setSession] = useState(undefined);
  const [recovering, setRecovering] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((event, newSession) => {
      if (event === 'PASSWORD_RECOVERY') setRecovering(true);
      setSession(newSession);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  if (session === undefined) {
    return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--surface-app)', color: 'var(--text-muted)', font: 'var(--text-body)' }}>Đang tải...</div>;
  }
  if (recovering) {
    return <ResetPasswordScreen onDone={() => setRecovering(false)} />;
  }
  return session ? (
    <AuthProvider>
      <AuthGate onSignOut={() => supabase.auth.signOut()} />
    </AuthProvider>
  ) : <LoginScreen />;
}
