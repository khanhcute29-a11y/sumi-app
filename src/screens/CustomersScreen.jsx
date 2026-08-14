import React, { useEffect, useState } from 'react';
import { Input } from '../components/forms/Input';
import { Tabs } from '../components/navigation/Tabs';
import { Badge } from '../components/feedback/Badge';
import { TrustScoreBadge } from '../components/feedback/TrustScoreBadge';
import { Card } from '../components/data/Card';
import { fetchCustomers, fetchOrders } from '../lib/queries';
import { formatOrderItemLine } from '../lib/cakePricing';
import { formatDeliveryDateTime } from '../lib/date';
import { IconStar, IconClock } from '../components/icons/FrogIcons';

const STATUS_LABELS = { moi: 'Mới', dang_lam: 'Đang làm', cho_giao: 'Chờ giao', dang_giao: 'Đang giao', hoan_thanh: 'Hoàn thành', huy: 'Đã huỷ' };

function CustomerDetailModal({ customer, orders, onClose }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'var(--surface-overlay)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60, padding: 16 }} onClick={onClose}>
      <div style={{ background: 'var(--surface-card)', borderRadius: 'var(--radius-lg)', width: 480, maxWidth: '100%', maxHeight: '86vh', overflowY: 'auto', padding: 20, boxShadow: 'var(--shadow-lg)', display: 'flex', flexDirection: 'column', gap: 12 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
          <div>
            <div style={{ font: 'var(--text-title)', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
              {customer.name}{customer.vip && <Badge tone="primary" icon={<IconStar size={13} />}>VIP</Badge>}
            </div>
            <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-muted)' }}>{customer.phone || '—'} · {customer.channel || '—'}</div>
          </div>
          <button onClick={onClose} style={{ border: 'none', background: 'none', color: 'var(--text-muted)', fontSize: 18, cursor: 'pointer' }}>✕</button>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <TrustScoreBadge score={customer.trust_score} locked={customer.locked} noData={orders.length === 0} />
          {customer.locked && <Badge tone="danger">Khoá COD</Badge>}
        </div>
        {customer.note && <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-secondary)', background: 'var(--surface-sunken)', borderRadius: 'var(--radius-sm)', padding: '8px 10px' }}>Ghi chú: {customer.note}</div>}
        <div style={{ font: 'var(--text-label)', color: 'var(--text-primary)', paddingTop: 4, borderTop: '1px solid var(--border-subtle)' }}>
          Lịch sử đơn hàng ({orders.length})
        </div>
        {orders.length === 0 ? (
          <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-muted)' }}>Khách chưa có đơn hàng nào.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {orders.map((o) => (
              <div key={o.id} style={{ background: 'var(--surface-sunken)', borderRadius: 'var(--radius-md)', padding: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                  <span style={{ font: 'var(--text-label)', color: 'var(--text-primary)' }}>{o.order_code}</span>
                  <Badge tone={o.status === 'huy' ? 'danger' : o.status === 'hoan_thanh' ? 'success' : 'neutral'}>{STATUS_LABELS[o.status] || o.status}</Badge>
                </div>
                <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-secondary)' }}>
                  {(o.order_items || []).map((it) => formatOrderItemLine(it, { withQty: true })).join(', ') || 'Không có sản phẩm'}
                </div>
                <div style={{ font: 'var(--text-caption)', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <IconClock size={12} />{formatDeliveryDateTime(o.delivery_date, o.delivery_time) || '—'}
                  {o.address ? ` · ${o.address}` : ''}
                </div>
                <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-primary)', fontWeight: 700 }}>{Number(o.total || 0).toLocaleString('vi-VN')}đ</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function CustomerRow({ c, onOpen }) {
  return (
    <Card style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', cursor: 'pointer' }} padding={14} onClick={() => onOpen(c)}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 180 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ font: 'var(--text-label)', color: 'var(--text-primary)' }}>{c.name}</span>
          {c.vip && <Badge tone="primary" icon={<IconStar size={13} />}>VIP</Badge>}
        </div>
        <div style={{ font: 'var(--text-caption)', color: 'var(--text-muted)' }}>{c.phone || '—'} · {c.channel || '—'}</div>
      </div>
      <div style={{ display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ textAlign: 'right' }}>
          <div style={{ font: 'var(--text-label)', color: 'var(--text-primary)' }}>{c.orderCount} đơn</div>
          <div style={{ font: 'var(--text-caption)', color: 'var(--text-muted)' }}>{c.lastOrder ? `Lần cuối ${c.lastOrder}` : 'Chưa có đơn'}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ font: 'var(--text-label)', color: 'var(--text-primary)' }}>{c.spent.toLocaleString('vi-VN')}đ</div>
          <div style={{ font: 'var(--text-caption)', color: 'var(--text-muted)' }}>Tổng chi tiêu</div>
        </div>
        <TrustScoreBadge score={c.trust_score} locked={c.locked} noData={c.orderCount === 0} />
      </div>
    </Card>
  );
}

export default function CustomersScreen() {
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [customers, setCustomers] = useState([]);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchCustomers(), fetchOrders()])
      .then(([customerRows, orderRows]) => {
        const merged = customerRows.map((c) => {
          const own = orderRows.filter((o) => o.customer_id === c.id);
          const spent = own.reduce((s, o) => s + Number(o.total || 0), 0);
          const lastOrder = own[0] ? new Date(own[0].created_at).toLocaleDateString('vi-VN') : null;
          return { ...c, orderCount: own.length, spent, lastOrder };
        });
        setCustomers(merged);
        setOrders(orderRows);
        setError('');
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const filtered = customers
    .filter((c) => (filter === 'vip' ? c.vip : filter === 'locked' ? c.locked : true))
    .filter((c) => c.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <div style={{ font: 'var(--text-display-md)', color: 'var(--text-primary)' }}>Khách Hàng</div>
        <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-muted)' }}>Danh sách khách hàng, điểm tin cậy và lịch sử mua hàng</div>
      </div>
      <Input placeholder="Tìm khách hàng theo tên..." value={search} onChange={(e) => setSearch(e.target.value)} />
      <Tabs tabs={[{ key: 'all', label: 'Tất cả' }, { key: 'vip', label: 'VIP' }, { key: 'locked', label: 'Khóa COD' }]} active={filter} onChange={setFilter} />
      {error && <div style={{ font: 'var(--text-body-sm)', color: 'var(--status-danger)' }}>Lỗi tải khách hàng: {error}</div>}
      {loading ? (
        <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-muted)' }}>Đang tải...</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {filtered.map((c) => <CustomerRow key={c.id} c={c} onOpen={setSelected} />)}
          {filtered.length === 0 && <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-muted)', padding: 16 }}>Không tìm thấy khách hàng phù hợp.</div>}
        </div>
      )}
      {selected && (
        <CustomerDetailModal customer={selected} orders={orders.filter((o) => o.customer_id === selected.id)} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}
