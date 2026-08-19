import React, { useEffect, useState } from 'react';
import { Checkbox } from '../forms/Checkbox';
import { Button } from '../forms/Button';
import { Input } from '../forms/Input';
import { Select } from '../forms/Select';
import {
  fetchTaskTemplates, fetchTaskCompletions, setTaskCompletion, confirmTaskCompletion,
  createTaskTemplate, updateTaskTemplate,
} from '../../lib/queries';
import { localDateStr } from '../../lib/date';

const ALL_STATIONS = '__all__';
const STATION_OPTIONS = [
  { value: ALL_STATIONS, label: 'Tất cả khâu' },
  { value: 'bakery', label: 'Bakery' },
  { value: 'nong', label: 'Bếp nóng' },
  { value: 'lanh', label: 'Bếp lạnh' },
  { value: 'xuong41', label: 'Xưởng 41' },
  { value: 'xuong42', label: 'Xưởng 42' },
];

export function DailyChecklistTab({ profile, isOwner, viewingStaffId, viewingStaffName, viewingStation, refreshKey }) {
  const [templates, setTemplates] = useState([]);
  const [completions, setCompletions] = useState([]);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [newStation, setNewStation] = useState(ALL_STATIONS);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const today = localDateStr(new Date());

  const load = () => {
    Promise.all([fetchTaskTemplates({ active: true }), fetchTaskCompletions({ date: today, staffId: viewingStaffId })])
      .then(([t, c]) => { setTemplates(t); setCompletions(c); setError(''); })
      .catch((err) => setError(err.message));
  };

  useEffect(() => { load(); }, [viewingStaffId, refreshKey]);

  const applicable = templates.filter((t) => !t.station || t.station === viewingStation);
  const completionFor = (templateId) => completions.find((c) => c.template_id === templateId && c.staff_id === viewingStaffId);
  const canToggle = profile?.id === viewingStaffId;

  const handleAddTemplate = async () => {
    if (!newTitle.trim()) { setError('Nhập tên việc hằng ngày.'); return; }
    setSavingTemplate(true); setError('');
    try {
      await createTaskTemplate({
        title: newTitle.trim(),
        station: newStation === ALL_STATIONS ? null : newStation,
        createdBy: profile?.id,
      });
      setNewTitle(''); setNewStation(ALL_STATIONS);
      load();
    } catch (err) { setError(err.message); } finally { setSavingTemplate(false); }
  };

  const handleHideTemplate = async (id) => {
    setBusyId(id); setError('');
    try { await updateTaskTemplate(id, { active: false }); load(); }
    catch (err) { setError(err.message); } finally { setBusyId(''); }
  };

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
      {isOwner && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap', padding: 10, background: 'var(--surface-sunken)', borderRadius: 'var(--radius-sm)' }}>
          <Input label="Việc hằng ngày mới" placeholder="VD: Vệ sinh bếp cuối ca" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} style={{ flex: '1 1 200px', minWidth: 0 }} />
          <Select label="Khâu áp dụng" value={newStation} onChange={(e) => setNewStation(e.target.value)} options={STATION_OPTIONS} placeholder="Tất cả khâu" style={{ maxWidth: 180 }} />
          <Button size="sm" disabled={savingTemplate} onClick={handleAddTemplate}>{savingTemplate ? 'Đang lưu...' : 'Thêm việc hằng ngày'}</Button>
        </div>
      )}
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
              {isOwner && (
                <Button size="sm" variant="ghost" disabled={busyId === t.id} onClick={() => handleHideTemplate(t.id)}>Ẩn</Button>
              )}
            </div>
          </div>
        );
      })}
      {error && <div style={{ font: 'var(--text-body-sm)', color: 'var(--status-danger)' }}>{error}</div>}
    </div>
  );
}
