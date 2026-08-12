import React from 'react';

export function Input({ label, placeholder, value, onChange, error, helpText, type = 'text', style, onFocus, onBlur, onKeyDown, inputMode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6, font: 'var(--text-body)', width: '100%', ...style }}>
      {label && <span style={{ font: 'var(--text-label)', color: 'var(--text-primary)' }}>{label}</span>}
      <input
        type={type}
        inputMode={inputMode}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        onKeyDown={onKeyDown}
        style={{
          padding: '10px 12px', borderRadius: 'var(--radius-sm)', font: 'var(--text-body)',
          border: `1px solid ${error ? 'var(--status-danger)' : 'var(--border-default)'}`,
          background: 'var(--surface-card)', color: 'var(--text-primary)', outline: 'none',
          transition: 'border-color var(--duration-fast) var(--ease-standard)',
        }}
        onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--border-primary)'; e.currentTarget.style.boxShadow = '0 0 0 3px var(--focus-ring)'; onFocus?.(e); }}
        onBlur={(e) => { e.currentTarget.style.borderColor = error ? 'var(--status-danger)' : 'var(--border-default)'; e.currentTarget.style.boxShadow = 'none'; onBlur?.(e); }}
      />
      {(error || helpText) && (
        <span style={{ font: 'var(--text-caption)', color: error ? 'var(--status-danger)' : 'var(--text-muted)' }}>
          {error || helpText}
        </span>
      )}
    </label>
  );
}
