import React from 'react';

const tones = {
  neutral: { bg: 'var(--surface-sunken)', fg: 'var(--text-secondary)' },
  success: { bg: 'var(--status-success-soft)', fg: '#2f6b2f' },
  danger: { bg: 'var(--status-danger-soft)', fg: '#a13c38' },
  warning: { bg: 'var(--status-warning-soft)', fg: '#95661a' },
  info: { bg: 'var(--status-info-soft)', fg: '#3a5b70' },
  primary: { bg: 'var(--surface-primary-soft)', fg: 'var(--primary-700)' },
};

export function Badge({ children, tone = 'neutral', icon, style }) {
  const t = tones[tone] || tones.neutral;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px',
      borderRadius: 'var(--radius-pill)', background: t.bg, color: t.fg,
      font: 'var(--text-caption)', letterSpacing: '.01em', whiteSpace: 'nowrap', ...style,
    }}>
      {icon && <span aria-hidden="true">{icon}</span>}
      {children}
    </span>
  );
}
