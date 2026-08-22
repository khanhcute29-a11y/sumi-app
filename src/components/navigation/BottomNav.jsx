import React from 'react';
import { NavBadge } from './NavBadge';

const items = [
  { key: 'home', label: 'Hôm nay', icon: '🏠' },
  { key: 'feed', label: 'Bảng tin', icon: '📢' },
  { key: 'orders', label: 'Đơn hàng', icon: '🧾' },
  { key: 'tasks', label: 'Việc', icon: '✅' },
  { key: 'profile', label: 'Của tôi', icon: '👤' },
];

export function BottomNav({ active = 'home', onSelect, badges = {} }) {
  return <nav className="sumi-bottom-nav" aria-label="Điều hướng chính">
    {items.map(item => <button
      key={item.key}
      className={`sumi-nav-item ${active === item.key ? 'active' : ''}`}
      onClick={() => onSelect?.(item.key)}
      aria-current={active === item.key ? 'page' : undefined}
    >
      <span className="sumi-nav-icon">{item.icon}{badges[item.key] > 0 && <NavBadge count={badges[item.key]} />}</span>
      <span>{item.label}</span>
    </button>)}
  </nav>;
}
