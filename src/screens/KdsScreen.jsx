import React, { useEffect, useState } from 'react';
import { Badge } from '../components/feedback/Badge';
import { Button } from '../components/forms/Button';
import { formatOrderItemLine } from '../lib/cakePricing';
import { formatDeliveryDateTime } from '../lib/date';
import { CameraCapture } from '../components/CameraCapture';
import { IncidentReportModal } from '../components/IncidentReportModal';
import { ActionChip } from '../components/ActionChip';
import { OrderDetailModal } from '../components/OrderDetailModal';
import { fetchOrders, updateOrder, uploadPhoto, addOrderNote } from '../lib/queries';
import { useAuth } from '../lib/AuthContext';
import { enqueue } from '../lib/offlineQueue';
import { supabase } from '../lib/supabaseClient';
import {
  IconStationHot, IconStationCold, IconStationWorkshop, IconStationSparkle,
  IconChat, IconWarning, IconPaperclip, IconClipboard, IconKitchen, IconCamera, IconSearch, IconClock,
  IconPhone, IconHome, IconMapPin,
} from '../components/icons/FrogIcons';

const STATIONS = {
  nong: { label: 'Bếp Nóng', Icon: IconStationHot, tag: 'NÓNG', desc: 'Bakery lẻ · Teabreak · Trường học...' },
  lanh: { label: 'Bếp Lạnh', Icon: IconStationCold, tag: 'LẠNH', desc: 'Kem · Lắp ráp · Trang trí · Bakery...' },
  xuong42: { label: 'Xưởng 42', Icon: IconStationWorkshop, tag: 'BATCH', desc: 'Trường học · Teabreak · B2B đặt...' },
  xuong41: { label: 'Xưởng 41', Icon: IconStationSparkle, tag: 'MACARON', desc: 'Macaron chuyên biệt · Thùng →...' },
};
const STATION_KEYS = ['xuong42', 'xuong41', 'nong', 'lanh'];
const URGENT_MINUTES = 45;

function getStation(order) {
  if (order.channel === 'Macaron Sỉ') return 'xuong41';
  if (order.channel === 'Teabreak') return 'xuong42';
  const hasKem = (order.order_items || []).some((it) => it.category === 'banh_kem');
  return hasKem ? 'lanh' : 'nong';
}

function isUrgent(order) {
  if (order.status !== 'moi' && order.status !== 'dang_lam') return false;
  const minutes = (Date.now() - new Date(order.created_at).getTime()) / 60000;
  return minutes >= URGENT_MINUTES;
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
  return <Badge tone={tone} icon={<IconClock size={13} />}>{minutes < 60 ? `${minutes} phút` : `${Math.floor(minutes / 60)}h${minutes % 60}p`}</Badge>;
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
      <ActionChip icon={<IconChat size={16} />} label="Hỏi 1 chạm" tone="info" onClick={() => setOpen((v) => !v)} disabled={sending} />
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

const STATUS_LABELS = { moi: 'Chờ nhận', dang_lam: 'Đang làm', cho_giao: 'Hoàn thành', dang_giao: 'Đang giao', hoan_thanh: 'Đã giao' };
const STATUS_TONES = { moi: 'neutral', dang_lam: 'warning', cho_giao: 'success', dang_giao: 'info', hoan_thanh: 'success' };

function CompactOrderRow({ order, onAccept, onReady, canAct }) {
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [showIncident, setShowIncident] = useState(false);
  const [showFullDetail, setShowFullDetail] = useState(false);

  const itemSummary = (order.order_items || []).map((it) => formatOrderItemLine(it)).join(', ') || 'Không có sản phẩm';
  const refPhotos = (order.order_items || []).filter((it) => it.ref_photo_url);
  const urgent = isUrgent(order);

  const handleAccept = async () => {
    setBusy(true);
    try { await onAccept(order); } finally { setBusy(false); }
  };
  const handleReadyWithPhoto = async (blob) => {
    setShowCamera(false);
    setBusy(true);
    try {
      const photoUrl = await uploadPhoto(blob, 'kitchen');
      await onReady(order, photoUrl);
    } finally { setBusy(false); }
  };
  const handleReadySkipPhoto = async () => {
    setBusy(true);
    try { await onReady(order, null); } finally { setBusy(false); }
  };

  return (
    <div style={{ background: 'var(--surface-card)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-sm)' }}>
      <button
        onClick={() => setExpanded((v) => !v)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px',
          border: 'none', background: urgent ? 'var(--status-danger-soft)' : 'transparent', cursor: 'pointer', textAlign: 'left',
        }}
      >
        <span style={{ font: 'var(--text-caption)', color: 'var(--text-muted)', transform: expanded ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }}>▸</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ font: 'var(--text-label)', color: 'var(--text-primary)' }}>{order.customer?.name || 'Khách lẻ'}</span>
            {order.order_code && <span style={{ font: 'var(--text-caption)', color: 'var(--text-muted)' }}>{order.order_code}</span>}
            {urgent && <Badge tone="danger" icon={<IconWarning size={14} />}>Khẩn cấp</Badge>}
          </div>
          <div style={{ font: 'var(--text-caption)', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{itemSummary}</div>
        </div>
        <Badge tone={STATUS_TONES[order.status] || 'neutral'}>{STATUS_LABELS[order.status] || order.status}</Badge>
      </button>

      {expanded && (
        <div style={{ padding: '0 14px 14px', display: 'flex', flexDirection: 'column', gap: 10, borderTop: '1px solid var(--border-subtle)' }}>
          <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-secondary)', marginTop: 10 }}>{itemSummary}</div>
          {order.customer?.phone && <div style={{ font: 'var(--text-caption)', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}><IconPhone size={14} /> {order.customer.phone}</div>}
          <div style={{ font: 'var(--text-caption)', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
            <IconClock size={14} />Ngày giao: {formatDeliveryDateTime(order.delivery_date, order.delivery_time) || '—'}
          </div>
          {order.delivery_method === 'lay_tai_xuong' ? (
            <div style={{ font: 'var(--text-caption)', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}><IconHome size={14} /> Khách tự đến lấy tại xưởng</div>
          ) : order.address ? (
            <div style={{ font: 'var(--text-caption)', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}><IconMapPin size={14} /> {order.address}</div>
          ) : null}
          {refPhotos.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div style={{ font: 'var(--text-caption)', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}><IconPaperclip size={14} /> Ảnh mẫu khách gửi:</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {refPhotos.map((it) => (
                  <a key={it.id} href={it.ref_photo_url} target="_blank" rel="noreferrer">
                    <img src={it.ref_photo_url} alt={it.name} style={{ width: 48, height: 48, borderRadius: 'var(--radius-sm)', objectFit: 'cover' }} />
                  </a>
                ))}
              </div>
            </div>
          )}
          {order.note && <div style={{ font: 'var(--text-caption)', color: 'var(--text-muted)', background: 'var(--surface-sunken)', borderRadius: 'var(--radius-sm)', padding: '6px 8px', display: 'flex', alignItems: 'center', gap: 4 }}><IconClipboard size={14} /> {order.note}</div>}
          {order.kitchen_staff_name && <div style={{ font: 'var(--text-caption)', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}><IconKitchen size={14} /> Bếp: {order.kitchen_staff_name}</div>}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {order.status === 'moi' && <Button variant="primary" size="sm" onClick={handleAccept} disabled={busy || !canAct}>{busy ? 'Đang xử lý...' : 'Nhận đơn'}</Button>}
            {order.status === 'dang_lam' && (
              <React.Fragment>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <ElapsedBadge since={order.created_at} />
                </div>
                <Button variant="secondary" size="sm" icon={<IconCamera size={16} />} onClick={() => setShowCamera(true)} disabled={busy || !canAct}>{busy ? 'Đang xử lý...' : 'Chụp ảnh & Sẵn sàng giao'}</Button>
                {navigator.onLine === false && (
                  <Button variant="ghost" size="sm" onClick={handleReadySkipPhoto} disabled={busy || !canAct}>Mất mạng — bỏ qua ảnh, chuyển giao luôn</Button>
                )}
              </React.Fragment>
            )}
            {!canAct && <div style={{ font: 'var(--text-caption)', color: 'var(--text-muted)' }}>Chỉ Bếp hoặc Chủ sở hữu mới thao tác được ở đây.</div>}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <QuickAskButton orderId={order.id} orderCode={order.order_code} />
              <ActionChip icon={<IconWarning size={16} />} label="Báo sự cố" tone="danger" onClick={() => setShowIncident(true)} />
              <ActionChip icon={<IconSearch size={16} />} label="Xem đầy đủ" tone="neutral" onClick={() => setShowFullDetail(true)} />
            </div>
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
          {showFullDetail && <OrderDetailModal order={order} onClose={() => setShowFullDetail(false)} />}
        </div>
      )}
    </div>
  );
}

function StationOverviewCard({ stationKey, orders, active, onClick }) {
  const meta = STATIONS[stationKey];
  const urgent = orders.filter(isUrgent).length;
  const waiting = orders.filter((o) => o.status === 'moi').length;
  const completed = orders.filter((o) => o.status === 'cho_giao').length;
  return (
    <button onClick={onClick} style={{
      textAlign: 'left', border: active ? '2px solid var(--action-primary)' : '1px solid var(--border-subtle)',
      background: 'var(--surface-card)', borderRadius: 'var(--radius-lg)', padding: 16,
      display: 'flex', flexDirection: 'column', gap: 10, cursor: 'pointer',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <meta.Icon size={22} />
        <span style={{ font: 'var(--text-label)', color: 'var(--text-primary)' }}>{meta.label}</span>
        <Badge tone="neutral">{meta.tag}</Badge>
      </div>
      <div style={{ font: 'var(--text-caption)', color: 'var(--text-muted)' }}>{meta.desc}</div>
      <div style={{ display: 'grid', gridTemplateColumns: urgent > 0 ? '1fr 1fr 1fr' : '1fr 1fr 1fr', gap: 8 }}>
        {urgent > 0 && (
          <div style={{ background: 'var(--status-danger)', color: '#fff', borderRadius: 'var(--radius-sm)', padding: '8px 10px', textAlign: 'center' }}>
            <div style={{ font: 'var(--text-caption)', display: 'flex', alignItems: 'center', gap: 4 }}><IconWarning size={14} /> Khẩn cấp</div>
            <div style={{ font: 'var(--text-title)' }}>{urgent}</div>
          </div>
        )}
        <div style={{ textAlign: 'center' }}>
          <div style={{ font: 'var(--text-caption)', color: 'var(--text-muted)' }}>Đang chờ</div>
          <div style={{ font: 'var(--text-title)', color: 'var(--text-primary)' }}>{waiting}</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ font: 'var(--text-caption)', color: 'var(--text-muted)' }}>Hoàn thành</div>
          <div style={{ font: 'var(--text-title)', color: 'var(--status-success)' }}>{completed}</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ font: 'var(--text-caption)', color: 'var(--text-muted)' }}>Tổng</div>
          <div style={{ font: 'var(--text-title)', color: 'var(--text-primary)' }}>{orders.length}</div>
        </div>
      </div>
    </button>
  );
}

export default function KdsScreen({ initialStation }) {
  const { profile } = useAuth();
  const canAct = ['kitchen', 'bakery', 'kitchen_lead', 'kitchen_deputy', 'owner', 'admin'].includes(profile?.role);
  const [activeStation, setActiveStation] = useState(initialStation || 'all');
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (initialStation) setActiveStation(initialStation);
  }, [initialStation]);

  const load = () => {
    setLoading(true);
    fetchOrders({ statuses: ['moi', 'dang_lam', 'cho_giao'] })
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
    const staffName = profile?.full_name || null;
    applyFields(order, { status: 'dang_lam', kitchen_staff_name: staffName });
    if (isUrgent(order) && staffName) {
      addOrderNote({
        orderId: order.id, orderCode: order.order_code, authorId: profile?.id,
        authorName: staffName, authorRole: profile?.role,
        message: `🚨 Đơn khẩn cấp — @${staffName} đang làm gấp`,
      }).catch(() => {});
    }
  };

  const handleReady = async (order, photoUrl) => {
    const fields = { status: 'cho_giao' };
    if (photoUrl) fields.kitchen_photo_url = photoUrl;
    applyFields(order, fields);
  };

  // Ưu tiên khách đặt trước (created_at sớm hơn) lên đầu trong cùng ngày giao, kể cả khi giờ giao ghi trễ hơn.
  const byDeliveryTime = (a, b) => {
    const ad = a.delivery_date || '', bd = b.delivery_date || '';
    if (ad !== bd) {
      if (!ad) return 1;
      if (!bd) return -1;
      return ad.localeCompare(bd);
    }
    return new Date(a.created_at) - new Date(b.created_at);
  };
  const byStation = STATION_KEYS.reduce((acc, key) => {
    acc[key] = orders.filter((o) => getStation(o) === key).sort(byDeliveryTime);
    return acc;
  }, {});

  const activeOrders = orders.filter((o) => o.status !== 'cho_giao');
  const visibleOrders = activeStation === 'all'
    ? [...activeOrders].sort(byDeliveryTime)
    : (byStation[activeStation] || []).filter((o) => o.status !== 'cho_giao');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <div style={{ font: 'var(--text-display-md)', color: 'var(--text-primary)' }}>Màn Hình Bếp (KDS)</div>
        <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-muted)' }}>4 luồng độc lập — mỗi luồng theo bộ phận tương ứng</div>
      </div>

      {/* Dropdown chọn nhanh luồng bếp — không cần lướt xuống */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <label style={{ font: 'var(--text-label)', color: 'var(--text-secondary)' }}>Chọn luồng bếp:</label>
        <select
          value={activeStation}
          onChange={(e) => setActiveStation(e.target.value)}
          style={{
            padding: '10px 14px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)',
            background: 'var(--surface-card)', color: 'var(--text-primary)', font: 'var(--text-body)', cursor: 'pointer', minWidth: 220,
          }}
        >
          <option value="all">Tất cả ({orders.length} đơn)</option>
          {STATION_KEYS.map((key) => (
            <option key={key} value={key}>{STATIONS[key].label} ({byStation[key].length} đơn)</option>
          ))}
        </select>
      </div>

      {error && <div style={{ font: 'var(--text-body-sm)', color: 'var(--status-danger)' }}>Lỗi tải đơn: {error}</div>}

      {/* Cards tổng quan từng luồng bếp */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: 12 }}>
        {STATION_KEYS.map((key) => (
          <StationOverviewCard key={key} stationKey={key} orders={byStation[key]} active={activeStation === key} onClick={() => setActiveStation(key)} />
        ))}
      </div>

      {/* Danh sách đơn hàng dạng thu gọn — click để xem chi tiết */}
      {loading ? (
        <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-muted)' }}>Đang tải...</div>
      ) : visibleOrders.length === 0 ? (
        <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-muted)' }}>Không có đơn nào đang chờ xử lý.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {visibleOrders.map((o) => (
            <CompactOrderRow key={o.id} order={o} onAccept={handleAccept} onReady={handleReady} canAct={canAct} />
          ))}
        </div>
      )}
    </div>
  );
}
