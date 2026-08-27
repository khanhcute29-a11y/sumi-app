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
} from '../../../lib/accountantOverviewV1';

const formatVND = (amount?: number | null) => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount || 0);

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

  // ── Bottom sheet: + Ghi khoản chi ──
  const [activeSheet, setActiveSheet] = useState<'new_expense' | null>(null);
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

  const handleMarkPaid = async (id: string) => {
    if (!id) return;
    try {
      await markExpensePaid(id);
      showToast('⚡ Đã ghi nhận chi tiền vào Sổ chi');
      const [expenses, ledger] = await Promise.all([fetchReadyToPayExpenses(), fetchLedgerForMonth(monthKey)]);
      setReadyExpenses(expenses || []);
      setLedgerRows(ledger || []);
    } catch (e: any) {
      showToast(`⚠️ ${e?.message || 'Không thao tác được'}`);
    }
  };

  const handlePayAdvance = async (id: string) => {
    if (!id) return;
    try {
      await payAdvance(id);
      showToast('⚡ Đã chi tạm ứng, đã trừ vào bảng lương tháng');
      const [advances, ledger, wagesSummary] = await Promise.all([fetchReadyToPayAdvances(), fetchLedgerForMonth(monthKey), fetchWagesSummaryForMonth(monthKey)]);
      setReadyAdvances(advances || []);
      setLedgerRows(ledger || []);
      setWages(wagesSummary || { periodStatus: null, rows: [] });
    } catch (e: any) {
      showToast(`⚠️ ${e?.message || 'Không thao tác được'}`);
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

        {/* Hero */}
        <div style={{ padding: '18px 16px 16px', background: 'linear-gradient(135deg, #3a2113 0%, #24140c 100%)', color: '#fff', borderRadius: '0 0 24px 24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 44, height: 44, borderRadius: 14, background: '#fff4d7', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>🧾</div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: 1, color: '#ffdca9' }}>KẾ TOÁN SUMI</div>
              <div style={{ fontSize: 18, fontWeight: 900 }}>Duyệt chi & Tạm ứng</div>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, marginTop: 14 }}>
            <div style={{ background: 'rgba(255,255,255,0.14)', borderRadius: 14, padding: '8px 4px', textAlign: 'center' }}>
              <div style={{ fontSize: 15, fontWeight: 900 }}>{formatVND((readyExpenses || []).reduce((s, c) => s + (Number(c?.amount) || 0), 0))}</div>
              <div style={{ fontSize: 9.5, fontWeight: 800, opacity: 0.85, marginTop: 2 }}>chờ chi</div>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.14)', borderRadius: 14, padding: '8px 4px', textAlign: 'center' }}>
              <div style={{ fontSize: 15, fontWeight: 900 }}>{formatVND(totalAdvancesOutstanding)}</div>
              <div style={{ fontSize: 9.5, fontWeight: 800, opacity: 0.85, marginTop: 2 }}>tạm ứng</div>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.14)', borderRadius: 14, padding: '8px 4px', textAlign: 'center' }}>
              <div style={{ fontSize: 15, fontWeight: 900 }}>{formatVND(pendingDirector?.total)}</div>
              <div style={{ fontSize: 9.5, fontWeight: 800, opacity: 0.85, marginTop: 2 }}>cần duyệt</div>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.14)', borderRadius: 14, padding: '8px 4px', textAlign: 'center' }}>
              <div style={{ fontSize: 15, fontWeight: 900, opacity: 0.6 }}>—</div>
              <div style={{ fontSize: 9.5, fontWeight: 800, opacity: 0.85, marginTop: 2 }}>lệch quỹ</div>
            </div>
          </div>
        </div>

        {/* Subnav */}
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', padding: '12px 14px 4px' }}>
          {TABS.map((t) => (
            <button key={t.key} onClick={() => setActiveTab(t.key)} style={{
              flex: '0 0 auto', padding: '8px 14px', borderRadius: 12, border: '1px solid #eadcca', fontSize: 12.5, fontWeight: 900, cursor: 'pointer',
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
              <button onClick={() => setActiveSheet('new_expense')} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: '#15803d', color: '#fff', border: 'none', borderRadius: 14, padding: '12px 0', fontWeight: 900, fontSize: 13.5, cursor: 'pointer', marginTop: 8, marginBottom: 12 }}>
                <Plus size={16} /> Ghi khoản chi
              </button>
              <div style={{ fontSize: 11, fontWeight: 900, color: '#725f50', textTransform: 'uppercase', marginBottom: 8 }}>
                Đã qua duyệt — chờ Kế toán chi ({(readyExpenses || []).length})
              </div>
              {(readyExpenses || []).length === 0 && !loading && (
                <div style={{ textAlign: 'center', padding: '20px 0', color: '#725f50', fontSize: 13 }}>Không có khoản chi nào đang chờ.</div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {(readyExpenses || []).map((exp: any) => (
                  <div key={exp?.id} style={{ background: '#fff', border: '1.5px solid #eadcca', borderRadius: 16, padding: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 13.5, fontWeight: 900, color: '#2d1c10' }}>{exp?.description || 'Khoản chi'}</div>
                        <div style={{ fontSize: 11, color: '#725f50', marginTop: 2 }}>{exp?.claimant_name || 'Không rõ'}{exp?.approval_reason ? ` · ${exp.approval_reason}` : ''}</div>
                      </div>
                      <div style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontWeight: 900, fontSize: 14, color: '#4A2610', whiteSpace: 'nowrap', marginLeft: 8 }}>
                        {formatVND(exp?.amount)}
                      </div>
                    </div>
                    <button onClick={() => handleMarkPaid(exp?.id)} style={{ width: '100%', marginTop: 8, background: '#c28c4e', color: '#fff', border: 'none', borderRadius: 10, padding: '9px 0', fontWeight: 900, fontSize: 12.5, cursor: 'pointer' }}>
                      ⚡ Đã chi tiền
                    </button>
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
              <div style={{ fontSize: 11, fontWeight: 900, color: '#725f50', textTransform: 'uppercase', marginBottom: 8 }}>
                Đã Giám đốc duyệt — chờ chi ({(readyAdvances || []).length})
              </div>
              {(readyAdvances || []).length === 0 && !loading && (
                <div style={{ textAlign: 'center', padding: '20px 0', color: '#725f50', fontSize: 13 }}>Không có yêu cầu tạm ứng nào đang chờ.</div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {(readyAdvances || []).map((a: any) => (
                  <div key={a?.id} style={{ background: '#fefce8', border: '1.5px solid #facc15', borderRadius: 16, padding: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 13.5, fontWeight: 900, color: '#2d1c10' }}>{a?.employee_name || 'Không rõ'}</div>
                        <div style={{ fontSize: 11, color: '#725f50', marginTop: 2 }}>Lý do: {a?.reason || '—'}</div>
                      </div>
                      <div style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontWeight: 900, fontSize: 14, color: '#4A2610', whiteSpace: 'nowrap', marginLeft: 8 }}>
                        {formatVND(a?.amount)}
                      </div>
                    </div>
                    <button onClick={() => handlePayAdvance(a?.id)} style={{ width: '100%', marginTop: 8, background: '#c28c4e', color: '#fff', border: 'none', borderRadius: 10, padding: '9px 0', fontWeight: 900, fontSize: 12.5, cursor: 'pointer' }}>
                      ⚡ Đã chi tạm ứng
                    </button>
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
                    <div key={r?.id} style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#fff', border: '1px solid #eadcca', borderRadius: 12, padding: '10px 12px' }}>
                      <span style={{ fontSize: 18 }}>{r?.type === 'chi' ? '➖' : '➕'}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12.5, fontWeight: 800, color: '#2d1c10', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r?.label || 'Giao dịch'}</div>
                        <div style={{ fontSize: 10.5, color: '#8c7664' }}>{dateStr}</div>
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
