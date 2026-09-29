import { supabase } from './supabaseClient';

const DEFAULT_FLAGS = Object.freeze({
  orders_v2_read: false,
  orders_v2_write: false,
  inventory_ledger_write: false,
  notifications_v2: false,
  school_lockdown: false,
  delivery_v2: false,
  kpi_v2: false,
});

let cache = { value: DEFAULT_FLAGS, expiresAt: 0 };

export async function loadFeatureFlags({ force = false } = {}) {
  if (!force && cache.expiresAt > Date.now()) return cache.value;
  const { data, error } = await supabase.from('feature_flags').select('key,enabled,rollout_percentage,allowed_profile_ids');
  if (error) return cache.value;
  // getSession() đọc phiên đăng nhập ngay trên máy; getUser() cũ gọi lên máy
  // chủ Auth mỗi lần (~0,3s) chỉ để lấy đúng id người dùng này.
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user;
  const flags = { ...DEFAULT_FLAGS };
  for (const row of data || []) {
    if (!(row.key in flags)) continue;
    flags[row.key] = Boolean(row.enabled && (row.rollout_percentage === 100 || row.allowed_profile_ids?.includes(user?.id)));
  }
  cache = { value: Object.freeze(flags), expiresAt: Date.now() + 30_000 };
  return cache.value;
}

export function clearFeatureFlagCache() {
  cache = { value: DEFAULT_FLAGS, expiresAt: 0 };
}

// Mọi cột của view order_operations_list TRỪ 2 cột "trễ" (was_late,
// late_staff_names). Thêm cột mới vào view -> thêm vào đây, không thì màn
// Đơn hàng / tổng quan Giám đốc sẽ không thấy cột đó.
const COT_DS_DON = [
  'id', 'order_code', 'order_type', 'status_v2', 'required_at', 'fulfillment_method_v2', 'address',
  'confidentiality', 'created_by_name', 'created_at', 'completed_at', 'total_quantity', 'package_count',
  'completed_package_count', 'production_started_at', 'production_completed_at', 'production_minutes',
  'delivery_started_at', 'delivery_completed_at', 'delivery_minutes', 'delivery_provider', 'provider_label',
  'shipping_fee', 'driver_name', 'is_overdue', 'overdue_stage', 'overdue_minutes', 'customer_name',
  'order_type_label', 'product_names', 'kitchen_names', 'is_internal', 'target_store', 'total', 'deposit',
  'payment_method', 'payment_verified', 'payment_verified_at', 'payment_proof_url', 'kitchen_codes',
  'customer_phone', 'kitchen_staff_names',
].join(',');

async function listOrdersV2Cu() {
  const { data, error } = await supabase.from('order_operations_list').select('*').order('required_at', { ascending: true });
  if (error) throw error;
  return data || [];
}

// Tăng tốc 29/09/2026 (đo thật 348 đơn: 1,8s -> 0,7s). 2 cột "trễ" trong view
// gọi order_lateness_detail 3 LẦN cho MỖI đơn — chiếm ~nửa thời gian. Giờ lấy
// danh sách không kèm 2 cột đó, SONG SONG với 1 truy vấn chỉ lấy các dòng trễ,
// rồi ghép lại đúng như view tính (was_late = có ít nhất 1 dòng trễ;
// late_staff_names = tên bếp trễ + tên vận tải trễ, không trùng, xếp A-Z, nối
// bằng ', ' như string_agg(DISTINCT ...)). Đã đối chiếu 348/348 đơn khớp y hệt
// cả 2 cột. Lỗi bất kỳ -> quay về cách cũ, không bao giờ trả kết quả thiếu.
export async function listOrdersV2() {
  try {
    const [ds, tre] = await Promise.all([
      supabase.from('order_operations_list').select(COT_DS_DON).order('required_at', { ascending: true }),
      supabase.from('order_lateness_detail')
        .select('order_id,kitchen_late,kitchen_staff_name,shipper_late,shipper_staff_name')
        .or('kitchen_late.eq.true,shipper_late.eq.true'),
    ]);
    if (ds.error || tre.error) return listOrdersV2Cu();
    const tenTre = new Map();
    for (const d of tre.data || []) {
      const ten = tenTre.get(d.order_id) || new Set();
      if (d.kitchen_late && d.kitchen_staff_name) ten.add(d.kitchen_staff_name);
      if (d.shipper_late && d.shipper_staff_name) ten.add(d.shipper_staff_name);
      tenTre.set(d.order_id, ten);
    }
    return (ds.data || []).map((o) => {
      const ten = tenTre.get(o.id);
      return {
        ...o,
        was_late: Boolean(ten),
        late_staff_names: ten && ten.size ? [...ten].sort().join(', ') : null,
      };
    });
  } catch {
    return listOrdersV2Cu();
  }
}

export async function createOrderV2(command) {
  const { data, error } = await supabase.rpc('create_order_v2', command);
  if (error) throw error;
  return data;
}

export async function assignOrderPackage(command) {
  const { data, error } = await supabase.rpc('assign_order_package', command);
  if (error) throw error;
  return data;
}

export async function acceptOrderPackage(command) {
  const { data, error } = await supabase.rpc('accept_order_package', command);
  if (error) throw error;
  return data;
}
