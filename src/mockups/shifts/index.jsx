// MOCKUP ONLY — Shifts Attendance Root Shell
// Truy cập: http://localhost:5173/?mockup=shifts
// Không import từ bất kỳ file production nào
import React, { useState } from 'react';
import './mockup-shifts.css';
import { ROLES, MOCK_STAFF, isManager } from './mock-data.js';
import EmployeeView from './EmployeeView.jsx';
import ManagerView from './ManagerView.jsx';

// Nút chuyển vai trò cho demo
const DEMO_ROLES = [
  { key: 'owner',               label: '👑 Giám Đốc' },
  { key: 'kitchen_lead_cold',   label: '🧊 BT Bếp Lạnh' },
  { key: 'kitchen_lead_hot',    label: '🔥 BT Bếp Nóng' },
  { key: 'kitchen_lead_macaron',label: '🧁 BT Macaron' },
  { key: 'baker_cold',          label: '👤 NV Bếp Lạnh' },
];

function Toast({ msg }) {
  if (!msg) return null;
  return <div className="mks-toast">{msg}</div>;
}

export default function MockupShiftsRoot() {
  const [roleKey, setRoleKey] = useState('owner');
  const [toast, setToast]     = useState('');

  const role = ROLES[roleKey];
  const manager = isManager(roleKey);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2500);
  };

  // Title theo vai trò
  const headerTitle = roleKey === 'owner'
    ? 'Chấm Công — Toàn Xưởng'
    : manager
      ? `Chấm Công — ${role?.dept_label || role?.label || ''}`
      : 'Chấm Công Của Tôi';

  const headerSub = role?.desc || '';

  return (
    <div className="mks-shell">

      {/* ─── Header ─── */}
      <div className="mks-header">
        <div className="mks-header-top">
          <button className="mks-back" onClick={() => window.location.href = '/'}>
            ← App thật
          </button>
          <div style={{ flex: 1, textAlign: 'center' }}>
            <div className="mks-header-title">{headerTitle}</div>
            <div className="mks-header-sub">{headerSub}</div>
          </div>
          <div style={{ width: 72 }} />
        </div>

        {/* Demo Role Switcher */}
        <div className="mks-role-bar">
          {DEMO_ROLES.map(r => (
            <button
              key={r.key}
              className={`mks-role-btn${roleKey === r.key ? ' active' : ''}`}
              onClick={() => setRoleKey(r.key)}
            >
              {r.label}
            </button>
          ))}
        </div>

        {/* Demo badge */}
        <div style={{ textAlign: 'center', marginTop: 8, fontSize: 11, color: 'rgba(255,255,255,.6)', fontWeight: 800, letterSpacing: '.06em' }}>
          ◉ MOCKUP — Nhấn vai trò bên trên để xem góc nhìn tương ứng
        </div>
      </div>

      {/* ─── Content ─── */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {manager ? (
          <ManagerView roleKey={roleKey} onToast={showToast} />
        ) : (
          (() => {
            const staff = MOCK_STAFF.find(s => s.id === ROLES[roleKey]?.userId);
            return staff
              ? <EmployeeView staff={staff} onToast={showToast} />
              : <div className="mks-empty"><div className="mks-empty-icon">👤</div><div>Không tìm thấy nhân viên</div></div>;
          })()
        )}
      </div>

      <Toast msg={toast} />
    </div>
  );
}
