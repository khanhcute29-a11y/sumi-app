import React from 'react';

export function KanbanCard({ customer, phone, item, note, channel, badges = [], thumbnail, onClick, style }) {
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
          {phone && <div style={{ font: 'var(--text-caption)', color: 'var(--text-muted)' }}>{phone}</div>}
        </div>
      </div>
      {item && <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-secondary)' }}>{item}</div>}
      {note && <div style={{ font: 'var(--text-caption)', color: 'var(--text-muted)' }}>{note}</div>}
      {badges.length > 0 && <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{badges}</div>}
    </button>
  );
}
