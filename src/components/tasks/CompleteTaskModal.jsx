import React, { useState } from 'react';
import { Button } from '../forms/Button';
import { uploadFile, completeTask } from '../../lib/queries';
import { useAuth } from '../../lib/AuthContext';

export function CompleteTaskModal({ task, onClose, onDone }) {
  const { profile } = useAuth();
  const [photo, setPhoto] = useState(null);
  const [photoPreview, setPhotoPreview] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async () => {
    if (!photo) { setError('Bắt buộc chụp ảnh trước khi hoàn thành việc.'); return; }
    setSaving(true); setError('');
    try {
      const uploaded = await uploadFile(photo, `task-completions/${profile?.id || 'unknown'}`);
      await completeTask(task.id, uploaded.url);
      onDone();
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
          <div style={{ font: 'var(--text-display-sm)', color: 'var(--text-primary)' }}>Hoàn thành việc</div>
          <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-secondary)' }}>{task.title}</div>

          <div>
            <label style={{ font: 'var(--text-caption)', fontWeight: 700, color: 'var(--text-primary)', display: 'block', marginBottom: 6 }}>
              Ảnh xác nhận hoàn thành (bắt buộc)
            </label>
            {photoPreview ? (
              <div style={{ position: 'relative', width: 100, height: 100, borderRadius: 'var(--radius-sm)', overflow: 'hidden', border: '1.5px solid var(--border-default)' }}>
                <img src={photoPreview} alt="Ảnh hoàn thành" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                <button
                  type="button"
                  onClick={() => { setPhoto(null); URL.revokeObjectURL(photoPreview); setPhotoPreview(''); }}
                  style={{ position: 'absolute', top: 3, right: 3, minWidth: 26, minHeight: 26, borderRadius: '50%', background: 'rgba(0,0,0,0.7)', color: '#fff', border: 0, fontSize: 12, cursor: 'pointer' }}
                >✕</button>
              </div>
            ) : (
              <label style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 48,
                border: '2px dashed var(--border-subtle)', borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                font: 'var(--text-body-sm)', color: 'var(--text-secondary)',
              }}>
                📷 Chụp ảnh
                <input
                  hidden type="file" accept="image/*" capture="environment"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    setPhoto(f);
                    setPhotoPreview(URL.createObjectURL(f));
                  }}
                />
              </label>
            )}
          </div>

          {error && <div style={{ font: 'var(--text-body-sm)', color: 'var(--status-danger)' }}>{error}</div>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <Button variant="secondary" size="sm" onClick={onClose} disabled={saving}>Huỷ</Button>
            <Button variant="primary" size="sm" onClick={handleSave} disabled={saving || !photo}>{saving ? 'Đang lưu...' : 'Hoàn thành'}</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
