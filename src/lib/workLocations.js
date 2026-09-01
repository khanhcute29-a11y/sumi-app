import { supabase } from './supabaseClient';

// 4 điểm làm việc chuẩn dùng cho Geofencing chấm công — xem migration
// 202609030000. Toạ độ RỖNG cho tới khi Giám đốc hiệu chuẩn (đứng tại chỗ,
// bấm "Lấy vị trí hiện tại" trong Thiết lập tài khoản).
export async function fetchWorkLocations() {
  const { data, error } = await supabase
    .from('work_locations').select('*').eq('active', true).order('name');
  if (error) throw error;
  return data || [];
}

export async function setWorkLocationCoords(locationId, { lat, lng, radiusM }) {
  const { data, error } = await supabase.rpc('sumi_dat_toa_do_vi_tri', {
    p_location_id: locationId, p_lat: lat, p_lng: lng, p_radius_m: radiusM ?? null,
  });
  if (error) throw error;
  if (data && data.thanh_cong === false) throw new Error(data.thong_bao || 'Không lưu được toạ độ.');
  return data;
}
