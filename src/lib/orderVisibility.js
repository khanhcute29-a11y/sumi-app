/**
 * Order visibility filtering logic based on user role and station
 *
 * Rules:
 * - Hot (Bếp Nóng) / Cold (Bếp Lạnh) / Teabreak: ALL staff can see
 * - Macaron (X41): Only X41 kitchen lead + X41 staff can see
 * - School (X42): Only X42 kitchen lead + X42 staff can see
 * - Driver/Logistics: Can see ALL orders
 * - Owner/Admin: Can see ALL orders
 */

export function canUserViewOrder(order, userProfile) {
  if (!order || !userProfile) return false;

  // Owner/Admin can see all
  const isAdmin = ['owner', 'admin'].includes(userProfile.role) ||
    (userProfile.extra_roles || []).some(r => ['owner', 'admin'].includes(r));
  if (isAdmin) return true;

  // Driver/Logistics can see all
  const isDriver = userProfile.role === 'driver_logistics';
  if (isDriver) return true;

  // Public flows: Bếp Nóng (Bakery), Bếp Lạnh (Cake), Teabreak
  // All kitchen staff can see these
  const publicFlows = ['bakery', 'cake', 'teabreak'];
  if (publicFlows.includes(order.order_type)) {
    return true;
  }

  // Private flows: check if user belongs to that workflow
  const userStation = (userProfile.station || '').toLowerCase();
  const userRole = (userProfile.role || '').toLowerCase();
  const extraRoles = (userProfile.extra_roles || []).map(r => r.toLowerCase());

  // Macaron (X41) orders - only X41 staff
  if (order.order_type === 'macaron') {
    const isX41Staff = userStation.includes('41') ||
                      userStation.includes('macaron') ||
                      userRole.includes('macaron') ||
                      userRole.includes('x41') ||
                      extraRoles.some(r => r.includes('macaron') || r.includes('x41'));
    return isX41Staff;
  }

  // School (X42) orders - only X42 staff
  if (order.order_type === 'school') {
    const isX42Staff = userStation.includes('42') ||
                      userStation.includes('school') ||
                      userRole.includes('school') ||
                      userRole.includes('x42') ||
                      extraRoles.some(r => r.includes('school') || r.includes('x42'));
    return isX42Staff;
  }

  // Mixed orders - need to check which workflows are involved
  // For now, restrict to owner/admin/driver only
  if (order.order_type === 'mixed') {
    return false; // Only admin/driver can see mixed
  }

  // Default: don't show
  return false;
}

/**
 * Get user's workflow assignment(s) based on role and station
 * Returns: ['hot', 'cold', 'teabreak'] for all, or ['macaron'], ['school'], etc.
 */
export function getUserWorkflows(userProfile) {
  if (!userProfile) return [];

  // Owner/Admin/Driver can see all
  if (['owner', 'admin', 'driver_logistics'].includes(userProfile.role) ||
      (userProfile.extra_roles || []).some(r => ['owner', 'admin', 'driver_logistics'].includes(r))) {
    return ['bakery', 'cake', 'teabreak', 'macaron', 'school', 'mixed'];
  }

  const userStation = (userProfile.station || '').toLowerCase();
  const userRole = (userProfile.role || '').toLowerCase();
  const extraRoles = (userProfile.extra_roles || []).map(r => r.toLowerCase());

  const workflows = [];

  // All kitchen staff can see hot/cold/teabreak
  if (userRole.includes('kitchen') || userRole.includes('baker') || userRole.includes('bep')) {
    workflows.push('bakery', 'cake', 'teabreak');
  }

  // X41 staff can see macaron
  if (userStation.includes('41') || userStation.includes('macaron') ||
      userRole.includes('macaron') || userRole.includes('x41') ||
      extraRoles.some(r => r.includes('macaron') || r.includes('x41'))) {
    workflows.push('macaron');
  }

  // X42 staff can see school
  if (userStation.includes('42') || userStation.includes('school') ||
      userRole.includes('school') || userRole.includes('x42') ||
      extraRoles.some(r => r.includes('school') || r.includes('x42'))) {
    workflows.push('school');
  }

  return workflows;
}
