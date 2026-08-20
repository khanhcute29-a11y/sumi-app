import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from './forms/Button';
import { Input } from './forms/Input';
import { Select } from './forms/Select';
import { addProductionLog, fetchProducts } from '../lib/queries';
import { useAuth } from '../lib/AuthContext';
import { localDateStr } from '../lib/date';
import { formatVnd, parseDigits } from '../lib/currency';
import { IconClipboard } from './icons/FrogIcons';

const MANUAL_OPTION = '__manual__';

function ProductPicker({ products, productId, onSelectProduct, onManual }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const containerRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e) => { if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  const filtered = query.trim() ? products.filter((p) => p.name.toLowerCase().includes(query.trim().toLowerCase())) : products;
  const selectedName = products.find((p) => p.id === productId)?.name || '';

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <Input label="Sản phẩm" placeholder="Gõ để tìm sản phẩm..." value={open ? query : selectedName}
        onFocus={() => { setOpen(true); setQuery(''); }}
        onChange={(e) => { setOpen(true); setQuery(e.target.value); }} />
      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20, marginTop: 4,
          background: 'var(--surface-card)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)',
          boxShadow: 'var(--shadow-lg)', maxHeight: 220, overflowY: 'auto',
        }}>
          {filtered.length === 0 && <div style={{ padding: '8px 10px', font: 'var(--text-caption)', color: 'var(--text-muted)' }}>Không tìm thấy sản phẩm nào.</div>}
          {filtered.map((p) => (
            <button key={p.id} type="button" onClick={() => { onSelectProduct(p.id); setOpen(false); setQuery(''); }} style={{
              display: 'block', width: '100%', textAlign: 'left', padding: '8px 10px', border: 'none', background: 'none',
              cursor: 'pointer', font: 'var(--text-body-sm)', color: 'var(--text-primary)',
            }}>
              {p.name}
            </button>
          ))}
          <button type="button" onClick={() => { onManual(); setOpen(false); setQuery(''); }} style={{
            display: 'block', width: '100%', textAlign: 'left', padding: '8px 10px', border: 'none', borderTop: '1px solid var(--border-subtle)',
            background: 'none', cursor: 'pointer', font: 'var(--text-body-sm)', color: 'var(--action-primary)',
          }}>
            Khác (nhập tay)
          </button>
        </div>
      )}
    </div>
  );
}

export function ProductionLogModal({ onClose, onSaved }) {
  const { profile } = useAuth();
  const [products, setProducts] = useState([]);
  const [mode, setMode] = useState('catalog');
  const [productId, setProductId] = useState('');
  const [manualName, setManualName] = useState('');
  const [size, setSize] = useState('');
  const [qty, setQty] = useState('');
  const [price, setPrice] = useState('');
  const [priceFocused, setPriceFocused] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchProducts({ activeOnly: true }).then(setProducts).catch((err) => setError(err.message));
  }, []);

  const selectedProduct = products.find((p) => p.id === productId);
  const variants = useMemo(() => selectedProduct?.product_variants || [], [selectedProduct]);

  const handleSelectProduct = (id) => {
    setMode('catalog');
    setProductId(id);
    const product = products.find((p) => p.id === id);
    const productVariants = product?.product_variants || [];
    setSize('');
    setPrice(productVariants.length === 0 ? String(product?.price || '') : '');
  };

  const handleManual = () => {
    setMode('manual');
    setProductId('');
    setSize('');
    setPrice('');
  };

  const handleSelectSize = (label) => {
    setSize(label);
    const variant = variants.find((v) => v.label === label);
    if (variant) setPrice(String(variant.price));
  };

  const handleSave = async () => {
    const productName = mode === 'manual' ? manualName.trim() : selectedProduct?.name;
    if (!productName) { setError(mode === 'manual' ? 'Nhập tên sản phẩm.' : 'Chọn 1 sản phẩm.'); return; }
    if (mode === 'catalog' && variants.length > 0 && !size) { setError('Chọn kích thước.'); return; }
    const qtyNum = Number(qty);
    if (!qtyNum || qtyNum <= 0) { setError('Nhập số lượng hợp lệ.'); return; }
    setSaving(true);
    setError('');
    try {
      await addProductionLog({
        productId: mode === 'catalog' ? productId : null, productName, qty: qtyNum,
        size: size || null, price: price ? Number(price) : null,
        staffId: profile?.id, staffName: profile?.full_name, workDate: localDateStr(),
      });
      onSaved?.();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'var(--surface-overlay)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 70, padding: 16 }} onClick={onClose}>
      <div style={{ background: 'var(--surface-card)', borderRadius: 'var(--radius-lg)', width: 380, maxWidth: '100%', boxShadow: 'var(--shadow-lg)' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ padding: '16px 20px', background: 'var(--action-primary)', color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderRadius: 'var(--radius-lg) var(--radius-lg) 0 0' }}>
          <div style={{ font: 'var(--text-title)', display: 'flex', alignItems: 'center', gap: 6 }}><IconClipboard size={18} /> Ghi Nhận Sản Xuất</div>
          <button onClick={onClose} style={{ border: 'none', background: 'none', color: '#fff', fontSize: 18, cursor: 'pointer' }}>✕</button>
        </div>
        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ font: 'var(--text-caption)', color: 'var(--text-muted)' }}>Ghi số lượng bánh vừa làm xong cho tủ bakery (không phải theo đơn khách).</div>
          {mode === 'catalog' ? (
            <ProductPicker products={products} productId={productId} onSelectProduct={handleSelectProduct} onManual={handleManual} />
          ) : (
            <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <Input label="Sản phẩm (nhập tay)" placeholder="VD: Bánh Kem Dâu" value={manualName} onChange={(e) => setManualName(e.target.value)} style={{ flex: '1 1 160px', minWidth: 0 }} />
              <Button variant="ghost" size="sm" onClick={() => { setMode('catalog'); setManualName(''); }}>Tìm trong menu</Button>
            </div>
          )}
          {mode === 'catalog' && variants.length > 0 && (
            <Select
              label="Kích thước"
              value={size}
              onChange={(e) => handleSelectSize(e.target.value)}
              options={variants.map((v) => ({ value: v.label, label: v.label }))}
              placeholder="Chọn size..."
            />
          )}
          <div style={{ display: 'flex', gap: 10 }}>
            <Input label="Số lượng" type="number" placeholder="VD: 50" value={qty} onChange={(e) => setQty(e.target.value)} style={{ flex: 1 }} />
            <Input
              label="Giá tiền"
              type="text"
              inputMode="numeric"
              placeholder="VD: 350000"
              value={priceFocused ? price : formatVnd(price)}
              onFocus={() => setPriceFocused(true)}
              onBlur={() => setPriceFocused(false)}
              onChange={(e) => setPrice(parseDigits(e.target.value))}
              style={{ flex: 1 }}
            />
          </div>
          <div style={{ font: 'var(--text-caption)', color: 'var(--text-muted)' }}>Giá tự điền theo sản phẩm/kích thước đã chọn, sửa lại được nếu cần.</div>
          {error && <div style={{ font: 'var(--text-body-sm)', color: 'var(--status-danger)' }}>{error}</div>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <Button variant="secondary" size="sm" onClick={onClose} disabled={saving}>Huỷ</Button>
            <Button variant="primary" size="sm" onClick={handleSave} disabled={saving}>{saving ? 'Đang lưu...' : 'Lưu'}</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
