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
      who: order?.created_by_name || 'N/A',
      when: order?.created_at ? new Date(order.created_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '-'
    });

    // Stage 2: Nhận đơn (Kitchen Lead Received)
    const kitchenAcceptedPkg = packages.find(p => p?.accepted_at && !p?.assigned_to_staff_id);
    stageList.push({
      id: 'kitchen_accepted',
      icon: '👨‍🍳',
      title: 'Nhận đơn',
      status: kitchenAcceptedPkg?.accepted_at ? 'done' : 'pending',
      who: kitchenAcceptedPkg ? `BT ${kitchenAcceptedPkg.organization_units?.name || 'Bếp'}` : 'Chờ',
      when: kitchenAcceptedPkg?.accepted_at ? new Date(kitchenAcceptedPkg.accepted_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '-'
    });

    // Stage 3: Đang làm (In Progress)
    const inProgressPkg = packages.find(p => p?.assigned_to_staff_id && !p?.completed_at);
    const assignedStaff = packages.find(p => p?.assigned_to_staff_id)?.assigned_to_staff_name;
    stageList.push({
      id: 'in_progress',
      icon: '🔨',
      title: 'Đang làm',
      status: inProgressPkg ? 'doing' : (packages.some(p => p?.completed_at) ? 'done' : 'pending'),
      who: inProgressPkg ? assignedStaff || 'Chỉ định' : (packages.some(p => p?.completed_at) ? 'Đã xong' : 'Chờ'),
      when: '-'
    });

    // Stage 4: Hoàn thành nhập kho (Kitchen Completed)
    const completedPkg = packages.find(p => p?.completed_at);
    stageList.push({
      id: 'kitchen_completed',
      icon: '✅',
      title: 'Hoàn thành nhập kho',
      status: completedPkg?.completed_at ? 'done' : 'pending',
      who: completedPkg ? completedPkg.assigned_to_staff_name || completedPkg.organization_units?.name || 'N/A' : 'Chờ',
      when: completedPkg?.completed_at ? new Date(completedPkg.completed_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '-'
    });

    // Stage 5: Nhận giao (Delivery Accepted)
    const deliveryAssignedLog = kpiLogs.find(log => log?.event_type === 'delivery_assigned');
    stageList.push({
      id: 'delivery_accepted',
      icon: '🚚',
      title: 'Nhận giao',
      status: deliveryAssignedLog?.created_at ? 'done' : 'pending',
      who: deliveryAssignedLog?.staff_name || 'Chờ',
      when: deliveryAssignedLog?.created_at ? new Date(deliveryAssignedLog.created_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '-',
      gps: deliveryAssignedLog ? `${deliveryAssignedLog.gps_latitude?.toFixed(4)}, ${deliveryAssignedLog.gps_longitude?.toFixed(4)}` : null
    });

    // Stage 6: Đang giao (In Delivery)
    const inDelivery = order?.status_v2 === 'in_delivery' && !kpiLogs.find(log => log?.event_type === 'delivery_completed');
    stageList.push({
      id: 'in_delivery',
      icon: '🚗',
      title: 'Đang giao',
      status: inDelivery ? 'doing' : (kpiLogs.find(log => log?.event_type === 'delivery_completed') ? 'done' : 'pending'),
      who: inDelivery ? 'Đang chuyển' : (kpiLogs.find(log => log?.event_type === 'delivery_completed') ? 'Xong' : 'Chờ'),
      when: '-'
    });

    // Stage 7: Hoàn thành (Delivery Completed)
    const deliveryCompletedLog = kpiLogs.find(log => log?.event_type === 'delivery_completed');
    stageList.push({
      id: 'delivery_completed',
      icon: '✅',
      title: 'Hoàn thành',
      status: deliveryCompletedLog?.created_at ? 'done' : 'pending',
      who: deliveryCompletedLog?.staff_name || 'Chờ',
      when: deliveryCompletedLog?.created_at ? new Date(deliveryCompletedLog.created_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '-',
      gps: deliveryCompletedLog ? `${deliveryCompletedLog.gps_latitude?.toFixed(4)}, ${deliveryCompletedLog.gps_longitude?.toFixed(4)}` : null
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

  return (
    <div style={{ marginTop: 12, padding: '8px 0', background: 'transparent' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {stages.map((stage) => (
          <div
            key={stage.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '6px 8px',
              background: getStatusColor(stage.status) === '#087f5b' ? '#e6f6ed' : getStatusColor(stage.status) === '#b93e13' ? '#fff3e0' : '#f5f1eb',
              borderLeft: `3px solid ${getStatusColor(stage.status)}`,
              borderRadius: 6
            }}
          >
            {/* Icon + Title */}
            <span style={{ fontSize: 14, minWidth: '16px' }}>{stage.icon}</span>
            <div style={{ flex: 1 }}>
              <strong style={{ fontSize: 12, color: 'var(--text-primary)', display: 'block' }}>
                {stage.title}
              </strong>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>
                {stage.who}
                {stage.gps && ` · GPS: ${stage.gps}`}
                {stage.when !== '-' && ` · ${stage.when}`}
              </div>
            </div>

            {/* Status badge */}
            <span style={{
              fontSize: 10,
              fontWeight: 700,
              padding: '2px 6px',
              borderRadius: 4,
              background: getStatusColor(stage.status),
              color: '#fff',
              whiteSpace: 'nowrap'
            }}>
              {stage.status === 'done' ? '✅' : stage.status === 'doing' ? '🔄' : '⏳'}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
