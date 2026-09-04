import { supabase } from './supabaseClient';

// KHO MACARON XƯỞNG 41 — xem migration 202609042000.
//
// ĐƠN VỊ: database lưu theo CẶP (số nguyên, không sai số). Giao diện quy đổi
// ra "khay + cặp lẻ" theo chốt của chủ tiệm: 1 KHAY = 36 CẶP = 72 bánh đơn.
// Lý do không lưu thẳng theo khay: mỗi lần trộn chỉ lấy 3–6 cặp mỗi màu
// (3/36 khay), lưu theo khay sẽ ra số thập phân vô hạn và trôi số dần.
export const CAP_MOI_KHAY = 36;
export const BANH_DON_MOI_CAP = 2;

/** 87 cặp -> { khay: 2, capLe: 15 } */
export function tachKhay(soCap) {
  const n = Math.max(0, Number(soCap) || 0);
  return { khay: Math.floor(n / CAP_MOI_KHAY), capLe: n % CAP_MOI_KHAY };
}

/** 87 cặp -> "2 khay 15 cặp" (dạng chữ cho người đọc, luôn kèm tổng cặp). */
export function chuKhay(soCap) {
  const { khay, capLe } = tachKhay(soCap);
  if (!khay && !capLe) return '0 cặp';
  if (!khay) return `${capLe} cặp`;
  if (!capLe) return `${khay} khay`;
  return `${khay} khay ${capLe} cặp`;
}

export async function fetchDanhMucMacaron() {
  const { data, error } = await supabase
    .from('macaron_catalog').select('*').eq('active', true).order('thu_tu');
  if (error) throw error;
  return data || [];
}

/** Danh mục + tồn hiện tại, gộp sẵn để giao diện chỉ việc vẽ. */
export async function fetchTonMacaron() {
  const [dmRes, tonRes] = await Promise.all([
    supabase.from('macaron_catalog').select('*').eq('active', true).order('thu_tu'),
    supabase.from('macaron_stock').select('*'),
  ]);
  if (dmRes.error) throw dmRes.error;
  if (tonRes.error) throw tonRes.error;
  const tonTheoMa = {};
  (tonRes.data || []).forEach((t) => { tonTheoMa[t.ma] = Number(t.so_cap) || 0; });
  return (dmRes.data || []).map((d) => ({
    ...d, soCap: tonTheoMa[d.ma] || 0, ...tachKhay(tonTheoMa[d.ma] || 0),
  }));
}

export async function fetchSoGiaoDichMacaron({ ma, limit = 50 } = {}) {
  let q = supabase.from('macaron_stock_log').select('*')
    .order('created_at', { ascending: false }).limit(limit);
  if (ma) q = q.eq('ma', ma);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

export async function fetchMeTronMacaron(limit = 30) {
  const { data, error } = await supabase.from('macaron_mix_batches')
    .select('*').order('created_at', { ascending: false }).limit(limit);
  if (error) throw error;
  return data || [];
}

function nemLoi(data, error, macDinh) {
  if (error) {
    if (/function .* does not exist|schema cache|relation .* does not exist/i.test(error.message || '')) {
      throw new Error('Máy chủ chưa bật Kho Macaron. Báo quản trị chạy bản cập nhật database.');
    }
    throw error;
  }
  if (data && data.thanh_cong === false) throw new Error(data.thong_bao || macDinh);
  return data;
}

export async function nhapMacaron({ ma, soCap, ghiChu, ngaySx, hanSuDung }) {
  const { data, error } = await supabase.rpc('sumi_macaron_nhap', {
    p_ma: ma, p_so_cap: soCap, p_ghi_chu: ghiChu || null,
    p_ngay_sx: ngaySx || null, p_han_su_dung: hanSuDung || null,
  });
  return nemLoi(data, error, 'Không nhập kho được.');
}

/** Sửa 1 dòng "Nhập kho" đã ghi sai (số cặp/Ngày SX/HSD) — chỉ Quản lý Xưởng
 * 41/Giám đốc (chặn ở RPC la_quan_ly_cua_khau). Tồn kho hiện hành tự cộng/
 * trừ đúng phần chênh lệch, xem migration 202609043000. */
export async function suaLoNhapMacaron({ logId, soCapMoi, ngaySx, hanSuDung, ghiChu }) {
  const { data, error } = await supabase.rpc('sumi_macaron_sua_lo_nhap', {
    p_log_id: logId, p_so_cap_moi: soCapMoi,
    p_ngay_sx: ngaySx || null, p_han_su_dung: hanSuDung || null, p_ghi_chu: ghiChu || null,
  });
  return nemLoi(data, error, 'Không sửa được dòng nhập kho.');
}

export async function xuatMacaron({ ma, soCap, orderCode, ghiChu, ngaySx, hanSuDung }) {
  const { data, error } = await supabase.rpc('sumi_macaron_xuat', {
    p_ma: ma, p_so_cap: soCap, p_order_code: orderCode || null, p_ghi_chu: ghiChu || null,
    p_ngay_sx: ngaySx || null, p_han_su_dung: hanSuDung || null,
  });
  return nemLoi(data, error, 'Không xuất kho được.');
}

/**
 * Danh sách các lô ĐÃ NHẬP còn ghi Ngày SX/HSD cho 1 màu — để màn Xuất kho
 * hiện ra cho thủ kho CHỌN thay vì phải tự nhớ/gõ lại ngày (yêu cầu cô Kim
 * Cúc 04/09/2026). Sắp Ngày SX cũ nhất lên đầu (FEFO — hết hạn trước xuất
 * trước). LƯU Ý: đây chỉ là danh sách THAM KHẢO các lô từng nhập — không
 * phải số dư còn lại theo từng lô (macaron_stock chỉ có 1 số tồn gộp theo
 * màu, xem migration 202609042000), nên có thể còn hiện cả lô đã xuất hết.
 */
export async function fetchLoNhapMacaron({ ma }) {
  const { data, error } = await supabase.from('macaron_stock_log')
    .select('ngay_sx, han_su_dung')
    .eq('ma', ma).eq('loai_gd', 'nhap').not('ngay_sx', 'is', null)
    .order('ngay_sx', { ascending: true });
  if (error) throw error;
  const thay = new Set();
  const ketQua = [];
  for (const r of data || []) {
    const khoa = `${r.ngay_sx}|${r.han_su_dung || ''}`;
    if (thay.has(khoa)) continue;
    thay.add(khoa);
    ketQua.push({ ngaySx: r.ngay_sx, hanSuDung: r.han_su_dung || null });
  }
  return ketQua;
}

/**
 * chiTiet: [{ ma: 'cam', cap: 3, hao_hut: 1 }, ...]
 * kieu: 'ton_kho' (trộn trước để sẵn) | 'theo_don' (trộn xong giao thẳng)
 * Trừ kho theo đúng công thức: tồn mới = tồn cũ − số cặp dùng − hao hụt.
 */
export async function tronMacaron({ maMix, soKhay, kieu, chiTiet, orderCode, ghiChu }) {
  const { data, error } = await supabase.rpc('sumi_macaron_mix', {
    p_ma_mix: maMix, p_so_khay: soKhay, p_kieu: kieu, p_chi_tiet: chiTiet,
    p_order_code: orderCode || null, p_ghi_chu: ghiChu || null,
  });
  return nemLoi(data, error, 'Không trộn được.');
}

/** Ghi đè tồn bằng số đếm thực tế — chỉ Quản lý Xưởng 41/Giám đốc (chặn ở DB). */
export async function kiemKeMacaron({ ma, soCapThucTe, ghiChu }) {
  const { data, error } = await supabase.rpc('sumi_macaron_kiem_ke', {
    p_ma: ma, p_so_cap_thuc_te: soCapThucTe, p_ghi_chu: ghiChu || null,
  });
  return nemLoi(data, error, 'Không điều chỉnh được.');
}

// Gợi ý chia đều số cặp mỗi màu cho 1 khay mix — CHỈ là gợi ý, thủ kho sửa
// được từng màu trước khi chốt (36 không chia hết cho 10 màu: 3,6 cặp/màu,
// nên không ép công thức cứng — theo chốt của chủ tiệm 04/09/2026).
export function goiYChiaDeu(soMau, soKhay = 1) {
  const tongCap = CAP_MOI_KHAY * (Number(soKhay) || 1);
  const n = Number(soMau) || 1;
  const deu = Math.floor(tongCap / n);
  const du = tongCap - deu * n;
  // `du` màu đầu tiên nhận thêm 1 cặp để tổng khớp đúng tổng cặp của khay.
  return Array.from({ length: n }, (_, i) => deu + (i < du ? 1 : 0));
}
