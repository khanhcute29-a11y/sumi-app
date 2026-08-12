import React, { useEffect, useState } from 'react';
import { Tabs } from '../components/navigation/Tabs';
import { StatCard } from '../components/data/StatCard';
import { Card } from '../components/data/Card';
import { Badge } from '../components/feedback/Badge';
import { Input } from '../components/forms/Input';
import { fetchOrders, fetchWarehouseStock } from '../lib/queries';
import { useAuth } from '../lib/AuthContext';
import { localDateStr } from '../lib/date';

const RANGE_DAYS = { today: 0, week: 7, month: 30 };
const STATUS_LABELS = { moi: 'Mới', dang_lam: 'Đang làm', cho_giao: 'Chờ giao', dang_giao: 'Đang giao', hoan_thanh: 'Hoàn thành', huy: 'Đã huỷ' };

function rangeFor(preset, customFrom, customTo) {
  const now = new Date();
  if (preset === 'custom') {
    const from = customFrom ? new Date(`${customFrom}T00:00:00`) : new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const to = customTo ? new Date(`${customTo}T23:59:59.999`) : now;
    return { from, to };
  }
  const days = RANGE_DAYS[preset] ?? 0;
  const from = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  from.setDate(from.getDate() - days);
  return { from, to: now };
}

const OP_FILTERS = [
  { key: 'all', label: 'Tất cả', icon: '📦', match: () => true },
  { key: 'processing', label: 'Đang xử lý', icon: '🔥', match: (o) => o.status === 'moi' || o.status === 'dang_lam' },
  { key: 'shipping', label: 'Đang giao', icon: '🚚', match: (o) => o.status === 'cho_giao' || o.status === 'dang_giao' },
  { key: 'done', label: 'Hoàn thành', icon: '✅', match: (o) => o.status === 'hoan_thanh' },
];

function OrderRow({ order }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--border-subtle)' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <div style={{ font: 'var(--text-body)', color: 'var(--text-primary)' }}>{order.customer?.name || 'Khách lẻ'} {order.order_code && <span style={{ color: 'var(--text-muted)' }}>· {order.order_code}</span>}</div>
        <div style={{ font: 'var(--text-caption)', color: 'var(--text-muted)' }}>{order.channel || '—'}</div>
      </div>
      <Badge tone="neutral">{STATUS_LABELS[order.status] || order.status}</Badge>
    </div>
  );
}

export default function DashboardScreen() {
  const { profile } = useAuth();
  const isOwner = profile?.role === 'owner';
  const [range, setRange] = useState('today');
  const today = localDateStr();
  const [customFrom, setCustomFrom] = useState(today);
  const [customTo, setCustomTo] = useState(today);
  const [orders, setOrders] = useState([]);
  const [stock, setStock] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeFilter, setActiveFilter] = useState('all');

  useEffect(() => {
    Promise.all([fetchOrders(), fetchWarehouseStock()])
      .then(([o, s]) => { setOrders(o); setStock(s); setError(''); })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const { from, to } = rangeFor(range, customFrom, customTo);
  const inRange = orders.filter((o) => { const t = new Date(o.created_at); return t >= from && t <= to; });
  const completed = inRange.filter((o) => o.status !== 'huy');
  const revenue = completed.reduce((s, o) => s + Number(o.total || 0), 0);
  const cancelled = inRange.filter((o) => o.status === 'huy').length;
  const cancelRate = inRange.length ? Math.round((cancelled / inRange.length) * 100) : 0;
  const avgOrder = completed.length ? Math.round(revenue / completed.length) : 0;

  const expiringStock = stock.filter((s) => s.status === 'soon' || s.status === 'expired');

  const opFilters = [...OP_FILTERS, { key: 'expiring', label: 'Sắp hết hạn', icon: '⚠', match: () => false }];
  const opCounts = opFilters.map((f) => ({ ...f, count: f.key === 'expiring' ? expiringStock.length : inRange.filter(f.match).length }));

  const filteredOrders = activeFilter === 'expiring' ? [] : inRange.filter(opFilters.find((f) => f.key === activeFilter)?.match || (() => true));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <div style={{ font: 'var(--text-display-md)', color: 'var(--text-primary)' }}>Tổng Quan</div>
        <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-muted)' }}>
          {isOwner ? 'Tình hình vận hành & tài chính theo thời gian thực' : 'Tình hình vận hành theo thời gian thực'}
        </div>
      </div>

      <Tabs tabs={[{ key: 'today', label: 'Hôm nay' }, { key: 'week', label: '7 ngày qua' }, { key: 'month', label: '30 ngày qua' }, { key: 'custom', label: 'Tùy chỉnh ngày' }]} active={range} onChange={setRange} />
      {range === 'custom' && (
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', maxWidth: 420 }}>
          <Input label="Từ ngày" type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} style={{ flex: 1 }} />
          <Input label="Đến ngày" type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} style={{ flex: 1 }} />
        </div>
      )}

      {error && <div style={{ font: 'var(--text-body-sm)', color: 'var(--status-danger)' }}>Lỗi tải dữ liệu: {error}</div>}

      {loading ? (
        <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-muted)' }}>Đang tải...</div>
      ) : (
        <React.Fragment>
          {isOwner && (
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <StatCard label="Doanh thu" value={`${revenue.toLocaleString('vi-VN')}đ`} tone="success" icon="💰" style={{ flex: 1, minWidth: 180 }} />
              <StatCard label="Đơn hàng" value={String(inRange.length)} tone="neutral" icon="📦" style={{ flex: 1, minWidth: 180 }} />
              <StatCard label="Giá trị TB / đơn" value={`${avgOrder.toLocaleString('vi-VN')}đ`} tone="neutral" icon="🧾" style={{ flex: 1, minWidth: 180 }} />
              <StatCard label="Tỷ lệ hủy" value={`${cancelRate}%`} tone={cancelRate > 10 ? 'danger' : 'neutral'} icon="⛔" style={{ flex: 1, minWidth: 180 }} />
            </div>
          )}

          <div>
            <div style={{ font: 'var(--text-title)', color: 'var(--text-primary)', marginBottom: 10 }}>Trạng thái vận hành</div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              {opCounts.map((f) => {
                const active = activeFilter === f.key;
                return (
                  <button key={f.key} onClick={() => setActiveFilter(f.key)} style={{
                    flex: '1 1 160px', textAlign: 'left', cursor: 'pointer',
                    border: active ? '2px solid var(--action-primary)' : '1px solid var(--border-subtle)',
                    background: 'var(--surface-card)', borderRadius: 'var(--radius-lg)', padding: 16,
                    display: 'flex', flexDirection: 'column', gap: 6, boxShadow: 'var(--shadow-sm)',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, font: 'var(--text-label)', color: 'var(--text-secondary)' }}>
                      <span aria-hidden="true">{f.icon}</span>{f.label}
                    </div>
                    <div style={{ font: 'var(--text-display-md)', color: f.key === 'expiring' && f.count > 0 ? 'var(--status-danger)' : 'var(--text-primary)' }}>{f.count}</div>
                  </button>
                );
              })}
            </div>
          </div>

          <Card>
            <div style={{ font: 'var(--text-title)', color: 'var(--text-primary)', marginBottom: 12 }}>
              {opFilters.find((f) => f.key === activeFilter)?.label || 'Đơn hàng'}
            </div>
            {activeFilter === 'expiring' ? (
              expiringStock.length === 0 ? (
                <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-muted)' }}>Không có nguyên liệu sắp hết hạn.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {expiringStock.map((s) => (
                    <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--border-subtle)' }}>
                      <div style={{ font: 'var(--text-body)', color: 'var(--text-primary)' }}>{s.name}</div>
                      <Badge tone={s.status === 'expired' ? 'danger' : 'warning'}>{s.status === 'expired' ? 'Quá hạn' : 'Sắp hết hạn'}</Badge>
                    </div>
                  ))}
                </div>
              )
            ) : filteredOrders.length === 0 ? (
              <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-muted)' }}>Không có đơn nào trong khoảng thời gian này.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {filteredOrders.slice(0, 30).map((o) => <OrderRow key={o.id} order={o} />)}
              </div>
            )}
          </Card>
        </React.Fragment>
      )}
    </div>
  );
}
