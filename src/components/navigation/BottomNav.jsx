import React from 'react';
import { IconOrders, IconKitchen, IconWarehouse, IconCashbook, IconMenu } from '../icons/FrogIcons';
import { NavBadge } from './NavBadge';

const core = [
  { key: 'orders', label: 'Đơn Hàng', Icon: IconOrders },
  { key: 'kds', label: 'Bếp KDS', Icon: IconKitchen },
  { key: 'warehouse', label: 'Kho Hàng', Icon: IconWarehouse },
  { key: 'cashbook', label: 'Sổ Quỹ', Icon: IconCashbook },
];

export function BottomNav({ active = 'orders', onSelect, onMore, style, badges = {} }) {
  const moreBadgeTotal = (badges.approvals || 0) + (badges.incidents || 0);
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
            color: isActive ? 'var(--action-primary)' : 'var(--text-muted)', position: 'relative',
          }}>
            <span style={{ position: 'relative' }}>
              <it.Icon size={24} style={{ color: 'currentColor' }} />
              {badges[it.key] > 0 && <span style={{ position: 'absolute', top: -4, right: -8 }}><NavBadge count={badges[it.key]} /></span>}
            </span>
            {it.label}
          </button>
        );
      })}
      <button onClick={onMore} style={{
        flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2,
        border: 'none', background: 'none', cursor: 'pointer', font: 'var(--text-caption)', color: 'var(--text-muted)',
      }}>
        <span style={{ position: 'relative' }}>
          <IconMenu size={24} />
          {moreBadgeTotal > 0 && <span style={{ position: 'absolute', top: -4, right: -8 }}><NavBadge count={moreBadgeTotal} /></span>}
        </span>
        Thêm
      </button>
    </nav>
  );
}
