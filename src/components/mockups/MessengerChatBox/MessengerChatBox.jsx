import React, { useState } from 'react';
import '../../Messenger/messenger-chat.css';
import ChatWindowModal from '../../Messenger/ChatWindowModal';
import { AuthProvider, useAuth } from '../../../lib/AuthContext';

function MessengerChatBoxInner() {
  const { profile, loading } = useAuth();
  const [deviceMode, setDeviceMode] = useState('iphone'); // 'iphone' | 'fullscreen'
  const [isOpenChat, setIsOpenChat] = useState(true); // default open so user immediately sees it
  const [toastMsg, setToastMsg] = useState(null);

  // Active bottom navigation tab on simulated mobile phone
  const [activeBottomNav, setActiveBottomNav] = useState('orders'); // 'home' | 'orders' | 'kds' | 'shifts' | 'profile'

  const showToast = (msg) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 2500);
  };

  const handleOpenChat = () => {
    setIsOpenChat(true);
    showToast('💬 Đã mở hộp thoại Messenger SUMI');
  };

  return (
    <div className="phone-chat-simulator-stage">
      {/* 1. TOP SIMULATOR TOOLBAR */}
      <div className="chat-sim-toolbar">
        <span className="chat-sim-title">📱 Messenger Chat SUMI Bakery</span>
        <div className="chat-sim-toggles">
          <button
            className={`chat-toggle-btn ${deviceMode === 'iphone' ? 'active' : ''}`}
            onClick={() => setDeviceMode('iphone')}
          >
            iPhone 15 Pro
          </button>
          <button
            className={`chat-toggle-btn ${deviceMode === 'fullscreen' ? 'active' : ''}`}
            onClick={() => setDeviceMode('fullscreen')}
          >
            Toàn màn hình
          </button>
        </div>
      </div>

      {/* 2. SMARTPHONE HARDWARE SHELL FRAME */}
      <div className={`chat-phone-frame ${deviceMode === 'fullscreen' ? 'fullscreen-mode' : ''}`}>
        {/* Dynamic Island */}
        <div className="phone-dynamic-island">
          <div className="island-sensor" />
          <div className="island-camera" />
        </div>

        {/* Mobile Status Bar */}
        <div className="phone-status-bar">
          <span>{new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}</span>
          <div className="status-right-icons">
            <span>5G</span>
            <span>📶</span>
            <span>🔋 98%</span>
          </div>
        </div>

        {/* Live Toast */}
        {toastMsg && (
          <div style={{ position: 'absolute', top: 54, left: 14, right: 14, background: '#2D2319', color: '#FFFFFF', padding: '8px 12px', borderRadius: 10, fontSize: 12, fontWeight: 600, zIndex: 99, boxShadow: '0 4px 12px rgba(0,0,0,0.3)' }}>
            ⚡ {toastMsg}
          </div>
        )}

        {/* 3. MOBILE APP VIEWPORT (BACKGROUND APP) */}
        <div className="phone-app-viewport">
          <div style={{ background: '#FFFFFF', borderRadius: 16, padding: '10px 14px', border: '1px solid #EFE6DC', marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 34, height: 34, borderRadius: 10, background: '#F5EBE1', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, border: '1px solid #C88A4B' }}>
                🥐
              </div>
              <div>
                <strong style={{ fontSize: 14, color: '#2D2319', display: 'block' }}>SUMI Bakery POS</strong>
                <span style={{ fontSize: 11, color: '#7A6958' }}>{loading ? 'Đang tải tài khoản...' : (profile?.full_name || 'Chưa đăng nhập')}</span>
              </div>
            </div>
            {!loading && !profile && (
              <span style={{ background: '#FEE2E2', color: '#B42318', fontSize: 10.5, fontWeight: 700, padding: '2px 6px', borderRadius: 6 }}>
                🔒 Cần đăng nhập
              </span>
            )}
          </div>

          {!loading && !profile && (
            <div style={{ background: '#FFF7ED', border: '1.5px solid #FDBA74', borderRadius: 14, padding: 14, fontSize: 12.5, color: '#7C2D12' }}>
              ⚠️ Chưa đăng nhập vào Sumi Bakery. Sếp mở app chính (sumibakery.shop) đăng nhập trước, rồi quay lại trang này để chat với dữ liệu thật.
            </div>
          )}
        </div>

        {/* 4. FLOATING CHAT HEADS */}
        {!isOpenChat && (
          <div className="m-floating-chat-stack">
            <button className="m-chat-avatar-btn" title="Mở tin nhắn SUMI Messenger" onClick={handleOpenChat}>
              <div className="m-chat-avatar-img" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F5EBE1', fontSize: 22 }}>💬</div>
              <span className="m-online-badge" />
            </button>
            <button className="m-compose-btn" title="Soạn tin nhắn mới" onClick={handleOpenChat}>✍️</button>
          </div>
        )}

        {/* 5. ACTIVE FULLSCREEN MOBILE CHAT WINDOW MODAL */}
        {isOpenChat && profile && (
          <ChatWindowModal profile={profile} onClose={() => setIsOpenChat(false)} />
        )}

        {/* 6. MOBILE BOTTOM NAVIGATION (5 TABS) */}
        <nav className="chat-phone-bottom-nav">
          <button className={`c-nav-item ${activeBottomNav === 'home' ? 'active' : ''}`} onClick={() => setActiveBottomNav('home')}>
            <span className="c-nav-icon">🏠</span><span>Trang chủ</span>
          </button>
          <button className={`c-nav-item ${activeBottomNav === 'orders' ? 'active' : ''}`} onClick={() => setActiveBottomNav('orders')}>
            <span className="c-nav-icon">📦</span><span>Đơn hàng</span>
          </button>
          <button className={`c-nav-item ${activeBottomNav === 'kds' ? 'active' : ''}`} onClick={() => setActiveBottomNav('kds')}>
            <span className="c-nav-icon">👨‍🍳</span><span>Bếp KDS</span>
          </button>
          <button className={`c-nav-item ${activeBottomNav === 'shifts' ? 'active' : ''}`} onClick={() => setActiveBottomNav('shifts')}>
            <span className="c-nav-icon">⏱️</span><span>Ca làm</span>
          </button>
          <button className={`c-nav-item ${activeBottomNav === 'profile' ? 'active' : ''}`} onClick={() => setActiveBottomNav('profile')}>
            <span className="c-nav-icon">👤</span><span>Tôi</span>
          </button>
        </nav>

        <div className="phone-home-indicator" />
      </div>
    </div>
  );
}

export default function MessengerChatBox() {
  return (
    <AuthProvider>
      <MessengerChatBoxInner />
    </AuthProvider>
  );
}
