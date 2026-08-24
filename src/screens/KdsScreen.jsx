import React, { useEffect, useState } from 'react';
import { Badge } from '../components/feedback/Badge';
import { Button } from '../components/forms/Button';
import { Select } from '../components/forms/Select';
import { formatOrderItemLine, KEM_GROUP_CATEGORIES } from '../lib/cakePricing';
import { formatDeliveryDateTime, localDateStr } from '../lib/date';
import { CameraCapture } from '../components/CameraCapture';
import { IncidentReportModal } from '../components/IncidentReportModal';
import { ProductionLogModal } from '../components/ProductionLogModal';
import { ProductionLogList } from '../components/ProductionLogList';
import { ActionChip } from '../components/ActionChip';
import { OrderDetailModal } from '../components/OrderDetailModal';
import { StageSplitModal } from '../components/StageSplitModal';
import { fetchOrders, updateOrder, uploadPhoto, addOrderNote, fetchOpenIncidentOrderIds, startOrderStage, completeOrderStage, reassignOrderStage, fetchShiftLogsRange, fetchAllProfiles } from '../lib/queries';
import { useAuth } from '../lib/AuthContext';
import { hasAnyRole } from '../lib/roles';
import { enqueue } from '../lib/offlineQueue';
import { supabase } from '../lib/supabaseClient';
import { playKitchenCompleteSound } from '../lib/sound';
import { broadcastEvent, BroadcastEvents } from '../lib/realtimeSync';
import {
  IconStationHot, IconStationCold, IconStationWorkshop, IconStationSparkle,
  IconChat, IconWarning, IconPaperclip, IconClipboard, IconKitchen, IconCamera, IconSearch, IconClock,
  IconPhone, IconHome, IconMapPin, IconStaff,
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
  const hasKem = (order.order_items || []).some((it) => KEM_GROUP_CATEGORIES.includes(it.category));
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

function CompactOrderRow({ order, onAccept, onReady, canAct, hasIncident, profile, onlineProfiles, onStageStart, onStageComplete, onStageReassign }) {
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [showIncident, setShowIncident] = useState(false);
  const [showFullDetail, setShowFullDetail] = useState(false);
  const [showSplitStages, setShowSplitStages] = useState(false);
  const [completingStage, setCompletingStage] = useState(null);
  const [stageBusy, setStageBusy] = useState(null);
  const [stageActionError, setStageActionError] = useState('');
  const stages = (order.order_stages || []).slice().sort((a, b) => a.stage_index - b.stage_index);
  const canSplit = hasAnyRole(profile, ['kitchen_lead', 'owner', 'admin']) && stages.length === 0 && (order.status === 'moi' || order.status === 'dang_lam');

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

  // ---- Stage checklist actions (multi-stage split orders) ----
  const handleStageStartClick = async (stage) => {
    setStageActionError('');
    setStageBusy(stage.id);
    try {
      await onStageStart(stage);
    } catch (err) {
      setStageActionError(err.message || 'Có lỗi xảy ra, thử lại.');
    } finally {
      setStageBusy(null);
    }
  };

  const handleStageCompleteClick = async (stage, isLast) => {
    if (isLast) {
      // Công đoạn cuối vẫn cần ảnh giao hàng như luồng bếp thường — mở camera thay vì hoàn thành thẳng.
      setStageActionError('');
      setCompletingStage(stage);
      setShowCamera(true);
      return;
    }
    setStageActionError('');
    setStageBusy(stage.id);
    try {
      await onStageComplete(order, stage, false);
    } catch (err) {
      setStageActionError(err.message || 'Có lỗi xảy ra, thử lại.');
    } finally {
      setStageBusy(null);
    }
  };

  const handleStageReadyWithPhoto = async (blob) => {
    setShowCamera(false);
    const stage = completingStage;
    setCompletingStage(null);
    if (!stage) return;
    setStageActionError('');
    setStageBusy(stage.id);
    try {
      const photoUrl = await uploadPhoto(blob, 'kitchen');
      await onStageComplete(order, stage, true, photoUrl);
    } catch (err) {
      setStageActionError(err.message || 'Có lỗi xảy ra, thử lại.');
    } finally {
      setStageBusy(null);
    }
  };

  const handleStageReadySkipPhoto = async (stage) => {
    setStageActionError('');
    setStageBusy(stage.id);
    try {
      await onStageComplete(order, stage, true, null);
    } catch (err) {
      setStageActionError(err.message || 'Có lỗi xảy ra, thử lại.');
    } finally {
      setStageBusy(null);
    }
  };

  const handleStageReassignClick = async (stage, assigneeId, assigneeName) => {
    setStageActionError('');
    setStageBusy(stage.id);
    try {
      await onStageReassign(stage, assigneeId, assigneeName);
    } catch (err) {
      setStageActionError(err.message || 'Có lỗi xảy ra, thử lại.');
    } finally {
      setStageBusy(null);
    }
  };

  return (
    <div style={{ background: 'var(--surface-card)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-sm)', border: hasIncident ? '2px solid var(--status-danger)' : 'none' }}>
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
            {hasIncident && <Badge tone="danger" icon={<IconWarning size={14} />}>Có báo sự cố</Badge>}
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
            {stages.length === 0 && (
              <React.Fragment>
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
              </React.Fragment>
            )}
            {stages.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {stages.map((stage, i) => {
                  const locked = i > 0 && stages[i - 1].status !== 'hoan_thanh';
                  const isMine = stage.assignee_id === profile?.id;
                  const canManage = hasAnyRole(profile, ['kitchen_lead', 'owner', 'admin']);
                  return (
                    <div key={stage.id} style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: 8, background: locked ? 'var(--surface-sunken)' : 'var(--surface-card)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', opacity: locked ? 0.6 : 1 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', font: 'var(--text-body-sm)' }}>
                        <span>CĐ{stage.stage_index} · {stage.stage_name}</span>
                        <Badge tone={stage.status === 'hoan_thanh' ? 'success' : stage.status === 'dang_lam' ? 'primary' : 'neutral'}>
                          {stage.status === 'hoan_thanh' ? 'Xong' : stage.status === 'dang_lam' ? 'Đang làm' : locked ? 'Đã khoá' : 'Chờ làm'}
                        </Badge>
                      </div>
                      <div style={{ font: 'var(--text-caption)', color: 'var(--text-muted)' }}>{stage.assignee_name}</div>
                      {!locked && stage.status === 'cho_lam' && (isMine || canManage) && (
                        <Button variant="secondary" size="sm" onClick={() => handleStageStartClick(stage)} disabled={stageBusy === stage.id}>
                          {stageBusy === stage.id ? 'Đang xử lý...' : 'Bắt đầu'}
                        </Button>
                      )}
                      {!locked && stage.status === 'dang_lam' && (isMine || canManage) && (
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          <Button variant="primary" size="sm" onClick={() => handleStageCompleteClick(stage, i === stages.length - 1)} disabled={stageBusy === stage.id}>
                            {stageBusy === stage.id ? 'Đang xử lý...' : 'Hoàn thành'}
                          </Button>
                          {i === stages.length - 1 && navigator.onLine === false && (
                            <Button variant="ghost" size="sm" onClick={() => handleStageReadySkipPhoto(stage)} disabled={stageBusy === stage.id}>
                              Mất mạng — bỏ qua ảnh, hoàn thành luôn
                            </Button>
                          )}
                          <Select
                            value=""
                            onChange={(e) => {
                              const opt = onlineProfiles.find((p) => p.id === e.target.value);
                              if (opt) handleStageReassignClick(stage, opt.id, opt.full_name);
                            }}
                            options={onlineProfiles.filter((p) => p.id !== stage.assignee_id).map((p) => ({ value: p.id, label: p.full_name }))}
                            placeholder="Nhường lại cho..."
                            style={{ maxWidth: 160 }}
                            disabled={stageBusy === stage.id}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
                {stageActionError && (
                  <div style={{ font: 'var(--text-body-sm)', color: 'var(--status-danger)' }}>{stageActionError}</div>
                )}
              </div>
            )}
            {!canAct && <div style={{ font: 'var(--text-caption)', color: 'var(--text-muted)' }}>Chỉ Bếp hoặc Chủ sở hữu mới thao tác được ở đây.</div>}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <QuickAskButton orderId={order.id} orderCode={order.order_code} />
              <ActionChip icon={<IconWarning size={16} />} label="Báo sự cố" tone="danger" onClick={() => setShowIncident(true)} />
              <ActionChip icon={<IconSearch size={16} />} label="Xem đầy đủ" tone="neutral" onClick={() => setShowFullDetail(true)} />
              {canSplit && <ActionChip icon={<IconStaff size={16} />} label="Chia công đoạn" tone="info" onClick={() => setShowSplitStages(true)} />}
            </div>
          </div>

          {showCamera && (
            <CameraCapture
              onClose={() => { setShowCamera(false); setCompletingStage(null); }}
              onCapture={completingStage ? handleStageReadyWithPhoto : handleReadyWithPhoto}
            />
          )}
          {showIncident && (
            <IncidentReportModal
              orderId={order.id}
              orderCode={order.order_code}
              onClose={() => setShowIncident(false)}
              onSent={() => setShowIncident(false)}
            />
          )}
          {showFullDetail && <OrderDetailModal order={order} onClose={() => setShowFullDetail(false)} />}
          {showSplitStages && (
            <StageSplitModal order={order} onClose={() => setShowSplitStages(false)} onSaved={() => setShowSplitStages(false)} />
          )}
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
  const canAct = hasAnyRole(profile, ['kitchen', 'bakery', 'kitchen_lead', 'kitchen_deputy', 'owner', 'admin']);
  const [activeStation, setActiveStation] = useState(initialStation || 'all');
  const [orders, setOrders] = useState([]);
  const [incidentOrderIds, setIncidentOrderIds] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showProductionLog, setShowProductionLog] = useState(false);
  const [showProductionLogList, setShowProductionLogList] = useState(false);
  const [productionLogRefreshKey, setProductionLogRefreshKey] = useState(0);
  const [onlineProfiles, setOnlineProfiles] = useState([]);
  const [actionError, setActionError] = useState('');

  useEffect(() => {
    if (initialStation) setActiveStation(initialStation);
  }, [initialStation]);

  const load = () => {
    setLoading(true);
    fetchOrders({ statuses: ['moi', 'dang_lam', 'cho_giao'], excludeOrderTypes: ['macaron', 'school'] })
      .then((data) => { setOrders(data); setError(''); })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  const loadIncidentOrderIds = () => { fetchOpenIncidentOrderIds().then(setIncidentOrderIds).catch(() => {}); };

  const loadOnlineProfiles = () => {
    const today = localDateStr();
    Promise.all([fetchShiftLogsRange(today, today), fetchAllProfiles()])
      .then(([logs, profiles]) => {
        const onlineIds = new Set(
          logs.filter((l) => l.type === 'checkin' && !logs.some((c) => c.type === 'checkout' && c.staff_id === l.staff_id && c.work_date === l.work_date))
            .map((l) => l.staff_id)
        );
        setOnlineProfiles(profiles.filter((p) => onlineIds.has(p.id) && p.active !== false));
      })
      .catch(() => {});
  };

  useEffect(() => { load(); loadOnlineProfiles(); }, []);
  useEffect(loadIncidentOrderIds, []);

  useEffect(() => {
    // Nhân viên có thể check-in sau khi tab KDS đã mở — làm mới luôn danh sách "đang trực"
    // mỗi khi có thay đổi đơn/công đoạn, để khỏi phải tải lại trang mới thấy người mới vào ca.
    const refreshOrdersAndOnline = () => { load(); loadOnlineProfiles(); };
    const channel = supabase
      .channel('kds-orders-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, refreshOrdersAndOnline)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'incident_reports' }, loadIncidentOrderIds)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_stages' }, refreshOrdersAndOnline)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  // Lỗi từ server (RLS chặn, trigger raise, ràng buộc dữ liệu...) luôn kèm mã lỗi
  // Postgrest. Lỗi mạng của supabase-js không có mã — chỉ khi đó mới xếp hàng offline.
  // (Cùng logic với ShippingScreen.applyFields — xem đó để biết lý do.)
  const isServerRejection = (err) => navigator.onLine && !!err?.code;

  // Trả về true nếu thay đổi đã được ghi (hoặc đã xếp hàng offline), false nếu bị từ chối.
  const applyFields = async (order, fields) => {
    if (!navigator.onLine) {
      enqueue('updateOrder', { id: order.id, fields });
      setOrders((prev) => prev.map((o) => (o.id === order.id ? { ...o, ...fields } : o)));
      return true;
    }
    try {
      await updateOrder(order.id, fields);
      setActionError('');
      load();
      return true;
    } catch (err) {
      if (isServerRejection(err)) {
        setActionError(err.message || 'Không lưu được thay đổi — bạn không có quyền hoặc dữ liệu không hợp lệ.');
        load();
        return false;
      }
      enqueue('updateOrder', { id: order.id, fields });
      setOrders((prev) => prev.map((o) => (o.id === order.id ? { ...o, ...fields } : o)));
      return true;
    }
  };

  const handleAccept = async (order) => {
    const staffName = profile?.full_name || null;
    await applyFields(order, { status: 'dang_lam', kitchen_staff_name: staffName });
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
    await applyFields(order, fields);
  };

  const handleStageStart = async (stage) => {
    await startOrderStage(stage.id);
    load();
  };

  const handleStageComplete = async (order, stage, isLastStage, photoUrl) => {
    try {
      console.log('[KDS] handleStageComplete - isLastStage:', isLastStage);
      await completeOrderStage(stage.id);
      if (isLastStage) {
        const fields = { status: 'cho_giao', kitchen_staff_name: stage.assignee_name };
        if (photoUrl) fields.kitchen_photo_url = photoUrl;
        await applyFields(order, fields);

        // 🎵 TING TING TING TING - Phát âm thanh hoàn thành đơn cho tất cả người dùng
        console.log('[KDS] Playing kitchen complete sound...');
        try {
          playKitchenCompleteSound();
          console.log('[KDS] ✓ Sound played successfully');
        } catch (soundErr) {
          console.error('[KDS] Sound play error:', soundErr);
        }

        console.log('[KDS] Broadcasting sound notification...');
        broadcastEvent(BroadcastEvents.SOUND_NOTIFICATION, {
          soundType: 'kitchen_complete'
        }).catch(e => console.error('[KDS] Broadcast error:', e));
      } else {
        load();
      }
    } catch (err) {
      console.error('[KDS] handleStageComplete error:', err);
      throw err;
    }
  };

  const handleStageReassign = async (stage, assigneeId, assigneeName) => {
    await reassignOrderStage(stage.id, { assigneeId, assigneeName });
    load();
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

      {canAct && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Button variant="secondary" size="sm" icon={<IconClipboard size={16} />} onClick={() => setShowProductionLog(true)}>
              Ghi Sản Xuất
            </Button>
            <Button variant={showProductionLogList ? 'primary' : 'ghost'} size="sm" onClick={() => setShowProductionLogList((v) => !v)}>
              Đã ghi sản xuất {showProductionLogList ? '▲' : '▼'}
            </Button>
          </div>
          {showProductionLogList && <ProductionLogList refreshKey={productionLogRefreshKey} />}
        </div>
      )}

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
      {actionError && <div style={{ font: 'var(--text-body-sm)', color: 'var(--status-danger)', background: 'var(--status-danger-soft)', borderRadius: 'var(--radius-sm)', padding: '8px 10px' }}>Không thực hiện được: {actionError}</div>}

      {/* Cards tổng quan từng luồng bếp */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: 12 }}>
        {STATION_KEYS.map((key) => (
          <StationOverviewCard key={key} stationKey={key} orders={byStation[key]} active={activeStation === key} onClick={() => setActiveStation(key)} />
        ))}
      </div>

      {(activeStation === 'xuong41' || activeStation === 'all') && (
        <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-secondary)', background: 'var(--surface-sunken)', borderRadius: 'var(--radius-sm)', padding: '8px 10px' }}>
          🧁 Đơn Macaron giờ xử lý (nhận / hoàn thành) ở màn <b>Đơn Hàng</b> — mở đơn, bấm Nhận đơn/Hoàn thành ở đó. Màn này không còn thao tác được đơn Macaron.
        </div>
      )}
      {(activeStation === 'xuong42' || activeStation === 'all') && (
        <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-secondary)', background: 'var(--surface-sunken)', borderRadius: 'var(--radius-sm)', padding: '8px 10px' }}>
          🏫 Đơn Trường học chỉ Giám đốc và Trợ Lý Giám Đốc Xưởng 42 xử lý được, trong màn <b>Đơn Hàng</b>.
        </div>
      )}

      {/* Danh sách đơn hàng dạng thu gọn — click để xem chi tiết */}
      {loading ? (
        <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-muted)' }}>Đang tải...</div>
      ) : visibleOrders.length === 0 ? (
        <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-muted)' }}>Không có đơn nào đang chờ xử lý.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {visibleOrders.map((o) => (
            <CompactOrderRow
              key={o.id}
              order={o}
              onAccept={handleAccept}
              onReady={handleReady}
              canAct={canAct}
              hasIncident={incidentOrderIds.has(o.id)}
              profile={profile}
              onlineProfiles={onlineProfiles}
              onStageStart={handleStageStart}
              onStageComplete={handleStageComplete}
              onStageReassign={handleStageReassign}
            />
          ))}
        </div>
      )}

      {showProductionLog && (
        <ProductionLogModal
          onClose={() => setShowProductionLog(false)}
          onSaved={() => { setShowProductionLog(false); setProductionLogRefreshKey((k) => k + 1); }}
        />
      )}
    </div>
  );
}
