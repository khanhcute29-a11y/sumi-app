// MOCKUP ONLY — Root Shell cho Notification & Sound Origin Inspector
// Truy cập: http://localhost:5173/?mockup=notifications
import React, { useState } from 'react';
import './mockup-notifications.css';
import SoundOriginInspector from './SoundOriginInspector.jsx';
import SoundTestSimulator from './SoundTestSimulator.jsx';
import NotificationCenterView from './NotificationCenterView.jsx';

export default function MockupNotificationsRoot() {
  const [tab, setTab] = useState('inspector'); // 'inspector' | 'simulator' | 'inbox'
  const [soundToast, setSoundToast] = useState('');

  const showToast = (msg) => {
    setSoundToast(msg);
    setTimeout(() => setSoundToast(''), 3000);
  };

  return (
    <div className="mkn-shell">
      {/* Top Header */}
      <div className="mkn-header">
        <div className="mkn-header-top">
          <button className="mkn-back" onClick={() => window.location.href = '/'}>
            ← App thật
          </button>
          <div style={{ flex: 1, textAlign: 'center' }}>
            <div className="mkn-header-title">Hệ Thống Thông Báo & Âm Thanh</div>
            <div className="mkn-header-sub">Nguồn gốc chuông và cơ chế Realtime</div>
          </div>
          <div style={{ width: 72 }} />
        </div>

        {/* Navigation Tabs */}
        <div className="mkn-nav-tabs">
          <button
            className={`mkn-nav-tab${tab === 'inspector' ? ' active' : ''}`}
            onClick={() => setTab('inspector')}
          >
            🗺️ Bản Đồ Nguồn Phát
          </button>
          <button
            className={`mkn-nav-tab${tab === 'simulator' ? ' active' : ''}`}
            onClick={() => setTab('simulator')}
          >
            🎮 Bàn Thử Chuông
          </button>
          <button
            className={`mkn-nav-tab${tab === 'inbox' ? ' active' : ''}`}
            onClick={() => setTab('inbox')}
          >
            📥 Hộp Thư Tin Nhắn
          </button>
        </div>
      </div>

      {/* Content views */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {tab === 'inspector' && <SoundOriginInspector onPlaySound={showToast} />}
        {tab === 'simulator' && <SoundTestSimulator onTriggerEvent={(s) => showToast(`🔔 Phát tín hiệu: ${s.pattern}`)} />}
        {tab === 'inbox' && <NotificationCenterView onPlayToast={showToast} />}
      </div>

      {/* Floating sound notification banner */}
      {soundToast && (
        <div className="mkn-sound-toast">
          {soundToast}
        </div>
      )}
    </div>
  );
}
