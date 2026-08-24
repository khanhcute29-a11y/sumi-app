import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { calculatePackageMetrics, calculateStaffKPI, formatDuration } from '../lib/kpiCalculations';

export default function KpiDashboardScreen() {
  const [staffKPIs, setStaffKPIs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [period, setPeriod] = useState('all'); // all, today, week, month
  const [viewType, setViewType] = useState('staff'); // staff, trends

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      // Calculate date range
      let dateFilter = new Date(0); // all time
      if (period === 'today') {
        dateFilter = new Date();
        dateFilter.setHours(0, 0, 0, 0);
      } else if (period === 'week') {
        dateFilter = new Date();
        dateFilter.setDate(dateFilter.getDate() - 7);
      } else if (period === 'month') {
        dateFilter = new Date();
        dateFilter.setMonth(dateFilter.getMonth() - 1);
      }

      // Load all completed work packages with orders
      const { data: packages, error: err } = await supabase
        .from('order_work_packages_readable')
        .select(`
          id,
          accepted_at,
          completed_at,
          organization_units(name,code),
          orders!inner(id, order_code, customer_name, order_type, created_at, required_at)
        `)
        .gte('completed_at', dateFilter.toISOString())
        .order('completed_at', { ascending: false });

      if (err) throw err;

      // Enrich with metrics
      const enriched = (packages || []).map(pkg => ({
        ...pkg,
        metrics: calculatePackageMetrics(pkg, pkg.orders)
      }));

      // Group by staff
      const byStaff = {};
      enriched.forEach(pkg => {
        const staffId = pkg.assigned_to_staff_id;
        const staffName = pkg.assigned_to_staff_name;
        if (!byStaff[staffId]) {
          byStaff[staffId] = {
            staffId,
            staffName,
            tasks: []
          };
        }
        byStaff[staffId].tasks.push(pkg);
      });

      // Calculate KPI for each staff
      const kpis = Object.values(byStaff)
        .map(staff => ({
          ...staff,
          kpi: calculateStaffKPI(staff.tasks)
        }))
        .sort((a, b) => (b.kpi?.onTimeRate || 0) - (a.kpi?.onTimeRate || 0));

      setStaffKPIs(kpis);
    } catch (err) {
      setError(err?.message || 'Không tải được dữ liệu KPI');
      console.error('Load KPI error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [period]);

  const PERIODS = [
    { key: 'today', label: '📅 Hôm nay' },
    { key: 'week', label: '📊 7 ngày' },
    { key: 'month', label: '📈 30 ngày' },
    { key: 'all', label: '📋 Tất cả' }
  ];

  return (
    <div style={{ padding: '12px', background: 'var(--surface-default)', minHeight: '100vh' }}>
      {/* Header */}
      <div style={{ marginBottom: 16 }}>
        <small style={{ color: 'var(--text-muted)' }}>ĐO LƯỜNG HIỆU SUẤT</small>
        <h1 style={{ margin: '4px 0 8px', fontSize: 20 }}>Dashboard KPI</h1>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)' }}>
          Hiệu suất nhân viên - Thời gian, Tốc độ, Đúng hạn
        </p>
      </div>

      {error && (
        <div style={{
          padding: '12px',
          background: '#fee',
          border: '1px solid #fcc',
          borderRadius: 12,
          color: '#c33',
          marginBottom: 12
        }}>
          {error}
        </div>
      )}

      {/* Period Filter */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, overflowX: 'auto' }}>
        {PERIODS.map(p => (
          <button
            key={p.key}
            onClick={() => setPeriod(p.key)}
            style={{
              padding: '8px 12px',
              border: 'none',
              borderRadius: 10,
              background: period === p.key ? 'var(--text-primary)' : 'var(--surface-card)',
              color: period === p.key ? 'white' : 'var(--text-primary)',
              fontWeight: 700,
              fontSize: 13,
              cursor: 'pointer',
              whiteSpace: 'nowrap'
            }}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Staff KPI List */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)' }}>
          ⏳ Đang tải...
        </div>
      ) : staffKPIs.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)' }}>
          📊 Chưa có dữ liệu trong khoảng thời gian này
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {staffKPIs.map((staff, idx) => (
            <StaffKPICard key={staff.staffId} staff={staff} rank={idx + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

function StaffKPICard({ staff, rank }) {
  const kpi = staff.kpi;
  if (!kpi) return null;

  const onTimeColor = kpi.onTimeRate >= 80 ? '#087f5b' : kpi.onTimeRate >= 50 ? '#f57c00' : '#d96b43';

  return (
    <div style={{
      padding: 14,
      background: 'var(--surface-card)',
      border: '1px solid var(--border-default)',
      borderRadius: 14,
      boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
    }}>
      {/* Header: Rank + Name + On-time rate */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 32,
            height: 32,
            borderRadius: '50%',
            background: getRankColor(rank).bg,
            color: getRankColor(rank).text,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 900,
            fontSize: 14
          }}>
            {rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : rank}
          </div>
          <div>
            <strong style={{ fontSize: 14, display: 'block' }}>{staff.staffName}</strong>
            <small style={{ color: 'var(--text-muted)', fontSize: 12 }}>
              {kpi.totalTasks} việc · {kpi.completedTasks} hoàn thành
            </small>
          </div>
        </div>
        <div style={{
          textAlign: 'right',
          padding: '6px 10px',
          background: `${onTimeColor}20`,
          borderRadius: 8,
          fontWeight: 700,
          fontSize: 13,
          color: onTimeColor
        }}>
          {kpi.onTimeRate}% ✅
        </div>
      </div>

      {/* Metrics Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr 1fr',
        gap: 10,
        padding: 10,
        background: 'var(--surface-sunken)',
        borderRadius: 10,
        marginBottom: 12
      }}>
        <MetricBox
          label="Thời gian xác nhận"
          value={formatDuration(kpi.avgTimeToConfirm)}
          icon="⏱️"
        />
        <MetricBox
          label="Thời gian nướng"
          value={formatDuration(kpi.avgTimeToComplete)}
          icon="⏲️"
        />
        <MetricBox
          label="Tổng thời gian"
          value={formatDuration(kpi.avgTotalTime)}
          icon="⏳"
        />
      </div>

      {/* Performance bar */}
      <div>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 4 }}>
          Tỷ lệ đúng hạn
        </div>
        <div style={{
          height: 8,
          background: 'var(--border-default)',
          borderRadius: 4,
          overflow: 'hidden'
        }}>
          <div style={{
            height: '100%',
            width: `${kpi.onTimeRate}%`,
            background: onTimeColor,
            transition: 'width 0.3s'
          }} />
        </div>
      </div>
    </div>
  );
}

function MetricBox({ label, value, icon }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>{icon}</div>
      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{value}</div>
      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>{label}</div>
    </div>
  );
}

function getRankColor(rank) {
  if (rank === 1) return { bg: '#fff59d', text: '#f57f17' };
  if (rank === 2) return { bg: '#e0e0e0', text: '#424242' };
  if (rank === 3) return { bg: '#ffccbc', text: '#bf360c' };
  return { bg: '#e8eaf6', text: '#3f51b5' };
}
