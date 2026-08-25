// Bell chime notification system
// Generate melodic bell sound for all notifications
import { getAudioBus } from './sound';

// Âm lượng theo loại thông báo. TRƯỚC ĐÂY bảng này được khai báo nhưng
// không hề truyền vào hàm phát tiếng — mọi thông báo đều kẹt ở 0.35 nên
// nghe rất nhỏ. Giờ đã nối đúng, và đẩy lên sát mức tối đa.
const VOLUME_MAP = {
  order_arrived: 1.0,      // Đơn tới
  task_assigned: 1.0,      // Có việc
  order_accepted: 1.0,     // Nhận đơn
  order_completed: 1.0,    // Đơn hoàn thành
  delivery_assigned: 1.0,  // Nhận giao
  delivery_received: 1.0,  // Giao nhận
  fully_completed: 1.0,    // Hoàn thành giao
  default: 1.0,
};

const TITLE_MAP = {
  order_arrived: '🔔 Đơn hàng mới tới!',
  task_assigned: '📋 Có việc được giao!',
  order_accepted: '✓ Đơn đã được nhận',
  order_completed: '✓ Đơn hoàn thành',
  delivery_assigned: '🚚 Đã nhận giao',
  delivery_received: '🚚 Đã nhận giao',
  fully_completed: '🎉 Đơn đã hoàn tất!',
  default: '🔔 Thông báo',
};

// volume: 0..1 — nay được truyền vào thật sự thay vì bỏ quên.
// Tiếng đi qua bus chung (nén động + khuếch đại bù) trong sound.js nên to
// hơn hẳn mà không bị rè.
export const createBellChime = (volume = 1.0) => {
  const { audioCtx, bus } = getAudioBus();

  const playBell = (frequency, duration, startTime, level) => {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.connect(gain);
    gain.connect(bus);

    osc.frequency.value = frequency;
    osc.type = 'sine';

    // Fade in/out envelope for bell sound
    const peak = Math.max(0.001, Math.min(level * volume, 1));
    gain.gain.setValueAtTime(0.001, startTime);
    gain.gain.linearRampToValueAtTime(peak, startTime + 0.1);
    gain.gain.exponentialRampToValueAtTime(0.01, startTime + duration);

    osc.start(startTime);
    osc.stop(startTime + duration);
  };

  // Play bell sequence: Do (262Hz) → Mi (330Hz) → Sol (392Hz) - extended duration
  const now = audioCtx.currentTime;
  const noteDuration = 0.6; // Long note
  const delay = 0.15; // Gap between notes

  // First cycle
  playBell(262, noteDuration, now, 1.0); // Do
  playBell(330, noteDuration, now + noteDuration + delay, 1.0); // Mi
  playBell(392, noteDuration, now + (noteDuration + delay) * 2, 1.0); // Sol

  // Second cycle (louder, full chime)
  const cycleStart = now + (noteDuration + delay) * 3 + 0.3;
  playBell(262, noteDuration + 0.3, cycleStart, 1.0); // Do
  playBell(330, noteDuration + 0.3, cycleStart + noteDuration + delay + 0.1, 1.0); // Mi
  playBell(392, noteDuration + 0.4, cycleStart + (noteDuration + delay + 0.1) * 2, 1.0); // Sol
};

export const playNotificationSound = (type = 'default') => {
  try {
    const volume = VOLUME_MAP[type] ?? VOLUME_MAP.default;

    // Play bell chime — âm lượng nay thực sự được áp dụng
    createBellChime(volume);

    // Also trigger browser notification if permitted
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(TITLE_MAP[type] || TITLE_MAP.default, {
        icon: '/icon-192.png',
        tag: type,
        requireInteraction: true, // Keep notification visible
      });
    }
  } catch (err) {
    console.error('Notification sound error:', err);
  }
};

// Request permission on app start
export const initNotifications = () => {
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }
};
