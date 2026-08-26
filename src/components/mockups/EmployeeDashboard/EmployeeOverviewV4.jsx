import React, { useMemo, useState } from 'react';
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

// ============================================================
// EMPLOYEE OVERVIEW V4 — mockup 100% cô lập, không đụng dữ liệu
// thật hay component nào khác. Mọi state/hành động ở đây chỉ mô
// phỏng trên mock data cục bộ bên dưới, không gọi Supabase.
// ============================================================

const EMPLOYEE = {
  name: 'Đăng Khánh 2',
  code: 'K2',
  roleLabel: '🏪 Nhân Viên Bán Hàng',
  hierarchy: 'Giám đốc Kinh doanh → Quản lý trực tiếp → Đăng Khánh 2',
};

const ANNOUNCEMENT = {
  tag: 'NHÂN VIÊN TEST APP',
  text: 'Mọi người sử dụng mở bằng trình duyệt để hệ thống update được liên tục...',
};

const KPI = {
  revenue: 1250000,
  hours: 38.5,
  reward: 250000,
};

const ORDER_TILES = [
  { key: 'all', icon: Receipt, label: 'Tổng đơn hàng', count: 2, span: 1 },
  { key: 'awaiting_assignment', icon: Inbox, label: 'Đơn chờ làm', count: 0, span: 1 },
  { key: 'in_production', icon: ChefHat, label: 'Bếp đang làm', count: 0, span: 1 },
  { key: 'ready_for_fulfillment', icon: PackageCheck, label: 'Chờ vận chuyển', count: 1, span: 1 },
  { key: 'in_delivery', icon: Bike, label: 'Đang vận chuyển', count: 0, span: 1 },
  { key: 'completed', icon: CheckCircle2, label: 'Giao thành công', count: 1, span: 1, tone: 'success' },
  { key: 'issue', icon: AlertTriangle, label: 'Chưa thực hiện', count: 0, span: 2, tone: 'warning' },
];

const TILES = [
  { key: 'attendance', icon: Clock, title: '1. Chấm công', sub: 'Lịch sử vào/ra ca' },
  { key: 'schedule', icon: Calendar, title: '2. Lịch làm', sub: 'Phân ca tuần này' },
  { key: 'advance', icon: DollarSign, title: '3. Tạm ứng', sub: 'Yêu cầu ứng lương' },
  { key: 'leave', icon: FileText, title: '4. Xin nghỉ', sub: 'Đơn xin nghỉ phép' },
  { key: 'payroll', icon: DollarSign, title: '5. Bảng lương', sub: 'Phiếu lương T8' },
  { key: 'report', icon: ClipboardList, title: '6. Báo cáo ngày', sub: 'Báo cáo cuối ca' },
  { key: 'violation', icon: AlertTriangle, title: '7. Vi phạm', sub: '0 lỗi vi phạm', subTone: 'success' },
  { key: 'reward', icon: Gift, title: '8. Thưởng', sub: '+350.000đ', subTone: 'warning' },
];

const ATTENDANCE_HISTORY = [
  { date: 'Thứ 2, 18/08', checkin: '05:58', checkout: '14:05', hours: '8.1h', note: 'Đúng giờ' },
  { date: 'Thứ 3, 19/08', checkin: '06:02', checkout: '14:00', hours: '7.9h', note: 'Đúng giờ' },
  { date: 'Thứ 4, 20/08', checkin: '06:10', checkout: '14:02', hours: '7.8h', note: 'Trễ 10 phút' },
  { date: 'Thứ 5, 21/08', checkin: '05:55', checkout: '14:00', hours: '8.0h', note: 'Đúng giờ' },
  { date: 'Thứ 6, 22/08', checkin: '06:00', checkout: '14:30', hours: '8.5h', note: 'Tăng ca 30p' },
];

const SCHEDULE_WEEK = [
  { day: 'Thứ 2', shift: 'Ca Sáng 06:00–14:00' },
  { day: 'Thứ 3', shift: 'Ca Sáng 06:00–14:00' },
  { day: 'Thứ 4', shift: 'Ca Sáng 06:00–14:00' },
  { day: 'Thứ 5', shift: 'Nghỉ' },
  { day: 'Thứ 6', shift: 'Ca Chiều 14:00–22:00' },
  { day: 'Thứ 7', shift: 'Ca Chiều 14:00–22:00' },
  { day: 'CN', shift: 'Nghỉ' },
];

const PAYROLL_T8 = [
  { label: 'Lương cứng', amount: 6000000 },
  { label: 'Phụ cấp', amount: 500000 },
  { label: 'Thưởng KPI', amount: 350000 },
  { label: 'Tạm ứng đã nhận', amount: -1000000 },
];

const VIOLATIONS = []; // 0 lỗi vi phạm

const REWARDS = [
  { date: '20/08', title: 'Thưởng nóng — Doanh số tuần cao nhất', amount: 200000 },
  { date: '15/08', title: 'Tích sao — Khách hàng khen thái độ phục vụ', amount: 50000 },
  { date: '10/08', title: 'Thưởng chuyên cần tháng 8', amount: 100000 },
];

const ORDERS_MOCK = [
  { code: 'SUMI-20260825-0231', status: 'ready_for_fulfillment', statusLabel: 'Chờ vận chuyển', customer: 'Chị Hạnh', total: 480000 },
  { code: 'SUMI-20260824-0198', status: 'completed', statusLabel: 'Giao thành công', customer: 'Anh Huy', total: 620000 },
];

const formatVND = (n) => new Intl.NumberFormat('vi-VN').format(n) + 'đ';

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

export default function EmployeeOverviewV4() {
  const [activeSheet, setActiveSheet] = useState(null);
  // 'feed' | 'attendance' | 'schedule' | 'advance' | 'leave' | 'payroll' | 'report' | 'violation' | 'reward' | 'revenue_kpi' | 'orders' | null
  const [selectedOrderFilter, setSelectedOrderFilter] = useState('all');

  const [advanceAmount, setAdvanceAmount] = useState(500000);
  const [advanceReason, setAdvanceReason] = useState('');
  const [advanceSent, setAdvanceSent] = useState(false);

  const [leaveStart, setLeaveStart] = useState('');
  const [leaveEnd, setLeaveEnd] = useState('');
  const [leaveReason, setLeaveReason] = useState('');
  const [leaveSent, setLeaveSent] = useState(false);

  const [reportRevenue, setReportRevenue] = useState('');
  const [reportStock, setReportStock] = useState('');
  const [reportCash, setReportCash] = useState('');
  const [reportSent, setReportSent] = useState(false);

  const closeSheet = () => setActiveSheet(null);

  const openOrders = (filterKey) => {
    setSelectedOrderFilter(filterKey);
    setActiveSheet('orders');
  };

  const filteredOrders = useMemo(() => {
    if (selectedOrderFilter === 'all') return ORDERS_MOCK;
    if (selectedOrderFilter === 'issue') return [];
    return ORDERS_MOCK.filter((o) => o.status === selectedOrderFilter);
  }, [selectedOrderFilter]);

  const payrollNet = PAYROLL_T8.reduce((s, r) => s + r.amount, 0);

  return (
    <div className="eov4-page">
      {/* 1. HEADER */}
      <div className="eov4-header">
        <div className="eov4-brand">
          <div className="eov4-brand-logo"><Croissant size={22} /></div>
          <div>
            <div className="eov4-brand-name">SUMI BAKERY</div>
            <div className="eov4-brand-greeting">Chào {EMPLOYEE.name}</div>
          </div>
        </div>
        <div className="eov4-header-actions">
          <button className="eov4-icon-btn" title="Thông báo" onClick={() => setActiveSheet('feed')}>
            <Bell size={18} />
          </button>
          <button className="eov4-avatar-btn" title="Hồ sơ cá nhân" onClick={() => setActiveSheet('payroll')}>
            {EMPLOYEE.code}
          </button>
        </div>
      </div>

      {/* 2. BANNER GHIM */}
      <button className="eov4-banner" onClick={() => setActiveSheet('feed')}>
        <span className="eov4-banner-icon">📢</span>
        <span className="eov4-banner-body">
          <strong>{ANNOUNCEMENT.tag}</strong>
          <span>{ANNOUNCEMENT.text}</span>
        </span>
        <ChevronRight size={18} className="eov4-banner-arrow" />
      </button>

      {/* 3. VAI TRÒ & PHÂN CẤP */}
      <div className="eov4-role-row">
        <span className="eov4-role-badge">{EMPLOYEE.roleLabel}</span>
      </div>
      <div className="eov4-hierarchy">{EMPLOYEE.hierarchy}</div>

      {/* 4. HIỆU SUẤT CÁ NHÂN */}
      <div className="eov4-section-title">📊 HIỆU SUẤT CÁ NHÂN</div>
      <div className="eov4-kpi-grid">
        <button className="eov4-kpi-card eov4-kpi-green" onClick={() => setActiveSheet('revenue_kpi')}>
          <div className="eov4-kpi-value">{formatVND(KPI.revenue)}</div>
          <div className="eov4-kpi-label">Doanh Thu ›</div>
        </button>
        <button className="eov4-kpi-card eov4-kpi-blue" onClick={() => setActiveSheet('attendance')}>
          <div className="eov4-kpi-value">{KPI.hours}h</div>
          <div className="eov4-kpi-label">Tổng Giờ Làm ›</div>
        </button>
        <button className="eov4-kpi-card eov4-kpi-amber" onClick={() => setActiveSheet('reward')}>
          <div className="eov4-kpi-value">{formatVND(KPI.reward)}</div>
          <div className="eov4-kpi-label">Tiền Thưởng ›</div>
        </button>
      </div>

      {/* 5. TÔI — HỒ SƠ & TIỆN ÍCH */}
      <div className="eov4-section-title">👤 TÔI (HỒ SƠ &amp; TIỆN ÍCH NHÂN SỰ)</div>
      <div className="eov4-tiles-grid">
        {TILES.map((t) => (
          <button key={t.key} className="eov4-tile" onClick={() => setActiveSheet(t.key)}>
            <div className="eov4-tile-icon"><t.icon size={22} /></div>
            <div className="eov4-tile-title">{t.title}</div>
            <div className={`eov4-tile-sub ${t.subTone ? `eov4-tone-${t.subTone}` : ''}`}>{t.sub}</div>
          </button>
        ))}
      </div>

      {/* 6. TÌNH TRẠNG ĐƠN HÀNG */}
      <div className="eov4-section-title-row">
        <span className="eov4-section-title">📦 TÌNH TRẠNG ĐƠN HÀNG</span>
        <span className="eov4-section-count">{ORDER_TILES[0].count} đơn</span>
      </div>
      <div className="eov4-orders-grid">
        {ORDER_TILES.map((o) => (
          <button
            key={o.key}
            className={`eov4-order-tile ${o.span === 2 ? 'eov4-span-2' : ''}`}
            onClick={() => openOrders(o.key)}
          >
            <div className="eov4-order-icon"><o.icon size={20} /></div>
            <span className="eov4-order-label">{o.label}</span>
            <span className={`eov4-order-count ${o.tone ? `eov4-tone-${o.tone}` : ''}`}>{o.count}</span>
          </button>
        ))}
      </div>

      {/* ===================== BOTTOM SHEETS ===================== */}

      {activeSheet === 'feed' && (
        <BottomSheet title="📢 Bảng tin & Thông báo công ty" onClose={closeSheet}>
          <div className="eov4-feed-item">
            <strong>{ANNOUNCEMENT.tag}</strong>
            <p>{ANNOUNCEMENT.text}</p>
            <span className="eov4-feed-time">Hôm nay · 08:30</span>
          </div>
          <div className="eov4-feed-item">
            <strong>🎉 Thông báo lương tháng 8</strong>
            <p>Lương tháng 8 sẽ được chuyển vào ngày 05/09. Anh/chị kiểm tra phiếu lương ở mục Bảng lương.</p>
            <span className="eov4-feed-time">2 ngày trước</span>
          </div>
          <div className="eov4-feed-item">
            <strong>🥐 Lịch nghỉ Trung Thu</strong>
            <p>Cửa hàng nghỉ Trung Thu ngày 15/9 (âm lịch). Ca làm sẽ được sắp xếp lại, để ý mục Lịch làm.</p>
            <span className="eov4-feed-time">5 ngày trước</span>
          </div>
        </BottomSheet>
      )}

      {activeSheet === 'attendance' && (
        <BottomSheet title="⏰ Lịch sử chấm công & giờ làm" onClose={closeSheet}>
          <div className="eov4-table">
            {ATTENDANCE_HISTORY.map((r) => (
              <div key={r.date} className="eov4-table-row">
                <div className="eov4-table-main">
                  <strong>{r.date}</strong>
                  <span>{r.checkin} → {r.checkout}</span>
                </div>
                <div className="eov4-table-side">
                  <span className="eov4-hours-pill">{r.hours}</span>
                  <span className="eov4-note-text">{r.note}</span>
                </div>
              </div>
            ))}
          </div>
          <button className="eov4-primary-btn">📤 Xuất file công</button>
        </BottomSheet>
      )}

      {activeSheet === 'schedule' && (
        <BottomSheet title="📅 Lịch phân ca tuần này" onClose={closeSheet}>
          <div className="eov4-table">
            {SCHEDULE_WEEK.map((r) => (
              <div key={r.day} className="eov4-table-row">
                <div className="eov4-table-main">
                  <strong>{r.day}</strong>
                </div>
                <span className={r.shift === 'Nghỉ' ? 'eov4-note-text' : 'eov4-hours-pill'}>{r.shift}</span>
              </div>
            ))}
          </div>
          <button className="eov4-primary-btn">🔄 Đăng ký đổi ca</button>
        </BottomSheet>
      )}

      {activeSheet === 'advance' && (
        <BottomSheet title="💵 Yêu cầu ứng lương" onClose={closeSheet}>
          {advanceSent ? (
            <div className="eov4-success-box">✅ Đã gửi yêu cầu ứng {formatVND(advanceAmount)} tới Sếp, chờ duyệt nhé.</div>
          ) : (
            <>
              <div className="eov4-quick-amounts">
                {[500000, 1000000, 2000000].map((amt) => (
                  <button
                    key={amt}
                    className={`eov4-chip-btn ${advanceAmount === amt ? 'active' : ''}`}
                    onClick={() => setAdvanceAmount(amt)}
                  >
                    {formatVND(amt)}
                  </button>
                ))}
              </div>
              <label className="eov4-field-label">Lý do ứng lương</label>
              <textarea
                className="eov4-textarea"
                rows={3}
                placeholder="VD: Cần tiền đóng học phí con..."
                value={advanceReason}
                onChange={(e) => setAdvanceReason(e.target.value)}
              />
              <button className="eov4-primary-btn" onClick={() => setAdvanceSent(true)}>
                <Send size={16} /> Gửi Sếp duyệt
              </button>
            </>
          )}
        </BottomSheet>
      )}

      {activeSheet === 'leave' && (
        <BottomSheet title="📝 Đơn xin nghỉ phép" onClose={closeSheet}>
          {leaveSent ? (
            <div className="eov4-success-box">✅ Đã gửi đơn xin nghỉ ({leaveStart || '?'} → {leaveEnd || '?'}), chờ Sếp duyệt.</div>
          ) : (
            <>
              <label className="eov4-field-label">Ngày bắt đầu</label>
              <input type="date" className="eov4-input" value={leaveStart} onChange={(e) => setLeaveStart(e.target.value)} />
              <label className="eov4-field-label">Ngày kết thúc</label>
              <input type="date" className="eov4-input" value={leaveEnd} onChange={(e) => setLeaveEnd(e.target.value)} />
              <label className="eov4-field-label">Lý do nghỉ phép</label>
              <textarea
                className="eov4-textarea"
                rows={3}
                placeholder="VD: Về quê giỗ ông bà..."
                value={leaveReason}
                onChange={(e) => setLeaveReason(e.target.value)}
              />
              <button className="eov4-primary-btn" onClick={() => setLeaveSent(true)}>
                <Send size={16} /> Gửi duyệt
              </button>
            </>
          )}
        </BottomSheet>
      )}

      {activeSheet === 'payroll' && (
        <BottomSheet title="💰 Phiếu lương Tháng 8" onClose={closeSheet}>
          <div className="eov4-table">
            {PAYROLL_T8.map((r) => (
              <div key={r.label} className="eov4-table-row">
                <strong>{r.label}</strong>
                <span className={r.amount < 0 ? 'eov4-tone-danger' : ''}>
                  {r.amount < 0 ? '- ' : ''}{formatVND(Math.abs(r.amount))}
                </span>
              </div>
            ))}
          </div>
          <div className="eov4-payroll-net">
            <span>Thực nhận</span>
            <strong>{formatVND(payrollNet)}</strong>
          </div>
        </BottomSheet>
      )}

      {activeSheet === 'report' && (
        <BottomSheet title="📋 Báo cáo cuối ca" onClose={closeSheet}>
          {reportSent ? (
            <div className="eov4-success-box">✅ Đã gửi báo cáo cuối ca thành công.</div>
          ) : (
            <>
              <label className="eov4-field-label">Doanh thu cuối ca</label>
              <input
                type="number"
                className="eov4-input"
                placeholder="VD: 1250000"
                value={reportRevenue}
                onChange={(e) => setReportRevenue(e.target.value)}
              />
              <label className="eov4-field-label">Số lượng bánh còn tồn quầy</label>
              <input
                type="number"
                className="eov4-input"
                placeholder="VD: 12"
                value={reportStock}
                onChange={(e) => setReportStock(e.target.value)}
              />
              <label className="eov4-field-label">Bàn giao két tiền mặt</label>
              <input
                type="number"
                className="eov4-input"
                placeholder="VD: 500000"
                value={reportCash}
                onChange={(e) => setReportCash(e.target.value)}
              />
              <button className="eov4-primary-btn" onClick={() => setReportSent(true)}>
                <Send size={16} /> Gửi báo cáo
              </button>
            </>
          )}
        </BottomSheet>
      )}

      {activeSheet === 'violation' && (
        <BottomSheet title="⚠️ Lịch sử vi phạm" onClose={closeSheet}>
          {VIOLATIONS.length === 0 ? (
            <div className="eov4-empty-box">🎉 Không có vi phạm nào — giữ vững phong độ nhé!</div>
          ) : (
            VIOLATIONS.map((v, i) => <div key={i} className="eov4-table-row">{v.title}</div>)
          )}
        </BottomSheet>
      )}

      {activeSheet === 'reward' && (
        <BottomSheet title="🎁 Thưởng nóng & Sao tích lũy" onClose={closeSheet}>
          <div className="eov4-table">
            {REWARDS.map((r, i) => (
              <div key={i} className="eov4-table-row">
                <div className="eov4-table-main">
                  <strong>{r.title}</strong>
                  <span className="eov4-note-text">{r.date}</span>
                </div>
                <span className="eov4-tone-warning">+{formatVND(r.amount)}</span>
              </div>
            ))}
          </div>
        </BottomSheet>
      )}

      {activeSheet === 'revenue_kpi' && (
        <BottomSheet title="📊 Chi tiết doanh thu & KPI cá nhân" onClose={closeSheet}>
          <div className="eov4-kpi-detail-grid">
            <div className="eov4-kpi-detail-card">
              <div className="eov4-tile-sub">Doanh thu tháng này</div>
              <strong>{formatVND(KPI.revenue)}</strong>
            </div>
            <div className="eov4-kpi-detail-card">
              <div className="eov4-tile-sub">Số đơn đã chốt</div>
              <strong>2 đơn</strong>
            </div>
            <div className="eov4-kpi-detail-card">
              <div className="eov4-tile-sub">Giá trị đơn TB</div>
              <strong>{formatVND(550000)}</strong>
            </div>
            <div className="eov4-kpi-detail-card">
              <div className="eov4-tile-sub">Xếp hạng team</div>
              <strong>#2 / 6</strong>
            </div>
          </div>
        </BottomSheet>
      )}

      {activeSheet === 'orders' && (
        <BottomSheet title="🧾 Danh sách đơn hàng" onClose={closeSheet}>
          <div className="eov4-filter-row">
            {ORDER_TILES.map((o) => (
              <button
                key={o.key}
                className={`eov4-filter-chip ${selectedOrderFilter === o.key ? 'active' : ''}`}
                onClick={() => setSelectedOrderFilter(o.key)}
              >
                {o.label}
              </button>
            ))}
          </div>
          {filteredOrders.length === 0 ? (
            <div className="eov4-empty-box">Không có đơn nào trong mục này.</div>
          ) : (
            <div className="eov4-table">
              {filteredOrders.map((o) => (
                <div key={o.code} className="eov4-table-row">
                  <div className="eov4-table-main">
                    <strong>#{o.code}</strong>
                    <span className="eov4-note-text">{o.customer}</span>
                  </div>
                  <div className="eov4-table-side">
                    <span className="eov4-hours-pill">{o.statusLabel}</span>
                    <span className="eov4-note-text">{formatVND(o.total)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </BottomSheet>
      )}
    </div>
  );
}
