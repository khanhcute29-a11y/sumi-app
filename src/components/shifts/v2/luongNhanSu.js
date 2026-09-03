// Phân luồng nhân sự cho màn hình Giám đốc.
//
// ⚠️ PHÂN BIỆT RÕ HAI THỨ, ĐỪNG TRỘN:
//
//   • `boPhanCuaHoSo()` trong lib/chamCong.js  -> dùng để TÍNH LƯƠNG.
//     Nó phản chiếu hàm SQL `sumi_bo_phan_cham_cong` và quyết định ca chuẩn,
//     mốc đi muộn, tiền chuyên cần. Sửa nó là đổi lương người thật.
//
//   • `luongCuaHoSo()` trong tệp này          -> chỉ để XEM CHO DỄ.
//     Chia nhỏ hơn một bậc để Giám đốc nhìn ra ai thuộc quầy nào, bếp nào.
//     KHÔNG dùng con số ở đây để tính bất cứ khoản tiền nào.
//
// Cả tiệm có 4 bộ phận theo ca (bakery / xuong41 / xuong42 / van_tai), riêng
// Bakery đông người và làm nhiều việc khác nhau nên tách tiếp thành 4 luồng.

export const LUONG = {
  thu_ngan: { ma: 'thu_ngan', ten: 'Thu ngân', icon: '🧾', boPhan: 'bakery' },
  ban_hang: { ma: 'ban_hang', ten: 'Bán hàng', icon: '🏬', boPhan: 'bakery' },
  bep_nong: { ma: 'bep_nong', ten: 'Bếp nóng', icon: '🔥', boPhan: 'bakery' },
  bep_lanh: { ma: 'bep_lanh', ten: 'Bếp lạnh', icon: '🎂', boPhan: 'bakery' },
  xuong41: { ma: 'xuong41', ten: 'Xưởng 41', icon: '🧁', boPhan: 'xuong41' },
  xuong42: { ma: 'xuong42', ten: 'Xưởng 42', icon: '🏫', boPhan: 'xuong42' },
  van_tai: { ma: 'van_tai', ten: 'Vận tải', icon: '🚚', boPhan: 'van_tai' },
  _khac: { ma: '_khac', ten: 'Khối văn phòng', icon: '👤', boPhan: null },
};

// Thứ tự hiện trên màn hình — theo đúng cơ cấu tiệm, không sắp theo số lượng.
export const THU_TU_LUONG = [
  'bep_lanh', 'bep_nong', 'xuong41', 'xuong42',
  'thu_ngan', 'ban_hang', 'van_tai', '_khac',
];

// Gom các luồng thành các khối để hiện mục "Theo bộ phận" — TÁCH RIÊNG Bếp
// Lạnh/Bếp Nóng/Cửa hàng thay vì gộp chung 1 khối "Bakery" như trước, theo
// đúng yêu cầu Giám đốc (04/09/2026): "Bếp Lạnh, bếp nóng, xưởng 41, xưởng
// 42, Cửa hàng (Thu Ngân, bán hàng), Vận tải" — mỗi khâu là 1 khối riêng để
// bấm vào thấy đúng người của khâu đó, không lẫn Bếp với Cửa hàng.
export const KHOI = [
  { ma: 'bep_lanh', ten: 'Bếp Lạnh', icon: '🎂', luong: ['bep_lanh'] },
  { ma: 'bep_nong', ten: 'Bếp Nóng', icon: '🔥', luong: ['bep_nong'] },
  { ma: 'xuong41', ten: 'Xưởng 41', icon: '🧁', luong: ['xuong41'] },
  { ma: 'xuong42', ten: 'Xưởng 42', icon: '🏫', luong: ['xuong42'] },
  { ma: 'cua_hang', ten: 'Cửa hàng', icon: '🏬', luong: ['thu_ngan', 'ban_hang'] },
  { ma: 'van_tai', ten: 'Vận tải', icon: '🚚', luong: ['van_tai'] },
  { ma: '_khac', ten: 'Khối văn phòng', icon: '👤', luong: ['_khac'] },
];

// Khối nào cần chia thêm theo CẤP BẬC (Bếp trưởng/Bếp phó/Nhân viên) khi hiện
// danh sách người — Cửa hàng và Vận tải không có 2 cấp bậc này nên không cần.
export const KHOI_CO_CAP_BAC = new Set(['bep_lanh', 'bep_nong', 'xuong41', 'xuong42']);

// Cấp bậc trong khâu — dùng vai trò THẬT trong database (đã chuẩn hoá về
// canonical 'kitchen_lead'/'kitchen_deputy' cho mọi bếp — xem lib/roles.js
// resolveRoleAndStation; riêng Xưởng 41/42 dùng 'deputy_director_x41/x42' vì
// đó là chức danh quản lý cao nhất của xưởng, đứng vai trò như Bếp trưởng).
export const CAP_BAC = {
  truong: { ma: 'truong', ten: 'Bếp trưởng / Trợ lý Giám đốc xưởng', icon: '👑' },
  pho: { ma: 'pho', ten: 'Bếp phó', icon: '🥈' },
  nhan_vien: { ma: 'nhan_vien', ten: 'Nhân viên', icon: '👤' },
};
export const THU_TU_CAP_BAC = ['truong', 'pho', 'nhan_vien'];

export function capBacCuaHoSo(hoSo) {
  const vai = [hoSo?.role, ...(hoSo?.extra_roles || [])].filter(Boolean).map(String);
  if (vai.some((r) => r === 'kitchen_lead' || r === 'deputy_director_x41' || r === 'deputy_director_x42')) return 'truong';
  if (vai.includes('kitchen_deputy')) return 'pho';
  return 'nhan_vien';
}

/**
 * Luồng của một nhân sự.
 *
 * Ưu tiên `station` vì đó là khâu người đó thực sự đứng. Hồ sơ chưa gán khâu
 * thì suy từ chức danh — 21/25 hồ sơ đang bỏ trống cột station nên nhánh suy
 * từ chức danh mới là nhánh chạy nhiều nhất, không phải nhánh dự phòng.
 */
export function luongCuaHoSo(hoSo) {
  const st = String(hoSo?.station || '').trim().toLowerCase();
  if (st === 'lanh') return 'bep_lanh';
  if (st === 'nong') return 'bep_nong';
  if (st === 'xuong41') return 'xuong41';
  if (st === 'xuong42') return 'xuong42';

  const vai = [hoSo?.role, ...(hoSo?.extra_roles || [])].filter(Boolean).map(String);
  const co = (...ds) => ds.some((r) => vai.includes(r));

  if (co('cashier')) return 'thu_ngan';
  if (co('sale')) return 'ban_hang';
  if (co('shipper', 'shipper_school', 'transport_lead')) return 'van_tai';

  if (co('kitchen_lead_hot', 'kitchen_deputy_hot', 'baker_hot')) return 'bep_nong';
  if (co('kitchen_lead_cold', 'kitchen_deputy_cold', 'baker_cold')) return 'bep_lanh';
  if (co('kitchen_lead_macaron', 'baker_macaron', 'deputy_director_x41')) return 'xuong41';
  if (co('baker_x42', 'kho_xuong42', 'deputy_director_x42')) return 'xuong42';

  // Bếp trưởng/bếp phó chung chung, thợ bánh chưa gán khâu: xếp về bếp lạnh —
  // đây là khâu đông nhất của Bakery. Không đoán bừa sang xưởng.
  if (co('kitchen_lead', 'kitchen_deputy', 'bakery', 'kho_bakery')) return 'bep_lanh';

  // Giám đốc, kế toán, kho tổng: không đứng khâu nào cả.
  return '_khac';
}

/** Người này có phải chấm công theo ca cố định không? */
export function theoCaCoDinh(hoSo) {
  return luongCuaHoSo(hoSo) !== '_khac';
}

/**
 * Bốn nhóm trạng thái mà Giám đốc bấm vào ở ô tổng quan.
 *
 * `hop(cham, hoSo)` — PHẢI nhận cả hồ sơ, không chỉ bản chấm công.
 * Lý do: người chưa chấm lần nào thì bản ghi chấm công của họ rỗng hoàn toàn
 * (`ca: null`), nên nhìn vào đó KHÔNG phân biệt được thợ bánh quên chấm với
 * kế toán vốn không phải chấm. Phải tra ngược lên chức danh mới biết.
 * Đếm nhầm kế toán vào ô "Chưa chấm" là báo động giả mỗi sáng.
 */
export const NHOM_TRANG_THAI = {
  daVao: {
    ma: 'daVao', ten: 'Đã vào ca', icon: '🟢', lop: 'good',
    hop: (c) => !!c?.vaoISO,
  },
  daRa: {
    ma: 'daRa', ten: 'Đã ra ca', icon: '🏁', lop: '',
    hop: (c) => !!c?.raISO,
  },
  muon: {
    ma: 'muon', ten: 'Đi muộn', icon: '🟠', lop: 'alert',
    hop: (c) => c?.chenhLech?.loaiVao === 'late',
  },
  chuaCham: {
    ma: 'chuaCham', ten: 'Chưa chấm', icon: '🔴', lop: 'alert',
    hop: (c, h) => !c?.vaoISO && !c?.xinNghi && theoCaCoDinh(h),
  },
  xinNghi: {
    ma: 'xinNghi', ten: 'Xin nghỉ', icon: '🏖', lop: '',
    hop: (c) => !!c?.xinNghi && !c?.vaoISO,
  },
};

/**
 * Đếm theo từng luồng cho MỘT nhóm trạng thái.
 * Trả về mảng đã sắp theo đúng thứ tự cơ cấu tiệm, bỏ luồng không có ai.
 */
export function demTheoLuong(danhSach, locTrangThai) {
  const dem = new Map();
  (danhSach || []).forEach(({ hoSo, cham }) => {
    if (locTrangThai && !locTrangThai(cham, hoSo)) return;
    const l = luongCuaHoSo(hoSo);
    if (!dem.has(l)) dem.set(l, []);
    dem.get(l).push({ hoSo, cham });
  });

  return THU_TU_LUONG
    .filter((ma) => dem.has(ma))
    .map((ma) => ({ ...LUONG[ma], nguoi: dem.get(ma) }));
}
