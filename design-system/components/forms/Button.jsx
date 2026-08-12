import React from 'react';

const sizes = {
  sm: { padding: '6px 14px', font: 'var(--text-body-sm)', gap: 6 },
  md: { padding: '10px 18px', font: 'var(--text-label)', gap: 8 },
  lg: { padding: '13px 24px', font: '700 15px var(--font-body)', gap: 8 },
};

const variants = {
  primary: { background: 'var(--action-primary)', color: 'var(--text-on-primary)', border: '1px solid transparent' },
  secondary: { background: 'var(--surface-card)', color: 'var(--text-primary)', border: '1px solid var(--border-default)' },
  ghost: { background: 'transparent', color: 'var(--text-primary)', border: '1px solid transparent' },
  danger: { background: 'var(--status-danger)', color: '#fff', border: '1px solid transparent' },
};

const hoverBg = {
  primary: 'var(--action-primary-hover)',
  secondary: 'var(--surface-sunken)',
  ghost: 'var(--surface-sunken)',
  danger: '#C24541',
};

export function Button({ children, variant = 'primary', size = 'md', icon, disabled = false, onClick, style }) {
  const v = variants[variant] || variants.primary;
  const s = sizes[size] || sizes.md;
  return (
    <button
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: s.gap,
        padding: s.padding, font: s.font, borderRadius: 'var(--radius-md)',
        cursor: disabled ? 'not-allowed' : 'pointer', transition: 'background var(--duration-fast) var(--ease-standard), transform var(--duration-fast)',
        opacity: disabled ? 0.5 : 1, whiteSpace: 'nowrap',
        ...v, ...style,
      }}
      onMouseEnter={(e) => { if (!disabled) e.currentTarget.style.background = hoverBg[variant] || hoverBg.primary; }}
      onMouseLeave={(e) => { if (!disabled) e.currentTarget.style.background = v.background; }}
      onMouseDown={(e) => { if (!disabled) e.currentTarget.style.transform = 'scale(0.97)'; }}
      onMouseUp={(e) => { if (!disabled) e.currentTarget.style.transform = 'scale(1)'; }}
    >
      {icon && <span aria-hidden="true">{icon}</span>}
      {children}
    </button>
  );
}
