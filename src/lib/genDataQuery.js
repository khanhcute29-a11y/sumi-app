// Công cụ TRUY VẤN DỮ LIỆU LINH HOẠT cho Trợ lý Gen — cho phép Gen tự đọc dữ
// liệu thật để suy luận, thay vì chỉ vài tool cứng. AN TOÀN NHIỀU LỚP:
//   1. CHỈ ĐỌC (không có đường ghi ở đây).
//   2. Chạy qua supabase.from() dưới phiên người đăng nhập -> RLS lọc DÒNG.
//   3. Khóa CỘT theo vai trò: cột nhạy cảm (giá, giá vốn, lương, công nợ) KHÔNG
//      bao giờ được lấy cho tuyến dưới -> model không thấy -> không rò rỉ được.
//   4. Whitelist bảng + giới hạn số dòng + lọc có cấu trúc (không SQL thô).
import { supabase } from './supabaseClient';
import { FINANCE_ROLES, MANAGER_ROLES, INVENTORY_VIEW_ROLES, hasAnyRole } from './roles';

const SALES_VIEW = ['owner', 'admin', 'deputy_director_x41', 'deputy_director_x42', 'sale', 'cashier'];
const OPS_CUSTOMER = [...SALES_VIEW, 'shipper', 'shipper_school', 'transport_lead'];

// Bản đồ dữ liệu: mỗi bảng khai báo cột an toàn (ai query được đều xem) + cột
// nhạy cảm (chỉ nhóm vai trò chỉ định). `xem`=null nghĩa là mọi người đăng nhập
// query được (RLS vẫn lọc dòng); `xem`=[...] chặn cứng cả bảng cho nhóm khác.
export const DATA_MAP = {
  orders: {
    mo_ta: 'Đơn hàng (bánh kem, mặn/ngọt, macaron, trường học, teabreak)',
    xem: null,
    cot_an_toan: ['id', 'order_code', 'status', 'status_v2', 'order_type', 'address', 'required_at', 'delivery_date', 'delivery_time', 'created_at', 'completed_at', 'customer_id', 'kitchen_staff_name', 'shipper_staff_name', 'note', 'channel'],
    // Cột tiền (total/deposit/giá) KHÔNG cấp SELECT trực tiếp cho authenticated —
    // chỉ đọc qua RPC (công cụ tài chính chuyên biệt). Không đưa vào đây.
    cot_nhay_cam: {},
    embed: ', customers(name,phone)',
  },
  order_items: {
    mo_ta: 'Chi tiết món trong đơn (tên bánh, số lượng, size)',
    xem: null,
    cot_an_toan: ['id', 'order_id', 'name', 'name_snapshot', 'qty', 'quantity', 'size', 'unit', 'specification', 'category', 'candle', 'content'],
    // Giá món (price/unit_price) không cấp trực tiếp — chỉ qua RPC tài chính.
    cot_nhay_cam: {},
  },
  customers: {
    mo_ta: 'Khách hàng / trường học',
    xem: OPS_CUSTOMER,
    cot_an_toan: ['id', 'name', 'phone', 'address', 'channel', 'is_school', 'school_code', 'note', 'created_at'],
    cot_nhay_cam: { trust_score: MANAGER_ROLES, vip: MANAGER_ROLES, tax_code: FINANCE_ROLES },
  },
  products: {
    mo_ta: 'Sản phẩm / bảng giá',
    xem: null,
    cot_an_toan: ['id', 'name', 'category', 'unit', 'active'],
    cot_nhay_cam: { price: SALES_VIEW },
  },
  tasks: {
    mo_ta: 'Công việc / nhiệm vụ đã giao',
    xem: null,
    cot_an_toan: ['id', 'category', 'title', 'description', 'order_code', 'assignee_id', 'status', 'deadline', 'completed_at', 'created_at', 'late', 'started_at', 'accepted_at'],
    cot_nhay_cam: {},
  },
  finished_goods_stock: {
    mo_ta: 'Tồn kho thành phẩm (bánh trong tủ)',
    xem: null,
    cot_an_toan: ['id', 'product_id', 'size', 'branch', 'qty', 'store_location', 'production_date', 'expiry_date', 'color', 'packing', 'is_semi_finished'],
    cot_nhay_cam: {},
    embed: ', products(name)',
  },
  warehouse_stock: {
    mo_ta: 'Tồn kho nguyên vật liệu (kho xưởng)',
    xem: INVENTORY_VIEW_ROLES,
    cot_an_toan: ['id', 'name', 'qty', 'qty_label', 'unit', 'branch', 'status', 'low_stock_threshold', 'expiry_date', 'created_at'],
    cot_nhay_cam: { cost_per_unit: FINANCE_ROLES },
  },
  shift_logs: {
    mo_ta: 'Chấm công / ca làm việc',
    xem: [...MANAGER_ROLES, 'warehouse'],
    cot_an_toan: ['id', 'staff_id', 'staff_name', 'work_date', 'shift_label', 'type', 'checkin_time', 'late_minutes', 'reason', 'branch', 'created_at'],
    cot_nhay_cam: { wage_earned: FINANCE_ROLES },
  },
  expense_claims: {
    mo_ta: 'Khoản chi / đề xuất chi (tài chính)',
    xem: FINANCE_ROLES,
    cot_an_toan: ['id', 'claimant_name', 'amount', 'description', 'status', 'occurred_at', 'created_at', 'related_order_code', 'director_note', 'accountant_note'],
    cot_nhay_cam: {},
  },
  salary_advance_requests: {
    mo_ta: 'Tạm ứng lương (tài chính)',
    xem: FINANCE_ROLES,
    cot_an_toan: ['id', 'employee_name', 'amount', 'reason', 'needed_on', 'status', 'paid_at', 'created_at'],
    cot_nhay_cam: {},
  },
  incident_reports: {
    mo_ta: 'Báo cáo sự cố (giao hàng/bếp/kho)',
    xem: [...MANAGER_ROLES, 'warehouse', 'transport_lead'],
    cot_an_toan: ['id', 'order_code', 'category', 'code', 'label', 'note', 'reporter_name', 'reporter_role', 'status', 'created_at', 'resolved_at'],
    cot_nhay_cam: {},
  },
  profiles: {
    mo_ta: 'Nhân sự (danh bạ nội bộ)',
    xem: MANAGER_ROLES,
    cot_an_toan: ['id', 'full_name', 'role', 'station', 'active', 'approved', 'start_date', 'responsibilities', 'extra_roles'],
    cot_nhay_cam: { phone: MANAGER_ROLES },
  },
};

// Catalog gọn để nhúng vào prompt cho Gen biết có bảng gì (executor mới là nơi
// chốt chặn thật). Không liệt kê cột nhạy cảm để tránh Gen "khoe" cột cấm.
export const DATA_CATALOG = Object.entries(DATA_MAP)
  .map(([bang, m]) => `- ${bang}: ${m.mo_ta}. Cột chính: ${m.cot_an_toan.slice(0, 8).join(', ')}...`)
  .join('\n');

const OP_MAP = { '=': 'eq', '>=': 'gte', '<=': 'lte', '>': 'gt', '<': 'lt', '~': 'ilike' };

/**
 * Thực thi truy vấn đọc có kiểm soát. Chạy client-side dưới phiên người đăng
 * nhập -> RLS áp dụng. Trả { success, rows, cols } hoặc { denied, message }.
 */
export async function executeDataQuery({ bang, cot, loc, sap_xep, gioi_han }, userProfile) {
  const map = DATA_MAP[bang];
  if (!map) {
    return { denied: true, message: `Xin lỗi, em chỉ tra được các bảng: ${Object.keys(DATA_MAP).join(', ')}.` };
  }
  if (map.xem && !hasAnyRole(userProfile, map.xem)) {
    return { denied: true, message: `Xin lỗi, dữ liệu "${map.mo_ta}" nằm ngoài quyền của vai trò hiện tại.` };
  }

  // Cột được phép = cột an toàn + cột nhạy cảm mà vai trò được xem
  const allowed = [
    ...map.cot_an_toan,
    ...Object.keys(map.cot_nhay_cam).filter((c) => hasAnyRole(userProfile, map.cot_nhay_cam[c])),
  ];
  let selectedCols = allowed;
  if (cot && String(cot).trim()) {
    const requested = String(cot).split(',').map((c) => c.trim()).filter(Boolean);
    const ok = requested.filter((c) => allowed.includes(c));
    if (ok.length > 0) selectedCols = ok;
  }
  const selectStr = selectedCols.join(', ') + (map.embed || '');

  const limit = Math.min(Math.max(Number(gioi_han) || 15, 1), 25);
  let q = supabase.from(bang).select(selectStr).limit(limit);

  // Lọc có cấu trúc: "cot op giatri" phân tách bởi ';'. Chỉ áp trên CỘT ĐƯỢC PHÉP.
  if (loc && String(loc).trim()) {
    for (const clause of String(loc).split(';')) {
      const m = clause.trim().match(/^(\w+)\s*(>=|<=|=|>|<|~)\s*(.+)$/);
      if (!m) continue;
      const [, col, op, rawVal] = m;
      if (!allowed.includes(col)) continue; // không cho lọc trên cột bị ẩn
      const fn = OP_MAP[op];
      if (!fn) continue;
      const val = rawVal.trim();
      if (fn === 'ilike') q = q.ilike(col, `%${val}%`);
      else q = q[fn](col, val);
    }
  }

  // Sắp xếp: "cot desc" | "cot asc"
  if (sap_xep && String(sap_xep).trim()) {
    const [col, dir] = String(sap_xep).trim().split(/\s+/);
    if (allowed.includes(col)) q = q.order(col, { ascending: String(dir).toLowerCase() !== 'desc' });
  } else {
    if (allowed.includes('created_at')) q = q.order('created_at', { ascending: false });
  }

  try {
    const { data, error } = await q;
    if (error) throw error;
    return { success: true, rows: data || [], cols: selectedCols, bang };
  } catch (err) {
    console.error('[executeDataQuery] Lỗi:', err);
    return { success: false, error: err.message, rows: [] };
  }
}
