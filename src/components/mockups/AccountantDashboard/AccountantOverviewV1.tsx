import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Plus } from 'lucide-react';
import { AuthProvider, useAuth } from '../../../lib/AuthContext';
import { ErrorBoundary } from '../../ErrorBoundary';
import {
  fetchReadyToPayExpenses,
  markExpensePaid,
  fetchReadyToPayAdvances,
  payAdvance,
  fetchPendingDirectorTotals,
  fetchLedgerForMonth,
  fetchWagesSummaryForMonth,
  submitMyExpenseClaim,
  monthKeyOf,
  DEPARTMENTS,
} from '../../../lib/accountantOverviewV1';
import { uploadFile } from '../../../lib/queries';

const PHUONG_THUC_CHI = [
  { value: 'cash', label: '💵 Tiền mặt' },
  { value: 'bank_vcb', label: '🏦 Chuyển khoản VCB' },
  { value: 'bank_tcb', label: '🏦 Chuyển khoản TCB' },
  { value: 'momo', label: '📱 MoMo' },
];

const formatVND = (amount?: number | null) => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount || 0);

// Số gọn cho ô chỉ số nhanh trên header (tránh tràn dòng khi số tiền thật lớn) — vd 115.105.500 -> "115,1tr"
const formatVNDCompact = (amount?: number | null) => {
  const n = Number(amount) || 0;
  if (n >= 1_000_000) return `${(n / 1_000_000).toLocaleString('vi-VN', { maximumFractionDigits: 1 })}tr`;
  if (n >= 1_000) return `${(n / 1_000).toLocaleString('vi-VN', { maximumFractionDigits: 0 })}k`;
  return n.toLocaleString('vi-VN');
};

const TABS = [
  { key: 'pay', label: 'Chờ chi' },
  { key: 'advance', label: 'Tạm ứng' },
  { key: 'ledger', label: 'Sổ chi' },
  { key: 'payroll', label: 'Lương/KPI' },
] as const;

type TabKey = typeof TABS[number]['key'];

function LoadingScreen({ text }: { text: string }) {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, background: '#faf6f0', color: '#8a7a66', fontSize: 13 }}>
      <div style={{ width: 32, height: 32, border: '3px solid #eadcca', borderTopColor: '#c28c4e', borderRadius: '50%', animation: 'sumi-acct-spin 0.8s linear infinite' }} />
      <div>{text}</div>
      <style>{`@keyframes sumi-acct-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

export function AccountantOverviewV1Inner() {
  const { profile, loading: authLoading } = useAuth() || ({} as any);

  const [activeTab, setActiveTab] = useState<TabKey>('pay');
  const [deptFilter, setDeptFilter] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [readyExpenses, setReadyExpenses] = useState<any[]>([]);
  const [readyAdvances, setReadyAdvances] = useState<any[]>([]);
  const [pendingDirector, setPendingDirector] = useState({ count: 0, total: 0 });
  const [ledgerRows, setLedgerRows] = useState<any[]>([]);
  const [wages, setWages] = useState<{ periodStatus: string | null; rows: any[] }>({ periodStatus: null, rows: [] });
  const monthKey = useMemo(() => {
    try { return monthKeyOf(); } catch { return ''; }
  }, []);

  const loadAll = async () => {
    if (!profile?.id) return;
    setLoading(true);
    setLoadError('');
    try {
      const [expenses, advances, directorTotals, ledger, wagesSummary] = await Promise.all([
        fetchReadyToPayExpenses(),
        fetchReadyToPayAdvances(),
        fetchPendingDirectorTotals(),
        fetchLedgerForMonth(monthKey),
        fetchWagesSummaryForMonth(monthKey),
      ]);
      setReadyExpenses(expenses || []);
      setReadyAdvances(advances || []);
      setPendingDirector(directorTotals || { count: 0, total: 0 });
      setLedgerRows(ledger || []);
      setWages(wagesSummary || { periodStatus: null, rows: [] });
    } catch (e: any) {
      setLoadError(e?.message || 'Không tải được dữ liệu thật, thử lại sau.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (profile?.id) loadAll(); }, [profile?.id]);

  // ── Toast ──
  const [toast, setToast] = useState('');
  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 2800); };

  // ── Bottom sheet: + Ghi khoản chi / chi tiết khoản chi & tạm ứng ──
  const [activeSheet, setActiveSheet] = useState<'new_expense' | 'expense_detail' | 'advance_detail' | null>(null);
  const [selectedExpense, setSelectedExpense] = useState<any>(null);
  const [selectedAdvance, setSelectedAdvance] = useState<any>(null);
  // Nguồn tiền chi ra + ảnh chứng từ — bắt buộc trước khi ghi sổ/chi tạm ứng
  // (server chặn cứng ở record_expense_claim/pay_salary_advance, đây chỉ là
  // UI để nhập trước khi gọi).
  const [disburseMethod, setDisburseMethod] = useState('');
  const [disburseReceipt, setDisburseReceipt] = useState<File | null>(null);
  const [disbursing, setDisbursing] = useState(false);
  const [formAmount, setFormAmount] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formNote, setFormNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // ── Khoá cuộn nền + vuốt kéo đóng sheet (Portal + drag-to-dismiss) ──
  const [dragY, setDragY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartY = useRef(0);
  useEffect(() => {
    document.body.style.overflow = activeSheet ? 'hidden' : 'unset';
    setDragY(0);
    setIsDragging(false);
    return () => { document.body.style.overflow = 'unset'; };
  }, [activeSheet]);
  const sheetDragHandlers = {
    onTouchStart: (e: React.TouchEvent) => { dragStartY.current = e.touches?.[0]?.clientY || 0; setIsDragging(true); },
    onTouchMove: (e: React.TouchEvent) => { const d = (e.touches?.[0]?.clientY || 0) - dragStartY.current; if (d > 0) setDragY(d); },
    onTouchEnd: () => { setIsDragging(false); if (dragY > 120) setActiveSheet(null); setDragY(0); },
  };
  const sheetPanelStyle: React.CSSProperties = {
    width: '100%', maxWidth: 480, margin: '0 auto', maxHeight: '85vh', background: '#fff', borderRadius: '28px 28px 0 0',
    boxSizing: 'border-box', display: 'flex', flexDirection: 'column', overflow: 'hidden',
    transform: `translateY(${dragY}px)`, transition: isDragging ? 'none' : 'transform 0.3s cubic-bezier(0.25,0.8,0.25,1)', willChange: 'transform',
  };
  const sheetBodyStyle: React.CSSProperties = { flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch', padding: '0 14px 30px', boxSizing: 'border-box' };
  const SHEET_HANDLE = <div style={{ width: 38, height: 4, background: '#cbd5e1', borderRadius: 99, margin: '8px auto 2px', flexShrink: 0 }} />;

  const resetDisburseForm = () => { setDisburseMethod(''); setDisburseReceipt(null); };

  const handleMarkPaid = async (id: string) => {
    if (!id || !disburseMethod || !disburseReceipt) return;
    setDisbursing(true);
    try {
      const uploaded = await uploadFile(disburseReceipt, `expense-claims/${id}`);
      await markExpensePaid(id, disburseMethod, uploaded.url);
      showToast('⚡ Đã ghi nhận chi tiền vào Sổ chi');
      setActiveSheet(null);
      setSelectedExpense(null);
      resetDisburseForm();
      const [expenses, ledger] = await Promise.all([fetchReadyToPayExpenses(), fetchLedgerForMonth(monthKey)]);
      setReadyExpenses(expenses || []);
      setLedgerRows(ledger || []);
    } catch (e: any) {
      showToast(`⚠️ ${e?.message || 'Không thao tác được'}`);
    } finally {
      setDisbursing(false);
    }
  };

  const handlePayAdvance = async (id: string) => {
    if (!id || !disburseMethod || !disburseReceipt) return;
    setDisbursing(true);
    try {
      const uploaded = await uploadFile(disburseReceipt, `salary-advances/${id}`);
      await payAdvance(id, disburseMethod, uploaded.url);
      showToast('⚡ Đã chi tạm ứng, đã trừ vào bảng lương tháng');
      setActiveSheet(null);
      setSelectedAdvance(null);
      resetDisburseForm();
      const [advances, ledger, wagesSummary] = await Promise.all([fetchReadyToPayAdvances(), fetchLedgerForMonth(monthKey), fetchWagesSummaryForMonth(monthKey)]);
      setReadyAdvances(advances || []);
      setLedgerRows(ledger || []);
      setWages(wagesSummary || { periodStatus: null, rows: [] });
    } catch (e: any) {
      showToast(`⚠️ ${e?.message || 'Không thao tác được'}`);
    } finally {
      setDisbursing(false);
    }
  };

  const handleSubmitExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    const amountNum = Number((formAmount || '').replace(/[^\d]/g, ''));
    if (!amountNum || !formDesc.trim()) { showToast('⚠️ Vui lòng nhập đủ số tiền và nội dung chi'); return; }
    setSubmitting(true);
    try {
      await submitMyExpenseClaim({ amount: amountNum, description: formDesc.trim(), note: formNote.trim() || null });
      showToast('✓ Đã gửi khoản chi' + (amountNum >= 500000 ? ' — chờ Giám đốc duyệt' : ' — đã vào danh sách Chờ chi'));
      setFormAmount(''); setFormDesc(''); setFormNote('');
      setActiveSheet(null);
      const [expenses, directorTotals] = await Promise.all([fetchReadyToPayExpenses(), fetchPendingDirectorTotals()]);
      setReadyExpenses(expenses || []);
      setPendingDirector(directorTotals || { count: 0, total: 0 });
    } catch (e: any) {
      showToast(`⚠️ ${e?.message || 'Không gửi được khoản chi'}`);
    } finally {
      setSubmitting(false);
    }
  };

  const totalAdvancesOutstanding = (readyAdvances || []).reduce((s, a) => s + (Number(a?.amount) || 0), 0);
  const visibleExpenses = deptFilter === 'all' ? (readyExpenses || []) : (readyExpenses || []).filter((e: any) => e?.department === deptFilter);
  const visibleAdvances = deptFilter === 'all' ? (readyAdvances || []) : (readyAdvances || []).filter((a: any) => a?.department === deptFilter);
  const DeptTabs = (
    <div style={{ display: 'flex', gap: 6, overflowX: 'auto', marginBottom: 10 }}>
      {DEPARTMENTS.map((d) => (
        <button key={d.key} onClick={() => setDeptFilter(d.key)} style={{
          flex: '0 0 auto', padding: '6px 12px', borderRadius: 999, border: '1px solid #eadcca', fontSize: 11, fontWeight: 800, cursor: 'pointer',
          background: deptFilter === d.key ? '#f05c2b' : '#fff', color: deptFilter === d.key ? '#fff' : '#725f50',
        }}>
          {d.label}
        </button>
      ))}
    </div>
  );
  const ledgerTotalChi = (ledgerRows || []).filter((r) => r?.type === 'chi').reduce((s, r) => s + (Number(r?.amount) || 0), 0);
  const ledgerTotalThu = (ledgerRows || []).filter((r) => r?.type === 'thu').reduce((s, r) => s + (Number(r?.amount) || 0), 0);

  if (authLoading) return <LoadingScreen text="Đang tải phiên đăng nhập..." />;
  if (!profile?.id) return <LoadingScreen text="Chưa đăng nhập." />;

  return (
    <>
      <div style={{ maxWidth: 480, margin: '0 auto', minHeight: '100vh', backgroundColor: '#faf6f0', color: '#2d1c10', boxSizing: 'border-box', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
        {loadError && (
          <div style={{ margin: '8px 8px 0', background: '#fee2e2', color: '#dc2626', fontSize: 12, fontWeight: 700, padding: '8px 12px', borderRadius: 10, cursor: 'pointer' }} onClick={loadAll}>
            ⚠️ {loadError} — bấm để tải lại
          </div>
        )}

        {/* Hero — thẻ nổi bo tròn đủ 4 góc, tách khỏi mép màn hình */}
        <div style={{ margin: '14px 14px 0', padding: '18px 16px 16px', background: 'linear-gradient(135deg, #3a2113 0%, #24140c 100%)', color: '#fff', borderRadius: 24, boxShadow: '0 10px 28px rgba(45,28,16,0.25)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 44, height: 44, borderRadius: 14, background: '#fff4d7', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>🧾</div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: 1, color: '#ffdca9' }}>KẾ TOÁN SUMI</div>
                <div style={{ fontSize: 18, fontWeight: 900 }}>Duyệt chi & Tạm ứng</div>
              </div>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, marginTop: 14 }}>
            <div style={{ background: 'rgba(255,255,255,0.14)', borderRadius: 14, padding: '10px 4px', textAlign: 'center' }}>
              <div style={{ fontSize: 16, fontWeight: 900, fontFamily: 'ui-monospace, SFMono-Regular, "JetBrains Mono", Menlo, monospace' }}>{formatVNDCompact((readyExpenses || []).reduce((s, c) => s + (Number(c?.amount) || 0), 0))}</div>
              <div style={{ fontSize: 9.5, fontWeight: 800, opacity: 0.7, marginTop: 2 }}>chờ chi</div>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.14)', borderRadius: 14, padding: '10px 4px', textAlign: 'center' }}>
              <div style={{ fontSize: 16, fontWeight: 900, fontFamily: 'ui-monospace, SFMono-Regular, "JetBrains Mono", Menlo, monospace' }}>{formatVNDCompact(totalAdvancesOutstanding)}</div>
              <div style={{ fontSize: 9.5, fontWeight: 800, opacity: 0.7, marginTop: 2 }}>tạm ứng</div>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.14)', borderRadius: 14, padding: '10px 4px', textAlign: 'center' }}>
              <div style={{ fontSize: 16, fontWeight: 900, fontFamily: 'ui-monospace, SFMono-Regular, "JetBrains Mono", Menlo, monospace' }}>{formatVNDCompact(pendingDirector?.total)}</div>
              <div style={{ fontSize: 9.5, fontWeight: 800, opacity: 0.7, marginTop: 2 }}>cần duyệt</div>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.14)', borderRadius: 14, padding: '10px 4px', textAlign: 'center' }}>
              <div style={{ fontSize: 16, fontWeight: 900, opacity: 0.6 }}>—</div>
              <div style={{ fontSize: 9.5, fontWeight: 800, opacity: 0.7, marginTop: 2 }}>lệch quỹ</div>
            </div>
          </div>
        </div>

        {/* Subnav — dạng viên thuốc bo tròn hoàn toàn */}
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', padding: '14px 14px 4px' }}>
          {TABS.map((t) => (
            <button key={t.key} onClick={() => setActiveTab(t.key)} style={{
              flex: '0 0 auto', padding: '9px 16px', borderRadius: 999, border: '1px solid #eadcca', fontSize: 12.5, fontWeight: 900, cursor: 'pointer',
              background: activeTab === t.key ? '#2d1c10' : '#fff', color: activeTab === t.key ? '#ffd284' : '#725f50',
            }}>
              {t.label}
            </button>
          ))}
        </div>

        <div style={{ padding: '4px 14px 90px' }}>
          {loading && (readyExpenses || []).length === 0 && (readyAdvances || []).length === 0 && (
            <div style={{ textAlign: 'center', padding: '30px 0', color: '#8a7a66', fontSize: 12.5 }}>Đang tải dữ liệu thật...</div>
          )}

          {/* ── TAB: CHỜ CHI ── */}
          {activeTab === 'pay' && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 9, marginTop: 8, marginBottom: 12 }}>
                <button onClick={() => setActiveSheet('new_expense')} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: '#15803d', color: '#fff', border: 'none', borderRadius: 14, padding: '12px 0', fontWeight: 900, fontSize: 13, cursor: 'pointer' }}>
                  <Plus size={16} /> Ghi khoản chi
                </button>
                <button disabled title="Chưa có bảng chốt quỹ trong hệ thống" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: '#fff', color: '#a08060', border: '1.5px solid #eadcca', borderRadius: 14, padding: '12px 0', fontWeight: 900, fontSize: 13, cursor: 'not-allowed' }}>
                  Chốt quỹ ngày
                </button>
              </div>

              {/* Vòng đời khoản chi */}
              <div style={{ background: '#2d1c10', borderRadius: 16, padding: 12, marginBottom: 14 }}>
                <div style={{ color: '#fff', fontSize: 12.5, fontWeight: 900, marginBottom: 8 }}>Vòng đời khoản chi</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
                  {['1. Nhân sự gửi', '2. Sếp duyệt', '3. Kế toán chi', '4. Vào sổ lương/KPI'].map((step, i) => (
                    <div key={step} style={{
                      minHeight: 46, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: 5,
                      fontSize: 9.5, fontWeight: 900, background: i === 2 ? '#ffd284' : 'rgba(255,255,255,0.12)', color: i === 2 ? '#4b2a14' : '#fff',
                    }}>
                      {step}
                    </div>
                  ))}
                </div>
              </div>

              {DeptTabs}
              <div style={{ fontSize: 11, fontWeight: 900, color: '#725f50', textTransform: 'uppercase', marginBottom: 8 }}>
                Đã qua duyệt — chờ Kế toán chi ({visibleExpenses.length})
              </div>
              {visibleExpenses.length === 0 && !loading && (
                <div style={{ textAlign: 'center', padding: '20px 0', color: '#725f50', fontSize: 13 }}>Không có khoản chi nào đang chờ.</div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {visibleExpenses.map((exp: any) => (
                  <div
                    key={exp?.id}
                    onClick={() => { setSelectedExpense(exp); setActiveSheet('expense_detail'); setDisburseMethod(''); setDisburseReceipt(null); }}
                    style={{ background: '#fffcf7', border: '1.5px solid rgba(74,38,16,0.16)', borderRadius: 16, padding: 12, cursor: 'pointer' }}
                  >
                    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                      <div style={{ width: 42, height: 42, borderRadius: 12, background: '#fff0d4', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>🧾</div>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                          <div style={{ fontSize: 13.5, fontWeight: 900, color: '#2d1b10' }}>{exp?.description || 'Khoản chi'}</div>
                          <div style={{ fontFamily: 'ui-monospace, SFMono-Regular, "JetBrains Mono", Menlo, monospace', fontWeight: 900, fontSize: 14, color: '#4A2610', whiteSpace: 'nowrap' }}>
                            {formatVND(exp?.amount)}
                          </div>
                        </div>
                        <div style={{ fontSize: 11, color: '#6b5b48', marginTop: 2 }}>{exp?.claimant_name || 'Không rõ'}</div>
                        <span style={{
                          display: 'inline-block', marginTop: 6, padding: '3px 9px', borderRadius: 99, fontSize: 10.5, fontWeight: 900,
                          background: exp?.approval_reason ? '#fff4cf' : '#e8f8ef', color: exp?.approval_reason ? '#805200' : '#078653',
                        }}>
                          {exp?.approval_reason ? `⚠️ ${exp.approval_reason}` : '✓ Đã duyệt'}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* ── TAB: TẠM ỨNG ── */}
          {activeTab === 'advance' && (
            <>
              <div style={{ display: 'flex', gap: 8, background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 14, padding: 10, marginTop: 8, marginBottom: 12 }}>
                <span style={{ fontSize: 18 }}>🔐</span>
                <div style={{ fontSize: 11.5, color: '#7c5000', fontWeight: 700, lineHeight: 1.4 }}>
                  Khi Kế toán bấm chi, số tiền tự động trừ vào bảng lương tháng của nhân sự đó.
                </div>
              </div>
              {DeptTabs}
              <div style={{ fontSize: 11, fontWeight: 900, color: '#725f50', textTransform: 'uppercase', marginBottom: 8 }}>
                Đã Giám đốc duyệt — chờ chi ({visibleAdvances.length})
              </div>
              {visibleAdvances.length === 0 && !loading && (
                <div style={{ textAlign: 'center', padding: '20px 0', color: '#725f50', fontSize: 13 }}>Không có yêu cầu tạm ứng nào đang chờ.</div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {visibleAdvances.map((a: any) => (
                  <div
                    key={a?.id}
                    onClick={() => { setSelectedAdvance(a); setActiveSheet('advance_detail'); setDisburseMethod(''); setDisburseReceipt(null); }}
                    style={{ background: '#fffcf7', border: '1.5px solid rgba(74,38,16,0.16)', borderRadius: 16, padding: 12, cursor: 'pointer' }}
                  >
                    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                      <div style={{ width: 42, height: 42, borderRadius: 12, background: '#fff0d4', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>💵</div>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                          <div style={{ fontSize: 13.5, fontWeight: 900, color: '#2d1b10' }}>{a?.employee_name || 'Không rõ'}</div>
                          <div style={{ fontFamily: 'ui-monospace, SFMono-Regular, "JetBrains Mono", Menlo, monospace', fontWeight: 900, fontSize: 14, color: '#4A2610', whiteSpace: 'nowrap' }}>
                            {formatVND(a?.amount)}
                          </div>
                        </div>
                        <div style={{ fontSize: 11, color: '#6b5b48', marginTop: 2 }}>Lý do: {a?.reason || '—'}</div>
                        <span style={{ display: 'inline-block', marginTop: 6, padding: '3px 9px', borderRadius: 99, fontSize: 10.5, fontWeight: 900, background: '#e8f8ef', color: '#078653' }}>
                          ✓ Sếp đã duyệt
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* ── TAB: SỔ CHI ── */}
          {activeTab === 'ledger' && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8, marginBottom: 12 }}>
                <div style={{ background: '#fff', border: '1px solid #eadcca', borderRadius: 14, padding: 10 }}>
                  <div style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 16, fontWeight: 900, color: '#4A2610' }}>{formatVND(ledgerTotalChi)}</div>
                  <div style={{ fontSize: 10, fontWeight: 800, color: '#725f50', marginTop: 2, textTransform: 'uppercase' }}>Chi tháng {monthKey}</div>
                </div>
                <div style={{ background: '#fff', border: '1px solid #eadcca', borderRadius: 14, padding: 10 }}>
                  <div style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 16, fontWeight: 900, color: '#3F6C51' }}>{formatVND(ledgerTotalThu)}</div>
                  <div style={{ fontSize: 10, fontWeight: 800, color: '#725f50', marginTop: 2, textTransform: 'uppercase' }}>Thu tháng {monthKey}</div>
                </div>
              </div>
              <div style={{ fontSize: 11, fontWeight: 900, color: '#725f50', textTransform: 'uppercase', marginBottom: 8 }}>
                Nhật ký sổ chi ({(ledgerRows || []).length} dòng)
              </div>
              {(ledgerRows || []).length === 0 && !loading && (
                <div style={{ textAlign: 'center', padding: '20px 0', color: '#725f50', fontSize: 13 }}>Chưa có phát sinh nào trong kỳ này.</div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {(ledgerRows || []).map((r: any) => {
                  let dateStr = '';
                  try { dateStr = r?.occurred_at ? new Date(r.occurred_at).toLocaleString('vi-VN') : ''; } catch { dateStr = ''; }
                  return (
                    <div key={r?.id} onClick={() => r?.receiptUrl && window.open(r.receiptUrl, '_blank', 'noopener')}
                      style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#fff', border: '1px solid #eadcca', borderRadius: 12, padding: '10px 12px', cursor: r?.receiptUrl ? 'pointer' : 'default' }}>
                      <span style={{ fontSize: 18 }}>{r?.type === 'chi' ? '➖' : '➕'}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12.5, fontWeight: 800, color: '#2d1c10', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r?.label || 'Giao dịch'}</div>
                        <div style={{ fontSize: 10.5, color: '#8c7664' }}>{dateStr}{r?.receiptUrl && ' · 📎 Có ảnh chứng từ'}</div>
                      </div>
                      <div style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 12.5, fontWeight: 900, color: r?.type === 'chi' ? '#4A2610' : '#3F6C51', whiteSpace: 'nowrap' }}>
                        {r?.type === 'chi' ? '-' : '+'}{formatVND(r?.amount)}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div style={{ fontSize: 10.5, color: '#a08060', marginTop: 10, textAlign: 'center' }}>
                Ghi chú: sổ chi hiện chưa phân loại theo phương thức tiền / nhóm chi — cần bổ sung cột nếu muốn lọc chi tiết hơn.
              </div>
            </>
          )}

          {/* ── TAB: LƯƠNG/KPI ── */}
          {activeTab === 'payroll' && (
            <>
              <div style={{ display: 'flex', gap: 8, background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 14, padding: 10, marginTop: 8, marginBottom: 12 }}>
                <span style={{ fontSize: 18 }}>📌</span>
                <div style={{ fontSize: 11.5, color: '#1e40af', fontWeight: 700, lineHeight: 1.4 }}>
                  Không tính KPI sản xuất trực tiếp — chỉ hiện phần ảnh hưởng lương: tạm ứng đã chi và chi hộ đã ghi sổ trong tháng {monthKey}.
                  {wages?.periodStatus == null && ' Kỳ lương tháng này chưa được tạo trong hệ thống Lương.'}
                </div>
              </div>
              {(wages?.rows || []).length === 0 && !loading && (
                <div style={{ textAlign: 'center', padding: '20px 0', color: '#725f50', fontSize: 13 }}>Chưa có dữ liệu tạm ứng/chi hộ nào trong tháng này.</div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {(wages?.rows || []).map((row: any) => (
                  <div key={row?.employeeId} style={{ background: '#fff', border: '1px solid #eadcca', borderRadius: 14, padding: 12 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 900, color: '#2d1c10' }}>{row?.employeeName || 'Không rõ'}</div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 11.5 }}>
                      <span style={{ color: '#725f50' }}>Tạm ứng đã chi</span>
                      <span style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontWeight: 800, color: '#4A2610' }}>{formatVND(row?.advancePaid)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 3, fontSize: 11.5 }}>
                      <span style={{ color: '#725f50' }}>Chi hộ đã ghi sổ</span>
                      <span style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontWeight: 800, color: '#4A2610' }}>{formatVND(row?.expensesRecorded)}</span>
                    </div>
                    {row?.netPay != null && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, paddingTop: 6, borderTop: '1px solid #f2e9de', fontSize: 12.5 }}>
                        <span style={{ color: '#725f50', fontWeight: 800 }}>Thực lãnh (kỳ lương)</span>
                        <span style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontWeight: 900, color: '#8C5A1E' }}>{formatVND(row?.netPay)}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 10.5, color: '#a08060', marginTop: 10, textAlign: 'center' }}>
                Ghi chú: "Hoàn ứng" và "khoản loại trừ" chưa có bảng dữ liệu tương ứng trong hệ thống — chưa hiển thị được.
              </div>
            </>
          )}
        </div>
      </div>

      {createPortal(
        <>
          {activeSheet === 'expense_detail' && selectedExpense && (
            <div style={{ position: 'fixed', inset: 0, zIndex: 2000, background: '#fdf9f2', overflowY: 'auto' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 14, borderBottom: '1.5px solid #eadcca', position: 'sticky', top: 0, background: '#fdf9f2', zIndex: 1 }}>
                <button onClick={() => { setActiveSheet(null); setSelectedExpense(null); resetDisburseForm(); }} aria-label="Quay lại" style={{ width: 40, height: 40, borderRadius: 12, background: '#f4efe8', border: 'none', fontSize: 20, fontWeight: 900, color: '#2d1b10', cursor: 'pointer', flexShrink: 0 }}>‹</button>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: 1, color: '#b8692f', textTransform: 'uppercase' }}>Chi tiết khoản chi</div>
                  <div style={{ fontSize: 15, fontWeight: 900, color: '#2d1b10' }}>{selectedExpense?.description || 'Khoản chi'}</div>
                </div>
              </div>
              <div style={{ padding: '0 14px 30px', boxSizing: 'border-box' }}>
                <div style={{ marginTop: 14, marginBottom: 14 }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: '#725f50' }}>Số tiền cần chi</div>
                  <div style={{ fontFamily: 'ui-monospace, SFMono-Regular, "JetBrains Mono", Menlo, monospace', fontSize: 32, fontWeight: 900, color: '#4A2610', marginTop: 2 }}>
                    {formatVND(selectedExpense?.amount)}
                  </div>
                  <div style={{ fontSize: 12, color: '#6b5b48', marginTop: 6, lineHeight: 1.5 }}>
                    Người gửi: <strong>{selectedExpense?.claimant_name || 'Không rõ'}</strong>.{' '}
                    {selectedExpense?.approval_reason ? `Cần xác nhận: ${selectedExpense.approval_reason}.` : 'Đã qua duyệt.'}
                  </div>
                </div>
                <div style={{ background: '#faf6f0', border: '1px solid #eadcca', borderRadius: 14, padding: 10, marginBottom: 16 }}>
                  <div style={{ fontSize: 11, color: '#725f50' }}>Ghi chú: {selectedExpense?.note || '—'}</div>
                </div>

                <div style={{ fontSize: 12, fontWeight: 900, color: '#2d1b10', marginBottom: 6 }}>💰 Nguồn tiền chi ra (bắt buộc)</div>
                <select value={disburseMethod} onChange={(e) => setDisburseMethod(e.target.value)}
                  style={{ width: '100%', minHeight: 46, padding: '0 10px', borderRadius: 12, border: '1.5px solid #eadcca', fontSize: 13, fontWeight: 700, marginBottom: 14, boxSizing: 'border-box' }}>
                  <option value="">— Chọn nguồn tiền —</option>
                  {PHUONG_THUC_CHI.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>

                <div style={{ fontSize: 12, fontWeight: 900, color: '#2d1b10', marginBottom: 6 }}>📷 Ảnh chứng từ chi tiền (bắt buộc)</div>
                <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 48, border: '2px dashed #eadcca', borderRadius: 12, cursor: 'pointer', marginBottom: 16, fontSize: 13, fontWeight: 700, color: '#725f50' }}>
                  {disburseReceipt ? `📎 ${disburseReceipt.name}` : '📷 Chụp ảnh hoặc chọn ảnh chuyển khoản có sẵn'}
                  <input hidden type="file" accept="image/*" onChange={(e) => setDisburseReceipt(e.target.files?.[0] || null)} />
                </label>

                <button onClick={() => handleMarkPaid(selectedExpense?.id)} disabled={!disburseMethod || !disburseReceipt || disbursing}
                  style={{ width: '100%', background: (!disburseMethod || !disburseReceipt || disbursing) ? '#e8b6a0' : '#f05c2b', color: '#fff', border: 'none', borderRadius: 12, padding: '13px 0', fontWeight: 900, fontSize: 14, cursor: (!disburseMethod || !disburseReceipt || disbursing) ? 'not-allowed' : 'pointer' }}>
                  {disbursing ? 'Đang ghi sổ…' : '⚡ Đã chi tiền'}
                </button>
              </div>
            </div>
          )}

          {activeSheet === 'advance_detail' && selectedAdvance && (
            <div style={{ position: 'fixed', inset: 0, zIndex: 2000, background: '#fdf9f2', overflowY: 'auto' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 14, borderBottom: '1.5px solid #eadcca', position: 'sticky', top: 0, background: '#fdf9f2', zIndex: 1 }}>
                <button onClick={() => { setActiveSheet(null); setSelectedAdvance(null); resetDisburseForm(); }} aria-label="Quay lại" style={{ width: 40, height: 40, borderRadius: 12, background: '#f4efe8', border: 'none', fontSize: 20, fontWeight: 900, color: '#2d1b10', cursor: 'pointer', flexShrink: 0 }}>‹</button>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: 1, color: '#b8692f', textTransform: 'uppercase' }}>Chi tiết tạm ứng</div>
                  <div style={{ fontSize: 15, fontWeight: 900, color: '#2d1b10' }}>{selectedAdvance?.employee_name || 'Không rõ'}</div>
                </div>
              </div>
              <div style={{ padding: '0 14px 30px', boxSizing: 'border-box' }}>
                <div style={{ marginTop: 14, marginBottom: 14 }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: '#725f50' }}>Số tiền tạm ứng</div>
                  <div style={{ fontFamily: 'ui-monospace, SFMono-Regular, "JetBrains Mono", Menlo, monospace', fontSize: 32, fontWeight: 900, color: '#4A2610', marginTop: 2 }}>
                    {formatVND(selectedAdvance?.amount)}
                  </div>
                  <div style={{ fontSize: 12, color: '#6b5b48', marginTop: 6, lineHeight: 1.5 }}>
                    Lý do: <strong>{selectedAdvance?.reason || '—'}</strong>. Sếp đã duyệt. Khi chi xong sẽ tự trừ vào bảng lương tháng của nhân sự này.
                  </div>
                </div>

                <div style={{ fontSize: 12, fontWeight: 900, color: '#2d1b10', marginBottom: 6 }}>💰 Nguồn tiền chi ra (bắt buộc)</div>
                <select value={disburseMethod} onChange={(e) => setDisburseMethod(e.target.value)}
                  style={{ width: '100%', minHeight: 46, padding: '0 10px', borderRadius: 12, border: '1.5px solid #eadcca', fontSize: 13, fontWeight: 700, marginBottom: 14, boxSizing: 'border-box' }}>
                  <option value="">— Chọn nguồn tiền —</option>
                  {PHUONG_THUC_CHI.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>

                <div style={{ fontSize: 12, fontWeight: 900, color: '#2d1b10', marginBottom: 6 }}>📷 Ảnh chứng từ chi tiền (bắt buộc)</div>
                <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 48, border: '2px dashed #eadcca', borderRadius: 12, cursor: 'pointer', marginBottom: 16, fontSize: 13, fontWeight: 700, color: '#725f50' }}>
                  {disburseReceipt ? `📎 ${disburseReceipt.name}` : '📷 Chụp ảnh hoặc chọn ảnh chuyển khoản có sẵn'}
                  <input hidden type="file" accept="image/*" onChange={(e) => setDisburseReceipt(e.target.files?.[0] || null)} />
                </label>

                <button onClick={() => handlePayAdvance(selectedAdvance?.id)} disabled={!disburseMethod || !disburseReceipt || disbursing}
                  style={{ width: '100%', background: (!disburseMethod || !disburseReceipt || disbursing) ? '#e8b6a0' : '#f05c2b', color: '#fff', border: 'none', borderRadius: 12, padding: '13px 0', fontWeight: 900, fontSize: 14, cursor: (!disburseMethod || !disburseReceipt || disbursing) ? 'not-allowed' : 'pointer' }}>
                  {disbursing ? 'Đang chi…' : '⚡ Đã chi tạm ứng'}
                </button>
              </div>
            </div>
          )}

          {activeSheet === 'new_expense' && (
            <div onClick={() => setActiveSheet(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(2px)', zIndex: 1200, display: 'flex', alignItems: 'flex-end' }}>
              <div onClick={(e) => e.stopPropagation()} style={sheetPanelStyle}>
                <div {...sheetDragHandlers} style={{ flexShrink: 0, cursor: 'grab' }}>
                  {SHEET_HANDLE}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 14px 8px', borderBottom: '1.5px solid #eadcca' }}>
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 900, color: '#8b5900' }}>🧾 Ghi Khoản Chi</div>
                      <div style={{ fontSize: 11, color: '#725f50' }}>Từ 500.000đ trở lên sẽ tự chuyển chờ Giám đốc duyệt</div>
                    </div>
                    <button onClick={() => setActiveSheet(null)} style={{ width: 28, height: 28, borderRadius: 8, background: '#f4efe8', border: 'none', fontWeight: 900, cursor: 'pointer' }}>✕</button>
                  </div>
                </div>
                <div style={sheetBodyStyle}>
                  <form onSubmit={handleSubmitExpense} style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 800, color: '#725f50', marginBottom: 3 }}>Số tiền *</div>
                      <input inputMode="numeric" placeholder="VD: 420000" value={formAmount} onChange={(e) => setFormAmount(e.target.value)}
                        style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1.5px solid #eadcca', fontSize: 14, outline: 'none', background: '#faf6f0', boxSizing: 'border-box', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }} />
                    </div>
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 800, color: '#725f50', marginBottom: 3 }}>Nội dung chi *</div>
                      <input placeholder="VD: Mua nguyên liệu gấp cho bếp lạnh" value={formDesc} onChange={(e) => setFormDesc(e.target.value)}
                        style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1.5px solid #eadcca', fontSize: 13, outline: 'none', background: '#faf6f0', boxSizing: 'border-box' }} />
                    </div>
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 800, color: '#725f50', marginBottom: 3 }}>Ghi chú nguồn tiền</div>
                      <input placeholder="VD: Sếp đưa tiền mặt / tự chi trước" value={formNote} onChange={(e) => setFormNote(e.target.value)}
                        style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1.5px solid #eadcca', fontSize: 13, outline: 'none', background: '#faf6f0', boxSizing: 'border-box' }} />
                    </div>
                    <button type="submit" disabled={submitting} style={{ background: '#c28c4e', color: '#fff', border: 'none', borderRadius: 12, padding: '12px 0', fontWeight: 900, fontSize: 14, cursor: 'pointer', marginTop: 4 }}>
                      {submitting ? 'Đang gửi...' : 'Gửi ghi chi'}
                    </button>
                  </form>
                </div>
              </div>
            </div>
          )}

          {toast && (
            <div style={{ position: 'fixed', bottom: 60, left: '50%', transform: 'translateX(-50%)', background: '#2d1c10', color: '#fff', padding: '8px 16px', borderRadius: 20, fontSize: 12, fontWeight: 800, boxShadow: '0 4px 14px rgba(0,0,0,0.25)', zIndex: 2000, whiteSpace: 'nowrap' }}>
              {toast}
            </div>
          )}
        </>,
        document.body,
      )}
    </>
  );
}

export default function AccountantOverviewV1() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <AccountantOverviewV1Inner />
      </AuthProvider>
    </ErrorBoundary>
  );
}
