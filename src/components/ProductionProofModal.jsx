import React, { useEffect, useRef, useState } from 'react';
import { toWebSafeImage } from '../lib/imageConvert';

// Khung chụp ẢNH THÀNH PHẨM bắt buộc trước khi bếp bấm "Hoàn thành" mẻ bánh
// (yêu cầu Giám đốc 20/09/2026). Cho chụp trực tiếp hoặc chọn từ thư viện, nhiều
// ảnh, xem trước/xoá từng ảnh. Component KHÔNG tự tải ảnh lên — trả về mảng File
// qua onSubmit để nơi gọi tải lên rồi mới gọi RPC hoàn thành (server kiểm lại).
// Giám đốc có nút ngoại lệ "Hoàn thành không ảnh" (hệ thống sẽ ghi lại).
export default function ProductionProofModal({ packageName, isDirector, busy, error, onCancel, onSubmit }) {
  const [items, setItems] = useState([]); // [{ file, url }]
  const [converting, setConverting] = useState(false);
  const [localError, setLocalError] = useState('');
  const itemsRef = useRef([]);
  itemsRef.current = items;

  // Thu hồi object URL khi đóng khung để không rò bộ nhớ.
  useEffect(() => () => { itemsRef.current.forEach((it) => URL.revokeObjectURL(it.url)); }, []);

  const addFiles = async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (!files.length) return;
    setConverting(true); setLocalError('');
    try {
      const safe = [];
      for (const f of files) {
        const file = await toWebSafeImage(f);
        safe.push({ file, url: URL.createObjectURL(file) });
      }
      setItems((cur) => [...cur, ...safe]);
    } catch (err) {
      setLocalError(err?.message || 'Không đọc được ảnh, vui lòng thử lại.');
    } finally { setConverting(false); }
  };

  const remove = (i) => setItems((cur) => {
    URL.revokeObjectURL(cur[i].url);
    return cur.filter((_, idx) => idx !== i);
  });

  const disabled = busy || converting;
  const btn = { minHeight: 48, borderRadius: 12, fontWeight: 900, fontSize: 15, cursor: 'pointer', border: '1.5px solid #eadcca', background: '#fffaf3', color: '#2d1c10', flex: 1 };
  return (
    <div onClick={() => !busy && onCancel()} style={{ position: 'fixed', inset: 0, zIndex: 130, background: 'rgba(0,0,0,.55)', display: 'flex', justifyContent: 'center', alignItems: 'center', padding: 12 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 18, padding: 16, width: '100%', maxWidth: 440, maxHeight: '92vh', overflowY: 'auto', boxShadow: '0 12px 40px rgba(0,0,0,.3)' }}>
        <strong style={{ fontSize: 17, color: '#2d1c10' }}>📸 Chụp ảnh thành phẩm</strong>
        <p style={{ margin: '6px 0 12px', fontSize: 13, color: '#725f50', lineHeight: 1.5 }}>
          {packageName ? `Mẻ bánh của ${packageName}. ` : ''}Phải có <b>ít nhất 1 ảnh</b> thành phẩm mới hoàn thành được.
        </p>

        <div style={{ display: 'flex', gap: 8 }}>
          <label style={{ ...btn, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.6 : 1 }}>
            📷 Chụp ảnh
            <input type="file" accept="image/*" capture="environment" onChange={addFiles} disabled={disabled} style={{ display: 'none' }} />
          </label>
          <label style={{ ...btn, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.6 : 1 }}>
            🖼️ Chọn từ thư viện
            <input type="file" accept="image/*" multiple onChange={addFiles} disabled={disabled} style={{ display: 'none' }} />
          </label>
        </div>

        {converting && <p style={{ fontSize: 12.5, color: '#725f50', margin: '10px 0 0' }}>Đang xử lý ảnh…</p>}

        {items.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))', gap: 8, marginTop: 12 }}>
            {items.map((it, i) => (
              <div key={it.url} style={{ position: 'relative', aspectRatio: '1/1', borderRadius: 12, overflow: 'hidden', border: '2px solid #eadcca', background: '#000' }}>
                <img src={it.url} alt={`Ảnh thành phẩm ${i + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                <button type="button" onClick={() => remove(i)} disabled={busy} aria-label="Xoá ảnh"
                  style={{ position: 'absolute', top: 4, right: 4, width: 26, height: 26, borderRadius: '50%', border: 'none', background: 'rgba(185,28,28,.92)', color: '#fff', fontWeight: 900, cursor: 'pointer' }}>✕</button>
              </div>
            ))}
          </div>
        )}

        {(localError || error) && <p style={{ fontSize: 13, fontWeight: 700, color: '#b91c1c', margin: '10px 0 0' }}>{localError || error}</p>}

        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          <button type="button" onClick={onCancel} disabled={busy} style={{ ...btn, flex: 1, background: '#f4efe8' }}>Huỷ</button>
          <button type="button" disabled={disabled || items.length === 0} onClick={() => onSubmit(items.map((it) => it.file))}
            style={{ ...btn, flex: 2, border: 'none', background: items.length === 0 ? '#9ca3af' : '#28a745', color: '#fff', boxShadow: items.length === 0 ? 'none' : '0 3px 0 #1a6f2a' }}>
            {busy ? 'Đang tải ảnh…' : `✅ Hoàn thành${items.length ? ` (${items.length} ảnh)` : ''}`}
          </button>
        </div>

        {isDirector && (
          <button type="button" disabled={disabled} onClick={() => onSubmit([])}
            style={{ marginTop: 10, width: '100%', background: 'none', border: 'none', color: '#b93e13', fontWeight: 800, fontSize: 13, cursor: 'pointer', textDecoration: 'underline' }}>
            Hoàn thành không cần ảnh (Giám đốc, hệ thống sẽ ghi lại)
          </button>
        )}
      </div>
    </div>
  );
}
