import React from 'react';
import { Checkbox } from './forms/Checkbox';

export function StaffMultiSelect({ staff, selectedIds, onChange }) {
  const toggle = (id) => {
    if (selectedIds.includes(id)) onChange(selectedIds.filter((x) => x !== id));
    else onChange([...selectedIds, id]);
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 220, overflowY: 'auto', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-sm)', padding: 10 }}>
      {staff.length === 0 && <div style={{ font: 'var(--text-caption)', color: 'var(--text-muted)' }}>Không có nhân viên.</div>}
      {staff.map((p) => (
        <Checkbox key={p.id} label={p.full_name} checked={selectedIds.includes(p.id)} onChange={() => toggle(p.id)} />
      ))}
    </div>
  );
}
