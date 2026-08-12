import React from 'react';
import { IconOrders, IconKitchen, IconWarehouse, IconCashbook, IconMenu } from '../icons/FrogIcons';

const core = [
  { key: 'orders', label: 'Đơn Hàng', Icon: IconOrders },
  { key: 'kds', label: 'Bếp KDS', Icon: IconKitchen },
  { key: 'warehouse', label: 'Kho Hàng', Icon: IconWarehouse },
  { key: 'cashbook', label: 'Sổ Quỹ', Icon: IconCashbook },
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
            <it.Icon size={24} style={{ color: 'currentColor' }} />{it.label}
          </button>
        );
      })}
      <button onClick={onMore} style={{
        flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2,
        border: 'none', background: 'none', cursor: 'pointer', font: 'var(--text-caption)', color: 'var(--text-muted)',
      }}>
        <IconMenu size={24} />Thêm
      </button>
    </nav>
  );
}
