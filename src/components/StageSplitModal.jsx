import React, { useEffect, useState } from 'react';
import { Button } from './forms/Button';
import { Input } from './forms/Input';
import { Select } from './forms/Select';
import { createOrderStages, updateOrder, fetchShiftLogsRange, fetchAllProfiles, fetchProducts } from '../lib/queries';
import { useAuth } from '../lib/AuthContext';
import { localDateStr } from '../lib/date';

const BLANK_STAGE = { stageName: '', assigneeId: '', assigneeName: '' };

function StageRow({ index, item, onChange, onRemove, canRemove, onlineOptions, productNames }) {
  const set = (k, v) => onChange({ ...item, [k]: v });
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 10, background: 'var(--surface-sunken)', borderRadius: 'var(--radius-sm)' }}>
      <div style={{ font: 'var(--text-caption)', color: 'var(--text-muted)' }}>Công đoạn {index + 1}</div>
      <Input
        placeholder="Tên công đoạn — VD: Chà kem, Đánh bột..."
        value={item.stageName}
        onChange={(e) => set('stageName', e.target.value)}
        list="stage-name-suggestions"
      />
      <Select
        value={item.assigneeId}
        onChange={(e) => {
          const opt = onlineOptions.find((o) => o.value === e.target.value);
          set('assigneeId', e.target.value);
          set('assigneeName', opt ? opt.label : '');
        }}
        options={onlineOptions}
        placeholder="Chọn người đang trực..."
      />
      {canRemove && <Button variant="ghost" size="sm" onClick={onRemove}>Xoá công đoạn này</Button>}
    </div>
  );
}

export function StageSplitModal({ order, onClose, onSaved }) {
  const { profile } = useAuth();
  const [onlineProfiles, setOnlineProfiles] = useState([]);
  const [productNames, setProductNames] = useState([]);
  const [stages, setStages] = useState([{ ...BLANK_STAGE }]);
  const [preFilledFromSolo, setPreFilledFromSolo] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const today = localDateStr();
    Promise.all([fetchShiftLogsRange(today, today), fetchAllProfiles(), fetchProducts({ activeOnly: true })])
      .then(([logs, profiles, products]) => {
        const onlineIds = new Set(
          logs.filter((l) => l.type === 'checkin' && !logs.some((c) => c.type === 'checkout' && c.staff_id === l.staff_id && c.work_date === l.work_date))
            .map((l) => l.staff_id)
        );
        const online = profiles.filter((p) => onlineIds.has(p.id));
        setOnlineProfiles(online);
        setProductNames(products.map((p) => p.name));

        if (order.status === 'dang_lam' && order.kitchen_staff_name && (order.order_stages || []).length === 0) {
          const matched = profiles.find((p) => p.full_name === order.kitchen_staff_name);
          setStages([{ stageName: 'Đã bắt đầu', assigneeId: matched?.id || '', assigneeName: order.kitchen_staff_name }]);
          setPreFilledFromSolo(true);
        }
      })
      .catch((err) => setError(err.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onlineOptions = onlineProfiles.map((p) => ({ value: p.id, label: p.full_name }));
  const updateStage = (i, next) => setStages(stages.map((s, idx) => (idx === i ? next : s)));
  const removeStage = (i) => setStages(stages.filter((_, idx) => idx !== i));

  const handleSave = async () => {
    if (stages.length < 2) { setError('Cần ít nhất 2 công đoạn — nếu chỉ 1 người làm thì dùng nút Nhận đơn bình thường.'); return; }
    if (stages.some((s) => !s.stageName.trim() || !s.assigneeName)) { setError('Điền đủ tên công đoạn và chọn người cho mỗi dòng.'); return; }
    setSaving(true);
    setError('');
    try {
      const rows = stages.map((s, i) => ({
        order_id: order.id, stage_index: i + 1, stage_name: s.stageName.trim(),
        assignee_id: s.assigneeId || null, assignee_name: s.assigneeName,
        status: i === 0 && preFilledFromSolo ? 'dang_lam' : 'cho_lam',
        started_at: i === 0 && preFilledFromSolo ? new Date().toISOString() : null,
        created_by: profile?.id || null,
      }));
      await createOrderStages(rows);
      if (order.status === 'moi') {
        await updateOrder(order.id, { status: 'dang_lam', kitchen_staff_name: stages[0].assigneeName });
      }
      onSaved?.();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'var(--surface-overlay)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 70, padding: 16 }} onClick={onClose}>
      <div style={{ background: 'var(--surface-card)', borderRadius: 'var(--radius-lg)', width: 420, maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto', padding: 20, boxShadow: 'var(--shadow-lg)', display: 'flex', flexDirection: 'column', gap: 12 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ font: 'var(--text-title)', color: 'var(--text-primary)' }}>Chia công đoạn — {order.order_code}</div>
        <div style={{ font: 'var(--text-caption)', color: 'var(--text-muted)' }}>Chỉ hiện người đang trực (đã bắt đầu ca hôm nay). Công đoạn sau bị khoá tới khi công đoạn trước xong.</div>
        <datalist id="stage-name-suggestions">
          {productNames.map((n) => <option key={n} value={n} />)}
        </datalist>
        {stages.map((s, i) => (
          <StageRow key={i} index={i} item={s} canRemove={stages.length > 1 && !(i === 0 && preFilledFromSolo)}
            onChange={(next) => updateStage(i, next)} onRemove={() => removeStage(i)}
            onlineOptions={onlineOptions} productNames={productNames} />
        ))}
        <Button variant="secondary" size="sm" onClick={() => setStages([...stages, { ...BLANK_STAGE }])}>+ Thêm công đoạn</Button>
        {error && <div style={{ font: 'var(--text-body-sm)', color: 'var(--status-danger)' }}>{error}</div>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <Button variant="secondary" size="sm" onClick={onClose} disabled={saving}>Huỷ</Button>
          <Button variant="primary" size="sm" onClick={handleSave} disabled={saving}>{saving ? 'Đang lưu...' : 'Chia công đoạn'}</Button>
        </div>
      </div>
    </div>
  );
}
