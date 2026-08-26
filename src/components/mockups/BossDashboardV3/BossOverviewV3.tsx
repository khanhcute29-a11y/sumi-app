import React, { useState, useMemo } from 'react';
import {
  Crown,
  TrendingUp,
  TrendingDown,
  Users,
  Clock,
  MessageSquare,
  Send,
  Plus,
  Receipt,
  CheckCircle2,
  AlertTriangle,
  X,
  ChevronRight,
  Signal,
  Wifi,
  Battery,
  ClipboardList,
  Calendar,
  DollarSign,
  FileText,
  Bell,
  Check,
  Award,
  Package,
  Truck,
  ChefHat,
  Inbox,
  Zap,
  Megaphone,
  Gift
} from 'lucide-react';

const formatVND = (amount: number) => {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
};

export default function BossOverviewV3() {
  // ── States Quản Lý Bottom Sheets & Bộ Lọc Đơn Hàng ──
  const [activeSheet, setActiveSheet] = useState<
    'revenue_detail' | 'expense_detail' | 'order_drawer' | 'staff_detail' | 'task_sheet' | 'feed_sheet' | 'advance_sheet' | 'leave_sheet' | 'report_sheet' | 'schedule_sheet' | null
  >(null);
  const [selectedOrderFilter, setSelectedOrderFilter] = useState<string>('all');

  // ── Dữ Liệu 5 Nguồn Thu ──
  const revenueStreams = [
    { id: 'rev-1', channel: 'Bakery Trực Tiếp (POS)', amount: 5800000, percentage: '37.6%', icon: '🥐', note: '142 lượt khách mua bánh tại quầy' },
    { id: 'rev-2', channel: 'Hợp Đồng Trường Học', amount: 3000000, percentage: '19.5%', icon: '🏫', note: '3 trường mầm non & tiểu học' },
    { id: 'rev-3', channel: 'Sỉ Bánh Macaron', amount: 2500000, percentage: '16.2%', icon: '🧁', note: 'Set mix 6 & 12 màu' },
    { id: 'rev-4', channel: 'Tiệc Teabreak Doanh Nghiệp', amount: 2120000, percentage: '13.7%', icon: '☕', note: 'Teabreak FPT Software' },
    { id: 'rev-5', channel: 'Giao Sỉ Đại Lý & B2B', amount: 2000000, percentage: '13.0%', icon: '🚚', note: 'Các quán cafe đối tác' },
  ];
  const totalRevenue = 15420000;

  // ── Dữ Liệu Khoản Chi ──
  const expenseStreams = [
    { id: 'exp-1', title: 'Chi mua nguyên liệu (Bột mì, bơ sữa X42)', amount: 2500000, category: 'Nguyên liệu', time: '08:15', icon: '🧈' },
    { id: 'exp-2', title: 'Chi tạm ứng lương nhân viên (Đăng Khánh 2)', amount: 1000000, category: 'Nhân sự', time: '10:30', icon: '💵' },
    { id: 'exp-3', title: 'Chi tiền điện nước & internet xưởng', amount: 400000, category: 'Vận hành', time: '11:45', icon: '⚡' },
    { id: 'exp-4', title: 'Chi bảo trì lò nướng bánh xoay X41', amount: 250000, category: 'Bảo trì', time: '14:20', icon: '🔧' },
  ];
  const totalExpense = 4150000;

  const [selectedStaffTab, setSelectedStaffTab] = useState<'working' | 'late' | 'off'>('working');

  // ── Dữ Liệu Nhân Sự 3 Phân Nhóm Rõ Ràng (Đang làm, Đi trễ, Nghỉ phép) ──
  const staffList = [
    // 🟢 Nhóm Đang Làm Việc
    { id: 'st-1', name: 'Võ Đăng Khánh', role: 'Kỹ Thuật & Vận Hành', zone: 'Bakery', status: 'working', checkinTime: '05:50', shift: 'Ca Sáng (06:00 - 14:00)', note: 'Đúng giờ', avatar: '👨‍🍳' },
    { id: 'st-3', name: 'Hồ Hoàng Diễm', role: 'Quản Lý Bếp Bánh', zone: 'Bakery', status: 'working', checkinTime: '05:55', shift: 'Ca Sáng (06:00 - 14:00)', note: 'Đúng giờ', avatar: '👩‍💼' },
    { id: 'st-5', name: 'Trần Thị Mai', role: 'Bếp Trưởng Bánh Mì', zone: 'Xưởng 41', status: 'working', checkinTime: '05:45', shift: 'Ca Sáng (06:00 - 14:00)', note: 'Đúng giờ', avatar: '🥖' },
    { id: 'st-7', name: 'Nguyễn Văn An', role: 'Thợ Cốt Bánh Kem', zone: 'Bakery', status: 'working', checkinTime: '05:58', shift: 'Ca Sáng (06:00 - 14:00)', note: 'Đúng giờ', avatar: '🎂' },
    { id: 'st-9', name: 'Đoàn Thu Thảo', role: 'Bán Hàng Quầy Chiều', zone: 'Bakery', status: 'working', checkinTime: '13:50', shift: 'Ca Chiều (14:00 - 22:00)', note: 'Đúng giờ', avatar: '👩‍🍳' },

    // ⏰ Nhóm Đi Trễ
    { id: 'st-2', name: 'Đăng Khánh 2', role: 'Bán Hàng & Thu Ngân', zone: 'Bakery', status: 'late', checkinTime: '06:25', lateMinutes: 25, reason: 'Kẹt xe cầu Rạch Miễu giờ cao điểm', shift: 'Ca Sáng (06:00 - 14:00)', avatar: '🍰' },
    { id: 'st-6', name: 'Vũ Thị Yến', role: 'Thủ Kho & Đóng Gói', zone: 'Xưởng 42', status: 'late', checkinTime: '06:30', lateMinutes: 30, reason: 'Hỏng xe máy giữa đường đã báo Quản lý', shift: 'Ca Sáng (06:00 - 14:00)', avatar: '📦' },
    { id: 'st-10', name: 'Bùi Quốc Bảo', role: 'Thợ Nướng Bánh Mì', zone: 'Xưởng 41', status: 'late', checkinTime: '06:15', lateMinutes: 15, reason: 'Đưa con đi khám bệnh sáng sớm', shift: 'Ca Sáng (06:00 - 14:00)', avatar: '🍞' },

    // 🔴 Nhóm Nghỉ Phép / Nghỉ Ca
    { id: 'st-4', name: 'Lê Hoàng Khoa', role: 'Thợ Bánh Macaron', zone: 'Xưởng 41', status: 'off', leaveType: 'Nghỉ phép năm', reason: 'Về quê có việc gia đình (Đã duyệt phép)', approvedBy: 'Sếp Khánh', avatar: '🧁' },
    { id: 'st-8', name: 'Phạm Minh Trí', role: 'Đóng Gói Bánh X42', zone: 'Xưởng 42', status: 'off', leaveType: 'Nghỉ ốm', reason: 'Sốt xuất huyết có giấy chứng nhận viện', approvedBy: 'Quản lý Diễm', avatar: '🏥' },
  ];

  const staffCounts = {
    total: 50,
    working: 45,
    late: 3,
    off: 2
  };

  // ── Dữ Liệu Bảng Tin & Tag Tên ──
  const [comments, setComments] = useState([
    {
      id: 'cm-1',
      author: 'Võ Đăng Khánh (Sếp Tổng 👑)',
      time: '14:30 · Hôm nay',
      text: 'Toàn bộ ca chiều chú ý mẻ bánh Macaron giao đối tác FPT lúc 16h30. @Lê_Hoàng_Khoa kiểm tra kỹ nhiệt độ đóng hộp!',
      taggedUsers: ['Lê_Hoàng_Khoa'],
      reactions: 8
    },
    {
      id: 'cm-2',
      author: 'Lê Hoàng Khoa (Thợ Bánh Macaron)',
      time: '14:35 · Vừa xong',
      text: 'Dạ Sếp @Võ_Đăng_Khánh, em đã đóng gói xong 50 hộp Set 6 màu, bánh đang giữ lạnh 4°C chuẩn bị giao ạ! ❤️',
      taggedUsers: ['Võ_Đăng_Khánh'],
      reactions: 5
    }
  ]);
  const [inputComment, setInputComment] = useState('');

  // ── Dữ Liệu Giao Việc Nhanh ──
  const [taskTitle, setTaskTitle] = useState('Kiểm tra chất lượng mẻ bánh Macaron');
  const [taskDesc, setTaskDesc] = useState('Đo chuẩn đường kính vỏ bánh 4.5cm, nhân phô mai dâu mềm mịn không chảy');
  const [taskDeadline, setTaskDeadline] = useState('16:00 Hôm nay');
  const [taskAssignee, setTaskAssignee] = useState('Lê Hoàng Khoa');
  const [managedTasks, setManagedTasks] = useState([
    {
      id: 'tsk-1',
      title: 'Kiểm tra chất lượng mẻ bánh Macaron',
      desc: 'Đo chuẩn đường kính vỏ bánh 4.5cm, nhân phô mai dâu',
      assignee: 'Lê Hoàng Khoa',
      deadline: '16:00 Hôm nay',
      status: 'in_progress',
      statusLabel: 'Đang làm'
    },
    {
      id: 'tsk-2',
      title: 'Bảo trì máy trộn bột xoay 30L',
      desc: 'Tra dầu mỡ định kỳ và kiểm tra độ căng dây curoa',
      assignee: 'Vũ Thị Yến',
      deadline: '17:30 Hôm nay',
      status: 'pending',
      statusLabel: 'Chưa xong'
    }
  ]);

  // ── 7 TRẠNG THÁI ĐƠN HÀNG CHUẨN ĐỐI CHIẾU 100% VỚI HỆ THỐNG WEB THẬT ──
  const allOrders = [
    {
      id: 'ord-1',
      code: 'BK-0826-01',
      customer: 'Chị Minh Thư (VIP Tiệc Cưới)',
      item: '1x Bánh Cưới 3 Tầng Dâu Tây & Hoa Tươi',
      total: 1850000,
      deliveryTime: '15:15 (Khẩn cấp ⚡)',
      status_v2: 'in_production',
      statusLabel: 'Bếp đang làm 👩‍🍳',
      station: 'Bakery Bếp Lạnh',
      isUrgent: true,
      priorityRank: 1
    },
    {
      id: 'ord-2',
      code: 'MC-0826-02',
      customer: 'FPT Software (Teabreak Văn Phòng)',
      item: '50x Macaron Set 6 màu + 20x Croissant',
      total: 2000000,
      deliveryTime: '16:00 (Giao gấp ⚡)',
      status_v2: 'ready_for_fulfillment',
      statusLabel: 'Chờ vận chuyển 📦',
      station: 'Xưởng 41',
      isUrgent: true,
      priorityRank: 2
    },
    {
      id: 'ord-3',
      code: 'SCH-0826-03',
      customer: 'Trường Mầm Non Họa Mi (Hợp đồng)',
      item: '120x Bánh Mì Bơ Sữa X42',
      total: 3620000,
      deliveryTime: '16:45',
      status_v2: 'in_production',
      statusLabel: 'Bếp đang làm 👩‍🍳',
      station: 'Xưởng 42',
      isUrgent: false,
      priorityRank: 3
    },
    {
      id: 'ord-4',
      code: 'BK-0826-04',
      customer: 'Anh Tuấn Khang (Sinh Nhật Bé)',
      item: '1x Bánh Kem Bắp Phô Mai 20cm',
      total: 420000,
      deliveryTime: '17:30',
      status_v2: 'awaiting_assignment',
      statusLabel: 'Đơn chờ làm 📥',
      station: 'Bakery',
      isUrgent: false,
      priorityRank: 4
    },
    {
      id: 'ord-5',
      code: 'SHP-0826-05',
      customer: 'Chị Lan Hương (Giao Tận Nơi)',
      item: '2x Hộp Macaron 12 viên Luxury',
      total: 580000,
      deliveryTime: '17:45',
      status_v2: 'in_delivery',
      statusLabel: 'Đang vận chuyển 🛵',
      station: 'Shipper Hoàng Dũng',
      isUrgent: false,
      priorityRank: 5
    },
    {
      id: 'ord-6',
      code: 'RT-0826-06',
      customer: 'Khách vãng lai Quầy Bakery',
      item: '10x Su Kem Phô Mai + 5x Tart Trứng',
      total: 380000,
      deliveryTime: '14:00',
      status_v2: 'completed',
      statusLabel: 'Giao thành công ✅',
      station: 'Quầy Bakery',
      isUrgent: false,
      priorityRank: 6
    },
    {
      id: 'ord-7',
      code: 'X41-0826-07',
      customer: 'Tiệm Trà Sữa TocoToco',
      item: '30x Bánh Mì Phô Mai Tan Chảy',
      total: 750000,
      deliveryTime: '13:30 (Trễ hẹn ⚠️)',
      status_v2: 'overdue',
      statusLabel: 'Chưa thực hiện ⚠️',
      station: 'Xưởng 41',
      isUrgent: true,
      priorityRank: 0 // Đơn trễ hẹn ưu tiên xử lý khẩn cấp nhất
    }
  ];

  // Tính toán số lượng theo đúng logic chuẩn của MobileHomeScreen / OrderStatusOverview
  const orderCounts = useMemo(() => {
    return {
      total: allOrders.length,
      waiting: allOrders.filter(o => o.status_v2 === 'awaiting_assignment').length,
      production: allOrders.filter(o => o.status_v2 === 'in_production').length,
      ready: allOrders.filter(o => o.status_v2 === 'ready_for_fulfillment').length,
      delivery: allOrders.filter(o => o.status_v2 === 'in_delivery').length,
      completed: allOrders.filter(o => o.status_v2 === 'completed').length,
      overdue: allOrders.filter(o => o.status_v2 === 'overdue').length,
    };
  }, [allOrders]);

  // Lọc và sắp xếp đơn hàng theo thứ tự ưu tiên giảm dần từ trên xuống
  const filteredOrders = useMemo(() => {
    let list = [...allOrders];
    if (selectedOrderFilter !== 'all') {
      list = list.filter(o => o.status_v2 === selectedOrderFilter);
    }
    // Sắp xếp ưu tiên: đơn khẩn cấp/trễ hẹn (priorityRank thấp) lên trên cùng
    return list.sort((a, b) => a.priorityRank - b.priorityRank);
  }, [allOrders, selectedOrderFilter]);

  // Mở Drawer lọc đơn theo từng ô
  const handleOpenOrderDrawer = (filterKey: string = 'all') => {
    setSelectedOrderFilter(filterKey);
    setActiveSheet('order_drawer');
  };

  // ── Toast Alert ──
  const [toast, setToast] = useState('');
  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2800);
  };

  // ── Gửi Bình Luận Tag Tên ──
  const handleSendComment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputComment.trim()) return;

    const tagMatches = inputComment.match(/@([a-zA-Z0-9_À-ỹ]+)/g) || [];
    const tags = tagMatches.map(t => t.replace('@', ''));

    const newCm = {
      id: `cm-${Date.now()}`,
      author: 'Võ Đăng Khánh (Sếp Tổng 👑)',
      time: 'Vừa xong',
      text: inputComment.trim(),
      taggedUsers: tags,
      reactions: 1
    };

    setComments([newCm, ...comments]);
    setInputComment('');
    showToast('💬 Đã phát thông báo chỉ đạo công khai đến toàn thể nhân viên!');
  };

  // ── Giao Việc Nhanh ──
  const handleCreateTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskTitle.trim()) {
      showToast('⚠️ Vui lòng nhập tên công việc!');
      return;
    }

    const newTask = {
      id: `tsk-${Date.now()}`,
      title: taskTitle.trim(),
      desc: taskDesc.trim() || 'Thực hiện nghiêm túc theo chỉ đạo',
      assignee: taskAssignee,
      deadline: taskDeadline,
      status: 'in_progress',
      statusLabel: 'Mới giao'
    };

    setManagedTasks([newTask, ...managedTasks]);
    setActiveSheet(null);
    showToast(`⚡ Đã giao việc "${newTask.title}" cho ${newTask.assignee}!`);
  };

  // Render nội dung có highlight tag @Name
  const renderFormattedText = (text: string) => {
    const parts = text.split(/(@[a-zA-Z0-9_À-ỹ]+)/g);
    return parts.map((part, index) => {
      if (part.startsWith('@')) {
        return (
          <span
            key={index}
            style={{
              background: '#fef3c7',
              color: '#b45309',
              fontWeight: 900,
              padding: '1px 6px',
              borderRadius: 6,
              border: '1px solid #fcd34d',
              margin: '0 2px'
            }}
          >
            {part}
          </span>
        );
      }
      return part;
    });
  };

  return (
    <div style={{ background: '#dcd3c7', minHeight: '100vh', padding: '16px 8px', boxSizing: 'border-box' }}>

      {/* ========================================================================= */}
      {/* ── SMARTPHONE FRAME CONTAINER (CHUẨN DI ĐỘNG 420PX) ── */}
      {/* ========================================================================= */}
      <div style={{
        maxWidth: 420,
        minHeight: 880,
        maxHeight: '94vh',
        margin: '8px auto',
        backgroundColor: '#faf6f0',
        boxShadow: '0 25px 60px -15px rgba(45, 28, 16, 0.45), 0 0 0 1px rgba(0, 0, 0, 0.1)',
        borderRadius: 44,
        border: '12px solid #1c1917',
        position: 'relative',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        boxSizing: 'border-box',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        color: '#2d1c10'
      }}>

        {/* Dynamic Island Notch */}
        <div style={{
          width: 120,
          height: 24,
          background: '#1c1917',
          borderRadius: '0 0 16px 16px',
          position: 'absolute',
          top: 0,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 1001,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          <div style={{ width: 10, height: 10, background: '#09090b', borderRadius: '50%', border: '1.5px solid #27272a' }} />
        </div>

        {/* Status Bar */}
        <div style={{
          height: 38,
          padding: '8px 20px 0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: 13,
          fontWeight: 800,
          color: '#2d1c10',
          zIndex: 1000
        }}>
          <span>09:41</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Signal size={12} />
            <Wifi size={13} />
            <span style={{ fontSize: 11 }}>5G</span>
            <Battery size={15} />
          </div>
        </div>

        {/* Top Header Tag */}
        <div style={{
          padding: '6px 14px 10px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid #eadcca'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{
              width: 34,
              height: 34,
              borderRadius: 10,
              background: 'linear-gradient(135deg, #c28c4e 0%, #8b5900 100%)',
              color: '#fff',
              display: 'grid',
              placeItems: 'center',
              boxShadow: '0 2px 6px rgba(194, 140, 78, 0.4)'
            }}>
              <Crown size={18} />
            </div>
            <div>
              <div style={{ fontSize: 10.5, fontWeight: 900, color: '#a08060', letterSpacing: '.06em', textTransform: 'uppercase' }}>
                SUMI BAKERY ENTERPRISE
              </div>
              <h1 style={{ fontSize: 16, fontWeight: 900, margin: 0, color: '#2d1c10' }}>
                Tổng Giám Đốc (Sếp Võ Đăng Khánh)
              </h1>
            </div>
          </div>

          <div style={{
            background: '#fee2e2',
            color: '#dc2626',
            fontSize: 10.5,
            fontWeight: 900,
            padding: '4px 8px',
            borderRadius: 99,
            display: 'flex',
            alignItems: 'center',
            gap: 4
          }}>
            <span style={{ width: 6, height: 6, background: '#dc2626', borderRadius: '50%' }} />
            V3 Executive
          </div>
        </div>

        {/* ── SCROLLABLE DASHBOARD BODY ── */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: '12px 14px 90px',
          boxSizing: 'border-box'
        }}>

          {/* ========================================================================= */}
          {/* 1. BANNER KPI "DOANH THU & CHI TIÊU" (2 KHỐI TÀI CHÍNH SONG SONG) */}
          {/* ========================================================================= */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
            {/* Khối 1: Tổng Doanh Thu */}
            <div
              onClick={() => setActiveSheet('revenue_detail')}
              style={{
                background: '#ffffff',
                border: '2px solid #bbf7d0',
                borderRadius: 20,
                padding: '12px 10px',
                cursor: 'pointer',
                boxShadow: '0 4px 12px rgba(22, 101, 52, 0.08)',
                transition: 'all 0.2s ease',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 11, fontWeight: 900, color: '#166534', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <TrendingUp size={14} /> DOANH THU
                </span>
                <span style={{ fontSize: 10, background: '#dcfce7', color: '#15803d', fontWeight: 900, padding: '2px 6px', borderRadius: 6 }}>
                  +18.4%
                </span>
              </div>

              <div style={{ fontSize: 18, fontWeight: 900, color: '#15803d', margin: '4px 0 2px' }}>
                {formatVND(totalRevenue)}
              </div>

              <div style={{ fontSize: 10.5, fontWeight: 800, color: '#725f50', display: 'flex', alignItems: 'center', gap: 2 }}>
                Nguồn thu hôm nay <ChevronRight size={12} />
              </div>
            </div>

            {/* Khối 2: Tổng Chi Tiêu */}
            <div
              onClick={() => setActiveSheet('expense_detail')}
              style={{
                background: '#ffffff',
                border: '2px solid #fecaca',
                borderRadius: 20,
                padding: '12px 10px',
                cursor: 'pointer',
                boxShadow: '0 4px 12px rgba(220, 38, 38, 0.08)',
                transition: 'all 0.2s ease',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 11, fontWeight: 900, color: '#991b1b', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <TrendingDown size={14} /> TỔNG CHI
                </span>
                <span style={{ fontSize: 10, background: '#fee2e2', color: '#dc2626', fontWeight: 900, padding: '2px 6px', borderRadius: 6 }}>
                  Sổ cái
                </span>
              </div>

              <div style={{ fontSize: 18, fontWeight: 900, color: '#dc2626', margin: '4px 0 2px' }}>
                {formatVND(totalExpense)}
              </div>

              <div style={{ fontSize: 10.5, fontWeight: 800, color: '#725f50', display: 'flex', alignItems: 'center', gap: 2 }}>
                Sổ cái khoản chi <ChevronRight size={12} />
              </div>
            </div>
          </div>

          {/* ========================================================================= */}
          {/* 2. KHỐI THỐNG KÊ NHÂN SỰ & CHẤM CÔNG (GRID 2 CỘT) */}
          {/* ========================================================================= */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
            {/* Thẻ 1: KPI Nhân sự 50 người */}
            <div
              onClick={() => setActiveSheet('staff_detail')}
              style={{
                background: '#fff',
                border: '1.5px solid #eadcca',
                borderRadius: 18,
                padding: 12,
                cursor: 'pointer',
                boxShadow: '0 2px 8px rgba(0,0,0,0.04)'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 11, fontWeight: 900, color: '#725f50', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Users size={14} color="#b45309" /> TỔNG NHÂN SỰ
                </span>
                <ChevronRight size={12} style={{ color: '#a08060' }} />
              </div>

              <div style={{ fontSize: 20, fontWeight: 900, color: '#2d1c10' }}>
                50 <span style={{ fontSize: 12, fontWeight: 800, color: '#725f50' }}>người</span>
              </div>

              <div style={{ display: 'flex', gap: 6, marginTop: 4, fontSize: 11, fontWeight: 800 }}>
                <span style={{ color: '#2563eb' }}>👨 Nam: 20</span>
                <span style={{ color: '#db2777' }}>👩 Nữ: 30</span>
              </div>
            </div>

            {/* Thẻ 2: Trạng thái làm việc (45 Đang làm, 3 Trễ, 2 Nghỉ) */}
            <div
              onClick={() => { setSelectedStaffTab('working'); setActiveSheet('staff_detail'); }}
              style={{
                background: '#fff',
                border: '1.5px solid #eadcca',
                borderRadius: 18,
                padding: 12,
                cursor: 'pointer',
                boxShadow: '0 2px 8px rgba(0,0,0,0.04)'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 11, fontWeight: 900, color: '#15803d', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Clock size={14} /> ĐANG LÀM VIỆC
                </span>
                <span style={{ width: 8, height: 8, background: '#22c55e', borderRadius: '50%', boxShadow: '0 0 0 2px rgba(34,197,94,0.3)' }} />
              </div>

              <div style={{ fontSize: 20, fontWeight: 900, color: '#15803d' }}>
                45/50 <span style={{ fontSize: 12, fontWeight: 800, color: '#725f50' }}>online</span>
              </div>

              {/* Tóm tắt 3 luồng trực quan */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4, fontSize: 10.5, fontWeight: 800 }}>
                <span style={{ color: '#15803d', background: '#dcfce7', padding: '1px 5px', borderRadius: 4 }}>🟢 45 Làm</span>
                <span style={{ color: '#b45309', background: '#fef3c7', padding: '1px 5px', borderRadius: 4 }}>⏰ 3 Trễ</span>
                <span style={{ color: '#dc2626', background: '#fee2e2', padding: '1px 5px', borderRadius: 4 }}>🔴 2 Nghỉ</span>
              </div>
            </div>
          </div>

          {/* ========================================================================= */}
          {/* 3. KHỐI "TÔI (QUẢN TRỊ & TIỆN ÍCH ĐIỀU HÀNH SẾP)" — LƯỚI Ô GẠCH */}
          {/* ========================================================================= */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, padding: '0 2px' }}>
            <span style={{ fontSize: 13, fontWeight: 900, color: '#2d1c10', display: 'flex', alignItems: 'center', gap: 6 }}>
              👤 TÔI (QUẢN TRỊ & TIỆN ÍCH ĐIỀU HÀNH)
            </span>
            <span style={{ fontSize: 11, fontWeight: 800, color: '#c28c4e' }}>6 mục điều hành</span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
            {/* Ô 1: Giao việc nhanh */}
            <div
              onClick={() => setActiveSheet('task_sheet')}
              style={{
                background: '#ffffff',
                border: '1.5px solid #eadcca',
                borderRadius: 18,
                padding: '12px 14px',
                cursor: 'pointer',
                boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                minHeight: 88,
                boxSizing: 'border-box'
              }}
            >
              <div>
                <Zap size={22} color="#b87a48" strokeWidth={1.6} />
              </div>
              <div style={{ marginTop: 6 }}>
                <div style={{ fontSize: 13.5, fontWeight: 800, color: '#2d1c10' }}>1. Giao việc</div>
                <div style={{ fontSize: 11, color: '#725f50', marginTop: 1 }}>Giao việc 30+ NV</div>
              </div>
            </div>

            {/* Ô 2: Bảng tin & Chỉ đạo tag tên */}
            <div
              onClick={() => setActiveSheet('feed_sheet')}
              style={{
                background: '#ffffff',
                border: '1.5px solid #eadcca',
                borderRadius: 18,
                padding: '12px 14px',
                cursor: 'pointer',
                boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                minHeight: 88,
                boxSizing: 'border-box'
              }}
            >
              <div>
                <Megaphone size={22} color="#b87a48" strokeWidth={1.6} />
              </div>
              <div style={{ marginTop: 6 }}>
                <div style={{ fontSize: 13.5, fontWeight: 800, color: '#2d1c10' }}>2. Bảng tin</div>
                <div style={{ fontSize: 11, color: '#725f50', marginTop: 1 }}>Chỉ đạo & Tag @Tên</div>
              </div>
            </div>

            {/* Ô 3: Duyệt tạm ứng */}
            <div
              onClick={() => setActiveSheet('advance_sheet')}
              style={{
                background: '#ffffff',
                border: '1.5px solid #eadcca',
                borderRadius: 18,
                padding: '12px 14px',
                cursor: 'pointer',
                boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                minHeight: 88,
                boxSizing: 'border-box'
              }}
            >
              <div>
                <DollarSign size={22} color="#b87a48" strokeWidth={1.6} />
              </div>
              <div style={{ marginTop: 6 }}>
                <div style={{ fontSize: 13.5, fontWeight: 800, color: '#2d1c10' }}>3. Tạm ứng</div>
                <div style={{ fontSize: 11, color: '#725f50', marginTop: 1 }}>1 đơn chờ duyệt</div>
              </div>
            </div>

            {/* Ô 4: Duyệt nghỉ phép */}
            <div
              onClick={() => setActiveSheet('leave_sheet')}
              style={{
                background: '#ffffff',
                border: '1.5px solid #eadcca',
                borderRadius: 18,
                padding: '12px 14px',
                cursor: 'pointer',
                boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                minHeight: 88,
                boxSizing: 'border-box'
              }}
            >
              <div>
                <FileText size={22} color="#b87a48" strokeWidth={1.6} />
              </div>
              <div style={{ marginTop: 6 }}>
                <div style={{ fontSize: 13.5, fontWeight: 800, color: '#2d1c10' }}>4. Xin nghỉ</div>
                <div style={{ fontSize: 11, color: '#725f50', marginTop: 1 }}>Đơn nghỉ phép</div>
              </div>
            </div>

            {/* Ô 5: Báo cáo ca ngày */}
            <div
              onClick={() => setActiveSheet('report_sheet')}
              style={{
                background: '#ffffff',
                border: '1.5px solid #eadcca',
                borderRadius: 18,
                padding: '12px 14px',
                cursor: 'pointer',
                boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                minHeight: 88,
                boxSizing: 'border-box'
              }}
            >
              <div>
                <ClipboardList size={22} color="#b87a48" strokeWidth={1.6} />
              </div>
              <div style={{ marginTop: 6 }}>
                <div style={{ fontSize: 13.5, fontWeight: 800, color: '#2d1c10' }}>5. Báo cáo ngày</div>
                <div style={{ fontSize: 11, color: '#725f50', marginTop: 1 }}>Báo cáo cuối ca</div>
              </div>
            </div>

            {/* Ô 6: Lịch phân ca */}
            <div
              onClick={() => setActiveSheet('schedule_sheet')}
              style={{
                background: '#ffffff',
                border: '1.5px solid #eadcca',
                borderRadius: 18,
                padding: '12px 14px',
                cursor: 'pointer',
                boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                minHeight: 88,
                boxSizing: 'border-box'
              }}
            >
              <div>
                <Calendar size={22} color="#b87a48" strokeWidth={1.6} />
              </div>
              <div style={{ marginTop: 6 }}>
                <div style={{ fontSize: 13.5, fontWeight: 800, color: '#2d1c10' }}>6. Lịch làm</div>
                <div style={{ fontSize: 11, color: '#725f50', marginTop: 1 }}>Phân ca tuần này</div>
              </div>
            </div>
          </div>

          {/* ========================================================================= */}
          {/* 4. KHỐI TÌNH TRẠNG & TIẾN ĐỘ ĐƠN HÀNG (7 Ô GẠCH CHUẨN ĐỐI CHIẾU WEB THẬT) */}
          {/* ========================================================================= */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, padding: '0 2px' }}>
            <span style={{ fontSize: 13, fontWeight: 900, color: '#2d1c10', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Receipt size={16} color="#b45309" /> TÌNH TRẠNG & TIẾN ĐỘ ĐƠN HÀNG
            </span>
            <button
              onClick={() => handleOpenOrderDrawer('all')}
              style={{ background: 'none', border: 'none', color: '#b93e13', fontSize: 12.5, fontWeight: 900, cursor: 'pointer' }}
            >
              {orderCounts.total} đơn ›
            </button>
          </div>

          {/* Lưới 7 Ô Gạch Phân Loại Trực Quan */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
            {/* Ô 1: Tổng đơn hàng */}
            <div
              onClick={() => handleOpenOrderDrawer('all')}
              style={{
                background: '#ffffff',
                border: '1.5px solid #eadcca',
                borderRadius: 16,
                padding: '10px 12px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                boxShadow: '0 2px 6px rgba(0,0,0,0.03)'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <FileText size={20} color="#b87a48" strokeWidth={1.6} />
                <span style={{ fontSize: 12, fontWeight: 900, color: '#2d1c10' }}>Tổng đơn hàng</span>
              </div>
              <span style={{ fontSize: 16, fontWeight: 900, color: '#2d1c10' }}>{orderCounts.total}</span>
            </div>

            {/* Ô 2: Đơn chờ làm */}
            <div
              onClick={() => handleOpenOrderDrawer('awaiting_assignment')}
              style={{
                background: '#ffffff',
                border: '1.5px solid #eadcca',
                borderRadius: 16,
                padding: '10px 12px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                boxShadow: '0 2px 6px rgba(0,0,0,0.03)'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Inbox size={20} color="#b87a48" strokeWidth={1.6} />
                <span style={{ fontSize: 12, fontWeight: 900, color: '#2d1c10' }}>Đơn chờ làm</span>
              </div>
              <span style={{ fontSize: 16, fontWeight: 900, color: '#2d1c10' }}>{orderCounts.waiting}</span>
            </div>

            {/* Ô 3: Bếp đang làm */}
            <div
              onClick={() => handleOpenOrderDrawer('in_production')}
              style={{
                background: '#ffffff',
                border: '1.5px solid #eadcca',
                borderRadius: 16,
                padding: '10px 12px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                boxShadow: '0 2px 6px rgba(0,0,0,0.03)'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <ChefHat size={20} color="#b87a48" strokeWidth={1.6} />
                <span style={{ fontSize: 12, fontWeight: 900, color: '#2d1c10' }}>Bếp đang làm</span>
              </div>
              <span style={{ fontSize: 16, fontWeight: 900, color: '#d97706' }}>{orderCounts.production}</span>
            </div>

            {/* Ô 4: Chờ vận chuyển */}
            <div
              onClick={() => handleOpenOrderDrawer('ready_for_fulfillment')}
              style={{
                background: '#ffffff',
                border: '1.5px solid #eadcca',
                borderRadius: 16,
                padding: '10px 12px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                boxShadow: '0 2px 6px rgba(0,0,0,0.03)'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Package size={20} color="#b87a48" strokeWidth={1.6} />
                <span style={{ fontSize: 12, fontWeight: 900, color: '#2d1c10' }}>Chờ vận chuyển</span>
              </div>
              <span style={{ fontSize: 16, fontWeight: 900, color: '#2563eb' }}>{orderCounts.ready}</span>
            </div>

            {/* Ô 5: Đang vận chuyển */}
            <div
              onClick={() => handleOpenOrderDrawer('in_delivery')}
              style={{
                background: '#ffffff',
                border: '1.5px solid #eadcca',
                borderRadius: 16,
                padding: '10px 12px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                boxShadow: '0 2px 6px rgba(0,0,0,0.03)'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Truck size={20} color="#b87a48" strokeWidth={1.6} />
                <span style={{ fontSize: 12, fontWeight: 900, color: '#2d1c10' }}>Đang vận chuyển</span>
              </div>
              <span style={{ fontSize: 16, fontWeight: 900, color: '#9333ea' }}>{orderCounts.delivery}</span>
            </div>

            {/* Ô 6: Giao thành công */}
            <div
              onClick={() => handleOpenOrderDrawer('completed')}
              style={{
                background: '#ffffff',
                border: '1.5px solid #eadcca',
                borderRadius: 16,
                padding: '10px 12px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                boxShadow: '0 2px 6px rgba(0,0,0,0.03)'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <CheckCircle2 size={20} color="#16a34a" strokeWidth={1.6} />
                <span style={{ fontSize: 12, fontWeight: 900, color: '#2d1c10' }}>Giao thành công</span>
              </div>
              <span style={{ fontSize: 16, fontWeight: 900, color: '#16a34a' }}>{orderCounts.completed}</span>
            </div>

            {/* Ô 7: Chưa thực hiện (Chiếm 2 cột nổi bật) */}
            <div
              onClick={() => handleOpenOrderDrawer('overdue')}
              style={{
                gridColumn: 'span 2',
                background: orderCounts.overdue > 0 ? '#fff7ed' : '#ffffff',
                border: orderCounts.overdue > 0 ? '1.5px solid #fdba74' : '1.5px solid #eadcca',
                borderRadius: 16,
                padding: '10px 12px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                boxShadow: '0 2px 6px rgba(0,0,0,0.03)'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <AlertTriangle size={20} color="#dc2626" strokeWidth={1.6} />
                <span style={{ fontSize: 12, fontWeight: 900, color: orderCounts.overdue > 0 ? '#c2410c' : '#2d1c10' }}>
                  Chưa thực hiện / Trễ hẹn
                </span>
              </div>
              <span style={{ fontSize: 16, fontWeight: 900, color: orderCounts.overdue > 0 ? '#dc2626' : '#725f50' }}>
                {orderCounts.overdue}
              </span>
            </div>
          </div>

        </div>

        {/* ========================================================================= */}
        {/* ── BOTTOM SHEET: 1. CHI TIẾT DOANH THU & NGUỒN THU ── */}
        {/* ========================================================================= */}
        {activeSheet === 'revenue_detail' && (
          <div className="sheet-overlay" onClick={() => setActiveSheet(null)} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(2px)', zIndex: 1200, display: 'flex', alignItems: 'flex-end' }}>
            <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxHeight: '82%', background: '#fff', borderRadius: '28px 28px 0 0', padding: '16px 14px 30px', boxSizing: 'border-box', overflowY: 'auto' }}>
              <div style={{ width: 38, height: 4, background: '#cbd5e1', borderRadius: 99, margin: '0 auto 12px' }} />
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, paddingBottom: 8, borderBottom: '1.5px solid #eadcca' }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 900, color: '#166534' }}>📊 Chi Tiết Nguồn Thu Hôm Nay</div>
                  <div style={{ fontSize: 11, color: '#725f50' }}>Tổng cộng: {formatVND(totalRevenue)}</div>
                </div>
                <button onClick={() => setActiveSheet(null)} style={{ width: 28, height: 28, borderRadius: 8, background: '#f4efe8', border: 'none', fontWeight: 900, cursor: 'pointer' }}>✕</button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {revenueStreams.map(rev => (
                  <div key={rev.id} style={{ background: '#faf6f0', border: '1.5px solid #eadcca', borderRadius: 14, padding: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 22 }}>{rev.icon}</span>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 900, color: '#2d1c10' }}>{rev.channel}</div>
                          <div style={{ fontSize: 11, color: '#725f50', marginTop: 2 }}>{rev.note}</div>
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 14, fontWeight: 900, color: '#15803d' }}>{formatVND(rev.amount)}</div>
                        <div style={{ fontSize: 10.5, fontWeight: 800, color: '#a08060' }}>{rev.percentage} tổng thu</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* ── BOTTOM SHEET: 2. SỔ CÁI KHOẢN CHI THỰC TẾ ── */}
        {/* ========================================================================= */}
        {activeSheet === 'expense_detail' && (
          <div className="sheet-overlay" onClick={() => setActiveSheet(null)} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(2px)', zIndex: 1200, display: 'flex', alignItems: 'flex-end' }}>
            <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxHeight: '82%', background: '#fff', borderRadius: '28px 28px 0 0', padding: '16px 14px 30px', boxSizing: 'border-box', overflowY: 'auto' }}>
              <div style={{ width: 38, height: 4, background: '#cbd5e1', borderRadius: 99, margin: '0 auto 12px' }} />
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, paddingBottom: 8, borderBottom: '1.5px solid #eadcca' }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 900, color: '#dc2626' }}>📑 Sổ Cái Khoản Chi Tiêu Hôm Nay</div>
                  <div style={{ fontSize: 11, color: '#725f50' }}>Tổng chi: {formatVND(totalExpense)}</div>
                </div>
                <button onClick={() => setActiveSheet(null)} style={{ width: 28, height: 28, borderRadius: 8, background: '#f4efe8', border: 'none', fontWeight: 900, cursor: 'pointer' }}>✕</button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {expenseStreams.map(exp => (
                  <div key={exp.id} style={{ background: '#fff', border: '1.5px solid #fecaca', borderRadius: 14, padding: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 20 }}>{exp.icon}</span>
                        <div>
                          <div style={{ fontSize: 12.5, fontWeight: 900, color: '#2d1c10' }}>{exp.title}</div>
                          <div style={{ fontSize: 11, color: '#725f50', marginTop: 2 }}>Phân loại: <strong>{exp.category}</strong> · {exp.time}</div>
                        </div>
                      </div>
                      <div style={{ fontSize: 13.5, fontWeight: 900, color: '#dc2626' }}>
                        -{formatVND(exp.amount)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* ── BOTTOM SHEET: 3. GIAO VIỆC NHANH (TASK DELEGATION) ── */}
        {/* ========================================================================= */}
        {activeSheet === 'task_sheet' && (
          <div className="sheet-overlay" onClick={() => setActiveSheet(null)} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(2px)', zIndex: 1300, display: 'flex', alignItems: 'flex-end' }}>
            <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxHeight: '85%', background: '#fff', borderRadius: '28px 28px 0 0', padding: '16px 14px 30px', boxSizing: 'border-box', overflowY: 'auto' }}>
              <div style={{ width: 38, height: 4, background: '#cbd5e1', borderRadius: 99, margin: '0 auto 12px' }} />
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, paddingBottom: 8, borderBottom: '1.5px solid #eadcca' }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 900, color: '#8b5900' }}>⚡ Giao Việc Nhanh Cho Nhân Viên</div>
                  <div style={{ fontSize: 11, color: '#725f50' }}>Tự động đồng bộ sang màn hình Nhân viên</div>
                </div>
                <button onClick={() => setActiveSheet(null)} style={{ width: 28, height: 28, borderRadius: 8, background: '#f4efe8', border: 'none', fontWeight: 900, cursor: 'pointer' }}>✕</button>
              </div>

              <form onSubmit={handleCreateTask} style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 800, color: '#725f50', marginBottom: 2 }}>Tên công việc *</div>
                  <input
                    type="text"
                    placeholder="VD: Kiểm tra chất lượng mẻ bánh Macaron"
                    value={taskTitle}
                    onChange={e => setTaskTitle(e.target.value)}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1.5px solid #eadcca', fontSize: 12, outline: 'none', background: '#faf6f0', boxSizing: 'border-box' }}
                  />
                </div>

                <div>
                  <div style={{ fontSize: 11, fontWeight: 800, color: '#725f50', marginBottom: 2 }}>Mô tả chi tiết nhiệm vụ</div>
                  <textarea
                    rows={3}
                    placeholder="Nhập yêu cầu thực hiện, kích thước, tiêu chuẩn chất lượng..."
                    value={taskDesc}
                    onChange={e => setTaskDesc(e.target.value)}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1.5px solid #eadcca', fontSize: 12, outline: 'none', background: '#faf6f0', boxSizing: 'border-box' }}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 800, color: '#725f50', marginBottom: 2 }}>Người nhận việc</div>
                    <select
                      value={taskAssignee}
                      onChange={e => setTaskAssignee(e.target.value)}
                      style={{ width: '100%', padding: '7px 8px', borderRadius: 8, border: '1.5px solid #eadcca', fontSize: 11.5, fontWeight: 700, outline: 'none', background: '#faf6f0' }}
                    >
                      {staffList.map(st => (
                        <option key={st.id} value={st.name}>
                          {st.avatar} {st.name} ({st.zone})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <div style={{ fontSize: 11, fontWeight: 800, color: '#725f50', marginBottom: 2 }}>Hạn hoàn thành</div>
                    <input
                      type="text"
                      value={taskDeadline}
                      onChange={e => setTaskDeadline(e.target.value)}
                      style={{ width: '100%', padding: '7px 8px', borderRadius: 8, border: '1.5px solid #eadcca', fontSize: 11.5, outline: 'none', background: '#faf6f0', boxSizing: 'border-box' }}
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  style={{
                    background: '#c28c4e',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 10,
                    padding: '10px 0',
                    fontWeight: 900,
                    fontSize: 13,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                    marginTop: 4
                  }}
                >
                  <Plus size={16} /> Giao Việc Ngay (Tự Động Đồng Bộ)
                </button>
              </form>

              {/* Danh sách việc đã giao */}
              <div style={{ fontSize: 12, fontWeight: 900, color: '#2d1c10', marginBottom: 6 }}>
                📋 Danh sách việc Sếp vừa giao:
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {managedTasks.map(t => (
                  <div key={t.id} style={{ background: '#faf6f0', border: '1px solid #eadcca', borderRadius: 10, padding: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: 12.5, fontWeight: 900 }}>{t.title}</span>
                      <span style={{ fontSize: 10.5, color: '#c28c4e', fontWeight: 800 }}>{t.statusLabel}</span>
                    </div>
                    <div style={{ fontSize: 11, color: '#725f50', marginTop: 2 }}>👤 Người nhận: <strong>{t.assignee}</strong> · Hạn: {t.deadline}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* ── BOTTOM SHEET: 4. BẢNG TIN CHỈ ĐẠO CÔNG KHAI & TAG TÊN ── */}
        {/* ========================================================================= */}
        {activeSheet === 'feed_sheet' && (
          <div className="sheet-overlay" onClick={() => setActiveSheet(null)} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(2px)', zIndex: 1300, display: 'flex', alignItems: 'flex-end' }}>
            <div onClick={e => e.stopPropagation()} style={{ width: '100%', height: '85%', background: '#fff', borderRadius: '28px 28px 0 0', padding: '16px 14px 30px', boxSizing: 'border-box', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
              <div style={{ width: 38, height: 4, background: '#cbd5e1', borderRadius: 99, margin: '0 auto 12px' }} />
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, paddingBottom: 8, borderBottom: '1.5px solid #eadcca' }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 900, color: '#166534' }}>📢 Bảng Tin & Chỉ Đạo Công Khai</div>
                  <div style={{ fontSize: 11, color: '#725f50' }}>Toàn thể 50 nhân viên đều nhìn thấy và tương tác</div>
                </div>
                <button onClick={() => setActiveSheet(null)} style={{ width: 28, height: 28, borderRadius: 8, background: '#f4efe8', border: 'none', fontWeight: 900, cursor: 'pointer' }}>✕</button>
              </div>

              {/* Danh sách tin nhắn */}
              <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
                {comments.map(cm => (
                  <div key={cm.id} style={{ background: '#faf6f0', border: '1px solid #eadcca', borderRadius: 14, padding: '10px 12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                      <span style={{ fontSize: 12.5, fontWeight: 900, color: '#2d1c10' }}>{cm.author}</span>
                      <span style={{ fontSize: 10.5, color: '#8c7664' }}>{cm.time}</span>
                    </div>
                    <div style={{ fontSize: 12.5, color: '#493526', lineHeight: 1.45 }}>
                      {renderFormattedText(cm.text)}
                    </div>
                  </div>
                ))}
              </div>

              {/* Form gửi tin nhắn */}
              <form onSubmit={handleSendComment} style={{ display: 'flex', gap: 6 }}>
                <input
                  type="text"
                  placeholder="Gõ chỉ đạo... (VD: @Lê_Hoàng_Khoa mẻ bánh xong chưa?)"
                  value={inputComment}
                  onChange={e => setInputComment(e.target.value)}
                  style={{
                    flex: 1,
                    padding: '9px 12px',
                    borderRadius: 12,
                    border: '1.5px solid #eadcca',
                    fontSize: 12.5,
                    outline: 'none',
                    background: '#faf6f0',
                    boxSizing: 'border-box'
                  }}
                />
                <button
                  type="submit"
                  style={{
                    background: '#c28c4e',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 12,
                    padding: '0 16px',
                    fontWeight: 900,
                    fontSize: 12.5,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4
                  }}
                >
                  <Send size={15} />
                </button>
              </form>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* ── BOTTOM SHEET: 5. DUYỆT TẠM ỨNG LƯƠNG ── */}
        {/* ========================================================================= */}
        {activeSheet === 'advance_sheet' && (
          <div className="sheet-overlay" onClick={() => setActiveSheet(null)} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(2px)', zIndex: 1200, display: 'flex', alignItems: 'flex-end' }}>
            <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxHeight: '82%', background: '#fff', borderRadius: '28px 28px 0 0', padding: '16px 14px 30px', boxSizing: 'border-box', overflowY: 'auto' }}>
              <div style={{ width: 38, height: 4, background: '#cbd5e1', borderRadius: 99, margin: '0 auto 12px' }} />
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, paddingBottom: 8, borderBottom: '1.5px solid #eadcca' }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 900, color: '#ca8a04' }}>💵 Phê Duyệt Tạm Ứng Lương</div>
                  <div style={{ fontSize: 11, color: '#725f50' }}>1 đơn yêu cầu đang chờ Sếp duyệt</div>
                </div>
                <button onClick={() => setActiveSheet(null)} style={{ width: 28, height: 28, borderRadius: 8, background: '#f4efe8', border: 'none', fontWeight: 900, cursor: 'pointer' }}>✕</button>
              </div>

              <div style={{ background: '#fefce8', border: '1.5px solid #facc15', borderRadius: 14, padding: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ fontSize: 13.5, fontWeight: 900, color: '#2d1c10' }}>🍰 Đăng Khánh 2 (Bán Hàng)</div>
                    <div style={{ fontSize: 11, color: '#725f50', marginTop: 2 }}>Lý do: Đóng tiền trọ tháng 8 · Nộp lúc 08:30</div>
                  </div>
                  <span style={{ fontSize: 15, fontWeight: 900, color: '#b45309' }}>1.000.000 đ</span>
                </div>
                <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                  <button onClick={() => { showToast('✓ Sếp đã DUYỆT tạm ứng 1.000.000đ cho Đăng Khánh 2'); setActiveSheet(null); }} style={{ flex: 1, background: '#15803d', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 0', fontWeight: 900, fontSize: 12, cursor: 'pointer' }}>
                    ✓ Duyệt Chi Tiền
                  </button>
                  <button onClick={() => { showToast('✕ Sếp đã từ chối yêu cầu tạm ứng'); setActiveSheet(null); }} style={{ flex: 1, background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: 8, padding: '8px 0', fontWeight: 900, fontSize: 12, cursor: 'pointer' }}>
                    ✕ Từ Chối
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* ── BOTTOM SHEET: 6. DUYỆT NGHỈ PHÉP ── */}
        {/* ========================================================================= */}
        {activeSheet === 'leave_sheet' && (
          <div className="sheet-overlay" onClick={() => setActiveSheet(null)} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(2px)', zIndex: 1200, display: 'flex', alignItems: 'flex-end' }}>
            <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxHeight: '82%', background: '#fff', borderRadius: '28px 28px 0 0', padding: '16px 14px 30px', boxSizing: 'border-box', overflowY: 'auto' }}>
              <div style={{ width: 38, height: 4, background: '#cbd5e1', borderRadius: 99, margin: '0 auto 12px' }} />
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, paddingBottom: 8, borderBottom: '1.5px solid #eadcca' }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 900, color: '#2563eb' }}>📝 Phê Duyệt Đơn Nghỉ Phép</div>
                  <div style={{ fontSize: 11, color: '#725f50' }}>1 đơn xin nghỉ phép năm 02/09</div>
                </div>
                <button onClick={() => setActiveSheet(null)} style={{ width: 28, height: 28, borderRadius: 8, background: '#f4efe8', border: 'none', fontWeight: 900, cursor: 'pointer' }}>✕</button>
              </div>

              <div style={{ background: '#eff6ff', border: '1.5px solid #93c5fd', borderRadius: 14, padding: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ fontSize: 13.5, fontWeight: 900, color: '#2d1c10' }}>🧁 Lê Hoàng Khoa (Thợ Macaron)</div>
                    <div style={{ fontSize: 11, color: '#725f50', marginTop: 2 }}>Ngày nghỉ: <strong>02/09/2026</strong> (Nghỉ phép năm gia đình)</div>
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 900, color: '#2563eb', background: '#fff', padding: '3px 8px', borderRadius: 6 }}>1 ngày</span>
                </div>
                <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                  <button onClick={() => { showToast('✓ Sếp đã DUYỆT đơn nghỉ phép của Lê Hoàng Khoa'); setActiveSheet(null); }} style={{ flex: 1, background: '#15803d', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 0', fontWeight: 900, fontSize: 12, cursor: 'pointer' }}>
                    ✓ Đồng Ý Duyệt
                  </button>
                  <button onClick={() => { showToast('✕ Sếp đã từ chối đơn nghỉ phép'); setActiveSheet(null); }} style={{ flex: 1, background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: 8, padding: '8px 0', fontWeight: 900, fontSize: 12, cursor: 'pointer' }}>
                    ✕ Từ Chối
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* ── BOTTOM SHEET: 7. BÁO CÁO CA NGÀY ── */}
        {/* ========================================================================= */}
        {activeSheet === 'report_sheet' && (
          <div className="sheet-overlay" onClick={() => setActiveSheet(null)} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(2px)', zIndex: 1200, display: 'flex', alignItems: 'flex-end' }}>
            <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxHeight: '82%', background: '#fff', borderRadius: '28px 28px 0 0', padding: '16px 14px 30px', boxSizing: 'border-box', overflowY: 'auto' }}>
              <div style={{ width: 38, height: 4, background: '#cbd5e1', borderRadius: 99, margin: '0 auto 12px' }} />
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, paddingBottom: 8, borderBottom: '1.5px solid #eadcca' }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 900, color: '#db2777' }}>📋 Tổng Hợp Báo Cáo Ca Ngày</div>
                  <div style={{ fontSize: 11, color: '#725f50' }}>Bàn giao doanh thu và hàng tồn 3 phân xưởng</div>
                </div>
                <button onClick={() => setActiveSheet(null)} style={{ width: 28, height: 28, borderRadius: 8, background: '#f4efe8', border: 'none', fontWeight: 900, cursor: 'pointer' }}>✕</button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ background: '#faf6f0', border: '1.5px solid #eadcca', borderRadius: 12, padding: 10 }}>
                  <div style={{ fontSize: 13, fontWeight: 900, color: '#2d1c10' }}>🏪 Quầy Bakery (Ca sáng 06:00 - 14:00)</div>
                  <div style={{ fontSize: 11.5, color: '#493526', marginTop: 2 }}>Tiền mặt trong két: <strong>4.850.000 đ</strong> · Bánh tồn quầy: 8 bánh kem bắp</div>
                  <div style={{ fontSize: 10.5, color: '#15803d', fontWeight: 800, marginTop: 2 }}>✓ Đã bàn giao đủ cho ca chiều</div>
                </div>
                <div style={{ background: '#faf6f0', border: '1.5px solid #eadcca', borderRadius: 12, padding: 10 }}>
                  <div style={{ fontSize: 13, fontWeight: 900, color: '#2d1c10' }}>🥐 Xưởng 41 (Macaron & Bánh nóng)</div>
                  <div style={{ fontSize: 11.5, color: '#493526', marginTop: 2 }}>Đã hoàn tất 160/200 bánh Macaron · Lò nướng vận hành bình thường</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* ── BOTTOM SHEET: 8. LỊCH PHÂN CA LÀM VIỆC ── */}
        {/* ========================================================================= */}
        {activeSheet === 'schedule_sheet' && (
          <div className="sheet-overlay" onClick={() => setActiveSheet(null)} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(2px)', zIndex: 1200, display: 'flex', alignItems: 'flex-end' }}>
            <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxHeight: '82%', background: '#fff', borderRadius: '28px 28px 0 0', padding: '16px 14px 30px', boxSizing: 'border-box', overflowY: 'auto' }}>
              <div style={{ width: 38, height: 4, background: '#cbd5e1', borderRadius: 99, margin: '0 auto 12px' }} />
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, paddingBottom: 8, borderBottom: '1.5px solid #eadcca' }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 900, color: '#9333ea' }}>📅 Lịch Phân Ca Tuần (30+ Nhân Sự)</div>
                  <div style={{ fontSize: 11, color: '#725f50' }}>Xưởng 42 · Xưởng 41 · Bakery</div>
                </div>
                <button onClick={() => setActiveSheet(null)} style={{ width: 28, height: 28, borderRadius: 8, background: '#f4efe8', border: 'none', fontWeight: 900, cursor: 'pointer' }}>✕</button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ background: '#faf6f0', border: '1px solid #eadcca', borderRadius: 10, padding: 8 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 900 }}>Ca Sáng (06:00 - 14:00): 25 Nhân sự</div>
                  <div style={{ fontSize: 11, color: '#725f50' }}>Võ Đăng Khánh, Lê Hoàng Khoa, Trần Thị Mai, Vũ Thị Yến...</div>
                </div>
                <div style={{ background: '#faf6f0', border: '1px solid #eadcca', borderRadius: 10, padding: 8 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 900 }}>Ca Chiều (14:00 - 22:00): 20 Nhân sự</div>
                  <div style={{ fontSize: 11, color: '#725f50' }}>Đăng Khánh 2, Hồ Hoàng Diễm, Bùi Quốc Bảo, Đoàn Thu Thảo...</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* ── SIDE DRAWER: DANH SÁCH ĐƠN HÀNG ƯU TIÊN THỜI GIAN THEO TỪNG BỘ LỌC ── */}
        {/* ========================================================================= */}
        {activeSheet === 'order_drawer' && (
          <div className="sheet-overlay" onClick={() => setActiveSheet(null)} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(2px)', zIndex: 1300, display: 'flex', alignItems: 'flex-end' }}>
            <div onClick={e => e.stopPropagation()} style={{ width: '100%', height: '86%', background: '#fff', borderRadius: '28px 28px 0 0', padding: '16px 14px 30px', boxSizing: 'border-box', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
              <div style={{ width: 38, height: 4, background: '#cbd5e1', borderRadius: 99, margin: '0 auto 12px' }} />
              
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, paddingBottom: 8, borderBottom: '1.5px solid #eadcca' }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 900, color: '#2d1c10' }}>
                    🧾 Danh Sách Đơn Hàng ({filteredOrders.length} đơn)
                  </div>
                  <div style={{ fontSize: 11, color: '#dc2626', fontWeight: 800 }}>
                    ⬇️ Sắp xếp ưu tiên giảm dần từ trên xuống dưới
                  </div>
                </div>
                <button onClick={() => setActiveSheet(null)} style={{ width: 28, height: 28, borderRadius: 8, background: '#f4efe8', border: 'none', fontWeight: 900, cursor: 'pointer' }}>✕</button>
              </div>

              {/* Thanh lọc trạng thái con bên trong Drawer */}
              <div style={{ display: 'flex', gap: 4, overflowX: 'auto', paddingBottom: 8, marginBottom: 8 }}>
                <button
                  onClick={() => setSelectedOrderFilter('all')}
                  style={{
                    padding: '5px 10px',
                    borderRadius: 99,
                    border: '1px solid #eadcca',
                    background: selectedOrderFilter === 'all' ? '#2d1c10' : '#fff',
                    color: selectedOrderFilter === 'all' ? '#ffd284' : '#725f50',
                    fontSize: 11,
                    fontWeight: 800,
                    whiteSpace: 'nowrap',
                    cursor: 'pointer'
                  }}
                >
                  Tất cả ({orderCounts.total})
                </button>
                <button
                  onClick={() => setSelectedOrderFilter('in_production')}
                  style={{
                    padding: '5px 10px',
                    borderRadius: 99,
                    border: '1px solid #eadcca',
                    background: selectedOrderFilter === 'in_production' ? '#2d1c10' : '#fff',
                    color: selectedOrderFilter === 'in_production' ? '#ffd284' : '#725f50',
                    fontSize: 11,
                    fontWeight: 800,
                    whiteSpace: 'nowrap',
                    cursor: 'pointer'
                  }}
                >
                  👩‍🍳 Đang làm ({orderCounts.production})
                </button>
                <button
                  onClick={() => setSelectedOrderFilter('ready_for_fulfillment')}
                  style={{
                    padding: '5px 10px',
                    borderRadius: 99,
                    border: '1px solid #eadcca',
                    background: selectedOrderFilter === 'ready_for_fulfillment' ? '#2d1c10' : '#fff',
                    color: selectedOrderFilter === 'ready_for_fulfillment' ? '#ffd284' : '#725f50',
                    fontSize: 11,
                    fontWeight: 800,
                    whiteSpace: 'nowrap',
                    cursor: 'pointer'
                  }}
                >
                  📦 Chờ giao ({orderCounts.ready})
                </button>
                <button
                  onClick={() => setSelectedOrderFilter('overdue')}
                  style={{
                    padding: '5px 10px',
                    borderRadius: 99,
                    border: '1px solid #eadcca',
                    background: selectedOrderFilter === 'overdue' ? '#dc2626' : '#fff',
                    color: selectedOrderFilter === 'overdue' ? '#fff' : '#dc2626',
                    fontSize: 11,
                    fontWeight: 800,
                    whiteSpace: 'nowrap',
                    cursor: 'pointer'
                  }}
                >
                  ⚠️ Trễ hạn ({orderCounts.overdue})
                </button>
              </div>

              {/* Danh sách đơn hàng ưu tiên */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, overflowY: 'auto' }}>
                {filteredOrders.map((ord, idx) => (
                  <div
                    key={ord.id}
                    style={{
                      background: ord.isUrgent ? '#fff9f0' : '#fff',
                      border: ord.isUrgent ? '2px solid #f59e0b' : '1.5px solid #eadcca',
                      borderRadius: 14,
                      padding: 10
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <span style={{ fontSize: 11, fontWeight: 900, background: ord.isUrgent ? '#fef3c7' : '#f4efe8', color: ord.isUrgent ? '#b45309' : '#725f50', padding: '2px 6px', borderRadius: 6 }}>
                        #{idx + 1} · {ord.code}
                      </span>
                      <span style={{ fontSize: 11, fontWeight: 900, color: ord.isUrgent ? '#dc2626' : '#725f50' }}>
                        ⏰ {ord.deliveryTime}
                      </span>
                    </div>

                    <div style={{ fontSize: 13, fontWeight: 900, color: '#2d1c10' }}>{ord.customer}</div>
                    <div style={{ fontSize: 11.5, color: '#493526', margin: '2px 0' }}>• {ord.item}</div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6, paddingTop: 4, borderTop: '1px solid #f2e9de' }}>
                      <span style={{ fontSize: 11, fontWeight: 800, color: ord.status_v2 === 'completed' ? '#16a34a' : ord.status_v2 === 'overdue' ? '#dc2626' : '#138a53' }}>
                        {ord.statusLabel} · <strong>[{ord.station}]</strong>
                      </span>
                      <span style={{ fontSize: 13, fontWeight: 900, color: '#2d1c10' }}>{formatVND(ord.total)}</span>
                    </div>
                  </div>
                ))}

                {filteredOrders.length === 0 && (
                  <div style={{ textAlign: 'center', padding: '20px 0', color: '#725f50', fontSize: 13 }}>
                    Không có đơn hàng nào ở trạng thái này.
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* ── BOTTOM SHEET: TRẠNG THÁI NHÂN SỰ (3 LUỒNG: ĐANG LÀM, ĐI TRỄ, NGHỈ CA) ── */}
        {/* ========================================================================= */}
        {activeSheet === 'staff_detail' && (
          <div className="sheet-overlay" onClick={() => setActiveSheet(null)} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(2px)', zIndex: 1200, display: 'flex', alignItems: 'flex-end' }}>
            <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxHeight: '85%', background: '#fff', borderRadius: '28px 28px 0 0', padding: '16px 14px 30px', boxSizing: 'border-box', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
              <div style={{ width: 38, height: 4, background: '#cbd5e1', borderRadius: 99, margin: '0 auto 12px' }} />
              
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, paddingBottom: 8, borderBottom: '1.5px solid #eadcca' }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 900, color: '#2d1c10' }}>
                    👥 Chi Tiết Trạng Thái Nhân Sự ({staffCounts.total} NV)
                  </div>
                  <div style={{ fontSize: 11, color: '#725f50' }}>
                    Theo dõi chấm công & hiện diện 3 phân xưởng hôm nay
                  </div>
                </div>
                <button onClick={() => setActiveSheet(null)} style={{ width: 28, height: 28, borderRadius: 8, background: '#f4efe8', border: 'none', fontWeight: 900, cursor: 'pointer' }}>✕</button>
              </div>

              {/* 3 Tab chuyển đổi luồng nhân sự */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginBottom: 12 }}>
                <button
                  onClick={() => setSelectedStaffTab('working')}
                  style={{
                    padding: '8px 4px',
                    borderRadius: 12,
                    border: selectedStaffTab === 'working' ? '2px solid #16a34a' : '1px solid #eadcca',
                    background: selectedStaffTab === 'working' ? '#f0fdf4' : '#fff',
                    color: selectedStaffTab === 'working' ? '#15803d' : '#725f50',
                    fontSize: 11.5,
                    fontWeight: 900,
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 2
                  }}
                >
                  <span>🟢 Đang làm</span>
                  <span style={{ fontSize: 13, fontWeight: 900 }}>{staffCounts.working} người</span>
                </button>

                <button
                  onClick={() => setSelectedStaffTab('late')}
                  style={{
                    padding: '8px 4px',
                    borderRadius: 12,
                    border: selectedStaffTab === 'late' ? '2px solid #ea580c' : '1px solid #eadcca',
                    background: selectedStaffTab === 'late' ? '#fff7ed' : '#fff',
                    color: selectedStaffTab === 'late' ? '#c2410c' : '#725f50',
                    fontSize: 11.5,
                    fontWeight: 900,
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 2
                  }}
                >
                  <span>⏰ Đi trễ</span>
                  <span style={{ fontSize: 13, fontWeight: 900, color: '#dc2626' }}>{staffCounts.late} người</span>
                </button>

                <button
                  onClick={() => setSelectedStaffTab('off')}
                  style={{
                    padding: '8px 4px',
                    borderRadius: 12,
                    border: selectedStaffTab === 'off' ? '2px solid #dc2626' : '1px solid #eadcca',
                    background: selectedStaffTab === 'off' ? '#fef2f2' : '#fff',
                    color: selectedStaffTab === 'off' ? '#dc2626' : '#725f50',
                    fontSize: 11.5,
                    fontWeight: 900,
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 2
                  }}
                >
                  <span>🔴 Nghỉ ca</span>
                  <span style={{ fontSize: 13, fontWeight: 900 }}>{staffCounts.off} người</span>
                </button>
              </div>

              {/* Danh sách nhân viên theo từng tab */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, overflowY: 'auto' }}>
                
                {/* 1. Luồng: ĐANG LÀM VIỆC */}
                {selectedStaffTab === 'working' && (
                  <>
                    <div style={{ fontSize: 11.5, fontWeight: 800, color: '#15803d', marginBottom: 2 }}>
                      ✓ Danh sách nhân viên có mặt đúng giờ ({staffCounts.working} nhân sự):
                    </div>
                    {staffList.filter(st => st.status === 'working').map(st => (
                      <div key={st.id} style={{ background: '#faf6f0', border: '1.5px solid #dcfce7', borderRadius: 14, padding: '10px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <span style={{ fontSize: 24 }}>{st.avatar}</span>
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 900, color: '#2d1c10' }}>{st.name}</div>
                            <div style={{ fontSize: 11, color: '#725f50', marginTop: 1 }}>{st.role} · <strong>[{st.zone}]</strong></div>
                            <div style={{ fontSize: 10.5, color: '#15803d', fontWeight: 800, marginTop: 2 }}>⏰ Vào ca: {st.checkinTime} ({st.note}) · {st.shift}</div>
                          </div>
                        </div>
                        <span style={{ fontSize: 10.5, fontWeight: 900, padding: '3px 8px', borderRadius: 99, background: '#dcfce7', color: '#15803d' }}>
                          🟢 Đang làm
                        </span>
                      </div>
                    ))}
                  </>
                )}

                {/* 2. Luồng: ĐI TRỄ */}
                {selectedStaffTab === 'late' && (
                  <>
                    <div style={{ fontSize: 11.5, fontWeight: 800, color: '#c2410c', marginBottom: 2 }}>
                      ⚠️ Danh sách nhân viên chấm công vào ca trễ ({staffCounts.late} nhân sự):
                    </div>
                    {staffList.filter(st => st.status === 'late').map(st => (
                      <div key={st.id} style={{ background: '#fff9f5', border: '1.5px solid #fdba74', borderRadius: 14, padding: '10px 12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <span style={{ fontSize: 24 }}>{st.avatar}</span>
                            <div>
                              <div style={{ fontSize: 13, fontWeight: 900, color: '#2d1c10' }}>{st.name}</div>
                              <div style={{ fontSize: 11, color: '#725f50' }}>{st.role} · <strong>[{st.zone}]</strong></div>
                            </div>
                          </div>
                          <span style={{ fontSize: 11, fontWeight: 900, padding: '3px 8px', borderRadius: 99, background: '#fee2e2', color: '#dc2626' }}>
                            Trễ {st.lateMinutes} phút ⚠️
                          </span>
                        </div>

                        <div style={{ background: '#fff', border: '1px solid #fde047', borderRadius: 8, padding: '6px 8px', marginTop: 8, fontSize: 11, color: '#493526' }}>
                          <div>⏰ <strong>Giờ vào ca:</strong> {st.checkinTime} (Quy định 06:00)</div>
                          <div>📝 <strong>Lý do:</strong> {st.reason}</div>
                        </div>

                        <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                          <button
                            onClick={() => showToast(`💬 Đã gửi tin nhắn nhắc nhở đến ${st.name}`)}
                            style={{ flex: 1, background: '#ea580c', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 0', fontSize: 11, fontWeight: 900, cursor: 'pointer' }}
                          >
                            ⚡ Nhắc Nhở
                          </button>
                          <button
                            onClick={() => showToast(`✓ Đã miễn trừ phạt trễ cho ${st.name}`)}
                            style={{ flex: 1, background: '#f4efe8', color: '#725f50', border: 'none', borderRadius: 6, padding: '6px 0', fontSize: 11, fontWeight: 800, cursor: 'pointer' }}
                          >
                            Bỏ Qua Lý Do Chính Đáng
                          </button>
                        </div>
                      </div>
                    ))}
                  </>
                )}

                {/* 3. Luồng: NGHỈ CA / NGHỈ PHÉP */}
                {selectedStaffTab === 'off' && (
                  <>
                    <div style={{ fontSize: 11.5, fontWeight: 800, color: '#dc2626', marginBottom: 2 }}>
                      🔴 Danh sách nhân viên nghỉ ca / nghỉ phép ({staffCounts.off} nhân sự):
                    </div>
                    {staffList.filter(st => st.status === 'off').map(st => (
                      <div key={st.id} style={{ background: '#fef2f2', border: '1.5px solid #fecaca', borderRadius: 14, padding: '10px 12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <span style={{ fontSize: 24 }}>{st.avatar}</span>
                            <div>
                              <div style={{ fontSize: 13, fontWeight: 900, color: '#2d1c10' }}>{st.name}</div>
                              <div style={{ fontSize: 11, color: '#725f50' }}>{st.role} · <strong>[{st.zone}]</strong></div>
                            </div>
                          </div>
                          <span style={{ fontSize: 10.5, fontWeight: 900, padding: '3px 8px', borderRadius: 99, background: '#fee2e2', color: '#dc2626' }}>
                            {st.leaveType}
                          </span>
                        </div>

                        <div style={{ background: '#fff', border: '1px solid #fca5a5', borderRadius: 8, padding: '6px 8px', marginTop: 8, fontSize: 11, color: '#493526' }}>
                          <div>📋 <strong>Lý do nghỉ:</strong> {st.reason}</div>
                          <div>👤 <strong>Người duyệt:</strong> <span style={{ color: '#15803d', fontWeight: 800 }}>{st.approvedBy}</span></div>
                        </div>
                      </div>
                    ))}
                  </>
                )}

              </div>
            </div>
          </div>
        )}

        {/* Home Indicator Bar */}
        <div style={{ width: 135, height: 4.5, background: '#2d1c10', borderRadius: 99, position: 'absolute', bottom: 6, left: '50%', transform: 'translateX(-50%)', zIndex: 1000, opacity: 0.8 }} />

        {/* Toast Notification */}
        {toast && (
          <div style={{
            position: 'absolute',
            bottom: 60,
            left: '50%',
            transform: 'translateX(-50%)',
            background: '#2d1c10',
            color: '#fff',
            padding: '8px 16px',
            borderRadius: 20,
            fontSize: 12,
            fontWeight: 800,
            boxShadow: '0 4px 14px rgba(0,0,0,0.25)',
            zIndex: 2000,
            whiteSpace: 'nowrap'
          }}>
            {toast}
          </div>
        )}

      </div>

    </div>
  );
}
