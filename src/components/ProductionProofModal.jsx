import React, { useEffect, useRef, useState } from 'react';
import { toWebSafeImage } from '../lib/imageConvert';
import { supabase } from '../lib/supabaseClient';

// Khung chụp ẢNH THÀNH PHẨM bắt buộc trước khi bếp bấm "Hoàn thành" mẻ bánh
// (yêu cầu Giám đốc 20/09/2026). Cho chụp trực tiếp hoặc chọn từ thư viện, nhiều
// ảnh, xem trước/xoá từng ảnh. Component KHÔNG tự tải ảnh lên — trả về mảng File
// qua onSubmit để nơi gọi tải lên rồi mới gọi RPC hoàn thành (server kiểm lại).
// Quy tắc có công tắc (feature_flags.production_photo_required, xem migration
// 202609201500): đang TẮT thì ảnh chỉ là tuỳ chọn. Đọc lỗi → mặc định coi là BẬT.
// Giám đốc có nút ngoại lệ "Hoàn thành không ảnh" (hệ thống sẽ ghi lại).
export default function ProductionProofModal({ packageName, isDirector, busy, error, onCancel, onSubmit }) {
  const [items, setItems] = useState([]); // [{ file, url }]
  const [converting, setConverting] = useState(false);
  const [localError, setLocalError] = useState('');
  const [required, setRequired] = useState(true);
  const itemsRef = useRef([]);
  itemsRef.current = items;

  useEffect(() => {
    let huy = false;
    supabase.rpc('production_photo_required').then(({ data, error: e }) => { if (!huy && !e && data === false) setRequired(false); }).catch(() => {});
    return () => { huy = true; };
  }, []);

  // Zalo/Facebook/Instagram mở link trong trình duyệt riêng, hay không chụp/chọn ảnh được.
  const inAppBrowser = typeof navigator !== 'undefined' && /Zalo|FBAN|FBAV|FB_IAB|Instagram|Line\//i.test(navigator.userAgent || '');

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
  const canSubmit = !disabled && (!required || items.length > 0);
  // Đổi lỗi kỹ thuật thành câu nhân viên bếp làm theo được.
  const friendly = (msg) => {
    if (!msg) return '';
    if (/row-level security|not authorized|permission|unauthorized|403/i.test(msg)) return 'Tài khoản của bạn chưa có quyền tải ảnh lên. Báo IT/quản lý xử lý giúp.';
    if (/network|failed to fetch|load failed|timeout|timed out/i.test(msg)) return 'Mạng yếu nên ảnh chưa tải lên được. Kiểm tra sóng rồi bấm Hoàn thành lại (ảnh vẫn giữ nguyên).';
    return msg;
  };
  const btn = { minHeight: 48, borderRadius: 12, fontWeight: 900, fontSize: 15, cursor: 'pointer', border: '1.5px solid #eadcca', background: '#fffaf3', color: '#2d1c10', flex: 1 };
  return (
    <div onClick={() => !busy && onCancel()} style={{ position: 'fixed', inset: 0, zIndex: 130, background: 'rgba(0,0,0,.55)', display: 'flex', justifyContent: 'center', alignItems: 'center', padding: 12 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 18, padding: 16, width: '100%', maxWidth: 440, maxHeight: '92vh', overflowY: 'auto', boxShadow: '0 12px 40px rgba(0,0,0,.3)' }}>
        <strong style={{ fontSize: 17, color: '#2d1c10' }}>📸 Chụp ảnh thành phẩm</strong>
        <p style={{ margin: '6px 0 10px', fontSize: 13, color: '#725f50', lineHeight: 1.5 }}>
          {packageName ? `Mẻ bánh của ${packageName}. ` : ''}
          {required ? <>Phải có <b>ít nhất 1 ảnh</b> thành phẩm mới hoàn thành được.</> : 'Ảnh thành phẩm không bắt buộc lúc này, nhưng nên chụp để lưu lại.'}
        </p>
        {required && (
          <div style={{ padding: '10px 12px', borderRadius: 12, background: '#fff7ed', border: '1.5px solid #fdba74', fontSize: 13.5, fontWeight: 700, color: '#9a3412', lineHeight: 1.6, marginBottom: 12 }}>
            <div>① Bấm <b>📷 Chụp ảnh</b> (hoặc chọn từ thư viện)</div>
            <div>② Khi thấy ảnh hiện ra bên dưới, bấm nút xanh <b>Hoàn thành</b></div>
          </div>
        )}
        {inAppBrowser && (
          <div style={{ padding: '8px 12px', borderRadius: 12, background: '#fee2e2', border: '1.5px solid #fca5a5', fontSize: 12.5, fontWeight: 700, color: '#b91c1c', lineHeight: 1.5, marginBottom: 12 }}>
            Bạn đang mở app trong Zalo/Facebook nên có thể không chụp được ảnh. Hãy mở bằng Safari hoặc Chrome (hoặc app đã cài trên màn hình chính).
          </div>
        )}

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

        {(localError || error) && <p style={{ fontSize: 13, fontWeight: 700, color: '#b91c1c', margin: '10px 0 0' }}>{friendly(localError || error)}</p>}

        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          <button type="button" onClick={onCancel} disabled={busy} style={{ ...btn, flex: 1, background: '#f4efe8' }}>Huỷ</button>
          <button type="button" disabled={!canSubmit} onClick={() => onSubmit(items.map((it) => it.file))}
            style={{ ...btn, flex: 2, border: 'none', background: !canSubmit ? '#9ca3af' : '#28a745', color: '#fff', boxShadow: !canSubmit ? 'none' : '0 3px 0 #1a6f2a' }}>
            {busy ? 'Đang tải ảnh…' : (required && items.length === 0 ? 'Chụp ảnh trước' : `✅ Hoàn thành${items.length ? ` (${items.length} ảnh)` : ''}`)}
          </button>
        </div>

        {isDirector && required && (
          <button type="button" disabled={disabled} onClick={() => onSubmit([])}
            style={{ marginTop: 10, width: '100%', background: 'none', border: 'none', color: '#b93e13', fontWeight: 800, fontSize: 13, cursor: 'pointer', textDecoration: 'underline' }}>
            Hoàn thành không cần ảnh (Giám đốc, hệ thống sẽ ghi lại)
          </button>
        )}
      </div>
    </div>
  );
}
