import React, { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import NhanGiaoKiemNhiemModal from './NhanGiaoKiemNhiemModal';

// Thẻ "Đơn Bakery cần giao ngay — Ai rảnh nhận" — mockup task-lifecycle-v2.
//
// Đọc thẳng `orders.status_v2 = 'ready_for_fulfillment'`. KHÔNG cần lọc thêm
// "đã có ai nhận chưa": ngay khi một người bấm nhận, RPC
// `accept_delivery_assignment_flexible` đổi status_v2 sang 'in_delivery'
// NGAY LẬP TỨC — đơn tự rớt khỏi danh sách này, không cần dò thêm bảng
// delivery_stops.
export default function DonKiemNhiem({ hoSo, onDaNhan }) {
  const [ds, setDs] = useState([]);
  const [dangTai, setDangTai] = useState(true);
  const [dangXem, setDangXem] = useState(null);

  const tai = useCallback(async () => {
    setDangTai(true);
    try {
      const { data, error } = await supabase
        .from('order_operations_list')
        .select('id,order_code,address,required_at,status_v2')
        .eq('status_v2', 'ready_for_fulfillment')
        .order('required_at', { ascending: true })
        .limit(10);
      if (error) throw error;
      setDs(data || []);
    } catch {
      // Mục phụ trong tab Chờ nhận — lỗi ở đây không được làm hỏng cả tab.
      setDs([]);
    } finally {
      setDangTai(false);
    }
  }, []);

  useEffect(() => { tai(); }, [tai]);

  if (dangTai || ds.length === 0) return null;

  return (
    <>
      <div className="cv-divider"><span>🛵 Đơn cần giao — ai rảnh nhận</span></div>
      <div className="cv-list">
        {ds.map((don) => (
          <div className="cv-card" key={don.id} style={{ borderColor: 'var(--cv-success)', background: '#f4fff8' }}>
            <h3 className="cv-title" style={{ marginTop: 0 }}>Giao đơn {don.order_code} cho khách</h3>
            <div className="cv-meta">
              <span className="cv-meta-item">📦 Bếp đã hoàn thành, đang chờ giao</span>
              {don.required_at && (
                <span className="cv-meta-item">
                  🕒 Khách hẹn: {new Date(don.required_at).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })}
                </span>
              )}
            </div>
            <div style={{
              marginTop: 10, padding: '9px 12px', borderRadius: 12,
              background: '#fff', color: '#315c48', fontSize: 12, fontWeight: 700, lineHeight: 1.4,
            }}>
              💡 Bất kỳ ai rảnh đều nhận được — không cần chờ vận tải. Bấm nhận sẽ tạo việc
              phát sinh để tính KPI, bắt buộc ảnh nhận bánh + GPS.
            </div>
            <button className="cv-btn success full" style={{ marginTop: 10 }} onClick={() => setDangXem(don)}>
              🛵 Nhận giao ngay
            </button>
          </div>
        ))}
      </div>

      {dangXem && (
        <NhanGiaoKiemNhiemModal
          don={dangXem}
          hoSo={hoSo}
          onClose={() => setDangXem(null)}
          onXong={async () => { setDangXem(null); await tai(); await onDaNhan?.(); }}
        />
      )}
    </>
  );
}
