// ============================================================
// MOCKUP ONLY — Notification & Sound Source Map
// Không kết nối database thật
// ============================================================

// Bản đồ nguồn gốc âm thanh chuông trong hệ thống SUMI
export const SOUND_ORIGINS = [
  {
    id: 'kitchen_receive',
    name: 'Bếp Nhận Đơn Mới',
    pattern: '🔔 TING - TING - TING (3 tiếng)',
    soundType: 'kitchen_receive',
    color: '#3b82f6',
    bg: '#eff6ff',
    icon: '👩‍🍳',
    codeOrigin: {
      sourceFile: 'src/lib/sound.js -> playKitchenReceiveSound()',
      mechanism: 'Web Audio API Synth (dao động sóng 587.33Hz -> 880Hz)',
      broadcastEvent: 'BroadcastEvents.SOUND_NOTIFICATION (soundType: "kitchen_receive")',
      triggerRule: 'Bếp trưởng hoặc thợ làm bánh được gán mẻ / nhận work package mới',
    },
    audience: 'Bếp Trưởng, Bếp Phó, Thợ làm bánh (Bếp Lạnh, Bếp Nóng, Macaron, X42)',
    description: 'Báo hiệu có đơn mới hoặc phân đoạn mới vừa được giao xuống cho bộ phận bếp.',
    urgency: 'Trung bình',
  },
  {
    id: 'kitchen_complete',
    name: 'Bếp Báo Hoàn Thành Mẻ',
    pattern: '🔔 TING - TING - TING - TING (4 tiếng ngân dài)',
    soundType: 'kitchen_complete',
    color: '#8b5cf6',
    bg: '#f5f3ff',
    icon: '📦',
    codeOrigin: {
      sourceFile: 'src/lib/sound.js -> playKitchenCompleteSound()',
      mechanism: 'Web Audio API Synth (chuỗi nốt cao 523Hz -> 1046Hz)',
      broadcastEvent: 'BroadcastEvents.SOUND_NOTIFICATION (soundType: "kitchen_complete")',
      triggerRule: 'Khi thợ bấm "Hoàn thành mẻ" hoặc RPC mark_package_complete',
    },
    audience: 'Thu Ngân, Quản Lý, Đội Vận Tải (Shipper)',
    description: 'Báo bánh đã ra lò / đã đóng gói xong, sẵn sàng chuyển sang khâu đóng gói hoặc vận chuyển.',
    urgency: 'Quan trọng',
  },
  {
    id: 'shipper_receive',
    name: 'Gán Chuyến Giao Hàng',
    pattern: '🔔 TING - TING (2 tiếng nhanh)',
    soundType: 'shipper_receive',
    color: '#f97316',
    bg: '#fff7ed',
    icon: '🛵',
    codeOrigin: {
      sourceFile: 'src/lib/sound.js -> playShipperReceiveSound()',
      mechanism: 'Web Audio API (nốt 659.25Hz -> 987.77Hz)',
      broadcastEvent: 'BroadcastEvents.SOUND_NOTIFICATION (soundType: "shipper_receive")',
      triggerRule: 'Đơn chuyển sang trạng thái "ready_for_fulfillment" hoặc gán cho shipper',
    },
    audience: 'Nhân viên Shipper, Trưởng đội vận chuyển, Người được gán giao đơn',
    description: 'Nhắc nhở người giao hàng có đơn hàng mới sẵn sàng cần lấy và bắt đầu lộ trình.',
    urgency: 'Trung bình',
  },
  {
    id: 'shipper_complete',
    name: 'Giao Hàng Thành Công',
    pattern: '🔔 TING TING TING TING TING (5 nốt vui tươi)',
    soundType: 'shipper_complete',
    color: '#16a34a',
    bg: '#f0fdf4',
    icon: '🏁',
    codeOrigin: {
      sourceFile: 'src/lib/sound.js -> playShipperCompleteSound()',
      mechanism: 'Web Audio API Synth (hợp âm C Major arpeggio)',
      broadcastEvent: 'BroadcastEvents.SOUND_NOTIFICATION (soundType: "shipper_complete")',
      triggerRule: 'Khi shipper chụp ảnh giao hàng và bấm hoàn thành đơn',
    },
    audience: 'Giám Đốc, Quản Lý, Thu Ngân, Bán Hàng',
    description: 'Xác nhận đơn hàng đã trao tay khách hàng thành công và cập nhật KPI.',
    urgency: 'Thông tin',
  },
  {
    id: 'task_assigned',
    name: 'Việc Mới Được Giao (To-do)',
    pattern: '🔔 TING - TING (2 tiếng nhịp đôi)',
    soundType: 'task_assigned',
    color: '#0284c7',
    bg: '#f0f9ff',
    icon: '📋',
    codeOrigin: {
      sourceFile: 'src/lib/sound.js -> playShipperReceiveSound() (dùng chung)',
      mechanism: 'Web Audio API',
      broadcastEvent: 'BroadcastEvents.SOUND_NOTIFICATION (soundType: "task_assigned")',
      triggerRule: 'Khi quản lý tạo task adhoc hoặc assign to-do cho nhân viên',
    },
    audience: 'Nhân viên được chỉ định công việc',
    description: 'Thông báo việc phát sinh hoặc nhiệm vụ định kỳ mới cần thực hiện.',
    urgency: 'Bình thường',
  },
  {
    id: 'operational_alert',
    name: 'Còi Báo Cảnh Báo Vận Hành Quá Hạn',
    pattern: '🚨 CÒI ALARM CẢNH BÁO (Lặp chu kỳ 5 phút)',
    soundType: 'operational_alert',
    color: '#dc2626',
    bg: '#fef2f2',
    icon: '⚠️',
    codeOrigin: {
      sourceFile: 'src/lib/alarmSound.js -> playAlertSound() & Audio Buffer',
      mechanism: 'HTML5 Audio Element + Web Audio oscillator dự phòng',
      broadcastEvent: 'Supabase RPC enqueue_order_operational_alerts() chạy mỗi 300s',
      triggerRule: 'Đơn tạo >30p chưa nhận / Bếp xong >30p chưa giao / Còn ≤45p tới giờ hẹn khách',
    },
    audience: 'Ban Giám Đốc, Quản Lý Ca, Bếp Trưởng phụ trách',
    description: 'Chuông báo động lặp lại khi có đơn hàng bị nghẽn ở các khâu làm chậm tiến độ giao.',
    urgency: 'KHẨN CẤP',
  },
  {
    id: 'feed_announcement',
    name: 'Thông Báo Bảng Tin Khẩn',
    pattern: '📢 CÒI THÔNG BÁO CÔNG TY',
    soundType: 'feed_announcement',
    color: '#b45309',
    bg: '#fffbeb',
    icon: '📢',
    codeOrigin: {
      sourceFile: 'src/lib/alarmSound.js -> playAlertSound()',
      mechanism: 'Supabase Realtime Broadcast: BroadcastEvents.FEED_POST_CREATED',
      broadcastEvent: 'Khi tạo bài đăng loại announcement có mức urgent/important',
      triggerRule: 'Ban giám đốc đăng thông báo quan trọng trên bảng tin',
    },
    audience: 'Toàn bộ nhân viên đang mở ứng dụng',
    description: 'Phát còi báo động để mọi người chú ý thông báo mới từ ban lãnh đạo.',
    urgency: 'Quan trọng',
  },
];

// Danh sách thông báo mẫu trong Hộp thư
export const MOCK_NOTIFICATIONS = [
  {
    id: 'notif-01',
    type: 'alert',
    title: '⚠️ CẢNH BÁO VẬN HÀNH: Đơn SM-0825-014 trễ hẹn',
    body: 'Đơn bánh kem của Chị Ngọc đã quá 30 phút chưa có bếp nào nhận xử lý!',
    time: '2 phút trước',
    isRead: false,
    soundId: 'operational_alert',
    badge: 'Khẩn Cấp',
    color: '#dc2626',
    bg: '#fef2f2',
    icon: '🚨',
  },
  {
    id: 'notif-02',
    type: 'kitchen',
    title: '👩‍🍳 Đơn Mới Chờ Bếp Lạnh: SM-0825-001',
    body: 'Bánh kem Matcha sinh nhật Chị Hương, hẹn giao 16:00 hôm nay.',
    time: '12 phút trước',
    isRead: false,
    soundId: 'kitchen_receive',
    badge: 'Bếp Lạnh',
    color: '#3b82f6',
    bg: '#eff6ff',
    icon: '🎂',
  },
  {
    id: 'notif-03',
    type: 'delivery',
    title: '📦 Sẵn Sàng Giao: SM-0825-008',
    body: 'Bếp Lạnh đã làm xong đơn bánh kem Chị Phương. Cần Shipper nhận đơn giao đi.',
    time: '25 phút trước',
    isRead: true,
    soundId: 'shipper_receive',
    badge: 'Vận Chuyển',
    color: '#f97316',
    bg: '#fff7ed',
    icon: '🛵',
  },
  {
    id: 'notif-04',
    type: 'completed',
    title: '🏁 Giao Thành Công: SM-0825-012',
    body: 'Shipper Anh Hùng đã hoàn tất giao đơn 420.000đ cho Chị Mai (Q.5).',
    time: '45 phút trước',
    isRead: true,
    soundId: 'shipper_complete',
    badge: 'Hoàn Thành',
    color: '#16a34a',
    bg: '#f0fdf4',
    icon: '✅',
  },
  {
    id: 'notif-05',
    type: 'announcement',
    title: '📢 Thông Báo: Điều chỉnh giờ ca tối Quốc Lộ 13',
    body: 'Từ ngày 26/08, ca tối tại xưởng QL13 bắt đầu từ 21:30 đến 05:30 sáng hôm sau.',
    time: '2 giờ trước',
    isRead: true,
    soundId: 'feed_announcement',
    badge: 'Bảng Tin',
    color: '#b45309',
    bg: '#fffbeb',
    icon: '📢',
  },
  {
    id: 'notif-06',
    type: 'task',
    title: '📋 Công Việc Mới: Kiểm kê nguyên liệu kho X42',
    body: 'Quản lý phân công bạn kiểm kê bột mì & bơ trước 17:00 chiều nay.',
    time: '3 giờ trước',
    isRead: true,
    soundId: 'task_assigned',
    badge: 'Công Việc',
    color: '#0284c7',
    bg: '#f0f9ff',
    icon: '📋',
  },
];

// Hàm giả lập phát âm thanh chuông bằng Web Audio API độc lập
export function playSyntheticChime(type) {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();

    const playTone = (freq, startTime, duration, type = 'sine') => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, startTime);
      gain.gain.setValueAtTime(0.3, startTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(startTime);
      osc.stop(startTime + duration);
    };

    const now = ctx.currentTime;

    switch (type) {
      case 'kitchen_receive':
        // 3 tiếng Ting
        playTone(587.33, now, 0.2);
        playTone(739.99, now + 0.15, 0.2);
        playTone(880.00, now + 0.3, 0.4);
        break;

      case 'kitchen_complete':
        // 4 tiếng Ting ngân
        playTone(523.25, now, 0.2);
        playTone(659.25, now + 0.15, 0.2);
        playTone(783.99, now + 0.3, 0.2);
        playTone(1046.50, now + 0.45, 0.6);
        break;

      case 'shipper_receive':
      case 'task_assigned':
        // 2 tiếng Ting nhanh
        playTone(659.25, now, 0.18);
        playTone(987.77, now + 0.15, 0.35);
        break;

      case 'shipper_complete':
        // Hợp âm C Major vui tươi
        playTone(523.25, now, 0.15);
        playTone(659.25, now + 0.12, 0.15);
        playTone(783.99, now + 0.24, 0.15);
        playTone(1046.50, now + 0.36, 0.2);
        playTone(1318.51, now + 0.48, 0.5);
        break;

      case 'operational_alert':
      case 'feed_announcement':
        // Còi cảnh báo khẩn cấp (2 chu kỳ tần số cao)
        playTone(880, now, 0.15, 'sawtooth');
        playTone(440, now + 0.15, 0.15, 'sawtooth');
        playTone(880, now + 0.3, 0.15, 'sawtooth');
        playTone(440, now + 0.45, 0.25, 'sawtooth');
        break;

      default:
        playTone(600, now, 0.3);
    }
  } catch (e) {
    console.warn('[Mockup Audio] Cannot play Web Audio tone:', e);
  }
}
