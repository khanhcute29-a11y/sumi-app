// MOCKUP ONLY — Không import từ production code
import React, { useMemo, useState } from 'react';
import {
  MOCK_ORDERS, STATUS_CONFIG, TYPE_CONFIG,
  fmtTime, fmtVnd, minutesLeft,
} from './mock-data.js';

// ─── Thẻ đơn compact ────────────────────────────────────────────
export function OrderCardCompact({ order, onOpen }) {
  const statusCfg = STATUS_CONFIG[order.is_overdue ? 'overdue' : order.status] || STATUS_CONFIG['awaiting_assignment'];
  const mins = minutesLeft(order.required_at);
  const isSoon = mins !== null && mins > 0 && mins <= 60;
  const isLate = mins !== null && mins < 0 && order.status !== 'completed';

  // Tính progress step (0-5)
  const step = {
    awaiting_assignment: 1, awaiting_acceptance: 1,
    in_production: 2, ready_for_fulfillment: 3,
    in_delivery: 4, completed: 5,
  }[order.status] || 0;

  return (
    <button
      className={`mkp-order-card${order.is_urgent && !order.is_overdue ? ' is-urgent' : ''}${order.is_overdue ? ' is-overdue' : ''}`}
      onClick={() => onOpen(order)}
    >
      {/* Row 1: icon + tên khách + badge trạng thái */}
      <div className="mkp-card-row1">
        <div className="mkp-card-type-icon">{order.type_icon}</div>
        <div className="mkp-card-main">
          <div className="mkp-card-customer">{order.customer}</div>
          <div className="mkp-card-code">{order.code} · {order.items_count} món</div>
        </div>
        <span
          className="mkp-card-status-badge"
          style={{ background: statusCfg.bg, color: statusCfg.color, border: `1.5px solid ${statusCfg.border}` }}
        >
          {statusCfg.icon} {statusCfg.label}
        </span>
      </div>

      {/* Row 2: giờ giao + địa chỉ */}
      <div className="mkp-card-row2">
        <span className={`mkp-card-time${isSoon ? ' is-soon' : ''}${isLate ? ' is-overdue' : ''}`}>
          🕐 {fmtTime(order.required_at)}
          {isSoon && <span style={{ fontSize: 11 }}>&nbsp;({mins} phút)</span>}
          {isLate && <span style={{ fontSize: 11 }}>&nbsp;(quá {Math.abs(mins)}p)</span>}
        </span>
        <span className="mkp-card-sep">·</span>
        <span className="mkp-card-address">📍 {order.address}</span>
      </div>

      {/* Row 3: tags + giá */}
      <div className="mkp-card-row3">
        <span className="mkp-card-tag">{order.type_label}</span>
        {order.kitchen && <span className="mkp-card-tag kitchen">👨‍🍳 {order.kitchen}</span>}
        {order.is_urgent && !order.is_overdue && <span className="mkp-card-tag urgent">⚡ Gấp</span>}
        {order.is_overdue && <span className="mkp-card-tag overdue">⚠️ Trễ</span>}
        <span className="mkp-card-total">{fmtVnd(order.total)}</span>
      </div>

      {/* Note */}
      {order.note ? <div className="mkp-card-note">💬 {order.note}</div> : null}

      {/* Progress track */}
      <div className="mkp-progress-track">
        {[1, 2, 3, 4, 5].map(i => (
          <span
            key={i}
            className={
              order.is_overdue ? 'overdue'
              : i < step ? 'done'
              : i === step ? 'active'
              : ''
            }
          />
        ))}
      </div>
    </button>
  );
}

// ─── Order Detail Drawer ────────────────────────────────────────
export function OrderDetailDrawer({ order, onClose, onAction }) {
  const statusCfg = STATUS_CONFIG[order.is_overdue ? 'overdue' : order.status];

  const getActions = () => {
    if (order.is_overdue) return [
      { label: '🚨 Xử lý khẩn — Phân bếp ngay', cls: 'danger' },
      { label: '❌ Huỷ đơn', cls: 'outline' },
    ];
    switch (order.status) {
      case 'awaiting_assignment':
      case 'awaiting_acceptance':
        return [{ label: '✅ Phân bếp — Bắt đầu làm', cls: 'primary' }];
      case 'in_production':
        return [{ label: '📦 Đánh dấu hoàn thành bếp', cls: 'success' }];
      case 'ready_for_fulfillment':
        return [{ label: '🛵 Bắt đầu giao hàng', cls: 'primary' }];
      case 'in_delivery':
        return [{ label: '✅ Xác nhận giao thành công', cls: 'success' }];
      case 'completed':
        return [];
      default: return [];
    }
  };

  return (
    <div className="mkp-detail-overlay" onClick={onClose}>
      <div className="mkp-detail-sheet" onClick={e => e.stopPropagation()}>
        <div className="mkp-detail-handle" />

        {/* Header */}
        <div className="mkp-detail-header">
          <div className="mkp-detail-icon">{order.type_icon}</div>
          <div className="mkp-detail-title">
            <h3>{order.customer}</h3>
            <small>{order.code} · {order.type_label}</small>
          </div>
          <button className="mkp-detail-close" onClick={onClose}>✕</button>
        </div>

        {/* Trạng thái */}
        <div style={{ marginBottom: 16 }}>
          <span
            className="mkp-card-status-badge"
            style={{ background: statusCfg.bg, color: statusCfg.color, border: `2px solid ${statusCfg.border}`, fontSize: 14, padding: '7px 14px' }}
          >
            {statusCfg.icon} {statusCfg.label}
          </span>
        </div>

        {/* Thông tin chính */}
        <div className="mkp-detail-section">
          <h4>📋 Thông tin đơn</h4>
          <div className="mkp-detail-row">⏰ <strong>Giờ giao:</strong> <span>{fmtTime(order.required_at)} {order.is_urgent ? '⚡ Gấp' : ''}</span></div>
          <div className="mkp-detail-row">📍 <strong>Địa chỉ:</strong> <span>{order.address}</span></div>
          <div className="mkp-detail-row">📞 <strong>SĐT:</strong> <span>{order.phone}</span></div>
          <div className="mkp-detail-row">💰 <strong>Giá trị:</strong> <span style={{ color: '#2d1c10', fontWeight: 900 }}>{fmtVnd(order.total)}</span></div>
          {order.kitchen && (
            <div className="mkp-detail-row">👨‍🍳 <strong>Bếp:</strong> <span>{order.kitchen}</span></div>
          )}
        </div>

        {/* Timeline thời gian */}
        <div className="mkp-detail-section">
          <h4>🕐 Timeline</h4>
          {order.kitchen_started_at && (
            <div className="mkp-detail-row">🟢 <strong>Bếp bắt đầu:</strong> <span>{fmtTime(order.kitchen_started_at)}</span></div>
          )}
          {order.kitchen_done_at && (
            <div className="mkp-detail-row">✅ <strong>Bếp xong:</strong> <span>{fmtTime(order.kitchen_done_at)}</span></div>
          )}
          {order.delivery_started_at && (
            <div className="mkp-detail-row">🛵 <strong>Bắt đầu giao:</strong> <span>{fmtTime(order.delivery_started_at)}</span></div>
          )}
          {order.completed_at && (
            <div className="mkp-detail-row">🏁 <strong>Hoàn thành:</strong> <span>{fmtTime(order.completed_at)}</span></div>
          )}
          {order.shipper && (
            <div className="mkp-detail-row">🧑‍✈️ <strong>Shipper:</strong> <span>{order.shipper}</span></div>
          )}
        </div>

        {/* Ghi chú */}
        {order.note && (
          <div className="mkp-detail-section">
            <h4>💬 Ghi chú</h4>
            <div style={{ background: '#fffbeb', padding: 12, borderRadius: 12, fontSize: 15, color: '#92400e' }}>
              {order.note}
            </div>
          </div>
        )}

        {/* Hành động */}
        {getActions().length > 0 && (
          <div className="mkp-detail-actions">
            {getActions().map((act, i) => (
              <button key={i} className={`mkp-action-btn ${act.cls}`}
                onClick={() => onAction(act.label)}>
                {act.label}
              </button>
            ))}
            <button className="mkp-action-btn outline" onClick={onClose}>
              Đóng
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
