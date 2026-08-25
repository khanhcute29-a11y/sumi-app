import React, { useState } from 'react';
import {
  IconDashboard, IconOrders, IconKitchen, IconWarehouse, IconCashbook,
  IconShipping, IconProducts, IconShifts, IconReports, IconClipboard, IconCustomers, IconStaff,
  IconSettings, IconStationHot, IconStationCold, IconStationWorkshop, IconStationSparkle, IconCheck, IconWarning, IconMoney,
} from '../icons/FrogIcons';
import { NavBadge } from './NavBadge';

const items = [
  { key: 'dashboard', label: 'Tổng Quan', Icon: IconDashboard },
  { key: 'orders', label: 'Đơn Hàng', Icon: IconOrders },
  { key: 'kds', label: 'Bếp KDS', Icon: IconKitchen },
  { key: 'warehouse', label: 'Kho Hàng', Icon: IconWarehouse },
  { key: 'cashbook', label: 'Sổ Quỹ', Icon: IconCashbook },
  { key: 'shipping', label: 'Vận Chuyển', Icon: IconShipping },
  { key: 'products', label: 'Sản Phẩm', Icon: IconProducts },
  { key: 'shifts', label: 'Ca Làm Việc', Icon: IconShifts },
  { key: 'approvals', label: 'Yêu Cầu Duyệt', Icon: IconCheck },
  { key: 'tasks', label: 'Quản Lý Công Việc', Icon: IconClipboard },
  { key: 'incidents', label: 'Báo Cáo Sự Cố', Icon: IconWarning },
  { key: 'reports', label: 'Báo Cáo', Icon: IconReports },
  { key: 'kpi', label: 'KPI', Icon: IconClipboard },
  { key: 'schoolRevenue', label: 'Doanh Thu Trường Học', Icon: IconMoney },
  { key: 'crm', label: 'Khách Hàng', Icon: IconCustomers },
  { key: 'staff', label: 'Nhân Viên', Icon: IconStaff },
  { key: 'settings', label: 'Thiết Lập', Icon: IconSettings },
];

const KDS_STATIONS = [
  { key: 'nong', label: 'Bếp Nóng', Icon: IconStationHot },
  { key: 'lanh', label: 'Bếp Lạnh', Icon: IconStationCold },
  { key: 'xuong42', label: 'Xưởng 42', Icon: IconStationWorkshop },
  { key: 'xuong41', label: 'Xưởng 41', Icon: IconStationSparkle },
];

const WAREHOUSE_BRANCHES = [
  { key: 'bakery', label: 'Kho Bakery', Icon: IconWarehouse },
  { key: 'xuong42', label: 'Kho Xưởng 42', Icon: IconStationWorkshop },
  { key: 'xuong41', label: 'Kho Xưởng 41', Icon: IconStationSparkle },
];

// Mục có submenu: key nav -> { subs, activeSub, onSelectSub }
function useSubmenus({ activeStation, onSelectStation, activeBranch, onSelectBranch }) {
  return {
    kds: { subs: KDS_STATIONS, activeSub: activeStation, onSelectSub: onSelectStation },
    warehouse: { subs: WAREHOUSE_BRANCHES, activeSub: activeBranch, onSelectSub: onSelectBranch },
  };
}

export function Sidebar({ active = 'orders', activeStation, onSelectStation, activeBranch, onSelectBranch, onSelect, brand = 'Sumi Bakery', style, badges = {} }) {
  const [openKeys, setOpenKeys] = useState({ [active]: true });
  const submenus = useSubmenus({ activeStation, onSelectStation, activeBranch, onSelectBranch });

  return (
    <nav style={{
      width: 'var(--sidebar-w)', flexShrink: 0, background: 'var(--surface-card)', height: '100%',
      display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--border-subtle)', ...style,
    }}>
      <div style={{ padding: '20px 20px 16px', font: 'var(--text-title)', color: 'var(--brand-brown)' }}>{brand}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '0 10px', flex: 1, overflowY: 'auto' }}>
        {items.map((it) => {
          const isActive = it.key === active;
          const iconColor = isActive ? 'var(--primary-700)' : 'var(--text-primary)';
          const submenu = submenus[it.key];
          if (!submenu) {
            return (
              <button key={it.key} onClick={() => onSelect && onSelect(it.key)} style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 'var(--radius-sm)',
                border: 'none', cursor: 'pointer', textAlign: 'left', font: 'var(--text-body)',
                background: isActive ? 'var(--surface-primary-soft)' : 'transparent',
                color: isActive ? 'var(--primary-700)' : 'var(--text-primary)', fontWeight: isActive ? 600 : 400,
              }}>
                <it.Icon size={20} style={{ color: iconColor }} /><span style={{ flex: 1 }}>{it.label}</span><NavBadge count={badges[it.key]} />
              </button>
            );
          }
          const isOpen = !!openKeys[it.key];
          return (
            <div key={it.key}>
              <button onClick={() => { onSelect && onSelect(it.key); submenu.onSelectSub && submenu.onSelectSub('all'); setOpenKeys((prev) => ({ ...prev, [it.key]: true })); }} style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 'var(--radius-sm)',
                border: 'none', cursor: 'pointer', textAlign: 'left', font: 'var(--text-body)',
                background: isActive ? 'var(--surface-primary-soft)' : 'transparent',
                color: isActive ? 'var(--primary-700)' : 'var(--text-primary)', fontWeight: isActive ? 600 : 400,
              }}>
                <it.Icon size={20} style={{ color: iconColor }} />
                <span style={{ flex: 1 }}>{it.label}</span>
                <NavBadge count={badges[it.key]} />
                <span aria-hidden="true" style={{ color: 'var(--text-muted)', font: 'var(--text-caption)' }}>{isOpen ? '▾' : '▸'}</span>
              </button>
              {isOpen && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 1, paddingLeft: 14 }}>
                  {submenu.subs.map((s) => {
                    const subActive = isActive && submenu.activeSub === s.key;
                    const subIconColor = subActive ? 'var(--primary-700)' : 'var(--text-secondary)';
                    return (
                      <button key={s.key} onClick={() => { onSelect && onSelect(it.key); submenu.onSelectSub && submenu.onSelectSub(s.key); }} style={{
                        display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 'var(--radius-sm)',
                        border: 'none', cursor: 'pointer', textAlign: 'left', font: 'var(--text-body-sm)',
                        background: subActive ? 'var(--surface-primary-soft)' : 'transparent',
                        color: subActive ? 'var(--primary-700)' : 'var(--text-secondary)', fontWeight: subActive ? 600 : 400,
                      }}>
                        <s.Icon size={18} style={{ color: subIconColor }} />{s.label}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </nav>
  );
}
