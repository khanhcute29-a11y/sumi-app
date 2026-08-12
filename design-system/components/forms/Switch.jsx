import React from 'react';

export function Switch({ label, checked, onChange, style }) {
  return (
    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 10, cursor: 'pointer', font: 'var(--text-body)', color: 'var(--text-primary)', ...style }}>
      <span
        onClick={() => onChange && onChange(!checked)}
        style={{
          width: 36, height: 21, borderRadius: 'var(--radius-pill)', position: 'relative', flexShrink: 0,
          background: checked ? 'var(--action-primary)' : 'var(--border-default)',
          transition: 'background var(--duration-base) var(--ease-standard)',
        }}
      >
        <span style={{
          position: 'absolute', top: 2, left: checked ? 17 : 2, width: 17, height: 17, borderRadius: '50%',
          background: '#fff', boxShadow: 'var(--shadow-sm)', transition: 'left var(--duration-base) var(--ease-standard)',
        }} />
      </span>
      {label}
    </label>
  );
}
