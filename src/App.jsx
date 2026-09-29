import React, { Suspense, useEffect, useState } from 'react';
import { Sidebar } from './components/navigation/Sidebar';
import { BottomNav } from './components/navigation/BottomNav';
import ChatScreen from './components/Messenger/ChatScreen';
import { fetchUnreadCounts } from './lib/chat';
import { supabase } from './lib/supabaseClient';
import { initOfflineSync } from './lib/offlineQueue';
import {
  updateOrderStatus, updateOrder, addWarehouseStock, addShiftCheckin, addShiftCheckout, addLeaveRequest, createAdhocTask,
  countNewOrders, countKitchenActiveOrders, countPendingApprovals, countOpenIncidents,
  fetchOrderById, deductFinishedGoodsStockForOrder,
} from './lib/queries';
import { navBadgeVisibility, hasAnyRole, FINANCE_ROLES } from './lib/roles';
import { initAudioUnlock } from './lib/sound';
import { useOrderNotifications } from './lib/useOrderNotifications';
import { requestNotificationPermission, playAlertSound, preloadAlertAudio, playViecVoiceSound } from './lib/alarmSound';
import { playKitchenReceiveSound, playKitchenCompleteSound, playShipperReceiveSound, playShipperCompleteSound, playNotificationSound, playOnce } from './lib/sound';
import { setupAutoRefresh, cleanupAllSubscriptions, subscribeToBroadcast, BroadcastEvents } from './lib/realtimeSync';
import { ConnectivityBanner } from './components/ConnectivityBanner';
import ToastHost from './components/ToastHost';
import AudioUnlockBanner from './components/AudioUnlockBanner';
import UpdateRequiredModal from './components/UpdateRequiredModal';
import { notify, showToast, NOTIFY_KINDS } from './lib/toast';
import { autoEnablePush } from './lib/push';
import { startLiveTracking } from './lib/liveTracking';
import { initDeepLinkFromPush } from './lib/deepLink';
import { AuthProvider, useAuth } from './lib/AuthContext';
import LoginScreen from './screens/LoginScreen';
import ResetPasswordScreen from './screens/ResetPasswordScreen';
import PendingApprovalScreen from './screens/PendingApprovalScreen';
import MobileHomeScreen from './screens/MobileHomeScreen';
import MobileProfileScreen from './screens/MobileProfileScreen';
import { applyUiScale, getUiScale } from './lib/uiScale';
import { napManHinh } from './lib/napManHinh';
// Các màn hình nạp theo nhu cầu (xem src/lib/napManHinh.jsx): "Hôm nay", "Của
// tôi", Chat giữ import thẳng như cũ để hiện ngay khi mở app; phần còn lại
// OpsApp nạp ngầm ngay sau khi màn đầu tiên đã hiện.
const OrdersV2Screen = napManHinh(() => import('./screens/OrdersV2Screen'));
const KdsScreen = napManHinh(() => import('./screens/KdsScreen'));
const WarehouseScreen = napManHinh(() => import('./screens/WarehouseScreen'));
const CashbookScreen = napManHinh(() => import('./screens/CashbookScreen'));
const ShippingScreen = napManHinh(() => import('./screens/ShippingScreen'));
const ShippingV2Screen = napManHinh(() => import('./screens/ShippingV2Screen'));
const ReportsScreen = napManHinh(() => import('./screens/ReportsScreen'));
const CustomersScreen = napManHinh(() => import('./screens/CustomersScreen'));
const SettingsScreen = napManHinh(() => import('./screens/SettingsScreen'));
const ProductsScreen = napManHinh(() => import('./screens/ProductsScreen'));
const ShiftsScreen = napManHinh(() => import('./screens/ShiftsScreen'));
const DashboardScreen = napManHinh(() => import('./screens/DashboardScreen'));
const StaffScreen = napManHinh(() => import('./screens/StaffScreen'));
const StaffDeactivatedScreen = napManHinh(() => import('./screens/StaffDeactivatedScreen'));
const ApprovalRequestsScreen = napManHinh(() => import('./screens/ApprovalRequestsScreen'));
const TasksScreen = napManHinh(() => import('./screens/TasksScreen'));
const IncidentsScreen = napManHinh(() => import('./screens/IncidentsScreen'));
const KpiScreen = napManHinh(() => import('./screens/KpiScreen'));
const SchoolRevenueScreen = napManHinh(() => import('./screens/SchoolRevenueScreen'));
const CustomerDebtScreen = napManHinh(() => import('./screens/CustomerDebtScreen'));
const InboxV2Screen = napManHinh(() => import('./screens/InboxV2Screen'));
const KpiV2Screen = napManHinh(() => import('./screens/KpiV2Screen'));
const StaffTasksAssignedScreen = napManHinh(() => import('./screens/StaffTasksAssignedScreen'));
const KpiDashboardScreen = napManHinh(() => import('./screens/KpiDashboardScreen'));
const KpiTongQuanScreen = napManHinh(() => import('./screens/KpiTongQuanScreen'));
const CompensationScreen = napManHinh(() => import('./screens/CompensationScreen'));
const FinanceRequestsScreen = napManHinh(() => import('./screens/FinanceRequestsScreen'));
const CompanyFeedScreen = napManHinh(() => import('./screens/CompanyFeedScreen'));
const VisualGuidesScreen = napManHinh(() => import('./screens/VisualGuidesScreen'));
const AccountantOverviewV1Inner = napManHinh(() => import('./components/mockups/AccountantDashboard/AccountantOverviewV1').then((m) => ({ default: m.AccountantOverviewV1Inner })));
// Trợ lý Gen chỉ nạp khi bấm mở lần đầu (GenCopilotModal tự return null khi
// đóng nên không chạy gì ngầm — hoãn nạp không đổi hành vi).
const GenCopilotModal = napManHinh(() => import('./components/ai/GenCopilotModal').then((m) => ({ default: m.GenCopilotModal })));
const MAN_HINH_THEO_TAB = {
  orders: OrdersV2Screen, feed: CompanyFeedScreen, tasks: TasksScreen, staffTasks: StaffTasksAssignedScreen,
  financeRequests: FinanceRequestsScreen, shipping: ShippingScreen, shifts: ShiftsScreen,
};
const MAN_HINH_NAP_SAU = [OrdersV2Screen, KdsScreen, WarehouseScreen, CashbookScreen, ShippingScreen, ShippingV2Screen, ReportsScreen, CustomersScreen, SettingsScreen, ProductsScreen, ShiftsScreen, DashboardScreen, StaffScreen, StaffDeactivatedScreen, ApprovalRequestsScreen, TasksScreen, IncidentsScreen, KpiScreen, SchoolRevenueScreen, CustomerDebtScreen, InboxV2Screen, KpiV2Screen, StaffTasksAssignedScreen, KpiDashboardScreen, KpiTongQuanScreen, CompensationScreen, FinanceRequestsScreen, CompanyFeedScreen, VisualGuidesScreen, AccountantOverviewV1Inner];
import { NavBadge } from './components/navigation/NavBadge';
import { IconDashboard, IconShipping, IconProducts, IconShifts, IconReports, IconCustomers, IconStaff, IconSettings, IconCheck, IconWarning, IconClipboard, IconMoney, IconReceipt, IconBan } from './components/icons/FrogIcons';

// FINANCE_ROLES (khớp is_finance_operator() phía database) — dùng chung từ
// ./lib/roles để App.jsx và Trợ lý Gen chốt phân quyền tài chính đồng nhất.
import { loadFeatureFlags } from './lib/featureFlags';
import { GenFloatingButton } from './components/ai/GenFloatingButton';
import { GenVoiceTaskAlert } from './components/ai/GenVoiceTaskAlert';
import { ErrorBoundary } from './components/ErrorBoundary';

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
  { key: 'kpiTongQuan', label: 'Tổng Quan KPI', Icon: IconClipboard },
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
  const [badgeCounts, setBadgeCounts] = useState({ orders: 0, kds: 0, approvals: 0, incidents: 0, chat: 0 });
  const [featureFlags, setFeatureFlags] = useState({ orders_v2_read: false, delivery_v2: false, kpi_v2: false });
  const [showGen, setShowGen] = useState(false);
  const [voiceTask, setVoiceTask] = useState(null);

  useOrderNotifications();

  // Màn đầu tiên đã hiện -> nạp ngầm mọi màn còn lại (song song, không chặn
  // gì), để lúc bấm sang tab khác / bấm thông báo thì màn đích đã sẵn, hiện
  // tức thì y như trước khi tách file.
  useEffect(() => {
    const t = setTimeout(() => MAN_HINH_NAP_SAU.forEach((m) => m.tai().catch(() => {})), 300);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    initAudioUnlock();
    preloadAlertAudio().catch(err => console.warn('[App] Alert audio preload warning:', err));
    initOfflineSync(OFFLINE_HANDLERS, () => window.dispatchEvent(new Event('sumi-queue-changed')));
    applyUiScale(getUiScale());
    requestNotificationPermission();
    initDeepLinkFromPush();


    // Kênh postgres_changes cho danh sách đơn đã chuyển vào OrdersV2Screen
    // (chỉ mở khi đang xem Đơn hàng) — xem ghi chú ở đó.

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
              playViecVoiceSound();
              // Đích đến lấy theo LOẠI ĐỐI TƯỢNG, không cứng theo loại tin:
              //  - việc giao trong đơn  -> entity_type 'order' -> mở chi tiết đơn
              //    (đầu việc loại order_work chỉ hiện trong hộp chi tiết đơn,
              //     tab "Việc được giao" lọc category='assigned' nên không có nó)
              //  - việc giao thường     -> entity_type 'task'  -> mở trang Công việc
              const laViecTrongDon = n.entity_type === 'order';
              setVoiceTask({
                id: n.entity_id || n.id,
                title: n.body || n.title,
                assignee_name: profile?.name
              });
              showToast({
                ...NOTIFY_KINDS[n.notification_type],
                message: n.body || n.title,
                entityId: n.entity_id,
                ...(laViecTrongDon ? { tab: 'orders' } : {}),
              });
            });
            return;
          }

          // Tin nhắn tự do từ Sếp/Quản lý gửi qua Trợ lý Gen -> bật voice-alert
          // (Gen đọc to nội dung ngay trên màn hình nhân viên, không phải đi tìm).
          if (n.notification_type === 'gen_message') {
            playOnce('genmsg:' + n.id, () => {
              try { playViecVoiceSound(); } catch (_) {}
              setVoiceTask({
                id: n.id,
                title: n.body || n.title,
                assignee_name: profile?.name,
                kind: 'message',
                from_title: n.title || 'Sếp nhắn',
              });
              showToast({
                ...(NOTIFY_KINDS[n.notification_type] || {}),
                message: n.body || n.title,
                entityId: n.entity_id,
              });
            });
            return;
          }

          // Báo cáo tiến độ / duyệt việc qua lại (giao việc <-> nhận việc),
          // và kết quả duyệt/từ chối khoản chi + tạm ứng — TRƯỚC ĐÂY 2 loại
          // tài chính này chỉ kêu khi đang mở đúng màn Hộp thư
          // (InboxV2Screen), giờ kêu TOÀN CỤC như các loại tin khác ở trên.
          if (['task_progress', 'expense_claim', 'salary_advance', 'chat_mention', 'task_deadline_alert', 'star_reward', 'star_penalty'].includes(n.notification_type)) {
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

  // Giám sát vị trí thời gian thực trong ca — ping mỗi ~5 phút, tự bỏ qua nếu
  // không thuộc bộ phận theo ca cố định hoặc không đang trong ca (xem
  // src/lib/liveTracking.js). Dừng lại khi đổi tài khoản/đăng xuất.
  useEffect(() => {
    if (!profile?.id) return;
    return startLiveTracking(profile);
  }, [profile?.id]);

  useEffect(() => { loadFeatureFlags().then(setFeatureFlags).catch(() => {}); }, [profile?.id]);
  useEffect(() => {
    const go = (e) => {
      // Tin nhắn Messenger nội bộ trỏ về tab Chat thật trong nav (trước đây
      // là cửa sổ nổi ChatLauncher riêng — đã bỏ, gộp hẳn vào ChatScreen).
      const nextTab = e.detail?.tab === 'messenger' ? 'chat' : (e.detail?.tab || 'orders');
      // Bấm thông báo ngay lúc vừa mở app: màn đích có thể chưa nạp xong ->
      // đợi nạp xong rồi mới đổi tab + bắn các sự kiện mở đúng đơn/việc bên
      // dưới (các mốc 80/250/500ms tính từ lúc màn đích sẵn sàng như trước).
      const man = MAN_HINH_THEO_TAB[nextTab];
      if (man && !man.daNap()) {
        man.tai().then(() => go(e), () => {});
        return;
      }
      setTab(nextTab);
      // 80ms (không phải 0) — khi bấm từ 1 tab KHÁC (vd Chat, Hôm nay) vào 1
      // thông báo của tab 'orders'/'tasks'..., setTab() vừa yêu cầu React
      // MOUNT MỚI màn đích; useEffect đăng ký lắng nghe 'sumi-open-order'/
      // 'sumi-open-task'... bên trong màn đó cần vài nhịp để chạy xong.
      // setTimeout(fn, 0) không đảm bảo chạy SAU khi React mount+effect kịp
      // xong (rơi vào tình huống thắng-thua theo thời điểm) — bấm thông báo
      // vẫn mở đúng TAB nhưng không mở được chi tiết bên trong, y hệt lỗi đã
      // gặp và né bằng delay 300-600ms ở deepLink.js (initDeepLinkFromPush) —
      // ở đây áp lại cùng cách né, ngắn hơn vì không cần chờ cả app khởi động.
      const DELAY = 80;
      if (nextTab === 'chat' && e.detail?.entityId) {
        setTimeout(() => window.dispatchEvent(new CustomEvent('sumi-open-chat-room', { detail: { roomId: e.detail.entityId } })), DELAY);
      }
      if (nextTab === 'orders' && e.detail?.entityId) {
        const entId = e.detail.entityId;
        // Gửi lặp lại theo nhịp 80ms, 250ms, 500ms để đảm bảo OrdersV2Screen mount kịp và bắt được sự kiện 100%
        [80, 250, 500].forEach((ms) => {
          setTimeout(() => window.dispatchEvent(new CustomEvent('sumi-open-order', { detail: { entityId: entId } })), ms);
        });
      }
      // Bấm vào tin nhắn thông báo còn kèm tab lọc (vd: 'production' = Bếp đang làm)
      // để mở thẳng đúng khu vực. Lời gọi cũ không có filter nên không đổi gì.
      if (nextTab === 'orders' && e.detail?.filter) {
        setTimeout(() => window.dispatchEvent(new CustomEvent('sumi-order-filter', { detail: { filter: e.detail.filter } })), DELAY);
      }
      // Mở thẳng đúng bài đăng / đầu việc, thay vì chỉ nhảy tới trang chung.
      if (nextTab === 'feed' && e.detail?.entityId) {
        setTimeout(() => window.dispatchEvent(new CustomEvent('sumi-open-feed', { detail: { entityId: e.detail.entityId } })), DELAY);
      }
      if ((nextTab === 'tasks' || nextTab === 'staffTasks') && e.detail?.entityId) {
        const entId = e.detail.entityId;
        [80, 250, 500].forEach((ms) => {
          setTimeout(() => window.dispatchEvent(new CustomEvent('sumi-open-task', { detail: { entityId: entId } })), ms);
        });
      }
      // Mở thẳng đúng tab con bên trong "Ca Làm Việc" (vd: 'schedule' = Lịch tuần)
      // thay vì luôn rơi về mặc định "Chấm công realtime".
      if (nextTab === 'shifts' && e.detail?.view) {
        setTimeout(() => window.dispatchEvent(new CustomEvent('sumi-open-shift-view', { detail: { view: e.detail.view } })), DELAY);
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
        profile?.id ? fetchUnreadCounts() : {},
      ]).then(([orders, kds, approvals, incidents, chatUnread]) => setBadgeCounts({
        orders, kds, approvals, incidents,
        chat: Object.values(chatUnread || {}).reduce((s, n) => s + n, 0),
      })).catch(() => {});
    };
    // LỖI THẬT đã vá: trước đây MỌI tin nhắn chat_messages INSERT (của BẤT
    // KỲ AI, phòng nào) đều kích `loadBadges` — chạy lại CẢ 5 QUERY (orders,
    // kds, approvals, incidents, chat) trên MÁY MỌI NGƯỜI ĐANG MỞ APP, dù 4
    // trong 5 query đó chẳng liên quan gì tới chat. 1 công ty chat nhiều là
    // hàng nghìn query thừa/ngày. Giờ tin nhắn chỉ tải lại ĐÚNG phần badge
    // chat (1 RPC, không đụng 4 query kia) + debounce 800ms — gõ/gửi dồn
    // dập nhiều tin liền chỉ tính 1 lần khi ngừng, không tính từng tin.
    const loadChatBadgeOnly = () => {
      if (!profile?.id) return;
      fetchUnreadCounts()
        .then((m) => setBadgeCounts((prev) => ({
          ...prev,
          chat: Object.values(m || {}).reduce((s, n) => s + n, 0),
        })))
        .catch(() => {});
    };
    let chatBadgeTimer;
    const debouncedChatBadge = () => {
      clearTimeout(chatBadgeTimer);
      chatBadgeTimer = setTimeout(loadChatBadgeOnly, 800);
    };
    // Cùng lý do với chat ở trên: 1 lần đổi trạng thái đơn thường kéo theo vài
    // dòng orders thay đổi liền nhau -> trước đây chạy lại CẢ 5 QUERY đếm cho
    // từng dòng trên máy mọi người. Gom lại, chỉ tính 1 lần khi ngừng 0,8s.
    let badgeTimer;
    const debouncedBadges = () => {
      clearTimeout(badgeTimer);
      badgeTimer = setTimeout(loadBadges, 800);
    };
    loadBadges();
    window.addEventListener('sumi-badges-changed', loadBadges);
    const channel = supabase
      .channel('nav-badges-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, debouncedBadges)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'approval_requests' }, debouncedBadges)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'incident_reports' }, debouncedBadges)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages' }, debouncedChatBadge)
      .subscribe();
    return () => {
      clearTimeout(chatBadgeTimer);
      clearTimeout(badgeTimer);
      window.removeEventListener('sumi-badges-changed', loadBadges);
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id, profile?.role, (profile?.extra_roles || []).join(',')]);

  const screens = {
    home: <MobileHomeScreen onNavigate={setTab} />, feed: <CompanyFeedScreen />, chat: <ChatScreen profile={profile} />,
    dashboard: <DashboardScreen />, orders: <OrdersV2Screen />, kds: <KdsScreen initialStation={kdsStation} />, warehouse: <WarehouseScreen branch={warehouseBranch} onBranchChange={setWarehouseBranch} />, cashbook: <CashbookScreen />,
    shipping: featureFlags.delivery_v2 ? <ShippingV2Screen /> : <ShippingScreen />, products: <ProductsScreen />, shifts: <ShiftsScreen />, compensation: <CompensationScreen />, financeRequests: <FinanceRequestsScreen />, accountantOverview: <AccountantOverviewV1Inner />, approvals: <ApprovalRequestsScreen />, tasks: <TasksScreen />, incidents: <IncidentsScreen />, reports: <ReportsScreen />, kpi: featureFlags.kpi_v2 ? <KpiV2Screen /> : <KpiScreen />, inbox: <InboxV2Screen />, crm: <CustomersScreen />, staff: <StaffScreen />, staffDeactivated: <StaffDeactivatedScreen />, settings: <SettingsScreen onSignOut={onSignOut} />, visualGuides: <VisualGuidesScreen />, staffTasks: <StaffTasksAssignedScreen />, kpiDashboard: <KpiDashboardScreen />, kpiTongQuan: <KpiTongQuanScreen />, schoolRevenue: <SchoolRevenueScreen />, customerDebt: <CustomerDebtScreen />, profile: <MobileProfileScreen onSignOut={onSignOut} onNavigate={setTab} />,
  };
  const isBottomKey = (k) => ['home', 'feed', 'orders', 'tasks', 'chat', 'profile'].includes(k);
  // Chỉ Kế toán/Thu ngân/Quản lý/Giám đốc thấy mục "Kế Toán Tổng Quan" — khớp
  // is_finance_operator() chặn ở RPC phía database.
  const isFinanceRole = hasAnyRole(profile, FINANCE_ROLES);
  // Mục "Nhân sự đã nghỉ việc" — tách riêng khỏi màn Nhân Viên chính (yêu cầu
  // Giám đốc 04/09/2026), chỉ owner/admin thấy vì cùng quyền Khoá/Mở lại tài
  // khoản (canDeactivate) ở StaffScreen.jsx.
  const canManageStaff = hasAnyRole(profile, ['owner', 'admin']);
  const desktopExtraItems = [
    ...(isFinanceRole ? [{ key: 'accountantOverview', label: 'Kế Toán Tổng Quan', Icon: IconReceipt }] : []),
    ...(canManageStaff ? [{ key: 'staffDeactivated', label: 'Nhân Sự Đã Nghỉ', Icon: IconBan }] : []),
  ];
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
        <div className="sb-sidebar"><Sidebar active={tab} activeStation={kdsStation} onSelectStation={setKdsStation} activeBranch={warehouseBranch} onSelectBranch={setWarehouseBranch} onSelect={setTab} badges={badgeCounts} extraItems={desktopExtraItems} /></div>
        <div className="sb-content">
          <Suspense fallback={<div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)', font: 'var(--text-body)' }}>Đang tải...</div>}>
            {screens[tab]}
          </Suspense>
        </div>
      </div>
      <div className="sb-bottomnav">
        <BottomNav active={isBottomKey(tab) ? tab : ''} onSelect={setTab} onMore={() => setShowMore(true)} badges={badgeCounts}
          style={{ position: 'static', left: 'auto', right: 'auto', bottom: 'auto', width: '100%', flexShrink: 0 }} />
      </div>
      {showMore && <MoreSheet onClose={() => setShowMore(false)} onSelect={setTab} badges={badgeCounts} items={moreItems} />}
      {/* Trợ lý AI Gemini 'Gen' — CÁCH LY: bọc ErrorBoundary fallback=null để nếu
          Gen lỗi lúc render thì tự biến mất, KHÔNG bao giờ làm sập app chính
          (order/kho/thanh toán vẫn chạy). Lỗi bất đồng bộ đã được try/catch
          trong chính GenCopilotModal/geminiCopilot. */}
      <ErrorBoundary fallback={null}>
        <GenFloatingButton onClick={() => setShowGen(true)} />
        {showGen && <Suspense fallback={null}><GenCopilotModal
          isOpen={showGen}
          onClose={() => setShowGen(false)}
          userProfile={profile}
          onOpenOrderForm={(orderData) => {
            setShowGen(false);
            setTab('orders');
            [100, 300].forEach((ms) => {
              setTimeout(() => window.dispatchEvent(new CustomEvent('sumi-create-order', { detail: orderData })), ms);
            });
          }}
          onViewOrder={(orderId) => {
            setShowGen(false);
            setTab('orders');
            [80, 250, 500].forEach((ms) => {
              setTimeout(() => window.dispatchEvent(new CustomEvent('sumi-open-order', { detail: { entityId: orderId } })), ms);
            });
          }}
          onViewTask={(taskId) => {
            setShowGen(false);
            setTab('tasks');
            [80, 250, 500].forEach((ms) => {
              setTimeout(() => window.dispatchEvent(new CustomEvent('sumi-open-task', { detail: { entityId: taskId } })), ms);
            });
          }}
        /></Suspense>}
        {voiceTask && (
          <GenVoiceTaskAlert
            task={voiceTask}
            onClose={() => setVoiceTask(null)}
            onAccepted={() => setVoiceTask(null)}
          />
        )}
      </ErrorBoundary>
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
