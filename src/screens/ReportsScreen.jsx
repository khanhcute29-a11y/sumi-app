import React, { useEffect, useState } from 'react';
import { Tabs } from '../components/navigation/Tabs';
import { StatCard } from '../components/data/StatCard';
import { Card } from '../components/data/Card';
import { Badge } from '../components/feedback/Badge';
import { Input } from '../components/forms/Input';
import { Button } from '../components/forms/Button';
import { fetchOrders } from '../lib/queries';
import { localDateStr } from '../lib/date';
import { downloadCsv } from '../lib/csv';
import { useAuth } from '../lib/AuthContext';
import { usePermissions } from '../lib/usePermissions';

const RANGE_DAYS = { today: 0, week: 7, month: 30 };

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

function computeReport(orders, from, to) {
  const inRange = orders.filter((o) => {
    const t = new Date(o.created_at);
    return t >= from && t <= to;
  });
  const completed = inRange.filter((o) => o.status !== 'huy');
  const revenue = completed.reduce((s, o) => s + Number(o.total || 0), 0);
  const cancelled = inRange.filter((o) => o.status === 'huy').length;
  const cancelRate = inRange.length ? Math.round((cancelled / inRange.length) * 100) : 0;
  const avgOrder = completed.length ? Math.round(revenue / completed.length) : 0;

  const productMap = new Map();
  completed.forEach((o) => {
    (o.order_items || []).forEach((it) => {
      const key = it.name;
      const cur = productMap.get(key) || { name: key, qty: 0, revenue: 0 };
      cur.qty += Number(it.qty) || 0;
      cur.revenue += (Number(it.qty) || 0) * (Number(it.price) || 0);
      productMap.set(key, cur);
    });
  });
  const topProducts = [...productMap.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 5);

  const channelMap = new Map();
  completed.forEach((o) => {
    const key = o.channel || 'Khác';
    channelMap.set(key, (channelMap.get(key) || 0) + Number(o.total || 0));
  });
  const channels = [...channelMap.entries()]
    .map(([name, amount]) => ({ name, amount }))
    .sort((a, b) => b.amount - a.amount)
    .map((c) => ({ ...c, pct: revenue ? Math.round((c.amount / revenue) * 100) : 0 }));

  const kitchenMap = new Map();
  const shipperMap = new Map();
  inRange.forEach((o) => {
    if (o.kitchen_staff_name) kitchenMap.set(o.kitchen_staff_name, (kitchenMap.get(o.kitchen_staff_name) || 0) + 1);
    if (o.shipper_staff_name) shipperMap.set(o.shipper_staff_name, (shipperMap.get(o.shipper_staff_name) || 0) + 1);
  });
  const kitchenStaff = [...kitchenMap.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
  const shipperStaff = [...shipperMap.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);

  return {
    stats: [
      { label: 'Doanh thu', value: `${revenue.toLocaleString('vi-VN')}đ`, tone: 'success', icon: '💰' },
      { label: 'Đơn hàng', value: String(inRange.length), tone: 'neutral', icon: '📦' },
      { label: 'Giá trị TB / đơn', value: `${avgOrder.toLocaleString('vi-VN')}đ`, tone: 'neutral', icon: '🧾' },
      { label: 'Tỷ lệ hủy', value: `${cancelRate}%`, tone: cancelRate > 10 ? 'danger' : 'neutral', icon: '⛔' },
    ],
    topProducts,
    channels,
    kitchenStaff,
    shipperStaff,
    inRange,
  };
}

function exportOrdersCsv(orders) {
  const headers = ['Mã đơn', 'Khách hàng', 'SĐT', 'Kênh', 'Trạng thái', 'Tổng tiền', 'Phí ship', 'Thanh toán', 'Ngày tạo'];
  const rows = orders.map((o) => [
    o.order_code || '', o.customer?.name || 'Khách lẻ', o.customer?.phone || '', o.channel || '',
    o.status, Number(o.total || 0), Number(o.ship_fee || 0), o.payment_method || '',
    new Date(o.created_at).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }),
  ]);
  downloadCsv(`sumi-don-hang-${localDateStr()}.csv`, headers, rows);
}

function StaffList({ title, icon, items, unit }) {
  return (
    <Card style={{ flex: '1 1 240px' }}>
      <div style={{ font: 'var(--text-title)', color: 'var(--text-primary)', marginBottom: 12 }}>{icon} {title}</div>
      {items.length === 0 ? (
        <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-muted)' }}>Chưa có dữ liệu trong khoảng thời gian này.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {items.map((s, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Badge tone={i === 0 ? 'primary' : 'neutral'}>#{i + 1}</Badge>
                <div style={{ font: 'var(--text-body)', color: 'var(--text-primary)' }}>{s.name}</div>
              </div>
              <div style={{ font: 'var(--text-label)', color: 'var(--text-primary)' }}>{s.count} {unit}</div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

export default function ReportsScreen() {
  const { profile } = useAuth();
  const permissions = usePermissions();
  const [range, setRange] = useState('today');
  const today = localDateStr();
  const [customFrom, setCustomFrom] = useState(today);
  const [customTo, setCustomTo] = useState(today);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Check if user can view reports
  const canViewReports = permissions.canViewReports;
  const canViewRevenue = permissions.canViewRevenue;
  const canViewAllReports = permissions.canViewAllReports;

  useEffect(() => {
    if (!canViewReports) {
      setError('Bạn không có quyền xem báo cáo');
      setLoading(false);
      return;
    }
    fetchOrders()
      .then((data) => { setOrders(data); setError(''); })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [canViewReports]);

  const { from, to } = rangeFor(range, customFrom, customTo);
  const data = computeReport(orders, from, to);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div style={{ font: 'var(--text-display-md)', color: 'var(--text-primary)' }}>Báo Cáo</div>
          <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-muted)' }}>Tổng quan doanh thu, sản phẩm bán chạy, kênh bán hàng và năng suất Bếp/Vận chuyển — tính trực tiếp từ dữ liệu đơn hàng</div>
        </div>
        {!loading && <Button variant="secondary" size="sm" onClick={() => exportOrdersCsv(data.inRange)} disabled={data.inRange.length === 0}>⬇ Xuất CSV đơn hàng</Button>}
      </div>
      <Tabs tabs={[{ key: 'today', label: 'Hôm nay' }, { key: 'week', label: '7 ngày qua' }, { key: 'month', label: '30 ngày qua' }, { key: 'custom', label: 'Tùy chỉnh ngày' }]} active={range} onChange={setRange} />
      {range === 'custom' && (
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', maxWidth: 420 }}>
          <Input label="Từ ngày" type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} style={{ flex: 1 }} />
          <Input label="Đến ngày" type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} style={{ flex: 1 }} />
        </div>
      )}
      {error && <div style={{ font: 'var(--text-body-sm)', color: 'var(--status-danger)' }}>Lỗi tải báo cáo: {error}</div>}
      {loading ? (
        <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-muted)' }}>Đang tải...</div>
      ) : (
        <React.Fragment>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {data.stats.map((s, i) => {
              // Hide revenue/cost/profit stats for non-admin users
              if (!canViewRevenue && ['Doanh thu', 'Chi phí', 'Lợi nhuận'].includes(s.label)) {
                return null;
              }
              return (
                <StatCard key={i} label={s.label} value={s.value} tone={s.tone} icon={s.icon} style={{ flex: 1, minWidth: 180 }} />
              );
            })}
          </div>
          {canViewRevenue && (
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              <Card style={{ flex: '2 1 320px' }}>
                <div style={{ font: 'var(--text-title)', color: 'var(--text-primary)', marginBottom: 12 }}>Sản phẩm bán chạy</div>
                {data.topProducts.length === 0 ? (
                  <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-muted)' }}>Chưa có dữ liệu trong khoảng thời gian này.</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {data.topProducts.map((p, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <Badge tone="neutral">#{i + 1}</Badge>
                          <div>
                            <div style={{ font: 'var(--text-body)', color: 'var(--text-primary)' }}>{p.name}</div>
                            <div style={{ font: 'var(--text-caption)', color: 'var(--text-muted)' }}>{p.qty} sản phẩm</div>
                          </div>
                        </div>
                        <div style={{ font: 'var(--text-label)', color: 'var(--text-primary)' }}>{p.revenue.toLocaleString('vi-VN')}đ</div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
              <Card style={{ flex: '1 1 240px' }}>
                <div style={{ font: 'var(--text-title)', color: 'var(--text-primary)', marginBottom: 12 }}>Doanh thu theo kênh</div>
                {data.channels.length === 0 ? (
                  <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-muted)' }}>Chưa có dữ liệu.</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {data.channels.map((c, i) => (
                      <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', font: 'var(--text-body-sm)', color: 'var(--text-secondary)' }}>
                          <span>{c.name}</span><span>{c.pct}%</span>
                        </div>
                        <div style={{ height: 8, borderRadius: 'var(--radius-pill)', background: 'var(--surface-sunken)', overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${c.pct}%`, borderRadius: 'var(--radius-pill)', background: 'var(--action-primary)' }} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </div>
          )}
          {canViewAllReports && (
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              <StaffList title="Bếp — theo nhân viên" icon="👨‍🍳" items={data.kitchenStaff} unit="đơn nhận làm" />
              <StaffList title="Vận chuyển — theo nhân viên" icon="🚚" items={data.shipperStaff} unit="đơn đã giao" />
            </div>
          )}
        </React.Fragment>
      )}
    </div>
  );
}
