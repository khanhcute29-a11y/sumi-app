import React, { useEffect, useState } from 'react';
import { Badge } from '../components/feedback/Badge';
import { Button } from '../components/forms/Button';
import { Tabs } from '../components/navigation/Tabs';
import {
  fetchApprovalRequests, resolveApprovalRequest,
  cancelOrder, deleteOrder, fetchOrderById, deleteShiftLog,
} from '../lib/queries';
import { useAuth } from '../lib/AuthContext';
import { IconCheck, IconBan, IconClock } from '../components/icons/FrogIcons';

const TYPE_LABELS = {
  order_edit: 'Yêu cầu sửa đơn',
  order_cancel: 'Yêu cầu khách hủy đơn',
  order_delete: 'Yêu cầu xoá đơn',
  shift_recheck: 'Yêu cầu chấm công lại',
};

function RequestRow({ req, canResolve, onResolved }) {
  const { profile } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const handleReject = async () => {
    setBusy(true);
    setError('');
    try {
      await resolveApprovalRequest(req.id, { status: 'rejected', resolvedBy: profile?.full_name });
      onResolved();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleApprove = async () => {
    setBusy(true);
    setError('');
    try {
      if (req.type === 'order_cancel') {
        await cancelOrder(req.order_id, { reason: req.reason, photoUrl: req.photo_url, staffName: req.requester_name });
      } else if (req.type === 'order_delete') {
        const order = await fetchOrderById(req.order_id);
        const itemsSummary = (order?.order_items || []).map((it) => `${it.name} x${it.qty}`).join(', ');
        await deleteOrder(req.order_id, {
          reason: req.reason, photoUrl: req.photo_url, staffName: req.requester_name,
          snapshot: { orderCode: order?.order_code || req.order_code, customerName: order?.customer?.name, itemsSummary, total: order?.total },
        });
      } else if (req.type === 'shift_recheck' && req.shift_log_id) {
        await deleteShiftLog(req.shift_log_id);
      }
      // order_edit: không có gì để tự động — sếp bấm Duyệt để báo đã xem, rồi tự vào đơn bấm "Sửa đơn".
      await resolveApprovalRequest(req.id, { status: 'approved', resolvedBy: profile?.full_name });
      onResolved();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ background: 'var(--surface-card)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-sm)', padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, flexWrap: 'wrap' }}>
        <div>
          <div style={{ font: 'var(--text-label)', color: 'var(--text-primary)' }}>{TYPE_LABELS[req.type] || req.type}{req.order_code ? ` — ${req.order_code}` : ''}</div>
          <div style={{ font: 'var(--text-caption)', color: 'var(--text-muted)' }}>{req.requester_name || 'Nhân viên'}{req.requester_role ? ` (${req.requester_role})` : ''} · {new Date(req.created_at).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}</div>
        </div>
        {req.status === 'pending' ? (
          <Badge tone="warning" icon={<IconClock size={13} />}>Chờ duyệt</Badge>
        ) : req.status === 'approved' ? (
          <Badge tone="success" icon={<IconCheck size={13} />}>Đã duyệt{req.resolved_by ? ` bởi ${req.resolved_by}` : ''}</Badge>
        ) : (
          <Badge tone="danger" icon={<IconBan size={13} />}>Đã từ chối{req.resolved_by ? ` bởi ${req.resolved_by}` : ''}</Badge>
        )}
      </div>
      {req.reason && <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-secondary)' }}>Lý do: {req.reason}</div>}
      {req.photo_url && (
        <a href={req.photo_url} target="_blank" rel="noreferrer">
          <img src={req.photo_url} alt="Minh chứng" style={{ width: 56, height: 56, borderRadius: 'var(--radius-sm)', objectFit: 'cover' }} />
        </a>
      )}
      {error && <div style={{ font: 'var(--text-body-sm)', color: 'var(--status-danger)' }}>{error}</div>}
      {canResolve && req.status === 'pending' && (
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <Button variant="secondary" size="sm" onClick={handleReject} disabled={busy}>Từ chối</Button>
          <Button variant="primary" size="sm" onClick={handleApprove} disabled={busy}>{busy ? 'Đang xử lý...' : 'Duyệt'}</Button>
        </div>
      )}
    </div>
  );
}

export default function ApprovalRequestsScreen() {
  const { profile } = useAuth();
  const canResolve = profile?.role === 'owner' || profile?.role === 'admin';
  const [tab, setTab] = useState('pending');
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = () => {
    setLoading(true);
    fetchApprovalRequests(tab === 'all' ? {} : { status: tab })
      .then((data) => { setRequests(data); setError(''); })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, [tab]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <div style={{ font: 'var(--text-display-md)', color: 'var(--text-primary)' }}>Yêu Cầu Duyệt</div>
        <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-muted)' }}>Sửa/hủy/xoá đơn và chấm công lại — chờ Chủ sở hữu duyệt tại đây</div>
      </div>
      <Tabs tabs={[{ key: 'pending', label: 'Chờ duyệt' }, { key: 'approved', label: 'Đã duyệt' }, { key: 'rejected', label: 'Đã từ chối' }, { key: 'all', label: 'Tất cả' }]} active={tab} onChange={setTab} />
      {error && <div style={{ font: 'var(--text-body-sm)', color: 'var(--status-danger)' }}>Lỗi tải dữ liệu: {error}</div>}
      {loading ? (
        <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-muted)' }}>Đang tải...</div>
      ) : requests.length === 0 ? (
        <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-muted)' }}>Không có yêu cầu nào.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {requests.map((r) => <RequestRow key={r.id} req={r} canResolve={canResolve} onResolved={load} />)}
        </div>
      )}
    </div>
  );
}
