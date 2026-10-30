// Logic thuần của bản xem trước "Bán tại quầy" (Giám đốc yêu cầu 30/10/2026:
// bán bánh có sẵn tại quầy, y KiotViet). KHÔNG gọi mạng, KHÔNG ghi database —
// để sau này chuyển sang bản thật chỉ cần thay chỗ lưu, giữ nguyên cách tính.

export const CHI_NHANH = ['Vĩnh Phú 42', 'Quốc Lộ 13'];

// Danh mục bán tại quầy — bỏ "Trường học" (đơn đặt, chỉ Giám đốc) như ProductsScreen.
export const DANH_MUC = [
  { value: 'banh_man_ngot', label: 'Mặn Ngọt' },
  { value: 'banh_kem', label: 'Bánh Kem' },
  { value: 'banh_kem_bap_choco', label: 'Kem Bắp/Choco' },
  { value: 'mousse_tiramisu', label: 'Mousse' },
  { value: 'set_mousse', label: 'Set Mousse' },
  { value: 'banh_su', label: 'Bánh Su' },
  { value: 'cupcake', label: 'Cupcake' },
  { value: 'macaron', label: 'Macaron' },
  { value: 'teabreak', label: 'Teabreak' },
  { value: 'banh_trung_thu', label: 'Trung Thu' },
  { value: 'trung_thu_combo', label: 'TT Combo' },
  { value: 'phu_kien_trung_thu', label: 'Phụ kiện' },
  { value: 'khac', label: 'Khác' },
];

export const vnd = (n) => `${Math.round(Number(n) || 0).toLocaleString('vi-VN')}đ`;

// Mỗi sản phẩm (hoặc từng size) thành 1 "mặt hàng bán" có mã riêng để quét.
// Chưa có cột mã vạch thật -> bản xem trước tự cấp mã SP0001… theo thứ tự.
export function taoMatHang(products) {
  const ds = [];
  let stt = 0;
  for (const p of products || []) {
    if (p.active === false || p.category === 'school') continue;
    const sizes = (p.product_variants || []).filter((v) => v && v.active !== false);
    const dong = sizes.length
      ? sizes.map((v) => ({ id: `${p.id}:${v.id}`, ten: p.name, size: v.label || v.size || '', gia: Number(v.price) || Number(p.price) || 0 }))
      : [{ id: String(p.id), ten: p.name, size: '', gia: Number(p.price) || 0 }];
    for (const d of dong) {
      stt += 1;
      ds.push({ ...d, ma: `SP${String(stt).padStart(4, '0')}`, danhMuc: p.category || 'khac', anh: p.photo_url || null, donVi: p.unit || 'cái' });
    }
  }
  return ds;
}

// Tồn kho giả để xem trước — cố định theo mã, khác nhau giữa 2 chi nhánh.
export function tonGia(ma, chiNhanh) {
  let h = 7;
  for (const c of `${ma}|${chiNhanh}`) h = (h * 31 + c.charCodeAt(0)) % 997;
  return h % 4 === 0 ? 0 : 3 + (h % 22);
}

// Tiền 1 dòng = SL × đơn giá − giảm dòng (VND hoặc %), không âm.
export function tienDong(d) {
  const goc = d.sl * d.gia;
  const giam = d.giamKieu === '%' ? goc * Math.min(Number(d.giam) || 0, 100) / 100 : Math.min(Number(d.giam) || 0, goc);
  return Math.max(goc - giam, 0);
}

// Tổng hoá đơn theo thứ tự KiotViet: tổng tiền hàng -> giảm giá hoá đơn -> khách cần trả.
export function tinhHoaDon(hd) {
  const tongHang = hd.dong.reduce((s, d) => s + tienDong(d), 0);
  const giamHd = hd.giamKieu === '%'
    ? tongHang * Math.min(Number(hd.giam) || 0, 100) / 100
    : Math.min(Number(hd.giam) || 0, tongHang);
  const canTra = Math.max(Math.round(tongHang - giamHd), 0);
  return { tongHang: Math.round(tongHang), giamHd: Math.round(giamHd), canTra, soMon: hd.dong.reduce((s, d) => s + d.sl, 0) };
}

// Thanh toán: khách đưa >= cần trả -> trả lại tiền thừa (chỉ tiền mặt);
// đưa thiếu -> phần thiếu ghi NỢ, và khách lẻ thì không được nợ.
export function tinhThanhToan({ canTra, khachDua, phuongThuc, laKhachLe }) {
  const dua = Math.max(Number(khachDua) || 0, 0);
  const thua = phuongThuc === 'tien_mat' ? Math.max(dua - canTra, 0) : 0;
  const thucThu = Math.min(dua, canTra);
  const no = Math.max(canTra - dua, 0);
  const loi = no > 0 && laKhachLe ? 'Khách lẻ không được ghi nợ — chọn khách quen hoặc thu đủ tiền.' : '';
  return { thucThu, thua, no, loi };
}

// Kết ca (KiotViet): hệ thống = đầu ca + thu tiền mặt trong ca; chênh = đếm thực tế − hệ thống.
export function tinhKetCa({ dauCa, hoaDons }) {
  const hopLe = hoaDons.filter((h) => !h.daHuy);
  const tienMat = hopLe.filter((h) => h.phuongThuc === 'tien_mat').reduce((s, h) => s + h.thucThu, 0);
  const chuyenKhoan = hopLe.filter((h) => h.phuongThuc !== 'tien_mat').reduce((s, h) => s + h.thucThu, 0);
  const ghiNo = hopLe.reduce((s, h) => s + h.no, 0);
  const doanhThu = hopLe.reduce((s, h) => s + h.canTra, 0);
  return { soHoaDon: hopLe.length, doanhThu, tienMat, chuyenKhoan, ghiNo, heThong: (Number(dauCa) || 0) + tienMat };
}

// Áp 1 phiếu kho (vòng đời KiotViet) vào tồn: nhập +, huỷ −, kiểm = đặt bằng số thực tế.
// Trả về { tonMoi, lech } — lech chỉ có với kiểm kho (thực tế − hệ thống).
export function apPhieuKho(ton, phieu, chieu = 1) {
  const tonMoi = { ...ton };
  const lech = {};
  for (const d of phieu.dong) {
    const hien = tonMoi[d.ma] ?? 0;
    if (phieu.loai === 'nhap') tonMoi[d.ma] = hien + chieu * d.sl;
    else if (phieu.loai === 'huy') tonMoi[d.ma] = hien - chieu * d.sl;
    else if (phieu.loai === 'kiem') {
      if (chieu === 1) { lech[d.ma] = d.sl - hien; tonMoi[d.ma] = d.sl; }
      else tonMoi[d.ma] = hien - (phieu.lech?.[d.ma] ?? 0); // huỷ phiếu kiểm: khôi phục tồn trước kiểm
    }
  }
  return { tonMoi, lech };
}
