import React, { useEffect, useState } from 'react';
import { Checkbox } from '../forms/Checkbox';
import { Button } from '../forms/Button';
import { fetchTaskTemplates, fetchTaskCompletions, setTaskCompletion, confirmTaskCompletion } from '../../lib/queries';
import { localDateStr } from '../../lib/date';

export function DailyChecklistTab({ profile, isOwner, viewingStaffId, viewingStaffName, viewingStation }) {
  const [templates, setTemplates] = useState([]);
  const [completions, setCompletions] = useState([]);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const today = localDateStr(new Date());

  const load = () => {
    Promise.all([fetchTaskTemplates({ active: true }), fetchTaskCompletions({ date: today })])
      .then(([t, c]) => { setTemplates(t); setCompletions(c); setError(''); })
      .catch((err) => setError(err.message));
  };

  useEffect(load, [viewingStaffId]);

  const applicable = templates.filter((t) => !t.station || t.station === viewingStation);
  const completionFor = (templateId) => completions.find((c) => c.template_id === templateId && c.staff_id === viewingStaffId);
  const canToggle = !isOwner && profile?.id === viewingStaffId;

  const handleToggle = async (templateId, currentlyDone) => {
    setBusyId(templateId); setError('');
    try {
      await setTaskCompletion({ templateId, staffId: viewingStaffId, date: today, completed: !currentlyDone });
      load();
    } catch (err) { setError(err.message); } finally { setBusyId(''); }
  };

  const handleConfirm = async (completionId) => {
    setBusyId(completionId); setError('');
    try {
      await confirmTaskCompletion(completionId, { confirmedBy: profile?.id });
      load();
    } catch (err) { setError(err.message); } finally { setBusyId(''); }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ font: 'var(--text-caption)', color: 'var(--text-muted)' }}>Checklist ngày {today}{viewingStaffName ? ` — ${viewingStaffName}` : ''}</div>
      {applicable.length === 0 && <div style={{ font: 'var(--text-body)', color: 'var(--text-muted)' }}>Chưa có việc hằng ngày nào cho khâu này.</div>}
      {applicable.map((t) => {
        const c = completionFor(t.id);
        const done = !!c?.completed_at;
        const confirmed = !!c?.confirmed_at;
        return (
          <div key={t.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 10, background: 'var(--surface-sunken)', borderRadius: 'var(--radius-sm)' }}>
            <Checkbox label={t.title} checked={done} onChange={canToggle ? () => handleToggle(t.id, done) : undefined} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {confirmed && <span style={{ font: 'var(--text-caption)', color: 'var(--status-success)' }}>Đã xác nhận</span>}
              {isOwner && done && !confirmed && (
                <Button size="sm" variant="secondary" disabled={busyId === c.id} onClick={() => handleConfirm(c.id)}>Xác nhận</Button>
              )}
            </div>
          </div>
        );
      })}
      {error && <div style={{ font: 'var(--text-body-sm)', color: 'var(--status-danger)' }}>{error}</div>}
    </div>
  );
}
