import { supabase } from './supabaseClient';
import { downloadXlsx } from './xlsxExport';
import { rangeBounds } from './exportSummary';

// Xuất KPI từng người (Giám đốc 20/09/2026): 1 file Excel — sheet "Tổng hợp"
// (mỗi nhân viên 1 dòng) + mỗi người 1 sheet chi tiết. KHÔNG viết lại cách tính:
// gọi đúng các RPC màn Tổng quan KPI đang dùng (list_staff_kpi_overview,
// get_employee_kpi_overview, compute_kpi_score, get_staff_attendance_detail) nên
// số trong file khớp số trên màn hình. Toàn bộ RPC đã chặn theo is_business_director().
// Phần "Chưa đạt" giữ đúng khung màn KPI: chỉ hiện SAO chưa đạt, KHÔNG quy ra tiền
// trừ (tránh đọc như phạt tiền/trừ lương).

const num = (v) => (v === null || v === undefined || v === '' ? '' : Number(v));
const hours = (min) => (min === null || min === undefined ? '' : Math.round((Number(min) / 60) * 100) / 100);
const hoursText = (min) => {
  const m = Math.round(Number(min) || 0);
  return `${Math.floor(m / 60)} giờ ${m % 60} phút`;
};
const fmtDate = (s) => (s ? new Date(`${String(s).slice(0, 10)}T00:00:00`).toLocaleDateString('vi-VN') : '');
const fmtTime = (iso) => (iso ? new Date(iso).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '');
const fmtDay = (iso) => (iso ? new Date(iso).toLocaleDateString('vi-VN') : '');

const ROLE_LABELS = {
  owner: 'Chủ tiệm', admin: 'Quản trị', accountant: 'Kế toán', cashier: 'Thu ngân', sale: 'Bán hàng',
  kitchen_lead: 'Trưởng bếp', kitchen_staff: 'Nhân viên bếp', shipper: 'Shipper', warehouse: 'Kho',
};
const roleLabel = (r) => ROLE_LABELS[r] || r || '';

const STATUS_LABELS = { missing_checkout: 'Chưa chấm ra', leave: 'Xin nghỉ' };
const COMPLAINT_LABELS = { giao_tre: 'Giao trễ', sai_don: 'Sai đơn', chat_luong: 'Chất lượng', thai_do: 'Thái độ phục vụ', khac: 'Khác' };

// Tên sheet Excel: ≤31 ký tự, không chứa []:*?/\ và không trùng nhau.
function uniqueSheetName(name, used) {
  const base = String(name || 'Nhân viên').replace(/[[\]:*?/\\]/g, ' ').trim().slice(0, 28) || 'Nhân viên';
  let out = base; let i = 2;
  while (used.has(out.toLowerCase())) { out = `${base} (${i})`; i += 1; }
  used.add(out.toLowerCase());
  return out;
}

// Chạy tối đa `limit` tác vụ song song — tránh bắn hàng chục RPC nặng cùng lúc.
async function mapLimit(list, limit, fn) {
  const out = new Array(list.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, list.length) }, async () => {
    while (next < list.length) {
      const i = next; next += 1;
      out[i] = await fn(list[i], i);
    }
  }));
  return out;
}

const SUMMARY_HEADERS = [
  'Họ tên', 'Vai trò', 'Điểm KPI /100', 'Xếp loại',
  'Việc được giao', 'Việc hoàn thành', 'Đúng hạn', 'Tỷ lệ hoàn thành (%)', 'Việc hằng ngày xong', 'Loại trừ đã duyệt',
  'Ngày làm việc', 'Tổng giờ làm (giờ)', 'Tăng ca (giờ)', 'Số lần đi trễ', 'Ca quên chấm ra', 'Ngày nghỉ phép',
  'Sản lượng ghi nhận', 'Làm cùng nhau (giờ)',
  'Số đơn đã giao', 'Quãng đường (km)', 'Thời gian chạy chuyến (giờ)', 'Đơn có ảnh chứng minh',
  'Sao được cộng', 'Tiền thưởng cộng (đ)', 'Sao chưa đạt (không trừ lương)', 'Sao thực nhận', 'Tiền thưởng thực nhận (đ)',
  'Bánh lỗi ghi nhận (lần)', 'Bánh lỗi (số lượng)', 'Khiếu nại khách (lần)',
];

function summaryRow(st, d, score, defects, complaints) {
  return [
    st.full_name || '', roleLabel(st.role),
    score?.score ?? '', score?.label || '',
    num(d.assigned_tasks), num(d.completed_tasks), num(d.on_time_tasks), num(d.completion_rate), num(d.daily_tasks_completed), num(d.approved_exclusions),
    num(d.work_days), hours(d.work_minutes), hours(d.overtime_minutes), num(d.late_count), num(d.missing_checkout_count), num(d.leave_day_count),
    num(d.output_quantity), num(d.coworking_hours),
    num(d.shipper_order_count), num(d.shipper_total_km), hours(d.shipper_total_minutes),
    d.shipper_order_count === undefined ? '' : `${d.shipper_orders_with_proof ?? 0}/${d.shipper_order_count}`,
    num(d.star_cong_sao), num(d.star_cong_tien), num(d.star_chua_dat_sao), num(d.star_rong_sao), num(d.star_rong_tien),
    defects.length, defects.reduce((t, x) => t + (Number(x.quantity) || 0), 0), complaints.length,
  ];
}

// Sheet chi tiết 1 người: nhiều khối (điểm, công việc, giờ làm, ...) trong cùng 6 cột.
function personSheet(st, d, score, cham, defects, complaints, from, to) {
  const COLS = 6;
  const rows = []; const styles = [];
  const add = (cells, style) => { const r = Array(COLS).fill(''); cells.forEach((v, i) => { r[i] = v; }); rows.push(r); styles.push(style); };
  const section = (t) => add([t], 'section');
  const kv = (k, v) => add([k, v === undefined || v === null ? '' : v], 'item');

  section('ĐIỂM KPI TỔNG HỢP');
  if (score && score.score !== null && score.score !== undefined) {
    kv('Điểm', `${score.score} / 100`); kv('Xếp loại', score.label || '');
    add(['Thành phần', 'Giá trị', 'Điểm', 'Trọng số (%)'], 'order');
    (score.chi_tiet || []).forEach((c) => add([c.label, num(c.gia_tri), num(c.diem), num(c.trong_so_thuc)], 'item'));
  } else kv('Điểm', score?.label || 'Chưa đủ dữ liệu để tính điểm KPI tổng hợp');

  section('CÔNG VIỆC');
  kv('Tỷ lệ hoàn thành (%)', num(d.completion_rate)); kv('Việc được giao', num(d.assigned_tasks)); kv('Việc hoàn thành', num(d.completed_tasks));
  kv('Đúng hạn', num(d.on_time_tasks)); kv('Việc hằng ngày xong', num(d.daily_tasks_completed)); kv('Loại trừ đã duyệt', num(d.approved_exclusions));

  section('GIỜ LÀM & CHUYÊN CẦN');
  kv('Ngày làm việc', num(d.work_days)); kv('Tổng giờ làm', hoursText(d.work_minutes)); kv('Tăng ca', hoursText(d.overtime_minutes));
  kv('Số lần đi trễ', num(d.late_count)); kv('Ca quên chấm ra', num(d.missing_checkout_count)); kv('Ngày nghỉ phép', num(d.leave_day_count));

  section('SẢN XUẤT & PHỐI HỢP');
  kv('Sản lượng ghi nhận', num(d.output_quantity)); kv('Làm cùng nhau (giờ)', num(d.coworking_hours));

  if (d.shipper_order_count !== undefined) {
    section('GIAO HÀNG');
    kv('Số đơn đã giao', num(d.shipper_order_count)); kv('Quãng đường (km)', num(d.shipper_total_km));
    kv('Thời gian chạy chuyến', hoursText(d.shipper_total_minutes)); kv('Đơn có ảnh chứng minh', `${d.shipper_orders_with_proof ?? 0}/${d.shipper_order_count}`);
  }

  section('THƯỞNG CHUYÊN CẦN (GIEO HẠT)');
  kv('Sao được cộng', num(d.star_cong_sao)); kv('Tiền thưởng cộng (đ)', num(d.star_cong_tien));
  kv('Sao chưa đạt (không trừ lương)', num(d.star_chua_dat_sao));
  kv('Sao thực nhận', num(d.star_rong_sao)); kv('Tiền thưởng thực nhận (đ)', num(d.star_rong_tien));

  section(`CHI TIẾT CHẤM CÔNG (${cham.length} dòng)`);
  add(['Ngày', 'Ca / Chi nhánh', 'Giờ vào', 'Giờ ra', 'Trễ (phút)', 'Ghi chú'], 'order');
  cham.forEach((c) => add([
    fmtDate(c.work_date), [c.shift_label, c.branch].filter(Boolean).join(' · '), fmtTime(c.vao), c.trang_thai === 'missing_checkout' ? '' : fmtTime(c.ra),
    Number(c.late_minutes) > 0 ? Number(c.late_minutes) : '', STATUS_LABELS[c.trang_thai] || '',
  ], 'item'));

  section('GHI NHẬN MỚI (CHƯA TÍNH VÀO ĐIỂM)');
  add([`Bánh lỗi (${defects.length} lần)`, 'Số lượng', 'Lý do', 'Ngày', 'Tự khai'], 'order');
  defects.forEach((x) => add([x.product_name, num(x.quantity), x.reason || '', fmtDay(x.created_at), x.tu_khai ? 'Có' : 'Không'], 'item'));
  add([`Khiếu nại khách (${complaints.length} lần)`, 'Mã đơn', 'Nội dung', 'Ngày'], 'order');
  complaints.forEach((x) => add([COMPLAINT_LABELS[x.category] || x.category, x.order_code || '', x.description || '', fmtDay(x.created_at)], 'item'));

  return {
    name: '', headers: [`${st.full_name || ''} — ${roleLabel(st.role)} — KPI từ ${fmtDate(from)} đến ${fmtDate(to)}`, '', '', '', '', ''],
    rows, rowStyles: styles, centerNumbers: true,
  };
}

// Trả về số nhân viên đã xuất. onProgress(done, total) để hiện tiến độ.
export async function exportKpiSummary(from, to, onProgress) {
  const { fromIso, toIso } = rangeBounds(from, to);
  const [listRes, defectRes, complaintRes] = await Promise.all([
    supabase.rpc('list_staff_kpi_overview', { p_from: from, p_to: to }),
    supabase.from('product_defect_logs').select('staff_id,product_name,quantity,reason,tu_khai,created_at').gte('created_at', fromIso).lte('created_at', toIso),
    supabase.from('customer_complaints').select('staff_id,order_code,category,description,created_at').gte('created_at', fromIso).lte('created_at', toIso),
  ]);
  if (listRes.error) throw listRes.error;
  // Bánh lỗi/khiếu nại chỉ là dữ liệu phụ — lỗi đọc (vd thiếu quyền) không chặn cả file xuất.
  const defectsBy = {}; (defectRes.data || []).forEach((x) => { (defectsBy[x.staff_id] ||= []).push(x); });
  const complaintsBy = {}; (complaintRes.data || []).forEach((x) => { (complaintsBy[x.staff_id] ||= []).push(x); });

  const staff = listRes.data || [];
  let done = 0;
  const details = await mapLimit(staff, 6, async (st) => {
    const [ov, sc, cc] = await Promise.all([
      supabase.rpc('get_employee_kpi_overview', { p_staff_id: st.staff_id, p_from: from, p_to: to }),
      supabase.rpc('compute_kpi_score', { p_staff_id: st.staff_id, p_from: from, p_to: to }),
      supabase.rpc('get_staff_attendance_detail', { p_staff_id: st.staff_id, p_from: from, p_to: to }),
    ]);
    done += 1; if (onProgress) onProgress(done, staff.length);
    if (ov.error) throw new Error(`${st.full_name}: ${ov.error.message}`);
    return { data: ov.data || {}, score: sc.data || null, cham: cc.data || [] };
  });

  // Sắp theo họ tên cho dễ tìm (bảng xếp hạng trên màn hình sắp theo sao).
  const order = staff.map((st, i) => i).sort((a, b) => String(staff[a].full_name).localeCompare(String(staff[b].full_name), 'vi'));
  const used = new Set(['tổng hợp']);
  const summaryRows = []; const personSheets = [];
  order.forEach((i) => {
    const st = staff[i]; const { data, score, cham } = details[i];
    const defects = defectsBy[st.staff_id] || []; const complaints = complaintsBy[st.staff_id] || [];
    summaryRows.push(summaryRow(st, data, score, defects, complaints));
    const sh = personSheet(st, data, score, cham, defects, complaints, from, to);
    sh.name = uniqueSheetName(st.full_name, used);
    personSheets.push(sh);
  });

  await downloadXlsx(`kpi-nhan-vien_${from}_${to}.xlsx`, [
    { name: 'Tổng hợp', headers: SUMMARY_HEADERS, rows: summaryRows, centerNumbers: true, freezeCols: 1 },
    ...personSheets,
  ]);
  return staff.length;
}
