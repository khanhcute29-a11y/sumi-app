import React, { useState } from 'react';
import { Button } from '../forms/Button';
import { Input } from '../forms/Input';
import { OrderCodePicker } from '../OrderCodePicker';
import { createAdhocTask } from '../../lib/queries';

export function AdhocReportModal({ profile, onClose, onSaved }) {
  const [title, setTitle] = useState('');
  const [orderCode, setOrderCode] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async () => {
    if (!title.trim()) { setError('Nhập tên việc.'); return; }
    setSaving(true); setError('');
    try {
      await createAdhocTask({ assigneeId: profile?.id, title, description: description || null, orderCode: orderCode || null, createdBy: profile?.id });
      onSaved?.();
      onClose();
    } catch (err) { setError(err.message); } finally { setSaving(false); }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'var(--surface-overlay)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 70, padding: 16 }} onClick={onClose}>
      <div style={{ background: 'var(--surface-card)', borderRadius: 'var(--radius-lg)', width: 380, maxWidth: '100%', padding: 20, boxShadow: 'var(--shadow-lg)', display: 'flex', flexDirection: 'column', gap: 12 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ font: 'var(--text-title)', color: 'var(--text-primary)' }}>Báo việc phát sinh</div>
        <div style={{ font: 'var(--text-caption)', color: 'var(--text-muted)' }}>Ghi nhận ngay, không cần chờ duyệt.</div>
        <Input label="Tên việc" placeholder="VD: Phụ ship đơn quá tải" value={title} onChange={(e) => setTitle(e.target.value)} />
        <OrderCodePicker label="Mã đơn liên quan (không bắt buộc)" value={orderCode} onChange={setOrderCode} />
        <Input label="Mô tả (không bắt buộc)" value={description} onChange={(e) => setDescription(e.target.value)} />
        {error && <div style={{ font: 'var(--text-body-sm)', color: 'var(--status-danger)' }}>{error}</div>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <Button variant="secondary" size="sm" onClick={onClose} disabled={saving}>Huỷ</Button>
          <Button size="sm" onClick={handleSave} disabled={saving}>{saving ? 'Đang lưu...' : 'Ghi nhận'}</Button>
        </div>
      </div>
    </div>
  );
}
