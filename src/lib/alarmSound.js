export const playCompanyBell = (longDuration = true) => {
  // Long, loud bell sound for company announcements
  try {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const now = audioContext.currentTime;
    const duration = longDuration ? 8 : 3; // 8 seconds for long, 3 seconds for short

    // Create bell sound with multiple harmonics
    const frequencies = [
      { freq: 262, amp: 0.3 },  // Middle C
      { freq: 330, amp: 0.25 }, // E
      { freq: 392, amp: 0.25 }, // G
      { freq: 523, amp: 0.2 },  // High C
    ];

    const oscillators = [];
    const gains = [];
    const masterGain = audioContext.createGain();

    // Create multiple oscillators for rich bell tone
    frequencies.forEach(({ freq, amp }) => {
      const osc = audioContext.createOscillator();
      const gain = audioContext.createGain();

      osc.frequency.setValueAtTime(freq, now);
      osc.type = 'sine';

      // Fade in quickly, then slow decay
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(amp, now + 0.2);
      gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

      osc.connect(gain);
      gain.connect(masterGain);

      oscillators.push(osc);
      gains.push(gain);

      osc.start(now);
      osc.stop(now + duration);
    });

    // Master volume - EXTREMELY LOUD (0.6 = very loud)
    masterGain.gain.setValueAtTime(0.6, now);
    masterGain.connect(audioContext.destination);

    // Repeat bell sound 2 more times for emphasis
    if (longDuration) {
      setTimeout(() => playCompanyBell(false), duration * 1000 + 500);
      setTimeout(() => playCompanyBell(false), (duration * 2) * 1000 + 1000);
    }

  } catch (e) {
    console.error('Bell sound error:', e);
  }
};

export const playUrgentAlert = () => {
  // Same as company bell - long loud chime
  playCompanyBell(true);
};

export const playImportantAlert = () => {
  // Shorter bell for important
  playCompanyBell(false);
};

export const playNotification = () => {
  playCompanyBell(false);
};
