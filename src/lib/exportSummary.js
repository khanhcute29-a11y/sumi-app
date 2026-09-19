import { supabase } from './supabaseClient';
import { downloadCsv } from './csv';
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

// ───────────── ĐƠN HÀNG ─────────────
export async function exportOrdersSummary(from, to) {
  const { data, error } = await supabase.rpc('orders_export_rows', { p_from: from, p_to: to });
  if (error) throw error;
  const rows = data || [];
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
  const tag = stamp(from, to);
  downloadCsv(`don-hang-theo-ngay_${tag}.csv`, headersFor('Ngày cần giao'), toRows(byDay, dayLabel));
  await pause();
  downloadCsv(`don-hang-theo-tuan_${tag}.csv`, headersFor('Tuần (T2 - CN)'), toRows(byWeek, (p) => p));
  await pause();
  downloadCsv(`don-hang-chi-tiet_${tag}.csv`,
    ['Ngày cần giao', 'Mã đơn', 'Khách hàng', 'Loại bánh', 'Trạng thái', 'Sản phẩm', 'Số lượng', 'Tổng tiền (đ)', 'Đã cọc (đ)', 'Chi nhánh'],
    rows.map((o) => [
      dayLabel(dayOf(o.required_at)), o.order_code, o.customer_name || '', categoryTitle(categoryKey(o.order_type)),
      o.status_v2, o.product_names || '', num(o.total_quantity), num(o.total), num(o.deposit), o.target_store || '',
    ]));
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

export async function exportRevenueSummary(from, to) {
  const { fromIso, toIso } = rangeBounds(from, to);
  const [thuan, duTinh] = await Promise.all([
    fetchRevenueByChannel({ from: fromIso, to: toIso }),
    fetchDoanhThuDuTinh(),
  ]);
  const inRange = (iso) => !iso || (iso >= fromIso && iso <= toIso);
  const recs = [];
  thuan.channels.forEach((ch) => ch.orders.forEach((o) => recs.push({
    kind: 'thuan', category: categoryKey(ch.key), when: o.when, code: o.orderCode, customer: o.customerName, amount: o.amount, branch: o.branch,
  })));
  duTinh.categoryGroups.forEach((g) => g.lines.forEach((line) => line.orders.forEach((o) => {
    if (!inRange(o.when)) return;
    recs.push({
      kind: line.id === 'cong_no_can_thu' ? 'cong_no' : line.id === 'in_delivery' ? 'delivery' : 'deposit',
      category: g.key, when: o.when, code: o.orderCode, customer: o.customerName, amount: o.amount, branch: o.branch,
    });
  })));
  (duTinh.debt.orders || []).forEach((o) => {
    if (!inRange(o.when)) return;
    recs.push({ kind: 'debt_book', category: 'school', when: o.when, code: '', customer: o.customerName, amount: o.amount, branch: 'Trường học' });
  });

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
  const tag = stamp(from, to);
  downloadCsv(`doanh-thu-theo-ngay_${tag}.csv`, headersFor('Ngày'), toRows(group(recs, dayOf, init, add), dayLabel));
  await pause();
  downloadCsv(`doanh-thu-theo-tuan_${tag}.csv`, headersFor('Tuần (T2 - CN)'), toRows(group(recs, weekOf, init, add), (p) => p));
  await pause();
  const kindLabel = (k) => KINDS.find((x) => x.key === k)?.label || k;
  downloadCsv(`doanh-thu-chi-tiet_${tag}.csv`,
    ['Loại doanh thu', 'Ngày', 'Mã đơn', 'Khách hàng', 'Loại bánh', 'Số tiền (đ)', 'Chi nhánh'],
    [...recs].sort((a, b) => dayOf(a.when).localeCompare(dayOf(b.when))).map((r) => [
      kindLabel(r.kind), dayLabel(dayOf(r.when)), r.code || '', r.customer || '', categoryTitle(r.category), r.amount, r.branch || '',
    ]));
  return recs.length;
}

// Trình duyệt hay chặn nhiều lượt tải liên tiếp nếu bắn cùng lúc.
const pause = () => new Promise((r) => setTimeout(r, 500));
