// MOCKUP ONLY — Board View (Kanban style)
import React from 'react';
import { STATUS_CONFIG } from './mock-data.js';
import { OrderCardCompact } from './OrderCardCompact.jsx';

const BOARD_COLUMNS = [
  { key: 'overdue',               label: 'Chưa thực hiện',    match: o => o.is_overdue },
  { key: 'waiting',               label: 'Chờ nhận đơn',      match: o => ['awaiting_assignment','awaiting_acceptance'].includes(o.status) && !o.is_overdue },
  { key: 'in_production',         label: 'Bếp đang làm',      match: o => o.status === 'in_production' && !o.is_overdue },
  { key: 'ready_for_fulfillment', label: 'Chờ vận chuyển',    match: o => o.status === 'ready_for_fulfillment' && !o.is_overdue },
  { key: 'in_delivery',           label: 'Đang vận chuyển',   match: o => o.status === 'in_delivery' && !o.is_overdue },
  { key: 'completed',             label: 'Giao thành công',   match: o => o.status === 'completed' },
];

const COL_STATUS_KEY = {
  overdue: 'overdue', waiting: 'awaiting_assignment',
  in_production: 'in_production', ready_for_fulfillment: 'ready_for_fulfillment',
  in_delivery: 'in_delivery', completed: 'completed',
};

export default function OrderBoardView({ orders, onOpen }) {
  return (
    <div className="mkp-board-scroll">
      {BOARD_COLUMNS.map(col => {
        const colOrders = orders.filter(col.match);
        const cfg = STATUS_CONFIG[COL_STATUS_KEY[col.key]] || STATUS_CONFIG['awaiting_assignment'];
        return (
          <div key={col.key} className="mkp-board-col">
            <div
              className="mkp-board-col-header"
              style={{ background: cfg.bg, color: cfg.color, border: `2px solid ${cfg.border}` }}
            >
              <span style={{ fontSize: 16 }}>{cfg.icon}</span>
              <span style={{ flex: 1 }}>{col.label}</span>
              <span style={{
                background: cfg.color, color: '#fff',
                borderRadius: 20, padding: '2px 9px',
                fontSize: 12, fontWeight: 900,
              }}>
                {colOrders.length}
              </span>
            </div>
            <div
              className="mkp-board-col-body"
              style={{ background: cfg.bg + 'aa', border: `2px solid ${cfg.border}`, borderTop: 'none' }}
            >
              {colOrders.length === 0 ? (
                <div className="mkp-board-empty">Không có đơn</div>
              ) : (
                colOrders.map(o => (
                  <OrderCardCompact key={o.id} order={o} onOpen={onOpen} />
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
