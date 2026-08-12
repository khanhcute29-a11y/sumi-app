import React, { useState } from 'react';

export function ShippingAmountInput({ value, onChange, label, ...props }) {
  const [isFocused, setIsFocused] = useState(false);

  const handleChange = (e) => {
    let newVal = e.target.value;
    const oldVal = String(value || 0);

    // Only allow digits
    newVal = newVal.replace(/[^\d]/g, '');

    // Prevent deletion - new value must be >= old value or adding digits to it
    if (newVal.length < oldVal.length) {
      // User tried to delete - ignore
      e.target.value = oldVal;
      return;
    }

    // Allow only if it's the old value with more digits appended
    if (!newVal.startsWith(oldVal)) {
      e.target.value = oldVal;
      return;
    }

    onChange?.(Number(newVal) || 0);
  };

  const handleKeyDown = (e) => {
    // Block backspace and delete
    if (e.key === 'Backspace' || e.key === 'Delete') {
      e.preventDefault();
      return;
    }
    // Allow only digits and navigation keys
    if (!/[\d]/.test(e.key) && !['ArrowLeft', 'ArrowRight', 'Tab', 'Enter'].includes(e.key)) {
      e.preventDefault();
    }
  };

  return (
    <div>
      {label && <label style={{ display: 'block', font: 'var(--text-label)', color: 'var(--text-secondary)', marginBottom: 6 }}>{label}</label>}
      <input
        type="text"
        inputMode="numeric"
        value={value || 0}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        placeholder="0"
        style={{
          width: '100%',
          padding: '10px 12px',
          font: 'var(--text-body)',
          border: isFocused ? '2px solid var(--action-primary)' : '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-sm)',
          background: 'var(--surface-card)',
          color: 'var(--text-primary)',
          boxSizing: 'border-box',
        }}
        {...props}
      />
      <div style={{ font: 'var(--text-caption)', color: 'var(--text-muted)', marginTop: 4 }}>
        💡 Chỉ có thể thêm số, không thể xóa
      </div>
    </div>
  );
}
