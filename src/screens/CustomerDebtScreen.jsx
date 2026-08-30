import React, { useEffect, useRef, useState } from 'react';
import { Card } from '../components/data/Card';
import { StatCard } from '../components/data/StatCard';
import { Badge } from '../components/feedback/Badge';
import { Button } from '../components/forms/Button';
import { Input } from '../components/forms/Input';
import { useAuth } from '../lib/AuthContext';
import { hasAnyRole } from '../lib/roles';
import { fetchDebtBalances, fetchDebtEntries, recordDebtPayment, uploadDebtPaymentPhoto } from '../lib/customerDebt';
import { toWebSafeImage } from '../lib/imageConvert';
import { downloadCsv } from '../lib/exportCsv';
import { IconMoney } from '../components/icons/FrogIcons';

const vnd = (n) => `${Math.round(n || 0).toLocaleString('vi-VN')}đ`;
const FLOWS = [{ key: 'school', label: 'Trường học' }, { key: 'bakery', label: 'Bakery' }, { key: 'macaron', label: 'Macaron' }, { key: 'teabreak', label: 'Teabreak' }];

const ENTRY_LABELS = { opening: 'Công nợ mở đầu', order_charge: 'Đơn hàng', payment: 'Đã thu tiền', adjustment: 'Điều chỉnh' };

function PaymentModal({ customer, onClose, onDone }) {
  const [amount, setAmount] = useState('');
  const [photo, setPhoto] = useState(null);
  const [note, setNote] = useState('');
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const ref = useRef();

  const pick = async (f) => {
    if (!f) return;
    setUploading(true); setError('');
    try {
      const safe = await toWebSafeImage(f);
      const url = await uploadDebtPaymentPhoto(safe);
      setPhoto(url);
    } catch (e) { setError(e.message); } finally { setUploading(false); }
  };

  const submit = async () => {
    const amt = Number(amount);
    if (!amt || amt <= 0) return setError('Nhập số tiền thu hợp lệ.');
    if (!photo) return setError('Bắt buộc ảnh chứng từ thu tiền.');
    setBusy(true); setError('');
    try {
      await recordDebtPayment({ customerId: customer.customer_id, amount: amt, photoUrl: photo, note: note.trim() || null });
      onDone();
      onClose();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'var(--surface-overlay)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60, padding: 16 }} onClick={onClose}>
      <div style={{ background: 'var(--surface-card)', borderRadius: 'var(--radius-lg)', width: 420, maxWidth: '100%', padding: 20, boxShadow: 'var(--shadow-lg)', display: 'flex', flexDirection: 'column', gap: 12 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ font: 'var(--text-title)', color: 'var(--text-primary)' }}>Ghi nhận thu công nợ</div>
        <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-muted)' }}>{customer.name} · Đang nợ {vnd(customer.balance)}</div>
        <Input label="Số tiền đã thu" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Ví dụ: 5000000" />
        <label style={{ font: 'var(--text-label)', color: 'var(--text-primary)' }}>Ghi chú</label>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Không bắt buộc" style={{ minHeight: 60, borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-default)', padding: 10, font: 'var(--text-body-sm)' }} />
        <button onClick={() => ref.current?.click()} disabled={uploading} style={{ minHeight: 48, borderRadius: 'var(--radius-md)', border: '2px dashed var(--border-default)', background: 'var(--surface-card)', cursor: 'pointer' }}>
          {uploading ? 'Đang tải ảnh...' : photo ? '📎 Đã có ảnh chứng từ' : '📷 Chụp/chọn ảnh chứng từ thu tiền'}
        </button>
        <input ref={ref} hidden type="file" accept="image/*" capture="environment" onChange={(e) => pick(e.target.files?.[0])} />
        {error && <div style={{ font: 'var(--text-body-sm)', color: 'var(--status-danger)' }}>{error}</div>}
        <div style={{ display: 'flex', gap: 8 }}>
          <Button variant="secondary" style={{ flex: 1 }} onClick={onClose}>Huỷ</Button>
          <Button style={{ flex: 2 }} disabled={busy || uploading} onClick={submit}>{busy ? 'Đang lưu...' : '✓ Xác nhận đã thu'}</Button>
        </div>
      </div>
    </div>
  );
}

function CustomerDetail({ customer, onClose, onPaid }) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showPay, setShowPay] = useState(false);

  const load = () => { setLoading(true); fetchDebtEntries(customer.customer_id).then(setEntries).finally(() => setLoading(false)); };
  useEffect(() => { load(); }, [customer.customer_id]);

  const exportDetail = () => {
    downloadCsv(`cong-no-${customer.school_code || customer.customer_id}.csv`,
      ['Ngày', 'Loại', 'Đơn hàng', 'Tiền gốc', 'VAT 8%', 'Hiệu ứng công nợ', 'Ghi chú'],
      entries.map((e) => [
        new Date(e.created_at).toLocaleString('vi-VN'), ENTRY_LABELS[e.entry_type] || e.entry_type,
        e.orders?.order_code || '', e.base_amount, e.vat_amount, e.amount, e.note || '',
      ]));
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'var(--surface-overlay)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 55, padding: 16 }} onClick={onClose}>
      <div style={{ background: 'var(--surface-card)', borderRadius: 'var(--radius-lg)', width: 520, maxWidth: '100%', maxHeight: '86vh', overflowY: 'auto', padding: 20, boxShadow: 'var(--shadow-lg)', display: 'flex', flexDirection: 'column', gap: 12 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
          <div>
            <div style={{ font: 'var(--text-title)', color: 'var(--text-primary)' }}>{customer.name}</div>
            <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-muted)' }}>{customer.school_code || '—'} · MST {customer.tax_code || '—'}</div>
          </div>
          <button onClick={onClose} style={{ border: 'none', background: 'none', color: 'var(--text-muted)', fontSize: 18, cursor: 'pointer' }}>✕</button>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--surface-sunken)', borderRadius: 'var(--radius-md)', padding: 12 }}>
          <div>
            <div style={{ font: 'var(--text-caption)', color: 'var(--text-muted)' }}>Đang nợ</div>
            <div style={{ font: 'var(--text-display-sm)', fontWeight: 800, color: customer.balance > 0 ? 'var(--status-danger)' : 'var(--status-success)' }}>{vnd(customer.balance)}</div>
          </div>
          <Button size="sm" onClick={() => setShowPay(true)}>💰 Ghi thu tiền</Button>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ font: 'var(--text-label)', color: 'var(--text-primary)' }}>Lịch sử công nợ ({entries.length})</div>
          <Button size="sm" variant="ghost" onClick={exportDetail}>⬇ Xuất CSV</Button>
        </div>
        {loading ? <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-muted)' }}>Đang tải...</div> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {entries.map((e) => (
              <div key={e.id} style={{ background: 'var(--surface-sunken)', borderRadius: 'var(--radius-md)', padding: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                  <Badge tone={e.entry_type === 'payment' ? 'success' : e.entry_type === 'order_charge' ? 'warning' : 'neutral'}>{ENTRY_LABELS[e.entry_type] || e.entry_type}</Badge>
                  <b style={{ color: e.amount >= 0 ? 'var(--status-danger)' : 'var(--status-success)' }}>{e.amount >= 0 ? '+' : ''}{vnd(e.amount)}</b>
                </div>
                {e.orders?.order_code && <div style={{ font: 'var(--text-caption)', color: 'var(--text-muted)' }}>Đơn {e.orders.order_code}{e.vat_amount > 0 ? ` · gốc ${vnd(e.base_amount)} + VAT ${vnd(e.vat_amount)}` : ''}</div>}
                {e.note && <div style={{ font: 'var(--text-caption)', color: 'var(--text-secondary)' }}>{e.note}</div>}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <time style={{ font: 'var(--text-caption)', color: 'var(--text-muted)' }}>{new Date(e.created_at).toLocaleString('vi-VN')}</time>
                  {e.photo_url && <a href={e.photo_url} target="_blank" rel="noreferrer" style={{ font: 'var(--text-caption)' }}>📷 Xem ảnh</a>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      {showPay && <PaymentModal customer={customer} onClose={() => setShowPay(false)} onDone={() => { load(); onPaid(); }} />}
    </div>
  );
}

export default function CustomerDebtScreen() {
  const { profile } = useAuth();
  const canView = hasAnyRole(profile, ['owner', 'accountant']);
  const [flow, setFlow] = useState('school');
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(null);

  const load = () => {
    if (!canView) return;
    setLoading(true); setError('');
    fetchDebtBalances({ search }).then(setRows).catch((e) => setError(e.message)).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, [search, canView]);

  if (!canView) {
    return (
      <div style={{ padding: 30, textAlign: 'center', font: 'var(--text-body)', color: 'var(--text-muted)' }}>
        🔒 Chỉ Kế Toán và Giám đốc xem được Công Nợ Khách Hàng.
      </div>
    );
  }

  const totalDebt = rows.reduce((s, r) => s + Math.max(Number(r.balance) || 0, 0), 0);
  const exportAll = () => {
    downloadCsv('cong-no-khach-hang.csv',
      ['Mã trường', 'Tên trường', 'MST', 'Địa chỉ', 'Đang nợ'],
      rows.map((r) => [r.school_code || '', r.name, r.tax_code || '', r.address || '', r.balance]));
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ font: 'var(--text-display-md)', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
        <IconMoney size={22} /> Công Nợ Khách Hàng
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {FLOWS.map((f) => (
          <button key={f.key} onClick={() => setFlow(f.key)} disabled={f.key !== 'school'} style={{
            minHeight: 36, padding: '6px 14px', borderRadius: 999, fontSize: 13, fontWeight: 700,
            cursor: f.key === 'school' ? 'pointer' : 'not-allowed', opacity: f.key === 'school' ? 1 : 0.4,
            border: flow === f.key ? '2px solid #d96b43' : '1px solid var(--border-default)',
            background: flow === f.key ? '#fdece3' : '#fff', color: flow === f.key ? '#b93e13' : '#2d1c10',
          }}>{f.label}{f.key !== 'school' ? ' (sắp có)' : ''}</button>
        ))}
      </div>

      <Input placeholder="Tìm theo tên trường, mã trường, hoặc MST…" value={search} onChange={(e) => setSearch(e.target.value)} />

      {error && <div style={{ font: 'var(--text-body-sm)', color: 'var(--status-danger)' }}>Lỗi: {error}</div>}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
        <StatCard label="Tổng công nợ đang mở" value={vnd(totalDebt)} tone="danger" icon={<IconMoney size={18} />} style={{ flex: 1, minWidth: 180 }} />
        <StatCard label="Số khách có công nợ" value={rows.length} style={{ flex: 1, minWidth: 140 }} />
        <Button variant="secondary" onClick={exportAll} style={{ alignSelf: 'center' }}>⬇ Xuất CSV toàn bộ</Button>
      </div>

      {loading ? (
        <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-muted)' }}>Đang tải...</div>
      ) : rows.length === 0 ? (
        <Card><div style={{ font: 'var(--text-body-sm)', color: 'var(--text-muted)', textAlign: 'center', padding: 12 }}>Không có công nợ nào khớp tìm kiếm.</div></Card>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {rows.map((r) => (
            <Card key={r.customer_id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', cursor: 'pointer' }} padding={14} onClick={() => setSelected(r)}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 200 }}>
                <div style={{ font: 'var(--text-label)', color: 'var(--text-primary)' }}>{r.name}</div>
                <div style={{ font: 'var(--text-caption)', color: 'var(--text-muted)' }}>{r.school_code || '—'} · MST {r.tax_code || '—'}</div>
              </div>
              <b style={{ font: 'var(--text-title)', color: r.balance > 0 ? 'var(--status-danger)' : 'var(--status-success)' }}>{vnd(r.balance)}</b>
            </Card>
          ))}
        </div>
      )}

      {selected && <CustomerDetail customer={selected} onClose={() => setSelected(null)} onPaid={load} />}
    </div>
  );
}
