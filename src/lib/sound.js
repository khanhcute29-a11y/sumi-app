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
  const unlock = () => {
    getCtx();
    window.removeEventListener('click', unlock);
    window.removeEventListener('touchstart', unlock);
  };
  window.addEventListener('click', unlock);
  window.addEventListener('touchstart', unlock);
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
