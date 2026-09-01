import { supabase } from './supabaseClient';
import { fetchShiftLogs } from './queries';
import { chuanHoaCa, gomChamCongNgay, boPhanCuaHoSo } from './chamCong';
import { localDateStr } from './date';

// Dữ liệu "Chấm công hôm nay" gom theo bộ phận — dùng lại ĐÚNG thuật toán của
// màn Chấm Công cá nhân (ShiftsScreen.jsx + chamCong.js), không viết lại công
// thức chấm công một lần nữa. Tách thành hàm riêng để Dashboard Giám đốc gọi
// được mà KHÔNG đụng vào ShiftsScreen.jsx đang chạy ổn định (không refactor
// màn hình chấm công cá nhân chỉ để phục vụ Dashboard).
export async function fetchChamCongHomNayGomBoPhan() {
  const homNay = localDateStr();
  const [logs, caRes, hoSoRes] = await Promise.all([
    fetchShiftLogs({ date: homNay }).catch(() => []),
    supabase.from('sumi_quy_dinh_ca').select('*').eq('active', true),
    supabase.from('profiles').select('id,full_name,role,station,phone')
      .eq('approved', true).neq('active', false).order('full_name'),
  ]);

  const danhSachCa = chuanHoaCa(caRes.data || []);
  const hoSoList = hoSoRes.data || [];

  const boPhanTheoNguoi = {};
  hoSoList.forEach((h) => { boPhanTheoNguoi[h.id] = boPhanCuaHoSo(h); });

  const chamNgay = gomChamCongNgay(logs, danhSachCa, boPhanTheoNguoi);
  const rong = (id, ten) => ({
    staffId: id, ten, vaoISO: null, raISO: null, vao: null, ra: null,
    ca: null, coCaChuan: false, chenhLech: null, trangThai: 'upcoming',
    ghiChu: '', xinNghi: false, soGio: null, boPhan: boPhanTheoNguoi[id] || null,
  });

  const danhSachQuanLy = hoSoList.map((h) => ({
    hoSo: h,
    cham: chamNgay.get(h.id) || rong(h.id, h.full_name),
  }));

  return { danhSachQuanLy, danhSachCa, gioHienTai: new Date(), logs };
}
