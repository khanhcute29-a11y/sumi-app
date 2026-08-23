import React, { useMemo } from 'react';

export default function OrderStatusTimeline({ order, packages = [], tasks = [] }) {
  const events = useMemo(() => {
    const list = [];

    // Event 1: Order created
    if (order?.created_at) {
      list.push({
        time: new Date(order.created_at),
        icon: '✅',
        title: 'Đơn được tạo',
        detail: `${order.customer_name || 'Khách lẻ'} | ${order.order_type}`,
        status: 'done'
      });
    }

    // Event 2-N: Package status changes
    packages.forEach((pkg, idx) => {
      if (pkg?.created_at) {
        list.push({
          time: new Date(pkg.created_at),
          icon: '📦',
          title: `${pkg.organization_units?.name || 'Bếp'} nhận đơn`,
          detail: `Hạn: ${pkg.due_at ? new Date(pkg.due_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : 'N/A'}`,
          status: pkg.status
        });
      }

      if (pkg?.accepted_at) {
        list.push({
          time: new Date(pkg.accepted_at),
          icon: pkg.status === 'accepted' ? '⏳' : '✅',
          title: `${pkg.organization_units?.name || 'Bếp'} trưởng nhận đơn`,
          detail: `Trạng thái: ${pkg.status}`,
          status: 'done'
        });
      }

      if (pkg?.completed_at) {
        list.push({
          time: new Date(pkg.completed_at),
          icon: '✅',
          title: `${pkg.organization_units?.name || 'Bếp'} hoàn thành mẻ`,
          detail: 'Đã bàn giao kho thành phẩm',
          status: 'done'
        });
      }
    });

    // Event: Tasks assigned & completed
    tasks.forEach(task => {
      if (task?.created_at) {
        list.push({
          time: new Date(task.created_at),
          icon: '👨‍🍳',
          title: `Giao việc: ${task.title}`,
          detail: `Cho: ${task.profiles?.full_name} | Hạn: ${task.deadline ? new Date(task.deadline).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : 'N/A'}`,
          status: 'pending'
        });
      }

      if (task?.started_at) {
        list.push({
          time: new Date(task.started_at),
          icon: '⚙️',
          title: `${task.profiles?.full_name} bắt đầu: ${task.title}`,
          detail: 'Đang làm...',
          status: 'doing'
        });
      }

      if (task?.completed_at) {
        list.push({
          time: new Date(task.completed_at),
          icon: '✅',
          title: `${task.profiles?.full_name} hoàn thành: ${task.title}`,
          detail: task.task_proofs?.length ? `${task.task_proofs.length} ảnh báo cáo` : 'Không có ảnh',
          status: 'done'
        });
      }
    });

    // Event: Order completion
    if (order?.completed_at) {
      list.push({
        time: new Date(order.completed_at),
        icon: '🎉',
        title: 'Đơn hoàn thành & giao',
        detail: 'Khách nhận đơn thành công',
        status: 'done'
      });
    }

    return list.sort((a, b) => a.time - b.time);
  }, [order, packages, tasks]);

  const getStatusColor = (status) => {
    switch (status) {
      case 'done': return '#087f5b';
      case 'doing': return '#b93e13';
      case 'pending': return '#725f50';
      default: return '#ccc';
    }
  };

  return (
    <div style={{ marginTop: 16, padding: '12px', background: 'var(--surface-sunken)', borderRadius: 14 }}>
      <strong style={{ fontSize: 14, display: 'block', marginBottom: 12, color: 'var(--text-primary)' }}>
        📍 Tiến trình đơn hàng
      </strong>

      {events.length === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--text-muted)', padding: '8px 0' }}>Chưa có sự kiện nào</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, position: 'relative' }}>
          {/* Timeline line */}
          <div style={{ position: 'absolute', left: '11px', top: '20px', bottom: '20px', width: '2px', background: 'var(--border-default)' }} />

          {events.map((evt, idx) => (
            <div key={idx} style={{ display: 'flex', gap: 8, position: 'relative', zIndex: 1 }}>
              {/* Circle marker */}
              <div
                style={{
                  width: '24px',
                  height: '24px',
                  borderRadius: '50%',
                  background: getStatusColor(evt.status),
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '12px',
                  flexShrink: 0,
                  marginTop: '2px'
                }}
              >
                {evt.icon}
              </div>

              {/* Event content */}
              <div style={{ flex: 1, paddingTop: '2px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                  <strong style={{ fontSize: 13, color: 'var(--text-primary)' }}>{evt.title}</strong>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)', flexShrink: 0 }}>
                    {evt.time.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                {evt.detail && (
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                    {evt.detail}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Legend */}
      <div style={{ display: 'flex', gap: 16, marginTop: 12, fontSize: 12, color: 'var(--text-muted)', paddingTop: 8, borderTop: '1px solid var(--border-default)' }}>
        <div><span style={{ color: '#087f5b', fontWeight: 900 }}>●</span> Xong</div>
        <div><span style={{ color: '#b93e13', fontWeight: 900 }}>●</span> Đang làm</div>
        <div><span style={{ color: '#725f50', fontWeight: 900 }}>●</span> Chờ</div>
      </div>
    </div>
  );
}
