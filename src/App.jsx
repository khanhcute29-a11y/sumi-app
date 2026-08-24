import React, { useEffect, useState } from 'react';
import { Sidebar } from './components/navigation/Sidebar';
import { BottomNav } from './components/navigation/BottomNav';
import { supabase } from './lib/supabaseClient';
import { initOfflineSync } from './lib/offlineQueue';
import {
  updateOrderStatus, updateOrder, addWarehouseStock, addShiftCheckin, addShiftCheckout, addLeaveRequest, createAdhocTask,
  countNewOrders, countKitchenActiveOrders, countPendingApprovals, countOpenIncidents,
  fetchOrderById, deductFinishedGoodsStockForOrder,
} from './lib/queries';
import { navBadgeVisibility } from './lib/roles';
import { initAudioUnlock } from './lib/sound';
import { useOrderNotifications } from './lib/useOrderNotifications';
import { requestNotificationPermission, playAlertSound } from './lib/alarmSound';
import { setupAutoRefresh, cleanupAllSubscriptions, subscribeToMultipleTables, subscribeToBroadcast, BroadcastEvents } from './lib/realtimeSync';
import { ConnectivityBanner } from './components/ConnectivityBanner';
import { AuthProvider, useAuth } from './lib/AuthContext';
import LoginScreen from './screens/LoginScreen';
import ResetPasswordScreen from './screens/ResetPasswordScreen';
import PendingApprovalScreen from './screens/PendingApprovalScreen';
import OrdersV2Screen from './screens/OrdersV2Screen';
import KdsScreen from './screens/KdsScreen';
import WarehouseScreen from './screens/WarehouseScreen';
import CashbookScreen from './screens/CashbookScreen';
import ShippingScreen from './screens/ShippingScreen';
import ShippingV2Screen from './screens/ShippingV2Screen';
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
import InboxV2Screen from './screens/InboxV2Screen';
import KpiV2Screen from './screens/KpiV2Screen';
import StaffTasksAssignedScreen from './screens/StaffTasksAssignedScreen';
import KpiDashboardScreen from './screens/KpiDashboardScreen';
import MobileHomeScreen from './screens/MobileHomeScreen';
import MobileProfileScreen from './screens/MobileProfileScreen';
import CompensationScreen from './screens/CompensationScreen';
import FinanceRequestsScreen from './screens/FinanceRequestsScreen';
import CompanyFeedScreen from './screens/CompanyFeedScreen';
import VisualGuidesScreen from './screens/VisualGuidesScreen';
import { applyUiScale, getUiScale } from './lib/uiScale';
import { NavBadge } from './components/navigation/NavBadge';
import { IconDashboard, IconShipping, IconProducts, IconShifts, IconReports, IconCustomers, IconStaff, IconSettings, IconCheck, IconWarning, IconClipboard, IconMoney } from './components/icons/FrogIcons';
import { loadFeatureFlags } from './lib/featureFlags';

const MORE_ITEMS = [
  { key: 'dashboard', label: 'Tổng Quan', Icon: IconDashboard },
  { key: 'shipping', label: 'Vận Chuyển', Icon: IconShipping },
  { key: 'products', label: 'Sản Phẩm', Icon: IconProducts },
  { key: 'shifts', label: 'Ca Làm Việc', Icon: IconShifts },
  { key: 'compensation', label: 'Tăng Ca & Lương', Icon: IconReports },
  { key: 'financeRequests', label: 'Chi & Tạm Ứng', Icon: IconMoney },
  { key: 'approvals', label: 'Yêu Cầu Duyệt', Icon: IconCheck },
  { key: 'incidents', label: 'Báo Cáo Sự Cố', Icon: IconWarning },
  { key: 'reports', label: 'Báo Cáo', Icon: IconReports },
  { key: 'kpi', label: 'KPI', Icon: IconClipboard },
  { key: 'kpiDashboard', label: 'KPI Đo Lường', Icon: IconClipboard },
  { key: 'staffTasks', label: 'Việc Của Tôi', Icon: IconClipboard },
  { key: 'inbox', label: 'Tin Nhắn', Icon: IconWarning },
  { key: 'crm', label: 'Khách Hàng', Icon: IconCustomers },
  { key: 'staff', label: 'Nhân Viên', Icon: IconStaff },
  { key: 'settings', label: 'Thiết lập', Icon: IconSettings },
  { key: 'visualGuides', label: 'Hướng Dẫn Bằng Ảnh', Icon: IconClipboard },
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
  createAdhocTask: (payload) => createAdhocTask(payload),
  // Đơn hoàn thành lúc mất mạng: nạp lại đơn mới nhất (kèm order_items) rồi
  // mới trừ kho — payload lúc xếp hàng chỉ mang orderId, không mang snapshot cũ.
  deductFinishedGoodsStockForOrder: async ({ orderId }) => {
    const order = await fetchOrderById(orderId);
    if (order) await deductFinishedGoodsStockForOrder(order);
  },
};

function OpsApp({ onSignOut }) {
  const { profile } = useAuth();
  const [tab, setTab] = useState('home');
  const [showMore, setShowMore] = useState(false);
  const [kdsStation, setKdsStation] = useState('all');
  const [warehouseBranch, setWarehouseBranch] = useState('all');
  const [badgeCounts, setBadgeCounts] = useState({ orders: 0, kds: 0, approvals: 0, incidents: 0 });
  const [featureFlags, setFeatureFlags] = useState({ orders_v2_read: false, delivery_v2: false, kpi_v2: false });

  useOrderNotifications();

  useEffect(() => {
    initAudioUnlock();
    initOfflineSync(OFFLINE_HANDLERS, () => window.dispatchEvent(new Event('sumi-queue-changed')));
    applyUiScale(getUiScale());
    requestNotificationPermission();

    // Setup real-time subscriptions for critical tables
    const unsubscribe = subscribeToMultipleTables(
      ['orders', 'kitchen_work_packages', 'delivery_runsheets', 'company_feed_posts', 'kpi_logs'],
      () => {
        // Dispatch event to trigger UI refresh
        window.dispatchEvent(new Event('sumi-data-changed'));
      }
    );

    // Global listener for feed announcements - ALWAYS LISTENING
    const unsubFeedBroadcast = subscribeToBroadcast(BroadcastEvents.FEED_POST_CREATED, (data) => {
      console.log('[App] Announcement broadcast received! Playing sound...');
      playAlertSound().catch(err => console.error('[App] Alert sound error:', err));
    });

    return () => {
      unsubscribe();
      unsubFeedBroadcast();
      cleanupAllSubscriptions();
    };
  }, []);

  useEffect(() => { loadFeatureFlags().then(setFeatureFlags).catch(() => {}); }, [profile?.id]);
  useEffect(() => { const go=e=>{setTab(e.detail?.tab||'orders'); if((e.detail?.tab||'orders')==='orders'&&e.detail?.entityId)setTimeout(()=>window.dispatchEvent(new CustomEvent('sumi-open-order',{detail:{entityId:e.detail.entityId}})),0);}; window.addEventListener('sumi-navigate',go); return()=>window.removeEventListener('sumi-navigate',go); }, []);
  useEffect(() => { document.querySelector('.sb-content')?.scrollTo({ top: 0, behavior: 'instant' }); }, [tab]);

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
    home: <MobileHomeScreen onNavigate={setTab} />, feed: <CompanyFeedScreen />,
    dashboard: <DashboardScreen />, orders: <OrdersV2Screen />, kds: <KdsScreen initialStation={kdsStation} />, warehouse: <WarehouseScreen branch={warehouseBranch} onBranchChange={setWarehouseBranch} />, cashbook: <CashbookScreen />,
    shipping: featureFlags.delivery_v2 ? <ShippingV2Screen /> : <ShippingScreen />, products: <ProductsScreen />, shifts: <ShiftsScreen />, compensation: <CompensationScreen />, financeRequests: <FinanceRequestsScreen />, approvals: <ApprovalRequestsScreen />, tasks: <TasksScreen />, incidents: <IncidentsScreen />, reports: <ReportsScreen />, kpi: featureFlags.kpi_v2 ? <KpiV2Screen /> : <KpiScreen />, inbox: <InboxV2Screen />, crm: <CustomersScreen />, staff: <StaffScreen />, settings: <SettingsScreen onSignOut={onSignOut} />, visualGuides: <VisualGuidesScreen />, staffTasks: <StaffTasksAssignedScreen />, kpiDashboard: <KpiDashboardScreen />, profile: <MobileProfileScreen onSignOut={onSignOut} onNavigate={setTab} />,
  };
  const isBottomKey = (k) => ['home', 'feed', 'orders', 'tasks', 'profile'].includes(k);
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
    return <PendingApprovalScreen profile={profile} onSignOut={onSignOut} reason="pending" />;
  }
  if (profile?.active === false) {
    return <PendingApprovalScreen profile={profile} onSignOut={onSignOut} reason="deactivated" />;
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
