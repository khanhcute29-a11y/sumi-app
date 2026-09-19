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

const DETAIL_HEADERS = ['Ngày cần giao', 'Mã đơn', 'Khách hàng', 'Loại bánh', 'Trạng thái', 'Sản phẩm', 'Số lượng', 'Đơn vị', 'Đơn giá (đ)', 'Thành tiền (đ)', 'Tổng tiền đơn (đ)', 'Chi nhánh'];

// flows rỗng = tất cả luồng.
export const flowSelected = (flows, key) => !flows || flows.length === 0 || flows.includes(key);
// Ghi luồng đã chọn vào tên file, ví dụ "school_" hoặc "cake-macaron_".
const flowTag = (flows) => (flows && flows.length ? `${flows.join('-')}_` : '');
export const EXPORT_FLOWS = CATEGORIES;

// ───────────── ĐƠN HÀNG ─────────────
export async function exportOrdersSummary(from, to, format = 'xlsx', flows = []) {
  const [ordersRes, itemsRes] = await Promise.all([
    supabase.rpc('orders_export_rows', { p_from: from, p_to: to }),
    supabase.rpc('orders_export_item_rows', { p_from: from, p_to: to }),
  ]);
  if (ordersRes.error) throw ordersRes.error;
  if (itemsRes.error) throw itemsRes.error;
  const rows = (ordersRes.data || []).filter((o) => flowSelected(flows, categoryKey(o.order_type)));
  const itemsByOrder = {};
  (itemsRes.data || []).forEach((it) => { (itemsByOrder[it.order_id] ||= []).push(it); });
  // Đơn đã huỷ không tính vào tổng hợp, vẫn liệt kê ở file chi tiết.
  const live = rows.filter((o) => o.status_v2 !== 'cancelled').map((o) => ({
    when: o.required_at, category: categoryKey(o.order_type), qty: num(o.total_quantity),
    total: num(o.total), names: o.product_names || '',
  }));
  const init = () => ({ orders: 0, qty: 0, total: 0, names: [] });
  const add = (acc, r) => {
    acc.orders += 1; acc.qty += r.qty; acc.total += r.total;
    if (r.names && !acc.names.includes(r.names)) acc.names.push(r.names);
  };
  const headersFor = (label) => [label, 'Loại bánh', 'Số đơn', 'Tổng số sản phẩm', 'Tổng tiền đơn (đ)', 'Sản phẩm cần làm'];
  const toRows = (groups, labelOf) => {
    const body = groups.map((g) => [labelOf(g.period), categoryTitle(g.category), g.orders, g.qty, g.total, g.names.join(' | ')]);
    const sum = groups.reduce((s, g) => ({ o: s.o + g.orders, q: s.q + g.qty, t: s.t + g.total }), { o: 0, q: 0, t: 0 });
    return [...body, ['TỔNG', '', sum.o, sum.q, sum.t, '']];
  };
  const byDay = group(live, dayOf, init, add);
  const byWeek = group(live, weekOf, init, add);
  // Chi tiết: mỗi SẢN PHẨM 1 dòng (đơn nhiều món → nhiều dòng). "Tổng tiền đơn"
  // chỉ ghi ở dòng đầu của mỗi đơn để cộng lại khớp với sheet Theo ngày/tuần.
  const detailRows = [];
  rows.forEach((o) => {
    const head = [dayLabel(dayOf(o.required_at)), o.order_code, o.customer_name || '', categoryTitle(categoryKey(o.order_type)), o.status_v2];
    const items = itemsByOrder[o.id] || [];
    if (!items.length) {
      detailRows.push([...head, o.product_names || '', num(o.total_quantity), '', '', '', num(o.total), o.target_store || '']);
      return;
    }
    items.forEach((it, i) => {
      const price = it.unit_price === null || it.unit_price === undefined ? '' : num(it.unit_price);
      detailRows.push([...head, it.item_name || '', num(it.quantity), it.unit || '', price,
        price === '' ? '' : num(it.quantity) * price, i === 0 ? num(o.total) : '', o.target_store || '']);
    });
  });
  const liveCodes = new Set(rows.filter((o) => o.status_v2 !== 'cancelled').map((o) => o.order_code));
  const inLive = (r) => liveCodes.has(r[1]);
  const sumCol = (i) => detailRows.filter(inLive).reduce((t, r) => t + (Number(r[i]) || 0), 0);
  const detailTotal = ['TỔNG', '', '', '', '', '', sumCol(6), '', '', sumCol(9), sumCol(10), ''];
  const tag = flowTag(flows) + stamp(from, to);
  await emit(format, `don-hang_${tag}`, [
    { name: 'Theo ngày', headers: headersFor('Ngày cần giao'), rows: toRows(byDay, dayLabel), bandCol: 0, totalRows: 1 },
    { name: 'Theo tuần', headers: headersFor('Tuần (T2 - CN)'), rows: toRows(byWeek, (p) => p), bandCol: 0, totalRows: 1 },
    { name: 'Chi tiết', headers: DETAIL_HEADERS, rows: detailRows.concat([detailTotal]), bandCol: 0, totalRows: 1 },
  ], ['theo-ngay', 'theo-tuan', 'chi-tiet']);
  return rows.length;
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
