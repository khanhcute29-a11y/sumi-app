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

// Hàng hoá của quầy (migration 202611181000): thêm / sửa / xoá (ẩn khỏi quầy). Database kiểm quyền.
export const themHangQuay = ({ ten, nhom, gia, ma, maVach }) => goi('pos_them_hang',
  { p_ten: ten, p_nhom: nhom || null, p_gia: Number(gia) || 0, p_ma: ma || null, p_ma_vach: maVach || null });
export const suaHangQuay = ({ pid, ten, nhom, gia, maVach }) => goi('pos_sua_hang',
  { p_id: pid, p_ten: ten, p_nhom: nhom || null, p_gia: Number(gia) || 0, p_ma_vach: maVach || null });
export const xoaHangQuay = (pid) => goi('pos_an_hang', { p_id: pid, p_an: true });

// Vào ca (migration 202611181020): khai "đã chi trước khi vào ca" khi két ít hơn ca trước.
// Database chưa chạy SQL mới → dùng hàm cũ (vẫn vào ca được, chỉ chưa ghi được lý do).
export async function vaoCa({ store, tien, anh, lyDoChi }) {
  try {
    return await goi('pos_vao_ca_v2', { p_store: store, p_opening_cash: Number(tien) || 0, p_photo_url: anh, p_ly_do_chi: lyDoChi || null });
  } catch (e) {
    if (!/pos_vao_ca_v2|schema cache|Could not find the function/i.test(String(e?.message || ''))) throw e;
    return goi('pos_vao_ca', { p_store: store, p_opening_cash: Number(tien) || 0, p_photo_url: anh });
  }
}
// Phiếu chi tiền từ két — p_id tạo trước để bấm 2 lần không ghi trùng.
export const chiKet = ({ id, caId, tien, lyDo, anh }) => goi('pos_chi_ket',
  { p_id: id, p_shift: caId, p_amount: Number(tien) || 0, p_reason: lyDo, p_photo_url: anh || null });
export const huyChiKet = (id, lyDo) => goi('pos_huy_chi_ket', { p_id: id, p_reason: lyDo });

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
    phuongThuc: r.pay_method, chia: r.pay_parts || null, khachDua: Number(r.received_amount), thucThu: Number(r.paid_amount), thua: Number(r.change_amount), no: Number(r.debt_amount),
    daHuy: r.status === 'huy', lyDoHuy: r.cancel_reason, nguoiHuy: r.cancelled_by_name, lucHuy: r.cancelled_at ? new Date(r.cancelled_at).getTime() : null,
    ckTrangThai: r.transfer_status, ckNguoi: r.transfer_checked_by_name, bangGia: r.price_list_name,
    diemDung: r.points_used, diemTien: Number(r.points_value), diemCong: r.points_earned, giamCuoiNgay: Number(r.eod_discount),
    offline: r.offline, that: true, thuNganId: r.cashier_id, anhBan: r.photo_url || null,
  };
}

const LOAI_TU_DB = { bep_giao: 'giao', xuat_huy: 'huy', kiem_kho: 'kiem', noi_bo: 'noibo', nhan_chuyen: 'giao' }; // nhận chuyển = phiếu chờ nhận ở mục Nhập hàng
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
    trangThai: TT_TU_DB[r.status], anh: r.photo_url, dong,
    // Xuất dùng nội bộ: phiếu mới có cột loai_xuat (reason = người nhận, note = ghi chú); phiếu cũ ghi "loại · người nhận" vào note.
    ...(r.doc_type === 'noi_bo'
      ? (r.loai_xuat != null ? { loaiXuat: r.loai_xuat, nguoiNhan: r.reason || '', ghiChu: r.note || '' } : { loaiXuat: r.note || '', nguoiNhan: '', ghiChu: '' })
      : { loaiXuat: '', ghiChu: r.reason || r.note || '' }),
    denCN: r.doc_type === 'noi_bo' ? r.to_store || null : null, tuCN: r.from_store || null, chuyen: r.doc_type === 'nhan_chuyen',
    lech: r.doc_type === 'nhan_chuyen' ? {} : Object.fromEntries(dong.filter((d) => d.delta != null).map((d) => [d.ma, Number(d.delta)])),
    nguon: r.doc_type === 'bep_giao' ? 'Bếp' : r.doc_type === 'nhan_chuyen' ? `${r.from_store || 'Cửa hàng khác'} chuyển sang` : '', that: true,
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

// Lô có HSD (bảng có từ migration 202611151000; chưa chạy thì rỗng). expiry_at = 0h sau ngày bán cuối cùng.
// quaHan: đã quá hạn (không bán được) · homNay: hết hạn cuối hôm nay. Ghi thêm hsd = ngày bán cuối của lô sớm nhất.
function tinhLo(rows, bd, hsd = {}) {
  const loCN = {};
  const bayGio = Date.now(); const dem = new Date(); dem.setHours(24, 0, 0, 0);
  for (const l of rows) {
    const m = bd.theoSize(l.product_id, l.size);
    if (!m) continue;
    const het = new Date(l.expiry_at).getTime(); const sl = Number(l.qty || 0);
    const cn = (loCN[l.store_location] = loCN[l.store_location] || {});
    const x = (cn[m.ma] = cn[m.ma] || { quaHan: 0, homNay: 0 });
    if (het <= bayGio) x.quaHan += sl; else if (het <= dem.getTime()) x.homNay += sl;
    hsd[l.store_location] = hsd[l.store_location] || {};
    const cuoi = het - 86400000;
    if (!(hsd[l.store_location][m.ma] <= cuoi)) hsd[l.store_location][m.ma] = cuoi;
  }
  return loCN;
}
const chonLo = () => supabase.from('pos_stock_lots').select('store_location, product_id, size, qty, expiry_at').gt('qty', 0).not('expiry_at', 'is', null).limit(5000);

// Nạp lại riêng lô (sau khi bán / làm phiếu) — nhẹ, không tải lại hoá đơn.
export async function taiLo(matHang) {
  const r = await chonLo();
  return r.error ? null : tinhLo(r.data || [], lapBanDoHang(matHang));
}

// ── Nạp toàn bộ dữ liệu quầy ──
export async function taiDuLieu(matHang, soNgay = 35) {
  const bd = lapBanDoHang(matHang);
  const tu = new Date(Date.now() - soNgay * 86400000).toISOString();
  const [caiDat, caMo, hdR, phieuR, noR, tonR, bgR, bgItemR, loR, hanR] = await Promise.all([
    supabase.from('pos_settings').select('*'),
    supabase.from('pos_shifts').select('*').eq('status', 'open'),
    supabase.from('pos_invoices').select('*, pos_invoice_lines(*)').gte('created_at', tu).order('created_at', { ascending: false }).limit(3000),
    supabase.from('pos_stock_docs').select('*').gte('created_at', tu).order('created_at', { ascending: false }).limit(1000),
    supabase.from('pos_debt_entries').select('customer_id, amount, entry_type, note, created_at, customers(name, phone)').order('created_at').limit(10000),
    supabase.from('finished_goods_stock').select('product_id, size, qty, expiry_date, store_location, is_semi_finished').not('store_location', 'is', null).eq('is_semi_finished', false),
    supabase.from('pos_price_lists').select('*').eq('active', true).order('name'),
    supabase.from('pos_price_list_items').select('*'),
    chonLo(),
    supabase.from('pos_shelf_life').select('product_id, days'),
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
  const loCN = tinhLo(loR.error ? [] : loR.data || [], bd, hsd);
  const hanDung = Object.fromEntries((hanR.error ? [] : hanR.data || []).map((r) => [r.product_id, r.days]));
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
    tonCN, hsd, bangGia, loCN, hanDung,
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
let tenKho = 'bhq-that';
const moKho = () => { if (!dbHua) dbHua = openDB(tenKho, 1, { upgrade(db) { db.createObjectStore('cho', { keyPath: 'khoa' }); } }); return dbHua; };
// Chỉ cho bài thử giao diện (supabase/tests/ban_hang_quay): hàng đợi riêng, không lẫn hàng đợi thật của máy.
export function doiKhoThu(ten) { dbHua = null; tenKho = ten; }

export async function xepHang(viec) {
  const db = await moKho();
  await db.put('cho', { ...viec, khoa: viec.khoa || maMoi(), luc: Date.now() });
}
export async function dsCho() {
  try { const db = await moKho(); return (await db.getAll('cho')).sort((a, b) => a.luc - b.luc); } catch { return []; }
}
// Gửi lần lượt; gặp lỗi mạng thì dừng (giữ thứ tự). Database từ chối thì KHÔNG xoá — tiền đã thu,
// hàng đã giao, mất việc này là mất dấu tiền. Giữ lại trên máy với lý do (`loi`), không gửi lại tự động
// nữa, hiện cho người bán thấy để báo Quản lý xử lý; chỉ xoá khi có người bấm "Đã xử lý".
let dangGui = false;
export async function guiHangDoi(onXong) {
  if (dangGui) return demCho();
  dangGui = true;
  try {
    const db = await moKho();
    for (const v of await dsCho()) {
      if (v.loi) continue;
      try {
        // Hoá đơn bán lúc mất mạng: ảnh còn nằm trên máy → tải ảnh lên trước, ghi lại đường dẫn rồi mới gửi.
        if (v.anh && v.ham === 'pos_ban' && !v.thamSo?.p?.photo_url) {
          const path = await taiAnhDaNen(v.anh, 'ban');
          v.thamSo = { ...v.thamSo, p: { ...v.thamSo.p, photo_url: path } };
          delete v.anh;
          await db.put('cho', v);
        }
        const kq = await goi(v.ham, v.thamSo);
        await db.delete('cho', v.khoa);
        onXong?.({ viec: v, kq });
      } catch (e) {
        if (laLoiMang(e)) break;
        const loi = chuLoi(e);
        await db.put('cho', { ...v, loi, lucLoi: Date.now() });
        onXong?.({ viec: v, loi });
      }
    }
  } finally { dangGui = false; }
  return demCho();
}
// conLai = còn chờ gửi (sẽ tự gửi khi có mạng) · biLoi = database đã từ chối, cần người xử lý.
export async function demCho() {
  const ds = await dsCho();
  return { conLai: ds.filter((v) => !v.loi).length, biLoi: ds.filter((v) => v.loi).length };
}
export async function boViecLoi(khoa) {
  const db = await moKho();
  await db.delete('cho', khoa);
}
export async function guiLaiViecLoi(khoa) {
  const db = await moKho();
  const v = await db.get('cho', khoa);
  if (v) { delete v.loi; delete v.lucLoi; await db.put('cho', v); }
}

// Gọi ngay; mất mạng thì xếp hàng đợi (chỉ cho các việc gửi lại an toàn). Trả { kq } hoặc { choGui: true }.
export async function goiHoacXep(ham, thamSo, khoa) {
  try { return { kq: await goi(ham, thamSo) }; } catch (e) {
    if (!laLoiMang(e)) throw new Error(chuLoi(e));
    await xepHang({ ham, thamSo, khoa });
    return { choGui: true };
  }
}

// ── Ảnh ──
// Ảnh bán hàng: đọc + nén ngay khi chọn (chụp hoặc lấy từ thư viện), tính mã ảnh từ file GỐC để
// database chặn dùng lại 1 ảnh cho 2 hoá đơn. Chưa tải lên — tải lúc bấm thanh toán (mất mạng thì giữ trên máy).
export const ANH_BAN = { canhDai: 1280, chatLuong: 0.72, boQuaDuoi: 200 * 1024 };
export async function docAnhBan(file) {
  if (!file || !String(file.type || '').startsWith('image/')) throw new Error('Chọn một file ảnh');
  const goc = await file.arrayBuffer();
  let ma = null;
  try {
    const bam = await crypto.subtle.digest('SHA-256', goc);
    ma = [...new Uint8Array(bam)].map((b) => b.toString(16).padStart(2, '0')).join('');
  } catch { ma = null; } // trình duyệt cũ / không phải HTTPS: vẫn bán được, chỉ không chặn ảnh trùng
  const { nenAnh } = await import('../../../lib/nenAnh');
  // Ảnh hoá đơn (bánh / tiền / màn hình CK): 1280px · JPEG 72% ≈ 150–250KB/tấm, chữ CK vẫn đọc rõ
  // (bản chung 1600px · 80% ≈ 500KB). Ảnh hoá đơn quá 90 ngày được dọn tự động (api/don-anh-quay.js).
  const nho = await nenAnh(file, ANH_BAN);
  return { blob: nho, ma, url: URL.createObjectURL(nho) };
}
export async function taiAnhDaNen(blob, thuMuc) {
  const duoi = (((blob && blob.name) || 'anh.jpg').split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
  const path = `pos/${thuMuc}/${maMoi()}.${duoi}`;
  const up = await supabase.storage.from('uploads').upload(path, blob, { contentType: (blob && blob.type) || 'image/jpeg' });
  if (up.error) throw new Error(up.error.message);
  return path;
}
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
// Ảnh hoá đơn: phân biệt "ảnh đã được dọn sau 90 ngày" ('mat') với lỗi mạng ('') để không báo nhầm.
export async function linkAnhHoaDon(path) {
  if (!path) return '';
  try {
    const { data, error } = await supabase.storage.from('uploads').createSignedUrl(path, 3600);
    if (data?.signedUrl) return data.signedUrl;
    return /not.?found/i.test(error?.message || '') ? 'mat' : '';
  } catch { return ''; }
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
