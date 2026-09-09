import React from 'react';
import { NavBadge } from './NavBadge';
import { IconHome, IconMegaphone, IconReceipt, IconCheck, IconUser, IconChat, IconMenu } from '../icons/FrogIcons';

const items = [
  { key: 'home', label: 'Hôm nay', Icon: IconHome },
  { key: 'feed', label: 'Bảng tin', Icon: IconMegaphone },
  { key: 'orders', label: 'Đơn hàng', Icon: IconReceipt },
  { key: 'tasks', label: 'Việc', Icon: IconCheck },
  { key: 'chat', label: 'Chat', Icon: IconChat },
  { key: 'profile', label: 'Của tôi', Icon: IconUser },
];

// ⚠️ SỬA LỖI THẬT (09/09/2026): App.jsx đã truyền sẵn `onMore` để mở
// MoreSheet (danh sách MORE_ITEMS — KPI Đo Lường, Tổng Quan KPI, Việc Của
// Tôi, Công Nợ Khách Hàng, Tăng Ca & Lương...) nhưng component này chưa từng
// nhận/hiển thị nút "Thêm" — khiến TOÀN BỘ các màn đó không có cách nào bấm
// tới được trên điện thoại, âm thầm không báo lỗi ở đâu cả.
export function BottomNav({ active = 'home', onSelect, onMore, badges = {} }) {
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
    <button
      className="sumi-nav-item"
      onClick={() => onMore?.()}
      aria-label="Thêm"
    >
      <span className="sumi-nav-icon"><IconMenu size={24} /></span>
      <span>Thêm</span>
    </button>
  </nav>;
}
