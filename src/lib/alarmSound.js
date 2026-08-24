export const playAlarmSound = (type = 'urgent', duration = 5000) => {
  try {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const now = audioContext.currentTime;

    if (type === 'urgent') {
      // URGENT: Siren-like alarm - very loud, alternating frequencies
      const oscillator1 = audioContext.createOscillator();
      const oscillator2 = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      const lfo = audioContext.createOscillator();

      // Set up oscillators
      oscillator1.frequency.setValueAtTime(1000, now);
      oscillator2.frequency.setValueAtTime(500, now);
      lfo.frequency.setValue(4); // 4 Hz wobble

      // Create modulation
      const lfoGain = audioContext.createGain();
      lfoGain.gain.setValueAtTime(200, now);
      lfo.connect(lfoGain);
      lfoGain.connect(oscillator1.frequency);

      // Frequency sweep for siren effect
      oscillator1.frequency.exponentialRampToValueAtTime(1500, now + 0.3);
      oscillator1.frequency.exponentialRampToValueAtTime(500, now + 0.6);
      oscillator1.frequency.exponentialRampToValueAtTime(1000, now + duration / 1000);

      // Master volume - EXTREMELY LOUD
      gainNode.gain.setValueAtTime(0.5, now);

      // Connect and play
      oscillator1.connect(gainNode);
      oscillator2.connect(gainNode);
      lfo.connect(gainNode);
      gainNode.connect(audioContext.destination);

      oscillator1.start(now);
      oscillator2.start(now);
      lfo.start(now);

      setTimeout(() => {
        oscillator1.stop();
        oscillator2.stop();
        lfo.stop();
      }, duration);

    } else if (type === 'important') {
      // IMPORTANT: Beep pattern
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.frequency.setValueAtTime(800, now);
      oscillator.type = 'sine';
      gainNode.gain.setValueAtTime(0.4, now);

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      // Beep pattern
      for (let i = 0; i < 5; i++) {
        gainNode.gain.setValueAtTime(0.4, now + i * 0.3);
        gainNode.gain.setValueAtTime(0, now + i * 0.3 + 0.15);
      }

      oscillator.start(now);
      oscillator.stop(now + 1.5);

    } else if (type === 'notification') {
      // NORMAL: Single beep
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.frequency.setValueAtTime(600, now);
      gainNode.gain.setValueAtTime(0.2, now);
      gainNode.gain.setValueAtTime(0, now + 0.3);

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      oscillator.start(now);
      oscillator.stop(now + 0.3);
    }
  } catch (e) {
    console.error('Alarm sound error:', e);
  }
};

export const playUrgentAlert = () => {
  // Play LOUD urgent alert - max volume
  // Call this 3 times with delays for maximum impact
  playAlarmSound('urgent', 3000);
  setTimeout(() => playAlarmSound('urgent', 3000), 3200);
  setTimeout(() => playAlarmSound('urgent', 3000), 6400);
};

export const playImportantAlert = () => {
  playAlarmSound('important', 1500);
};

export const playNotification = () => {
  playAlarmSound('notification', 300);
};
