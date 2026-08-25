// MOCKUP ONLY — View dành cho Quản Lý Khâu + Giám Đốc
// Quản lý: thấy bản thân + nhân viên của khâu mình kèm đối chiếu chênh lệch
// Giám đốc: thấy toàn bộ các khâu kèm ma trận tổng hợp chênh lệch
import React, { useState } from 'react';
import {
  MOCK_STAFF, SHIFTS, TODAY_ATTENDANCE, STATUS_CONFIG,
  ROLES, getVisibleStaff, isManager, calcShiftDeviation,
} from './mock-data.js';
import EmployeeView from './EmployeeView.jsx';

const DEPT_AVATAR_CLASS = {
  cold: 'cold', hot: 'hot', macaron: 'macaron',
  x42: 'x42', ship: 'ship', owner: 'owner', null: 'owner',
};

const DEPT_LIST = [
  { key: 'all',     label: 'Toàn xưởng', icon: '🏭' },
  { key: 'cold',    label: 'Bếp Lạnh',   icon: '🧊' },
  { key: 'hot',     label: 'Bếp Nóng',   icon: '🔥' },
  { key: 'macaron', label: 'Macaron',    icon: '🧁' },
  { key: 'x42',     label: 'Xưởng 42',   icon: '🏫' },
  { key: 'ship',    label: 'Vận Chuyển', icon: '🛵' },
];

// ── Staff Attendance Card ───────────────────────────────────
function StaffAttendanceCard({ staff, isMe, onClick }) {
  const att = TODAY_ATTENDANCE[staff.id];
  if (!att) return null;

  const shiftCfg = att.shift ? SHIFTS[att.shift] : null;
  const statusCfg = STATUS_CONFIG[att.status];
  const avatarClass = DEPT_AVATAR_CLASS[staff.dept] || 'owner';
  const dev = att.shift ? calcShiftDeviation(att.shift, att.checkin, att.checkout) : null;

  return (
    <div
      className={`mks-staff-card${isMe ? ' is-me' : ''}`}
      onClick={onClick}
      style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px' }}
    >
      {/* Avatar */}
      <div className={`mks-avatar ${avatarClass}`}>
        {staff.avatar}
      </div>

      {/* Info */}
      <div className="mks-staff-info" style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span className="mks-staff-name">{staff.name}</span>
          {isMe && <span className="mks-me-tag">● TÔI</span>}
        </div>
        <div className="mks-staff-role">{staff.dept_label} · SĐT: {staff.phone}</div>

        {shiftCfg ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, color: '#725f50', fontWeight: 800 }}>
              {shiftCfg.icon} Chuẩn: {shiftCfg.startTime}–{shiftCfg.endTime}
            </span>
            <span style={{ fontSize: 12, color: '#a08060' }}>➔</span>
            <span style={{ fontSize: 12, color: '#2d1c10', fontWeight: 900 }}>
              Thực tế: {att.checkin || '—'}{att.checkout ? ` ➔ ${att.checkout}` : ''}
            </span>
          </div>
        ) : (
          <div style={{ fontSize: 12, color: '#a08060', marginTop: 2 }}>Hôm nay không có ca</div>
        )}
      </div>

      {/* Chênh lệch & Trạng thái */}
      <div className="mks-staff-right" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
        <span
          className="mks-staff-status"
          style={{ background: statusCfg.bg, color: statusCfg.color, border: `1.5px solid ${statusCfg.border}` }}
        >
          {statusCfg.icon} {statusCfg.label}
        </span>

        {/* Chênh lệch chi tiết */}
        {dev && dev.checkinType === 'late' && (
          <span className="mks-diff-pill late">
            ⏰ Muộn +{dev.checkinDiff}p
          </span>
        )}
        {dev && dev.checkinType === 'early' && (
          <span className="mks-diff-pill early">
            🟢 Sớm {Math.abs(dev.checkinDiff)}p
          </span>
        )}
        {dev && dev.checkoutType === 'ot' && (
          <span className="mks-diff-pill ot">
            ⚡ OT +{dev.checkoutDiff}p
          </span>
        )}
        {dev && dev.checkinType === 'on_time' && (
          <span className="mks-diff-pill early" style={{ background: '#f9fafb', borderColor: '#e5e7eb', color: '#374151' }}>
            ✓ Đúng 06:00
          </span>
        )}
      </div>
    </div>
  );
}

// ── Khối Thống Kê & Phân Tích Chênh Lệch Quản Lý ─────────────
function DeviationAnalyticsCard({ staffList, title }) {
  let totalLateMinutes = 0;
  let lateCount = 0;
  let totalOtMinutes = 0;
  let otCount = 0;
  let onTimeCount = 0;
  let absentCount = 0;

  staffList.forEach(s => {
    const att = TODAY_ATTENDANCE[s.id];
    if (att && att.shift) {
      const dev = calcShiftDeviation(att.shift, att.checkin, att.checkout);
      if (dev) {
        if (dev.checkinType === 'late') {
          lateCount += 1;
          totalLateMinutes += dev.checkinDiff;
        } else if (dev.checkinType === 'early' || dev.checkinType === 'on_time') {
          onTimeCount += 1;
        }
        if (dev.checkoutType === 'ot') {
          otCount += 1;
          totalOtMinutes += dev.checkoutDiff;
        }
      }
    }
    if (att?.status === 'absent') absentCount += 1;
  });

  return (
    <div style={{ background: '#fff', border: '2px solid #eadcca', borderRadius: 18, padding: '14px 16px', margin: '10px 16px 0', boxShadow: '0 2px 8px rgba(80,40,10,.05)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <span style={{ fontSize: 12, fontWeight: 900, letterSpacing: '.08em', textTransform: 'uppercase', color: '#a08060' }}>
          ⏱️ {title || 'Tổng Hợp Chênh Lệch Giờ Hôm Nay'}
        </span>
        <span style={{ fontSize: 11, fontWeight: 800, color: '#C88A4B' }}>
          {staffList.length} nhân sự
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
        {/* Đi muộn */}
        <div style={{ background: '#fffbeb', border: '1.5px solid #fcd34d', borderRadius: 12, padding: '8px 6px', textAlign: 'center' }}>
          <div style={{ fontSize: 18, fontWeight: 900, color: '#b45309' }}>{lateCount}</div>
          <div style={{ fontSize: 11, fontWeight: 800, color: '#78350f' }}>Đi muộn</div>
          <div style={{ fontSize: 10, color: '#b45309', fontWeight: 700, marginTop: 2 }}>+{totalLateMinutes}p</div>
        </div>

        {/* Tăng ca */}
        <div style={{ background: '#eff6ff', border: '1.5px solid #93c5fd', borderRadius: 12, padding: '8px 6px', textAlign: 'center' }}>
          <div style={{ fontSize: 18, fontWeight: 900, color: '#1d4ed8' }}>{otCount}</div>
          <div style={{ fontSize: 11, fontWeight: 800, color: '#1e40af' }}>Tăng ca (OT)</div>
          <div style={{ fontSize: 10, color: '#1d4ed8', fontWeight: 700, marginTop: 2 }}>+{totalOtMinutes}p</div>
        </div>

        {/* Đúng giờ */}
        <div style={{ background: '#f0fdf4', border: '1.5px solid #86efac', borderRadius: 12, padding: '8px 6px', textAlign: 'center' }}>
          <div style={{ fontSize: 18, fontWeight: 900, color: '#15803d' }}>{onTimeCount}</div>
          <div style={{ fontSize: 11, fontWeight: 800, color: '#166534' }}>Đúng/Sớm</div>
          <div style={{ fontSize: 10, color: '#15803d', fontWeight: 700, marginTop: 2 }}>Chuẩn giờ</div>
        </div>

        {/* Vắng */}
        <div style={{ background: '#fef2f2', border: '1.5px solid #fca5a5', borderRadius: 12, padding: '8px 6px', textAlign: 'center' }}>
          <div style={{ fontSize: 18, fontWeight: 900, color: '#dc2626' }}>{absentCount}</div>
          <div style={{ fontSize: 11, fontWeight: 800, color: '#991b1b' }}>Vắng</div>
          <div style={{ fontSize: 10, color: '#dc2626', fontWeight: 700, marginTop: 2 }}>Chưa vào</div>
        </div>
      </div>
    </div>
  );
}

// ── Staff Detail Drawer ─────────────────────────────────────
function StaffDrawer({ staff, onClose }) {
  const att = TODAY_ATTENDANCE[staff.id];
  if (!att) return null;
  const shiftCfg = att.shift ? SHIFTS[att.shift] : null;
  const statusCfg = STATUS_CONFIG[att.status];
  const avatarClass = DEPT_AVATAR_CLASS[staff.dept] || 'owner';
  const dev = att.shift ? calcShiftDeviation(att.shift, att.checkin, att.checkout) : null;

  return (
    <div className="mks-drawer-overlay" onClick={onClose}>
      <div className="mks-drawer" onClick={e => e.stopPropagation()}>
        <div className="mks-drawer-handle" />

        {/* Header */}
        <div className="mks-drawer-head">
          <div className={`mks-avatar ${avatarClass}`} style={{ width: 52, height: 52, borderRadius: 16, fontSize: 15 }}>
            {staff.avatar}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 18, fontWeight: 900 }}>{staff.name}</div>
            <div style={{ fontSize: 13, color: '#a08060', fontWeight: 700 }}>{staff.dept_label} · SĐT: {staff.phone}</div>
          </div>
          <button className="mks-drawer-close" onClick={onClose}>✕</button>
        </div>

        {/* Trạng thái hôm nay */}
        <div style={{ marginBottom: 14 }}>
          <span className="mks-staff-status"
            style={{ background: statusCfg.bg, color: statusCfg.color, border: `2px solid ${statusCfg.border}`, fontSize: 14, padding: '7px 14px', borderRadius: 20, fontWeight: 900 }}>
            {statusCfg.icon} {statusCfg.label}
          </span>
        </div>

        {/* Ca làm */}
        {shiftCfg && (
          <div style={{ background: shiftCfg.bg, borderRadius: 14, padding: '12px 14px', marginBottom: 12, border: `1.5px solid ${shiftCfg.color}44` }}>
            <div style={{ fontSize: 13, fontWeight: 900, color: shiftCfg.color }}>
              {shiftCfg.icon} {shiftCfg.label} · Quy định: {shiftCfg.startTime} – {shiftCfg.endTime} (8 tiếng)
            </div>
          </div>
        )}

        {/* Chênh lệch chi tiết so với quy định */}
        {dev && (
          <div style={{ background: '#faf6f0', borderRadius: 14, padding: '12px 14px', marginBottom: 14, border: '1.5px solid #eadcca' }}>
            <div style={{ fontSize: 11, fontWeight: 900, color: '#a08060', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>
              ⏱️ Đối Chiếu & Chênh Lệch Giờ Làm
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <div style={{ background: '#fff', padding: 10, borderRadius: 12, border: '1px solid #eadcca' }}>
                <div style={{ fontSize: 11, color: '#725f50', fontWeight: 800 }}>Giờ vào chuẩn: {dev.planStart}</div>
                <div style={{ fontSize: 16, fontWeight: 900, color: '#2d1c10', marginTop: 2 }}>{att.checkin || '—'}</div>
                {att.checkin && (
                  <div className={`mks-dev-diff ${dev.checkinType}`} style={{ marginTop: 3 }}>
                    {dev.checkinLabel}
                  </div>
                )}
              </div>
              <div style={{ background: '#fff', padding: 10, borderRadius: 12, border: '1px solid #eadcca' }}>
                <div style={{ fontSize: 11, color: '#725f50', fontWeight: 800 }}>Giờ ra chuẩn: {dev.planEnd}</div>
                <div style={{ fontSize: 16, fontWeight: 900, color: '#2d1c10', marginTop: 2 }}>{att.checkout || 'Đang làm...'}</div>
                {att.checkout ? (
                  <div className={`mks-dev-diff ${dev.checkoutType}`} style={{ marginTop: 3 }}>
                    {dev.checkoutLabel}
                  </div>
                ) : (
                  <div style={{ fontSize: 11, color: '#a08060', fontWeight: 700, marginTop: 3 }}>Chưa kết thúc ca</div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Timeline */}
        <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: '.1em', textTransform: 'uppercase', color: '#a08060', marginBottom: 10 }}>
          Timeline Hôm Nay
        </div>
        <div className="mks-timeline">
          {att.checkin ? (
            <div className="mks-tl-row">
              <div className="mks-tl-dot-col">
                <div className="mks-tl-dot" style={{ background: '#16a34a' }} />
                {!att.checkout && <div className="mks-tl-line" />}
              </div>
              <div className="mks-tl-time">{att.checkin}</div>
              <div>
                <div className="mks-tl-label">Vào ca</div>
                {att.status === 'late' && <div className="mks-tl-note">⏰ Đi muộn{att.note ? ` — ${att.note}` : ''}</div>}
              </div>
            </div>
          ) : (
            <div style={{ color: '#dc2626', fontSize: 14, fontWeight: 800, padding: '8px 0' }}>
              {att.status === 'absent' ? '❌ Vắng không phép' : '⏳ Chưa chấm vào'}
            </div>
          )}
          {att.checkout && (
            <div className="mks-tl-row">
              <div className="mks-tl-dot-col">
                <div className="mks-tl-dot" style={{ background: '#3b82f6' }} />
              </div>
              <div className="mks-tl-time">{att.checkout}</div>
              <div><div className="mks-tl-label">Ra ca</div></div>
            </div>
          )}
        </div>

        {/* Ghi chú */}
        {att.note && (
          <div style={{ background: '#fffbeb', borderRadius: 12, padding: '10px 14px', marginTop: 12, fontSize: 14, color: '#92400e', borderLeft: '3px solid #fcd34d' }}>
            📝 Lý do / Báo cáo: {att.note}
          </div>
        )}

        {/* Actions (giả lập) */}
        <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {att.status === 'absent' && (
            <button style={{ minHeight: 50, borderRadius: 16, background: '#fef2f2', color: '#dc2626', border: '2px solid #fca5a5', fontSize: 15, fontWeight: 900, cursor: 'pointer' }}
              onClick={onClose}>
              📞 Gọi điện nhắc nhở: {staff.phone}
            </button>
          )}
          <button style={{ minHeight: 50, borderRadius: 16, background: '#f4efe8', color: '#2d1c10', border: 'none', fontSize: 15, fontWeight: 900, cursor: 'pointer' }}
            onClick={onClose}>
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Manager/Director View ──────────────────────────────
export default function ManagerView({ roleKey, onToast }) {
  const role = ROLES[roleKey];
  const myUserId = role?.userId;
  const isDirector = roleKey === 'owner';

  const allVisible = getVisibleStaff(roleKey);
  const myStaff = MOCK_STAFF.find(s => s.id === myUserId);

  const [deptFilter, setDeptFilter]     = useState('all');
  const [diffFilter, setDiffFilter]     = useState('all'); // 'all' | 'late' | 'ot' | 'early' | 'absent'
  const [selectedStaff, setSelectedStaff] = useState(null);
  const [viewingMyOwn, setViewingMyOwn]   = useState(false);

  // Các nhân viên thuộc phạm vi xem
  const teamStaff = isDirector
    ? allVisible
    : allVisible.filter(s => s.id !== myUserId);

  // Lọc theo bộ phận (chỉ cho Giám Đốc)
  let staffByDept = teamStaff;
  if (isDirector && deptFilter !== 'all') {
    staffByDept = teamStaff.filter(s => s.dept === deptFilter);
  }

  // Lọc theo chênh lệch thời gian
  const filtered = diffFilter === 'all'
    ? staffByDept
    : staffByDept.filter(s => {
        const att = TODAY_ATTENDANCE[s.id];
        if (!att) return false;
        if (diffFilter === 'absent') return att.status === 'absent';
        if (diffFilter === 'late') return att.status === 'late';
        if (!att.shift) return false;
        const dev = calcShiftDeviation(att.shift, att.checkin, att.checkout);
        if (diffFilter === 'ot') return dev?.checkoutType === 'ot';
        if (diffFilter === 'early') return dev?.checkinType === 'early';
        return true;
      });

  const diffFilterTabs = [
    { key: 'all',    label: '🧾 Tất cả' },
    { key: 'late',   label: '⏰ Đi muộn (+)' },
    { key: 'ot',     label: '⚡ Tăng ca (OT)' },
    { key: 'early',  label: '🟢 Đến sớm (-)' },
    { key: 'absent', label: '❌ Vắng mặt' },
  ];

  // Nếu quản lý đang xem ca của bản thân
  if (viewingMyOwn && myStaff) {
    return (
      <div style={{ flex: 1, overflowY: 'auto' }}>
        <div style={{ padding: '12px 16px 0' }}>
          <button onClick={() => setViewingMyOwn(false)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#f4efe8', border: 'none', borderRadius: 12, padding: '8px 14px', fontSize: 14, fontWeight: 800, cursor: 'pointer', color: '#2d1c10' }}>
            ← Quay lại quản lý nhóm
          </button>
        </div>
        <div style={{ padding: '10px 16px 8px' }}>
          <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: '.1em', textTransform: 'uppercase', color: '#a08060' }}>
            Chấm công cá nhân của bạn
          </div>
        </div>
        <EmployeeView staff={myStaff} onToast={onToast} />
      </div>
    );
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto' }}>

      {/* Khối Thống kê chênh lệch chuyên sâu */}
      <DeviationAnalyticsCard
        staffList={isDirector ? staffByDept : teamStaff}
        title={isDirector ? 'Báo Cáo Chênh Lệch Toàn Xưởng' : `Chênh Lệch Giờ — ${role?.label || ''}`}
      />

      {/* Thẻ bản thân của Quản Lý Khâu */}
      {!isDirector && myStaff && (
        <div className="mks-section" style={{ marginTop: 10 }}>
          <div className="mks-section-head">
            <span className="mks-section-title">👤 Chấm công của tôi</span>
          </div>
          <div
            className="mks-staff-card is-me"
            onClick={() => setViewingMyOwn(true)}
            style={{ cursor: 'pointer' }}
          >
            <div className={`mks-avatar ${DEPT_AVATAR_CLASS[myStaff.dept] || 'owner'}`}>
              {myStaff.avatar}
            </div>
            <div className="mks-staff-info">
              <div className="mks-staff-name">{myStaff.name} <span style={{ fontSize: 11, color: '#C88A4B', fontWeight: 900 }}>● Tôi</span></div>
              <div className="mks-staff-role">{myStaff.dept_label}</div>
              {(() => {
                const att = TODAY_ATTENDANCE[myStaff.id];
                const shiftCfg = att?.shift ? SHIFTS[att.shift] : null;
                return shiftCfg ? <div className="mks-staff-shift">{shiftCfg.icon} {shiftCfg.label} ({shiftCfg.startTime}–{shiftCfg.endTime})</div> : null;
              })()}
            </div>
            <div className="mks-staff-right">
              {(() => {
                const att = TODAY_ATTENDANCE[myStaff.id];
                const statusCfg = att ? STATUS_CONFIG[att.status] : null;
                const dev = att?.shift ? calcShiftDeviation(att.shift, att.checkin, att.checkout) : null;
                return statusCfg ? (
                  <>
                    <span className="mks-staff-status"
                      style={{ background: statusCfg.bg, color: statusCfg.color, border: `1.5px solid ${statusCfg.border}` }}
                    >
                      {statusCfg.icon} {statusCfg.label}
                    </span>
                    {att.checkin && (
                      <span className="mks-staff-time">
                        Vào: {att.checkin}
                        {dev && dev.checkinType === 'late' && <span className="mks-diff-pill late" style={{ marginLeft: 4 }}>+{dev.checkinDiff}p</span>}
                      </span>
                    )}
                  </>
                ) : null;
              })()}
              <span style={{ fontSize: 12, color: '#C88A4B', fontWeight: 800 }}>Xem đối chiếu →</span>
            </div>
          </div>
        </div>
      )}

      {/* Chọn khâu (Dành riêng cho Giám Đốc) */}
      {isDirector && (
        <div className="mks-section" style={{ marginTop: 12 }}>
          <div className="mks-section-head">
            <span className="mks-section-title">🏭 Lọc Theo Bộ Phận / Khâu</span>
          </div>
          <div style={{ display: 'flex', gap: 6, overflowX: 'auto', scrollbarWidth: 'none', paddingBottom: 4 }}>
            {DEPT_LIST.map(d => (
              <button
                key={d.key}
                onClick={() => setDeptFilter(d.key)}
                style={{
                  padding: '7px 12px',
                  borderRadius: 16,
                  border: '2px solid #eadcca',
                  background: deptFilter === d.key ? '#C88A4B' : '#fff',
                  color: deptFilter === d.key ? '#fff' : '#725f50',
                  fontSize: 12,
                  fontWeight: 800,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                {d.icon} {d.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Danh sách nhân viên & Lọc chênh lệch */}
      <div className="mks-section" style={{ marginTop: 12 }}>
        <div className="mks-section-head">
          <span className="mks-section-title">
            {isDirector ? '👥 Danh Sách & Chênh Lệch Nhân Sự' : `👥 Nhân Viên Khâu ${allVisible[0]?.dept_label || ''}`}
          </span>
          <span style={{ fontSize: 13, color: '#a08060', fontWeight: 800 }}>
            {filtered.length} người
          </span>
        </div>

        {/* Filter tabs chênh lệch */}
        <div className="mks-filter-tabs" style={{ paddingLeft: 0, paddingRight: 0, marginBottom: 12 }}>
          {diffFilterTabs.map(tab => (
            <button key={tab.key}
              className={`mks-filter-tab${diffFilter === tab.key ? ' active' : ''}`}
              onClick={() => setDiffFilter(tab.key)}>
              {tab.label}
            </button>
          ))}
        </div>

        {/* Danh sách thẻ nhân viên */}
        <div className="mks-staff-list">
          {filtered.length === 0 ? (
            <div className="mks-empty">
              <div className="mks-empty-icon">🔍</div>
              <div style={{ fontSize: 15, fontWeight: 800, color: '#2d1c10', marginBottom: 4 }}>Không có nhân viên trong bộ lọc này</div>
              <div style={{ fontSize: 13 }}>Thử chọn tab chênh lệch khác</div>
            </div>
          ) : (
            filtered.map(staff => (
              <StaffAttendanceCard
                key={staff.id}
                staff={staff}
                isMe={staff.id === myUserId && !isDirector}
                onClick={() => setSelectedStaff(staff)}
              />
            ))
          )}
        </div>
      </div>

      {/* Staff Detail Drawer */}
      {selectedStaff && (
        <StaffDrawer staff={selectedStaff} onClose={() => setSelectedStaff(null)} />
      )}
    </div>
  );
}
