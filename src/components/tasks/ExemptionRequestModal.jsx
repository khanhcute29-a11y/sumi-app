import React, { useState } from 'react';
import { Button } from '../forms/Button';
import { Input } from '../forms/Input';
import { PhotoField } from '../PhotoField';
import { requestTaskExemption } from '../../lib/queries';

export function ExemptionRequestModal({ task, profile, onClose, onSent }) {
  const [reason, setReason] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSend = async () => {
    if (!reason.trim()) { setError('Nhập lý do xin miễn trừ.'); return; }
    setSaving(true); setError('');
    try {
      await requestTaskExemption({
        taskId: task.id, reason, photoUrl: photoUrl || null,
        requesterId: profile?.id, requesterName: profile?.full_name, requesterRole: profile?.role,
      });
      onSent?.();
      onClose();
    } catch (err) { setError(err.message); } finally { setSaving(false); }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'var(--surface-overlay)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 70, padding: 16 }} onClick={onClose}>
      <div style={{ background: 'var(--surface-card)', borderRadius: 'var(--radius-lg)', width: 380, maxWidth: '100%', padding: 20, boxShadow: 'var(--shadow-lg)', display: 'flex', flexDirection: 'column', gap: 12 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ font: 'var(--text-title)', color: 'var(--text-primary)' }}>Xin miễn trừ: {task.title}</div>
        <div style={{ font: 'var(--text-caption)', color: 'var(--text-muted)' }}>Cần sếp duyệt. Không có tuỳ chọn từ chối việc trực tiếp.</div>
        <Input label="Lý do" placeholder="VD: Bận việc khác, không đủ người..." value={reason} onChange={(e) => setReason(e.target.value)} />
        <PhotoField url={photoUrl} onChange={setPhotoUrl} label="Ảnh minh chứng (không bắt buộc)" prefix="task-exemption" />
        {error && <div style={{ font: 'var(--text-body-sm)', color: 'var(--status-danger)' }}>{error}</div>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <Button variant="secondary" size="sm" onClick={onClose} disabled={saving}>Huỷ</Button>
          <Button variant="danger" size="sm" onClick={handleSend} disabled={saving}>{saving ? 'Đang gửi...' : 'Gửi yêu cầu'}</Button>
        </div>
      </div>
    </div>
  );
}
