// Logic thuần của bản xem trước "Bán tại quầy" (Giám đốc yêu cầu 30/10/2026,
// thiết kế giai đoạn 1 sau khi khảo sát KiotViet thật của tiệm). KHÔNG gọi
// mạng, KHÔNG ghi database — bản thật chỉ thay chỗ lưu, giữ nguyên cách tính.

// Chi nhánh thật — thay cho cách KiotViet đang giả chi nhánh bằng nhóm hàng 13/41/42.
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

// Phụ phí trên hoá đơn — KiotViet của tiệm đang tạo thành "món hàng" (SHIP18K, PHỤ THU 20K, VAT 8%).
export const THU_KHAC_GOI_Y = [
  { ten: 'Phí ship', tien: 18000 },
  { ten: 'Phụ thu', tien: 20000 },
  { ten: 'Nến số', tien: 10000 },
];
export const THUE_VAT = 0.08;

// Loại phiếu kho (vòng đời KiotViet: tạm -> hoàn thành -> huỷ).
export const LOAI_PHIEU = {
  giao: { ten: 'Bếp giao ra quầy', tienTo: 'GQ', dau: 1 },
  huy: { ten: 'Xuất huỷ', tienTo: 'XH', dau: -1 },
  noibo: { ten: 'Xuất dùng nội bộ', tienTo: 'XD', dau: -1 },
  kiem: { ten: 'Kiểm kho', tienTo: 'KK', dau: 0 },
};
export const LY_DO_HUY = ['Hết hạn cuối ngày', 'Hỏng / móp', 'Rơi vỡ', 'Khác'];
export const LOAI_NOI_BO = ['Làm bánh đặt', 'Biếu tặng', 'Nhân viên dùng', 'Khác'];

export const vnd = (n) => `${Math.round(Number(n) || 0).toLocaleString('vi-VN')}đ`;

// Mỗi sản phẩm (hoặc từng size) thành 1 "mặt hàng bán" có mã riêng để quét.
// Chưa có cột mã vạch / giá vốn thật -> bản xem trước tự cấp mã SP0001… và
// giá vốn MẪU = 35% giá bán (bản thật: Giám đốc nhập bảng giá vốn).
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
      ds.push({ ...d, ma: `SP${String(stt).padStart(4, '0')}`, giaVon: Math.round((d.gia * 0.35) / 500) * 500, danhMuc: p.category || 'khac', anh: p.photo_url || null });
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

// Hoá đơn: tổng tiền hàng -> giảm giá HĐ -> + thu khác -> + VAT 8% (tính trên tiền hàng sau giảm) -> khách cần trả.
export function tinhHoaDon(hd) {
  const tongHang = hd.dong.reduce((s, d) => s + tienDong(d), 0);
  const giamHd = hd.giamKieu === '%'
    ? tongHang * Math.min(Number(hd.giam) || 0, 100) / 100
    : Math.min(Number(hd.giam) || 0, tongHang);
  const sauGiam = Math.max(Math.round(tongHang - giamHd), 0);
  const thuKhac = (hd.thuKhac || []).reduce((s, t) => s + Math.max(Number(t.tien) || 0, 0), 0);
  const vat = hd.vat ? Math.round(sauGiam * THUE_VAT) : 0;
  const giaVon = hd.dong.reduce((s, d) => s + d.sl * (Number(d.giaVon) || 0), 0);
  return {
    tongHang: Math.round(tongHang), giamHd: Math.round(giamHd), sauGiam, thuKhac, vat,
    canTra: sauGiam + thuKhac + vat, giaVon, soMon: hd.dong.reduce((s, d) => s + d.sl, 0),
  };
}

// Thanh toán: khách đưa >= cần trả -> tiền thừa (chỉ tiền mặt); đưa thiếu -> NỢ,
// và chỉ khách có tên + SĐT mới được nợ.
export function tinhThanhToan({ canTra, khachDua, phuongThuc, laKhachLe }) {
  const dua = Math.max(Number(khachDua) || 0, 0);
  const thua = phuongThuc === 'tien_mat' ? Math.max(dua - canTra, 0) : 0;
  const thucThu = Math.min(dua, canTra);
  const no = Math.max(canTra - dua, 0);
  const loi = no > 0 && laKhachLe ? 'Khách lẻ không được ghi nợ — chọn khách có tên + SĐT hoặc thu đủ tiền.' : '';
  return { thucThu, thua, no, loi };
}

// Kết ca: TM phải có = đầu ca + thu TM (bán + thu nợ); CK/thẻ chỉ để đối chiếu sao kê.
export function tinhKetCa({ dauCa, hoaDons, thuNos = [] }) {
  const hopLe = hoaDons.filter((h) => !h.daHuy);
  const theo = (pt) => hopLe.filter((h) => h.phuongThuc === pt).reduce((s, h) => s + h.thucThu, 0)
    + thuNos.filter((t) => t.phuongThuc === pt).reduce((s, t) => s + t.tien, 0);
  const tienMat = theo('tien_mat');
  return {
    soHoaDon: hopLe.length,
    doanhThu: hopLe.reduce((s, h) => s + h.canTra, 0),
    tienMat, chuyenKhoan: theo('chuyen_khoan'), the: theo('the'),
    ghiNo: hopLe.reduce((s, h) => s + h.no, 0),
    thuNo: thuNos.reduce((s, t) => s + t.tien, 0),
    heThong: (Number(dauCa) || 0) + tienMat,
  };
}

// Áp 1 phiếu kho vào tồn. chieu=1 hoàn thành, -1 huỷ phiếu.
// Trả { tonMoi, lech, the } — `the` là các dòng thẻ kho (SL ±, tồn cuối).
export function apPhieuKho(ton, phieu, chieu = 1) {
  const tonMoi = { ...ton };
  const lech = {};
  const the = [];
  const dau = LOAI_PHIEU[phieu.loai]?.dau ?? 0;
  for (const d of phieu.dong) {
    const hien = tonMoi[d.ma] ?? 0;
    let delta;
    if (phieu.loai === 'kiem') {
      delta = chieu === 1 ? d.sl - hien : -(phieu.lech?.[d.ma] ?? 0); // huỷ phiếu kiểm: khôi phục tồn trước kiểm
      if (chieu === 1) lech[d.ma] = delta;
    } else {
      delta = chieu * dau * d.sl;
    }
    tonMoi[d.ma] = hien + delta;
    if (delta !== 0) the.push({ ma: d.ma, sl: delta, tonCuoi: tonMoi[d.ma] });
  }
  return { tonMoi, lech, the };
}

// Công nợ theo khách: trả nợ phân bổ vào hoá đơn cũ nhất trước (FIFO), tuổi nợ =
// số ngày từ hoá đơn còn nợ cũ nhất tới hôm nay.
export function tinhCongNo(hoaDons, thuNos, now = Date.now()) {
  const theoKhach = new Map();
  for (const h of hoaDons) {
    if (h.daHuy || !(h.no > 0) || !h.khach?.id) continue;
    const k = theoKhach.get(h.khach.id) || { khach: h.khach, hds: [], daTra: 0 };
    k.hds.push({ ma: h.ma, luc: h.luc, no: h.no });
    theoKhach.set(h.khach.id, k);
  }
  for (const t of thuNos) { const k = theoKhach.get(t.khachId); if (k) k.daTra += t.tien; }
  const ds = [];
  for (const k of theoKhach.values()) {
    const hds = [...k.hds].sort((a, b) => a.luc - b.luc);
    let conTra = k.daTra;
    const conNo = [];
    for (const h of hds) {
      const tru = Math.min(conTra, h.no);
      conTra -= tru;
      if (h.no - tru > 0) conNo.push({ ...h, con: h.no - tru });
    }
    const tong = conNo.reduce((s, h) => s + h.con, 0);
    if (tong <= 0) continue;
    const tuoi = Math.floor((now - conNo[0].luc) / 86400000);
    ds.push({ khach: k.khach, tong, tuoiNo: tuoi, hdCuNhat: conNo[0].ma, soHd: conNo.length });
  }
  return ds.sort((a, b) => b.tuoiNo - a.tuoiNo || b.tong - a.tong);
}

// Báo cáo cuối ngày 1 chi nhánh: tiền + hàng + lãi gộp.
export function baoCaoNgay({ hoaDons, phieuKho, thuNos = [], matHang }) {
  const hd = hoaDons.filter((h) => !h.daHuy);
  const giaVonCua = (ma) => matHang.find((m) => m.ma === ma)?.giaVon || 0;
  const tongPhieu = (loai) => phieuKho.filter((p) => p.loai === loai && p.trangThai === 'xong')
    .reduce((s, p) => ({ sl: s.sl + p.dong.reduce((a, d) => a + d.sl, 0), giaTri: s.giaTri + p.dong.reduce((a, d) => a + d.sl * giaVonCua(d.ma), 0) }), { sl: 0, giaTri: 0 });
  const doanhThuThuan = hd.reduce((s, h) => s + h.sauGiam, 0);
  const giaVon = hd.reduce((s, h) => s + h.giaVon, 0);
  const ketCa = tinhKetCa({ dauCa: 0, hoaDons: hoaDons, thuNos });
  return {
    soHoaDon: hd.length, soHuy: hoaDons.length - hd.length,
    tongHang: hd.reduce((s, h) => s + h.tongHang, 0), giamGia: hd.reduce((s, h) => s + h.giamHd, 0),
    thuKhac: hd.reduce((s, h) => s + h.thuKhac, 0), vat: hd.reduce((s, h) => s + h.vat, 0),
    doanhThuThuan, giaVon, laiGop: doanhThuThuan - giaVon,
    tienMat: ketCa.tienMat, chuyenKhoan: ketCa.chuyenKhoan, the: ketCa.the, ghiNo: ketCa.ghiNo, thuNo: ketCa.thuNo,
    giao: tongPhieu('giao'), huy: tongPhieu('huy'), noibo: tongPhieu('noibo'),
  };
}
