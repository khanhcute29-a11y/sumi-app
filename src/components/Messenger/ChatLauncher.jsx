import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import './messenger-chat.css';
import ChatWindowModal from './ChatWindowModal';
import { fetchMyRoomIds, fetchUnreadCounts, subscribeToMyRooms } from '../../lib/chat';
import { notify } from '../../lib/toast';

// Cửa sổ chat nổi chỉ kéo thả được ở desktop (>= breakpoint này trong
// messenger-chat.css) — trên mobile nó là modal toàn màn hình, kéo không
// có ý nghĩa và sẽ đụng độ với thao tác vuốt/cuộn tin nhắn bình thường.
const DESKTOP_BREAKPOINT = 860;
const CHAT_WIDTH = 400;
const CHAT_HEIGHT = 620;
const POSITION_STORAGE_KEY = 'sumi_chat_position';

function clampPosition(x, y) {
  const maxX = Math.max(0, window.innerWidth - CHAT_WIDTH);
  const maxY = Math.max(0, window.innerHeight - CHAT_HEIGHT);
  return { x: Math.min(Math.max(0, x), maxX), y: Math.min(Math.max(0, y), maxY) };
}

function loadSavedPosition() {
  try {
    const raw = localStorage.getItem(POSITION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.x !== 'number' || typeof parsed?.y !== 'number') return null;
    return clampPosition(parsed.x, parsed.y);
  } catch {
    return null;
  }
}

// Nút chat nổi (góc dưới phải) hiện xuyên suốt toàn app khi đã đăng nhập —
// bấm vào mở cửa sổ Messenger toàn màn hình (trên mobile) / dạng cửa sổ nổi
// (trên desktop, qua CSS max-width trong messenger-chat.css).
export function ChatLauncher({ profile }) {
  const [open, setOpen] = useState(false);
  const [roomIds, setRoomIds] = useState([]);
  const [unreadCounts, setUnreadCounts] = useState({}); // room_id -> số tin chưa đọc
  const [activeRoomId, setActiveRoomId] = useState(null); // phòng đang xem trong cửa sổ chat (nếu đang mở)
  const [pendingRoomId, setPendingRoomId] = useState(null); // mở thẳng phòng này khi bấm từ toast

  // Vị trí cửa sổ chat khi đã kéo (desktop) — null nghĩa là chưa từng kéo,
  // giữ nguyên vị trí mặc định neo góc dưới phải theo CSS.
  const [dragPosition, setDragPosition] = useState(loadSavedPosition);
  const [isDraggingWindow, setIsDraggingWindow] = useState(false);
  const dragOffset = useRef({ x: 0, y: 0 });
  const windowRef = useRef(null);
  // Cờ ref song song với isDraggingWindow (state) — dùng trong listener touchmove
  // gắn thủ công (xem useEffect bên dưới) để tránh đọc closure cũ, vì effect đó
  // chỉ chạy 1 lần lúc mount chứ không re-run theo mỗi lần đổi isDraggingWindow.
  const isDraggingRef = useRef(false);

  const unreadTotal = useMemo(() => Object.values(unreadCounts).reduce((s, n) => s + n, 0), [unreadCounts]);

  // Chỉ dùng lúc mở app / mở lại cửa sổ chat — quét 1 lần toàn bộ số tin
  // chưa đọc từ DB. KHÔNG gọi lại mỗi khi có tin nhắn mới (xem bumpUnread
  // bên dưới), vì query này quét toàn bộ lịch sử tin nhắn của mọi phòng —
  // gọi lại liên tục mỗi tin nhắn từng gây giật/đứng hình khung chat khi
  // đang gõ, nhất là phòng nhóm đông người chat dồn dập.
  const refreshUnread = useCallback(() => {
    if (!profile?.id) return;
    fetchUnreadCounts(profile.id).then(setUnreadCounts).catch(() => {});
  }, [profile?.id]);

  // Cộng dồn tại chỗ khi có tin nhắn mới — không đụng tới DB.
  const bumpUnread = useCallback((roomId) => {
    setUnreadCounts((prev) => ({ ...prev, [roomId]: (prev[roomId] || 0) + 1 }));
  }, []);

  // Xoá tại chỗ khi 1 phòng đã được đọc (ChatWindowModal đã tự lưu
  // last_read_at xuống DB rồi, ở đây chỉ cần đồng bộ lại UI ngay lập tức).
  const clearUnread = useCallback((roomId) => {
    setUnreadCounts((prev) => {
      if (!prev[roomId]) return prev;
      const next = { ...prev };
      delete next[roomId];
      return next;
    });
  }, []);

  useEffect(() => {
    if (!profile?.id) return;
    let cancelled = false;
    fetchMyRoomIds(profile.id).then((ids) => { if (!cancelled) setRoomIds(ids); });
    return () => { cancelled = true; };
  }, [profile?.id]);

  useEffect(() => { refreshUnread(); }, [refreshUnread]);

  // Lắng nghe tin nhắn mới ở TẤT CẢ phòng mình tham gia, kể cả khi đang đóng
  // cửa sổ chat — cập nhật huy hiệu chưa đọc + báo toast giống các loại
  // thông báo khác trong app (giao việc, đơn hàng...). Bỏ qua phòng đang mở
  // xem (activeRoomId) vì ChatWindowModal tự đánh dấu đã đọc + xoá huy hiệu
  // qua onRoomRead rồi, cộng thêm ở đây sẽ bị đúp/nhấp nháy.
  useEffect(() => {
    if (!roomIds.length || !profile?.id) return;
    const unsubscribe = subscribeToMyRooms(roomIds, (msg) => {
      if (msg.sender_id === profile.id) return;
      if (open && msg.room_id === activeRoomId) return;
      bumpUnread(msg.room_id);
      if (!open) {
        notify('chat_message', msg.content ? msg.content.slice(0, 80) : '📷 Đã gửi ảnh', msg.room_id);
      }
    });
    return () => unsubscribe();
  }, [roomIds, profile?.id, open, activeRoomId, bumpUnread]);

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
    setActiveRoomId(null);
  };

  // Giữ cửa sổ luôn nằm trong màn hình khi resize (vd: thu nhỏ trình duyệt
  // sau khi đã kéo cửa sổ ra gần mép).
  useEffect(() => {
    const onResize = () => {
      setDragPosition((prev) => (prev ? clampPosition(prev.x, prev.y) : prev));
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const startDrag = (clientX, clientY) => {
    if (window.innerWidth < DESKTOP_BREAKPOINT) return; // mobile: fullscreen, không kéo
    const base = dragPosition || clampPosition(window.innerWidth - CHAT_WIDTH - 24, window.innerHeight - CHAT_HEIGHT - 24);
    dragOffset.current = { x: clientX - base.x, y: clientY - base.y };
    setDragPosition(base);
    isDraggingRef.current = true;
    setIsDraggingWindow(true);
  };

  const moveDrag = (clientX, clientY) => {
    setDragPosition(clampPosition(clientX - dragOffset.current.x, clientY - dragOffset.current.y));
  };

  const endDrag = () => {
    isDraggingRef.current = false;
    setIsDraggingWindow(false);
    setDragPosition((prev) => {
      if (prev) {
        try { localStorage.setItem(POSITION_STORAGE_KEY, JSON.stringify(prev)); } catch { /* ignore */ }
      }
      return prev;
    });
  };

  const handleHeaderMouseDown = (e) => {
    if (e.target.closest('.drag-handle-exclude, button, input, textarea, a')) return;
    if (!e.target.closest('.m-chat-header')) return;
    e.preventDefault();
    startDrag(e.clientX, e.clientY);
    const onMouseMove = (ev) => moveDrag(ev.clientX, ev.clientY);
    const onMouseUp = () => {
      endDrag();
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  const handleHeaderTouchStart = (e) => {
    if (e.target.closest('.drag-handle-exclude, button, input, textarea, a')) return;
    if (!e.target.closest('.m-chat-header')) return;
    const t = e.touches[0];
    startDrag(t.clientX, t.clientY);
  };
  const handleHeaderTouchEnd = () => {
    if (isDraggingRef.current) endDrag();
  };

  // touchmove gắn thủ công qua ref với { passive: false } thay vì prop JSX
  // onTouchMove — React 18 mặc định đăng ký listener touchmove ở root là
  // passive để tối ưu hiệu năng cuộn trang, nghĩa là gọi e.preventDefault()
  // từ handler onTouchMove khai theo kiểu JSX gần như không có tác dụng chặn
  // cuộn trang thật (đây chính xác là lý do khung chat "đơ", ngón tay vuốt
  // nhưng khung không theo vì trang web giành quyền cuộn trước). Chỉ addEventListener
  // thủ công với passive:false mới đảm bảo preventDefault ăn thật.
  useEffect(() => {
    const el = windowRef.current;
    if (!el) return;
    const onTouchMove = (e) => {
      if (!isDraggingRef.current) return;
      if (e.cancelable) e.preventDefault();
      const t = e.touches[0];
      moveDrag(t.clientX, t.clientY);
    };
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    return () => el.removeEventListener('touchmove', onTouchMove);
  }, []);

  const draggedWindowStyle = dragPosition
    ? {
        position: 'fixed', left: 0, top: 0, right: 'auto', bottom: 'auto',
        transform: `translate3d(${dragPosition.x}px, ${dragPosition.y}px, 0)`,
        willChange: 'transform',
        transition: isDraggingWindow ? 'none' : 'transform 0.15s ease',
        cursor: isDraggingWindow ? 'grabbing' : undefined,
      }
    : undefined;

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
          <div
            ref={windowRef}
            className="sumi-chat-launcher-window"
            style={draggedWindowStyle}
            onMouseDown={handleHeaderMouseDown}
            onTouchStart={handleHeaderTouchStart}
            onTouchEnd={handleHeaderTouchEnd}
          >
            <ChatWindowModal
              profile={profile}
              onClose={handleClose}
              initialRoomId={pendingRoomId}
              unreadCounts={unreadCounts}
              onRoomRead={clearUnread}
              onActiveRoomChange={setActiveRoomId}
            />
          </div>
        </div>
      )}
    </>
  );
}
