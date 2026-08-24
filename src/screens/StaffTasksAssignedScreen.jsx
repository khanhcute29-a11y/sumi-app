import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../lib/AuthContext';
import { supabase } from '../lib/supabaseClient';
import { calculatePackageMetrics, formatMetrics, groupTasksByDate } from '../lib/kpiCalculations';
import OrderV2DetailModal from '../components/OrderV2DetailModal';

export default function StaffTasksAssignedScreen() {
  const { profile } = useAuth();
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all'); // all, pending, in_progress, completed
  const [selectedOrderId, setSelectedOrderId] = useState(null);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      // Load work packages assigned to current user
      const { data: packages, error: pkgErr } = await supabase
        .from('order_work_packages_readable')
        .select(`
          id,
          order_id,
          status,
          accepted_at,
          completed_at,
          organization_units(name,code),
          orders!inner(
            id,
            order_code,
            customer_name,
            order_type,
            created_at,
            required_at,
            status_v2
          )
        `)
        .eq('assigned_to_staff_id', profile?.id)
        .order('assigned_at', { ascending: false });

      if (pkgErr) throw pkgErr;

      // Enrich with metrics
      const enriched = (packages || []).map(pkg => ({
        ...pkg,
        metrics: calculatePackageMetrics(pkg, pkg.orders)
      }));

      setTasks(enriched);
    } catch (err) {
      setError(err?.message || 'Không tải được danh sách việc được giao');
      console.error('Load tasks error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (profile?.id) load();
  }, [profile?.id]);

  // Filter tasks
  const filteredTasks = useMemo(() => {
    return tasks.filter(t => {
      if (filter === 'all') return true;
      return t.metrics.status === filter;
    });
  }, [tasks, filter]);

  // Group by date
  const groupedByDate = useMemo(() => groupTasksByDate(filteredTasks), [filteredTasks]);

  const FILTERS = [
    { key: 'all', label: '📋 Tất cả', count: tasks.length },
    { key: 'assigned', label: '🔄 Chờ xác nhận', count: tasks.filter(t => t.metrics.status === 'assigned').length },
    { key: 'in_progress', label: '🔨 Đang làm', count: tasks.filter(t => t.metrics.status === 'in_progress').length },
    { key: 'completed', label: '✅ Hoàn thành', count: tasks.filter(t => t.metrics.status === 'completed').length }
  ];

  if (selectedOrderId) {
    return <OrderV2DetailModal orderId={selectedOrderId} onClose={() => setSelectedOrderId(null)} onChanged={load} />;
  }

  return (
    <div style={{ padding: '12px', background: 'var(--surface-default)', minHeight: '100vh' }}>
      {/* Header */}
      <div style={{ marginBottom: 16 }}>
        <small style={{ color: 'var(--text-muted)' }}>VIỆC CỦA TÔI</small>
        <h1 style={{ margin: '4px 0 8px', fontSize: 20 }}>Việc được giao</h1>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)' }}>
          Tổng {tasks.length} việc • {tasks.filter(t => t.metrics.status === 'completed').length} hoàn thành
        </p>
      </div>

      {error && (
        <div style={{
          padding: '12px',
          background: '#fee',
          border: '1px solid #fcc',
          borderRadius: 12,
          color: '#c33',
          marginBottom: 12,
          fontSize: 13
        }}>
          {error}
        </div>
      )}

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, overflowX: 'auto', paddingBottom: 4 }}>
        {FILTERS.map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            style={{
              padding: '8px 12px',
              border: 'none',
              borderRadius: 10,
              background: filter === f.key ? 'var(--text-primary)' : 'var(--surface-card)',
              color: filter === f.key ? 'white' : 'var(--text-primary)',
              fontWeight: 700,
              fontSize: 13,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              transition: 'all 0.2s'
            }}
          >
            {f.label} ({f.count})
          </button>
        ))}
      </div>

      {/* Tasks List */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)' }}>
          ⏳ Đang tải...
        </div>
      ) : filteredTasks.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)' }}>
          🎉 Không có việc nào trong phạm vi này
        </div>
      ) : (
        Object.entries(groupedByDate).map(([date, dateTasks]) => (
          <div key={date} style={{ marginBottom: 20 }}>
            {/* Date header */}
            <div style={{
              fontSize: 12,
              fontWeight: 700,
              color: 'var(--text-muted)',
              padding: '8px 0',
              marginBottom: 8,
              borderBottom: '1px solid var(--border-default)'
            }}>
              📅 {date}
            </div>

            {/* Tasks for this date */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {dateTasks.map(task => (
                <TaskCard key={task.id} task={task} onOpenOrder={() => setSelectedOrderId(task.order_id)} />
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

function TaskCard({ task, onOpenOrder }) {
  const order = task.orders;
  const metrics = task.metrics;
  const formatted = formatMetrics(metrics);

  return (
    <div
      onClick={onOpenOrder}
      style={{
        padding: 12,
        background: 'var(--surface-card)',
        border: '1px solid var(--border-default)',
        borderRadius: 14,
        cursor: 'pointer',
        transition: 'all 0.2s'
      }}
      onMouseEnter={e => e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)'}
      onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}
    >
      {/* Header: Order code + Status */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <strong style={{ fontSize: 14, color: 'var(--text-primary)' }}>
          #{order.order_code}
        </strong>
        <span style={{
          fontSize: 11,
          fontWeight: 700,
          padding: '4px 8px',
          borderRadius: 6,
          background: getStatusColor(metrics.status).bg,
          color: getStatusColor(metrics.status).text
        }}>
          {formatted.status}
        </span>
      </div>

      {/* Customer + Order type */}
      <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 8 }}>
        👤 {order.customer_name || 'Khách lẻ'} · {getOrderTypeLabel(order.order_type)}
      </div>

      {/* Metrics row */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 8,
        padding: '8px',
        background: 'var(--surface-sunken)',
        borderRadius: 10,
        marginBottom: 8,
        fontSize: 12
      }}>
        <div>
          <small style={{ color: 'var(--text-muted)' }}>Thời gian nướng</small>
          <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{formatted.timeToComplete}</div>
        </div>
        <div>
          <small style={{ color: 'var(--text-muted)' }}>Tổng thời gian</small>
          <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{formatted.totalTime}</div>
        </div>
      </div>

      {/* On-time status */}
      <div style={{ fontSize: 12, fontWeight: 700, color: metrics.isOnTime ? '#087f5b' : '#d96b43' }}>
        {formatted.onTime}
      </div>

      {/* Timestamps */}
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8, lineHeight: 1.6 }}>
        <div>📍 Giao lúc: {metrics.assignedAt?.toLocaleString('vi-VN') || 'N/A'}</div>
        <div>✅ Xác nhận: {metrics.acceptedAt?.toLocaleString('vi-VN') || 'Chưa'}</div>
        {metrics.completedAt && (
          <div>🎉 Hoàn thành: {metrics.completedAt.toLocaleString('vi-VN')}</div>
        )}
      </div>
    </div>
  );
}

function getStatusColor(status) {
  const colors = {
    pending: { bg: '#e8f4f8', text: '#0288d1' },
    assigned: { bg: '#fff3e0', text: '#f57c00' },
    in_progress: { bg: '#fce4ec', text: '#c2185b' },
    completed: { bg: '#e8f5e9', text: '#087f5b' }
  };
  return colors[status] || colors.pending;
}

function getOrderTypeLabel(type) {
  const labels = {
    cake: '🎂 Bánh kem',
    bakery: '🍞 Bánh mặn',
    macaron: '🧁 Macaron',
    school: '🏫 Trường học',
    teabreak: '☕ Teabreak',
    mixed: '🧺 Tổng hợp'
  };
  return labels[type] || type;
}
