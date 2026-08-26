// Tính toán cho màn hình Chấm Công.
//
// TÁCH RIÊNG khỏi giao diện để kiểm chứng được bằng máy, và để mọi con số trên
// màn hình đều đi ra từ một chỗ duy nhất.
//
// ĐIỀU QUAN TRỌNG VỀ DỮ LIỆU THẬT (đã kiểm tra ngày 26/08/2026):
// Cột `shift_logs.expected_start` ĐANG BỊ GHI SAI Ý NGHĨA — màn hình chấm công
// cũ ghi vào đó CHÍNH GIỜ NHÂN VIÊN BẤM VÀO, chứ không phải giờ quy định của ca
// (xem ShiftsScreen: `expectedStart: `${checkinTime}:00`` và `lateMinutes: 0`
// ghi cứng). Bảng phân ca `shift_schedule` thì trống 0 dòng.
//
// Hệ quả: không thể suy ra "giờ chuẩn" cho phần lớn bản ghi cũ. Vì vậy ở đây
// KHÔNG ĐOÁN BỪA. Một bản ghi chỉ được coi là CÓ giờ chuẩn khi `expected_start`
// của nó TRÙNG với một `shift_configs.start_time` có thật. Không trùng thì hiện
// "Không theo ca cố định" — thà nói thẳng còn hơn bịa ra con số chênh lệch.

// ── Giờ giấc ────────────────────────────────────────────────────────────────
export function phutTrongNgay(hhmm) {
  if (!hhmm) return null;
  const [h, m] = String(hhmm).split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
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

// ── Ca làm việc ─────────────────────────────────────────────────────────────
const ICON_CA = [
  { khop: /tối|toi|đêm|dem|night/i, icon: '🌙' },
  { khop: /chiều|chieu|afternoon/i, icon: '☀️' },
  { khop: /sáng|sang|morning/i, icon: '🌅' },
];

function iconCa(label) {
  const found = ICON_CA.find((x) => x.khop.test(label || ''));
  return found ? found.icon : '🕐';
}

// shift_configs có bản ghi trùng lặp (mỗi ca 2 dòng). Gộp lại theo giờ bắt đầu.
export function chuanHoaCa(configs) {
  const theoGio = new Map();
  (configs || []).forEach((c) => {
    const batDau = catGiay(c.start_time);
    if (!batDau) return;
    if (theoGio.has(batDau)) return;
    const ketThuc = catGiay(c.end_time);
    const dm = phutTrongNgay(batDau);
    let km = phutTrongNgay(ketThuc);
    if (km !== null && dm !== null && km <= dm) km += 1440; // ca qua đêm
    theoGio.set(batDau, {
      id: c.id,
      ten: (c.label || '').trim() || batDau,
      batDau,
      ketThuc,
      icon: iconCa(c.label),
      soGio: km !== null && dm !== null ? Math.round(((km - dm) / 60) * 10) / 10 : null,
    });
  });
  return [...theoGio.values()].sort((a, b) => phutTrongNgay(a.batDau) - phutTrongNgay(b.batDau));
}

// Một bản ghi CHỈ có giờ chuẩn khi expected_start trùng đúng một ca có thật.
export function caChuanCuaLog(log, danhSachCa) {
  const es = catGiay(log?.expected_start);
  if (!es) return null;
  return (danhSachCa || []).find((c) => c.batDau === es) || null;
}

// Gợi ý ca gần nhất với một giờ cho trước — CHỈ dùng làm gợi ý mặc định trên
// form chấm vào, không bao giờ dùng để suy ngược dữ liệu cũ.
export function caGanNhat(hhmm, danhSachCa) {
  const m = phutTrongNgay(hhmm);
  if (m === null || !danhSachCa?.length) return null;
  let tot = null;
  let lech = Infinity;
  danhSachCa.forEach((c) => {
    const b = phutTrongNgay(c.batDau);
    let d = Math.abs(m - b);
    if (d > 720) d = 1440 - d; // vòng qua nửa đêm
    if (d < lech) { lech = d; tot = c; }
  });
  return tot;
}

// ── Chênh lệch so với quy định ──────────────────────────────────────────────
export function tinhChenhLech(ca, gioVao, gioRa) {
  if (!ca) return null;
  const chuanVao = phutTrongNgay(ca.batDau);
  const chuanRa = phutTrongNgay(ca.ketThuc);

  let lechVao = null;
  let nhanVao = 'Chưa vào ca';
  let loaiVao = 'chua';
  if (gioVao) {
    lechVao = phutTrongNgay(gioVao) - chuanVao;
    if (lechVao > 720) lechVao -= 1440;
    if (lechVao < -720) lechVao += 1440;
    if (lechVao > 0) { nhanVao = `Muộn +${lechVao} phút`; loaiVao = 'late'; }
    else if (lechVao < 0) { nhanVao = `Sớm ${Math.abs(lechVao)} phút`; loaiVao = 'early'; }
    else { nhanVao = `Đúng ${ca.batDau}`; loaiVao = 'on_time'; }
  }

  let lechRa = null;
  let nhanRa = 'Chưa ra ca';
  let loaiRa = 'pending';
  if (gioRa && chuanRa !== null) {
    let ketChuan = chuanRa;
    if (ketChuan <= chuanVao) ketChuan += 1440;
    let ketThat = phutTrongNgay(gioRa);
    if (ketThat < chuanVao) ketThat += 1440;
    lechRa = ketThat - ketChuan;
    if (lechRa > 0) { nhanRa = `Tăng ca +${lechRa} phút (OT)`; loaiRa = 'ot'; }
    else if (lechRa < 0) { nhanRa = `Về sớm ${Math.abs(lechRa)} phút`; loaiRa = 'early'; }
    else { nhanRa = 'Đúng giờ ra ca'; loaiRa = 'on_time'; }
  }

  return {
    chuanVao: ca.batDau, chuanRa: ca.ketThuc, soGio: ca.soGio,
    lechVao, nhanVao, loaiVao,
    lechRa, nhanRa, loaiRa,
  };
}

// ── Giờ làm thực (trừ nghỉ trưa 11:30–12:30, giữ đúng quy tắc cũ) ───────────
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

// ── Gom nhật ký của MỘT ngày thành trạng thái từng nhân viên ────────────────
export const TRANG_THAI = {
  working:  { nhan: 'Đang làm',   mau: '#16a34a', nen: '#f0fdf4', vien: '#86efac', icon: '🟢' },
  done:     { nhan: 'Hoàn thành', mau: '#3b82f6', nen: '#eff6ff', vien: '#93c5fd', icon: '✅' },
  late:     { nhan: 'Đi muộn',    mau: '#f59e0b', nen: '#fffbeb', vien: '#fcd34d', icon: '⏰' },
  leave:    { nhan: 'Xin nghỉ',   mau: '#7c3aed', nen: '#f5f3ff', vien: '#c4b5fd', icon: '🏖' },
  upcoming: { nhan: 'Chưa chấm',  mau: '#6b7280', nen: '#f9fafb', vien: '#e5e7eb', icon: '⏳' },
};

export const MAU_CHAM_LICH = {
  done: '#16a34a', working: '#16a34a', late: '#f59e0b',
  leave: '#7c3aed', upcoming: '#d1d5db', off: '#e5d9c9',
};

// logs: các dòng shift_logs của ĐÚNG một ngày.
// Trả về Map staff_id -> { vao, ra, ca, chenhLech, trangThai, ghiChu, ... }
export function gomChamCongNgay(logs, danhSachCa) {
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
        vaoISO: null, raISO: null, vao: null, ra: null,
        ca: null, coCaChuan: false, ghiChu: '', xinNghi: false,
        nhanCa: null, anhVao: null, anhRa: null,
      });
    }
    const n = theoNguoi.get(id);

    if (l.type === 'checkin') {
      // Lấy lần vào ĐẦU TIÊN trong ngày làm mốc.
      if (!n.vaoISO) {
        n.vaoISO = l.checkin_time || l.created_at;
        n.vao = gioPhut(n.vaoISO);
        n.nhanCa = l.shift_label || null;
        n.anhVao = l.photo_url || null;
        if (l.reason) n.ghiChu = l.reason;
        const ca = caChuanCuaLog(l, danhSachCa);
        if (ca) { n.ca = ca; n.coCaChuan = true; }
      }
    } else if (l.type === 'checkout') {
      // Lấy lần ra CUỐI CÙNG.
      n.raISO = l.checkin_time || l.created_at;
      n.ra = gioPhut(n.raISO);
      n.anhRa = l.photo_url || n.anhRa;
    } else if (l.type === 'leave_request') {
      n.xinNghi = true;
      if (l.reason) n.ghiChu = l.reason;
    }
  });

  theoNguoi.forEach((n) => {
    n.chenhLech = n.coCaChuan ? tinhChenhLech(n.ca, n.vao, n.ra) : null;
    if (n.raISO) n.trangThai = 'done';
    else if (n.vaoISO) n.trangThai = n.chenhLech?.loaiVao === 'late' ? 'late' : 'working';
    else if (n.xinNghi) n.trangThai = 'leave';
    else n.trangThai = 'upcoming';
    n.soGio = gioLamThuc(n.vaoISO, n.raISO);
  });

  return theoNguoi;
}

// ── Tổng hợp chênh lệch cho quản lý ─────────────────────────────────────────
export function tongHopChenhLech(danhSach) {
  let soMuon = 0, phutMuon = 0, soOT = 0, phutOT = 0, soDungGio = 0, soChuaCham = 0;
  danhSach.forEach((n) => {
    const d = n.chenhLech;
    if (d) {
      if (d.loaiVao === 'late') { soMuon += 1; phutMuon += d.lechVao; }
      else if (d.loaiVao === 'early' || d.loaiVao === 'on_time') soDungGio += 1;
      if (d.loaiRa === 'ot') { soOT += 1; phutOT += d.lechRa; }
    } else if (n.vaoISO) {
      soDungGio += 1; // đã vào ca nhưng không gán ca chuẩn -> không tính là muộn
    }
    if (!n.vaoISO && !n.xinNghi) soChuaCham += 1;
  });
  return { soMuon, phutMuon, soOT, phutOT, soDungGio, soChuaCham };
}

// ── Tóm tắt tháng cho một nhân viên ─────────────────────────────────────────
export function tomTatThang(logsThang, staffId, danhSachCa) {
  const theoNgay = new Map();
  (logsThang || []).filter((l) => l.staff_id === staffId).forEach((l) => {
    const ngay = l.work_date;
    if (!ngay) return;
    if (!theoNgay.has(ngay)) theoNgay.set(ngay, []);
    theoNgay.get(ngay).push(l);
  });

  const ngayList = [];
  let soNgayLam = 0, tongGio = 0, phutOT = 0, soMuon = 0, soNghi = 0;

  theoNgay.forEach((logs, ngay) => {
    const gom = gomChamCongNgay(logs, danhSachCa).get(staffId);
    if (!gom) return;
    ngayList.push({ ngay, ...gom });
    if (gom.vaoISO) {
      soNgayLam += 1;
      tongGio += gom.soGio || 0;
      if (gom.chenhLech?.loaiVao === 'late') soMuon += 1;
      if (gom.chenhLech?.loaiRa === 'ot') phutOT += gom.chenhLech.lechRa;
    } else if (gom.xinNghi) soNghi += 1;
  });

  return {
    ngayList: ngayList.sort((a, b) => a.ngay.localeCompare(b.ngay)),
    soNgayLam,
    tongGio: Math.round(tongGio),
    phutOT,
    soMuon,
    soNghi,
  };
}
