import React, { useEffect, useState } from 'react';
import { Badge } from '../components/feedback/Badge';
import { Button } from '../components/forms/Button';
import { Input } from '../components/forms/Input';
import { CameraCapture } from '../components/CameraCapture';
import { IncidentReportModal } from '../components/IncidentReportModal';
import { ActionChip } from '../components/ActionChip';
import { OrderDetailModal } from '../components/OrderDetailModal';
import { fetchOrders, updateOrder, uploadPhoto, fetchShopSettings } from '../lib/queries';
import { useAuth } from '../lib/AuthContext';
import { enqueue } from '../lib/offlineQueue';
import { getCurrentPosition, haversineKm, estimateTrip } from '../lib/geo';
import { supabase } from '../lib/supabaseClient';

function Thumb({ url, label }) {
  if (!url) return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'center' }}>
      <img src={url} alt={label} style={{ width: 56, height: 56, borderRadius: 'var(--radius-sm)', objectFit: 'cover' }} />
      <span style={{ font: 'var(--text-caption)', color: 'var(--text-muted)' }}>{label}</span>
    </div>
  );
}

function formatDuration(fromIso, toIso) {
  if (!fromIso || !toIso) return null;
  const ms = new Date(toIso).getTime() - new Date(fromIso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return null;
  const minutes = Math.round(ms / 60000);
  if (minutes < 60) return `${minutes} phút`;
  const hours = Math.floor(minutes / 60);
  const rem = minutes % 60;
  return rem ? `${hours} giờ ${rem} phút` : `${hours} giờ`;
}

function isLate(order) {
  if (!order.delivery_date || !/^\d{2}:\d{2}$/.test(order.delivery_time || '')) return false;
  const scheduled = new Date(`${order.delivery_date}T${order.delivery_time}:00+07:00`);
  if (Number.isNaN(scheduled.getTime())) return false;
  return new Date() > scheduled;
}

function LateReasonPrompt({ onCancel, onConfirm, busy }) {
  const [reason, setReason] = useState('');
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'var(--surface-overlay)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60 }} onClick={onCancel}>
      <div style={{ background: 'var(--surface-card)', borderRadius: 'var(--radius-lg)', width: 340, padding: 20, boxShadow: 'var(--shadow-lg)', display: 'flex', flexDirection: 'column', gap: 12 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ font: 'var(--text-title)', color: 'var(--text-primary)' }}>Đơn này đang giao trễ — lý do?</div>
        <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-muted)' }}>Bắt buộc nhập lý do trước khi xác nhận hoàn thành.</div>
        <Input label="Lý do giao trễ" placeholder="VD: Kẹt xe, chờ khách, khách đổi địa chỉ..." value={reason} onChange={(e) => setReason(e.target.value)} />
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <Button variant="secondary" size="sm" onClick={onCancel} disabled={busy}>Huỷ</Button>
          <Button variant="warning" size="sm" onClick={() => onConfirm(reason)} disabled={busy || !reason.trim()}>{busy ? 'Đang lưu...' : 'Xác nhận hoàn thành'}</Button>
        </div>
      </div>
    </div>
  );
}

function DeliveryCard({ order, onPickup, onComplete, onSignedDoc, canAct, shopSettings }) {
  const [busy, setBusy] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [showSignedDocCamera, setShowSignedDocCamera] = useState(false);
  const [pendingComplete, setPendingComplete] = useState(null);
  const [showIncident, setShowIncident] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const itemSummary = (order.order_items || []).map((it) => it.name).join(', ') || 'Không có sản phẩm';
  const packageCount = (order.order_items || []).reduce((s, it) => s + (Number(it.qty) || 0), 0);

  const handlePickupPhoto = async (blob) => {
    setShowCamera(false);
    setBusy(true);
    try {
      const photoUrl = await uploadPhoto(blob, 'pickup');
      const pos = await getCurrentPosition();
      await onPickup(order, photoUrl, pos);
    } finally {
      setBusy(false);
    }
  };

  const handleCompletePhoto = async (blob) => {
    setShowCamera(false);
    setBusy(true);
    try {
      const photoUrl = await uploadPhoto(blob, 'delivered');
      const pos = await getCurrentPosition();
      if (isLate(order)) {
        setPendingComplete({ photoUrl, pos });
      } else {
        await onComplete(order, photoUrl, pos, null);
      }
    } finally {
      setBusy(false);
    }
  };

  const confirmLateComplete = async (reason) => {
    setBusy(true);
    try {
      await onComplete(order, pendingComplete?.photoUrl || null, pendingComplete?.pos || null, reason);
      setPendingComplete(null);
    } finally {
      setBusy(false);
    }
  };

  const handleSignedDocPhoto = async (blob) => {
    setShowSignedDocCamera(false);
    setBusy(true);
    try {
      const photoUrl = await uploadPhoto(blob, 'signed_doc');
      await onSignedDoc(order, photoUrl);
    } finally {
      setBusy(false);
    }
  };

  const skipPhoto = async () => {
    setBusy(true);
    try {
      if (order.status === 'cho_giao') {
        await onPickup(order, null, null);
      } else if (isLate(order)) {
        setPendingComplete({ photoUrl: null, pos: null });
      } else {
        await onComplete(order, null, null, null);
      }
    } finally {
      setBusy(false);
    }
  };

  const trip = order.delivery_lat != null && shopSettings?.shop_lat != null
    ? estimateTrip(haversineKm(shopSettings.shop_lat, shopSettings.shop_lng, order.delivery_lat, order.delivery_lng), shopSettings.avg_speed_kmh, shopSettings.gas_price_per_km)
    : null;

  return (
    <div onClick={() => setShowDetail(true)} style={{ background: 'var(--surface-card)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-sm)', padding: 14, display: 'flex', flexDirection: 'column', gap: 8, cursor: 'pointer' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ font: 'var(--text-label)', color: 'var(--text-primary)' }}>Tên khách hàng: {order.customer?.name || 'Khách lẻ'}</div>
            {order.order_code && <Badge tone="neutral">{order.order_code}</Badge>}
          </div>
          {showDetail && <OrderDetailModal order={order} onClose={() => setShowDetail(false)} />}
          <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-secondary)' }}>Sản phẩm: {itemSummary}</div>
          <div style={{ font: 'var(--text-caption)', color: 'var(--text-muted)' }}>📦 Số kiện hàng: {packageCount}</div>
          {order.delivery_method === 'lay_tai_xuong' ? (
            <div style={{ font: 'var(--text-caption)', color: 'var(--text-muted)' }}>🏠 Khách tự đến lấy tại xưởng</div>
          ) : (
            <div style={{ font: 'var(--text-caption)', color: 'var(--text-muted)' }}>Địa chỉ: {order.address || '—'}</div>
          )}
          <div style={{ font: 'var(--text-caption)', color: 'var(--text-muted)' }}>Thời gian giao: {order.delivery_time || '—'}</div>
          {order.shipper_staff_name && <div style={{ font: 'var(--text-caption)', color: 'var(--text-muted)' }}>🚚 Người giao: {order.shipper_staff_name}</div>}
        </div>
        {order.flagged && <Badge tone="danger">⚠ Cần Lưu Ý</Badge>}
      </div>

      <div onClick={(e) => e.stopPropagation()} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {order.status === 'cho_giao' && (
          <React.Fragment>
            <Badge tone="neutral" style={{ alignSelf: 'flex-start' }}>Chờ xuất bến</Badge>
            <Button variant="primary" size="sm" icon="📷" disabled={busy || !canAct} onClick={() => setShowCamera(true)}>{busy ? 'Đang xử lý...' : 'Chụp xuất bến & Nhận giao'}</Button>
            {navigator.onLine === false && <Button variant="ghost" size="sm" onClick={skipPhoto} disabled={busy || !canAct}>Mất mạng — bỏ qua ảnh, nhận giao luôn</Button>}
          </React.Fragment>
        )}

        {order.status === 'dang_giao' && (
          <React.Fragment>
            <Badge tone={isLate(order) ? 'danger' : 'warning'} style={{ alignSelf: 'flex-start' }}>
              {isLate(order) ? '⚠ Đang trễ giờ giao' : order.delivery_method === 'lay_tai_xuong' ? 'Chờ khách đến lấy' : 'Đang giao'}
            </Badge>
            <Button variant="primary" size="sm" icon="📷" disabled={busy || !canAct} onClick={() => setShowCamera(true)}>
              {busy ? 'Đang xử lý...' : order.delivery_method === 'lay_tai_xuong' ? 'Chụp đến nơi & Xác nhận khách đã lấy' : 'Chụp đến nơi & Hoàn thành'}
            </Button>
            {order.delivery_method !== 'lay_tai_xuong' && (
              <Button variant="secondary" size="sm" icon="📝" disabled={busy || !canAct} onClick={() => setShowSignedDocCamera(true)}>
                {order.signed_doc_photo_url ? 'Chụp lại Biên Bản Ký Giấy' : 'Chụp Biên Bản Ký Giấy'}
              </Button>
            )}
            {navigator.onLine === false && <Button variant="ghost" size="sm" onClick={skipPhoto} disabled={busy || !canAct}>Mất mạng — bỏ qua ảnh, hoàn thành luôn</Button>}
          </React.Fragment>
        )}

        {order.status === 'hoan_thanh' && (
          <React.Fragment>
            <Badge tone={order.pendingSync ? 'neutral' : 'success'} style={{ alignSelf: 'flex-start' }}>
              {order.pendingSync ? 'Đã hoàn thành (chờ đồng bộ)' : 'Đơn giao hoàn thành'}
            </Badge>
            {order.late_reason && (
              <div style={{ font: 'var(--text-caption)', color: 'var(--status-danger)', background: 'var(--status-danger-soft)', borderRadius: 'var(--radius-sm)', padding: '6px 8px' }}>
                ⚠ Giao trễ — lý do: {order.late_reason}
              </div>
            )}
            {formatDuration(order.created_at, order.completed_at) && (
              <div style={{ font: 'var(--text-caption)', color: 'var(--text-muted)' }}>⏱ Thời gian xử lý: {formatDuration(order.created_at, order.completed_at)}</div>
            )}
            {trip && (
              <div style={{ font: 'var(--text-caption)', color: 'var(--text-muted)' }}>
                📍 Khoảng cách tiệm↔điểm giao: {trip.distanceKm.toFixed(1)}km (đi+về {trip.roundTripKm.toFixed(1)}km) · ~{trip.roundTripMinutes} phút đi về · Xăng ước tính: {trip.gasCost.toLocaleString('vi-VN')}đ
              </div>
            )}
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <Thumb url={order.kitchen_photo_url} label="Bếp làm xong" />
              <Thumb url={order.pickup_photo_url} label="Lúc xuất bến" />
              <Thumb url={order.delivery_photo_url} label="Lúc đến nơi" />
              <Thumb url={order.signed_doc_photo_url} label="Biên bản ký giấy" />
            </div>
          </React.Fragment>
        )}

        {!canAct && order.status !== 'hoan_thanh' && <div style={{ font: 'var(--text-caption)', color: 'var(--text-muted)' }}>Chỉ Vận chuyển hoặc Chủ sở hữu mới thao tác được ở đây.</div>}
        <ActionChip icon="⚠" label="Báo sự cố" tone="danger" onClick={() => setShowIncident(true)} />
        {showCamera && <CameraCapture onClose={() => setShowCamera(false)} onCapture={order.status === 'cho_giao' ? handlePickupPhoto : handleCompletePhoto} />}
        {showSignedDocCamera && <CameraCapture onClose={() => setShowSignedDocCamera(false)} onCapture={handleSignedDocPhoto} />}
        {pendingComplete && <LateReasonPrompt busy={busy} onCancel={() => setPendingComplete(null)} onConfirm={confirmLateComplete} />}
        {showIncident && (
          <IncidentReportModal
            orderId={order.id}
            orderCode={order.order_code}
            onClose={() => setShowIncident(false)}
            onSent={() => setShowIncident(false)}
          />
        )}
      </div>
    </div>
  );
}

export default function ShippingScreen() {
  const { profile } = useAuth();
  const canAct = profile?.role === 'shipper' || profile?.role === 'owner';
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [shopSettings, setShopSettings] = useState(null);

  const load = () => {
    setLoading(true);
    fetchOrders({ statuses: ['cho_giao', 'dang_giao', 'hoan_thanh'] })
      .then((data) => { setOrders(data); setError(''); })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);
  useEffect(() => { fetchShopSettings().then(setShopSettings).catch(() => {}); }, []);

  useEffect(() => {
    const channel = supabase
      .channel('shipping-orders-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, load)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const applyFields = (order, fields) => {
    if (!navigator.onLine) {
      enqueue('updateOrder', { id: order.id, fields });
      setOrders((prev) => prev.map((o) => (o.id === order.id ? { ...o, ...fields, pendingSync: true } : o)));
      return;
    }
    updateOrder(order.id, fields)
      .then(load)
      .catch(() => {
        enqueue('updateOrder', { id: order.id, fields });
        setOrders((prev) => prev.map((o) => (o.id === order.id ? { ...o, ...fields, pendingSync: true } : o)));
      });
  };

  const handlePickup = async (order, photoUrl, pos) => {
    const fields = { status: 'dang_giao', shipper_staff_name: profile?.full_name || null };
    if (photoUrl) fields.pickup_photo_url = photoUrl;
    if (pos) { fields.pickup_lat = pos.lat; fields.pickup_lng = pos.lng; }
    applyFields(order, fields);
  };

  const handleComplete = async (order, photoUrl, pos, lateReason) => {
    const fields = { status: 'hoan_thanh', completed_at: new Date().toISOString() };
    if (photoUrl) fields.delivery_photo_url = photoUrl;
    if (pos) { fields.delivery_lat = pos.lat; fields.delivery_lng = pos.lng; }
    if (lateReason) fields.late_reason = lateReason;
    applyFields(order, fields);
  };

  const handleSignedDoc = async (order, photoUrl) => {
    applyFields(order, { signed_doc_photo_url: photoUrl });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <div style={{ font: 'var(--text-display-md)', color: 'var(--text-primary)' }}>Vận Chuyển</div>
        <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-muted)' }}>Nhận giao &amp; giao hàng từ Bếp KDS chuyển sang</div>
      </div>
      {error && <div style={{ font: 'var(--text-body-sm)', color: 'var(--status-danger)' }}>Lỗi tải đơn: {error}</div>}
      {loading ? (
        <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-muted)' }}>Đang tải...</div>
      ) : orders.length === 0 ? (
        <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-muted)' }}>Chưa có đơn nào cần giao.</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(260px,1fr))', gap: 12 }}>
          {orders.map((o) => <DeliveryCard key={o.id} order={o} onPickup={handlePickup} onComplete={handleComplete} onSignedDoc={handleSignedDoc} canAct={canAct} shopSettings={shopSettings} />)}
        </div>
      )}
    </div>
  );
}
