import React, { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import NhanGiaoKiemNhiemModal from './NhanGiaoKiemNhiemModal';
import { showToast } from '../../../lib/toast';

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
  // Trước đây khối này LUÔN xổ hết đơn ra, nằm ngay trên cùng — đẩy "Việc
  // được giao"/"Việc phát sinh" xuống dưới, phải cuộn mới thấy. Giờ gom
  // thành 1 khối thu gọn, mặc định ĐÓNG (chỉ hiện tổng số), bấm vào mới xổ
  // đủ danh sách — đơn vẫn sắp theo required_at tăng dần như cũ.
  const [mo, setMo] = useState(false);

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

  // Nhiều người có thể cùng mở tab Chờ nhận một lúc. Ngay khi ai đó bấm nhận
  // (đơn đổi status_v2 -> 'in_delivery'), đơn phải BIẾN NGAY khỏi màn hình
  // của người khác — không đợi họ tự tải lại — để giảm cảnh hai người cùng
  // nhắm một đơn. Kênh riêng, không đụng các kênh 'orders-*' của màn Đơn hàng.
  useEffect(() => {
    const kenh = supabase.channel('viec-don-kiem-nhiem')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => tai())
      .subscribe();
    return () => { supabase.removeChannel(kenh); };
  }, [tai]);

  if (dangTai || ds.length === 0) return null;

  return (
    <>
      <button
        onClick={() => setMo((v) => !v)}
        aria-expanded={mo}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
          width: '100%', minHeight: 48, padding: '10px 14px', marginBottom: mo ? 8 : 14,
          borderRadius: 14, border: '1.5px solid var(--cv-success)', background: '#f4fff8',
          cursor: 'pointer', font: 'inherit', textAlign: 'left',
        }}
      >
        <span style={{ fontWeight: 800, color: '#315c48' }}>🛵 Đơn cần giao — ai rảnh nhận</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ minWidth: 26, textAlign: 'center', padding: '2px 8px', borderRadius: 999, background: 'var(--cv-success)', color: '#fff', fontWeight: 800, fontSize: 13 }}>
            {ds.length}
          </span>
          <span style={{ color: '#315c48' }}>{mo ? '▴' : '▾'}</span>
        </span>
      </button>
      {mo && (
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
      )}

      {dangXem && (
        <NhanGiaoKiemNhiemModal
          don={dangXem}
          hoSo={hoSo}
          onClose={() => setDangXem(null)}
          onOptimisticAccept={() => {
            setDs((prev) => prev.filter((x) => x.id !== dangXem.id));
            setDangXem(null);
          }}
          onAcceptFailed={(don, msg) => {
            setDs((prev) => (prev.some((x) => x.id === don.id) ? prev : [don, ...prev]));
            showToast({ icon: '⚠️', title: 'Không nhận được đơn', message: `${don.order_code} — ${msg}`, tone: 'warning' });
          }}
          onXong={async () => { await tai(); await onDaNhan?.(); }}
        />
      )}
    </>
  );
}
