import React, { useEffect, useState } from 'react';
import { Tabs } from '../components/navigation/Tabs';
import { StatCard } from '../components/data/StatCard';
import { Button } from '../components/forms/Button';
import { Input } from '../components/forms/Input';
import { Badge } from '../components/feedback/Badge';
import {
  fetchCashbookEntries, addCashbookEntry, fetchOrders, markOrderPaid,
  fetchDebts, addDebt, markDebtPaid, fetchCashReconciliations, addCashReconciliation,
} from '../lib/queries';
import { useAuth } from '../lib/AuthContext';
import { localDateStr } from '../lib/date';
import { IconMoney, IconTrendDown, IconReceipt, IconOrders } from '../components/icons/FrogIcons';

const HISTORY_DAYS = 30;

function CashReconciliationModal({ expectedCash, staffName, onClose, onClosed }) {
  const [actualCash, setActualCash] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const difference = (Number(actualCash) || 0) - expectedCash;

  const handleSubmit = async () => {
    if (actualCash === '') { setError('Nhập số tiền mặt đếm được thực tế.'); return; }
    if (difference !== 0 && !note.trim()) { setError('Có chênh lệch — bắt buộc nhập lý do.'); return; }
    setSaving(true);
    setError('');
    try {
      await addCashReconciliation({
        workDate: localDateStr(), expectedCash, actualCash: Number(actualCash) || 0,
        staffName, note: note || null,
      });
      onClosed();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'var(--surface-overlay)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }} onClick={onClose}>
      <div style={{ background: 'var(--surface-card)', borderRadius: 'var(--radius-lg)', width: 380, padding: 20, boxShadow: 'var(--shadow-lg)', display: 'flex', flexDirection: 'column', gap: 12 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ font: 'var(--text-title)', color: 'var(--text-primary)' }}>Chốt ca — Đối chiếu tiền mặt</div>
        {error && <div style={{ font: 'var(--text-body-sm)', color: 'var(--status-danger)' }}>{error}</div>}
        <div style={{ display: 'flex', justifyContent: 'space-between', font: 'var(--text-body)', padding: '8px 10px', background: 'var(--surface-sunken)', borderRadius: 'var(--radius-sm)' }}>
          <span>Dự kiến (Thu − Chi hôm nay)</span><b>{expectedCash.toLocaleString('vi-VN')}đ</b>
        </div>
        <Input label="Tiền mặt đếm được thực tế" type="number" placeholder="VD: 1250000" value={actualCash} onChange={(e) => setActualCash(e.target.value)} />
        {actualCash !== '' && (
          <div style={{ font: 'var(--text-body-sm)', color: difference === 0 ? 'var(--status-success)' : 'var(--status-danger)' }}>
            Chênh lệch: {difference > 0 ? '+' : ''}{difference.toLocaleString('vi-VN')}đ
          </div>
        )}
        <Input label="Lý do lệch quỹ (bắt buộc nếu có chênh lệch)" placeholder="VD: làm tròn tiền lẻ, khách trả thiếu..." value={note} onChange={(e) => setNote(e.target.value)} />
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <Button variant="secondary" size="sm" onClick={onClose} disabled={saving}>Hủy</Button>
          <Button variant="primary" size="sm" disabled={saving} onClick={handleSubmit}>{saving ? 'Đang lưu...' : 'Khóa ca'}</Button>
        </div>
      </div>
    </div>
  );
}

function AddEntryForm({ type, onAdded }) {
  const [label, setLabel] = useState('');
  const [amount, setAmount] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (!label || !amount) return;
    setSaving(true);
    try {
      await addCashbookEntry({ type, label, amount: Number(amount) });
      setLabel(''); setAmount('');
      onAdded();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
      <Input label={type === 'thu' ? 'Khoản thu' : 'Khoản chi'} placeholder="VD: Thanh toán VietQR" value={label} onChange={(e) => setLabel(e.target.value)} style={{ flex: '2 1 200px' }} />
      <Input label="Số tiền" type="number" placeholder="VD: 500000" value={amount} onChange={(e) => setAmount(e.target.value)} style={{ flex: '1 1 140px' }} />
      <Button variant="secondary" size="sm" onClick={handleSubmit} disabled={saving || !label || !amount}>{saving ? 'Đang lưu...' : '+ Thêm'}</Button>
    </div>
  );
}

function DebtRow({ order, onMarkPaid }) {
  const [busy, setBusy] = useState(false);
  const owed = Number(order.total || 0) - Number(order.paid_amount || 0);
  const handlePaid = async () => {
    setBusy(true);
    try { await onMarkPaid(order.id, order.total); } finally { setBusy(false); }
  };
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--surface-card)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-sm)', padding: '12px 16px' }}>
      <div>
        <div style={{ font: 'var(--text-body)', color: 'var(--text-primary)' }}>{order.customer?.name || 'Khách lẻ'}</div>
        <div style={{ font: 'var(--text-caption)', color: 'var(--text-muted)' }}>Tổng {Number(order.total).toLocaleString('vi-VN')}đ · Đã trả {Number(order.paid_amount).toLocaleString('vi-VN')}đ</div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Badge tone="danger">Còn nợ {owed.toLocaleString('vi-VN')}đ</Badge>
        <Button variant="secondary" size="sm" onClick={handlePaid} disabled={busy}>{busy ? '...' : 'Đã thu đủ'}</Button>
      </div>
    </div>
  );
}

function AddDebtForm({ onAdded }) {
  const [supplierName, setSupplierName] = useState('');
  const [amount, setAmount] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (!supplierName || !amount) return;
    setSaving(true);
    try {
      await addDebt({ supplierName, amount: Number(amount), dueDate: dueDate || null, note });
      setSupplierName(''); setAmount(''); setDueDate(''); setNote('');
      onAdded();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
      <Input label="Nhà cung cấp" placeholder="VD: Vựa trứng Cô Ba" value={supplierName} onChange={(e) => setSupplierName(e.target.value)} style={{ flex: '2 1 180px' }} />
      <Input label="Số tiền nợ" type="number" placeholder="VD: 2000000" value={amount} onChange={(e) => setAmount(e.target.value)} style={{ flex: '1 1 130px' }} />
      <Input label="Hạn trả" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} style={{ flex: '1 1 140px' }} />
      <Input label="Ghi chú" placeholder="VD: tiền trứng tháng 8" value={note} onChange={(e) => setNote(e.target.value)} style={{ flex: '2 1 180px' }} />
      <Button variant="secondary" size="sm" onClick={handleSubmit} disabled={saving || !supplierName || !amount}>{saving ? 'Đang lưu...' : '+ Ghi nợ'}</Button>
    </div>
  );
}

function SupplierDebtRow({ debt, onPaid }) {
  const [busy, setBusy] = useState(false);
  const isOverdue = debt.due_date && new Date(debt.due_date) < new Date() && debt.status !== 'da_tra';
  const handlePaid = async () => {
    setBusy(true);
    try { await onPaid(debt); } finally { setBusy(false); }
  };
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--surface-card)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-sm)', padding: '12px 16px' }}>
      <div>
        <div style={{ font: 'var(--text-body)', color: 'var(--text-primary)' }}>{debt.supplier_name}</div>
        <div style={{ font: 'var(--text-caption)', color: 'var(--text-muted)' }}>
          {debt.note && `${debt.note} · `}{debt.due_date ? `Hạn trả: ${new Date(debt.due_date).toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}` : 'Không có hạn'}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {debt.status === 'da_tra' ? (
          <Badge tone="success">Đã trả</Badge>
        ) : (
          <React.Fragment>
            <Badge tone={isOverdue ? 'danger' : 'warning'}>{isOverdue ? 'Trễ hạn — ' : ''}{Number(debt.amount).toLocaleString('vi-VN')}đ</Badge>
            <Button variant="secondary" size="sm" onClick={handlePaid} disabled={busy}>{busy ? '...' : 'Đã trả'}</Button>
          </React.Fragment>
        )}
      </div>
    </div>
  );
}

export default function CashbookScreen() {
  const { profile } = useAuth();
  const [tab, setTab] = useState('thu');
  const [showZ, setShowZ] = useState(false);
  const [entries, setEntries] = useState([]);
  const [orders, setOrders] = useState([]);
  const [debts, setDebts] = useState([]);
  const [reconciliations, setReconciliations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = () => {
    setLoading(true);
    const since = new Date(); since.setDate(since.getDate() - HISTORY_DAYS);
    Promise.all([
      fetchCashbookEntries({ since: since.toISOString() }), fetchOrders(),
      fetchDebts(), fetchCashReconciliations({ date: localDateStr() }),
    ])
      .then(([entryRows, orderRows, debtRows, reconRows]) => {
        setEntries(entryRows); setOrders(orderRows); setDebts(debtRows); setReconciliations(reconRows); setError('');
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const isToday = (iso) => new Date(iso).toDateString() === new Date().toDateString();
  const todayEntries = entries.filter((e) => isToday(e.occurred_at));
  const thuToday = todayEntries.filter((e) => e.type === 'thu');
  const chiToday = todayEntries.filter((e) => e.type === 'chi');
  const totalThuToday = thuToday.reduce((s, e) => s + Number(e.amount), 0);
  const totalChiToday = chiToday.reduce((s, e) => s + Number(e.amount), 0);

  const totalThu30 = entries.filter((e) => e.type === 'thu').reduce((s, e) => s + Number(e.amount), 0);
  const totalChi30 = entries.filter((e) => e.type === 'chi').reduce((s, e) => s + Number(e.amount), 0);

  const debtOrders = orders.filter((o) => o.status !== 'huy' && Number(o.total || 0) > Number(o.paid_amount || 0));
  const totalDebt = debtOrders.reduce((s, o) => s + (Number(o.total) - Number(o.paid_amount)), 0);

  const unpaidSupplierDebts = debts.filter((d) => d.status !== 'da_tra');
  const totalSupplierDebt = unpaidSupplierDebts.reduce((s, d) => s + Number(d.amount || 0), 0);

  const rows = tab === 'thu' ? thuToday : tab === 'chi' ? chiToday : [];
  const todayRecon = reconciliations[0];

  const handleMarkPaid = async (id, total) => {
    await markOrderPaid(id, total);
    load();
  };

  const handleSupplierPaid = async (debt) => {
    await markDebtPaid(debt.id, { supplierName: debt.supplier_name, amount: debt.amount });
    load();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div style={{ font: 'var(--text-display-md)', color: 'var(--text-primary)' }}>Sổ Quỹ</div>
          <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-muted)' }}>Dữ liệu thật từ database — thu/chi, công nợ, P&amp;L 30 ngày</div>
        </div>
        {todayRecon ? (
          <Badge tone={todayRecon.difference === 0 ? 'success' : 'warning'}>
            Đã chốt ca hôm nay — chênh {Number(todayRecon.difference).toLocaleString('vi-VN')}đ
          </Badge>
        ) : (
          <Button variant="danger" onClick={() => setShowZ(true)}>Chốt ca (Z-Report)</Button>
        )}
      </div>
      {error && <div style={{ font: 'var(--text-body-sm)', color: 'var(--status-danger)' }}>Lỗi tải sổ quỹ: {error}</div>}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <StatCard label="Thu hôm nay" value={`${totalThuToday.toLocaleString('vi-VN')}đ`} tone="success" icon={<IconMoney size={18} />} style={{ flex: 1, minWidth: 160 }} />
        <StatCard label="Chi hôm nay" value={`${totalChiToday.toLocaleString('vi-VN')}đ`} tone="danger" icon={<IconTrendDown size={18} />} style={{ flex: 1, minWidth: 160 }} />
        <StatCard label="Khách còn nợ" value={`${totalDebt.toLocaleString('vi-VN')}đ`} tone={totalDebt > 0 ? 'danger' : 'neutral'} icon={<IconReceipt size={18} />} style={{ flex: 1, minWidth: 160 }} />
        <StatCard label="Tiệm nợ NCC" value={`${totalSupplierDebt.toLocaleString('vi-VN')}đ`} tone={totalSupplierDebt > 0 ? 'warning' : 'neutral'} icon={<IconOrders size={18} />} style={{ flex: 1, minWidth: 160 }} />
      </div>
      <Tabs tabs={[{ key: 'thu', label: 'THU' }, { key: 'chi', label: 'CHI' }, { key: 'no_khach', label: 'NỢ KHÁCH' }, { key: 'no_ncc', label: 'NỢ NCC' }, { key: 'pl', label: 'LÃI LỖ' }]} active={tab} onChange={setTab} />

      {loading ? (
        <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-muted)' }}>Đang tải...</div>
      ) : tab === 'no_khach' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {debtOrders.length === 0 ? (
            <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-muted)', padding: 16 }}>Không có công nợ nào — mọi đơn đã thu đủ.</div>
          ) : debtOrders.map((o) => <DebtRow key={o.id} order={o} onMarkPaid={handleMarkPaid} />)}
        </div>
      ) : tab === 'no_ncc' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <AddDebtForm onAdded={load} />
          {debts.length === 0 ? (
            <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-muted)', padding: 16 }}>Chưa ghi khoản nợ nhà cung cấp nào.</div>
          ) : debts.map((d) => <SupplierDebtRow key={d.id} debt={d} onPaid={handleSupplierPaid} />)}
        </div>
      ) : tab === 'pl' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-muted)' }}>Tổng hợp {HISTORY_DAYS} ngày gần nhất</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', background: 'var(--surface-card)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-sm)', padding: '12px 16px', font: 'var(--text-body)' }}>
            <span>Tổng thu</span><b style={{ color: 'var(--status-success)' }}>{totalThu30.toLocaleString('vi-VN')}đ</b>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', background: 'var(--surface-card)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-sm)', padding: '12px 16px', font: 'var(--text-body)' }}>
            <span>Tổng chi</span><b style={{ color: 'var(--status-danger)' }}>{totalChi30.toLocaleString('vi-VN')}đ</b>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', background: 'var(--surface-primary-soft)', borderRadius: 'var(--radius-md)', padding: '12px 16px', font: 'var(--text-title)', color: 'var(--text-primary)' }}>
            <span>Lợi nhuận ròng</span><b>{(totalThu30 - totalChi30).toLocaleString('vi-VN')}đ</b>
          </div>
        </div>
      ) : (
        <React.Fragment>
          <AddEntryForm type={tab === 'chi' ? 'chi' : 'thu'} onAdded={load} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {rows.map((r) => (
              <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', background: 'var(--surface-card)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-sm)', padding: '12px 16px', font: 'var(--text-body)' }}>
                <span>{r.label}</span><b>{Number(r.amount).toLocaleString('vi-VN')}đ <span style={{ font: 'var(--text-caption)', color: 'var(--text-muted)', fontWeight: 400 }}>{new Date(r.occurred_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' })}</span></b>
              </div>
            ))}
            {rows.length === 0 && <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-muted)', padding: 16 }}>Chưa có giao dịch nào hôm nay.</div>}
          </div>
        </React.Fragment>
      )}
      {showZ && (
        <CashReconciliationModal expectedCash={totalThuToday - totalChiToday} staffName={profile?.full_name}
          onClose={() => setShowZ(false)} onClosed={load} />
      )}
    </div>
  );
}
