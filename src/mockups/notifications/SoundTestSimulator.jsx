// MOCKUP ONLY — Simulator phát chuông và mô phỏng sự kiện thời gian thực
import React, { useState } from 'react';
import { SOUND_ORIGINS, playSyntheticChime } from './mock-data.js';

export default function SoundTestSimulator({ onTriggerEvent }) {
  const [activeLog, setActiveLog] = useState([]);

  const triggerSim = (sound) => {
    playSyntheticChime(sound.soundType);
    const newLog = {
      id: Date.now(),
      time: new Date().toLocaleTimeString('vi-VN'),
      name: sound.name,
      pattern: sound.pattern,
      icon: sound.icon,
      audience: sound.audience,
    };
    setActiveLog(prev => [newLog, ...prev.slice(0, 5)]);

    if (onTriggerEvent) {
      onTriggerEvent(sound);
    }
  };

  return (
    <div style={{ padding: '16px 16px 100px' }}>
      {/* Bảng điều khiển giả lập */}
      <div className="mkn-sim-panel">
        <div className="mkn-sim-title">🎮 Bàn Thử Nghiệm Chuông Vận Hành</div>
        <div className="mkn-sim-desc">
          Bấm các nút dưới đây để kích hoạt âm thanh mô phỏng giống hệt như khi nhân viên thao tác trên App thật.
        </div>
        <div className="mkn-sim-grid">
          {SOUND_ORIGINS.map(s => (
            <button key={s.id} className="mkn-sim-btn" onClick={() => triggerSim(s)}>
              <span style={{ fontSize: 24 }}>{s.icon}</span>
              <span className="mkn-sim-btn-name">{s.name}</span>
              <span className="mkn-sim-btn-sub">{s.pattern}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Nhật ký phát sóng giả lập */}
      <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: '.1em', textTransform: 'uppercase', color: '#a08060', marginBottom: 10 }}>
        📡 NHẬT KÝ TÍN HIỆU PHÁT CHUÔNG REAL-TIME (MÔ PHỎNG)
      </div>

      {activeLog.length === 0 ? (
        <div style={{ padding: 24, textAlign: 'center', background: '#fff', borderRadius: 16, border: '2px dashed #eadcca', color: '#a08060', fontSize: 13, fontWeight: 700 }}>
          Chưa có sự kiện nào. Hãy bấm một nút ở trên để thử!
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {activeLog.map(log => (
            <div key={log.id} style={{ background: '#fff', border: '2px solid #eadcca', borderRadius: 14, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 20 }}>{log.icon}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 900, color: '#2d1c10' }}>{log.name}</div>
                <div style={{ fontSize: 12, color: '#725f50' }}>{log.pattern} · Nhận: {log.audience}</div>
              </div>
              <span style={{ fontSize: 12, fontWeight: 800, color: '#a08060' }}>{log.time}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
