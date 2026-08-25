import React, { useState, useMemo } from 'react';
import './boss-dashboard.css';
import {
  INITIAL_HR_STATS,
  INITIAL_ANNOUNCEMENTS,
  INITIAL_EXPENSES,
  INITIAL_TASKS,
  INITIAL_ORDERS,
  PRODUCTS_CATALOG,
  STAFF_LIST_DROPDOWN
} from './mockData.js';

import {
  ShoppingBag,
  Users,
  MessageSquare,
  DollarSign,
  ClipboardList,
  Clock,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Plus,
  Send,
  X,
  Globe,
  ChevronRight,
  UserCheck
} from 'lucide-react';

const formatVND = (amount) => {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
};

export default function BossDashboard() {
  // ── States ──
  const [activeModal, setActiveModal] = useState(null); // 'orders' | 'order_filter' | 'expense' | 'cart' | 'attendance'
  const [selectedOrderFilter, setSelectedOrderFilter] = useState('all');

  // Dữ liệu
  const [tasks, setTasks] = useState(INITIAL_TASKS);
  const [announcements, setAnnouncements] = useState(INITIAL_ANNOUNCEMENTS);
  const [commentInput, setCommentInput] = useState('');
  const [cart, setCart] = useState([
    { ...PRODUCTS_CATALOG[0], quantity: 2 },
    { ...PRODUCTS_CATALOG[1], quantity: 1 },
  ]);

  // Form Giao việc 4 trường bắt buộc
  const [taskName, setTaskName] = useState('');
  const [taskDesc, setTaskDesc] = useState('');
  const [taskDeadline, setTaskDeadline] = useState('17:00 Hôm nay');
  const [taskAssignee, setTaskAssignee] = useState(STAFF_LIST_DROPDOWN[0]);

  const [toast, setToast] = useState('');
  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2500);
  };

  // Đếm đơn
  const orderStats = useMemo(() => {
    return {
      total: INITIAL_ORDERS.length,
      waiting: INITIAL_ORDERS.filter(o => o.statusCode === 'awaiting_assignment').length,
      production: INITIAL_ORDERS.filter(o => o.statusCode === 'in_production').length,
      ready: INITIAL_ORDERS.filter(o => o.statusCode === 'ready_for_fulfillment').length,
      delivery: INITIAL_ORDERS.filter(o => o.statusCode === 'in_delivery').length,
      completed: INITIAL_ORDERS.filter(o => o.statusCode === 'completed').length,
      overdue: INITIAL_ORDERS.filter(o => o.isUrgent).length,
    };
  }, []);

  // Danh sách đơn sắp xếp theo giờ ưu tiên giảm dần (từ trên xuống dưới)
  const sortedOrders = useMemo(() => {
    let list = [...INITIAL_ORDERS].sort((a, b) => new Date(b.rawTime) - new Date(a.rawTime));
    if (selectedOrderFilter === 'all') return list;
    if (selectedOrderFilter === 'overdue') return list.filter(o => o.isUrgent);
    if (selectedOrderFilter === 'waiting') return list.filter(o => o.statusCode === 'awaiting_assignment');
    if (selectedOrderFilter === 'production') return list.filter(o => o.statusCode === 'in_production');
    if (selectedOrderFilter === 'ready') return list.filter(o => o.statusCode === 'ready_for_fulfillment');
    if (selectedOrderFilter === 'delivery') return list.filter(o => o.statusCode === 'in_delivery');
    if (selectedOrderFilter === 'completed') return list.filter(o => o.statusCode === 'completed');
    return list;
  }, [selectedOrderFilter]);

  // Hành động 1: Giao việc mới (Đủ 4 trường) -> Tự động xuất hiện ở đầu danh sách
  const handleAssignTask = (e) => {
    e.preventDefault();
    if (!taskName.trim()) {
      showToast('⚠️ Vui lòng nhập tên công việc!');
      return;
    }
    const created = {
      id: `tsk-${Date.now()}`,
      name: taskName.trim(),
      description: taskDesc.trim() || 'Thực hiện theo chỉ đạo của Sếp.',
      assignedTo: taskAssignee,
      deadline: new Date().toISOString(),
      deadlineDisplay: taskDeadline,
      status: 'in_progress',
      priority: 'high',
    };
    setTasks([created, ...tasks]);
    setTaskName('');
    setTaskDesc('');
    showToast(`✅ Đã giao việc thành công cho ${taskAssignee}!`);
  };

  // Hành động 2: Thêm bình luận @Tag tên công khai
  const handleAddComment = (annId) => {
    if (!commentInput.trim()) return;
    setAnnouncements(prev => prev.map(ann => {
      if (ann.id === annId) {
        return {
          ...ann,
          comments: [
            ...ann.comments,
            {
              id: `cm-${Date.now()}`,
              author: 'Võ Đăng Khánh (Giám Đốc)',
              role: 'Chủ Sở Hữu',
              text: commentInput.trim(),
              time: 'Vừa xong'
            }
          ]
        };
      }
      return ann;
    }));
    setCommentInput('');
    showToast('💬 Đã gửi bình luận công khai đến toàn thể nhân sự!');
  };

  // Hành động 3: Giỏ hàng thêm / bớt số lượng -> Nhảy tiền thời gian thực
  const updateCartQty = (productId, delta) => {
    setCart(prev => prev.map(item => {
      if (item.id === productId) {
        const q = item.quantity + delta;
        return q > 0 ? { ...item, quantity: q } : null;
      }
      return item;
    }).filter(Boolean));
  };

  const totalCartCount = useMemo(() => cart.reduce((s, i) => s + i.quantity, 0), [cart]);
  const cartSubtotal = useMemo(() => cart.reduce((s, i) => s + i.price * i.quantity, 0), [cart]);

  const openOrderSheet = (filterKey = 'all') => {
    setSelectedOrderFilter(filterKey);
    setActiveModal('orders');
  };

  return (
    <div className="sb-boss-app">

      {/* ── TOP HEADER PROFILE CỦA SẾP ── */}
      <div className="sb-top-bar">
        <div className="sb-brand-box">
          <div className="sb-brand-icon">👑</div>
          <div className="sb-brand-text">
            <small>SUMI BAKERY OPERATIONS</small>
            <h1>Chào Sếp Võ Đăng Khánh</h1>
          </div>
        </div>

        <div className="sb-top-actions">
          <button className="sb-top-btn" onClick={() => setActiveModal('cart')} title="Giỏ Hàng">
            🛒
          </button>
          <div className="sb-boss-tag-badge">GĐ</div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 1. THỐNG KÊ NHÂN SỰ & CHẤM CÔNG THỜI GIAN THỰC (HR WIDGET) */}
      {/* ========================================================================= */}
      <div className="sb-card">
        <div className="sb-card-head">
          <div className="sb-card-title">
            <Users size={18} className="text-amber-700" />
            1. Thống Kê Nhân Sự & Chấm Công
          </div>
          <span className="sb-card-badge">HR Live</span>
        </div>

        {/* 3 KPI Thống Kê: Tổng, Nam, Nữ */}
        <div className="sb-hr-stats-row">
          <div className="sb-hr-stat-box">
            <div className="sb-hr-stat-val">{INITIAL_HR_STATS.totalStaff}</div>
            <div className="sb-hr-stat-lbl">Tổng Nhân Viên</div>
          </div>
          <div className="sb-hr-stat-box">
            <div className="sb-hr-stat-val text-blue-600">{INITIAL_HR_STATS.maleStaff}</div>
            <div className="sb-hr-stat-lbl">Tổng Nam</div>
          </div>
          <div className="sb-hr-stat-box">
            <div className="sb-hr-stat-val text-pink-600">{INITIAL_HR_STATS.femaleStaff}</div>
            <div className="sb-hr-stat-lbl">Tổng Nữ</div>
          </div>
        </div>

        {/* Máy Chấm Công Thời Gian Thực */}
        <div className="sb-attendance-panel" onClick={() => setActiveModal('attendance')}>
          <div className="sb-att-top">
            <div className="sb-att-live">
              <div className="sb-live-dot" />
              <span>Máy Chấm Công Live:</span>
            </div>
            <div style={{ fontSize: 14, fontWeight: 900, color: '#86efac' }}>
              {INITIAL_HR_STATS.workingNow}/{INITIAL_HR_STATS.totalStaff} Đang Làm Việc
            </div>
          </div>
          <div style={{ fontSize: 11.5, color: '#f6dcc7', marginBottom: 8 }}>
            Dưới đây là nhân sự đang online/vừa check-in (chấm xanh lá cây):
          </div>

          {/* Dải Avatar tròn có chấm xanh */}
          <div className="sb-avatar-strip">
            {INITIAL_HR_STATS.recentCheckins.map(st => (
              <div key={st.id} className={`sb-avatar-circle ${st.gender}`} title={`${st.name} (Vào lúc ${st.checkinTime})`}>
                {st.avatar}
                <div className="sb-avatar-dot" />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 2. TỔNG ĐƠN HÀNG HÔM NAY (CLICK MỞ RA TOÀN BỘ DANH SÁCH THEO GIỜ GIẢM DẦN) */}
      {/* ========================================================================= */}
      <div className="sb-order-hero-card" onClick={() => openOrderSheet('all')}>
        <div className="sb-order-hero-top">
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 900, textTransform: 'uppercase', color: '#ffd284' }}>
            <ShoppingBag size={16} />
            2. Tổng Đơn Hàng Hôm Nay
          </div>
          <span style={{ background: '#dc2626', color: '#fff', fontSize: 11, fontWeight: 900, padding: '3px 8px', borderRadius: 99 }}>
            Click xem chi tiết →
          </span>
        </div>
        <div className="sb-order-hero-val">{orderStats.total} ĐƠN HÀNG</div>
        <div className="sb-order-hero-sub">
          Tất cả đơn hàng được sắp xếp theo giờ ưu tiên từ trên xuống dưới
        </div>
      </div>

      {/* 6 Ô Gạch Tình Trạng Đơn Hàng Phụ */}
      <div className="sb-order-tiles-grid">
        <div className="sb-order-tile-mini" onClick={() => openOrderSheet('waiting')}>
          <span>📥</span>
          <span style={{ fontSize: 12.5, fontWeight: 900 }}>Chờ làm</span>
          <span className="sb-tile-mini-num">{orderStats.waiting}</span>
        </div>
        <div className="sb-order-tile-mini" onClick={() => openOrderSheet('production')}>
          <span>👩‍🍳</span>
          <span style={{ fontSize: 12.5, fontWeight: 900 }}>Bếp làm</span>
          <span className="sb-tile-mini-num">{orderStats.production}</span>
        </div>
        <div className="sb-order-tile-mini" onClick={() => openOrderSheet('ready')}>
          <span>📦</span>
          <span style={{ fontSize: 12.5, fontWeight: 900 }}>Chờ ship</span>
          <span className="sb-tile-mini-num">{orderStats.ready}</span>
        </div>
        <div className="sb-order-tile-mini" onClick={() => openOrderSheet('delivery')}>
          <span>🛵</span>
          <span style={{ fontSize: 12.5, fontWeight: 900 }}>Đang giao</span>
          <span className="sb-tile-mini-num">{orderStats.delivery}</span>
        </div>
        <div className="sb-order-tile-mini" onClick={() => openOrderSheet('completed')}>
          <span>✅</span>
          <span style={{ fontSize: 12.5, fontWeight: 900 }}>Đã xong</span>
          <span className="sb-tile-mini-num" style={{ color: '#16a34a' }}>{orderStats.completed}</span>
        </div>
        <div className="sb-order-tile-mini" onClick={() => openOrderSheet('overdue')}>
          <span>⚠️</span>
          <span style={{ fontSize: 12.5, fontWeight: 900 }}>Khẩn/Trễ</span>
          <span className="sb-tile-mini-num">{orderStats.overdue}</span>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 3. QUẢN LÝ CHI TIÊU CHI TIẾT (EXPENSE DETAIL LEDGER) */}
      {/* ========================================================================= */}
      <div className="sb-card">
        <div className="sb-card-head">
          <div className="sb-card-title">
            <DollarSign size={18} className="text-amber-700" />
            3. Chi Tiết Các Khoản Chi (Expense Ledger)
          </div>
          <button
            onClick={() => setActiveModal('expense')}
            style={{ background: 'none', border: 'none', color: '#b93e13', fontSize: 12, fontWeight: 900, cursor: 'pointer' }}
          >
            Xem tất cả ({INITIAL_EXPENSES.length}) ›
          </button>
        </div>

        <div>
          {INITIAL_EXPENSES.slice(0, 3).map(exp => (
            <div key={exp.id} className="sb-expense-item">
              <div className="sb-expense-head">
                <div>
                  <div className="sb-expense-name">{exp.title}</div>
                  <div className="sb-expense-spender">👤 {exp.spender} · ⏰ {exp.time}</div>
                </div>
                <span style={{
                  fontSize: 11,
                  fontWeight: 900,
                  padding: '2px 6px',
                  borderRadius: 6,
                  background: exp.status === 'approved' ? '#dcfce7' : '#fef3c7',
                  color: exp.status === 'approved' ? '#15803d' : '#b45309',
                  whiteSpace: 'nowrap'
                }}>
                  {exp.status === 'approved' ? '✓ Đã duyệt' : '⏳ Chờ duyệt'}
                </span>
              </div>
              <div className="sb-expense-foot">
                <button
                  onClick={() => showToast(`📄 Hóa đơn: ${exp.receiptName}`)}
                  style={{ background: 'none', border: 'none', color: '#C88A4B', fontSize: 11.5, fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3 }}
                >
                  <FileText size={13} /> {exp.receiptName}
                </button>
                <span style={{ fontSize: 14.5, fontWeight: 900, color: '#2d1c10' }}>{formatVND(exp.amount)}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 4. BẢNG GIAO VIỆC (TASK ASSIGNMENT BOARD - ĐỦ 4 TRƯỜNG BẮT BUỘC) */}
      {/* ========================================================================= */}
      <div className="sb-card">
        <div className="sb-card-head">
          <div className="sb-card-title">
            <ClipboardList size={18} className="text-amber-700" />
            4. Bảng Giao Việc & Chỉ Đạo Tức Thì
          </div>
          <span className="sb-card-badge">{tasks.length} Việc</span>
        </div>

        {/* Form Giao Việc Nhanh 4 Trường */}
        <form onSubmit={handleAssignTask} className="sb-task-form">
          <div style={{ fontSize: 11.5, fontWeight: 900, color: '#a08060', textTransform: 'uppercase' }}>
            ⚡ Form Nhập Nhanh (Giao việc mới lên đầu)
          </div>

          {/* Trường 1: Tên công việc */}
          <input
            type="text"
            className="sb-input"
            placeholder="1. Tên công việc (bắt buộc) *"
            value={taskName}
            onChange={e => setTaskName(e.target.value)}
          />

          {/* Trường 2: Mô tả chi tiết */}
          <input
            type="text"
            className="sb-input"
            placeholder="2. Mô tả chi tiết công việc..."
            value={taskDesc}
            onChange={e => setTaskDesc(e.target.value)}
          />

          <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 0.9fr', gap: 6 }}>
            {/* Trường 3: Thời gian hoàn thành (Deadline) */}
            <input
              type="text"
              className="sb-input"
              placeholder="3. Hạn: 17:00 Hôm nay *"
              value={taskDeadline}
              onChange={e => setTaskDeadline(e.target.value)}
            />

            {/* Trường 4: Tag tên người thực hiện */}
            <select
              className="sb-input"
              value={taskAssignee}
              onChange={e => setTaskAssignee(e.target.value)}
              style={{ fontSize: 12, fontWeight: 700 }}
            >
              {STAFF_LIST_DROPDOWN.map(st => (
                <option key={st} value={st}>Tag: {st.split(' ')[0]} {st.split(' ')[1]}</option>
              ))}
            </select>
          </div>

          <button
            type="submit"
            style={{
              background: '#C88A4B',
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
              gap: 6
            }}
          >
            <Plus size={16} /> Giao Việc Cho {taskAssignee.split(' ')[0]} {taskAssignee.split(' ')[1]}
          </button>
        </form>

        {/* Danh sách công việc */}
        <div>
          {tasks.slice(0, 3).map(t => (
            <div key={t.id} className={`sb-task-item ${t.status}`}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 6 }}>
                <div style={{ fontSize: 13.5, fontWeight: 900, color: '#2d1c10' }}>{t.name}</div>
                <span style={{
                  fontSize: 10.5,
                  fontWeight: 900,
                  padding: '2px 6px',
                  borderRadius: 6,
                  background: t.status === 'overdue' ? '#fee2e2' : t.status === 'completed' ? '#dcfce7' : '#fef3c7',
                  color: t.status === 'overdue' ? '#dc2626' : t.status === 'completed' ? '#16a34a' : '#b45309',
                  whiteSpace: 'nowrap'
                }}>
                  {t.status === 'overdue' ? '⚠️ Quá hạn' : t.status === 'completed' ? '✓ Xong' : 'Đang làm'}
                </span>
              </div>
              <div style={{ fontSize: 12, color: '#725f50', marginTop: 2 }}>{t.description}</div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 6, paddingTop: 4, borderTop: '1px solid #f0e6da', fontSize: 11, fontWeight: 800 }}>
                <span style={{ color: '#8b5900' }}>👤 Tag: {t.assignedTo}</span>
                <span style={{ color: t.status === 'overdue' ? '#dc2626' : '#725f50' }}>⏰ {t.deadlineDisplay}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 5. THÔNG BÁO NỘI BỘ & BÌNH LUẬN CÔNG KHAI (COMMENT CENTER) */}
      {/* ========================================================================= */}
      <div className="sb-card">
        <div className="sb-card-head">
          <div className="sb-card-title">
            <MessageSquare size={18} className="text-amber-700" />
            5. Bảng Tin & Thảo Luận Công Khai
          </div>
          <span style={{ fontSize: 11, fontWeight: 800, color: '#16a34a', display: 'flex', alignItems: 'center', gap: 3 }}>
            <Globe size={13} /> Tất Cả Đều Thấy
          </span>
        </div>

        {announcements.map(ann => (
          <div key={ann.id} className="sb-feed-post">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <div style={{ width: 30, height: 30, borderRadius: 8, background: '#2d1c10', color: '#fff', display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 900 }}>
                {ann.authorAvatar}
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 900 }}>{ann.author}</div>
                <div style={{ fontSize: 11, color: '#725f50' }}>{ann.authorRole} · {ann.createdAt}</div>
              </div>
            </div>

            <div style={{ fontSize: 13, color: '#2d1c10', fontWeight: 600, lineHeight: 1.4, marginBottom: 8 }}>
              {ann.content}
            </div>

            {/* Danh sách bình luận công khai có Tag tên */}
            {ann.comments.map(cm => (
              <div key={cm.id} className="sb-comment-card">
                <div style={{ fontWeight: 800, color: '#2d1c10', fontSize: 11.5, marginBottom: 2 }}>
                  {cm.author} ({cm.role}):
                </div>
                <div style={{ color: '#493526', fontSize: 12.5 }}>
                  {cm.text.split(' ').map((w, idx) => w.startsWith('@') ? <span key={idx} style={{ color: '#2563eb', fontWeight: 800 }}>{w} </span> : w + ' ')}
                </div>
              </div>
            ))}

            {/* Input gửi comment */}
            <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
              <input
                type="text"
                placeholder="Gõ phản hồi hoặc @Tag_Tên nhân viên..."
                value={commentInput}
                onChange={e => setCommentInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAddComment(ann.id)}
                style={{ flex: 1, padding: '8px 10px', borderRadius: 8, border: '1.5px solid #eadcca', fontSize: 12.5, outline: 'none' }}
              />
              <button
                onClick={() => handleAddComment(ann.id)}
                style={{ background: '#C88A4B', color: '#fff', border: 'none', borderRadius: 8, padding: '0 10px', fontWeight: 900, cursor: 'pointer' }}
              >
                <Send size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* ========================================================================= */}
      {/* 6. GIỎ HÀNG THỬ NGHIỆM (SHOPPING CART DEMO) */}
      {/* ========================================================================= */}
      <div style={{ position: 'fixed', bottom: 16, right: 14, zIndex: 90 }}>
        <button
          onClick={() => setActiveModal('cart')}
          style={{
            background: '#C88A4B',
            color: '#fff',
            border: 'none',
            borderRadius: 99,
            padding: '12px 18px',
            fontWeight: 900,
            fontSize: 14,
            boxShadow: '0 6px 20px rgba(200, 138, 75, 0.45)',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            cursor: 'pointer'
          }}
        >
          <ShoppingBag size={18} />
          <span>6. Giỏ Hàng Demo ({totalCartCount})</span>
        </button>
      </div>

      {/* ========================================================================= */}
      {/* BOTTOM SHEETS MODAL CHO TỪNG LUỒNG */}
      {/* ========================================================================= */}

      {/* MODAL 1: TOÀN BỘ ĐƠN HÀNG (SẮP XẾP GIỜ GIẢM DẦN TỪ TRÊN XUỐNG DƯỚI) */}
      {activeModal === 'orders' && (
        <div className="sb-bottom-sheet-overlay" onClick={() => setActiveModal(null)}>
          <div className="sb-bottom-sheet-content" onClick={e => e.stopPropagation()}>
            <div className="sb-sheet-grab-bar" />
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 10, borderBottom: '1.5px solid #eadcca', marginBottom: 12 }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 900, color: '#2d1c10' }}>
                  🧾 Danh Sách Toàn Bộ Đơn Hàng Hôm Nay ({sortedOrders.length})
                </div>
                <div style={{ fontSize: 12, color: '#b93e13', fontWeight: 800, marginTop: 2 }}>
                  ⬇️ Sắp xếp theo giờ ưu tiên từ trên xuống dưới
                </div>
              </div>
              <button onClick={() => setActiveModal(null)} style={{ width: 30, height: 30, borderRadius: 8, border: 'none', background: '#f4efe8', fontWeight: 900, cursor: 'pointer' }}>✕</button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {sortedOrders.map((order, idx) => (
                <div key={order.id} style={{ background: order.isUrgent ? '#fffdf7' : '#fff', border: order.isUrgent ? '2px solid #fcd34d' : '2px solid #eadcca', borderRadius: 16, padding: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 12, fontWeight: 900, background: '#f5eadc', color: '#8b5900', padding: '3px 8px', borderRadius: 6, fontFamily: 'monospace' }}>
                      #{idx + 1} · {order.code}
                    </span>
                    <span style={{ fontSize: 12.5, fontWeight: 900, color: '#dc2626' }}>
                      ⏰ {order.time}
                    </span>
                  </div>

                  <div style={{ fontSize: 14.5, fontWeight: 900, color: '#2d1c10', margin: '8px 0 2px' }}>
                    {order.customer}
                  </div>
                  <div style={{ fontSize: 12, color: '#725f50' }}>📍 {order.address}</div>

                  <div style={{ background: '#faf6f0', borderRadius: 10, padding: '8px 10px', margin: '8px 0', fontSize: 12 }}>
                    <div style={{ fontWeight: 800, color: '#493526', marginBottom: 2 }}>Món đặt:</div>
                    {order.items.map((it, i) => (
                      <div key={i} style={{ color: '#725f50' }}>• {it}</div>
                    ))}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 6, borderTop: '1px solid #eadcca' }}>
                    <span style={{ fontSize: 12, fontWeight: 800, color: '#138a53' }}>{order.status}</span>
                    <span style={{ fontSize: 15, fontWeight: 900, color: '#2d1c10' }}>{formatVND(order.total)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: GIỎ HÀNG THỬ NGHIỆM */}
      {activeModal === 'cart' && (
        <div className="sb-bottom-sheet-overlay" onClick={() => setActiveModal(null)}>
          <div className="sb-bottom-sheet-content" onClick={e => e.stopPropagation()}>
            <div className="sb-sheet-grab-bar" />
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 10, borderBottom: '1.5px solid #eadcca', marginBottom: 12 }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 900, color: '#2d1c10' }}>🛒 Giỏ Hàng Mua Sắm Thử Nghiệm</div>
                <div style={{ fontSize: 12, color: '#725f50', fontWeight: 700 }}>Tăng/giảm số lượng & tự nhảy số tiền thời gian thực</div>
              </div>
              <button onClick={() => setActiveModal(null)} style={{ width: 30, height: 30, borderRadius: 8, border: 'none', background: '#f4efe8', fontWeight: 900, cursor: 'pointer' }}>✕</button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {cart.map(item => (
                <div key={item.id} style={{ background: '#fff', border: '2px solid #eadcca', borderRadius: 14, padding: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 24 }}>{item.image}</span>
                    <div>
                      <div style={{ fontSize: 13.5, fontWeight: 900, color: '#2d1c10' }}>{item.name}</div>
                      <div style={{ fontSize: 12, color: '#C88A4B', fontWeight: 900 }}>{formatVND(item.price)}</div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <button
                      onClick={() => updateCartQty(item.id, -1)}
                      style={{ width: 28, height: 28, borderRadius: 8, background: '#f4efe8', border: 'none', fontWeight: 900, cursor: 'pointer' }}
                    >
                      -
                    </button>
                    <span style={{ width: 20, textAlign: 'center', fontWeight: 900, fontSize: 13 }}>{item.quantity}</span>
                    <button
                      onClick={() => updateCartQty(item.id, 1)}
                      style={{ width: 28, height: 28, borderRadius: 8, background: '#f4efe8', border: 'none', fontWeight: 900, cursor: 'pointer' }}
                    >
                      +
                    </button>
                  </div>
                </div>
              ))}

              <div style={{ background: '#2d1c10', color: '#fff', borderRadius: 16, padding: 14, marginTop: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 13 }}>
                  <span>Tổng số lượng:</span>
                  <span style={{ fontWeight: 900 }}>{totalCartCount} món</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 16, fontWeight: 900, borderTop: '1px solid rgba(255,255,255,0.15)', paddingTop: 8, marginTop: 8 }}>
                  <span style={{ color: '#ffd284' }}>TỔNG TIỀN TẠM TÍNH:</span>
                  <span style={{ color: '#ffd284', fontFamily: 'monospace' }}>{formatVND(cartSubtotal)}</span>
                </div>
                <button
                  onClick={() => showToast('🎉 Demo Đặt Hàng Thành Công! (Không trừ tiền thật)')}
                  style={{ width: '100%', background: '#138a53', color: '#fff', border: 'none', borderRadius: 12, padding: '12px 0', fontSize: 14, fontWeight: 900, marginTop: 12, cursor: 'pointer' }}
                >
                  Xác Nhận Đặt Hàng Demo
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed',
          bottom: 80,
          left: '50%',
          transform: 'translateX(-50%)',
          background: '#2d1c10',
          color: '#fff',
          padding: '10px 20px',
          borderRadius: 20,
          fontSize: 13.5,
          fontWeight: 800,
          boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
          zIndex: 2000,
          whiteSpace: 'nowrap'
        }}>
          {toast}
        </div>
      )}

    </div>
  );
}
