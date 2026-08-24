import { useEffect } from 'react';
import { supabase } from './supabaseClient';
import { playNewOrderSound, playDeliveredSound } from './sound';

// Push đẩy (kèm chuông cho người KHÔNG mở app) giờ do server tự bắn qua
// Postgres trigger (xem migration 202608260015), không phụ thuộc client
// nào đang mở app. Hook này chỉ còn lo phát âm thanh tức thời cho người
// đang mở app sẵn — không gọi /api/send-push nữa để tránh gửi trùng.
export function useOrderNotifications() {
  useEffect(() => {
    const channel = supabase
      .channel('orders-notify')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders' }, () => {
        playNewOrderSound();
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders' }, (payload) => {
        const justCompleted =
          (payload.new?.status === 'hoan_thanh' && payload.old?.status !== 'hoan_thanh') ||
          (payload.new?.status_v2 === 'completed' && payload.old?.status_v2 !== 'completed');
        if (justCompleted) playDeliveredSound();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);
}
