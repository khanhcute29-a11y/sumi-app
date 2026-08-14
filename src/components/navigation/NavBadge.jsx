import React from 'react';

export function NavBadge({ count }) {
  if (!count) return null;
  return (
    <span style={{
      minWidth: 18, height: 18, padding: '0 5px', borderRadius: 999, background: 'var(--status-danger)',
      color: '#fff', font: '700 11px var(--font-body)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      lineHeight: 1, flexShrink: 0,
    }}>{count > 99 ? '99+' : count}</span>
  );
}
