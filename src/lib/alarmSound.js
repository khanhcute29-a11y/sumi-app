// Cached audio buffer for alert sound
let alertAudioBuffer = null;
let audioContext = null;

function getAudioContext() {
  if (!audioContext) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioContext.state === 'suspended') {
    audioContext.resume();
  }
  return audioContext;
}

export const playAlertSound = async () => {
  try {
    console.log('[playAlertSound] Starting...');

    // First try Web Audio API (more reliable than HTML Audio)
    const ctx = getAudioContext();

    // Load audio file if not cached
    if (!alertAudioBuffer) {
      console.log('[playAlertSound] Loading audio file...');
      const response = await fetch('/alert.mp3');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const arrayBuffer = await response.arrayBuffer();
      alertAudioBuffer = await ctx.decodeAudioData(arrayBuffer);
      console.log('[playAlertSound] Audio loaded and decoded');
    }

    // Play the audio
    const source = ctx.createBufferSource();
    source.buffer = alertAudioBuffer;

    // Add gain node for volume control
    const gainNode = ctx.createGain();
    gainNode.gain.value = 1.0; // Max volume

    source.connect(gainNode);
    gainNode.connect(ctx.destination);
    source.start(0);

    console.log('[playAlertSound] Playing audio via Web Audio API');
  } catch (e) {
    console.error('[playAlertSound] Web Audio failed, trying HTML Audio:', e);

    // Fallback to HTML Audio API
    try {
      const audio = new Audio('/alert.mp3');
      audio.volume = 1.0;
      audio.play().catch(err => console.error('HTML Audio play failed:', err));
    } catch (fallbackErr) {
      console.error('[playAlertSound] All audio methods failed:', fallbackErr);
    }
  }
};

export const notifyCompany = async (title, body, severity = 'normal') => {
  // Send browser notification + play sound when posting announcement
  try {
    // Play alert sound immediately (don't await, let it play in background)
    playAlertSound().catch(err => console.error('Alert sound error:', err));

    // Also send notification if permission granted
    if ('Notification' in window && Notification.permission === 'granted') {
      const notification = new Notification(title, {
        body: body,
        icon: '🥐',
        tag: 'company-alert',
        requireInteraction: severity !== 'normal', // Keep notification for urgent
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
  // Silently request notification permission on app load - no dialog shown
  // User may see browser's native permission prompt, but we don't double-ask
  if ('Notification' in window && Notification.permission === 'default') {
    try {
      await Notification.requestPermission();
    } catch (e) {
      // Silently ignore if permission request fails
      console.log('Notification permission request failed:', e);
    }
  }
};
