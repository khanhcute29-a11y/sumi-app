import React, { useEffect, useState } from 'react';
import { Button } from '../forms/Button';
import { reportTaskProgress, fetchTaskProgressReports } from '../../lib/queries';

export function ProgressReportModal({ task, onClose, onSent }) {
  const [reports, setReports] = useState([]);
  const [percent, setPercent] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchTaskProgressReports(task.id).then(setReports).catch(() => {});
  }, [task.id]);

  const handleSend = async () => {
    const p = Number(percent);
    if (!percent || Number.isNaN(p) || p < 0 || p > 100) { setError('Nhập % tiến độ hợp lệ (0-100).'); return; }
    setSaving(true); setError('');
    try {
      await reportTaskProgress(task.id, p, note);
      setPercent(''); setNote('');
      const data = await fetchTaskProgressReports(task.id);
      setReports(data);
      onSent?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'var(--surface-overlay)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 70, padding: 16 }} onClick={onClose}>
      <div style={{ background: 'var(--surface-card)', borderRadius: 'var(--radius-lg)', width: 380, maxWidth: '100%', boxShadow: 'var(--shadow-lg)' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ font: 'var(--text-display-sm)', color: 'var(--text-primary)' }}>Báo cáo tiến độ</div>
          <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-secondary)' }}>{task.title}</div>

          {reports.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 140, overflowY: 'auto' }}>
              {reports.map((r, i) => (
                <div key={r.id} style={{ font: 'var(--text-caption)', color: 'var(--text-muted)', display: 'flex', justifyContent: 'space-between', gap: 8, padding: '4px 0', borderBottom: '1px solid var(--border-subtle)' }}>
                  <span>Lần {i + 1}{r.note ? ` — ${r.note}` : ''}</span>
                  <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{r.percent}%</span>
                </div>
              ))}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              type="number" min="0" max="100" placeholder="% tiến độ"
              value={percent} onChange={(e) => setPercent(e.target.value)}
              style={{ width: 100, minHeight: 40, border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', padding: '0 10px', font: 'var(--text-body-sm)' }}
            />
            <input
              type="text" placeholder="Ghi chú (tuỳ chọn)"
              value={note} onChange={(e) => setNote(e.target.value)}
              style={{ flex: 1, minHeight: 40, border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', padding: '0 10px', font: 'var(--text-body-sm)' }}
            />
          </div>

          {error && <div style={{ font: 'var(--text-body-sm)', color: 'var(--status-danger)' }}>{error}</div>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <Button variant="secondary" size="sm" onClick={onClose} disabled={saving}>Đóng</Button>
            <Button variant="primary" size="sm" onClick={handleSend} disabled={saving}>{saving ? 'Đang gửi...' : 'Gửi báo cáo'}</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
