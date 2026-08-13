import React from 'react';
import { IconCheck, IconWarning } from '../icons/FrogIcons';

export function KanbanCard({ customer, phone, item, note, channel, orderCode, badges = [], thumbnail, total, deliveryDate, deliveryTime, paid, onClick, style }) {
  const deliveryLabel = [
    deliveryDate ? new Date(`${deliveryDate}T00:00:00+07:00`).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' }) : '',
    deliveryTime || '',
  ].filter(Boolean).join(' · ');
  return (
    <button onClick={onClick} style={{
      display: 'flex', flexDirection: 'column', gap: 8, textAlign: 'left', width: '100%',
      background: 'var(--surface-card)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-sm)',
      padding: 12, border: 'none', cursor: 'pointer', ...style,
    }}>
      <div style={{ display: 'flex', gap: 10 }}>
        {thumbnail && <img src={thumbnail} alt="" style={{ width: 48, height: 48, borderRadius: 'var(--radius-sm)', objectFit: 'cover', flexShrink: 0 }} />}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ font: 'var(--text-label)', color: 'var(--text-primary)', display: 'flex', justifyContent: 'space-between', gap: 6 }}>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{customer}</span>
            {channel && <span style={{ font: 'var(--text-caption)', color: 'var(--text-muted)' }}>{channel}</span>}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6 }}>
            {phone && <span style={{ font: 'var(--text-caption)', color: 'var(--text-muted)' }}>{phone}</span>}
            {orderCode && <span style={{ font: 'var(--text-caption)', color: 'var(--text-muted)' }}>{orderCode}</span>}
          </div>
        </div>
      </div>
      {item && <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-secondary)' }}>{item}</div>}
      {note && <div style={{ font: 'var(--text-caption)', color: 'var(--text-muted)' }}>{note}</div>}
      {(total != null || deliveryLabel) && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', font: 'var(--text-caption)', color: 'var(--text-muted)' }}>
          <span>{deliveryLabel ? `Giao ${deliveryLabel}` : ''}</span>
          <span style={{ font: 'var(--text-label)', color: 'var(--text-primary)' }}>{total != null ? `${Number(total).toLocaleString('vi-VN')}đ` : ''}</span>
        </div>
      )}
      {badges.length > 0 && <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{badges}</div>}
      {paid != null && (
        <div style={{ font: 'var(--text-caption)', color: paid ? 'var(--status-success)' : 'var(--status-danger)', display: 'flex', alignItems: 'center', gap: 4 }}>
          {paid ? <IconCheck size={13} /> : <IconWarning size={13} />} {paid ? 'Đã thu đủ' : 'Chưa thu đủ'}
        </div>
      )}
    </button>
  );
}
