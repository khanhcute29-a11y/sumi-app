// MOCKUP ONLY — Root Shell cho Orders Redesign Mockup
// Truy cập: http://localhost:5173/?mockup=orders
// KHÔNG import từ bất kỳ file production nào
import React, { useMemo, useState } from 'react';
import './mockup-orders.css';
import {
  MOCK_ORDERS, STATUS_CONFIG, TYPE_CONFIG,
  getFilteredOrders, getStatusCounts, fmtVnd,
} from './mock-data.js';
import { OrderDetailDrawer } from './OrderCardCompact.jsx';
import OrderListView from './OrderListView.jsx';
import OrderBoardView from './OrderBoardView.jsx';

// ─── Tab định nghĩa ─────────────────────────────────────────────
const STATUS_TABS = [
  { key: 'all',                   label: 'Tất cả',            icon: '🧾', countKey: 'total' },
  { key: 'overdue',               label: 'Trễ',               icon: '⚠️', countKey: 'overdue',    alert: true },
  { key: 'awaiting_assignment',   label: 'Chờ làm',           icon: '📥', countKey: 'waiting' },
  { key: 'in_production',         label: 'Đang bếp',          icon: '👩‍🍳', countKey: 'production' },
  { key: 'ready_for_fulfillment', label: 'Chờ ship',          icon: '📦', countKey: 'ready' },
  { key: 'in_delivery',           label: 'Đang giao',         icon: '🛵', countKey: 'delivery' },
  { key: 'completed',             label: 'Xong',              icon: '✅', countKey: 'completed' },
];

const TYPE_CHIPS = [
  { key: 'all',      label: '🧾 Tất cả' },
  { key: 'cake',     label: '🎂 Bánh Kem' },
  { key: 'bakery',   label: '🍞 Bánh Mặn/Ngọt' },
  { key: 'macaron',  label: '🧁 Macaron' },
  { key: 'teabreak', label: '☕ Teabreak' },
  { key: 'mixed',    label: '🧺 Đơn tổng hợp' },
];

const SORT_OPTIONS = [
  { key: 'time_asc',   label: '⏱ Giao sớm nhất' },
  { key: 'time_desc',  label: '⏱ Giao muộn nhất' },
  { key: 'value_desc', label: '💰 Giá trị cao nhất' },
];

// ─── Toast thông báo giả lập ─────────────────────────────────────
function Toast({ msg }) {
  if (!msg) return null;
  return <div className="mkp-toast">{msg}</div>;
}

// ─── Root ────────────────────────────────────────────────────────
export default function MockupOrdersRoot() {
  const [view, setView]           = useState('list'); // 'list' | 'board'
  const [statusTab, setStatusTab] = useState('all');
  const [typeChip, setTypeChip]   = useState('all');
  const [search, setSearch]       = useState('');
  const [sortBy, setSortBy]       = useState('time_asc');
  const [sortOpen, setSortOpen]   = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [toast, setToast]         = useState('');
  const [orders, setOrders]       = useState(MOCK_ORDERS);

  const counts = useMemo(() => getStatusCounts(orders), [orders]);

  const filteredOrders = useMemo(() => getFilteredOrders(orders, {
    statusFilter: statusTab === 'all' ? null : statusTab,
    typeFilter: typeChip === 'all' ? null : typeChip,
    search,
    sortBy,
  }), [orders, statusTab, typeChip, search, sortBy]);

  // Giả lập hành động (không gọi DB)
  const handleAction = (actionLabel) => {
    if (!selectedOrder) return;
    const id = selectedOrder.id;

    let newStatus = selectedOrder.status;
    let extra = {};

    if (actionLabel.includes('Phân bếp')) {
      newStatus = 'in_production';
      extra = { kitchen_started_at: new Date().toISOString(), is_overdue: false };
    } else if (actionLabel.includes('hoàn thành bếp')) {
      newStatus = 'ready_for_fulfillment';
      extra = { kitchen_done_at: new Date().toISOString() };
    } else if (actionLabel.includes('giao hàng')) {
      newStatus = 'in_delivery';
      extra = { delivery_started_at: new Date().toISOString(), shipper: 'Bạn' };
    } else if (actionLabel.includes('giao thành công')) {
      newStatus = 'completed';
      extra = { completed_at: new Date().toISOString() };
    } else if (actionLabel.includes('Huỷ')) {
      newStatus = 'cancelled';
    }

    setOrders(prev => prev.map(o =>
      o.id === id ? { ...o, status: newStatus, ...extra } : o
    ));
    setToast(`✅ Đã cập nhật: ${selectedOrder.code}`);
    setSelectedOrder(null);
    setTimeout(() => setToast(''), 2500);
  };

  const handleCreateOrder = () => {
    setToast('🛠 Màn hình tạo đơn sẽ hiện ở đây (mockup)');
    setTimeout(() => setToast(''), 2000);
  };

  const currentSortLabel = SORT_OPTIONS.find(s => s.key === sortBy)?.label || 'Sắp xếp';

  return (
    <div className="mkp-orders-shell">

      {/* ─── Header ─── */}
      <div className="mkp-orders-header">
        <div className="mkp-orders-header-top">
          <button className="mkp-orders-back" onClick={() => window.location.href = '/'}>
            ← App thật
          </button>
          <span className="mkp-orders-title">Đơn Hàng</span>
          <div className="mkp-orders-view-toggle">
            <button
              className={view === 'list' ? 'active' : ''}
              onClick={() => setView('list')}
              title="Danh sách"
            >≡</button>
            <button
              className={view === 'board' ? 'active' : ''}
              onClick={() => setView('board')}
              title="Bảng Kanban"
            >⊞</button>
          </div>
        </div>

        {/* Tổng quan nhanh */}
        <div style={{ display: 'flex', gap: 8, padding: '0 0 10px', color: 'rgba(255,255,255,0.9)', fontSize: 13, fontWeight: 800 }}>
          <span>📊 {counts.total} đơn</span>
          {counts.overdue > 0 && (
            <span style={{ color: '#fca5a5' }}>⚠️ {counts.overdue} trễ</span>
          )}
          {counts.waiting > 0 && (
            <span>📥 {counts.waiting} chờ</span>
          )}
          <span style={{ marginLeft: 'auto', color: 'rgba(255,255,255,0.7)' }}>
            🔴 MOCKUP
          </span>
        </div>

        {/* Status tabs */}
        <div className="mkp-status-tabs">
          {STATUS_TABS.map(tab => (
            <button
              key={tab.key}
              className={`mkp-status-tab${statusTab === tab.key ? ' active' : ''}${tab.alert && counts[tab.countKey] > 0 ? ' is-alert' : ''}`}
              onClick={() => setStatusTab(tab.key)}
            >
              {tab.icon} {tab.label}
              <span className="mkp-badge">{counts[tab.countKey] ?? 0}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ─── Filter Bar ─── */}
      <div className="mkp-filter-bar">
        <input
          className="mkp-search"
          placeholder="🔍 Tìm tên khách, mã đơn..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <div style={{ position: 'relative' }}>
          <button className="mkp-sort-btn" onClick={() => setSortOpen(p => !p)}>
            ↕ Sắp xếp
          </button>
          {sortOpen && (
            <div style={{
              position: 'absolute', right: 0, top: '110%', zIndex: 30,
              background: '#fff', border: '2px solid #eadcca',
              borderRadius: 14, overflow: 'hidden',
              boxShadow: '0 8px 24px rgba(0,0,0,0.12)', minWidth: 180,
            }}>
              {SORT_OPTIONS.map(opt => (
                <button key={opt.key}
                  onClick={() => { setSortBy(opt.key); setSortOpen(false); }}
                  style={{
                    display: 'block', width: '100%',
                    padding: '13px 16px', border: 'none',
                    background: sortBy === opt.key ? '#faf6f0' : '#fff',
                    color: sortBy === opt.key ? '#C88A4B' : '#2d1c10',
                    fontWeight: sortBy === opt.key ? 900 : 700,
                    fontSize: 14, textAlign: 'left', cursor: 'pointer',
                    borderBottom: '1px solid #eadcca',
                  }}
                >
                  {sortBy === opt.key ? '✓ ' : ''}{opt.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ─── Type Chips ─── */}
      <div className="mkp-type-chips">
        {TYPE_CHIPS.map(chip => (
          <button
            key={chip.key}
            className={`mkp-type-chip${typeChip === chip.key ? ' active' : ''}`}
            onClick={() => setTypeChip(chip.key)}
          >
            {chip.label}
          </button>
        ))}
      </div>

      {/* ─── Content: List hoặc Board ─── */}
      {filteredOrders.length === 0 ? (
        <div className="mkp-empty">
          <div className="mkp-empty-icon">📭</div>
          <h3>Không có đơn nào</h3>
          <p>Thử thay đổi bộ lọc hoặc tìm kiếm khác</p>
        </div>
      ) : view === 'list' ? (
        <OrderListView orders={filteredOrders} onOpen={setSelectedOrder} />
      ) : (
        <OrderBoardView orders={filteredOrders} onOpen={setSelectedOrder} />
      )}

      {/* ─── FAB Tạo đơn ─── */}
      <button className="mkp-fab" onClick={handleCreateOrder} title="Tạo đơn mới">
        +
      </button>

      {/* ─── Order Detail Drawer ─── */}
      {selectedOrder && (
        <OrderDetailDrawer
          order={selectedOrder}
          onClose={() => setSelectedOrder(null)}
          onAction={handleAction}
        />
      )}

      {/* ─── Click outside để đóng sort dropdown ─── */}
      {sortOpen && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 25 }}
          onClick={() => setSortOpen(false)}
        />
      )}

      {/* ─── Toast ─── */}
      <Toast msg={toast} />
    </div>
  );
}
