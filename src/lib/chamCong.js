// Tính toán cho màn hình Chấm Công.
//
// TÁCH RIÊNG khỏi giao diện để kiểm chứng được bằng máy, và để mọi con số trên
// màn hình đều đi ra từ một chỗ duy nhất.
//
// AI LÀ NGƯỜI QUYẾT CON SỐ?  → DATABASE, không phải file này.
// Trigger `sumi_tu_tinh_di_muon` trên bảng shift_logs tự điền `expected_start`
// (giờ vào ca quy định) và `late_minutes` (số phút muộn) mỗi lần có người chấm
// vào. File này chỉ ĐỌC LẠI hai con số đó để vẽ ra màn hình, cộng thêm phần
// hiển thị (tên ca, mốc, giờ tan ca) lấy từ bảng `sumi_quy_dinh_ca`.
//
// Vì sao phải làm vậy: trước 26/08/2026 màn hình chấm công tự ghi
// `expected_start` BẰNG CHÍNH GIỜ BẤM VÀO và `late_minutes = 0`, nên suốt thời
// gian qua hệ thống không ghi nhận nổi một phút đi muộn nào.
//
// QUY ĐỊNH ĐANG ÁP DỤNG (bảng sumi_quy_dinh_ca, Giám đốc sửa được):
//   • Ca 9 tiếng CÓ MẶT = 8 tiếng làm + 1 tiếng nghỉ trưa 11:30–12:30
//   • Phải tới trước giờ vào ca ít nhất 10 phút; muộn hơn mốc đó là ĐI MUỘN
//   • Xưởng 41 / Xưởng 42 / Vận tải : 06:00 (mốc 05:50, tan 15:00)
//   • Bakery sáng                   : 05:15 (mốc 05:05, tan 14:15)
//   • Bakery chiều                  : 13:30 (mốc 13:20, tan 22:30)

// ── Giờ giấc ────────────────────────────────────────────────────────────────
export function phutTrongNgay(hhmm) {
  if (!hhmm) return null;
  const [h, m] = String(hhmm).split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

export function tuPhut(phut) {
  const p = ((phut % 1440) + 1440) % 1440;
  return `${String(Math.floor(p / 60)).padStart(2, '0')}:${String(p % 60).padStart(2, '0')}`;
}

export function gioPhut(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function catGiay(t) {
  return t ? String(t).slice(0, 5) : null;
}

// ── Ca làm việc (đọc từ bảng sumi_quy_dinh_ca) ──────────────────────────────
const ICON_CA = [
  { khop: /tối|toi|đêm|dem/i, icon: '🌙' },
  { khop: /chiều|chieu/i, icon: '☀️' },
  { khop: /sáng|sang/i, icon: '🌅' },
];

function iconCa(ten) {
  return (ICON_CA.find((x) => x.khop.test(ten || '')) || { icon: '🕐' }).icon;
}

export const TEN_BO_PHAN = {
  bakery: 'Bakery (Thu ngân · Bếp lạnh · Bếp nóng)',
  xuong41: 'Xưởng 41',
  xuong42: 'Xưởng 42',
  van_tai: 'Vận tải',
};

// Bộ phận của một nhân viên. PHẢI khớp đúng hàm `sumi_bo_phan_cham_cong` dưới
// database — đã đối chiếu trên toàn bộ nhân sự thật, không lệch dòng nào.
// Ưu tiên `station`; hồ sơ chưa gán khâu thì suy từ chức danh.
export function boPhanCuaHoSo(hoSo) {
  const st = (hoSo?.station || '').trim();
  if (st === 'lanh' || st === 'nong') return 'bakery';
  if (st === 'xuong41') return 'xuong41';
  if (st === 'xuong42') return 'xuong42';

  const r = hoSo?.role;
  if (r === 'shipper') return 'van_tai';
  // 'sale' = bán hàng tại tiệm, làm cùng ca với thu ngân và bếp.
  if (r === 'cashier' || r === 'sale' || r === 'bakery' || r === 'kitchen_lead') return 'bakery';
  if (r === 'kho_xuong42' || r === 'deputy_director_x42') return 'xuong42';
  if (r === 'deputy_director_x41') return 'xuong41';

  return null;   // Giám đốc, kế toán, bán hàng, kho... không theo ca cố định
}

export function chuanHoaCa(rows) {
  return (rows || []).map((r) => {
    const batDauP = phutTrongNgay(catGiay(r.gio_bat_dau));
    const soGio = Number(r.so_gio_chuan) || 9;
    const phutSom = Number(r.phut_den_som_toi_thieu ?? 10);
    return {
      boPhan: r.bo_phan,
      maCa: r.ma_ca,
      ten: r.ten_ca,
      icon: iconCa(r.ten_ca),
      batDau: tuPhut(batDauP),
      moc: tuPhut(batDauP - phutSom),
      ketThuc: tuPhut(batDauP + soGio * 60),
      soGio,
      phutSom,
    };
  }).sort((a, b) => phutTrongNgay(a.batDau) - phutTrongNgay(b.batDau));
}

// Bản ghi đã được trigger điền `expected_start` = giờ vào ca quy định.
// Trống nghĩa là người này không thuộc ca cố định (giám đốc, kế toán…) hoặc
// chấm công ngoài khung ca — hai trường hợp đó KHÔNG tính đi muộn.
export function caChuanCuaLog(log, danhSachCa, boPhan) {
  const es = catGiay(log?.expected_start);
  if (!es) return null;
  const hop = (danhSachCa || []).filter((c) => c.batDau === es);
  if (!hop.length) return null;
  return hop.find((c) => c.boPhan === boPhan) || hop[0];
}

export function caCuaBoPhan(danhSachCa, boPhan) {
  return (danhSachCa || []).filter((c) => c.boPhan === boPhan);
}

// ── Chênh lệch so với quy định ──────────────────────────────────────────────
// phutMuonDB: `late_minutes` do database tính. Có thì lấy làm chuẩn.
// boPhanThat: bộ phận THẬT của nhân viên (không phải ca.boPhan) — dùng riêng
// để quyết định mốc tính tăng ca. `ca` có thể là ca "mượn tạm" của bộ phận
// khác khi caChuanCuaLog() không tìm thấy ca khớp giờ đúng bộ phận (dữ liệu
// chấm công cũ trước khi sửa giờ chuẩn Bakery ngày 29/08) — ca.boPhan lúc đó
// KHÔNG phản ánh đúng bộ phận thật, nên không được dùng để rẽ nhánh Bakery.
export function tinhChenhLech(ca, gioVao, gioRa, phutMuonDB, boPhanThat) {
  if (!ca) return null;
  const mocP = phutTrongNgay(ca.moc);

  let lechVao = null;
  let nhanVao = 'Chưa vào ca';
  let loaiVao = 'chua';
  if (gioVao) {
    if (typeof phutMuonDB === 'number' && phutMuonDB > 0) {
      lechVao = phutMuonDB;
    } else {
      lechVao = phutTrongNgay(gioVao) - mocP;
      if (lechVao > 720) lechVao -= 1440;
      if (lechVao < -720) lechVao += 1440;
    }
    if (lechVao > 0) { nhanVao = `Đi muộn ${lechVao} phút`; loaiVao = 'late'; }
    else if (lechVao < 0) { nhanVao = `Đến sớm ${Math.abs(lechVao)} phút`; loaiVao = 'early'; }
    else { nhanVao = `Đúng mốc ${ca.moc}`; loaiVao = 'on_time'; }
  }

  // Mốc tính TĂNG CA: Xưởng 41/42 và Vận tải tính từ mốc CỐ ĐỊNH 16:00 chiều,
  // không theo giờ tan ca riêng của từng ca — theo xác nhận của chủ tiệm
  // (30/08/2026). Bakery vẫn giữ nguyên tính theo giờ tan ca chuẩn của ca đó
  // (05:30 sáng → 14:30, hoặc 13:30 chiều → 22:30).
  const mocTangCa = (boPhanThat ?? ca.boPhan) === 'bakery' ? ca.ketThuc : '16:00';

  let lechRa = null;
  let nhanRa = 'Chưa ra ca';
  let loaiRa = 'pending';
  if (gioRa) {
    const batDauP = phutTrongNgay(ca.batDau);
    let ketChuan = phutTrongNgay(mocTangCa);
    if (ketChuan <= batDauP) ketChuan += 1440;
    let ketThat = phutTrongNgay(gioRa);
    if (ketThat < batDauP) ketThat += 1440;
    lechRa = ketThat - ketChuan;
    if (lechRa > 0) { nhanRa = `Tăng ca +${lechRa} phút (OT)`; loaiRa = 'ot'; }
    else if (lechRa < 0) { nhanRa = `Về sớm ${Math.abs(lechRa)} phút`; loaiRa = 'early'; }
    else { nhanRa = 'Đúng giờ tan ca'; loaiRa = 'on_time'; }
  }

  return {
    ten: ca.ten,
    icon: ca.icon,
    chuanVao: ca.batDau,
    moc: ca.moc,
    chuanRa: mocTangCa,
    soGio: ca.soGio,
    phutSom: ca.phutSom,
    lechVao, nhanVao, loaiVao,
    lechRa, nhanRa, loaiRa,
    // BẢNG VI PHẠM của công ty: "Đi trễ >15 phút" mới bị ghi nhận vi phạm.
    viPhamDiTre: lechVao !== null && lechVao > 15,
  };
}

// ── Giờ làm thực tế ─────────────────────────────────────────────────────────
// (giờ ra − giờ vào) − PHẦN GIAO NHAU với khung nghỉ trưa 11:30–12:30.
// Ca chiều 13:30–22:30 không chạm khung này nên không bị trừ — trừ 1 tiếng của
// người không hề nghỉ trưa là tính thiếu công cho họ.
// Công thức này khớp đúng hàm `sumi_gio_lam_trong_ngay` dưới database.
export function gioLamThuc(vaoISO, raISO) {
  if (!vaoISO || !raISO) return null;
  const v = new Date(vaoISO);
  const r = new Date(raISO);
  const tho = (r - v) / 3600000;
  if (tho <= 0) return 0;
  const truaBatDau = new Date(v); truaBatDau.setHours(11, 30, 0, 0);
  const truaKetThuc = new Date(v); truaKetThuc.setHours(12, 30, 0, 0);
  const dauChung = Math.max(v.getTime(), truaBatDau.getTime());
  const cuoiChung = Math.min(r.getTime(), truaKetThuc.getTime());
  const truTrua = cuoiChung > dauChung ? (cuoiChung - dauChung) / 3600000 : 0;
  return Math.max(0, tho - truTrua);
}

// ── Trạng thái ──────────────────────────────────────────────────────────────
export const TRANG_THAI = {
  working: { nhan: 'Đang làm', mau: '#16a34a', nen: '#f0fdf4', vien: '#86efac', icon: '🟢' },
  done: { nhan: 'Hoàn thành', mau: '#3b82f6', nen: '#eff6ff', vien: '#93c5fd', icon: '✅' },
  late: { nhan: 'Đi muộn', mau: '#f59e0b', nen: '#fffbeb', vien: '#fcd34d', icon: '⏰' },
  leave: { nhan: 'Xin nghỉ', mau: '#7c3aed', nen: '#f5f3ff', vien: '#c4b5fd', icon: '🏖' },
  upcoming: { nhan: 'Chưa chấm', mau: '#6b7280', nen: '#f9fafb', vien: '#e5e7eb', icon: '⏳' },
};

export const MAU_CHAM_LICH = {
  done: '#16a34a', working: '#16a34a', late: '#f59e0b',
  leave: '#7c3aed', upcoming: '#d1d5db', off: '#e5d9c9',
};

// ── Gom nhật ký MỘT ngày thành trạng thái từng nhân viên ────────────────────
// boPhanTheoNguoi: { [staff_id]: 'bakery' | 'xuong41' | ... }
export function gomChamCongNgay(logs, danhSachCa, boPhanTheoNguoi = {}) {
  const theoNguoi = new Map();

  const sapXep = [...(logs || [])].sort(
    (a, b) => new Date(a.checkin_time || a.created_at || 0) - new Date(b.checkin_time || b.created_at || 0),
  );

  sapXep.forEach((l) => {
    const id = l.staff_id;
    if (!id) return;
    if (!theoNguoi.has(id)) {
      theoNguoi.set(id, {
        staffId: id, ten: l.staff_name || '?', branch: l.branch || null,
        boPhan: boPhanTheoNguoi[id] || null,
        vaoISO: null, raISO: null, vao: null, ra: null,
        ca: null, coCaChuan: false, phutMuonDB: null,
        ghiChu: '', xinNghi: false, nhanCa: null,
      });
    }
    const n = theoNguoi.get(id);

    if (l.type === 'checkin') {
      if (!n.vaoISO) {                       // lấy lần vào ĐẦU TIÊN làm mốc
        n.vaoISO = l.checkin_time || l.created_at;
        n.vao = gioPhut(n.vaoISO);
        n.nhanCa = l.shift_label || null;
        n.phutMuonDB = typeof l.late_minutes === 'number' ? l.late_minutes : null;
        if (l.reason) n.ghiChu = l.reason;
        const ca = caChuanCuaLog(l, danhSachCa, n.boPhan);
        if (ca) { n.ca = ca; n.coCaChuan = true; }
      }
    } else if (l.type === 'checkout') {
      n.raISO = l.checkin_time || l.created_at;   // lấy lần ra CUỐI CÙNG
      n.ra = gioPhut(n.raISO);
    } else if (l.type === 'leave_request') {
      n.xinNghi = true;
      if (l.reason) n.ghiChu = l.reason;
    }
  });

  theoNguoi.forEach((n) => {
    n.chenhLech = n.coCaChuan ? tinhChenhLech(n.ca, n.vao, n.ra, n.phutMuonDB, n.boPhan) : null;
    if (n.raISO) n.trangThai = 'done';
    else if (n.vaoISO) n.trangThai = n.chenhLech?.loaiVao === 'late' ? 'late' : 'working';
    else if (n.xinNghi) n.trangThai = 'leave';
    else n.trangThai = 'upcoming';
    n.soGio = gioLamThuc(n.vaoISO, n.raISO);
  });

  return theoNguoi;
}

// ── Tổng hợp cho quản lý ────────────────────────────────────────────────────
export function tongHopChenhLech(danhSach) {
  let soMuon = 0, phutMuon = 0, soOT = 0, phutOT = 0, soDungGio = 0, soChuaCham = 0, soViPham = 0;
  danhSach.forEach((n) => {
    const d = n.chenhLech;
    if (d) {
      if (d.loaiVao === 'late') {
        soMuon += 1; phutMuon += d.lechVao;
        if (d.viPhamDiTre) soViPham += 1;
      } else if (d.loaiVao === 'early' || d.loaiVao === 'on_time') soDungGio += 1;
      if (d.loaiRa === 'ot') { soOT += 1; phutOT += d.lechRa; }
    } else if (n.vaoISO) {
      soDungGio += 1;   // đã vào ca nhưng không thuộc ca cố định
    }
    if (!n.vaoISO && !n.xinNghi) soChuaCham += 1;
  });
  return { soMuon, phutMuon, soOT, phutOT, soDungGio, soChuaCham, soViPham };
}

// ── Tóm tắt tháng cho một nhân viên ─────────────────────────────────────────
export function tomTatThang(logsThang, staffId, danhSachCa, boPhan) {
  const theoNgay = new Map();
  (logsThang || []).filter((l) => l.staff_id === staffId).forEach((l) => {
    if (!l.work_date) return;
    if (!theoNgay.has(l.work_date)) theoNgay.set(l.work_date, []);
    theoNgay.get(l.work_date).push(l);
  });

  const ngayList = [];
  let soNgayLam = 0, tongGio = 0, phutOT = 0, soMuon = 0, soNghi = 0, phutMuon = 0, soViPham = 0;

  theoNgay.forEach((logs, ngay) => {
    const gom = gomChamCongNgay(logs, danhSachCa, { [staffId]: boPhan }).get(staffId);
    if (!gom) return;
    ngayList.push({ ngay, ...gom });
    if (gom.vaoISO) {
      soNgayLam += 1;
      tongGio += gom.soGio || 0;
      if (gom.chenhLech?.loaiVao === 'late') {
        soMuon += 1;
        phutMuon += gom.chenhLech.lechVao;
        if (gom.chenhLech.viPhamDiTre) soViPham += 1;
      }
      if (gom.chenhLech?.loaiRa === 'ot') phutOT += gom.chenhLech.lechRa;
    } else if (gom.xinNghi) soNghi += 1;
  });

  return {
    ngayList: ngayList.sort((a, b) => a.ngay.localeCompare(b.ngay)),
    soNgayLam,
    tongGio: Math.round(tongGio),
    phutOT,
    soMuon,
    phutMuon,
    soViPham,
    soNghi,
    // Chuyên cần theo NỘI QUY: 0 lỗi 500K · 1-2 lỗi 300K · 3 lỗi 100K · >3 lỗi 0đ
    chuyenCan: soViPham === 0 ? 500000 : soViPham <= 2 ? 300000 : soViPham === 3 ? 100000 : 0,
  };
}
