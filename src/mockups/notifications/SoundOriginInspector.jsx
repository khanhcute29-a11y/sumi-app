// MOCKUP ONLY — Bản đồ & Nguồn Gốc Âm Thanh Chuông trong SUMI App
import React, { useState } from 'react';
import { SOUND_ORIGINS, playSyntheticChime } from './mock-data.js';

export default function SoundOriginInspector({ onPlaySound }) {
  const [playingId, setPlayingId] = useState(null);

  const handleTest = (sound) => {
    setPlayingId(sound.id);
    playSyntheticChime(sound.soundType);
    if (onPlaySound) {
      onPlaySound(`🔔 Đang phát: ${sound.pattern}`);
    }
    setTimeout(() => setPlayingId(null), 1200);
  };

  return (
    <div style={{ padding: '16px 16px 100px' }}>
      <div style={{ background: '#2d1c10', borderRadius: 16, padding: '14px 16px', color: '#fff', marginBottom: 16 }}>
        <div style={{ fontSize: 15, fontWeight: 900, color: '#ffd284', marginBottom: 4 }}>
          💡 Âm thanh chuông trong App đến từ đâu?
        </div>
        <div style={{ fontSize: 13, color: '#f6dcc7', lineHeight: 1.45 }}>
          Hệ thống kết hợp <strong>Web Audio API</strong> (sinh chuông tổng hợp nhẹ, không lag) và <strong>Supabase Realtime Broadcast</strong> để truyền tín hiệu tức thời giữa các thiết bị mà không cần reload trang.
        </div>
      </div>

      <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: '.1em', textTransform: 'uppercase', color: '#a08060', marginBottom: 12 }}>
        DANH SÁCH 7 NGUỒN PHÁT ÂM THANH & QUY TẮC
      </div>

      {SOUND_ORIGINS.map(sound => {
        const isPlaying = playingId === sound.id;
        return (
          <div key={sound.id} className={`mkn-inspector-card${isPlaying ? ' active-playing' : ''}`}>
            {/* Header */}
            <div className="mkn-card-head">
              <div className="mkn-card-icon" style={{ background: sound.bg, color: sound.color }}>
                {sound.icon}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="mkn-card-title">{sound.name}</div>
                <div className="mkn-card-pattern">{sound.pattern}</div>
              </div>
              <button className="mkn-play-btn" onClick={() => handleTest(sound)}>
                <span>▶</span> Nghe thử
              </button>
            </div>

            {/* Description */}
            <div style={{ fontSize: 13.5, color: '#493526', fontWeight: 600, marginBottom: 10 }}>
              {sound.description}
            </div>

            {/* Origin Details */}
            <div className="mkn-detail-box">
              <div className="mkn-row">
                <span className="mkn-row-label">🎯 Đối tượng:</span>
                <span className="mkn-row-val">{sound.audience}</span>
              </div>
              <div className="mkn-row">
                <span className="mkn-row-label">⚡ Kích hoạt:</span>
                <span className="mkn-row-val">{sound.codeOrigin.triggerRule}</span>
              </div>
              <div className="mkn-row">
                <span className="mkn-row-label">📁 File code:</span>
                <span className="mkn-row-val"><span className="mkn-code-pill">{sound.codeOrigin.sourceFile}</span></span>
              </div>
              <div className="mkn-row">
                <span className="mkn-row-label">📡 Realtime:</span>
                <span className="mkn-row-val"><span className="mkn-code-pill">{sound.codeOrigin.broadcastEvent}</span></span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
