import React, { useEffect, useState } from 'react';
import { subscribeAudioBlocked, unlockAudioNow, playTingSound } from '../lib/sound';

// Trình duyệt chặn phát tiếng cho tới khi người dùng có thao tác trên trang.
// Máy của người BẤM NÚT tự được mở khoá nhờ chính cú bấm đó; máy của người
// khác chỉ ngồi nhìn nên vẫn bị chặn — chuông chạy mà không ra tiếng.
// Thanh này hiện ra đúng lúc đó để nhân viên bấm một lần là xong cả phiên.
export default function AudioUnlockBanner() {
  const [blocked, setBlocked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => subscribeAudioBlocked(setBlocked), []);

  if (!blocked) return null;

  const handleUnlock = async () => {
    setBusy(true);
    setFailed(false);
    try {
      const ok = await unlockAudioNow();
      if (ok) playTingSound();      // kêu một tiếng để nhân viên biết đã bật được
      else setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        left: 12,
        right: 12,
        bottom: 'max(12px, env(safe-area-inset-bottom))',
        zIndex: 210,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        maxWidth: 520,
        margin: '0 auto',
        padding: '12px 14px',
        borderRadius: 14,
        border: '1px solid var(--border-subtle)',
        borderLeft: '5px solid var(--status-warning)',
        background: 'var(--surface-card)',
        boxShadow: '0 8px 24px rgba(140, 90, 60, .28)',
      }}
    >
      <span aria-hidden="true" style={{ fontSize: 22 }}>🔇</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ font: 'var(--text-label)', color: 'var(--text-primary)', fontWeight: 800 }}>
          Chuông báo đang bị tắt tiếng
        </div>
        <div style={{ font: 'var(--text-caption)', color: 'var(--text-secondary)' }}>
          {failed
            ? 'Chưa bật được — bấm lại, hoặc kiểm tra máy có đang để im lặng không.'
            : 'Trình duyệt chặn cho tới khi bạn bấm. Bấm một lần là nghe được cả ca.'}
        </div>
      </div>
      <button
        type="button"
        onClick={handleUnlock}
        disabled={busy}
        style={{
          flexShrink: 0,
          minHeight: 44,
          padding: '0 16px',
          borderRadius: 12,
          border: 0,
          background: 'var(--action-primary)',
          color: 'var(--text-on-primary)',
          fontWeight: 800,
          cursor: busy ? 'default' : 'pointer',
          opacity: busy ? 0.7 : 1,
        }}
      >
        {busy ? 'Đang bật...' : '🔊 Bật âm thanh'}
      </button>
    </div>
  );
}
