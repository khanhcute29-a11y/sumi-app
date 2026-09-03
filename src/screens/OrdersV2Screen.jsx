import React, { useEffect, useMemo, useState } from 'react';
import { listOrdersV2 } from '../lib/featureFlags';
import { loadFeatureFlags } from '../lib/featureFlags';
import CreateOrderV2Modal from '../components/CreateOrderV2Modal';
import { listOrderDrafts, deleteOrderDraft } from '../lib/useDraftAutosave';
import OrderV2DetailModal from '../components/OrderV2DetailModal';
import { useAuth } from '../lib/AuthContext';
import { supabase } from '../lib/supabaseClient';
import { canUserViewOrder, getUserWorkflows } from '../lib/orderVisibility';
import { subscribeToBroadcast, BroadcastEvents } from '../lib/realtimeSync';
import FinishedGoodsInventoryV2 from '../components/warehouse/FinishedGoodsInventoryV2';
import { fetchOrderNoteCounts } from '../lib/queries';
import { fetchOrderHearts, addOrderHeart } from '../lib/bossOverviewV3';
import { IconInbox, IconKitchen, IconPackage, IconShipping, IconCheckCircle, IconWarning, IconWarehouse, IconCake, IconBakery, IconMacaron, IconSchool, IconTeabreak, IconMixed } from '../components/icons/FrogIcons';
import { localDateStr } from '../lib/date';

const LABELS = {
  awaiting_assignment: 'Đơn chờ làm', awaiting_acceptance: 'Đơn chờ làm', in_production: 'Bếp đang làm',
  ready_for_fulfillment: 'Chờ vận chuyển', in_delivery: 'Đang vận chuyển', completed: 'Giao thành công', cancelled: 'Đã huỷ',
};

const FILTERS = [
  { key: 'waiting', label: 'Đơn chờ làm', Icon: IconInbox, match: o => ['awaiting_assignment', 'awaiting_acceptance'].includes(o.status_v2) && !o.is_overdue },
  { key: 'production', label: 'Bếp đang làm', Icon: IconKitchen, match: o => o.status_v2 === 'in_production' && !o.is_overdue },
  { key: 'ready', label: 'Chờ vận chuyển', Icon: IconPackage, match: o => o.status_v2 === 'ready_for_fulfillment' && !o.is_overdue },
  { key: 'delivery', label: 'Đang vận chuyển', Icon: IconShipping, match: o => o.status_v2 === 'in_delivery' && !o.is_overdue },
  { key: 'completed', label: 'Giao thành công', Icon: IconCheckCircle, match: o => o.status_v2 === 'completed' },
  { key: 'overdue', label: 'Chưa thực hiện', Icon: IconWarning, match: o => Boolean(o.is_overdue) },
];

const FLOW_GROUPS = [
  { key: 'cake', label: 'Bánh kem & Bánh lạnh', Icon: IconCake, desc: 'Bếp Lạnh phụ trách', match: o => o.order_type === 'cake' },
  { key: 'bakery', label: 'Bánh mặn & Bánh ngọt', Icon: IconBakery, desc: 'Bếp Nóng phụ trách', match: o => o.order_type === 'bakery' },
  { key: 'macaron', label: 'Macaron', Icon: IconMacaron, desc: 'Xưởng 41 chuyên biệt', match: o => o.order_type === 'macaron' },
  { key: 'school', label: 'Trường học', Icon: IconSchool, desc: 'Xưởng 42 điểm trường', match: o => o.order_type === 'school' },
  { key: 'teabreak', label: 'Teabreak', Icon: IconTeabreak, desc: 'Tiệc & Sự kiện', match: o => o.order_type === 'teabreak' },
  // "Nhiều bếp cùng làm" phải bắt được CẢ đơn 1-luồng gốc (vd order_type=
  // 'macaron') nhưng có thêm bếp phối hợp (assign_order_package_collab) —
  // không chỉ order_type='mixed'. kitchen_codes (order_operations_list,
  // 202609041100) đếm đúng số bếp đang có việc thật cho đơn đó.
  { key: 'mixed', label: 'Đơn tổng hợp', Icon: IconMixed, desc: 'Nhiều bếp cùng làm', match: o => o.order_type === 'mixed' || (Array.isArray(o.kitchen_codes) && o.kitchen_codes.length > 1) || !['cake', 'bakery', 'macaron', 'teabreak', 'school'].includes(o.order_type) },
];

const minutesText = value => {
  if (value === null || value === undefined) return '';
  const hours = Math.floor(value / 60); const minutes = value % 60;
  return hours ? `${hours} giờ ${minutes} phút` : `${minutes} phút`;
};


export default function OrdersV2Screen() {
  const { profile } = useAuth();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState(null);
  const [flowGroup, setFlowGroup] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  // Bộ lọc riêng cho tab "Giao thành công" (đúng nghĩa Lịch sử đơn hàng) —
  // chỉ ảnh hưởng khối "Đơn Trước Đây", không đụng "Đơn Hôm Nay".
  const [historyFrom, setHistoryFrom] = useState('');
  const [historyTo, setHistoryTo] = useState('');
  const [historyKeyword, setHistoryKeyword] = useState('');
  const [canCreate, setCanCreate] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [resumeDraftId, setResumeDraftId] = useState(null);
  const [showDrafts, setShowDrafts] = useState(false);
  const [drafts, setDrafts] = useState([]);
  const refreshDrafts = () => setDrafts(listOrderDrafts());
  useEffect(() => { refreshDrafts(); }, [showCreate]);
  const [selectedId, setSelectedId] = useState(null);
  const [error, setError] = useState('');
  const [showKho, setShowKho] = useState(false);
  // ── Thả tim (đánh dấu đã xem) + số lượng bình luận trên thẻ đơn ──
  const [orderHearts, setOrderHearts] = useState({});
  const [noteCounts, setNoteCounts] = useState({});
  const [heartingId, setHeartingId] = useState(null);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      await supabase.rpc('enqueue_order_operational_alerts');
      const list = await listOrdersV2();
      setOrders(list);
      const ids = list.map((o) => o.id).filter(Boolean);
      fetchOrderHearts(ids).then(setOrderHearts).catch(() => {});
      fetchOrderNoteCounts(ids).then(setNoteCounts).catch(() => {});
    } catch (err) {
      setError(err?.message || 'Không tải được danh sách đơn hàng.');
    } finally {
      setLoading(false);
    }
  };

  const handleHeartOrder = async (e, orderId) => {
    e.stopPropagation();
    if (heartingId || !profile?.id) return;
    const already = (orderHearts[orderId] || []).some((h) => h.staff_id === profile.id);
    if (already) return;
    setHeartingId(orderId);
    setOrderHearts((prev) => ({
      ...prev,
      [orderId]: [...(prev[orderId] || []), { staff_id: profile.id, staff_name: profile.full_name || 'Bạn' }],
    }));
    try {
      await addOrderHeart(orderId);
    } catch {
      setOrderHearts((prev) => ({ ...prev, [orderId]: (prev[orderId] || []).filter((h) => h.staff_id !== profile.id) }));
    } finally {
      setHeartingId(null);
    }
  };

  useEffect(() => { load(); loadFeatureFlags().then(f => setCanCreate(f.orders_v2_write)); }, []);
  useEffect(() => { const open = () => setShowCreate(true); window.addEventListener('sumi-create-order', open); return () => window.removeEventListener('sumi-create-order', open); }, []);
  useEffect(() => { const open = (event) => { if (event.detail?.entityId) setSelectedId(event.detail.entityId); }; window.addEventListener('sumi-open-order', open); return () => window.removeEventListener('sumi-open-order', open); }, []);
  useEffect(() => {
    const select = (event) => {
      setFilter(event.detail?.filter || null);
      setFlowGroup(null);
      setSearchQuery('');
      setHistoryFrom(''); setHistoryTo(''); setHistoryKeyword('');
    };
    window.addEventListener('sumi-order-filter', select);
    return () => window.removeEventListener('sumi-order-filter', select);
  }, []);

  // Auto-refresh on broadcasts
  useEffect(() => {
    const unsubscribers = [
      subscribeToBroadcast(BroadcastEvents.ORDER_CREATED, () => {
        console.log('[Orders] New order created, refreshing...');
        load();
      }),
      subscribeToBroadcast(BroadcastEvents.ORDER_STATUS_CHANGED, () => {
        console.log('[Orders] Order status changed, refreshing...');
        load();
      }),
      subscribeToBroadcast(BroadcastEvents.KITCHEN_WORK_PACKAGE_COMPLETED, () => {
        console.log('[Orders] Kitchen completed, refreshing...');
        load();
      }),
    ];

    // Also listen to general data changes
    const dataChangeListener = () => load();
    window.addEventListener('sumi-data-changed', dataChangeListener);

    return () => {
      unsubscribers.forEach(unsub => unsub());
      window.removeEventListener('sumi-data-changed', dataChangeListener);
    };
  }, []);

  // Lớp bảo hiểm cho việc mất tín hiệu realtime (broadcast không được lưu lại —
  // điện thoại tắt màn hình/chuyển app/rớt mạng đúng lúc có đơn mới sẽ bỏ lỡ
  // vĩnh viễn, không có cách "bù lại"). Mỗi lần app được mở lại/focus, tự tải
  // lại danh sách 1 lần cho chắc, không phụ thuộc hoàn toàn vào broadcast.
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, []);

  const roleCanCreate = ['owner', 'admin', 'cashier', 'sale', 'kitchen_lead'].includes(profile?.role) || (profile?.extra_roles || []).some(r => ['owner', 'admin', 'cashier', 'sale', 'kitchen_lead'].includes(r));

  // Lọc luồng có sẵn dựa trên quyền của user
  const userWorkflows = useMemo(() => getUserWorkflows(profile), [profile]);
  const availableFlowGroups = useMemo(
    () => FLOW_GROUPS.filter(fg => fg.key === 'mixed' || userWorkflows.includes(fg.key)),
    [userWorkflows]
  );

  // Lọc theo trạng thái trước + visibility rules
  const statusOrders = useMemo(() => {
    if (!filter) return [];
    const filtered = orders.filter(FILTERS.find(x => x.key === filter)?.match || (() => true));
    return filtered.filter(o => canUserViewOrder(o, profile));
  }, [orders, filter, profile]);

  // Lọc tiếp theo 5 luồng và tìm kiếm
  const shownOrders = useMemo(() => {
    let list = statusOrders;
    if (flowGroup && flowGroup !== 'all') {
      const g = FLOW_GROUPS.find(x => x.key === flowGroup);
      if (g) list = list.filter(g.match);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(o =>
        (o.order_code && o.order_code.toLowerCase().includes(q)) ||
        (o.customer_name && o.customer_name.toLowerCase().includes(q)) ||
        (o.address && o.address.toLowerCase().includes(q))
      );
    }
    return list;
  }, [statusOrders, flowGroup, searchQuery]);

  const stage = (s) => s === 'completed' ? 5 : s === 'in_delivery' ? 4 : s === 'ready_for_fulfillment' ? 3 : s === 'in_production' ? 2 : 1;

  // Tab "Giao thành công" = đúng nghĩa Lịch sử đơn hàng -> tách theo ngày
  // HOÀN THÀNH thật (completed_at). Các tab vận hành khác (chờ làm/đang
  // làm...) tách theo GIỜ CẦN GIAO (required_at) để bếp biết đơn nào làm
  // trước — 2 mục đích khác nhau nên dùng field khác nhau.
  const isHistoryTab = filter === 'completed';
  const { todayOrders, otherOrders } = useMemo(() => {
    const todayStr = localDateStr();
    const today = [], other = [];
    for (const o of shownOrders) {
      const d = isHistoryTab ? o.completed_at : o.required_at;
      if (d && localDateStr(new Date(d)) === todayStr) today.push(o);
      else other.push(o);
    }
    return { todayOrders: today, otherOrders: other };
  }, [shownOrders, isHistoryTab]);

  // Bộ lọc khoảng ngày + tên khách CHỈ áp dụng cho khối "Đơn Trước Đây" của
  // tab Lịch sử — "Đơn Hôm Nay" luôn hiện đủ, không bị ảnh hưởng (yêu cầu
  // UX: lọc/tìm kiếm không được làm gián đoạn luồng hiển thị cố định của
  // Hôm Nay).
  const historyOrders = useMemo(() => {
    if (!isHistoryTab) return otherOrders;
    let list = otherOrders;
    if (historyFrom) list = list.filter(o => o.completed_at && localDateStr(new Date(o.completed_at)) >= historyFrom);
    if (historyTo) list = list.filter(o => o.completed_at && localDateStr(new Date(o.completed_at)) <= historyTo);
    if (historyKeyword.trim()) {
      const q = historyKeyword.toLowerCase().trim();
      list = list.filter(o => (o.customer_name || '').toLowerCase().includes(q));
    }
    return list;
  }, [otherOrders, isHistoryTab, historyFrom, historyTo, historyKeyword]);

  const renderOrderCard = (o) => (
    <button className="mock-order-card" key={o.id} onClick={() => setSelectedId(o.id)}>
      <div className="mock-order-top">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <strong>#{o.order_code || 'CHƯA CÓ MÃ'}</strong>
          {o.is_internal && (
            <span style={{ background: '#7c3aed', color: '#fff', fontWeight: 900, fontSize: 11, padding: '2px 8px', borderRadius: 999, letterSpacing: 0.3 }}>
              🏷️ NỘI BỘ
            </span>
          )}
          {(() => {
            const hearts = orderHearts[o.id] || [];
            const iHearted = hearts.some((h) => h.staff_id === profile?.id);
            return (
              <span
                onClick={(e) => handleHeartOrder(e, o.id)}
                title={hearts.length ? `Đã xem: ${hearts.map((h) => h.staff_name).join(', ')}` : 'Thả tim = đánh dấu đã xem đơn này'}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 3, cursor: iHearted ? 'default' : 'pointer', fontSize: 14, color: iHearted ? '#e11d48' : '#8a7a66' }}
              >
                {iHearted ? '❤️' : '🤍'} {hearts.length > 0 && hearts.length}
              </span>
            );
          })()}
          {noteCounts[o.id] > 0 && (
            <span style={{ fontSize: 14, color: '#8a7a66' }}>💬 {noteCounts[o.id]}</span>
          )}
        </div>
        <span className={o.is_overdue ? 'is-overdue' : ''}>
          {o.is_overdue ? '⚠️ Chưa thực hiện' : (LABELS[o.status_v2] || o.status_v2)}
        </span>
      </div>
      {(orderHearts[o.id] || []).length > 0 && (
        <p className="mock-order-metric" style={{ fontSize: 11, color: '#8a7a66' }}>
          ❤️ Đã xem: {(orderHearts[o.id] || []).map((h) => h.staff_name).join(', ')}
        </p>
      )}
      <h2>
        {o.is_internal ? `Đơn nội bộ${o.target_store ? ` — ${o.target_store}` : ''}` : (o.customer_name || 'Khách chưa ghi tên')}
        {o.created_by_name && <span style={{ fontSize: '0.7em', fontWeight: 400, color: '#8a7a66' }}> ({o.created_by_name})</span>}
      </h2>
      <p><b>{o.order_type_label || o.order_type || 'Đơn sản xuất'}</b> · {o.address || 'Nhận tại quầy'}</p>
      {o.product_names && <p className="mock-order-metric">🍰 {o.product_names}</p>}
      {o.kitchen_names && <p className="mock-order-metric">👨‍🍳 Bếp: {o.kitchen_names}</p>}
      {o.was_late && <p className="mock-order-metric" style={{ background: '#fee2e2', color: '#b42318' }}>⚠️ Trễ{o.late_staff_names ? ` — ${o.late_staff_names}` : ''}</p>}
      <p>Tạo lúc {new Date(o.created_at).toLocaleString('vi-VN')} · {o.total_quantity || 0} sản phẩm</p>
      <div className="mock-track">
        {[1, 2, 3, 4, 5].map(n => <i key={n} className={n <= stage(o.status_v2) ? 'done' : ''} />)}
      </div>
      <div className="mock-track-label">
        <span>Chờ nhận</span>
        <b>{LABELS[o.status_v2] || o.status_v2}</b>
        <span>Hoàn thành</span>
      </div>

      {o.status_v2 === 'in_production' && o.production_started_at && (
        <p className="mock-order-metric">
          👨‍🍳 Bếp đã làm {minutesText(Math.max(0, Math.floor((Date.now() - new Date(o.production_started_at)) / 60000)))}
        </p>
      )}
      {o.production_minutes !== null && o.production_minutes !== undefined && (
        <p className="mock-order-metric">✅ Thời gian bếp: {minutesText(o.production_minutes)}</p>
      )}
      {o.status_v2 === 'in_delivery' && o.delivery_started_at && (
        <p className="mock-order-metric">
          🚚 Đang giao {minutesText(Math.max(0, Math.floor((Date.now() - new Date(o.delivery_started_at)) / 60000)))} · {o.driver_name || o.provider_label || 'Chưa rõ người giao'}
        </p>
      )}
      {o.delivery_minutes !== null && o.delivery_minutes !== undefined && (
        <p className="mock-order-metric">✅ Thời gian giao: {minutesText(o.delivery_minutes)}{o.driver_name || o.provider_label ? ` · ${o.driver_name || o.provider_label}` : ''}</p>
      )}
      {o.shipping_fee !== null && o.shipping_fee !== undefined && o.confidentiality !== 'school_restricted' && (
        <p className="mock-order-metric">Phí giao: {Number(o.shipping_fee).toLocaleString('vi-VN')}đ</p>
      )}
      {o.production_started_at && <p className="mock-order-time">Nhận đơn: {new Date(o.production_started_at).toLocaleString('vi-VN')}</p>}
      {o.production_completed_at && <p className="mock-order-time">Bếp hoàn thành: {new Date(o.production_completed_at).toLocaleString('vi-VN')}</p>}
      {o.delivery_started_at && <p className="mock-order-time">Bắt đầu giao: {new Date(o.delivery_started_at).toLocaleString('vi-VN')}</p>}
      {o.delivery_completed_at && <p className="mock-order-time">Giao xong: {new Date(o.delivery_completed_at).toLocaleString('vi-VN')}</p>}
      {o.is_overdue && (
        <div className="mock-order-overdue">
          <b>Quá giờ {minutesText(o.overdue_minutes)}</b>
          <span>{o.overdue_stage}</span>
        </div>
      )}
      <time>{o.required_at ? `Cần giao ${new Date(o.required_at).toLocaleString('vi-VN')}` : 'Chưa đặt giờ giao'}</time>
    </button>
  );

  if (showCreate) return <CreateOrderV2Modal embedded resumeDraftId={resumeDraftId} onClose={() => { setShowCreate(false); setResumeDraftId(null); }} onCreated={load} />;
  // Kho Thành Phẩm: trang toàn màn hình (không phải modal/drawer co cụm) — cùng
  // kiểu chuyển màn với showCreate ở trên, khớp mockup "screen" riêng của nó.
  if (showKho) return <div style={{ padding: '16px 0' }}><FinishedGoodsInventoryV2 onBack={() => setShowKho(false)} /></div>;

  const currentFilterLabel = FILTERS.find(x => x.key === filter)?.label || 'Đơn hàng';
  const currentFlowMeta = FLOW_GROUPS.find(x => x.key === flowGroup);

  return (
    <div className="mock-orders">
      {/* Header chính */}
      <div className="mock-page-head">
        <div>
          <small>THEO DÕI XUYÊN SUỐT</small>
          <h1>Đơn hàng</h1>
          <p>{orders.length} đơn đang hiển thị</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {drafts.length > 0 && (
            <button onClick={() => setShowDrafts(true)} style={{ background: '#fff', border: '1.5px solid #eadcca', color: '#8c5a3c', fontWeight: 800 }}>
              📝 Nháp ({drafts.length})
            </button>
          )}
          {(canCreate || roleCanCreate) && (
            // Style inline vì nút này không còn là con trực tiếp của .mock-page-head
            // từ khi thêm nút "Nháp" bên cạnh (bọc thêm 1 div) — CSS .mock-page-head>button
            // trong App.css dùng selector con trực tiếp nên không còn khớp nữa.
            <button onClick={() => setShowCreate(true)} style={{
              minHeight: 58, padding: '0 17px', border: 0, borderRadius: 18,
              background: '#ef642b', color: '#fff', fontSize: 16, fontWeight: 950,
              boxShadow: '0 6px 0 #b93e13', whiteSpace: 'nowrap', cursor: 'pointer',
            }}>＋ TẠO ĐƠN</button>
          )}
        </div>
      </div>

      {/* Danh sách nháp đơn hàng đã lưu tạm */}
      {showDrafts && (
        <div className="mock-order-overlay" onClick={() => setShowDrafts(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 200, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#faf6f0', width: '100%', maxWidth: 480, maxHeight: '75vh', overflowY: 'auto', borderRadius: '20px 20px 0 0', padding: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 900, color: '#2d1c10' }}>📝 Đơn nháp đã lưu ({drafts.length})</h3>
              <button onClick={() => setShowDrafts(false)} style={{ border: 'none', background: 'none', fontSize: 18, cursor: 'pointer' }}>✕</button>
            </div>
            {drafts.length === 0 && <div style={{ color: '#725f50', textAlign: 'center', padding: 20 }}>Không có nháp nào.</div>}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {drafts.map(d => {
                const savedAgo = d.savedAt ? new Date(d.savedAt).toLocaleString('vi-VN') : '';
                const typeMeta = FLOW_GROUPS.find(x => x.key === d.type);
                const typeLabel = typeMeta ? typeMeta.label : (d.type || 'Chưa chọn loại');
                return (
                  <div key={d.id} style={{ background: '#fff', border: '1.5px solid #eadcca', borderRadius: 14, padding: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 800, color: '#2d1c10' }}>{typeMeta && <typeMeta.Icon size={16} />}{typeLabel}</div>
                    <div style={{ fontSize: 13, color: '#725f50', margin: '4px 0' }}>{d.customerName || 'Khách chưa đặt tên'}{d.customerPhone ? ` · ${d.customerPhone}` : ''}</div>
                    <div style={{ fontSize: 11.5, color: '#a08060' }}>Lưu lúc {savedAgo}</div>
                    <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                      <button onClick={() => { setResumeDraftId(d.id); setShowDrafts(false); setShowCreate(true); }} style={{ flex: 1, background: '#d96b43', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 0', fontWeight: 800, cursor: 'pointer' }}>Tiếp tục</button>
                      <button onClick={() => { if (window.confirm('Xoá nháp này?')) { deleteOrderDraft(d.id); refreshDrafts(); } }} style={{ background: '#fff', border: '1.5px solid #e0d5c7', color: '#b42318', borderRadius: 8, padding: '8px 12px', fontWeight: 700, cursor: 'pointer' }}>Xoá</button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Màn hình 1: Tổng quan 6 trạng thái */}
      {!filter && (
        <div className="mock-order-overview">
          {FILTERS.map(item => (
            <button
              className={filter === item.key ? 'active' : ''}
              key={item.key}
              onClick={() => { setFilter(item.key); setFlowGroup(null); setSearchQuery(''); setHistoryFrom(''); setHistoryTo(''); setHistoryKeyword(''); }}
            >
              <span><item.Icon size={22} /></span>
              <strong>{item.label}</strong>
              <b>{orders.filter(item.match).length}</b>
            </button>
          ))}

          {/* Kho Thành Phẩm — nhập kho khi bếp làm xong, xuất kho tự động khi đơn hoàn thành,
              shipper lấy hàng từ đây. Trước ở màn "Việc" (Ghi Sản Xuất) — sai chỗ, dời về đây
              vì đây mới là nơi liên kết trực tiếp với luồng đơn hàng. */}
          <button className="mock-order-overview-kho" onClick={() => setShowKho(true)}
            style={{
              gridColumn: '1 / -1', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '14px 16px', borderRadius: 16, border: '1.5px solid #eadcca', background: '#fffaf3',
              cursor: 'pointer', font: 'inherit', textAlign: 'left',
            }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <IconWarehouse size={22} />
              <strong style={{ color: '#2d1c10', fontSize: 18 }}>Kho Thành Phẩm</strong>
            </span>
            <span style={{ color: '#b93e13', fontWeight: 800 }}>Xem →</span>
          </button>
        </div>
      )}

      {/* Màn hình 2: Phân loại 5 luồng trong 1 trạng thái */}
      {filter && !flowGroup && (
        <div className="mock-flow-section">
          <div className="mock-list-head">
            <button onClick={() => { setFilter(null); setFlowGroup(null); }}>
              ← Về Tổng quan
            </button>
            <strong style={{ fontSize: 16 }}>{currentFilterLabel} ({statusOrders.length} đơn)</strong>
          </div>

          <div className="mock-flow-intro">
            Chọn luồng sản xuất để xem danh sách chi tiết:
          </div>

          <div className="mock-flow-grid">
            {availableFlowGroups.map(g => {
              const count = statusOrders.filter(g.match).length;
              return (
                <button
                  key={g.key}
                  className="mock-flow-card"
                  onClick={() => { setFlowGroup(g.key); setSearchQuery(''); }}
                >
                  <div className="mock-flow-card-head">
                    <span><g.Icon size={22} /></span>
                    <b>{count}</b>
                  </div>
                  <div>
                    <strong>{g.label}</strong>
                    <small>{g.desc}</small>
                  </div>
                </button>
              );
            })}
          </div>

          <button
            className="mock-flow-all-btn"
            onClick={() => { setFlowGroup('all'); setSearchQuery(''); }}
          >
            <span>📋 Xem toàn bộ tất cả luồng</span>
            <span style={{ fontWeight: 900, color: '#b93e13' }}>{statusOrders.length} đơn →</span>
          </button>
        </div>
      )}

      {/* Màn hình 3: Danh sách đơn hàng chi tiết của luồng đã chọn */}
      {filter && flowGroup && (
        <div>
          <div className="mock-list-head">
            <button onClick={() => setFlowGroup(null)}>
              ← Quay lại phân loại
            </button>
            <strong>
              {currentFilterLabel} {currentFlowMeta ? `· ${currentFlowMeta.label}` : '· Tất cả'}
            </strong>
          </div>

          {/* Ô tìm kiếm chung — chỉ dùng cho các tab VẬN HÀNH (chờ làm/đang
              làm...). Tab Lịch sử (Giao thành công) có bộ lọc riêng bên dưới,
              không dùng ô này. */}
          {!isHistoryTab && (
            <input
              className="mock-flow-search"
              placeholder="🔍 Tìm nhanh mã đơn, tên khách, địa chỉ..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          )}

          {/* Đơn Hôm Nay — LUÔN hiện đủ, không bao giờ bị bộ lọc lịch sử bên
              dưới làm ảnh hưởng. */}
          {todayOrders.length > 0 && (
            <div className="mock-list-head" style={{ marginTop: 4 }}>
              <strong style={{ fontSize: 15 }}>🗓️ Đơn Hôm Nay ({todayOrders.length})</strong>
            </div>
          )}
          {todayOrders.map(renderOrderCard)}

          {isHistoryTab && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 18, marginBottom: 4, alignItems: 'flex-end' }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, fontWeight: 700, color: '#725f50' }}>
                Từ ngày
                <input type="date" className="mock-flow-search" style={{ marginBottom: 0 }} value={historyFrom} onChange={e => setHistoryFrom(e.target.value)} />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, fontWeight: 700, color: '#725f50' }}>
                Đến ngày
                <input type="date" className="mock-flow-search" style={{ marginBottom: 0 }} value={historyTo} onChange={e => setHistoryTo(e.target.value)} />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, fontWeight: 700, color: '#725f50', flex: '1 1 200px' }}>
                Tên khách hàng
                <input placeholder="🔍 Gõ tên khách..." className="mock-flow-search" style={{ marginBottom: 0 }} value={historyKeyword} onChange={e => setHistoryKeyword(e.target.value)} />
              </label>
            </div>
          )}

          {historyOrders.length > 0 && (
            <div className="mock-list-head" style={{ marginTop: isHistoryTab ? 4 : (todayOrders.length > 0 ? 18 : 4) }}>
              <strong style={{ fontSize: 15 }}>{isHistoryTab ? '📅 Đơn Trước Đây' : '📅 Đơn Ngày Khác'} ({historyOrders.length})</strong>
            </div>
          )}
          {historyOrders.map(renderOrderCard)}
          {isHistoryTab && otherOrders.length > 0 && historyOrders.length === 0 && (
            <div className="mock-empty" style={{ padding: '20px 0' }}>
              <span>🔍</span>
              <p>Không có đơn nào khớp bộ lọc.</p>
            </div>
          )}

          {loading && (
            <div className="mock-empty">
              <span>⏳</span>
              <h2>Đang tải đơn hàng...</h2>
              <p>Vui lòng chờ một lát</p>
            </div>
          )}

          {!loading && !error && shownOrders.length === 0 && (
            <div className="mock-empty">
              <span>📦</span>
              <h2>Không có đơn hàng nào</h2>
              <p>{searchQuery ? 'Không tìm thấy đơn khớp với từ khóa tìm kiếm.' : 'Chưa có đơn trong luồng này.'}</p>
              <button onClick={() => { setFlowGroup('all'); setSearchQuery(''); }} style={{ marginTop: 10, padding: '8px 16px', borderRadius: 12, border: '1px solid #d7c3aa', background: '#fff', cursor: 'pointer', fontWeight: 800 }}>
                Xem tất cả các luồng
              </button>
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="mock-empty" role="alert">
          <span>⚠️</span>
          <h2>Chưa tải được đơn hàng</h2>
          <p>{error}</p>
          <button onClick={load}>TẢI LẠI</button>
        </div>
      )}

      {selectedId && (
        <OrderV2DetailModal orderId={selectedId} onClose={() => setSelectedId(null)} onChanged={load} />
      )}
    </div>
  );
}

