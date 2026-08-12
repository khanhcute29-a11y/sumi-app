import React from 'react';

export function TrustScoreBadge({ score = 3, locked = false, noData = false, style }) {
  const stars = Math.max(0, Math.min(5, score));
  if (noData) {
    return (
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 'var(--radius-md)',
        background: 'var(--surface-sunken)', color: 'var(--text-muted)', font: 'var(--text-label)', ...style,
      }}>
        <span>Chưa đủ dữ liệu</span>
      </div>
    );
  }
  const tone = locked ? { bg: 'var(--status-danger-soft)', fg: '#a13c38' } : stars >= 4 ? { bg: 'var(--status-success-soft)', fg: '#2f6b2f' } : { bg: 'var(--status-warning-soft)', fg: '#95661a' };
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 'var(--radius-md)',
      background: tone.bg, color: tone.fg, font: 'var(--text-label)', ...style,
    }}>
      <span>{'★'.repeat(stars)}{'☆'.repeat(5 - stars)}</span>
      <span>Điểm Tin Cậy</span>
      {locked && <span style={{ font: 'var(--text-caption)' }}>· Khóa COD</span>}
    </div>
  );
}
