import React from 'react';

export function Card({ children, padding = 16, style }) {
  return (
    <div style={{
      background: 'var(--surface-card)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-sm)',
      padding, ...style,
    }}>
      {children}
    </div>
  );
}
