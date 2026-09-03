/**
 * Order visibility filtering logic based on user role and station
 *
 * Rules:
 * - Hot (Bếp Nóng) / Cold (Bếp Lạnh) / Teabreak: ALL staff can see
 * - Macaron (X41): Only X41 kitchen lead + X41 staff can see
 * - School (X42): Only X42 kitchen lead + X42 staff can see
 * - Driver/Logistics: Can see ALL orders
 * - Owner/Admin: Can see ALL orders
 * - NGOẠI LỆ (mọi order_type): nhân sự thuộc 1 bếp đang có work package thật
 *   cho đơn đó (order.kitchen_codes, từ order_operations_list — xem migration
 *   202609041100) LUÔN thấy được, bất kể luồng gì — đây là chỗ "bếp phối
 *   hợp" (assign_order_package_collab) cần để nhân sự bếp được mời thấy đơn
 *   dù đơn thuộc luồng khác station mặc định của họ (vd macaron giao cho bếp
 *   lạnh cùng làm).
 */

// station (profiles.station) -> code tương ứng trong organization_units.
// Đối chiếu trực tiếp qua Supabase MCP — không đoán tên.
const STATION_TO_UNIT_CODE = {
  lanh: 'BAKERY_COLD',
  nong: 'BAKERY_HOT',
  xuong41: 'X41_KITCHEN',
  xuong42: 'X42_KITCHEN',
};

function hasWorkPackageForMyStation(order, userProfile) {
  const code = STATION_TO_UNIT_CODE[(userProfile?.station || '').toLowerCase()];
  if (!code) return false;
  return Array.isArray(order?.kitchen_codes) && order.kitchen_codes.includes(code);
}

function isOwnerOrAdmin(userProfile) {
  return ['owner', 'admin'].includes(userProfile?.role) ||
    (userProfile?.extra_roles || []).some(r => ['owner', 'admin'].includes(r));
}

function hasRoleOrExtra(userProfile, role) {
  return userProfile?.role === role || (userProfile?.extra_roles || []).includes(role);
}

// Đơn Trường học (X42): CHỈ owner/admin và Trợ Lý Giám Đốc Xưởng 42 được xem —
// không phải "nhân viên X42" nói chung nữa (khác Macaron), theo yêu cầu bảo
// mật riêng cho đơn trường học ("không ai được xem cả" ngoài 2 vai trò này).
export function canViewSchoolOrder(userProfile) {
  return isOwnerOrAdmin(userProfile)
    || hasRoleOrExtra(userProfile, 'deputy_director_x42')
    || hasRoleOrExtra(userProfile, 'shipper_school')
    // Nhân viên bếp được phân vào Xưởng 42 (Bếp Trường học) — họ cần thấy đơn
    // trường học để nhận và làm việc, không chỉ Trợ Lý Giám Đốc Xưởng 42.
    || userProfile?.station === 'xuong42';
}

// Giá sản phẩm Macaron: chỉ owner/admin và Trợ Lý Giám Đốc Xưởng 41 được xem
// giá — nhân viên khác (kể cả nhân viên X41 sản xuất đơn đó) vẫn thấy đơn
// hàng bình thường nhưng không thấy giá.
export function canViewMacaronPrice(userProfile) {
  return isOwnerOrAdmin(userProfile) || hasRoleOrExtra(userProfile, 'deputy_director_x41');
}

export function canUserViewOrder(order, userProfile) {
  if (!order || !userProfile) return false;

  // Owner/Admin can see all
  if (isOwnerOrAdmin(userProfile)) return true;

  // Driver/Logistics can see all
  const isDriver = userProfile.role === 'driver_logistics';
  if (isDriver) return true;

  // Bếp phối hợp: có work package thật cho đúng bếp của mình -> luôn thấy,
  // bất kể order_type gì (xem ghi chú đầu file).
  if (hasWorkPackageForMyStation(order, userProfile)) return true;

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

  // Macaron (X41) orders - only X41 staff (đơn vẫn xem được, chỉ ẩn giá — xem canViewMacaronPrice)
  if (order.order_type === 'macaron') {
    const isX41Staff = userStation.includes('41') ||
                      userStation.includes('macaron') ||
                      userRole.includes('macaron') ||
                      userRole.includes('x41') ||
                      extraRoles.some(r => r.includes('macaron') || r.includes('x41'));
    return isX41Staff;
  }

  // School (X42) orders — dùng chung canViewSchoolOrder() để tránh 2 nơi định
  // nghĩa lệch nhau (owner/admin đã trả về true ở trên rồi).
  if (order.order_type === 'school') {
    return canViewSchoolOrder(userProfile);
  }

  // Mixed orders (đơn gồm nhiều luồng, vd bánh lạnh + bánh nóng): hiện chỉ có
  // thể gồm bakery/cake/teabreak/macaron — trường học LUÔN bắt buộc tách đơn
  // riêng (xem CreateOrderV2Modal.addFlow chặn thêm luồng school vào đơn đã
  // có luồng khác, và ngược lại). Cả 4 luồng này đều công khai cho mọi nhân
  // viên bếp/bán hàng khi đứng riêng (macaron chỉ ẩn GIÁ qua
  // canViewMacaronPrice, không ẩn cả đơn) nên đơn mixed cũng phải công khai
  // tương tự — TRƯỚC ĐÂY khoá cứng return false khiến MỌI nhân viên (kể cả
  // đủ 2 vai trò bếp nóng+lạnh, hay nhân viên tạo đơn) đều không thấy đơn
  // mixed, chỉ owner/admin/driver thấy được. Vẫn kiểm tra confidentiality để
  // phòng hờ nếu sau này có đơn mixed dính luồng trường học.
  if (order.order_type === 'mixed') {
    return order.confidentiality !== 'school_restricted';
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

  if (canViewSchoolOrder(userProfile)) {
    workflows.push('school');
  }

  return workflows;
}
