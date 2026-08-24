import React, { useMemo } from 'react';

export default function OrderStatusTimeline({ order, packages = [], tasks = [], changeHistory = [], kpiLogs = [] }) {
  const stages = useMemo(() => {
    const stageList = [];

    // Stage 1: Đơn hàng (Order Created)
    stageList.push({
      id: 'order_created',
      icon: '📋',
      title: 'Đơn hàng',
      status: order?.created_at ? 'done' : 'pending',
      content: order?.created_at ? `Người tạo: ${order.created_by_name || 'N/A'} · ${new Date(order.created_at).toLocaleString('vi-VN')}` : 'Chưa tạo'
    });

    // Stage 2: Nhận đơn (Kitchen Lead Received)
    const kitchenAcceptedPkg = packages.find(p => p?.accepted_at && !p?.assigned_to_staff_id);
    stageList.push({
      id: 'kitchen_accepted',
      icon: '👨‍🍳',
      title: 'Nhận đơn',
      status: kitchenAcceptedPkg?.accepted_at ? 'done' : (packages.length > 0 ? 'pending' : 'pending'),
      content: kitchenAcceptedPkg?.accepted_at
        ? `BT ${kitchenAcceptedPkg.organization_units?.name || 'Bếp'} · ${new Date(kitchenAcceptedPkg.accepted_at).toLocaleString('vi-VN')}`
        : 'Chờ bếp trưởng nhận'
    });

    // Stage 3: Đang làm (In Progress)
    const inProgressPkg = packages.find(p => p?.assigned_to_staff_id && !p?.completed_at);
    const assignedStaff = packages.find(p => p?.assigned_to_staff_id)?.assigned_to_staff_name;
    stageList.push({
      id: 'in_progress',
      icon: '🔨',
      title: 'Đang làm',
      status: inProgressPkg ? 'doing' : (packages.some(p => p?.completed_at) ? 'done' : 'pending'),
      content: inProgressPkg
        ? `Người: ${assignedStaff || 'Đang chỉ định'}`
        : (packages.some(p => p?.completed_at) ? 'Đã hoàn thành' : 'Chờ xác nhận')
    });

    // Stage 4: Hoàn thành nhập kho (Kitchen Completed)
    const completedPkg = packages.find(p => p?.completed_at);
    stageList.push({
      id: 'kitchen_completed',
      icon: '✅',
      title: 'Hoàn thành nhập kho',
      status: completedPkg?.completed_at ? 'done' : 'pending',
      content: completedPkg?.completed_at
        ? `Người: ${completedPkg.assigned_to_staff_name || completedPkg.organization_units?.name || 'N/A'} · ${new Date(completedPkg.completed_at).toLocaleString('vi-VN')}`
        : 'Chờ hoàn thành'
    });

    // Stage 5: Nhận giao (Delivery Accepted)
    const deliveryAssignedLog = kpiLogs.find(log => log?.event_type === 'delivery_assigned');
    stageList.push({
      id: 'delivery_accepted',
      icon: '🚚',
      title: 'Nhận giao',
      status: deliveryAssignedLog?.created_at ? 'done' : 'pending',
      content: deliveryAssignedLog?.created_at
        ? `Người: ${deliveryAssignedLog.staff_name || 'N/A'} · GPS: ${deliveryAssignedLog.gps_latitude?.toFixed(4)}, ${deliveryAssignedLog.gps_longitude?.toFixed(4)} · ${new Date(deliveryAssignedLog.created_at).toLocaleString('vi-VN')}`
        : 'Chờ nhân viên nhận'
    });

    // Stage 6: Đang giao (In Delivery)
    const inDelivery = order?.status_v2 === 'in_delivery' && !kpiLogs.find(log => log?.event_type === 'delivery_completed');
    stageList.push({
      id: 'in_delivery',
      icon: '🚗',
      title: 'Đang giao',
      status: inDelivery ? 'doing' : (kpiLogs.find(log => log?.event_type === 'delivery_completed') ? 'done' : 'pending'),
      content: inDelivery ? 'Đang vận chuyển...' : 'Chờ bắt đầu giao'
    });

    // Stage 7: Hoàn thành (Delivery Completed)
    const deliveryCompletedLog = kpiLogs.find(log => log?.event_type === 'delivery_completed');
    stageList.push({
      id: 'delivery_completed',
      icon: '✅',
      title: 'Hoàn thành',
      status: deliveryCompletedLog?.created_at ? 'done' : 'pending',
      content: deliveryCompletedLog?.created_at
        ? `Người: ${deliveryCompletedLog.staff_name || 'N/A'} · GPS: ${deliveryCompletedLog.gps_latitude?.toFixed(4)}, ${deliveryCompletedLog.gps_longitude?.toFixed(4)} · ${new Date(deliveryCompletedLog.created_at).toLocaleString('vi-VN')}`
        : 'Chờ hoàn thành giao'
    });

    return stageList;
  }, [order, packages, kpiLogs]);

  const getStatusColor = (status) => {
    switch (status) {
      case 'done': return '#087f5b';
      case 'doing': return '#b93e13';
      case 'pending': return '#ccc';
      default: return '#ccc';
    }
  };

  const getStatusBgColor = (status) => {
    switch (status) {
      case 'done': return '#e6f6ed';
      case 'doing': return '#fff3e0';
      case 'pending': return '#f5f1eb';
      default: return '#f5f1eb';
    }
  };

  return (
    <div style={{ marginTop: 16, padding: '12px', background: 'var(--surface-sunken)', borderRadius: 14 }}>
      <strong style={{ fontSize: 14, display: 'block', marginBottom: 12, color: 'var(--text-primary)' }}>
        📍 Tiến trình đơn hàng
      </strong>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {stages.map((stage, idx) => (
          <div
            key={stage.id}
            style={{
              padding: '12px',
              background: getStatusBgColor(stage.status),
              border: `2px solid ${getStatusColor(stage.status)}`,
              borderRadius: 10,
              transition: 'all 0.2s'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <span style={{ fontSize: 20 }}>{stage.icon}</span>
              <strong style={{ fontSize: 13, color: 'var(--text-primary)' }}>
                {stage.title}
              </strong>
              <span style={{
                fontSize: 11,
                fontWeight: 700,
                padding: '2px 8px',
                borderRadius: 6,
                background: getStatusColor(stage.status),
                color: '#fff',
                marginLeft: 'auto'
              }}>
                {stage.status === 'done' ? '✅ Xong' : stage.status === 'doing' ? '🔄 Đang làm' : '⏳ Chờ'}
              </span>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginLeft: '28px' }}>
              {stage.content}
            </div>
          </div>
        ))}
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', gap: 16, marginTop: 12, fontSize: 12, color: 'var(--text-muted)', paddingTop: 8, borderTop: '1px solid var(--border-default)' }}>
        <div><span style={{ color: '#087f5b', fontWeight: 900 }}>●</span> Xong</div>
        <div><span style={{ color: '#b93e13', fontWeight: 900 }}>●</span> Đang làm</div>
        <div><span style={{ color: '#ccc', fontWeight: 900 }}>●</span> Chờ</div>
      </div>
    </div>
  );
}
