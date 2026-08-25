import { useEffect } from 'react';
import { supabase } from './supabaseClient';
import {
  playNewOrderSound,
  playDeliveredSound,
  playKitchenReceiveSound,
  playKitchenCompleteSound,
  playShipperReceiveSound,
  playOnce,
} from './sound';
import { notify } from './toast';

// Push đẩy (kèm chuông cho người KHÔNG mở app) giờ do server tự bắn qua
// Postgres trigger (xem migration 202608260015), không phụ thuộc client
// nào đang mở app. Hook này chỉ còn lo phát âm thanh tức thời cho người
// đang mở app sẵn — không gọi /api/send-push nữa để tránh gửi trùng.
export function useOrderNotifications() {
  useEffect(() => {
    const channel = supabase
      .channel('orders-notify')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders' }, (payload) => {
        playNewOrderSound();
        // Tin nhắn hiện song song với chuông — bấm vào mở tab "Đơn chờ làm"
        notify('new_order', payload.new?.order_code);
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders' }, (payload) => {
        const justCompleted =
          (payload.new?.status === 'hoan_thanh' && payload.old?.status !== 'hoan_thanh') ||
          (payload.new?.status_v2 === 'completed' && payload.old?.status_v2 !== 'completed');
        if (justCompleted) {
          playDeliveredSound();
          // Tin nhắn đi kèm — bấm vào mở tab "Giao thành công"
          notify('shipper_complete', payload.new?.order_code);
          return;
        }

        // Ba mốc vận hành còn lại — dùng đúng cơ chế realtime của nhánh trên,
        // nên mọi máy đang mở app đều nghe cùng lúc. Mỗi mốc một giai điệu riêng.
        // Chỉ kêu khi trạng thái THỰC SỰ chuyển sang giá trị mới (old !== new),
        // tránh kêu lại mỗi lần đơn được cập nhật vì lý do khác.
        const before = payload.old?.status_v2;
        const after = payload.new?.status_v2;
        if (!after || before === after) return;

        // playOnce dùng chung với đường tín hiệu trực tiếp (broadcast) trong
        // App.jsx — mốc nào lỡ được báo qua cả hai đường thì vẫn chỉ kêu 1 lần.
        // Chuông giữ NGUYÊN. Tin nhắn gọi ngay cạnh, trong cùng playOnce để
        // hai thứ luôn xuất hiện cùng nhau và cùng bị chặn khi trùng lặp.
        const code = payload.new?.order_code;
        switch (after) {
          case 'in_production': // Bếp nhận đơn
            playOnce('kitchen_receive', () => { playKitchenReceiveSound(); notify('kitchen_receive', code); });
            break;
          case 'ready_for_fulfillment': // Bếp báo xong mẻ bánh
            playOnce('kitchen_complete', () => { playKitchenCompleteSound(); notify('kitchen_complete', code); });
            break;
          case 'in_delivery': // Shipper nhận giao
            playOnce('shipper_receive', () => { playShipperReceiveSound(); notify('shipper_receive', code); });
            break;
          default:
            break;
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);
}
