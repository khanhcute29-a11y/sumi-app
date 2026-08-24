import {
  playKitchenReceiveSound,
  playKitchenCompleteSound,
  playShipperReceiveSound,
  playShipperCompleteSound
} from './sound';

// Sound event types
export const SoundEvents = {
  ANNOUNCEMENT: 'announcement',           // Company announcement (rotary phone)
  TASK_ASSIGNED: 'task_assigned',         // Task assigned → TING TING
  ORDER_COMPLETED: 'order_completed',     // Order complete → TING TING TING TING
  DELIVERY_COMPLETED: 'delivery_completed' // Delivery complete → TING TING TING TING TING
};

// Map sounds to beep functions
const SOUND_FUNCTIONS = {
  [SoundEvents.ANNOUNCEMENT]: () => {
    // Rotary phone sound file (alert.mp3)
    playAlertSoundFile().catch(e => console.error('Alert sound file error:', e));
  },
  [SoundEvents.TASK_ASSIGNED]: playShipperReceiveSound,        // TING TING
  [SoundEvents.ORDER_COMPLETED]: playKitchenCompleteSound,     // TING TING TING TING
  [SoundEvents.DELIVERY_COMPLETED]: playShipperCompleteSound   // TING TING TING TING TING
};

let audioContext = null;
let contextResumePromise = null;
let alertAudioBuffer = null;

function getAudioContext() {
  if (!audioContext) {
    try {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
      console.log('[getAudioContext] Created context, state:', audioContext.state);
    } catch (e) {
      console.error('[getAudioContext] Failed:', e);
      return null;
    }
  }
  return audioContext;
}

async function resumeAudioContext() {
  if (contextResumePromise) return contextResumePromise;

  const ctx = getAudioContext();
  if (!ctx) return false;
  if (ctx.state === 'running') return true;

  if (ctx.state === 'suspended') {
    contextResumePromise = ctx.resume()
      .then(() => {
        console.log('[resumeAudioContext] ✓ Resumed');
        contextResumePromise = null;
        return true;
      })
      .catch(err => {
        console.error('[resumeAudioContext] Failed:', err);
        contextResumePromise = null;
        return false;
      });
    return contextResumePromise;
  }
  return true;
}

// Play rotary phone alert.mp3 for announcements only
async function playAlertSoundFile() {
  try {
    const resumed = await resumeAudioContext();
    if (!resumed) throw new Error('Context resume failed');

    const ctx = getAudioContext();
    if (!ctx) throw new Error('No audio context');

    // Load and cache alert.mp3
    if (!alertAudioBuffer) {
      console.log('[playAlertSoundFile] Fetching /alert.mp3...');
      const response = await fetch('/alert.mp3?t=' + Date.now());
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const arrayBuffer = await response.arrayBuffer();
      alertAudioBuffer = await ctx.decodeAudioData(arrayBuffer);
      console.log('[playAlertSoundFile] ✓ alert.mp3 loaded, duration:', alertAudioBuffer.duration);
    }

    const source = ctx.createBufferSource();
    source.buffer = alertAudioBuffer;
    const gain = ctx.createGain();
    gain.gain.value = 1.0;
    source.connect(gain);
    gain.connect(ctx.destination);
    source.start(0);

    console.log('[playAlertSoundFile] ✓ Playing alert.mp3');
  } catch (e) {
    console.error('[playAlertSoundFile] Failed:', e.message);
  }
}

// Main play sound function
export const playSound = (soundType = SoundEvents.ANNOUNCEMENT) => {
  console.log(`[playSound] Playing ${soundType}`);
  const soundFn = SOUND_FUNCTIONS[soundType];
  if (soundFn) {
    try {
      soundFn();
    } catch (e) {
      console.error(`[playSound] Error playing ${soundType}:`, e);
    }
  }
};

// Keep backward compatibility
export const playAlertSound = () => playSound(SoundEvents.ANNOUNCEMENT);

export const notifyCompany = async (title, body, severity = 'normal') => {
  try {
    playSound(SoundEvents.ANNOUNCEMENT);

    if ('Notification' in window && Notification.permission === 'granted') {
      const notification = new Notification(title, {
        body: body,
        icon: '🥐',
        tag: 'company-alert',
        requireInteraction: severity !== 'normal',
        badge: severity === 'urgent' ? '🔴' : '🔵',
      });

      notification.onclick = () => {
        window.focus();
        notification.close();
      };
    }
  } catch (e) {
    console.error('Notification error:', e);
  }
};

export const requestNotificationPermission = async () => {
  if ('Notification' in window && Notification.permission === 'default') {
    try {
      await Notification.requestPermission();
    } catch (e) {
      console.log('Permission request failed:', e);
    }
  }
};

export const preloadAlertAudio = async () => {
  try {
    console.log('[preloadAlertAudio] Pre-warming audio context...');
    const ctx = getAudioContext();
    if (!ctx) {
      console.warn('[preloadAlertAudio] No context available');
      return false;
    }

    // Pre-load alert.mp3 for announcements
    try {
      const response = await fetch('/alert.mp3');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const arrayBuffer = await response.arrayBuffer();
      alertAudioBuffer = await ctx.decodeAudioData(arrayBuffer);
      console.log('[preloadAlertAudio] ✓ alert.mp3 preloaded');
    } catch (e) {
      console.warn('[preloadAlertAudio] Could not preload alert.mp3:', e.message);
    }

    console.log('[preloadAlertAudio] ✓ Audio system ready');
    return true;
  } catch (e) {
    console.warn('[preloadAlertAudio] Failed:', e.message);
    return false;
  }
};
