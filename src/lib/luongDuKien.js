import { supabase } from './supabaseClient';

// LƯƠNG DỰ KIẾN THÁNG — số liệu cộng dồn theo ngày, tính ON-THE-FLY dưới
// database (RPC sumi_luong_du_kien_thang, migration 202609041900). KHÔNG lưu
// thêm dòng nào: mỗi lần mở màn hình là đọc lại từ chấm công/tăng ca/sao
// thưởng-phạt/vi phạm/tạm ứng thật.
//
// ⚠️ Đây là số DỰ KIẾN, KHÁC với `payroll_entries` (số chính thức do Kế toán
// chốt từng kỳ). Hai thứ cố ý tách rời: nhân viên xem dự kiến hằng ngày,
// nhưng tiền thật vẫn do Kế toán/Giám đốc chốt sổ và khoá lại.

export async function fetchLuongDuKien(staffId, thang) {
  const { data, error } = await supabase.rpc('sumi_luong_du_kien_thang', {
    p_staff_id: staffId,
    p_thang: thang ? `${thang}-01` : null,
  });
  if (error) {
    if (/function .* does not exist|schema cache/i.test(error.message || '')) {
      throw new Error('Máy chủ chưa bật tính năng lương dự kiến. Báo quản trị chạy bản cập nhật database.');
    }
    throw error;
  }
  return data;
}

// Cấu hình lương cơ bản — chỉ Giám đốc/Kế toán đọc/ghi được (RLS chặn sẵn ở
// database, phía client chỉ ẩn/hiện cho gọn mắt).
export async function fetchSalaryConfigs() {
  const { data, error } = await supabase
    .from('staff_salary_config')
    .select('staff_id, luong_co_ban, ngay_cong_chuan, gio_chuan_moi_ngay');
  if (error) throw error;
  return data || [];
}

export async function saveSalaryConfig({ staffId, luongCoBan, updatedBy }) {
  const { error } = await supabase.from('staff_salary_config').upsert({
    staff_id: staffId,
    luong_co_ban: Number(luongCoBan) || 0,
    updated_by: updatedBy || null,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'staff_id' });
  if (error) throw error;
}
