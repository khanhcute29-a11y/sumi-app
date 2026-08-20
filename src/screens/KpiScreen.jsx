import React, { useEffect, useMemo, useState } from 'react';
import { Tabs } from '../components/navigation/Tabs';
import { Card } from '../components/data/Card';
import { Button } from '../components/forms/Button';
import { IconClipboard } from '../components/icons/FrogIcons';
import {
  fetchOrders, fetchProductionLogs, fetchAllProfiles,
  fetchShiftLogsRange, fetchTasks, fetchApprovalRequests, fetchOrderStagesRange, fetchShiftConfigs,
} from '../lib/queries';
import { computeShipperKpi, computeKitchenKpi, computeShiftHours, computeAssignedTaskCount, computeLeaveDayCount, computeCoworkingHours } from '../lib/kpi';
import { hasAnyRole, hasRole } from '../lib/roles';
import { useAuth } from '../lib/AuthContext';
import { localDateStr, mondayOf, weekDates, startOfMonth, endOfMonth } from '../lib/date';

const KITCHEN_ROLES = ['kitchen', 'bakery', 'kitchen_lead', 'kitchen_deputy'];

function periodRangeFor(unit, anchor) {
  if (unit === 'day') {
    const s = localDateStr(anchor);
    return { from: s, to: s };
  }
  if (unit === 'week') {
    const days = weekDates(mondayOf(anchor));
    return { from: localDateStr(days[0]), to: localDateStr(days[6]) };
  }
  return { from: localDateStr(startOfMonth(anchor)), to: localDateStr(endOfMonth(anchor)) };
}

// Ca qua đêm ghi checkout sang ngày hôm sau, nên phải lấy shift_logs rộng hơn kỳ
// một ngày mỗi phía; việc lọc "ca bắt đầu trong kỳ" do computeShiftHours đảm nhiệm.
function shiftDateStr(dateStr, days) {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + days);
  return localDateStr(d);
}

function periodLabelFor(unit, anchor) {
  if (unit === 'day') return anchor.toLocaleDateString('vi-VN');
  if (unit === 'week') {
    const days = weekDates(mondayOf(anchor));
    return `${days[0].toLocaleDateString('vi-VN')} - ${days[6].toLocaleDateString('vi-VN')}`;
  }
  return `Tháng ${anchor.getMonth() + 1}/${anchor.getFullYear()}`;
}

function shiftAnchor(unit, anchor, dir) {
  const d = new Date(anchor);
  if (unit === 'day') { d.setDate(d.getDate() + dir); return d; }
  if (unit === 'week') { d.setDate(d.getDate() + dir * 7); return d; }
  d.setDate(1);
  d.setMonth(d.getMonth() + dir);
  return d;
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

function ExtendedKpiCard({ name, kpi }) {
  return (
    <Card style={{ flex: '1 1 240px' }}>
      <div style={{ font: 'var(--text-title)', color: 'var(--text-primary)', marginBottom: 10 }}>{name}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ font: 'var(--text-body)', color: 'var(--text-secondary)' }}>Tổng giờ làm: <b style={{ color: 'var(--text-primary)' }}>{kpi.hoursWorked}h</b></div>
        <div style={{ font: 'var(--text-body)', color: 'var(--text-secondary)' }}>
          Giờ tăng ca: <b style={{ color: 'var(--text-primary)' }}>{kpi.overtimeHours}h</b>
          {kpi.hasUnconfiguredShift && <span style={{ font: 'var(--text-caption)', color: 'var(--text-muted)' }}> (một số ca chưa cấu hình giờ kết thúc)</span>}
        </div>
        <div style={{ font: 'var(--text-body)', color: 'var(--text-secondary)' }}>Tổng việc được giao: <b style={{ color: 'var(--text-primary)' }}>{kpi.assignedTaskCount}</b></div>
        <div style={{ font: 'var(--text-body)', color: 'var(--text-secondary)' }}>Tổng ngày nghỉ: <b style={{ color: 'var(--text-primary)' }}>{kpi.leaveDayCount}</b></div>
        <div style={{ font: 'var(--text-body)', color: 'var(--text-secondary)' }}>Tổng giờ trễ: <b style={{ color: 'var(--text-primary)' }}>{kpi.lateHours}h</b></div>
        <div style={{ font: 'var(--text-body)', color: 'var(--text-secondary)' }}>Làm cùng nhau: <b style={{ color: 'var(--text-primary)' }}>{kpi.coworkingHours}h</b></div>
      </div>
    </Card>
  );
}

export default function KpiScreen() {
  const { profile } = useAuth();
  const [unit, setUnit] = useState('day');
  const [anchor, setAnchor] = useState(() => new Date());
  const [ordersByCreation, setOrdersByCreation] = useState([]);
  const [ordersByCompletion, setOrdersByCompletion] = useState([]);
  const [productionLogs, setProductionLogs] = useState([]);
  const [allProfiles, setAllProfiles] = useState([]);
  const [shiftLogs, setShiftLogs] = useState([]);
  const [shiftConfigs, setShiftConfigs] = useState([]);
  const [assignedTasks, setAssignedTasks] = useState([]);
  const [approvedLeaveRequests, setApprovedLeaveRequests] = useState([]);
  const [orderStages, setOrderStages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const isAdmin = hasAnyRole(profile, ['owner', 'admin']);
  const { from, to } = periodRangeFor(unit, anchor);

  useEffect(() => {
    setLoading(true);
    setError('');
    const loads = [
      fetchOrders({ from, to }),
      fetchOrders({ from, to, dateField: 'completed_at' }),
      fetchProductionLogs({ from, to }).catch(() => []),
      fetchShiftLogsRange(shiftDateStr(from, -1), shiftDateStr(to, 1)),
      fetchShiftConfigs(),
      fetchTasks({ category: 'assigned', createdFrom: from, createdTo: to }),
      fetchApprovalRequests({ status: 'approved', type: 'leave_request', leaveFrom: from, leaveTo: to }),
      fetchOrderStagesRange(from, to),
    ];
    if (isAdmin) loads.push(fetchAllProfiles());
    Promise.all(loads)
      .then(([ordersData, ordersCompletedData, logsData, shiftLogsData, shiftConfigsData, tasksData, leaveData, stagesData, profilesData]) => {
        setOrdersByCreation(ordersData);
        setOrdersByCompletion(ordersCompletedData);
        setProductionLogs(logsData);
        setShiftLogs(shiftLogsData);
        setShiftConfigs(shiftConfigsData);
        setAssignedTasks(tasksData);
        setApprovedLeaveRequests(leaveData);
        setOrderStages(stagesData);
        if (profilesData) setAllProfiles(profilesData);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to, isAdmin]);

  const kpiStaffList = useMemo(() => {
    if (!isAdmin) return [];
    return allProfiles.filter((p) => p.approved && p.active !== false && hasAnyRole(p, ['shipper', ...KITCHEN_ROLES]));
  }, [allProfiles, isAdmin]);

  const extendedStaffList = useMemo(() => {
    if (!isAdmin) return [];
    return allProfiles.filter((p) => p.approved && p.active !== false);
  }, [allProfiles, isAdmin]);

  function extendedKpiFor(staffId) {
    const shift = computeShiftHours(shiftLogs, shiftConfigs, staffId, from, to);
    return {
      ...shift,
      assignedTaskCount: computeAssignedTaskCount(assignedTasks, staffId),
      leaveDayCount: computeLeaveDayCount(approvedLeaveRequests, shiftLogs, staffId, from, to),
      coworkingHours: computeCoworkingHours(orderStages, staffId),
    };
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ font: 'var(--text-display-md)', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
        <IconClipboard size={22} /> KPI
      </div>

      <Tabs
        tabs={[
          { key: 'day', label: 'Ngày' },
          { key: 'week', label: 'Tuần' },
          { key: 'month', label: 'Tháng' },
        ]}
        active={unit}
        onChange={setUnit}
      />
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Button variant="ghost" size="sm" onClick={() => setAnchor((a) => shiftAnchor(unit, a, -1))}>‹</Button>
        <div style={{ font: 'var(--text-body)', color: 'var(--text-primary)' }}>{periodLabelFor(unit, anchor)}</div>
        <Button variant="ghost" size="sm" onClick={() => setAnchor((a) => shiftAnchor(unit, a, 1))}>›</Button>
      </div>

      {error ? (
        <div style={{ font: 'var(--text-body-sm)', color: 'var(--status-danger)' }}>Lỗi tải KPI: {error}</div>
      ) : loading ? (
        <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-muted)' }}>Đang tải...</div>
      ) : isAdmin ? (
        <>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
            {extendedStaffList.length === 0 && (
              <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-muted)' }}>Chưa có nhân viên nào.</div>
            )}
            {extendedStaffList.map((p) => (
              <ExtendedKpiCard key={p.id} name={p.full_name} kpi={extendedKpiFor(p.id)} />
            ))}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
            {kpiStaffList.map((p) => (
              <React.Fragment key={p.id}>
                {hasRole(p, 'shipper') && (
                  <ShipperKpiCard name={p.full_name} kpi={computeShipperKpi(ordersByCompletion, p.full_name)} />
                )}
                {hasAnyRole(p, KITCHEN_ROLES) && (
                  <KitchenKpiCard name={p.full_name} kpi={computeKitchenKpi(ordersByCreation, productionLogs, p.full_name)} />
                )}
              </React.Fragment>
            ))}
          </div>
        </>
      ) : (
        <>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
            <ExtendedKpiCard name={profile?.full_name} kpi={extendedKpiFor(profile?.id)} />
          </div>
          {(hasRole(profile, 'shipper') || hasAnyRole(profile, KITCHEN_ROLES)) && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
              {hasRole(profile, 'shipper') && (
                <ShipperKpiCard name={profile?.full_name} kpi={computeShipperKpi(ordersByCompletion, profile?.full_name)} />
              )}
              {hasAnyRole(profile, KITCHEN_ROLES) && (
                <KitchenKpiCard name={profile?.full_name} kpi={computeKitchenKpi(ordersByCreation, productionLogs, profile?.full_name)} />
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
