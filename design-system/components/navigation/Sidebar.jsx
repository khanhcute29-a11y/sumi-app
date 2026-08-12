import React from 'react';

const items = [
  { key: 'orders', label: 'Đơn Hàng', icon: '📦' },
  { key: 'kds', label: 'Bếp KDS', icon: '🔥' },
  { key: 'warehouse', label: 'Kho Hàng', icon: '📋' },
  { key: 'cashbook', label: 'Sổ Quỹ', icon: '💰' },
  { key: 'shipping', label: 'Vận Chuyển', icon: '🚚' },
  { key: 'reports', label: 'Báo Cáo', icon: '📈' },
];

export function Sidebar({ active = 'orders', onSelect, brand = 'Sumi Bakery', style }) {
  return (
    <nav style={{
      width: 'var(--sidebar-w)', flexShrink: 0, background: 'var(--surface-card)', height: '100%',
      display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--border-subtle)', ...style,
    }}>
      <div style={{ padding: '20px 20px 16px', font: 'var(--text-title)', color: 'var(--brand-brown)' }}>{brand}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '0 10px', flex: 1, overflowY: 'auto' }}>
        {items.map((it) => {
          const isActive = it.key === active;
          return (
            <button key={it.key} onClick={() => onSelect && onSelect(it.key)} style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 'var(--radius-sm)',
              border: 'none', cursor: 'pointer', textAlign: 'left', font: 'var(--text-body)',
              background: isActive ? 'var(--surface-primary-soft)' : 'transparent',
              color: isActive ? 'var(--primary-700)' : 'var(--text-primary)', fontWeight: isActive ? 600 : 400,
            }}>
              <span aria-hidden="true">{it.icon}</span>{it.label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
