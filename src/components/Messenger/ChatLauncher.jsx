import React, { useEffect, useState } from 'react';
import './messenger-chat.css';
import ChatWindowModal from './ChatWindowModal';

// Nút chat nổi (góc dưới phải) hiện xuyên suốt toàn app khi đã đăng nhập —
// bấm vào mở cửa sổ Messenger toàn màn hình (trên mobile) / dạng cửa sổ nổi
// (trên desktop, qua CSS max-width trong messenger-chat.css).
export function ChatLauncher({ profile }) {
  const [open, setOpen] = useState(false);

  // Đóng chat bằng phím Esc cho tiện dùng trên desktop.
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  if (!profile) return null;

  return (
    <>
      {!open && (
        <div className="sumi-chat-launcher-stack">
          <button className="m-chat-avatar-btn" title="Mở tin nhắn nội bộ" onClick={() => setOpen(true)}>
            <div className="m-chat-avatar-img" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F5EBE1', fontSize: 22 }}>💬</div>
            <span className="m-online-badge" />
          </button>
        </div>
      )}

      {open && (
        <div className="sumi-chat-launcher-overlay">
          <div className="sumi-chat-launcher-window">
            <ChatWindowModal profile={profile} onClose={() => setOpen(false)} />
          </div>
        </div>
      )}
    </>
  );
}
