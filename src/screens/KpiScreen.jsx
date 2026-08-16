import React, { useEffect, useMemo, useState } from 'react';
import { Tabs } from '../components/navigation/Tabs';
import { Card } from '../components/data/Card';
import { Input } from '../components/forms/Input';
import { IconClipboard } from '../components/icons/FrogIcons';
import { fetchOrders, fetchProductionLogs, fetchAllProfiles } from '../lib/queries';
import { computeShipperKpi, computeKitchenKpi } from '../lib/kpi';
import { hasAnyRole, hasRole } from '../lib/roles';
import { useAuth } from '../lib/AuthContext';
import { localDateStr } from '../lib/date';

const RANGE_DAYS = { today: 0, week: 7, month: 30 };
const KITCHEN_ROLES = ['kitchen', 'bakery', 'kitchen_lead', 'kitchen_deputy'];

function rangeFor(preset, customFrom, customTo) {
  const todayStr = localDateStr();
  if (preset === 'custom') return { from: customFrom || todayStr, to: customTo || todayStr };
  const days = RANGE_DAYS[preset] ?? 0;
  const fromDate = new Date();
  fromDate.setDate(fromDate.getDate() - days);
  return { from: localDateStr(fromDate), to: todayStr };
}

function ShipperKpiCard({ name, kpi }) {
  return (
    <Card style={{ flex: '1 1 240px' }}>
      <div style={{ font: 'var(--text-title)', color: 'var(--text-primary)', marginBottom: 10 }}>{name}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ font: 'var(--text-body)', color: 'var(--text-secondary)' }}>Số đơn đã giao: <b style={{ color: 'var(--text-primary)' }}>{kpi.orderCount}</b></div>
        <div style={{ font: 'var(--text-body)', color: 'var(--text-secondary)' }}>Tổng km đã chạy: <b style={{ color: 'var(--text-primary)' }}>{kpi.totalKm} km</b></div>
      </div>
    </Card>
  );
}

function KitchenKpiCard({ name, kpi }) {
  return (
    <Card style={{ flex: '1 1 240px' }}>
      <div style={{ font: 'var(--text-title)', color: 'var(--text-primary)', marginBottom: 10 }}>{name}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ font: 'var(--text-body)', color: 'var(--text-secondary)' }}>Số đơn đã làm: <b style={{ color: 'var(--text-primary)' }}>{kpi.orderCount}</b></div>
        <div style={{ font: 'var(--text-body)', color: 'var(--text-secondary)' }}>SP từ đơn: <b style={{ color: 'var(--text-primary)' }}>{kpi.productsFromOrders}</b></div>
        <div style={{ font: 'var(--text-body)', color: 'var(--text-secondary)' }}>SP sản xuất: <b style={{ color: 'var(--text-primary)' }}>{kpi.productsProduced}</b></div>
      </div>
    </Card>
  );
}

export default function KpiScreen() {
  const { profile } = useAuth();
  const [range, setRange] = useState('today');
  const today = localDateStr();
  const [customFrom, setCustomFrom] = useState(today);
  const [customTo, setCustomTo] = useState(today);
  const [orders, setOrders] = useState([]);
  const [productionLogs, setProductionLogs] = useState([]);
  const [allProfiles, setAllProfiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const isAdmin = hasAnyRole(profile, ['owner', 'admin']);
  const { from, to } = rangeFor(range, customFrom, customTo);

  useEffect(() => {
    setLoading(true);
    setError('');
    const loads = [fetchOrders({ from, to }), fetchProductionLogs({ from, to })];
    if (isAdmin) loads.push(fetchAllProfiles());
    Promise.all(loads)
      .then(([ordersData, logsData, profilesData]) => {
        setOrders(ordersData);
        setProductionLogs(logsData);
        if (profilesData) setAllProfiles(profilesData);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to, isAdmin]);

  const kpiStaffList = useMemo(() => {
    if (!isAdmin) return [];
    return allProfiles.filter((p) => hasAnyRole(p, ['shipper', ...KITCHEN_ROLES]));
  }, [allProfiles, isAdmin]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ font: 'var(--text-display-md)', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
        <IconClipboard size={22} /> KPI
      </div>

      <Tabs
        tabs={[
          { key: 'today', label: 'Hôm nay' },
          { key: 'week', label: '7 ngày qua' },
          { key: 'month', label: '30 ngày qua' },
          { key: 'custom', label: 'Tùy chỉnh ngày' },
        ]}
        active={range}
        onChange={setRange}
      />
      {range === 'custom' && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Input label="Từ ngày" type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} style={{ flex: 1 }} />
          <Input label="Đến ngày" type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} style={{ flex: 1 }} />
        </div>
      )}

      {error && <div style={{ font: 'var(--text-body-sm)', color: 'var(--status-danger)' }}>Lỗi tải KPI: {error}</div>}
      {loading ? (
        <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-muted)' }}>Đang tải...</div>
      ) : isAdmin ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
          {kpiStaffList.length === 0 && (
            <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-muted)' }}>Chưa có nhân viên nào ở vai trò có KPI.</div>
          )}
          {kpiStaffList.map((p) =>
            hasRole(p, 'shipper') ? (
              <ShipperKpiCard key={p.id} name={p.full_name} kpi={computeShipperKpi(orders, p.full_name)} />
            ) : (
              <KitchenKpiCard key={p.id} name={p.full_name} kpi={computeKitchenKpi(orders, productionLogs, p.full_name)} />
            )
          )}
        </div>
      ) : hasRole(profile, 'shipper') ? (
        <ShipperKpiCard name={profile?.full_name} kpi={computeShipperKpi(orders, profile?.full_name)} />
      ) : hasAnyRole(profile, KITCHEN_ROLES) ? (
        <KitchenKpiCard name={profile?.full_name} kpi={computeKitchenKpi(orders, productionLogs, profile?.full_name)} />
      ) : (
        <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-muted)' }}>Vai trò của bạn chưa có chỉ số KPI.</div>
      )}
    </div>
  );
}
