import { supabase } from './supabaseClient';
import { newId } from './ids';

// Đơn hàng nội bộ (Phase 1) — tạo hàng lên kệ, không có khách hàng.
// Dùng CHUNG bảng orders/order_items thật (is_internal=true đánh dấu),
// không phải hệ thống song song — thả tim/lịch sử/timeline có sẵn tự hoạt
// động vì mọi thứ vẫn là 1 hàng trong `orders`.

// Kho thành phẩm (finished_goods_stock.branch) chỉ dùng 3 khoá thật:
// 'bakery' | 'xuong41' | 'xuong42' (xem FLOWS trong FinishedGoodsInventoryV2.jsx).
// order_type của đơn hàng lại dùng khoá khác ('cake'/'bakery'/'macaron'/...),
// nên PHẢI quy đổi trước khi tra kho — nếu truyền thẳng order_type vào sẽ
// không bao giờ khớp (vd 'cake' hay 'macaron' không phải branch thật nào cả).
export function branchForOrderType(orderType) {
  if (orderType === 'macaron') return 'xuong41';
  if (orderType === 'school' || orderType === 'teabreak') return 'xuong42';
  return 'bakery'; // cake, bakery
}

export async function fetchStockAvailableFor(orderType, store) {
  const branch = branchForOrderType(orderType);
  let q = supabase
    .from('finished_goods_stock')
    .select('id, product_id, size, branch, store_location, qty, production_date, expiry_date, photo_url, products(name)')
    .eq('branch', branch)
    .gt('qty', 0)
    .order('updated_at', { ascending: false });
  if (store) q = q.eq('store_location', store);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

export async function createInternalOrder({ orderType, targetStore, requiredAt, note, items }) {
  const { data, error } = await supabase.rpc('create_internal_order', {
    p_idempotency_key: newId(),
    p_order_code: `NB-${Date.now().toString(36).toUpperCase()}`,
    p_order_type: orderType,
    p_target_store: targetStore || null,
    p_required_at: requiredAt ? new Date(requiredAt).toISOString() : null,
    p_note: note || null,
    p_items: items.map((it, i) => ({
      name: it.name, quantity: it.quantity || 1, unit: it.unit || 'cái',
      size: it.size || null, unit_price: it.price || null, ref_photo_url: it.photoUrl || null,
      display_order: i,
    })),
  });
  if (error) throw error;
  return data;
}

export async function createInternalOrderFromStock({ stockId, qty, targetStore, requiredAt, note }) {
  const { data, error } = await supabase.rpc('create_internal_order_from_stock', {
    p_idempotency_key: newId(),
    p_order_code: `NB-${Date.now().toString(36).toUpperCase()}`,
    p_stock_id: stockId,
    p_qty: qty,
    p_target_store: targetStore || null,
    p_required_at: requiredAt ? new Date(requiredAt).toISOString() : null,
    p_note: note || null,
  });
  if (error) throw error;
  return data;
}

// Lịch sử "Đơn sản xuất" — hiện trong Kho Thành Phẩm theo yêu cầu.
export async function fetchInternalOrders(limit = 100) {
  const { data, error } = await supabase
    .from('orders')
    .select('id, order_code, order_type, target_store, required_at, status_v2, created_at, created_by_name, note')
    .eq('is_internal', true)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data || [];
}
