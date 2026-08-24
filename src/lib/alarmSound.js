// Sound event types
export const SoundEvents = {
  ANNOUNCEMENT: 'announcement',      // Company announcement (rotary phone)
  TASK_ASSIGNED: 'task_assigned',    // Task assigned to user
  ORDER_COMPLETED: 'order_completed', // Order ready/completed
  DELIVERY_COMPLETED: 'delivery_completed' // Delivery completed
};

// Map sound events to audio files
const SOUND_FILES = {
  [SoundEvents.ANNOUNCEMENT]: '/alert.mp3',
  [SoundEvents.TASK_ASSIGNED]: '/task-complete.wav',
  [SoundEvents.ORDER_COMPLETED]: '/task-complete.wav',
  [SoundEvents.DELIVERY_COMPLETED]: '/task-complete.wav'
};

// Cached audio buffers for different sounds
let audioBuffers = {};
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
  if (contextResumePromise) {
    return contextResumePromise;
  }

  const ctx = getAudioContext();
  if (!ctx) {
    console.error('[resumeAudioContext] No audio context available');
    return false;
  }

  if (ctx.state === 'running') {
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

async function playAudioViaWebAudio(soundType, filePath) {
  const ctx = getAudioContext();
  if (!ctx) throw new Error('No audio context');

  // Always fetch fresh audio (no cache) to ensure latest file
  console.log(`[playSound] Fetching ${soundType} from ${filePath}... (cache-busted)`);
  const response = await fetch(filePath + '?t=' + Date.now());
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const arrayBuffer = await response.arrayBuffer();

  console.log(`[playSound] Decoding audio buffer (${arrayBuffer.byteLength} bytes)...`);
  const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
  console.log(`[playSound] ✓ ${soundType} decoded - duration: ${audioBuffer.duration}s, channels: ${audioBuffer.numberOfChannels}`);

  // Play the audio
  const source = ctx.createBufferSource();
  source.buffer = audioBuffer;
  const gainNode = ctx.createGain();
  gainNode.gain.value = 1.0;
  source.connect(gainNode);
  gainNode.connect(ctx.destination);
  console.log(`[playSound] Starting playback of ${soundType}...`);
  source.start(0);

  console.log(`[playSound] ✓ Playing ${soundType} via Web Audio API`);
}

async function playAudioViaHtmlAudio(filePath) {
  const audio = new Audio(filePath);
  audio.volume = 1.0;
  console.log('[playSound] HTML Audio created, attempting play...');
  await audio.play();
  console.log('[playSound] ✓ Playing via HTML Audio API');
}

export const playSound = async (soundType = SoundEvents.ANNOUNCEMENT) => {
  const filePath = SOUND_FILES[soundType] || SOUND_FILES[SoundEvents.ANNOUNCEMENT];
  console.log(`[playSound] Playing ${soundType} from ${filePath}...`);

  try {
    // Ensure Web Audio Context is resumed
    const resumed = await resumeAudioContext();
    if (!resumed) {
      console.warn('[playSound] Could not resume audio context, trying HTML Audio fallback');
      throw new Error('Audio context resume failed');
    }

    await playAudioViaWebAudio(soundType, filePath);
  } catch (e) {
    console.error(`[playSound] Web Audio failed: ${e.message}`);
    console.log('[playSound] Falling back to HTML Audio API...');

    try {
      await playAudioViaHtmlAudio(filePath);
    } catch (fallbackErr) {
      console.error('[playSound] HTML Audio failed:', fallbackErr.message);
      console.error('[playSound] ✗ All audio methods failed');
    }
  }
};

// Keep backward compatibility
export const playAlertSound = () => playSound(SoundEvents.ANNOUNCEMENT);

export const notifyCompany = async (title, body, severity = 'normal') => {
  try {
    playSound(SoundEvents.ANNOUNCEMENT).catch(err => console.error('Alert sound error:', err));

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
      console.log('Notification permission request failed:', e);
    }
  }
};

export const preloadAlertAudio = async () => {
  try {
    console.log('[preloadAlertAudio] Preloading all sound files...');
    const ctx = getAudioContext();
    if (!ctx) {
      console.warn('[preloadAlertAudio] No audio context available');
      return false;
    }

    // Preload all sound files
    let loaded = 0;
    for (const [soundType, filePath] of Object.entries(SOUND_FILES)) {
      try {
        const response = await fetch(filePath);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const arrayBuffer = await response.arrayBuffer();
        audioBuffers[soundType] = await ctx.decodeAudioData(arrayBuffer);
        console.log(`[preloadAlertAudio] ✓ ${soundType} preloaded`);
        loaded++;
      } catch (e) {
        console.warn(`[preloadAlertAudio] Failed to preload ${soundType}:`, e.message);
      }
    }

    console.log(`[preloadAlertAudio] ✓ Preloaded ${loaded}/${Object.keys(SOUND_FILES).length} sounds`);
    return loaded > 0;
  } catch (e) {
    console.warn('[preloadAlertAudio] Failed:', e.message);
    return false;
  }
};

// Notify all users with sound + optional browser notification
export const notifyAllUsers = async (soundType, title, body) => {
  try {
    // Play sound for current user
    playSound(soundType).catch(err => console.error(`[notifyAllUsers] Sound error:`, err));

    // Send browser notification if permission granted
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(title, {
        body: body,
        icon: '🥐',
        tag: soundType,
      }).onclick = () => {
        window.focus();
      };
    }

    // Broadcast to all other users via socket/realtime
    console.log(`[notifyAllUsers] Broadcasting ${soundType} to all users...`);
  } catch (e) {
    console.error('[notifyAllUsers] Error:', e);
  }
};
