import React from 'react';
import { Sparkles, Bot } from 'lucide-react';

/**
 * Nút Tròn Nổi Gọi Trợ Lý "Gen" (Floating Action Button)
 * Đặt ở góc phải màn hình, thiết kế vừa vặn, không che thanh Bottom Navigation
 */
export function GenFloatingButton({ onClick, hasNotification = false }) {
  return (
    <button
      onClick={onClick}
      aria-label="Mở trợ lý AI Gen"
      title="Trợ lý AI Gen - Sumi Bakery"
      style={{
        position: 'fixed',
        bottom: '84px', // Cao hơn BottomNav để không bị che
        right: '16px',
        zIndex: 90,
        width: '54px',
        height: '54px',
        borderRadius: '50%',
        background: 'linear-gradient(135deg, #f05c2b 0%, #ff8c42 100%)',
        color: '#ffffff',
        border: '3px solid #ffffff',
        boxShadow: '0 4px 16px rgba(240, 92, 43, 0.4), 0 2px 6px rgba(0,0,0,0.15)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        transition: 'transform 0.2s ease, box-shadow 0.2s ease',
        outline: 'none',
        padding: 0
      }}
      onMouseEnter={(e) => (e.currentTarget.style.transform = 'scale(1.08)')}
      onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
    >
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
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
            border: '2px solid #ffffff'
          }}
        />
      )}
    </button>
  );
}
