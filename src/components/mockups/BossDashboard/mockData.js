// ============================================================
// MOCK DATA CỤC BỘ CHO BOSS DASHBOARD
// 100% Cô lập - Không kết nối DB/API thật
// ============================================================

export const INITIAL_HR_STATS = {
  totalStaff: 50,
  maleStaff: 28,
  femaleStaff: 22,
  workingNow: 45,
  absentToday: 5,
  recentCheckins: [
    { id: 'st-1', name: 'Nguyễn Văn An', role: 'Bếp Trưởng Bếp Lạnh', avatar: 'AN', gender: 'male', checkinTime: '05:58', status: 'online' },
    { id: 'st-2', name: 'Trần Thị Mai', role: 'Bếp Phó Bếp Nóng', avatar: 'TM', gender: 'female', checkinTime: '06:02', status: 'online' },
    { id: 'st-3', name: 'Lê Hoàng Khoa', role: 'Thợ Bánh Macaron', avatar: 'LK', gender: 'male', checkinTime: '06:05', status: 'online' },
    { id: 'st-4', name: 'Phạm Quỳnh Anh', role: 'Thu Ngân & POS', avatar: 'QA', gender: 'female', checkinTime: '06:10', status: 'online' },
    { id: 'st-5', name: 'Bùi Đức Hùng', role: 'Đội Trưởng Vận Tải', avatar: 'DH', gender: 'male', checkinTime: '06:15', status: 'online' },
    { id: 'st-6', name: 'Vũ Thị Yến', role: 'Kế Toán Kho X42', avatar: 'VY', gender: 'female', checkinTime: '06:20', status: 'online' },
  ],
};

export const INITIAL_ANNOUNCEMENTS = [
  {
    id: 'ann-1',
    author: 'Giám Đốc (Bạn)',
    authorRole: 'Chủ Doanh Nghiệp',
    authorAvatar: 'GĐ',
    content: 'Toàn bộ các xưởng lưu ý kiểm tra nhiệt độ tủ đông lạnh trước 17:00 chiều nay. Lô kem tươi mới nhập cần được bảo quản chuẩn.',
    createdAt: '14:15 - Hôm nay',
    isPublic: true,
    comments: [
      { id: 'cm-1', author: 'Nguyễn Văn An', role: 'Bếp Trưởng Lạnh', text: '@Giám_Đốc Bếp lạnh đã đo xong lúc 14:00, nhiệt độ đạt chuẩn -18°C ạ.', time: '14:20' },
      { id: 'cm-2', author: 'Trần Thị Mai', role: 'Bếp Nóng', text: '@Nguyễn_Văn_An Anh An chia sẻ lại checklist đo nhiệt cho bên em với nhé.', time: '14:25' }
    ]
  },
  {
    id: 'ann-2',
    author: 'Phòng Kế Toán',
    authorRole: 'Hành Chính',
    authorAvatar: 'KT',
    content: 'Đã hoàn tất bảng lương và tạm ứng giữa tháng cho tất cả nhân sự. Anh chị em kiểm tra lại tài khoản ngân hàng.',
    createdAt: '11:30 - Hôm nay',
    isPublic: true,
    comments: [
      { id: 'cm-3', author: 'Bùi Đức Hùng', role: 'Vận Tải', text: 'Đội vận tải đã nhận đủ, cảm ơn sếp và phòng kế toán!', time: '11:45' }
    ]
  }
];

export const INITIAL_EXPENSES = [
  {
    id: 'exp-101',
    title: 'Mua bột mì thượng hạng & Bơ Anchor (15 bao)',
    spender: 'Vũ Thị Yến (Kho X42)',
    category: 'Nguyên vật liệu chính',
    amount: 14850000,
    time: '14:10 - 25/08/2026',
    status: 'approved',
    receiptName: 'HD_BotMi_Anchor_2508.pdf',
  },
  {
    id: 'exp-102',
    title: 'Hộp giấy Kraft & Túi đựng bánh sinh nhật (2000 cái)',
    spender: 'Phạm Quỳnh Anh (Thu Ngân)',
    category: 'Bao bì & Đóng gói',
    amount: 4200000,
    time: '13:30 - 25/08/2026',
    status: 'pending',
    receiptName: 'PhieuChi_HopBanh_0825.jpg',
  },
  {
    id: 'exp-103',
    title: 'Bảo dưỡng định kỳ lò nướng công nghiệp Xưởng 41',
    spender: 'Lê Hoàng Khoa (Macaron)',
    category: 'Bảo trì thiết bị',
    amount: 2800000,
    time: '10:45 - 25/08/2026',
    status: 'approved',
    receiptName: 'BienBan_BaoTri_LoNuong.pdf',
  },
  {
    id: 'exp-104',
    title: 'Tiền xăng & phí cầu đường xe tải lạnh giao điểm trường',
    spender: 'Bùi Đức Hùng (Vận Tải)',
    category: 'Vận chuyển & Xăng dầu',
    amount: 1150000,
    time: '09:15 - 25/08/2026',
    status: 'approved',
    receiptName: 'HoaDon_XangDau_0915.pdf',
  },
  {
    id: 'exp-105',
    title: 'Trái cây tươi (Dâu tây Đà Lạt & Việt quất) làm bánh kem',
    spender: 'Nguyễn Văn An (Bếp Lạnh)',
    category: 'Hoa quả tươi Decor',
    amount: 3600000,
    time: '07:30 - 25/08/2026',
    status: 'pending',
    receiptName: 'BienLai_DauTay_DaLat.jpg',
  },
];

export const INITIAL_TASKS = [
  {
    id: 'tsk-1',
    name: 'Giao gấp 200 bánh Macaron tiệc cưới Sheraton',
    description: 'Bọc nơ hồng pastel, đóng thùng xốp giữ lạnh 100%, giao đúng sảnh tầng 2.',
    assignedTo: 'Bùi Đức Hùng (Vận Tải)',
    deadline: '2026-08-25T16:30:00',
    deadlineDisplay: '16:30 - Hôm nay',
    status: 'in_progress', // 'in_progress' | 'overdue' | 'completed'
    priority: 'high',
  },
  {
    id: 'tsk-2',
    name: 'Lên khuôn mẻ Bánh Trung Thu gà quay vi cá số lượng lớn',
    description: 'Chuẩn bị 500 chiếc cỡ 150g, kiểm tra độ ẩm vỏ bánh trước khi nướng.',
    assignedTo: 'Trần Thị Mai (Bếp Nóng)',
    deadline: '2026-08-25T14:00:00',
    deadlineDisplay: '14:00 (Quá hạn 2 giờ)',
    status: 'overdue',
    priority: 'urgent',
  },
  {
    id: 'tsk-3',
    name: 'Kiểm kê xuất nhập tồn kho bơ lạt & chocolate nguyên chất',
    description: 'Đối soát số lượng thực tế với bảng kê trên phần mềm ERP.',
    assignedTo: 'Vũ Thị Yến (Thủ Kho)',
    deadline: '2026-08-25T18:00:00',
    deadlineDisplay: '18:00 - Chiều nay',
    status: 'in_progress',
    priority: 'medium',
  },
  {
    id: 'tsk-4',
    name: 'Chụp ảnh bộ sưu tập Bánh Kem Trái Cây Mùa Thu',
    description: 'Chụp 10 mẫu bánh kem mới nhất để đẩy lên catalog Zalo OA & Website.',
    assignedTo: 'Phạm Quỳnh Anh (Marketing/Sale)',
    deadline: '2026-08-25T11:00:00',
    deadlineDisplay: '11:00 - Sáng nay',
    status: 'completed',
    priority: 'low',
  }
];

export const INITIAL_ORDERS = [
  {
    id: 'ord-801',
    code: 'SM-ORD-801',
    customer: 'Công ty Chứng Khoán SSI (Teabreak 100 người)',
    time: '14:32 - Ưu tiên cao ⚡',
    rawTime: '2026-08-25T14:32:00',
    total: 8900000,
    status: 'Bếp đang làm 👩‍🍳',
    statusCode: 'in_production',
    items: ['50x Bánh Mặn Croissant', '50x Macaron Hộp Quà', '100x Su Kem Phô Mai'],
    address: 'Tòa nhà SSI, 72 Nguyễn Huệ, Q.1',
    deliveryTime: '16:00 Hôm nay',
    isUrgent: true,
  },
  {
    id: 'ord-802',
    code: 'SM-ORD-802',
    customer: 'Chị Lê Minh Châu (Sinh nhật 2 tầng)',
    time: '14:15 - Khẩn cấp 🎂',
    rawTime: '2026-08-25T14:15:00',
    total: 1850000,
    status: 'Chờ giao hàng 🛵',
    statusCode: 'ready_for_fulfillment',
    items: ['1x Bánh Kem Trái Cây Cao Cấp 2 Tầng', '1x Nến số 18 + Pháo sáng'],
    address: 'Vinhomes Central Park, Park 5, Bình Thạnh',
    deliveryTime: '15:30 Hôm nay',
    isUrgent: true,
  },
  {
    id: 'ord-803',
    code: 'SM-ORD-803',
    customer: 'Trường Tiểu Học Quốc Tế Renaissance',
    time: '13:45 - Theo lịch 🏫',
    rawTime: '2026-08-25T13:45:00',
    total: 12500000,
    status: 'Đang vận chuyển 🛵',
    statusCode: 'in_delivery',
    items: ['300x Bánh Mì Bơ Sữa Học Sinh', '300x Nước Cam Tươi'],
    address: '74 Nguyễn Thị Thập, P. Bình Thuận, Q.7',
    deliveryTime: '14:45 Hôm nay',
    isUrgent: false,
  },
  {
    id: 'ord-804',
    code: 'SM-ORD-804',
    customer: 'Anh Hoàng Nam (Đặt lẻ bánh kem)',
    time: '12:10 - Đã nhận 🍰',
    rawTime: '2026-08-25T12:10:00',
    total: 580000,
    status: 'Giao thành công ✅',
    statusCode: 'completed',
    items: ['1x Bánh Kem Bắp Phô Mai 18cm'],
    address: '228 Nam Kỳ Khởi Nghĩa, Q.3',
    deliveryTime: '13:00 Hôm nay',
    isUrgent: false,
  },
  {
    id: 'ord-805',
    code: 'SM-ORD-805',
    customer: 'Tiệm Trà Sữa Mộc (Khách quen sỉ)',
    time: '10:30 - Sáng 🥐',
    rawTime: '2026-08-25T10:30:00',
    total: 2400000,
    status: 'Giao thành công ✅',
    statusCode: 'completed',
    items: ['40x Bánh Mì Hoa Cúc', '20x Bánh Mì Phô Mai Tan Chảy'],
    address: '15 Bùi Viện, Q.1',
    deliveryTime: '11:30 Hôm nay',
    isUrgent: false,
  },
];

export const PRODUCTS_CATALOG = [
  { id: 'p-1', name: 'Bánh Kem Bắp Phô Mai (Size 20cm)', price: 420000, category: 'Bánh Lạnh', image: '🌽' },
  { id: 'p-2', name: 'Hộp Macaron 12 Vị Cao Cấp', price: 360000, category: 'Macaron', image: '🧁' },
  { id: 'p-3', name: 'Hộp 4 Bánh Trung Thu Thập Cẩm Gà Quay', price: 780000, category: 'Bánh Mùa Vụ', image: '🥮' },
  { id: 'p-4', name: 'Bánh Mì Croissant Bơ Pháp (Combo 5 cái)', price: 175000, category: 'Bánh Mặn/Ngọt', image: '🥐' },
  { id: 'p-5', name: 'Set Teabreak Mini Tart & Choux (30 phần)', price: 1250000, category: 'Sự Kiện', image: '☕' },
];

export const STAFF_LIST_DROPDOWN = [
  'Nguyễn Văn An (Bếp Trưởng Lạnh)',
  'Trần Thị Mai (Bếp Phó Nóng)',
  'Lê Hoàng Khoa (Macaron X41)',
  'Phạm Quỳnh Anh (Thu Ngân/Sale)',
  'Bùi Đức Hùng (Đội Trưởng Vận Tải)',
  'Vũ Thị Yến (Thủ Kho X42)',
];
