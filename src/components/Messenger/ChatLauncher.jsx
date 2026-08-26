import React, { useEffect, useState, useCallback, useMemo } from 'react';
import './messenger-chat.css';
import ChatWindowModal from './ChatWindowModal';
import { fetchMyRoomIds, fetchUnreadCounts, subscribeToMyRooms } from '../../lib/chat';
import { notify } from '../../lib/toast';

// Nút chat nổi (góc dưới phải) hiện xuyên suốt toàn app khi đã đăng nhập —
// bấm vào mở cửa sổ Messenger toàn màn hình (trên mobile) / dạng cửa sổ nổi
// (trên desktop, qua CSS max-width trong messenger-chat.css).
export function ChatLauncher({ profile }) {
  const [open, setOpen] = useState(false);
  const [roomIds, setRoomIds] = useState([]);
  const [unreadCounts, setUnreadCounts] = useState({}); // room_id -> số tin chưa đọc
  const [pendingRoomId, setPendingRoomId] = useState(null); // mở thẳng phòng này khi bấm từ toast

  const unreadTotal = useMemo(() => Object.values(unreadCounts).reduce((s, n) => s + n, 0), [unreadCounts]);

  const refreshUnread = useCallback(() => {
    if (!profile?.id) return;
    fetchUnreadCounts(profile.id).then(setUnreadCounts).catch(() => {});
  }, [profile?.id]);

  useEffect(() => {
    if (!profile?.id) return;
    let cancelled = false;
    fetchMyRoomIds(profile.id).then((ids) => { if (!cancelled) setRoomIds(ids); });
    return () => { cancelled = true; };
  }, [profile?.id]);

  useEffect(() => { refreshUnread(); }, [refreshUnread]);

  // Lắng nghe tin nhắn mới ở TẤT CẢ phòng mình tham gia, kể cả khi đang đóng
  // cửa sổ chat — cập nhật huy hiệu chưa đọc + báo toast giống các loại
  // thông báo khác trong app (giao việc, đơn hàng...).
  useEffect(() => {
    if (!roomIds.length || !profile?.id) return;
    const unsubscribe = subscribeToMyRooms(roomIds, (msg) => {
      if (msg.sender_id === profile.id) return;
      refreshUnread();
      if (!open) {
        notify('chat_message', msg.content ? msg.content.slice(0, 80) : '📷 Đã gửi ảnh', msg.room_id);
      }
    });
    return () => unsubscribe();
  }, [roomIds, profile?.id, open, refreshUnread]);

  // Bấm vào toast tin nhắn -> App.jsx bắn sự kiện này thay vì đổi tab, vì
  // Messenger là cửa sổ nổi, không phải một trang trong sidebar.
  useEffect(() => {
    const onOpenMessenger = (e) => {
      setPendingRoomId(e.detail?.roomId || null);
      setOpen(true);
    };
    window.addEventListener('sumi-open-messenger', onOpenMessenger);
    return () => window.removeEventListener('sumi-open-messenger', onOpenMessenger);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const handleClose = () => {
    setOpen(false);
    setPendingRoomId(null);
    refreshUnread();
  };

  if (!profile) return null;

  return (
    <>
      {!open && (
        <div className="sumi-chat-launcher-stack">
          <button className="m-chat-avatar-btn" title="Mở tin nhắn nội bộ" onClick={() => setOpen(true)}>
            <div className="m-chat-avatar-img" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F5EBE1', fontSize: 22 }}>💬</div>
            {unreadTotal > 0 ? (
              <span className="m-unread-badge">{unreadTotal > 99 ? '99+' : unreadTotal}</span>
            ) : (
              <span className="m-online-badge" />
            )}
          </button>
        </div>
      )}

      {open && (
        <div className="sumi-chat-launcher-overlay">
          <div className="sumi-chat-launcher-window">
            <ChatWindowModal
              profile={profile}
              onClose={handleClose}
              initialRoomId={pendingRoomId}
              unreadCounts={unreadCounts}
              onRoomRead={refreshUnread}
            />
          </div>
        </div>
      )}
    </>
  );
}
