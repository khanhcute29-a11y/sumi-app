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
import FinishedGoodsPanel from '../components/warehouse/FinishedGoodsPanel';
import { ProductionLogModal } from '../components/ProductionLogModal';

const LABELS = {
  awaiting_assignment: 'Đơn chờ làm', awaiting_acceptance: 'Đơn chờ làm', in_production: 'Bếp đang làm',
  ready_for_fulfillment: 'Chờ vận chuyển', in_delivery: 'Đang vận chuyển', completed: 'Giao thành công', cancelled: 'Đã huỷ',
};

const FILTERS = [
  { key: 'waiting', label: 'Đơn chờ làm', match: o => ['awaiting_assignment', 'awaiting_acceptance'].includes(o.status_v2) && !o.is_overdue },
  { key: 'production', label: 'Bếp đang làm', match: o => o.status_v2 === 'in_production' && !o.is_overdue },
  { key: 'ready', label: 'Chờ vận chuyển', match: o => o.status_v2 === 'ready_for_fulfillment' && !o.is_overdue },
  { key: 'delivery', label: 'Đang vận chuyển', match: o => o.status_v2 === 'in_delivery' && !o.is_overdue },
  { key: 'completed', label: 'Giao thành công', match: o => o.status_v2 === 'completed' },
  { key: 'overdue', label: 'Chưa thực hiện', match: o => Boolean(o.is_overdue) },
];

const FLOW_GROUPS = [
  { key: 'cake', label: 'Bánh kem & Bánh lạnh', icon: '🎂', desc: 'Bếp Lạnh phụ trách', match: o => o.order_type === 'cake' },
  { key: 'bakery', label: 'Bánh mặn & Bánh ngọt', icon: '🍞', desc: 'Bếp Nóng phụ trách', match: o => o.order_type === 'bakery' },
  { key: 'macaron', label: 'Macaron', icon: '🧁', desc: 'Xưởng 41 chuyên biệt', match: o => o.order_type === 'macaron' },
  { key: 'school', label: 'Trường học', icon: '🏫', desc: 'Xưởng 42 điểm trường', match: o => o.order_type === 'school' },
  { key: 'teabreak', label: 'Teabreak', icon: '☕', desc: 'Tiệc & Sự kiện', match: o => o.order_type === 'teabreak' },
  { key: 'mixed', label: 'Đơn tổng hợp', icon: '🧺', desc: 'Nhiều bếp cùng làm', match: o => o.order_type === 'mixed' || !['cake', 'bakery', 'macaron', 'teabreak', 'school'].includes(o.order_type) },
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
  const [showProductionLog, setShowProductionLog] = useState(false);
  const [khoRefreshKey, setKhoRefreshKey] = useState(0);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      await supabase.rpc('enqueue_order_operational_alerts');
      setOrders(await listOrdersV2());
    } catch (err) {
      setError(err?.message || 'Không tải được danh sách đơn hàng.');
    } finally {
      setLoading(false);
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

  if (showCreate) return <CreateOrderV2Modal embedded resumeDraftId={resumeDraftId} onClose={() => { setShowCreate(false); setResumeDraftId(null); }} onCreated={load} />;

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
            <button onClick={() => setShowCreate(true)}>＋ TẠO ĐƠN</button>
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
                const typeLabel = ({ cake: '🎂 Bánh kem & Bánh lạnh', bakery: '🍞 Bánh mặn & Bánh ngọt', macaron: '🧁 Macaron', school: '🏫 Trường học', teabreak: '☕ Teabreak' })[d.type] || d.type || 'Chưa chọn loại';
                return (
                  <div key={d.id} style={{ background: '#fff', border: '1.5px solid #eadcca', borderRadius: 14, padding: 12 }}>
                    <div style={{ fontWeight: 800, color: '#2d1c10' }}>{typeLabel}</div>
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
              onClick={() => { setFilter(item.key); setFlowGroup(null); setSearchQuery(''); }}
            >
              <span>{item.key === 'waiting' ? '📥' : item.key === 'production' ? '👩‍🍳' : item.key === 'ready' ? '📦' : item.key === 'delivery' ? '🛵' : item.key === 'completed' ? '✅' : '⚠️'}</span>
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
              <span style={{ fontSize: 20 }}>🏬</span>
              <span>
                <strong style={{ display: 'block', color: '#2d1c10', fontSize: 15 }}>Kho Thành Phẩm</strong>
                <small style={{ color: '#8c5a3c' }}>Bakery · Macaron · Xưởng 42 (Trường học/Teabreak) — tồn kho &amp; ghi sản xuất</small>
              </span>
            </span>
            <span style={{ color: '#b93e13', fontWeight: 800 }}>Xem →</span>
          </button>
        </div>
      )}

      {showKho && (
        <div onClick={() => setShowKho(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 200, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: '#faf6f0', width: '100%', maxWidth: 560, maxHeight: '85vh', overflowY: 'auto', borderRadius: '20px 20px 0 0', padding: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 900, color: '#2d1c10' }}>🏬 Kho Thành Phẩm</h3>
              <button onClick={() => setShowKho(false)} style={{ border: 'none', background: 'none', fontSize: 18, cursor: 'pointer' }}>✕</button>
            </div>
            <button onClick={() => setShowProductionLog(true)} style={{ width: '100%', marginBottom: 14, background: '#d96b43', color: '#fff', border: 'none', borderRadius: 12, padding: '10px 0', fontWeight: 800, cursor: 'pointer' }}>
              📝 Ghi Sản Xuất (nhập kho)
            </button>
            <FinishedGoodsPanel key={khoRefreshKey} />
          </div>
        </div>
      )}

      {showProductionLog && (
        <ProductionLogModal
          onClose={() => setShowProductionLog(false)}
          onSaved={() => { setShowProductionLog(false); setKhoRefreshKey((k) => k + 1); }}
        />
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
                    <span>{g.icon}</span>
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

          {/* Thanh chuyển nhanh giữa các luồng */}
          <div className="mock-flow-tabs">
            <button
              className={flowGroup === 'all' ? 'active' : ''}
              onClick={() => setFlowGroup('all')}
            >
              <span>📋</span>
              <span>Tất cả</span>
              <b>{statusOrders.length}</b>
            </button>
            {availableFlowGroups.map(g => {
              const count = statusOrders.filter(g.match).length;
              return (
                <button
                  key={g.key}
                  className={flowGroup === g.key ? 'active' : ''}
                  onClick={() => setFlowGroup(g.key)}
                >
                  <span>{g.icon}</span>
                  <span>{g.label}</span>
                  <b>{count}</b>
                </button>
              );
            })}
          </div>

          {/* Ô tìm kiếm đơn */}
          <input
            className="mock-flow-search"
            placeholder="🔍 Tìm nhanh mã đơn, tên khách, địa chỉ..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />

          {/* Danh sách đơn hàng */}
          {shownOrders.map(o => (
            <button className="mock-order-card" key={o.id} onClick={() => setSelectedId(o.id)}>
              <div className="mock-order-top">
                <strong>#{o.order_code || 'CHƯA CÓ MÃ'}</strong>
                <span className={o.is_overdue ? 'is-overdue' : ''}>
                  {o.is_overdue ? '⚠️ Chưa thực hiện' : (LABELS[o.status_v2] || o.status_v2)}
                </span>
              </div>
              <h2>{o.customer_name || 'Khách chưa ghi tên'}</h2>
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
          ))}

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

