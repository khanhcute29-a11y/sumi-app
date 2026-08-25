// MOCKUP ONLY — Hộp Thư Thông Báo (Notification Center)
import React, { useState } from 'react';
import { MOCK_NOTIFICATIONS, SOUND_ORIGINS, playSyntheticChime } from './mock-data.js';

export default function NotificationCenterView({ onPlayToast }) {
  const [items, setItems] = useState(MOCK_NOTIFICATIONS);
  const [filter, setFilter] = useState('all');

  const unreadCount = items.filter(i => !i.isRead).length;

  const handleRead = (id, soundId) => {
    setItems(prev => prev.map(item => item.id === id ? { ...item, isRead: true } : item));
    const sound = SOUND_ORIGINS.find(s => s.id === soundId);
    if (sound) {
      playSyntheticChime(sound.soundType);
      if (onPlayToast) onPlayToast(`🔔 Âm thanh ứng với tin: ${sound.pattern}`);
    }
  };

  const markAllRead = () => {
    setItems(prev => prev.map(i => ({ ...i, isRead: true })));
    if (onPlayToast) onPlayToast('✅ Đã đánh dấu đọc tất cả tin');
  };

  const filteredItems = filter === 'all'
    ? items
    : filter === 'unread'
      ? items.filter(i => !i.isRead)
      : items.filter(i => i.type === filter);

  return (
    <div style={{ padding: '16px 16px 100px' }}>
      {/* Header bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 900, color: '#a08060', textTransform: 'uppercase', letterSpacing: '.08em' }}>
          Hộp Thư ({unreadCount} tin chưa đọc)
        </div>
        {unreadCount > 0 && (
          <button
            onClick={markAllRead}
            style={{ background: 'none', border: 'none', color: '#C88A4B', fontSize: 13, fontWeight: 800, cursor: 'pointer' }}
          >
            Đọc tất cả ✓
          </button>
        )}
      </div>

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 10, scrollbarWidth: 'none' }}>
        {[
          { key: 'all', label: 'Tất cả' },
          { key: 'unread', label: 'Chưa đọc' },
          { key: 'alert', label: '🚨 Khẩn cấp' },
          { key: 'kitchen', label: '👩‍🍳 Bếp' },
          { key: 'delivery', label: '🛵 Vận chuyển' },
          { key: 'announcement', label: '📢 Bảng tin' },
        ].map(t => (
          <button
            key={t.key}
            onClick={() => setFilter(t.key)}
            style={{
              padding: '6px 12px',
              borderRadius: 16,
              border: '2px solid #eadcca',
              background: filter === t.key ? '#2d1c10' : '#fff',
              color: filter === t.key ? '#fff' : '#725f50',
              fontSize: 12,
              fontWeight: 800,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* List items */}
      {filteredItems.map(item => (
        <div
          key={item.id}
          className={`mkn-notif-item${!item.isRead ? ' unread' : ''}`}
          onClick={() => handleRead(item.id, item.soundId)}
        >
          <div className="mkn-notif-icon" style={{ background: item.bg, color: item.color }}>
            {item.icon}
          </div>
          <div className="mkn-notif-body">
            <div className="mkn-notif-title" style={{ color: item.isRead ? '#2d1c10' : item.color }}>
              {item.title}
            </div>
            <div className="mkn-notif-text">{item.body}</div>
            <div className="mkn-notif-footer">
              <span className="mkn-notif-badge" style={{ background: item.bg, color: item.color }}>
                {item.badge}
              </span>
              <span>{item.time} {!item.isRead && '●'}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
