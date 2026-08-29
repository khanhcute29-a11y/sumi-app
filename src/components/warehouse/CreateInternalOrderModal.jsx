import React, { useEffect, useState } from 'react';
import { useAuth } from '../../lib/AuthContext';
import { uploadFile } from '../../lib/queries';
import { fetchStockAvailableFor, createInternalOrder, createInternalOrderFromStock } from '../../lib/internalOrders';

// Tạo Đơn Hàng Nội Bộ (Phase 1) — bánh lên kệ, không có khách hàng.
// 2 nhánh: (A) chọn bánh còn tồn trong kho -> trừ kho thẳng, đẩy vận tải
// (không qua bếp); (B) không còn / bấm "Tạo mới" -> tạo đơn, đẩy xuống đúng
// bếp thật (bakery/cake/macaron) y hệt luồng tạo đơn khách.

const ORDER_TYPES = [
  { key: 'bakery', label: '🍞 Bánh mặn ngọt', note: 'Bếp Nóng' },
  { key: 'cake', label: '🎂 Bánh lạnh', note: 'Bếp Lạnh' },
  { key: 'macaron', label: '🧁 Macaron', note: 'Xưởng 41' },
];
const STORES = ['Vĩnh Phú 42', 'Quốc Lộ 13'];

const nowLocal = () => {
  const d = new Date(Date.now() - new Date().getTimezoneOffset() * 60000);
  return d.toISOString().slice(0, 16);
};

const field = { width: '100%', minHeight: 48, padding: '0 12px', borderRadius: 14, border: '1px solid #e2cdb6', boxSizing: 'border-box' };

function emptyItem() { return { name: '', size: '', quantity: '', price: '', photoFile: null }; }

export default function CreateInternalOrderModal({ onClose, onCreated }) {
  const { profile } = useAuth();
  const [orderType, setOrderType] = useState('bakery');
  const [targetStore, setTargetStore] = useState(STORES[0]);
  const [requiredAt, setRequiredAt] = useState(nowLocal());
  const [note, setNote] = useState('');

  const [mode, setMode] = useState('checking'); // 'checking' | 'stock' | 'new'
  const [stockList, setStockList] = useState([]);
  const [selectedStockId, setSelectedStockId] = useState('');
  const [stockQty, setStockQty] = useState('');

  const [items, setItems] = useState([emptyItem()]);

  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  // "Chọn Bánh Sẵn Trong Kho": hễ đổi luồng/cửa hàng là tra lại đúng bánh
  // đang còn tồn cho đúng luồng+cửa hàng đó. Kho trống -> tự chuyển "Tạo mới".
  useEffect(() => {
    let cancelled = false;
    setSelectedStockId(''); setStockQty('');
    fetchStockAvailableFor(orderType, targetStore)
      .then((rows) => { if (!cancelled) { setStockList(rows); setMode(rows.length > 0 ? 'stock' : 'new'); } })
      .catch(() => { if (!cancelled) { setStockList([]); setMode('new'); } });
    return () => { cancelled = true; };
  }, [orderType, targetStore]);

  const selectedStock = stockList.find((s) => s.id === selectedStockId) || null;

  const updateItem = (i, patch) => setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  const addItem = () => setItems((prev) => [...prev, emptyItem()]);
  const removeItem = (i) => setItems((prev) => (prev.length > 1 ? prev.filter((_, idx) => idx !== i) : prev));

  const submitFromStock = async () => {
    if (!selectedStock) { setError('Chọn 1 bánh trong kho.'); return; }
    const qtyNum = Number(stockQty);
    if (!qtyNum || qtyNum <= 0) { setError('Nhập số lượng cần lấy.'); return; }
    if (qtyNum > Number(selectedStock.qty)) { setError(`Kho chỉ còn ${selectedStock.qty}.`); return; }
    setSaving(true); setError('');
    try {
      await createInternalOrderFromStock({
        stockId: selectedStock.id, qty: qtyNum, targetStore, requiredAt, note,
      });
      onCreated?.();
      onClose();
    } catch (e) { setError(e.message || 'Không tạo được đơn.'); } finally { setSaving(false); }
  };

  const submitNew = async () => {
    const cleanItems = items.filter((it) => it.name.trim());
    if (cleanItems.length === 0) { setError('Nhập ít nhất 1 tên loại bánh.'); return; }
    setSaving(true); setError('');
    try {
      const resolvedItems = [];
      for (const it of cleanItems) {
        let photoUrl = null;
        if (it.photoFile) {
          const uploaded = await uploadFile(it.photoFile, `internal-orders/${Date.now()}`);
          photoUrl = uploaded.url;
        }
        resolvedItems.push({
          name: it.name.trim(), size: it.size.trim() || null,
          quantity: Number(it.quantity) || 1, price: it.price ? Number(it.price) : null,
          photoUrl,
        });
      }
      await createInternalOrder({ orderType, targetStore, requiredAt, note, items: resolvedItems });
      onCreated?.();
      onClose();
    } catch (e) { setError(e.message || 'Không tạo được đơn.'); } finally { setSaving(false); }
  };

  return (
    <div onClick={() => !saving && onClose?.()} style={{ position: 'fixed', inset: 0, zIndex: 210, background: 'rgba(45,27,16,.55)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 520, maxHeight: '92dvh', overflowY: 'auto', background: '#fffaf2', borderRadius: '24px 24px 0 0', padding: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 900, color: '#2d1b10' }}>📦 Tạo Đơn Hàng Nội Bộ</h2>
          <button onClick={onClose} style={{ width: 40, height: 40, border: '1px solid #e2cdb6', borderRadius: 12, background: '#fff', fontSize: 18 }}>✕</button>
        </div>
        <div style={{ fontSize: 12, color: '#9a7f68', marginBottom: 14 }}>
          Người tạo: <b>{profile?.full_name || 'Không rõ'}</b> · Ngày giờ tạo: {new Date().toLocaleString('vi-VN')}
        </div>

        <div style={{ display: 'grid', gap: 10 }}>
          <div>
            <label style={{ display: 'block', fontWeight: 900, marginBottom: 6 }}>Luồng sản xuất</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
              {ORDER_TYPES.map((t) => (
                <button key={t.key} type="button" onClick={() => setOrderType(t.key)} style={{
                  minHeight: 56, borderRadius: 14, border: orderType === t.key ? '2px solid #f05c2b' : '1px solid #e2cdb6',
                  background: orderType === t.key ? '#fff1e8' : '#fff', fontWeight: 800, fontSize: 12.5, cursor: 'pointer',
                  display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'center', justifyContent: 'center', padding: 4,
                }}>
                  <span>{t.label}</span>
                  <span style={{ fontSize: 10, color: '#9a7f68', fontWeight: 700 }}>{t.note}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontWeight: 900, marginBottom: 6 }}>Cửa hàng đích</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              {STORES.map((s) => (
                <button key={s} type="button" onClick={() => setTargetStore(s)} style={{
                  minHeight: 46, borderRadius: 14, border: targetStore === s ? '2px solid #f05c2b' : '1px solid #e2cdb6',
                  background: targetStore === s ? '#fff1e8' : '#fff', fontWeight: 800, fontSize: 13, cursor: 'pointer',
                }}>{s}</button>
              ))}
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontWeight: 900, marginBottom: 6 }}>Ngày giờ yêu cầu hoàn thành</label>
            <input style={field} type="datetime-local" value={requiredAt} onChange={(e) => setRequiredAt(e.target.value)} />
          </div>

          {/* Chọn Bánh Sẵn Trong Kho — kho trống thì tự chuyển "Tạo mới" (mode
              được đổi trong useEffect ở trên, không cần bấm gì thêm). */}
          {mode === 'stock' && (
            <div style={{ background: '#fff', border: '1.5px solid #b9e0c8', borderRadius: 16, padding: 12 }}>
              <div style={{ fontWeight: 900, marginBottom: 8, color: '#078653' }}>✅ Đang còn hàng trong kho — chọn để đẩy giao ngay, không cần sản xuất</div>
              <div style={{ display: 'grid', gap: 6, maxHeight: 220, overflowY: 'auto', marginBottom: 10 }}>
                {stockList.map((s) => (
                  <button key={s.id} type="button" onClick={() => { setSelectedStockId(s.id); setStockQty(String(Math.min(1, s.qty))); }} style={{
                    textAlign: 'left', display: 'flex', justifyContent: 'space-between', gap: 8, padding: '10px 12px', borderRadius: 12,
                    border: selectedStockId === s.id ? '2px solid #078653' : '1px solid #e2cdb6', background: selectedStockId === s.id ? '#f0fdf5' : '#fff', cursor: 'pointer',
                  }}>
                    <span>{s.products?.name || 'Sản phẩm'}{s.size ? ` · ${s.size}` : ''}</span>
                    <b>Còn {s.qty}</b>
                  </button>
                ))}
              </div>
              {selectedStock && (
                <div>
                  <label style={{ display: 'block', fontWeight: 900, marginBottom: 6 }}>Số lượng lấy (tối đa {selectedStock.qty})</label>
                  <input style={field} type="number" min="1" max={selectedStock.qty} value={stockQty} onChange={(e) => setStockQty(e.target.value)} />
                </div>
              )}
              <button type="button" onClick={() => setMode('new')} style={{ marginTop: 8, background: 'none', border: 0, color: '#9a7f68', fontSize: 12, textDecoration: 'underline', cursor: 'pointer' }}>
                Không dùng hàng có sẵn, tạo đơn sản xuất mới →
              </button>
            </div>
          )}

          {mode === 'new' && (
            <div style={{ background: '#fff', border: '1.5px solid #e2cdb6', borderRadius: 16, padding: 12 }}>
              <div style={{ fontWeight: 900, marginBottom: 8 }}>🧑‍🍳 Tạo đơn sản xuất mới — đẩy xuống bếp</div>
              {items.map((it, i) => (
                <div key={i} style={{ marginBottom: 10, paddingBottom: 10, borderBottom: i < items.length - 1 ? '1px dashed #e2cdb6' : 'none' }}>
                  <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                    <input style={field} placeholder="Tên loại bánh *" value={it.name} onChange={(e) => updateItem(i, { name: e.target.value })} />
                    {items.length > 1 && <button type="button" onClick={() => removeItem(i)} style={{ width: 44, border: '1px solid #e2cdb6', borderRadius: 12, background: '#fff' }}>✕</button>}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginBottom: 6 }}>
                    <input style={field} placeholder="Size" value={it.size} onChange={(e) => updateItem(i, { size: e.target.value })} />
                    <input style={field} type="number" min="1" placeholder="SL" value={it.quantity} onChange={(e) => updateItem(i, { quantity: e.target.value })} />
                    <input style={field} type="number" min="0" placeholder="Giá" value={it.price} onChange={(e) => updateItem(i, { price: e.target.value })} />
                  </div>
                  <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 44, border: '2px dashed #e2cdb6', borderRadius: 12, cursor: 'pointer', fontSize: 12.5 }}>
                    {it.photoFile ? `📷 ${it.photoFile.name}` : '📷 Ảnh (không bắt buộc)'}
                    <input hidden type="file" accept="image/*" onChange={(e) => updateItem(i, { photoFile: e.target.files?.[0] || null })} />
                  </label>
                </div>
              ))}
              <button type="button" onClick={addItem} style={{ width: '100%', minHeight: 44, borderRadius: 12, border: '2px dashed #f05c2b', background: '#fff7ec', color: '#b7431e', fontWeight: 800, cursor: 'pointer' }}>
                ＋ Thêm loại bánh
              </button>
            </div>
          )}

          <div>
            <label style={{ display: 'block', fontWeight: 900, marginBottom: 6 }}>Ghi chú</label>
            <input style={field} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Không bắt buộc" />
          </div>

          {error && <div style={{ color: '#d94a40', fontWeight: 700 }}>{error}</div>}

          <button
            onClick={mode === 'stock' ? submitFromStock : submitNew}
            disabled={saving}
            style={{ minHeight: 58, border: 0, borderRadius: 18, background: '#f05c2b', color: '#fff', fontSize: 17, fontWeight: 950, cursor: saving ? 'not-allowed' : 'pointer' }}
          >
            {saving ? 'Đang tạo...' : mode === 'stock' ? '✓ Xác nhận lấy từ kho & đẩy giao' : '✓ Tạo đơn & đẩy xuống bếp'}
          </button>
        </div>
      </div>
    </div>
  );
}
