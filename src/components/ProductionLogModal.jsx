import React, { useEffect, useState } from 'react';
import { Button } from './forms/Button';
import { Input } from './forms/Input';
import { Select } from './forms/Select';
import { addProductionLog, fetchProducts } from '../lib/queries';
import { useAuth } from '../lib/AuthContext';
import { IconClipboard } from './icons/FrogIcons';

export function ProductionLogModal({ onClose, onSaved }) {
  const { profile } = useAuth();
  const [products, setProducts] = useState([]);
  const [productId, setProductId] = useState('');
  const [qty, setQty] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchProducts({ activeOnly: true }).then(setProducts).catch((err) => setError(err.message));
  }, []);

  const handleSave = async () => {
    const product = products.find((p) => p.id === productId);
    if (!product) { setError('Chọn 1 sản phẩm.'); return; }
    const qtyNum = Number(qty);
    if (!qtyNum || qtyNum <= 0) { setError('Nhập số lượng hợp lệ.'); return; }
    setSaving(true);
    setError('');
    try {
      await addProductionLog({
        productId: product.id, productName: product.name, qty: qtyNum,
        staffId: profile?.id, staffName: profile?.full_name,
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
          <Select
            label="Sản phẩm"
            value={productId}
            onChange={(e) => setProductId(e.target.value)}
            options={products.map((p) => ({ value: p.id, label: p.name }))}
            placeholder="Chọn sản phẩm..."
          />
          <Input label="Số lượng" type="number" placeholder="VD: 50" value={qty} onChange={(e) => setQty(e.target.value)} />
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
