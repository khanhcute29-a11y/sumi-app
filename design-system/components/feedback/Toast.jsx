import React from 'react';

const tones = {
  success: { bg: '#2f6b2f', icon: '✓' },
  danger: { bg: '#a13c38', icon: '⛔' },
  warning: { bg: '#95661a', icon: '!' },
  info: { bg: 'var(--brand-brown)', icon: 'ⓘ' },
};

export function Toast({ tone = 'info', title, message, onClose, style }) {
  const t = tones[tone] || tones.info;
  return (
    <div style={{
      display: 'flex', gap: 10, alignItems: 'flex-start', background: 'var(--neutral-800)', color: '#fff',
      padding: '12px 14px', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-lg)', maxWidth: 340, ...style,
    }}>
      <span style={{ width: 22, height: 22, borderRadius: '50%', background: t.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, flexShrink: 0 }}>{t.icon}</span>
      <div style={{ flex: 1 }}>
        {title && <div style={{ font: 'var(--text-label)' }}>{title}</div>}
        {message && <div style={{ font: 'var(--text-body-sm)', color: 'var(--neutral-200)', marginTop: 2 }}>{message}</div>}
      </div>
      {onClose && <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--neutral-300)', cursor: 'pointer', fontSize: 14 }}>✕</button>}
    </div>
  );
}
