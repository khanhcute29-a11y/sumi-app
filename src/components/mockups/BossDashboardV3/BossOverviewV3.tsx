import React, { useState, useMemo, useEffect } from 'react';
import {
  Crown,
  TrendingUp,
  TrendingDown,
  Users,
  Clock,
  MessageSquare,
  Send,
  Plus,
  Receipt,
  CheckCircle2,
  AlertTriangle,
  X,
  ChevronRight,
  Signal,
  Wifi,
  Battery,
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
  Gift
} from 'lucide-react';
import { AuthProvider, useAuth } from '../../../lib/AuthContext';
import { listOrdersV2 } from '../../../lib/featureFlags';
import { ORDER_FLOWS } from '../../../data/orderCatalogs';
import {
  fetchRevenueByChannel,
  fetchExpenseClaimsToday,
  reviewExpenseClaim,
  fetchTodayStaffStatus,
  remindStaff,
  waiveLatePenalty,
  fetchAssignableStaff,
  assignTaskToStaff,
  fetchRecentFeedPosts,
  postCompanyAnnouncement,
  summarizeOrderCounts,
  sortOrdersByPriority,
  fetchPendingSalaryAdvances,
  reviewSalaryAdvance,
  fetchPendingLeaveRequests,
  reviewLeaveRequest,
  fetchTodayShiftReports,
  fetchWeeklyScheduleAllStations,
} from '../../../lib/bossOverviewV3';

const formatVND = (amount: number) => {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
};

export function BossOverviewV3Inner() {
  const { profile } = useAuth();

  // ── States Quản Lý Bottom Sheets & Bộ Lọc Đơn Hàng ──
  const [activeSheet, setActiveSheet] = useState<
    'revenue_detail' | 'expense_detail' | 'order_drawer' | 'staff_detail' | 'task_sheet' | 'feed_sheet' | 'advance_sheet' | 'leave_sheet' | 'report_sheet' | 'schedule_sheet' | null
  >(null);
  const [selectedOrderFilter, setSelectedOrderFilter] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  // ── Dữ liệu thật: doanh thu 5 kênh ──
  const [revenueStreams, setRevenueStreams] = useState<any[]>([]);
  const [totalRevenue, setTotalRevenue] = useState(0);

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

  // ── Dữ liệu thật: báo cáo cuối ca hôm nay (staff_shift_reports) ──
  const [shiftReports, setShiftReports] = useState<any[]>([]);

  // ── Dữ liệu thật: lịch phân ca tuần toàn công ty (shift_schedule, 5 khu vực) ──
  const [weeklySchedule, setWeeklySchedule] = useState<{ from: string; to: string; days: any[]; totalAssignments: number }>({ from: '', to: '', days: [], totalAssignments: 0 });

  const loadAll = async () => {
    setLoading(true);
    setLoadError('');
    try {
      const [rev, claims, status, staffOptions, orders, posts, advances, leaves, reports, schedule] = await Promise.all([
        fetchRevenueByChannel(),
        fetchExpenseClaimsToday(),
        fetchTodayStaffStatus(),
        fetchAssignableStaff(),
        listOrdersV2(),
        fetchRecentFeedPosts(),
        fetchPendingSalaryAdvances(),
        fetchPendingLeaveRequests(),
        fetchTodayShiftReports(),
        fetchWeeklyScheduleAllStations(),
      ]);

      setRevenueStreams(rev.channels.map((c) => ({ id: c.key, channel: c.title, amount: c.amount, percentage: c.percentage, icon: c.icon, note: `${c.count} đơn hoàn thành` })));
      setTotalRevenue(rev.total);

      setExpenseStreams(claims.map((c: any) => ({
        id: c.id,
        title: c.description || c.note || 'Khoản chi',
        amount: Number(c.amount) || 0,
        category: c.status === 'pending_director' ? '⏳ Chờ Sếp duyệt' : c.status === 'pending_accounting' ? '✓ Đã duyệt · chờ ghi sổ' : c.status === 'recorded' ? '✓ Đã ghi sổ' : '✕ Đã từ chối',
        time: new Date(c.occurred_at || c.created_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
        icon: '💸',
        status: c.status,
        claimantName: c.claimant_name,
      })));
      setTotalExpense(claims.reduce((s: number, c: any) => s + (Number(c.amount) || 0), 0));

      const mapCommon = (p: any) => ({ id: p.id, name: p.full_name, role: p.role || 'Nhân viên', zone: p.station || 'Chưa gán khu vực', avatar: '👤' });
      setStaffList([
        ...status.working.map((p: any) => ({ ...mapCommon(p), status: 'working', checkinTime: p.checkinTime, shift: p.shiftLabel || 'Ca hôm nay', note: 'Đúng giờ' })),
        ...status.late.map((p: any) => ({ ...mapCommon(p), status: 'late', checkinTime: p.checkinTime, lateMinutes: p.lateMinutes, reason: p.reason || 'Không ghi lý do', shift: p.shiftLabel || 'Ca hôm nay', shiftLogId: p.shiftLogId })),
        ...status.off.map((p: any) => ({ ...mapCommon(p), status: 'off', leaveType: 'Nghỉ ca', reason: p.reason || 'Không ghi lý do', approvedBy: 'Đã ghi nhận trong hệ thống' })),
      ]);
      setStaffCounts({ total: status.total, working: status.working.length, late: status.late.length, off: status.off.length });
      setAssignableStaff(staffOptions);

      setAllOrders(sortOrdersByPriority(orders));
      setFeedPosts(posts);
      setPendingAdvances(advances);
      setPendingLeaves(leaves);
      setShiftReports(reports);
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

  // ── Giao việc nhanh — ghi thật vào bảng tasks, hiện ngay trên màn Nhân viên ──
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDesc, setTaskDesc] = useState('');
  const [taskAssignee, setTaskAssignee] = useState(''); // profile id
  const [sendingTask, setSendingTask] = useState(false);
  // Chỉ lưu ngay trong phiên này để Sếp thấy đã giao gì — hệ thống chưa có
  // view "toàn bộ việc tôi đã giao cho tất cả nhân viên" để tải lại từ DB.
  const [managedTasks, setManagedTasks] = useState<any[]>([]);

  useEffect(() => {
    if (!taskAssignee && assignableStaff.length) setTaskAssignee(assignableStaff[0].id);
  }, [assignableStaff]);

  // ── Dữ liệu thật: đơn hàng (order_operations_list qua listOrdersV2) ──
  const [allOrders, setAllOrders] = useState<any[]>([]);

  const orderCounts = useMemo(() => summarizeOrderCounts(allOrders), [allOrders]);

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
    return list;
  }, [allOrders, selectedOrderFilter]);

  // Mở Drawer lọc đơn theo từng ô
  const handleOpenOrderDrawer = (filterKey: string = 'all') => {
    setSelectedOrderFilter(filterKey);
    setActiveSheet('order_drawer');
  };

  // ── Duyệt/Từ chối khoản chi — ghi thật vào expense_claims ──
  const handleReviewExpense = async (id: string, approve: boolean) => {
    try {
      await reviewExpenseClaim(id, approve);
      showToast(approve ? '✓ Sếp đã DUYỆT khoản chi' : '✕ Sếp đã từ chối khoản chi');
      const claims = await fetchExpenseClaimsToday();
      setExpenseStreams(claims.map((c: any) => ({
        id: c.id, title: c.description || c.note || 'Khoản chi', amount: Number(c.amount) || 0,
        category: c.status === 'pending_director' ? '⏳ Chờ Sếp duyệt' : c.status === 'pending_accounting' ? '✓ Đã duyệt · chờ ghi sổ' : c.status === 'recorded' ? '✓ Đã ghi sổ' : '✕ Đã từ chối',
        time: new Date(c.occurred_at || c.created_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }), icon: '💸', status: c.status, claimantName: c.claimant_name,
      })));
      setTotalExpense(claims.reduce((s: number, c: any) => s + (Number(c.amount) || 0), 0));
    } catch (e: any) {
      showToast(`⚠️ ${e.message || 'Không thao tác được'}`);
    }
  };

  // ── Duyệt/Từ chối tạm ứng lương — ghi thật vào salary_advance_requests ──
  const handleReviewAdvance = async (id: string, approve: boolean) => {
    try {
      await reviewSalaryAdvance(id, approve);
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
      showToast(approve ? '✓ Sếp đã ĐỒNG Ý đơn nghỉ phép' : '✕ Sếp đã từ chối đơn nghỉ phép');
      setPendingLeaves(await fetchPendingLeaveRequests());
    } catch (e: any) {
      showToast(`⚠️ ${e.message || 'Không thao tác được'}`);
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
      const mapCommon = (p: any) => ({ id: p.id, name: p.full_name, role: p.role || 'Nhân viên', zone: p.station || 'Chưa gán khu vực', avatar: '👤' });
      setStaffList([
        ...status.working.map((p: any) => ({ ...mapCommon(p), status: 'working', checkinTime: p.checkinTime, shift: p.shiftLabel || 'Ca hôm nay', note: 'Đúng giờ' })),
        ...status.late.map((p: any) => ({ ...mapCommon(p), status: 'late', checkinTime: p.checkinTime, lateMinutes: p.lateMinutes, reason: p.reason || 'Không ghi lý do', shift: p.shiftLabel || 'Ca hôm nay', shiftLogId: p.shiftLogId })),
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

  // ── Giao Việc Nhanh — ghi thật vào bảng tasks, hiện ngay trên màn Nhân viên ──
  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskTitle.trim()) {
      showToast('⚠️ Vui lòng nhập tên công việc!');
      return;
    }
    if (!taskAssignee || !profile?.id) return;
    setSendingTask(true);
    try {
      const assignee = assignableStaff.find((s) => s.id === taskAssignee);
      await assignTaskToStaff({ assigneeId: taskAssignee, title: taskTitle.trim(), description: taskDesc.trim() || null, createdBy: profile.id });
      setManagedTasks([{ id: `tsk-${Date.now()}`, title: taskTitle.trim(), desc: taskDesc.trim(), assignee: assignee?.full_name || 'Nhân viên', statusLabel: 'Mới giao' }, ...managedTasks]);
      setTaskTitle('');
      setTaskDesc('');
      showToast(`⚡ Đã giao việc "${taskTitle.trim()}" cho ${assignee?.full_name || 'nhân viên'}!`);
    } catch (err: any) {
      showToast(`⚠️ ${err.message || 'Không giao được việc, thử lại sau.'}`);
    } finally {
      setSendingTask(false);
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

  return (
    <div style={{ background: '#dcd3c7', minHeight: '100vh', padding: '16px 8px', boxSizing: 'border-box' }}>
      {loadError && (
        <div style={{ maxWidth: 420, margin: '0 auto 8px', background: '#fee2e2', color: '#dc2626', fontSize: 12, fontWeight: 700, padding: '8px 12px', borderRadius: 10, cursor: 'pointer' }} onClick={loadAll}>
          ⚠️ {loadError} — bấm để tải lại
        </div>
      )}

      {/* ========================================================================= */}
      {/* ── SMARTPHONE FRAME CONTAINER (CHUẨN DI ĐỘNG 420PX) ── */}
      {/* ========================================================================= */}
      <div style={{
        maxWidth: 420,
        minHeight: 880,
        maxHeight: '94vh',
        margin: '8px auto',
        backgroundColor: '#faf6f0',
        boxShadow: '0 25px 60px -15px rgba(45, 28, 16, 0.45), 0 0 0 1px rgba(0, 0, 0, 0.1)',
        borderRadius: 44,
        border: '12px solid #1c1917',
        position: 'relative',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        boxSizing: 'border-box',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        color: '#2d1c10'
      }}>

        {/* Dynamic Island Notch */}
        <div style={{
          width: 120,
          height: 24,
          background: '#1c1917',
          borderRadius: '0 0 16px 16px',
          position: 'absolute',
          top: 0,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 1001,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          <div style={{ width: 10, height: 10, background: '#09090b', borderRadius: '50%', border: '1.5px solid #27272a' }} />
        </div>

        {/* Status Bar */}
        <div style={{
          height: 38,
          padding: '8px 20px 0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: 13,
          fontWeight: 800,
          color: '#2d1c10',
          zIndex: 1000
        }}>
          <span>09:41</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Signal size={12} />
            <Wifi size={13} />
            <span style={{ fontSize: 11 }}>5G</span>
            <Battery size={15} />
          </div>
        </div>

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
                SUMI BAKERY ENTERPRISE
              </div>
              <h1 style={{ fontSize: 16, fontWeight: 900, margin: 0, color: '#2d1c10' }}>
                Tổng Giám Đốc (Sếp {profile?.full_name || '...'})
              </h1>
            </div>
          </div>

          <div style={{
            background: '#fee2e2',
            color: '#dc2626',
            fontSize: 10.5,
            fontWeight: 900,
            padding: '4px 8px',
            borderRadius: 99,
            display: 'flex',
            alignItems: 'center',
            gap: 4
          }}>
            <span style={{ width: 6, height: 6, background: '#dc2626', borderRadius: '50%' }} />
            V3 Executive
          </div>
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
            {/* Thẻ 1: KPI Nhân sự 50 người */}
            <div
              onClick={() => setActiveSheet('staff_detail')}
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
                <span style={{ fontSize: 11, fontWeight: 900, color: '#725f50', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Users size={14} color="#b45309" /> TỔNG NHÂN SỰ
                </span>
                <ChevronRight size={12} style={{ color: '#a08060' }} />
              </div>

              <div style={{ fontSize: 20, fontWeight: 900, color: '#2d1c10' }}>
                {staffCounts.total} <span style={{ fontSize: 12, fontWeight: 800, color: '#725f50' }}>người</span>
              </div>

              <div style={{ marginTop: 4, fontSize: 11, fontWeight: 800, color: '#725f50' }}>
                Đã duyệt &amp; đang hoạt động
              </div>
            </div>

            {/* Thẻ 2: Trạng thái làm việc (45 Đang làm, 3 Trễ, 2 Nghỉ) */}
            <div
              onClick={() => { setSelectedStaffTab('working'); setActiveSheet('staff_detail'); }}
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
            {/* Ô 1: Giao việc nhanh */}
            <div
              onClick={() => setActiveSheet('task_sheet')}
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

            {/* Ô 3: Duyệt tạm ứng */}
            <div
              onClick={() => setActiveSheet('advance_sheet')}
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
                <DollarSign size={22} color="#b87a48" strokeWidth={1.6} />
              </div>
              <div style={{ marginTop: 6 }}>
                <div style={{ fontSize: 13.5, fontWeight: 800, color: '#2d1c10' }}>3. Tạm ứng</div>
                <div style={{ fontSize: 11, color: '#725f50', marginTop: 1 }}>{pendingAdvances.length} đơn chờ duyệt</div>
              </div>
            </div>

            {/* Ô 4: Duyệt nghỉ phép */}
            <div
              onClick={() => setActiveSheet('leave_sheet')}
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
                <FileText size={22} color="#b87a48" strokeWidth={1.6} />
              </div>
              <div style={{ marginTop: 6 }}>
                <div style={{ fontSize: 13.5, fontWeight: 800, color: '#2d1c10' }}>4. Xin nghỉ</div>
                <div style={{ fontSize: 11, color: '#725f50', marginTop: 1 }}>Đơn nghỉ phép</div>
              </div>
            </div>

            {/* Ô 5: Báo cáo ca ngày */}
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
                <div style={{ fontSize: 13.5, fontWeight: 800, color: '#2d1c10' }}>5. Báo cáo ngày</div>
                <div style={{ fontSize: 11, color: '#725f50', marginTop: 1 }}>{shiftReports.length} báo cáo hôm nay</div>
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
                <div style={{ fontSize: 13.5, fontWeight: 800, color: '#2d1c10' }}>6. Lịch làm</div>
                <div style={{ fontSize: 11, color: '#725f50', marginTop: 1 }}>{weeklySchedule.totalAssignments} lượt phân ca tuần này</div>
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
              <span style={{ fontSize: 16, fontWeight: 900, color: '#2d1c10' }}>{orderCounts.total}</span>
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
              <span style={{ fontSize: 16, fontWeight: 900, color: '#16a34a' }}>{orderCounts.completed}</span>
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

        {/* ========================================================================= */}
        {/* ── BOTTOM SHEET: 1. CHI TIẾT DOANH THU & NGUỒN THU ── */}
        {/* ========================================================================= */}
        {activeSheet === 'revenue_detail' && (
          <div className="sheet-overlay" onClick={() => setActiveSheet(null)} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(2px)', zIndex: 1200, display: 'flex', alignItems: 'flex-end' }}>
            <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxHeight: '82%', background: '#fff', borderRadius: '28px 28px 0 0', padding: '16px 14px 30px', boxSizing: 'border-box', overflowY: 'auto' }}>
              <div style={{ width: 38, height: 4, background: '#cbd5e1', borderRadius: 99, margin: '0 auto 12px' }} />
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, paddingBottom: 8, borderBottom: '1.5px solid #eadcca' }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 900, color: '#166534' }}>📊 Chi Tiết Nguồn Thu Hôm Nay</div>
                  <div style={{ fontSize: 11, color: '#725f50' }}>Tổng cộng: {formatVND(totalRevenue)}</div>
                </div>
                <button onClick={() => setActiveSheet(null)} style={{ width: 28, height: 28, borderRadius: 8, background: '#f4efe8', border: 'none', fontWeight: 900, cursor: 'pointer' }}>✕</button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {revenueStreams.map(rev => (
                  <div key={rev.id} style={{ background: '#faf6f0', border: '1.5px solid #eadcca', borderRadius: 14, padding: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 22 }}>{rev.icon}</span>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 900, color: '#2d1c10' }}>{rev.channel}</div>
                          <div style={{ fontSize: 11, color: '#725f50', marginTop: 2 }}>{rev.note}</div>
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 14, fontWeight: 900, color: '#15803d' }}>{formatVND(rev.amount)}</div>
                        <div style={{ fontSize: 10.5, fontWeight: 800, color: '#a08060' }}>{rev.percentage} tổng thu</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* ── BOTTOM SHEET: 2. SỔ CÁI KHOẢN CHI THỰC TẾ ── */}
        {/* ========================================================================= */}
        {activeSheet === 'expense_detail' && (
          <div className="sheet-overlay" onClick={() => setActiveSheet(null)} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(2px)', zIndex: 1200, display: 'flex', alignItems: 'flex-end' }}>
            <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxHeight: '82%', background: '#fff', borderRadius: '28px 28px 0 0', padding: '16px 14px 30px', boxSizing: 'border-box', overflowY: 'auto' }}>
              <div style={{ width: 38, height: 4, background: '#cbd5e1', borderRadius: 99, margin: '0 auto 12px' }} />
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, paddingBottom: 8, borderBottom: '1.5px solid #eadcca' }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 900, color: '#dc2626' }}>📑 Sổ Cái Khoản Chi Tiêu Hôm Nay</div>
                  <div style={{ fontSize: 11, color: '#725f50' }}>Tổng chi: {formatVND(totalExpense)}</div>
                </div>
                <button onClick={() => setActiveSheet(null)} style={{ width: 28, height: 28, borderRadius: 8, background: '#f4efe8', border: 'none', fontWeight: 900, cursor: 'pointer' }}>✕</button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {expenseStreams.length === 0 && (
                  <div style={{ textAlign: 'center', padding: '20px 0', color: '#725f50', fontSize: 13 }}>Chưa có khoản chi nào hôm nay.</div>
                )}
                {expenseStreams.map((exp: any) => (
                  <div key={exp.id} style={{ background: '#fff', border: '1.5px solid #fecaca', borderRadius: 14, padding: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 20 }}>{exp.icon}</span>
                        <div>
                          <div style={{ fontSize: 12.5, fontWeight: 900, color: '#2d1c10' }}>{exp.title}</div>
                          <div style={{ fontSize: 11, color: '#725f50', marginTop: 2 }}>{exp.claimantName} · <strong>{exp.category}</strong> · {exp.time}</div>
                        </div>
                      </div>
                      <div style={{ fontSize: 13.5, fontWeight: 900, color: '#dc2626' }}>
                        -{formatVND(exp.amount)}
                      </div>
                    </div>
                    {exp.status === 'pending_director' && (
                      <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                        <button onClick={() => handleReviewExpense(exp.id, true)} style={{ flex: 1, background: '#15803d', color: '#fff', border: 'none', borderRadius: 8, padding: '7px 0', fontWeight: 900, fontSize: 11.5, cursor: 'pointer' }}>
                          ✓ Duyệt Chi
                        </button>
                        <button onClick={() => handleReviewExpense(exp.id, false)} style={{ flex: 1, background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: 8, padding: '7px 0', fontWeight: 900, fontSize: 11.5, cursor: 'pointer' }}>
                          ✕ Từ Chối
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* ── BOTTOM SHEET: 3. GIAO VIỆC NHANH (TASK DELEGATION) ── */}
        {/* ========================================================================= */}
        {activeSheet === 'task_sheet' && (
          <div className="sheet-overlay" onClick={() => setActiveSheet(null)} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(2px)', zIndex: 1300, display: 'flex', alignItems: 'flex-end' }}>
            <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxHeight: '85%', background: '#fff', borderRadius: '28px 28px 0 0', padding: '16px 14px 30px', boxSizing: 'border-box', overflowY: 'auto' }}>
              <div style={{ width: 38, height: 4, background: '#cbd5e1', borderRadius: 99, margin: '0 auto 12px' }} />
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, paddingBottom: 8, borderBottom: '1.5px solid #eadcca' }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 900, color: '#8b5900' }}>⚡ Giao Việc Nhanh Cho Nhân Viên</div>
                  <div style={{ fontSize: 11, color: '#725f50' }}>Tự động đồng bộ sang màn hình Nhân viên</div>
                </div>
                <button onClick={() => setActiveSheet(null)} style={{ width: 28, height: 28, borderRadius: 8, background: '#f4efe8', border: 'none', fontWeight: 900, cursor: 'pointer' }}>✕</button>
              </div>

              <form onSubmit={handleCreateTask} style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 800, color: '#725f50', marginBottom: 2 }}>Tên công việc *</div>
                  <input
                    type="text"
                    placeholder="VD: Kiểm tra chất lượng mẻ bánh Macaron"
                    value={taskTitle}
                    onChange={e => setTaskTitle(e.target.value)}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1.5px solid #eadcca', fontSize: 12, outline: 'none', background: '#faf6f0', boxSizing: 'border-box' }}
                  />
                </div>

                <div>
                  <div style={{ fontSize: 11, fontWeight: 800, color: '#725f50', marginBottom: 2 }}>Mô tả chi tiết nhiệm vụ</div>
                  <textarea
                    rows={3}
                    placeholder="Nhập yêu cầu thực hiện, kích thước, tiêu chuẩn chất lượng..."
                    value={taskDesc}
                    onChange={e => setTaskDesc(e.target.value)}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1.5px solid #eadcca', fontSize: 12, outline: 'none', background: '#faf6f0', boxSizing: 'border-box' }}
                  />
                </div>

                <div>
                  <div style={{ fontSize: 11, fontWeight: 800, color: '#725f50', marginBottom: 2 }}>Người nhận việc</div>
                  <select
                    value={taskAssignee}
                    onChange={e => setTaskAssignee(e.target.value)}
                    style={{ width: '100%', padding: '7px 8px', borderRadius: 8, border: '1.5px solid #eadcca', fontSize: 11.5, fontWeight: 700, outline: 'none', background: '#faf6f0' }}
                  >
                    {assignableStaff.map((st: any) => (
                      <option key={st.id} value={st.id}>
                        {st.full_name} ({st.station || st.role})
                      </option>
                    ))}
                  </select>
                </div>

                <button
                  type="submit"
                  disabled={sendingTask}
                  style={{
                    background: '#c28c4e',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 10,
                    padding: '10px 0',
                    fontWeight: 900,
                    fontSize: 13,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                    marginTop: 4
                  }}
                >
                  <Plus size={16} /> {sendingTask ? 'Đang giao...' : 'Giao Việc Ngay (Tự Động Đồng Bộ)'}
                </button>
              </form>

              {/* Danh sách việc đã giao trong phiên này */}
              {managedTasks.length > 0 && (
                <>
                  <div style={{ fontSize: 12, fontWeight: 900, color: '#2d1c10', marginBottom: 6 }}>
                    📋 Vừa giao trong phiên này:
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {managedTasks.map((t: any) => (
                      <div key={t.id} style={{ background: '#faf6f0', border: '1px solid #eadcca', borderRadius: 10, padding: 8 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ fontSize: 12.5, fontWeight: 900 }}>{t.title}</span>
                          <span style={{ fontSize: 10.5, color: '#c28c4e', fontWeight: 800 }}>{t.statusLabel}</span>
                        </div>
                        <div style={{ fontSize: 11, color: '#725f50', marginTop: 2 }}>👤 Người nhận: <strong>{t.assignee}</strong></div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* ── BOTTOM SHEET: 4. BẢNG TIN CHỈ ĐẠO CÔNG KHAI & TAG TÊN ── */}
        {/* ========================================================================= */}
        {activeSheet === 'feed_sheet' && (
          <div className="sheet-overlay" onClick={() => setActiveSheet(null)} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(2px)', zIndex: 1300, display: 'flex', alignItems: 'flex-end' }}>
            <div onClick={e => e.stopPropagation()} style={{ width: '100%', height: '85%', background: '#fff', borderRadius: '28px 28px 0 0', padding: '16px 14px 30px', boxSizing: 'border-box', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
              <div style={{ width: 38, height: 4, background: '#cbd5e1', borderRadius: 99, margin: '0 auto 12px' }} />
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, paddingBottom: 8, borderBottom: '1.5px solid #eadcca' }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 900, color: '#166534' }}>📢 Bảng Tin & Chỉ Đạo Công Khai</div>
                  <div style={{ fontSize: 11, color: '#725f50' }}>Toàn thể {staffCounts.total} nhân viên đều nhìn thấy</div>
                </div>
                <button onClick={() => setActiveSheet(null)} style={{ width: 28, height: 28, borderRadius: 8, background: '#f4efe8', border: 'none', fontWeight: 900, cursor: 'pointer' }}>✕</button>
              </div>

              {/* Danh sách tin nhắn */}
              <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
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
              <form onSubmit={handleSendComment} style={{ display: 'flex', gap: 6 }}>
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
        )}

        {/* ========================================================================= */}
        {/* ── BOTTOM SHEET: 5. DUYỆT TẠM ỨNG LƯƠNG ── */}
        {/* ========================================================================= */}
        {activeSheet === 'advance_sheet' && (
          <div className="sheet-overlay" onClick={() => setActiveSheet(null)} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(2px)', zIndex: 1200, display: 'flex', alignItems: 'flex-end' }}>
            <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxHeight: '82%', background: '#fff', borderRadius: '28px 28px 0 0', padding: '16px 14px 30px', boxSizing: 'border-box', overflowY: 'auto' }}>
              <div style={{ width: 38, height: 4, background: '#cbd5e1', borderRadius: 99, margin: '0 auto 12px' }} />
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, paddingBottom: 8, borderBottom: '1.5px solid #eadcca' }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 900, color: '#ca8a04' }}>💵 Phê Duyệt Tạm Ứng Lương</div>
                  <div style={{ fontSize: 11, color: '#725f50' }}>{pendingAdvances.length} đơn yêu cầu đang chờ Sếp duyệt</div>
                </div>
                <button onClick={() => setActiveSheet(null)} style={{ width: 28, height: 28, borderRadius: 8, background: '#f4efe8', border: 'none', fontWeight: 900, cursor: 'pointer' }}>✕</button>
              </div>

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
        )}

        {/* ========================================================================= */}
        {/* ── BOTTOM SHEET: 6. DUYỆT NGHỈ PHÉP ── */}
        {/* ========================================================================= */}
        {activeSheet === 'leave_sheet' && (
          <div className="sheet-overlay" onClick={() => setActiveSheet(null)} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(2px)', zIndex: 1200, display: 'flex', alignItems: 'flex-end' }}>
            <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxHeight: '82%', background: '#fff', borderRadius: '28px 28px 0 0', padding: '16px 14px 30px', boxSizing: 'border-box', overflowY: 'auto' }}>
              <div style={{ width: 38, height: 4, background: '#cbd5e1', borderRadius: 99, margin: '0 auto 12px' }} />
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, paddingBottom: 8, borderBottom: '1.5px solid #eadcca' }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 900, color: '#2563eb' }}>📝 Phê Duyệt Đơn Nghỉ Phép</div>
                  <div style={{ fontSize: 11, color: '#725f50' }}>{pendingLeaves.length} đơn đang chờ duyệt</div>
                </div>
                <button onClick={() => setActiveSheet(null)} style={{ width: 28, height: 28, borderRadius: 8, background: '#f4efe8', border: 'none', fontWeight: 900, cursor: 'pointer' }}>✕</button>
              </div>

              {pendingLeaves.length === 0 && (
                <div style={{ textAlign: 'center', padding: '20px 0', color: '#725f50', fontSize: 13 }}>Không có đơn nghỉ phép nào đang chờ.</div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {pendingLeaves.map((l: any) => (
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
        )}

        {/* ========================================================================= */}
        {/* ── BOTTOM SHEET: 7. BÁO CÁO CA NGÀY ── */}
        {/* ========================================================================= */}
        {activeSheet === 'report_sheet' && (
          <div className="sheet-overlay" onClick={() => setActiveSheet(null)} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(2px)', zIndex: 1200, display: 'flex', alignItems: 'flex-end' }}>
            <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxHeight: '82%', background: '#fff', borderRadius: '28px 28px 0 0', padding: '16px 14px 30px', boxSizing: 'border-box', overflowY: 'auto' }}>
              <div style={{ width: 38, height: 4, background: '#cbd5e1', borderRadius: 99, margin: '0 auto 12px' }} />
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, paddingBottom: 8, borderBottom: '1.5px solid #eadcca' }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 900, color: '#db2777' }}>📋 Tổng Hợp Báo Cáo Ca Ngày</div>
                  <div style={{ fontSize: 11, color: '#725f50' }}>{shiftReports.length} báo cáo cuối ca đã nộp hôm nay</div>
                </div>
                <button onClick={() => setActiveSheet(null)} style={{ width: 28, height: 28, borderRadius: 8, background: '#f4efe8', border: 'none', fontWeight: 900, cursor: 'pointer' }}>✕</button>
              </div>

              {shiftReports.length === 0 && (
                <div style={{ textAlign: 'center', padding: '20px 0', color: '#725f50', fontSize: 13 }}>Chưa có báo cáo cuối ca nào hôm nay.</div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {shiftReports.map((r: any) => (
                  <div key={r.id} style={{ background: '#faf6f0', border: '1.5px solid #eadcca', borderRadius: 12, padding: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div style={{ fontSize: 13, fontWeight: 900, color: '#2d1c10' }}>👤 {r.staff_name}{r.station ? ` · ${r.station}` : ''}</div>
                      <div style={{ fontSize: 10.5, color: '#725f50' }}>{new Date(r.created_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}</div>
                    </div>
                    <div style={{ fontSize: 11.5, color: '#493526', marginTop: 2 }}>
                      Doanh thu ca: <strong>{formatVND(r.revenue)}</strong> · Tiền mặt bàn giao: <strong>{formatVND(r.cash_handover)}</strong>
                      {r.stock_remaining != null && <> · Tồn kho: <strong>{r.stock_remaining}</strong></>}
                    </div>
                    {r.note && <div style={{ fontSize: 11, color: '#725f50', marginTop: 2 }}>Ghi chú: {r.note}</div>}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* ── BOTTOM SHEET: 8. LỊCH PHÂN CA LÀM VIỆC ── */}
        {/* ========================================================================= */}
        {activeSheet === 'schedule_sheet' && (
          <div className="sheet-overlay" onClick={() => setActiveSheet(null)} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(2px)', zIndex: 1200, display: 'flex', alignItems: 'flex-end' }}>
            <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxHeight: '82%', background: '#fff', borderRadius: '28px 28px 0 0', padding: '16px 14px 30px', boxSizing: 'border-box', overflowY: 'auto' }}>
              <div style={{ width: 38, height: 4, background: '#cbd5e1', borderRadius: 99, margin: '0 auto 12px' }} />
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, paddingBottom: 8, borderBottom: '1.5px solid #eadcca' }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 900, color: '#9333ea' }}>📅 Lịch Phân Ca Tuần — 5 Khu Vực</div>
                  <div style={{ fontSize: 11, color: '#725f50' }}>
                    {weeklySchedule.from && new Date(weeklySchedule.from).toLocaleDateString('vi-VN')} - {weeklySchedule.to && new Date(weeklySchedule.to).toLocaleDateString('vi-VN')} · {weeklySchedule.totalAssignments} lượt phân ca · Bakery · Bếp Nóng · Bếp Lạnh · Xưởng 41 · Xưởng 42
                  </div>
                </div>
                <button onClick={() => setActiveSheet(null)} style={{ width: 28, height: 28, borderRadius: 8, background: '#f4efe8', border: 'none', fontWeight: 900, cursor: 'pointer' }}>✕</button>
              </div>

              {weeklySchedule.totalAssignments === 0 && (
                <div style={{ textAlign: 'center', padding: '20px 0', color: '#725f50', fontSize: 13 }}>Chưa có ca nào được phân trong tuần này.</div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {weeklySchedule.days.map((day: any) => {
                  const sang = day['Sáng'] as any[];
                  const chieu = day['Chiều'] as any[];
                  if (sang.length === 0 && chieu.length === 0) return null;
                  return (
                    <div key={day.date} style={{ background: '#faf6f0', border: '1px solid #eadcca', borderRadius: 10, padding: 8 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 900, color: '#2d1c10' }}>{day.dow} · {new Date(day.date).toLocaleDateString('vi-VN')}</div>
                      {sang.length > 0 && (
                        <div style={{ fontSize: 11, color: '#725f50', marginTop: 3 }}>
                          <strong>Ca Sáng ({sang.length}):</strong> {sang.map((s: any) => `${s.staff_name} (${s.stationLabel})`).join(', ')}
                        </div>
                      )}
                      {chieu.length > 0 && (
                        <div style={{ fontSize: 11, color: '#725f50', marginTop: 3 }}>
                          <strong>Ca Chiều ({chieu.length}):</strong> {chieu.map((s: any) => `${s.staff_name} (${s.stationLabel})`).join(', ')}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* ── SIDE DRAWER: DANH SÁCH ĐƠN HÀNG ƯU TIÊN THỜI GIAN THEO TỪNG BỘ LỌC ── */}
        {/* ========================================================================= */}
        {activeSheet === 'order_drawer' && (
          <div className="sheet-overlay" onClick={() => setActiveSheet(null)} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(2px)', zIndex: 1300, display: 'flex', alignItems: 'flex-end' }}>
            <div onClick={e => e.stopPropagation()} style={{ width: '100%', height: '86%', background: '#fff', borderRadius: '28px 28px 0 0', padding: '16px 14px 30px', boxSizing: 'border-box', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
              <div style={{ width: 38, height: 4, background: '#cbd5e1', borderRadius: 99, margin: '0 auto 12px' }} />
              
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, paddingBottom: 8, borderBottom: '1.5px solid #eadcca' }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 900, color: '#2d1c10' }}>
                    🧾 Danh Sách Đơn Hàng ({filteredOrders.length} đơn)
                  </div>
                  <div style={{ fontSize: 11, color: '#dc2626', fontWeight: 800 }}>
                    ⬇️ Sắp xếp ưu tiên giảm dần từ trên xuống dưới
                  </div>
                </div>
                <button onClick={() => setActiveSheet(null)} style={{ width: 28, height: 28, borderRadius: 8, background: '#f4efe8', border: 'none', fontWeight: 900, cursor: 'pointer' }}>✕</button>
              </div>

              {/* Thanh lọc trạng thái con bên trong Drawer */}
              <div style={{ display: 'flex', gap: 4, overflowX: 'auto', paddingBottom: 8, marginBottom: 8 }}>
                <button
                  onClick={() => setSelectedOrderFilter('all')}
                  style={{
                    padding: '5px 10px',
                    borderRadius: 99,
                    border: '1px solid #eadcca',
                    background: selectedOrderFilter === 'all' ? '#2d1c10' : '#fff',
                    color: selectedOrderFilter === 'all' ? '#ffd284' : '#725f50',
                    fontSize: 11,
                    fontWeight: 800,
                    whiteSpace: 'nowrap',
                    cursor: 'pointer'
                  }}
                >
                  Tất cả ({orderCounts.total})
                </button>
                <button
                  onClick={() => setSelectedOrderFilter('in_production')}
                  style={{
                    padding: '5px 10px',
                    borderRadius: 99,
                    border: '1px solid #eadcca',
                    background: selectedOrderFilter === 'in_production' ? '#2d1c10' : '#fff',
                    color: selectedOrderFilter === 'in_production' ? '#ffd284' : '#725f50',
                    fontSize: 11,
                    fontWeight: 800,
                    whiteSpace: 'nowrap',
                    cursor: 'pointer'
                  }}
                >
                  👩‍🍳 Đang làm ({orderCounts.production})
                </button>
                <button
                  onClick={() => setSelectedOrderFilter('ready_for_fulfillment')}
                  style={{
                    padding: '5px 10px',
                    borderRadius: 99,
                    border: '1px solid #eadcca',
                    background: selectedOrderFilter === 'ready_for_fulfillment' ? '#2d1c10' : '#fff',
                    color: selectedOrderFilter === 'ready_for_fulfillment' ? '#ffd284' : '#725f50',
                    fontSize: 11,
                    fontWeight: 800,
                    whiteSpace: 'nowrap',
                    cursor: 'pointer'
                  }}
                >
                  📦 Chờ giao ({orderCounts.ready})
                </button>
                <button
                  onClick={() => setSelectedOrderFilter('overdue')}
                  style={{
                    padding: '5px 10px',
                    borderRadius: 99,
                    border: '1px solid #eadcca',
                    background: selectedOrderFilter === 'overdue' ? '#dc2626' : '#fff',
                    color: selectedOrderFilter === 'overdue' ? '#fff' : '#dc2626',
                    fontSize: 11,
                    fontWeight: 800,
                    whiteSpace: 'nowrap',
                    cursor: 'pointer'
                  }}
                >
                  ⚠️ Trễ hạn ({orderCounts.overdue})
                </button>
              </div>

              {/* Danh sách đơn hàng ưu tiên */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, overflowY: 'auto' }}>
                {filteredOrders.map((ord: any, idx: number) => {
                  const flow = ORDER_FLOWS.find((f) => f.key === ord.order_type);
                  const statusLabelMap: Record<string, string> = {
                    awaiting_assignment: 'Đơn chờ làm 📥', awaiting_acceptance: 'Đơn chờ làm 📥',
                    in_production: 'Bếp đang làm 👩‍🍳', ready_for_fulfillment: 'Chờ vận chuyển 📦',
                    in_delivery: 'Đang vận chuyển 🛵', completed: 'Giao thành công ✅',
                  };
                  return (
                    <div
                      key={ord.id}
                      style={{
                        background: ord.is_overdue ? '#fff9f0' : '#fff',
                        border: ord.is_overdue ? '2px solid #f59e0b' : '1.5px solid #eadcca',
                        borderRadius: 14,
                        padding: 10
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

                      <div style={{ fontSize: 13, fontWeight: 900, color: '#2d1c10' }}>{flow ? `${flow.icon} ${flow.title}` : ord.order_type} · {ord.total_quantity} sản phẩm</div>
                      <div style={{ fontSize: 11.5, color: '#493526', margin: '2px 0' }}>• Người tạo: {ord.created_by_name || 'Không rõ'}</div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6, paddingTop: 4, borderTop: '1px solid #f2e9de' }}>
                        <span style={{ fontSize: 11, fontWeight: 800, color: ord.status_v2 === 'completed' ? '#16a34a' : ord.is_overdue ? '#dc2626' : '#138a53' }}>
                          {ord.is_overdue ? 'Chưa thực hiện ⚠️' : (statusLabelMap[ord.status_v2] || ord.status_v2)}
                        </span>
                      </div>
                    </div>
                  );
                })}

                {filteredOrders.length === 0 && (
                  <div style={{ textAlign: 'center', padding: '20px 0', color: '#725f50', fontSize: 13 }}>
                    Không có đơn hàng nào ở trạng thái này.
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
          <div className="sheet-overlay" onClick={() => setActiveSheet(null)} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(2px)', zIndex: 1200, display: 'flex', alignItems: 'flex-end' }}>
            <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxHeight: '85%', background: '#fff', borderRadius: '28px 28px 0 0', padding: '16px 14px 30px', boxSizing: 'border-box', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
              <div style={{ width: 38, height: 4, background: '#cbd5e1', borderRadius: 99, margin: '0 auto 12px' }} />
              
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, paddingBottom: 8, borderBottom: '1.5px solid #eadcca' }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 900, color: '#2d1c10' }}>
                    👥 Chi Tiết Trạng Thái Nhân Sự ({staffCounts.total} NV)
                  </div>
                  <div style={{ fontSize: 11, color: '#725f50' }}>
                    Theo dõi chấm công & hiện diện 3 phân xưởng hôm nay
                  </div>
                </div>
                <button onClick={() => setActiveSheet(null)} style={{ width: 28, height: 28, borderRadius: 8, background: '#f4efe8', border: 'none', fontWeight: 900, cursor: 'pointer' }}>✕</button>
              </div>

              {/* 3 Tab chuyển đổi luồng nhân sự */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginBottom: 12 }}>
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

              {/* Danh sách nhân viên theo từng tab */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, overflowY: 'auto' }}>
                
                {/* 1. Luồng: ĐANG LÀM VIỆC */}
                {selectedStaffTab === 'working' && (
                  <>
                    <div style={{ fontSize: 11.5, fontWeight: 800, color: '#15803d', marginBottom: 2 }}>
                      ✓ Danh sách nhân viên có mặt đúng giờ ({staffCounts.working} nhân sự):
                    </div>
                    {staffList.filter(st => st.status === 'working').map(st => (
                      <div key={st.id} style={{ background: '#faf6f0', border: '1.5px solid #dcfce7', borderRadius: 14, padding: '10px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <span style={{ fontSize: 24 }}>{st.avatar}</span>
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 900, color: '#2d1c10' }}>{st.name}</div>
                            <div style={{ fontSize: 11, color: '#725f50', marginTop: 1 }}>{st.role} · <strong>[{st.zone}]</strong></div>
                            <div style={{ fontSize: 10.5, color: '#15803d', fontWeight: 800, marginTop: 2 }}>⏰ Vào ca: {st.checkinTime} ({st.note}) · {st.shift}</div>
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
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
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
                          <div>⏰ <strong>Giờ vào ca:</strong> {st.checkinTime} (Quy định 06:00)</div>
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
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
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
        )}

        {/* Home Indicator Bar */}
        <div style={{ width: 135, height: 4.5, background: '#2d1c10', borderRadius: 99, position: 'absolute', bottom: 6, left: '50%', transform: 'translateX(-50%)', zIndex: 1000, opacity: 0.8 }} />

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
          <div style={{ position: 'absolute', inset: 0, background: '#faf6f0', zIndex: 1500, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 8 }}>
            <div style={{ width: 32, height: 32, border: '3px solid #eadcca', borderTopColor: '#c28c4e', borderRadius: '50%', animation: 'sumi-boss-spin 0.8s linear infinite' }} />
            <div style={{ fontSize: 12, fontWeight: 700, color: '#8a7a66' }}>Đang tải dữ liệu thật...</div>
            <style>{`@keyframes sumi-boss-spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        )}

      </div>

    </div>
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
