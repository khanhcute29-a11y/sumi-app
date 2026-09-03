import React, { useState } from 'react';
import { Clock, DollarSign, Receipt, Send } from 'lucide-react';
import './employee-overview-v4.css';
import { BottomSheet, ORDER_STATUS_META } from './EmployeeOverviewV4';
import {
  fetchMyAttendanceHistory, fetchMyAdvanceRequests, submitMyAdvanceRequest, fetchMyOrders,
} from '../../../lib/employeeOverviewV4';

// "Chấm công / Tạm ứng / Đơn hàng của tôi" cho Bếp trưởng & Quản lý xưởng —
// yêu cầu 04/09/2026 (đồng bộ luồng điều hướng): trước đây MobileHomeScreen
// chỉ dựng LeadHome/DirectorHome kiểu cũ, không có 3 mục này, nên hai vai trò
// đó KHÔNG có đường bấm-là-tới-thẳng như Nhân viên (EmployeeOverviewV4).
//
// CỐ Ý KHÔNG viết lại từ đầu: dùng lại NGUYÊN <BottomSheet> + `lib/
// employeeOverviewV4.js` + class CSS `eov4-*` đã có ở EmployeeOverviewV4 —
// giao diện Bếp trưởng/Quản lý bấm vào phải RA Y HỆT giao diện Nhân viên đang
// dùng (cùng 1 nơi sửa, không phải 2 bản dễ lệch nhau).
//
// PHÂN QUYỀN: mọi hàm fetch đều lọc theo `profile.id`/`profile.full_name` của
// CHÍNH người đang đăng nhập — Bếp trưởng/Quản lý bấm vào đây chỉ thấy CỦA
// MÌNH, giống hệt Nhân viên. Xem đội ngũ/toàn khâu là một nhu cầu khác, đã có
// sẵn đường riêng (nút "Đơn được giao cho bếp"/"Giao người thực hiện" cạnh
// đây, hoặc màn Chấm Công đầy đủ qua tab "Chấm công" ở thanh điều hướng dưới).
const formatVND = (n) => new Intl.NumberFormat('vi-VN').format(Math.round(n || 0)) + 'đ';
const tomorrowStr = () => { const d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10); };

const TILES = [
  { key: 'attendance', Icon: Clock, title: 'Chấm công', sub: 'Lịch sử vào/ra ca' },
  { key: 'advance', Icon: DollarSign, title: 'Tạm ứng', sub: 'Yêu cầu ứng lương' },
  { key: 'orders', Icon: Receipt, title: 'Đơn hàng của tôi', sub: '30 ngày gần đây' },
];

export default function MyQuickAccess({ profile }) {
  const [activeSheet, setActiveSheet] = useState(null);
  const [error, setError] = useState('');

  const [attendance, setAttendance] = useState(null);

  const [advanceRequests, setAdvanceRequests] = useState(null);
  const [advanceAmount, setAdvanceAmount] = useState(500000);
  const [advanceReason, setAdvanceReason] = useState('');
  const [advanceNeededOn, setAdvanceNeededOn] = useState(tomorrowStr());
  const [advanceSending, setAdvanceSending] = useState(false);

  const [orders, setOrders] = useState(null);
  const [orderFilter, setOrderFilter] = useState('all');

  const openSheet = (key) => {
    setActiveSheet(key);
    if (!profile?.id) return;
    if (key === 'attendance' && !attendance) fetchMyAttendanceHistory(profile.id).then(setAttendance).catch((e) => setError(e.message));
    if (key === 'advance' && !advanceRequests) fetchMyAdvanceRequests(profile.id).then(setAdvanceRequests).catch((e) => setError(e.message));
    if (key === 'orders' && !orders) fetchMyOrders(profile.full_name).then(setOrders).catch((e) => setError(e.message));
  };
  const closeSheet = () => setActiveSheet(null);

  const handleAdvanceSubmit = async () => {
    if (!advanceReason.trim()) { setError('Nhập lý do ứng lương giúp em.'); return; }
    setAdvanceSending(true); setError('');
    try {
      await submitMyAdvanceRequest({ amount: advanceAmount, reason: advanceReason.trim(), neededOn: advanceNeededOn });
      setAdvanceRequests(await fetchMyAdvanceRequests(profile.id));
      setAdvanceReason('');
    } catch (e) { setError(e.message); } finally { setAdvanceSending(false); }
  };

  const filteredOrders = !orders ? [] : orderFilter === 'all' ? orders : orders.filter((o) => o.status === orderFilter);

  return (
    <>
      <div className="eov4-section-title">🕘 CHẤM CÔNG · TẠM ỨNG · ĐƠN HÀNG</div>
      <div className="eov4-tiles-grid" style={{ gridTemplateColumns: 'repeat(3,1fr)' }}>
        {TILES.map((t) => (
          <button key={t.key} className="eov4-tile" onClick={() => openSheet(t.key)}>
            <div className="eov4-tile-icon"><t.Icon size={22} /></div>
            <div className="eov4-tile-title">{t.title}</div>
            <div className="eov4-tile-sub">{t.sub}</div>
          </button>
        ))}
      </div>

      {error && <div className="eov4-error-banner" onClick={() => setError('')}>⚠️ {error} (bấm để đóng)</div>}

      {activeSheet === 'attendance' && (
        <BottomSheet title="⏰ Lịch sử chấm công & giờ làm" onClose={closeSheet}>
          {!attendance ? <div className="eov4-empty-box">Đang tải...</div> : attendance.length === 0 ? (
            <div className="eov4-empty-box">Chưa có dữ liệu chấm công 14 ngày gần đây.</div>
          ) : (
            <div className="eov4-table">
              {attendance.map((r) => (
                <div key={r.date} className="eov4-table-row">
                  <div className="eov4-table-main">
                    <strong>{r.date}</strong>
                    <span>{r.checkin ? new Date(r.checkin).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '--:--'} → {r.checkout ? new Date(r.checkout).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '--:--'}</span>
                  </div>
                  <div className="eov4-table-side">
                    {r.lateMinutes > 0 ? <span className="eov4-note-text eov4-tone-danger">Trễ {r.lateMinutes}p</span> : <span className="eov4-note-text eov4-tone-success">Đúng giờ</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </BottomSheet>
      )}

      {activeSheet === 'advance' && (
        <BottomSheet title="💵 Yêu cầu ứng lương" onClose={closeSheet}>
          <div className="eov4-quick-amounts">
            {[500000, 1000000, 2000000].map((amt) => (
              <button key={amt} className={`eov4-chip-btn ${advanceAmount === amt ? 'active' : ''}`} onClick={() => setAdvanceAmount(amt)}>{formatVND(amt)}</button>
            ))}
          </div>
          <label className="eov4-field-label">Cần tiền vào ngày</label>
          <input type="date" className="eov4-input" value={advanceNeededOn} onChange={(e) => setAdvanceNeededOn(e.target.value)} />
          <label className="eov4-field-label">Lý do ứng lương</label>
          <textarea className="eov4-textarea" rows={3} placeholder="VD: Cần tiền đóng học phí con..." value={advanceReason} onChange={(e) => setAdvanceReason(e.target.value)} />
          <button className="eov4-primary-btn" disabled={advanceSending} onClick={handleAdvanceSubmit}>
            <Send size={16} /> {advanceSending ? 'Đang gửi...' : 'Gửi Sếp duyệt'}
          </button>
          <div className="eov4-field-label" style={{ marginTop: 14 }}>Lịch sử gần đây</div>
          {!advanceRequests ? <div className="eov4-empty-box">Đang tải...</div> : advanceRequests.length === 0 ? (
            <div className="eov4-empty-box">Chưa có yêu cầu nào.</div>
          ) : (
            <div className="eov4-table">
              {advanceRequests.map((r) => (
                <div key={r.id} className="eov4-table-row">
                  <div className="eov4-table-main"><strong>{formatVND(r.amount)}</strong><span className="eov4-note-text">{r.reason}</span></div>
                  <span className="eov4-hours-pill">{r.status}</span>
                </div>
              ))}
            </div>
          )}
        </BottomSheet>
      )}

      {activeSheet === 'orders' && (
        <BottomSheet title="🧾 Đơn hàng của tôi" onClose={closeSheet}>
          <div className="eov4-filter-row">
            <button className={`eov4-filter-chip ${orderFilter === 'all' ? 'active' : ''}`} onClick={() => setOrderFilter('all')}>Tổng đơn hàng</button>
            {ORDER_STATUS_META.map((o) => (
              <button key={o.key} className={`eov4-filter-chip ${orderFilter === o.key ? 'active' : ''}`} onClick={() => setOrderFilter(o.key)}>{o.label}</button>
            ))}
          </div>
          {!orders ? <div className="eov4-empty-box">Đang tải...</div> : filteredOrders.length === 0 ? (
            <div className="eov4-empty-box">Không có đơn nào trong mục này.</div>
          ) : (
            <div className="eov4-table">
              {filteredOrders.map((o) => (
                <div key={o.code} className="eov4-table-row">
                  <div className="eov4-table-main"><strong>#{o.code}</strong><span className="eov4-note-text">{o.quantity} sản phẩm</span></div>
                  <span className="eov4-hours-pill">{o.statusLabel}</span>
                </div>
              ))}
            </div>
          )}
        </BottomSheet>
      )}
    </>
  );
}
