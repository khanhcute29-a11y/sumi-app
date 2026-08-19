import React, { useEffect, useState } from 'react';
import { Button } from '../forms/Button';
import { fetchTasks, completeTask, fetchApprovalRequests } from '../../lib/queries';
import { AssignTaskModal } from './AssignTaskModal';
import { ExemptionRequestModal } from './ExemptionRequestModal';

export function AssignedTasksTab({ profile, isOwner, viewingStaffId, staffList, orderCodeFilter, refreshKey }) {
  const [tasks, setTasks] = useState([]);
  const [pendingExemptionTaskIds, setPendingExemptionTaskIds] = useState([]);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState('');
  const [showAssign, setShowAssign] = useState(false);
  const [exemptTarget, setExemptTarget] = useState(null);

  const load = () => {
    Promise.all([
      fetchTasks({ assigneeId: viewingStaffId, category: 'assigned' }),
      fetchApprovalRequests({ status: 'pending', type: 'task_exemption' }).catch(() => []),
    ])
      .then(([data, reqs]) => {
        setTasks(data);
        const ids = new Set(data.map((t) => t.id));
        setPendingExemptionTaskIds(reqs.filter((r) => r.task_id && ids.has(r.task_id)).map((r) => r.task_id));
        setError('');
      })
      .catch((err) => setError(err.message));
  };

  useEffect(() => { load(); }, [viewingStaffId, refreshKey]);

  const visible = orderCodeFilter ? tasks.filter((t) => (t.order_code || '').includes(orderCodeFilter)) : tasks;

  const handleComplete = async (id) => {
    setBusyId(id); setError('');
    try { await completeTask(id); load(); } catch (err) { setError(err.message); } finally { setBusyId(''); }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {isOwner && <Button size="sm" onClick={() => setShowAssign(true)} style={{ alignSelf: 'flex-start' }}>Giao việc mới</Button>}
      {visible.length === 0 && <div style={{ font: 'var(--text-body)', color: 'var(--text-muted)' }}>Không có việc được giao.</div>}
      {visible.map((t) => (
        <div key={t.id} style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: 10, background: 'var(--surface-sunken)', borderRadius: 'var(--radius-sm)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
            <span style={{ font: 'var(--text-label)', color: 'var(--text-primary)' }}>{t.title}</span>
            <span style={{ font: 'var(--text-caption)', color: t.status === 'done' && t.late ? 'var(--status-danger)' : t.status === 'done' ? 'var(--status-success)' : 'var(--text-muted)' }}>
              {t.status === 'done' ? (t.late ? 'Hoàn thành (trễ)' : 'Hoàn thành') : t.status === 'exempted' ? 'Đã miễn trừ' : 'Chưa xong'}
            </span>
          </div>
          {t.description && <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-muted)' }}>{t.description}</div>}
          {t.order_code && <div style={{ font: 'var(--text-caption)', color: 'var(--text-muted)' }}>Mã đơn: {t.order_code}</div>}
          {t.deadline && <div style={{ font: 'var(--text-caption)', color: 'var(--text-muted)' }}>Hạn: {new Date(t.deadline).toLocaleString('vi-VN')}</div>}
          {pendingExemptionTaskIds.includes(t.id) && t.status === 'open' && (
            <div style={{ font: 'var(--text-caption)', color: 'var(--status-warning)' }}>Đang chờ duyệt miễn trừ</div>
          )}
          {t.assignee_id === profile?.id && t.status === 'open' && (
            <div style={{ display: 'flex', gap: 8 }}>
              <Button size="sm" disabled={busyId === t.id} onClick={() => handleComplete(t.id)}>Hoàn thành</Button>
              {!pendingExemptionTaskIds.includes(t.id) && (
                <Button size="sm" variant="secondary" onClick={() => setExemptTarget(t)}>Xin miễn trừ</Button>
              )}
            </div>
          )}
        </div>
      ))}
      {error && <div style={{ font: 'var(--text-body-sm)', color: 'var(--status-danger)' }}>{error}</div>}
      {showAssign && <AssignTaskModal staffList={staffList} profile={profile} onClose={() => setShowAssign(false)} onSaved={load} />}
      {exemptTarget && <ExemptionRequestModal task={exemptTarget} profile={profile} onClose={() => setExemptTarget(null)} onSent={load} />}
    </div>
  );
}
