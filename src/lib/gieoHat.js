import { supabase } from './supabaseClient';

// Lịch sử "Gieo Hạt" (Cộng/Trừ sao) toàn công ty — dùng cho ô "Gieo Hạt" mới
// trong TÔI (Quản trị & tiện ích điều hành) của Giám đốc.
//
// Nguồn dữ liệu: view star_transactions (gộp staff_rewards + staff_violations,
// xem migration 202609012000/202609041800) — KHÔNG tạo bảng mới, chỉ đọc.
// staff_id/order KHÔNG có sẵn tên/mã đơn ngay trong view, phải tự nối thêm:
//   - Tên người nhận: join profiles theo staff_id (view chỉ có sẵn
//     created_by_name — tên NGƯỜI TẶNG — không có tên người nhận).
//   - Đơn liên quan: link_type/link_id là tham chiếu đa hình, không phải FK
//     cứng tới orders. Chỉ 2 kiểu trỏ được tới đơn:
//       'order_created' | 'order_delivery' -> link_id CHÍNH LÀ orders.id
//       'order_work_package'               -> link_id là order_work_packages.id,
//                                              phải đi thêm 1 bước qua order_id
//     Các link_type khác ('task', 'cham_cong', hoặc rỗng) không có đơn liên quan.
export async function fetchGieoHatHistory({ limit = 200 } = {}) {
  const { data, error } = await supabase
    .from('star_transactions')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  const rows = data || [];
  if (!rows.length) return [];

  const staffIds = [...new Set(rows.map((r) => r.staff_id).filter(Boolean))];
  const { data: staffRows, error: staffErr } = await supabase
    .from('profiles').select('id, full_name').in('id', staffIds);
  if (staffErr) throw staffErr;
  const nameByStaffId = Object.fromEntries((staffRows || []).map((p) => [p.id, p.full_name]));

  const wpIds = [...new Set(rows.filter((r) => r.link_type === 'order_work_package').map((r) => r.link_id).filter(Boolean))];
  let orderIdByWpId = {};
  if (wpIds.length) {
    const { data: wps, error: wpErr } = await supabase
      .from('order_work_packages').select('id, order_id').in('id', wpIds);
    if (wpErr) throw wpErr;
    orderIdByWpId = Object.fromEntries((wps || []).map((w) => [w.id, w.order_id]));
  }

  const orderIdFor = (r) => {
    if (r.link_type === 'order_created' || r.link_type === 'order_delivery') return r.link_id;
    if (r.link_type === 'order_work_package') return orderIdByWpId[r.link_id] || null;
    return null;
  };

  const orderIds = [...new Set(rows.map(orderIdFor).filter(Boolean))];
  let orderById = {};
  if (orderIds.length) {
    const { data: orders, error: orderErr } = await supabase
      .from('orders').select('id, order_code, order_type').in('id', orderIds);
    if (orderErr) throw orderErr;
    orderById = Object.fromEntries((orders || []).map((o) => [o.id, o]));
  }

  return rows.map((r) => ({
    ...r,
    staff_name: nameByStaffId[r.staff_id] || 'Nhân viên',
    order: orderById[orderIdFor(r)] || null,
  }));
}
