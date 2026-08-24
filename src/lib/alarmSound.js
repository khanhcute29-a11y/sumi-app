export const playAlertSound = () => {
  // Play alert sound using audio file
  try {
    const audio = new Audio('data:audio/wav;base64,UklGRiYAAABXQVZFZm10IBAAAAABAAEAQB8AAAB9AAACABAAZGF0YQIAAAAAAA==');
    audio.volume = 1.0;
    audio.play().catch(e => console.log('Audio play failed:', e));
  } catch (e) {
    console.error('Audio error:', e);
  }
};

export const notifyCompany = (title, body, severity = 'normal') => {
  // Send browser notification to entire company
  try {
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

    // Also try to play sound
    playAlertSound();
  } catch (e) {
    console.error('Notification error:', e);
  }
};

export const requestNotificationPermission = async () => {
  if ('Notification' in window && Notification.permission === 'default') {
    await Notification.requestPermission();
  }
};
