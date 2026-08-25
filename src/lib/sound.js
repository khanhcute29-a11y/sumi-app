let ctx;

function getCtx() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();

  // 🔴 CRITICAL FIX: Resume context nếu suspended (bypass autoplay policy)
  if (ctx.state === 'suspended') {
    console.log('[Sound] AudioContext suspended, attempting resume...');
    ctx.resume()
      .then(() => console.log('[Sound] ✓ AudioContext resumed'))
      .catch(e => console.error('[Sound] Resume failed:', e));
  }

  return ctx;
}

function beep({ freq = 880, duration = 0.15, delay = 0, type = 'sine', volume = 0.3 } = {}) {
  try {
    const audioCtx = getCtx();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    const startTime = audioCtx.currentTime + delay;
    gain.gain.setValueAtTime(volume, startTime);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
    osc.start(startTime);
    osc.stop(startTime + duration + 0.02);
    console.log('[beep] ✓ Generated beep at', freq, 'Hz, delay:', delay);
  } catch (e) {
    console.error('[beep] Error:', e);
  }
}

export function initAudioUnlock() {
  // Try to create context immediately
  try {
    const audioCtx = getCtx();
    console.log('[initAudioUnlock] Audio context initialized, state:', audioCtx?.state);
  } catch (e) {
    console.log('[initAudioUnlock] Could not pre-initialize context:', e.message);
  }

  // 🔴 CRITICAL FIX: Unlock on user interaction - force resume if suspended
  const unlock = () => {
    try {
      const audioCtx = getCtx();
      // Force resume on any user interaction
      if (audioCtx.state === 'suspended') {
        audioCtx
          .resume()
          .then(() => {
            console.log('[initAudioUnlock] ✓ Audio context unlocked & resumed via user interaction');
          })
          .catch(e => console.error('[initAudioUnlock] Resume failed:', e));
      } else {
        console.log('[initAudioUnlock] Audio context already running, state:', audioCtx.state);
      }
    } catch (e) {
      console.log('[initAudioUnlock] Unlock attempt failed:', e.message);
    }
    window.removeEventListener('click', unlock);
    window.removeEventListener('touchstart', unlock);
  };

  window.addEventListener('click', unlock, { passive: true });
  window.addEventListener('touchstart', unlock, { passive: true });
}

export function playNewOrderSound() {
  beep({ freq: 880, duration: 0.12 });
  beep({ freq: 1174, duration: 0.18, delay: 0.14 });
}

export function playDeliveredSound() {
  beep({ freq: 660, duration: 0.1 });
  beep({ freq: 880, duration: 0.1, delay: 0.11 });
  beep({ freq: 1108, duration: 0.22, delay: 0.22 });
}

export function playTingSound() {
  beep({ freq: 1046, duration: 0.16, type: 'sine', volume: 0.25 });
}

// Play pattern repeated for duration (milliseconds).
// cycleSec: độ dài một chu kỳ, tính cả khoảng lặng cuối để hai lần lặp không dính vào nhau.
function playPatternLooped(pattern, durationMs, cycleSec) {
  try {
    console.log(`[playPatternLooped] Starting pattern loop for ${durationMs}ms`);

    // Calculate pattern duration in seconds
    const notesEndSec = Math.max(...pattern.map(p => p.delay + p.duration));
    const patternDurationSec = cycleSec || notesEndSec;
    const durationSec = durationMs / 1000;
    const iterations = Math.ceil(durationSec / patternDurationSec);

    console.log(`[playPatternLooped] Pattern: ${patternDurationSec.toFixed(2)}s, Iterations: ${iterations}, Total: ~${(iterations * patternDurationSec).toFixed(1)}s`);

    // Schedule all beeps for the pattern repetitions
    for (let i = 0; i < iterations; i++) {
      const timeOffset = i * patternDurationSec;
      for (const note of pattern) {
        const delay = note.delay + timeOffset;
        beep({ freq: note.freq, duration: note.duration, delay, volume: note.volume });
      }
    }

    console.log(`[playPatternLooped] ✓ Scheduled ${iterations} iterations`);
  } catch (e) {
    console.error(`[playPatternLooped] Error:`, e);
  }
}

// NHẬN ĐƠN — "đing-đoong" đi lên, 2 nốt Sol→Đô (lặp 6s)
// Giai điệu riêng để phân biệt với các sự kiện khác.
export function playKitchenReceiveSound() {
  console.log('[playKitchenReceiveSound] Nhận đơn — Sol→Đô đi lên (6s loop)');
  const pattern = [
    { freq: 784, duration: 0.18, delay: 0, volume: 0.45 },    // Sol5
    { freq: 1046, duration: 0.32, delay: 0.22, volume: 0.45 } // Đô6
  ];
  playPatternLooped(pattern, 6000, 1.1); // 0.54s tiếng + 0.56s lặng
  console.log('[playKitchenReceiveSound] ✓ Done');
}

// HOÀN THÀNH MẺ BÁNH — hợp âm trưởng Đô-Mi-Sol đi lên, vui tai (lặp 6s)
export function playKitchenCompleteSound() {
  console.log('[playKitchenCompleteSound] Xong mẻ bánh — Đô-Mi-Sol (6s loop)');
  const pattern = [
    { freq: 523, duration: 0.16, delay: 0, volume: 0.45 },    // Đô5
    { freq: 659, duration: 0.16, delay: 0.19, volume: 0.45 }, // Mi5
    { freq: 784, duration: 0.38, delay: 0.38, volume: 0.5 }   // Sol5 ngân dài
  ];
  playPatternLooped(pattern, 6000, 1.3); // 0.76s tiếng + 0.54s lặng
  console.log('[playKitchenCompleteSound] ✓ Done');
}

// NHẬN GIAO — 2 nốt trầm ấm La→Rê, khác hẳn tiếng bếp (lặp 6s)
export function playShipperReceiveSound() {
  console.log('[playShipperReceiveSound] Nhận giao — La→Rê trầm (6s loop)');
  const pattern = [
    { freq: 440, duration: 0.22, delay: 0, volume: 0.5 },     // La4
    { freq: 587, duration: 0.34, delay: 0.26, volume: 0.5 }   // Rê5
  ];
  playPatternLooped(pattern, 6000, 1.2); // 0.6s tiếng + 0.6s lặng
  console.log('[playShipperReceiveSound] ✓ Done');
}

// TING TING TING TING TING - Shipper hoàn thành giao (lặp 10s)
export function playShipperCompleteSound() {
  console.log('[playShipperCompleteSound] Starting TING TING TING TING TING (10s loop)');
  const pattern = [
    { freq: 1046, duration: 0.12, delay: 0, volume: 0.5 },
    { freq: 1046, duration: 0.12, delay: 0.15, volume: 0.5 },
    { freq: 1046, duration: 0.12, delay: 0.3, volume: 0.5 },
    { freq: 1046, duration: 0.12, delay: 0.45, volume: 0.5 },
    { freq: 1046, duration: 0.12, delay: 0.6, volume: 0.5 }
  ];
  playPatternLooped(pattern, 10000);
  console.log('[playShipperCompleteSound] ✓ Done');
}

export function playNotificationSound(soundKey) {
  if (soundKey === 'new_order_voice') {
    playNewOrderSound();
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const speech = new SpeechSynthesisUtterance('Có đơn mới');
      speech.lang = 'vi-VN'; speech.rate = 0.9; speech.volume = 1;
      window.speechSynthesis.speak(speech);
    }
  } else if (soundKey === 'cash_complete') playDeliveredSound();
  else if (soundKey === 'ting') playTingSound();
}
