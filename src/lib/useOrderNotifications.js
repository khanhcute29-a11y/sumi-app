import { useEffect } from 'react';
import { supabase } from './supabaseClient';
import { playNewOrderSound, playDeliveredSound } from './sound';

function sendPush(title, body) {
  fetch('/api/send-push', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, body, url: '/' }),
  }).catch(() => {});
}

export function useOrderNotifications() {
  useEffect(() => {
    const channel = supabase
      .channel('orders-notify')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders' }, (payload) => {
        playNewOrderSound();
        sendPush('🔔 Đơn hàng mới', `Mã đơn ${payload.new?.order_code || ''} vừa được tạo.`);
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders' }, (payload) => {
        if (payload.new?.status === 'hoan_thanh' && payload.old?.status !== 'hoan_thanh') {
          playDeliveredSound();
          sendPush('✅ Giao hàng hoàn thành', `Đơn ${payload.new?.order_code || ''} đã giao xong.`);
        }
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'order_notes' }, (payload) => {
        const author = payload.new?.author_name || 'Nhân viên';
        const code = payload.new?.order_code ? `đơn ${payload.new.order_code}` : 'một đơn';
        sendPush('💬 Ghi chú đơn hàng mới', `${author} vừa ghi chú ${code}: ${payload.new?.message || ''}`);
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'incident_reports' }, (payload) => {
        const reporter = payload.new?.reporter_name || 'Nhân viên';
        const code = payload.new?.order_code ? ` (${payload.new.order_code})` : '';
        sendPush('⚠ Báo sự cố mới', `${reporter} báo ${payload.new?.code || ''} - ${payload.new?.label || ''}${code}`);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);
}
