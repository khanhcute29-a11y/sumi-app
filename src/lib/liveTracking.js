import { supabase } from './supabaseClient';
import { getCurrentPositionSmart } from './geo';
import { localDateStr } from './date';
import { boPhanCuaHoSo } from './chamCong';

const KHOANG_CACH_PING_MS = 5 * 60 * 1000; // 5 phút/lần — đủ dày để Giám đốc
// đối chiếu, đủ thưa để không hao pin/dữ liệu di động của nhân viên.

// Đang trong ca hôm nay? — đã có ít nhất 1 lần "checkin" và CHƯA "checkout"
// sau lần đó. Dùng đúng logic activeCheckins đã có ở ShiftsScreen.jsx
// (không viết công thức khác), chỉ đọc trực tiếp thay vì qua state React.
async function dangTrongCa(staffId) {
  const homNay = localDateStr();
  const { data, error } = await supabase
    .from('shift_logs').select('type,created_at')
    .eq('staff_id', staffId).eq('work_date', homNay)
    .in('type', ['checkin', 'checkout'])
    .order('created_at', { ascending: true });
  if (error || !data) return false;
  const soVao = data.filter((l) => l.type === 'checkin').length;
  const soRa = data.filter((l) => l.type === 'checkout').length;
  return soVao > soRa;
}

async function guiPing(staffId) {
  try {
    if (!(await dangTrongCa(staffId))) return;
    const vt = await getCurrentPositionSmart();
    if (!vt) return;
    await supabase.from('staff_location_pings').insert({
      staff_id: staffId, lat: vt.lat, lng: vt.lng, accuracy_m: vt.accuracy,
    });
  } catch {
    // Ping lỗi (mất mạng, quyền định vị bị thu hồi giữa ca...) — im lặng bỏ
    // qua, KHÔNG được làm gián đoạn công việc của nhân viên vì tính năng
    // theo dõi nền này.
  }
}

// Chỉ bật cho nhân sự theo ca cố định (boPhanCuaHoSo trả về khác null) —
// Giám đốc/Kế toán/Bán hàng... không thuộc phạm vi geofencing thì cũng không
// cần theo dõi vị trí ca làm.
export function startLiveTracking(profile) {
  if (!profile?.id || !boPhanCuaHoSo(profile)) return () => {};
  guiPing(profile.id); // gửi ngay 1 lần khi mở app, không đợi đủ 5 phút
  const timer = setInterval(() => guiPing(profile.id), KHOANG_CACH_PING_MS);
  return () => clearInterval(timer);
}

// ── Phía Giám đốc: xem lại vị trí gần nhất của 1 nhân sự trong ca hôm nay ──
export async function fetchLatestPing(staffId) {
  const { data, error } = await supabase
    .from('staff_location_pings').select('*')
    .eq('staff_id', staffId).order('recorded_at', { ascending: false }).limit(1).maybeSingle();
  if (error) return null;
  return data || null;
}

export function googleMapsLink(lat, lng) {
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
}
