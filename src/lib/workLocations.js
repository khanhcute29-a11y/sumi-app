import { supabase } from './supabaseClient';

// 4+ điểm làm việc chuẩn dùng cho Geofencing chấm công — xem migration
// 202609030000/202609031000. Toạ độ RỖNG cho tới khi Giám đốc hiệu chuẩn
// (đứng tại chỗ bấm GPS, HOẶC dán lại toạ độ nhân sự gửi trực tiếp từ hiện
// trường qua Zalo/tin nhắn).
export async function fetchWorkLocations() {
  const { data, error } = await supabase
    .from('work_locations').select('*').eq('active', true).order('name');
  if (error) throw error;
  return data || [];
}

export async function setWorkLocationCoords(locationId, { lat, lng, radiusM, name }) {
  const { data, error } = await supabase.rpc('sumi_dat_toa_do_vi_tri', {
    p_location_id: locationId, p_lat: lat, p_lng: lng,
    p_radius_m: radiusM ?? null, p_name: name ?? null,
  });
  if (error) throw error;
  if (data && data.thanh_cong === false) throw new Error(data.thong_bao || 'Không lưu được toạ độ.');
  return data;
}

export async function addWorkLocation({ name, boPhan, lat, lng, radiusM }) {
  const { data, error } = await supabase.rpc('sumi_them_vi_tri_lam_viec', {
    p_name: name, p_bo_phan: boPhan, p_lat: lat ?? null, p_lng: lng ?? null, p_radius_m: radiusM ?? 20,
  });
  if (error) {
    if (/function .* does not exist|schema cache/i.test(error.message || '')) {
      throw new Error('Máy chủ chưa bật tính năng thêm địa điểm. Báo quản trị chạy bản cập nhật database.');
    }
    throw error;
  }
  if (data && data.thanh_cong === false) throw new Error(data.thong_bao || 'Không thêm được địa điểm.');
  return data;
}

export async function removeWorkLocation(locationId) {
  const { data, error } = await supabase.rpc('sumi_xoa_vi_tri_lam_viec', { p_location_id: locationId });
  if (error) throw error;
  if (data && data.thanh_cong === false) throw new Error(data.thong_bao || 'Không xoá được địa điểm.');
  return data;
}

// Dán 1 chuỗi toạ độ nhân sự gửi tại hiện trường — chấp nhận vài định dạng
// hay gặp: "10.912345,106.735432" hoặc có khoảng trắng, hoặc dán cả link
// Google Maps dạng ".../@10.912345,106.735432,17z" hoặc "?q=10.9,106.7".
export function parseTextToaDo(text) {
  if (!text) return null;
  const m = String(text).match(/(-?\d{1,3}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)/);
  if (!m) return null;
  const lat = Number(m[1]);
  const lng = Number(m[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}

export const BO_PHAN_OPTIONS = [
  { value: 'bakery', label: 'Bakery' },
  { value: 'xuong41', label: 'Xưởng 41' },
  { value: 'xuong42', label: 'Xưởng 42' },
  { value: 'van_tai', label: 'Vận tải' },
];
