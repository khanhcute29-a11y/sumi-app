import { supabase } from './supabaseClient';

// Giờ làm RIÊNG cho 1 nhân sự vào 1 ngày cụ thể — khác với giờ mặc định của
// cả bộ phận trong `sumi_quy_dinh_ca`. Ghi qua RPC (không insert thẳng), vì
// đây là cổng DUY NHẤT database cho phép, giống nguyên tắc "quyền do DATABASE
// quyết" đã áp dụng cho sumi_tang_sao_ca/sumi_dieu_chinh_sao.
export async function fetchUpcomingShiftOverrides(staffId) {
  const homNay = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from('staff_shift_overrides')
    .select('*')
    .eq('staff_id', staffId)
    .gte('work_date', homNay)
    .order('work_date', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function setStaffShiftOverride({ staffId, workDate, gioBatDau, gioKetThuc, lyDo }) {
  const { data, error } = await supabase.rpc('sumi_dat_gio_lam_rieng', {
    p_staff_id: staffId, p_ngay: workDate, p_gio_bat_dau: gioBatDau,
    p_gio_ket_thuc: gioKetThuc || null, p_ly_do: lyDo || null,
  });
  if (error) {
    if (/function .* does not exist|schema cache/i.test(error.message || '')) {
      throw new Error('Máy chủ chưa bật tính năng giờ làm riêng. Báo quản trị chạy bản cập nhật database.');
    }
    throw error;
  }
  if (data && data.thanh_cong === false) throw new Error(data.thong_bao || 'Không đặt được giờ làm riêng.');
  return data;
}

export async function cancelStaffShiftOverride({ staffId, workDate }) {
  const { data, error } = await supabase.rpc('sumi_xoa_gio_lam_rieng', {
    p_staff_id: staffId, p_ngay: workDate,
  });
  if (error) throw error;
  if (data && data.thanh_cong === false) throw new Error(data.thong_bao || 'Không huỷ được giờ làm riêng.');
  return data;
}
