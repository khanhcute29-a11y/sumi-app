import { supabase } from './supabaseClient';

// KHO VẬT TƯ XƯỞNG 41 — xem migration 202609141000.
//
// Khác Kho Macaron (khoMacaron.js): mỗi mã có 1 đơn vị tính CỐ ĐỊNH riêng
// (Khay/Thùng/Hộp), không quy đổi qua lại, không theo lô/ngày SX/hạn dùng —
// chỉ là số tồn đơn giản theo mã.

export async function fetchTonVatTu() {
  const [dmRes, tonRes] = await Promise.all([
    supabase.from('vat_tu_catalog').select('*').eq('active', true).order('thu_tu'),
    supabase.from('vat_tu_stock').select('*'),
  ]);
  if (dmRes.error) throw dmRes.error;
  if (tonRes.error) throw tonRes.error;
  const tonTheoMa = {};
  (tonRes.data || []).forEach((t) => { tonTheoMa[t.ma] = Number(t.so_luong) || 0; });
  return (dmRes.data || []).map((d) => ({ ...d, soLuong: tonTheoMa[d.ma] || 0 }));
}

export async function fetchSoGiaoDichVatTu({ ma, limit = 50 } = {}) {
  let q = supabase.from('vat_tu_stock_log').select('*')
    .order('created_at', { ascending: false }).limit(limit);
  if (ma) q = q.eq('ma', ma);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

function nemLoi(data, error, macDinh) {
  if (error) {
    if (/function .* does not exist|schema cache|relation .* does not exist/i.test(error.message || '')) {
      throw new Error('Máy chủ chưa bật Kho Vật Tư. Báo quản trị chạy bản cập nhật database.');
    }
    throw error;
  }
  if (data && data.thanh_cong === false) throw new Error(data.thong_bao || macDinh);
  return data;
}

export async function nhapVatTu({ ma, soLuong, ghiChu }) {
  const { data, error } = await supabase.rpc('sumi_vat_tu_nhap', {
    p_ma: ma, p_so_luong: soLuong, p_ghi_chu: ghiChu || null,
  });
  return nemLoi(data, error, 'Không nhập kho được.');
}

export async function xuatVatTu({ ma, soLuong, ghiChu }) {
  const { data, error } = await supabase.rpc('sumi_vat_tu_xuat', {
    p_ma: ma, p_so_luong: soLuong, p_ghi_chu: ghiChu || null,
  });
  return nemLoi(data, error, 'Không xuất kho được.');
}
