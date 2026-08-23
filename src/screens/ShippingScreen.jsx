import React, { useEffect, useState } from 'react';
import { Badge } from '../components/feedback/Badge';
import { Button } from '../components/forms/Button';
import { Input } from '../components/forms/Input';
import { VoiceMicButton } from '../components/VoiceMicButton';
import { CameraCapture } from '../components/CameraCapture';
import { IncidentReportModal } from '../components/IncidentReportModal';
import { ActionChip } from '../components/ActionChip';
import { OrderDetailModal } from '../components/OrderDetailModal';
import { fetchOrders, updateOrder, uploadPhoto, fetchShopSettings, createAdhocTask, deductFinishedGoodsStockForOrder } from '../lib/queries';
import { useAuth } from '../lib/AuthContext';
import { hasAnyRole } from '../lib/roles';
import { enqueue } from '../lib/offlineQueue';
import { getCurrentPosition, haversineKm, estimateTrip } from '../lib/geo';
import { IconOrders, IconHome, IconTruck, IconWarning, IconCamera, IconEdit, IconMapPin, IconClock, IconPhone, IconClipboard, IconMoney } from '../components/icons/FrogIcons';
import { supabase } from '../lib/supabaseClient';
import { formatOrderItemLine } from '../lib/cakePricing';
import { formatDeliveryDateTime } from '../lib/date';

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
    <div style={{ position: 'fixed', inset: 0, background: 'var(--surface-overlay)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60, padding: 16 }} onClick={onCancel}>
      <div style={{ background: 'var(--surface-card)', borderRadius: 'var(--radius-lg)', width: 340, maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto', padding: 20, boxShadow: 'var(--shadow-lg)', display: 'flex', flexDirection: 'column', gap: 12 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ font: 'var(--text-title)', color: 'var(--text-primary)' }}>Đơn này đang giao trễ — lý do?</div>
        <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-muted)' }}>Bắt buộc nhập lý do trước khi xác nhận hoàn thành.</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
          <Input label="Lý do giao trễ" placeholder="VD: Kẹt xe, chờ khách, khách đổi địa chỉ..." value={reason} onChange={(e) => setReason(e.target.value)} style={{ flex: '1 1 auto', minWidth: 0 }} />
          <VoiceMicButton onTranscript={setReason} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <Button variant="secondary" size="sm" onClick={onCancel} disabled={busy}>Huỷ</Button>
          <Button variant="warning" size="sm" onClick={() => onConfirm(reason)} disabled={busy || !reason.trim()}>{busy ? 'Đang lưu...' : 'Xác nhận hoàn thành'}</Button>
        </div>
      </div>
    </div>
  );
}

function DeliveryCard({ order, onPickup, onComplete, onSignedDoc, isDedicatedShipper, profile, shopSettings }) {
  const [busy, setBusy] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [showSignedDocCamera, setShowSignedDocCamera] = useState(false);
  const [pendingComplete, setPendingComplete] = useState(null);
  const [showIncident, setShowIncident] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const [phoneVerified, setPhoneVerified] = useState(false);
  const [phoneInput, setPhoneInput] = useState('');
  const [phoneError, setPhoneError] = useState('');
  const claimedByMe = !!order.shipper_staff_name && order.shipper_staff_name === profile?.full_name;
  const canAct = isDedicatedShipper || claimedByMe || (order.status === 'cho_giao' && phoneVerified);
  const canSelfClaim = !isDedicatedShipper && !claimedByMe && order.status === 'cho_giao';
  // Xác thực 4 số cuối chỉ có ý nghĩa khi chưa nhìn thấy số — che SĐT (và chặn mở
  // chi tiết đơn, nơi cũng hiện SĐT) cho tới khi xác thực xong.
  const hidePhone = canSelfClaim && !phoneVerified;
  const maskPhone = (phone) => (hidePhone ? '•'.repeat((phone || '').length) : phone);

  const handleVerifyPhone = () => {
    const last4 = (order.customer?.phone || '').slice(-4);
    if (!last4 || phoneInput.trim() !== last4) {
      setPhoneError('Số không khớp — kiểm tra lại 4 số cuối SĐT khách.');
      return;
    }
    setPhoneError('');
    setPhoneVerified(true);
  };
  const itemLine = (it) => formatOrderItemLine(it, { withQty: false });
  const itemSummary = (order.order_items || []).map(itemLine).join(', ') || 'Không có sản phẩm';
  const packageCount = (order.order_items || []).reduce((s, it) => s + (Number(it.qty) || 0), 0);

  const handlePickupPhoto = async (blob) => {
    setShowCamera(false);
    setBusy(true);
    try {
      const photoUrl = await uploadPhoto(blob, 'pickup');
      const pos = await getCurrentPosition();
      await onPickup(order, photoUrl, pos, canSelfClaim && phoneVerified);
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
        await onPickup(order, null, null, canSelfClaim && phoneVerified);
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
    <div onClick={() => { if (!hidePhone) setShowDetail(true); }} style={{ background: 'var(--surface-card)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-sm)', padding: 14, display: 'flex', flexDirection: 'column', gap: 8, cursor: 'pointer' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ font: 'var(--text-label)', color: 'var(--text-primary)' }}>Tên khách hàng: {order.customer?.name || 'Khách lẻ'}</div>
            {order.order_code && <Badge tone="neutral">{order.order_code}</Badge>}
          </div>
          {showDetail && <OrderDetailModal order={order} onClose={() => setShowDetail(false)} />}
          {order.customer?.phone && (
            <div style={{ font: 'var(--text-caption)', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
              <IconPhone size={14} /> {maskPhone(order.customer.phone)}
            </div>
          )}
          <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-secondary)' }}>Sản phẩm: {itemSummary}</div>
          <div style={{ font: 'var(--text-caption)', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}><IconOrders size={14} /> Số kiện hàng: {packageCount}</div>
          {order.delivery_method === 'lay_tai_xuong' ? (
            <div style={{ font: 'var(--text-caption)', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}><IconHome size={14} /> Khách tự đến lấy tại xưởng</div>
          ) : (
            <div style={{ font: 'var(--text-caption)', color: 'var(--text-muted)' }}>Địa chỉ: {order.address || '—'}</div>
          )}
          <div style={{ font: 'var(--text-caption)', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
            <IconClock size={14} />Ngày giao: {formatDeliveryDateTime(order.delivery_date, order.delivery_time) || '—'}
          </div>
          {order.note && <div style={{ font: 'var(--text-caption)', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}><IconClipboard size={14} /> {order.note}</div>}
          <div style={{ font: 'var(--text-caption)', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 4 }}>
            <IconMoney size={14} />
            {order.payment_method === 'bank' ? 'Đã chuyển khoản' : `Thu COD: ${(Number(order.total || 0) - Number(order.paid_amount || 0)).toLocaleString('vi-VN')}đ`}
            {Number(order.deposit || 0) > 0 ? ` · Đã cọc: ${Number(order.deposit).toLocaleString('vi-VN')}đ` : ''}
          </div>
          {order.shipper_staff_name && <div style={{ font: 'var(--text-caption)', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}><IconTruck size={14} /> Người giao: {order.shipper_staff_name}</div>}
        </div>
        {order.flagged && <Badge tone="danger" icon={<IconWarning size={14} />}>Cần Lưu Ý</Badge>}
      </div>

      <div onClick={(e) => e.stopPropagation()} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {order.status === 'cho_giao' && (
          <React.Fragment>
            <Badge tone="neutral" style={{ alignSelf: 'flex-start' }}>Chờ xuất bến</Badge>
            <div style={{ padding: '8px 10px', borderRadius: 10, background: '#fff0d4', color: '#b93e13', fontSize: 13, fontWeight: 700 }}>
              ⚠️ KIỂM TRA BÁNH: Kiểm tra kỹ mẫu bánh & số lượng trước khi đi. Nếu đến nơi thiếu bánh sẽ tính lỗi cho người nhận giao!
            </div>
            {canSelfClaim && !phoneVerified && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: 10, background: 'var(--surface-sunken)', borderRadius: 'var(--radius-sm)' }}>
                <div style={{ font: 'var(--text-caption)', color: 'var(--text-muted)' }}>Nhập 4 số cuối SĐT khách để xác thực trước khi nhận giao hộ.</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <Input placeholder="VD: 1234" value={phoneInput} onChange={(e) => setPhoneInput(e.target.value)} style={{ flex: '1 1 auto', minWidth: 0 }} />
                  <Button size="sm" variant="secondary" onClick={handleVerifyPhone}>Xác thực</Button>
                </div>
                {phoneError && <div style={{ font: 'var(--text-body-sm)', color: 'var(--status-danger)' }}>{phoneError}</div>}
              </div>
            )}
            <Button variant="primary" size="sm" icon={<IconCamera size={16} />} disabled={busy || !canAct} onClick={() => setShowCamera(true)}>
              {busy ? 'Đang xử lý...' : canSelfClaim ? 'Chụp xuất bến & Nhận giao hộ' : 'Chụp xuất bến & Nhận giao'}
            </Button>
          </React.Fragment>
        )}

        {order.status === 'dang_giao' && (
          <React.Fragment>
            <Badge tone={isLate(order) ? 'danger' : 'warning'} style={{ alignSelf: 'flex-start' }}>
              {isLate(order) ? 'Đang trễ giờ giao' : order.delivery_method === 'lay_tai_xuong' ? 'Chờ khách đến lấy' : 'Đang trên đường giao'}
            </Badge>
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              Bắt buộc chụp ảnh bánh lúc giao đến khách để hệ thống ghi nhận vị trí GPS tính KPI.
            </div>
            <Button
              variant="primary"
              size="sm"
              icon={<IconCamera size={16} />}
              disabled={busy || !canAct}
              onClick={() => setShowCamera(true)}
              style={{ background: '#087f5b', color: '#fff', fontWeight: 900, minHeight: 44 }}
            >
              {busy ? 'Đang xử lý...' : '📸 Chụp ảnh bánh & Xác nhận giao xong (GPS)'}
            </Button>
            {order.delivery_method !== 'lay_tai_xuong' && (
              <Button variant="secondary" size="sm" icon={<IconEdit size={16} />} disabled={busy || !canAct} onClick={() => setShowSignedDocCamera(true)}>
                {order.signed_doc_photo_url ? 'Chụp lại Biên Bản Ký Giấy' : 'Chụp Biên Bản Ký Giấy'}
              </Button>
            )}
          </React.Fragment>
        )}

        {order.status === 'hoan_thanh' && (
          <React.Fragment>
            <Badge tone={order.pendingSync ? 'neutral' : 'success'} style={{ alignSelf: 'flex-start' }}>
              {order.pendingSync ? 'Đã hoàn thành (chờ đồng bộ)' : 'Đơn giao hoàn thành'}
            </Badge>
            {order.late_reason && (
              <div style={{ font: 'var(--text-caption)', color: 'var(--status-danger)', background: 'var(--status-danger-soft)', borderRadius: 'var(--radius-sm)', padding: '6px 8px' }}>
                Giao trễ — lý do: {order.late_reason}
              </div>
            )}
            {formatDuration(order.created_at, order.completed_at) && (
              <div style={{ font: 'var(--text-caption)', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
                <IconClock size={13} /> Thời gian xử lý: {formatDuration(order.created_at, order.completed_at)}
              </div>
            )}
            {order.delivery_lat != null && (
              <div style={{ font: 'var(--text-caption)', color: '#087f5b', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4 }}>
                <IconMapPin size={14} /> Tọa độ GPS giao: {Number(order.delivery_lat).toFixed(5)}, {Number(order.delivery_lng).toFixed(5)}
              </div>
            )}
            {trip && (
              <div style={{ font: 'var(--text-caption)', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
                <IconMapPin size={14} /> Khoảng cách tính KPI: {trip.distanceKm.toFixed(1)}km · ~{trip.roundTripMinutes} phút di chuyển
              </div>
            )}
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <Thumb url={order.kitchen_photo_url} label="Bếp làm xong" />
              <Thumb url={order.pickup_photo_url} label="Lúc xuất bến" />
              <Thumb url={order.delivery_photo_url} label="Ảnh giao khách" />
              <Thumb url={order.signed_doc_photo_url} label="Biên bản ký giấy" />
            </div>
          </React.Fragment>
        )}

        {!canAct && order.status !== 'hoan_thanh' && !canSelfClaim && <div style={{ font: 'var(--text-caption)', color: 'var(--text-muted)' }}>Chỉ Vận chuyển, Chủ sở hữu, hoặc người đã nhận giao hộ mới thao tác được ở đây.</div>}
        <ActionChip icon={<IconWarning size={16} />} label="Báo sự cố" tone="danger" onClick={() => setShowIncident(true)} />
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
  const isDedicatedShipper = hasAnyRole(profile, ['shipper', 'owner', 'admin']);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
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

  // Lỗi từ server (RLS chặn, trigger raise, ràng buộc dữ liệu...) luôn kèm mã lỗi
  // Postgrest. Lỗi mạng của supabase-js không có mã — chỉ khi đó mới xếp hàng offline.
  const isServerRejection = (err) => navigator.onLine && !!err?.code;

  const queueOffline = (order, fields) => {
    enqueue('updateOrder', { id: order.id, fields });
    setOrders((prev) => prev.map((o) => (o.id === order.id ? { ...o, ...fields, pendingSync: true } : o)));
  };

  // Trả về 'written' nếu đã ghi thẳng lên Supabase, 'queued' nếu chỉ xếp hàng
  // offline (chưa thật sự lưu), false nếu bị server từ chối. Các hiệu ứng phụ
  // (như trừ kho thành phẩm) chỉ nên chạy khi 'written' — xem handleComplete.
  const applyFields = async (order, fields) => {
    if (!navigator.onLine) {
      queueOffline(order, fields);
      return 'queued';
    }
    try {
      await updateOrder(order.id, fields);
      setActionError('');
      load();
      return 'written';
    } catch (err) {
      if (isServerRejection(err)) {
        setActionError(err.message || 'Không lưu được thay đổi — bạn không có quyền hoặc dữ liệu không hợp lệ.');
        load();
        return false;
      }
      queueOffline(order, fields);
      return 'queued';
    }
  };

  const handlePickup = async (order, photoUrl, pos, selfClaimed) => {
    const fields = { status: 'dang_giao', shipper_staff_name: profile?.full_name || null };
    if (photoUrl) fields.pickup_photo_url = photoUrl;
    if (pos) { fields.pickup_lat = pos.lat; fields.pickup_lng = pos.lng; }
    const ok = await applyFields(order, fields);
    if (ok && selfClaimed) {
      const payload = {
        assigneeId: profile?.id, title: `Nhận giao hộ đơn ${order.order_code || ''}`.trim(),
        orderCode: order.order_code || null, createdBy: profile?.id,
      };
      createAdhocTask(payload).catch((err) => {
        console.error('Không ghi được việc phát sinh "nhận giao hộ":', err);
        if (isServerRejection(err)) {
          setActionError(`Đã nhận giao hộ nhưng chưa ghi được việc phát sinh: ${err.message || ''}`.trim());
        } else {
          enqueue('createAdhocTask', payload);
        }
      });
    }
  };

  const handleComplete = async (order, photoUrl, pos, lateReason) => {
    const fields = { status: 'hoan_thanh', completed_at: new Date().toISOString() };
    if (photoUrl) fields.delivery_photo_url = photoUrl;
    if (pos) { fields.delivery_lat = pos.lat; fields.delivery_lng = pos.lng; }
    if (lateReason) fields.late_reason = lateReason;
    const result = await applyFields(order, fields);
    if (result === 'written') {
      // Chỉ trừ kho khi đã ghi thẳng lên Supabase — không gọi khi mất mạng vì
      // chắc chắn sẽ lỗi, và hàm này đã tự bắt lỗi từng dòng bên trong nên
      // không cần .catch() ở đây (không bao giờ reject).
      deductFinishedGoodsStockForOrder(order);
    } else if (result === 'queued') {
      // Đơn hoàn thành đã được xếp hàng offline — xếp luôn việc trừ kho để
      // đồng bộ lại khi có mạng (xử lý ở OFFLINE_HANDLERS trong App.jsx).
      enqueue('deductFinishedGoodsStockForOrder', { orderId: order.id });
    }
  };

  const handleSignedDoc = async (order, photoUrl) => {
    await applyFields(order, { signed_doc_photo_url: photoUrl });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <div style={{ font: 'var(--text-display-md)', color: 'var(--text-primary)' }}>Vận Chuyển</div>
        <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-muted)' }}>Nhận giao &amp; giao hàng từ Bếp KDS chuyển sang</div>
      </div>
      {error && <div style={{ font: 'var(--text-body-sm)', color: 'var(--status-danger)' }}>Lỗi tải đơn: {error}</div>}
      {actionError && <div style={{ font: 'var(--text-body-sm)', color: 'var(--status-danger)', background: 'var(--status-danger-soft)', borderRadius: 'var(--radius-sm)', padding: '8px 10px' }}>Không thực hiện được: {actionError}</div>}
      {loading ? (
        <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-muted)' }}>Đang tải...</div>
      ) : orders.length === 0 ? (
        <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-muted)' }}>Chưa có đơn nào cần giao.</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(260px,1fr))', gap: 12 }}>
          {orders.map((o) => <DeliveryCard key={o.id} order={o} onPickup={handlePickup} onComplete={handleComplete} onSignedDoc={handleSignedDoc} isDedicatedShipper={isDedicatedShipper} profile={profile} shopSettings={shopSettings} />)}
        </div>
      )}
    </div>
  );
}
