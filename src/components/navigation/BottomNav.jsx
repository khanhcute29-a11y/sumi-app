import React from 'react';
import { NavBadge } from './NavBadge';
import { IconHome, IconMegaphone, IconReceipt, IconCheck, IconUser } from '../icons/FrogIcons';

const items = [
  { key: 'home', label: 'Hôm nay', Icon: IconHome },
  { key: 'feed', label: 'Bảng tin', Icon: IconMegaphone },
  { key: 'orders', label: 'Đơn hàng', Icon: IconReceipt },
  { key: 'tasks', label: 'Việc', Icon: IconCheck },
  { key: 'profile', label: 'Của tôi', Icon: IconUser },
];

export function BottomNav({ active = 'home', onSelect, badges = {} }) {
  return <nav className="sumi-bottom-nav" aria-label="Điều hướng chính">
    {items.map(item => <button
      key={item.key}
      className={`sumi-nav-item ${active === item.key ? 'active' : ''}`}
      onClick={() => onSelect?.(item.key)}
      aria-current={active === item.key ? 'page' : undefined}
    >
      <span className="sumi-nav-icon"><item.Icon size={24} />{badges[item.key] > 0 && <NavBadge count={badges[item.key]} />}</span>
      <span>{item.label}</span>
    </button>)}
  </nav>;
}
