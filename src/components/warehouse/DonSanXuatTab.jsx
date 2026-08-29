import React, { useCallback, useEffect, useState } from 'react';
import { fetchInternalOrders } from '../../lib/internalOrders';
import CreateInternalOrderModal from './CreateInternalOrderModal';
import OrderV2DetailModal from '../OrderV2DetailModal';

// "Đơn sản xuất" — lịch sử đơn hàng nội bộ, đặt trong Kho Thành Phẩm theo
// đúng yêu cầu. Khoan sâu dùng lại NGUYÊN OrderV2DetailModal (đã có sẵn thả
// tim/chỉnh sửa/khoan sâu bếp) — không dựng màn chi tiết riêng.

const STATUS_LABEL = {
  awaiting_assignment: '⏳ Chờ bếp nhận',
  awaiting_acceptance: '⏳ Chờ bếp nhận',
  in_production: '👩‍🍳 Đang sản xuất',
  ready_for_fulfillment: '🚚 Chờ giao/lấy',
  in_delivery: '🛵 Đang giao',
  completed: '✅ Hoàn thành',
};

export default function DonSanXuatTab() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    fetchInternalOrders()
      .then((rows) => { setOrders(rows); setError(''); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <button onClick={() => setShowCreate(true)} style={{ minHeight: 54, border: 0, borderRadius: 16, background: '#f05c2b', color: '#fff', fontWeight: 950, fontSize: 15, cursor: 'pointer' }}>
        📦 + Tạo Đơn Hàng Nội Bộ
      </button>

      {error && <div style={{ color: '#d94a40', fontWeight: 700 }}>⚠️ {error}</div>}
      {loading ? (
        <div style={{ color: '#806a58', textAlign: 'center', padding: 20 }}>Đang tải...</div>
      ) : orders.length === 0 ? (
        <div style={{ color: '#806a58', textAlign: 'center', padding: 20 }}>Chưa có đơn hàng nội bộ nào.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {orders.map((o) => (
            <button key={o.id} onClick={() => setSelectedOrderId(o.id)} style={{
              display: 'block', textAlign: 'left', font: 'inherit', cursor: 'pointer',
              padding: 12, border: '1px solid #e2cdb6', borderRadius: 16, background: '#fff',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <div>
                  <div style={{ fontWeight: 900, fontSize: 14 }}>{o.order_code}</div>
                  <div style={{ fontSize: 12, color: '#806a58', fontWeight: 700, marginTop: 2 }}>
                    {o.created_by_name || 'Không rõ'} · {new Date(o.created_at).toLocaleString('vi-VN')}
                  </div>
                  {o.target_store && <div style={{ fontSize: 11.5, color: '#9a7f68', marginTop: 2 }}>🏬 {o.target_store}</div>}
                </div>
                <span style={{ flexShrink: 0, height: 'fit-content', padding: '4px 10px', borderRadius: 999, fontSize: 11, fontWeight: 900, background: '#f4eadc', color: '#7d420c' }}>
                  {STATUS_LABEL[o.status_v2] || o.status_v2 || '—'}
                </span>
              </div>
              {o.required_at && (
                <div style={{ fontSize: 11.5, color: '#9a7f68', marginTop: 6 }}>
                  🕒 Yêu cầu xong: {new Date(o.required_at).toLocaleString('vi-VN')}
                </div>
              )}
            </button>
          ))}
        </div>
      )}

      {showCreate && (
        <CreateInternalOrderModal onClose={() => setShowCreate(false)} onCreated={load} />
      )}

      {selectedOrderId && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 300 }}>
          <OrderV2DetailModal orderId={selectedOrderId} onClose={() => { setSelectedOrderId(null); load(); }} onChanged={load} />
        </div>
      )}
    </div>
  );
}
