// Cached audio buffer for alert sound
let alertAudioBuffer = null;
let audioContext = null;
let contextResumePromise = null;

function getAudioContext() {
  if (!audioContext) {
    try {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
      console.log('[getAudioContext] Created new context, state:', audioContext.state);
    } catch (e) {
      console.error('[getAudioContext] Failed to create context:', e);
      return null;
    }
  }
  return audioContext;
}

async function resumeAudioContext() {
  // Ensure only one resume attempt at a time
  if (contextResumePromise) {
    return contextResumePromise;
  }

  const ctx = getAudioContext();
  if (!ctx) {
    console.error('[resumeAudioContext] No audio context available');
    return false;
  }

  if (ctx.state === 'running') {
    console.log('[resumeAudioContext] Context already running');
    return true;
  }

  if (ctx.state === 'suspended') {
    console.log('[resumeAudioContext] Context suspended, attempting resume...');
    contextResumePromise = ctx.resume()
      .then(() => {
        console.log('[resumeAudioContext] Context resumed successfully');
        contextResumePromise = null;
        return true;
      })
      .catch(err => {
        console.error('[resumeAudioContext] Failed to resume:', err);
        contextResumePromise = null;
        return false;
      });
    return contextResumePromise;
  }

  return true;
}

export const playAlertSound = async () => {
  try {
    console.log('[playAlertSound] Starting...');

    // Ensure Web Audio Context is resumed (might be suspended on some browsers)
    const resumed = await resumeAudioContext();
    if (!resumed) {
      console.warn('[playAlertSound] Could not resume audio context, trying HTML Audio fallback');
      throw new Error('Audio context resume failed');
    }

    const ctx = getAudioContext();
    if (!ctx) {
      throw new Error('No audio context');
    }

    // Load audio file if not cached
    if (!alertAudioBuffer) {
      console.log('[playAlertSound] Loading audio file from /alert.mp3...');
      const response = await fetch('/alert.mp3');
      if (!response.ok) {
        throw new Error(`Failed to fetch audio: HTTP ${response.status}`);
      }
      const arrayBuffer = await response.arrayBuffer();
      console.log('[playAlertSound] Decoding audio buffer...');
      alertAudioBuffer = await ctx.decodeAudioData(arrayBuffer);
      console.log('[playAlertSound] Audio loaded and decoded, duration:', alertAudioBuffer.duration);
    }

    // Play the audio
    console.log('[playAlertSound] Creating source node...');
    const source = ctx.createBufferSource();
    source.buffer = alertAudioBuffer;

    // Add gain node for volume control
    const gainNode = ctx.createGain();
    gainNode.gain.value = 1.0; // Max volume

    source.connect(gainNode);
    gainNode.connect(ctx.destination);

    console.log('[playAlertSound] Starting playback...');
    source.start(0);

    console.log('[playAlertSound] ✓ Playing audio via Web Audio API');
  } catch (e) {
    console.error('[playAlertSound] Web Audio failed:', e.message);
    console.log('[playAlertSound] Falling back to HTML Audio API...');

    // Fallback to HTML Audio API
    try {
      const audio = new Audio('/alert.mp3');
      audio.volume = 1.0;
      console.log('[playAlertSound] HTML Audio created, attempting play...');
      await audio.play();
      console.log('[playAlertSound] ✓ Playing audio via HTML Audio API');
    } catch (fallbackErr) {
      console.error('[playAlertSound] HTML Audio failed:', fallbackErr.message);
      console.error('[playAlertSound] ✗ All audio methods failed');
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

export const preloadAlertAudio = async () => {
  // Pre-load alert audio on app startup so it's ready to play immediately
  try {
    console.log('[preloadAlertAudio] Starting preload...');
    const ctx = getAudioContext();
    if (!ctx) {
      console.warn('[preloadAlertAudio] No audio context available');
      return false;
    }

    const response = await fetch('/alert.mp3');
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    alertAudioBuffer = await ctx.decodeAudioData(arrayBuffer);
    console.log('[preloadAlertAudio] ✓ Alert audio preloaded, duration:', alertAudioBuffer.duration);
    return true;
  } catch (e) {
    console.warn('[preloadAlertAudio] Failed to preload:', e.message);
    return false;
  }
};
