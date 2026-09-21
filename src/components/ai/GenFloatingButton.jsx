import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Sparkles, Bot } from 'lucide-react';

const BUTTON_SIZE = 56;
const STORAGE_KEY = 'sumi_gen_bubble_pos';

/**
 * Nút Tròn Nổi Trợ Lý "Gen" (Draggable Floating Action Button)
 * Cho phép nhân sự kéo/di chuyển tới bất kỳ vị trí nào trên màn hình để không che chữ.
 * Tự động nhớ vị trí người dùng đã kéo qua localStorage.
 */
export function GenFloatingButton({ onClick, hasNotification = false }) {
  // Tính toán vị trí mặc định (góc dưới phải, trên thanh BottomNav)
  const getDefaultPos = () => {
    const width = typeof window !== 'undefined' ? window.innerWidth : 400;
    const height = typeof window !== 'undefined' ? window.innerHeight : 800;
    return {
      x: Math.max(12, width - BUTTON_SIZE - 16),
      y: Math.max(60, height - BUTTON_SIZE - 84)
    };
  };

  // Giới hạn vị trí nằm gọn trong khung nhìn màn hình
  const clampPos = useCallback((x, y) => {
    const width = typeof window !== 'undefined' ? window.innerWidth : 400;
    const height = typeof window !== 'undefined' ? window.innerHeight : 800;
    const minX = 8;
    const maxX = Math.max(minX, width - BUTTON_SIZE - 8);
    const minY = 50; // Tránh thanh header / tai thỏ
    const maxY = Math.max(minY, height - BUTTON_SIZE - 75); // Tránh thanh điều hướng đáy (BottomNav)
    return {
      x: Math.min(Math.max(x, minX), maxX),
      y: Math.min(Math.max(y, minY), maxY)
    };
  }, []);

  const [position, setPosition] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (typeof parsed.x === 'number' && typeof parsed.y === 'number') {
          return clampPos(parsed.x, parsed.y);
        }
      }
    } catch (_) {}
    return getDefaultPos();
  });

  const [isDragging, setIsDragging] = useState(false);
  const dragInfoRef = useRef({
    startX: 0,
    startY: 0,
    initialX: 0,
    initialY: 0,
    hasMoved: false
  });
  const buttonRef = useRef(null);

  // Tự động căn chỉnh lại vị trí khi xoay màn hình hoặc đổi kích thước
  useEffect(() => {
    const handleResize = () => {
      setPosition(prev => clampPos(prev.x, prev.y));
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [clampPos]);

  // Xử lý sự kiện kéo thả (hỗ trợ cả cảm ứng ngón tay mobile và chuột máy tính)
  const handlePointerDown = (e) => {
    // Chỉ nhận chuột trái hoặc cảm ứng
    if (e.button !== undefined && e.button !== 0) return;

    dragInfoRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      initialX: position.x,
      initialY: position.y,
      hasMoved: false
    };

    const handlePointerMove = (moveEvent) => {
      const dx = moveEvent.clientX - dragInfoRef.current.startX;
      const dy = moveEvent.clientY - dragInfoRef.current.startY;
      const distance = Math.hypot(dx, dy);

      if (distance > 5) {
        if (!dragInfoRef.current.hasMoved) {
          dragInfoRef.current.hasMoved = true;
          setIsDragging(true);
        }
        const nextX = dragInfoRef.current.initialX + dx;
        const nextY = dragInfoRef.current.initialY + dy;
        setPosition(clampPos(nextX, nextY));
      }
    };

    const handlePointerUp = () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);

      if (dragInfoRef.current.hasMoved) {
        // Lưu vị trí mới vào localStorage
        setPosition(curr => {
          try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(curr));
          } catch (_) {}
          return curr;
        });
        setTimeout(() => setIsDragging(false), 50);
      } else {
        setIsDragging(false);
        if (onClick) onClick();
      }
    };

    window.addEventListener('pointermove', handlePointerMove, { passive: true });
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);
  };

  return (
    <div
      ref={buttonRef}
      onPointerDown={handlePointerDown}
      role="button"
      tabIndex={0}
      aria-label="Mở trợ lý AI Gen (giữ để di chuyển)"
      title="Bấm để mở Trợ lý Gen / Giữ và kéo để di chuyển né chữ"
      style={{
        position: 'fixed',
        left: `${position.x}px`,
        top: `${position.y}px`,
        zIndex: 95,
        width: `${BUTTON_SIZE}px`,
        height: `${BUTTON_SIZE}px`,
        borderRadius: '50%',
        background: 'linear-gradient(135deg, #f05c2b 0%, #ff8c42 100%)',
        color: '#ffffff',
        border: '3px solid #ffffff',
        boxShadow: isDragging
          ? '0 12px 28px rgba(240, 92, 43, 0.6), 0 4px 10px rgba(0,0,0,0.3)'
          : '0 4px 16px rgba(240, 92, 43, 0.4), 0 2px 6px rgba(0,0,0,0.15)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: isDragging ? 'grabbing' : 'grab',
        transform: isDragging ? 'scale(1.12)' : 'scale(1)',
        transition: isDragging ? 'none' : 'transform 0.18s ease, box-shadow 0.18s ease',
        userSelect: 'none',
        WebkitUserSelect: 'none',
        touchAction: 'none', // Ngăn cuộn trang khi đang kéo icon trên điện thoại
        padding: 0
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          if (onClick) onClick();
        }
      }}
    >
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
        <Bot size={26} strokeWidth={2.2} />
        <span
          style={{
            position: 'absolute',
            top: '-4px',
            right: '-6px',
            background: '#ffd166',
            borderRadius: '50%',
            padding: '2px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          <Sparkles size={11} color="#b45309" strokeWidth={3} />
        </span>
      </div>

      {/* Chấm trạng thái thông báo nếu có */}
      {hasNotification && (
        <span
          style={{
            position: 'absolute',
            top: '2px',
            right: '2px',
            width: '12px',
            height: '12px',
            borderRadius: '50%',
            background: '#10b981',
            border: '2px solid #ffffff',
            pointerEvents: 'none'
          }}
        />
      )}
    </div>
  );
}
