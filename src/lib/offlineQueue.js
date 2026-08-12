const KEY = 'sumi_offline_queue';

function readQueue() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || [];
  } catch {
    return [];
  }
}

function writeQueue(items) {
  localStorage.setItem(KEY, JSON.stringify(items));
  window.dispatchEvent(new Event('sumi-queue-changed'));
}

export function enqueue(type, payload) {
  const items = readQueue();
  const item = { id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, type, payload, createdAt: new Date().toISOString() };
  items.push(item);
  writeQueue(items);
  return item;
}

export function getQueue() {
  return readQueue();
}

export function queueCount() {
  return readQueue().length;
}

function removeItem(id) {
  writeQueue(readQueue().filter((it) => it.id !== id));
}

let processing = false;

export async function processQueue(handlers, onChange) {
  if (processing || !navigator.onLine) return;
  processing = true;
  const items = readQueue();
  for (const item of items) {
    try {
      const handler = handlers[item.type];
      if (handler) await handler(item.payload);
      removeItem(item.id);
      onChange?.();
    } catch {
      // Vẫn lỗi (có thể mất mạng lại giữa chừng) — dừng, thử lại ở lần sync kế tiếp.
      break;
    }
  }
  processing = false;
}

export function initOfflineSync(handlers, onChange) {
  window.addEventListener('online', () => processQueue(handlers, onChange));
  if (navigator.onLine) processQueue(handlers, onChange);
}
