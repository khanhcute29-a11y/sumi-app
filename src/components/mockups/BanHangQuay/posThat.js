// Bán hàng tại quầy — CHẠY THẬT: đọc/ghi database qua các hàm pos_* (xem migration 202611141000).
// Trình duyệt không tự quyết giá, giảm giá, quyền huỷ — database kiểm lại hết.
// Mất mạng: bán, thu nợ, phiếu kho được xếp vào hàng đợi trên máy (IndexedDB) và tự gửi lại khi có mạng.
// Mỗi việc có mã riêng nên gửi lại bao nhiêu lần cũng không bị bán trùng.
import { openDB } from 'idb';
import QRCode from 'qrcode';
import { supabase } from '../../../lib/supabaseClient';

export const maMoi = () => (crypto.randomUUID ? crypto.randomUUID()
  : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => { const r = (Math.random() * 16) | 0; return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16); }));

// matHang.id = "productId:variantId" hoặc "productId" (xem taoMatHang).
export function tachId(m) {
  const [p, v] = String(m?.id || '').split(':');
  return { product_id: p || null, variant_id: v || null, size: m?.size || null };
}
const khoaHang = (productId, variantOrSize) => `${productId}|${variantOrSize || ''}`;

// Lỗi mạng (gửi lại sau) khác lỗi nghiệp vụ (database từ chối — báo cho người bán).
export function laLoiMang(e) {
  const m = String(e?.message || e || '');
  return (typeof navigator !== 'undefined' && navigator.onLine === false)
    || /Failed to fetch|NetworkError|Load failed|network|timeout|ERR_INTERNET|fetch failed/i.test(m);
}

// Chữ lỗi từ database: bỏ tiền tố kỹ thuật, giữ câu tiếng Việt.
export function chuLoi(e) {
  const m = String(e?.message || e || 'Có lỗi, thử lại');
  if (laLoiMang(e)) return 'Mất mạng — đã giữ lại trên máy, có mạng sẽ tự gửi';
  return m.replace(/^.*?ERROR:\s*/i, '').replace(/\s*\(SQLSTATE.*\)$/, '');
}

export async function goi(ten, thamSo) {
  const { data, error } = await supabase.rpc(ten, thamSo);
  if (error) throw new Error(error.message || 'Lỗi database');
  return data;
}

// ── Bật chạy thật? Cờ pos_ban_hang_that bật (hoặc tài khoản nằm trong danh sách thử) + đã đăng nhập + tài khoản đã duyệt.
export async function kiemTraThat() {
  const { data: s } = await supabase.auth.getSession();
  const uid = s?.session?.user?.id;
  if (!uid) return { bat: false, lyDo: 'chưa đăng nhập' };
  const { data: co } = await supabase.from('feature_flags').select('enabled,rollout_percentage,allowed_profile_ids').eq('key', 'pos_ban_hang_that').maybeSingle();
  if (!co) return { bat: false, lyDo: 'chưa chạy SQL bán hàng thật' };
  const bat = co.enabled && (co.rollout_percentage === 100 || (co.allowed_profile_ids || []).includes(uid));
  if (!bat) return { bat: false, lyDo: 'cờ pos_ban_hang_that đang tắt' };
  const cap = await goi('pos_cap_do');
  if (!cap) return { bat: false, lyDo: 'tài khoản chưa được duyệt' };
  return { bat: true, cap, uid };
}

// ── Đổi dữ liệu database → dạng màn hình đang dùng ──
export function lapBanDoHang(matHang) {
  const theoKhoa = new Map();
  for (const m of matHang) {
    const { product_id: p, variant_id: v } = tachId(m);
    theoKhoa.set(khoaHang(p, v), m);
    if (m.size) theoKhoa.set(khoaHang(p, `size:${m.size}`), m);
    else theoKhoa.set(khoaHang(p, 'size:'), m);
  }
  return {
    theoVariant: (p, v) => theoKhoa.get(khoaHang(p, v)),
    theoSize: (p, size) => theoKhoa.get(khoaHang(p, `size:${size || ''}`)),
  };
}

export function hoaDonTuDb(r, lines, bd) {
  const dong = (lines || []).sort((a, b) => a.line_no - b.line_no).map((l) => {
    const m = bd.theoVariant(l.product_id, l.variant_id) || bd.theoSize(l.product_id, l.size);
    return {
      ma: m?.ma || `X-${String(l.product_id).slice(0, 6)}`, ten: l.name, size: l.size || '', gia: Number(l.list_price),
      sl: Number(l.qty), giam: Number(l.list_price) - Number(l.unit_price), giamKieu: 'vnd', eod: l.eod, ghiChu: l.note || '',
      giaVon: 0, danhMuc: m?.danhMuc, anh: m?.anh || null,
    };
  });
  const sauGiam = Number(r.subtotal) - Number(r.invoice_discount);
  return {
    id: r.id, ma: r.code, luc: new Date(r.created_at).getTime(), chiNhanh: r.store_location, caId: r.shift_id,
    thuNgan: r.cashier_name, nguoiBan: r.seller_name || r.cashier_name,
    khach: r.customer_id ? { id: r.customer_id, name: r.customer_name, phone: r.customer_phone || '' } : { id: null, name: 'Khách lẻ', phone: '' },
    dong, thuKhacDong: r.other_fee_detail || [], ghiChu: r.note || '',
    tongHang: Number(r.subtotal), giamHd: Number(r.invoice_discount), sauGiam, thuKhac: Number(r.other_fee), vat: Number(r.vat_amount),
    giaVon: 0, canTra: Number(r.total), soMon: dong.reduce((s, d) => s + d.sl, 0),
    phuongThuc: r.pay_method, khachDua: Number(r.received_amount), thucThu: Number(r.paid_amount), thua: Number(r.change_amount), no: Number(r.debt_amount),
    daHuy: r.status === 'huy', lyDoHuy: r.cancel_reason, nguoiHuy: r.cancelled_by_name, lucHuy: r.cancelled_at ? new Date(r.cancelled_at).getTime() : null,
    ckTrangThai: r.transfer_status, ckNguoi: r.transfer_checked_by_name, bangGia: r.price_list_name,
    diemDung: r.points_used, diemTien: Number(r.points_value), diemCong: r.points_earned, giamCuoiNgay: Number(r.eod_discount),
    offline: r.offline, that: true,
  };
}

const LOAI_TU_DB = { bep_giao: 'giao', xuat_huy: 'huy', kiem_kho: 'kiem', noi_bo: 'noibo' };
export const LOAI_LEN_DB = { giao: 'bep_giao', huy: 'xuat_huy', kiem: 'kiem_kho', noibo: 'noi_bo' };
const TT_TU_DB = { tam: 'tam', cho_nhan: 'cho', xong: 'xong', huy: 'huy' };

export function phieuTuDb(r, bd) {
  const dong = (r.lines || []).map((l) => {
    const m = bd.theoVariant(l.product_id, l.variant_id) || bd.theoSize(l.product_id, l.size);
    return { ma: m?.ma || `X-${String(l.product_id).slice(0, 6)}`, sl: l.qty == null ? null : Number(l.qty), slNhan: l.qty_received != null ? Number(l.qty_received) : null, tonTruoc: l.system_qty, delta: l.delta };
  });
  return {
    id: r.id, ma: r.code, loai: LOAI_TU_DB[r.doc_type], chiNhanh: r.store_location, nguoi: r.created_by_name, nguoiThucHien: r.done_by_name,
    luc: new Date(r.created_at).getTime(), lucXong: r.done_at ? new Date(r.done_at).getTime() : null,
    lucHuy: r.cancelled_at ? new Date(r.cancelled_at).getTime() : null, nguoiHuy: r.cancelled_by_name,
    trangThai: TT_TU_DB[r.status], ghiChu: r.reason || r.note || '', anh: r.photo_url, dong,
    lech: Object.fromEntries(dong.filter((d) => d.delta != null).map((d) => [d.ma, Number(d.delta)])),
    nguon: r.doc_type === 'bep_giao' ? 'Bếp' : '', loaiXuat: r.doc_type === 'noi_bo' ? (r.note || '') : '', that: true,
  };
}

// Công nợ quầy: nợ dương theo khách (tuổi nợ = món nợ cũ nhất chưa trả hết, trả nợ trừ món cũ trước), khách âm = đang dư tiền.
export function congNoTuDb(entries, bayGio = Date.now()) {
  const theo = new Map();
  for (const e of entries) {
    const k = theo.get(e.customer_id) || { khach: { id: e.customer_id, name: e.customers?.name || 'Khách', phone: e.customers?.phone || '' }, no: [], tra: 0, tong: 0 };
    const tien = Number(e.amount);
    k.tong += tien;
    if (tien > 0) k.no.push({ luc: new Date(e.created_at).getTime(), tien, ma: e.note || '' });
    else k.tra += -tien;
    theo.set(e.customer_id, k);
  }
  const ds = []; const du = [];
  for (const k of theo.values()) {
    if (k.tong < 0) { du.push({ khach: k.khach, du: -k.tong }); continue; }
    if (k.tong === 0) continue;
    let con = k.tra; let cu = null; let soHd = 0;
    for (const n of k.no.sort((a, b) => a.luc - b.luc)) {
      const tru = Math.min(con, n.tien); con -= tru;
      if (n.tien - tru > 0) { soHd += 1; if (!cu) cu = n; }
    }
    ds.push({ khach: k.khach, tong: k.tong, tuoiNo: cu ? Math.floor((bayGio - cu.luc) / 86400000) : 0, hdCuNhat: cu?.ma || '', soHd });
  }
  return { ds: ds.sort((a, b) => b.tuoiNo - a.tuoiNo || b.tong - a.tong), du };
}

// ── Nạp toàn bộ dữ liệu quầy ──
export async function taiDuLieu(matHang, soNgay = 35) {
  const bd = lapBanDoHang(matHang);
  const tu = new Date(Date.now() - soNgay * 86400000).toISOString();
  const [caiDat, caMo, hdR, phieuR, noR, tonR, bgR, bgItemR] = await Promise.all([
    supabase.from('pos_settings').select('*'),
    supabase.from('pos_shifts').select('*').eq('status', 'open'),
    supabase.from('pos_invoices').select('*, pos_invoice_lines(*)').gte('created_at', tu).order('created_at', { ascending: false }).limit(3000),
    supabase.from('pos_stock_docs').select('*').gte('created_at', tu).order('created_at', { ascending: false }).limit(1000),
    supabase.from('pos_debt_entries').select('customer_id, amount, entry_type, note, created_at, customers(name, phone)').order('created_at').limit(10000),
    supabase.from('finished_goods_stock').select('product_id, size, qty, expiry_date, store_location, is_semi_finished').not('store_location', 'is', null).eq('is_semi_finished', false),
    supabase.from('pos_price_lists').select('*').eq('active', true).order('name'),
    supabase.from('pos_price_list_items').select('*'),
  ]);
  for (const r of [caiDat, caMo, hdR, phieuR, noR, tonR]) if (r.error) throw new Error(r.error.message);
  const tonCN = {}; const hsd = {};
  for (const t of tonR.data || []) {
    const m = bd.theoSize(t.product_id, t.size);
    if (!m) continue;
    tonCN[t.store_location] = tonCN[t.store_location] || {};
    tonCN[t.store_location][m.ma] = (tonCN[t.store_location][m.ma] || 0) + Number(t.qty || 0);
    if (t.expiry_date) { hsd[t.store_location] = hsd[t.store_location] || {}; hsd[t.store_location][m.ma] = new Date(t.expiry_date).getTime(); }
  }
  const bangGia = (bgR.data || []).map((b) => ({
    id: b.id, ten: b.name,
    gia: Object.fromEntries((bgItemR.data || []).filter((i) => i.price_list_id === b.id).map((i) => {
      const m = bd.theoVariant(i.product_id, i.variant_id); return [m?.ma, Number(i.price)];
    }).filter(([k]) => k)),
  }));
  return {
    caiDat: Object.fromEntries((caiDat.data || []).map((c) => [c.store_location, c])),
    caMo: Object.fromEntries((caMo.data || []).map((c) => [c.store_location, c])),
    daBan: (hdR.data || []).map((r) => hoaDonTuDb(r, r.pos_invoice_lines, bd)),
    phieuKho: (phieuR.data || []).map((r) => phieuTuDb(r, bd)),
    congNo: congNoTuDb(noR.data || []),
    tonCN, hsd, bangGia,
  };
}

// Việc chờ của Quản lý / GĐ / Kế toán: xin duyệt, chuyển khoản chưa xác nhận, ca lệch tiền chưa duyệt.
export async function taiViecCho(cap, laKT) {
  const kq = { duyet: [], ck: [], ca: [] };
  const viec = [];
  if (cap === 'gd' || cap === 'ql') {
    viec.push(supabase.from('pos_approvals').select('*').eq('status', 'cho').order('created_at', { ascending: false }).limit(50).then((r) => { kq.duyet = r.data || []; }));
    viec.push(supabase.from('pos_shifts').select('*').eq('status', 'closed').is('approved_by', null).order('closed_at', { ascending: false }).limit(50).then((r) => { kq.ca = r.data || []; }));
  }
  if (cap === 'gd' || cap === 'ql' || laKT) {
    viec.push(supabase.from('pos_invoices').select('id, code, store_location, cashier_name, paid_amount, created_at, customer_name')
      .eq('transfer_status', 'cho_xac_nhan').eq('status', 'xong').order('created_at', { ascending: false }).limit(200).then((r) => { kq.ck = r.data || []; }));
  }
  await Promise.all(viec);
  return kq;
}

export async function laKeToan() {
  try { return await goi('pos_la_ke_toan'); } catch { return false; }
}

// ── Hàng đợi khi mất mạng ──
let dbHua = null;
const moKho = () => { if (!dbHua) dbHua = openDB('bhq-that', 1, { upgrade(db) { db.createObjectStore('cho', { keyPath: 'khoa' }); } }); return dbHua; };

export async function xepHang(viec) {
  const db = await moKho();
  await db.put('cho', { ...viec, khoa: viec.khoa || maMoi(), luc: Date.now() });
}
export async function dsCho() {
  try { const db = await moKho(); return (await db.getAll('cho')).sort((a, b) => a.luc - b.luc); } catch { return []; }
}
// Gửi lần lượt; gặp lỗi mạng thì dừng (giữ thứ tự), gặp lỗi nghiệp vụ thì bỏ việc đó và báo lại.
let dangGui = false;
export async function guiHangDoi(onXong) {
  if (dangGui) return { conLai: (await dsCho()).length };
  dangGui = true;
  try {
    const db = await moKho();
    for (const v of await dsCho()) {
      try {
        const kq = await goi(v.ham, v.thamSo);
        await db.delete('cho', v.khoa);
        onXong?.({ viec: v, kq });
      } catch (e) {
        if (laLoiMang(e)) break;
        await db.delete('cho', v.khoa);
        onXong?.({ viec: v, loi: chuLoi(e) });
      }
    }
  } finally { dangGui = false; }
  return { conLai: (await dsCho()).length };
}

// Gọi ngay; mất mạng thì xếp hàng đợi (chỉ cho các việc gửi lại an toàn). Trả { kq } hoặc { choGui: true }.
export async function goiHoacXep(ham, thamSo, khoa) {
  try { return { kq: await goi(ham, thamSo) }; } catch (e) {
    if (!laLoiMang(e)) throw new Error(chuLoi(e));
    await xepHang({ ham, thamSo, khoa });
    return { choGui: true };
  }
}

// ── Ảnh (xuất huỷ) ──
export async function taiAnh(file, thuMuc) {
  const { nenAnh } = await import('../../../lib/nenAnh');
  const nho = await nenAnh(file);
  const duoi = ((nho.name || 'anh.jpg').split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
  const path = `pos/${thuMuc}/${maMoi()}.${duoi}`;
  const up = await supabase.storage.from('uploads').upload(path, nho, { contentType: nho.type || 'image/jpeg' });
  if (up.error) throw new Error(up.error.message);
  return path;
}
export async function linkAnh(path) {
  if (!path) return null;
  const { data } = await supabase.storage.from('uploads').createSignedUrl(path, 3600);
  return data?.signedUrl || null;
}

// ── VietQR (chuẩn EMVCo/NAPAS) — tạo ngay trên máy, không gửi số tài khoản ra dịch vụ ngoài ──
export const NGAN_HANG = [
  ['970436', 'Vietcombank'], ['970415', 'VietinBank'], ['970418', 'BIDV'], ['970405', 'Agribank'], ['970407', 'Techcombank'],
  ['970422', 'MB Bank'], ['970416', 'ACB'], ['970432', 'VPBank'], ['970403', 'Sacombank'], ['970423', 'TPBank'],
  ['970441', 'VIB'], ['970443', 'SHB'], ['970437', 'HDBank'], ['970448', 'OCB'], ['970426', 'MSB'], ['970440', 'SeABank'],
  ['970431', 'Eximbank'], ['970449', 'LPBank'], ['970428', 'Nam A Bank'], ['970409', 'Bac A Bank'], ['970425', 'ABBANK'],
  ['970412', 'PVcomBank'], ['970419', 'NCB'], ['970452', 'KienlongBank'], ['970438', 'BaoViet Bank'], ['970400', 'Saigonbank'],
];
const truong = (id, gt) => `${id}${String(gt.length).padStart(2, '0')}${gt}`;
export function crc16(s) {
  let crc = 0xffff;
  for (let i = 0; i < s.length; i += 1) {
    crc ^= s.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j += 1) crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}
export const khongDau = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D');
export function chuoiVietQr({ bin, soTk, tien, noiDung }) {
  const tk = truong('00', 'A000000727') + truong('01', truong('00', bin) + truong('01', soTk)) + truong('02', 'QRIBFTTA');
  const nd = khongDau(noiDung).replace(/[^A-Za-z0-9 ]/g, '').slice(0, 25);
  let s = truong('00', '01') + truong('01', '12') + truong('38', tk) + truong('53', '704');
  if (tien > 0) s += truong('54', String(Math.round(tien)));
  s += truong('58', 'VN');
  if (nd) s += truong('62', truong('08', nd));
  s += '6304';
  return s + crc16(s);
}
export async function anhVietQr(opts) {
  return QRCode.toDataURL(chuoiVietQr(opts), { margin: 1, width: 260, errorCorrectionLevel: 'M' });
}
// Nội dung chuyển khoản: "SUMI" + 6 ký tự đầu mã hoá đơn trên máy — đủ để dò sao kê.
export const noiDungCk = (id) => `SUMI ${String(id).replace(/-/g, '').slice(0, 6).toUpperCase()}`;
