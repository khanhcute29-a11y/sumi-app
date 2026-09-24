// "Bách khoa toàn thư" của app Sumi Bakery cho Trợ lý Gen.
// Mỗi mục = 1 tính năng/màn hình: key trùng tab trong App.jsx `screens` để Gen
// gửi link điều hướng (sự kiện 'sumi-navigate' { tab }). Trường `vai_tro` chỉ là
// TƯ VẤN để Gen gợi ý đúng người — chốt chặn thật nằm ở RLS + gate trong màn hình.
//
// GHI CHÚ: nội dung `lam_sao` là bản khởi đầu do quét code; chủ tiệm nên rà lại
// từng bước cho khớp thao tác thực tế rồi bổ sung.

import { hasAnyRole } from './roles';

// Nhóm vai trò dùng lại cho gọn.
const AI_MANAGER = ['owner', 'admin', 'deputy_director_x41', 'deputy_director_x42'];
const AI_FINANCE = ['owner', 'admin', 'accountant', 'cashier'];
const AI_KITCHEN = ['kitchen_lead', 'kitchen_deputy', 'bakery'];
const AI_ALL = null; // null = mọi vai trò đều dùng được

export const APP_GUIDE = [
  { key: 'home', ten: 'Trang chủ / Hôm nay', vai_tro: AI_ALL,
    tu_khoa: ['trang chủ', 'hôm nay', 'màn hình chính', 'tổng quan cá nhân'],
    mo_ta: 'Màn hình đầu tiên khi mở app — điều phối theo vai trò (Giám đốc thấy doanh thu, nhân viên thấy việc của mình).',
    lam_sao: 'Bấm nút "Hôm nay" ở thanh dưới cùng.' },

  { key: 'orders', ten: 'Đơn hàng', vai_tro: AI_ALL,
    tu_khoa: ['đơn hàng', 'tạo đơn', 'sửa đơn', 'sửa giá', 'tra cứu đơn', 'hủy đơn', 'đặt bánh'],
    mo_ta: 'Xem/tạo/sửa/tra cứu tất cả đơn hàng (bánh kem, bánh mặn, macaron, trường học, teabreak). Bấm 1 đơn để mở chi tiết, sửa món/giá, đổi trạng thái.',
    lam_sao: 'Vào "Đơn Hàng" → bấm nút tạo đơn để lên đơn mới, hoặc bấm vào 1 đơn để xem/sửa chi tiết. (Có thể nhờ Gen tạo đơn hoặc tra cứu nhanh rồi bấm "Xem chi tiết".)' },

  { key: 'kds', ten: 'Bếp KDS', vai_tro: [...AI_KITCHEN, 'owner', 'admin', 'deputy_director_x41', 'deputy_director_x42'],
    tu_khoa: ['bếp', 'kds', 'làm bánh', 'nhận đơn bếp', 'trạm bếp', 'bếp nóng', 'bếp lạnh', 'xưởng 41', 'xưởng 42'],
    mo_ta: 'Màn hình bếp theo trạm (Nóng/Lạnh/Xưởng 41/42): nhận đơn về làm, cập nhật đang làm → làm xong chờ giao, đặt hẹn giờ.',
    lam_sao: 'Vào "Bếp KDS" → chọn trạm của mình → bấm nhận đơn, làm xong bấm hoàn tất công đoạn.' },

  { key: 'warehouse', ten: 'Kho hàng (Nguyên vật liệu)', vai_tro: ['warehouse', 'kho_bakery', 'kho_xuong41', 'kho_xuong42', 'owner', 'admin'],
    tu_khoa: ['kho', 'nguyên liệu', 'nhập kho', 'xuất kho', 'tồn kho nvl', 'vật tư', 'kiểm kê'],
    mo_ta: 'Quản lý tồn kho nguyên vật liệu theo chi nhánh (Bakery/Xưởng 41/42): nhập kho, xuất kho, xem tồn.',
    lam_sao: 'Vào "Kho Hàng" → chọn chi nhánh kho → bấm nhập/xuất và điền số lượng.' },

  { key: 'shipping', ten: 'Vận chuyển / Giao hàng', vai_tro: ['shipper', 'shipper_school', 'transport_lead', 'owner', 'admin'],
    tu_khoa: ['giao hàng', 'vận chuyển', 'shipper', 'nhận giao', 'ảnh giao hàng', 'lộ trình'],
    mo_ta: 'Danh sách đơn sẵn giao: nhận giao, chụp ảnh giao hàng kèm GPS, thu COD, báo sự cố tuyến.',
    lam_sao: 'Vào "Vận Chuyển" → nhận đơn cần giao → tới nơi chụp ảnh xác nhận giao xong.' },

  { key: 'shifts', ten: 'Ca làm việc / Chấm công', vai_tro: AI_ALL,
    tu_khoa: ['chấm công', 'ca làm', 'vào ca', 'ra ca', 'điểm danh', 'lịch làm'],
    mo_ta: 'Chấm công vào/ra ca (mọi vai trò kể cả Giám đốc/Kế toán), xem lịch ca.',
    lam_sao: 'Vào "Ca Làm Việc" → bấm chấm công vào ca khi bắt đầu, ra ca khi kết thúc (có lấy vị trí GPS).' },

  { key: 'tasks', ten: 'Quản lý công việc', vai_tro: AI_MANAGER,
    tu_khoa: ['công việc', 'giao việc', 'quản lý việc', 'đầu việc', 'nhiệm vụ'],
    mo_ta: 'Giao việc cho nhân sự, theo dõi tiến độ, nghiệm thu (có thể yêu cầu ảnh).',
    lam_sao: 'Vào "Quản Lý Công Việc" → tạo việc, chọn người làm, đặt hạn. (Có thể nhờ Gen giao việc bằng lời.)' },

  { key: 'staffTasks', ten: 'Việc của tôi', vai_tro: AI_ALL,
    tu_khoa: ['việc của tôi', 'việc được giao', 'nhiệm vụ của tôi'],
    mo_ta: 'Danh sách việc được giao cho chính mình: nhận việc, làm, báo hoàn thành (chụp ảnh nếu cần).',
    lam_sao: 'Vào "Việc Của Tôi" → bấm nhận việc → làm xong bấm hoàn thành.' },

  { key: 'financeRequests', ten: 'Chi & Tạm ứng', vai_tro: AI_ALL,
    tu_khoa: ['tạm ứng', 'xin ứng lương', 'báo chi', 'khoản chi', 'đề xuất chi'],
    mo_ta: 'Nhân sự gửi phiếu xin tạm ứng lương hoặc báo khoản chi; Giám đốc duyệt; Kế toán chi tiền.',
    lam_sao: 'Vào "Chi & Tạm Ứng" → tạo phiếu tạm ứng/khoản chi. (Có thể nhờ Gen lập phiếu bằng lời.)' },

  { key: 'approvals', ten: 'Yêu cầu duyệt', vai_tro: AI_MANAGER,
    tu_khoa: ['duyệt', 'phê duyệt', 'yêu cầu chờ duyệt', 'duyệt chi', 'duyệt nghỉ phép'],
    mo_ta: 'Hộp duyệt của Giám đốc: khoản chi, tạm ứng, nghỉ phép, tăng ca, sửa đơn... chờ phê duyệt.',
    lam_sao: 'Vào "Yêu Cầu Duyệt" → xem từng phiếu → bấm Duyệt hoặc Từ chối.' },

  { key: 'accountantOverview', ten: 'Kế toán tổng quan', vai_tro: AI_FINANCE,
    tu_khoa: ['kế toán', 'chốt quỹ', 'sổ chi', 'chứng từ', 'kế toán tổng quan', 'quỹ ngày'],
    mo_ta: 'Màn tổng quan Kế toán: sổ chi (xem lại ảnh chứng từ), chi theo phòng ban, Chốt Quỹ Ngày.',
    lam_sao: 'Vào menu → "Kế Toán Tổng Quan". (Chỉ Chủ/Quản lý/Kế toán/Thu ngân thấy.)' },

  { key: 'cashbook', ten: 'Sổ quỹ', vai_tro: AI_FINANCE,
    tu_khoa: ['sổ quỹ', 'quỹ tiền mặt', 'thu chi', 'cashbook'],
    mo_ta: 'Sổ quỹ tiền mặt: các khoản thu/chi đã ghi nhận.',
    lam_sao: 'Vào "Sổ Quỹ" ở menu.' },

  { key: 'schoolRevenue', ten: 'Doanh thu trường học', vai_tro: ['owner', 'admin', 'accountant', 'deputy_director_x42'],
    tu_khoa: ['trường học', 'doanh thu trường', 'đơn trường', 'b2b trường'],
    mo_ta: 'Doanh thu & tình hình đơn Trường học (đơn trường vốn ẩn với hầu hết nhân sự).',
    lam_sao: 'Vào "Doanh Thu Trường Học" ở menu.' },

  { key: 'customerDebt', ten: 'Công nợ khách hàng', vai_tro: AI_FINANCE,
    tu_khoa: ['công nợ', 'khách còn nợ', 'thu hồi nợ', 'nợ khách'],
    mo_ta: 'Danh sách công nợ cần thu từ khách (đơn hoàn thành chưa thu đủ tiền).',
    lam_sao: 'Vào "Công Nợ Khách Hàng" ở menu. (Có thể hỏi Gen "công nợ cần thu".)' },

  { key: 'crm', ten: 'Khách hàng', vai_tro: [...AI_MANAGER, 'sale', 'cashier'],
    tu_khoa: ['khách hàng', 'crm', 'thêm khách', 'thông tin khách', 'số điện thoại khách'],
    mo_ta: 'Danh bạ khách hàng: thêm/sửa khách, xem lịch sử đơn.',
    lam_sao: 'Vào "Khách Hàng" ở menu.' },

  { key: 'products', ten: 'Sản phẩm / Bảng giá', vai_tro: [...AI_MANAGER, 'sale', 'cashier', 'warehouse'],
    tu_khoa: ['sản phẩm', 'bảng giá', 'mặt hàng', 'giá bán', 'menu bánh'],
    mo_ta: 'Danh mục sản phẩm & giá bán.',
    lam_sao: 'Vào "Sản Phẩm" ở menu.' },

  { key: 'staff', ten: 'Nhân viên', vai_tro: ['owner', 'admin'],
    tu_khoa: ['nhân viên', 'nhân sự', 'thêm nhân viên', 'phân quyền', 'đổi vai trò', 'khóa tài khoản'],
    mo_ta: 'Quản lý nhân sự: thêm/sửa nhân viên, gán vai trò/trạm, duyệt tài khoản, khóa/mở.',
    lam_sao: 'Vào "Nhân Viên" ở menu. (Chỉ Chủ/Quản lý.)' },

  { key: 'incidents', ten: 'Báo cáo sự cố', vai_tro: AI_ALL,
    tu_khoa: ['sự cố', 'báo sự cố', 'incident', 'lỗi giao hàng', 'lỗi bếp', 'lỗi kho'],
    mo_ta: 'Báo sự cố 1 chạm theo mã (giao hàng LOG, bếp KIT, kho INV...).',
    lam_sao: 'Vào "Báo Cáo Sự Cố" → chọn mã sự cố → ghi chú → gửi.' },

  { key: 'kpi', ten: 'KPI', vai_tro: AI_MANAGER,
    tu_khoa: ['kpi', 'hiệu suất', 'chỉ tiêu', 'đo lường'],
    mo_ta: 'Theo dõi KPI/hiệu suất theo cá nhân, bộ phận, kỳ.',
    lam_sao: 'Vào "KPI" (hoặc "Tổng Quan KPI") ở menu.' },

  { key: 'visualGuides', ten: 'Hướng dẫn bằng ảnh', vai_tro: AI_ALL,
    tu_khoa: ['hướng dẫn', 'hướng dẫn bằng ảnh', 'sop', 'quy trình', 'cách làm bánh'],
    mo_ta: 'Bộ hướng dẫn từng bước bằng ảnh (SOP) cho nhân sự làm đúng ngay từ đầu.',
    lam_sao: 'Vào "Hướng Dẫn Bằng Ảnh" → chọn việc → xem từng bước (có nút nghe đọc).' },

  { key: 'chat', ten: 'Tin nhắn nội bộ', vai_tro: AI_ALL,
    tu_khoa: ['chat', 'tin nhắn', 'nhắn tin', 'trao đổi nội bộ'],
    mo_ta: 'Chat nội bộ giữa các phòng ban/nhân sự.',
    lam_sao: 'Bấm "Chat" ở thanh dưới cùng.' },

  { key: 'feed', ten: 'Bảng tin công ty', vai_tro: AI_ALL,
    tu_khoa: ['bảng tin', 'thông báo', 'feed', 'đăng thông báo'],
    mo_ta: 'Bảng tin/thông báo chung của công ty.',
    lam_sao: 'Bấm "Bảng tin" ở thanh dưới cùng.' },

  { key: 'settings', ten: 'Thiết lập', vai_tro: AI_ALL,
    tu_khoa: ['thiết lập', 'cài đặt', 'đổi mật khẩu', 'âm thanh', 'cỡ chữ', 'đăng xuất'],
    mo_ta: 'Cài đặt cá nhân: âm thanh thông báo, cỡ chữ, đăng xuất...',
    lam_sao: 'Vào "Thiết Lập" ở menu.' },
];

// Tìm tính năng khớp câu hỏi. Trả về tối đa `limit` mục, ưu tiên khớp từ khóa/tên.
// Mỗi mục kèm cờ `duocPhep` = vai trò hiện tại có nằm trong danh sách tư vấn không.
export function findAppGuide(cauHoi, profile, limit = 3) {
  const q = String(cauHoi || '').toLowerCase().trim();
  if (!q) return [];
  const scored = APP_GUIDE.map((e) => {
    let score = 0;
    if (e.ten.toLowerCase().includes(q)) score += 5;
    for (const kw of e.tu_khoa) {
      if (q.includes(kw)) score += 4;
      else if (kw.includes(q) && q.length >= 3) score += 2;
    }
    // Khớp lỏng theo từng từ trong câu hỏi
    for (const word of q.split(/\s+/)) {
      if (word.length < 3) continue;
      if (e.tu_khoa.some((kw) => kw.includes(word)) || e.ten.toLowerCase().includes(word)) score += 1;
    }
    return { e, score };
  })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return scored.map(({ e }) => ({
    key: e.key,
    ten: e.ten,
    mo_ta: e.mo_ta,
    lam_sao: e.lam_sao,
    duocPhep: e.vai_tro === null ? true : hasAnyRole(profile, e.vai_tro),
  }));
}
