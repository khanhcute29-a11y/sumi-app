import React, { useState } from 'react';
import {
  IconDashboard, IconOrders, IconKitchen, IconWarehouse, IconCashbook,
  IconShipping, IconProducts, IconShifts, IconReports, IconCustomers,
  IconSettings, IconStationHot, IconStationCold, IconStationWorkshop, IconStationSparkle,
} from '../icons/FrogIcons';

const items = [
  { key: 'dashboard', label: 'Tổng Quan', Icon: IconDashboard },
  { key: 'orders', label: 'Đơn Hàng', Icon: IconOrders },
  { key: 'kds', label: 'Bếp KDS', Icon: IconKitchen },
  { key: 'warehouse', label: 'Kho Hàng', Icon: IconWarehouse },
  { key: 'cashbook', label: 'Sổ Quỹ', Icon: IconCashbook },
  { key: 'shipping', label: 'Vận Chuyển', Icon: IconShipping },
  { key: 'products', label: 'Sản Phẩm', Icon: IconProducts },
  { key: 'shifts', label: 'Ca Làm Việc', Icon: IconShifts },
  { key: 'reports', label: 'Báo Cáo', Icon: IconReports },
  { key: 'crm', label: 'Khách Hàng', Icon: IconCustomers },
  { key: 'settings', label: 'Thiết Lập', Icon: IconSettings },
];

const KDS_STATIONS = [
  { key: 'nong', label: 'Bếp Nóng', Icon: IconStationHot },
  { key: 'lanh', label: 'Bếp Lạnh', Icon: IconStationCold },
  { key: 'xuong42', label: 'Xưởng 42', Icon: IconStationWorkshop },
  { key: 'xuong41', label: 'Xưởng 41', Icon: IconStationSparkle },
];

export function Sidebar({ active = 'orders', activeStation, onSelect, onSelectStation, brand = 'Sumi Bakery', style }) {
  const [kdsOpen, setKdsOpen] = useState(active === 'kds');

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
          if (it.key !== 'kds') {
            return (
              <button key={it.key} onClick={() => onSelect && onSelect(it.key)} style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 'var(--radius-sm)',
                border: 'none', cursor: 'pointer', textAlign: 'left', font: 'var(--text-body)',
                background: isActive ? 'var(--surface-primary-soft)' : 'transparent',
                color: isActive ? 'var(--primary-700)' : 'var(--text-primary)', fontWeight: isActive ? 600 : 400,
              }}>
                <it.Icon size={20} style={{ color: iconColor }} />{it.label}
              </button>
            );
          }
          return (
            <div key={it.key}>
              <button onClick={() => { onSelect && onSelect(it.key); onSelectStation && onSelectStation('all'); setKdsOpen(true); }} style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 'var(--radius-sm)',
                border: 'none', cursor: 'pointer', textAlign: 'left', font: 'var(--text-body)',
                background: isActive ? 'var(--surface-primary-soft)' : 'transparent',
                color: isActive ? 'var(--primary-700)' : 'var(--text-primary)', fontWeight: isActive ? 600 : 400,
              }}>
                <it.Icon size={20} style={{ color: iconColor }} />
                <span style={{ flex: 1 }}>{it.label}</span>
                <span aria-hidden="true" style={{ color: 'var(--text-muted)', font: 'var(--text-caption)' }}>{kdsOpen ? '▾' : '▸'}</span>
              </button>
              {kdsOpen && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 1, paddingLeft: 14 }}>
                  {KDS_STATIONS.map((s) => {
                    const stationActive = isActive && activeStation === s.key;
                    const stationIconColor = stationActive ? 'var(--primary-700)' : 'var(--text-secondary)';
                    return (
                      <button key={s.key} onClick={() => { onSelect && onSelect('kds'); onSelectStation && onSelectStation(s.key); }} style={{
                        display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 'var(--radius-sm)',
                        border: 'none', cursor: 'pointer', textAlign: 'left', font: 'var(--text-body-sm)',
                        background: stationActive ? 'var(--surface-primary-soft)' : 'transparent',
                        color: stationActive ? 'var(--primary-700)' : 'var(--text-secondary)', fontWeight: stationActive ? 600 : 400,
                      }}>
                        <s.Icon size={18} style={{ color: stationIconColor }} />{s.label}
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
