import React from 'react';

export function Tabs({ tabs = [], active, onChange, style }) {
  return (
    <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--border-subtle)', ...style }}>
      {tabs.map((t) => {
        const isActive = t.key === active;
        return (
          <button key={t.key} onClick={() => onChange && onChange(t.key)} style={{
            padding: '10px 14px', border: 'none', background: 'none', cursor: 'pointer',
            font: isActive ? '700 14px var(--font-body)' : 'var(--text-body)',
            color: isActive ? 'var(--action-primary)' : 'var(--text-secondary)',
            borderBottom: `2px solid ${isActive ? 'var(--action-primary)' : 'transparent'}`, marginBottom: -1,
          }}>
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
