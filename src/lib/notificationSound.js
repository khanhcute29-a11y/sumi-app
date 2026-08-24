// Bell chime notification system
// Generate melodic bell sound for all notifications

export const createBellChime = () => {
  const audioContext = new (window.AudioContext || window.webkitAudioContext)();

  // Create long bell chime (Solfège: Do-Mi-Sol sequence repeated)
  const playBell = (frequency, duration, startTime, volume = 0.3) => {
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();

    osc.connect(gain);
    gain.connect(audioContext.destination);

    osc.frequency.value = frequency;
    osc.type = 'sine';

    // Fade in/out envelope for bell sound
    gain.gain.setValueAtTime(0, startTime);
    gain.gain.linearRampToValueAtTime(volume, startTime + 0.1);
    gain.gain.exponentialRampToValueAtTime(0.01, startTime + duration);

    osc.start(startTime);
    osc.stop(startTime + duration);
  };

  // Play bell sequence: Do (262Hz) → Mi (330Hz) → Sol (392Hz) - extended duration
  const now = audioContext.currentTime;
  const noteDuration = 0.6; // Long note
  const delay = 0.15; // Gap between notes

  // First cycle
  playBell(262, noteDuration, now, 0.35); // Do
  playBell(330, noteDuration, now + noteDuration + delay, 0.35); // Mi
  playBell(392, noteDuration, now + (noteDuration + delay) * 2, 0.35); // Sol

  // Second cycle (louder, full chime)
  const cycleStart = now + (noteDuration + delay) * 3 + 0.3;
  playBell(262, noteDuration + 0.3, cycleStart, 0.4); // Do
  playBell(330, noteDuration + 0.3, cycleStart + noteDuration + delay + 0.1, 0.4); // Mi
  playBell(392, noteDuration + 0.4, cycleStart + (noteDuration + delay + 0.1) * 2, 0.4); // Sol
};

export const playNotificationSound = (type = 'default') => {
  try {
    // Determine volume based on notification type
    const volumeMap = {
      'order_arrived': 0.8,      // Đơn tới - LOUD
      'task_assigned': 0.8,       // Có việc - LOUD
      'order_accepted': 0.7,      // Tình trạng nhận - HIGH
      'order_completed': 0.75,    // Đơn hoàn thành - HIGH
      'delivery_received': 0.75,  // Giao nhận - HIGH
      'fully_completed': 0.8,     // Hoàn thành - LOUD
      'default': 0.6
    };

    // Play bell chime
    createBellChime();

    // Also trigger browser notification if permitted
    if ('Notification' in window && Notification.permission === 'granted') {
      const titleMap = {
        'order_arrived': '🔔 Đơn hàng mới tới!',
        'task_assigned': '📋 Có việc được giao!',
        'order_accepted': '✓ Đơn đã được nhận',
        'order_completed': '✓ Đơn hoàn thành',
        'delivery_received': '🚚 Đã nhận giao',
        'fully_completed': '🎉 Đơn đã hoàn tất!',
        'default': '🔔 Thông báo'
      };

      new Notification(titleMap[type], {
        icon: '/icon-192.png',
        tag: type,
        requireInteraction: true // Keep notification visible
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
