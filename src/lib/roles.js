export const ROLE_META = {
  admin: { label: 'Admin', tone: 'primary', level: 6 },
  accountant: { label: 'Kế Toán', tone: 'info', level: 5 },
  warehouse: { label: 'Thủ Kho', tone: 'info', level: 4 },
  sale: { label: 'Nhân Viên Bán Hàng', tone: 'success', level: 3 },
  kitchen_lead: { label: 'Bếp Trưởng', tone: 'warning', level: 3 },
  kitchen_deputy: { label: 'Bếp Phó', tone: 'warning', level: 2 },
  bakery: { label: 'Thợ Làm Bánh', tone: 'warning', level: 2 },
  kho_bakery: { label: 'Nhân Viên Kho Bakery', tone: 'info', level: 2 },
  kho_xuong41: { label: 'Nhân Viên Kho Xưởng 41', tone: 'info', level: 2 },
  kho_xuong42: { label: 'Nhân Viên Kho Xưởng 42', tone: 'info', level: 2 },
  shipper: { label: 'Vận Chuyển', tone: 'success', level: 1 },
};

export const ROLE_OPTIONS = Object.entries(ROLE_META).map(([value, m]) => ({ value, label: m.label }));

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
    role: 'kho_bakery',
    desc: 'Nhân viên Kho Bakery — chỉ xem/thao tác nguyên liệu thuộc Kho Bakery.',
    permissions: ['view_inventory', 'edit_inventory']
  },
  {
    role: 'kho_xuong41',
    desc: 'Nhân viên Kho Xưởng 41 — chỉ xem/thao tác nguyên liệu thuộc Kho Xưởng 41.',
    permissions: ['view_inventory', 'edit_inventory']
  },
  {
    role: 'kho_xuong42',
    desc: 'Nhân viên Kho Xưởng 42 — chỉ xem/thao tác nguyên liệu thuộc Kho Xưởng 42.',
    permissions: ['view_inventory', 'edit_inventory']
  },
  {
    role: 'kitchen_lead',
    desc: 'Bếp trưởng — như Thợ Làm Bánh, cộng thêm quyền chỉ đạo bếp phó & nhân viên bếp cấp dưới, can thiệp mọi đơn ở khu bếp.',
    permissions: [
      'view_kitchen_orders', 'update_order_status', 'manage_kitchen_staff', 'intervene_kitchen_orders',
      'view_finished_inventory', 'report_inventory',
      'request_ingredient_export', 'view_ingredient_inventory'
    ]
  },
  {
    role: 'kitchen_deputy',
    desc: 'Bếp phó — như Thợ Làm Bánh, cộng thêm quyền can thiệp đơn ở khu bếp khi bếp trưởng vắng mặt.',
    permissions: [
      'view_kitchen_orders', 'update_order_status', 'intervene_kitchen_orders',
      'view_finished_inventory', 'report_inventory',
      'request_ingredient_export', 'view_ingredient_inventory'
    ]
  },
  {
    role: 'bakery',
    desc: 'Xem đơn hàng cần làm, cập nhật trạng thái, quản lý tồn kho thành phẩm & yêu cầu xuất kho.',
    permissions: [
      'view_kitchen_orders', 'update_order_status',
      'view_finished_inventory', 'report_inventory',
      'request_ingredient_export', 'view_ingredient_inventory'
    ]
  },
  {
    role: 'shipper',
    desc: 'Xem đơn sẵn giao, nhận hàng, cập nhật trạng thái giao, thu tiền COD.',
    permissions: [
      'view_ready_orders', 'update_delivery_status',
      'view_customer_contact', 'confirm_cod_receipt'
    ]
  },
];

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
    hasAnyRole(profile, ['shipper']) && 'log',
    hasAnyRole(profile, ['kitchen', 'bakery', 'kitchen_lead', 'kitchen_deputy']) && 'kit',
    hasAnyRole(profile, ['warehouse', 'kho_bakery', 'kho_xuong41', 'kho_xuong42']) && 'inv',
  ].filter(Boolean);
  return {
    orders: isManager || hasAnyRole(profile, ['sale', 'cashier']),
    kds: isManager || hasAnyRole(profile, ['kitchen', 'bakery', 'kitchen_lead', 'kitchen_deputy']),
    approvals: isManager,
    incidents: isManager || incidentCategories.length > 0,
    incidentCategories, // null = tất cả (sếp/admin), mảng rỗng = không thấy mục nào
  };
}
