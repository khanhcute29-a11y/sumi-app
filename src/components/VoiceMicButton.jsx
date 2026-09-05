import React from 'react';
import { Button } from './forms/Button';
import { useVoiceInput } from '../lib/useVoiceInput';
import { IconMic } from './icons/FrogIcons';

export function VoiceMicButton({ onTranscript, onInterim, size = 'sm' }) {
  const voice = useVoiceInput();
  if (!voice.supported) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <Button
        variant={voice.listening ? 'danger' : 'secondary'}
        size={size}
        icon={<IconMic size={16} />}
        onClick={() => {
          // LỖI THẬT đã vá: trước đây mặc định onInterim=onTranscript khi
          // không truyền riêng — với useVoiceInput bản continuous mới, mỗi
          // đoạn TẠM giờ mang CẢ CÂU cộng dồn tới lúc đó (không phải chỉ
          // phần mới nói), nên các nơi dùng kiểu "nối thêm"
          // (setX(prev => prev + t)) — Bình luận đơn hàng, Báo sự cố, Ghi
          // việc phối hợp bếp — bị nối chồng cả câu đang lớn dần lên nhiều
          // lần mỗi giây, chữ nhân bản tăng vọt. Interim giờ mặc định
          // KHÔNG gọi gì cả trừ khi nơi gọi tự truyền onInterim rõ ràng.
          // Đồng thời cho bấm lần 2 để TỰ DỪNG ngay (không phải chờ đủ 4
          // giây im lặng) — bấm lại lúc đang nói sẽ dừng thay vì mở đè lên
          // 1 phiên ghi âm thứ 2 cùng lúc (từng làm lẫn lộn kết quả 2 phiên).
          if (voice.listening) voice.stop();
          else voice.start(onTranscript, onInterim);
        }}
      >
        {voice.listening ? 'Đang nghe...' : 'Nói'}
      </Button>
      {voice.error && (
        <div style={{ font: 'var(--text-caption)', color: 'var(--status-danger)' }}>{voice.error}</div>
      )}
    </div>
  );
}
