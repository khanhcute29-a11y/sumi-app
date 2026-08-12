import React from 'react';

export function Select({ label, value, onChange, options = [], placeholder = 'Chọn...', style }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6, font: 'var(--text-body)', width: '100%', ...style }}>
      {label && <span style={{ font: 'var(--text-label)', color: 'var(--text-primary)' }}>{label}</span>}
      <select
        value={value}
        onChange={onChange}
        style={{
          padding: '10px 12px', borderRadius: 'var(--radius-sm)', font: 'var(--text-body)',
          border: '1px solid var(--border-default)', background: 'var(--surface-card)',
          color: value ? 'var(--text-primary)' : 'var(--text-muted)', outline: 'none', appearance: 'none',
        }}
      >
        <option value="" disabled>{placeholder}</option>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}
