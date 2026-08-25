// Tin nhắn thông báo hiện trên màn hình, đi kèm tiếng chuông.
//
// File này KHÔNG đụng gì tới hệ thống âm thanh. Nó chỉ giữ danh sách tin nhắn
// đang hiện và báo cho ToastHost vẽ ra. Nơi nào phát chuông thì gọi thêm
// showToast() ngay cạnh — hai việc chạy song song, độc lập nhau.

let items = [];
let seq = 0;
const listeners = new Set();

const emit = () => {
  for (const cb of listeners) {
    try {
      cb(items);
    } catch (err) {
      console.error('[toast] Lỗi trong listener:', err);
    }
  }
};

export const subscribeToasts = (cb) => {
  listeners.add(cb);
  cb(items);
  return () => listeners.delete(cb);
};

export const dismissToast = (id) => {
  items = items.filter((t) => t.id !== id);
  emit();
};

// Tối đa 4 tin cùng lúc — nhiều hơn thì che mất màn hình làm việc.
const MAX_VISIBLE = 4;

/**
 * @param {object} t
 * @param {string} t.title    Dòng tiêu đề đậm
 * @param {string} [t.message] Dòng mô tả nhỏ bên dưới (thường là mã đơn)
 * @param {string} t.icon     Emoji đứng đầu
 * @param {string} t.tone     'primary' | 'success' | 'info' | 'warning'
 * @param {string} [t.tab]    Trang sẽ mở khi bấm vào tin
 * @param {string} [t.filter] Tab lọc trong màn Đơn Hàng
 * @param {string} [t.entityId] Mã đơn — có mã này thì bấm vào MỞ THẲNG chi tiết đơn
 * @param {number} [t.duration] Số mili-giây tự tắt (mặc định 9000)
 */
export const showToast = (t) => {
  try {
    const id = ++seq;
    const item = { id, duration: 9000, tone: 'primary', ...t };
    items = [item, ...items].slice(0, MAX_VISIBLE);
    emit();

    if (item.duration > 0) {
      setTimeout(() => dismissToast(id), item.duration);
    }
    return id;
  } catch (err) {
    console.error('[toast] Không hiện được tin nhắn:', err);
    return null;
  }
};

// ---------------------------------------------------------------------------
// 6 loại thông báo và nơi dẫn tới khi bấm vào.
// Sửa đích đến thì sửa ở đây, không phải đi tìm khắp nơi.
// ---------------------------------------------------------------------------
export const NOTIFY_KINDS = {
  // 1. Đăng tin của công ty -> Bảng tin nội bộ
  company_feed: {
    icon: '📢',
    title: 'Thông báo từ công ty',
    tone: 'warning',
    tab: 'feed',
  },
  // 2. Đơn tạo mới -> Đơn chờ làm
  new_order: {
    icon: '🔔',
    title: 'Có đơn hàng mới',
    tone: 'primary',
    tab: 'orders',
    filter: 'waiting',
  },
  // 3. Bếp nhận đơn -> Bếp đang làm
  kitchen_receive: {
    icon: '👩‍🍳',
    title: 'Bếp đã nhận đơn',
    tone: 'info',
    tab: 'orders',
    filter: 'production',
  },
  // 4. Hoàn thành mẻ bánh -> Chờ vận chuyển
  kitchen_complete: {
    icon: '🥐',
    title: 'Bếp đã xong mẻ bánh',
    tone: 'success',
    tab: 'orders',
    filter: 'ready',
  },
  // 5. Nhận giao -> Đang vận chuyển
  shipper_receive: {
    icon: '🚚',
    title: 'Shipper đã nhận giao',
    tone: 'info',
    tab: 'orders',
    filter: 'delivery',
  },
  // 6. Hoàn thành giao -> Giao thành công
  shipper_complete: {
    icon: '🎉',
    title: 'Đã giao hàng thành công',
    tone: 'success',
    tab: 'orders',
    filter: 'completed',
  },
};

/**
 * Cách gọi gọn: notify('kitchen_receive', 'SUMI-20260825-37981', orderId)
 *
 * orderId (nếu có) làm cho việc bấm vào tin MỞ THẲNG chi tiết đơn đó, thay vì
 * chỉ nhảy tới danh sách chung — người dùng biết ngay tin thuộc về đơn nào.
 * Không có orderId thì lùi về mở đúng tab lọc như cũ.
 */
export const notify = (kind, message, entityId) => {
  const preset = NOTIFY_KINDS[kind];
  if (!preset) {
    console.warn('[toast] Không rõ loại thông báo:', kind);
    return null;
  }
  return showToast({ ...preset, message: message || undefined, entityId: entityId || undefined });
};
