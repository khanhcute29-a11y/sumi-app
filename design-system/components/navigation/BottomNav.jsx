import React from 'react';

const core = [
  { key: 'orders', label: 'Đơn Hàng', icon: '📦' },
  { key: 'kds', label: 'Bếp KDS', icon: '🔥' },
  { key: 'warehouse', label: 'Kho Hàng', icon: '📋' },
  { key: 'cashbook', label: 'Sổ Quỹ', icon: '💰' },
];

export function BottomNav({ active = 'orders', onSelect, onMore, style }) {
  return (
    <nav style={{
      position: 'fixed', left: 0, right: 0, bottom: 0, height: 'var(--bottom-nav-h)', background: 'var(--surface-card)',
      borderTop: '1px solid var(--border-subtle)', display: 'flex', boxShadow: '0 -2px 12px rgba(74,50,37,.06)', ...style,
    }}>
      {core.map((it) => {
        const isActive = it.key === active;
        return (
          <button key={it.key} onClick={() => onSelect && onSelect(it.key)} style={{
            flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2,
            border: 'none', background: 'none', cursor: 'pointer', font: 'var(--text-caption)',
            color: isActive ? 'var(--action-primary)' : 'var(--text-muted)',
          }}>
            <span style={{ fontSize: 20 }} aria-hidden="true">{it.icon}</span>{it.label}
          </button>
        );
      })}
      <button onClick={onMore} style={{
        flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2,
        border: 'none', background: 'none', cursor: 'pointer', font: 'var(--text-caption)', color: 'var(--text-muted)',
      }}>
        <span style={{ fontSize: 20 }} aria-hidden="true">☰</span>Thêm
      </button>
    </nav>
  );
}
