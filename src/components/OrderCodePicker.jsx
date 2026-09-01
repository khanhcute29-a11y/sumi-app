import React, { useEffect, useRef, useState } from 'react';
import { searchOrdersForPicker } from '../lib/queries';

// Ô "Mã đơn liên quan" dùng chung — thay cho gõ tay tự do (mã đơn tự sinh,
// nhiều đơn nên rất khó nhớ chính xác). Gõ mã đơn HOẶC tên khách là hiện
// dropdown gợi ý kèm khách/bánh/địa chỉ để chọn đúng đơn, đỡ phải tra lại ở
// màn khác rồi gõ tay. Vẫn cho gõ tự do bình thường (field này ở mọi nơi
// đang dùng đều KHÔNG bắt buộc), không ép phải chọn từ danh sách.
export function OrderCodePicker({ label, placeholder = 'Gõ mã đơn hoặc tên khách…', value, onChange, style }) {
  const [open, setOpen] = useState(false);
  const [ketQua, setKetQua] = useState([]);
  const [dangTim, setDangTim] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    const q = (value || '').trim();
    if (q.length < 2) { setKetQua([]); return; }
    let huy = false;
    setDangTim(true);
    const timer = setTimeout(() => {
      searchOrdersForPicker(q)
        .then((rows) => { if (!huy) setKetQua(rows); })
        .catch(() => { if (!huy) setKetQua([]); })
        .finally(() => { if (!huy) setDangTim(false); });
    }, 300); // gõ xong mới tìm, tránh gọi Supabase liên tục từng ký tự
    return () => { huy = true; clearTimeout(timer); };
  }, [value]);

  useEffect(() => {
    if (!open) return;
    const closeOnOutside = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('pointerdown', closeOnOutside);
    return () => document.removeEventListener('pointerdown', closeOnOutside);
  }, [open]);

  const chon = (row) => {
    onChange(row.order_code || '');
    setOpen(false);
  };

  return (
    <div ref={wrapRef} style={{ position: 'relative', width: '100%', ...style }}>
      {label && <label style={{ display: 'block', fontWeight: 700, fontSize: 13, marginBottom: 4, color: 'var(--text-primary, #2d1c10)' }}>{label}</label>}
      <input
        value={value || ''}
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        style={{
          width: '100%', minHeight: 44, padding: '0 12px', borderRadius: 10,
          border: '1px solid var(--border-default, #eadcca)', fontSize: 14, fontFamily: 'inherit', boxSizing: 'border-box',
        }}
      />
      {open && (value || '').trim().length >= 2 && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 30, marginTop: 4,
          background: '#fff', border: '1px solid var(--border-default, #eadcca)', borderRadius: 12,
          maxHeight: 280, overflowY: 'auto', boxShadow: '0 8px 24px rgba(0,0,0,.15)',
        }}>
          {dangTim && <div style={{ padding: '10px 12px', fontSize: 12.5, color: '#8a7a66' }}>Đang tìm...</div>}
          {!dangTim && ketQua.length === 0 && (
            <div style={{ padding: '10px 12px', fontSize: 12.5, color: '#8a7a66' }}>Không tìm thấy đơn nào khớp — vẫn dùng được mã bạn vừa gõ.</div>
          )}
          {ketQua.map((row) => (
            <button
              type="button"
              key={row.id}
              onClick={() => chon(row)}
              style={{
                display: 'block', width: '100%', textAlign: 'left', padding: '9px 12px',
                border: 0, borderTop: '1px solid #f2ece3', background: '#fff', cursor: 'pointer',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 800, fontSize: 13.5, color: '#2d1c10' }}>
                #{row.order_code || 'CHƯA CÓ MÃ'}
                {row.customer_name && <span style={{ fontWeight: 600, color: '#725f50' }}>· {row.customer_name}</span>}
              </div>
              {row.product_names && <div style={{ fontSize: 12, color: '#8a7a66', marginTop: 2 }}>🍰 {row.product_names}</div>}
              {row.address && <div style={{ fontSize: 12, color: '#8a7a66', marginTop: 1 }}>📍 {row.address}</div>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
