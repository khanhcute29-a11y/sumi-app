import React, { useState } from 'react';
import {
  MOCK_STAFF, SHIFTS, TODAY_ATTENDANCE, MY_MONTHLY_HISTORY,
  STATUS_CONFIG, MONTH_DOT_COLOR, calcMonthlySummary,
  calcShiftDeviation,
} from './mock-data.js';

const TODAY = '2026-08-25';
const DAYS = ['CN','T2','T3','T4','T5','T6','T7'];

// Lịch mini tháng 8
function MiniCalendar({ history, userId }) {
  const year = 2026, month = 8; // tháng 8
  const firstDay = new Date(year, month - 1, 1).getDay(); // 0=CN
  const daysInMonth = 31;
  const histMap = {};
  history.forEach(d => { histMap[d.date.slice(-2)] = d; });

  const cells = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  return (
    <div className="mks-mini-cal">
      <div className="mks-cal-header">
        <button className="mks-cal-nav">‹</button>
        <span className="mks-cal-month">Tháng 8 / 2026</span>
        <button className="mks-cal-nav">›</button>
      </div>
      <div className="mks-cal-grid">
        {DAYS.map(d => <div key={d} className="mks-cal-dow">{d}</div>)}
        {cells.map((day, i) => {
          if (!day) return <div key={i} />;
          const key = String(day).padStart(2, '0');
          const entry = histMap[key];
          const isToday = day === 25;
          const dotColor = entry ? MONTH_DOT_COLOR[entry.status] : null;
          return (
            <div key={i} className={`mks-cal-day${isToday ? ' today' : ''}`}>
              <span className="mks-cal-num">{day}</span>
              {dotColor && <span className="mks-cal-dot" style={{ background: dotColor }} />}
            </div>
          );
        })}
      </div>
      {/* Legend */}
      <div style={{ display: 'flex', gap: 12, marginTop: 10, flexWrap: 'wrap' }}>
        {[
          { color: '#16a34a', label: 'Đúng giờ' },
          { color: '#f59e0b', label: 'Muộn' },
          { color: '#dc2626', label: 'Vắng' },
          { color: '#7c3aed', label: 'Nghỉ phép' },
        ].map(l => (
          <span key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700, color: '#725f50' }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: l.color, display: 'inline-block' }} />
            {l.label}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function EmployeeView({ staff, onToast }) {
  const attendance = TODAY_ATTENDANCE[staff.id];
  const shiftCfg = attendance?.shift ? SHIFTS[attendance.shift] : null;
  const statusCfg = attendance ? STATUS_CONFIG[attendance.status] : null;
  const summary = calcMonthlySummary(MY_MONTHLY_HISTORY);

  const [checkedIn, setCheckedIn]   = useState(!!attendance?.checkin);
  const [checkedOut, setCheckedOut] = useState(!!attendance?.checkout);
  const [inTime, setInTime]   = useState(attendance?.checkin  || null);
  const [outTime, setOutTime] = useState(attendance?.checkout || null);

  const nowStr = () => {
    const n = new Date();
    return `${String(n.getHours()).padStart(2,'0')}:${String(n.getMinutes()).padStart(2,'0')}`;
  };

  const handleCheckin = () => {
    const t = nowStr();
    setInTime(t); setCheckedIn(true);
    onToast(`✅ Đã chấm vào ca — ${t}`);
  };
  const handleCheckout = () => {
    const t = nowStr();
    setOutTime(t); setCheckedOut(true);
    onToast(`🏁 Đã chấm ra ca — ${t}`);
  };

  // Tính chênh lệch so với quy định
  const dev = attendance?.shift ? calcShiftDeviation(attendance.shift, inTime, outTime) : null;

  return (
    <>
      {/* Thẻ ca hôm nay */}
      <div className="mks-today-card" style={{ margin: '14px 16px 0' }}>
        <div className="mks-today-label">CA HÔM NAY</div>
        <div className="mks-today-date">Thứ Hai, 25/08/2026</div>
        {shiftCfg ? (
          <div className="mks-today-shift">
            <span className="mks-today-shift-icon">{shiftCfg.icon}</span>
            <div className="mks-today-shift-info">
              <div className="mks-today-shift-name">{shiftCfg.label}</div>
              <div className="mks-today-shift-time">Quy định: {shiftCfg.time} (8 tiếng)</div>
            </div>
            {statusCfg && (
              <span className="mks-today-status-badge"
                style={{ background: statusCfg.bg, color: statusCfg.color }}>
                {statusCfg.icon} {statusCfg.label}
              </span>
            )}
          </div>
        ) : (
          <div style={{ background: 'rgba(255,255,255,.1)', borderRadius: 14, padding: '12px 14px', color: 'rgba(255,255,255,.6)', fontSize: 14 }}>
            Hôm nay không có ca làm việc
          </div>
        )}
      </div>

      {/* ── Khối Chênh Lệch Thời Gian So Với Quy Định ── */}
      {shiftCfg && dev && (
        <div className="mks-deviation-card">
          <div className="mks-deviation-head">
            <span className="mks-deviation-title">
              ⏱️ Chênh Lệch So Với Quy Định
            </span>
            <span style={{ fontSize: 11, fontWeight: 800, color: '#a08060' }}>
              Chuẩn {dev.planStart}–{dev.planEnd}
            </span>
          </div>

          <div className="mks-deviation-grid">
            {/* Vào ca */}
            <div className={`mks-deviation-box${dev.checkinType === 'late' ? ' alert' : dev.checkinType === 'early' ? ' success' : ''}`}>
              <span className="mks-dev-label">Vào ca (Quy định: {dev.planStart})</span>
              <span className="mks-dev-val">
                {inTime ? inTime : 'Chưa vào ca'}
              </span>
              {inTime && (
                <span className={`mks-dev-diff ${dev.checkinType}`}>
                  {dev.checkinType === 'late' ? '⏰ ' : dev.checkinType === 'early' ? '🟢 ' : '✓ '}
                  {dev.checkinLabel}
                </span>
              )}
            </div>

            {/* Ra ca */}
            <div className={`mks-deviation-box${dev.checkoutType === 'ot' ? ' success' : dev.checkoutType === 'early' ? ' alert' : ''}`}>
              <span className="mks-dev-label">Ra ca (Quy định: {dev.planEnd})</span>
              <span className="mks-dev-val">
                {outTime ? outTime : 'Đang trong ca...'}
              </span>
              {outTime ? (
                <span className={`mks-dev-diff ${dev.checkoutType}`}>
                  {dev.checkoutType === 'ot' ? '⚡ ' : dev.checkoutType === 'early' ? '⚠️ ' : '✓ '}
                  {dev.checkoutLabel}
                </span>
              ) : (
                <span style={{ fontSize: 12, color: '#725f50', fontWeight: 700 }}>
                  Chưa chấm ra
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Nút chấm công */}
      {shiftCfg && (
        <div className="mks-checkin-area">
          {/* Chấm vào */}
          {!checkedIn ? (
            <button className="mks-checkin-btn start" onClick={handleCheckin}>
              <span>🟢 Bắt đầu {shiftCfg.label}</span>
              <span style={{ fontSize: 13, opacity: .8 }}>Nhấn để chấm vào</span>
            </button>
          ) : (
            <button className="mks-checkin-btn done" style={{ cursor: 'default' }}>
              <div>
                <span>✅ Đã vào ca {shiftCfg.label}</span>
                {dev && dev.checkinType === 'late' && (
                  <span className="mks-diff-pill late" style={{ marginLeft: 8 }}>
                    +{dev.checkinDiff}p muộn
                  </span>
                )}
              </div>
              <span className="mks-checkin-timestamp">{inTime}</span>
            </button>
          )}

          {/* Chấm ra */}
          {checkedIn && !checkedOut && (
            <button className="mks-checkin-btn end" onClick={handleCheckout}>
              <span>🔴 Kết thúc {shiftCfg.label}</span>
              <span style={{ fontSize: 13, opacity: .8 }}>Nhấn để chấm ra</span>
            </button>
          )}
          {checkedOut && (
            <button className="mks-checkin-btn done" style={{ cursor: 'default' }}>
              <div>
                <span>🏁 Đã ra ca</span>
                {dev && dev.checkoutType === 'ot' && (
                  <span className="mks-diff-pill ot" style={{ marginLeft: 8 }}>
                    +{dev.checkoutDiff}p OT
                  </span>
                )}
              </div>
              <span className="mks-checkin-timestamp">{outTime}</span>
            </button>
          )}

          {/* Xin nghỉ */}
          <button className="mks-checkin-btn leave" onClick={() => onToast('📝 Gửi đơn xin nghỉ (mockup)')}>
            📋 Xin nghỉ / Báo muộn
          </button>
        </div>
      )}

      {/* Timeline hôm nay */}
      <div className="mks-section">
        <div className="mks-section-head">
          <span className="mks-section-title">⏱ Lịch sử hôm nay & Chênh lệch</span>
        </div>
        <div className="mks-timeline">
          {checkedIn && (
            <div className="mks-tl-row">
              <div className="mks-tl-dot-col">
                <div className="mks-tl-dot" style={{ background: '#16a34a' }} />
                {!checkedOut && <div className="mks-tl-line" />}
              </div>
              <div className="mks-tl-time">{inTime}</div>
              <div style={{ flex: 1 }}>
                <div className="mks-tl-label" style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <span>🟢 Vào ca — {shiftCfg?.label}</span>
                  {dev && (
                    <span className={`mks-diff-pill ${dev.checkinType}`}>
                      {dev.checkinLabel}
                    </span>
                  )}
                </div>
                {attendance?.note && (
                  <div className="mks-tl-note">Ghi chú: {attendance.note}</div>
                )}
              </div>
            </div>
          )}
          {checkedOut && (
            <div className="mks-tl-row">
              <div className="mks-tl-dot-col">
                <div className="mks-tl-dot" style={{ background: '#3b82f6' }} />
              </div>
              <div className="mks-tl-time">{outTime}</div>
              <div style={{ flex: 1 }}>
                <div className="mks-tl-label" style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <span>🏁 Ra ca — {shiftCfg?.label}</span>
                  {dev && (
                    <span className={`mks-diff-pill ${dev.checkoutType}`}>
                      {dev.checkoutLabel}
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}
          {!checkedIn && (
            <div style={{ color: '#a08060', fontSize: 14, padding: '8px 0' }}>Chưa chấm công hôm nay</div>
          )}
        </div>
      </div>

      {/* Thống kê tháng */}
      <div className="mks-section" style={{ marginTop: 6 }}>
        <div className="mks-section-head">
          <span className="mks-section-title">📊 Tóm tắt tháng 8</span>
        </div>
        <div className="mks-stats-grid">
          <div className="mks-stat-card" style={{ background: '#f0fdf4', color: '#15803d' }}>
            <div className="mks-stat-val">{summary.worked}</div>
            <div className="mks-stat-label">Ngày đã làm</div>
          </div>
          <div className="mks-stat-card" style={{ background: '#eff6ff', color: '#1d4ed8' }}>
            <div className="mks-stat-val">{summary.totalH}h</div>
            <div className="mks-stat-label">Tổng giờ làm</div>
          </div>
          <div className="mks-stat-card" style={{ background: '#fff7ed', color: '#c2410c' }}>
            <div className="mks-stat-val">{summary.otMins}p</div>
            <div className="mks-stat-label">Tăng ca</div>
          </div>
          <div className="mks-stat-card" style={{ background: '#fffbeb', color: '#b45309' }}>
            <div className="mks-stat-val">{summary.late}</div>
            <div className="mks-stat-label">Lần đi muộn</div>
          </div>
        </div>
      </div>

      {/* Mini Calendar */}
      <div className="mks-section" style={{ marginTop: 14, paddingBottom: 100 }}>
        <div className="mks-section-head">
          <span className="mks-section-title">📅 Lịch chấm công tháng 8</span>
        </div>
        <MiniCalendar history={MY_MONTHLY_HISTORY} userId={staff.id} />
      </div>
    </>
  );
}
