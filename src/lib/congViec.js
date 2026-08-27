// Tính toán cho phân hệ Quản lý Công việc.
//
// TÁCH RIÊNG khỏi giao diện để kiểm chứng được bằng máy, và để mọi con số trên
// ba màn hình (Nhân viên / Bếp trưởng / Giám đốc) đi ra từ MỘT chỗ duy nhất.
//
// LUỒNG TRẠNG THÁI (chỉ áp cho việc giao tay và việc phát sinh):
//   open ──[thợ Nhận việc]──> accepted ──[thợ báo Xong]──> pending_approval
//        ──[quản lý Duyệt]──> done          (hoặc trả lại về accepted)
//
// ⚠️ Việc thuộc ĐƠN HÀNG (`category = 'order_work'`) KHÔNG đi qua luồng này —
// loại đó đang lái màn hình Bếp và giữ nguyên cách chạy cũ.

// ── Trạng thái ──────────────────────────────────────────────────────────────
export const TRANG_THAI = {
  open: { nhan: 'Chờ nhận việc', mau: '#856404', nen: '#fff3cd', vien: '#f5d76e', icon: '⏳' },
  accepted: { nhan: 'Đang làm', mau: '#c35a22', nen: '#fff4ec', vien: '#f0c3a5', icon: '🔨' },
  pending_approval: { nhan: 'Chờ duyệt', mau: '#1e7e4c', nen: '#e6f4ea', vien: '#8fd6ae', icon: '📤' },
  done: { nhan: 'Hoàn thành', mau: '#1e7e4c', nen: '#e6f4ea', vien: '#8fd6ae', icon: '✅' },
  exempted: { nhan: 'Đã miễn trừ', mau: '#7a6b5d', nen: '#f2ede5', vien: '#ddd0bd', icon: '➖' },
  qua_han: { nhan: 'Quá hạn', mau: '#d03027', nen: '#fef2f2', vien: '#fca5a5', icon: '⚠️' },
};

export const UU_TIEN = {
  cao: { nhan: 'Gấp', mau: '#d03027', nen: '#fef2f2', vien: '#fca5a5' },
  thuong: { nhan: 'Bình thường', mau: '#7a6b5d', nen: '#f7f2ea', vien: '#e6d8c4' },
  thap: { nhan: 'Thong thả', mau: '#2b5bc7', nen: '#eef3ff', vien: '#bcd0f7' },
};

export const KHAU = [
  { key: 'all', nhan: 'Tất cả', icon: '🏭' },
  { key: 'nong', nhan: 'Bakery Nóng', icon: '🔥' },
  { key: 'lanh', nhan: 'Bakery Lạnh', icon: '❄️' },
  { key: 'xuong41', nhan: 'Macaron X41', icon: '🍡' },
  { key: 'xuong42', nhan: 'Xưởng 42', icon: '🏫' },
  { key: '_khac', nhan: 'Chưa gán khâu', icon: '🏬' },
];

export function nhanKhau(key) {
  return KHAU.find((k) => k.key === key)?.nhan || 'Chưa gán khâu';
}

export function khauCuaViec(t) {
  const s = (t?.station_id || '').trim();
  return KHAU.some((k) => k.key === s) ? s : '_khac';
}

// ── Thời gian ───────────────────────────────────────────────────────────────
// Đổi số phút thành chữ người đọc được: 45 -> "45 phút", 180 -> "3 tiếng".
export function doDaiThoiGian(phut) {
  const p = Math.abs(Math.round(phut || 0));
  if (p < 60) return `${p} phút`;
  const gio = Math.floor(p / 60);
  const du = p % 60;
  if (gio < 24) return du ? `${gio} tiếng ${du} phút` : `${gio} tiếng`;
  const ngay = Math.floor(gio / 24);
  return `${ngay} ngày${gio % 24 ? ` ${gio % 24} tiếng` : ''}`;
}

export function phutGiua(a, b) {
  if (!a || !b) return null;
  const t1 = new Date(a).getTime();
  const t2 = new Date(b).getTime();
  if (Number.isNaN(t1) || Number.isNaN(t2)) return null;
  return Math.round((t2 - t1) / 60000);
}

export function gioNgan(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function ngayGio(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const homNay = new Date();
  const cungNgay = d.toDateString() === homNay.toDateString();
  return cungNgay
    ? `${gioNgan(iso)} (Hôm nay)`
    : d.toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

// ── Trạng thái thực tế của một việc ─────────────────────────────────────────
export function daDong(t) {
  return t?.status === 'done' || t?.status === 'exempted';
}

export function quaHan(t) {
  if (!t?.deadline || daDong(t)) return false;
  // Thợ đã báo xong rồi thì KHÔNG tính là "quá hạn cần can thiệp" nữa — lúc này
  // việc đang nằm ở khâu quản lý duyệt, chậm là chậm ở quản lý chứ không phải
  // lỗi của thợ. Trễ so với hạn vẫn được chấm điểm ở nhanKpiHoanThanh().
  if (t.completed_at) return false;
  return new Date(t.deadline).getTime() < Date.now();
}

// Việc thợ đã nộp mà quản lý ngâm quá lâu — để Giám đốc nhìn thấy nút cổ chai.
export function ngamDuyetQuaLau(t, nguongPhut = 120) {
  if (t?.status !== 'pending_approval' || !t?.completed_at) return false;
  return phutGiua(t.completed_at, new Date().toISOString()) > nguongPhut;
}

// Trả về khoá trong TRANG_THAI. Quá hạn được ưu tiên hiện lên trước.
export function trangThaiViec(t) {
  if (!t) return 'open';
  if (quaHan(t)) return 'qua_han';
  return TRANG_THAI[t.status] ? t.status : 'open';
}

export function treBaoNhieu(t) {
  if (!t?.deadline) return null;
  const moc = daDong(t) ? (t.completed_at || t.approved_at) : new Date().toISOString();
  return phutGiua(t.deadline, moc);
}

// Việc quá hạn từ 1 ngày trở lên VÀ chưa xong — ngưỡng để Giám đốc được phép
// can thiệp trực tiếp (xoá/gia hạn). Khớp đúng điều kiện phía RPC
// sumi_can_thiep_qua_han dưới database — sửa một bên mà quên bên kia thì nút
// bấm sẽ hiện sai lúc (hiện ra nhưng RPC từ chối, hoặc ngược lại).
export function duocCanThiepQuaHan(t) {
  if (!quaHan(t)) return false;
  const tre = treBaoNhieu(t);
  return tre !== null && tre >= 1440;
}

// ── Nhãn KPI hiện trên thẻ ──────────────────────────────────────────────────
// Nhận việc: so giờ nhận với giờ được giao. Chậm quá 15 phút thì bị trừ điểm.
export function nhanKpiNhanViec(t) {
  if (!t?.accepted_at || !t?.created_at) return null;
  const phut = phutGiua(t.created_at, t.accepted_at);
  if (phut === null) return null;
  if (phut > 15) return { loai: 'tre', chu: `Trễ xác nhận ${doDaiThoiGian(phut)}` };
  return { loai: 'dung', chu: `Nhận việc sau ${doDaiThoiGian(phut)}` };
}

// Hoàn thành: so giờ báo xong với hạn chót.
export function nhanKpiHoanThanh(t) {
  if (!t?.deadline || !t?.completed_at) return null;
  const phut = phutGiua(t.deadline, t.completed_at);
  if (phut === null) return null;
  if (phut > 0) return { loai: 'tre', chu: `Trễ ${doDaiThoiGian(phut)}` };
  return { loai: 'dung', chu: `Sớm ${doDaiThoiGian(phut)}` };
}

// Điểm KPI dự kiến — hiện cho người dùng thấy trước, database mới là nơi chốt.
export function diemDuKien(t) {
  if (!t?.deadline || !t?.completed_at) return null;
  let diem = phutGiua(t.deadline, t.completed_at) > 0 ? -5 : 10;
  if (t.nhan_viec_tre) diem -= 2;
  return diem;
}

// ── Vòng đời 6 bước (đúng mockup task-lifecycle-v2-approved) ────────────────
//
// Chỉ SUY RA từ các mốc thời gian đã có sẵn trên `viec` — không tự đặt trạng
// thái, không gọi thêm CSDL. Bước "Lương" được đánh dấu xong ngay khi
// `status === 'done'`, vì RPC duyệt việc ghi vào `task_kpi_logs` trong CÙNG
// một giao dịch với việc chuyển status — không có độ trễ nào giữa hai mốc đó.
export function buocVongDoi(viec) {
  const daNhan = !!viec?.accepted_at;
  const dangLam = viec?.status === 'accepted' || (viec?.status === 'open' && daNhan);
  const daBaoXong = !!viec?.completed_at;
  const choDuyet = viec?.status === 'pending_approval';
  const daXong = viec?.status === 'done';
  const treNhan = !daNhan && quaHan(viec);
  const treLam = dangLam && quaHan(viec);

  const b = (nhan, trang_thai, gio) => ({ nhan, trang_thai, gio });

  return [
    b('Giao', 'done', gioNgan(viec?.created_at)),
    b('Nhận', daNhan ? 'done' : (treNhan ? 'bad' : 'now'), daNhan ? gioNgan(viec.accepted_at) : ''),
    b('Làm', daBaoXong ? 'done' : (dangLam ? (treLam ? 'bad' : 'now') : 'cho'),
      dangLam && !daBaoXong ? doDaiThoiGian(phutGiua(viec.accepted_at, new Date().toISOString())) : ''),
    b('Báo xong', daBaoXong ? 'done' : 'cho', daBaoXong ? gioNgan(viec.completed_at) : ''),
    b('Duyệt', daXong ? 'done' : (choDuyet ? 'now' : 'cho'), daXong && viec.approved_at ? gioNgan(viec.approved_at) : ''),
    b('Lương', daXong ? 'done' : 'cho', ''),
  ];
}

// ── Phân nhóm cho màn hình NHÂN VIÊN ────────────────────────────────────────
export function nhomViecNhanVien(tasks) {
  const ds = (tasks || []).filter((t) => !t.exclusion_reason_code);
  return {
    choNhan: ds.filter((t) => t.status === 'open' && !t.accepted_at),
    dangLam: ds.filter((t) => t.status === 'accepted' || (t.status === 'open' && t.accepted_at)),
    choDuyet: ds.filter((t) => t.status === 'pending_approval'),
    daXong: ds.filter((t) => t.status === 'done'),
    mienTru: ds.filter((t) => t.status === 'exempted'),
  };
}

// ── Phân nhóm cho màn hình BẾP TRƯỞNG ───────────────────────────────────────
// toiId: id của bếp trưởng đang đăng nhập.
export function nhomViecQuanLy(tasks, toiId) {
  const ds = tasks || [];
  return {
    // Đã giao nhưng thợ CHƯA bấm xác nhận — quản lý cần nhắc.
    // Phải chặn theo CẢ trạng thái, không chỉ dựa vào `accepted_at`: dữ liệu cũ
    // (trước 26/08) không có cột đó, nên một việc đang "chờ duyệt" vẫn lọt vào
    // nhóm "chưa nhận" nếu chỉ nhìn `accepted_at`.
    chuaNhan: ds.filter((t) => t.assignee_id && t.status === 'open' && !t.accepted_at),
    // Việc mình được giao.
    duocGiao: ds.filter((t) => t.assignee_id === toiId && !daDong(t)),
    // Việc mình đã giao cho người khác, đang chạy.
    daGiao: ds.filter((t) => t.assignee_id && t.assignee_id !== toiId && !daDong(t)
      && t.status !== 'pending_approval'),
    // Việc thợ báo xong, chờ mình duyệt.
    choDuyet: ds.filter((t) => t.status === 'pending_approval'),
    daXong: ds.filter((t) => t.status === 'done'),
  };
}

// ── Tổng hợp cho màn hình GIÁM ĐỐC ──────────────────────────────────────────
export function tomTatViec(tasks) {
  const ds = tasks || [];
  return {
    dangLam: ds.filter((t) => !daDong(t) && !quaHan(t)).length,
    quaHan: ds.filter((t) => quaHan(t)).length,
    choDuyet: ds.filter((t) => t.status === 'pending_approval').length,
    hoanThanh: ds.filter((t) => t.status === 'done').length,
  };
}

export function demTheoKhau(tasks) {
  const dem = { all: 0 };
  KHAU.forEach((k) => { if (k.key !== 'all') dem[k.key] = 0; });
  (tasks || []).forEach((t) => {
    dem.all += 1;
    const k = khauCuaViec(t);
    dem[k] = (dem[k] || 0) + 1;
  });
  return dem;
}

// Việc quá hạn đẩy lên đầu, trễ nhiều nhất trước.
export function sapXepQuaHan(tasks) {
  return (tasks || [])
    .filter((t) => quaHan(t))
    .sort((a, b) => new Date(a.deadline) - new Date(b.deadline));
}

// ── Dự án ───────────────────────────────────────────────────────────────────
export function tienDoDuAn(tasks, projectId) {
  const ds = (tasks || []).filter((t) => t.project_id === projectId);
  const xong = ds.filter((t) => t.status === 'done').length;
  return {
    tong: ds.length,
    xong,
    phanTram: ds.length ? Math.round((xong / ds.length) * 100) : 0,
  };
}

// ── Tìm kiếm ────────────────────────────────────────────────────────────────
function bo_dau(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

export function locTheoTuKhoa(tasks, tuKhoa, tenTheoId = {}) {
  const q = bo_dau(tuKhoa).trim();
  if (!q) return tasks || [];
  return (tasks || []).filter((t) => bo_dau(
    [t.title, t.description, t.order_code, tenTheoId[t.assignee_id], tenTheoId[t.created_by]]
      .filter(Boolean).join(' '),
  ).includes(q));
}

// ── Các bước con ────────────────────────────────────────────────────────────
export function docBuocCon(t) {
  const b = t?.sub_steps;
  if (Array.isArray(b)) return b.filter((x) => x && typeof x.ten === 'string');
  return [];
}

export function tienDoBuocCon(t) {
  const b = docBuocCon(t);
  const xong = b.filter((x) => x.xong).length;
  return { tong: b.length, xong, phanTram: b.length ? Math.round((xong / b.length) * 100) : 0 };
}
