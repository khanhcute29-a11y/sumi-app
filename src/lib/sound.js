let ctx;

function getCtx() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function beep({ freq = 880, duration = 0.15, delay = 0, type = 'sine', volume = 0.3 } = {}) {
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
}

export function initAudioUnlock() {
  // Try to create context immediately
  try {
    const ctx = getCtx();
    console.log('[initAudioUnlock] Audio context initialized, state:', ctx?.state);
  } catch (e) {
    console.log('[initAudioUnlock] Could not pre-initialize context:', e.message);
  }

  // Also unlock on first user interaction (for browsers that require it)
  const unlock = () => {
    try {
      getCtx();
      console.log('[initAudioUnlock] Audio context unlocked via user interaction');
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

// TING TING TING - Bếp nhận đơn
export function playKitchenReceiveSound() {
  beep({ freq: 1046, duration: 0.15, volume: 0.4 });
  beep({ freq: 1046, duration: 0.15, delay: 0.2, volume: 0.4 });
  beep({ freq: 1046, duration: 0.15, delay: 0.4, volume: 0.4 });
}

// TING TING TING TING - Bếp hoàn thành đơn
export function playKitchenCompleteSound() {
  beep({ freq: 1046, duration: 0.12, volume: 0.4 });
  beep({ freq: 1046, duration: 0.12, delay: 0.15, volume: 0.4 });
  beep({ freq: 1046, duration: 0.12, delay: 0.3, volume: 0.4 });
  beep({ freq: 1046, duration: 0.12, delay: 0.45, volume: 0.4 });
}

// TING TING - Shipper nhận giao
export function playShipperReceiveSound() {
  beep({ freq: 1046, duration: 0.15, volume: 0.4 });
  beep({ freq: 1046, duration: 0.15, delay: 0.2, volume: 0.4 });
}

// TING TING TING TING TING - Shipper hoàn thành giao
export function playShipperCompleteSound() {
  beep({ freq: 1046, duration: 0.12, volume: 0.4 });
  beep({ freq: 1046, duration: 0.12, delay: 0.15, volume: 0.4 });
  beep({ freq: 1046, duration: 0.12, delay: 0.3, volume: 0.4 });
  beep({ freq: 1046, duration: 0.12, delay: 0.45, volume: 0.4 });
  beep({ freq: 1046, duration: 0.12, delay: 0.6, volume: 0.4 });
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
