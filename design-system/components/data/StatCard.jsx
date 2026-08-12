import React from 'react';

export function StatCard({ label, value, delta, tone = 'neutral', icon, style }) {
  const deltaColor = tone === 'success' ? '#2f6b2f' : tone === 'danger' ? '#a13c38' : 'var(--text-muted)';
  return (
    <div style={{
      background: 'var(--surface-card)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-sm)',
      padding: 16, display: 'flex', flexDirection: 'column', gap: 6, ...style,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, font: 'var(--text-label)', color: 'var(--text-secondary)' }}>
        {icon && <span aria-hidden="true">{icon}</span>}{label}
      </div>
      <div style={{ font: 'var(--text-display-md)', color: 'var(--text-primary)' }}>{value}</div>
      {delta && <div style={{ font: 'var(--text-caption)', color: deltaColor }}>{delta}</div>}
    </div>
  );
}
