import { supabase } from './supabaseClient';

// "Đội Vận Tải Ảo" — chuyển giao đơn cho bên vận chuyển thứ 3 (GHN/Grab/
// Ahamove/khác), theo dõi THỦ CÔNG (xem migration 202609031300). Chưa gọi
// API thật của hãng — Giám đốc tự tra cứu mã vận đơn trên app/web riêng của
// hãng rồi cập nhật trạng thái tay ở đây.
export const CARRIER_OPTIONS = [
  { value: 'ghn', label: 'GHN (Giao Hàng Nhanh)' },
  { value: 'grab', label: 'Grab' },
  { value: 'ahamove', label: 'Ahamove' },
  { value: 'other', label: 'Khác' },
];

export const SHIPMENT_STATUS_OPTIONS = [
  { value: 'cho_lay_hang', label: 'Chờ lấy hàng', color: '#FB8C00' },
  { value: 'dang_giao', label: 'Đang giao', color: '#1E88E5' },
  { value: 'da_hoan_thanh', label: 'Đã hoàn thành', color: '#2e7d32' },
  { value: 'that_bai', label: 'Thất bại', color: '#E53935' },
];

export function shipmentStatusMeta(status) {
  return SHIPMENT_STATUS_OPTIONS.find((s) => s.value === status) || SHIPMENT_STATUS_OPTIONS[0];
}

export function carrierLabel(carrier, otherName) {
  if (carrier === 'other') return otherName || 'Khác';
  return CARRIER_OPTIONS.find((c) => c.value === carrier)?.label || carrier;
}

export async function fetchActiveShipmentForOrder(orderId) {
  const { data, error } = await supabase
    .from('third_party_shipments')
    .select('id,order_id,carrier,carrier_other_name,tracking_id,driver_name,driver_phone,manual_status,notes,handed_off_by_name,handed_off_at,updated_at')
    .eq('order_id', orderId)
    .eq('active', true)
    .order('handed_off_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

export async function handOffToCarrier(orderId, { carrier, carrierOtherName, trackingId, driverName, driverPhone, notes }) {
  const { data, error } = await supabase.rpc('sumi_chuyen_giao_don_vi_van_chuyen', {
    p_order_id: orderId,
    p_carrier: carrier,
    p_carrier_other_name: carrierOtherName ?? null,
    p_tracking_id: trackingId ?? null,
    p_driver_name: driverName ?? null,
    p_driver_phone: driverPhone ?? null,
    p_notes: notes ?? null,
  });
  if (error) throw error;
  if (data && data.success === false) throw new Error(data.error || 'Không chuyển giao được đơn vị vận chuyển.');
  return data;
}

export async function updateShipmentStatus(shipmentId, status, notes) {
  const { data, error } = await supabase.rpc('sumi_cap_nhat_trang_thai_van_chuyen', {
    p_shipment_id: shipmentId,
    p_status: status,
    p_notes: notes ?? null,
  });
  if (error) throw error;
  if (data && data.success === false) throw new Error(data.error || 'Không cập nhật được trạng thái vận chuyển.');
  return data;
}
