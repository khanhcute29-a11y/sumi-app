import React, { useEffect, useState } from 'react';
import { Badge } from '../components/feedback/Badge';
import { Button } from '../components/forms/Button';
import { CameraCapture } from '../components/CameraCapture';
import { IncidentReportModal } from '../components/IncidentReportModal';
import { ActionChip } from '../components/ActionChip';
import { OrderDetailModal } from '../components/OrderDetailModal';
import { fetchOrders, updateOrder, uploadPhoto, addOrderNote } from '../lib/queries';
import { useAuth } from '../lib/AuthContext';
import { enqueue } from '../lib/offlineQueue';
import { supabase } from '../lib/supabaseClient';

const STATIONS = {
  nong: { label: 'Bếp Nóng', icon: '🔥', desc: 'Bakery lẻ (bánh không phải bánh kem)' },
  lanh: { label: 'Bếp Lạnh', icon: '❄️', desc: 'Bánh kem · Trang trí · Lắp ráp' },
  xuong42: { label: 'Xưởng 42', icon: '🏭', desc: 'Teabreak · Trường học · B2B đặt' },
  xuong41: { label: 'Xưởng 41', icon: '✨', desc: 'Macaron Sỉ chuyên biệt' },
};
const STATION_KEYS = ['nong', 'lanh', 'xuong42', 'xuong41'];

function getStation(order) {
  if (order.channel === 'Macaron Sỉ') return 'xuong41';
  if (order.channel === 'Teabreak') return 'xuong42';
  const hasKem = (order.order_items || []).some((it) => it.category === 'banh_kem');
  return hasKem ? 'lanh' : 'nong';
}

function ElapsedBadge({ since }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);
  if (!since) return null;
  const minutes = Math.max(0, Math.floor((now - new Date(since).getTime()) / 60000));
  const tone = minutes >= 45 ? 'danger' : minutes >= 20 ? 'warning' : 'neutral';
  return <Badge tone={tone}>⏱ {minutes < 60 ? `${minutes} phút` : `${Math.floor(minutes / 60)}h${minutes % 60}p`}</Badge>;
}

const QUICK_QUESTIONS = [
  'Thiếu nguyên liệu, cần xác nhận lại',
  'Không rõ yêu cầu khách, cần mô tả thêm',
  'Xin xác nhận lại số lượng/kích thước',
  'Cần thêm thời gian, xin xác nhận giờ giao',
];

function QuickAskButton({ orderId, orderCode }) {
  const { profile } = useAuth();
  const [open, setOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const handleAsk = async (message) => {
    setSending(true);
    try {
      await addOrderNote({ orderId, orderCode, authorId: profile?.id, authorName: profile?.full_name, authorRole: profile?.role, message: `❓ ${message}` });
      setSent(true);
      setOpen(false);
      setTimeout(() => setSent(false), 3000);
    } finally {
      setSending(false);
    }
  };

  if (sent) return <Badge tone="success">Đã gửi câu hỏi cho sếp/thu ngân</Badge>;

  return (
    <div style={{ position: 'relative' }}>
      <ActionChip icon="💬" label="Hỏi 1 chạm" tone="info" onClick={() => setOpen((v) => !v)} disabled={sending} />
      {open && (
        <div style={{ position: 'absolute', zIndex: 10, top: '100%', left: 0, marginTop: 4, background: 'var(--surface-card)', boxShadow: 'var(--shadow-lg)', borderRadius: 'var(--radius-md)', padding: 8, display: 'flex', flexDirection: 'column', gap: 4, width: 240 }}>
          {QUICK_QUESTIONS.map((q) => (
            <button key={q} onClick={() => handleAsk(q)} disabled={sending} style={{
              textAlign: 'left', padding: '8px 10px', borderRadius: 'var(--radius-sm)', border: 'none',
              background: 'var(--surface-sunken)', cursor: 'pointer', font: 'var(--text-body-sm)', color: 'var(--text-primary)',
            }}>{q}</button>
          ))}
        </div>
      )}
    </div>
  );
}

function OrderTicket({ order, onAccept, onReady, canAct }) {
  const [busy, setBusy] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [showIncident, setShowIncident] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const itemLine = (it) => {
    const details = [it.size && `Size ${it.size}`, it.cot && `Cốt ${it.cot}`, it.vi && `Vị ${it.vi}`].filter(Boolean).join(' · ');
    return `${it.name} x${it.qty}${details ? ` (${details})` : ''}`;
  };
  const itemSummary = (order.order_items || []).map(itemLine).join(', ') || 'Không có sản phẩm';
  const refPhotos = (order.order_items || []).filter((it) => it.ref_photo_url);

  const handleAccept = async () => {
    setBusy(true);
    try {
      await onAccept(order);
    } finally {
      setBusy(false);
    }
  };

  const handleReadyWithPhoto = async (blob) => {
    setShowCamera(false);
    setBusy(true);
    try {
      const photoUrl = await uploadPhoto(blob, 'kitchen');
      await onReady(order, photoUrl);
    } finally {
      setBusy(false);
    }
  };

  const handleReadySkipPhoto = async () => {
    setBusy(true);
    try {
      await onReady(order, null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div onClick={() => setShowDetail(true)} style={{ background: 'var(--surface-card)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-sm)', padding: 14, display: 'flex', flexDirection: 'column', gap: 6, cursor: 'pointer' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <div style={{ font: 'var(--text-label)', color: 'var(--text-primary)' }}>{order.customer?.name || 'Khách lẻ'}</div>
        {order.order_code && <Badge tone="neutral">{order.order_code}</Badge>}
      </div>
      {showDetail && <OrderDetailModal order={order} onClose={() => setShowDetail(false)} />}
      <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-secondary)' }}>{itemSummary}</div>
      {refPhotos.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }} onClick={(e) => e.stopPropagation()}>
          <div style={{ font: 'var(--text-caption)', color: 'var(--text-muted)' }}>📎 Ảnh mẫu khách gửi:</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {refPhotos.map((it) => (
              <a key={it.id} href={it.ref_photo_url} target="_blank" rel="noreferrer">
                <img src={it.ref_photo_url} alt={it.name} style={{ width: 48, height: 48, borderRadius: 'var(--radius-sm)', objectFit: 'cover' }} />
              </a>
            ))}
          </div>
        </div>
      )}
      {order.note && <div style={{ font: 'var(--text-caption)', color: 'var(--text-muted)', background: 'var(--surface-sunken)', borderRadius: 'var(--radius-sm)', padding: '6px 8px' }}>📝 {order.note}</div>}
      {order.kitchen_staff_name && <div style={{ font: 'var(--text-caption)', color: 'var(--text-muted)' }}>👨‍🍳 Bếp: {order.kitchen_staff_name}</div>}
      <div onClick={(e) => e.stopPropagation()} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {order.status === 'moi' && <Button variant="primary" size="sm" onClick={handleAccept} disabled={busy || !canAct}>{busy ? 'Đang xử lý...' : 'Nhận đơn'}</Button>}
        {order.status === 'dang_lam' && (
          <React.Fragment>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <Badge tone="warning">Đang làm</Badge>
              <ElapsedBadge since={order.created_at} />
            </div>
            <Button variant="secondary" size="sm" icon="📷" onClick={() => setShowCamera(true)} disabled={busy || !canAct}>{busy ? 'Đang xử lý...' : 'Chụp ảnh & Sẵn sàng giao'}</Button>
            {navigator.onLine === false && (
              <Button variant="ghost" size="sm" onClick={handleReadySkipPhoto} disabled={busy || !canAct}>Mất mạng — bỏ qua ảnh, chuyển giao luôn</Button>
            )}
          </React.Fragment>
        )}
        {!canAct && <div style={{ font: 'var(--text-caption)', color: 'var(--text-muted)' }}>Chỉ Bếp hoặc Chủ sở hữu mới thao tác được ở đây.</div>}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <QuickAskButton orderId={order.id} orderCode={order.order_code} />
          <ActionChip icon="⚠" label="Báo sự cố" tone="danger" onClick={() => setShowIncident(true)} />
        </div>
        {showCamera && <CameraCapture onClose={() => setShowCamera(false)} onCapture={handleReadyWithPhoto} />}
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

function StationSummaryCard({ stationKey, orders, active, onClick }) {
  const meta = STATIONS[stationKey];
  const moi = orders.filter((o) => o.status === 'moi').length;
  const dangLam = orders.filter((o) => o.status === 'dang_lam').length;
  return (
    <button onClick={onClick} style={{
      textAlign: 'left', border: active ? '2px solid var(--action-primary)' : '1px solid var(--border-subtle)',
      background: 'var(--surface-card)', borderRadius: 'var(--radius-md)', padding: 14,
      display: 'flex', flexDirection: 'column', gap: 8, cursor: 'pointer',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 20 }}>{meta.icon}</span>
        <span style={{ font: 'var(--text-label)', color: 'var(--text-primary)' }}>{meta.label}</span>
      </div>
      <div style={{ font: 'var(--text-caption)', color: 'var(--text-muted)' }}>{meta.desc}</div>
      <div style={{ display: 'flex', gap: 14 }}>
        <div>
          <div style={{ font: 'var(--text-title)', color: 'var(--text-primary)' }}>{moi}</div>
          <div style={{ font: 'var(--text-caption)', color: 'var(--text-muted)' }}>Đang chờ</div>
        </div>
        <div>
          <div style={{ font: 'var(--text-title)', color: 'var(--status-warning)' }}>{dangLam}</div>
          <div style={{ font: 'var(--text-caption)', color: 'var(--text-muted)' }}>Đang làm</div>
        </div>
        <div>
          <div style={{ font: 'var(--text-title)', color: 'var(--text-primary)' }}>{orders.length}</div>
          <div style={{ font: 'var(--text-caption)', color: 'var(--text-muted)' }}>Tổng</div>
        </div>
      </div>
    </button>
  );
}

export default function KdsScreen({ initialStation }) {
  const { profile } = useAuth();
  const canAct = profile?.role === 'kitchen' || profile?.role === 'owner';
  const [activeStation, setActiveStation] = useState(initialStation || 'all');
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  useEffect(() => {
    if (initialStation) setActiveStation(initialStation);
  }, [initialStation]);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const load = () => {
    setLoading(true);
    fetchOrders({ statuses: ['moi', 'dang_lam'] })
      .then((data) => { setOrders(data); setError(''); })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  useEffect(() => {
    const channel = supabase
      .channel('kds-orders-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, load)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const applyFields = (order, fields) => {
    if (!navigator.onLine) {
      enqueue('updateOrder', { id: order.id, fields });
      setOrders((prev) => prev.map((o) => (o.id === order.id ? { ...o, ...fields } : o)));
      return;
    }
    updateOrder(order.id, fields)
      .then(load)
      .catch(() => {
        enqueue('updateOrder', { id: order.id, fields });
        setOrders((prev) => prev.map((o) => (o.id === order.id ? { ...o, ...fields } : o)));
      });
  };

  const handleAccept = async (order) => {
    applyFields(order, { status: 'dang_lam', kitchen_staff_name: profile?.full_name || null });
  };

  const handleReady = async (order, photoUrl) => {
    const fields = { status: 'cho_giao' };
    if (photoUrl) fields.kitchen_photo_url = photoUrl;
    applyFields(order, fields);
  };

  const byDeliveryTime = (a, b) => {
    if (!a.delivery_time && !b.delivery_time) return 0;
    if (!a.delivery_time) return 1;
    if (!b.delivery_time) return -1;
    return a.delivery_time.localeCompare(b.delivery_time);
  };
  const byStation = STATION_KEYS.reduce((acc, key) => {
    acc[key] = orders.filter((o) => getStation(o) === key).sort(byDeliveryTime);
    return acc;
  }, {});

  const stationsToShow = isMobile ? STATION_KEYS : (activeStation === 'all' ? STATION_KEYS : [activeStation]);
  const visibleOrders = activeStation === 'all' ? [...orders].sort(byDeliveryTime) : byStation[activeStation] || [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <div style={{ font: 'var(--text-display-md)', color: 'var(--text-primary)' }}>Bếp — Xưởng</div>
        <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-muted)' }}>4 luồng độc lập theo bộ phận</div>
      </div>
      {error && <div style={{ font: 'var(--text-body-sm)', color: 'var(--status-danger)' }}>Lỗi tải đơn: {error}</div>}

      {!isMobile && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 12 }}>
          <button onClick={() => setActiveStation('all')} style={{
            textAlign: 'left', border: activeStation === 'all' ? '2px solid var(--action-primary)' : '1px solid var(--border-subtle)',
            background: 'var(--surface-card)', borderRadius: 'var(--radius-md)', padding: 14,
            display: 'flex', flexDirection: 'column', gap: 8, cursor: 'pointer', justifyContent: 'center',
          }}>
            <div style={{ font: 'var(--text-label)', color: 'var(--text-primary)' }}>📋 Tất cả</div>
            <div style={{ font: 'var(--text-caption)', color: 'var(--text-muted)' }}>Xem gộp mọi bộ phận</div>
            <div style={{ font: 'var(--text-title)', color: 'var(--text-primary)' }}>{orders.length} đơn</div>
          </button>
          {STATION_KEYS.map((key) => (
            <StationSummaryCard key={key} stationKey={key} orders={byStation[key]} active={activeStation === key} onClick={() => setActiveStation(key)} />
          ))}
        </div>
      )}

      {loading ? (
        <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-muted)' }}>Đang tải...</div>
      ) : isMobile ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {stationsToShow.map((key) => (
            <div key={key} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ font: 'var(--text-label)', color: 'var(--text-primary)' }}>{STATIONS[key].icon} {STATIONS[key].label} <Badge tone="neutral">{byStation[key].length}</Badge></div>
              {byStation[key].length === 0 ? (
                <div style={{ font: 'var(--text-caption)', color: 'var(--text-muted)' }}>Không có đơn.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {byStation[key].map((o) => <OrderTicket key={o.id} order={o} onAccept={handleAccept} onReady={handleReady} canAct={canAct} />)}
                </div>
              )}
            </div>
          ))}
        </div>
      ) : visibleOrders.length === 0 ? (
        <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-muted)' }}>Không có đơn nào đang chờ xử lý.</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))', gap: 12 }}>
          {visibleOrders.map((o) => <OrderTicket key={o.id} order={o} onAccept={handleAccept} onReady={handleReady} canAct={canAct} />)}
        </div>
      )}
    </div>
  );
}
