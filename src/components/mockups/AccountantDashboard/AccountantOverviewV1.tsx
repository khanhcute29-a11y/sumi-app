import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  Bell,
  Plus,
  Receipt,
  X,
  Home,
  Megaphone,
  CheckSquare,
  DollarSign,
  Camera,
  Wallet,
  Users
} from 'lucide-react';
import { supabase } from '../../../lib/supabaseClient';
import { fetchMyProfile } from '../../../lib/queries';
import {
  fetchReadyToPayExpenses,
  markExpensePaid,
  rejectExpense,
  fetchReadyToPayAdvances,
  payAdvance,
  rejectAdvance,
  fetchPendingDirectorTotals,
  fetchLedgerForMonth,
  fetchWagesSummaryForMonth,
  submitMyExpenseClaim,
  monthKeyOf
} from '../../../lib/accountantOverviewV1';
import { ErrorBoundary } from '../../ErrorBoundary';

const formatVND = (amount: number) => {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(Number(amount) || 0);
};

const formatCompact = (n: number) => {
  const v = Number(n) || 0;
  if (v >= 1000000) {
    const t = v / 1000000;
    return `${Number.isInteger(t) ? t.toFixed(0) : t.toFixed(1)}tr`;
  }
  if (v >= 1000) return `${Math.round(v / 1000)}k`;
  return String(v);
};

const formatTime = (iso?: string | null) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });
};

const PAY_METHOD_LABEL: Record<string, string> = {
  cash: 'cần chi tiền mặt',
  bank_transfer: 'cần chuyển khoản'
};

function AccountantOverviewV1Inner({ embedded = false }: { embedded?: boolean }) {
  // ── Hồ sơ đăng nhập (phòng thủ: mọi truy cập profile đều optional-chained) ──
  const [profile, setProfile] = useState<any | null>(null);
  const [profileError, setProfileError] = useState('');

  // ── Tab Bar Navigation (Chờ chi, Tạm ứng, Sổ chi, Lương/KPI) ──
  const [activeTab, setActiveTab] = useState<'pending' | 'advance' | 'ledger' | 'payroll'>('pending');

  // ── Active Bottom Sheet State ──
  const [activeSheet, setActiveSheet] = useState<
    'detail' | 'create_expense' | 'cash_count' | 'notifications' | null
  >(null);

  // ── Selected Request for Detail Sheet ──
  const [selectedRequest, setSelectedRequest] = useState<any | null>(null);
  const [selectedType, setSelectedType] = useState<'expense' | 'advance'>('expense');
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [rejectNote, setRejectNote] = useState('');
  const [actionBusy, setActionBusy] = useState(false);

  // ── Toast Alert ──
  const [toast, setToast] = useState('');
  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  };

  // ── Khóa Cuộn Nền & Kéo Vuốt Đóng Sheet ──
  const [dragY, setDragY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartY = useRef(0);

  useEffect(() => {
    if (activeSheet) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    setDragY(0);
    setIsDragging(false);
    return () => {
      document.body.style.overflow = 'unset';
    };
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
  const sheetDragHandlers = {
    onTouchStart: handleSheetTouchStart,
    onTouchMove: handleSheetTouchMove,
    onTouchEnd: handleSheetTouchEnd
  };

  // =========================================================================
  // ── DỮ LIỆU THẬT TỪ SUPABASE (expense_claims / salary_advance_requests) ──
  // =========================================================================
  const [expenseRequests, setExpenseRequests] = useState<any[]>([]);
  const [advanceRequests, setAdvanceRequests] = useState<any[]>([]);
  const [directorTotals, setDirectorTotals] = useState({ count: 0, total: 0 });
  const [ledgerEntries, setLedgerEntries] = useState<any[]>([]);
  const [payrollSummary, setPayrollSummary] = useState<{ periodStatus: string | null; rows: any[] }>({ periodStatus: null, rows: [] });
  const [loadingPending, setLoadingPending] = useState(true);
  const [loadingAdvance, setLoadingAdvance] = useState(true);
  const [loadingLedger, setLoadingLedger] = useState(true);
  const [loadingPayroll, setLoadingPayroll] = useState(true);

  const monthKey = monthKeyOf();
  const actualCountTouched = useRef(false);
  const [actualCount, setActualCount] = useState(0);

  const loadPending = useCallback(async () => {
    setLoadingPending(true);
    try {
      setExpenseRequests(await fetchReadyToPayExpenses());
    } catch (e: any) {
      showToast(`⚠️ ${e?.message || 'Không tải được danh sách chờ chi'}`);
    } finally {
      setLoadingPending(false);
    }
  }, []);

  const loadAdvances = useCallback(async () => {
    setLoadingAdvance(true);
    try {
      setAdvanceRequests(await fetchReadyToPayAdvances());
    } catch (e: any) {
      showToast(`⚠️ ${e?.message || 'Không tải được danh sách tạm ứng'}`);
    } finally {
      setLoadingAdvance(false);
    }
  }, []);

  const loadDirectorTotals = useCallback(async () => {
    try {
      setDirectorTotals(await fetchPendingDirectorTotals());
    } catch {
      /* Chỉ ảnh hưởng ô số liệu tổng hợp, không chặn màn hình chính */
    }
  }, []);

  const loadLedger = useCallback(async () => {
    setLoadingLedger(true);
    try {
      const rows = await fetchLedgerForMonth(monthKey);
      setLedgerEntries(rows);
      if (!actualCountTouched.current) {
        const net = rows.reduce((s: number, r: any) => s + (r?.type === 'thu' ? Number(r?.amount) || 0 : -(Number(r?.amount) || 0)), 0);
        setActualCount(net);
      }
    } catch (e: any) {
      showToast(`⚠️ ${e?.message || 'Không tải được sổ chi'}`);
    } finally {
      setLoadingLedger(false);
    }
  }, [monthKey]);

  const loadPayroll = useCallback(async () => {
    setLoadingPayroll(true);
    try {
      setPayrollSummary(await fetchWagesSummaryForMonth(monthKey));
    } catch (e: any) {
      showToast(`⚠️ ${e?.message || 'Không tải được bảng lương/KPI'}`);
    } finally {
      setLoadingPayroll(false);
    }
  }, [monthKey]);

  useEffect(() => {
    fetchMyProfile().then(setProfile).catch((e: any) => setProfileError(e?.message || 'Không tải được hồ sơ'));
    loadPending();
    loadAdvances();
    loadDirectorTotals();
    loadLedger();
    loadPayroll();

    const channel = supabase
      .channel('accountant-overview-v1-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'expense_claims' }, () => {
        loadPending();
        loadDirectorTotals();
        loadLedger();
        loadPayroll();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'salary_advance_requests' }, () => {
        loadAdvances();
        loadDirectorTotals();
        loadLedger();
        loadPayroll();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cashBalance = useMemo(
    () => ledgerEntries.reduce((s, r) => s + (r?.type === 'thu' ? Number(r?.amount) || 0 : -(Number(r?.amount) || 0)), 0),
    [ledgerEntries]
  );
  const cashDifference = actualCount - cashBalance;

  const pendingCount = expenseRequests.length;
  const advanceCount = advanceRequests.length;
  const notifyCount = pendingCount + advanceCount;

  // ── Xử lý khi click vào thẻ danh sách để mở Bottom Sheet chi tiết ──
  const handleCardClick = (req: any, type: 'expense' | 'advance') => {
    setSelectedRequest(req);
    setSelectedType(type);
    setShowRejectForm(false);
    setRejectNote('');
    setActiveSheet('detail');
  };

  // ── Hành động: Đã chi tiền (record_expense_claim / pay_salary_advance) ──
  const handlePay = async () => {
    if (!selectedRequest || actionBusy) return;
    setActionBusy(true);
    try {
      if (selectedType === 'expense') {
        await markExpensePaid(selectedRequest.id);
      } else {
        await payAdvance(selectedRequest.id);
      }
      const label = selectedType === 'expense' ? selectedRequest?.description : selectedRequest?.employee_name;
      showToast(`⚡ Đã chi ${formatVND(selectedRequest?.amount)} cho "${label || ''}"!`);
      setActiveSheet(null);
      loadPending();
      loadAdvances();
      loadLedger();
      loadPayroll();
    } catch (e: any) {
      showToast(`⚠️ ${e?.message || 'Không thực hiện được thao tác chi tiền'}`);
    } finally {
      setActionBusy(false);
    }
  };

  // ── Hành động: Từ chối / Trả lại (chỉ khả dụng ở giai đoạn chờ Kế toán chi) ──
  const handleReject = async () => {
    if (!selectedRequest || actionBusy) return;
    setActionBusy(true);
    try {
      if (selectedType === 'expense') {
        await rejectExpense(selectedRequest.id, rejectNote);
      } else {
        await rejectAdvance(selectedRequest.id, rejectNote);
      }
      showToast('✕ Đã trả lại yêu cầu cho nhân viên!');
      setActiveSheet(null);
      loadPending();
      loadAdvances();
    } catch (e: any) {
      showToast(`⚠️ ${e?.message || 'Không trả lại được yêu cầu này'}`);
    } finally {
      setActionBusy(false);
    }
  };

  // ── Form Kế toán tự báo 1 khoản chi (luôn phải qua Giám đốc duyệt) ──
  const [newTitle, setNewTitle] = useState('');
  const [newAmount, setNewAmount] = useState<number | ''>('');
  const [newNote, setNewNote] = useState('');
  const [creatingExpense, setCreatingExpense] = useState(false);

  const handleCreateNewExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newAmount) {
      showToast('⚠️ Vui lòng nhập đầy đủ tên khoản chi và số tiền!');
      return;
    }
    setCreatingExpense(true);
    try {
      await submitMyExpenseClaim({
        amount: Number(newAmount),
        description: newTitle.trim(),
        note: newNote.trim() || null,
        occurredAt: new Date().toISOString()
      });
      showToast('✓ Đã gửi khoản chi — chờ Giám đốc duyệt trước khi chi tiền!');
      setNewTitle('');
      setNewAmount('');
      setNewNote('');
      setActiveSheet(null);
      loadDirectorTotals();
    } catch (e2: any) {
      showToast(`⚠️ ${e2?.message || 'Không gửi được khoản chi'}`);
    } finally {
      setCreatingExpense(false);
    }
  };

  // =========================================================================
  // ── HELPER PORTAL CONTAINER (GHIM CỨNG SÁT ĐÁY MÀN HÌNH ĐIỆN THOẠI) ──
  // =========================================================================
  const renderPortalSheet = (title: string, subtitle: string, content: React.ReactNode) => {
    if (!activeSheet) return null;
    return createPortal(
      <div
        className="fixed inset-0 z-[9998] flex flex-col justify-end"
        style={{ position: 'fixed', inset: 0, zIndex: 9998 }}
      >
        {/* Backdrop Nền Mờ Ghim Cứng Viewport */}
        <div
          className="fixed inset-0 bg-black/65 backdrop-blur-[2px] transition-opacity duration-200"
          style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(3px)', zIndex: 9998 }}
          onClick={() => setActiveSheet(null)}
        />

        {/* Bottom Sheet Container Ghim Cứng Sát Đáy */}
        <div
          className="fixed bottom-0 left-0 right-0 w-full max-w-[420px] mx-auto bg-[#FFFCF7] rounded-t-[28px] shadow-2xl flex flex-col overflow-hidden z-[9999]"
          style={{
            position: 'fixed',
            bottom: 0,
            left: 0,
            right: 0,
            width: '100%',
            maxWidth: 420,
            margin: '0 auto',
            maxHeight: '85vh',
            backgroundColor: '#FFFCF7',
            borderTop: '2px solid #D68A3E',
            borderRadius: '28px 28px 0 0',
            boxShadow: '0 -10px 40px rgba(0,0,0,0.3)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            zIndex: 9999,
            transform: `translateY(${dragY}px)`,
            transition: isDragging ? 'none' : 'transform 0.3s cubic-bezier(0.25, 0.8, 0.25, 1)',
            willChange: 'transform'
          }}
          {...sheetDragHandlers}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Sticky Header Cố Định Sát Trên Cùng */}
          <div
            style={{
              position: 'sticky',
              top: 0,
              backgroundColor: '#FFFCF7',
              zIndex: 10,
              borderBottom: '1px solid rgba(74,38,16,0.12)',
              padding: '12px 16px 10px',
              display: 'flex',
              flexDirection: 'column'
            }}
          >
            <div
              style={{
                width: 42,
                height: 4,
                backgroundColor: '#cbd5e1',
                borderRadius: 99,
                margin: '0 auto 8px',
                cursor: 'grab'
              }}
            />
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <h3 style={{ fontSize: 16, fontWeight: 900, color: '#2d1b10', margin: 0 }}>{title}</h3>
                {subtitle && <p style={{ fontSize: 11, color: '#6B5B48', margin: '2px 0 0', fontWeight: 500 }}>{subtitle}</p>}
              </div>
              <button
                onClick={() => setActiveSheet(null)}
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: 10,
                  backgroundColor: '#FAF5EC',
                  border: '1px solid rgba(74,38,16,0.12)',
                  fontWeight: 900,
                  fontSize: 13,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#2d1b10'
                }}
              >
                <X size={18} />
              </button>
            </div>
          </div>

          {/* Vùng Cuộn Độc Lập Chứa Dữ Liệu */}
          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              WebkitOverflowScrolling: 'touch',
              padding: '16px 16px calc(24px + env(safe-area-inset-bottom))',
              boxSizing: 'border-box'
            }}
          >
            {content}
          </div>
        </div>
      </div>,
      document.body
    );
  };

  const badgePill = (label: string, tone: 'success' | 'info' = 'success') => (
    <span
      style={{
        display: 'inline-block',
        fontSize: 10,
        fontWeight: 800,
        padding: '2px 8px',
        borderRadius: 99,
        backgroundColor: tone === 'success' ? '#e6f4ea' : '#e0f2fe',
        color: tone === 'success' ? '#0d8a4f' : '#0369a1'
      }}
    >
      {label}
    </span>
  );

  const renderCard = (opts: { icon: string; title: string; subtitle: string; badge: React.ReactNode; amount: number; onClick: () => void }) => (
    <div
      key={opts.title + opts.amount}
      onClick={opts.onClick}
      style={{
        backgroundColor: '#FFFCF7',
        border: '1px solid rgba(74, 38, 16, 0.12)',
        borderRadius: 18,
        padding: '12px 14px',
        cursor: 'pointer',
        boxShadow: '0 2px 6px rgba(0,0,0,0.02)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 10
      }}
      className="active:scale-[0.98]"
    >
      <div
        style={{
          width: 44,
          height: 44,
          borderRadius: 14,
          backgroundColor: '#faedd9',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 22,
          flexShrink: 0
        }}
      >
        {opts.icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: '#2d1b10', lineHeight: 1.25, marginBottom: 2 }}>{opts.title}</div>
        <div style={{ fontSize: 11, color: '#7a6858', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {opts.subtitle}
        </div>
        <div style={{ marginTop: 4 }}>{opts.badge}</div>
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <div style={{ fontSize: 15.5, fontWeight: 900, color: '#4A2610', fontFamily: 'monospace' }}>{formatVND(opts.amount)}</div>
      </div>
    </div>
  );

  const emptyState = (msg: string) => (
    <div
      style={{
        backgroundColor: '#FFFCF7',
        border: '1px dashed rgba(74, 38, 16, 0.18)',
        borderRadius: 18,
        padding: '24px',
        textAlign: 'center',
        color: '#7a6858',
        fontSize: 12.5,
        fontWeight: 700
      }}
    >
      {msg}
    </div>
  );

  const sectionHeader = (label: string, count: number) => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, padding: '0 2px' }}>
      <span style={{ fontSize: 11, fontWeight: 900, color: '#7a6858', letterSpacing: '.05em', textTransform: 'uppercase' }}>{label}</span>
      <span style={{ fontSize: 11.5, fontWeight: 900, color: '#b45309' }}>{count} KHOẢN</span>
    </div>
  );

  return (
    <div
      style={{
        backgroundColor: '#fffaf2',
        minHeight: '100vh',
        color: '#2d1b10',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        boxSizing: 'border-box'
      }}
      className={embedded ? 'p-4 pb-8 w-full flex flex-col relative overflow-x-hidden' : 'p-4 pb-28 max-w-[420px] mx-auto flex flex-col relative overflow-x-hidden'}
    >
      {/* ========================================================================= */}
      {/* 1. KHỐI HEADER CHOCOLATE BO TRÒN THẪM (BG-[#3d2314]) */}
      {/* ========================================================================= */}
      <div
        style={{
          background: 'linear-gradient(180deg, #3d2314 0%, #29170d 100%)',
          borderRadius: 24,
          padding: '16px',
          boxShadow: '0 4px 16px rgba(45, 27, 16, 0.15)',
          color: '#ffffff',
          marginBottom: 14
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: 12,
                backgroundColor: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 2px 6px rgba(0,0,0,0.1)'
              }}
            >
              <Receipt size={22} color="#3d2314" strokeWidth={2} />
            </div>
            <div>
              <div style={{ fontSize: 10.5, fontWeight: 900, color: '#f5d0a9', letterSpacing: '.06em', textTransform: 'uppercase' }}>
                KẾ TOÁN SUMI
              </div>
              <h1 style={{ fontSize: 18, fontWeight: 900, margin: 0, color: '#ffffff', lineHeight: 1.15 }}>
                Duyệt chi &amp; tạm ứng
              </h1>
            </div>
          </div>

          <button
            onClick={() => setActiveSheet('notifications')}
            style={{
              position: 'relative',
              width: 36,
              height: 36,
              borderRadius: 12,
              backgroundColor: 'rgba(255, 255, 255, 0.12)',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              color: '#f5d0a9'
            }}
          >
            <Bell size={18} />
            {notifyCount > 0 && (
              <span
                style={{
                  position: 'absolute',
                  top: -4,
                  right: -4,
                  minWidth: 17,
                  height: 17,
                  padding: '0 3px',
                  borderRadius: 99,
                  backgroundColor: '#dc2626',
                  color: '#fff',
                  fontSize: 10,
                  fontWeight: 900,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: '2px solid #3d2314'
                }}
              >
                {notifyCount}
              </span>
            )}
          </button>
        </div>

        {/* Lưới 4 Ô Gạch Chỉ Số Tài Chính (Hero Metrics Grid) */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
          <div style={{ backgroundColor: 'rgba(255, 255, 255, 0.1)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: 14, padding: '8px 4px', textAlign: 'center' }}>
            <div style={{ fontSize: 18, fontWeight: 900, color: '#ffffff', fontFamily: 'monospace' }}>{loadingPending ? '—' : pendingCount}</div>
            <div style={{ fontSize: 10.5, color: 'rgba(255, 255, 255, 0.75)', fontWeight: 600, marginTop: 2 }}>chờ chi</div>
          </div>

          <div style={{ backgroundColor: 'rgba(255, 255, 255, 0.1)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: 14, padding: '8px 4px', textAlign: 'center' }}>
            <div style={{ fontSize: 18, fontWeight: 900, color: '#ffffff', fontFamily: 'monospace' }}>{loadingAdvance ? '—' : advanceCount}</div>
            <div style={{ fontSize: 10.5, color: 'rgba(255, 255, 255, 0.75)', fontWeight: 600, marginTop: 2 }}>tạm ứng</div>
          </div>

          <div style={{ backgroundColor: 'rgba(255, 255, 255, 0.1)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: 14, padding: '8px 4px', textAlign: 'center' }}>
            <div style={{ fontSize: 17, fontWeight: 900, color: '#ffffff', fontFamily: 'monospace' }}>{formatCompact(directorTotals.total)}</div>
            <div style={{ fontSize: 10.5, color: 'rgba(255, 255, 255, 0.75)', fontWeight: 600, marginTop: 2 }}>cần duyệt</div>
          </div>

          <div style={{ backgroundColor: 'rgba(255, 255, 255, 0.1)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: 14, padding: '8px 4px', textAlign: 'center' }}>
            <div style={{ fontSize: 18, fontWeight: 900, color: '#ffffff', fontFamily: 'monospace' }}>{formatCompact(cashDifference)}</div>
            <div style={{ fontSize: 10.5, color: 'rgba(255, 255, 255, 0.75)', fontWeight: 600, marginTop: 2 }}>lệch quỹ</div>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 2. THANH TAB ĐIỀU HƯỚNG DẠNG CAPSULE (TAB BAR) */}
      {/* ========================================================================= */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 14, overflowX: 'auto', paddingBottom: 2 }}>
        {([
          ['pending', 'Chờ chi'],
          ['advance', 'Tạm ứng'],
          ['ledger', 'Sổ chi'],
          ['payroll', 'Lương/KPI']
        ] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            style={{
              backgroundColor: activeTab === key ? '#2d1b10' : '#ffffff',
              color: activeTab === key ? '#ffffff' : '#2d1b10',
              border: activeTab === key ? 'none' : '1px solid #e5e5e5',
              borderRadius: 99,
              padding: '8px 16px',
              fontSize: 13,
              fontWeight: 800,
              cursor: 'pointer',
              boxShadow: activeTab === key ? '0 2px 6px rgba(45, 27, 16, 0.2)' : 'none',
              whiteSpace: 'nowrap'
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ========================================================================= */}
      {/* 3. HÀNG NÚT HÀNH ĐỘNG NHANH (QUICK ACTIONS - 2 NÚT 50/50) */}
      {/* ========================================================================= */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
        <button
          onClick={() => setActiveSheet('create_expense')}
          style={{
            backgroundColor: '#1e7e4e',
            color: '#ffffff',
            border: 'none',
            borderRadius: 14,
            padding: '12px 10px',
            fontSize: 13.5,
            fontWeight: 900,
            cursor: 'pointer',
            boxShadow: '0 3px 10px rgba(30, 126, 78, 0.25)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6
          }}
        >
          <Plus size={18} strokeWidth={2.5} /> + Ghi khoản chi
        </button>

        <button
          onClick={() => setActiveSheet('cash_count')}
          style={{
            backgroundColor: '#ffffff',
            color: '#2d1b10',
            border: '1px solid rgba(45, 27, 16, 0.12)',
            borderRadius: 14,
            padding: '12px 10px',
            fontSize: 13.5,
            fontWeight: 900,
            cursor: 'pointer',
            boxShadow: '0 2px 6px rgba(0,0,0,0.03)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          Chốt quỹ ngày
        </button>
      </div>

      {/* ========================================================================= */}
      {/* 4. KHỐI "VÒNG ĐỜI KHOẢN CHI" (WORKFLOW STEPPER CARD) */}
      {/* ========================================================================= */}
      <div style={{ backgroundColor: '#1f1610', borderRadius: 20, padding: '14px', color: '#ffffff', marginBottom: 16, boxShadow: '0 4px 12px rgba(31, 22, 16, 0.2)' }}>
        <div style={{ fontSize: 13.5, fontWeight: 900, color: '#ffffff', marginBottom: 10 }}>Vòng đời khoản chi</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
          <div style={{ backgroundColor: 'rgba(255, 255, 255, 0.08)', borderRadius: 10, padding: '8px 4px', textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontSize: 10, color: 'rgba(255, 255, 255, 0.75)', fontWeight: 700 }}>1. Nhân sự gửi</span>
          </div>
          <div style={{ backgroundColor: 'rgba(255, 255, 255, 0.08)', borderRadius: 10, padding: '8px 4px', textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontSize: 10, color: 'rgba(255, 255, 255, 0.75)', fontWeight: 700 }}>2. Sếp duyệt</span>
          </div>
          <div style={{ backgroundColor: '#f5c65a', borderRadius: 10, padding: '8px 4px', textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 6px rgba(245, 198, 90, 0.3)' }}>
            <span style={{ fontSize: 10.5, color: '#1f1610', fontWeight: 900 }}>3. Kế toán chi</span>
          </div>
          <div style={{ backgroundColor: 'rgba(255, 255, 255, 0.08)', borderRadius: 10, padding: '8px 4px', textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontSize: 9.5, color: 'rgba(255, 255, 255, 0.75)', fontWeight: 700, lineHeight: 1.2 }}>4. Vào sổ lương/KPI</span>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 5. NỘI DUNG THEO TAB */}
      {/* ========================================================================= */}
      {activeTab === 'pending' && (
        <>
          {sectionHeader('ĐÃ ĐƯỢC SẾP DUYỆT — CẦN KẾ TOÁN CHI', expenseRequests.length)}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {loadingPending && emptyState('Đang tải danh sách chờ chi…')}
            {!loadingPending && expenseRequests.length === 0 && emptyState('✓ Tuyệt vời! Không còn khoản chi nào chờ kế toán chi tiền.')}
            {!loadingPending &&
              expenseRequests.map((req) =>
                renderCard({
                  icon: '🧾',
                  title: req?.description || 'Khoản chi',
                  subtitle: `${req?.claimant_name || 'Không rõ'}${req?.related_order_code ? ' · đơn #' + req.related_order_code : ''} · ${formatTime(req?.occurred_at)}`,
                  badge: (
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {badgePill('Đã duyệt', 'success')}
                      {req?.related_order_code && badgePill('Liên kết đơn', 'info')}
                    </div>
                  ),
                  amount: req?.amount,
                  onClick: () => handleCardClick(req, 'expense')
                })
              )}
          </div>
        </>
      )}

      {activeTab === 'advance' && (
        <>
          {sectionHeader('GIÁM ĐỐC ĐÃ DUYỆT — CHỜ CHI TẠM ỨNG', advanceRequests.length)}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {loadingAdvance && emptyState('Đang tải danh sách tạm ứng…')}
            {!loadingAdvance && advanceRequests.length === 0 && emptyState('✓ Không có yêu cầu tạm ứng nào chờ chi.')}
            {!loadingAdvance &&
              advanceRequests.map((req) =>
                renderCard({
                  icon: '💰',
                  title: `Tạm ứng lương — ${req?.employee_name || 'Không rõ'}`,
                  subtitle: `${PAY_METHOD_LABEL[req?.payment_method] || req?.payment_method || ''} · cần trước ${req?.needed_on || '—'}`,
                  badge: badgePill('Đã duyệt', 'success'),
                  amount: req?.amount,
                  onClick: () => handleCardClick(req, 'advance')
                })
              )}
          </div>
        </>
      )}

      {activeTab === 'ledger' && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, padding: '0 2px' }}>
            <Wallet size={14} color="#7a6858" />
            <span style={{ fontSize: 11, fontWeight: 900, color: '#7a6858', letterSpacing: '.05em', textTransform: 'uppercase' }}>
              SỔ CHI THÁNG {monthKey}
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {loadingLedger && emptyState('Đang tải sổ chi…')}
            {!loadingLedger && ledgerEntries.length === 0 && emptyState('Chưa có giao dịch nào trong tháng này.')}
            {!loadingLedger &&
              ledgerEntries.map((row: any, i: number) => (
                <div
                  key={row?.id || i}
                  style={{
                    backgroundColor: '#FFFCF7',
                    border: '1px solid rgba(74,38,16,0.12)',
                    borderRadius: 14,
                    padding: '10px 14px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 10
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 800, color: '#2d1b10', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {row?.label || '—'}
                    </div>
                    <div style={{ fontSize: 10.5, color: '#7a6858', marginTop: 2 }}>{formatTime(row?.occurred_at)}</div>
                  </div>
                  <div
                    style={{
                      fontSize: 14,
                      fontWeight: 900,
                      fontFamily: 'monospace',
                      color: row?.type === 'thu' ? '#078653' : '#4A2610',
                      flexShrink: 0
                    }}
                  >
                    {row?.type === 'thu' ? '+' : '−'}
                    {formatVND(row?.amount)}
                  </div>
                </div>
              ))}
          </div>
        </>
      )}

      {activeTab === 'payroll' && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, padding: '0 2px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Users size={14} color="#7a6858" />
              <span style={{ fontSize: 11, fontWeight: 900, color: '#7a6858', letterSpacing: '.05em', textTransform: 'uppercase' }}>
                LƯƠNG/KPI THÁNG {monthKey}
              </span>
            </div>
            {payrollSummary.periodStatus && badgePill(payrollSummary.periodStatus === 'locked' ? 'Đã khóa kỳ' : 'Đang mở', payrollSummary.periodStatus === 'locked' ? 'success' : 'info')}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {loadingPayroll && emptyState('Đang tải bảng lương/KPI…')}
            {!loadingPayroll && !payrollSummary.periodStatus && emptyState('Chưa lập bảng lương cho tháng này.')}
            {!loadingPayroll && payrollSummary.rows.length === 0 && payrollSummary.periodStatus && emptyState('Chưa có tạm ứng/chi hộ nào được ghi nhận tháng này.')}
            {!loadingPayroll &&
              payrollSummary.rows.map((row: any) => (
                <div key={row.employeeId} style={{ backgroundColor: '#FFFCF7', border: '1px solid rgba(74,38,16,0.12)', borderRadius: 14, padding: '10px 14px' }}>
                  <div style={{ fontSize: 13.5, fontWeight: 800, color: '#2d1b10', marginBottom: 6 }}>{row.employeeName}</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, color: '#7a6858' }}>
                    <span>Tạm ứng đã trả</span>
                    <strong style={{ color: '#4A2610', fontFamily: 'monospace' }}>{formatVND(row.advancePaid)}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, color: '#7a6858', marginTop: 2 }}>
                    <span>Chi hộ đã ghi sổ</span>
                    <strong style={{ color: '#4A2610', fontFamily: 'monospace' }}>{formatVND(row.expensesRecorded)}</strong>
                  </div>
                  {row.netPay != null && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginTop: 4, borderTop: '1px solid #eae0d0', paddingTop: 4 }}>
                      <span style={{ color: '#7a6858', fontWeight: 700 }}>Thực nhận</span>
                      <strong style={{ color: '#078653', fontFamily: 'monospace' }}>{formatVND(row.netPay)}</strong>
                    </div>
                  )}
                </div>
              ))}
          </div>
        </>
      )}

      {/* ========================================================================= */}
      {/* 6. THANH BOTTOM NAVIGATION FOOTER TABBAR (chỉ hiện ở route sandbox độc lập — */}
      {/* khi nhúng vào app thật thì dùng thanh điều hướng chung của app, tránh trùng) */}
      {/* ========================================================================= */}
      {!embedded && (
        <div
          style={{
            position: 'fixed',
            bottom: 0,
            left: 0,
            right: 0,
            maxWidth: 420,
            margin: '0 auto',
            backgroundColor: '#ffffff',
            borderTop: '1px solid #eae0d0',
            padding: '8px 12px calc(8px + env(safe-area-inset-bottom))',
            display: 'grid',
            gridTemplateColumns: 'repeat(5, 1fr)',
            alignItems: 'center',
            zIndex: 100
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', cursor: 'pointer' }}>
            <Home size={20} color="#7a6858" />
            <span style={{ fontSize: 10, color: '#7a6858', fontWeight: 600, marginTop: 2 }}>Hôm nay</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', cursor: 'pointer' }}>
            <Megaphone size={20} color="#7a6858" />
            <span style={{ fontSize: 10, color: '#7a6858', fontWeight: 600, marginTop: 2 }}>Bảng tin</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', cursor: 'pointer' }}>
            <Receipt size={20} color="#7a6858" />
            <span style={{ fontSize: 10, color: '#7a6858', fontWeight: 600, marginTop: 2 }}>Đơn hàng</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', cursor: 'pointer' }}>
            <CheckSquare size={20} color="#16a34a" />
            <span style={{ fontSize: 10, color: '#7a6858', fontWeight: 600, marginTop: 2 }}>Việc</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', cursor: 'pointer' }}>
            <div style={{ width: 32, height: 32, borderRadius: '50%', backgroundColor: '#2d1b10', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 6px rgba(45, 27, 16, 0.3)' }}>
              <DollarSign size={18} color="#f5c65a" strokeWidth={2.5} />
            </div>
            <span style={{ fontSize: 10, color: '#2d1b10', fontWeight: 900, marginTop: 2 }}>Kế toán</span>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* ── TOAST NOTIFICATION ── */}
      {/* ========================================================================= */}
      {toast && (
        <div
          style={{
            position: 'fixed',
            bottom: embedded ? 16 : 74,
            left: '50%',
            transform: 'translateX(-50%)',
            backgroundColor: '#2d1b10',
            color: '#ffffff',
            padding: '10px 18px',
            borderRadius: 30,
            fontSize: 12.5,
            fontWeight: 800,
            boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
            zIndex: 10000,
            whiteSpace: 'nowrap'
          }}
        >
          {toast}
        </div>
      )}

      {/* ========================================================================= */}
      {/* ── BOTTOM SHEETS MOUNT THẲNG VÀO DOCUMENT.BODY (REACT PORTAL) ── */}
      {/* ========================================================================= */}

      {/* 1. BOTTOM SHEET: CHI TIẾT KHOẢN CHI / TẠM ỨNG & HÀNH ĐỘNG */}
      {activeSheet === 'detail' && selectedRequest && renderPortalSheet(
        selectedType === 'expense' ? 'Chi Tiết Khoản Chi' : 'Chi Tiết Tạm Ứng',
        `Mã chứng từ #${String(selectedRequest?.id || '').slice(0, 8)}`,
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ backgroundColor: '#FAF5EC', border: '1px solid rgba(74,38,16,0.15)', borderRadius: 16, padding: '14px', textAlign: 'center' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#7a6858' }}>Số tiền cần thanh toán</div>
            <div style={{ fontSize: 24, fontWeight: 900, color: '#4A2610', fontFamily: 'monospace', margin: '4px 0' }}>
              {formatVND(selectedRequest?.amount)}
            </div>
            {badgePill(
              selectedType === 'expense'
                ? 'Đã duyệt'
                : `Đã duyệt · ${PAY_METHOD_LABEL[selectedRequest?.payment_method] || ''}`,
              'success'
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13 }}>
            {selectedType === 'expense' ? (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #eae0d0', paddingBottom: 6 }}>
                  <span style={{ color: '#7a6858' }}>Nội dung chi:</span>
                  <strong style={{ color: '#2d1b10', textAlign: 'right' }}>{selectedRequest?.description}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #eae0d0', paddingBottom: 6 }}>
                  <span style={{ color: '#7a6858' }}>Người yêu cầu:</span>
                  <strong>{selectedRequest?.claimant_name}</strong>
                </div>
                {selectedRequest?.related_order_code && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #eae0d0', paddingBottom: 6 }}>
                    <span style={{ color: '#7a6858' }}>Đơn liên quan:</span>
                    <strong>#{selectedRequest.related_order_code}</strong>
                  </div>
                )}
              </>
            ) : (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #eae0d0', paddingBottom: 6 }}>
                  <span style={{ color: '#7a6858' }}>Nhân sự:</span>
                  <strong style={{ color: '#2d1b10' }}>{selectedRequest?.employee_name}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #eae0d0', paddingBottom: 6 }}>
                  <span style={{ color: '#7a6858' }}>Cần nhận trước:</span>
                  <strong>{selectedRequest?.needed_on}</strong>
                </div>
              </>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #eae0d0', paddingBottom: 6 }}>
              <span style={{ color: '#7a6858' }}>Thời gian:</span>
              <span>{formatTime(selectedRequest?.occurred_at || selectedRequest?.created_at)}</span>
            </div>
            {selectedRequest?.director_note && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ color: '#7a6858' }}>Ghi chú của Giám đốc:</span>
                <div style={{ backgroundColor: '#FAF5EC', padding: '8px 10px', borderRadius: 8, color: '#2d1b10', fontSize: 12 }}>
                  {selectedRequest.director_note}
                </div>
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ color: '#7a6858' }}>Diễn giải / Ghi chú:</span>
              <div style={{ backgroundColor: '#FAF5EC', padding: '8px 10px', borderRadius: 8, color: '#2d1b10', fontSize: 12 }}>
                {(selectedType === 'expense' ? selectedRequest?.note : selectedRequest?.reason) || 'Không có ghi chú'}
              </div>
            </div>
          </div>

          {selectedType === 'expense' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#7a6858' }}>Hóa đơn / Chứng từ đính kèm:</span>
              {Array.isArray(selectedRequest?.receipt_attachments) && selectedRequest.receipt_attachments[0]?.url ? (
                <a href={selectedRequest.receipt_attachments[0].url} target="_blank" rel="noreferrer">
                  <img
                    src={selectedRequest.receipt_attachments[0].url}
                    alt="Hóa đơn"
                    style={{ width: '100%', maxHeight: 220, objectFit: 'cover', borderRadius: 12, border: '1px solid #eae0d0' }}
                  />
                </a>
              ) : (
                <div
                  style={{
                    backgroundColor: '#ffffff',
                    border: '1.5px dashed #cbd5e1',
                    borderRadius: 12,
                    padding: '16px',
                    textAlign: 'center',
                    color: '#64748b',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 4
                  }}
                >
                  <Camera size={24} color="#94a3b8" />
                  <span style={{ fontSize: 11, color: '#94a3b8' }}>Không có ảnh chứng từ đính kèm</span>
                </div>
              )}
            </div>
          )}

          {!showRejectForm ? (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10 }}>
              <button
                onClick={() => setShowRejectForm(true)}
                disabled={actionBusy}
                style={{ backgroundColor: '#ffffff', color: '#2d1b10', border: '1.5px solid rgba(74,38,16,0.18)', borderRadius: 14, padding: '12px 0', fontSize: 13.5, fontWeight: 900, cursor: 'pointer' }}
              >
                ✕ Từ chối / Trả lại
              </button>
              <button
                onClick={handlePay}
                disabled={actionBusy}
                style={{
                  backgroundColor: '#1e7e4e',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: 14,
                  padding: '12px 0',
                  fontSize: 13.5,
                  fontWeight: 900,
                  cursor: 'pointer',
                  boxShadow: '0 4px 12px rgba(30, 126, 78, 0.3)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6
                }}
              >
                {actionBusy ? 'Đang xử lý…' : '⚡ Đã chi tiền'}
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
              <textarea
                rows={2}
                autoFocus
                placeholder="Lý do trả lại cho nhân viên (không bắt buộc)…"
                value={rejectNote}
                onChange={(e) => setRejectNote(e.target.value)}
                style={{ width: '100%', padding: '9px 12px', borderRadius: 10, border: '1px solid #eae0d0', backgroundColor: '#FAF5EC', fontSize: 12.5, outline: 'none', boxSizing: 'border-box' }}
              />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <button
                  onClick={() => setShowRejectForm(false)}
                  disabled={actionBusy}
                  style={{ backgroundColor: '#ffffff', color: '#2d1b10', border: '1.5px solid rgba(74,38,16,0.18)', borderRadius: 14, padding: '12px 0', fontSize: 13.5, fontWeight: 900, cursor: 'pointer' }}
                >
                  Hủy
                </button>
                <button
                  onClick={handleReject}
                  disabled={actionBusy}
                  style={{ backgroundColor: '#b3261e', color: '#ffffff', border: 'none', borderRadius: 14, padding: '12px 0', fontSize: 13.5, fontWeight: 900, cursor: 'pointer', boxShadow: '0 4px 12px rgba(179,38,30,0.3)' }}
                >
                  {actionBusy ? 'Đang xử lý…' : 'Xác nhận trả lại'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 2. BOTTOM SHEET: GHI KHOẢN CHI MỚI (LUÔN CHỜ GIÁM ĐỐC DUYỆT) */}
      {activeSheet === 'create_expense' && renderPortalSheet(
        '+ Ghi Khoản Chi Nhanh',
        'Mọi khoản chi đều cần Giám đốc duyệt trước',
        <form onSubmit={handleCreateNewExpense} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div>
            <label style={{ fontSize: 11, fontWeight: 800, color: '#7a6858', display: 'block', marginBottom: 2 }}>Tên khoản chi *</label>
            <input
              type="text"
              placeholder="VD: Mua gấp đường cát trắng & vani"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              style={{ width: '100%', padding: '9px 12px', borderRadius: 10, border: '1px solid #eae0d0', backgroundColor: '#FAF5EC', fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
            />
          </div>

          <div>
            <label style={{ fontSize: 11, fontWeight: 800, color: '#7a6858', display: 'block', marginBottom: 2 }}>Số tiền chi (VND) *</label>
            <input
              type="number"
              placeholder="VD: 350000"
              value={newAmount}
              onChange={(e) => setNewAmount(e.target.value === '' ? '' : Number(e.target.value))}
              style={{ width: '100%', padding: '9px 12px', borderRadius: 10, border: '1px solid #eae0d0', backgroundColor: '#FAF5EC', fontSize: 14, fontWeight: 900, fontFamily: 'monospace', outline: 'none', boxSizing: 'border-box' }}
            />
          </div>

          <div>
            <label style={{ fontSize: 11, fontWeight: 800, color: '#7a6858', display: 'block', marginBottom: 2 }}>Ghi chú lý do</label>
            <textarea
              rows={2}
              placeholder="Chi tiết hóa đơn hoặc cửa hàng mua..."
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              style={{ width: '100%', padding: '9px 12px', borderRadius: 10, border: '1px solid #eae0d0', backgroundColor: '#FAF5EC', fontSize: 12.5, outline: 'none', boxSizing: 'border-box' }}
            />
          </div>

          <button
            type="submit"
            disabled={creatingExpense}
            style={{ backgroundColor: '#1e7e4e', color: '#ffffff', border: 'none', borderRadius: 12, padding: '12px 0', fontWeight: 900, fontSize: 14, cursor: 'pointer', boxShadow: '0 4px 12px rgba(30, 126, 78, 0.3)', marginTop: 6 }}
          >
            {creatingExpense ? 'Đang gửi…' : 'Gửi Giám Đốc Duyệt'}
          </button>
        </form>
      )}

      {/* 3. BOTTOM SHEET: CHỐT QUỸ NGÀY */}
      {activeSheet === 'cash_count' && renderPortalSheet(
        'Chốt Quỹ Cuối Ngày',
        'Kiểm đếm tiền mặt thực tế so với sổ chi thật',
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ backgroundColor: '#FAF5EC', borderRadius: 14, padding: 12, border: '1px solid #eae0d0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
              <span style={{ color: '#7a6858' }}>Theo sổ chi tháng {monthKey}:</span>
              <strong style={{ fontFamily: 'monospace', fontSize: 14 }}>{formatVND(cashBalance)}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
              <span style={{ color: '#7a6858' }}>Lệch quỹ hiện tại:</span>
              <strong style={{ color: cashDifference === 0 ? '#0d8a4f' : '#dc2626', fontFamily: 'monospace' }}>
                {cashDifference === 0 ? '0 đ (Khớp)' : formatVND(cashDifference)}
              </strong>
            </div>
          </div>

          <div>
            <label style={{ fontSize: 12, fontWeight: 800, color: '#2d1b10', display: 'block', marginBottom: 4 }}>Nhập số tiền thực tế kiểm đếm (VND):</label>
            <input
              type="number"
              value={actualCount}
              onChange={(e) => {
                actualCountTouched.current = true;
                setActualCount(e.target.value === '' ? 0 : Number(e.target.value));
              }}
              style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1.5px solid #D68A3E', backgroundColor: '#FAF5EC', fontSize: 15, fontWeight: 900, fontFamily: 'monospace', outline: 'none', boxSizing: 'border-box' }}
            />
          </div>

          <button
            onClick={() => {
              showToast('✓ Đã ký biên bản chốt két tiền mặt cuối ngày thành công!');
              setActiveSheet(null);
            }}
            style={{ backgroundColor: '#1e7e4e', color: '#ffffff', border: 'none', borderRadius: 12, padding: '12px 0', fontWeight: 900, fontSize: 14, cursor: 'pointer', boxShadow: '0 4px 12px rgba(30, 126, 78, 0.3)', marginTop: 4 }}
          >
            Ký Xác Nhận Biên Bản Chốt Két
          </button>
        </div>
      )}

      {/* 4. BOTTOM SHEET: THÔNG BÁO CHUÔNG */}
      {activeSheet === 'notifications' && renderPortalSheet(
        '🔔 Thông Báo Kế Toán',
        `${notifyCount} khoản đang chờ kế toán chi`,
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[...expenseRequests.map((r) => ({ ...r, __type: 'expense' as const })), ...advanceRequests.map((r) => ({ ...r, __type: 'advance' as const }))].map((r) => (
            <div
              key={`${r.__type}-${r.id}`}
              onClick={() => handleCardClick(r, r.__type)}
              style={{ backgroundColor: '#FAF5EC', borderRadius: 12, padding: 10, border: '1px solid #eae0d0', cursor: 'pointer' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 800 }}>
                <span>{r.__type === 'expense' ? r.description : `Tạm ứng — ${r.employee_name}`}</span>
                <span style={{ color: '#4A2610', fontFamily: 'monospace' }}>{formatVND(r.amount)}</span>
              </div>
              <div style={{ fontSize: 11, color: '#7a6858', marginTop: 2 }}>
                {r.__type === 'expense' ? r.claimant_name : r.employee_name} · {formatTime(r.occurred_at || r.created_at)}
              </div>
            </div>
          ))}
          {notifyCount === 0 && emptyState('Không có thông báo mới.')}
        </div>
      )}

      {profileError && (
        <div style={{ position: 'fixed', top: 8, left: '50%', transform: 'translateX(-50%)', backgroundColor: '#fee2e2', color: '#991b1b', fontSize: 11, fontWeight: 700, padding: '6px 12px', borderRadius: 10, zIndex: 10001 }}>
          ⚠️ {profileError}
        </div>
      )}
    </div>
  );
}

export default function AccountantOverviewV1({ embedded = false }: { embedded?: boolean }) {
  return (
    <ErrorBoundary>
      <AccountantOverviewV1Inner embedded={embedded} />
    </ErrorBoundary>
  );
}
