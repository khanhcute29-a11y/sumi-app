import React from 'react';

const map = {
  fresh: { bg: 'var(--fifo-fresh-soft)', fg: '#2f6b2f', dot: 'var(--fifo-fresh)', label: 'Còn hạn' },
  soon: { bg: 'var(--fifo-soon-soft)', fg: '#95661a', dot: 'var(--fifo-soon)', label: 'Sắp hết hạn' },
  expired: { bg: 'var(--fifo-expired-soft)', fg: '#a13c38', dot: 'var(--fifo-expired)', label: 'Quá hạn' },
};

export function FifoTag({ status = 'fresh', date, style }) {
  const m = map[status] || map.fresh;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px',
      borderRadius: 'var(--radius-pill)', background: m.bg, color: m.fg, font: 'var(--text-caption)', ...style,
    }}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: m.dot, flexShrink: 0 }} />
      {m.label}{date ? ` · ${date}` : ''}
    </span>
  );
}
