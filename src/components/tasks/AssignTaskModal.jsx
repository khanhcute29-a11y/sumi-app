import React, { useState } from 'react';
import { Button } from '../forms/Button';
import { Input } from '../forms/Input';
import { StaffMultiSelect } from '../StaffMultiSelect';
import { createAssignedTasks } from '../../lib/queries';

export function AssignTaskModal({ staffList, profile, onClose, onSaved }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [orderCode, setOrderCode] = useState('');
  const [deadline, setDeadline] = useState('');
  const [reminderAt,setReminderAt]=useState('');
  const [selectedIds, setSelectedIds] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async () => {
    if (!title.trim()) { setError('Nhập tên công việc.'); return; }
    if (selectedIds.length === 0) { setError('Chọn ít nhất 1 nhân viên.'); return; }
    setSaving(true); setError('');
    try {
      const batchId = crypto.randomUUID();
      const rows = selectedIds.map((assigneeId) => ({
        title, description: description || null, order_code: orderCode || null,
        deadline: deadline ? new Date(deadline).toISOString() : null,
        reminder_at:reminderAt?new Date(reminderAt).toISOString():null,
        assignee_id: assigneeId, batch_id: batchId, created_by: profile?.id || null,
      }));
      await createAssignedTasks(rows);
      onSaved?.();
      onClose();
    } catch (err) { setError(err.message); } finally { setSaving(false); }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'var(--surface-overlay)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 70, padding: 16 }} onClick={onClose}>
      <div style={{ background: 'var(--surface-card)', borderRadius: 'var(--radius-lg)', width: 420, maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto', padding: 20, boxShadow: 'var(--shadow-lg)', display: 'flex', flexDirection: 'column', gap: 12 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ font: 'var(--text-title)', color: 'var(--text-primary)' }}>Giao việc mới</div>
        <Input label="Tên công việc" value={title} onChange={(e) => setTitle(e.target.value)} />
        <Input label="Mô tả (không bắt buộc)" value={description} onChange={(e) => setDescription(e.target.value)} />
        <Input label="Mã đơn liên quan (không bắt buộc)" value={orderCode} onChange={(e) => setOrderCode(e.target.value)} />
        <Input label="Hạn chót (không bắt buộc)" type="datetime-local" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
        <Input label="Nhắc chuông lúc (không bắt buộc)" type="datetime-local" value={reminderAt} onChange={e=>setReminderAt(e.target.value)} />
        <div style={{ font: 'var(--text-label)', color: 'var(--text-primary)' }}>Giao cho</div>
        <StaffMultiSelect staff={staffList} selectedIds={selectedIds} onChange={setSelectedIds} />
        {error && <div style={{ font: 'var(--text-body-sm)', color: 'var(--status-danger)' }}>{error}</div>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <Button variant="secondary" size="sm" onClick={onClose} disabled={saving}>Huỷ</Button>
          <Button size="sm" onClick={handleSave} disabled={saving}>{saving ? 'Đang lưu...' : 'Giao việc'}</Button>
        </div>
      </div>
    </div>
  );
}
