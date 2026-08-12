import React, { useEffect, useState } from 'react';
import { Input } from '../components/forms/Input';
import { Tabs } from '../components/navigation/Tabs';
import { Badge } from '../components/feedback/Badge';
import { TrustScoreBadge } from '../components/feedback/TrustScoreBadge';
import { Card } from '../components/data/Card';
import { fetchCustomers, fetchOrders } from '../lib/queries';
import { IconStar } from '../components/icons/FrogIcons';

function CustomerRow({ c }) {
  return (
    <Card style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }} padding={14}>
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

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
          {filtered.map((c) => <CustomerRow key={c.id} c={c} />)}
          {filtered.length === 0 && <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-muted)', padding: 16 }}>Không tìm thấy khách hàng phù hợp.</div>}
        </div>
      )}
    </div>
  );
}
