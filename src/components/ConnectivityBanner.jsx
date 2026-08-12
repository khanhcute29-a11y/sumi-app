import React, { useEffect, useState } from 'react';
import { queueCount } from '../lib/offlineQueue';

export function ConnectivityBanner() {
  const [online, setOnline] = useState(navigator.onLine);
  const [pending, setPending] = useState(queueCount());

  useEffect(() => {
    const updateOnline = () => setOnline(navigator.onLine);
    const updatePending = () => setPending(queueCount());
    window.addEventListener('online', updateOnline);
    window.addEventListener('offline', updateOnline);
    window.addEventListener('sumi-queue-changed', updatePending);
    const interval = setInterval(updatePending, 3000);
    return () => {
      window.removeEventListener('online', updateOnline);
      window.removeEventListener('offline', updateOnline);
      window.removeEventListener('sumi-queue-changed', updatePending);
      clearInterval(interval);
    };
  }, []);

  if (online && pending === 0) return null;

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100, textAlign: 'center',
      padding: '8px 12px', font: 'var(--text-caption)', color: '#fff',
      background: online ? 'var(--status-info)' : 'var(--status-danger)',
    }}>
      {online
        ? `Đang đồng bộ ${pending} thao tác đã lưu offline...`
        : `Mất kết nối mạng — thao tác sẽ được lưu tạm và tự đồng bộ khi có mạng lại${pending ? ` (${pending} đang chờ)` : ''}`}
    </div>
  );
}
