import React from 'react';

export function Checkbox({ label, checked, onChange, style }) {
  return (
    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, font: 'var(--text-body)', color: 'var(--text-primary)', cursor: 'pointer', ...style }}>
      <span
        onClick={() => onChange && onChange(!checked)}
        style={{
          width: 18, height: 18, borderRadius: 5, display: 'flex', alignItems: 'center', justifyContent: 'center',
          border: `1.5px solid ${checked ? 'var(--action-primary)' : 'var(--border-default)'}`,
          background: checked ? 'var(--action-primary)' : 'var(--surface-card)', color: '#fff', fontSize: 12,
          transition: 'all var(--duration-fast) var(--ease-standard)', flexShrink: 0,
        }}
      >
        {checked && '✓'}
      </span>
      {label}
    </label>
  );
}
