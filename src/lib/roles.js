export const ROLE_META = {
  owner: { label: 'Giám Đốc / Chủ Sở Hữu', shortLabel: 'Giám Đốc', tone: 'primary', level: 7 },
  admin: { label: 'Quản Lý / Điều Hành', shortLabel: 'Quản Lý', tone: 'primary', level: 6 },
  deputy_director: { label: 'Trợ Lý Giám Đốc', shortLabel: 'TL Giám Đốc', tone: 'primary', level: 6 },
  accountant: { label: 'Kế Toán', shortLabel: 'Kế Toán', tone: 'info', level: 5 },
  warehouse: { label: 'Thủ Kho', shortLabel: 'Thủ Kho', tone: 'info', level: 4 },
  sale: { label: 'Nhân Viên Bán Hàng', shortLabel: 'Bán Hàng', tone: 'success', level: 3 },
  cashier: { label: 'Thu Ngân', shortLabel: 'Thu Ngân', tone: 'success', level: 3 },

  // Bếp Lạnh (Bánh kem & bánh lạnh)
  kitchen_lead_cold: { label: 'Bếp Trưởng Bếp Lạnh', shortLabel: 'BT Bếp Lạnh', tone: 'warning', level: 3, station: 'Bếp Lạnh' },
  kitchen_deputy_cold: { label: 'Bếp Phó Bếp Lạnh', shortLabel: 'BP Bếp Lạnh', tone: 'warning', level: 2, station: 'Bếp Lạnh' },
  baker_cold: { label: 'Thợ Bếp Lạnh', shortLabel: 'Thợ Bếp Lạnh', tone: 'warning', level: 2, station: 'Bếp Lạnh' },

  // Bếp Nóng (Bánh mặn, bánh ngọt, bánh mì, BTT)
  kitchen_lead_hot: { label: 'Bếp Trưởng Bếp Nóng', shortLabel: 'BT Bếp Nóng', tone: 'warning', level: 3, station: 'Bếp Nóng' },
  kitchen_deputy_hot: { label: 'Bếp Phó Bếp Nóng', shortLabel: 'BP Bếp Nóng', tone: 'warning', level: 2, station: 'Bếp Nóng' },
  baker_hot: { label: 'Thợ Bếp Nóng', shortLabel: 'Thợ Bếp Nóng', tone: 'warning', level: 2, station: 'Bếp Nóng' },

  // Xưởng 41 (Macaron)
  kitchen_lead_macaron: { label: 'Bếp Trưởng Macaron (X41)', shortLabel: 'BT Macaron', tone: 'warning', level: 3, station: 'Xưởng 41' },
  baker_macaron: { label: 'Thợ Macaron (X41)', shortLabel: 'Thợ Macaron', tone: 'warning', level: 2, station: 'Xưởng 41' },

  // Xưởng 42 (Trường học & Teabreak)
  kitchen_lead_x42: { label: 'Bếp Trưởng Xưởng 42', shortLabel: 'BT Xưởng 42', tone: 'warning', level: 3, station: 'Xưởng 42' },
  baker_x42: { label: 'Thợ Xưởng 42', shortLabel: 'Thợ X42', tone: 'warning', level: 2, station: 'Xưởng 42' },

  // Vai trò Bếp chung
  kitchen_lead: { label: 'Bếp Trưởng (Chung)', shortLabel: 'Bếp Trưởng', tone: 'warning', level: 3 },
  kitchen_deputy: { label: 'Bếp Phó (Chung)', shortLabel: 'Bếp Phó', tone: 'warning', level: 2 },
  bakery: { label: 'Thợ Làm Bánh (Chung)', shortLabel: 'Thợ Bánh', tone: 'warning', level: 2 },

  // Vận chuyển & Kho phụ
  transport_lead: { label: 'Trưởng Đội Vận Tải', shortLabel: 'Trưởng Vận Tải', tone: 'success', level: 3 },
  shipper: { label: 'Nhân Viên Vận Chuyển', shortLabel: 'Shipper', tone: 'success', level: 1 },
  kho_bakery: { label: 'Nhân Viên Kho Bakery', shortLabel: 'Kho Bakery', tone: 'info', level: 2 },
  kho_xuong41: { label: 'Nhân Viên Kho Xưởng 41', shortLabel: 'Kho X41', tone: 'info', level: 2 },
  kho_xuong42: { label: 'Nhân Viên Kho Xưởng 42', shortLabel: 'Kho X42', tone: 'info', level: 2 },
};

export const ROLE_OPTIONS = Object.entries(ROLE_META).map(([value, m]) => ({
  value,
  label: `${m.shortLabel ? `[${m.shortLabel}] ` : ''}${m.label}`
}));

export const KITCHEN_LEAD_ROLES = [
  'kitchen_lead', 'kitchen_lead_cold', 'kitchen_lead_hot', 'kitchen_lead_macaron', 'kitchen_lead_x42',
  'kitchen_deputy', 'kitchen_deputy_cold', 'kitchen_deputy_hot'
];

export const ALL_KITCHEN_ROLES = [
  ...KITCHEN_LEAD_ROLES,
  'bakery', 'baker_cold', 'baker_hot', 'baker_macaron', 'baker_x42'
];

export const ROLE_PERMISSIONS = [
  {
    role: 'admin',
    desc: 'Toàn quyền — xem/sửa mọi đơn hàng, tiền bạc, kho, nhân viên, báo cáo, cài đặt.',
    permissions: [
      'view_all_orders', 'create_order', 'edit_order', 'delete_order',
      'view_all_customers', 'create_customer', 'edit_customer',
      'view_all_inventory', 'edit_inventory',
      'view_all_reports', 'create_report',
      'manage_staff', 'manage_roles', 'manage_settings',
      'view_revenue', 'view_costs', 'view_profit',
      'view_audit_log', 'manage_system'
    ]
  },
  {
    role: 'deputy_director',
    desc: 'Trợ lý Giám đốc — gần như toàn quyền như Quản lý (đơn hàng, kho, nhân viên, tạo đơn Macaron/Bánh Quy riêng), NGOẠI TRỪ duyệt chi tiêu và xem doanh thu.',
    permissions: [
      'view_all_orders', 'create_order', 'edit_order', 'delete_order',
      'view_all_customers', 'create_customer', 'edit_customer',
      'view_all_inventory', 'edit_inventory',
      'view_all_reports', 'create_report',
      'manage_staff', 'manage_roles', 'manage_settings',
      'view_audit_log'
    ]
  },
  {
    role: 'accountant',
    desc: 'Xem giao dịch thu chi, hóa đơn, lương thưởng, công nợ. Chốt sổ & đối soát COD.',
    permissions: [
      'view_all_reports', 'view_revenue', 'view_costs', 'view_profit',
      'view_transactions', 'reconcile_payments',
      'view_staff_reports', 'view_subordinate_reports'
    ]
  },
  {
    role: 'warehouse',
    desc: 'Quản lý nhập/xuất kho, kiểm kê, cảnh báo nguyên liệu sắp hết.',
    permissions: [
      'view_inventory', 'edit_inventory', 'create_inventory_request',
      'view_warehouse_reports', 'view_subordinate_reports',
      'view_warehouse_suppliers'
    ]
  },
  {
    role: 'sale',
    desc: 'Tạo/sửa/hủy đơn hàng, quản lý khách hàng, xem tồn kho & bảng giá.',
    permissions: [
      'view_own_orders', 'create_order', 'edit_order_own', 'cancel_order_own',
      'view_own_customers', 'create_customer', 'edit_customer',
      'view_product_inventory', 'view_prices', 'apply_discount',
      'view_own_reports', 'create_report'
    ]
  },
  {
    role: 'kitchen_lead',
    desc: 'Bếp trưởng — nhận đơn, phân công chỉ đạo thợ tuyến dưới, can thiệp mọi đơn ở khu bếp.',
    permissions: [
      'view_kitchen_orders', 'update_order_status', 'manage_kitchen_staff', 'intervene_kitchen_orders',
      'view_finished_inventory', 'report_inventory',
      'request_ingredient_export', 'view_ingredient_inventory'
    ]
  },
  {
    role: 'bakery',
    desc: 'Xem đơn hàng cần làm, cập nhật trạng thái làm bánh, báo cáo thành phẩm.',
    permissions: [
      'view_kitchen_orders', 'update_order_status',
      'view_finished_inventory', 'report_inventory',
      'request_ingredient_export', 'view_ingredient_inventory'
    ]
  },
  {
    role: 'shipper',
    desc: 'Xem đơn sẵn giao, nhận hàng, chụp ảnh giao hàng kèm vị trí GPS, thu tiền COD.',
    permissions: [
      'view_ready_orders', 'update_delivery_status',
      'view_customer_contact', 'confirm_cod_receipt'
    ]
  },
];

// Chuẩn hóa station cho cơ sở dữ liệu (tương thích 100% check constraint cũ lẫn mới)
export function normalizeStationForDb(station) {
  if (!station) return null;
  const s = String(station).trim().toLowerCase();
  if (s === 'lanh' || s.includes('lạnh') || s.includes('cold')) return 'lanh';
  if (s === 'nong' || s.includes('nóng') || s.includes('hot')) return 'nong';
  if (s === 'xuong41' || s.includes('41') || s.includes('macaron')) return 'xuong41';
  if (s === 'xuong42' || s.includes('42') || s.includes('trường')) return 'xuong42';
  if (s === 'bakery' || s.includes('bánh')) return 'bakery';
  return null;
}

export function formatStationLabel(station) {
  if (!station) return '';
  const s = String(station).toLowerCase();
  if (s === 'lanh' || s.includes('lạnh')) return 'Bếp Lạnh';
  if (s === 'nong' || s.includes('nóng')) return 'Bếp Nóng';
  if (s === 'xuong41' || s.includes('41')) return 'Xưởng 41';
  if (s === 'xuong42' || s.includes('42')) return 'Xưởng 42';
  if (s === 'bakery') return 'Bakery';
  return station;
}

// Tự động map role UI về DB role an toàn (tránh check constraint error) và gán đúng station chuẩn DB
export function resolveRoleAndStation(roleKey, currentStation) {
  let mappedRole = roleKey;
  let mappedStation = normalizeStationForDb(currentStation);

  switch (roleKey) {
    case 'kitchen_lead_cold':
      mappedRole = 'kitchen_lead';
      mappedStation = 'lanh';
      break;
    case 'kitchen_deputy_cold':
      mappedRole = 'kitchen_deputy';
      mappedStation = 'lanh';
      break;
    case 'baker_cold':
      mappedRole = 'bakery';
      mappedStation = 'lanh';
      break;
    case 'kitchen_lead_hot':
      mappedRole = 'kitchen_lead';
      mappedStation = 'nong';
      break;
    case 'kitchen_deputy_hot':
      mappedRole = 'kitchen_deputy';
      mappedStation = 'nong';
      break;
    case 'baker_hot':
      mappedRole = 'bakery';
      mappedStation = 'nong';
      break;
    case 'kitchen_lead_macaron':
      mappedRole = 'kitchen_lead';
      mappedStation = 'xuong41';
      break;
    case 'baker_macaron':
      mappedRole = 'bakery';
      mappedStation = 'xuong41';
      break;
    case 'kitchen_lead_x42':
      mappedRole = 'kitchen_lead';
      mappedStation = 'xuong42';
      break;
    case 'baker_x42':
      mappedRole = 'bakery';
      mappedStation = 'xuong42';
      break;
    case 'transport_lead':
      mappedRole = 'shipper';
      mappedStation = null;
      break;
    case 'shipper':
      mappedRole = 'shipper';
      mappedStation = null;
      break;
    case 'kho_bakery':
      mappedRole = 'warehouse';
      mappedStation = 'bakery';
      break;
    case 'kho_xuong41':
      mappedRole = 'warehouse';
      mappedStation = 'xuong41';
      break;
    case 'kho_xuong42':
      mappedRole = 'warehouse';
      mappedStation = 'xuong42';
      break;
    case 'owner':
    case 'admin':
    case 'deputy_director':
    case 'accountant':
    case 'sale':
    case 'cashier':
      mappedRole = roleKey;
      mappedStation = null;
      break;
    default:
      mappedStation = normalizeStationForDb(currentStation);
      break;
  }

  return { mappedRole, mappedStation };
}

// Lấy thông tin hiển thị chuẩn theo luồng món & khâu làm việc
export function getRoleMeta(role, station) {
  const s = String(station || '').toLowerCase();
  const isLanh = s === 'lanh' || s.includes('lạnh') || s.includes('cold');
  const isNong = s === 'nong' || s.includes('nóng') || s.includes('hot');
  const isX41 = s === 'xuong41' || s.includes('41') || s.includes('macaron');
  const isX42 = s === 'xuong42' || s.includes('42') || s.includes('trường');

  if (role === 'kitchen_lead') {
    if (isLanh) return ROLE_META.kitchen_lead_cold;
    if (isNong) return ROLE_META.kitchen_lead_hot;
    if (isX41) return ROLE_META.kitchen_lead_macaron;
    if (isX42) return ROLE_META.kitchen_lead_x42;
    return ROLE_META.kitchen_lead;
  }
  if (role === 'kitchen_deputy') {
    if (isLanh) return ROLE_META.kitchen_deputy_cold;
    if (isNong) return ROLE_META.kitchen_deputy_hot;
    return ROLE_META.kitchen_deputy;
  }
  if (role === 'bakery' || role === 'kitchen') {
    if (isLanh) return ROLE_META.baker_cold;
    if (isNong) return ROLE_META.baker_hot;
    if (isX41) return ROLE_META.baker_macaron;
    if (isX42) return ROLE_META.baker_x42;
    return ROLE_META.bakery;
  }
  if (role === 'warehouse') {
    if (isLanh || s === 'bakery') return ROLE_META.kho_bakery;
    if (isX41) return ROLE_META.kho_xuong41;
    if (isX42) return ROLE_META.kho_xuong42;
    return ROLE_META.warehouse;
  }
  if (role === 'shipper' || role === 'transport_lead') {
    return ROLE_META[role] || ROLE_META.shipper;
  }
  return ROLE_META[role] || { label: role, shortLabel: role, tone: 'neutral', level: 1 };
}

// Chuyển role DB + station thành role key trên giao diện để hiển thị đúng trong form chọn
export function getUiRole(role, station) {
  if (!role) return 'bakery';
  const s = String(station || '').toLowerCase();
  const isLanh = s === 'lanh' || s.includes('lạnh') || s.includes('cold');
  const isNong = s === 'nong' || s.includes('nóng') || s.includes('hot');
  const isX41 = s === 'xuong41' || s.includes('41') || s.includes('macaron');
  const isX42 = s === 'xuong42' || s.includes('42') || s.includes('trường');

  if (role === 'kitchen_lead') {
    if (isLanh) return 'kitchen_lead_cold';
    if (isNong) return 'kitchen_lead_hot';
    if (isX41) return 'kitchen_lead_macaron';
    if (isX42) return 'kitchen_lead_x42';
    return 'kitchen_lead';
  }
  if (role === 'kitchen_deputy') {
    if (isLanh) return 'kitchen_deputy_cold';
    if (isNong) return 'kitchen_deputy_hot';
    return 'kitchen_deputy';
  }
  if (role === 'bakery' || role === 'kitchen') {
    if (isLanh) return 'baker_cold';
    if (isNong) return 'baker_hot';
    if (isX41) return 'baker_macaron';
    if (isX42) return 'baker_x42';
    return 'bakery';
  }
  if (role === 'warehouse') {
    if (isLanh || s === 'bakery') return 'kho_bakery';
    if (isX41) return 'kho_xuong41';
    if (isX42) return 'kho_xuong42';
    return 'warehouse';
  }
  return role;
}

// Mapping role to hierarchy level for report access
export function canViewReports(userRole, targetUserRole) {
  if (!userRole || !targetUserRole) return false;
  const userLevel = ROLE_META[userRole]?.level || 0;
  const targetLevel = ROLE_META[targetUserRole]?.level || 0;
  return userLevel >= targetLevel;
}

// Kiêm nhiệm — kiểm tra vai trò chính HOẶC vai trò phụ do Chủ sở hữu gán thêm.
export function hasRole(profile, role) {
  if (!profile) return false;
  return profile.role === role || (profile.extra_roles || []).includes(role);
}

export function hasAnyRole(profile, roles) {
  return roles.some((r) => hasRole(profile, r));
}

// Chấm đỏ thông báo (kiểu Messenger) — vai trò nào thấy chấm đỏ ở mục nào.
export function navBadgeVisibility(profile) {
  const isManager = hasAnyRole(profile, ['owner', 'admin']);
  const incidentCategories = isManager ? null : [
    hasAnyRole(profile, ['shipper', 'transport_lead']) && 'log',
    hasAnyRole(profile, ALL_KITCHEN_ROLES) && 'kit',
    hasAnyRole(profile, ['warehouse', 'kho_bakery', 'kho_xuong41', 'kho_xuong42']) && 'inv',
  ].filter(Boolean);
  return {
    orders: isManager || hasAnyRole(profile, ['sale', 'cashier']),
    kds: isManager || hasAnyRole(profile, ALL_KITCHEN_ROLES),
    approvals: isManager,
    incidents: isManager || incidentCategories.length > 0,
    incidentCategories,
  };
}

