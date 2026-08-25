import React, { useEffect, useState } from 'react';
import { subscribeToasts, dismissToast } from '../lib/toast';

// Vẽ các tin nhắn thông báo ở góc trên bên phải (trên mobile thì tràn ngang).
// Bấm vào tin -> chuyển tới đúng trang phát sinh sự kiện.

const TONES = {
  primary: { bar: 'var(--action-primary)', soft: 'var(--surface-primary-soft)' },
  success: { bar: 'var(--status-success)', soft: 'var(--status-success-soft)' },
  info: { bar: 'var(--status-info)', soft: 'var(--status-info-soft)' },
  warning: { bar: 'var(--status-warning)', soft: 'var(--status-warning-soft)' },
};

function ToastCard({ item }) {
  const tone = TONES[item.tone] || TONES.primary;
  const clickable = Boolean(item.tab);

  const handleOpen = () => {
    if (!clickable) return;
    // Dùng lại đúng cơ chế điều hướng sẵn có của app
    window.dispatchEvent(
      new CustomEvent('sumi-navigate', {
        detail: { tab: item.tab, filter: item.filter },
      })
    );
    dismissToast(item.id);
  };

  const handleClose = (e) => {
    e.stopPropagation();
    dismissToast(item.id);
  };

  return (
    <div
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      onClick={handleOpen}
      onKeyDown={(e) => {
        if (clickable && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          handleOpen();
        }
      }}
      style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10,
        minHeight: 64,
        padding: '12px 48px 12px 14px',
        borderRadius: 14,
        border: '1px solid var(--border-subtle)',
        borderLeft: `5px solid ${tone.bar}`,
        background: 'var(--surface-card)',
        boxShadow: '0 8px 24px rgba(140, 90, 60, .22)',
        cursor: clickable ? 'pointer' : 'default',
        pointerEvents: 'auto',
        animation: 'sumi-toast-in .22s ease-out',
      }}
    >
      <span
        aria-hidden="true"
        style={{
          display: 'grid',
          placeItems: 'center',
          flexShrink: 0,
          width: 38,
          height: 38,
          borderRadius: 12,
          background: tone.soft,
          fontSize: 20,
        }}
      >
        {item.icon}
      </span>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ font: 'var(--text-label)', color: 'var(--text-primary)', fontWeight: 800 }}>
          {item.title}
        </div>
        {item.message && (
          <div
            style={{
              font: 'var(--text-caption)',
              color: 'var(--text-secondary)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {item.message}
          </div>
        )}
        {clickable && (
          <div style={{ marginTop: 2, font: 'var(--text-caption)', color: 'var(--text-link)', fontWeight: 700 }}>
            Bấm để xem →
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={handleClose}
        aria-label="Đóng thông báo"
        style={{
          // 44x44 theo quy định vùng chạm tối thiểu trên mobile. Nền trong
          // suốt nên nhìn vẫn gọn, chỉ vùng bấm là rộng cho dễ trúng.
          position: 'absolute',
          top: 2,
          right: 2,
          width: 44,
          height: 44,
          display: 'grid',
          placeItems: 'center',
          border: 0,
          borderRadius: 12,
          background: 'transparent',
          color: 'var(--text-muted)',
          fontSize: 15,
          lineHeight: 1,
          cursor: 'pointer',
        }}
      >
        ✕
      </button>
    </div>
  );
}

export default function ToastHost() {
  const [items, setItems] = useState([]);

  useEffect(() => subscribeToasts(setItems), []);

  if (items.length === 0) return null;

  return (
    <>
      <style>{`
        @keyframes sumi-toast-in {
          from { opacity: 0; transform: translateY(-8px) scale(.97); }
          to   { opacity: 1; transform: none; }
        }
        .sumi-toast-host {
          position: fixed;
          top: max(12px, env(safe-area-inset-top));
          right: 12px;
          z-index: 200;
          display: flex;
          flex-direction: column;
          gap: 10px;
          width: min(360px, calc(100vw - 24px));
          pointer-events: none;
        }
        @media (max-width: 640px) {
          .sumi-toast-host { left: 12px; right: 12px; width: auto; }
        }
        @media (prefers-reduced-motion: reduce) {
          .sumi-toast-host > div { animation: none !important; }
        }
      `}</style>
      <div className="sumi-toast-host">
        {items.map((it) => (
          <ToastCard key={it.id} item={it} />
        ))}
      </div>
    </>
  );
}
