import React, { useEffect, useState } from 'react';
import { Button } from '../forms/Button';
import { fetchTasks, deleteTask } from '../../lib/queries';
import { AdhocReportModal } from './AdhocReportModal';

export function AdhocTasksTab({ profile, isOwner, viewingStaffId, orderCodeFilter, refreshKey }) {
  const [tasks, setTasks] = useState([]);
  const [error, setError] = useState('');
  const [showReport, setShowReport] = useState(false);
  const [busyId, setBusyId] = useState('');

  const load = () => {
    fetchTasks({ assigneeId: viewingStaffId, category: 'adhoc' })
      .then((data) => { setTasks(data); setError(''); })
      .catch((err) => setError(err.message));
  };

  useEffect(() => { load(); }, [viewingStaffId, refreshKey]);

  const visible = orderCodeFilter ? tasks.filter((t) => (t.order_code || '').includes(orderCodeFilter)) : tasks;
  const canReport = profile?.id === viewingStaffId;

  const handleDelete = async (id) => {
    setBusyId(id); setError('');
    try { await deleteTask(id); load(); } catch (err) { setError(err.message); } finally { setBusyId(''); }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {canReport && <Button size="sm" onClick={() => setShowReport(true)} style={{ alignSelf: 'flex-start' }}>Báo việc phát sinh</Button>}
      {visible.length === 0 && <div style={{ font: 'var(--text-body)', color: 'var(--text-muted)' }}>Chưa có việc phát sinh nào.</div>}
      {visible.map((t) => (
        <div key={t.id} style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: 10, background: 'var(--surface-sunken)', borderRadius: 'var(--radius-sm)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
            <span style={{ font: 'var(--text-label)', color: 'var(--text-primary)' }}>{t.title}</span>
            <span style={{ font: 'var(--text-caption)', color: 'var(--text-muted)' }}>{new Date(t.created_at).toLocaleString('vi-VN')}</span>
          </div>
          {t.description && <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-muted)' }}>{t.description}</div>}
          {t.order_code && <div style={{ font: 'var(--text-caption)', color: 'var(--text-muted)' }}>Mã đơn: {t.order_code}</div>}
          {isOwner && (
            <Button size="sm" variant="danger" disabled={busyId === t.id} onClick={() => handleDelete(t.id)} style={{ alignSelf: 'flex-start' }}>Xoá</Button>
          )}
        </div>
      ))}
      {error && <div style={{ font: 'var(--text-body-sm)', color: 'var(--status-danger)' }}>{error}</div>}
      {showReport && <AdhocReportModal profile={profile} onClose={() => setShowReport(false)} onSaved={load} />}
    </div>
  );
}
