import React from 'react';

const TONES = {
  danger: { border: 'var(--status-danger)', bg: 'var(--status-danger-soft)', color: 'var(--status-danger)' },
  info: { border: 'var(--action-primary)', bg: 'var(--surface-primary-soft)', color: 'var(--action-primary)' },
  success: { border: 'var(--status-success)', bg: 'var(--status-success-soft)', color: 'var(--status-success)' },
};

export function ActionChip({ icon, label, tone = 'info', onClick, disabled, style }) {
  const t = TONES[tone] || TONES.info;
  return (
    <button onClick={onClick} disabled={disabled} style={{
      display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px',
      borderRadius: 'var(--radius-pill)', border: `1.5px solid ${t.border}`, background: t.bg, color: t.color,
      font: 'var(--text-label)', cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.5 : 1, ...style,
    }}>
      <span aria-hidden="true">{icon}</span>{label}
    </button>
  );
}
