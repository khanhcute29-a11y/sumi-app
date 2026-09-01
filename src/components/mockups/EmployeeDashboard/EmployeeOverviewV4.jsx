import React, { useEffect, useMemo, useState } from 'react';
import './employee-overview-v4.css';
import {
  Bell,
  Clock,
  Calendar,
  DollarSign,
  FileText,
  ClipboardList,
  AlertTriangle,
  Gift,
  Receipt,
  Inbox,
  ChefHat,
  PackageCheck,
  Bike,
  CheckCircle2,
  X,
  ChevronRight,
  Croissant,
  Send,
} from 'lucide-react';
import { AuthProvider, useAuth } from '../../../lib/AuthContext';
import {
  fetchManagerName,
  fetchMyHoursThisMonth,
  fetchMyRevenueThisMonth,
  fetchMyAttendanceHistory,
  fetchMyTodayAttendance,
  fetchMySchedule,
  fetchMyPayroll,
  fetchMyAdvanceRequests,
  submitMyAdvanceRequest,
  fetchMyLeaveRequests,
  submitMyLeaveRequest,
  submitMyShiftReport,
  fetchMyViolations,
  fetchMyRewards,
  fetchMyRewardsTotalThisMonth,
  fetchMyRewardStarsThisMonth,
  fetchMyOrders,
  fetchCompanyFeed,
} from '../../../lib/employeeOverviewV4';
import { chuanHoaCa, boPhanCuaHoSo, caChuanCuaLog } from '../../../lib/chamCong';
import { gomPhien, nhanChenhLech } from '../../shifts/v2/dungChung';

// ============================================================
// EMPLOYEE OVERVIEW V4 — nối dữ liệu THẬT (Supabase) cho nhân viên
// đang đăng nhập. Cô lập trong Messenger/mockups + 1 file lib riêng
// (src/lib/employeeOverviewV4.js), không đụng file dùng chung.
//
// 4 phần trước đây KHÔNG có dữ liệu thật trong toàn bộ app (đã rà
// soát kỹ, không tự bịa): Doanh thu cá nhân, Báo cáo cuối ca, Vi
// phạm, Thưởng nóng — đã thêm bảng thật (migration 202608260150)
// cho 3/4 phần; Doanh thu cá nhân tính trực tiếp từ orders.created_by.
// ============================================================

const ORDER_STATUS_META = [
  { key: 'awaiting_assignment', icon: Inbox, label: 'Đơn chờ làm' },
  { key: 'in_production', icon: ChefHat, label: 'Bếp đang làm' },
  { key: 'ready_for_fulfillment', icon: PackageCheck, label: 'Chờ vận chuyển' },
  { key: 'in_delivery', icon: Bike, label: 'Đang vận chuyển' },
  { key: 'completed', icon: CheckCircle2, label: 'Giao thành công', tone: 'success' },
];

const TILES = [
  { key: 'attendance', icon: Clock, title: '1. Chấm công', sub: 'Lịch sử vào/ra ca' },
  { key: 'schedule', icon: Calendar, title: '2. Lịch làm', sub: 'Phân ca tuần này' },
  { key: 'advance', icon: DollarSign, title: '3. Tạm ứng', sub: 'Yêu cầu ứng lương' },
  { key: 'leave', icon: FileText, title: '4. Xin nghỉ', sub: 'Đơn xin nghỉ phép' },
  { key: 'payroll', icon: DollarSign, title: '5. Bảng lương', sub: 'Phiếu lương tháng này' },
  { key: 'report', icon: ClipboardList, title: '6. Báo cáo ngày', sub: 'Báo cáo cuối ca' },
  { key: 'violation', icon: AlertTriangle, title: '7. Vi phạm', sub: null },
  { key: 'reward', icon: Gift, title: '8. Thưởng', sub: null },
];

const formatVND = (n) => new Intl.NumberFormat('vi-VN').format(Math.round(n || 0)) + 'đ';
const tomorrowStr = () => { const d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10); };
// Giờ hiển thị luôn theo múi giờ Việt Nam — chỉ định rõ timeZone, không dựa
// vào giờ hệ điều hành của thiết bị (an toàn cả khi máy cấu hình sai múi giờ).
const gioVN = (iso) => iso
  ? new Date(iso).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' })
  : '--:--';

function BottomSheet({ title, onClose, children }) {
  return (
    <div className="eov4-overlay" onClick={onClose}>
      <div className="eov4-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="eov4-sheet-handle" />
        <div className="eov4-sheet-header">
          <h3>{title}</h3>
          <button className="eov4-sheet-close" onClick={onClose} title="Đóng">
            <X size={18} />
          </button>
        </div>
        <div className="eov4-sheet-body">{children}</div>
      </div>
    </div>
  );
}

// Dùng trực tiếp bên trong app thật (đã có AuthProvider ở gốc cây component
// trong App.jsx) — tránh lồng 2 lớp AuthProvider không cần thiết.
export function EmployeeOverviewV4Inner({ onNavigate } = {}) {
  const { profile, loading: authLoading } = useAuth();

  const [activeSheet, setActiveSheet] = useState(null);
  const [selectedOrderFilter, setSelectedOrderFilter] = useState('all');
  const [error, setError] = useState('');

  const [managerName, setManagerName] = useState(null);
  const [hours, setHours] = useState(null);
  const [revenue, setRevenue] = useState(null);
  const [attendance, setAttendance] = useState(null);
  const [schedule, setSchedule] = useState(null);
  const [payroll, setPayroll] = useState(undefined); // undefined = chưa tải, null = không có bảng lương tháng này
  const [advanceRequests, setAdvanceRequests] = useState(null);
  const [leaveRequests, setLeaveRequests] = useState(null);
  const [violations, setViolations] = useState(null);
  const [rewards, setRewards] = useState(null);
  const [rewardsTotal, setRewardsTotal] = useState(null);
  const [rewardStars, setRewardStars] = useState(null);
  const [orders, setOrders] = useState(null);
  const [feed, setFeed] = useState(null);
  const [todayAtt, setTodayAtt] = useState(null);   // null = đang tải

  const [advanceAmount, setAdvanceAmount] = useState(500000);
  const [advanceReason, setAdvanceReason] = useState('');
  const [advanceNeededOn, setAdvanceNeededOn] = useState(tomorrowStr());
  const [advanceSending, setAdvanceSending] = useState(false);

  const [leaveDate, setLeaveDate] = useState('');
  const [leaveReason, setLeaveReason] = useState('');
  const [leaveSending, setLeaveSending] = useState(false);

  const [reportRevenue, setReportRevenue] = useState('');
  const [reportStock, setReportStock] = useState('');
  const [reportCash, setReportCash] = useState('');
  const [reportNote, setReportNote] = useState('');
  const [reportSending, setReportSending] = useState(false);

  // Tải dữ liệu chính khi đã có profile — mỗi hàm tự bắt lỗi riêng để 1 phần
  // lỗi không kéo sập cả trang.
  useEffect(() => {
    if (!profile?.id) return;
    fetchManagerName(profile.manager_id).then(setManagerName).catch(() => {});
    fetchMyHoursThisMonth(profile.id).then(setHours).catch((e) => setError(e.message));
    fetchMyRevenueThisMonth(profile.id).then(setRevenue).catch((e) => setError(e.message));
    fetchMyRewardsTotalThisMonth(profile.id).then(setRewardsTotal).catch(() => {});
    fetchMyRewardStarsThisMonth(profile.id).then(setRewardStars).catch(() => {});
    fetchMyOrders(profile.full_name).then(setOrders).catch((e) => setError(e.message));
    fetchCompanyFeed().then(setFeed).catch(() => {});
  }, [profile?.id]);

  // ── Chấm công HÔM NAY — widget trạng thái trực tiếp trên trang chủ ──────
  //
  // Dùng LẠI đúng logic đã kiểm chứng ở phân hệ Chấm Công V2 (`gomPhien` +
  // `nhanChenhLech`), không viết lại cách tính đi muộn/đúng giờ lần hai —
  // viết lại là kiểu chắc chắn sẽ lệch nhau giữa hai nơi theo thời gian.
  //
  // Nghe thêm sự kiện `sumi-shift-changed` (ShiftsScreen bắn ra sau khi
  // chấm công thành công) để tự cập nhật ngay — không chỉ lúc màn hình này
  // được mở lại. Đây là đồng bộ CÙNG THIẾT BỊ/CÙNG TRÌNH DUYỆT qua sự kiện
  // nội bộ, không phải Supabase Realtime xuyên thiết bị — bảng `shift_logs`
  // hiện chưa được bật Realtime publication.
  useEffect(() => {
    if (!profile?.id) return;
    let huy = false;
    const tai = () => {
      fetchMyTodayAttendance(profile.id)
        .then(({ logs, caRows }) => {
          if (huy) return;
          const danhSachCa = chuanHoaCa(caRows);
          const boPhan = boPhanCuaHoSo(profile);
          const phien = gomPhien(logs);
          const phienHienTai = phien[phien.length - 1] || null;
          const dangTrongCa = !!(phienHienTai && !phienHienTai.ra);
          const caPhien = phienHienTai ? caChuanCuaLog(phienHienTai.vao, danhSachCa, boPhan) : null;
          const devVao = phienHienTai ? nhanChenhLech(phienHienTai.vao, caPhien) : null;
          const ca = caPhien || danhSachCa.find((c) => c.boPhan === boPhan) || null;
          setTodayAtt({
            boPhan, ca, phienHienTai, dangTrongCa, devVao,
            soCaXong: phien.filter((p) => p.ra).length,
          });
        })
        .catch(() => { if (!huy) setTodayAtt({ loi: true }); });
    };
    tai();
    window.addEventListener('sumi-shift-changed', tai);
    return () => { huy = true; window.removeEventListener('sumi-shift-changed', tai); };
  }, [profile?.id]);

  const loadSheetData = (sheet) => {
    if (!profile?.id) return;
    if (sheet === 'attendance' && !attendance) fetchMyAttendanceHistory(profile.id).then(setAttendance).catch((e) => setError(e.message));
    if (sheet === 'schedule' && !schedule) fetchMySchedule(profile.id, profile.station).then(setSchedule).catch((e) => setError(e.message));
    if (sheet === 'payroll' && payroll === undefined) fetchMyPayroll(profile.id).then(setPayroll).catch((e) => setError(e.message));
    if (sheet === 'advance' && !advanceRequests) fetchMyAdvanceRequests(profile.id).then(setAdvanceRequests).catch((e) => setError(e.message));
    if (sheet === 'leave' && !leaveRequests) fetchMyLeaveRequests(profile.id).then(setLeaveRequests).catch((e) => setError(e.message));
    if (sheet === 'violation' && !violations) fetchMyViolations(profile.id).then(setViolations).catch((e) => setError(e.message));
    if (sheet === 'reward' && !rewards) fetchMyRewards(profile.id).then(setRewards).catch((e) => setError(e.message));
  };

  const openSheet = (key) => { setActiveSheet(key); loadSheetData(key); };
  const closeSheet = () => setActiveSheet(null);

  const openOrders = (filterKey) => { setSelectedOrderFilter(filterKey); setActiveSheet('orders'); };

  const orderCounts = useMemo(() => {
    const counts = { all: orders?.length || 0, awaiting_assignment: 0, in_production: 0, ready_for_fulfillment: 0, in_delivery: 0, completed: 0, issue: 0 };
    for (const o of orders || []) {
      if (counts[o.status] !== undefined) counts[o.status] += 1;
      if (o.isOverdue) counts.issue += 1;
    }
    return counts;
  }, [orders]);

  const filteredOrders = useMemo(() => {
    if (!orders) return [];
    if (selectedOrderFilter === 'all') return orders;
    if (selectedOrderFilter === 'issue') return orders.filter((o) => o.isOverdue);
    return orders.filter((o) => o.status === selectedOrderFilter);
  }, [orders, selectedOrderFilter]);

  const handleAdvanceSubmit = async () => {
    if (!advanceReason.trim()) { setError('Nhập lý do ứng lương giúp em.'); return; }
    setAdvanceSending(true);
    setError('');
    try {
      await submitMyAdvanceRequest({ amount: advanceAmount, reason: advanceReason.trim(), neededOn: advanceNeededOn });
      const fresh = await fetchMyAdvanceRequests(profile.id);
      setAdvanceRequests(fresh);
      setAdvanceReason('');
    } catch (e) { setError(e.message); } finally { setAdvanceSending(false); }
  };

  const handleLeaveSubmit = async () => {
    if (!leaveDate) { setError('Chọn ngày nghỉ giúp em.'); return; }
    if (!leaveReason.trim()) { setError('Nhập lý do nghỉ phép giúp em.'); return; }
    setLeaveSending(true);
    setError('');
    try {
      await submitMyLeaveRequest({ profile, leaveDate, reason: leaveReason.trim() });
      const fresh = await fetchMyLeaveRequests(profile.id);
      setLeaveRequests(fresh);
      setLeaveReason('');
    } catch (e) { setError(e.message); } finally { setLeaveSending(false); }
  };

  const handleReportSubmit = async () => {
    setReportSending(true);
    setError('');
    try {
      await submitMyShiftReport({ profile, revenue: reportRevenue, stockRemaining: reportStock, cashHandover: reportCash, note: reportNote });
      setReportRevenue(''); setReportStock(''); setReportCash(''); setReportNote('');
      setActiveSheet(null);
    } catch (e) { setError(e.message); } finally { setReportSending(false); }
  };

  if (authLoading) return <div className="eov4-page eov4-loading-page">Đang tải...</div>;
  if (!profile) return <div className="eov4-page eov4-loading-page">Chưa đăng nhập.</div>;

  const roleLabel = profile.role ? `🏪 ${profile.role}` : '';
  const hierarchy = managerName ? `${managerName} → ${profile.full_name}` : profile.full_name;
  const initials = (profile.full_name || '?').trim().split(/\s+/).slice(-1)[0]?.[0]?.toUpperCase() || '?';

  return (
    <div className="eov4-page">
      {error && (
        <div className="eov4-error-banner" onClick={() => setError('')}>⚠️ {error} (bấm để đóng)</div>
      )}

      {/* 1. HEADER */}
      <div className="eov4-header">
        <div className="eov4-brand">
          <div className="eov4-brand-logo"><Croissant size={22} /></div>
          <div>
            <div className="eov4-brand-name">SUMI BAKERY</div>
            <div className="eov4-brand-greeting">Chào {profile.full_name}</div>
          </div>
        </div>
        <div className="eov4-header-actions">
          <button className="eov4-icon-btn" title="Bảng tin công ty" onClick={() => openSheet('feed')}>
            <Bell size={18} />
          </button>
          <button className="eov4-avatar-btn" title="Hồ sơ cá nhân">{initials}</button>
        </div>
      </div>

      {feed && feed[0] && (
        <button className="eov4-banner" onClick={() => openSheet('feed')}>
          <span className="eov4-banner-icon">📢</span>
          <span className="eov4-banner-body">
            <strong>{feed[0].title || 'Thông báo công ty'}</strong>
            <span>{feed[0].body}</span>
          </span>
          <ChevronRight size={18} className="eov4-banner-arrow" />
        </button>
      )}

      {/* 1.5 CHẤM CÔNG HÔM NAY — trạng thái thời gian thực, bấm vào mở
          thẳng phân hệ Chấm Công chi tiết (tab "Ca Làm Việc"). */}
      <button
        className={`eov4-attendance${
          todayAtt?.dangTrongCa ? (todayAtt.devVao?.loai === 'bad' ? ' is-late' : ' is-working')
            : todayAtt?.phienHienTai ? ' is-done'
              : ' is-waiting'
        }`}
        onClick={() => onNavigate?.('shifts')}
      >
        <div className="eov4-attendance-top">
          <span className="eov4-attendance-dot">
            {todayAtt?.dangTrongCa ? '●' : todayAtt?.phienHienTai ? '✓' : '◷'}
          </span>
          <div className="eov4-attendance-txt">
            <small>CHẤM CÔNG HÔM NAY</small>
            <strong>
              {!todayAtt ? 'Đang tải…'
                : todayAtt.loi ? 'Không tải được — bấm để mở'
                  : todayAtt.dangTrongCa ? 'Đang trong ca'
                    : todayAtt.phienHienTai
                      ? `Đã hoàn thành ${todayAtt.soCaXong > 1 ? `${todayAtt.soCaXong} ca` : 'ca'}`
                      : todayAtt.ca ? 'Chưa bắt đầu ca' : 'Không theo ca cố định'}
            </strong>
          </div>
          <ChevronRight size={18} className="eov4-attendance-arrow" />
        </div>

        {todayAtt?.phienHienTai && (
          <div className="eov4-attendance-detail">
            Vào lúc <b>{gioVN(todayAtt.phienHienTai.vao?.checkin_time)}</b>
            {todayAtt.devVao && (
              <span className={`eov4-attendance-tag ${todayAtt.devVao.loai}`}>{todayAtt.devVao.chu}</span>
            )}
          </div>
        )}
        {!todayAtt?.phienHienTai && todayAtt?.ca && (
          <div className="eov4-attendance-detail">
            Ca {todayAtt.ca.ten} · {todayAtt.ca.batDau}–{todayAtt.ca.ketThuc} · có mặt trước <b>{todayAtt.ca.moc}</b>
          </div>
        )}
      </button>

      {/* 2. VAI TRÒ & PHÂN CẤP */}
      {roleLabel && (
        <div className="eov4-role-row">
          <span className="eov4-role-badge">{roleLabel}</span>
        </div>
      )}
      <div className="eov4-hierarchy">{hierarchy}</div>

      {/* 3. HIỆU SUẤT CÁ NHÂN */}
      <div className="eov4-section-title">📊 HIỆU SUẤT CÁ NHÂN (tháng này)</div>
      <div className="eov4-kpi-grid">
        <button className="eov4-kpi-card eov4-kpi-green" onClick={() => openOrders('all')}>
          <div className="eov4-kpi-value">{revenue ? formatVND(revenue.total) : '…'}</div>
          <div className="eov4-kpi-label">Doanh Thu ({revenue?.orderCount ?? 0} đơn) ›</div>
        </button>
        <button className="eov4-kpi-card eov4-kpi-blue" onClick={() => openSheet('attendance')}>
          <div className="eov4-kpi-value">{hours === null ? '…' : `${hours}h`}</div>
          <div className="eov4-kpi-label">Tổng Giờ Làm ›</div>
        </button>
        <button className="eov4-kpi-card eov4-kpi-amber" onClick={() => openSheet('reward')}>
          <div className="eov4-kpi-value">{rewardsTotal === null ? '…' : formatVND(rewardsTotal)}</div>
          <div className="eov4-kpi-label">
            Tiền Thưởng{rewardStars ? ` · ⭐${rewardStars}` : ''} ›
          </div>
        </button>
      </div>

      {/* 4. TÔI — HỒ SƠ & TIỆN ÍCH */}
      <div className="eov4-section-title">👤 TÔI (HỒ SƠ &amp; TIỆN ÍCH NHÂN SỰ)</div>
      <div className="eov4-tiles-grid">
        {TILES.map((t) => (
          <button key={t.key} className="eov4-tile" onClick={() => openSheet(t.key)}>
            <div className="eov4-tile-icon"><t.icon size={22} /></div>
            <div className="eov4-tile-title">{t.title}</div>
            {t.sub && <div className="eov4-tile-sub">{t.sub}</div>}
          </button>
        ))}
      </div>

      {/* 5. TÌNH TRẠNG ĐƠN HÀNG */}
      <div className="eov4-section-title-row">
        <span className="eov4-section-title">📦 ĐƠN HÀNG CỦA TÔI (30 ngày)</span>
        <span className="eov4-section-count">{orderCounts.all} đơn</span>
      </div>
      <div className="eov4-orders-grid">
        <button className="eov4-order-tile" onClick={() => openOrders('all')}>
          <div className="eov4-order-icon"><Receipt size={20} /></div>
          <span className="eov4-order-label">Tổng đơn hàng</span>
          <span className="eov4-order-count">{orderCounts.all}</span>
        </button>
        {ORDER_STATUS_META.map((o) => (
          <button key={o.key} className="eov4-order-tile" onClick={() => openOrders(o.key)}>
            <div className="eov4-order-icon"><o.icon size={20} /></div>
            <span className="eov4-order-label">{o.label}</span>
            <span className={`eov4-order-count ${o.tone ? `eov4-tone-${o.tone}` : ''}`}>{orderCounts[o.key]}</span>
          </button>
        ))}
        <button className="eov4-order-tile eov4-span-2" onClick={() => openOrders('issue')}>
          <div className="eov4-order-icon"><AlertTriangle size={20} /></div>
          <span className="eov4-order-label">Trễ hạn / sự cố</span>
          <span className="eov4-order-count eov4-tone-warning">{orderCounts.issue}</span>
        </button>
      </div>

      {/* ===================== BOTTOM SHEETS ===================== */}

      {activeSheet === 'feed' && (
        <BottomSheet title="📢 Bảng tin công ty" onClose={closeSheet}>
          {!feed ? <div className="eov4-empty-box">Đang tải...</div> : feed.length === 0 ? (
            <div className="eov4-empty-box">Chưa có tin nào.</div>
          ) : (
            feed.map((p) => (
              <div key={p.id} className="eov4-feed-item">
                <strong>{p.title || (p.post_type === 'announcement' ? 'Thông báo' : 'Bảng tin')}</strong>
                <p>{p.body}</p>
                <span className="eov4-feed-time">{new Date(p.created_at).toLocaleString('vi-VN')}</span>
              </div>
            ))
          )}
        </BottomSheet>
      )}

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

      {activeSheet === 'schedule' && (
        <BottomSheet title="📅 Lịch phân ca tuần này" onClose={closeSheet}>
          {!schedule ? <div className="eov4-empty-box">Đang tải...</div> : schedule.length === 0 ? (
            <div className="eov4-empty-box">Tuần này chưa được xếp ca.</div>
          ) : (
            <div className="eov4-table">
              {schedule.map((r, i) => (
                <div key={i} className="eov4-table-row">
                  <strong>{r.date}</strong>
                  <span className="eov4-hours-pill">{r.config ? `${r.config.label} ${r.config.start_time?.slice(0, 5) || ''}${r.config.end_time ? `–${r.config.end_time.slice(0, 5)}` : ''}` : 'Chưa rõ ca'}</span>
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

      {activeSheet === 'leave' && (
        <BottomSheet title="📝 Đơn xin nghỉ phép" onClose={closeSheet}>
          <label className="eov4-field-label">Ngày nghỉ</label>
          <input type="date" className="eov4-input" value={leaveDate} onChange={(e) => setLeaveDate(e.target.value)} />
          <label className="eov4-field-label">Lý do nghỉ phép</label>
          <textarea className="eov4-textarea" rows={3} placeholder="VD: Về quê giỗ ông bà..." value={leaveReason} onChange={(e) => setLeaveReason(e.target.value)} />
          <button className="eov4-primary-btn" disabled={leaveSending} onClick={handleLeaveSubmit}>
            <Send size={16} /> {leaveSending ? 'Đang gửi...' : 'Gửi duyệt'}
          </button>
          <div className="eov4-field-label" style={{ marginTop: 14 }}>Lịch sử gần đây</div>
          {!leaveRequests ? <div className="eov4-empty-box">Đang tải...</div> : leaveRequests.length === 0 ? (
            <div className="eov4-empty-box">Chưa có đơn nào.</div>
          ) : (
            <div className="eov4-table">
              {leaveRequests.map((r) => (
                <div key={r.id} className="eov4-table-row">
                  <div className="eov4-table-main"><strong>{r.leave_date}</strong><span className="eov4-note-text">{r.reason}</span></div>
                  <span className="eov4-hours-pill">{r.status}</span>
                </div>
              ))}
            </div>
          )}
        </BottomSheet>
      )}

      {activeSheet === 'payroll' && (
        <BottomSheet title="💰 Phiếu lương tháng này" onClose={closeSheet}>
          {payroll === undefined ? <div className="eov4-empty-box">Đang tải...</div> : !payroll ? (
            <div className="eov4-empty-box">Chưa có bảng lương tháng này.</div>
          ) : (
            <>
              <div className="eov4-table">
                <div className="eov4-table-row"><strong>Lương cơ bản</strong><span>{formatVND(payroll.base_pay)}</span></div>
                <div className="eov4-table-row"><strong>Tăng ca</strong><span>{formatVND(payroll.overtime_pay)}</span></div>
                <div className="eov4-table-row"><strong>Phụ cấp</strong><span>{formatVND(payroll.allowance)}</span></div>
                <div className="eov4-table-row"><strong>Thưởng KPI</strong><span>{formatVND(payroll.kpi_bonus)}</span></div>
                <div className="eov4-table-row"><strong>Thưởng sản lượng</strong><span>{formatVND(payroll.output_bonus)}</span></div>
                <div className="eov4-table-row"><strong>Tạm ứng đã nhận</strong><span className="eov4-tone-danger">- {formatVND(payroll.advance_amount)}</span></div>
                <div className="eov4-table-row"><strong>Khấu trừ</strong><span className="eov4-tone-danger">- {formatVND(payroll.deduction_amount)}</span></div>
              </div>
              <div className="eov4-payroll-net">
                <span>Thực nhận</span>
                <strong>{formatVND((payroll.base_pay || 0) + (payroll.overtime_pay || 0) + (payroll.allowance || 0) + (payroll.kpi_bonus || 0) + (payroll.output_bonus || 0) + (payroll.delegation_bonus || 0) + (payroll.other_bonus || 0) - (payroll.advance_amount || 0) - (payroll.deduction_amount || 0))}</strong>
              </div>
            </>
          )}
        </BottomSheet>
      )}

      {activeSheet === 'report' && (
        <BottomSheet title="📋 Báo cáo cuối ca" onClose={closeSheet}>
          <label className="eov4-field-label">Doanh thu cuối ca</label>
          <input type="number" className="eov4-input" placeholder="VD: 1250000" value={reportRevenue} onChange={(e) => setReportRevenue(e.target.value)} />
          <label className="eov4-field-label">Số lượng bánh còn tồn quầy</label>
          <input type="number" className="eov4-input" placeholder="VD: 12" value={reportStock} onChange={(e) => setReportStock(e.target.value)} />
          <label className="eov4-field-label">Bàn giao két tiền mặt</label>
          <input type="number" className="eov4-input" placeholder="VD: 500000" value={reportCash} onChange={(e) => setReportCash(e.target.value)} />
          <label className="eov4-field-label">Ghi chú thêm</label>
          <textarea className="eov4-textarea" rows={2} value={reportNote} onChange={(e) => setReportNote(e.target.value)} />
          <button className="eov4-primary-btn" disabled={reportSending} onClick={handleReportSubmit}>
            <Send size={16} /> {reportSending ? 'Đang gửi...' : 'Gửi báo cáo'}
          </button>
        </BottomSheet>
      )}

      {activeSheet === 'violation' && (
        <BottomSheet title="⚠️ Lịch sử vi phạm" onClose={closeSheet}>
          {!violations ? <div className="eov4-empty-box">Đang tải...</div> : violations.length === 0 ? (
            <div className="eov4-empty-box">🎉 Không có vi phạm nào — giữ vững phong độ nhé!</div>
          ) : (
            <div className="eov4-table">
              {violations.map((v) => (
                <div key={v.id} className="eov4-table-row">
                  <div className="eov4-table-main"><strong>{v.title}</strong><span className="eov4-note-text">{v.occurred_on}</span></div>
                  {v.penalty_amount > 0 && <span className="eov4-tone-danger">-{formatVND(v.penalty_amount)}</span>}
                </div>
              ))}
            </div>
          )}
        </BottomSheet>
      )}

      {activeSheet === 'reward' && (
        <BottomSheet title="🎁 Thưởng nóng" onClose={closeSheet}>
          {!rewards ? <div className="eov4-empty-box">Đang tải...</div> : rewards.length === 0 ? (
            <div className="eov4-empty-box">Chưa có thưởng nóng nào.</div>
          ) : (
            <div className="eov4-table">
              {rewards.map((r) => (
                <div key={r.id} className="eov4-table-row">
                  <div className="eov4-table-main"><strong>{r.title}</strong><span className="eov4-note-text">{r.awarded_on}</span></div>
                  <span className="eov4-tone-warning">+{formatVND(r.amount)}</span>
                </div>
              ))}
            </div>
          )}
        </BottomSheet>
      )}

      {activeSheet === 'orders' && (
        <BottomSheet title="🧾 Đơn hàng của tôi" onClose={closeSheet}>
          <div className="eov4-filter-row">
            <button className={`eov4-filter-chip ${selectedOrderFilter === 'all' ? 'active' : ''}`} onClick={() => setSelectedOrderFilter('all')}>Tổng đơn hàng</button>
            {ORDER_STATUS_META.map((o) => (
              <button key={o.key} className={`eov4-filter-chip ${selectedOrderFilter === o.key ? 'active' : ''}`} onClick={() => setSelectedOrderFilter(o.key)}>{o.label}</button>
            ))}
            <button className={`eov4-filter-chip ${selectedOrderFilter === 'issue' ? 'active' : ''}`} onClick={() => setSelectedOrderFilter('issue')}>Trễ hạn</button>
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
    </div>
  );
}

export default function EmployeeOverviewV4() {
  return (
    <AuthProvider>
      <EmployeeOverviewV4Inner />
    </AuthProvider>
  );
}
