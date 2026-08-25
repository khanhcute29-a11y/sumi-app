import { supabase } from './supabaseClient';

// Track all active subscriptions
const activeChannels = new Map();

// Broadcast channels for real-time updates
export const BroadcastEvents = {
  ORDER_CREATED: 'order:created',
  ORDER_STATUS_CHANGED: 'order:status_changed',
  KITCHEN_WORK_PACKAGE_CREATED: 'kitchen:work_package_created',
  KITCHEN_WORK_PACKAGE_COMPLETED: 'kitchen:work_package_completed',
  DELIVERY_STATUS_CHANGED: 'delivery:status_changed',
  FEED_POST_CREATED: 'feed:post_created',
  KPI_LOG_CREATED: 'kpi:log_created',
  SOUND_NOTIFICATION: 'sound:notification',  // Sound alerts for tasks, orders, deliveries
};

// 🔴 CRITICAL FIX: Subscribe to broadcast events with proper error handling
export const subscribeToBroadcast = (event, callback) => {
  try {
    console.log(`[subscribeToBroadcast] Setting up listener for ${event}`);

    const channel = supabase.channel(`broadcast:${event}`, {
      config: { broadcast: { self: true } }
    });

    channel
      .on('broadcast', { event }, (payload) => {
        console.log(`[subscribeToBroadcast] ✓ Received ${event}:`, payload.payload);
        try {
          callback(payload.payload);
        } catch (callbackErr) {
          console.error(`[subscribeToBroadcast] Callback error for ${event}:`, callbackErr);
        }
      })
      .subscribe((status) => {
        console.log(`[subscribeToBroadcast] Channel status for ${event}:`, status);
      });

    if (!activeChannels.has(event)) {
      activeChannels.set(event, []);
    }
    activeChannels.get(event).push(channel);

    return () => {
      console.log(`[subscribeToBroadcast] Cleaning up listener for ${event}`);
      supabase.removeChannel(channel);
      const channels = activeChannels.get(event);
      if (channels) {
        const idx = channels.indexOf(channel);
        if (idx > -1) channels.splice(idx, 1);
      }
    };
  } catch (err) {
    console.error(`[subscribeToBroadcast] Error setting up listener for ${event}:`, err);
    return () => {};
  }
};

// 🔴 CRITICAL FIX: Broadcast event to all listeners with proper subscription & timing
export const broadcastEvent = async (event, data) => {
  try {
    console.log(`[broadcastEvent] Sending ${event}:`, data);

    const channel = supabase.channel(`broadcast:${event}`, {
      config: { broadcast: { self: true } }
    });

    // CRITICAL: Subscribe to channel with status check
    return new Promise((resolve, reject) => {
      channel.subscribe((status) => {
        console.log(`[broadcastEvent] Channel status for ${event}:`, status);

        if (status === 'SUBSCRIBED') {
          // Send message only after confirmed subscription
          const sendResult = channel.send({
            type: 'broadcast',
            event,
            payload: data,
            timestamp: new Date().toISOString()
          });

          console.log(`[broadcastEvent] ✓ Message sent for ${event}:`, sendResult);

          // Keep channel alive for 500ms to ensure message delivery across network
          setTimeout(() => {
            supabase.removeChannel(channel);
            console.log(`[broadcastEvent] Channel cleaned up for ${event}`);
            resolve(sendResult);
          }, 500);
        } else if (status === 'CHANNEL_ERROR') {
          console.error(`[broadcastEvent] Channel error for ${event}:`, status);
          reject(new Error(`Channel error for ${event}`));
        }
      });
    });
  } catch (e) {
    console.error(`[broadcastEvent] Error broadcasting ${event}:`, e);
    throw e;
  }
};

// Subscribe to database changes with automatic refresh
export const subscribeToChanges = (table, callback, options = {}) => {
  const { events = ['INSERT', 'UPDATE', 'DELETE'], filter = null } = options;

  const channelName = `${table}:changes:${Math.random()}`;
  const channel = supabase.channel(channelName);

  const changeHandler = (payload) => {
    if (events.includes(payload.eventType)) {
      console.log(`[DB Change] ${table}.${payload.eventType}:`, payload);
      callback(payload);
    }
  };

  channel
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table
    }, changeHandler)
    .subscribe();

  activeChannels.set(channelName, channel);

  return () => {
    supabase.removeChannel(channel);
    activeChannels.delete(channelName);
  };
};

// Subscribe to multiple tables at once
export const subscribeToMultipleTables = (tables, callback) => {
  const unsubscribers = tables.map(table =>
    subscribeToChanges(table, callback, { events: ['INSERT', 'UPDATE', 'DELETE'] })
  );

  return () => unsubscribers.forEach(unsub => unsub());
};

// Auto-refresh UI when changes detected
export const setupAutoRefresh = (refreshFn, tables = []) => {
  const unsubscribers = tables.map(table =>
    subscribeToChanges(table, () => {
      console.log(`[Auto Refresh] Triggered by ${table}`);
      refreshFn();
    })
  );

  return () => unsubscribers.forEach(unsub => unsub());
};

// Cleanup all subscriptions
export const cleanupAllSubscriptions = () => {
  activeChannels.forEach(channels => {
    if (Array.isArray(channels)) {
      channels.forEach(ch => supabase.removeChannel(ch));
    } else {
      supabase.removeChannel(channels);
    }
  });
  activeChannels.clear();
};

// Cross-tab communication using localStorage
export const notifyOtherTabs = (event, data) => {
  const message = {
    type: event,
    timestamp: Date.now(),
    data,
  };
  localStorage.setItem(`sumi:${event}`, JSON.stringify(message));
};

// Listen to cross-tab events
export const listenToTabEvents = (event, callback) => {
  const handler = (e) => {
    if (e.key === `sumi:${event}`) {
      try {
        const message = JSON.parse(e.newValue);
        if (message.timestamp > Date.now() - 5000) { // Only recent messages
          callback(message.data);
        }
      } catch (err) {
        console.error('Tab event parse error:', err);
      }
    }
  };

  window.addEventListener('storage', handler);
  return () => window.removeEventListener('storage', handler);
};
