import { ROLE_META, ROLE_PERMISSIONS } from './roles';
import { migrateOldRole } from './roleMigration';

export function getPermissionsForRole(role) {
  const resolvedRole = migrateOldRole(role);
  const rolePerms = ROLE_PERMISSIONS.find(r => r.role === resolvedRole);
  return rolePerms?.permissions || [];
}

export function hasPermission(userRole, permission) {
  const perms = getPermissionsForRole(userRole);
  return perms.includes(permission);
}

export function hasAnyPermission(userRole, permissions) {
  const perms = getPermissionsForRole(userRole);
  return permissions.some(p => perms.includes(p));
}

export function hasAllPermissions(userRole, permissions) {
  const perms = getPermissionsForRole(userRole);
  return permissions.every(p => perms.includes(p));
}

export function getRoleLevel(role) {
  return ROLE_META[migrateOldRole(role)]?.level || 0;
}

export function canAccessRole(userRole, targetRole) {
  return getRoleLevel(userRole) >= getRoleLevel(targetRole);
}

export const PERMISSION_CHECKS = {
  // Order management
  canViewOrders: (role) => hasAnyPermission(role, ['view_all_orders', 'view_kitchen_orders', 'view_ready_orders', 'view_own_orders']),
  canCreateOrder: (role) => hasPermission(role, 'create_order'),
  canEditOrder: (role) => hasAnyPermission(role, ['edit_order', 'edit_order_own']),
  canDeleteOrder: (role) => hasPermission(role, 'delete_order'),
  canUpdateOrderStatus: (role) => hasPermission(role, 'update_order_status'),
  canUpdateDeliveryStatus: (role) => hasPermission(role, 'update_delivery_status'),

  // Customer management
  canViewCustomers: (role) => hasAnyPermission(role, ['view_all_customers', 'view_own_customers']),
  canCreateCustomer: (role) => hasPermission(role, 'create_customer'),
  canEditCustomer: (role) => hasPermission(role, 'edit_customer'),

  // Inventory
  canViewInventory: (role) => hasAnyPermission(role, ['view_all_inventory', 'view_inventory', 'view_product_inventory', 'view_ingredient_inventory']),
  canEditInventory: (role) => hasPermission(role, 'edit_inventory'),
  canViewFinishedInventory: (role) => hasPermission(role, 'view_finished_inventory'),

  // Reports
  canViewReports: (role) => hasAnyPermission(role, ['view_all_reports', 'view_own_reports', 'view_staff_reports', 'view_subordinate_reports', 'view_warehouse_reports', 'view_revenue', 'view_transactions']),
  canCreateReport: (role) => hasPermission(role, 'create_report'),
  canViewAllReports: (role) => hasPermission(role, 'view_all_reports'),
  canViewSubordinateReports: (role) => hasAnyPermission(role, ['view_all_reports', 'view_staff_reports', 'view_subordinate_reports']),

  // Pricing & discounts
  canViewPrices: (role) => hasPermission(role, 'view_prices'),
  canApplyDiscount: (role) => hasPermission(role, 'apply_discount'),
  canViewRevenue: (role) => hasPermission(role, 'view_revenue'),
  canViewProfitData: (role) => hasPermission(role, 'view_profit'),

  // Staff management
  canManageStaff: (role) => hasPermission(role, 'manage_staff'),
  canManageRoles: (role) => hasPermission(role, 'manage_roles'),

  // Settings
  canManageSettings: (role) => hasPermission(role, 'manage_settings'),
  canViewAuditLog: (role) => hasPermission(role, 'view_audit_log'),
};

export default PERMISSION_CHECKS;
