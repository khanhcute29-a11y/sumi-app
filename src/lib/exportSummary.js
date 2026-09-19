import { supabase } from './supabaseClient';
import { downloadCsv } from './csv';
import { downloadXlsx } from './xlsxExport';
import { ORDER_FLOWS } from '../data/orderCatalogs';
import { fetchRevenueByChannel, fetchDoanhThuDuTinh } from './bossOverviewV3';
import { localDateStr, mondayOf } from './date';

// Xuất tổng hợp theo ngày / theo tuần / chi tiết (yêu cầu Giám đốc 20/09/2026).
// Chỉ Giám đốc dùng: số tiền lấy qua RPC/hàm đã khoá is_business_director().
// Tuần = Thứ Hai → Chủ Nhật, ngày tính theo giờ trình duyệt (VN), KHÔNG dùng
// toISOString().slice(0,10) (lệch ngày khung 00:00–06:59).

const CATEGORIES = [
  ...ORDER_FLOWS.map((f) => ({ key: f.key, title: f.title })),
  { key: 'mixed', title: 'Đơn tổng hợp' },
];
const categoryKey = (orderType) => (CATEGORIES.some((c) => c.key === orderType) ? orderType : 'mixed');
const categoryTitle = (key) => CATEGORIES.find((c) => c.key === key)?.title || key;

const fmtDay = (d) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
const NO_DATE = 'Không rõ ngày';
const dayOf = (iso) => (iso ? localDateStr(new Date(iso)) : NO_DATE);
const weekOf = (iso) => {
  if (!iso) return NO_DATE;
  const mon = mondayOf(new Date(iso));
  const sun = new Date(mon); sun.setDate(sun.getDate() + 6);
  return `${fmtDay(mon)} - ${fmtDay(sun)}`;
};
const dayLabel = (s) => (s === NO_DATE ? s : fmtDay(new Date(`${s}T00:00:00`)));
const num = (v) => Number(v) || 0;
const sumBy = (list, key) => list.reduce((s, o) => s + num(o[key]), 0);

export const rangeBounds = (from, to) => ({
  fromIso: new Date(`${from}T00:00:00`).toISOString(),
  toIso: new Date(`${to}T23:59:59.999`).toISOString(),
});

export function thisWeekRange() {
  const mon = mondayOf(new Date());
  const sun = new Date(mon); sun.setDate(sun.getDate() + 6);
  return { from: localDateStr(mon), to: localDateStr(sun) };
}

// Gom records thành Map<"period|category", acc> giữ thứ tự thời gian.
function group(records, periodOf, init, add) {
  const map = new Map();
  records.forEach((r) => {
    const period = periodOf(r.when);
    const key = `${period}|${r.category}`;
    if (!map.has(key)) map.set(key, { period, category: r.category, ...init() });
    add(map.get(key), r);
  });
  return [...map.values()].sort((a, b) => (a.period + a.category).localeCompare(b.period + b.category));
}

const stamp = (from, to) => `${from}_${to}`;

// flows rỗng = tất cả luồng.
export const flowSelected = (flows, key) => !flows || flows.length === 0 || flows.includes(key);
// Ghi luồng đã chọn vào tên file, ví dụ "school_" hoặc "cake-macaron_".
const flowTag = (flows) => (flows && flows.length ? `${flows.join('-')}_` : '');
export const EXPORT_FLOWS = CATEGORIES;

// ───────────── ĐƠN HÀNG ─────────────
// Chi tiết đơn (Giám đốc 20/09/2026): 1 sheet duy nhất, mỗi đơn 1 KHỐI —
// dòng đầu khối = thông tin đơn + tổng tiền, các dòng dưới = từng sản phẩm.
const STATUS_LABELS = {
  awaiting_assignment: 'Chờ làm', awaiting_acceptance: 'Chờ làm', in_production: 'Bếp đang làm',
  ready_for_fulfillment: 'Chờ vận chuyển', in_delivery: 'Đang vận chuyển', completed: 'Giao thành công', cancelled: 'Đã huỷ',
};
const ORDER_HEADERS = ['Ngày giao', 'Giờ giao', 'Mã đơn', 'Khách hàng', 'Địa chỉ giao', 'Trạng thái', 'Chi nhánh',
  'Sản phẩm', 'Số lượng', 'Đơn vị', 'Đơn giá (đ)', 'Thành tiền (đ)', 'Tổng tiền đơn (đ)', 'Đã cọc (đ)', 'Còn lại (đ)'];
const COL_QTY = 8; const COL_TOTAL = 12; const COL_DEPOSIT = 13; const COL_REMAIN = 14;
const timeOf = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

export async function exportOrdersSummary(from, to, format = 'xlsx', flows = []) {
  const [ordersRes, itemsRes] = await Promise.all([
    supabase.rpc('orders_export_rows', { p_from: from, p_to: to }),
    supabase.rpc('orders_export_item_rows', { p_from: from, p_to: to }),
  ]);
  if (ordersRes.error) throw ordersRes.error;
  if (itemsRes.error) throw itemsRes.error;
  const orders = (ordersRes.data || [])
    .filter((o) => flowSelected(flows, categoryKey(o.order_type)))
    .sort((a, b) => String(a.required_at).localeCompare(String(b.required_at)));
  const itemsByOrder = {};
  (itemsRes.data || []).forEach((it) => { (itemsByOrder[it.order_id] ||= []).push(it); });

  const money = (v) => (v === null || v === undefined || v === '' ? '' : num(v));
  const orderInfo = (o) => [dayLabel(dayOf(o.required_at)), timeOf(o.required_at), o.order_code, o.customer_name || '',
    o.address || '', STATUS_LABELS[o.status_v2] || o.status_v2, o.target_store || ''];
  const remainOf = (o) => Math.max(0, num(o.total) - num(o.deposit));
  const itemCells = (it) => {
    const price = money(it.unit_price);
    return [it.item_name || '', num(it.quantity), it.unit || '', price, price === '' ? '' : num(it.quantity) * price];
  };
  const sumRow = (label, list) => {
    const live = list.filter((o) => o.status_v2 !== 'cancelled');
    const r = Array(ORDER_HEADERS.length).fill('');
    r[0] = label; r[2] = `${live.length} đơn`;
    r[COL_QTY] = live.reduce((t, o) => t + num(o.total_quantity), 0);
    r[COL_TOTAL] = live.reduce((t, o) => t + num(o.total), 0);
    r[COL_DEPOSIT] = live.reduce((t, o) => t + num(o.deposit), 0);
    r[COL_REMAIN] = live.reduce((t, o) => t + remainOf(o), 0);
    return r;
  };

  // Gom theo luồng theo thứ tự CATEGORIES; chỉ 1 luồng có dữ liệu → bỏ tiêu đề/tổng luồng (tránh lặp với TỔNG CỘNG).
  const sections = CATEGORIES.map((c) => ({ ...c, list: orders.filter((o) => categoryKey(o.order_type) === c.key) })).filter((c) => c.list.length);
  const multi = sections.length > 1;
  const tag = flowTag(flows) + stamp(from, to);

  if (format === 'csv') {
    const rows = [];
    orders.forEach((o) => {
      const items = itemsByOrder[o.id] || [];
      const tail = [money(o.total), money(o.deposit), remainOf(o)];
      if (!items.length) { rows.push([categoryTitle(categoryKey(o.order_type)), ...orderInfo(o), o.product_names || '', num(o.total_quantity), '', '', '', ...tail]); return; }
      items.forEach((it) => rows.push([categoryTitle(categoryKey(o.order_type)), ...orderInfo(o), ...itemCells(it), ...tail]));
    });
    downloadCsv(`don-hang_${tag}.csv`, ['Luồng', ...ORDER_HEADERS], rows);
    return orders.length;
  }

  const rows = []; const rowStyles = [];
  const push = (r, style) => { rows.push(r); rowStyles.push(style); };
  sections.forEach((sec) => {
    if (multi) { const r = Array(ORDER_HEADERS.length).fill(''); r[0] = sec.title; push(r, 'section'); }
    sec.list.forEach((o) => {
      const cancelled = o.status_v2 === 'cancelled';
      const head = Array(ORDER_HEADERS.length).fill('');
      orderInfo(o).forEach((v, i) => { head[i] = v; });
      head[COL_TOTAL] = money(o.total); head[COL_DEPOSIT] = money(o.deposit); head[COL_REMAIN] = remainOf(o);
      push(head, cancelled ? 'cancelled' : 'order');
      const items = itemsByOrder[o.id] || [];
      if (!items.length) {
        const r = Array(ORDER_HEADERS.length).fill('');
        r[7] = o.product_names || ''; r[COL_QTY] = num(o.total_quantity);
        push(r, 'item');
      }
      items.forEach((it) => {
        const r = Array(ORDER_HEADERS.length).fill('');
        itemCells(it).forEach((v, i) => { r[7 + i] = v; });
        push(r, 'item');
      });
    });
    if (multi) push(sumRow(`TỔNG ${sec.title}`, sec.list), 'flow');
  });
  push(sumRow('TỔNG CỘNG', orders), 'grand');
  await downloadXlsx(`don-hang_${tag}.xlsx`, [{ name: 'Chi tiết đơn', headers: ORDER_HEADERS, rows, rowStyles }]);
  return orders.length;
}

// ───────────── DOANH THU ─────────────
const KINDS = [
  { key: 'thuan', label: 'Doanh thu thuần' },
  { key: 'deposit', label: 'Tiền đặt cọc' },
  { key: 'cong_no', label: 'Công nợ cần thu' },
  { key: 'delivery', label: 'Đơn đang giao' },
  { key: 'debt_book', label: 'Công nợ sổ sách (trường học)' },
];

export async function exportRevenueSummary(from, to, format = 'xlsx', flows = []) {
  const { fromIso, toIso } = rangeBounds(from, to);
  const [thuan, duTinh] = await Promise.all([
    fetchRevenueByChannel({ from: fromIso, to: toIso }),
    fetchDoanhThuDuTinh(),
  ]);
  const inRange = (iso) => !iso || (iso >= fromIso && iso <= toIso);
  const allRecs = [];
  thuan.channels.forEach((ch) => ch.orders.forEach((o) => allRecs.push({
    kind: 'thuan', category: categoryKey(ch.key), when: o.when, code: o.orderCode, customer: o.customerName, amount: o.amount, branch: o.branch,
  })));
  duTinh.categoryGroups.forEach((g) => g.lines.forEach((line) => line.orders.forEach((o) => {
    if (!inRange(o.when)) return;
    allRecs.push({
      kind: line.id === 'cong_no_can_thu' ? 'cong_no' : line.id === 'in_delivery' ? 'delivery' : 'deposit',
      category: g.key, when: o.when, code: o.orderCode, customer: o.customerName, amount: o.amount, branch: o.branch,
    });
  })));
  (duTinh.debt.orders || []).forEach((o) => {
    if (!inRange(o.when)) return;
    allRecs.push({ kind: 'debt_book', category: 'school', when: o.when, code: '', customer: o.customerName, amount: o.amount, branch: 'Trường học' });
  });

  const recs = allRecs.filter((r) => flowSelected(flows, r.category));

  const init = () => Object.fromEntries(KINDS.flatMap((k) => [[`${k.key}_n`, 0], [`${k.key}_a`, 0]]));
  const add = (acc, r) => { acc[`${r.kind}_n`] += 1; acc[`${r.kind}_a`] += r.amount; };
  const headersFor = (label) => [label, 'Loại bánh',
    ...KINDS.flatMap((k) => [`${k.label} - số đơn`, `${k.label} (đ)`]),
    'Tổng dự tính (đ)'];
  const est = (g) => g.deposit_a + g.cong_no_a + g.delivery_a + g.debt_book_a;
  const toRows = (groups, labelOf) => {
    const body = groups.map((g) => [labelOf(g.period), categoryTitle(g.category),
      ...KINDS.flatMap((k) => [g[`${k.key}_n`], g[`${k.key}_a`]]), est(g)]);
    const tot = KINDS.flatMap((k) => {
      const n = groups.reduce((s, g) => s + g[`${k.key}_n`], 0);
      const a = groups.reduce((s, g) => s + g[`${k.key}_a`], 0);
      return [n, a];
    });
    return [...body, ['TỔNG', '', ...tot, groups.reduce((s, g) => s + est(g), 0)]];
  };
  const tag = flowTag(flows) + stamp(from, to);
  const kindLabel = (k) => KINDS.find((x) => x.key === k)?.label || k;
  // Cuối file chi tiết: mỗi loại doanh thu 1 dòng TỔNG (không cộng chung thuần với dự tính).
  const kindTotals = KINDS.filter((k) => recs.some((r) => r.kind === k.key))
    .map((k) => [`TỔNG ${k.label}`, '', '', '', '', recs.filter((r) => r.kind === k.key).reduce((s, r) => s + r.amount, 0), '']);
  await emit(format, `doanh-thu_${tag}`, [
    { name: 'Theo ngày', headers: headersFor('Ngày'), rows: toRows(group(recs, dayOf, init, add), dayLabel), bandCol: 0, totalRows: 1 },
    { name: 'Theo tuần', headers: headersFor('Tuần (T2 - CN)'), rows: toRows(group(recs, weekOf, init, add), (p) => p), bandCol: 0, totalRows: 1 },
    { name: 'Chi tiết', headers: ['Loại doanh thu', 'Ngày', 'Mã đơn', 'Khách hàng', 'Loại bánh', 'Số tiền (đ)', 'Chi nhánh'],
      rows: [...recs].sort((a, b) => dayOf(a.when).localeCompare(dayOf(b.when))).map((r) => [
        kindLabel(r.kind), dayLabel(dayOf(r.when)), r.code || '', r.customer || '', categoryTitle(r.category), r.amount, r.branch || '',
      ]).concat(kindTotals), totalRows: kindTotals.length },
  ], ['theo-ngay', 'theo-tuan', 'chi-tiet']);
  return recs.length;
}

// Trình duyệt hay chặn nhiều lượt tải liên tiếp nếu bắn cùng lúc.
const pause = () => new Promise((r) => setTimeout(r, 500));

// xlsx: 1 file nhiều sheet có định dạng. csv: 3 file rời (bản cũ, giữ lại để đối chiếu).
async function emit(format, base, sheets, suffixes) {
  if (format === 'csv') {
    const [pre, tag] = [base.split('_')[0], base.slice(base.indexOf('_'))];
    for (let i = 0; i < sheets.length; i += 1) {
      downloadCsv(`${pre}-${suffixes[i]}${tag}.csv`, sheets[i].headers, sheets[i].rows);
      if (i < sheets.length - 1) await pause();
    }
    return;
  }
  await downloadXlsx(`${base}.xlsx`, sheets);
}
