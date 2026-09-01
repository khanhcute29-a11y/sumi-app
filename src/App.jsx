import React, { useEffect, useState } from 'react';
import { Sidebar } from './components/navigation/Sidebar';
import { BottomNav } from './components/navigation/BottomNav';
import { ChatLauncher } from './components/Messenger/ChatLauncher';
import { supabase } from './lib/supabaseClient';
import { initOfflineSync } from './lib/offlineQueue';
import {
  updateOrderStatus, updateOrder, addWarehouseStock, addShiftCheckin, addShiftCheckout, addLeaveRequest, createAdhocTask,
  countNewOrders, countKitchenActiveOrders, countPendingApprovals, countOpenIncidents,
  fetchOrderById, deductFinishedGoodsStockForOrder,
} from './lib/queries';
import { navBadgeVisibility, hasAnyRole } from './lib/roles';
import { initAudioUnlock } from './lib/sound';
import { useOrderNotifications } from './lib/useOrderNotifications';
import { requestNotificationPermission, playAlertSound, preloadAlertAudio } from './lib/alarmSound';
import { playKitchenReceiveSound, playKitchenCompleteSound, playShipperReceiveSound, playShipperCompleteSound, playTaskAssignedSound, playNotificationSound, playOnce } from './lib/sound';
import { setupAutoRefresh, cleanupAllSubscriptions, subscribeToMultipleTables, subscribeToBroadcast, BroadcastEvents } from './lib/realtimeSync';
import { ConnectivityBanner } from './components/ConnectivityBanner';
import ToastHost from './components/ToastHost';
import AudioUnlockBanner from './components/AudioUnlockBanner';
import UpdateRequiredModal from './components/UpdateRequiredModal';
import { notify, showToast, NOTIFY_KINDS } from './lib/toast';
import { autoEnablePush } from './lib/push';
import { initDeepLinkFromPush } from './lib/deepLink';
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
import SchoolRevenueScreen from './screens/SchoolRevenueScreen';
import CustomerDebtScreen from './screens/CustomerDebtScreen';
import InboxV2Screen from './screens/InboxV2Screen';
import KpiV2Screen from './screens/KpiV2Screen';
import StaffTasksAssignedScreen from './screens/StaffTasksAssignedScreen';
import KpiDashboardScreen from './screens/KpiDashboardScreen';
import MobileHomeScreen from './screens/MobileHomeScreen';
import MobileProfileScreen from './screens/MobileProfileScreen';
import CompensationScreen from './screens/CompensationScreen';
import FinanceRequestsScreen from './screens/FinanceRequestsScreen';
import { AccountantOverviewV1Inner } from './components/mockups/AccountantDashboard/AccountantOverviewV1';
import CompanyFeedScreen from './screens/CompanyFeedScreen';
import VisualGuidesScreen from './screens/VisualGuidesScreen';
import { applyUiScale, getUiScale } from './lib/uiScale';
import { NavBadge } from './components/navigation/NavBadge';
import { IconDashboard, IconShipping, IconProducts, IconShifts, IconReports, IconCustomers, IconStaff, IconSettings, IconCheck, IconWarning, IconClipboard, IconMoney, IconReceipt } from './components/icons/FrogIcons';

// Vai trò được xử lý thu-chi thật (khớp is_finance_operator() phía database) —
// chỉ nhóm này mới thấy mục "Kế Toán Tổng Quan" trong menu.
const FINANCE_ROLES = ['owner', 'admin', 'accountant', 'cashier'];
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
  { key: 'schoolRevenue', label: 'Doanh Thu Trường Học', Icon: IconMoney },
  { key: 'customerDebt', label: 'Công Nợ Khách Hàng', Icon: IconMoney },
  { key: 'staffTasks', label: 'Việc Của Tôi', Icon: IconClipboard },
  { key: 'inbox', label: 'Tin Nhắn', Icon: IconWarning },
  { key: 'crm', label: 'Khách Hàng', Icon: IconCustomers },
  { key: 'staff', label: 'Nhân Viên', Icon: IconStaff },
  { key: 'settings', label: 'Thiết lập', Icon: IconSettings },
  { key: 'visualGuides', label: 'Hướng Dẫn Bằng Ảnh', Icon: IconClipboard },
];

function MoreSheet({ onClose, onSelect, badges = {}, items = MORE_ITEMS }) {
  return (
    <div className="sb-more-sheet" style={{ position: 'fixed', inset: 0, background: 'var(--surface-overlay)', zIndex: 60, display: 'flex', alignItems: 'flex-end' }} onClick={onClose}>
      <div style={{ background: 'var(--surface-card)', width: '100%', borderRadius: '20px 20px 0 0', padding: '20px', display: 'flex', flexDirection: 'column', gap: 4 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ font: 'var(--text-title)', color: 'var(--text-primary)', marginBottom: 8 }}>Thêm</div>
        {items.map((it) => (
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
    preloadAlertAudio().catch(err => console.warn('[App] Alert audio preload warning:', err));
    initOfflineSync(OFFLINE_HANDLERS, () => window.dispatchEvent(new Event('sumi-queue-changed')));
    applyUiScale(getUiScale());
    requestNotificationPermission();
    initDeepLinkFromPush();


    // Setup real-time subscriptions for critical tables
    const unsubscribe = subscribeToMultipleTables(
      ['orders', 'kitchen_work_packages', 'delivery_runsheets', 'company_feed_posts', 'kpi_logs'],
      () => {
        // Dispatch event to trigger UI refresh
        window.dispatchEvent(new Event('sumi-data-changed'));
      }
    );

    // Global listener for feed announcements
    // Đường phụ: người ĐĂNG tin không được ghi vào bảng notifications (trigger
    // bỏ qua chính tác giả), nên vẫn cần nhánh này để họ nghe phản hồi.
    // playOnce theo tiêu đề -> nếu đường chính (bảng notifications) đã báo rồi
    // thì ở đây bỏ qua, không kêu chồng.
    const unsubFeedBroadcast = subscribeToBroadcast(BroadcastEvents.FEED_POST_CREATED, (data) => {
      const tieuDe = data?.title || data?.content || '';
      playOnce('feed:' + tieuDe, () => {
        playAlertSound().catch(err => console.error('[App] Alert sound error:', err));
        notify('company_feed', tieuDe || undefined);
      });
    });

    // 🔴 CRITICAL FIX: Global listener for all sound notifications (tasks, orders, deliveries)
    const unsubSoundNotifications = subscribeToBroadcast(BroadcastEvents.SOUND_NOTIFICATION, (data) => {
      console.log('[App] Sound notification received:', data?.soundType);

      try {
        const soundType = data?.soundType;
        // playOnce: nếu mốc này vừa được báo qua đường khác trong 3 giây thì bỏ qua
        const SOUNDS = {
          kitchen_receive: playKitchenReceiveSound,
          kitchen_complete: playKitchenCompleteSound,
          shipper_receive: playShipperReceiveSound,
          shipper_complete: playShipperCompleteSound,
          task_assigned: playShipperReceiveSound,
        };
        const fn = SOUNDS[soundType];
        if (!fn) {
          console.warn('[App] Không rõ loại chuông:', soundType);
          return;
        }
        // Chuông giữ NGUYÊN như cũ. Tin nhắn được gọi ngay cạnh, trong cùng
        // playOnce để tin và chuông luôn xuất hiện cùng nhau (và cùng bị chặn
        // khi trùng lặp) — không bao giờ lệch nhau.
        playOnce(soundType, () => {
          fn();
          if (soundType !== 'task_assigned') notify(soundType, data?.orderCode, data?.orderId);
        });
      } catch (err) {
        console.error('[App] Error playing sound:', err);
      }
    });

    // ---------------------------------------------------------------------
    // ĐƯỜNG CHÍNH cho Tin Công Ty và Giao Việc: nghe thẳng bảng notifications.
    //
    // Vì sao không dùng broadcast giữa các trình duyệt: broadcast chỉ tới
    // được máy nào đang mở app ĐÚNG LÚC gửi, và phụ thuộc trình duyệt người
    // gửi bắn thành công — dễ rơi, đó là lý do Tin Công Ty từng bị mất.
    // Bảng notifications thì được ghi bởi trigger phía máy chủ cho TỪNG người,
    // kèm sẵn đường dẫn chính xác, và quy tắc bảo mật lo việc ai thấy tin nào.
    //
    // KHÔNG đụng tới 5 mốc đơn hàng — chúng đã có đường riêng chạy tốt
    // (useOrderNotifications) nên ở đây bỏ qua để không hiện tin hai lần.
    const BO_QUA = new Set([
      'new_order', 'order_in_production', 'order_ready',
      'delivery_assigned', 'delivery_completed', 'work_package_assigned',
    ]);
    const chNotify = supabase
      .channel('notifications-toast-global')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications' }, (p) => {
        try {
          const n = p.new;
          if (!n || BO_QUA.has(n.notification_type)) return;

          if (n.notification_type === 'company_announcement') {
            // playOnce theo tiêu đề: khớp với nhánh broadcast ở trên nên dù
            // cả hai đường cùng báo thì chuông và tin chỉ hiện một lần.
            playOnce('feed:' + (n.title || ''), () => {
              playAlertSound().catch(err => console.error('[App] Alert sound error:', err));
              notify('company_feed', n.title, n.entity_id);
            });
            return;
          }

          if (n.notification_type === 'task_assigned' || n.notification_type === 'task_reminder') {
            playOnce('task:' + n.id, () => {
              playTaskAssignedSound();
              // Đích đến lấy theo LOẠI ĐỐI TƯỢNG, không cứng theo loại tin:
              //  - việc giao trong đơn  -> entity_type 'order' -> mở chi tiết đơn
              //    (đầu việc loại order_work chỉ hiện trong hộp chi tiết đơn,
              //     tab "Việc được giao" lọc category='assigned' nên không có nó)
              //  - việc giao thường     -> entity_type 'task'  -> mở trang Công việc
              const laViecTrongDon = n.entity_type === 'order';
              showToast({
                ...NOTIFY_KINDS[n.notification_type],
                message: n.body || n.title,
                entityId: n.entity_id,
                ...(laViecTrongDon ? { tab: 'orders' } : {}),
              });
            });
            return;
          }

          // Báo cáo tiến độ / duyệt việc qua lại (giao việc <-> nhận việc),
          // và kết quả duyệt/từ chối khoản chi + tạm ứng — TRƯỚC ĐÂY 2 loại
          // tài chính này chỉ kêu khi đang mở đúng màn Hộp thư
          // (InboxV2Screen), giờ kêu TOÀN CỤC như các loại tin khác ở trên.
          if (['task_progress', 'expense_claim', 'salary_advance', 'chat_mention'].includes(n.notification_type)) {
            playOnce(n.notification_type + ':' + n.id, () => {
              playNotificationSound(n.sound_key);
              showToast({
                ...NOTIFY_KINDS[n.notification_type],
                message: n.body || n.title,
                entityId: n.entity_id,
              });
            });
          }
        } catch (err) {
          console.error('[App] Lỗi xử lý thông báo:', err);
        }
      })
      .subscribe();

    return () => {
      unsubscribe();
      unsubFeedBroadcast();
      unsubSoundNotifications();
      supabase.removeChannel(chNotify);
      cleanupAllSubscriptions();
    };
  }, []);

  // Đăng ký nhận thông báo đẩy — thứ giúp nhân viên vẫn nghe chuông khi TẮT
  // MÀN HÌNH hoặc app bị đóng. Đặt ở effect riêng phụ thuộc profile?.id vì lúc
  // app vừa mở có thể chưa biết ai đang đăng nhập.
  useEffect(() => {
    if (!profile?.id) return;
    autoEnablePush(profile.id).then((kq) => console.log('[Push] Trạng thái đăng ký:', kq));
  }, [profile?.id]);

  useEffect(() => { loadFeatureFlags().then(setFeatureFlags).catch(() => {}); }, [profile?.id]);
  useEffect(() => {
    const go = (e) => {
      const nextTab = e.detail?.tab || 'orders';
      // Tin nhắn Messenger nội bộ mở bằng cửa sổ nổi (ChatLauncher), không
      // phải một trang trong sidebar — không đổi `tab` kẻo màn hình chính
      // trống trơn vì 'messenger' không nằm trong danh sách SCREENS.
      if (nextTab === 'messenger') {
        window.dispatchEvent(new CustomEvent('sumi-open-messenger', { detail: { roomId: e.detail?.entityId } }));
        return;
      }
      setTab(nextTab);
      if (nextTab === 'orders' && e.detail?.entityId) {
        setTimeout(() => window.dispatchEvent(new CustomEvent('sumi-open-order', { detail: { entityId: e.detail.entityId } })), 0);
      }
      // Bấm vào tin nhắn thông báo còn kèm tab lọc (vd: 'production' = Bếp đang làm)
      // để mở thẳng đúng khu vực. Lời gọi cũ không có filter nên không đổi gì.
      if (nextTab === 'orders' && e.detail?.filter) {
        setTimeout(() => window.dispatchEvent(new CustomEvent('sumi-order-filter', { detail: { filter: e.detail.filter } })), 0);
      }
      // Mở thẳng đúng bài đăng / đầu việc, thay vì chỉ nhảy tới trang chung.
      if (nextTab === 'feed' && e.detail?.entityId) {
        setTimeout(() => window.dispatchEvent(new CustomEvent('sumi-open-feed', { detail: { entityId: e.detail.entityId } })), 0);
      }
      if ((nextTab === 'tasks' || nextTab === 'staffTasks') && e.detail?.entityId) {
        setTimeout(() => window.dispatchEvent(new CustomEvent('sumi-open-task', { detail: { entityId: e.detail.entityId } })), 0);
      }
      // Mở thẳng đúng tab con bên trong "Ca Làm Việc" (vd: 'schedule' = Lịch tuần)
      // thay vì luôn rơi về mặc định "Chấm công realtime".
      if (nextTab === 'shifts' && e.detail?.view) {
        setTimeout(() => window.dispatchEvent(new CustomEvent('sumi-open-shift-view', { detail: { view: e.detail.view } })), 0);
      }
    };
    window.addEventListener('sumi-navigate', go);
    return () => window.removeEventListener('sumi-navigate', go);
  }, []);
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
    shipping: featureFlags.delivery_v2 ? <ShippingV2Screen /> : <ShippingScreen />, products: <ProductsScreen />, shifts: <ShiftsScreen />, compensation: <CompensationScreen />, financeRequests: <FinanceRequestsScreen />, accountantOverview: <AccountantOverviewV1Inner />, approvals: <ApprovalRequestsScreen />, tasks: <TasksScreen />, incidents: <IncidentsScreen />, reports: <ReportsScreen />, kpi: featureFlags.kpi_v2 ? <KpiV2Screen /> : <KpiScreen />, inbox: <InboxV2Screen />, crm: <CustomersScreen />, staff: <StaffScreen />, settings: <SettingsScreen onSignOut={onSignOut} />, visualGuides: <VisualGuidesScreen />, staffTasks: <StaffTasksAssignedScreen />, kpiDashboard: <KpiDashboardScreen />, schoolRevenue: <SchoolRevenueScreen />, customerDebt: <CustomerDebtScreen />, profile: <MobileProfileScreen onSignOut={onSignOut} onNavigate={setTab} />,
  };
  const isBottomKey = (k) => ['home', 'feed', 'orders', 'tasks', 'profile'].includes(k);
  // Chỉ Kế toán/Thu ngân/Quản lý/Giám đốc thấy mục "Kế Toán Tổng Quan" — khớp
  // is_finance_operator() chặn ở RPC phía database.
  const isFinanceRole = hasAnyRole(profile, FINANCE_ROLES);
  const moreItems = isFinanceRole
    ? [...MORE_ITEMS, { key: 'accountantOverview', label: 'Kế Toán Tổng Quan', Icon: IconReceipt }]
    : MORE_ITEMS;
  return (
    <div className="sb-shell">
      <ToastHost />
      <AudioUnlockBanner />
      <UpdateRequiredModal />
      <ConnectivityBanner />
      <div className="sb-body">
        <div className="sb-sidebar"><Sidebar active={tab} activeStation={kdsStation} onSelectStation={setKdsStation} activeBranch={warehouseBranch} onSelectBranch={setWarehouseBranch} onSelect={setTab} badges={badgeCounts} extraItems={isFinanceRole ? [{ key: 'accountantOverview', label: 'Kế Toán Tổng Quan', Icon: IconReceipt }] : []} /></div>
        <div className="sb-content">
          {screens[tab]}
        </div>
      </div>
      <div className="sb-bottomnav">
        <BottomNav active={isBottomKey(tab) ? tab : ''} onSelect={setTab} onMore={() => setShowMore(true)} badges={badgeCounts}
          style={{ position: 'static', left: 'auto', right: 'auto', bottom: 'auto', width: '100%', flexShrink: 0 }} />
      </div>
      {showMore && <MoreSheet onClose={() => setShowMore(false)} onSelect={setTab} badges={badgeCounts} items={moreItems} />}
      <ChatLauncher profile={profile} />
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
