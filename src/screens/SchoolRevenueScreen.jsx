import React, { useEffect, useMemo, useState } from 'react';
import { Tabs } from '../components/navigation/Tabs';
import { Card } from '../components/data/Card';
import { StatCard } from '../components/data/StatCard';
import { Button } from '../components/forms/Button';
import { useAuth } from '../lib/AuthContext';
import { hasAnyRole } from '../lib/roles';
import { fetchSchoolRevenue } from '../lib/queries';
import { localDateStr, periodRangeFor, periodLabelFor, shiftAnchor } from '../lib/date';
import { IconMoney } from '../components/icons/FrogIcons';

const vnd = (n) => `${Math.round(n || 0).toLocaleString('vi-VN')}đ`;

export default function SchoolRevenueScreen() {
  const { profile } = useAuth();
  const canView = hasAnyRole(profile, ['owner', 'admin']);
  const [unit, setUnit] = useState('month');
  const [anchor, setAnchor] = useState(() => new Date());
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const { from, to } = unit === 'year'
    ? periodRangeFor('year', anchor)
    : periodRangeFor(unit, anchor);

  useEffect(() => {
    if (!canView) return;
    setLoading(true); setError('');
    fetchSchoolRevenue({ from, to })
      .then(setOrders)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [from, to, canView]);

  const total = useMemo(() => orders.reduce((s, o) => s + Number(o.total || 0), 0), [orders]);

  const buckets = useMemo(() => {
    const map = new Map();
    if (unit === 'year') {
      for (let m = 0; m < 12; m++) map.set(m, { label: `Tháng ${m + 1}`, total: 0, count: 0 });
      orders.forEach((o) => {
        const m = new Date(o.created_at).getMonth();
        const b = map.get(m);
        b.total += Number(o.total || 0);
        b.count += 1;
      });
      return Array.from(map.values());
    }
    // ngày/tuần/tháng — nhóm theo ngày trong khoảng
    orders.forEach((o) => {
      const key = localDateStr(new Date(o.created_at));
      if (!map.has(key)) map.set(key, { label: new Date(o.created_at).toLocaleDateString('vi-VN'), total: 0, count: 0, key });
      const b = map.get(key);
      b.total += Number(o.total || 0);
      b.count += 1;
    });
    return Array.from(map.values()).sort((a, b) => a.key.localeCompare(b.key));
  }, [orders, unit]);

  if (!canView) {
    return (
      <div style={{ padding: 30, textAlign: 'center', font: 'var(--text-body)', color: 'var(--text-muted)' }}>
        🔒 Chỉ Giám đốc và Quản lý điều hành xem được doanh thu Trường học.
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ font: 'var(--text-display-md)', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
        <IconMoney size={22} /> Doanh Thu Trường Học
      </div>

      <Tabs
        tabs={[
          { key: 'day', label: 'Ngày' },
          { key: 'week', label: 'Tuần' },
          { key: 'month', label: 'Tháng' },
          { key: 'year', label: 'Cả năm' },
        ]}
        active={unit}
        onChange={setUnit}
      />

      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Button variant="ghost" size="sm" onClick={() => setAnchor((a) => shiftAnchor(unit, a, -1))}>‹</Button>
        <div style={{ font: 'var(--text-body)', color: 'var(--text-primary)' }}>{periodLabelFor(unit, anchor)}</div>
        <Button variant="ghost" size="sm" onClick={() => setAnchor((a) => shiftAnchor(unit, a, 1))}>›</Button>
        <Button variant="secondary" size="sm" onClick={() => setAnchor(new Date())} style={{ marginLeft: 'auto' }}>Hôm nay</Button>
      </div>

      {error && <div style={{ font: 'var(--text-body-sm)', color: 'var(--status-danger)' }}>Lỗi: {error}</div>}

      {loading ? (
        <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-muted)' }}>Đang tải...</div>
      ) : (
        <>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
            <StatCard label="Doanh thu" value={vnd(total)} tone="success" icon={<IconMoney size={18} />} style={{ flex: 1, minWidth: 180 }} />
            <StatCard label="Số đơn" value={orders.length} style={{ flex: 1, minWidth: 140 }} />
            <StatCard label="TB/đơn" value={vnd(orders.length ? total / orders.length : 0)} style={{ flex: 1, minWidth: 160 }} />
          </div>

          <Card>
            <div style={{ font: 'var(--text-label)', color: 'var(--text-primary)', marginBottom: 8 }}>
              {unit === 'year' ? 'Theo tháng' : 'Theo ngày'}
            </div>
            {buckets.every((b) => b.count === 0) ? (
              <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-muted)', padding: 12, textAlign: 'center' }}>
                Không có đơn trường học trong kỳ này.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {buckets.map((b, i) => (
                  <div key={b.key || i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, padding: '8px 0', borderBottom: '1px solid var(--border-subtle)' }}>
                    <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-primary)' }}>{b.label}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ font: 'var(--text-caption)', color: 'var(--text-muted)' }}>{b.count} đơn</span>
                      <span style={{ font: 'var(--text-body-sm)', fontWeight: 700, color: b.total > 0 ? 'var(--status-success)' : 'var(--text-muted)' }}>{vnd(b.total)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {unit === 'day' && orders.length > 0 && (
            <Card>
              <div style={{ font: 'var(--text-label)', color: 'var(--text-primary)', marginBottom: 8 }}>Chi tiết đơn</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {orders.map((o) => (
                  <div key={o.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--border-subtle)' }}>
                    <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-primary)' }}>#{o.order_code || '—'} · {o.address || 'Chưa có địa chỉ'}</div>
                    <div style={{ font: 'var(--text-body-sm)', fontWeight: 700 }}>{vnd(o.total)}</div>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
