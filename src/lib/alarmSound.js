export const playAlertSound = () => {
  // Play rotary phone ring alert sound
  try {
    const audio = new Audio('/alert.mp3');
    audio.volume = 1.0;
    audio.play().catch(e => console.log('Audio play failed:', e));
  } catch (e) {
    console.error('Audio error:', e);
  }
};

export const notifyCompany = (title, body, severity = 'normal') => {
  // Send browser notification + play sound when posting announcement
  try {
    // Play alert sound immediately
    playAlertSound();

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
