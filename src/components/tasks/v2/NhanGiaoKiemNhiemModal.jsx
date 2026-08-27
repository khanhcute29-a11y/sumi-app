import React, { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import { CameraPhotoField } from '../../CameraPhotoField';
import { getCurrentPositionSmart } from '../../../lib/geo';

// "Nhận giao kiêm nhiệm" — mockup task-lifecycle-v2-approved, thẻ xanh
// "Ai rảnh nhận" trong tab Chờ nhận của nhân viên.
//
// ⚠️ KHÔNG viết đường ghi dữ liệu mới. Gọi thẳng
// `accept_delivery_assignment_flexible` — RPC đã có sẵn và đang chạy thật
// cho toàn bộ luồng giao hàng kiêm nhiệm (từ trước khi có bản Việc V2 này).
// Nếu tạo thêm bảng/RPC riêng ở đây, tiệm sẽ có HAI nơi ghi nhận giao hàng
// khác nhau — đúng rủi ro anh Nghĩa đã chọn tránh khi duyệt hướng đi.
export default function NhanGiaoKiemNhiemModal({ don, hoSo, onClose, onXong }) {
  const [photoUrl, setPhotoUrl] = useState('');
  const [gpsCoords, setGpsCoords] = useState(null);
  const [dangLayGps, setDangLayGps] = useState(false);
  const [dangGui, setDangGui] = useState(false);
  const [loi, setLoi] = useState('');

  const layGps = async () => {
    if (!navigator.geolocation) { setLoi('Trình duyệt không hỗ trợ GPS.'); return; }
    setDangLayGps(true); setLoi('');
    const pos = await getCurrentPositionSmart();
    if (pos) { setGpsCoords(pos); setDangLayGps(false); }
    else { setLoi('Không lấy được GPS. Bấm để thử lại.'); setDangLayGps(false); }
  };

  // Tải trước GPS ngay khi mở modal "Nhận giao" — nhân viên không cần tự bấm
  // lấy vị trí, lúc bấm "Nhận" đã sẵn toạ độ.
  useEffect(() => { layGps(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const nhan = async () => {
    if (!gpsCoords) { setLoi('Lấy vị trí GPS trước đã.'); return; }
    if (!photoUrl) { setLoi('Chụp ảnh nhận bánh tại kho trước đã.'); return; }
    setDangGui(true); setLoi('');
    try {
      const { data, error } = await supabase.rpc('accept_delivery_assignment_flexible', {
        p_order_id: don.id,
        p_assigned_staff_id: hoSo?.id,
        p_assigned_staff_name: hoSo?.full_name || 'Nhân viên',
        p_gps_latitude: gpsCoords.lat,
        p_gps_longitude: gpsCoords.lng,
        p_photo_url: photoUrl,
      });
      if (error) throw error;
      // RPC này là bản cũ, có sẵn từ trước — thất bại trả về { success:false,
      // error: '...' }, KHÔNG phải { message: '...' } như quy ước các RPC
      // tôi viết sau này. Đọc đúng field, không đoán.
      if (data && data.success === false) throw new Error(data.error || 'Không nhận được đơn.');
      await onXong?.();
    } catch (e) {
      setLoi(e?.message || 'Không nhận được đơn. Thử lại giúp tôi.');
    } finally {
      setDangGui(false);
    }
  };

  return (
    <div className="cv-wrap" onClick={() => !dangGui && onClose?.()} style={{
      position: 'fixed', inset: 0, zIndex: 120, background: 'rgba(0,0,0,0.5)',
      display: 'flex', justifyContent: 'center', alignItems: 'flex-end',
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        width: '100%', maxWidth: 600, background: '#FAF6F0',
        borderRadius: '20px 20px 0 0', padding: 20,
        paddingBottom: 'calc(20px + env(safe-area-inset-bottom))',
        maxHeight: '92dvh', overflowY: 'auto',
      }}>
        <h3 style={{ margin: '0 0 6px', fontSize: 18, fontWeight: 900 }}>🛵 Nhận giao đơn {don.order_code}</h3>
        <p style={{ margin: '0 0 14px', fontSize: 13, color: 'var(--cv-muted)', lineHeight: 1.5 }}>
          Bấm nhận là bạn nhận trách nhiệm giao đơn này cho khách. Bắt buộc chụp ảnh nhận bánh tại
          kho và xác nhận vị trí trước khi bắt đầu.
        </p>

        {don.address && (
          <div style={{
            marginBottom: 14, padding: '10px 12px', borderRadius: 12,
            background: '#fff', border: '1px solid var(--cv-border)', fontSize: 13,
          }}>
            📍 Giao tới: <b>{don.address}</b>
            {don.required_at && (
              <div style={{ marginTop: 4, color: 'var(--cv-muted)' }}>
                Khách hẹn: {new Date(don.required_at).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })}
              </div>
            )}
          </div>
        )}

        <label style={{ display: 'block', fontWeight: 800, fontSize: 13, marginBottom: 6 }}>
          📷 Ảnh nhận bánh tại kho <span style={{ color: '#d03027' }}>*</span>
        </label>
        <CameraPhotoField url={photoUrl} onChange={setPhotoUrl} label="" prefix="delivery-claim" />

        <div style={{ marginTop: 14 }}>
          <label style={{ display: 'block', fontWeight: 800, fontSize: 13, marginBottom: 6 }}>
            📍 Vị trí GPS lúc nhận <span style={{ color: '#d03027' }}>*</span>
          </label>
          <button
            type="button"
            onClick={layGps}
            disabled={dangLayGps}
            style={{
              width: '100%', minHeight: 48, borderRadius: 12, cursor: dangLayGps ? 'not-allowed' : 'pointer',
              border: gpsCoords ? '1.5px solid var(--cv-success)' : '1px solid var(--cv-border)',
              background: gpsCoords ? '#e6f4ea' : '#fff',
              color: gpsCoords ? '#1e7e4c' : 'var(--cv-text)', fontWeight: 800, fontSize: 13,
            }}
          >
            {dangLayGps ? 'Đang lấy vị trí…' : gpsCoords ? `✓ Đã lấy vị trí (${gpsCoords.lat.toFixed(5)}, ${gpsCoords.lng.toFixed(5)})` : '▶ Lấy vị trí hiện tại'}
          </button>
        </div>

        {loi && <div className="cv-error" style={{ marginTop: 12 }}>⚠️ {loi}</div>}

        <div className="cv-actions" style={{ marginTop: 16 }}>
          <button className="cv-btn outline" onClick={onClose} disabled={dangGui}>Huỷ</button>
          <button className="cv-btn success" disabled={dangGui || !photoUrl || !gpsCoords} onClick={nhan}>
            {dangGui ? 'Đang gửi…' : '✓ Nhận giao ngay'}
          </button>
        </div>
      </div>
    </div>
  );
}
