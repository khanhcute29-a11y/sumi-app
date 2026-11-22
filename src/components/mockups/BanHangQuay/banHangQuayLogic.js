// Logic thuần của bản xem trước "Bán tại quầy" (Giám đốc yêu cầu 30/10/2026,
// thiết kế giai đoạn 1 sau khi khảo sát KiotViet thật của tiệm). KHÔNG gọi
// mạng, KHÔNG ghi database — bản thật chỉ thay chỗ lưu, giữ nguyên cách tính.

// Chi nhánh thật — 3 quầy như KiotViet của tiệm (nhóm hàng 42 / 13 / 41).
export const CHI_NHANH = ['Vĩnh Phú 42', 'Quốc Lộ 13', 'Vĩnh Phú 41'];

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
// Nhóm hàng có trong danh sách: danh mục app + Nhóm hàng KiotViet (vd "42Bánh mì"), giữ đúng tên như KiotViet.
export function nhomCo(matHang) {
  const coDm = DANH_MUC.filter((d) => matHang.some((m) => m.danhMuc === d.value));
  const kv = [...new Set(matHang.map((m) => m.danhMuc).filter((v) => v && !DANH_MUC.some((d) => d.value === v)))]
    .sort((a, b) => a.localeCompare(b, 'vi')).map((v) => ({ value: v, label: v }));
  return [...coDm, ...kv];
}
export const tenNhomHang = (v) => DANH_MUC.find((d) => d.value === v)?.label || v || 'Khác';

// Phụ phí trên hoá đơn — KiotViet của tiệm đang tạo thành "món hàng" (SHIP18K, PHỤ THU 20K, VAT 8%).
export const THU_KHAC_GOI_Y = [
  { ten: 'Phí ship', tien: 18000 },
  { ten: 'Phụ thu', tien: 20000 },
  { ten: 'Nến số', tien: 10000 },
];
export const THUE_VAT = 0.08;

// Loại phiếu kho (vòng đời KiotViet: tạm -> hoàn thành -> huỷ).
// Tên + tiền tố mã phiếu theo đúng KiotViet tiệm đang dùng (PN / XH / XD / KK).
// "Nhập hàng" = bếp giao bánh ra quầy (KiotViet tiệm đang ghi phiếu nhập không nhà cung cấp).
export const LOAI_PHIEU = {
  giao: { ten: 'Nhập hàng', tienTo: 'PN', dau: 1 },
  huy: { ten: 'Xuất hủy', tienTo: 'XH', dau: -1 },
  noibo: { ten: 'Xuất dùng nội bộ', tienTo: 'XD', dau: -1 },
  kiem: { ten: 'Kiểm kho', tienTo: 'KK', dau: 0 },
  // Chuyển hàng giữa 2 cửa hàng: trừ chi nhánh gửi; chi nhánh nhận được cộng cùng lúc (phieu.denCN).
  chuyen: { ten: 'Chuyển hàng', tienTo: 'CH', dau: -1 },
};
export const LY_DO_HUY = ['Hết date', 'Hỏng / móp', 'Rơi vỡ', 'Khác'];
export const LY_DO_HUY_HD = ['Bấm nhầm món', 'Sai số lượng', 'Khách đổi ý', 'Khác'];
// Loại xuất nội bộ: đúng danh sách tiệm đã tạo trên KiotViet (05/11/2026).
export const LUAN_CHUYEN = 'Luân chuyển bánh giữa các cửa hàng';
export const LOAI_NOI_BO = [
  LUAN_CHUYEN, 'Làm bánh kem', 'Xuất HD', 'Xuất quà tặng khách hàng, đối tác', 'Xuất mẫu trưng bày, demo sản phẩm',
  'Xuất bồi thường, đền bù', 'Xuất phục vụ sự kiện, hội nghị nội bộ', 'Xuất vật tư tiêu hao, công cụ dụng cụ',
  'Xuất văn phòng phẩm, dụng cụ làm việc', 'Khác',
];

export const vnd = (n) => `${Math.round(Number(n) || 0).toLocaleString('vi-VN')}đ`;

// Mỗi sản phẩm (hoặc từng size) thành 1 "mặt hàng bán" có mã riêng để quét.
// Chưa có cột mã vạch / giá vốn thật -> bản xem trước tự cấp mã SP0001… và
// giá vốn MẪU = 35% giá bán (bản thật: Giám đốc nhập bảng giá vốn).
export function taoMatHang(products) {
  const ds = [];
  let stt = 0;
  for (const p of products || []) {
    // pos_an = đã xoá khỏi quầy (vẫn còn trong app chính / hoá đơn cũ).
    if (p.active === false || p.pos_an || p.category === 'school') continue;
    const sizes = (p.product_variants || []).filter((v) => v && v.active !== false);
    const dong = sizes.length
      ? sizes.map((v) => ({ id: `${p.id}:${v.id}`, ten: p.name, size: v.label || v.size || '', gia: Number(v.price) || Number(p.price) || 0 }))
      : [{ id: String(p.id), ten: p.name, size: '', gia: Number(p.price) || 0 }];
    for (const d of dong) {
      stt += 1;
      // Hàng nhập từ KiotViet giữ nguyên Mã hàng + Nhóm hàng; hàng của app tự đánh mã SP0001…
      const ma = p.pos_code && dong.length === 1 ? p.pos_code : `SP${String(stt).padStart(4, '0')}`;
      ds.push({ ...d, ma, giaVon: Math.round((d.gia * 0.35) / 500) * 500, danhMuc: p.pos_group || p.category || 'khac', anh: p.photo_url || null,
        maVach: p.pos_barcode || '', dichVu: !!p.pos_dich_vu, pid: p.id, posCode: p.pos_code || null });
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
  // Như KiotViet: giảm giá dòng tính TRÊN MỖI ĐƠN VỊ (Đơn giá − giảm = Giá bán; thành tiền = Giá bán × SL).
  const giam = d.giamKieu === '%' ? goc * Math.min(Number(d.giam) || 0, 100) / 100 : Math.min(Number(d.giam) || 0, d.gia) * d.sl;
  return Math.max(goc - giam, 0);
}

// Hoá đơn: tổng tiền hàng -> giảm giá HĐ -> + thu khác -> + VAT 8% (tính trên tiền hàng sau giảm) -> khách cần trả.
export function tinhHoaDon(hd) {
  const tongHang = hd.dong.reduce((s, d) => s + tienDong(d), 0);
  const giamHd = hd.giamKieu === '%'
    ? tongHang * Math.min(Number(hd.giam) || 0, 100) / 100
    : Math.min(Number(hd.giam) || 0, tongHang);
  // Khuyến mại (giảm hoá đơn / giảm giá hàng) trừ sau giảm tay, trước VAT — như pos_ban.
  const kmTien = Math.max(Math.round(Number(hd.kmTien) || 0), 0);
  const sauGiam = Math.max(Math.round(tongHang - giamHd) - kmTien, 0);
  const thuKhac = (hd.thuKhac || []).reduce((s, t) => s + Math.max(Number(t.tien) || 0, 0), 0);
  const vat = hd.vat ? Math.round(sauGiam * THUE_VAT) : 0;
  const giaVon = hd.dong.reduce((s, d) => s + d.sl * (Number(d.giaVon) || 0), 0);
  return {
    tongHang: Math.round(tongHang), giamHd: Math.round(giamHd), kmTien, sauGiam, thuKhac, vat,
    canTra: sauGiam + thuKhac + vat, giaVon, soMon: hd.dong.reduce((s, d) => s + d.sl, 0),
  };
}

// Thanh toán: khách đưa >= cần trả -> tiền thừa (chỉ tiền mặt); đưa thiếu -> NỢ,
// và chỉ khách có tên + SĐT mới được nợ.
// Kết hợp (như KiotViet): 1 hoá đơn trả nhiều cách — tiền thừa chỉ thối từ phần TIỀN MẶT.
export function tinhThanhToan({ canTra, khachDua, phuongThuc, laKhachLe, chia = null }) {
  const ketHop = phuongThuc === 'ket_hop';
  const dua = ketHop ? tongChia(chia) : Math.max(Number(khachDua) || 0, 0);
  const thua = phuongThuc === 'tien_mat' || ketHop ? Math.max(dua - canTra, 0) : 0;
  const thucThu = Math.min(dua, canTra);
  const no = Math.max(canTra - dua, 0);
  const loi = no > 0 && laKhachLe ? 'Khách lẻ không được ghi nợ — chọn khách có tên + SĐT hoặc thu đủ tiền.'
    : ketHop && thua > (Number(chia?.tien_mat) || 0) ? 'Chỉ tiền mặt mới thối lại được — số chuyển khoản / thẻ / ví đang nhiều hơn tiền khách cần trả.'
      : '';
  return { thucThu, thua, no, loi };
}
export const PT_CHIA = ['tien_mat', 'chuyen_khoan', 'the', 'vi'];
export function tongChia(chia) { return PT_CHIA.reduce((s, k) => s + Math.max(Number(chia?.[k]) || 0, 0), 0); }
// "Khách thanh toán": kết hợp = tổng các phần; còn lại null = bằng đúng số cần trả.
export function duaCua(hd, canTra) { return hd.pt === 'ket_hop' ? tongChia(hd.chia) : hd.dua == null ? canTra : hd.dua; }

// Trả hàng theo hoá đơn gốc: tiền trả lại = giá trị dòng (sau giảm dòng) × SL trả,
// trừ phần giảm giá HĐ theo tỉ lệ, cộng VAT nếu HĐ gốc có VAT. Thu khác (ship…) không hoàn.
// daTra = { ma: SL đã trả ở các phiếu trước } — không cho trả quá SL đã mua.
export function tinhTraHang(hd, slTra, daTra = {}) {
  const tiLeSauGiam = hd.tongHang > 0 ? hd.sauGiam / hd.tongHang : 1;
  const dong = [];
  for (const d of hd.dong) {
    const toiDa = d.sl - (daTra[d.ma] || 0);
    const sl = Math.min(Math.max(Number(slTra[d.ma]) || 0, 0), toiDa);
    if (sl > 0) dong.push({ ma: d.ma, ten: d.ten, size: d.size, sl, tien: (tienDong(d) / d.sl) * sl * tiLeSauGiam });
  }
  const tienHang = Math.round(dong.reduce((s, d) => s + d.tien, 0));
  const vat = hd.vat > 0 ? Math.round(tienHang * THUE_VAT) : 0;
  return { dong: dong.map((d) => ({ ...d, tien: Math.round(d.tien) })), tienHang, vat, tienTra: tienHang + vat };
}

// Kết ca: TM phải có = đầu ca + thu TM (bán + thu nợ) − TM trả khách (trả hàng);
// CK/thẻ chỉ để đối chiếu sao kê.
export function tinhKetCa({ dauCa, hoaDons, thuNos = [], traHangs = [] }) {
  const hopLe = hoaDons.filter((h) => !h.daHuy);
  const theo = (pt) => hopLe.filter((h) => h.phuongThuc === pt).reduce((s, h) => s + h.thucThu, 0)
    + thuNos.filter((t) => t.phuongThuc === pt).reduce((s, t) => s + t.tien, 0)
    - traHangs.filter((t) => t.phuongThuc === pt).reduce((s, t) => s + t.tienTra, 0);
  const tienMat = theo('tien_mat');
  return {
    soHoaDon: hopLe.length,
    doanhThu: hopLe.reduce((s, h) => s + h.canTra, 0),
    tienMat, chuyenKhoan: theo('chuyen_khoan'), the: theo('the'), vi: theo('vi'),
    ghiNo: hopLe.reduce((s, h) => s + h.no, 0),
    thuNo: thuNos.reduce((s, t) => s + t.tien, 0),
    traHang: traHangs.reduce((s, t) => s + t.tienTra, 0),
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
export function baoCaoNgay({ hoaDons, phieuKho, thuNos = [], traHangs = [], matHang }) {
  const hd = hoaDons.filter((h) => !h.daHuy);
  const giaVonCua = (ma) => matHang.find((m) => m.ma === ma)?.giaVon || 0;
  const tongPhieu = (loai) => phieuKho.filter((p) => p.loai === loai && p.trangThai === 'xong')
    .reduce((s, p) => ({ sl: s.sl + p.dong.reduce((a, d) => a + d.sl, 0), giaTri: s.giaTri + p.dong.reduce((a, d) => a + d.sl * giaVonCua(d.ma), 0) }), { sl: 0, giaTri: 0 });
  const giaVonTra = traHangs.reduce((s, t) => s + t.dong.reduce((a, d) => a + d.sl * giaVonCua(d.ma), 0), 0);
  const traHang = traHangs.reduce((s, t) => s + t.tienHang, 0);
  const doanhThuThuan = hd.reduce((s, h) => s + h.sauGiam, 0) - traHang;
  const giaVon = hd.reduce((s, h) => s + h.giaVon, 0) - giaVonTra;
  const ketCa = tinhKetCa({ dauCa: 0, hoaDons, thuNos, traHangs });
  return {
    soHoaDon: hd.length, soHuy: hoaDons.length - hd.length,
    tongHang: hd.reduce((s, h) => s + h.tongHang, 0), giamGia: hd.reduce((s, h) => s + h.giamHd, 0),
    thuKhac: hd.reduce((s, h) => s + h.thuKhac, 0), vat: hd.reduce((s, h) => s + h.vat, 0),
    traHang, soTra: traHangs.length, doanhThuThuan, giaVon, laiGop: doanhThuThuan - giaVon,
    tienMat: ketCa.tienMat, chuyenKhoan: ketCa.chuyenKhoan, the: ketCa.the, vi: ketCa.vi, ghiNo: ketCa.ghiNo, thuNo: ketCa.thuNo,
    giao: tongPhieu('giao'), huy: tongPhieu('huy'), noibo: tongPhieu('noibo'),
  };
}

// Tìm kiểu KiotViet: không phân biệt hoa/thường, có dấu/không dấu (đ = d), gõ nhiều
// chữ rời nhau vẫn khớp ("banh bo" ra "Bánh Bò Thốt Nốt").
export const boDau = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();
export const khop = (chuoi, q) => {
  const tu = boDau(q).trim().split(/\s+/).filter(Boolean);
  if (!tu.length) return true;
  const c = boDau(chuoi);
  return tu.every((x) => c.includes(x));
};

// Lọc + xếp hạng: chữ gõ khớp ĐẦU từ (chị "Yến") đứng trước khớp lưng chừng ("Hu-yền").
// Cùng điểm thì giữ thứ tự cũ. Dùng cho mọi ô tìm hàng / tìm khách.
export const locXep = (ds, layChuoi, q, gioiHan = Infinity) => {
  const tu = boDau(q).trim().split(/\s+/).filter(Boolean);
  if (!tu.length) return ds.slice(0, gioiHan);
  const kq = [];
  ds.forEach((x, i) => {
    const c = boDau(layChuoi(x));
    if (!tu.every((t) => c.includes(t))) return;
    const cacTu = c.split(/[\s\-·,()/]+/);
    const dauTu = tu.filter((t) => cacTu.some((w) => w.startsWith(t))).length;
    const ca = c.includes(tu.join(' ')) ? 1 : 0;
    kq.push({ x, i, diem: dauTu * 2 + ca });
  });
  kq.sort((a, b) => b.diem - a.diem || a.i - b.i);
  return kq.slice(0, gioiHan).map((k) => k.x);
};

// Đọc số tiền thành chữ cho biên lai: 260000 → "Hai trăm sáu mươi nghìn đồng chẵn".
const CHU_SO = ['không', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín'];
const doc3 = (n, du) => {
  const tr = Math.floor(n / 100); const ch = Math.floor((n % 100) / 10); const dv = n % 10; const r = [];
  if (du || tr) r.push(CHU_SO[tr], 'trăm');
  if (ch === 0) { if (dv && (du || tr)) r.push('linh'); } else if (ch === 1) r.push('mười'); else r.push(CHU_SO[ch], 'mươi');
  if (dv) r.push(dv === 1 && ch > 1 ? 'mốt' : dv === 5 && ch > 0 ? 'lăm' : CHU_SO[dv]);
  return r.join(' ');
};
export const docSoTien = (tien) => {
  let n = Math.round(Math.abs(Number(tien) || 0));
  if (!n) return 'Không đồng';
  const nhom = [];
  while (n > 0) { nhom.push(n % 1000); n = Math.floor(n / 1000); }
  const ra = [];
  for (let i = nhom.length - 1; i >= 0; i -= 1) {
    if (!nhom[i]) continue;
    ra.push(doc3(nhom[i], i < nhom.length - 1));
    const dv = ['', 'nghìn', 'triệu', 'tỷ', 'nghìn tỷ'][i];
    if (dv) ra.push(dv);
  }
  const s = `${ra.join(' ')} đồng chẵn`;
  return s[0].toUpperCase() + s.slice(1);
};

// ===== KHUYẾN MẠI (như KiotViet) — PHẢI tính giống hệt hàm pos__km_tinh trong database (migration 202611221030),
// lệch 1đ là database không cho bán. Mỗi hoá đơn 1 chương trình; máy tự chọn chương trình lợi nhất.
export const LOAI_KM = { hd_giam: 'Giảm giá hoá đơn', hang_giam: 'Giảm giá hàng', tang_hang: 'Mua hàng tặng hàng' };
export const THU_KM = [[1, 'T2'], [2, 'T3'], [3, 'T4'], [4, 'T5'], [5, 'T6'], [6, 'T7'], [7, 'CN']];
// Giờ Việt Nam của thời điểm luc → { ngay: 'YYYY-MM-DD', gio: 'HH:MM', thu: 1..7 (T2..CN) }.
export function gioVn(luc = Date.now()) {
  const d = new Date(luc + 7 * 3600000);
  return { ngay: d.toISOString().slice(0, 10), gio: d.toISOString().slice(11, 16), thu: ((d.getUTCDay() + 6) % 7) + 1 };
}
// Lý do chương trình không chạy lúc này (null = đang chạy).
export function kmKhongChay(k, chiNhanh, luc = Date.now()) {
  const t = gioVn(luc);
  if (!k.active) return 'Đang tắt';
  if (k.from_date && t.ngay < k.from_date) return 'Chưa tới ngày';
  if (k.to_date && t.ngay > k.to_date) return 'Đã hết hạn';
  if (k.days?.length && !k.days.includes(t.thu)) return 'Không áp dụng hôm nay';
  if ((k.time_from && t.gio < String(k.time_from).slice(0, 5)) || (k.time_to && t.gio >= String(k.time_to).slice(0, 5))) return 'Ngoài khung giờ';
  if (k.stores?.length && chiNhanh && !k.stores.includes(chiNhanh)) return 'Không áp dụng chi nhánh này';
  return null;
}
const khopMon = (d, x) => !!x && d.product_id === x.product_id && (!x.variant_id || d.variant_id === x.variant_id);
// dong = [{ product_id, variant_id, sl, donGia, eod }] — các dòng đang bán (không gồm hàng tặng).
// → { duoc, tien (giảm tiền), tang: {product_id, variant_id, sl} | null, thieu (chữ "mua thêm…") }
export function tinhMotKm(k, dong) {
  const r = k.rule || {};
  if (k.kind === 'hd_giam') {
    const sub = dong.reduce((s, d) => s + d.donGia * d.sl, 0);
    const muc = [...(r.muc || [])].sort((a, b) => b.tu - a.tu).find((m) => sub >= Number(m.tu));
    if (!muc) {
      const min = Math.min(...(r.muc || []).map((m) => Number(m.tu)));
      return { duoc: false, tien: 0, tang: null, thieu: Number.isFinite(min) ? `Mua thêm ${vnd(min - sub)}` : '' };
    }
    let tien = muc.kieu === 'pt' ? Math.round((sub * Number(muc.giam)) / 100) : Number(muc.giam);
    if (muc.kieu === 'pt' && Number(muc.toi_da) > 0) tien = Math.min(tien, Number(muc.toi_da));
    return { duoc: true, tien: Math.min(Math.max(tien, 0), sub), tang: null, thieu: '' };
  }
  if (k.kind === 'hang_giam') {
    const ds = dong.filter((d) => !d.eod && khopMon(d, r));
    const sl = ds.reduce((s, d) => s + d.sl, 0);
    if (sl < Number(r.sl_tu || 1)) return { duoc: false, tien: 0, tang: null, thieu: `Mua thêm ${Number(r.sl_tu || 1) - sl} ${r.ten || 'cái'}` };
    const g = Number(r.giam) || 0;
    const tien = ds.reduce((s, d) => s + (r.kieu === 'pt' ? Math.round((d.donGia * g) / 100) * d.sl
      : r.kieu === 'gia' ? Math.max(d.donGia - g, 0) * d.sl : Math.min(g, d.donGia) * d.sl), 0);
    return { duoc: true, tien, tang: null, thieu: '' };
  }
  const sl = dong.filter((d) => khopMon(d, r.mua)).reduce((s, d) => s + d.sl, 0);
  const lan = Math.floor(sl / Math.max(Number(r.mua?.sl) || 1, 1));
  const tang = lan * (Number(r.tang?.sl) || 1);
  if (!tang) return { duoc: false, tien: 0, tang: null, thieu: `Mua thêm ${Math.max(Number(r.mua?.sl) || 1, 1) - sl} ${r.mua?.ten || 'cái'}` };
  return { duoc: true, tien: 0, tang: { product_id: r.tang.product_id, variant_id: r.tang.variant_id || null, sl: tang }, thieu: '' };
}
// Chương trình áp được cho giỏ hàng, sắp lợi nhất trước. giaTang(tang) = tiền hàng tặng (để so lợi).
export function kmApDuoc(ds, dong, { chiNhanh, luc = Date.now(), giaTang = () => 0 } = {}) {
  return (ds || []).filter((k) => !kmKhongChay(k, chiNhanh, luc))
    .map((k) => { const kq = tinhMotKm(k, dong); return { k, ...kq, loi: kq.duoc ? kq.tien + (kq.tang ? giaTang(kq.tang) : 0) : 0 }; })
    .sort((a, b) => Number(b.duoc) - Number(a.duoc) || b.loi - a.loi);
}
// Mô tả ngắn điều kiện (danh sách + hộp chọn).
export function moTaKm(k) {
  const r = k.rule || {};
  const g = (kieu, giam) => (kieu === 'pt' ? `${giam}%` : kieu === 'gia' ? `đồng giá ${vnd(giam)}` : vnd(giam));
  if (k.kind === 'hd_giam') return (r.muc || []).map((m) => `Từ ${vnd(m.tu)} giảm ${g(m.kieu, m.giam)}${m.kieu === 'pt' && Number(m.toi_da) > 0 ? ` (tối đa ${vnd(m.toi_da)})` : ''}`).join(' · ');
  if (k.kind === 'hang_giam') return `Mua từ ${r.sl_tu} ${r.ten || ''} → ${r.kieu === 'gia' ? g('gia', r.giam) : `giảm ${g(r.kieu, r.giam)}/cái`}`;
  return `Mua ${r.mua?.sl} ${r.mua?.ten || ''} tặng ${r.tang?.sl} ${r.tang?.ten || ''}`;
}

// ===== MÃ VẠCH CODE128 (in tem như KiotViet) — máy quét ở quầy đọc được loại này.
// Trả chuỗi '1' (vạch đen) / '0' (khoảng trắng) theo từng mô-đun; null nếu có ký tự ngoài ASCII in được.
// Toàn số ≥ 4 chữ số → bộ C (2 số / ký tự, vạch dày hơn trên tem nhỏ); số chữ số lẻ thì chữ số cuối chuyển sang bộ A. Còn lại bộ B.
const C128 = ['212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213', '221312', '231212', '112232',
  '122132', '122231', '113222', '123122', '123221', '223211', '221132', '221231', '213212', '223112', '312131', '311222', '321122', '321221',
  '312212', '322112', '322211', '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313', '231113',
  '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331', '231131', '213113', '213311', '213131', '311123',
  '311321', '331121', '312113', '312311', '332111', '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221',
  '112214', '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111', '111242', '121142', '121241',
  '114212', '124112', '124211', '411212', '421112', '421211', '212141', '214121', '412121', '111143', '111341', '131141', '114113', '114311',
  '411113', '411311', '113141', '114131', '311141', '411131', '211412', '211214', '211232', '2331112'];
export function maVachCode128(text) {
  const s = String(text ?? '');
  if (!s || !/^[\x20-\x7E]+$/.test(s)) return null;
  const boC = /^\d+$/.test(s) && s.length >= 4;
  const le = boC && s.length % 2 === 1;
  const giaTri = boC   // 105 = bắt đầu bộ C · 101 = chuyển bộ A cho chữ số lẻ cuối (giống thư viện jsbarcode)
    ? [105, ...s.slice(0, s.length - (le ? 1 : 0)).match(/\d\d/g).map(Number), ...(le ? [101, s.charCodeAt(s.length - 1) - 32] : [])]
    : [104, ...[...s].map((c) => c.charCodeAt(0) - 32)];
  const kiem = giaTri.reduce((t, v, i) => t + v * (i || 1), 0) % 103;
  let bit = '';
  for (const v of [...giaTri, kiem, 106]) {
    [...C128[v]].forEach((w, i) => { bit += (i % 2 ? '0' : '1').repeat(Number(w)); });
  }
  return bit;
}
// Mã để in lên tem: mã vạch riêng nếu có, không thì Mã hàng cố định (mã KiotViet). Mã SP… tự đánh theo thứ tự
// sẽ đổi khi thêm món mới → KHÔNG in (null) — Quản lý đặt Mã vạch cho món đó trước.
export function maInTem(m) {
  const mv = String(m?.maVach || '').trim();
  if (mv && maVachCode128(mv)) return mv;
  const ma = String(m?.posCode || '').trim();
  return ma && maVachCode128(ma) ? ma : null;
}
