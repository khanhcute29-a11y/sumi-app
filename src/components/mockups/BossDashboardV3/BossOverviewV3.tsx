import React, { useState, useMemo, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  Crown,
  TrendingUp,
  TrendingDown,
  Users,
  Clock,
  MessageSquare,
  Send,
  Receipt,
  CheckCircle2,
  AlertTriangle,
  X,
  ChevronRight,
  ClipboardList,
  Calendar,
  DollarSign,
  FileText,
  Bell,
  Check,
  Award,
  Package,
  Truck,
  ChefHat,
  Inbox,
  Zap,
  Megaphone,
  Gift,
  Heart
} from 'lucide-react';
import { AuthProvider, useAuth } from '../../../lib/AuthContext';
import { playConfirmSound } from '../../../lib/sound';
import { listOrdersV2 } from '../../../lib/featureFlags';
import { ORDER_FLOWS } from '../../../data/orderCatalogs';
// Tái dùng ĐÚNG bộ lọc ngày/tuần/tháng/tuỳ chọn đã có sẵn cho doanh thu theo
// kênh (Hôm nay) — không viết lại công thức tính khoảng ngày ở đây, tránh
// lệch cách tính giữa 2 nơi.
import { periodRange, PERIOD_TABS } from '../../../screens/MobileHomeScreen';
// Khoan sâu đơn hàng — dùng lại ĐÚNG component chi tiết đơn hàng thật (đã có
// nhận giao/hoàn thành/sửa đơn/GPS/chat) thay vì tự dựng lại một bản rút gọn.
// KHÔNG động tới bất kỳ file nào khác của anh Khánh ngoài file này.
import OrderV2DetailModal from '../../OrderV2DetailModal';
import FinishedGoodsInventoryV2 from '../../warehouse/FinishedGoodsInventoryV2';
// Ô "Nhân viên" — dùng lại ĐÚNG StaffScreen thật (duyệt tài khoản chờ, sửa
// vai trò/khâu, khóa tài khoản...) đã có sẵn ở Sidebar desktop, không tự
// dựng lại màn quản lý nhân sự khác ở đây.
import StaffScreen from '../../../screens/StaffScreen';
import UserAvatar from '../../UserAvatar';
import StarRateBar from '../../StarRateBar';
import { supabase } from '../../../lib/supabaseClient';
import { fetchShiftLogsRange } from '../../../lib/queries';
// Tổng giờ làm/tăng ca dùng ĐÚNG cùng công thức với màn Chấm Công (self-view)
// — tomTatThang() đã tự nhóm log theo work_date, không phụ thuộc khoảng thời
// gian truyền vào là 7 ngày/tháng/tùy chỉnh gì, nên tái dùng thẳng chứ không
// viết công thức cộng giờ riêng ở đây (tránh lệch số như đã từng xảy ra).
import { boPhanCuaHoSo, chuanHoaCa, tomTatThang, TEN_BO_PHAN } from '../../../lib/chamCong';
import { fetchDanhSachNhanSuNgay, fetchDanhSachNhanSuKhoangNgay, fetchHoSoNgayNhanSu, khongCoHoatDong } from '../../../lib/hoSoNgayNhanSu';
import { KHOI, LUONG, luongCuaHoSo } from '../../shifts/v2/luongNhanSu';
import { WeeklyScheduleSection } from '../../WeeklyScheduleSection';
import DirectorStaffOverviewSheet from '../../shifts/v2/DirectorStaffOverviewSheet';
import {
  fetchRevenueByChannel,
  fetchDoanhThuDuTinh,
  fetchExpenseAndAdvanceLedgerToday,
  reviewExpenseClaim,
  fetchTodayStaffStatus,
  remindStaff,
  waiveLatePenalty,
  fetchAssignableStaff,
  fetchRecentFeedPosts,
  postCompanyAnnouncement,
  summarizeOrderCounts,
  sortOrdersByPriority,
  fetchPendingSalaryAdvances,
  reviewSalaryAdvance,
  fetchPendingLeaveRequests,
  reviewLeaveRequest,
  fetchPendingOrderEditRequests,
  reviewOrderEditRequest,
  fetchPendingOvertimeRequests,
  reviewOvertimeRequest,
  fetchApprovalHistory,
  fetchPendingTaskExemptions,
  reviewTaskExemption,
  fetchTodayShiftReports,
  fetchCompletedTasksReport,
  fetchCompletedOrderWorkReport,
  fetchTodayViolationsReport,
  fetchTodayChecklistReport,
  fetchWeeklyScheduleAllStations,
  fetchOrderHearts,
  addOrderHeart,
} from '../../../lib/bossOverviewV3';

const formatVND = (amount: number) => {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
};

const PAYMENT_METHOD_LABEL: Record<string, string> = {
  cash: '💵 Tiền mặt (quầy thu ngân)',
  bank_vcb: '🏦 Chuyển khoản VCB (Kế toán)',
  bank_tcb: '🏦 Chuyển khoản TCB (Kế toán)',
  momo: '📱 MoMo (Kế toán)',
};

const formatDateTimeVN = (iso: string | null | undefined) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return `${d.toLocaleDateString('vi-VN')} ${d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}`;
};

// Gộp 1 dòng expense_claims/salary_advance_requests (đã merge ở
// fetchExpenseAndAdvanceLedgerToday) thành object hiển thị dùng chung cho cả
// danh sách Sổ Cái và trang chi tiết khoan sâu — giữ đủ dữ liệu thật (ảnh đại
// diện, nguồn tiền, ảnh chứng từ) để không phải query lại khi bấm vào 1 dòng.
const mapLedgerRow = (c: any) => ({
  id: c.id,
  title: c.description || c.note || 'Khoản chi',
  amount: Number(c.amount) || 0,
  category: c.status === 'pending_director' ? '⏳ Chờ Sếp duyệt' : c.status === 'pending_accounting' ? '✓ Đã duyệt · chờ ghi sổ' : c.status === 'recorded' ? '✓ Đã ghi sổ' : '✕ Đã từ chối',
  time: new Date(c.occurred_at || c.created_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
  icon: c.source === 'advance' ? '🏦' : '💸',
  status: c.status,
  claimantName: c.claimant_name,
  source: c.source,
  occurredAt: c.occurred_at || c.created_at,
  claimantProfile: c.claimantProfile || null,
  paymentMethod: c.disbursed_payment_method || null,
  receiptUrl: c.disbursed_receipt_url || c.receipt_attachments?.[0]?.url || null,
  reasonText: c.source === 'advance' ? (c.reason || '—') : (c.note || c.description || '—'),
});

// Một dòng nhãn/giá trị trong màn chi tiết yêu cầu duyệt — dùng chung cho cả
// 5 loại (sửa đơn/tăng ca/tạm ứng/xin nghỉ/chi), tránh lặp style 5 lần.
function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #eadcca', borderRadius: 12, padding: '10px 14px' }}>
      <div style={{ fontSize: 10.5, fontWeight: 800, color: '#a08060', textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 700, color: '#2d1c10' }}>{value}</div>
    </div>
  );
}

// Hồ sơ 1 nhân viên — lớp "thông tin cuối" khi bấm vào 1 người trong Chi Tiết
// Trạng Thái Nhân Sự. Không có sẵn component nào để dùng lại (khác với Đơn
// hàng/Kho Thành Phẩm), nên dựng mới gọn, chỉ dùng dữ liệu THẬT có sẵn:
//   - `staffBasic`: đúng object `st` đang hiển thị trên thẻ (đỡ phải chờ tải
//     lại những gì đã có sẵn trên màn hình).
//   - 7 ngày chấm công gần nhất: bảng `shift_logs` (đã có sẵn, dùng lại
//     fetchShiftLogsRange thay vì viết truy vấn mới).
//   - Việc đang làm/hoàn thành hôm nay: đếm thẳng trên bảng `tasks`
//     (category in assigned/adhoc, đúng phạm vi phân hệ Việc).
function StaffProfileSheet({ staffBasic, onBack }: { staffBasic: any; onBack: () => void }) {
  const [logs, setLogs] = useState<any[]>([]);
  const [taskCounts, setTaskCounts] = useState<{ dangLam: number; xongHomNay: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  // Mặc định "Tuần" (7 ngày gần đây) — mẹ yêu cầu thêm lựa chọn xem nguyên
  // tháng, và sau đó thêm cả tùy chỉnh khoảng ngày tự do, khi bấm vào 1 nhân
  // viên. Không đổi hành vi mặc định đang có.
  const [rangeMode, setRangeMode] = useState<'tuan' | 'thang' | 'tuychinh'>('tuan');
  const homNayStrYMD = new Date().toISOString().slice(0, 10);
  const [tuyChinhTu, setTuyChinhTu] = useState(homNayStrYMD);
  const [tuyChinhDen, setTuyChinhDen] = useState(homNayStrYMD);
  // Quy định ca (giờ chuẩn từng bộ phận) — cần để tính đúng "Tổng thời gian
  // tăng ca" bằng ĐÚNG công thức tomTatThang() dùng ở màn Chấm Công của chính
  // nhân viên, không tự viết công thức riêng ở đây.
  const [cauHinhCa, setCauHinhCa] = useState<any[]>([]);
  useEffect(() => {
    let huy = false;
    supabase.from('sumi_quy_dinh_ca').select('*').eq('active', true)
      .then(({ data }) => { if (!huy) setCauHinhCa(data || []); })
      .catch(() => { if (!huy) setCauHinhCa([]); });
    return () => { huy = true; };
  }, []);

  useEffect(() => {
    let huy = false;
    supabase.from('tasks').select('status,accepted_at,completed_at,exclusion_reason_code')
      .eq('assignee_id', staffBasic.id)
      .in('category', ['assigned', 'adhoc'])
      .is('deleted_at', null)
      .then(({ data }) => {
        if (huy) return;
        const tasks = data || [];
        const homNayStr = new Date().toDateString();
        // Đếm ĐÚNG cùng công thức với nhomViecNhanVien() (nguồn thật cho khối
        // "Đang làm" mà chính nhân viên đó thấy trên màn hình của họ) — không tự
        // viết lại filter riêng ở đây, tránh số bên Giám đốc lệch với số nhân
        // viên tự thấy như đã xảy ra ở hero-metrics trước đó.
        const dsHopLe = tasks.filter((t: any) => !t.exclusion_reason_code);
        setTaskCounts({
          dangLam: dsHopLe.filter((t: any) => t.status === 'accepted' || (t.status === 'open' && t.accepted_at)).length,
          xongHomNay: dsHopLe.filter((t: any) => t.status === 'done' && t.completed_at && new Date(t.completed_at).toDateString() === homNayStr).length,
        });
      }).catch(() => {});
    return () => { huy = true; };
  }, [staffBasic.id]);

  useEffect(() => {
    // Chế độ tùy chỉnh: chỉ tải khi mẹ bấm "Xem" (handleXemTuyChinh), tránh
    // gọi query liên tục khi đang gõ dở ngày trong 2 ô input.
    if (rangeMode === 'tuychinh') return;
    let huy = false;
    setError('');
    setLoading(true);
    const homNay = new Date();
    const den = homNay.toISOString().slice(0, 10);
    const tu = rangeMode === 'thang'
      ? `${homNay.getFullYear()}-${String(homNay.getMonth() + 1).padStart(2, '0')}-01`
      : new Date(homNay.getTime() - 6 * 86400000).toISOString().slice(0, 10);
    fetchShiftLogsRange(tu, den).then((shiftLogs: any) => {
      if (huy) return;
      setLogs((shiftLogs || []).filter((l: any) => l.staff_id === staffBasic.id));
    }).catch((e: any) => { if (!huy) setError(e.message || 'Không tải được dữ liệu.'); })
      .finally(() => { if (!huy) setLoading(false); });
    return () => { huy = true; };
  }, [staffBasic.id, rangeMode]);

  const handleXemTuyChinh = () => {
    if (!tuyChinhTu || !tuyChinhDen || tuyChinhTu > tuyChinhDen) {
      setError('Khoảng ngày không hợp lệ — "Từ ngày" phải trước hoặc bằng "Đến ngày".');
      return;
    }
    setError('');
    setLoading(true);
    fetchShiftLogsRange(tuyChinhTu, tuyChinhDen).then((shiftLogs: any) => {
      setLogs((shiftLogs || []).filter((l: any) => l.staff_id === staffBasic.id));
    }).catch((e: any) => setError(e.message || 'Không tải được dữ liệu.'))
      .finally(() => setLoading(false));
  };

  // Ghép checkin/checkout thành từng ca theo work_date để hiển thị gọn.
  const caTheoNgay: Record<string, { vao?: string; ra?: string }> = {};
  logs.forEach((l: any) => {
    const ngay = l.work_date;
    if (!caTheoNgay[ngay]) caTheoNgay[ngay] = {};
    const gio = new Date(l.checkin_time || l.created_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
    if (l.type === 'checkin') caTheoNgay[ngay].vao = gio;
    else if (l.type === 'checkout') caTheoNgay[ngay].ra = gio;
  });
  const ngayDs = Object.keys(caTheoNgay).sort((a, b) => b.localeCompare(a));
  const soLanTre = logs.filter((l: any) => l.type === 'checkin' && (l.late_minutes || 0) > 0).length;
  const danhSachCa = chuanHoaCa(cauHinhCa);
  const boPhan = boPhanCuaHoSo({ station: staffBasic.station, role: staffBasic.role, extra_roles: staffBasic.extra_roles });
  const tomTat = tomTatThang(logs, staffBasic.id, danhSachCa, boPhan);

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 2100, background: '#fdf9f2', overflowY: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px', borderBottom: '1.5px solid #eadcca', position: 'sticky', top: 0, background: '#fdf9f2', zIndex: 1 }}>
        <button onClick={onBack} aria-label="Quay lại" style={{ width: 40, height: 40, borderRadius: 12, background: '#f4efe8', border: 'none', fontSize: 20, fontWeight: 900, color: '#2d1c10', cursor: 'pointer', flexShrink: 0 }}>‹</button>
        <div style={{ fontSize: 24 }}>{staffBasic.avatar}</div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 900, color: '#2d1c10' }}>{staffBasic.name}</div>
          <div style={{ fontSize: 11.5, color: '#725f50' }}>{staffBasic.role} · [{staffBasic.zone}]</div>
        </div>
      </div>

      <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {error && <div style={{ color: '#dc2626', fontWeight: 700, fontSize: 12.5 }}>⚠️ {error}</div>}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <div style={{ background: '#fff', border: '1.5px solid #eadcca', borderRadius: 14, padding: 12, textAlign: 'center' }}>
            <div style={{ fontSize: 20, fontWeight: 900, color: '#c28c4e' }}>{taskCounts ? taskCounts.dangLam : '—'}</div>
            <div style={{ fontSize: 10.5, color: '#725f50', fontWeight: 800 }}>Việc đang làm</div>
          </div>
          <div style={{ background: '#fff', border: '1.5px solid #eadcca', borderRadius: 14, padding: 12, textAlign: 'center' }}>
            <div style={{ fontSize: 20, fontWeight: 900, color: '#15803d' }}>{taskCounts ? taskCounts.xongHomNay : '—'}</div>
            <div style={{ fontSize: 10.5, color: '#725f50', fontWeight: 800 }}>Xong hôm nay</div>
          </div>
          <div style={{ background: '#fff', border: '1.5px solid #eadcca', borderRadius: 14, padding: 12, textAlign: 'center' }}>
            <div style={{ fontSize: 20, fontWeight: 900, color: '#c28c4e' }}>{loading ? '—' : `${tomTat.tongGio}h`}</div>
            <div style={{ fontSize: 10.5, color: '#725f50', fontWeight: 800 }}>Tổng thời gian làm</div>
          </div>
          <div style={{ background: '#fff', border: '1.5px solid #eadcca', borderRadius: 14, padding: 12, textAlign: 'center' }}>
            <div style={{ fontSize: 20, fontWeight: 900, color: '#1d4ed8' }}>{loading ? '—' : `${tomTat.phutOT}p`}</div>
            <div style={{ fontSize: 10.5, color: '#725f50', fontWeight: 800 }}>Tổng thời gian tăng ca</div>
          </div>
        </div>

        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <div style={{ fontSize: 12, fontWeight: 900, color: '#2d1c10' }}>📅 Chấm công</div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                onClick={() => setRangeMode('tuan')}
                style={{ fontSize: 11, fontWeight: 800, padding: '4px 10px', borderRadius: 99, border: '1.5px solid #eadcca', cursor: 'pointer', background: rangeMode === 'tuan' ? '#2d1c10' : '#fff', color: rangeMode === 'tuan' ? '#fff' : '#725f50' }}
              >
                7 ngày qua
              </button>
              <button
                onClick={() => setRangeMode('thang')}
                style={{ fontSize: 11, fontWeight: 800, padding: '4px 10px', borderRadius: 99, border: '1.5px solid #eadcca', cursor: 'pointer', background: rangeMode === 'thang' ? '#2d1c10' : '#fff', color: rangeMode === 'thang' ? '#fff' : '#725f50' }}
              >
                Tháng này
              </button>
              <button
                onClick={() => setRangeMode('tuychinh')}
                style={{ fontSize: 11, fontWeight: 800, padding: '4px 10px', borderRadius: 99, border: '1.5px solid #eadcca', cursor: 'pointer', background: rangeMode === 'tuychinh' ? '#2d1c10' : '#fff', color: rangeMode === 'tuychinh' ? '#fff' : '#725f50' }}
              >
                Tùy chỉnh
              </button>
            </div>
          </div>
          {rangeMode === 'tuychinh' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
              <input
                type="date"
                value={tuyChinhTu}
                onChange={(e) => setTuyChinhTu(e.target.value)}
                style={{ fontSize: 12, padding: '5px 8px', borderRadius: 8, border: '1.5px solid #eadcca', color: '#2d1c10' }}
              />
              <span style={{ fontSize: 12, color: '#725f50' }}>→</span>
              <input
                type="date"
                value={tuyChinhDen}
                onChange={(e) => setTuyChinhDen(e.target.value)}
                style={{ fontSize: 12, padding: '5px 8px', borderRadius: 8, border: '1.5px solid #eadcca', color: '#2d1c10' }}
              />
              <button
                onClick={handleXemTuyChinh}
                style={{ fontSize: 11, fontWeight: 800, padding: '6px 12px', borderRadius: 8, border: 'none', background: '#c28c4e', color: '#fff', cursor: 'pointer' }}
              >
                Xem
              </button>
            </div>
          )}
          {!loading && ngayDs.length > 0 && (
            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <div style={{ flex: 1, background: '#fff', border: '1.5px solid #eadcca', borderRadius: 10, padding: '6px 10px', textAlign: 'center' }}>
                <div style={{ fontSize: 15, fontWeight: 900, color: '#2d1c10' }}>{ngayDs.length}</div>
                <div style={{ fontSize: 10, color: '#725f50', fontWeight: 700 }}>Ngày đã chấm công</div>
              </div>
              <div style={{ flex: 1, background: '#fff', border: '1.5px solid #eadcca', borderRadius: 10, padding: '6px 10px', textAlign: 'center' }}>
                <div style={{ fontSize: 15, fontWeight: 900, color: '#dc2626' }}>{soLanTre}</div>
                <div style={{ fontSize: 10, color: '#725f50', fontWeight: 700 }}>Lần đi trễ</div>
              </div>
            </div>
          )}
          {loading && <div style={{ fontSize: 12, color: '#725f50' }}>Đang tải...</div>}
          {!loading && ngayDs.length === 0 && (
            <div style={{ fontSize: 12, color: '#725f50' }}>Chưa có dữ liệu chấm công trong khoảng này.</div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {ngayDs.map((ngay) => (
              <div key={ngay} style={{ display: 'flex', justifyContent: 'space-between', background: '#fff', border: '1px solid #eadcca', borderRadius: 10, padding: '8px 10px', fontSize: 12 }}>
                <span style={{ fontWeight: 800, color: '#2d1c10' }}>{ngay}</span>
                <span style={{ color: '#725f50' }}>
                  {caTheoNgay[ngay].vao ? `▶ ${caTheoNgay[ngay].vao}` : '—'} → {caTheoNgay[ngay].ra ? `⏹ ${caTheoNgay[ngay].ra}` : 'chưa kết thúc ca'}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// Bỏ dấu tiếng Việt cho ô tìm kiếm đơn hàng — gõ "phuong" vẫn ra "Phượng",
// khớp cách tab Chat đang làm (ChatScreen.jsx).
function stripDiacritics(text: string): string {
  return (text || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, (m) => (m === 'đ' ? 'd' : 'D')).toLowerCase();
}

export function BossOverviewV3Inner({ onNavigate }: { onNavigate?: (tab: string) => void } = {}) {
  const { profile } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);
  useEffect(() => {
    supabase.from('notifications').select('*', { count: 'exact', head: true }).is('read_at', null)
      .then(({ count, error }) => { if (!error) setUnreadCount(count || 0); });
  }, []);

  // ── States Quản Lý Bottom Sheets & Bộ Lọc Đơn Hàng ──
  const [activeSheet, setActiveSheet] = useState<
    'revenue_detail' | 'expense_detail' | 'order_drawer' | 'staff_detail' | 'staff_overview_v2' | 'approval_center' | 'feed_sheet' | 'advance_sheet' | 'leave_sheet' | 'report_sheet' | 'schedule_sheet' | 'warehouse_sheet' | 'staff_screen_sheet' | null
  >(null);
  const [selectedOrderFilter, setSelectedOrderFilter] = useState<string>('all');
  // Tab LUỒNG bên trong sheet "Danh Sách Đơn Hàng" — THAY THẾ thanh lọc
  // trạng thái con cũ (Tất cả/Đang làm/Chờ giao/Trễ hạn), theo đúng yêu cầu
  // Hồ Hoàng Diễm 01/09/2026: "các tab đó thay đổi thành các luồng ... 5
  // luồng". Lọc theo order_type, ĐỘC LẬP với selectedOrderFilter ở trên
  // (selectedOrderFilter vẫn quyết định danh sách gốc khi mở từ 1 trong 7 ô
  // trạng thái ngoài Dashboard — tab luồng chỉ lọc thêm bên trong sheet).
  const [selectedOrderFlowTab, setSelectedOrderFlowTab] = useState<string>('all');
  const [orderSearchQuery, setOrderSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  // Khoan sâu: bấm 1 đơn trong Danh Sách Đơn Hàng -> mở chi tiết đơn đó (lớp
  // trên cùng, không đụng activeSheet — đóng lớp này quay lại đúng danh sách,
  // không mất trạng thái lọc/cuộn của sheet bên dưới).
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [selectedLeaveTab, setSelectedLeaveTab] = useState<string>('all');
  const [selectedStaff, setSelectedStaff] = useState<any>(null);
  // Khoan sâu Sổ Cái: 2 luồng Tạm ứng / Chi hoạt động, bấm 1 dòng mở "thông
  // tin cuối" của khoản chi đó (lớp trên cùng, không đụng activeSheet — đóng
  // lại quay đúng về danh sách, không mất tab/trạng thái cuộn).
  const [ledgerTab, setLedgerTab] = useState<'expense' | 'advance'>('expense');
  const [selectedLedgerItem, setSelectedLedgerItem] = useState<any>(null);

  // Tab "Chi hôm nay" / "Lịch sử" của sheet Sổ Cái — tương tự sheet Doanh Thu
  const [expensePeriodTab, setExpensePeriodTab] = useState<'today' | 'history'>('today');
  const [expenseHistoryFrom, setExpenseHistoryFrom] = useState(() => { const d = new Date(); d.setDate(d.getDate() - 6); return d.toISOString().slice(0, 10); });
  const [expenseHistoryTo, setExpenseHistoryTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [expenseHistoryStreams, setExpenseHistoryStreams] = useState<any[]>([]);
  const [expenseHistoryTotal, setExpenseHistoryTotal] = useState(0);
  const [expenseHistoryLoading, setExpenseHistoryLoading] = useState(false);
  const [expenseHistoryError, setExpenseHistoryError] = useState('');

  const loadExpenseHistory = async () => {
    if (!expenseHistoryFrom || !expenseHistoryTo) return;
    setExpenseHistoryLoading(true); setExpenseHistoryError('');
    try {
      const claims = await fetchExpenseAndAdvanceLedgerToday({
        from: `${expenseHistoryFrom}T00:00:00`,
        to: `${expenseHistoryTo}T23:59:59.999`,
      });
      setExpenseHistoryStreams(claims.map(mapLedgerRow));
      setExpenseHistoryTotal(claims.reduce((s: number, c: any) => s + (Number(c.amount) || 0), 0));
    } catch (e: any) {
      setExpenseHistoryError(e.message || 'Không tải được lịch sử chi.');
    } finally {
      setExpenseHistoryLoading(false);
    }
  };

  // ── Khoá cuộn nền + vuốt kéo xuống để đóng Bottom Sheet (dùng chung cho mọi sheet) ──
  const [dragY, setDragY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartY = useRef(0);

  useEffect(() => {
    document.body.style.overflow = activeSheet ? 'hidden' : 'unset';
    setDragY(0);
    setIsDragging(false);
    return () => { document.body.style.overflow = 'unset'; };
  }, [activeSheet]);

  const handleSheetTouchStart = (e: React.TouchEvent) => {
    dragStartY.current = e.touches[0].clientY;
    setIsDragging(true);
  };
  const handleSheetTouchMove = (e: React.TouchEvent) => {
    const delta = e.touches[0].clientY - dragStartY.current;
    if (delta > 0) setDragY(delta);
  };
  const handleSheetTouchEnd = () => {
    setIsDragging(false);
    if (dragY > 120) setActiveSheet(null);
    setDragY(0);
  };
  const sheetDragHandlers = { onTouchStart: handleSheetTouchStart, onTouchMove: handleSheetTouchMove, onTouchEnd: handleSheetTouchEnd };
  const sheetPanelStyle = (extra: React.CSSProperties = {}): React.CSSProperties => ({
    width: '100%', maxWidth: 480, margin: '0 auto', maxHeight: '85vh', background: '#fff', borderRadius: '28px 28px 0 0',
    boxSizing: 'border-box', display: 'flex', flexDirection: 'column', overflow: 'hidden',
    transform: `translateY(${dragY}px)`,
    transition: isDragging ? 'none' : 'transform 0.3s cubic-bezier(0.25, 0.8, 0.25, 1)',
    willChange: 'transform',
    ...extra,
  });
  const SHEET_HANDLE = <div style={{ width: 38, height: 4, background: '#cbd5e1', borderRadius: 99, margin: '8px auto 2px', flexShrink: 0 }} />;
  const sheetBodyStyle = (extra: React.CSSProperties = {}): React.CSSProperties => ({
    flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch', padding: '0 14px 30px', boxSizing: 'border-box', ...extra,
  });

  // ── Dữ liệu thật: doanh thu THUẦN 5 kênh hôm nay (đã hoàn thành + đã xác
  // minh thanh toán) ──
  const [revenueStreams, setRevenueStreams] = useState<any[]>([]);
  const [totalRevenue, setTotalRevenue] = useState(0);

  // ── Dữ liệu thật: doanh thu DỰ TÍNH (đặt cọc + công nợ sỉ + đơn đang giao) ──
  const [duTinhBuckets, setDuTinhBuckets] = useState<any[]>([]);
  const [duTinhTotal, setDuTinhTotal] = useState(0);

  // ── Tab "Hôm nay" / "Lịch sử" trong sheet Doanh Thu ──
  const [revenueTab, setRevenueTab] = useState<'today' | 'history'>('today');
  const [historyFrom, setHistoryFrom] = useState(() => { const d = new Date(); d.setDate(d.getDate() - 6); return d.toISOString().slice(0, 10); });
  const [historyTo, setHistoryTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [historyChannels, setHistoryChannels] = useState<any[]>([]);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState('');

  // Danh sách đơn khi bấm vào 1 luồng doanh thu (dự tính hoặc thuần)
  const [revenueDrill, setRevenueDrill] = useState<{ title: string; amount: number; orders: any[] } | null>(null);

  // ── Dữ liệu thật: sổ cái khoản chi (expense_claims) ──
  const [expenseStreams, setExpenseStreams] = useState<any[]>([]);
  const [totalExpense, setTotalExpense] = useState(0);

  const [selectedStaffTab, setSelectedStaffTab] = useState<'working' | 'late' | 'off'>('working');

  // ── Dữ liệu thật: chấm công toàn công ty hôm nay ──
  const [staffList, setStaffList] = useState<any[]>([]);
  const [staffCounts, setStaffCounts] = useState({ total: 0, working: 0, late: 0, off: 0 });
  const [assignableStaff, setAssignableStaff] = useState<any[]>([]);

  // ── Dữ liệu thật: tạm ứng lương + nghỉ phép đang chờ Sếp duyệt ──
  const [pendingAdvances, setPendingAdvances] = useState<any[]>([]);
  const [pendingLeaves, setPendingLeaves] = useState<any[]>([]);

  // ── Dữ liệu thật: Yêu Cầu Duyệt (gom mọi thứ chờ Sếp duyệt vào 1 nơi) ──
  const [pendingEditRequests, setPendingEditRequests] = useState<any[]>([]);
  const [pendingOvertimes, setPendingOvertimes] = useState<any[]>([]);
  const [pendingTaskExemptions, setPendingTaskExemptions] = useState<any[]>([]);
  const [approvalBusy, setApprovalBusy] = useState<string | null>(null);
  // Tab "Đang chờ" / "Lịch sử" trong sheet Yêu Cầu Duyệt + chi tiết 1 yêu cầu
  const [approvalTab, setApprovalTab] = useState<'pending' | 'history'>('pending');
  const [approvalHistory, setApprovalHistory] = useState<{ editRequests: any[]; overtimes: any[]; advances: any[]; leaves: any[]; expenses: any[]; taskExemptions: any[] } | null>(null);
  const [approvalHistoryLoading, setApprovalHistoryLoading] = useState(false);
  const [selectedApprovalItem, setSelectedApprovalItem] = useState<{ kind: 'edit' | 'overtime' | 'advance' | 'leave' | 'expense' | 'exemption'; item: any; canReview: boolean } | null>(null);

  const loadApprovalHistory = async () => {
    setApprovalHistoryLoading(true);
    try {
      setApprovalHistory(await fetchApprovalHistory());
    } catch {
      setApprovalHistory({ editRequests: [], overtimes: [], advances: [], leaves: [], expenses: [], taskExemptions: [] });
    } finally {
      setApprovalHistoryLoading(false);
    }
  };

  // ── Dữ liệu thật: báo cáo cuối ca hôm nay (staff_shift_reports) ──
  const [shiftReports, setShiftReports] = useState<any[]>([]);
  const [completedTasksToday, setCompletedTasksToday] = useState<any[]>([]);
  // Thêm 3 mục cho sheet Báo Cáo Ngày: đơn hàng luồng order_work, vi phạm nội
  // quy, checklist hàng ngày — KHÔNG trùng với "Việc hoàn thành" (chỉ
  // assigned/adhoc) hay bảng chấm công đã có ở card riêng ngoài trang chủ.
  const [orderWorkTasksToday, setOrderWorkTasksToday] = useState<any[]>([]);
  const [violationsToday, setViolationsToday] = useState<any[]>([]);
  const [checklistToday, setChecklistToday] = useState<any[]>([]);
  const [historyOrderWorkTasks, setHistoryOrderWorkTasks] = useState<any[]>([]);
  const [historyViolations, setHistoryViolations] = useState<any[]>([]);

  // Tab "Hôm nay" / "Lịch sử" của sheet Báo Cáo Ngày — CẢ HAI đều đi theo cấu
  // trúc Bộ phận -> Nhân sự -> Chi tiết (tái cấu trúc 04/09/2026, thay hẳn
  // layout liệt kê phẳng cũ "Việc hoàn thành/Báo cáo cuối ca/Đơn hàng hoàn
  // thành/Vi phạm/Checklist" — dữ liệu đó giờ nằm bên trong Hồ Sơ của từng
  // người, không mất đi, chỉ đổi chỗ hiển thị).
  const [reportTab, setReportTab] = useState<'today' | 'history'>('today');

  // Danh sách nhân sự (gộp Bộ phận -> Nhân sự) — dùng chung cho cả 2 tab,
  // chỉ khác nguồn dữ liệu nạp vào (1 ngày hay cả khoảng). LAZY: chỉ tải khi
  // bấm mở sheet/đổi tab/đổi ngày — không thêm gánh nặng cho loadAll() lúc
  // mở Dashboard (đang là 18 truy vấn).
  const [staffDayDate, setStaffDayDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [staffDayList, setStaffDayList] = useState<any[] | null>(null);
  const [staffDayLoading, setStaffDayLoading] = useState(false);
  const [staffDayError, setStaffDayError] = useState('');
  const [staffDayKeyword, setStaffDayKeyword] = useState('');
  const [khoiBaoCaoMo, setKhoiBaoCaoMo] = useState<string | null>(null);
  const [staffDayPicked, setStaffDayPicked] = useState<any | null>(null);
  const [staffDayDetail, setStaffDayDetail] = useState<any | null>(null);
  const [staffDayDetailLoading, setStaffDayDetailLoading] = useState(false);

  const [reportHistoryFrom, setReportHistoryFrom] = useState(() => { const d = new Date(); d.setDate(d.getDate() - 6); return d.toISOString().slice(0, 10); });
  const [reportHistoryTo, setReportHistoryTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [reportHistoryLoading, setReportHistoryLoading] = useState(false);
  const [reportHistoryError, setReportHistoryError] = useState('');

  const loadStaffDayList = async (ngay: string) => {
    setStaffDayLoading(true); setStaffDayError('');
    try {
      setStaffDayList(await fetchDanhSachNhanSuNgay(ngay));
    } catch (e: any) {
      setStaffDayError(e.message || 'Không tải được danh sách nhân sự.');
      setStaffDayList([]);
    } finally { setStaffDayLoading(false); }
  };

  const loadStaffDayListKhoang = async (tu: string, den: string) => {
    if (!tu || !den) return;
    setStaffDayLoading(true); setStaffDayError('');
    try {
      setStaffDayList(await fetchDanhSachNhanSuKhoangNgay(tu, den));
    } catch (e: any) {
      setStaffDayError(e.message || 'Không tải được danh sách nhân sự.');
      setStaffDayList([]);
    } finally { setStaffDayLoading(false); }
  };

  const openStaffDay = async (nv: any) => {
    setStaffDayPicked(nv); setStaffDayDetail(null); setStaffDayDetailLoading(true);
    try {
      const tham = reportTab === 'history'
        ? { staffId: nv.id, station: nv.station, tuNgay: reportHistoryFrom, denNgay: reportHistoryTo }
        : { staffId: nv.id, station: nv.station, ngay: staffDayDate };
      setStaffDayDetail(await fetchHoSoNgayNhanSu(tham));
    } catch {
      setStaffDayDetail(null);
    } finally { setStaffDayDetailLoading(false); }
  };

  // Nhóm 1 danh sách (việc hoàn thành HOẶC báo cáo cuối ca) theo bộ phận —
  // dùng ĐÚNG boPhanCuaHoSo() của màn Chấm công, để luồng ở đây khớp với
  // luồng "Bakery / Xưởng 41 / Xưởng 42 / Vận tải" toàn hệ thống đang dùng.
  const groupByBoPhan = (rows: any[], hoSoOf: (r: any) => any) => {
    const groups: Record<string, any[]> = {};
    rows.forEach((r) => {
      const bp = boPhanCuaHoSo(hoSoOf(r)) || '_khac';
      if (!groups[bp]) groups[bp] = [];
      groups[bp].push(r);
    });
    return groups;
  };
  const tenBoPhan = (key: string) => (key === '_khac' ? 'Khác' : (TEN_BO_PHAN as any)[key] || key);

  // ── Dữ liệu thật: lịch phân ca tuần toàn công ty (shift_schedule, 5 khu vực) ──
  const [weeklySchedule, setWeeklySchedule] = useState<{ from: string; to: string; days: any[]; totalAssignments: number }>({ from: '', to: '', days: [], totalAssignments: 0 });

  const loadAll = async () => {
    setLoading(true);
    setLoadError('');
    try {
      const [rev, duTinh, claims, status, staffOptions, orders, posts, advances, leaves, reports, schedule, editRequests, overtimes, completedTasks, taskExemptions, orderWorkTasks, violations, checklist] = await Promise.all([
        fetchRevenueByChannel(),
        fetchDoanhThuDuTinh(),
        fetchExpenseAndAdvanceLedgerToday(),
        fetchTodayStaffStatus(),
        fetchAssignableStaff(),
        listOrdersV2(),
        fetchRecentFeedPosts(),
        fetchPendingSalaryAdvances(),
        fetchPendingLeaveRequests(),
        fetchTodayShiftReports(),
        fetchWeeklyScheduleAllStations(),
        fetchPendingOrderEditRequests(),
        fetchPendingOvertimeRequests(),
        fetchCompletedTasksReport(),
        fetchPendingTaskExemptions(),
        fetchCompletedOrderWorkReport(),
        fetchTodayViolationsReport(),
        fetchTodayChecklistReport(),
      ]);

      setRevenueStreams(rev.channels.map((c) => ({ id: c.key, channel: c.title, amount: c.amount, percentage: c.percentage, icon: c.icon, note: `${c.count} đơn hoàn thành`, orders: c.orders })));
      setTotalRevenue(rev.total);
      setDuTinhBuckets(duTinh.buckets);
      setDuTinhTotal(duTinh.total);

      setExpenseStreams(claims.map(mapLedgerRow));
      setTotalExpense(claims.reduce((s: number, c: any) => s + (Number(c.amount) || 0), 0));

      const mapCommon = (p: any) => ({ id: p.id, name: p.full_name, role: p.role || 'Nhân viên', zone: p.station || 'Chưa gán khu vực', station: p.station || null, avatar: '👤' });
      setStaffList([
        ...status.working.map((p: any) => ({ ...mapCommon(p), status: 'working', checkinTime: p.checkinTime, checkinDate: p.checkinDate, shift: p.shiftLabel || 'Ca hôm nay', note: 'Đúng giờ' })),
        ...status.late.map((p: any) => ({ ...mapCommon(p), status: 'late', checkinTime: p.checkinTime, checkinDate: p.checkinDate, lateMinutes: p.lateMinutes, reason: p.reason || 'Không ghi lý do', shift: p.shiftLabel || 'Ca hôm nay', shiftLogId: p.shiftLogId })),
        ...status.off.map((p: any) => ({ ...mapCommon(p), status: 'off', leaveType: 'Nghỉ ca', reason: p.reason || 'Không ghi lý do', approvedBy: 'Đã ghi nhận trong hệ thống' })),
      ]);
      setStaffCounts({ total: status.total, working: status.working.length, late: status.late.length, off: status.off.length });
      setAssignableStaff(staffOptions);

      setAllOrders(sortOrdersByPriority(orders));
      loadOrderHearts(orders);
      setFeedPosts(posts);
      setPendingAdvances(advances);
      setPendingLeaves(leaves);
      setPendingEditRequests(editRequests);
      setPendingOvertimes(overtimes);
      setCompletedTasksToday(completedTasks);
      setPendingTaskExemptions(taskExemptions);
      setShiftReports(reports);
      setOrderWorkTasksToday(orderWorkTasks);
      setViolationsToday(violations);
      setChecklistToday(checklist);
      setWeeklySchedule(schedule);
    } catch (e: any) {
      setLoadError(e.message || 'Không tải được dữ liệu thật, thử lại sau.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadAll(); }, []);

  // ── Dữ liệu thật: bảng tin công ty (company_feed_posts) ──
  const [feedPosts, setFeedPosts] = useState<any[]>([]);
  const [inputComment, setInputComment] = useState('');
  const [sendingComment, setSendingComment] = useState(false);
  const comments = feedPosts.map((p: any) => ({
    id: p.id,
    author: p.author_name,
    time: new Date(p.created_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) + ' · ' + new Date(p.created_at).toLocaleDateString('vi-VN'),
    text: p.body,
  }));

  // ── Dữ liệu thật: đơn hàng (order_operations_list qua listOrdersV2) ──
  const [allOrders, setAllOrders] = useState<any[]>([]);
  // ── Thả tim đơn hàng (đánh dấu đã xem) — order_id -> [{staff_id, staff_name}] ──
  const [orderHearts, setOrderHearts] = useState<Record<string, any[]>>({});
  const [heartingId, setHeartingId] = useState<string | null>(null);

  const loadOrderHearts = async (orders: any[]) => {
    try {
      const ids = (orders || []).map((o: any) => o.id).filter(Boolean);
      setOrderHearts(await fetchOrderHearts(ids));
    } catch {
      /* không chặn màn hình chính nếu lỗi tải lượt thả tim */
    }
  };

  const handleHeartOrder = async (e: React.MouseEvent, orderId: string) => {
    e.stopPropagation();
    if (heartingId || !profile?.id) return;
    const already = (orderHearts[orderId] || []).some((h: any) => h.staff_id === profile.id);
    if (already) return;
    setHeartingId(orderId);
    // Optimistic: hiện tim ngay, không chờ round-trip.
    setOrderHearts((prev) => ({
      ...prev,
      [orderId]: [...(prev[orderId] || []), { staff_id: profile.id, staff_name: profile.full_name || 'Bạn' }],
    }));
    try {
      await addOrderHeart(orderId);
    } catch {
      // Thất bại thì gỡ lại lượt tim vừa thêm lạc quan.
      setOrderHearts((prev) => ({ ...prev, [orderId]: (prev[orderId] || []).filter((h: any) => h.staff_id !== profile.id) }));
    } finally {
      setHeartingId(null);
    }
  };

  const orderCounts = useMemo(() => summarizeOrderCounts(allOrders), [allOrders]);

  // Lọc theo ngày/tuần/tháng CHỈ cho 2 ô "Tổng đơn hàng" và "Giao thành công"
  // (theo yêu cầu Hồ Hoàng Diễm) — KHÔNG đụng orderCounts gốc, vì orderCounts
  // còn được dùng ở nơi khác (số "Tất cả" trong drawer đơn hàng, số cạnh tiêu
  // đề) — những chỗ đó vẫn cần là tổng lifetime, không phải theo kỳ đang chọn.
  const [orderStatsPeriod, setOrderStatsPeriod] = useState<'all' | 'today' | '7d' | 'month' | 'custom'>('all');
  const [orderStatsCustomFrom, setOrderStatsCustomFrom] = useState('');
  const [orderStatsCustomTo, setOrderStatsCustomTo] = useState('');
  const orderStatsRange = useMemo(() => {
    if (orderStatsPeriod === 'all') return null;
    return periodRange(orderStatsPeriod, orderStatsCustomFrom, orderStatsCustomTo);
  }, [orderStatsPeriod, orderStatsCustomFrom, orderStatsCustomTo]);
  const inRange = (ts: any) => {
    if (!ts || !orderStatsRange) return false;
    const d = new Date(ts);
    if (orderStatsRange.from && d < orderStatsRange.from) return false;
    if (orderStatsRange.to && d > orderStatsRange.to) return false;
    return true;
  };
  const statsTotal = useMemo(() => {
    if (!orderStatsRange) return orderCounts.total;
    return allOrders.filter((o: any) => inRange(o.created_at)).length;
  }, [allOrders, orderStatsRange, orderCounts.total]);
  const statsCompleted = useMemo(() => {
    if (!orderStatsRange) return orderCounts.completed;
    return allOrders.filter((o: any) => inRange(o.delivery_completed_at || o.completed_at)).length;
  }, [allOrders, orderStatsRange, orderCounts.completed]);

  // Lọc và sắp xếp đơn hàng theo thứ tự ưu tiên giảm dần từ trên xuống
  const filteredOrders = useMemo(() => {
    let list = allOrders;
    if (selectedOrderFilter === 'overdue') {
      list = allOrders.filter((o: any) => o.is_overdue);
    } else if (selectedOrderFilter !== 'all') {
      const statusMap: Record<string, string[]> = {
        awaiting_assignment: ['awaiting_assignment', 'awaiting_acceptance'],
        in_production: ['in_production'],
        ready_for_fulfillment: ['ready_for_fulfillment'],
        in_delivery: ['in_delivery'],
        completed: ['completed'],
      };
      const wanted = statusMap[selectedOrderFilter] || [selectedOrderFilter];
      list = allOrders.filter((o: any) => wanted.includes(o.status_v2) && (selectedOrderFilter === 'completed' || !o.is_overdue));
    }
    if (selectedOrderFlowTab !== 'all') {
      list = list.filter((o: any) => o.order_type === selectedOrderFlowTab);
    }
    return list;
  }, [allOrders, selectedOrderFilter, selectedOrderFlowTab]);

  // Ô tìm kiếm trong sheet "Danh Sách Đơn Hàng" — lọc thêm theo mã đơn / tên
  // khách hàng trên nền filteredOrders ở trên (yêu cầu 01/09/2026: "thêm mục
  // tìm kiếm đơn hàng để giúp Quản lý dễ dàng thao tác hơn").
  const visibleOrders = useMemo(() => {
    const q = stripDiacritics(orderSearchQuery.trim());
    if (!q) return filteredOrders;
    return filteredOrders.filter((o: any) =>
      stripDiacritics(o.order_code).includes(q) || stripDiacritics(o.customer_name).includes(q)
    );
  }, [filteredOrders, orderSearchQuery]);

  // Mở Drawer lọc đơn theo từng ô — luôn reset tab luồng + ô tìm kiếm về mặc
  // định mỗi lần mở lại sheet, tránh mang bộ lọc cũ từ lần xem trước.
  const handleOpenOrderDrawer = (filterKey: string = 'all') => {
    setSelectedOrderFilter(filterKey);
    setSelectedOrderFlowTab('all');
    setOrderSearchQuery('');
    setActiveSheet('order_drawer');
  };

  // Tab "Lịch sử" của sheet Doanh Thu — Doanh thu THUẦN trong khoảng Từ ngày/
  // Đến ngày tự chọn. Dùng lại đúng fetchRevenueByChannel({from,to}) của tab
  // "Hôm nay" (đã hỗ trợ sẵn from/to), không viết truy vấn doanh thu thứ hai.
  const loadRevenueHistory = async () => {
    if (!historyFrom || !historyTo) return;
    setHistoryLoading(true); setHistoryError('');
    try {
      const rev = await fetchRevenueByChannel({
        from: `${historyFrom}T00:00:00`,
        to: `${historyTo}T23:59:59.999`,
      });
      setHistoryChannels(rev.channels.map((c: any) => ({ id: c.key, channel: c.title, amount: c.amount, percentage: c.percentage, icon: c.icon, note: `${c.count} đơn hoàn thành`, orders: c.orders })));
      setHistoryTotal(rev.total);
    } catch (e: any) {
      setHistoryError(e.message || 'Không tải được lịch sử doanh thu.');
    } finally {
      setHistoryLoading(false);
    }
  };

  // ── Duyệt/Từ chối khoản chi hoặc tạm ứng lương từ Sổ Cái — ghi thật vào
  // expense_claims hoặc salary_advance_requests tuỳ nguồn của dòng đó ──
  const handleReviewExpense = async (id: string, approve: boolean, source: 'expense' | 'advance' = 'expense') => {
    // Cập nhật lạc quan: đổi trạng thái dòng này trên màn hình NGAY khi bấm,
    // không chờ round-trip RPC — bấm Duyệt/Từ chối cảm giác tức thì. Nếu RPC
    // lỗi thì phục hồi lại đúng danh sách trước đó (snapshot) và báo lỗi.
    const snapshot = expenseStreams;
    setExpenseStreams((prev: any[]) => prev.map((e) => (
      e.id === id ? { ...e, status: approve ? 'pending_accounting' : 'rejected', category: approve ? '✓ Đã duyệt · chờ ghi sổ' : '✕ Đã từ chối' } : e
    )));
    try {
      if (source === 'advance') await reviewSalaryAdvance(id, approve);
      else await reviewExpenseClaim(id, approve);
      playConfirmSound();
      showToast(approve ? '✓ Sếp đã DUYỆT khoản chi' : '✕ Sếp đã từ chối khoản chi');
      const claims = await fetchExpenseAndAdvanceLedgerToday();
      setExpenseStreams(claims.map(mapLedgerRow));
      setTotalExpense(claims.reduce((s: number, c: any) => s + (Number(c.amount) || 0), 0));
      if (source === 'advance') setPendingAdvances(await fetchPendingSalaryAdvances());
    } catch (e: any) {
      setExpenseStreams(snapshot);
      showToast(`⚠️ ${e.message || 'Không thao tác được'}`);
    }
  };

  // ── Duyệt/Từ chối tạm ứng lương — ghi thật vào salary_advance_requests ──
  const handleReviewAdvance = async (id: string, approve: boolean) => {
    try {
      await reviewSalaryAdvance(id, approve);
      playConfirmSound();
      showToast(approve ? '✓ Sếp đã DUYỆT tạm ứng' : '✕ Sếp đã từ chối tạm ứng');
      setPendingAdvances(await fetchPendingSalaryAdvances());
    } catch (e: any) {
      showToast(`⚠️ ${e.message || 'Không thao tác được'}`);
    }
  };

  // ── Duyệt/Từ chối đơn nghỉ phép — ghi thật vào approval_requests ──
  const handleReviewLeave = async (id: string, approve: boolean) => {
    try {
      await reviewLeaveRequest(id, approve);
      playConfirmSound();
      showToast(approve ? '✓ Sếp đã ĐỒNG Ý đơn nghỉ phép' : '✕ Sếp đã từ chối đơn nghỉ phép');
      setPendingLeaves(await fetchPendingLeaveRequests());
    } catch (e: any) {
      showToast(`⚠️ ${e.message || 'Không thao tác được'}`);
    }
  };

  // ── Duyệt/Từ chối yêu cầu miễn trừ công việc — gộp từ màn "Yêu Cầu Duyệt"
  // cũ (ApprovalRequestsScreen) vào đây, vẫn dùng đúng exemptTask() + RPC ──
  const handleReviewTaskExemption = async (id: string, approve: boolean, taskId: string) => {
    try {
      await reviewTaskExemption(id, approve, taskId);
      playConfirmSound();
      showToast(approve ? '✓ Sếp đã ĐỒNG Ý miễn trừ công việc' : '✕ Sếp đã từ chối miễn trừ');
      setPendingTaskExemptions(await fetchPendingTaskExemptions());
    } catch (e: any) {
      showToast(`⚠️ ${e.message || 'Không thao tác được'}`);
    }
  };

  // ── Duyệt/Từ chối yêu cầu sửa đơn — cùng RPC approve_order_edit_request
  // mà EditApprovalPanel.jsx đang dùng (đã hoạt động, không viết lại) ──
  const handleReviewEditRequest = async (id: string, approve: boolean) => {
    setApprovalBusy(id);
    try {
      await reviewOrderEditRequest(id, approve, profile?.id, profile?.full_name || profile?.email);
      playConfirmSound();
      showToast(approve ? '✓ Sếp đã DUYỆT yêu cầu sửa đơn' : '✕ Sếp đã từ chối yêu cầu sửa đơn');
      setPendingEditRequests(await fetchPendingOrderEditRequests());
    } catch (e: any) {
      showToast(`⚠️ ${e.message || 'Không thao tác được'}`);
    } finally {
      setApprovalBusy(null);
    }
  };

  // ── Duyệt/Từ chối yêu cầu tăng ca — ghi thật vào overtime_requests ──
  const handleReviewOvertime = async (id: string, approve: boolean) => {
    setApprovalBusy(id);
    try {
      await reviewOvertimeRequest(id, approve, profile?.id);
      playConfirmSound();
      showToast(approve ? '✓ Sếp đã DUYỆT tăng ca' : '✕ Sếp đã từ chối tăng ca');
      setPendingOvertimes(await fetchPendingOvertimeRequests());
    } catch (e: any) {
      showToast(`⚠️ ${e.message || 'Không thao tác được'}`);
    } finally {
      setApprovalBusy(null);
    }
  };

  // ── Nhắc nhở / Bỏ qua phạt trễ — ghi thật qua RPC director-only ──
  const handleRemindStaff = async (staffId: string, name: string) => {
    try {
      await remindStaff(staffId, `Sếp nhắc ${name} chú ý giờ giấc đi làm.`);
      showToast(`💬 Đã gửi tin nhắn nhắc nhở đến ${name}`);
    } catch (e: any) {
      showToast(`⚠️ ${e.message || 'Không gửi được'}`);
    }
  };

  const handleWaivePenalty = async (shiftLogId: string, name: string) => {
    try {
      await waiveLatePenalty(shiftLogId);
      showToast(`✓ Đã miễn trừ phạt trễ cho ${name}`);
      const status = await fetchTodayStaffStatus();
      const mapCommon = (p: any) => ({ id: p.id, name: p.full_name, role: p.role || 'Nhân viên', zone: p.station || 'Chưa gán khu vực', station: p.station || null, avatar: '👤' });
      setStaffList([
        ...status.working.map((p: any) => ({ ...mapCommon(p), status: 'working', checkinTime: p.checkinTime, checkinDate: p.checkinDate, shift: p.shiftLabel || 'Ca hôm nay', note: 'Đúng giờ' })),
        ...status.late.map((p: any) => ({ ...mapCommon(p), status: 'late', checkinTime: p.checkinTime, checkinDate: p.checkinDate, lateMinutes: p.lateMinutes, reason: p.reason || 'Không ghi lý do', shift: p.shiftLabel || 'Ca hôm nay', shiftLogId: p.shiftLogId })),
        ...status.off.map((p: any) => ({ ...mapCommon(p), status: 'off', leaveType: 'Nghỉ ca', reason: p.reason || 'Không ghi lý do', approvedBy: 'Đã ghi nhận trong hệ thống' })),
      ]);
      setStaffCounts({ total: status.total, working: status.working.length, late: status.late.length, off: status.off.length });
    } catch (e: any) {
      showToast(`⚠️ ${e.message || 'Không thao tác được'}`);
    }
  };

  // ── Toast Alert ──
  const [toast, setToast] = useState('');
  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2800);
  };

  // ── Gửi Bình Luận Tag Tên — ghi thật vào company_feed_posts ──
  const handleSendComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputComment.trim() || !profile?.id) return;
    setSendingComment(true);
    try {
      await postCompanyAnnouncement({ authorId: profile.id, authorName: profile.full_name, body: inputComment.trim() });
      setInputComment('');
      const posts = await fetchRecentFeedPosts();
      setFeedPosts(posts);
      showToast('💬 Đã phát thông báo chỉ đạo công khai đến toàn thể nhân viên!');
    } catch (err: any) {
      showToast(`⚠️ ${err.message || 'Không gửi được, thử lại sau.'}`);
    } finally {
      setSendingComment(false);
    }
  };

  // Render nội dung có highlight tag @Name
  const renderFormattedText = (text: string) => {
    const parts = text.split(/(@[a-zA-Z0-9_À-ỹ]+)/g);
    return parts.map((part, index) => {
      if (part.startsWith('@')) {
        return (
          <span
            key={index}
            style={{
              background: '#fef3c7',
              color: '#b45309',
              fontWeight: 900,
              padding: '1px 6px',
              borderRadius: 6,
              border: '1px solid #fcd34d',
              margin: '0 2px'
            }}
          >
            {part}
          </span>
        );
      }
      return part;
    });
  };

  if (!profile) {
    return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8a7a66', fontSize: 13 }}>Chưa đăng nhập.</div>;
  }

  // Tổng mọi thứ đang chờ Sếp duyệt, gom về 1 con số — thay cho ô "Tổng Nhân
  // Sự" trên banner KPI chính (yêu cầu 01/09/2026: đưa Yêu Cầu Duyệt lên giao
  // diện chính, gộp luôn 2 ô Tạm ứng/Xin nghỉ trong lưới tiện ích vào đây).
  const expensePendingCount = expenseStreams.filter((e: any) => e.status === 'pending_director').length;
  const approvalCount = pendingEditRequests.length + pendingOvertimes.length + pendingAdvances.length + pendingLeaves.length + expensePendingCount + pendingTaskExemptions.length;

  return (
    <>
    <div style={{
      maxWidth: 480,
      margin: '0 auto',
      minHeight: '100vh',
      backgroundColor: '#faf6f0',
      position: 'relative',
      overflowX: 'hidden',
      display: 'flex',
      flexDirection: 'column',
      boxSizing: 'border-box',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      color: '#2d1c10'
    }}>
      {loadError && (
        <div style={{ margin: '8px 8px 0', background: '#fee2e2', color: '#dc2626', fontSize: 12, fontWeight: 700, padding: '8px 12px', borderRadius: 10, cursor: 'pointer' }} onClick={loadAll}>
          ⚠️ {loadError} — bấm để tải lại
        </div>
      )}

      {/* Top Header Tag */}
        <div style={{
          padding: '6px 14px 10px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid #eadcca'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{
              width: 34,
              height: 34,
              borderRadius: 10,
              background: 'linear-gradient(135deg, #c28c4e 0%, #8b5900 100%)',
              color: '#fff',
              display: 'grid',
              placeItems: 'center',
              boxShadow: '0 2px 6px rgba(194, 140, 78, 0.4)'
            }}>
              <Crown size={18} />
            </div>
            <div>
              <div style={{ fontSize: 10.5, fontWeight: 900, color: '#a08060', letterSpacing: '.06em', textTransform: 'uppercase' }}>
                SUMI BAKERY
              </div>
              <h1 style={{ fontSize: 16, fontWeight: 900, margin: 0, color: '#2d1c10' }}>
                Tổng Giám Đốc (Sếp {profile?.full_name || '...'})
              </h1>
            </div>
          </div>
          <button
            onClick={() => onNavigate?.('inbox')}
            aria-label="Thông báo"
            style={{
              position: 'relative',
              width: 40,
              height: 40,
              borderRadius: 12,
              border: '1.5px solid #eadcca',
              background: '#fff',
              display: 'grid',
              placeItems: 'center',
              cursor: 'pointer',
              flexShrink: 0
            }}
          >
            <Bell size={20} color="#2d1c10" />
            {unreadCount > 0 && (
              <span style={{
                position: 'absolute', top: -4, right: -4, minWidth: 18, height: 18, padding: '0 4px',
                borderRadius: 999, background: '#dc2626', color: '#fff', fontSize: 10.5, fontWeight: 900,
                display: 'grid', placeItems: 'center', border: '1.5px solid #fff'
              }}>
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>
        </div>

        {/* ── SCROLLABLE DASHBOARD BODY ── */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: '12px 14px 90px',
          boxSizing: 'border-box'
        }}>

          {/* ========================================================================= */}
          {/* 1. BANNER KPI "DOANH THU & CHI TIÊU" (2 KHỐI TÀI CHÍNH SONG SONG) */}
          {/* ========================================================================= */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
            {/* Khối 1: Tổng Doanh Thu */}
            <div
              onClick={() => setActiveSheet('revenue_detail')}
              style={{
                background: '#ffffff',
                border: '2px solid #bbf7d0',
                borderRadius: 20,
                padding: '12px 10px',
                cursor: 'pointer',
                boxShadow: '0 4px 12px rgba(22, 101, 52, 0.08)',
                transition: 'all 0.2s ease',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 11, fontWeight: 900, color: '#166534', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <TrendingUp size={14} /> DOANH THU
                </span>
                <span style={{ fontSize: 10, background: '#dcfce7', color: '#15803d', fontWeight: 900, padding: '2px 6px', borderRadius: 6 }}>
                  +18.4%
                </span>
              </div>

              <div style={{ fontSize: 18, fontWeight: 900, color: '#15803d', margin: '4px 0 2px' }}>
                {formatVND(totalRevenue)}
              </div>

              <div style={{ fontSize: 10.5, fontWeight: 800, color: '#725f50', display: 'flex', alignItems: 'center', gap: 2 }}>
                Nguồn thu hôm nay <ChevronRight size={12} />
              </div>
            </div>

            {/* Khối 2: Tổng Chi Tiêu */}
            <div
              onClick={() => setActiveSheet('expense_detail')}
              style={{
                background: '#ffffff',
                border: '2px solid #fecaca',
                borderRadius: 20,
                padding: '12px 10px',
                cursor: 'pointer',
                boxShadow: '0 4px 12px rgba(220, 38, 38, 0.08)',
                transition: 'all 0.2s ease',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 11, fontWeight: 900, color: '#991b1b', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <TrendingDown size={14} /> TỔNG CHI
                </span>
                <span style={{ fontSize: 10, background: '#fee2e2', color: '#dc2626', fontWeight: 900, padding: '2px 6px', borderRadius: 6 }}>
                  Sổ cái
                </span>
              </div>

              <div style={{ fontSize: 18, fontWeight: 900, color: '#dc2626', margin: '4px 0 2px' }}>
                {formatVND(totalExpense)}
              </div>

              <div style={{ fontSize: 10.5, fontWeight: 800, color: '#725f50', display: 'flex', alignItems: 'center', gap: 2 }}>
                Sổ cái khoản chi <ChevronRight size={12} />
              </div>
            </div>
          </div>

          {/* ========================================================================= */}
          {/* 2. KHỐI THỐNG KÊ NHÂN SỰ & CHẤM CÔNG (GRID 2 CỘT) */}
          {/* ========================================================================= */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
            {/* Thẻ 1: Yêu Cầu Duyệt — gom mọi việc cần Sếp duyệt (sửa đơn, tăng ca,
                tạm ứng, xin nghỉ, chi) làm 1 điểm vào duy nhất, thay cho ô
                "Tổng Nhân Sự" cũ (chỉ số tĩnh, ít việc phải làm ngay). */}
            <div
              onClick={() => setActiveSheet('approval_center')}
              style={{
                background: approvalCount > 0 ? '#fff7ed' : '#fff',
                border: approvalCount > 0 ? '1.5px solid #fdba74' : '1.5px solid #eadcca',
                borderRadius: 18,
                padding: 12,
                cursor: 'pointer',
                boxShadow: '0 2px 8px rgba(0,0,0,0.04)'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 11, fontWeight: 900, color: '#725f50', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <ClipboardList size={14} color="#b45309" /> YÊU CẦU DUYỆT
                </span>
                {approvalCount > 0 ? (
                  <span style={{ minWidth: 20, height: 20, borderRadius: 10, background: '#dc2626', color: '#fff', fontSize: 11, fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 5px' }}>
                    {approvalCount}
                  </span>
                ) : (
                  <ChevronRight size={12} style={{ color: '#a08060' }} />
                )}
              </div>

              <div style={{ fontSize: 20, fontWeight: 900, color: approvalCount > 0 ? '#c2410c' : '#2d1c10' }}>
                {approvalCount} <span style={{ fontSize: 12, fontWeight: 800, color: '#725f50' }}>việc chờ</span>
              </div>

              <div style={{ marginTop: 4, fontSize: 11, fontWeight: 800, color: '#725f50' }}>
                {approvalCount > 0 ? 'Sửa đơn · Tăng ca · Tạm ứng · Nghỉ phép · Chi' : 'Không có việc nào đang chờ'}
              </div>
            </div>

            {/* Thẻ 2: Trạng thái làm việc (45 Đang làm, 3 Trễ, 2 Nghỉ) — liên kết
                sang "Tổng Quan Nhân Sự Hôm Nay", tái dùng cấu trúc chi tiết của
                Chấm công cá nhân (nhóm theo bộ phận, giữ nguyên đánh giá Sao). */}
            <div
              onClick={() => setActiveSheet('staff_overview_v2')}
              style={{
                background: '#fff',
                border: '1.5px solid #eadcca',
                borderRadius: 18,
                padding: 12,
                cursor: 'pointer',
                boxShadow: '0 2px 8px rgba(0,0,0,0.04)'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 11, fontWeight: 900, color: '#15803d', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Clock size={14} /> ĐANG LÀM VIỆC
                </span>
                <span style={{ width: 8, height: 8, background: '#22c55e', borderRadius: '50%', boxShadow: '0 0 0 2px rgba(34,197,94,0.3)' }} />
              </div>

              <div style={{ fontSize: 20, fontWeight: 900, color: '#15803d' }}>
                {staffCounts.working + staffCounts.late}/{staffCounts.total} <span style={{ fontSize: 12, fontWeight: 800, color: '#725f50' }}>đã chấm công</span>
              </div>

              {/* Tóm tắt 3 luồng trực quan */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4, fontSize: 10.5, fontWeight: 800 }}>
                <span style={{ color: '#15803d', background: '#dcfce7', padding: '1px 5px', borderRadius: 4 }}>🟢 {staffCounts.working} Làm</span>
                <span style={{ color: '#b45309', background: '#fef3c7', padding: '1px 5px', borderRadius: 4 }}>⏰ {staffCounts.late} Trễ</span>
                <span style={{ color: '#dc2626', background: '#fee2e2', padding: '1px 5px', borderRadius: 4 }}>🔴 {staffCounts.off} Nghỉ</span>
              </div>
            </div>
          </div>

          {/* ========================================================================= */}
          {/* 3. KHỐI "TÔI (QUẢN TRỊ & TIỆN ÍCH ĐIỀU HÀNH SẾP)" — LƯỚI Ô GẠCH */}
          {/* ========================================================================= */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, padding: '0 2px' }}>
            <span style={{ fontSize: 13, fontWeight: 900, color: '#2d1c10', display: 'flex', alignItems: 'center', gap: 6 }}>
              👤 TÔI (QUẢN TRỊ & TIỆN ÍCH ĐIỀU HÀNH)
            </span>
            <span style={{ fontSize: 11, fontWeight: 800, color: '#c28c4e' }}>6 mục điều hành</span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
            {/* Ô 1: Giao việc — chuyển hẳn sang trang "Giao việc" (TasksScreen)
                thật, không còn form nhập liệu tại chỗ trùng lặp trong dashboard. */}
            <div
              onClick={() => window.dispatchEvent(new CustomEvent('sumi-navigate', { detail: { tab: 'tasks' } }))}
              style={{
                background: '#ffffff',
                border: '1.5px solid #eadcca',
                borderRadius: 18,
                padding: '12px 14px',
                cursor: 'pointer',
                boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                minHeight: 88,
                boxSizing: 'border-box'
              }}
            >
              <div>
                <Zap size={22} color="#b87a48" strokeWidth={1.6} />
              </div>
              <div style={{ marginTop: 6 }}>
                <div style={{ fontSize: 13.5, fontWeight: 800, color: '#2d1c10' }}>1. Giao việc</div>
                <div style={{ fontSize: 11, color: '#725f50', marginTop: 1 }}>Giao việc 30+ NV</div>
              </div>
            </div>

            {/* Ô 2: Bảng tin & Chỉ đạo tag tên */}
            <div
              onClick={() => setActiveSheet('feed_sheet')}
              style={{
                background: '#ffffff',
                border: '1.5px solid #eadcca',
                borderRadius: 18,
                padding: '12px 14px',
                cursor: 'pointer',
                boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                minHeight: 88,
                boxSizing: 'border-box'
              }}
            >
              <div>
                <Megaphone size={22} color="#b87a48" strokeWidth={1.6} />
              </div>
              <div style={{ marginTop: 6 }}>
                <div style={{ fontSize: 13.5, fontWeight: 800, color: '#2d1c10' }}>2. Bảng tin</div>
                <div style={{ fontSize: 11, color: '#725f50', marginTop: 1 }}>Chỉ đạo & Tag @Tên</div>
              </div>
            </div>

            {/* Ô 3: Báo cáo ca ngày (Tạm ứng/Xin nghỉ đã gom vào ô "Yêu Cầu Duyệt"
                trên banner KPI chính — không còn là ô riêng ở đây nữa). */}
            <div
              onClick={() => setActiveSheet('report_sheet')}
              style={{
                background: '#ffffff',
                border: '1.5px solid #eadcca',
                borderRadius: 18,
                padding: '12px 14px',
                cursor: 'pointer',
                boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                minHeight: 88,
                boxSizing: 'border-box'
              }}
            >
              <div>
                <ClipboardList size={22} color="#b87a48" strokeWidth={1.6} />
              </div>
              <div style={{ marginTop: 6 }}>
                <div style={{ fontSize: 13.5, fontWeight: 800, color: '#2d1c10' }}>3. Báo cáo ngày</div>
                <div style={{ fontSize: 11, color: '#725f50', marginTop: 1 }}>{completedTasksToday.length} việc xong · {shiftReports.length} báo cáo ca</div>
              </div>
            </div>

            {/* Ô 6: Lịch phân ca */}
            <div
              onClick={() => setActiveSheet('schedule_sheet')}
              style={{
                background: '#ffffff',
                border: '1.5px solid #eadcca',
                borderRadius: 18,
                padding: '12px 14px',
                cursor: 'pointer',
                boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                minHeight: 88,
                boxSizing: 'border-box'
              }}
            >
              <div>
                <Calendar size={22} color="#b87a48" strokeWidth={1.6} />
              </div>
              <div style={{ marginTop: 6 }}>
                <div style={{ fontSize: 13.5, fontWeight: 800, color: '#2d1c10' }}>4. Lịch làm</div>
                <div style={{ fontSize: 11, color: '#725f50', marginTop: 1 }}>{weeklySchedule.totalAssignments} lượt phân ca tuần này</div>
              </div>
            </div>

            {/* Ô 7: Kho Thành Phẩm — mở FinishedGoodsInventoryV2 thật (đã có sẵn từ
                phân hệ Đơn hàng: tồn kho realtime, hạn dùng, phân luồng, nút "‹"
                quay lại riêng), không tự dựng lại bản khác ở đây. */}
            <div
              onClick={() => setActiveSheet('warehouse_sheet')}
              style={{
                background: '#ffffff',
                border: '1.5px solid #eadcca',
                borderRadius: 18,
                padding: '12px 14px',
                cursor: 'pointer',
                boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                minHeight: 88,
                boxSizing: 'border-box'
              }}
            >
              <div>
                <Package size={22} color="#b87a48" strokeWidth={1.6} />
              </div>
              <div style={{ marginTop: 6 }}>
                <div style={{ fontSize: 13.5, fontWeight: 800, color: '#2d1c10' }}>5. Kho Thành Phẩm</div>
                <div style={{ fontSize: 11, color: '#725f50', marginTop: 1 }}>Tồn kho, hạn dùng, nhập kho</div>
              </div>
            </div>

            {/* Ô 8: Nhân viên — mở StaffScreen thật (đã có sẵn từ Sidebar desktop):
                duyệt tài khoản chờ, sửa vai trò/khâu, khóa tài khoản. */}
            <div
              onClick={() => setActiveSheet('staff_screen_sheet')}
              style={{
                background: '#ffffff',
                border: '1.5px solid #eadcca',
                borderRadius: 18,
                padding: '12px 14px',
                cursor: 'pointer',
                boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                minHeight: 88,
                boxSizing: 'border-box'
              }}
            >
              <div>
                <Users size={22} color="#b45309" strokeWidth={1.6} />
              </div>
              <div style={{ marginTop: 6 }}>
                <div style={{ fontSize: 13.5, fontWeight: 800, color: '#2d1c10' }}>6. Nhân viên</div>
                <div style={{ fontSize: 11, color: '#725f50', marginTop: 1 }}>Duyệt tài khoản, vai trò, khâu</div>
              </div>
            </div>
          </div>

          {/* ========================================================================= */}
          {/* 4. KHỐI TÌNH TRẠNG & TIẾN ĐỘ ĐƠN HÀNG (7 Ô GẠCH CHUẨN ĐỐI CHIẾU WEB THẬT) */}
          {/* ========================================================================= */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, padding: '0 2px' }}>
            <span style={{ fontSize: 13, fontWeight: 900, color: '#2d1c10', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Receipt size={16} color="#b45309" /> TÌNH TRẠNG & TIẾN ĐỘ ĐƠN HÀNG
            </span>
            <button
              onClick={() => handleOpenOrderDrawer('all')}
              style={{ background: 'none', border: 'none', color: '#b93e13', fontSize: 12.5, fontWeight: 900, cursor: 'pointer' }}
            >
              {orderCounts.total} đơn ›
            </button>
          </div>

          {/* Bộ lọc ngày/tuần/tháng/tuỳ chọn — chỉ ảnh hưởng "Tổng đơn hàng" (theo
              ngày TẠO đơn) và "Giao thành công" (theo ngày GIAO xong thực tế) bên
              dưới, theo yêu cầu Hồ Hoàng Diễm 30/08/2026. */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            {[{ key: 'all', label: 'Tất cả' }, ...PERIOD_TABS].map((t) => (
              <button
                key={t.key}
                onClick={() => setOrderStatsPeriod(t.key as any)}
                style={{
                  fontSize: 11, fontWeight: 800, padding: '5px 10px', borderRadius: 99,
                  border: orderStatsPeriod === t.key ? '2px solid #2d1c10' : '1px solid #eadcca',
                  background: orderStatsPeriod === t.key ? '#2d1c10' : '#fff',
                  color: orderStatsPeriod === t.key ? '#fff' : '#725f50',
                  cursor: 'pointer',
                }}
              >
                {t.label}
              </button>
            ))}
            {orderStatsPeriod === 'custom' && (
              <>
                <input type="date" value={orderStatsCustomFrom} onChange={(e) => setOrderStatsCustomFrom(e.target.value)} style={{ fontSize: 11, padding: '4px 6px', borderRadius: 8, border: '1px solid #eadcca' }} />
                <span style={{ fontSize: 11, color: '#725f50' }}>→</span>
                <input type="date" value={orderStatsCustomTo} onChange={(e) => setOrderStatsCustomTo(e.target.value)} style={{ fontSize: 11, padding: '4px 6px', borderRadius: 8, border: '1px solid #eadcca' }} />
              </>
            )}
          </div>

          {/* Lưới 7 Ô Gạch Phân Loại Trực Quan */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
            {/* Ô 1: Tổng đơn hàng */}
            <div
              onClick={() => handleOpenOrderDrawer('all')}
              style={{
                background: '#ffffff',
                border: '1.5px solid #eadcca',
                borderRadius: 16,
                padding: '10px 12px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                boxShadow: '0 2px 6px rgba(0,0,0,0.03)'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <FileText size={20} color="#b87a48" strokeWidth={1.6} />
                <span style={{ fontSize: 12, fontWeight: 900, color: '#2d1c10' }}>Tổng đơn hàng</span>
              </div>
              <span style={{ fontSize: 16, fontWeight: 900, color: '#2d1c10' }}>{statsTotal}</span>
            </div>

            {/* Ô 2: Đơn chờ làm */}
            <div
              onClick={() => handleOpenOrderDrawer('awaiting_assignment')}
              style={{
                background: '#ffffff',
                border: '1.5px solid #eadcca',
                borderRadius: 16,
                padding: '10px 12px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                boxShadow: '0 2px 6px rgba(0,0,0,0.03)'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Inbox size={20} color="#b87a48" strokeWidth={1.6} />
                <span style={{ fontSize: 12, fontWeight: 900, color: '#2d1c10' }}>Đơn chờ làm</span>
              </div>
              <span style={{ fontSize: 16, fontWeight: 900, color: '#2d1c10' }}>{orderCounts.waiting}</span>
            </div>

            {/* Ô 3: Bếp đang làm */}
            <div
              onClick={() => handleOpenOrderDrawer('in_production')}
              style={{
                background: '#ffffff',
                border: '1.5px solid #eadcca',
                borderRadius: 16,
                padding: '10px 12px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                boxShadow: '0 2px 6px rgba(0,0,0,0.03)'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <ChefHat size={20} color="#b87a48" strokeWidth={1.6} />
                <span style={{ fontSize: 12, fontWeight: 900, color: '#2d1c10' }}>Bếp đang làm</span>
              </div>
              <span style={{ fontSize: 16, fontWeight: 900, color: '#d97706' }}>{orderCounts.production}</span>
            </div>

            {/* Ô 4: Chờ vận chuyển */}
            <div
              onClick={() => handleOpenOrderDrawer('ready_for_fulfillment')}
              style={{
                background: '#ffffff',
                border: '1.5px solid #eadcca',
                borderRadius: 16,
                padding: '10px 12px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                boxShadow: '0 2px 6px rgba(0,0,0,0.03)'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Package size={20} color="#b87a48" strokeWidth={1.6} />
                <span style={{ fontSize: 12, fontWeight: 900, color: '#2d1c10' }}>Chờ vận chuyển</span>
              </div>
              <span style={{ fontSize: 16, fontWeight: 900, color: '#2563eb' }}>{orderCounts.ready}</span>
            </div>

            {/* Ô 5: Đang vận chuyển */}
            <div
              onClick={() => handleOpenOrderDrawer('in_delivery')}
              style={{
                background: '#ffffff',
                border: '1.5px solid #eadcca',
                borderRadius: 16,
                padding: '10px 12px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                boxShadow: '0 2px 6px rgba(0,0,0,0.03)'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Truck size={20} color="#b87a48" strokeWidth={1.6} />
                <span style={{ fontSize: 12, fontWeight: 900, color: '#2d1c10' }}>Đang vận chuyển</span>
              </div>
              <span style={{ fontSize: 16, fontWeight: 900, color: '#9333ea' }}>{orderCounts.delivery}</span>
            </div>

            {/* Ô 6: Giao thành công */}
            <div
              onClick={() => handleOpenOrderDrawer('completed')}
              style={{
                background: '#ffffff',
                border: '1.5px solid #eadcca',
                borderRadius: 16,
                padding: '10px 12px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                boxShadow: '0 2px 6px rgba(0,0,0,0.03)'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <CheckCircle2 size={20} color="#16a34a" strokeWidth={1.6} />
                <span style={{ fontSize: 12, fontWeight: 900, color: '#2d1c10' }}>Giao thành công</span>
              </div>
              <span style={{ fontSize: 16, fontWeight: 900, color: '#16a34a' }}>{statsCompleted}</span>
            </div>

            {/* Ô 7: Chưa thực hiện (Chiếm 2 cột nổi bật) */}
            <div
              onClick={() => handleOpenOrderDrawer('overdue')}
              style={{
                gridColumn: 'span 2',
                background: orderCounts.overdue > 0 ? '#fff7ed' : '#ffffff',
                border: orderCounts.overdue > 0 ? '1.5px solid #fdba74' : '1.5px solid #eadcca',
                borderRadius: 16,
                padding: '10px 12px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                boxShadow: '0 2px 6px rgba(0,0,0,0.03)'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <AlertTriangle size={20} color="#dc2626" strokeWidth={1.6} />
                <span style={{ fontSize: 12, fontWeight: 900, color: orderCounts.overdue > 0 ? '#c2410c' : '#2d1c10' }}>
                  Chưa thực hiện / Trễ hẹn
                </span>
              </div>
              <span style={{ fontSize: 16, fontWeight: 900, color: orderCounts.overdue > 0 ? '#dc2626' : '#725f50' }}>
                {orderCounts.overdue}
              </span>
            </div>
          </div>

        </div>
    </div>

    {/* Toàn bộ Bottom Sheet / Side Drawer / toast / loading skeleton được render
        qua Portal thẳng vào document.body — tránh bị kẹt trong containing block
        của div cha (position:relative, minHeight:100vh không giới hạn chiều cao),
        nguyên nhân khiến sheet "position:absolute" trôi xuống tận đáy trang thay
        vì ghim theo viewport thật của điện thoại. */}
    {createPortal(
      <>
        {/* ========================================================================= */}
        {/* ── BOTTOM SHEET: 1. CHI TIẾT DOANH THU & NGUỒN THU ── */}
        {/* ========================================================================= */}
        {activeSheet === 'revenue_detail' && (
          <div className="sheet-overlay" onClick={() => setActiveSheet(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(2px)', zIndex: 1200, display: 'flex', alignItems: 'flex-end' }}>
            <div onClick={e => e.stopPropagation()} style={sheetPanelStyle()}>
              <div {...sheetDragHandlers} style={{ flexShrink: 0, cursor: 'grab' }}>
                {SHEET_HANDLE}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 14px 8px', borderBottom: '1.5px solid #eadcca' }}>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 900, color: '#166534' }}>📊 Tổng Hợp Doanh Thu</div>
                    <div style={{ fontSize: 11, color: '#725f50' }}>
                      {revenueTab === 'today' ? `Thuần hôm nay: ${formatVND(totalRevenue)} · Dự tính: ${formatVND(duTinhTotal)}` : `Thuần trong khoảng đã chọn: ${formatVND(historyTotal)}`}
                    </div>
                  </div>
                  <button onClick={() => setActiveSheet(null)} aria-label="Quay lại" style={{ order: -1, flexShrink: 0, width: 40, height: 40, borderRadius: 12, background: '#f4efe8', border: 'none', fontSize: 20, fontWeight: 900, color: '#2d1c10', cursor: 'pointer' }}>‹</button>
                </div>

                {/* 2 module: Doanh thu hôm nay / Lịch sử */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, padding: '10px 14px 0' }}>
                  <button onClick={() => setRevenueTab('today')} style={{
                    padding: '8px 4px', borderRadius: 12, border: revenueTab === 'today' ? '2px solid #15803d' : '1px solid #eadcca',
                    background: revenueTab === 'today' ? '#f0fdf4' : '#fff', color: revenueTab === 'today' ? '#15803d' : '#725f50',
                    fontSize: 11.5, fontWeight: 900, cursor: 'pointer',
                  }}>
                    📅 Doanh thu hôm nay
                  </button>
                  <button onClick={() => { setRevenueTab('history'); if (!historyChannels.length && !historyLoading) loadRevenueHistory(); }} style={{
                    padding: '8px 4px', borderRadius: 12, border: revenueTab === 'history' ? '2px solid #15803d' : '1px solid #eadcca',
                    background: revenueTab === 'history' ? '#f0fdf4' : '#fff', color: revenueTab === 'history' ? '#15803d' : '#725f50',
                    fontSize: 11.5, fontWeight: 900, cursor: 'pointer',
                  }}>
                    🕘 Lịch sử
                  </button>
                </div>
              </div>

              <div style={sheetBodyStyle({ paddingTop: 12 })}>
                {revenueTab === 'today' ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 900, color: '#b45309', textTransform: 'uppercase', marginBottom: 8 }}>
                        🔮 Doanh thu dự tính — {formatVND(duTinhTotal)}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {duTinhBuckets.map((b: any) => (
                          <button key={b.id} onClick={() => b.orders.length && setRevenueDrill({ title: b.title, amount: b.amount, orders: b.orders })}
                            style={{ textAlign: 'left', width: '100%', background: '#fffbeb', border: '1.5px solid #fde68a', borderRadius: 14, padding: 12, cursor: b.orders.length ? 'pointer' : 'default' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span style={{ fontSize: 22 }}>{b.icon}</span>
                                <div>
                                  <div style={{ fontSize: 13, fontWeight: 900, color: '#2d1c10' }}>{b.title}</div>
                                  <div style={{ fontSize: 11, color: '#725f50', marginTop: 2 }}>{b.note} · {b.count} khoản</div>
                                </div>
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                <div style={{ fontSize: 14, fontWeight: 900, color: '#b45309' }}>{formatVND(b.amount)}</div>
                                {b.orders.length > 0 && <ChevronRight size={16} color="#a08060" />}
                              </div>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <div style={{ fontSize: 12, fontWeight: 900, color: '#166534', textTransform: 'uppercase', marginBottom: 8 }}>
                        ✅ Doanh thu thuần (đã xác minh) — {formatVND(totalRevenue)}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {revenueStreams.length === 0 && (
                          <div style={{ textAlign: 'center', padding: '16px 0', color: '#725f50', fontSize: 13 }}>Chưa có đơn nào đã xác minh thanh toán hôm nay.</div>
                        )}
                        {revenueStreams.map(rev => (
                          <button key={rev.id} onClick={() => rev.orders?.length && setRevenueDrill({ title: rev.channel, amount: rev.amount, orders: rev.orders })}
                            style={{ textAlign: 'left', width: '100%', background: '#faf6f0', border: '1.5px solid #eadcca', borderRadius: 14, padding: 12, cursor: rev.orders?.length ? 'pointer' : 'default' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span style={{ fontSize: 22 }}>{rev.icon}</span>
                                <div>
                                  <div style={{ fontSize: 13, fontWeight: 900, color: '#2d1c10' }}>{rev.channel}</div>
                                  <div style={{ fontSize: 11, color: '#725f50', marginTop: 2 }}>{rev.note}</div>
                                </div>
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                <div style={{ textAlign: 'right' }}>
                                  <div style={{ fontSize: 14, fontWeight: 900, color: '#15803d' }}>{formatVND(rev.amount)}</div>
                                  <div style={{ fontSize: 10.5, fontWeight: 800, color: '#a08060' }}>{rev.percentage} tổng thu</div>
                                </div>
                                {rev.orders?.length > 0 && <ChevronRight size={16} color="#a08060" />}
                              </div>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                      <label style={{ flex: 1, fontSize: 11, fontWeight: 800, color: '#725f50' }}>
                        Từ ngày
                        <input type="date" value={historyFrom} max={historyTo} onChange={e => setHistoryFrom(e.target.value)}
                          style={{ display: 'block', width: '100%', marginTop: 4, minHeight: 40, borderRadius: 10, border: '1px solid #eadcca', padding: '0 8px', fontSize: 13, fontFamily: 'inherit' }} />
                      </label>
                      <label style={{ flex: 1, fontSize: 11, fontWeight: 800, color: '#725f50' }}>
                        Đến ngày
                        <input type="date" value={historyTo} min={historyFrom} max={new Date().toISOString().slice(0, 10)} onChange={e => setHistoryTo(e.target.value)}
                          style={{ display: 'block', width: '100%', marginTop: 4, minHeight: 40, borderRadius: 10, border: '1px solid #eadcca', padding: '0 8px', fontSize: 13, fontFamily: 'inherit' }} />
                      </label>
                      <button onClick={loadRevenueHistory} disabled={historyLoading} style={{ minHeight: 40, padding: '0 16px', borderRadius: 10, border: 'none', background: '#15803d', color: '#fff', fontWeight: 900, fontSize: 13, cursor: 'pointer' }}>
                        {historyLoading ? '…' : 'Xem'}
                      </button>
                    </div>

                    {historyError && <div style={{ color: '#dc2626', fontSize: 12.5, fontWeight: 700 }}>⚠️ {historyError}</div>}

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {!historyLoading && historyChannels.length === 0 && (
                        <div style={{ textAlign: 'center', padding: '20px 0', color: '#725f50', fontSize: 13 }}>Không có doanh thu đã xác minh trong khoảng này.</div>
                      )}
                      {historyChannels.map((rev: any) => (
                        <button key={rev.id} onClick={() => rev.orders?.length && setRevenueDrill({ title: rev.channel, amount: rev.amount, orders: rev.orders })}
                          style={{ textAlign: 'left', width: '100%', background: '#faf6f0', border: '1.5px solid #eadcca', borderRadius: 14, padding: 12, cursor: rev.orders?.length ? 'pointer' : 'default' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span style={{ fontSize: 22 }}>{rev.icon}</span>
                              <div>
                                <div style={{ fontSize: 13, fontWeight: 900, color: '#2d1c10' }}>{rev.channel}</div>
                                <div style={{ fontSize: 11, color: '#725f50', marginTop: 2 }}>{rev.note}</div>
                              </div>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                              <div style={{ textAlign: 'right' }}>
                                <div style={{ fontSize: 14, fontWeight: 900, color: '#15803d' }}>{formatVND(rev.amount)}</div>
                                <div style={{ fontSize: 10.5, fontWeight: 800, color: '#a08060' }}>{rev.percentage} tổng thu</div>
                              </div>
                              {rev.orders?.length > 0 && <ChevronRight size={16} color="#a08060" />}
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Danh sách chi tiết đơn của 1 luồng doanh thu (dự tính hoặc thuần) —
            bấm 1 dòng mở thẳng OrderV2DetailModal qua selectedOrderId có sẵn. */}
        {revenueDrill && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 2000, background: '#fdf9f2', overflowY: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 14, borderBottom: '1.5px solid #eadcca', position: 'sticky', top: 0, background: '#fdf9f2', zIndex: 1 }}>
              <button onClick={() => setRevenueDrill(null)} aria-label="Quay lại" style={{ width: 40, height: 40, borderRadius: 12, background: '#f4efe8', border: 'none', fontSize: 20, fontWeight: 900, color: '#2d1c10', cursor: 'pointer', flexShrink: 0 }}>‹</button>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: 1, color: '#b8692f', textTransform: 'uppercase' }}>{revenueDrill.title}</div>
                <div style={{ fontSize: 15, fontWeight: 900, color: '#2d1b10' }}>{formatVND(revenueDrill.amount)} · {revenueDrill.orders.length} khoản</div>
              </div>
            </div>
            <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {revenueDrill.orders.map((o: any) => (
                <button key={o.id} onClick={() => { if (!o.isDebtCustomer) { setSelectedOrderId(o.id); setRevenueDrill(null); } }}
                  style={{ textAlign: 'left', width: '100%', background: '#fff', border: '1.5px solid #eadcca', borderRadius: 14, padding: 12, cursor: o.isDebtCustomer ? 'default' : 'pointer' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 900, color: '#2d1c10' }}>{o.orderCode || o.customerName}</div>
                      <div style={{ fontSize: 11, color: '#725f50', marginTop: 2 }}>
                        {o.orderCode ? o.customerName : 'Công nợ trường học'}{o.branch ? ` · ${o.branch}` : ''}
                      </div>
                    </div>
                    <div style={{ fontSize: 13.5, fontWeight: 900, color: '#15803d' }}>{formatVND(o.amount)}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* ── BOTTOM SHEET: 2. SỔ CÁI KHOẢN CHI THỰC TẾ ── */}
        {/* ========================================================================= */}
        {activeSheet === 'expense_detail' && (() => {
          const activeStreams = expensePeriodTab === 'history' ? expenseHistoryStreams : expenseStreams;
          const activeTotal = expensePeriodTab === 'history' ? expenseHistoryTotal : totalExpense;
          const opStreams = activeStreams.filter((e: any) => e.source !== 'advance');
          const advStreams = activeStreams.filter((e: any) => e.source === 'advance');
          const opTotal = opStreams.reduce((s: number, e: any) => s + e.amount, 0);
          const advTotal = advStreams.reduce((s: number, e: any) => s + e.amount, 0);
          const shown = activeStreams.filter((e: any) => (ledgerTab === 'advance' ? e.source === 'advance' : e.source !== 'advance'));
          return (
            <div className="sheet-overlay" onClick={() => { setActiveSheet(null); setSelectedLedgerItem(null); }} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(2px)', zIndex: 1200, display: 'flex', alignItems: 'flex-end' }}>
              <div onClick={e => e.stopPropagation()} style={sheetPanelStyle()}>
                <div {...sheetDragHandlers} style={{ flexShrink: 0, cursor: 'grab' }}>
                  {SHEET_HANDLE}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 14px 8px', borderBottom: '1.5px solid #eadcca' }}>
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 900, color: '#dc2626' }}>📑 Sổ Cái Khoản Chi</div>
                      <div style={{ fontSize: 11, color: '#725f50' }}>Tổng chi: {formatVND(activeTotal)}</div>
                    </div>
                    <button onClick={() => { setActiveSheet(null); setSelectedLedgerItem(null); }} aria-label="Quay lại" style={{ order: -1, flexShrink: 0, width: 40, height: 40, borderRadius: 12, background: '#f4efe8', border: 'none', fontSize: 20, fontWeight: 900, color: '#2d1c10', cursor: 'pointer' }}>‹</button>
                  </div>

                  {/* 2 module: Chi hôm nay / Lịch sử */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, padding: '10px 14px 0' }}>
                    <button onClick={() => setExpensePeriodTab('today')} style={{
                      padding: '8px 4px', borderRadius: 12, border: expensePeriodTab === 'today' ? '2px solid #dc2626' : '1px solid #eadcca',
                      background: expensePeriodTab === 'today' ? '#fef2f2' : '#fff', color: expensePeriodTab === 'today' ? '#dc2626' : '#725f50',
                      fontSize: 11.5, fontWeight: 900, cursor: 'pointer',
                    }}>
                      📅 Chi hôm nay
                    </button>
                    <button onClick={() => { setExpensePeriodTab('history'); if (!expenseHistoryStreams.length && !expenseHistoryLoading) loadExpenseHistory(); }} style={{
                      padding: '8px 4px', borderRadius: 12, border: expensePeriodTab === 'history' ? '2px solid #dc2626' : '1px solid #eadcca',
                      background: expensePeriodTab === 'history' ? '#fef2f2' : '#fff', color: expensePeriodTab === 'history' ? '#dc2626' : '#725f50',
                      fontSize: 11.5, fontWeight: 900, cursor: 'pointer',
                    }}>
                      🕘 Lịch sử
                    </button>
                  </div>

                  {expensePeriodTab === 'history' && (
                    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', padding: '10px 14px 0' }}>
                      <label style={{ flex: 1, fontSize: 11, fontWeight: 800, color: '#725f50' }}>
                        Từ ngày
                        <input type="date" value={expenseHistoryFrom} max={expenseHistoryTo} onChange={e => setExpenseHistoryFrom(e.target.value)}
                          style={{ display: 'block', width: '100%', marginTop: 4, minHeight: 38, borderRadius: 10, border: '1px solid #eadcca', padding: '0 8px', fontSize: 12.5, fontFamily: 'inherit' }} />
                      </label>
                      <label style={{ flex: 1, fontSize: 11, fontWeight: 800, color: '#725f50' }}>
                        Đến ngày
                        <input type="date" value={expenseHistoryTo} min={expenseHistoryFrom} max={new Date().toISOString().slice(0, 10)} onChange={e => setExpenseHistoryTo(e.target.value)}
                          style={{ display: 'block', width: '100%', marginTop: 4, minHeight: 38, borderRadius: 10, border: '1px solid #eadcca', padding: '0 8px', fontSize: 12.5, fontFamily: 'inherit' }} />
                      </label>
                      <button onClick={loadExpenseHistory} disabled={expenseHistoryLoading} style={{ minHeight: 38, padding: '0 14px', borderRadius: 10, border: 'none', background: '#dc2626', color: '#fff', fontWeight: 900, fontSize: 12.5, cursor: 'pointer' }}>
                        {expenseHistoryLoading ? '…' : 'Xem'}
                      </button>
                    </div>
                  )}

                  {/* Phân luồng: 2 khối tổng tiền + số lượng, bấm để lọc danh sách bên dưới */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, padding: '10px 14px 0' }}>
                    <button onClick={() => setLedgerTab('expense')} style={{
                      padding: '8px 4px', borderRadius: 12, border: ledgerTab === 'expense' ? '2px solid #dc2626' : '1px solid #eadcca',
                      background: ledgerTab === 'expense' ? '#fef2f2' : '#fff', color: ledgerTab === 'expense' ? '#dc2626' : '#725f50',
                      fontSize: 11.5, fontWeight: 900, cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 2,
                    }}>
                      <span>💸 Chi hoạt động ({opStreams.length})</span>
                      <span style={{ fontSize: 13, fontWeight: 900 }}>{formatVND(opTotal)}</span>
                    </button>
                    <button onClick={() => setLedgerTab('advance')} style={{
                      padding: '8px 4px', borderRadius: 12, border: ledgerTab === 'advance' ? '2px solid #b45309' : '1px solid #eadcca',
                      background: ledgerTab === 'advance' ? '#fff7ed' : '#fff', color: ledgerTab === 'advance' ? '#b45309' : '#725f50',
                      fontSize: 11.5, fontWeight: 900, cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 2,
                    }}>
                      <span>🏦 Tạm ứng ({advStreams.length})</span>
                      <span style={{ fontSize: 13, fontWeight: 900 }}>{formatVND(advTotal)}</span>
                    </button>
                  </div>
                </div>

                <div style={sheetBodyStyle({ paddingTop: 12 })}>
                  {expensePeriodTab === 'history' && expenseHistoryError && (
                    <div style={{ color: '#dc2626', fontSize: 12.5, fontWeight: 700, marginBottom: 10 }}>⚠️ {expenseHistoryError}</div>
                  )}
                  {expensePeriodTab === 'history' && expenseHistoryLoading && (
                    <div style={{ textAlign: 'center', padding: '20px 0', color: '#725f50', fontSize: 13 }}>Đang tải…</div>
                  )}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {!(expensePeriodTab === 'history' && expenseHistoryLoading) && shown.length === 0 && (
                      <div style={{ textAlign: 'center', padding: '20px 0', color: '#725f50', fontSize: 13 }}>
                        {ledgerTab === 'advance' ? 'Không có tạm ứng nào trong khoảng này.' : 'Không có khoản chi hoạt động nào trong khoảng này.'}
                      </div>
                    )}
                    {shown.map((exp: any) => (
                      <div key={exp.id} onClick={() => setSelectedLedgerItem(exp)} style={{ background: '#fff', border: '1.5px solid #fecaca', borderRadius: 14, padding: 12, cursor: 'pointer' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <UserAvatar profile={exp.claimantProfile} size={34} />
                            <div>
                              <div style={{ fontSize: 12.5, fontWeight: 900, color: '#2d1c10' }}>{exp.title}</div>
                              <div style={{ fontSize: 11, color: '#725f50', marginTop: 2 }}>{exp.claimantName} · <strong>{exp.category}</strong> · {exp.time}</div>
                            </div>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <div style={{ fontSize: 13.5, fontWeight: 900, color: '#dc2626' }}>-{formatVND(exp.amount)}</div>
                            <ChevronRight size={16} color="#a08060" />
                          </div>
                        </div>
                        {exp.status === 'pending_director' && (
                          <div style={{ display: 'flex', gap: 6, marginTop: 8 }} onClick={(e) => e.stopPropagation()}>
                            <button onClick={() => handleReviewExpense(exp.id, true, exp.source)} style={{ flex: 1, background: '#15803d', color: '#fff', border: 'none', borderRadius: 8, padding: '7px 0', fontWeight: 900, fontSize: 11.5, cursor: 'pointer' }}>
                              ✓ Duyệt Chi
                            </button>
                            <button onClick={() => handleReviewExpense(exp.id, false, exp.source)} style={{ flex: 1, background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: 8, padding: '7px 0', fontWeight: 900, fontSize: 11.5, cursor: 'pointer' }}>
                              ✕ Từ Chối
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

        {/* Lớp "thông tin cuối" của 1 khoản chi/tạm ứng — bấm 1 dòng trong Sổ
            Cái mở ra đây, nằm TRÊN sheet Sổ Cái (z-index cao hơn 1200). Đóng
            lại quay đúng về danh sách, không mất tab/trạng thái cuộn. */}
        {selectedLedgerItem && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 2000, background: '#fdf9f2', overflowY: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 14, borderBottom: '1.5px solid #eadcca', position: 'sticky', top: 0, background: '#fdf9f2', zIndex: 1 }}>
              <button onClick={() => setSelectedLedgerItem(null)} aria-label="Quay lại" style={{ width: 40, height: 40, borderRadius: 12, background: '#f4efe8', border: 'none', fontSize: 20, fontWeight: 900, color: '#2d1c10', cursor: 'pointer', flexShrink: 0 }}>‹</button>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: 1, color: '#b8692f', textTransform: 'uppercase' }}>
                  {selectedLedgerItem.source === 'advance' ? 'Chi tiết tạm ứng' : 'Chi tiết khoản chi'}
                </div>
                <div style={{ fontSize: 15, fontWeight: 900, color: '#2d1b10' }}>{selectedLedgerItem.title}</div>
              </div>
            </div>
            <div style={{ padding: '16px 14px 30px', boxSizing: 'border-box' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
                <UserAvatar profile={selectedLedgerItem.claimantProfile} size={48} />
                <div>
                  <div style={{ fontSize: 10.5, fontWeight: 800, color: '#725f50' }}>Ai chi</div>
                  <div style={{ fontSize: 14, fontWeight: 900, color: '#2d1c10' }}>{selectedLedgerItem.claimantName || 'Không rõ'}</div>
                </div>
              </div>

              <div style={{ fontFamily: 'ui-monospace, SFMono-Regular, "JetBrains Mono", Menlo, monospace', fontSize: 30, fontWeight: 900, color: '#dc2626', marginBottom: 4 }}>
                -{formatVND(selectedLedgerItem.amount)}
              </div>
              <span style={{ display: 'inline-block', marginBottom: 16, padding: '3px 9px', borderRadius: 99, fontSize: 10.5, fontWeight: 900, background: '#fef2f2', color: '#dc2626' }}>
                {selectedLedgerItem.category}
              </span>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, background: '#fff', border: '1px solid #eadcca', borderRadius: 14, padding: 14, marginBottom: 16 }}>
                <div>
                  <div style={{ fontSize: 10.5, fontWeight: 800, color: '#725f50' }}>Chi việc gì</div>
                  <div style={{ fontSize: 13, color: '#2d1c10', marginTop: 2 }}>{selectedLedgerItem.reasonText}</div>
                </div>
                <div>
                  <div style={{ fontSize: 10.5, fontWeight: 800, color: '#725f50' }}>Ngày giờ chi</div>
                  <div style={{ fontSize: 13, color: '#2d1c10', marginTop: 2 }}>{formatDateTimeVN(selectedLedgerItem.occurredAt)}</div>
                </div>
                <div>
                  <div style={{ fontSize: 10.5, fontWeight: 800, color: '#725f50' }}>Nguồn tiền chi ra</div>
                  <div style={{ fontSize: 13, color: '#2d1c10', marginTop: 2 }}>
                    {selectedLedgerItem.paymentMethod ? PAYMENT_METHOD_LABEL[selectedLedgerItem.paymentMethod] || selectedLedgerItem.paymentMethod : 'Chưa chi — đang chờ ghi sổ'}
                  </div>
                </div>
              </div>

              <div style={{ fontSize: 10.5, fontWeight: 800, color: '#725f50', textTransform: 'uppercase', marginBottom: 8 }}>Chứng từ / Hoá đơn</div>
              {selectedLedgerItem.receiptUrl ? (
                <a href={selectedLedgerItem.receiptUrl} target="_blank" rel="noreferrer">
                  <img src={selectedLedgerItem.receiptUrl} alt="Chứng từ chi tiền" style={{ width: '100%', borderRadius: 14, border: '1px solid #eadcca', display: 'block' }} />
                </a>
              ) : (
                <div style={{ textAlign: 'center', padding: '20px 0', color: '#a08060', fontSize: 12.5, background: '#fff', border: '1px dashed #eadcca', borderRadius: 14 }}>
                  Chưa có ảnh chứng từ.
                </div>
              )}
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* ── BOTTOM SHEET: 3. GIAO VIỆC NHANH (TASK DELEGATION) ── */}
        {/* ========================================================================= */}
        {/* ========================================================================= */}
        {/* ── BOTTOM SHEET: 4. BẢNG TIN CHỈ ĐẠO CÔNG KHAI & TAG TÊN ── */}
        {/* ========================================================================= */}
        {activeSheet === 'feed_sheet' && (
          <div className="sheet-overlay" onClick={() => setActiveSheet(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(2px)', zIndex: 1300, display: 'flex', alignItems: 'flex-end' }}>
            <div onClick={e => e.stopPropagation()} style={sheetPanelStyle({ height: '85vh' })}>
              <div {...sheetDragHandlers} style={{ flexShrink: 0, cursor: 'grab' }}>
                {SHEET_HANDLE}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 14px 8px', borderBottom: '1.5px solid #eadcca' }}>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 900, color: '#166534' }}>📢 Bảng Tin & Chỉ Đạo Công Khai</div>
                    <div style={{ fontSize: 11, color: '#725f50' }}>Toàn thể {staffCounts.total} nhân viên đều nhìn thấy</div>
                  </div>
                  <button onClick={() => setActiveSheet(null)} aria-label="Quay lại" style={{ order: -1, flexShrink: 0, width: 40, height: 40, borderRadius: 12, background: '#f4efe8', border: 'none', fontSize: 20, fontWeight: 900, color: '#2d1c10', cursor: 'pointer' }}>‹</button>
                </div>
              </div>

              <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', padding: '12px 14px 14px', boxSizing: 'border-box' }}>
                {/* Danh sách tin nhắn */}
                <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', WebkitOverflowScrolling: 'touch', display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
                  {comments.map(cm => (
                    <div key={cm.id} style={{ background: '#faf6f0', border: '1px solid #eadcca', borderRadius: 14, padding: '10px 12px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                        <span style={{ fontSize: 12.5, fontWeight: 900, color: '#2d1c10' }}>{cm.author}</span>
                        <span style={{ fontSize: 10.5, color: '#8c7664' }}>{cm.time}</span>
                      </div>
                      <div style={{ fontSize: 12.5, color: '#493526', lineHeight: 1.45 }}>
                        {renderFormattedText(cm.text)}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Form gửi tin nhắn */}
                <form onSubmit={handleSendComment} style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  <input
                    type="text"
                    placeholder="Gõ chỉ đạo... (VD: @Lê_Hoàng_Khoa mẻ bánh xong chưa?)"
                    value={inputComment}
                    onChange={e => setInputComment(e.target.value)}
                    style={{
                      flex: 1,
                      padding: '9px 12px',
                      borderRadius: 12,
                      border: '1.5px solid #eadcca',
                      fontSize: 12.5,
                      outline: 'none',
                      background: '#faf6f0',
                      boxSizing: 'border-box'
                    }}
                  />
                  <button
                    type="submit"
                    style={{
                      background: '#c28c4e',
                      color: '#fff',
                      border: 'none',
                      borderRadius: 12,
                      padding: '0 16px',
                      fontWeight: 900,
                      fontSize: 12.5,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4
                    }}
                  >
                    <Send size={15} />
                  </button>
                </form>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* ── BOTTOM SHEET: 5. DUYỆT TẠM ỨNG LƯƠNG ── */}
        {/* ========================================================================= */}
        {activeSheet === 'advance_sheet' && (
          <div className="sheet-overlay" onClick={() => setActiveSheet(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(2px)', zIndex: 1200, display: 'flex', alignItems: 'flex-end' }}>
            <div onClick={e => e.stopPropagation()} style={sheetPanelStyle()}>
              <div {...sheetDragHandlers} style={{ flexShrink: 0, cursor: 'grab' }}>
                {SHEET_HANDLE}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 14px 8px', borderBottom: '1.5px solid #eadcca' }}>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 900, color: '#ca8a04' }}>💵 Phê Duyệt Tạm Ứng Lương</div>
                    <div style={{ fontSize: 11, color: '#725f50' }}>{pendingAdvances.length} đơn yêu cầu đang chờ Sếp duyệt</div>
                  </div>
                  <button onClick={() => setActiveSheet(null)} aria-label="Quay lại" style={{ order: -1, flexShrink: 0, width: 40, height: 40, borderRadius: 12, background: '#f4efe8', border: 'none', fontSize: 20, fontWeight: 900, color: '#2d1c10', cursor: 'pointer' }}>‹</button>
                </div>
              </div>

              <div style={sheetBodyStyle({ paddingTop: 12 })}>
                {pendingAdvances.length === 0 && (
                  <div style={{ textAlign: 'center', padding: '20px 0', color: '#725f50', fontSize: 13 }}>Không có yêu cầu tạm ứng nào đang chờ.</div>
                )}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {pendingAdvances.map((a: any) => (
                    <div key={a.id} style={{ background: '#fefce8', border: '1.5px solid #facc15', borderRadius: 14, padding: 12 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                          <div style={{ fontSize: 13.5, fontWeight: 900, color: '#2d1c10' }}>{a.employee_name}</div>
                          <div style={{ fontSize: 11, color: '#725f50', marginTop: 2 }}>Lý do: {a.reason} · Nộp lúc {new Date(a.created_at).toLocaleString('vi-VN')}</div>
                        </div>
                        <span style={{ fontSize: 15, fontWeight: 900, color: '#b45309' }}>{formatVND(a.amount)}</span>
                      </div>
                      <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                        <button onClick={() => handleReviewAdvance(a.id, true)} style={{ flex: 1, background: '#15803d', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 0', fontWeight: 900, fontSize: 12, cursor: 'pointer' }}>
                          ✓ Duyệt Chi Tiền
                        </button>
                        <button onClick={() => handleReviewAdvance(a.id, false)} style={{ flex: 1, background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: 8, padding: '8px 0', fontWeight: 900, fontSize: 12, cursor: 'pointer' }}>
                          ✕ Từ Chối
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* ── BOTTOM SHEET: 6. DUYỆT NGHỈ PHÉP ── */}
        {/* ========================================================================= */}
        {activeSheet === 'leave_sheet' && (
          <div className="sheet-overlay" onClick={() => setActiveSheet(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(2px)', zIndex: 1200, display: 'flex', alignItems: 'flex-end' }}>
            <div onClick={e => e.stopPropagation()} style={sheetPanelStyle()}>
              <div {...sheetDragHandlers} style={{ flexShrink: 0, cursor: 'grab' }}>
                {SHEET_HANDLE}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 14px 8px', borderBottom: '1.5px solid #eadcca' }}>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 900, color: '#2563eb' }}>📝 Phê Duyệt Đơn Nghỉ Phép</div>
                    <div style={{ fontSize: 11, color: '#725f50' }}>{pendingLeaves.length} đơn đang chờ duyệt</div>
                  </div>
                  <button onClick={() => setActiveSheet(null)} aria-label="Quay lại" style={{ order: -1, flexShrink: 0, width: 40, height: 40, borderRadius: 12, background: '#f4efe8', border: 'none', fontSize: 20, fontWeight: 900, color: '#2d1c10', cursor: 'pointer' }}>‹</button>
                </div>
              </div>

              {/* Phân luồng theo vai trò người xin nghỉ (dữ liệu thật requester_role
                  trên chính đơn — không đoán/gán cứng Bakery/Macaron/Trường học vì
                  approval_requests không có cột khâu, ép vào sẽ sai dữ liệu). */}
              {(() => {
                const leaveTabs = [
                  { key: 'all', ten: 'Tất cả' },
                  ...Array.from(new Set(pendingLeaves.map((l: any) => l.requester_role || '_khac')))
                    .map((r) => ({ key: r as string, ten: r === '_khac' ? 'Chưa rõ vai trò' : r as string })),
                ];
                return leaveTabs.length > 2 ? (
                  <div style={{ display: 'flex', gap: 6, overflowX: 'auto', padding: '0 14px 8px' }}>
                    {leaveTabs.map((t) => (
                      <button key={t.key} onClick={() => setSelectedLeaveTab(t.key)} style={{
                        flex: '0 0 auto', padding: '5px 10px', borderRadius: 99, border: '1px solid #eadcca',
                        background: selectedLeaveTab === t.key ? '#2563eb' : '#fff',
                        color: selectedLeaveTab === t.key ? '#fff' : '#725f50',
                        fontSize: 11, fontWeight: 800, whiteSpace: 'nowrap', cursor: 'pointer',
                      }}>{t.ten} ({t.key === 'all' ? pendingLeaves.length : pendingLeaves.filter((l: any) => (l.requester_role || '_khac') === t.key).length})</button>
                    ))}
                  </div>
                ) : null;
              })()}

              <div style={sheetBodyStyle({ paddingTop: 12 })}>
                {(() => {
                  const dsHienThi = selectedLeaveTab === 'all' ? pendingLeaves : pendingLeaves.filter((l: any) => (l.requester_role || '_khac') === selectedLeaveTab);
                  return dsHienThi.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '20px 0', color: '#725f50', fontSize: 13 }}>Không có đơn nghỉ phép nào ở luồng này.</div>
                  ) : null;
                })()}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {(selectedLeaveTab === 'all' ? pendingLeaves : pendingLeaves.filter((l: any) => (l.requester_role || '_khac') === selectedLeaveTab)).map((l: any) => (
                    <div key={l.id} style={{ background: '#eff6ff', border: '1.5px solid #93c5fd', borderRadius: 14, padding: 12 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                          <div style={{ fontSize: 13.5, fontWeight: 900, color: '#2d1c10' }}>{l.requester_name}</div>
                          <div style={{ fontSize: 11, color: '#725f50', marginTop: 2 }}>Ngày nghỉ: <strong>{l.leave_date}</strong> {l.reason ? `· ${l.reason}` : ''}</div>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                        <button onClick={() => handleReviewLeave(l.id, true)} style={{ flex: 1, background: '#15803d', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 0', fontWeight: 900, fontSize: 12, cursor: 'pointer' }}>
                          ✓ Đồng Ý Duyệt
                        </button>
                        <button onClick={() => handleReviewLeave(l.id, false)} style={{ flex: 1, background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: 8, padding: '8px 0', fontWeight: 900, fontSize: 12, cursor: 'pointer' }}>
                          ✕ Từ Chối
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* ── BOTTOM SHEET: 7. BÁO CÁO CA NGÀY ── */}
        {/* ========================================================================= */}
        {activeSheet === 'report_sheet' && (() => {
          const boDau = (s: string) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
          const q = boDau(staffDayKeyword).trim();
          const khoiCuaNguoi = (p: any) => KHOI.find((k) => k.luong.includes(luongCuaHoSo(p)))?.ma || '_khac';
          const dsLoc = (staffDayList || []).filter((p: any) => !q || boDau(p.full_name).includes(q));
          const nhomTheoKhoi = new Map<string, any[]>();
          dsLoc.forEach((p: any) => {
            const k = khoiCuaNguoi(p);
            if (!nhomTheoKhoi.has(k)) nhomTheoKhoi.set(k, []);
            nhomTheoKhoi.get(k)!.push(p);
          });
          const dangTimKiem = q.length > 0;
          const nhanTrangThaiHomNay: Record<string, { chu: string; mau: string; nen: string }> = {
            dang_lam: { chu: '🟢 Đang làm', mau: '#15803d', nen: '#f0fdf4' },
            xong: { chu: '✅ Đã tan ca', mau: '#1d4ed8', nen: '#eff6ff' },
            nghi: { chu: '🏖 Xin nghỉ', mau: '#7c3aed', nen: '#f5f3ff' },
            chua_cham: { chu: '⚠️ Chưa chấm công', mau: '#dc2626', nen: '#fef2f2' },
          };
          const gio = (iso: string) => (iso ? new Date(iso).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '--:--');

          return (
            <div className="sheet-overlay" onClick={() => setActiveSheet(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(2px)', zIndex: 1200, display: 'flex', alignItems: 'flex-end' }}>
              <div onClick={e => e.stopPropagation()} style={sheetPanelStyle()}>
                <div {...sheetDragHandlers} style={{ flexShrink: 0, cursor: 'grab' }}>
                  {SHEET_HANDLE}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 14px 8px', borderBottom: '1.5px solid #eadcca' }}>
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 900, color: '#db2777' }}>📋 Báo Cáo Ngày</div>
                      <div style={{ fontSize: 11, color: '#725f50' }}>Bấm bộ phận → nhân sự → xem hồ sơ đầy đủ</div>
                    </div>
                    <button onClick={() => setActiveSheet(null)} aria-label="Quay lại" style={{ order: -1, flexShrink: 0, width: 40, height: 40, borderRadius: 12, background: '#f4efe8', border: 'none', fontSize: 20, fontWeight: 900, color: '#2d1c10', cursor: 'pointer' }}>‹</button>
                  </div>

                  {/* 2 module: Hôm nay / Lịch sử — CÙNG cấu trúc Bộ phận ->
                      Nhân sự -> Chi tiết, chỉ khác nguồn ngày. */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, padding: '10px 14px 0' }}>
                    <button onClick={() => { setReportTab('today'); setKhoiBaoCaoMo(null); loadStaffDayList(staffDayDate); }} style={{
                      padding: '8px 4px', borderRadius: 12, border: reportTab === 'today' ? '2px solid #db2777' : '1px solid #eadcca',
                      background: reportTab === 'today' ? '#fdf2f8' : '#fff', color: reportTab === 'today' ? '#db2777' : '#725f50',
                      fontSize: 11.5, fontWeight: 900, cursor: 'pointer',
                    }}>
                      📅 Hôm nay
                    </button>
                    <button onClick={() => { setReportTab('history'); setKhoiBaoCaoMo(null); loadStaffDayListKhoang(reportHistoryFrom, reportHistoryTo); }} style={{
                      padding: '8px 4px', borderRadius: 12, border: reportTab === 'history' ? '2px solid #db2777' : '1px solid #eadcca',
                      background: reportTab === 'history' ? '#fdf2f8' : '#fff', color: reportTab === 'history' ? '#db2777' : '#725f50',
                      fontSize: 11.5, fontWeight: 900, cursor: 'pointer',
                    }}>
                      🕘 Lịch sử
                    </button>
                  </div>

                  {reportTab === 'today' && (
                    <div style={{ padding: '10px 14px 0', display: 'flex', gap: 8 }}>
                      <input type="date" value={staffDayDate} max={new Date().toISOString().slice(0, 10)}
                        onChange={e => { setStaffDayDate(e.target.value); setKhoiBaoCaoMo(null); loadStaffDayList(e.target.value); }}
                        style={{ flex: '0 0 auto', minHeight: 38, borderRadius: 10, border: '1px solid #eadcca', padding: '0 8px', fontSize: 12.5, fontFamily: 'inherit' }} />
                      <input type="text" value={staffDayKeyword} onChange={e => setStaffDayKeyword(e.target.value)}
                        placeholder="🔍 Tìm tên nhân sự…"
                        style={{ flex: 1, minWidth: 0, minHeight: 38, borderRadius: 10, border: '1px solid #eadcca', padding: '0 10px', fontSize: 12.5, fontFamily: 'inherit' }} />
                    </div>
                  )}

                  {reportTab === 'history' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '10px 14px 0' }}>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                        <label style={{ flex: 1, fontSize: 11, fontWeight: 800, color: '#725f50' }}>
                          Từ ngày
                          <input type="date" value={reportHistoryFrom} max={reportHistoryTo} onChange={e => setReportHistoryFrom(e.target.value)}
                            style={{ display: 'block', width: '100%', marginTop: 4, minHeight: 38, borderRadius: 10, border: '1px solid #eadcca', padding: '0 8px', fontSize: 12.5, fontFamily: 'inherit' }} />
                        </label>
                        <label style={{ flex: 1, fontSize: 11, fontWeight: 800, color: '#725f50' }}>
                          Đến ngày
                          <input type="date" value={reportHistoryTo} min={reportHistoryFrom} max={new Date().toISOString().slice(0, 10)} onChange={e => setReportHistoryTo(e.target.value)}
                            style={{ display: 'block', width: '100%', marginTop: 4, minHeight: 38, borderRadius: 10, border: '1px solid #eadcca', padding: '0 8px', fontSize: 12.5, fontFamily: 'inherit' }} />
                        </label>
                        <button onClick={() => { setKhoiBaoCaoMo(null); loadStaffDayListKhoang(reportHistoryFrom, reportHistoryTo); }} disabled={staffDayLoading} style={{ minHeight: 38, padding: '0 14px', borderRadius: 10, border: 'none', background: '#db2777', color: '#fff', fontWeight: 900, fontSize: 12.5, cursor: 'pointer' }}>
                          {staffDayLoading ? '…' : 'Xem'}
                        </button>
                      </div>
                      <input type="text" value={staffDayKeyword} onChange={e => setStaffDayKeyword(e.target.value)}
                        placeholder="🔍 Tìm tên nhân sự…"
                        style={{ minHeight: 38, borderRadius: 10, border: '1px solid #eadcca', padding: '0 10px', fontSize: 12.5, fontFamily: 'inherit' }} />
                    </div>
                  )}
                </div>

                <div style={sheetBodyStyle({ paddingTop: 12 })}>
                  {staffDayError && <div style={{ color: '#dc2626', fontSize: 12.5, fontWeight: 700, marginBottom: 10 }}>⚠️ {staffDayError}</div>}
                  {staffDayLoading && <div style={{ textAlign: 'center', padding: '20px 0', color: '#725f50', fontSize: 13 }}>Đang tải…</div>}

                  {!staffDayLoading && !nhomTheoKhoi.size && (
                    <div style={{ textAlign: 'center', padding: '20px 0', color: '#725f50', fontSize: 12.5 }}>Không có nhân sự nào khớp.</div>
                  )}

                  {/* Bộ phận -> Nhân sự — mỗi khối bấm mới mở, giống mục
                      "Theo bộ phận" ở Tổng Quan Nhân Sự, để Giám đốc quen 1
                      kiểu thao tác cho cả 2 màn. Đang gõ tìm kiếm thì tự mở
                      hết các khối có người khớp, khỏi phải bấm dò từng khối. */}
                  {!staffDayLoading && KHOI.filter((k) => nhomTheoKhoi.has(k.ma)).map((k) => {
                    const nguoi = nhomTheoKhoi.get(k.ma)!;
                    const mo = dangTimKiem || khoiBaoCaoMo === k.ma;
                    return (
                      <div key={k.ma} style={{ marginBottom: 8 }}>
                        <button onClick={() => setKhoiBaoCaoMo(mo && !dangTimKiem ? null : k.ma)} style={{
                          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          padding: '10px 12px', borderRadius: 12, border: '1.5px solid #eadcca',
                          background: mo ? '#fdf2f8' : '#fff', cursor: 'pointer', font: 'inherit',
                        }}>
                          <span style={{ fontSize: 13, fontWeight: 900, color: '#2d1c10' }}>{k.icon} {k.ten} ({nguoi.length})</span>
                          <ChevronRight size={16} color="#a08060" style={{ transform: mo ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }} />
                        </button>

                        {mo && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6 }}>
                            {nguoi.map((p: any) => (
                              <button key={p.id} onClick={() => openStaffDay(p)} style={{
                                textAlign: 'left', background: '#fff', border: '1.5px solid #eadcca', borderRadius: 12,
                                padding: 10, cursor: 'pointer', font: 'inherit', display: 'flex',
                                justifyContent: 'space-between', alignItems: 'center', gap: 8,
                              }}>
                                <span style={{ minWidth: 0 }}>
                                  <span style={{ display: 'block', fontSize: 13, fontWeight: 900, color: '#2d1c10' }}>{p.full_name}</span>
                                  <span style={{ display: 'block', fontSize: 11, color: '#725f50' }}>
                                    {reportTab === 'today'
                                      ? <>{p.gioVao ? `${gio(p.gioVao)}${p.gioRa ? `–${gio(p.gioRa)}` : ''}` : 'Chưa chấm công'}{p.phutMuon > 0 ? ` · trễ ${p.phutMuon}p` : ''}</>
                                      : <>{p.soNgayCoMat} buổi có mặt{p.soNgayXinNghi ? ` · ${p.soNgayXinNghi} ngày nghỉ` : ''}{p.soLanTre ? ` · ${p.soLanTre} lần trễ` : ''}</>}
                                  </span>
                                </span>
                                {reportTab === 'today' ? (
                                  <span style={{ flexShrink: 0, fontSize: 10.5, fontWeight: 900, color: (nhanTrangThaiHomNay[p.trangThai] || nhanTrangThaiHomNay.chua_cham).mau, background: (nhanTrangThaiHomNay[p.trangThai] || nhanTrangThaiHomNay.chua_cham).nen, padding: '4px 8px', borderRadius: 8 }}>
                                    {(nhanTrangThaiHomNay[p.trangThai] || nhanTrangThaiHomNay.chua_cham).chu}
                                  </span>
                                ) : p.trangThai === 'khong_hoat_dong' ? (
                                  <span style={{ flexShrink: 0, fontSize: 10.5, fontWeight: 900, color: '#dc2626', background: '#fef2f2', padding: '4px 8px', borderRadius: 8 }}>⚠️ Không hoạt động</span>
                                ) : null}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })()}

        {/* Hồ sơ NGÀY của 1 nhân sự — mở từ tab "Theo nhân sự". Gom mọi dấu
            vết người đó để lại trong ngày để Giám đốc đối chiếu được ai thật
            sự có làm, ai không (đặc biệt là vận tải: chuyến nào, giao tới
            đâu, xong chưa). */}
        {staffDayPicked && (() => {
          const gio = (iso: string) => (iso ? new Date(iso).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '--:--');
          const hs = staffDayDetail;
          const muc = (icon: string, ten: string, so: number | string, mau: string) => (
            <div style={{ fontSize: 12, fontWeight: 900, color: mau, textTransform: 'uppercase', margin: '16px 0 8px' }}>
              {icon} {ten} ({so})
            </div>
          );
          const the = (noiDung: any, key: string, vien = '#eadcca') => (
            <div key={key} style={{ background: '#fff', border: `1.5px solid ${vien}`, borderRadius: 12, padding: 10, fontSize: 12.5, color: '#2d1c10' }}>{noiDung}</div>
          );
          // Bản BẤM ĐƯỢC của `the` — mọi mục có nguồn dữ liệu thật để mở
          // (đơn hàng, ảnh chứng từ...) PHẢI dùng bản này thay vì `the` tĩnh,
          // theo đúng yêu cầu Giám đốc: không mục nào là chữ chết cả.
          const theBam = (noiDung: any, key: string, onClick: () => void, vien = '#eadcca') => (
            <button key={key} onClick={onClick} style={{ textAlign: 'left', width: '100%', background: '#fff', border: `1.5px solid ${vien}`, borderRadius: 12, padding: 10, fontSize: 12.5, color: '#2d1c10', cursor: 'pointer', font: 'inherit', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
              <span style={{ minWidth: 0 }}>{noiDung}</span>
              <ChevronRight size={15} color="#a08060" style={{ flexShrink: 0, marginTop: 2 }} />
            </button>
          );
          return (
            <div style={{ position: 'fixed', inset: 0, zIndex: 2000, background: '#fdf9f2', overflowY: 'auto' }} onClick={() => { setStaffDayPicked(null); setStaffDayDetail(null); }}>
              <div onClick={e => e.stopPropagation()}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 14, borderBottom: '1.5px solid #eadcca', position: 'sticky', top: 0, background: '#fdf9f2', zIndex: 1 }}>
                  <button onClick={() => { setStaffDayPicked(null); setStaffDayDetail(null); }} aria-label="Quay lại" style={{ width: 40, height: 40, borderRadius: 12, background: '#f4efe8', border: 'none', fontSize: 20, fontWeight: 900, color: '#2d1c10', cursor: 'pointer', flexShrink: 0 }}>‹</button>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: 1, color: '#b8692f', textTransform: 'uppercase' }}>
                      {reportTab === 'history'
                        ? `Hồ sơ ${new Date(reportHistoryFrom).toLocaleDateString('vi-VN')} – ${new Date(reportHistoryTo).toLocaleDateString('vi-VN')}`
                        : `Hồ sơ ngày ${new Date(staffDayDate).toLocaleDateString('vi-VN')}`}
                    </div>
                    <div style={{ fontSize: 15, fontWeight: 900, color: '#2d1b10' }}>
                      {staffDayPicked.full_name}
                      <span style={{ fontSize: 11.5, fontWeight: 700, color: '#725f50' }}> · {LUONG[luongCuaHoSo(staffDayPicked)]?.ten || 'Chưa gán khâu'}</span>
                    </div>
                  </div>
                </div>

                <div style={{ padding: 16, paddingBottom: 'calc(24px + env(safe-area-inset-bottom))' }}>
                  {staffDayDetailLoading && <div style={{ textAlign: 'center', padding: '24px 0', color: '#725f50', fontSize: 13 }}>Đang tải hồ sơ ngày…</div>}
                  {!staffDayDetailLoading && !hs && <div style={{ textAlign: 'center', padding: '24px 0', color: '#dc2626', fontSize: 13 }}>Không tải được hồ sơ ngày của người này.</div>}

                  {!staffDayDetailLoading && hs && (
                    <>
                      {khongCoHoatDong(hs) && (
                        <div style={{ background: '#fef2f2', border: '1.5px solid #fecaca', borderRadius: 12, padding: 12, fontSize: 12.5, fontWeight: 800, color: '#b91c1c' }}>
                          ⚠️ Cả ngày KHÔNG ghi nhận hoạt động nào: không chấm công, không nhận việc, không nhận đơn, không có chuyến giao.
                        </div>
                      )}

                      {muc('⏱', 'Chấm công', hs.chamCong.length, '#0f766e')}
                      {hs.chamCong.length === 0
                        ? the('Không có bản ghi chấm công nào trong ngày.', 'cc-0', '#fecaca')
                        : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {hs.chamCong.map((l: any) => {
                              const noiDung = (
                                <>
                                  <b>{l.type === 'checkin' ? '🟢 Vào ca' : l.type === 'checkout' ? '🔵 Kết thúc ca' : '🏖 Xin nghỉ'}</b>
                                  {l.checkin_time ? ` · ${gio(l.checkin_time)}` : ''}
                                  {l.late_minutes > 0 ? <span style={{ color: '#dc2626', fontWeight: 800 }}> · trễ {l.late_minutes} phút</span> : ''}
                                  {l.reason ? <div style={{ fontSize: 11.5, color: '#725f50', marginTop: 3 }}>{l.reason}</div> : null}
                                  {l.photo_url ? <div style={{ fontSize: 11, color: '#1d4ed8', fontWeight: 800, marginTop: 3 }}>📷 Xem ảnh chấm công</div> : null}
                                </>
                              );
                              return l.photo_url
                                ? theBam(noiDung, `cc-${l.id}`, () => window.open(l.photo_url, '_blank'))
                                : the(noiDung, `cc-${l.id}`);
                            })}
                          </div>
                        )}

                      {hs.checklist.kieu === 'khoang' ? (
                        <>
                          {muc('✔️', 'Checklist', `${hs.checklist.luotXong}/${hs.checklist.luotApDung} lượt`, '#7c3aed')}
                          {the(<span>Tổng {hs.checklist.luotApDung} lượt áp dụng trong khoảng, đã hoàn thành {hs.checklist.luotXong} lượt ({hs.checklist.luotApDung ? Math.round((hs.checklist.luotXong / hs.checklist.luotApDung) * 100) : 0}%).</span>, 'cl-khoang')}
                        </>
                      ) : (
                        <>
                          {muc('✔️', 'Checklist', `${hs.checklist.filter((c: any) => c.xong).length}/${hs.checklist.length}`, '#7c3aed')}
                          {hs.checklist.length === 0
                            ? the('Khâu này chưa khai báo mục checklist nào.', 'cl-0')
                            : (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                                {hs.checklist.map((c: any) => the(
                                  <span style={{ color: c.xong ? '#2d1c10' : '#a08060' }}>{c.xong ? '✅' : '⬜'} {c.title}</span>,
                                  `cl-${c.id}`, c.xong ? '#ddd6fe' : '#eadcca')) }
                              </div>
                            )}
                        </>
                      )}

                      {muc('📋', 'Việc đang làm', hs.viec.dangLam.length, '#b45309')}
                      {hs.viec.dangLam.length === 0
                        ? the('Không còn việc nào đang mở.', 'vd-0')
                        : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {hs.viec.dangLam.map((t: any) => {
                              const noiDung = (
                                <>
                                  <b>{t.title}</b>
                                  <div style={{ fontSize: 11.5, color: '#725f50', marginTop: 3 }}>
                                    {t.accepted_at ? `Đã nhận ${gio(t.accepted_at)}` : 'Chưa bấm nhận việc'}
                                    {t.deadline ? ` · hạn ${new Date(t.deadline).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })}` : ''}
                                    {t.order_code ? ` · ${t.order_code}` : ''}
                                  </div>
                                </>
                              );
                              const vien = t.deadline && new Date(t.deadline) < new Date() ? '#fecaca' : '#eadcca';
                              return t.orderIdThat
                                ? theBam(noiDung, `vd-${t.id}`, () => setSelectedOrderId(t.orderIdThat), vien)
                                : the(noiDung, `vd-${t.id}`, vien);
                            })}
                          </div>
                        )}

                      {muc('✅', 'Việc xong trong ngày', hs.viec.xongTrongNgay.length, '#15803d')}
                      {hs.viec.xongTrongNgay.length === 0
                        ? the('Chưa hoàn thành việc nào trong ngày.', 'vx-0')
                        : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {hs.viec.xongTrongNgay.map((t: any) => {
                              const noiDung = <><b>{t.title}</b><span style={{ color: '#725f50' }}> · xong {gio(t.completed_at)}</span></>;
                              return t.orderIdThat
                                ? theBam(noiDung, `vx-${t.id}`, () => setSelectedOrderId(t.orderIdThat), '#bbf7d0')
                                : the(noiDung, `vx-${t.id}`, '#bbf7d0');
                            })}
                          </div>
                        )}

                      {muc('🍰', 'Đơn bếp phụ trách', hs.donBep.length, '#c2410c')}
                      {hs.donBep.length === 0
                        ? the('Không nhận đơn bếp nào.', 'db-0')
                        : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {hs.donBep.map((p: any) => theBam(
                              <>
                                <b>{p.orders?.order_code || 'Đơn không rõ mã'}</b>
                                <span style={{ color: '#725f50' }}> · {p.status === 'completed' ? 'đã xong' : p.status === 'in_progress' ? 'đang làm' : p.status}</span>
                                {p.is_collaborative ? <span style={{ color: '#7c3aed', fontWeight: 800 }}> · phối hợp</span> : null}
                                <div style={{ fontSize: 11.5, color: '#725f50', marginTop: 3 }}>
                                  {p.accepted_at ? `Nhận ${gio(p.accepted_at)}` : 'Chưa bấm nhận'}
                                  {p.completed_at ? ` · xong ${gio(p.completed_at)}` : ''}
                                </div>
                              </>, `db-${p.id}`, () => setSelectedOrderId(p.order_id))) }
                          </div>
                        )}

                      {muc('🚚', 'Chuyến giao hàng', hs.vanTai.length, '#1d4ed8')}
                      {hs.vanTai.length === 0
                        ? the('Không có chuyến giao nào trong ngày.', 'vt-0')
                        : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {hs.vanTai.map((r: any) => (
                              <div key={`vt-${r.id}`} style={{ background: '#fff', border: '1.5px solid #bfdbfe', borderRadius: 12, padding: 10 }}>
                                <div style={{ fontSize: 12.5, fontWeight: 900, color: '#2d1c10' }}>
                                  {r.run_code || 'Chuyến chưa có mã'}
                                  <span style={{ fontWeight: 700, color: '#725f50' }}>
                                    {' · '}{r.status === 'completed' ? 'đã xong' : r.status === 'in_transit' ? 'đang giao' : r.status}
                                    {r.started_at ? ` · bắt đầu ${gio(r.started_at)}` : ' · chưa bắt đầu'}
                                    {r.completed_at ? ` · kết thúc ${gio(r.completed_at)}` : ''}
                                  </span>
                                </div>
                                {r.diemDung.length === 0
                                  ? <div style={{ fontSize: 11.5, color: '#b45309', marginTop: 6 }}>Chuyến này chưa gắn điểm giao nào.</div>
                                  : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 6 }}>
                                      {r.diemDung.map((s: any) => (
                                        <button key={s.id} onClick={() => setSelectedOrderId(s.order_id)} disabled={!s.order_id} style={{
                                          textAlign: 'left', width: '100%', font: 'inherit', background: 'none', border: 'none', padding: 0,
                                          fontSize: 11.5, color: '#2d1c10', borderTop: '1px dashed #e5e7eb', paddingTop: 4,
                                          cursor: s.order_id ? 'pointer' : 'default',
                                        }}>
                                          <b>{s.sequence_no}. {s.orders?.order_code || 'Đơn không rõ mã'}</b>
                                          <span style={{ color: s.delivered_at ? '#15803d' : '#b45309', fontWeight: 800 }}>
                                            {' · '}{s.delivered_at ? `đã giao ${gio(s.delivered_at)}` : s.status === 'failed' ? 'giao hỏng' : 'chưa giao'}
                                          </span>
                                          {s.destination_address ? <div style={{ color: '#725f50' }}>{s.destination_address}</div> : null}
                                          {s.failure_reason ? <div style={{ color: '#dc2626' }}>Lý do: {s.failure_reason}</div> : null}
                                        </button>
                                      ))}
                                    </div>
                                  )}
                              </div>
                            ))}
                          </div>
                        )}

                      {muc('🏭', 'Nhập kho thành phẩm', hs.sanXuat.length, '#0891b2')}
                      {hs.sanXuat.length === 0
                        ? the('Không nhập kho thành phẩm nào trong ngày.', 'sx-0')
                        : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {hs.sanXuat.map((s: any) => {
                              const noiDung = (
                                <>
                                  <b>{s.product_name}</b>{s.size ? ` · size ${s.size}` : ''}
                                  <span style={{ color: '#0891b2', fontWeight: 900 }}> · {s.qty}</span>
                                  {s.price ? <span style={{ color: '#725f50' }}> · {(Number(s.qty) * Number(s.price)).toLocaleString('vi-VN')}đ</span> : null}
                                  {s.photo_url ? <div style={{ fontSize: 11, color: '#1d4ed8', fontWeight: 800, marginTop: 3 }}>📷 Xem ảnh thành phẩm</div> : null}
                                </>
                              );
                              return s.photo_url
                                ? theBam(noiDung, `sx-${s.id}`, () => window.open(s.photo_url, '_blank'))
                                : the(noiDung, `sx-${s.id}`);
                            })}
                          </div>
                        )}

                      {/* 🌱 GIEO HẠT — thay cho mục "Vi phạm" tĩnh cũ. Giám đốc
                          Cộng/Trừ sao trực tiếp ngay tại đây, kèm ảnh chứng từ
                          nếu có (vd ảnh vệ sinh bẩn, sản phẩm lỗi). Tái dùng
                          NGUYÊN cơ chế sumi_dieu_chinh_sao đã tự cộng vào
                          "Tổng thưởng/phạt" của nhân sự (employeeOverviewV4.js
                          fetchStarSummary) — đã liên kết KPI/thu nhập cá nhân
                          sẵn, không viết luồng tính mới. Lịch sử đầy đủ (kể cả
                          phạt tự động do đi trễ) hiện ngay dưới form, không
                          lọc theo linkType — xem được TOÀN BỘ đánh giá của
                          người này, không chỉ phần gieo từ đây. */}
                      <div style={{ fontSize: 12, fontWeight: 900, color: '#16a34a', textTransform: 'uppercase', margin: '16px 0 8px' }}>
                        🌱 Gieo hạt
                      </div>
                      {staffDayPicked.id === profile?.id ? (
                        the('Không thể tự đánh giá cho chính mình.', 'gh-minh')
                      ) : (
                        <StarRateBar staffId={staffDayPicked.id} staffName={staffDayPicked.full_name}
                          onDone={() => openStaffDay(staffDayPicked)} />
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          );
        })()}

        {/* ========================================================================= */}
        {/* ── BOTTOM SHEET: 8. LỊCH PHÂN CA LÀM VIỆC ── */}
        {/* ========================================================================= */}
        {activeSheet === 'schedule_sheet' && (
          <div className="sheet-overlay" onClick={() => setActiveSheet(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(2px)', zIndex: 1200, display: 'flex', alignItems: 'flex-end' }}>
            <div onClick={e => e.stopPropagation()} style={sheetPanelStyle()}>
              <div {...sheetDragHandlers} style={{ flexShrink: 0, cursor: 'grab' }}>
                {SHEET_HANDLE}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 14px 8px', borderBottom: '1.5px solid #eadcca' }}>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 900, color: '#9333ea' }}>📅 Lịch Phân Ca Tuần — 5 Khu Vực</div>
                    <div style={{ fontSize: 11, color: '#725f50' }}>
                      Bấm vào 1 ô để gán/gỡ nhân sự trực tiếp tại đây
                    </div>
                  </div>
                  <button onClick={() => setActiveSheet(null)} aria-label="Quay lại" style={{ order: -1, flexShrink: 0, width: 40, height: 40, borderRadius: 12, background: '#f4efe8', border: 'none', fontSize: 20, fontWeight: 900, color: '#2d1c10', cursor: 'pointer' }}>‹</button>
                </div>
                <div style={{ padding: '8px 14px 0' }}>
                  <button
                    onClick={() => {
                      setActiveSheet(null);
                      window.dispatchEvent(new CustomEvent('sumi-navigate', { detail: { tab: 'shifts', view: 'schedule' } }));
                    }}
                    style={{ width: '100%', padding: '9px 0', borderRadius: 10, border: '1px solid #9333ea', background: '#faf5ff', color: '#9333ea', fontWeight: 800, fontSize: 12.5, cursor: 'pointer' }}
                  >
                    Mở đầy đủ trong "Ca Làm Việc" →
                  </button>
                </div>
              </div>

              <div style={sheetBodyStyle({ paddingTop: 12 })}>
                <WeeklyScheduleSection profile={profile} />
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* ── SIDE DRAWER: DANH SÁCH ĐƠN HÀNG ƯU TIÊN THỜI GIAN THEO TỪNG BỘ LỌC ── */}
        {/* ========================================================================= */}
        {activeSheet === 'order_drawer' && (
          <div className="sheet-overlay" onClick={() => setActiveSheet(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(2px)', zIndex: 1300, display: 'flex', alignItems: 'flex-end' }}>
            <div onClick={e => e.stopPropagation()} style={sheetPanelStyle({ height: '86vh' })}>
              <div {...sheetDragHandlers} style={{ flexShrink: 0, cursor: 'grab' }}>
                {SHEET_HANDLE}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 14px 8px', borderBottom: '1.5px solid #eadcca' }}>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 900, color: '#2d1c10' }}>
                      🧾 Danh Sách Đơn Hàng ({visibleOrders.length} đơn)
                    </div>
                    <div style={{ fontSize: 11, color: '#dc2626', fontWeight: 800 }}>
                      ⬇️ Sắp xếp ưu tiên giảm dần từ trên xuống dưới
                    </div>
                  </div>
                  <button onClick={() => setActiveSheet(null)} aria-label="Quay lại" style={{ order: -1, flexShrink: 0, width: 40, height: 40, borderRadius: 12, background: '#f4efe8', border: 'none', fontSize: 20, fontWeight: 900, color: '#2d1c10', cursor: 'pointer' }}>‹</button>
                </div>

                {/* Tab LUỒNG — thay cho thanh lọc trạng thái con cũ (yêu cầu
                    Hồ Hoàng Diễm 01/09/2026). Trạng thái vẫn lọc được từ 7 ô
                    ngoài Dashboard, ở đây chỉ còn lọc theo luồng. */}
                <div style={{ display: 'flex', gap: 4, overflowX: 'auto', padding: '8px 14px' }}>
                <button
                  onClick={() => setSelectedOrderFlowTab('all')}
                  style={{
                    padding: '5px 10px',
                    borderRadius: 99,
                    border: '1px solid #eadcca',
                    background: selectedOrderFlowTab === 'all' ? '#2d1c10' : '#fff',
                    color: selectedOrderFlowTab === 'all' ? '#ffd284' : '#725f50',
                    fontSize: 11,
                    fontWeight: 800,
                    whiteSpace: 'nowrap',
                    cursor: 'pointer'
                  }}
                >
                  Tất cả ({filteredOrders.length})
                </button>
                {ORDER_FLOWS.map((flow) => {
                  const count = filteredOrders.filter((o: any) => o.order_type === flow.key).length;
                  const active = selectedOrderFlowTab === flow.key;
                  return (
                    <button
                      key={flow.key}
                      onClick={() => setSelectedOrderFlowTab(flow.key)}
                      style={{
                        padding: '5px 10px',
                        borderRadius: 99,
                        border: '1px solid #eadcca',
                        background: active ? '#2d1c10' : '#fff',
                        color: active ? '#ffd284' : '#725f50',
                        fontSize: 11,
                        fontWeight: 800,
                        whiteSpace: 'nowrap',
                        cursor: 'pointer'
                      }}
                    >
                      {flow.icon} {flow.title} ({count})
                    </button>
                  );
                })}
                </div>

                {/* Ô tìm kiếm đơn hàng — theo mã đơn hoặc tên khách hàng */}
                <div style={{ padding: '0 14px 8px' }}>
                  <input
                    type="text"
                    value={orderSearchQuery}
                    onChange={(e) => setOrderSearchQuery(e.target.value)}
                    placeholder="🔍 Tìm theo mã đơn hoặc tên khách hàng..."
                    style={{ width: '100%', padding: '9px 12px', borderRadius: 10, border: '1.5px solid #eadcca', fontSize: 13, boxSizing: 'border-box' }}
                  />
                </div>
              </div>

              {/* Danh sách đơn hàng ưu tiên */}
              <div style={sheetBodyStyle({ paddingTop: 8 })}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {visibleOrders.map((ord: any, idx: number) => {
                  const flow = ORDER_FLOWS.find((f) => f.key === ord.order_type);
                  const statusLabelMap: Record<string, string> = {
                    awaiting_assignment: 'Đơn chờ làm 📥', awaiting_acceptance: 'Đơn chờ làm 📥',
                    in_production: 'Bếp đang làm 👩‍🍳', ready_for_fulfillment: 'Chờ vận chuyển 📦',
                    in_delivery: 'Đang vận chuyển 🛵', completed: 'Giao thành công ✅',
                  };
                  return (
                    <div
                      key={ord.id}
                      onClick={() => setSelectedOrderId(ord.id)}
                      role="button"
                      tabIndex={0}
                      style={{
                        background: ord.is_overdue ? '#fff9f0' : '#fff',
                        border: ord.is_overdue ? '2px solid #f59e0b' : '1.5px solid #eadcca',
                        borderRadius: 14,
                        padding: 10,
                        cursor: 'pointer'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                        <span style={{ fontSize: 11, fontWeight: 900, background: ord.is_overdue ? '#fef3c7' : '#f4efe8', color: ord.is_overdue ? '#b45309' : '#725f50', padding: '2px 6px', borderRadius: 6 }}>
                          #{idx + 1} · {ord.order_code}
                        </span>
                        <span style={{ fontSize: 11, fontWeight: 900, color: ord.is_overdue ? '#dc2626' : '#725f50' }}>
                          ⏰ {ord.required_at ? new Date(ord.required_at).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }) : 'Chưa có hạn'}
                        </span>
                      </div>

                      <div style={{ fontSize: 14, fontWeight: 900, color: '#2d1c10' }}>👤 {ord.customer_name || 'Khách chưa ghi tên'}</div>
                      <div style={{ fontSize: 12, color: '#725f50', margin: '2px 0' }}>{flow ? `${flow.icon} ${flow.title}` : ord.order_type} · {ord.total_quantity} sản phẩm</div>
                      <div style={{ fontSize: 11.5, color: '#493526', margin: '2px 0' }}>• Người tạo: {ord.created_by_name || 'Không rõ'}</div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6, paddingTop: 4, borderTop: '1px solid #f2e9de' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 11, fontWeight: 800, color: ord.status_v2 === 'completed' ? '#16a34a' : ord.is_overdue ? '#dc2626' : '#138a53' }}>
                            {ord.is_overdue ? 'Chưa thực hiện ⚠️' : (statusLabelMap[ord.status_v2] || ord.status_v2)}
                          </span>
                          {(() => {
                            const hearts = orderHearts[ord.id] || [];
                            const iHearted = hearts.some((h: any) => h.staff_id === profile?.id);
                            return (
                              <button
                                onClick={(e) => handleHeartOrder(e, ord.id)}
                                disabled={iHearted}
                                style={{
                                  display: 'flex', alignItems: 'center', gap: 3, border: 'none', background: 'transparent',
                                  padding: '2px 4px', cursor: iHearted ? 'default' : 'pointer',
                                }}
                              >
                                <Heart size={14} color={iHearted ? '#e11d48' : '#a08a76'} fill={iHearted ? '#e11d48' : 'none'} />
                                {hearts.length > 0 && <span style={{ fontSize: 11, fontWeight: 800, color: '#a08a76' }}>{hearts.length}</span>}
                              </button>
                            );
                          })()}
                        </div>
                        <ChevronRight size={16} color="#a08a76" />
                      </div>

                      {(orderHearts[ord.id] || []).length > 0 && (
                        <div style={{ fontSize: 10.5, color: '#a08a76', marginTop: 3 }}>
                          ❤️ Đã xem: {(orderHearts[ord.id] || []).map((h: any) => h.staff_name).join(', ')}
                        </div>
                      )}
                    </div>
                  );
                })}

                {visibleOrders.length === 0 && (
                  <div style={{ textAlign: 'center', padding: '20px 0', color: '#725f50', fontSize: 13 }}>
                    {orderSearchQuery ? `Không tìm thấy đơn nào khớp "${orderSearchQuery}".` : 'Không có đơn hàng nào ở trạng thái này.'}
                  </div>
                )}
              </div>
              </div>
            </div>
          </div>
        )}

        {/* Lớp "thông tin cuối" của Đơn Hàng — bấm 1 đơn trong Danh Sách Đơn Hàng
            mở ra đây, nằm TRÊN mọi sheet (z-index cao hơn hẳn 1300) vì
            OrderV2DetailModal tự vẽ z-index thấp (110), không tính trước việc bị
            xếp trong 1 sheet khác. Đóng lại quay đúng về danh sách, không mất
            trạng thái lọc/cuộn của Danh Sách Đơn Hàng bên dưới. */}
        {selectedOrderId && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 2000 }}>
            <OrderV2DetailModal orderId={selectedOrderId} onClose={() => setSelectedOrderId(null)} onChanged={() => {}} />
          </div>
        )}

        {/* Ô 7: Kho Thành Phẩm — FinishedGoodsInventoryV2 tự vẽ nội dung trang
            (không phải overlay), nên bọc trong 1 lớp toàn màn hình riêng ở đây.
            Nút "‹" quay lại của chính component này đã đóng đúng lớp này. */}
        {activeSheet === 'warehouse_sheet' && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 1400, background: '#fdf9f2', overflowY: 'auto', padding: 16, boxSizing: 'border-box' }}>
            <FinishedGoodsInventoryV2 onBack={() => setActiveSheet(null)} />
          </div>
        )}

        {/* Ô 8: Nhân viên — StaffScreen không tự vẽ header/nút quay lại (khác
            FinishedGoodsInventoryV2), nên tự bọc header ở đây theo đúng mẫu
            đang dùng cho StaffProfileSheet phía trên. */}
        {activeSheet === 'staff_screen_sheet' && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 1400, background: '#fdf9f2', overflowY: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px', borderBottom: '1.5px solid #eadcca', position: 'sticky', top: 0, background: '#fdf9f2', zIndex: 1 }}>
              <button onClick={() => setActiveSheet(null)} aria-label="Quay lại" style={{ width: 40, height: 40, borderRadius: 12, background: '#f4efe8', border: 'none', fontSize: 20, fontWeight: 900, color: '#2d1c10', cursor: 'pointer', flexShrink: 0 }}>‹</button>
              <div style={{ fontSize: 15, fontWeight: 900, color: '#2d1c10' }}>👥 Nhân Viên</div>
            </div>
            <div style={{ padding: 16, boxSizing: 'border-box' }}>
              <StaffScreen />
            </div>
          </div>
        )}

        {/* Lớp "thông tin cuối" của Nhân sự — bấm 1 người trong Chi Tiết Trạng
            Thái Nhân Sự mở ra hồ sơ riêng. Đóng lại quay đúng về đúng tab
            (Đang làm/Đi trễ/Nghỉ ca) đang xem, không mất trạng thái. */}
        {selectedStaff && (
          <StaffProfileSheet staffBasic={selectedStaff} onBack={() => setSelectedStaff(null)} />
        )}

        {/* Tổng Quan Nhân Sự Hôm Nay — mở từ ô "ĐANG LÀM VIỆC", tái dùng cấu
            trúc chi tiết của Chấm công cá nhân (nhóm theo bộ phận, giữ nguyên
            đánh giá Sao +/-). */}
        {activeSheet === 'staff_overview_v2' && (
          <DirectorStaffOverviewSheet hoSo={profile} onClose={() => setActiveSheet(null)}
            onMoQuanLyCa={() => setActiveSheet('staff_screen_sheet')} />
        )}

        {/* ========================================================================= */}
        {/* ── BOTTOM SHEET: YÊU CẦU DUYỆT — gom Sửa đơn/Tăng ca/Tạm ứng/Xin nghỉ/Chi ── */}
        {/* ========================================================================= */}
        {activeSheet === 'approval_center' && (
          <div className="sheet-overlay" onClick={() => setActiveSheet(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(2px)', zIndex: 1200, display: 'flex', alignItems: 'flex-end' }}>
            <div onClick={e => e.stopPropagation()} style={sheetPanelStyle()}>
              <div {...sheetDragHandlers} style={{ flexShrink: 0, cursor: 'grab' }}>
                {SHEET_HANDLE}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 14px 8px', borderBottom: '1.5px solid #eadcca' }}>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 900, color: '#c2410c' }}>✅ Yêu Cầu Duyệt</div>
                    <div style={{ fontSize: 11, color: '#725f50' }}>
                      {approvalTab === 'pending' ? `${approvalCount} việc đang chờ Sếp xử lý` : 'Các yêu cầu đã xử lý gần đây'}
                    </div>
                  </div>
                  <button onClick={() => setActiveSheet(null)} aria-label="Quay lại" style={{ order: -1, flexShrink: 0, width: 40, height: 40, borderRadius: 12, background: '#f4efe8', border: 'none', fontSize: 20, fontWeight: 900, color: '#2d1c10', cursor: 'pointer' }}>‹</button>
                </div>

                {/* 2 module: Đang chờ / Lịch sử đã duyệt */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, padding: '10px 14px 0' }}>
                  <button onClick={() => setApprovalTab('pending')} style={{
                    padding: '8px 4px', borderRadius: 12, border: approvalTab === 'pending' ? '2px solid #c2410c' : '1px solid #eadcca',
                    background: approvalTab === 'pending' ? '#fff7ed' : '#fff', color: approvalTab === 'pending' ? '#c2410c' : '#725f50',
                    fontSize: 11.5, fontWeight: 900, cursor: 'pointer',
                  }}>
                    ⏳ Đang chờ ({approvalCount})
                  </button>
                  <button onClick={() => { setApprovalTab('history'); if (!approvalHistory && !approvalHistoryLoading) loadApprovalHistory(); }} style={{
                    padding: '8px 4px', borderRadius: 12, border: approvalTab === 'history' ? '2px solid #c2410c' : '1px solid #eadcca',
                    background: approvalTab === 'history' ? '#fff7ed' : '#fff', color: approvalTab === 'history' ? '#c2410c' : '#725f50',
                    fontSize: 11.5, fontWeight: 900, cursor: 'pointer',
                  }}>
                    🕘 Lịch sử đã duyệt
                  </button>
                </div>
              </div>

              <div style={sheetBodyStyle({ paddingTop: 12 })}>
                {approvalTab === 'pending' ? (
                  <>
                    {approvalCount === 0 && (
                      <div style={{ textAlign: 'center', padding: '24px 0', color: '#725f50', fontSize: 13 }}>🎉 Không có việc nào đang chờ duyệt.</div>
                    )}

                    {/* 1. Sửa đơn */}
                    {pendingEditRequests.length > 0 && (
                      <div style={{ marginBottom: 16 }}>
                        <div style={{ fontSize: 12, fontWeight: 900, color: '#2563eb', textTransform: 'uppercase', marginBottom: 8 }}>
                          📝 Yêu cầu sửa đơn ({pendingEditRequests.length})
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                          {pendingEditRequests.map((r: any) => (
                            <button key={r.id} onClick={() => setSelectedApprovalItem({ kind: 'edit', item: r, canReview: true })}
                              style={{ textAlign: 'left', width: '100%', background: '#eff6ff', border: '1.5px solid #bfdbfe', borderRadius: 14, padding: 12, cursor: 'pointer' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                <div style={{ minWidth: 0 }}>
                                  <div style={{ fontSize: 13.5, fontWeight: 900, color: '#2d1c10' }}>Đơn #{r.orders?.order_code || String(r.order_id).slice(0, 8)}</div>
                                  <div style={{ fontSize: 11, color: '#725f50', marginTop: 2 }}>
                                    👤 {r.requested_by_name}{r.reason ? ` · 💭 "${r.reason}"` : ''} · {new Date(r.created_at).toLocaleString('vi-VN')}
                                  </div>
                                </div>
                                <ChevronRight size={16} color="#a08060" />
                              </div>
                              <div style={{ display: 'flex', gap: 6, marginTop: 10 }} onClick={e => e.stopPropagation()}>
                                <button disabled={approvalBusy === r.id} onClick={() => handleReviewEditRequest(r.id, true)} style={{ flex: 1, background: '#15803d', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 0', fontWeight: 900, fontSize: 12, cursor: 'pointer' }}>
                                  ✓ Duyệt
                                </button>
                                <button disabled={approvalBusy === r.id} onClick={() => handleReviewEditRequest(r.id, false)} style={{ flex: 1, background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: 8, padding: '8px 0', fontWeight: 900, fontSize: 12, cursor: 'pointer' }}>
                                  ✕ Từ chối
                                </button>
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* 2. Tăng ca */}
                    {pendingOvertimes.length > 0 && (
                      <div style={{ marginBottom: 16 }}>
                        <div style={{ fontSize: 12, fontWeight: 900, color: '#7c3aed', textTransform: 'uppercase', marginBottom: 8 }}>
                          ⏱ Yêu cầu tăng ca ({pendingOvertimes.length})
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                          {pendingOvertimes.map((o: any) => (
                            <button key={o.id} onClick={() => setSelectedApprovalItem({ kind: 'overtime', item: o, canReview: true })}
                              style={{ textAlign: 'left', width: '100%', background: '#f5f3ff', border: '1.5px solid #ddd6fe', borderRadius: 14, padding: 12, cursor: 'pointer' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                <div style={{ minWidth: 0 }}>
                                  <div style={{ fontSize: 13.5, fontWeight: 900, color: '#2d1c10' }}>{o.employee?.full_name || 'Nhân viên'}</div>
                                  <div style={{ fontSize: 11, color: '#725f50', marginTop: 2 }}>
                                    {o.planned_minutes} phút · {o.reason}{o.related_order_code ? ` · ${o.related_order_code}` : ''} · Ngày {new Date(o.work_date).toLocaleDateString('vi-VN')}
                                  </div>
                                </div>
                                <ChevronRight size={16} color="#a08060" />
                              </div>
                              <div style={{ display: 'flex', gap: 6, marginTop: 10 }} onClick={e => e.stopPropagation()}>
                                <button disabled={approvalBusy === o.id} onClick={() => handleReviewOvertime(o.id, true)} style={{ flex: 1, background: '#15803d', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 0', fontWeight: 900, fontSize: 12, cursor: 'pointer' }}>
                                  ✓ Duyệt
                                </button>
                                <button disabled={approvalBusy === o.id} onClick={() => handleReviewOvertime(o.id, false)} style={{ flex: 1, background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: 8, padding: '8px 0', fontWeight: 900, fontSize: 12, cursor: 'pointer' }}>
                                  ✕ Từ chối
                                </button>
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* 3. Tạm ứng — gom từ ô tiện ích cũ */}
                    {pendingAdvances.length > 0 && (
                      <div style={{ marginBottom: 16 }}>
                        <div style={{ fontSize: 12, fontWeight: 900, color: '#ca8a04', textTransform: 'uppercase', marginBottom: 8 }}>
                          💵 Yêu cầu tạm ứng ({pendingAdvances.length})
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                          {pendingAdvances.map((a: any) => (
                            <button key={a.id} onClick={() => setSelectedApprovalItem({ kind: 'advance', item: a, canReview: true })}
                              style={{ textAlign: 'left', width: '100%', background: '#fefce8', border: '1.5px solid #facc15', borderRadius: 14, padding: 12, cursor: 'pointer' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                <div style={{ minWidth: 0 }}>
                                  <div style={{ fontSize: 13.5, fontWeight: 900, color: '#2d1c10' }}>{a.employee_name}</div>
                                  <div style={{ fontSize: 11, color: '#725f50', marginTop: 2 }}>Lý do: {a.reason} · Nộp lúc {new Date(a.created_at).toLocaleString('vi-VN')}</div>
                                </div>
                                <span style={{ fontSize: 15, fontWeight: 900, color: '#b45309', whiteSpace: 'nowrap' }}>{formatVND(a.amount)}</span>
                              </div>
                              <div style={{ display: 'flex', gap: 6, marginTop: 10 }} onClick={e => e.stopPropagation()}>
                                <button onClick={() => handleReviewAdvance(a.id, true)} style={{ flex: 1, background: '#15803d', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 0', fontWeight: 900, fontSize: 12, cursor: 'pointer' }}>
                                  ✓ Duyệt Chi Tiền
                                </button>
                                <button onClick={() => handleReviewAdvance(a.id, false)} style={{ flex: 1, background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: 8, padding: '8px 0', fontWeight: 900, fontSize: 12, cursor: 'pointer' }}>
                                  ✕ Từ Chối
                                </button>
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* 4. Xin nghỉ — gom từ ô tiện ích cũ */}
                    {pendingLeaves.length > 0 && (
                      <div style={{ marginBottom: 16 }}>
                        <div style={{ fontSize: 12, fontWeight: 900, color: '#0f766e', textTransform: 'uppercase', marginBottom: 8 }}>
                          🏖 Đơn xin nghỉ ({pendingLeaves.length})
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                          {pendingLeaves.map((l: any) => (
                            <button key={l.id} onClick={() => setSelectedApprovalItem({ kind: 'leave', item: l, canReview: true })}
                              style={{ textAlign: 'left', width: '100%', background: '#f0fdfa', border: '1.5px solid #99f6e4', borderRadius: 14, padding: 12, cursor: 'pointer' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                <div style={{ minWidth: 0 }}>
                                  <div style={{ fontSize: 13.5, fontWeight: 900, color: '#2d1c10' }}>{l.requester_name}</div>
                                  <div style={{ fontSize: 11, color: '#725f50', marginTop: 2 }}>
                                    {l.reason}{l.leave_date ? ` · Ngày ${new Date(l.leave_date).toLocaleDateString('vi-VN')}` : ''}
                                  </div>
                                </div>
                                <ChevronRight size={16} color="#a08060" />
                              </div>
                              <div style={{ display: 'flex', gap: 6, marginTop: 10 }} onClick={e => e.stopPropagation()}>
                                <button onClick={() => handleReviewLeave(l.id, true)} style={{ flex: 1, background: '#15803d', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 0', fontWeight: 900, fontSize: 12, cursor: 'pointer' }}>
                                  ✓ Đồng Ý
                                </button>
                                <button onClick={() => handleReviewLeave(l.id, false)} style={{ flex: 1, background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: 8, padding: '8px 0', fontWeight: 900, fontSize: 12, cursor: 'pointer' }}>
                                  ✕ Từ Chối
                                </button>
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Miễn trừ công việc — gộp từ màn "Yêu Cầu Duyệt" cũ (ApprovalRequestsScreen) */}
                    {pendingTaskExemptions.length > 0 && (
                      <div style={{ marginBottom: 16 }}>
                        <div style={{ fontSize: 12, fontWeight: 900, color: '#0891b2', textTransform: 'uppercase', marginBottom: 8 }}>
                          🙅 Miễn trừ công việc ({pendingTaskExemptions.length})
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                          {pendingTaskExemptions.map((r: any) => (
                            <button key={r.id} onClick={() => setSelectedApprovalItem({ kind: 'exemption', item: r, canReview: true })}
                              style={{ textAlign: 'left', width: '100%', background: '#ecfeff', border: '1.5px solid #a5f3fc', borderRadius: 14, padding: 12, cursor: 'pointer' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                <div style={{ minWidth: 0 }}>
                                  <div style={{ fontSize: 13.5, fontWeight: 900, color: '#2d1c10' }}>{r.requester_name || 'Nhân viên'}</div>
                                  <div style={{ fontSize: 11, color: '#725f50', marginTop: 2 }}>
                                    {r.reason ? `💭 "${r.reason}"` : 'Không ghi lý do'} · {new Date(r.created_at).toLocaleString('vi-VN')}
                                  </div>
                                </div>
                                <ChevronRight size={16} color="#a08060" />
                              </div>
                              <div style={{ display: 'flex', gap: 6, marginTop: 10 }} onClick={e => e.stopPropagation()}>
                                <button disabled={approvalBusy === r.id} onClick={() => handleReviewTaskExemption(r.id, true, r.task_id)} style={{ flex: 1, background: '#15803d', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 0', fontWeight: 900, fontSize: 12, cursor: 'pointer' }}>
                                  ✓ Đồng Ý
                                </button>
                                <button disabled={approvalBusy === r.id} onClick={() => handleReviewTaskExemption(r.id, false, r.task_id)} style={{ flex: 1, background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: 8, padding: '8px 0', fontWeight: 900, fontSize: 12, cursor: 'pointer' }}>
                                  ✕ Từ chối
                                </button>
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* 5. Duyệt Chi — mở sang Sổ Cái Khoản Chi có sẵn (giữ nguyên luồng duyệt Chi cũ) */}
                    {expensePendingCount > 0 && (
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 900, color: '#dc2626', textTransform: 'uppercase', marginBottom: 8 }}>
                          💸 Yêu cầu duyệt Chi ({expensePendingCount})
                        </div>
                        <button
                          onClick={() => { setActiveSheet('expense_detail'); setLedgerTab('expense'); }}
                          style={{ width: '100%', textAlign: 'left', background: '#fef2f2', border: '1.5px solid #fecaca', borderRadius: 14, padding: 12, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                        >
                          <span style={{ fontSize: 13, fontWeight: 800, color: '#2d1c10' }}>Xem &amp; duyệt {expensePendingCount} khoản chi đang chờ</span>
                          <ChevronRight size={16} color="#a08060" />
                        </button>
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    {approvalHistoryLoading && (
                      <div style={{ textAlign: 'center', padding: '20px 0', color: '#725f50', fontSize: 13 }}>Đang tải…</div>
                    )}
                    {!approvalHistoryLoading && approvalHistory && (
                      <>
                        {(approvalHistory.editRequests.length + approvalHistory.overtimes.length + approvalHistory.advances.length + approvalHistory.leaves.length + approvalHistory.expenses.length + approvalHistory.taskExemptions.length) === 0 && (
                          <div style={{ textAlign: 'center', padding: '24px 0', color: '#725f50', fontSize: 13 }}>Chưa có yêu cầu nào đã xử lý.</div>
                        )}

                        {approvalHistory.editRequests.length > 0 && (
                          <div style={{ marginBottom: 16 }}>
                            <div style={{ fontSize: 12, fontWeight: 900, color: '#2563eb', textTransform: 'uppercase', marginBottom: 8 }}>📝 Sửa đơn</div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                              {approvalHistory.editRequests.map((r: any) => (
                                <button key={r.id} onClick={() => setSelectedApprovalItem({ kind: 'edit', item: r, canReview: false })}
                                  style={{ textAlign: 'left', width: '100%', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 14, padding: 12, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <div style={{ minWidth: 0 }}>
                                    <div style={{ fontSize: 13, fontWeight: 800, color: '#2d1c10' }}>Đơn #{r.orders?.order_code || String(r.order_id).slice(0, 8)}</div>
                                    <div style={{ fontSize: 11, color: '#725f50', marginTop: 2 }}>{r.requested_by_name} · {new Date(r.created_at).toLocaleDateString('vi-VN')}</div>
                                  </div>
                                  <span style={{ fontSize: 11, fontWeight: 900, color: r.status === 'approved' ? '#15803d' : '#dc2626', whiteSpace: 'nowrap' }}>
                                    {r.status === 'approved' ? '✓ Đã duyệt' : '✕ Từ chối'}
                                  </span>
                                </button>
                              ))}
                            </div>
                          </div>
                        )}

                        {approvalHistory.overtimes.length > 0 && (
                          <div style={{ marginBottom: 16 }}>
                            <div style={{ fontSize: 12, fontWeight: 900, color: '#7c3aed', textTransform: 'uppercase', marginBottom: 8 }}>⏱ Tăng ca</div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                              {approvalHistory.overtimes.map((o: any) => (
                                <button key={o.id} onClick={() => setSelectedApprovalItem({ kind: 'overtime', item: o, canReview: false })}
                                  style={{ textAlign: 'left', width: '100%', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 14, padding: 12, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <div style={{ minWidth: 0 }}>
                                    <div style={{ fontSize: 13, fontWeight: 800, color: '#2d1c10' }}>{o.employee?.full_name || 'Nhân viên'}</div>
                                    <div style={{ fontSize: 11, color: '#725f50', marginTop: 2 }}>{o.planned_minutes} phút · {new Date(o.work_date).toLocaleDateString('vi-VN')}</div>
                                  </div>
                                  <span style={{ fontSize: 11, fontWeight: 900, color: o.status === 'approved' ? '#15803d' : '#dc2626', whiteSpace: 'nowrap' }}>
                                    {o.status === 'approved' ? '✓ Đã duyệt' : '✕ Từ chối'}
                                  </span>
                                </button>
                              ))}
                            </div>
                          </div>
                        )}

                        {approvalHistory.advances.length > 0 && (
                          <div style={{ marginBottom: 16 }}>
                            <div style={{ fontSize: 12, fontWeight: 900, color: '#ca8a04', textTransform: 'uppercase', marginBottom: 8 }}>💵 Tạm ứng</div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                              {approvalHistory.advances.map((a: any) => (
                                <button key={a.id} onClick={() => setSelectedApprovalItem({ kind: 'advance', item: a, canReview: false })}
                                  style={{ textAlign: 'left', width: '100%', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 14, padding: 12, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <div style={{ minWidth: 0 }}>
                                    <div style={{ fontSize: 13, fontWeight: 800, color: '#2d1c10' }}>{a.employee_name} · {formatVND(a.amount)}</div>
                                    <div style={{ fontSize: 11, color: '#725f50', marginTop: 2 }}>{new Date(a.created_at).toLocaleDateString('vi-VN')}</div>
                                  </div>
                                  <span style={{ fontSize: 11, fontWeight: 900, color: a.status === 'rejected' ? '#dc2626' : '#15803d', whiteSpace: 'nowrap' }}>
                                    {a.status === 'rejected' ? '✕ Từ chối' : a.status === 'paid' ? '✓ Đã chi' : '✓ Đã duyệt'}
                                  </span>
                                </button>
                              ))}
                            </div>
                          </div>
                        )}

                        {approvalHistory.leaves.length > 0 && (
                          <div style={{ marginBottom: 16 }}>
                            <div style={{ fontSize: 12, fontWeight: 900, color: '#0f766e', textTransform: 'uppercase', marginBottom: 8 }}>🏖 Xin nghỉ</div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                              {approvalHistory.leaves.map((l: any) => (
                                <button key={l.id} onClick={() => setSelectedApprovalItem({ kind: 'leave', item: l, canReview: false })}
                                  style={{ textAlign: 'left', width: '100%', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 14, padding: 12, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <div style={{ minWidth: 0 }}>
                                    <div style={{ fontSize: 13, fontWeight: 800, color: '#2d1c10' }}>{l.requester_name}</div>
                                    <div style={{ fontSize: 11, color: '#725f50', marginTop: 2 }}>{new Date(l.created_at).toLocaleDateString('vi-VN')}</div>
                                  </div>
                                  <span style={{ fontSize: 11, fontWeight: 900, color: l.status === 'approved' ? '#15803d' : '#dc2626', whiteSpace: 'nowrap' }}>
                                    {l.status === 'approved' ? '✓ Đã duyệt' : '✕ Từ chối'}
                                  </span>
                                </button>
                              ))}
                            </div>
                          </div>
                        )}

                        {approvalHistory.taskExemptions.length > 0 && (
                          <div style={{ marginBottom: 16 }}>
                            <div style={{ fontSize: 12, fontWeight: 900, color: '#0891b2', textTransform: 'uppercase', marginBottom: 8 }}>🙅 Miễn trừ công việc</div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                              {approvalHistory.taskExemptions.map((r: any) => (
                                <button key={r.id} onClick={() => setSelectedApprovalItem({ kind: 'exemption', item: r, canReview: false })}
                                  style={{ textAlign: 'left', width: '100%', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 14, padding: 12, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <div style={{ minWidth: 0 }}>
                                    <div style={{ fontSize: 13, fontWeight: 800, color: '#2d1c10' }}>{r.requester_name || 'Nhân viên'}</div>
                                    <div style={{ fontSize: 11, color: '#725f50', marginTop: 2 }}>{new Date(r.created_at).toLocaleDateString('vi-VN')}</div>
                                  </div>
                                  <span style={{ fontSize: 11, fontWeight: 900, color: r.status === 'approved' ? '#15803d' : '#dc2626', whiteSpace: 'nowrap' }}>
                                    {r.status === 'approved' ? '✓ Đã duyệt' : '✕ Từ chối'}
                                  </span>
                                </button>
                              ))}
                            </div>
                          </div>
                        )}

                        {approvalHistory.expenses.length > 0 && (
                          <div>
                            <div style={{ fontSize: 12, fontWeight: 900, color: '#dc2626', textTransform: 'uppercase', marginBottom: 8 }}>💸 Duyệt Chi</div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                              {approvalHistory.expenses.map((e: any) => (
                                <button key={e.id} onClick={() => setSelectedApprovalItem({ kind: 'expense', item: e, canReview: false })}
                                  style={{ textAlign: 'left', width: '100%', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 14, padding: 12, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <div style={{ minWidth: 0 }}>
                                    <div style={{ fontSize: 13, fontWeight: 800, color: '#2d1c10' }}>{e.claimant_name} · {formatVND(e.amount)}</div>
                                    <div style={{ fontSize: 11, color: '#725f50', marginTop: 2 }}>{e.description} · {new Date(e.created_at).toLocaleDateString('vi-VN')}</div>
                                  </div>
                                  <span style={{ fontSize: 11, fontWeight: 900, color: e.status === 'rejected' ? '#dc2626' : '#15803d', whiteSpace: 'nowrap' }}>
                                    {e.status === 'rejected' ? '✕ Từ chối' : e.status === 'recorded' ? '✓ Đã ghi sổ' : '✓ Đã duyệt'}
                                  </span>
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Chi tiết 1 yêu cầu duyệt — bấm bất kỳ dòng nào (đang chờ hoặc lịch
            sử) đều mở ra đây, biết rõ nội dung yêu cầu là gì trước khi quyết
            định. Vẫn còn Duyệt/Từ chối nếu `canReview` (đang chờ xử lý). */}
        {selectedApprovalItem && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 2000, background: '#fdf9f2', overflowY: 'auto' }} onClick={() => setSelectedApprovalItem(null)}>
            <div onClick={e => e.stopPropagation()}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 14, borderBottom: '1.5px solid #eadcca', position: 'sticky', top: 0, background: '#fdf9f2', zIndex: 1 }}>
                <button onClick={() => setSelectedApprovalItem(null)} aria-label="Quay lại" style={{ width: 40, height: 40, borderRadius: 12, background: '#f4efe8', border: 'none', fontSize: 20, fontWeight: 900, color: '#2d1c10', cursor: 'pointer', flexShrink: 0 }}>‹</button>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: 1, color: '#b8692f', textTransform: 'uppercase' }}>
                    {{ edit: 'Yêu cầu sửa đơn', overtime: 'Yêu cầu tăng ca', advance: 'Yêu cầu tạm ứng', leave: 'Đơn xin nghỉ', expense: 'Khoản chi', exemption: 'Miễn trừ công việc' }[selectedApprovalItem.kind]}
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 900, color: '#2d1b10' }}>Chi tiết yêu cầu</div>
                </div>
              </div>

              <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
                {selectedApprovalItem.kind === 'edit' && (() => {
                  const r = selectedApprovalItem.item;
                  return (
                    <>
                      <DetailRow label="Đơn hàng" value={`#${r.orders?.order_code || String(r.order_id).slice(0, 8)}`} />
                      <DetailRow label="Người yêu cầu" value={r.requested_by_name} />
                      <DetailRow label="Lý do" value={r.reason || '—'} />
                      <DetailRow label="Nộp lúc" value={new Date(r.created_at).toLocaleString('vi-VN')} />
                      {r.approved_by_name && <DetailRow label={r.status === 'approved' ? 'Đã duyệt bởi' : 'Xử lý bởi'} value={`${r.approved_by_name}${r.approved_at ? ' · ' + new Date(r.approved_at).toLocaleString('vi-VN') : ''}`} />}
                      <DetailRow label="Trạng thái" value={r.status === 'pending' ? 'Đang chờ' : r.status === 'approved' ? '✓ Đã duyệt' : '✕ Từ chối'} />
                    </>
                  );
                })()}

                {selectedApprovalItem.kind === 'overtime' && (() => {
                  const o = selectedApprovalItem.item;
                  return (
                    <>
                      <DetailRow label="Nhân viên" value={o.employee?.full_name || 'Nhân viên'} />
                      <DetailRow label="Vị trí" value={o.employee?.station || o.employee?.role || '—'} />
                      <DetailRow label="Thời gian dự kiến" value={`${o.planned_minutes} phút`} />
                      <DetailRow label="Lý do" value={o.reason || '—'} />
                      {o.related_order_code && <DetailRow label="Mã đơn liên quan" value={o.related_order_code} />}
                      <DetailRow label="Ngày làm" value={new Date(o.work_date).toLocaleDateString('vi-VN')} />
                      <DetailRow label="Trạng thái" value={o.status === 'pending' ? 'Đang chờ' : o.status === 'approved' ? '✓ Đã duyệt' : '✕ Từ chối'} />
                    </>
                  );
                })()}

                {selectedApprovalItem.kind === 'advance' && (() => {
                  const a = selectedApprovalItem.item;
                  return (
                    <>
                      <DetailRow label="Nhân viên" value={a.employee_name} />
                      <DetailRow label="Số tiền" value={formatVND(a.amount)} />
                      <DetailRow label="Lý do" value={a.reason} />
                      <DetailRow label="Cần trước ngày" value={new Date(a.needed_on).toLocaleDateString('vi-VN')} />
                      <DetailRow label="Hình thức nhận" value={a.payment_method === 'bank_transfer' ? 'Chuyển khoản' : 'Tiền mặt'} />
                      <DetailRow label="Nộp lúc" value={new Date(a.created_at).toLocaleString('vi-VN')} />
                      {a.director_note && <DetailRow label="Ghi chú Giám đốc" value={a.director_note} />}
                      <DetailRow label="Trạng thái" value={a.status === 'pending_director' ? 'Đang chờ' : a.status === 'rejected' ? '✕ Từ chối' : a.status === 'paid' ? '✓ Đã chi' : '✓ Đã duyệt, chờ kế toán chi'} />
                    </>
                  );
                })()}

                {selectedApprovalItem.kind === 'leave' && (() => {
                  const l = selectedApprovalItem.item;
                  return (
                    <>
                      <DetailRow label="Người xin nghỉ" value={l.requester_name} />
                      <DetailRow label="Vai trò" value={l.requester_role || '—'} />
                      <DetailRow label="Lý do" value={l.reason || '—'} />
                      {l.leave_date && <DetailRow label="Ngày nghỉ" value={new Date(l.leave_date).toLocaleDateString('vi-VN')} />}
                      <DetailRow label="Nộp lúc" value={new Date(l.created_at).toLocaleString('vi-VN')} />
                      <DetailRow label="Trạng thái" value={l.status === 'pending' ? 'Đang chờ' : l.status === 'approved' ? '✓ Đã duyệt' : '✕ Từ chối'} />
                    </>
                  );
                })()}

                {selectedApprovalItem.kind === 'expense' && (() => {
                  const e = selectedApprovalItem.item;
                  return (
                    <>
                      <DetailRow label="Người chi" value={e.claimant_name} />
                      <DetailRow label="Số tiền" value={formatVND(e.amount)} />
                      <DetailRow label="Nội dung" value={e.description} />
                      {e.note && <DetailRow label="Ghi chú" value={e.note} />}
                      {e.related_order_code && <DetailRow label="Mã đơn liên quan" value={e.related_order_code} />}
                      <DetailRow label="Thời điểm chi" value={new Date(e.occurred_at).toLocaleString('vi-VN')} />
                      {e.director_note && <DetailRow label="Ghi chú Giám đốc" value={e.director_note} />}
                      <DetailRow label="Trạng thái" value={e.status === 'pending_director' ? 'Đang chờ' : e.status === 'rejected' ? '✕ Từ chối' : e.status === 'recorded' ? '✓ Đã ghi sổ' : '✓ Đã duyệt, chờ kế toán ghi sổ'} />
                    </>
                  );
                })()}

                {selectedApprovalItem.kind === 'exemption' && (() => {
                  const r = selectedApprovalItem.item;
                  return (
                    <>
                      <DetailRow label="Người yêu cầu" value={r.requester_name || 'Nhân viên'} />
                      <DetailRow label="Vai trò" value={r.requester_role || '—'} />
                      <DetailRow label="Lý do" value={r.reason || '—'} />
                      <DetailRow label="Nộp lúc" value={new Date(r.created_at).toLocaleString('vi-VN')} />
                      <DetailRow label="Trạng thái" value={r.status === 'pending' ? 'Đang chờ' : r.status === 'approved' ? '✓ Đã duyệt (việc đã miễn trừ)' : '✕ Từ chối'} />
                    </>
                  );
                })()}

                {selectedApprovalItem.canReview && (
                  <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                    <button
                      onClick={() => {
                        const it = selectedApprovalItem.item;
                        const k = selectedApprovalItem.kind;
                        setSelectedApprovalItem(null);
                        if (k === 'edit') handleReviewEditRequest(it.id, true);
                        else if (k === 'overtime') handleReviewOvertime(it.id, true);
                        else if (k === 'advance') handleReviewAdvance(it.id, true);
                        else if (k === 'leave') handleReviewLeave(it.id, true);
                        else if (k === 'exemption') handleReviewTaskExemption(it.id, true, it.task_id);
                      }}
                      style={{ flex: 1, background: '#15803d', color: '#fff', border: 'none', borderRadius: 10, padding: '12px 0', fontWeight: 900, fontSize: 13, cursor: 'pointer' }}
                    >
                      ✓ Duyệt
                    </button>
                    <button
                      onClick={() => {
                        const it = selectedApprovalItem.item;
                        const k = selectedApprovalItem.kind;
                        setSelectedApprovalItem(null);
                        if (k === 'edit') handleReviewEditRequest(it.id, false);
                        else if (k === 'overtime') handleReviewOvertime(it.id, false);
                        else if (k === 'advance') handleReviewAdvance(it.id, false);
                        else if (k === 'leave') handleReviewLeave(it.id, false);
                        else if (k === 'exemption') handleReviewTaskExemption(it.id, false, it.task_id);
                      }}
                      style={{ flex: 1, background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: 10, padding: '12px 0', fontWeight: 900, fontSize: 13, cursor: 'pointer' }}
                    >
                      ✕ Từ chối
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* ── BOTTOM SHEET: TRẠNG THÁI NHÂN SỰ (3 LUỒNG: ĐANG LÀM, ĐI TRỄ, NGHỈ CA) ── */}
        {/* ========================================================================= */}
        {activeSheet === 'staff_detail' && (
          <div className="sheet-overlay" onClick={() => setActiveSheet(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(2px)', zIndex: 1200, display: 'flex', alignItems: 'flex-end' }}>
            <div onClick={e => e.stopPropagation()} style={sheetPanelStyle()}>
              <div {...sheetDragHandlers} style={{ flexShrink: 0, cursor: 'grab' }}>
                {SHEET_HANDLE}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 14px 8px', borderBottom: '1.5px solid #eadcca' }}>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 900, color: '#2d1c10' }}>
                      👥 Chi Tiết Trạng Thái Nhân Sự ({staffCounts.total} NV)
                    </div>
                    <div style={{ fontSize: 11, color: '#725f50' }}>
                      Theo dõi chấm công & hiện diện 3 phân xưởng hôm nay
                    </div>
                  </div>
                  <button onClick={() => setActiveSheet(null)} aria-label="Quay lại" style={{ order: -1, flexShrink: 0, width: 40, height: 40, borderRadius: 12, background: '#f4efe8', border: 'none', fontSize: 20, fontWeight: 900, color: '#2d1c10', cursor: 'pointer' }}>‹</button>
                </div>

                {/* 3 Tab chuyển đổi luồng nhân sự */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, padding: '10px 14px 0' }}>
                <button
                  onClick={() => setSelectedStaffTab('working')}
                  style={{
                    padding: '8px 4px',
                    borderRadius: 12,
                    border: selectedStaffTab === 'working' ? '2px solid #16a34a' : '1px solid #eadcca',
                    background: selectedStaffTab === 'working' ? '#f0fdf4' : '#fff',
                    color: selectedStaffTab === 'working' ? '#15803d' : '#725f50',
                    fontSize: 11.5,
                    fontWeight: 900,
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 2
                  }}
                >
                  <span>🟢 Đang làm</span>
                  <span style={{ fontSize: 13, fontWeight: 900 }}>{staffCounts.working} người</span>
                </button>

                <button
                  onClick={() => setSelectedStaffTab('late')}
                  style={{
                    padding: '8px 4px',
                    borderRadius: 12,
                    border: selectedStaffTab === 'late' ? '2px solid #ea580c' : '1px solid #eadcca',
                    background: selectedStaffTab === 'late' ? '#fff7ed' : '#fff',
                    color: selectedStaffTab === 'late' ? '#c2410c' : '#725f50',
                    fontSize: 11.5,
                    fontWeight: 900,
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 2
                  }}
                >
                  <span>⏰ Đi trễ</span>
                  <span style={{ fontSize: 13, fontWeight: 900, color: '#dc2626' }}>{staffCounts.late} người</span>
                </button>

                <button
                  onClick={() => setSelectedStaffTab('off')}
                  style={{
                    padding: '8px 4px',
                    borderRadius: 12,
                    border: selectedStaffTab === 'off' ? '2px solid #dc2626' : '1px solid #eadcca',
                    background: selectedStaffTab === 'off' ? '#fef2f2' : '#fff',
                    color: selectedStaffTab === 'off' ? '#dc2626' : '#725f50',
                    fontSize: 11.5,
                    fontWeight: 900,
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 2
                  }}
                >
                  <span>🔴 Nghỉ ca</span>
                  <span style={{ fontSize: 13, fontWeight: 900 }}>{staffCounts.off} người</span>
                </button>
                </div>
              </div>

              {/* Danh sách nhân viên theo từng tab */}
              <div style={sheetBodyStyle({ paddingTop: 12 })}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>

                {/* 1. Luồng: ĐANG LÀM VIỆC */}
                {selectedStaffTab === 'working' && (
                  <>
                    <div style={{ fontSize: 11.5, fontWeight: 800, color: '#15803d', marginBottom: 2 }}>
                      ✓ Danh sách nhân viên có mặt đúng giờ ({staffCounts.working} nhân sự):
                    </div>
                    {staffList.filter(st => st.status === 'working').map(st => (
                      <div key={st.id} onClick={() => setSelectedStaff(st)} style={{ background: '#faf6f0', border: '1.5px solid #dcfce7', borderRadius: 14, padding: '10px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <span style={{ fontSize: 24 }}>{st.avatar}</span>
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 900, color: '#2d1c10' }}>{st.name}</div>
                            <div style={{ fontSize: 11, color: '#725f50', marginTop: 1 }}>{st.role} · <strong>[{st.zone}]</strong></div>
                            <div style={{ fontSize: 10.5, color: '#15803d', fontWeight: 800, marginTop: 2 }}>⏰ Vào ca: {st.checkinTime}{st.checkinDate ? ` · ${st.checkinDate}` : ''} ({st.note}) · {st.shift}</div>
                          </div>
                        </div>
                        <span style={{ fontSize: 10.5, fontWeight: 900, padding: '3px 8px', borderRadius: 99, background: '#dcfce7', color: '#15803d' }}>
                          🟢 Đang làm
                        </span>
                      </div>
                    ))}
                  </>
                )}

                {/* 2. Luồng: ĐI TRỄ */}
                {selectedStaffTab === 'late' && (
                  <>
                    <div style={{ fontSize: 11.5, fontWeight: 800, color: '#c2410c', marginBottom: 2 }}>
                      ⚠️ Danh sách nhân viên chấm công vào ca trễ ({staffCounts.late} nhân sự):
                    </div>
                    {staffList.filter(st => st.status === 'late').map(st => (
                      <div key={st.id} style={{ background: '#fff9f5', border: '1.5px solid #fdba74', borderRadius: 14, padding: '10px 12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <div onClick={() => setSelectedStaff(st)} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                            <span style={{ fontSize: 24 }}>{st.avatar}</span>
                            <div>
                              <div style={{ fontSize: 13, fontWeight: 900, color: '#2d1c10' }}>{st.name}</div>
                              <div style={{ fontSize: 11, color: '#725f50' }}>{st.role} · <strong>[{st.zone}]</strong></div>
                            </div>
                          </div>
                          <span style={{ fontSize: 11, fontWeight: 900, padding: '3px 8px', borderRadius: 99, background: '#fee2e2', color: '#dc2626' }}>
                            Trễ {st.lateMinutes} phút ⚠️
                          </span>
                        </div>

                        <div style={{ background: '#fff', border: '1px solid #fde047', borderRadius: 8, padding: '6px 8px', marginTop: 8, fontSize: 11, color: '#493526' }}>
                          <div>⏰ <strong>Giờ vào ca:</strong> {st.checkinTime}{st.checkinDate ? ` · ${st.checkinDate}` : ''} (Quy định 06:00)</div>
                          <div>📝 <strong>Lý do:</strong> {st.reason}</div>
                        </div>

                        <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                          <button
                            onClick={() => handleRemindStaff(st.id, st.name)}
                            style={{ flex: 1, background: '#ea580c', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 0', fontSize: 11, fontWeight: 900, cursor: 'pointer' }}
                          >
                            ⚡ Nhắc Nhở
                          </button>
                          <button
                            onClick={() => handleWaivePenalty(st.shiftLogId, st.name)}
                            style={{ flex: 1, background: '#f4efe8', color: '#725f50', border: 'none', borderRadius: 6, padding: '6px 0', fontSize: 11, fontWeight: 800, cursor: 'pointer' }}
                          >
                            Bỏ Qua Lý Do Chính Đáng
                          </button>
                        </div>
                      </div>
                    ))}
                  </>
                )}

                {/* 3. Luồng: NGHỈ CA / NGHỈ PHÉP */}
                {selectedStaffTab === 'off' && (
                  <>
                    <div style={{ fontSize: 11.5, fontWeight: 800, color: '#dc2626', marginBottom: 2 }}>
                      🔴 Danh sách nhân viên nghỉ ca / nghỉ phép ({staffCounts.off} nhân sự):
                    </div>
                    {staffList.filter(st => st.status === 'off').map(st => (
                      <div key={st.id} style={{ background: '#fef2f2', border: '1.5px solid #fecaca', borderRadius: 14, padding: '10px 12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <div onClick={() => setSelectedStaff(st)} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                            <span style={{ fontSize: 24 }}>{st.avatar}</span>
                            <div>
                              <div style={{ fontSize: 13, fontWeight: 900, color: '#2d1c10' }}>{st.name}</div>
                              <div style={{ fontSize: 11, color: '#725f50' }}>{st.role} · <strong>[{st.zone}]</strong></div>
                            </div>
                          </div>
                          <span style={{ fontSize: 10.5, fontWeight: 900, padding: '3px 8px', borderRadius: 99, background: '#fee2e2', color: '#dc2626' }}>
                            {st.leaveType}
                          </span>
                        </div>

                        <div style={{ background: '#fff', border: '1px solid #fca5a5', borderRadius: 8, padding: '6px 8px', marginTop: 8, fontSize: 11, color: '#493526' }}>
                          <div>📋 <strong>Lý do nghỉ:</strong> {st.reason}</div>
                          <div>👤 <strong>Người duyệt:</strong> <span style={{ color: '#15803d', fontWeight: 800 }}>{st.approvedBy}</span></div>
                        </div>
                      </div>
                    ))}
                  </>
                )}

              </div>
              </div>
            </div>
          </div>
        )}

        {/* Toast Notification */}
        {toast && (
          <div style={{
            position: 'absolute',
            bottom: 60,
            left: '50%',
            transform: 'translateX(-50%)',
            background: '#2d1c10',
            color: '#fff',
            padding: '8px 16px',
            borderRadius: 20,
            fontSize: 12,
            fontWeight: 800,
            boxShadow: '0 4px 14px rgba(0,0,0,0.25)',
            zIndex: 2000,
            whiteSpace: 'nowrap'
          }}>
            {toast}
          </div>
        )}

        {/* Loading skeleton — chỉ hiện lần tải đầu, tránh giật màn hình mỗi lần refresh */}
        {loading && staffCounts.total === 0 && (
          <div style={{ position: 'fixed', inset: 0, background: '#faf6f0', zIndex: 1500, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 8 }}>
            <div style={{ width: 32, height: 32, border: '3px solid #eadcca', borderTopColor: '#c28c4e', borderRadius: '50%', animation: 'sumi-boss-spin 0.8s linear infinite' }} />
            <div style={{ fontSize: 12, fontWeight: 700, color: '#8a7a66' }}>Đang tải dữ liệu thật...</div>
            <style>{`@keyframes sumi-boss-spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        )}
      </>,
      document.body
    )}
    </>
  );
}

// Dùng khi mở qua ?mockup=boss-v3 (chưa nằm trong cây AuthProvider gốc của
// app thật) — bên trong app thật thì import BossOverviewV3Inner trực tiếp.
export default function BossOverviewV3() {
  return (
    <AuthProvider>
      <BossOverviewV3Inner />
    </AuthProvider>
  );
}
