import React, { useEffect, useState } from 'react';
import { Button } from '../forms/Button';
import { Input } from '../forms/Input';
import { Select } from '../forms/Select';
import { adjustFinishedGoodsStock, fetchFinishedGoodsStock } from '../../lib/queries';
import { branchForCategory } from '../../lib/cakePricing';

const BRANCHES = [
  { value: 'bakery', label: 'Kho Bakery' },
  { value: 'xuong41', label: 'Kho Xưởng Macaron' },
  { value: 'xuong42', label: 'Kho Xưởng 42' },
];

export default function AdjustStockForm({ products, defaultBranch, staffName, onSaved, onClose }) {
  const [productId, setProductId] = useState(products[0]?.id || '');
  const [size, setSize] = useState('');
  const [branch, setBranch] = useState(defaultBranch || 'bakery');
  const [newQty, setNewQty] = useState('');
  const [note, setNote] = useState('');
  const [currentQty, setCurrentQty] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const product = products.find((p) => p.id === productId);
  const sizeOptions = product?.product_variants?.length
    ? product.product_variants.map((v) => ({ value: v.label, label: v.label }))
    : [];

  // Single source of truth for branch: always derived from the currently
  // selected product's category, both on mount and whenever it changes.
  useEffect(() => {
    if (!product) return;
    setBranch(branchForCategory(product.category));
  }, [product]);

  useEffect(() => {
    if (!productId) return;
    fetchFinishedGoodsStock().then((rows) => {
      const match = rows.find((r) => r.product_id === productId && r.branch === branch && (r.size || '') === (size || ''));
      setCurrentQty(match ? Number(match.qty) : 0);
    }).catch(() => setCurrentQty(null));
  }, [productId, branch, size]);

  const handleSubmit = async () => {
    if (!productId || newQty === '') { setError('Chọn sản phẩm và nhập số lượng đúng thực tế.'); return; }
    if (!note.trim()) { setError('Nhập lý do điều chỉnh (VD: kiểm kê phát hiện thiếu 2 cái).'); return; }
    setSaving(true);
    setError('');
    try {
      await adjustFinishedGoodsStock({
        productId, productName: product?.name || '', size: size || null, branch,
        newQty: Number(newQty), note: note.trim(), staffName,
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
    <div style={{ background: 'var(--surface-card)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-sm)', padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
      {error && <div style={{ font: 'var(--text-body-sm)', color: 'var(--status-danger)' }}>{error}</div>}
      <Select label="Sản phẩm" value={productId} onChange={(e) => {
        setProductId(e.target.value);
        setSize('');
      }} options={products.map((p) => ({ value: p.id, label: p.name }))} />
      {sizeOptions.length > 0 && (
        <Select label="Size" value={size} onChange={(e) => setSize(e.target.value)} options={sizeOptions} placeholder="Chọn size..." />
      )}
      <Select label="Thuộc kho" value={branch} onChange={(e) => setBranch(e.target.value)} options={BRANCHES} />
      {currentQty !== null && (
        <div style={{ font: 'var(--text-caption)', color: 'var(--text-muted)' }}>Tồn kho hiện tại trong hệ thống: <b>{currentQty}</b></div>
      )}
      <Input label="Số lượng đúng thực tế" type="number" placeholder="VD: 6" value={newQty} onChange={(e) => setNewQty(e.target.value)}
        helpText="Nhập đúng số bánh đang thật sự còn trong kho — không phải số cộng/trừ." />
      <Input label="Lý do điều chỉnh" placeholder="VD: Kiểm kê phát hiện thiếu 2 cái" value={note} onChange={(e) => setNote(e.target.value)} />
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <Button variant="secondary" size="sm" onClick={onClose} disabled={saving}>Hủy</Button>
        <Button variant="primary" size="sm" onClick={handleSubmit} disabled={saving}>{saving ? 'Đang lưu...' : 'Lưu điều chỉnh'}</Button>
      </div>
    </div>
  );
}
