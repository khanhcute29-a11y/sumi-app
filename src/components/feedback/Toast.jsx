import React from 'react';
import { IconCheck, IconBan, IconWarning, IconQuestion } from '../icons/FrogIcons';

const tones = {
  success: { bg: '#2f6b2f', Icon: IconCheck },
  danger: { bg: '#a13c38', Icon: IconBan },
  warning: { bg: '#95661a', Icon: IconWarning },
  info: { bg: 'var(--brand-brown)', Icon: IconQuestion },
};

export function Toast({ tone = 'info', title, message, onClose, style }) {
  const t = tones[tone] || tones.info;
  return (
    <div style={{
      display: 'flex', gap: 10, alignItems: 'flex-start', background: 'var(--neutral-800)', color: '#fff',
      padding: '12px 14px', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-lg)', maxWidth: 340, ...style,
    }}>
      <span style={{ width: 22, height: 22, borderRadius: '50%', background: t.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: '#fff' }}><t.Icon size={13} /></span>
      <div style={{ flex: 1 }}>
        {title && <div style={{ font: 'var(--text-label)' }}>{title}</div>}
        {message && <div style={{ font: 'var(--text-body-sm)', color: 'var(--neutral-200)', marginTop: 2 }}>{message}</div>}
      </div>
      {onClose && <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--neutral-300)', cursor: 'pointer', fontSize: 14 }}>✕</button>}
    </div>
  );
}
