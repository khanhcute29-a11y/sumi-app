import React from 'react';

export function TrustScoreBadge({ score = 3, locked = false, style }) {
  const stars = Math.max(0, Math.min(5, score));
  const tone = locked ? { bg: 'var(--status-danger-soft)', fg: '#a13c38' } : stars >= 4 ? { bg: 'var(--status-success-soft)', fg: '#2f6b2f' } : { bg: 'var(--status-warning-soft)', fg: '#95661a' };
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 'var(--radius-md)',
      background: tone.bg, color: tone.fg, font: 'var(--text-label)', ...style,
    }}>
      <span>{'★'.repeat(stars)}{'☆'.repeat(5 - stars)}</span>
      <span>Customer Trust Score</span>
      {locked && <span style={{ font: 'var(--text-caption)' }}>· Khóa COD</span>}
    </div>
  );
}
