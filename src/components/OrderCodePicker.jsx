import React, { useEffect, useRef, useState } from 'react';
import { searchOrdersForPicker, fetchRecentOpenOrdersForPicker } from '../lib/queries';

const NHAN_TRANG_THAI = {
  awaiting_assignment: 'Chưa phân bếp', awaiting_acceptance: 'Bếp chưa nhận',
  in_production: 'Bếp đang làm', ready_for_fulfillment: 'Chờ vận chuyển',
  in_delivery: 'Đang vận chuyển', completed: 'Đã xong', cancelled: 'Đã huỷ',
};

// Ô "Mã đơn liên quan" dùng chung — thay cho gõ tay tự do (mã đơn tự sinh,
// nhiều đơn nên rất khó nhớ chính xác). Gõ mã đơn / tên khách / SĐT là hiện
// dropdown gợi ý kèm khách/bánh/địa chỉ để chọn đúng đơn, đỡ phải tra lại ở
// màn khác rồi gõ tay. Bấm vào ô mà CHƯA gõ gì cũng hiện sẵn vài đơn GẦN ĐÂY
// & CHƯA XONG (đúng nhu cầu thật: đa số việc phát sinh gắn với đơn đang chạy,
// không phải đơn đã xong từ lâu) — đỡ phải gõ mù trước khi thấy gợi ý.
// Vẫn cho gõ tự do bình thường (field này ở mọi nơi đang dùng đều KHÔNG bắt
// buộc), không ép phải chọn từ danh sách.
export function OrderCodePicker({ label, placeholder = 'Gõ mã đơn, tên khách hoặc SĐT…', value, onChange, style }) {
  const [open, setOpen] = useState(false);
  const [ketQua, setKetQua] = useState([]);
  const [ganDay, setGanDay] = useState(null); // null = chưa tải, [] = tải rồi mà rỗng
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

  // Danh sách mặc định — chỉ tải MỘT LẦN lúc mở dropdown lần đầu (không tải
  // sẵn lúc mount cả form, tránh gọi Supabase cho những form/ô người dùng
  // không bao giờ đụng tới), rồi giữ trong state để mở lại không gọi lại.
  const taiGanDay = () => {
    if (ganDay !== null) return;
    fetchRecentOpenOrdersForPicker().then(setGanDay).catch(() => setGanDay([]));
  };

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

  const dongTruong = (row) => (
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
        {row.status_v2 && (
          <span style={{
            marginLeft: 'auto', flexShrink: 0, fontSize: 10.5, fontWeight: 800, padding: '2px 7px',
            borderRadius: 99, background: row.status_v2 === 'completed' ? '#e7f7ef' : '#fff2ce',
            color: row.status_v2 === 'completed' ? '#0b9462' : '#8a5a00',
          }}>
            {NHAN_TRANG_THAI[row.status_v2] || row.status_v2}
          </span>
        )}
      </div>
      {(row.customer_phone || row.product_names) && (
        <div style={{ fontSize: 12, color: '#8a7a66', marginTop: 2 }}>
          {row.customer_phone && <>📞 {row.customer_phone}{row.product_names ? ' · ' : ''}</>}
          {row.product_names && <>🍰 {row.product_names}</>}
        </div>
      )}
      {row.address && <div style={{ fontSize: 12, color: '#8a7a66', marginTop: 1 }}>📍 {row.address}</div>}
    </button>
  );

  const dangGoTim = (value || '').trim().length >= 2;
  const hienDsGanDay = !dangGoTim && open;

  return (
    <div ref={wrapRef} style={{ position: 'relative', width: '100%', ...style }}>
      {label && <label style={{ display: 'block', fontWeight: 700, fontSize: 13, marginBottom: 4, color: 'var(--text-primary, #2d1c10)' }}>{label}</label>}
      <input
        value={value || ''}
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => { setOpen(true); taiGanDay(); }}
        placeholder={placeholder}
        style={{
          width: '100%', minHeight: 44, padding: '0 12px', borderRadius: 10,
          border: '1px solid var(--border-default, #eadcca)', fontSize: 14, fontFamily: 'inherit', boxSizing: 'border-box',
        }}
      />
      {open && (dangGoTim || hienDsGanDay) && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 30, marginTop: 4,
          background: '#fff', border: '1px solid var(--border-default, #eadcca)', borderRadius: 12,
          maxHeight: 280, overflowY: 'auto', boxShadow: '0 8px 24px rgba(0,0,0,.15)',
        }}>
          {dangGoTim ? (
            <>
              {dangTim && <div style={{ padding: '10px 12px', fontSize: 12.5, color: '#8a7a66' }}>Đang tìm...</div>}
              {!dangTim && ketQua.length === 0 && (
                <div style={{ padding: '10px 12px', fontSize: 12.5, color: '#8a7a66' }}>Không tìm thấy đơn nào khớp — vẫn dùng được mã bạn vừa gõ.</div>
              )}
              {ketQua.map(dongTruong)}
            </>
          ) : (
            <>
              <div style={{ padding: '8px 12px 4px', fontSize: 11, fontWeight: 800, color: '#a08a72', textTransform: 'uppercase' }}>
                Gần đây · chưa xong
              </div>
              {ganDay === null && <div style={{ padding: '4px 12px 10px', fontSize: 12.5, color: '#8a7a66' }}>Đang tải...</div>}
              {ganDay?.length === 0 && (
                <div style={{ padding: '4px 12px 10px', fontSize: 12.5, color: '#8a7a66' }}>Không có đơn nào đang chạy — gõ để tìm đơn khác.</div>
              )}
              {ganDay?.map(dongTruong)}
            </>
          )}
        </div>
      )}
    </div>
  );
}
