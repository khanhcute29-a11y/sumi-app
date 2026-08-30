import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import './messenger-chat.css';
import ChatWindowModal from './ChatWindowModal';
import { fetchMyRoomIds, fetchUnreadCounts, subscribeToMyRooms } from '../../lib/chat';
import { notify } from '../../lib/toast';
import { IconChat } from '../icons/FrogIcons';

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

// Nút bong bóng chat tròn kéo được ở CẢ desktop lẫn mobile (khác cửa sổ chat
// ở trên, vì nút này luôn hiện — kể cả trên mobile không có cửa sổ nổi).
const BUBBLE_SIZE = 52; // khớp .m-chat-avatar-btn trong messenger-chat.css
const BUBBLE_EDGE_PADDING = 16;
const BUBBLE_BOTTOM_SAFE = 84; // tránh đè thanh điều hướng dưới, khớp vị trí mặc định hiện có
const BUBBLE_POSITION_KEY = 'sumi_chat_bubble_pos';
const DRAG_MOVE_THRESHOLD = 8; // px — dưới ngưỡng này tính là chạm (mở chat), trên là kéo

function clampBubblePosition(x, y) {
  const maxX = Math.max(BUBBLE_EDGE_PADDING, window.innerWidth - BUBBLE_SIZE - BUBBLE_EDGE_PADDING);
  const maxY = Math.max(BUBBLE_EDGE_PADDING, window.innerHeight - BUBBLE_SIZE - BUBBLE_EDGE_PADDING);
  return { x: Math.min(Math.max(BUBBLE_EDGE_PADDING, x), maxX), y: Math.min(Math.max(BUBBLE_EDGE_PADDING, y), maxY) };
}

function loadSavedBubblePosition() {
  try {
    const raw = localStorage.getItem(BUBBLE_POSITION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.x !== 'number' || typeof parsed?.y !== 'number') return null;
    return clampBubblePosition(parsed.x, parsed.y);
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

  // Vị trí nút bong bóng chat tròn khi đã kéo — null nghĩa là chưa từng kéo,
  // giữ nguyên vị trí mặc định theo CSS .sumi-chat-launcher-stack.
  const [bubblePosition, setBubblePosition] = useState(loadSavedBubblePosition);
  const [isDraggingBubble, setIsDraggingBubble] = useState(false);
  const bubbleDragOffset = useRef({ x: 0, y: 0 });
  const bubbleStartClient = useRef({ x: 0, y: 0 });
  const bubbleHasMoved = useRef(false); // phân biệt kéo (drag) và chạm (tap mở chat)
  const bubbleIsDraggingRef = useRef(false);
  const bubbleStackRef = useRef(null);

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

  // Vị trí "sống" trong lúc kéo — cập nhật thẳng vào DOM qua ref mỗi lần di
  // chuyển, KHÔNG setState mỗi pixel (tránh re-render toàn cây ChatLauncher
  // liên tục gây giật/nghẽn trên điện thoại yếu). State chỉ đồng bộ lại một
  // lần duy nhất khi kết thúc kéo (touchend/touchcancel/mouseup).
  const dragLivePos = useRef({ x: 0, y: 0 });

  const startDrag = (clientX, clientY) => {
    if (window.innerWidth < DESKTOP_BREAKPOINT) return; // mobile: fullscreen, không kéo
    const base = dragPosition || clampPosition(window.innerWidth - CHAT_WIDTH - 24, window.innerHeight - CHAT_HEIGHT - 24);
    dragOffset.current = { x: clientX - base.x, y: clientY - base.y };
    dragLivePos.current = base;
    setDragPosition(base);
    isDraggingRef.current = true;
    setIsDraggingWindow(true);
  };

  const moveDrag = (clientX, clientY) => {
    const next = clampPosition(clientX - dragOffset.current.x, clientY - dragOffset.current.y);
    dragLivePos.current = next;
    const el = windowRef.current;
    if (el) el.style.transform = `translate3d(${next.x}px, ${next.y}px, 0)`;
  };

  const endDrag = () => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;
    setIsDraggingWindow(false);
    const finalPos = dragLivePos.current;
    setDragPosition(finalPos);
    try { localStorage.setItem(POSITION_STORAGE_KEY, JSON.stringify(finalPos)); } catch { /* ignore */ }
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
  // touchcancel bắn ra khi hệ điều hành ngắt cử chỉ giữa chừng (cuộc gọi đến,
  // kéo Trung tâm điều khiển, thanh thông báo...) — touchend sẽ KHÔNG bắn
  // trong trường hợp này. Không xử lý thì isDraggingRef kẹt ở true mãi mãi,
  // lần chạm tiếp theo bị hiểu nhầm là đang kéo dở.
  const handleHeaderTouchCancel = () => {
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

  // ── Kéo thả nút bong bóng chat tròn (mobile + desktop) ──
  useEffect(() => {
    const onResize = () => {
      setBubblePosition((prev) => (prev ? clampBubblePosition(prev.x, prev.y) : prev));
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Cùng kỹ thuật như cửa sổ chat ở trên — xem ghi chú tại dragLivePos.
  const bubbleLivePos = useRef({ x: 0, y: 0 });

  const startBubbleDrag = (clientX, clientY) => {
    const base = bubblePosition || clampBubblePosition(
      window.innerWidth - BUBBLE_SIZE - BUBBLE_EDGE_PADDING,
      window.innerHeight - BUBBLE_SIZE - BUBBLE_BOTTOM_SAFE,
    );
    bubbleDragOffset.current = { x: clientX - base.x, y: clientY - base.y };
    bubbleStartClient.current = { x: clientX, y: clientY };
    bubbleHasMoved.current = false;
    bubbleIsDraggingRef.current = true;
    bubbleLivePos.current = base;
    setBubblePosition(base);
    setIsDraggingBubble(true);
  };

  const moveBubbleDrag = (clientX, clientY) => {
    const dist = Math.hypot(clientX - bubbleStartClient.current.x, clientY - bubbleStartClient.current.y);
    if (dist > DRAG_MOVE_THRESHOLD) bubbleHasMoved.current = true;
    const next = clampBubblePosition(clientX - bubbleDragOffset.current.x, clientY - bubbleDragOffset.current.y);
    bubbleLivePos.current = next;
    const el = bubbleStackRef.current;
    if (el) el.style.transform = `translate3d(${next.x}px, ${next.y}px, 0)`;
  };

  const endBubbleDrag = () => {
    if (!bubbleIsDraggingRef.current) return;
    bubbleIsDraggingRef.current = false;
    setIsDraggingBubble(false);
    const moved = bubbleHasMoved.current;
    const finalPos = bubbleLivePos.current;
    setBubblePosition(finalPos);
    try { localStorage.setItem(BUBBLE_POSITION_KEY, JSON.stringify(finalPos)); } catch { /* ignore */ }
    // Không dịch chuyển đáng kể -> đây là một cú chạm/click thật, mở chat.
    // Có dịch chuyển -> chỉ lưu vị trí mới, không mở.
    if (!moved) setOpen(true);
  };

  const handleBubbleMouseDown = (e) => {
    e.preventDefault();
    startBubbleDrag(e.clientX, e.clientY);
    const onMouseMove = (ev) => moveBubbleDrag(ev.clientX, ev.clientY);
    const onMouseUp = () => {
      endBubbleDrag();
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  const handleBubbleTouchStart = (e) => {
    const t = e.touches[0];
    startBubbleDrag(t.clientX, t.clientY);
  };
  const handleBubbleTouchEnd = () => {
    if (bubbleIsDraggingRef.current) endBubbleDrag();
  };
  const handleBubbleTouchCancel = () => {
    if (bubbleIsDraggingRef.current) endBubbleDrag();
  };

  // Cùng lý do như cửa sổ chat ở trên: touchmove gắn qua JSX prop bị React 18
  // đăng ký passive, preventDefault() không chặn được cuộn trang thật — phải
  // gắn thủ công qua ref với { passive: false }.
  useEffect(() => {
    const el = bubbleStackRef.current;
    if (!el) return;
    const onTouchMove = (e) => {
      if (!bubbleIsDraggingRef.current) return;
      if (e.cancelable) e.preventDefault();
      const t = e.touches[0];
      moveBubbleDrag(t.clientX, t.clientY);
    };
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    return () => el.removeEventListener('touchmove', onTouchMove);
  }, []);

  const draggedBubbleStyle = bubblePosition
    ? {
        position: 'fixed', left: 0, top: 0, right: 'auto', bottom: 'auto',
        transform: `translate3d(${bubblePosition.x}px, ${bubblePosition.y}px, 0)`,
        willChange: 'transform',
        transition: isDraggingBubble ? 'none' : 'transform 0.15s ease',
      }
    : undefined;

  if (!profile) return null;

  return (
    <>
      {!open && (
        <div
          ref={bubbleStackRef}
          className="sumi-chat-launcher-stack"
          style={draggedBubbleStyle}
          onMouseDown={handleBubbleMouseDown}
          onTouchStart={handleBubbleTouchStart}
          onTouchEnd={handleBubbleTouchEnd}
          onTouchCancel={handleBubbleTouchCancel}
        >
          <button className="m-chat-avatar-btn" title="Mở tin nhắn nội bộ" onClick={() => setOpen(true)}>
            <div className="m-chat-avatar-img" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F5EBE1' }}><IconChat size={24} style={{ color: '#2d1c10' }} /></div>
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
            onTouchCancel={handleHeaderTouchCancel}
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
