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

// MỘT kênh dùng chung cho mỗi loại sự kiện, dùng cho CẢ nghe lẫn gửi.
// Trước đây hàm gửi tự tạo một kênh mới trùng tên với kênh đang nghe —
// hai kênh cùng topic dễ xung đột và tín hiệu rơi mất. Giờ chỉ còn một.
const broadcastChannels = new Map();
const broadcastListeners = new Map();

const getBroadcastChannel = (event) => {
  let entry = broadcastChannels.get(event);
  if (entry) return entry;

  const channel = supabase.channel(`broadcast:${event}`, {
    config: { broadcast: { self: true } }
  });

  entry = { channel, ready: false };
  broadcastChannels.set(event, entry);
  broadcastListeners.set(event, new Set());

  channel
    .on('broadcast', { event }, (payload) => {
      const listeners = broadcastListeners.get(event);
      if (!listeners) return;
      for (const cb of listeners) {
        try {
          cb(payload.payload);
        } catch (callbackErr) {
          console.error(`[broadcast] Lỗi trong callback của ${event}:`, callbackErr);
        }
      }
    })
    .subscribe((status) => {
      entry.ready = status === 'SUBSCRIBED';
      console.log(`[broadcast] Kênh ${event}: ${status}`);
    });

  return entry;
};

export const subscribeToBroadcast = (event, callback) => {
  try {
    getBroadcastChannel(event);
    broadcastListeners.get(event).add(callback);
    return () => {
      broadcastListeners.get(event)?.delete(callback);
    };
  } catch (err) {
    console.error(`[subscribeToBroadcast] Không tạo được listener cho ${event}:`, err);
    return () => {};
  }
};

// Gửi tín hiệu tới mọi máy đang mở app, qua đúng kênh đang được lắng nghe.
// Nếu kênh chưa kịp sẵn sàng thì chờ tối đa 3 giây rồi mới gửi.
export const broadcastEvent = async (event, data) => {
  try {
    const entry = getBroadcastChannel(event);

    if (!entry.ready) {
      await new Promise((resolve) => {
        const deadline = Date.now() + 3000;
        const tick = () => {
          if (entry.ready || Date.now() > deadline) resolve();
          else setTimeout(tick, 50);
        };
        tick();
      });
    }

    const result = await entry.channel.send({
      type: 'broadcast',
      event,
      payload: data,
    });

    console.log(`[broadcast] Đã gửi ${event}:`, data, '→', result);
    return result;
  } catch (e) {
    console.error(`[broadcast] Lỗi khi gửi ${event}:`, e);
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
