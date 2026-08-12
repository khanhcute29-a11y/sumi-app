// Map old roles to new 6-role system
export const ROLE_MAPPING = {
  owner: 'admin',
  cashier: 'sale',
  kitchen: 'bakery',
  shipper: 'shipper',
  // New roles - map to themselves
  admin: 'admin',
  sale: 'sale',
  bakery: 'bakery',
  warehouse: 'warehouse',
  accountant: 'accountant',
};

export function migrateOldRole(oldRole) {
  if (!oldRole) return null;
  return ROLE_MAPPING[oldRole] || oldRole;
}

export function isOldRole(role) {
  return ['owner', 'cashier', 'kitchen', 'shipper'].includes(role);
}

export function isNewRole(role) {
  return ['admin', 'sale', 'bakery', 'warehouse', 'accountant', 'shipper'].includes(role);
}
