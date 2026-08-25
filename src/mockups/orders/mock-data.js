// ============================================================
// MOCKUP ONLY — Không kết nối database thật
// Dữ liệu giả lập hoàn toàn cho màn hình Đơn Hàng redesign
// ============================================================

export const MOCK_ORDERS = [
  // --- ĐANG CHỜ LÀM ---
  {
    id: 'ord-001', code: 'SM-0825-001',
    status: 'awaiting_assignment',
    order_type: 'cake', type_icon: '🎂', type_label: 'Bánh Kem',
    customer: 'Chị Hương', phone: '0901 234 567',
    address: '12 Nguyễn Huệ, Q.1',
    note: 'Sinh nhật con gái, ghi tên BÉ ANH',
    required_at: '2026-08-25T16:00:00+07:00',
    created_at: '2026-08-25T08:30:00+07:00',
    total: 580000, items_count: 2,
    kitchen: 'Bếp Lạnh',
    is_overdue: false, is_urgent: true,
    lead_time_minutes: null,
  },
  {
    id: 'ord-002', code: 'SM-0825-002',
    status: 'awaiting_acceptance',
    order_type: 'bakery', type_icon: '🍞', type_label: 'Bánh Mặn/Ngọt',
    customer: 'Anh Tuấn', phone: '0912 345 678',
    address: '88 Lê Lợi, Q.3',
    note: '',
    required_at: '2026-08-25T17:30:00+07:00',
    created_at: '2026-08-25T09:00:00+07:00',
    total: 320000, items_count: 5,
    kitchen: 'Bếp Nóng',
    is_overdue: false, is_urgent: false,
    lead_time_minutes: null,
  },
  {
    id: 'ord-003', code: 'SM-0825-003',
    status: 'awaiting_assignment',
    order_type: 'macaron', type_icon: '🧁', type_label: 'Macaron',
    customer: 'Cty TNHH ABC', phone: '0283 456 789',
    address: '200 Điện Biên Phủ, Bình Thạnh',
    note: 'Hộp quà tặng đối tác, cần ribbon đỏ',
    required_at: '2026-08-25T18:00:00+07:00',
    created_at: '2026-08-25T09:15:00+07:00',
    total: 1200000, items_count: 3,
    kitchen: 'Xưởng 41',
    is_overdue: false, is_urgent: true,
    lead_time_minutes: null,
  },

  // --- BẾP ĐANG LÀM ---
  {
    id: 'ord-004', code: 'SM-0825-004',
    status: 'in_production',
    order_type: 'cake', type_icon: '🎂', type_label: 'Bánh Kem',
    customer: 'Chị Lan', phone: '0978 111 222',
    address: '45 Trần Hưng Đạo, Q.5',
    note: 'Phong cách Nhật - Matcha',
    required_at: '2026-08-25T15:00:00+07:00',
    created_at: '2026-08-25T07:00:00+07:00',
    total: 750000, items_count: 1,
    kitchen: 'Bếp Lạnh',
    is_overdue: false, is_urgent: true,
    kitchen_started_at: '2026-08-25T10:00:00+07:00',
    lead_time_minutes: 30,
  },
  {
    id: 'ord-005', code: 'SM-0825-005',
    status: 'in_production',
    order_type: 'teabreak', type_icon: '☕', type_label: 'Teabreak',
    customer: 'VP Văn Phòng Green', phone: '028 3344 5566',
    address: 'Tầng 10, 168 Nam Kỳ Khởi Nghĩa, Q.3',
    note: 'Buổi họp 50 người, set up trước 14:00',
    required_at: '2026-08-25T14:00:00+07:00',
    created_at: '2026-08-25T06:30:00+07:00',
    total: 3500000, items_count: 8,
    kitchen: 'Xưởng 42',
    is_overdue: false, is_urgent: true,
    kitchen_started_at: '2026-08-25T09:30:00+07:00',
    lead_time_minutes: 15,
  },
  {
    id: 'ord-006', code: 'SM-0825-006',
    status: 'in_production',
    order_type: 'mixed', type_icon: '🧺', type_label: 'Đơn Tổng Hợp',
    customer: 'Anh Minh', phone: '0935 222 333',
    address: '7 Bùi Thị Xuân, Q.1',
    note: 'Gồm bánh kem + macaron + bánh mặn',
    required_at: '2026-08-25T19:00:00+07:00',
    created_at: '2026-08-25T10:00:00+07:00',
    total: 1850000, items_count: 6,
    kitchen: 'Nhiều bếp',
    is_overdue: false, is_urgent: false,
    kitchen_started_at: '2026-08-25T11:00:00+07:00',
    lead_time_minutes: 120,
  },
  {
    id: 'ord-007', code: 'SM-0825-007',
    status: 'in_production',
    order_type: 'bakery', type_icon: '🍞', type_label: 'Bánh Mặn/Ngọt',
    customer: 'Tiệm Cà Phê Mơ', phone: '0901 555 666',
    address: '33 Hoàng Diệu, Q.4',
    note: 'Bánh mì thịt x30, croissant x20',
    required_at: '2026-08-25T06:00:00+07:00',
    created_at: '2026-08-24T20:00:00+07:00',
    total: 890000, items_count: 4,
    kitchen: 'Bếp Nóng',
    is_overdue: false, is_urgent: false,
    kitchen_started_at: '2026-08-25T02:00:00+07:00',
    lead_time_minutes: 90,
  },

  // --- CHỜ VẬN CHUYỂN ---
  {
    id: 'ord-008', code: 'SM-0825-008',
    status: 'ready_for_fulfillment',
    order_type: 'cake', type_icon: '🎂', type_label: 'Bánh Kem',
    customer: 'Chị Phương', phone: '0908 777 888',
    address: '120 Võ Thị Sáu, Q. Bình Thạnh',
    note: '',
    required_at: '2026-08-25T13:00:00+07:00',
    created_at: '2026-08-25T06:00:00+07:00',
    total: 650000, items_count: 1,
    kitchen: 'Bếp Lạnh',
    is_overdue: false, is_urgent: true,
    kitchen_done_at: '2026-08-25T11:30:00+07:00',
    lead_time_minutes: 45,
  },
  {
    id: 'ord-009', code: 'SM-0825-009',
    status: 'ready_for_fulfillment',
    order_type: 'macaron', type_icon: '🧁', type_label: 'Macaron',
    customer: 'Ms. Thanh — Wedding', phone: '0776 999 000',
    address: '55 Nguyễn Đình Chiểu, Q.3',
    note: 'Tháp macaron 150 viên, màu trắng hồng',
    required_at: '2026-08-25T15:30:00+07:00',
    created_at: '2026-08-25T07:00:00+07:00',
    total: 2800000, items_count: 2,
    kitchen: 'Xưởng 41',
    is_overdue: false, is_urgent: false,
    kitchen_done_at: '2026-08-25T12:00:00+07:00',
    lead_time_minutes: 60,
  },

  // --- ĐANG VẬN CHUYỂN ---
  {
    id: 'ord-010', code: 'SM-0825-010',
    status: 'in_delivery',
    order_type: 'cake', type_icon: '🎂', type_label: 'Bánh Kem',
    customer: 'Anh Khoa', phone: '0362 111 222',
    address: '8 Nguyễn Bỉnh Khiêm, Q.1',
    note: '',
    required_at: '2026-08-25T12:00:00+07:00',
    created_at: '2026-08-25T05:30:00+07:00',
    total: 480000, items_count: 1,
    kitchen: 'Bếp Lạnh',
    is_overdue: false, is_urgent: false,
    delivery_started_at: '2026-08-25T11:45:00+07:00',
    shipper: 'Anh Hùng',
    lead_time_minutes: 10,
  },
  {
    id: 'ord-011', code: 'SM-0825-011',
    status: 'in_delivery',
    order_type: 'teabreak', type_icon: '☕', type_label: 'Teabreak',
    customer: 'Công Ty ABC Corp', phone: '028 1234 5678',
    address: '200 Lý Tự Trọng, Q.1',
    note: 'Giao đúng giờ họp 14:00',
    required_at: '2026-08-25T14:00:00+07:00',
    created_at: '2026-08-25T07:30:00+07:00',
    total: 2100000, items_count: 5,
    kitchen: 'Xưởng 42',
    is_overdue: false, is_urgent: true,
    delivery_started_at: '2026-08-25T13:15:00+07:00',
    shipper: 'Chị Phương',
    lead_time_minutes: 30,
  },

  // --- GIAO THÀNH CÔNG ---
  {
    id: 'ord-012', code: 'SM-0825-012',
    status: 'completed',
    order_type: 'cake', type_icon: '🎂', type_label: 'Bánh Kem',
    customer: 'Chị Mai', phone: '0901 000 111',
    address: '22 Trần Phú, Q.5',
    note: '',
    required_at: '2026-08-25T10:00:00+07:00',
    created_at: '2026-08-24T18:00:00+07:00',
    total: 420000, items_count: 1,
    kitchen: 'Bếp Lạnh',
    is_overdue: false, is_urgent: false,
    completed_at: '2026-08-25T09:50:00+07:00',
    shipper: 'Anh Hùng',
    lead_time_minutes: null,
  },
  {
    id: 'ord-013', code: 'SM-0825-013',
    status: 'completed',
    order_type: 'bakery', type_icon: '🍞', type_label: 'Bánh Mặn/Ngọt',
    customer: 'Quán Ăn Bà Năm', phone: '028 9999 0000',
    address: '67 Cách Mạng Tháng 8, Q.3',
    note: '',
    required_at: '2026-08-25T07:00:00+07:00',
    created_at: '2026-08-24T21:00:00+07:00',
    total: 760000, items_count: 6,
    kitchen: 'Bếp Nóng',
    is_overdue: false, is_urgent: false,
    completed_at: '2026-08-25T06:48:00+07:00',
    shipper: 'Grab',
    lead_time_minutes: null,
  },

  // --- CHƯA THỰC HIỆN (OVERDUE) ---
  {
    id: 'ord-014', code: 'SM-0825-014',
    status: 'awaiting_assignment',
    order_type: 'cake', type_icon: '🎂', type_label: 'Bánh Kem',
    customer: 'Chị Ngọc', phone: '0908 333 444',
    address: '99 Đồng Khởi, Q.1',
    note: 'KHẨN — đơn đặt từ hôm qua chưa ai nhận',
    required_at: '2026-08-25T09:00:00+07:00',
    created_at: '2026-08-24T15:00:00+07:00',
    total: 540000, items_count: 2,
    kitchen: null,
    is_overdue: true, is_urgent: true,
    lead_time_minutes: null,
  },
  {
    id: 'ord-015', code: 'SM-0825-015',
    status: 'in_production',
    order_type: 'macaron', type_icon: '🧁', type_label: 'Macaron',
    customer: 'Cty Phú Hưng', phone: '0283 888 999',
    address: '500 Đinh Tiên Hoàng, Bình Thạnh',
    note: 'Bếp làm 2 tiếng rồi mà chưa xong',
    required_at: '2026-08-25T11:00:00+07:00',
    created_at: '2026-08-25T07:00:00+07:00',
    total: 980000, items_count: 3,
    kitchen: 'Xưởng 41',
    is_overdue: true, is_urgent: true,
    kitchen_started_at: '2026-08-25T09:00:00+07:00',
    lead_time_minutes: null,
  },
];

export const STATUS_CONFIG = {
  awaiting_assignment: {
    key: 'awaiting_assignment', label: 'Chờ nhận đơn',
    color: '#f59e0b', bg: '#fffbeb', border: '#fcd34d',
    icon: '📥', dot: '#f59e0b',
  },
  awaiting_acceptance: {
    key: 'awaiting_acceptance', label: 'Chờ nhận đơn',
    color: '#f59e0b', bg: '#fffbeb', border: '#fcd34d',
    icon: '📥', dot: '#f59e0b',
  },
  in_production: {
    key: 'in_production', label: 'Bếp đang làm',
    color: '#3b82f6', bg: '#eff6ff', border: '#93c5fd',
    icon: '👩‍🍳', dot: '#3b82f6',
  },
  ready_for_fulfillment: {
    key: 'ready_for_fulfillment', label: 'Chờ vận chuyển',
    color: '#8b5cf6', bg: '#f5f3ff', border: '#c4b5fd',
    icon: '📦', dot: '#8b5cf6',
  },
  in_delivery: {
    key: 'in_delivery', label: 'Đang vận chuyển',
    color: '#f97316', bg: '#fff7ed', border: '#fdba74',
    icon: '🛵', dot: '#f97316',
  },
  completed: {
    key: 'completed', label: 'Giao thành công',
    color: '#16a34a', bg: '#f0fdf4', border: '#86efac',
    icon: '✅', dot: '#16a34a',
  },
  overdue: {
    key: 'overdue', label: 'Chưa thực hiện',
    color: '#dc2626', bg: '#fef2f2', border: '#fca5a5',
    icon: '⚠️', dot: '#dc2626',
  },
};

export const TYPE_CONFIG = {
  cake:    { icon: '🎂', label: 'Bánh Kem',       color: '#be185d' },
  bakery:  { icon: '🍞', label: 'Bánh Mặn/Ngọt',  color: '#b45309' },
  macaron: { icon: '🧁', label: 'Macaron',         color: '#7c3aed' },
  school:  { icon: '🏫', label: 'Trường Học',      color: '#0369a1' },
  teabreak:{ icon: '☕', label: 'Teabreak',        color: '#065f46' },
  mixed:   { icon: '🧺', label: 'Đơn Tổng Hợp',   color: '#374151' },
};

export function getFilteredOrders(orders, { statusFilter, typeFilter, search, sortBy }) {
  let result = [...orders];

  // Lọc overdue trước
  if (statusFilter === 'overdue') {
    result = result.filter(o => o.is_overdue);
  } else if (statusFilter && statusFilter !== 'all') {
    result = result.filter(o => o.status === statusFilter && !o.is_overdue);
  }

  if (typeFilter && typeFilter !== 'all') {
    result = result.filter(o => o.order_type === typeFilter);
  }

  if (search && search.trim()) {
    const q = search.toLowerCase();
    result = result.filter(o =>
      o.customer.toLowerCase().includes(q) ||
      o.code.toLowerCase().includes(q) ||
      (o.address || '').toLowerCase().includes(q)
    );
  }

  if (sortBy === 'time_asc') {
    result.sort((a, b) => new Date(a.required_at) - new Date(b.required_at));
  } else if (sortBy === 'time_desc') {
    result.sort((a, b) => new Date(b.required_at) - new Date(a.required_at));
  } else if (sortBy === 'value_desc') {
    result.sort((a, b) => b.total - a.total);
  }

  return result;
}

export function getStatusCounts(orders) {
  const overdue = orders.filter(o => o.is_overdue).length;
  const waiting = orders.filter(o => ['awaiting_assignment', 'awaiting_acceptance'].includes(o.status) && !o.is_overdue).length;
  const production = orders.filter(o => o.status === 'in_production' && !o.is_overdue).length;
  const ready = orders.filter(o => o.status === 'ready_for_fulfillment' && !o.is_overdue).length;
  const delivery = orders.filter(o => o.status === 'in_delivery' && !o.is_overdue).length;
  const completed = orders.filter(o => o.status === 'completed').length;
  return { overdue, waiting, production, ready, delivery, completed, total: orders.length };
}

export function fmtTime(isoStr) {
  if (!isoStr) return '—';
  return new Date(isoStr).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
}
export function fmtVnd(n) {
  if (!n) return '—';
  return `${Math.round(n).toLocaleString('vi-VN')}đ`;
}
export function minutesLeft(isoStr) {
  if (!isoStr) return null;
  return Math.round((new Date(isoStr) - new Date()) / 60000);
}
