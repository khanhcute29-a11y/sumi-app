// MOCKUP ONLY — List View (nhóm theo trạng thái, có accordion)
import React, { useState } from 'react';
import { STATUS_CONFIG } from './mock-data.js';
import { OrderCardCompact } from './OrderCardCompact.jsx';

const LIST_GROUPS = [
  { key: 'overdue',               label: 'Chưa thực hiện',    cfgKey: 'overdue',               match: o => o.is_overdue },
  { key: 'waiting',               label: 'Chờ nhận đơn',      cfgKey: 'awaiting_assignment',   match: o => ['awaiting_assignment','awaiting_acceptance'].includes(o.status) && !o.is_overdue },
  { key: 'in_production',         label: 'Bếp đang làm',      cfgKey: 'in_production',         match: o => o.status === 'in_production' && !o.is_overdue },
  { key: 'ready_for_fulfillment', label: 'Chờ vận chuyển',    cfgKey: 'ready_for_fulfillment', match: o => o.status === 'ready_for_fulfillment' && !o.is_overdue },
  { key: 'in_delivery',           label: 'Đang vận chuyển',   cfgKey: 'in_delivery',           match: o => o.status === 'in_delivery' && !o.is_overdue },
  { key: 'completed',             label: 'Giao thành công',   cfgKey: 'completed',             match: o => o.status === 'completed' },
];

export default function OrderListView({ orders, onOpen }) {
  // Mặc định collapse nhóm "Giao thành công"
  const [collapsed, setCollapsed] = useState({ completed: true });
  const toggle = key => setCollapsed(p => ({ ...p, [key]: !p[key] }));

  return (
    <div className="mkp-list-body">
      {LIST_GROUPS.map(group => {
        const groupOrders = orders.filter(group.match);
        const cfg = STATUS_CONFIG[group.cfgKey];
        const isCollapsed = collapsed[group.key];

        return (
          <div key={group.key}>
            {/* Group Header */}
            <div className="mkp-group-header">
              <div className="mkp-group-label" style={{ color: cfg.color }}>
                <span
                  className="mkp-group-dot"
                  style={{ background: cfg.dot }}
                />
                {cfg.icon} {group.label}
                <span
                  className="mkp-group-count"
                  style={{ background: cfg.bg, color: cfg.color, border: `1.5px solid ${cfg.border}` }}
                >
                  {groupOrders.length}
                </span>
              </div>
              <button
                className="mkp-group-toggle"
                onClick={() => toggle(group.key)}
                aria-label={isCollapsed ? 'Mở rộng' : 'Thu gọn'}
              >
                {isCollapsed ? '▸' : '▾'}
              </button>
            </div>

            {/* Group Body */}
            {!isCollapsed && (
              groupOrders.length === 0 ? (
                <div style={{
                  padding: '14px 16px', marginBottom: 4,
                  background: cfg.bg, borderRadius: 14,
                  color: cfg.color, fontSize: 14, fontWeight: 700,
                  textAlign: 'center', border: `2px dashed ${cfg.border}`,
                }}>
                  Không có đơn nào
                </div>
              ) : (
                groupOrders.map(o => (
                  <OrderCardCompact key={o.id} order={o} onOpen={onOpen} />
                ))
              )
            )}
          </div>
        );
      })}
    </div>
  );
}
