import React, { useEffect, useState } from 'react';
import { Badge } from '../components/feedback/Badge';
import { TrustScoreBadge } from '../components/feedback/TrustScoreBadge';
import { KanbanCard } from '../components/data/KanbanCard';
import { Button } from '../components/forms/Button';
import { Input } from '../components/forms/Input';
import { Select } from '../components/forms/Select';
import { Tabs } from '../components/navigation/Tabs';
import { fetchOrders, createOrder, fetchProducts, createProduct, cancelOrder, deleteOrder, fetchOrderNotes, addOrderNote, updateOrderFull } from '../lib/queries';
import { CommentSection } from '../components/CommentSection';
import { formatVnd, parseDigits } from '../lib/currency';
import { useAuth } from '../lib/AuthContext';
import { PhotoField } from '../components/PhotoField';
import { IncidentReportModal } from '../components/IncidentReportModal';
import { ActionChip } from '../components/ActionChip';
import { supabase } from '../lib/supabaseClient';
import { localDateStr, formatDeliveryDateTime } from '../lib/date';
import { downloadCsv } from '../lib/exportCsv';
import { CAKE_SIZES_CM, CAKE_BASES, CAKE_FILLINGS, basePriceForSize, fillingSurchargeForSize, computeCakePrice, baseSurcharge, formatOrderItemLine } from '../lib/cakePricing';
import { IconWarning, IconEye, IconMapPin, IconClock, IconClipboard, IconPaperclip, IconHome, IconTruck, IconBan, IconCheck, IconTrash, IconStar, IconPhone, IconDownload } from '../components/icons/FrogIcons';

const STATUS_LABELS = {
  moi: 'Mới', dang_lam: 'Đang làm', cho_giao: 'Chờ giao', dang_giao: 'Đang giao',
  hoan_thanh: 'Hoàn thành', huy: 'Đã huỷ',
};

const NOTE_ROLE_LABELS = { owner: 'Chủ sở hữu', cashier: 'Thu ngân', kitchen: 'Bếp', shipper: 'Vận chuyển' };

// Chỉ cảnh báo "Chưa thu đủ" khi bất thường (đã giao mà chưa thu, hoặc quá hạn giao chưa thu) —
// đơn COD bình thường chưa giao thì chưa thu tiền là chuyện đương nhiên, không cần cảnh báo.
function getPaidBadgeState(order) {
  const total = Number(order.total || 0);
  if (total <= 0) return null;
  const paid = Number(order.paid_amount || 0) >= total;
  if (paid) return true;
  if (order.status === 'hoan_thanh') return false;
  if (order.delivery_date && order.delivery_date < localDateStr()) return false;
  return null;
}

function formatDuration(fromIso, toIso) {
  if (!fromIso || !toIso) return null;
  const ms = new Date(toIso).getTime() - new Date(fromIso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return null;
  const minutes = Math.round(ms / 60000);
  if (minutes < 60) return `${minutes} phút`;
  const hours = Math.floor(minutes / 60);
  const rem = minutes % 60;
  return rem ? `${hours} giờ ${rem} phút` : `${hours} giờ`;
}

function SearchResultRow({ o, onOpen }) {
  const itemSummary = (o.order_items || []).map((it) => it.name).join(' | ');
  return (
    <button onClick={() => onOpen(o)} style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, width: '100%', textAlign: 'left',
      background: 'var(--surface-card)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-sm)',
      padding: 12, border: 'none', cursor: 'pointer',
    }}>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ font: 'var(--text-label)', color: 'var(--text-primary)' }}>
          {o.customer?.name || 'Khách lẻ'} <span style={{ font: 'var(--text-caption)', color: 'var(--text-muted)' }}>{o.customer?.phone} · {o.order_code}</span>
        </div>
        <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{itemSummary}</div>
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <Badge tone={o.status === 'huy' ? 'danger' : o.status === 'hoan_thanh' ? 'success' : 'neutral'}>{STATUS_LABELS[o.status] || o.status}</Badge>
        <div style={{ font: 'var(--text-caption)', color: 'var(--text-muted)', marginTop: 4 }}>{Number(o.total || 0).toLocaleString('vi-VN')}đ</div>
      </div>
    </button>
  );
}

function Column({ title, count, orders, onOpen }) {
  return (
    <div style={{ flex: 1, minWidth: 260, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, font: 'var(--text-label)', color: 'var(--text-secondary)' }}>
        {title} <Badge tone="neutral">{count}</Badge>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {orders.map((o) => {
          const itemSummary = (o.order_items || []).map((it) => formatOrderItemLine(it, { withQty: false })).join(' | ');
          return (
            <KanbanCard key={o.id} customer={o.customer?.name || 'Khách lẻ'} phone={o.customer?.phone} item={itemSummary} note={o.note} channel={o.channel}
              orderCode={o.order_code} total={o.total} deliveryDate={o.delivery_date} deliveryTime={o.delivery_time} paid={getPaidBadgeState(o)}
              onClick={() => onOpen(o)}
              badges={[
                o.customer?.vip && <Badge tone="primary" icon={<IconStar size={13} />} key="vip">VIP</Badge>,
              ].filter(Boolean)}
            />
          );
        })}
      </div>
    </div>
  );
}

function extractManualItems(items, category) {
  const seen = new Set();
  const result = [];
  for (const it of items) {
    if (it.mode !== 'manual') continue;
    const name = (it.name || '').trim();
    const price = Number(it.price) || 0;
    if (!name || !price) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({ name, price, category, unit: it.unit || 'cái' });
  }
  return result;
}

const MANUAL_OPTION = '__manual__';
const BLANK_KEM = { mode: 'catalog', productId: '', name: '', qty: 1, size: '', cot: '', vi: '', price: '', refPhotoUrl: '' };
const BLANK_MAN = { mode: 'catalog', productId: '', name: '', qty: 1, note: '', price: '', refPhotoUrl: '' };
const BLANK_TB_ITEM = { mode: 'catalog', productId: '', name: '', qty: '', unit: 'cái', price: '', refPhotoUrl: '' };
const BLANK_MACARON_ITEM = { mode: 'catalog', productId: '', name: '', spec: '', qty: '', unit: 'khay', price: '', refPhotoUrl: '' };

function productOptions(products) {
  return [...products.map((p) => ({ value: p.id, label: `${p.name} (${Number(p.price).toLocaleString('vi-VN')}đ)` })), { value: MANUAL_OPTION, label: 'Khác (nhập tay)' }];
}

function PriceInput({ label, value, onChange, style, placeholder, helpText, noDelete }) {
  const [focused, setFocused] = useState(false);
  const handleChange = (e) => {
    const digits = parseDigits(e.target.value);
    if (noDelete && digits.length < String(value || '').length) return;
    onChange(digits);
  };
  const handleKeyDown = (e) => {
    if (!noDelete) return;
    if (e.key === 'Backspace' || e.key === 'Delete') e.preventDefault();
  };
  return (
    <Input
      label={label}
      type="text"
      inputMode="numeric"
      placeholder={placeholder}
      helpText={noDelete ? (helpText ? `${helpText} · Chỉ được thêm số, không xoá được.` : 'Chỉ được thêm số, không xoá được.') : helpText}
      value={focused ? value : formatVnd(value)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onChange={handleChange}
      onKeyDown={handleKeyDown}
      style={style}
    />
  );
}

function ReasonModal({ title, confirmLabel, confirmVariant, onClose, onConfirm, busy, error }) {
  const [reason, setReason] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'var(--surface-overlay)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60, padding: 16 }} onClick={onClose}>
      <div style={{ background: 'var(--surface-card)', borderRadius: 'var(--radius-lg)', width: 380, maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto', padding: 20, boxShadow: 'var(--shadow-lg)', display: 'flex', flexDirection: 'column', gap: 12 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ font: 'var(--text-title)', color: 'var(--text-primary)' }}>{title}</div>
        <Input label="Lý do" placeholder="VD: Khách đổi ý, nhập sai thông tin, hết nguyên liệu..." value={reason} onChange={(e) => setReason(e.target.value)} />
        <PhotoField url={photoUrl} onChange={setPhotoUrl} label="Ảnh bằng chứng (nếu có)" prefix="cancel" />
        {error && <div style={{ font: 'var(--text-body-sm)', color: 'var(--status-danger)' }}>{error}</div>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, paddingTop: 4 }}>
          <Button variant="secondary" size="sm" onClick={onClose} disabled={busy}>Huỷ</Button>
          <Button variant={confirmVariant} size="sm" onClick={() => onConfirm({ reason, photoUrl })} disabled={busy || !reason.trim()}>
            {busy ? 'Đang xử lý...' : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

function TeabreakItemRow({ item, onChange, onRemove, canRemove, products }) {
  const set = (k, v) => onChange({ ...item, [k]: v });
  const total = (Number(item.qty) || 0) * (Number(item.price) || 0);

  const handleSelectProduct = (productId) => {
    if (productId === MANUAL_OPTION) { onChange({ ...item, mode: 'manual', productId: '', name: '', price: '' }); return; }
    const p = products.find((x) => x.id === productId);
    onChange({ ...item, mode: 'catalog', productId, name: p.name, unit: p.unit, price: p.price });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: 8, borderRadius: 'var(--radius-md)', background: 'var(--surface-sunken)' }}>
      <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        {item.mode === 'catalog' ? (
          <Select label="Tên hàng hóa" value={item.productId} onChange={(e) => handleSelectProduct(e.target.value)}
            options={productOptions(products)} style={{ flex: '3 1 200px', minWidth: 0 }} />
        ) : (
          <Input label="Tên hàng hóa (nhập tay)" value={item.name} onChange={(e) => set('name', e.target.value)} style={{ flex: '3 1 160px', minWidth: 0 }} />
        )}
        <Input label="SL" type="number" value={item.qty} onChange={(e) => set('qty', e.target.value)} style={{ flex: '1 1 60px', minWidth: 0 }} />
        <Input label="ĐVT" value={item.unit} onChange={(e) => set('unit', e.target.value)} style={{ flex: '1 1 60px', minWidth: 0 }} />
        <PriceInput label="Đơn giá" value={item.price} onChange={(v) => set('price', v)} style={{ flex: '1 1 90px', minWidth: 0 }} />
        <div style={{ flex: '1 1 100px', font: 'var(--text-body-sm)', color: 'var(--text-secondary)', paddingBottom: 8, textAlign: 'right' }}>{total.toLocaleString('vi-VN')}đ</div>
        {canRemove && <button onClick={onRemove} style={{ border: 'none', background: 'none', color: 'var(--text-muted)', cursor: 'pointer', paddingBottom: 8, display: 'inline-flex' }}><IconTrash size={16} /></button>}
      </div>
      <PhotoField url={item.refPhotoUrl} onChange={(url) => set('refPhotoUrl', url)} label="Ảnh mẫu / quy cách (nếu có)" prefix="teabreak" />
    </div>
  );
}

function TeabreakOrderModal({ onClose, onCreated, onManualItems }) {
  const [isMobile, setIsMobile] = useState(window.innerWidth < 860);
  const [showIncident, setShowIncident] = useState(false);
  const [customer, setCustomer] = useState({ name: '', mst: '', email: '', address: '', phone: '' });
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [guestCount, setGuestCount] = useState('');
  const [items, setItems] = useState([{ ...BLANK_TB_ITEM }]);
  const [note, setNote] = useState('');
  const [products, setProducts] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const setC = (k, v) => setCustomer({ ...customer, [k]: v });
  const updateItem = (i, next) => setItems(items.map((it, idx) => (idx === i ? next : it)));
  const removeItem = (i) => setItems(items.filter((_, idx) => idx !== i));
  const subtotal = items.reduce((s, it) => s + (Number(it.qty) || 0) * (Number(it.price) || 0), 0);
  const vat = Math.round(subtotal * 0.08);
  const previewItems = items.filter((it) => it.name).map((it) => ({ name: `${it.name}${it.unit ? ` (${it.unit})` : ''}` }));

  useEffect(() => {
    fetchProducts({ activeOnly: true }).then((data) => setProducts(data.filter((p) => p.category === 'teabreak'))).catch(() => {});
  }, []);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 860);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const handleSubmit = async () => {
    if (!customer.name) { setError('Nhập tên công ty / khách.'); return; }
    setSaving(true);
    setError('');
    try {
      await createOrder({
        customer: { name: customer.name, phone: customer.phone, channel: 'Teabreak' },
        channel: 'Teabreak',
        address: customer.address,
        deliveryDate: date,
        deliveryTime: time,
        note: [note, guestCount && `Số khách: ${guestCount}`].filter(Boolean).join(' · '),
        total: subtotal + vat,
        items: items.map((it) => ({ productId: it.productId || null, name: `${it.name}${it.unit ? ` (${it.unit})` : ''}`, qty: it.qty, price: it.price, refPhotoUrl: it.refPhotoUrl })),
      });
      onManualItems?.(extractManualItems(items, 'teabreak'));
      onCreated();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'var(--surface-overlay)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 16 }} onClick={onClose}>
      <div style={{ background: 'var(--surface-card)', borderRadius: 'var(--radius-lg)', width: isMobile ? 560 : 920, maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto', boxShadow: 'var(--shadow-lg)' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ font: 'var(--text-title)', color: 'var(--text-primary)' }}>Tạo đơn Teabreak</div>
          <button onClick={onClose} style={{ border: 'none', background: 'none', fontSize: 18, cursor: 'pointer', color: 'var(--text-muted)' }}>✕</button>
        </div>
        <div style={{ padding: 20, display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: 20 }}>
          <div style={{ flex: isMobile ? '1 1 auto' : '1 1 480px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>
            {error && <div style={{ font: 'var(--text-body-sm)', color: 'var(--status-danger)', background: 'var(--status-danger-soft)', borderRadius: 'var(--radius-sm)', padding: '8px 10px' }}>{error}</div>}
            <div style={{ font: 'var(--text-label)' }}>Thông tin đơn vị đặt hàng</div>
            <Input label="Tên công ty / khách" placeholder="VD: Công ty Cổ phần Bệnh viện ĐHQT Hồng Bàng" value={customer.name} onChange={(e) => setC('name', e.target.value)} />
            <div style={{ display: 'flex', gap: 12 }}>
              <Input label="MST" value={customer.mst} onChange={(e) => setC('mst', e.target.value)} style={{ flex: 1 }} />
              <Input label="Email" value={customer.email} onChange={(e) => setC('email', e.target.value)} style={{ flex: 1 }} />
            </div>
            <Input label="Địa chỉ" value={customer.address} onChange={(e) => setC('address', e.target.value)} />
            <Input label="Số điện thoại" value={customer.phone} onChange={(e) => setC('phone', e.target.value)} />

            <div style={{ font: 'var(--text-label)', paddingTop: 6, borderTop: '1px solid var(--border-subtle)' }}>Giao hàng</div>
            <div style={{ display: 'flex', gap: 12 }}>
              <Input label="Ngày giao" type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ flex: 1 }} />
              <Input label="Thời gian" placeholder="VD: 7h15-11h30" value={time} onChange={(e) => setTime(e.target.value)} style={{ flex: 1 }} />
            </div>
            <Input label="Số khách Teabreak" placeholder="VD: 300 khách" value={guestCount} onChange={(e) => setGuestCount(e.target.value)} />

            <div style={{ font: 'var(--text-label)', paddingTop: 6, borderTop: '1px solid var(--border-subtle)' }}>Danh sách món — chọn từ menu để tự động ra giá, hoặc nhập tay</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {items.map((it, i) => (
                <TeabreakItemRow key={i} item={it} canRemove={items.length > 1} products={products}
                  onChange={(next) => updateItem(i, next)} onRemove={() => removeItem(i)} />
              ))}
            </div>
            <Button variant="secondary" size="sm" onClick={() => setItems([...items, { ...BLANK_TB_ITEM }])}>+ Thêm món</Button>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingTop: 6, borderTop: '1px solid var(--border-subtle)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', font: 'var(--text-body)' }}><span>Tổng</span><b>{subtotal.toLocaleString('vi-VN')}đ</b></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', font: 'var(--text-body)' }}><span>VAT 8%</span><b>{vat.toLocaleString('vi-VN')}đ</b></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', font: 'var(--text-title)', color: 'var(--text-primary)' }}><span>Tổng cộng</span><b>{(subtotal + vat).toLocaleString('vi-VN')}đ</b></div>
            </div>
            <Input label="Ghi chú" placeholder="Đơn giá chưa gồm VAT, thời gian đặt hàng, thanh toán..." value={note} onChange={(e) => setNote(e.target.value)} />
          </div>

          <div style={{ flex: isMobile ? '0 1 auto' : '1 1 320px', minWidth: 0 }}>
            <div style={{ position: isMobile ? 'static' : 'sticky', top: 0 }}>
              <OrderPreview custName={customer.name} custPhone={customer.phone} items={previewItems} deliveryMethod="giao_tan_noi"
                effectiveShipFee={0} total={subtotal + vat} note={note} address={customer.address} deliveryDate={date} deliveryTime={time} />
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '0 20px 20px' }}>
          <ActionChip icon={<IconWarning size={16} />} label="Báo sự cố" tone="danger" onClick={() => setShowIncident(true)} />
          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="secondary" size="sm" onClick={onClose} disabled={saving}>Hủy</Button>
            <Button variant="primary" size="sm" onClick={handleSubmit} disabled={saving}>{saving ? 'Đang lưu...' : 'Tạo đơn Teabreak'}</Button>
          </div>
        </div>
        {showIncident && (
          <IncidentReportModal orderCode={customer.name ? `Đơn mới — ${customer.name}` : null} onClose={() => setShowIncident(false)} onSent={() => setShowIncident(false)} />
        )}
      </div>
    </div>
  );
}

function EditTeabreakModal({ order, onClose, onSaved }) {
  const [isMobile, setIsMobile] = useState(window.innerWidth < 860);
  const [showIncident, setShowIncident] = useState(false);
  const [custName, setCustName] = useState(order.customer?.name || '');
  const [custPhone, setCustPhone] = useState(order.customer?.phone || '');
  const [address, setAddress] = useState(order.address || '');
  const [date, setDate] = useState(order.delivery_date || '');
  const [time, setTime] = useState(order.delivery_time || '');
  const [items, setItems] = useState(() => {
    const rows = (order.order_items || []).map((it) => ({ mode: 'manual', productId: '', name: it.name || '', qty: it.qty || 1, unit: '', price: it.price || '', refPhotoUrl: it.ref_photo_url || '' }));
    return rows.length ? rows : [{ ...BLANK_TB_ITEM }];
  });
  const [note, setNote] = useState(order.note || '');
  const [products, setProducts] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const updateItem = (i, next) => setItems(items.map((it, idx) => (idx === i ? next : it)));
  const removeItem = (i) => setItems(items.filter((_, idx) => idx !== i));
  const subtotal = items.reduce((s, it) => s + (Number(it.qty) || 0) * (Number(it.price) || 0), 0);
  const vat = Math.round(subtotal * 0.08);
  const previewItems = items.filter((it) => it.name).map((it) => ({ name: `${it.name}${it.unit ? ` (${it.unit})` : ''}` }));

  useEffect(() => {
    fetchProducts({ activeOnly: true }).then((data) => setProducts(data.filter((p) => p.category === 'teabreak'))).catch(() => {});
  }, []);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 860);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const handleSubmit = async () => {
    if (!custName) { setError('Nhập tên công ty / khách.'); return; }
    setSaving(true);
    setError('');
    try {
      await updateOrderFull(order.id, {
        customerName: custName, customerPhone: custPhone,
        address, deliveryDate: date, deliveryTime: time, note, total: subtotal + vat,
        items: items.map((it) => ({ ...it, name: `${it.name}${it.unit ? ` (${it.unit})` : ''}` })),
      });
      onSaved();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'var(--surface-overlay)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 55, padding: 16 }} onClick={onClose}>
      <div style={{ background: 'var(--surface-card)', borderRadius: 'var(--radius-lg)', width: isMobile ? 560 : 920, maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto', boxShadow: 'var(--shadow-lg)' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ font: 'var(--text-title)', color: 'var(--text-primary)' }}>Sửa đơn Teabreak {order.order_code || ''}</div>
            <div style={{ font: 'var(--text-caption)', color: 'var(--text-muted)' }}>Chỉnh sửa xong bấm Lưu thay đổi</div>
          </div>
          <button onClick={onClose} style={{ border: 'none', background: 'none', fontSize: 18, cursor: 'pointer', color: 'var(--text-muted)' }}>✕</button>
        </div>
        <div style={{ padding: 20, display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: 20 }}>
          <div style={{ flex: isMobile ? '1 1 auto' : '1 1 480px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>
            {error && <div style={{ font: 'var(--text-body-sm)', color: 'var(--status-danger)', background: 'var(--status-danger-soft)', borderRadius: 'var(--radius-sm)', padding: '8px 10px' }}>{error}</div>}

            <div style={{ font: 'var(--text-label)' }}>Thông tin đơn vị đặt hàng</div>
            <Input label="Tên công ty / khách" value={custName} onChange={(e) => setCustName(e.target.value)} />
            <Input label="Địa chỉ" value={address} onChange={(e) => setAddress(e.target.value)} />
            <Input label="Số điện thoại" value={custPhone} onChange={(e) => setCustPhone(e.target.value)} />

            <div style={{ font: 'var(--text-label)', paddingTop: 6, borderTop: '1px solid var(--border-subtle)' }}>Giao hàng</div>
            <div style={{ display: 'flex', gap: 12 }}>
              <Input label="Ngày giao" type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ flex: 1 }} />
              <Input label="Thời gian" placeholder="VD: 7h15-11h30" value={time} onChange={(e) => setTime(e.target.value)} style={{ flex: 1 }} />
            </div>

            <div style={{ font: 'var(--text-label)', paddingTop: 6, borderTop: '1px solid var(--border-subtle)' }}>Danh sách món</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {items.map((it, i) => (
                <TeabreakItemRow key={i} item={it} canRemove={items.length > 1} products={products}
                  onChange={(next) => updateItem(i, next)} onRemove={() => removeItem(i)} />
              ))}
            </div>
            <Button variant="secondary" size="sm" onClick={() => setItems([...items, { ...BLANK_TB_ITEM }])}>+ Thêm món</Button>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingTop: 6, borderTop: '1px solid var(--border-subtle)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', font: 'var(--text-body)' }}><span>Tổng</span><b>{subtotal.toLocaleString('vi-VN')}đ</b></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', font: 'var(--text-body)' }}><span>VAT 8%</span><b>{vat.toLocaleString('vi-VN')}đ</b></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', font: 'var(--text-title)', color: 'var(--text-primary)' }}><span>Tổng cộng</span><b>{(subtotal + vat).toLocaleString('vi-VN')}đ</b></div>
            </div>
            <Input label="Ghi chú" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>

          <div style={{ flex: isMobile ? '0 1 auto' : '1 1 320px', minWidth: 0 }}>
            <div style={{ position: isMobile ? 'static' : 'sticky', top: 0 }}>
              <OrderPreview custName={custName} custPhone={custPhone} items={previewItems} deliveryMethod="giao_tan_noi"
                effectiveShipFee={0} total={subtotal + vat} note={note} address={address} deliveryDate={date} deliveryTime={time} />
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '0 20px 20px' }}>
          <ActionChip icon={<IconWarning size={16} />} label="Báo sự cố" tone="danger" onClick={() => setShowIncident(true)} />
          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="secondary" size="sm" onClick={onClose} disabled={saving}>Hủy</Button>
            <Button variant="primary" size="sm" onClick={handleSubmit} disabled={saving}>{saving ? 'Đang lưu...' : 'Lưu thay đổi'}</Button>
          </div>
        </div>
        {showIncident && (
          <IncidentReportModal orderId={order.id} orderCode={order.order_code} onClose={() => setShowIncident(false)} onSent={() => setShowIncident(false)} />
        )}
      </div>
    </div>
  );
}

function MacaronItemRow({ item, onChange, onRemove, canRemove, products }) {
  const set = (k, v) => onChange({ ...item, [k]: v });
  const total = (Number(item.qty) || 0) * (Number(item.price) || 0);

  const handleSelectProduct = (productId) => {
    if (productId === MANUAL_OPTION) { onChange({ ...item, mode: 'manual', productId: '', name: '', price: '' }); return; }
    const p = products.find((x) => x.id === productId);
    onChange({ ...item, mode: 'catalog', productId, name: p.name, unit: p.unit || item.unit, price: p.price });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 10, borderRadius: 'var(--radius-md)', background: 'var(--surface-sunken)' }}>
      {item.mode === 'catalog' ? (
        <Select label="Tên hàng hóa" value={item.productId} onChange={(e) => handleSelectProduct(e.target.value)} options={productOptions(products)} />
      ) : (
        <Input label="Tên hàng hóa (nhập tay)" placeholder="VD: Macaron trang trí khay 36 cặp bánh" value={item.name} onChange={(e) => set('name', e.target.value)} />
      )}
      <Input label="Quy cách" placeholder="VD: Thùng 36 khay mix màu theo yêu cầu" value={item.spec} onChange={(e) => set('spec', e.target.value)} />
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <Input label="Số lượng" type="number" value={item.qty} onChange={(e) => set('qty', e.target.value)} style={{ flex: '1 1 80px', minWidth: 0 }} />
        <Input label="ĐVT" placeholder="VD: khay, thùng" value={item.unit} onChange={(e) => set('unit', e.target.value)} style={{ flex: '1 1 90px', minWidth: 0 }} />
        <PriceInput label="Đơn giá" placeholder="VD: 48000" value={item.price} onChange={(v) => set('price', v)} style={{ flex: '1 1 130px', minWidth: 0 }} />
      </div>
      <PhotoField url={item.refPhotoUrl} onChange={(url) => set('refPhotoUrl', url)} label="Ảnh mẫu / quy cách (nếu có)" prefix="macaron" />
      <div style={{ display: 'flex', justifyContent: 'space-between', font: 'var(--text-body-sm)', color: 'var(--text-secondary)' }}>
        <span>Thành tiền</span><b>{total.toLocaleString('vi-VN')}đ</b>
      </div>
      {canRemove && <Button variant="ghost" size="sm" onClick={onRemove} style={{ alignSelf: 'flex-end' }} icon={<IconTrash size={14} />}>Xoá hàng hóa</Button>}
    </div>
  );
}

function MacaronOrderModal({ onClose, onCreated, onManualItems }) {
  const [isMobile, setIsMobile] = useState(window.innerWidth < 860);
  const [showIncident, setShowIncident] = useState(false);
  const [custName, setCustName] = useState('');
  const [custPhone, setCustPhone] = useState('');
  const [address, setAddress] = useState('');
  const [deliveryMethod, setDeliveryMethod] = useState('giao_tan_noi');
  const [deliveryDate, setDeliveryDate] = useState('');
  const [deliveryTime, setDeliveryTime] = useState('');
  const [items, setItems] = useState([{ ...BLANK_MACARON_ITEM }]);
  const [note, setNote] = useState('');
  const [products, setProducts] = useState([]);
  const [hasShipFee, setHasShipFee] = useState('no');
  const [shipFee, setShipFee] = useState('');
  const [total, setTotal] = useState('');
  const [totalTouched, setTotalTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const updateItem = (i, next) => setItems(items.map((it, idx) => (idx === i ? next : it)));
  const removeItem = (i) => setItems(items.filter((_, idx) => idx !== i));
  const subtotal = items.reduce((s, it) => s + (Number(it.qty) || 0) * (Number(it.price) || 0), 0);
  const effectiveShipFee = hasShipFee === 'yes' ? (Number(shipFee) || 0) : 0;
  const previewItems = items.filter((it) => it.name).map((it) => ({ name: it.spec ? `${it.name} — ${it.spec}` : it.name }));

  useEffect(() => {
    fetchProducts({ activeOnly: true }).then((data) => setProducts(data.filter((p) => p.category === 'macaron'))).catch(() => {});
  }, []);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 860);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    if (!totalTouched) setTotal(String(subtotal + effectiveShipFee || ''));
  }, [subtotal, hasShipFee, shipFee]);

  const handleSubmit = async () => {
    if (!custName) { setError('Nhập tên khách hàng.'); return; }
    setSaving(true);
    setError('');
    try {
      await createOrder({
        customer: { name: custName, phone: custPhone, channel: 'Macaron Sỉ' },
        channel: 'Macaron Sỉ',
        address, deliveryDate, deliveryTime, note,
        deliveryMethod, shipFee: effectiveShipFee,
        total: Number(total) || 0, paymentMethod: 'cod',
        items: items.map((it) => ({
          productId: it.productId || null,
          name: it.spec ? `${it.name} — ${it.spec}` : it.name,
          qty: it.qty, price: it.price, refPhotoUrl: it.refPhotoUrl,
        })),
      });
      onManualItems?.(extractManualItems(items, 'macaron'));
      onCreated();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'var(--surface-overlay)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 16 }} onClick={onClose}>
      <div style={{ background: 'var(--surface-card)', borderRadius: 'var(--radius-lg)', width: isMobile ? 560 : 920, maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto', boxShadow: 'var(--shadow-lg)' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ font: 'var(--text-title)', color: 'var(--text-primary)' }}>Tạo đơn Macaron Sỉ</div>
            <div style={{ font: 'var(--text-caption)', color: 'var(--text-muted)' }}>Điền thông tin — xem trước cập nhật ngay bên {isMobile ? 'dưới' : 'phải'}</div>
          </div>
          <button onClick={onClose} style={{ border: 'none', background: 'none', fontSize: 18, cursor: 'pointer', color: 'var(--text-muted)' }}>✕</button>
        </div>
        <div style={{ padding: 20, display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: 20 }}>
          <div style={{ flex: isMobile ? '1 1 auto' : '1 1 480px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>
            {error && <div style={{ font: 'var(--text-body-sm)', color: 'var(--status-danger)', background: 'var(--status-danger-soft)', borderRadius: 'var(--radius-sm)', padding: '8px 10px' }}>{error}</div>}

            <div style={{ font: 'var(--text-label)' }}>Thông tin khách/đơn vị đặt hàng</div>
            <Input label="Tên khách hàng / công ty" placeholder="VD: Tiệm Bánh Phương Thảo" value={custName} onChange={(e) => setCustName(e.target.value)} />
            <Input label="Số điện thoại" placeholder="09xx xxx xxx" value={custPhone} onChange={(e) => setCustPhone(e.target.value)} />
            <Select label="Hình thức nhận hàng" value={deliveryMethod} onChange={(e) => setDeliveryMethod(e.target.value)}
              options={[{ value: 'giao_tan_noi', label: '🚚 Giao hàng tận nơi' }, { value: 'lay_tai_xuong', label: '🏠 Lấy tại xưởng' }]} />
            {deliveryMethod === 'giao_tan_noi' && (
              <Input label="Địa chỉ giao" placeholder="Số nhà, đường, xã/phường, tỉnh/thành..." value={address} onChange={(e) => setAddress(e.target.value)} />
            )}
            <div style={{ display: 'flex', gap: 12 }}>
              <Input label="Ngày giao" type="date" value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} style={{ flex: 1 }} />
              <Input label="Giờ giao" type="time" value={deliveryTime} onChange={(e) => setDeliveryTime(e.target.value)} style={{ flex: 1 }} />
            </div>

            <div style={{ font: 'var(--text-label)', paddingTop: 6, borderTop: '1px solid var(--border-subtle)' }}>Danh sách hàng hóa — chọn từ menu Macaron để tự động ra giá, hoặc nhập tay</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {items.map((it, i) => (
                <MacaronItemRow key={i} item={it} canRemove={items.length > 1} products={products}
                  onChange={(next) => updateItem(i, next)} onRemove={() => removeItem(i)} />
              ))}
            </div>
            <Button variant="secondary" size="sm" onClick={() => setItems([...items, { ...BLANK_MACARON_ITEM }])}>+ Thêm hàng hóa</Button>

            <div style={{ font: 'var(--text-label)', paddingTop: 6, borderTop: '1px solid var(--border-subtle)' }}>Thanh toán</div>
            {deliveryMethod === 'giao_tan_noi' && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <Select label="Phí ship" value={hasShipFee} onChange={(e) => { setHasShipFee(e.target.value); if (e.target.value === 'no') setShipFee(''); }}
                  options={[{ value: 'no', label: 'Miễn phí' }, { value: 'yes', label: 'Có phí' }]} style={{ flex: '1 1 120px' }} />
                {hasShipFee === 'yes' && (
                  <PriceInput label="Số tiền ship" placeholder="VD: 115000" value={shipFee} onChange={setShipFee} noDelete style={{ flex: '1 1 140px' }} />
                )}
              </div>
            )}
            <PriceInput label="Tổng tiền" placeholder="VD: 2167000" value={total}
              onChange={(v) => { setTotal(v); setTotalTouched(true); }}
              helpText="Tự tính từ Tiền hàng + Phí ship — có thể chỉnh tay (VD: giảm giá sỉ)." />

            <div style={{ font: 'var(--text-label)', paddingTop: 6, borderTop: '1px solid var(--border-subtle)' }}>Ghi chú</div>
            <Input label="Ghi chú" placeholder="Yêu cầu riêng, thời gian đặt hàng, thanh toán..." value={note} onChange={(e) => setNote(e.target.value)} />
          </div>

          <div style={{ flex: isMobile ? '0 1 auto' : '1 1 320px', minWidth: 0 }}>
            <div style={{ position: isMobile ? 'static' : 'sticky', top: 0 }}>
              <OrderPreview custName={custName} custPhone={custPhone} items={previewItems} deliveryMethod={deliveryMethod}
                effectiveShipFee={effectiveShipFee} total={total} note={note} address={address} deliveryDate={deliveryDate} deliveryTime={deliveryTime} />
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '0 20px 20px' }}>
          <ActionChip icon={<IconWarning size={16} />} label="Báo sự cố" tone="danger" onClick={() => setShowIncident(true)} />
          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="secondary" size="sm" onClick={onClose} disabled={saving}>Hủy</Button>
            <Button variant="primary" size="sm" onClick={handleSubmit} disabled={saving}>{saving ? 'Đang lưu...' : 'Tạo đơn Macaron Sỉ'}</Button>
          </div>
        </div>
        {showIncident && (
          <IncidentReportModal orderCode={custName ? `Đơn mới — ${custName}` : null} onClose={() => setShowIncident(false)} onSent={() => setShowIncident(false)} />
        )}
      </div>
    </div>
  );
}

function EditMacaronModal({ order, onClose, onSaved }) {
  const [isMobile, setIsMobile] = useState(window.innerWidth < 860);
  const [showIncident, setShowIncident] = useState(false);
  const [custName, setCustName] = useState(order.customer?.name || '');
  const [custPhone, setCustPhone] = useState(order.customer?.phone || '');
  const [address, setAddress] = useState(order.address || '');
  const [deliveryMethod, setDeliveryMethod] = useState(order.delivery_method || 'giao_tan_noi');
  const [deliveryDate, setDeliveryDate] = useState(order.delivery_date || '');
  const [deliveryTime, setDeliveryTime] = useState(order.delivery_time || '');
  const [items, setItems] = useState(() => {
    const rows = (order.order_items || []).map((it) => ({ mode: 'manual', productId: '', name: it.name || '', spec: '', qty: it.qty || 1, unit: 'khay', price: it.price || '', refPhotoUrl: it.ref_photo_url || '' }));
    return rows.length ? rows : [{ ...BLANK_MACARON_ITEM }];
  });
  const [note, setNote] = useState(order.note || '');
  const [products, setProducts] = useState([]);
  const [hasShipFee, setHasShipFee] = useState(order.ship_fee > 0 ? 'yes' : 'no');
  const [shipFee, setShipFee] = useState(order.ship_fee > 0 ? String(order.ship_fee) : '');
  const [total, setTotal] = useState(String(order.total || ''));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const updateItem = (i, next) => setItems(items.map((it, idx) => (idx === i ? next : it)));
  const removeItem = (i) => setItems(items.filter((_, idx) => idx !== i));
  const effectiveShipFee = hasShipFee === 'yes' ? (Number(shipFee) || 0) : 0;
  const previewItems = items.filter((it) => it.name).map((it) => ({ name: it.spec ? `${it.name} — ${it.spec}` : it.name }));

  useEffect(() => {
    fetchProducts({ activeOnly: true }).then((data) => setProducts(data.filter((p) => p.category === 'macaron'))).catch(() => {});
  }, []);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 860);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const handleSubmit = async () => {
    if (!custName) { setError('Nhập tên khách hàng.'); return; }
    setSaving(true);
    setError('');
    try {
      await updateOrderFull(order.id, {
        customerName: custName, customerPhone: custPhone,
        address, deliveryDate, deliveryTime, deliveryMethod, shipFee: effectiveShipFee,
        total: Number(total) || 0, paymentMethod: 'cod', note,
        items: items.map((it) => ({ ...it, name: it.spec ? `${it.name} — ${it.spec}` : it.name })),
      });
      onSaved();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'var(--surface-overlay)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 55, padding: 16 }} onClick={onClose}>
      <div style={{ background: 'var(--surface-card)', borderRadius: 'var(--radius-lg)', width: isMobile ? 560 : 920, maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto', boxShadow: 'var(--shadow-lg)' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ font: 'var(--text-title)', color: 'var(--text-primary)' }}>Sửa đơn Macaron Sỉ {order.order_code || ''}</div>
            <div style={{ font: 'var(--text-caption)', color: 'var(--text-muted)' }}>Chỉnh sửa xong bấm Lưu thay đổi</div>
          </div>
          <button onClick={onClose} style={{ border: 'none', background: 'none', fontSize: 18, cursor: 'pointer', color: 'var(--text-muted)' }}>✕</button>
        </div>
        <div style={{ padding: 20, display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: 20 }}>
          <div style={{ flex: isMobile ? '1 1 auto' : '1 1 480px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>
            {error && <div style={{ font: 'var(--text-body-sm)', color: 'var(--status-danger)', background: 'var(--status-danger-soft)', borderRadius: 'var(--radius-sm)', padding: '8px 10px' }}>{error}</div>}

            <div style={{ font: 'var(--text-label)' }}>Thông tin khách/đơn vị đặt hàng</div>
            <Input label="Tên khách hàng / công ty" value={custName} onChange={(e) => setCustName(e.target.value)} />
            <Input label="Số điện thoại" value={custPhone} onChange={(e) => setCustPhone(e.target.value)} />
            <Select label="Hình thức nhận hàng" value={deliveryMethod} onChange={(e) => setDeliveryMethod(e.target.value)}
              options={[{ value: 'giao_tan_noi', label: '🚚 Giao hàng tận nơi' }, { value: 'lay_tai_xuong', label: '🏠 Lấy tại xưởng' }]} />
            {deliveryMethod === 'giao_tan_noi' && (
              <Input label="Địa chỉ giao" value={address} onChange={(e) => setAddress(e.target.value)} />
            )}
            <div style={{ display: 'flex', gap: 12 }}>
              <Input label="Ngày giao" type="date" value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} style={{ flex: 1 }} />
              <Input label="Giờ giao" type="time" value={deliveryTime} onChange={(e) => setDeliveryTime(e.target.value)} style={{ flex: 1 }} />
            </div>

            <div style={{ font: 'var(--text-label)', paddingTop: 6, borderTop: '1px solid var(--border-subtle)' }}>Danh sách hàng hóa</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {items.map((it, i) => (
                <MacaronItemRow key={i} item={it} canRemove={items.length > 1} products={products}
                  onChange={(next) => updateItem(i, next)} onRemove={() => removeItem(i)} />
              ))}
            </div>
            <Button variant="secondary" size="sm" onClick={() => setItems([...items, { ...BLANK_MACARON_ITEM }])}>+ Thêm hàng hóa</Button>

            <div style={{ font: 'var(--text-label)', paddingTop: 6, borderTop: '1px solid var(--border-subtle)' }}>Thanh toán</div>
            {deliveryMethod === 'giao_tan_noi' && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <Select label="Phí ship" value={hasShipFee} onChange={(e) => { setHasShipFee(e.target.value); if (e.target.value === 'no') setShipFee(''); }}
                  options={[{ value: 'no', label: 'Miễn phí' }, { value: 'yes', label: 'Có phí' }]} style={{ flex: '1 1 120px' }} />
                {hasShipFee === 'yes' && (
                  <PriceInput label="Số tiền ship" value={shipFee} onChange={setShipFee} noDelete style={{ flex: '1 1 140px' }} />
                )}
              </div>
            )}
            <PriceInput label="Tổng tiền" value={total} onChange={setTotal} />

            <div style={{ font: 'var(--text-label)', paddingTop: 6, borderTop: '1px solid var(--border-subtle)' }}>Ghi chú</div>
            <Input label="Ghi chú" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>

          <div style={{ flex: isMobile ? '0 1 auto' : '1 1 320px', minWidth: 0 }}>
            <div style={{ position: isMobile ? 'static' : 'sticky', top: 0 }}>
              <OrderPreview custName={custName} custPhone={custPhone} items={previewItems} deliveryMethod={deliveryMethod}
                effectiveShipFee={effectiveShipFee} total={total} note={note} address={address} deliveryDate={deliveryDate} deliveryTime={deliveryTime} />
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '0 20px 20px' }}>
          <ActionChip icon={<IconWarning size={16} />} label="Báo sự cố" tone="danger" onClick={() => setShowIncident(true)} />
          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="secondary" size="sm" onClick={onClose} disabled={saving}>Hủy</Button>
            <Button variant="primary" size="sm" onClick={handleSubmit} disabled={saving}>{saving ? 'Đang lưu...' : 'Lưu thay đổi'}</Button>
          </div>
        </div>
        {showIncident && (
          <IncidentReportModal orderId={order.id} orderCode={order.order_code} onClose={() => setShowIncident(false)} onSent={() => setShowIncident(false)} />
        )}
      </div>
    </div>
  );
}

function ProductRow({ item, onChange, onRemove, isKem, canRemove, products }) {
  const set = (k, v) => onChange({ ...item, [k]: v });

  const handleSelectProduct = (productId) => {
    if (productId === MANUAL_OPTION) { onChange({ ...item, mode: 'manual', productId: '', name: '', price: '' }); return; }
    const p = products.find((x) => x.id === productId);
    onChange({ ...item, mode: 'catalog', productId, name: p.name, price: isKem ? item.price : p.price });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 10, borderRadius: 'var(--radius-md)', background: 'var(--surface-sunken)' }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {item.mode === 'catalog' ? (
          <Select label="Tên sản phẩm" value={item.productId} onChange={(e) => handleSelectProduct(e.target.value)}
            options={productOptions(products)} style={{ flex: '3 1 200px', minWidth: 0 }} />
        ) : (
          <Input label="Tên sản phẩm (nhập tay)" placeholder={isKem ? 'VD: Bánh Kem Dâu' : 'VD: Bánh Bông Lan Mặn'} value={item.name} onChange={(e) => set('name', e.target.value)} style={{ flex: '3 1 200px', minWidth: 0 }} />
        )}
        <Input label="Số lượng" type="number" value={item.qty} onChange={(e) => set('qty', e.target.value)} style={{ flex: '1 1 80px', minWidth: 0 }} />
      </div>
      {isKem && (() => {
        const sizeCm = item.size ? parseInt(item.size, 10) : null;
        const fillingOptions = [{ value: '', label: 'Chọn nhân...' }, ...CAKE_FILLINGS.map((f) => {
          if (!f.surcharge) return { value: f.value, label: f.label };
          const sur = sizeCm ? fillingSurchargeForSize(f.value, sizeCm) : null;
          return { value: f.value, label: sur != null ? `${f.label} (+${sur.toLocaleString('vi-VN')}đ)` : f.label };
        })];
        return (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', minWidth: 0 }}>
            <Select label="Kích thước" value={sizeCm ? String(sizeCm) : ''} onChange={(e) => {
              const newSize = e.target.value;
              const price = newSize && item.fillingValue ? computeCakePrice(newSize, item.fillingValue, item.cot) : item.price;
              onChange({ ...item, size: newSize ? `${newSize}cm` : '', price });
            }} options={[{ value: '', label: 'Chọn size...' }, ...CAKE_SIZES_CM.map((s) => ({ value: String(s), label: `${s}cm (${basePriceForSize(s).toLocaleString('vi-VN')}đ)` }))]} style={{ flex: '1 1 170px', minWidth: 0 }} />
            <Select label="Cốt bánh" value={item.cot || ''} onChange={(e) => {
              const cot = e.target.value;
              const price = sizeCm && item.fillingValue ? computeCakePrice(sizeCm, item.fillingValue, cot) : (sizeCm && !item.fillingValue ? basePriceForSize(sizeCm) + baseSurcharge(cot) : item.price);
              onChange({ ...item, cot, price });
            }} options={[{ value: '', label: 'Chọn cốt...' }, ...CAKE_BASES.map((b) => ({ value: b, label: baseSurcharge(b) ? `${b} (+${baseSurcharge(b).toLocaleString('vi-VN')}đ)` : b }))]} style={{ flex: '1 1 150px', minWidth: 0 }} />
            <Select label="Nhân" value={item.fillingValue || ''} onChange={(e) => {
              const fillingValue = e.target.value;
              const filling = CAKE_FILLINGS.find((f) => f.value === fillingValue);
              const price = sizeCm && fillingValue ? computeCakePrice(sizeCm, fillingValue, item.cot) : item.price;
              onChange({ ...item, fillingValue, vi: filling?.label || '', price });
            }} options={fillingOptions} style={{ flex: '1 1 220px', minWidth: 0 }} />
          </div>
        );
      })()}
      {!isKem && (
        <Input label="Ghi chú / mô tả" placeholder="VD: loại có hộp nhỏ" value={item.note} onChange={(e) => set('note', e.target.value)} />
      )}
      <PhotoField url={item.refPhotoUrl} onChange={(url) => set('refPhotoUrl', url)} label="Ảnh mẫu khách muốn đặt (nếu có)" prefix="reference" />
      <PriceInput label="Đơn giá" placeholder="VD: 350000" value={item.price} onChange={(v) => set('price', v)} style={{ maxWidth: 160 }} />
      {canRemove && <Button variant="ghost" size="sm" onClick={onRemove} style={{ alignSelf: 'flex-end' }} icon={<IconTrash size={14} />}>Xoá sản phẩm</Button>}
    </div>
  );
}

function OrderPreview({ custName, custPhone, items, deliveryMethod, effectiveShipFee, total, deposit, note, address, deliveryDate, deliveryTime }) {
  const itemLine = (p) => formatOrderItemLine(p, { withQty: false });
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, background: 'var(--surface-sunken)', borderRadius: 'var(--radius-md)', padding: 16 }}>
      <div style={{ font: 'var(--text-caption)', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}><IconEye size={14} /> XEM TRƯỚC ĐƠN HÀNG</div>
      <div style={{ font: 'var(--text-label)', color: 'var(--text-primary)' }}>{custName || 'Khách chưa đặt tên'}</div>
      {custPhone && <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 4 }}><IconPhone size={14} /> {custPhone}</div>}
      <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-secondary)' }}>
        {items.length ? items.map(itemLine).join(', ') : 'Chưa có sản phẩm nào'}
      </div>
      <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-secondary)' }}>
        {deliveryMethod === 'giao_tan_noi' ? <><IconTruck size={14} style={{ verticalAlign: '-2px', marginRight: 4 }} />Giao hàng tận nơi</> : <><IconHome size={14} style={{ verticalAlign: '-2px', marginRight: 4 }} />Lấy tại xưởng</>}
        {deliveryMethod === 'giao_tan_noi' && ` · Ship: ${effectiveShipFee ? formatVnd(effectiveShipFee) : 'Miễn phí'}`}
      </div>
      {deliveryMethod === 'giao_tan_noi' && address && (
        <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 4 }}><IconMapPin size={14} /> {address}</div>
      )}
      {(deliveryDate || deliveryTime) && (
        <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-secondary)' }}>
          <IconClock size={14} style={{ verticalAlign: '-2px', marginRight: 4 }} />{formatDeliveryDateTime(deliveryDate, deliveryTime)}
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, paddingTop: 6, borderTop: '1px solid var(--border-subtle)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', font: 'var(--text-label)', color: 'var(--text-primary)' }}>
          <span>Tổng tiền</span><span>{formatVnd(total) || '0 đồng'}</span>
        </div>
        {deposit !== undefined && (
          <div style={{ display: 'flex', justifyContent: 'space-between', font: 'var(--text-body-sm)', color: 'var(--text-secondary)' }}>
            <span>Đặt cọc</span><span>{formatVnd(deposit) || '0 đồng'}</span>
          </div>
        )}
      </div>
      {note && <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 4 }}><IconClipboard size={14} /> {note}</div>}
    </div>
  );
}

function NewOrderModal({ onClose, onCreated, onManualItems }) {
  const [isMobile, setIsMobile] = useState(window.innerWidth < 860);
  const [showIncident, setShowIncident] = useState(false);
  const [cakeType, setCakeType] = useState('kem');
  const [kemProducts, setKemProducts] = useState([{ ...BLANK_KEM }]);
  const [manProducts, setManProducts] = useState([{ ...BLANK_MAN }]);
  const [catalog, setCatalog] = useState([]);
  const [custName, setCustName] = useState('');
  const [custPhone, setCustPhone] = useState('');
  const [address, setAddress] = useState('');
  const [deliveryMethod, setDeliveryMethod] = useState('giao_tan_noi');
  const [deliveryDate, setDeliveryDate] = useState('');
  const [deliveryTime, setDeliveryTime] = useState('');
  const [note, setNote] = useState('');
  const [total, setTotal] = useState('');
  const [totalTouched, setTotalTouched] = useState(false);
  const [hasShipFee, setHasShipFee] = useState('no');
  const [shipFee, setShipFee] = useState('');
  const [deposit, setDeposit] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cod');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const isKem = cakeType === 'kem';
  const products = isKem ? kemProducts : manProducts;
  const setProducts = isKem ? setKemProducts : setManProducts;
  const updateAt = (i, next) => setProducts(products.map((p, idx) => (idx === i ? next : p)));
  const removeAt = (i) => setProducts(products.filter((_, idx) => idx !== i));
  const addRow = () => setProducts([...products, isKem ? { ...BLANK_KEM } : { ...BLANK_MAN }]);
  const catalogSuggestedTotal = [...kemProducts, ...manProducts].reduce((s, it) => s + (Number(it.qty) || 0) * (Number(it.price) || 0), 0);

  useEffect(() => {
    fetchProducts({ activeOnly: true }).then((data) => setCatalog(data)).catch(() => {});
  }, []);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 860);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const effectiveShipFee = hasShipFee === 'yes' ? (Number(shipFee) || 0) : 0;

  useEffect(() => {
    if (!totalTouched) setTotal(String(catalogSuggestedTotal + effectiveShipFee || ''));
  }, [catalogSuggestedTotal, hasShipFee, shipFee]);

  const kemCatalog = catalog.filter((p) => p.category === 'banh_kem');
  const manCatalog = catalog.filter((p) => p.category === 'banh_man_ngot');

  const handleSubmit = async () => {
    if (!custName) { setError('Nhập tên khách hàng.'); return; }
    setSaving(true);
    setError('');
    try {
      await createOrder({
        customer: { name: custName, phone: custPhone, channel: 'Sếp Lẻ' },
        channel: 'Sếp Lẻ',
        address, deliveryDate, deliveryTime, note,
        deliveryMethod, shipFee: effectiveShipFee,
        total: Number(total) || 0, deposit: Number(deposit) || 0, paymentMethod,
        items: [
          ...kemProducts.map((it) => ({ ...it, category: 'banh_kem' })),
          ...manProducts.map((it) => ({ ...it, category: 'banh_man_ngot' })),
        ].map((it) => ({
          ...it,
          name: it.note ? `${it.name} (${it.note})` : it.name,
        })),
      });
      onManualItems?.([
        ...extractManualItems(kemProducts, 'banh_kem'),
        ...extractManualItems(manProducts, 'banh_man_ngot'),
      ]);
      onCreated();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const previewItems = [...kemProducts, ...manProducts].filter((p) => p.name);

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'var(--surface-overlay)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 16 }} onClick={onClose}>
      <div style={{ background: 'var(--surface-card)', borderRadius: 'var(--radius-lg)', width: isMobile ? 480 : 920, maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto', boxShadow: 'var(--shadow-lg)' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ font: 'var(--text-title)', color: 'var(--text-primary)' }}>Đơn hàng mới</div>
            <div style={{ font: 'var(--text-caption)', color: 'var(--text-muted)' }}>Điền thông tin — xem trước cập nhật ngay bên {isMobile ? 'dưới' : 'phải'}</div>
          </div>
          <button onClick={onClose} style={{ border: 'none', background: 'none', fontSize: 18, cursor: 'pointer', color: 'var(--text-muted)' }}>✕</button>
        </div>
        <div style={{ padding: 20, display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: 20 }}>
          <div style={{ flex: isMobile ? '1 1 auto' : '1 1 480px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>
            {error && <div style={{ font: 'var(--text-body-sm)', color: 'var(--status-danger)', background: 'var(--status-danger-soft)', borderRadius: 'var(--radius-sm)', padding: '8px 10px' }}>{error}</div>}

            <div style={{ font: 'var(--text-label)' }}>Thông tin sản phẩm</div>
            <Tabs tabs={[{ key: 'kem', label: 'Bánh Kem' }, { key: 'man', label: 'Bánh Mặn Ngọt' }]} active={isKem ? 'kem' : 'man'} onChange={(k) => setCakeType(k === 'kem' ? 'kem' : 'man')} />
            <div style={{ font: 'var(--text-caption)', color: 'var(--text-muted)' }}>Chọn sản phẩm từ menu để tự động ra giá, hoặc "Khác (nhập tay)" cho hàng custom.</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {products.map((item, i) => (
                <ProductRow key={i} item={item} isKem={isKem} canRemove={products.length > 1} products={isKem ? kemCatalog : manCatalog}
                  onChange={(next) => updateAt(i, next)} onRemove={() => removeAt(i)} />
              ))}
            </div>
            <Button variant="secondary" size="sm" onClick={addRow}>+ Thêm sản phẩm {isKem ? 'bánh kem' : 'bánh mặn ngọt'}</Button>

            <div style={{ font: 'var(--text-label)', paddingTop: 6, borderTop: '1px solid var(--border-subtle)' }}>Thông tin khách hàng</div>
            <Input label="Tên khách" placeholder="Nguyễn Văn A" value={custName} onChange={(e) => setCustName(e.target.value)} />
            <Select label="Hình thức nhận hàng" value={deliveryMethod} onChange={(e) => setDeliveryMethod(e.target.value)}
              options={[{ value: 'giao_tan_noi', label: '🚚 Giao hàng tận nơi' }, { value: 'lay_tai_xuong', label: '🏠 Lấy tại xưởng' }]} />
            {deliveryMethod === 'giao_tan_noi' && (
              <Input label="Địa chỉ giao" placeholder="Số nhà, đường, quận..." value={address} onChange={(e) => setAddress(e.target.value)} />
            )}
            <div style={{ display: 'flex', gap: 12 }}>
              <Input label="Ngày giao" type="date" value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} style={{ flex: 1 }} />
              <Input label="Giờ giao" type="time" value={deliveryTime} onChange={(e) => setDeliveryTime(e.target.value)} style={{ flex: 1 }} />
            </div>
            <Input label="Số điện thoại" placeholder="09xx xxx xxx" value={custPhone} onChange={(e) => setCustPhone(e.target.value)} />

            <div style={{ font: 'var(--text-label)', paddingTop: 6, borderTop: '1px solid var(--border-subtle)' }}>Thanh toán</div>
            {deliveryMethod === 'giao_tan_noi' && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <Select label="Phí ship" value={hasShipFee} onChange={(e) => { setHasShipFee(e.target.value); if (e.target.value === 'no') setShipFee(''); }}
                  options={[{ value: 'no', label: 'Miễn phí' }, { value: 'yes', label: 'Có phí' }]} style={{ flex: '1 1 120px' }} />
                {hasShipFee === 'yes' && (
                  <PriceInput label="Số tiền ship" placeholder="VD: 20000" value={shipFee} onChange={setShipFee} noDelete style={{ flex: '1 1 140px' }} />
                )}
              </div>
            )}
            <PriceInput label="Tổng tiền" placeholder="VD: 580000" value={total}
              onChange={(v) => { setTotal(v); setTotalTouched(true); }}
              helpText="Tự tính từ Tiền hàng + Phí ship — có thể chỉnh tay (VD: giảm giá VIP)." />
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Select label="Phương thức thanh toán" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} options={[{ value: 'cod', label: 'COD' }, { value: 'bank', label: 'Chuyển khoản Ngân hàng' }]} style={{ flex: '1 1 160px' }} />
              <PriceInput label="Đặt cọc" placeholder="VD: 100000" value={deposit} onChange={setDeposit} style={{ flex: '1 1 140px' }} />
            </div>

            <div style={{ font: 'var(--text-label)', paddingTop: 6, borderTop: '1px solid var(--border-subtle)' }}>Ghi chú</div>
            <Input label="Ghi chú đơn hàng" placeholder="Yêu cầu riêng của khách, lưu ý giao hàng..." value={note} onChange={(e) => setNote(e.target.value)} />
          </div>

          <div style={{ flex: isMobile ? '0 1 auto' : '1 1 320px', minWidth: 0 }}>
            <div style={{ position: isMobile ? 'static' : 'sticky', top: 0 }}>
              <OrderPreview custName={custName} custPhone={custPhone} items={previewItems} deliveryMethod={deliveryMethod}
                effectiveShipFee={effectiveShipFee} total={total} deposit={deposit} note={note} address={address} deliveryDate={deliveryDate} deliveryTime={deliveryTime} />
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '0 20px 20px' }}>
          <ActionChip icon={<IconWarning size={16} />} label="Báo sự cố" tone="danger" onClick={() => setShowIncident(true)} />
          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="secondary" size="sm" onClick={onClose} disabled={saving}>Hủy</Button>
            <Button variant="primary" size="sm" onClick={handleSubmit} disabled={saving}>{saving ? 'Đang lưu...' : 'Chuyển Bếp & In Tem'}</Button>
          </div>
        </div>
        {showIncident && (
          <IncidentReportModal orderCode={custName ? `Đơn mới — ${custName}` : null} onClose={() => setShowIncident(false)} onSent={() => setShowIncident(false)} />
        )}
      </div>
    </div>
  );
}

function itemToRowState(it) {
  const matchedFilling = CAKE_FILLINGS.find((f) => f.label === it.vi);
  return {
    mode: 'manual', productId: '', name: it.name || '', qty: it.qty || 1,
    size: it.size || '', cot: it.cot || '', vi: it.vi || '', fillingValue: matchedFilling?.value || '', price: it.price || '',
    refPhotoUrl: it.ref_photo_url || '', note: '',
  };
}

function EditOrderModal({ order, onClose, onSaved }) {
  const [isMobile, setIsMobile] = useState(window.innerWidth < 860);
  const [showIncident, setShowIncident] = useState(false);
  const [cakeType, setCakeType] = useState('kem');
  const initialKem = (order.order_items || []).filter((it) => it.category === 'banh_kem').map(itemToRowState);
  const initialMan = (order.order_items || []).filter((it) => it.category !== 'banh_kem').map(itemToRowState);
  const [kemProducts, setKemProducts] = useState(initialKem.length ? initialKem : [{ ...BLANK_KEM }]);
  const [manProducts, setManProducts] = useState(initialMan.length ? initialMan : [{ ...BLANK_MAN }]);
  const [catalog, setCatalog] = useState([]);
  const [custName, setCustName] = useState(order.customer?.name || '');
  const [custPhone, setCustPhone] = useState(order.customer?.phone || '');
  const [address, setAddress] = useState(order.address || '');
  const [deliveryMethod, setDeliveryMethod] = useState(order.delivery_method || 'giao_tan_noi');
  const [deliveryDate, setDeliveryDate] = useState(order.delivery_date || '');
  const [deliveryTime, setDeliveryTime] = useState(order.delivery_time || '');
  const [note, setNote] = useState(order.note || '');
  const [total, setTotal] = useState(String(order.total || ''));
  const [hasShipFee, setHasShipFee] = useState(order.ship_fee > 0 ? 'yes' : 'no');
  const [shipFee, setShipFee] = useState(order.ship_fee > 0 ? String(order.ship_fee) : '');
  const [deposit, setDeposit] = useState(String(order.deposit || ''));
  const [paymentMethod, setPaymentMethod] = useState(order.payment_method || 'cod');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const isKem = cakeType === 'kem';
  const products = isKem ? kemProducts : manProducts;
  const setProducts = isKem ? setKemProducts : setManProducts;
  const updateAt = (i, next) => setProducts(products.map((p, idx) => (idx === i ? next : p)));
  const removeAt = (i) => setProducts(products.filter((_, idx) => idx !== i));
  const addRow = () => setProducts([...products, isKem ? { ...BLANK_KEM } : { ...BLANK_MAN }]);
  const effectiveShipFee = hasShipFee === 'yes' ? (Number(shipFee) || 0) : 0;

  useEffect(() => {
    fetchProducts({ activeOnly: true }).then((data) => setCatalog(data)).catch(() => {});
  }, []);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 860);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const kemCatalog = catalog.filter((p) => p.category === 'banh_kem');
  const manCatalog = catalog.filter((p) => p.category === 'banh_man_ngot');
  const previewItems = [...kemProducts, ...manProducts].filter((p) => p.name);

  const handleSubmit = async () => {
    if (!custName) { setError('Nhập tên khách hàng.'); return; }
    setSaving(true);
    setError('');
    try {
      await updateOrderFull(order.id, {
        customerName: custName, customerPhone: custPhone,
        address, deliveryDate, deliveryTime, deliveryMethod, shipFee: effectiveShipFee,
        total: Number(total) || 0, deposit: Number(deposit) || 0, paymentMethod, note,
        items: [
          ...kemProducts.map((it) => ({ ...it, category: 'banh_kem' })),
          ...manProducts.map((it) => ({ ...it, category: 'banh_man_ngot' })),
        ].map((it) => ({ ...it, name: it.note ? `${it.name} (${it.note})` : it.name })),
      });
      onSaved();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'var(--surface-overlay)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 55, padding: 16 }} onClick={onClose}>
      <div style={{ background: 'var(--surface-card)', borderRadius: 'var(--radius-lg)', width: isMobile ? 480 : 920, maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto', boxShadow: 'var(--shadow-lg)' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ font: 'var(--text-title)', color: 'var(--text-primary)' }}>Sửa đơn {order.order_code || ''}</div>
            <div style={{ font: 'var(--text-caption)', color: 'var(--text-muted)' }}>Chỉnh sửa xong bấm Lưu thay đổi</div>
          </div>
          <button onClick={onClose} style={{ border: 'none', background: 'none', fontSize: 18, cursor: 'pointer', color: 'var(--text-muted)' }}>✕</button>
        </div>
        <div style={{ padding: 20, display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: 20 }}>
          <div style={{ flex: isMobile ? '1 1 auto' : '1 1 480px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>
            {error && <div style={{ font: 'var(--text-body-sm)', color: 'var(--status-danger)', background: 'var(--status-danger-soft)', borderRadius: 'var(--radius-sm)', padding: '8px 10px' }}>{error}</div>}

            <div style={{ font: 'var(--text-label)' }}>Thông tin sản phẩm</div>
            <Tabs tabs={[{ key: 'kem', label: 'Bánh Kem' }, { key: 'man', label: 'Bánh Mặn Ngọt' }]} active={isKem ? 'kem' : 'man'} onChange={(k) => setCakeType(k === 'kem' ? 'kem' : 'man')} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {products.map((item, i) => (
                <ProductRow key={i} item={item} isKem={isKem} canRemove={products.length > 1} products={isKem ? kemCatalog : manCatalog}
                  onChange={(next) => updateAt(i, next)} onRemove={() => removeAt(i)} />
              ))}
            </div>
            <Button variant="secondary" size="sm" onClick={addRow}>+ Thêm sản phẩm {isKem ? 'bánh kem' : 'bánh mặn ngọt'}</Button>

            <div style={{ font: 'var(--text-label)', paddingTop: 6, borderTop: '1px solid var(--border-subtle)' }}>Thông tin khách hàng</div>
            <Input label="Tên khách" value={custName} onChange={(e) => setCustName(e.target.value)} />
            <Select label="Hình thức nhận hàng" value={deliveryMethod} onChange={(e) => setDeliveryMethod(e.target.value)}
              options={[{ value: 'giao_tan_noi', label: '🚚 Giao hàng tận nơi' }, { value: 'lay_tai_xuong', label: '🏠 Lấy tại xưởng' }]} />
            {deliveryMethod === 'giao_tan_noi' && (
              <Input label="Địa chỉ giao" value={address} onChange={(e) => setAddress(e.target.value)} />
            )}
            <div style={{ display: 'flex', gap: 12 }}>
              <Input label="Ngày giao" type="date" value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} style={{ flex: 1 }} />
              <Input label="Giờ giao" type="time" value={deliveryTime} onChange={(e) => setDeliveryTime(e.target.value)} style={{ flex: 1 }} />
            </div>
            <Input label="Số điện thoại" value={custPhone} onChange={(e) => setCustPhone(e.target.value)} />

            <div style={{ font: 'var(--text-label)', paddingTop: 6, borderTop: '1px solid var(--border-subtle)' }}>Thanh toán</div>
            {deliveryMethod === 'giao_tan_noi' && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <Select label="Phí ship" value={hasShipFee} onChange={(e) => { setHasShipFee(e.target.value); if (e.target.value === 'no') setShipFee(''); }}
                  options={[{ value: 'no', label: 'Miễn phí' }, { value: 'yes', label: 'Có phí' }]} style={{ flex: '1 1 120px' }} />
                {hasShipFee === 'yes' && (
                  <PriceInput label="Số tiền ship" value={shipFee} onChange={setShipFee} noDelete style={{ flex: '1 1 140px' }} />
                )}
              </div>
            )}
            <PriceInput label="Tổng tiền" value={total} onChange={setTotal} />
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Select label="Phương thức thanh toán" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} options={[{ value: 'cod', label: 'COD' }, { value: 'bank', label: 'Chuyển khoản Ngân hàng' }]} style={{ flex: '1 1 160px' }} />
              <PriceInput label="Đặt cọc" value={deposit} onChange={setDeposit} style={{ flex: '1 1 140px' }} />
            </div>

            <div style={{ font: 'var(--text-label)', paddingTop: 6, borderTop: '1px solid var(--border-subtle)' }}>Ghi chú</div>
            <Input label="Ghi chú đơn hàng" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>

          <div style={{ flex: isMobile ? '0 1 auto' : '1 1 320px', minWidth: 0 }}>
            <div style={{ position: isMobile ? 'static' : 'sticky', top: 0 }}>
              <OrderPreview custName={custName} custPhone={custPhone} items={previewItems} deliveryMethod={deliveryMethod}
                effectiveShipFee={effectiveShipFee} total={total} deposit={deposit} note={note} address={address} deliveryDate={deliveryDate} deliveryTime={deliveryTime} />
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '0 20px 20px' }}>
          <ActionChip icon={<IconWarning size={16} />} label="Báo sự cố" tone="danger" onClick={() => setShowIncident(true)} />
          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="secondary" size="sm" onClick={onClose} disabled={saving}>Hủy</Button>
            <Button variant="primary" size="sm" onClick={handleSubmit} disabled={saving}>{saving ? 'Đang lưu...' : 'Lưu thay đổi'}</Button>
          </div>
        </div>
        {showIncident && (
          <IncidentReportModal orderId={order.id} orderCode={order.order_code} onClose={() => setShowIncident(false)} onSent={() => setShowIncident(false)} />
        )}
      </div>
    </div>
  );
}

function vipOnly(orders, filter) {
  return filter === 'vip' ? orders.filter((o) => o.customer?.vip) : orders;
}

export default function OrdersScreen() {
  const { profile } = useAuth();
  const canManage = profile?.role === 'owner' || profile?.role === 'admin';
  const canRequestChange = profile?.role === 'cashier' || profile?.role === 'sale';
  const [orders, setOrders] = useState([]);
  const [cancelledOrders, setCancelledOrders] = useState([]);
  const [completedOrders, setCompletedOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [filter, setFilter] = useState('all');
  const [modalOrder, setModalOrder] = useState(null);
  const [showNew, setShowNew] = useState(false);
  const [showTeabreak, setShowTeabreak] = useState(false);
  const [showMacaron, setShowMacaron] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const [reasonAction, setReasonAction] = useState(null);
  const [requestAction, setRequestAction] = useState(null);
  const [requestSent, setRequestSent] = useState(false);
  const [pendingCatalogItems, setPendingCatalogItems] = useState(null);
  const [savingCatalog, setSavingCatalog] = useState(false);
  const [catalogError, setCatalogError] = useState('');
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [searchResults, setSearchResults] = useState(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [showOrderIncident, setShowOrderIncident] = useState(false);
  const [showEditOrder, setShowEditOrder] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 860);
  const [mobileStatusTab, setMobileStatusTab] = useState('moi');

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 860);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    const q = search.trim().toLowerCase();
    const hasDateFilter = dateFrom || dateTo;
    if (q.length < 2 && !hasDateFilter) { setSearchResults(null); return; }
    setSearchLoading(true);
    const timer = setTimeout(() => {
      fetchOrders(hasDateFilter ? { from: dateFrom || undefined, to: dateTo || undefined } : {})
        .then((data) => {
          const matches = q.length < 2 ? data : data.filter((o) =>
            (o.customer?.name || '').toLowerCase().includes(q) ||
            (o.customer?.phone || '').includes(q) ||
            (o.order_code || '').toLowerCase().includes(q)
          );
          setSearchResults(matches);
        })
        .catch((err) => setActionError(err.message))
        .finally(() => setSearchLoading(false));
    }, 300);
    return () => clearTimeout(timer);
  }, [search, dateFrom, dateTo]);

  const load = () => {
    setLoading(true);
    fetchOrders({ statuses: ['moi', 'dang_lam', 'cho_giao', 'dang_giao'] })
      .then((data) => { setOrders(data); setLoadError(''); })
      .catch((err) => setLoadError(err.message))
      .finally(() => setLoading(false));
  };

  const loadCancelled = () => {
    fetchOrders({ statuses: ['huy'] }).then(setCancelledOrders).catch(() => {});
  };

  const loadCompleted = () => {
    const today = localDateStr();
    fetchOrders({ statuses: ['hoan_thanh'], from: today, to: today }).then(setCompletedOrders).catch(() => {});
  };

  useEffect(load, []);
  useEffect(loadCancelled, []);
  useEffect(loadCompleted, []);

  useEffect(() => {
    const channel = supabase
      .channel('orders-list-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => { load(); loadCancelled(); loadCompleted(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const handleRequestChange = async ({ reason, photoUrl }) => {
    setActionBusy(true);
    setActionError('');
    try {
      const kindLabel = requestAction === 'edit' ? 'SỬA ĐƠN' : requestAction === 'cancel' ? 'HỦY ĐƠN' : 'XOÁ ĐƠN';
      const message = `🔒 YÊU CẦU ${kindLabel} — chờ sếp duyệt${photoUrl ? `\n[PHOTOS: ![image](${photoUrl})]` : ''}\nLý do: ${reason}`;
      await addOrderNote({
        orderId: modalOrder.id, orderCode: modalOrder.order_code, authorId: profile?.id,
        authorName: profile?.full_name, authorRole: profile?.role, message,
      });
      setRequestAction(null);
      setRequestSent(true);
      setTimeout(() => setRequestSent(false), 4000);
    } catch (err) {
      setActionError(err.message);
    } finally {
      setActionBusy(false);
    }
  };

  const handleDirectDelete = async () => {
    if (!window.confirm(`Xoá hẳn đơn ${modalOrder.order_code}? Không thể hoàn tác.`)) return;
    setActionBusy(true);
    setActionError('');
    try {
      const itemsSummary = (modalOrder.order_items || []).map((it) => `${it.name} x${it.qty}`).join(', ');
      await deleteOrder(modalOrder.id, {
        reason: null, photoUrl: null, staffName: profile?.full_name,
        snapshot: { orderCode: modalOrder.order_code, customerName: modalOrder.customer?.name, itemsSummary, total: modalOrder.total },
      });
      setModalOrder(null);
      load();
      loadCancelled();
    } catch (err) {
      setActionError(err.message);
    } finally {
      setActionBusy(false);
    }
  };

  const handleConfirmReason = async ({ reason, photoUrl }) => {
    setActionBusy(true);
    setActionError('');
    try {
      if (reasonAction === 'cancel') {
        await cancelOrder(modalOrder.id, { reason, photoUrl, staffName: profile?.full_name });
      } else {
        const itemsSummary = (modalOrder.order_items || []).map((it) => `${it.name} x${it.qty}`).join(', ');
        await deleteOrder(modalOrder.id, {
          reason, photoUrl, staffName: profile?.full_name,
          snapshot: { orderCode: modalOrder.order_code, customerName: modalOrder.customer?.name, itemsSummary, total: modalOrder.total },
        });
      }
      setReasonAction(null);
      setModalOrder(null);
      load();
      loadCancelled();
    } catch (err) {
      setActionError(err.message);
    } finally {
      setActionBusy(false);
    }
  };

  const byDeliveryTime = (a, b) => {
    if (!a.delivery_time && !b.delivery_time) return 0;
    if (!a.delivery_time) return 1;
    if (!b.delivery_time) return -1;
    return a.delivery_time.localeCompare(b.delivery_time);
  };
  const moi = orders.filter((o) => o.status === 'moi').sort(byDeliveryTime);
  const dangLam = orders.filter((o) => o.status === 'dang_lam').sort(byDeliveryTime);
  const choGiao = orders.filter((o) => o.status === 'cho_giao').sort(byDeliveryTime);
  const dangGiao = orders.filter((o) => o.status === 'dang_giao').sort(byDeliveryTime);
  const openModal = (o) => { setActionError(''); setShowOrderIncident(false); setShowEditOrder(false); setModalOrder(o); };

  const handleManualItemsDetected = async (candidates) => {
    if (!canManage || !candidates.length) return;
    try {
      const existing = await fetchProducts();
      const existingNames = new Set(existing.map((p) => p.name.trim().toLowerCase()));
      const fresh = candidates.filter((c) => !existingNames.has(c.name.toLowerCase()));
      if (fresh.length) setPendingCatalogItems(fresh);
    } catch { /* không chặn luồng tạo đơn nếu bước này lỗi */ }
  };

  const handleSaveCatalogItems = async () => {
    setSavingCatalog(true);
    setCatalogError('');
    try {
      await Promise.all(pendingCatalogItems.map((c) => createProduct(c)));
      setPendingCatalogItems(null);
    } catch (err) {
      setCatalogError(err.message);
    } finally {
      setSavingCatalog(false);
    }
  };

  const handleExportOrders = () => {
    const list = searchResults !== null ? searchResults : orders;
    const headers = ['Mã đơn', 'Khách hàng', 'SĐT', 'Sản phẩm', 'Tổng tiền', 'Đã thu', 'Trạng thái', 'Ngày giao', 'Giờ giao', 'Kênh', 'Ghi chú'];
    const rows = list.map((o) => [
      o.order_code || '', o.customer?.name || '', o.customer?.phone || '',
      (o.order_items || []).map((it) => formatOrderItemLine(it, { withQty: true })).join(' | '),
      Number(o.total || 0), Number(o.paid_amount || 0), STATUS_LABELS[o.status] || o.status,
      o.delivery_date || '', o.delivery_time || '', o.channel || '', o.note || '',
    ]);
    downloadCsv(`don-hang_${localDateStr()}.csv`, headers, rows);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, height: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div style={{ font: 'var(--text-display-md)', color: 'var(--text-primary)' }}>Đơn Hàng Đến</div>
          <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-muted)' }}>Theo dõi đơn hàng theo từng bước xử lý</div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Button variant="primary" onClick={() => setShowNew(true)}>+ TẠO ĐƠN MỚI</Button>
          <Button variant="secondary" onClick={() => setShowTeabreak(true)}>+ Tạo đơn Teabreak</Button>
          <Button variant="secondary" onClick={() => setShowMacaron(true)}>+ Tạo đơn Macaron Sỉ</Button>
          <Button variant="secondary" icon={<IconDownload size={16} />} onClick={handleExportOrders}>Xuất danh sách</Button>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <Input placeholder="Tra cứu đơn cũ theo tên, SĐT hoặc mã đơn (kể cả đã giao/đã huỷ)..." value={search} onChange={(e) => setSearch(e.target.value)} style={{ flex: '2 1 260px' }} />
        <Input label="Từ ngày" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} style={{ flex: '1 1 140px' }} />
        <Input label="Đến ngày" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} style={{ flex: '1 1 140px' }} />
        {(dateFrom || dateTo) && (
          <Button variant="secondary" size="sm" onClick={() => { setDateFrom(''); setDateTo(''); }}>Bỏ lọc ngày</Button>
        )}
      </div>
      {!(dateFrom || dateTo) && <div style={{ font: 'var(--text-caption)', color: 'var(--text-muted)' }}>Không nhớ tên/SĐT? Chọn khoảng ngày để lướt lại đơn cũ.</div>}
      {searchResults === null && (
        <Tabs
          tabs={[
            { key: 'all', label: 'Tất cả' },
            { key: 'vip', label: 'VIP' },
            { key: 'huy', label: `Đã huỷ (${cancelledOrders.length})` },
          ]}
          active={filter}
          onChange={setFilter}
        />
      )}
      {loadError && <div style={{ font: 'var(--text-body-sm)', color: 'var(--status-danger)' }}>Lỗi tải đơn hàng: {loadError}</div>}
      {searchResults !== null ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {searchLoading && <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-muted)' }}>Đang tìm...</div>}
          {!searchLoading && searchResults.length === 0 && <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-muted)' }}>Không tìm thấy đơn nào khớp.</div>}
          {searchResults.map((o) => <SearchResultRow key={o.id} o={o} onOpen={openModal} />)}
        </div>
      ) : filter === 'huy' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {cancelledOrders.length === 0 ? (
            <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-muted)' }}>Chưa có đơn nào bị huỷ.</div>
          ) : (
            cancelledOrders.map((o) => <SearchResultRow key={o.id} o={o} onOpen={openModal} />)
          )}
        </div>
      ) : loading ? (
        <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-muted)' }}>Đang tải...</div>
      ) : isMobile ? (() => {
        const mobileColumns = [
          { key: 'moi', title: 'Mới', orders: vipOnly(moi, filter) },
          { key: 'dang_lam', title: 'Đang làm', orders: vipOnly(dangLam, filter) },
          { key: 'cho_giao', title: 'Chờ giao', orders: vipOnly(choGiao, filter) },
          { key: 'dang_giao', title: 'Đang giao', orders: vipOnly(dangGiao, filter) },
          { key: 'hoan_thanh', title: 'Hoàn thành hôm nay', orders: vipOnly(completedOrders, filter) },
        ];
        const active = mobileColumns.find((c) => c.key === mobileStatusTab) || mobileColumns[0];
        return (
          <React.Fragment>
            <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4 }}>
              {mobileColumns.map((c) => (
                <button key={c.key} onClick={() => setMobileStatusTab(c.key)} style={{
                  flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px',
                  borderRadius: 'var(--radius-pill)', border: c.key === active.key ? '2px solid var(--action-primary)' : '1px solid var(--border-subtle)',
                  background: c.key === active.key ? 'var(--surface-primary-soft)' : 'var(--surface-card)',
                  color: c.key === active.key ? 'var(--primary-700)' : 'var(--text-secondary)',
                  font: 'var(--text-body-sm)', fontWeight: c.key === active.key ? 600 : 400, cursor: 'pointer',
                }}>
                  {c.title}<Badge tone={c.key === active.key ? 'primary' : 'neutral'}>{c.orders.length}</Badge>
                </button>
              ))}
            </div>
            <Column title={active.title} count={active.orders.length} orders={active.orders} onOpen={openModal} />
          </React.Fragment>
        );
      })() : (
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', flex: 1 }}>
          <Column title="Mới" count={vipOnly(moi, filter).length} orders={vipOnly(moi, filter)} onOpen={openModal} />
          <Column title="Đang làm" count={vipOnly(dangLam, filter).length} orders={vipOnly(dangLam, filter)} onOpen={openModal} />
          <Column title="Chờ giao" count={vipOnly(choGiao, filter).length} orders={vipOnly(choGiao, filter)} onOpen={openModal} />
          <Column title="Đang giao" count={vipOnly(dangGiao, filter).length} orders={vipOnly(dangGiao, filter)} onOpen={openModal} />
          <Column title="Hoàn thành hôm nay" count={vipOnly(completedOrders, filter).length} orders={vipOnly(completedOrders, filter)} onOpen={openModal} />
        </div>
      )}
      {modalOrder && (
        <div style={{ position: 'fixed', inset: 0, background: 'var(--surface-overlay)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 16 }} onClick={() => setModalOrder(null)}>
          <div style={{ background: 'var(--surface-card)', borderRadius: 'var(--radius-lg)', width: 420, maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto', padding: 20, boxShadow: 'var(--shadow-lg)', display: 'flex', flexDirection: 'column', gap: 10 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ font: 'var(--text-title)', color: 'var(--text-primary)' }}>{modalOrder.customer?.name || 'Khách lẻ'}</div>
              {modalOrder.order_code && <Badge tone="neutral">{modalOrder.order_code}</Badge>}
            </div>
            {modalOrder.customer && <TrustScoreBadge score={modalOrder.customer.trust_score} locked={modalOrder.customer.locked} />}
            {modalOrder.customer?.phone && <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 4 }}><IconPhone size={14} /> {modalOrder.customer.phone}</div>}
            <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-secondary)' }}>
              {(modalOrder.order_items || []).map((it) => formatOrderItemLine(it)).join(', ') || 'Không có sản phẩm'}
            </div>
            {(modalOrder.order_items || []).some((it) => it.ref_photo_url) && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div style={{ font: 'var(--text-caption)', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}><IconPaperclip size={14} /> Ảnh mẫu khách gửi:</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {(modalOrder.order_items || []).filter((it) => it.ref_photo_url).map((it) => (
                    <a key={it.id} href={it.ref_photo_url} target="_blank" rel="noreferrer">
                      <img src={it.ref_photo_url} alt={it.name} style={{ width: 56, height: 56, borderRadius: 'var(--radius-sm)', objectFit: 'cover' }} />
                    </a>
                  ))}
                </div>
              </div>
            )}
            <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-secondary)' }}>
              Hình thức: {modalOrder.delivery_method === 'lay_tai_xuong' ? <><IconHome size={14} style={{ verticalAlign: '-2px', marginRight: 4 }} />Lấy tại xưởng</> : <><IconTruck size={14} style={{ verticalAlign: '-2px', marginRight: 4 }} />Giao hàng tận nơi</>}
            </div>
            {modalOrder.delivery_method !== 'lay_tai_xuong' && (
              <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-secondary)' }}>Địa chỉ: {modalOrder.address || '—'}</div>
            )}
            {modalOrder.delivery_method !== 'lay_tai_xuong' && (
              <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-secondary)' }}>Ship: {Number(modalOrder.ship_fee) ? `${Number(modalOrder.ship_fee).toLocaleString('vi-VN')}đ` : 'Miễn phí'}</div>
            )}
            <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 4 }}>
              <IconClock size={14} />Ngày giao: {formatDeliveryDateTime(modalOrder.delivery_date, modalOrder.delivery_time) || '—'}
            </div>
            <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-secondary)' }}>Tổng tiền: {Number(modalOrder.total || 0).toLocaleString('vi-VN')}đ</div>
            <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-secondary)' }}>Thanh toán: {modalOrder.payment_method === 'bank' ? 'Chuyển khoản' : 'COD'}{Number(modalOrder.deposit) > 0 ? ` · Đã cọc: ${Number(modalOrder.deposit).toLocaleString('vi-VN')}đ` : ''}</div>
            {modalOrder.note && <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 4 }}><IconClipboard size={14} /> {modalOrder.note}</div>}
            {modalOrder.status === 'huy' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: 10, background: 'var(--status-danger-soft)', borderRadius: 'var(--radius-sm)' }}>
                <Badge tone="danger" icon={<IconBan size={13} />}>Đã huỷ</Badge>
                <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-secondary)' }}>Lý do: {modalOrder.cancel_reason || 'Không ghi lý do'}</div>
                {modalOrder.cancel_staff_name && <div style={{ font: 'var(--text-caption)', color: 'var(--text-muted)' }}>Người huỷ: {modalOrder.cancel_staff_name}</div>}
                {modalOrder.cancel_photo_url && (
                  <a href={modalOrder.cancel_photo_url} target="_blank" rel="noreferrer">
                    <img src={modalOrder.cancel_photo_url} alt="Ảnh minh chứng huỷ đơn" style={{ width: 64, height: 64, borderRadius: 'var(--radius-sm)', objectFit: 'cover' }} />
                  </a>
                )}
              </div>
            )}
            {modalOrder.status === 'hoan_thanh' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: 10, background: 'var(--status-success-soft)', borderRadius: 'var(--radius-sm)' }}>
                <Badge tone="success" icon={<IconCheck size={13} />}>Hoàn thành</Badge>
                {modalOrder.completed_at && (
                  <div style={{ font: 'var(--text-caption)', color: 'var(--text-muted)' }}>
                    Lúc: {new Date(modalOrder.completed_at).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}
                  </div>
                )}
                {formatDuration(modalOrder.created_at, modalOrder.completed_at) && (
                  <div style={{ font: 'var(--text-caption)', color: 'var(--text-muted)' }}>
                    <IconClock size={13} style={{ verticalAlign: '-2px', marginRight: 4 }} />Thời gian xử lý: {formatDuration(modalOrder.created_at, modalOrder.completed_at)}
                  </div>
                )}
                {modalOrder.late_reason && <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-secondary)' }}>Lý do trễ: {modalOrder.late_reason}</div>}
              </div>
            )}
            <CommentSection order={modalOrder} profile={profile} />
            {actionError && <div style={{ font: 'var(--text-body-sm)', color: 'var(--status-danger)' }}>{actionError}</div>}
            <ActionChip icon={<IconWarning size={16} />} label="Báo sự cố" tone="danger" onClick={() => setShowOrderIncident(true)} style={{ alignSelf: 'flex-start' }} />
            {requestSent && <div style={{ font: 'var(--text-body-sm)', color: 'var(--status-success)' }}>Đã gửi yêu cầu — chờ sếp duyệt trong phần bình luận của đơn.</div>}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 4 }}>
              {canManage ? (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {modalOrder.status !== 'huy' && modalOrder.status !== 'hoan_thanh' && (
                    <Button variant="secondary" size="sm" onClick={() => setShowEditOrder(true)} disabled={actionBusy}>Sửa đơn</Button>
                  )}
                  {modalOrder.status !== 'huy' && modalOrder.status !== 'hoan_thanh' && (
                    <Button variant="warning" size="sm" onClick={() => { setActionError(''); setReasonAction('cancel'); }} disabled={actionBusy}>Khách hủy đơn</Button>
                  )}
                  {modalOrder.status !== 'huy' && (
                    <Button variant="danger" size="sm" onClick={() => { setActionError(''); profile?.role === 'owner' ? handleDirectDelete() : setReasonAction('delete'); }} disabled={actionBusy}>Xoá đơn</Button>
                  )}
                </div>
              ) : canRequestChange && modalOrder.status !== 'huy' && modalOrder.status !== 'hoan_thanh' ? (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <Button variant="secondary" size="sm" onClick={() => { setActionError(''); setRequestAction('edit'); }} disabled={actionBusy}>Yêu cầu sửa đơn</Button>
                  <Button variant="warning" size="sm" onClick={() => { setActionError(''); setRequestAction('cancel'); }} disabled={actionBusy}>Yêu cầu hủy đơn</Button>
                </div>
              ) : <div />}
              <Button variant="secondary" size="sm" onClick={() => setModalOrder(null)} disabled={actionBusy}>Đóng</Button>
            </div>
          </div>
        </div>
      )}
      {showOrderIncident && modalOrder && (
        <IncidentReportModal orderId={modalOrder.id} orderCode={modalOrder.order_code} onClose={() => setShowOrderIncident(false)} onSent={() => setShowOrderIncident(false)} />
      )}
      {showEditOrder && modalOrder && modalOrder.channel === 'Teabreak' && (
        <EditTeabreakModal order={modalOrder} onClose={() => setShowEditOrder(false)} onSaved={() => { load(); setModalOrder(null); }} />
      )}
      {showEditOrder && modalOrder && modalOrder.channel === 'Macaron Sỉ' && (
        <EditMacaronModal order={modalOrder} onClose={() => setShowEditOrder(false)} onSaved={() => { load(); setModalOrder(null); }} />
      )}
      {showEditOrder && modalOrder && modalOrder.channel !== 'Teabreak' && modalOrder.channel !== 'Macaron Sỉ' && (
        <EditOrderModal order={modalOrder} onClose={() => setShowEditOrder(false)} onSaved={() => { load(); setModalOrder(null); }} />
      )}
      {reasonAction && (
        <ReasonModal
          title={reasonAction === 'cancel' ? 'Khách hủy đơn — lý do?' : 'Xoá đơn — lý do?'}
          confirmLabel={reasonAction === 'cancel' ? 'Xác nhận hủy đơn' : 'Xác nhận xoá hẳn'}
          confirmVariant={reasonAction === 'cancel' ? 'warning' : 'danger'}
          busy={actionBusy}
          error={actionError}
          onClose={() => { if (!actionBusy) setReasonAction(null); }}
          onConfirm={handleConfirmReason}
        />
      )}
      {requestAction && (
        <ReasonModal
          title={requestAction === 'edit' ? 'Yêu cầu sửa đơn — lý do?' : 'Yêu cầu hủy đơn — lý do?'}
          confirmLabel="Gửi yêu cầu cho sếp"
          confirmVariant="primary"
          busy={actionBusy}
          error={actionError}
          onClose={() => { if (!actionBusy) setRequestAction(null); }}
          onConfirm={handleRequestChange}
        />
      )}
      {showNew && <NewOrderModal onClose={() => setShowNew(false)} onCreated={load} onManualItems={handleManualItemsDetected} />}
      {showTeabreak && <TeabreakOrderModal onClose={() => setShowTeabreak(false)} onCreated={load} onManualItems={handleManualItemsDetected} />}
      {showMacaron && <MacaronOrderModal onClose={() => setShowMacaron(false)} onCreated={load} onManualItems={handleManualItemsDetected} />}
      {pendingCatalogItems && (
        <div style={{ position: 'fixed', inset: 0, background: 'var(--surface-overlay)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60, padding: 16 }} onClick={() => setPendingCatalogItems(null)}>
          <div style={{ background: 'var(--surface-card)', borderRadius: 'var(--radius-lg)', width: 380, maxWidth: '100%', padding: 20, boxShadow: 'var(--shadow-lg)', display: 'flex', flexDirection: 'column', gap: 12 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ font: 'var(--text-title)', color: 'var(--text-primary)' }}>Lưu vào danh mục sản phẩm?</div>
            <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-secondary)' }}>
              {pendingCatalogItems.length} món vừa nhập tay chưa có trong danh mục. Lưu lại để lần sau chọn từ danh sách, tự động điền giá:
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {pendingCatalogItems.map((c) => (
                <div key={c.name} style={{ display: 'flex', justifyContent: 'space-between', font: 'var(--text-body-sm)', color: 'var(--text-secondary)' }}>
                  <span>{c.name}</span><b>{Number(c.price).toLocaleString('vi-VN')}đ</b>
                </div>
              ))}
            </div>
            {catalogError && <div style={{ font: 'var(--text-body-sm)', color: 'var(--status-danger)' }}>{catalogError}</div>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <Button variant="secondary" size="sm" onClick={() => setPendingCatalogItems(null)} disabled={savingCatalog}>Bỏ qua</Button>
              <Button variant="primary" size="sm" onClick={handleSaveCatalogItems} disabled={savingCatalog}>{savingCatalog ? 'Đang lưu...' : 'Lưu vào danh mục'}</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
