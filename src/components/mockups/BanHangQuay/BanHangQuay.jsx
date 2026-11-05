import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowLeftRight, ChevronDown, ChevronLeft, ChevronRight, CirclePlus, Clock, EllipsisVertical, Filter, Image as IconAnh,
  List, Menu, Minus, Pencil, PersonStanding, Plus, Printer, ReceiptText, Repeat, ScanBarcode, Search, ShoppingBag, Tag,
  Trash2, Undo2, User, X, Zap,
} from 'lucide-react';
import { supabase } from '../../../lib/supabaseClient';
import {
  CHI_NHANH, DANH_MUC, THU_KHAC_GOI_Y, LOAI_PHIEU, LY_DO_HUY, LY_DO_HUY_HD, LOAI_NOI_BO,
  taoMatHang, tonGia, tienDong, tinhHoaDon, tinhThanhToan, tinhKetCa, tinhTraHang, apPhieuKho, tinhCongNo, baoCaoNgay,
} from './banHangQuayLogic';
import './ban-hang-quay.css';

// BẢN XEM TRƯỚC "Bán tại quầy" — thiết kế giai đoạn 1 (.scratch/ban-hang-quay/03-thiet-ke-giai-doan-1.md).
// 05/11/2026 (lần 2): Giám đốc yêu cầu BẢN SAO 1:1 màn bán KiotViet tiệm đang dùng để
// nhân viên không phải học lại — nên màu (xanh #0070F4, nền xám), chữ ("Hóa đơn 1",
// "Tìm hàng hóa (F3)"), cách viết số (450,000) và vị trí từng nút đều theo KiotViet,
// KHÁC bảng màu Sumi ở AGENTS §8 (đã báo Giám đốc). Không dùng logo/tên KiotViet.
// Mở bằng ?mockup=ban-hang. Đọc sản phẩm/khách THẬT (chỉ đọc) nếu đã đăng nhập,
// không thì dữ liệu mẫu. MỌI THAO TÁC chỉ nằm trong bộ nhớ trình duyệt — tải lại
// trang là mất, KHÔNG ghi gì vào database.

const SP_MAU = [
  { id: 'm1', name: 'Bánh mì bơ tỏi', category: 'banh_man_ngot', price: 25000 },
  { id: 'm2', name: 'Bánh su kem', category: 'banh_su', price: 12000 },
  { id: 'm3', name: 'Tiramisu ly', category: 'mousse_tiramisu', price: 45000 },
  { id: 'm4', name: 'Cupcake socola', category: 'cupcake', price: 30000 },
  { id: 'm5', name: 'Bánh kem bắp', category: 'banh_kem', price: 0, product_variants: [{ id: 's16', label: 'Size 16', price: 220000 }, { id: 's20', label: 'Size 20', price: 320000 }] },
  { id: 'm6', name: 'Macaron hộp 6', category: 'macaron', price: 120000 },
];
const KHACH_MAU = [{ id: 'k1', name: 'Khách mẫu A', phone: '0900000001' }, { id: 'k2', name: 'Khách mẫu B', phone: '0900000002' }];
const KHACH_LE = { id: null, name: 'Khách lẻ', phone: '' };
const PT = { tien_mat: 'Tiền mặt', chuyen_khoan: 'Chuyển khoản', the: 'Thẻ' };
const NGAY = 86400000;
const MOI_TRANG = 15; // KiotViet: 15 hàng / trang ở chế độ Bán thường
const MAU_ANH = ['#F9C6D3', '#C9DCF7', '#F8D9B5', '#CDE8D2', '#E3D3F5', '#F7E3A8'];
const TIEU_DE = { ls: 'Hóa đơn', kho: 'Kho thành phẩm', no: 'Công nợ khách', ngay: 'Báo cáo cuối ngày' };
const gio = (t) => new Date(t).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
const ngayGio = (t) => new Date(t).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });
const ngayDayDu = (t) => { const d = new Date(t); const p = (n) => String(n).padStart(2, '0'); return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`; };
const cungNgay = (a, b) => new Date(a).toDateString() === new Date(b).toDateString();
const soTien = (v) => String(v).replace(/\D/g, '');
// KiotViet viết số tiền kiểu 450,000 (dấu phẩy, không "đ") — giữ y nguyên cho nhân viên quen mắt.
const so = (n) => Math.round(Number(n) || 0).toLocaleString('en-US');
const hdMoi = (so_, nguoiBan) => ({
  id: `${Date.now()}-${so_}`, so: so_, dong: [], giam: 0, giamKieu: 'vnd', khach: KHACH_LE, thuKhac: [], vat: false,
  ghiChu: '', nguoiBan, pt: 'tien_mat', dua: null, // dua = null: "Khách thanh toán" tự bằng "Khách cần trả" như KiotViet
});
const docLuu = (k, md) => { try { return localStorage.getItem(k) ?? md; } catch { return md; } };
const ghiLuu = (k, v) => { try { localStorage.setItem(k, v); } catch { /* trình duyệt chặn lưu — bỏ qua */ } };
const mauCua = (s) => { let h = 0; for (const c of s || '') h = (h * 31 + c.charCodeAt(0)) % 97; return MAU_ANH[h % MAU_ANH.length]; };

function useDienThoai() {
  const q = '(max-width: 759px)';
  const [dt, setDt] = useState(() => typeof window !== 'undefined' && window.matchMedia(q).matches);
  useEffect(() => {
    const m = window.matchMedia(q);
    const f = () => setDt(m.matches);
    m.addEventListener('change', f);
    return () => m.removeEventListener('change', f);
  }, []);
  return dt;
}

export default function BanHangQuay() {
  const dienThoai = useDienThoai();
  const [matHang, setMatHang] = useState([]);
  const [khachDs, setKhachDs] = useState(KHACH_MAU);
  const [nguonDl, setNguonDl] = useState('…');
  const [chiNhanh, setChiNhanh] = useState(CHI_NHANH[0]);
  const [manHinh, setManHinh] = useState('ban');
  const [cheDo, setCheDo] = useState(() => docLuu('bhq-che-do', 'thuong'));
  const [inTuDong, setInTuDong] = useState(() => docLuu('bhq-in-tu-dong', '1') === '1');
  // Ca tự bắt đầu theo tài khoản đăng nhập — KiotViet không có bước "Mở ca".
  const [ca, setCa] = useState(() => ({ nguoi: 'Thu ngân', dauCa: 0, moLuc: Date.now() }));
  const [hds, setHds] = useState(() => [hdMoi(1, 'Thu ngân')]);
  const [hdId, setHdId] = useState(null);
  const [tonCN, setTonCN] = useState({}); // { chiNhanh: { ma: tồn } }
  const [theKho, setTheKho] = useState([]); // [{ luc, chiNhanh, ma, chungTu, loai, sl, tonCuoi, nguoi }]
  const [daBan, setDaBan] = useState([]);
  const [thuNos, setThuNos] = useState([]);
  const [traHangs, setTraHangs] = useState([]);
  const [phieuKho, setPhieuKho] = useState([]);
  const [hop, setHop] = useState(null);
  const [menuMo, setMenuMo] = useState(false);
  const [ttMo, setTtMo] = useState(false); // Bán thường: khung thanh toán trượt ra
  const [dtMan, setDtMan] = useState('chon'); // điện thoại: chon → gio → tt (như app KiotViet)
  const [dm, setDm] = useState('all');
  const [locMo, setLocMo] = useState(false);
  const [xemDs, setXemDs] = useState(false); // "Chế độ danh sách"
  const [trang, setTrang] = useState(0);
  const [bao, setBao] = useState(null); // { msg, hoaDon? }
  const [banIn, setBanIn] = useState(null); // nội dung đang gửi ra máy in (#bhq-in)
  const [bayGio, setBayGio] = useState(() => Date.now());
  const timRef = useRef(null);
  const khachRef = useRef(null);
  const duaRef = useRef(null);
  const baoHen = useRef(null);
  const demHd = useRef(1);
  const ton = tonCN[chiNhanh] || {};

  useEffect(() => { const t = window.setInterval(() => setBayGio(Date.now()), 30000); return () => window.clearInterval(t); }, []);

  useEffect(() => {
    let huy = false;
    const choToiDa = setTimeout(() => {
      if (!huy) { setMatHang((m) => (m.length ? m : taoMatHang(SP_MAU))); setNguonDl((n) => (n === '…' ? 'dữ liệu mẫu (mạng chậm)' : n)); }
    }, 6000);
    (async () => {
      let sp = SP_MAU; let nguon = 'dữ liệu mẫu (chưa đăng nhập)'; let kh = null; let ten = null;
      try {
        const { data: s } = await supabase.auth.getSession();
        if (s?.session) {
          const { data, error } = await supabase.from('products').select('*, product_variants(*)').eq('active', true).order('created_at');
          if (!error && data?.length) { sp = data; nguon = `${data.length} sản phẩm thật (chỉ đọc)`; }
          const r = await supabase.from('customers').select('id,name,phone').eq('is_school', false).order('name').limit(500);
          kh = r.data;
          const pr = await supabase.from('profiles').select('id,full_name').eq('id', s.session.user.id).maybeSingle();
          ten = pr.data?.full_name || null;
        }
      } catch { /* dùng dữ liệu mẫu */ }
      if (huy) return;
      clearTimeout(choToiDa);
      setMatHang(taoMatHang(sp));
      setNguonDl(nguon);
      if (ten) { setCa((c) => ({ ...c, nguoi: ten })); setHds((ds) => ds.map((h) => ({ ...h, nguoiBan: ten }))); }
      const ds = kh?.length ? kh : KHACH_MAU;
      setKhachDs(ds);
      // Nợ MẪU để thấy màn Công nợ (tuổi nợ): 2 khách đầu danh sách.
      const bay = Date.now();
      setDaBan(ds.slice(0, 2).map((k, i) => ({
        ma: `HD-MAU${i + 1}`, luc: bay - (i ? 95 : 12) * NGAY, chiNhanh: CHI_NHANH[0], thuNgan: 'Dữ liệu mẫu', khach: k,
        dong: [], tongHang: 0, giamHd: 0, sauGiam: 0, thuKhac: 0, vat: 0, giaVon: 0, canTra: i ? 450000 : 180000,
        phuongThuc: 'tien_mat', khachDua: 0, thucThu: 0, thua: 0, no: i ? 450000 : 180000, daHuy: false, mau: true,
      })));
    })();
    return () => { huy = true; clearTimeout(choToiDa); };
  }, []);

  // Tồn kho giả theo từng chi nhánh (nạp 1 lần khi có danh mục).
  useEffect(() => {
    if (!matHang.length) return;
    const t = {};
    for (const cn of CHI_NHANH) { t[cn] = {}; for (const m of matHang) t[cn][m.ma] = tonGia(m.ma, cn); }
    setTonCN(t);
  }, [matHang]);

  // In: đợi #bhq-in vẽ xong nội dung mới rồi mới mở hộp in (máy ZyWell 80mm qua USB).
  useEffect(() => {
    if (!banIn) return undefined;
    const t = setTimeout(() => window.print(), 80);
    return () => clearTimeout(t);
  }, [banIn]);

  useEffect(() => { if (!hdId && hds[0]) setHdId(hds[0].id); }, [hdId, hds]);
  const hd = hds.find((h) => h.id === hdId) || hds[0];
  const tong = tinhHoaDon(hd);
  const suaHd = (fn) => setHds((ds) => ds.map((h) => (h.id === hd.id ? fn(h) : h)));
  const sua = (thay) => suaHd((h) => ({ ...h, ...thay }));
  const nhan = (msg, hoaDon = null) => {
    clearTimeout(baoHen.current);
    setBao({ msg, hoaDon });
    baoHen.current = setTimeout(() => setBao(null), hoaDon ? 6000 : 2600);
  };
  const nguoi = ca.nguoi;

  // Ghi tồn + thẻ kho cho 1 chi nhánh. thay = [{ ma, sl(±) }].
  const ghiKho = (cn, thay, chungTu, loai) => {
    const truoc = tonCN[cn] || {};
    const sau = { ...truoc };
    const dong = [];
    for (const t of thay) { sau[t.ma] = (sau[t.ma] ?? 0) + t.sl; dong.push({ luc: Date.now(), chiNhanh: cn, ma: t.ma, chungTu, loai, sl: t.sl, tonCuoi: sau[t.ma], nguoi }); }
    setTonCN((x) => ({ ...x, [cn]: sau }));
    setTheKho((x) => [...dong, ...x]);
  };

  const monLoc = useMemo(() => matHang.filter((m) => dm === 'all' || m.danhMuc === dm), [matHang, dm]);
  const dmCo = useMemo(() => DANH_MUC.filter((d) => matHang.some((m) => m.danhMuc === d.value)), [matHang]);
  const soTrang = Math.max(Math.ceil(monLoc.length / MOI_TRANG), 1);
  const trangHien = Math.min(trang, soTrang - 1);
  const slTrongGio = useMemo(() => Object.fromEntries(hd.dong.map((d) => [d.ma, d.sl])), [hd]);

  const themMon = (m) => {
    suaHd((h) => {
      const co = h.dong.find((d) => d.ma === m.ma);
      const dong = co ? h.dong.map((d) => (d.ma === m.ma ? { ...d, sl: d.sl + 1 } : d))
        : [...h.dong, { ma: m.ma, ten: m.ten, size: m.size, gia: m.gia, giaVon: m.giaVon, sl: 1, giam: 0, giamKieu: 'vnd', ghiChu: '', danhMuc: m.danhMuc, anh: m.anh }];
      return { ...h, dong, dua: null };
    });
    if ((ton[m.ma] ?? 0) - (slTrongGio[m.ma] || 0) <= 0) nhan(`${m.ten} đã hết tồn trên máy — vẫn bán được, cuối ngày nhớ kiểm kho`);
  };
  const datSl = (ma, sl) => suaHd((h) => ({ ...h, dua: null, dong: h.dong.map((d) => (d.ma === ma ? { ...d, sl: Math.max(sl, 0) } : d)) }));
  const chotSl = (ma) => suaHd((h) => ({ ...h, dong: h.dong.map((d) => (d.ma === ma && d.sl < 1 ? { ...d, sl: 1 } : d)) }));
  const boDong = (ma) => suaHd((h) => ({ ...h, dua: null, dong: h.dong.filter((d) => d.ma !== ma) }));
  const suaDong = (ma, thay) => suaHd((h) => ({ ...h, dua: null, dong: h.dong.map((d) => (d.ma === ma ? { ...d, ...thay } : d)) }));
  const themHd = () => { demHd.current += 1; const h = hdMoi(demHd.current, nguoi); setHds((ds) => [...ds, h]); setHdId(h.id); setTtMo(false); return h; };
  const dongHd = (id) => setHds((ds) => {
    const con = ds.filter((h) => h.id !== id);
    if (!con.length) demHd.current = 1;
    const kq = con.length ? con : [hdMoi(1, nguoi)];
    if (id === hd.id) setHdId(kq[kq.length - 1].id);
    return kq;
  });
  const doiCheDo = (c) => { setCheDo(c); ghiLuu('bhq-che-do', c); setTtMo(false); };
  const doiInTuDong = () => setInTuDong((v) => { ghiLuu('bhq-in-tu-dong', v ? '0' : '1'); nhan(`In tự động: ${v ? 'Tắt' : 'Bật'}`); return !v; });

  const hoanTat = () => {
    if (!hd.dong.length) return;
    const dua = hd.dua == null ? tong.canTra : hd.dua;
    const tt = tinhThanhToan({ canTra: tong.canTra, khachDua: dua, phuongThuc: hd.pt, laKhachLe: !hd.khach.id });
    if (tt.loi) { nhan(tt.loi); return; }
    const ma = `HD${String(daBan.filter((h) => !h.mau).length + 1).padStart(6, '0')}`;
    const banGhi = {
      ma, luc: Date.now(), chiNhanh, thuNgan: nguoi, nguoiBan: hd.nguoiBan || nguoi, khach: hd.khach, dong: hd.dong,
      thuKhacDong: hd.thuKhac, ghiChu: hd.ghiChu, ...tong, phuongThuc: hd.pt, khachDua: Number(dua) || 0, ...tt, daHuy: false,
    };
    setDaBan((ds) => [banGhi, ...ds]);
    ghiKho(chiNhanh, hd.dong.map((d) => ({ ma: d.ma, sl: -d.sl })), ma, 'Bán hàng');
    dongHd(hd.id);
    setTtMo(false);
    setDtMan('chon');
    if (inTuDong) setBanIn({ ...banGhi });
    nhan(`Thanh toán thành công ${ma} · ${so(tong.canTra)}${tt.thua ? ` · tiền thừa ${so(tt.thua)}` : ''}${tt.no ? ` · ghi nợ ${so(tt.no)}` : ''}`, banGhi);
    if (!dienThoai) setTimeout(() => timRef.current?.focus(), 50);
  };

  const inTamTinh = () => {
    if (!hd.dong.length) return;
    setBanIn({
      ...tong, ma: 'TẠM TÍNH', tamTinh: true, luc: Date.now(), chiNhanh, thuNgan: nguoi, khach: hd.khach,
      dong: hd.dong, thuKhacDong: hd.thuKhac, ghiChu: hd.ghiChu,
    });
  };

  // Phím tắt như KiotViet: F1 HĐ mới · F2 in tự động · F3 tìm hàng · F4 tìm khách · F8 khách thanh toán · F9 thanh toán.
  useEffect(() => {
    const onKey = (e) => {
      if (manHinh !== 'ban' || hop) return;
      const k = e.key;
      if (k === 'F1') { e.preventDefault(); themHd(); }
      else if (k === 'F2') { e.preventDefault(); doiInTuDong(); }
      else if (k === 'F3') { e.preventDefault(); timRef.current?.focus(); }
      else if (k === 'F4') { e.preventDefault(); khachRef.current?.focus(); }
      else if (k === 'F8' && hd.dong.length) {
        e.preventDefault();
        if (cheDo === 'thuong') setTtMo(true);
        setTimeout(() => duaRef.current?.focus(), 30);
      } else if (k === 'F9' && hd.dong.length) {
        e.preventDefault();
        if (cheDo === 'thuong' && !ttMo && !dienThoai) setTtMo(true); else hoanTat();
      } else if (k === 'Escape') { setMenuMo(false); setTtMo(false); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // Thu ngân chỉ tự huỷ được hoá đơn trong ca đang mở (bấm nhầm món / sai số lượng); đã kết ca → Quản lý / Giám đốc.
  const huyDuoc = (h) => h.luc >= ca.moLuc && h.chiNhanh === chiNhanh;
  const daTraCua = (maHd) => {
    const kq = {};
    for (const t of traHangs) if (t.hdGoc === maHd) for (const d of t.dong) kq[d.ma] = (kq[d.ma] || 0) + d.sl;
    return kq;
  };
  const huyHoaDon = (ma, lyDo) => {
    const h = daBan.find((x) => x.ma === ma);
    if (!h || h.daHuy || !huyDuoc(h)) return;
    setDaBan((ds) => ds.map((x) => (x.ma === ma ? { ...x, daHuy: true, lyDoHuy: lyDo, nguoiHuy: nguoi, lucHuy: Date.now() } : x)));
    const conLai = h.dong.map((d) => ({ ma: d.ma, sl: d.sl - (daTraCua(ma)[d.ma] || 0) })).filter((d) => d.sl > 0);
    if (conLai.length) ghiKho(h.chiNhanh, conLai, ma, 'Huỷ hoá đơn');
    nhan(`Đã huỷ ${ma} — đã cộng lại tồn kho${h.no ? ', xoá phần nợ' : ''}`);
  };
  const luuTraHang = (hdGoc, ketQua, phuongThuc, lyDo) => {
    const ma = `TH${String(traHangs.length + 1).padStart(6, '0')}`;
    setTraHangs((x) => [{ ma, luc: Date.now(), chiNhanh: hdGoc.chiNhanh, hdGoc: hdGoc.ma, khach: hdGoc.khach, nguoi, phuongThuc, lyDo, ...ketQua }, ...x]);
    ghiKho(hdGoc.chiNhanh, ketQua.dong.map((d) => ({ ma: d.ma, sl: d.sl })), ma, 'Trả hàng');
    nhan(`Đã trả hàng ${ma} · trả lại khách ${so(ketQua.tienTra)} (${PT[phuongThuc].toLowerCase()})`);
  };

  const luuPhieu = (phieu, hoanThanh) => {
    if (!hoanThanh) { setPhieuKho((ds) => [{ ...phieu, trangThai: 'tam' }, ...ds.filter((p) => p.ma !== phieu.ma)]); nhan('Đã lưu phiếu tạm — chưa tác động tồn kho'); return; }
    const { lech, the } = apPhieuKho(tonCN[phieu.chiNhanh] || {}, phieu, 1);
    ghiKho(phieu.chiNhanh, the.map((t) => ({ ma: t.ma, sl: t.sl })), phieu.ma, LOAI_PHIEU[phieu.loai].ten);
    setPhieuKho((ds) => [{ ...phieu, lech, trangThai: 'xong', luc: Date.now() }, ...ds.filter((p) => p.ma !== phieu.ma)]);
  };
  const huyPhieu = (ma) => {
    const p = phieuKho.find((x) => x.ma === ma);
    if (!p) return;
    if (p.trangThai === 'xong') {
      const { the } = apPhieuKho(tonCN[p.chiNhanh] || {}, p, -1);
      ghiKho(p.chiNhanh, the.map((t) => ({ ma: t.ma, sl: t.sl })), `${p.ma} (huỷ)`, `Huỷ ${LOAI_PHIEU[p.loai].ten.toLowerCase()}`);
    }
    setPhieuKho((ds) => ds.map((x) => (x.ma === ma ? { ...x, trangThai: 'huy' } : x)));
  };

  const thuNo = (khachId, tien, phuongThuc) => {
    setThuNos((x) => [...x, { khachId, tien, phuongThuc, luc: Date.now(), chiNhanh, nguoi }]);
    nhan(`Đã thu nợ ${so(tien)}`);
  };

  const trongCa = (x) => x.luc >= ca.moLuc && x.chiNhanh === chiNhanh;
  const congNo = useMemo(() => tinhCongNo(daBan, thuNos), [daBan, thuNos]);
  const noCua = (k) => (k?.id ? (congNo.find((x) => x.khach.id === k.id)?.tong || 0) : 0);
  const khachNo = noCua(hd.khach);
  const nguoiBanDs = [...new Set([hd.nguoiBan || nguoi, nguoi, 'Nhân viên quầy 2 (mẫu)'])];
  const moManHinh = (m) => { setManHinh(m); setMenuMo(false); setTtMo(false); };
  const moHop = (h) => { setHop(h); setMenuMo(false); };
  const chonKhach = (k) => sua({ khach: k, dua: null });

  const oKhach = (
    <KhachO khach={hd.khach} ds={khachDs} noCua={noCua} inputRef={khachRef}
      onChon={chonKhach} onThem={() => setHop({ loai: 'them_khach' })} />
  );
  const khungTT = (onDong) => (
    <KhungThanhToan hd={hd} tong={tong} bayGio={bayGio} nguoiBanDs={nguoiBanDs} khachNo={khachNo} duaRef={duaRef} onSua={sua}
      oKhach={oKhach} onThuKhac={() => setHop({ loai: 'thu_khac' })} onIn={inTamTinh} onXong={hoanTat} onDong={onDong} />
  );
  const tabsHd = (
    <div className="kv-tabs">
      {hds.map((h) => (
        <span key={h.id} className={`kv-tab ${h.id === hd.id ? 'on' : ''}`}>
          <button type="button" onClick={() => { setHdId(h.id); setTtMo(false); }}>
            <ArrowLeftRight size={16} /> Hóa đơn {h.so}
          </button>
          <button type="button" className="x" aria-label={`Đóng Hóa đơn ${h.so}`}
            onClick={() => (h.dong.length ? setHop({ loai: 'dong_hd', id: h.id, so: h.so }) : dongHd(h.id))}><X size={15} /></button>
        </span>
      ))}
      <button type="button" className="kv-tab-them" aria-label="Thêm mới hóa đơn (F1)" title="Thêm mới (F1)" onClick={themHd}><CirclePlus size={19} /></button>
      {hds.length > 1 && (
        <select className="kv-tab-ds" value={hd.id} onChange={(e) => setHdId(e.target.value)} aria-label="Danh sách hóa đơn đang mở">
          {hds.map((h) => <option key={h.id} value={h.id}>Hóa đơn {h.so}</option>)}
        </select>
      )}
    </div>
  );
  const nutMenu = <button type="button" className="kv-ic-tr" aria-label="Menu" title="Menu" onClick={() => setMenuMo((v) => !v)}><Menu size={21} /></button>;
  const chips = (
    <div className="kv-chips">
      <button type="button" className={dm === 'all' ? 'on' : ''} onClick={() => { setDm('all'); setTrang(0); }}>Tất cả</button>
      {dmCo.map((d) => <button key={d.value} type="button" className={dm === d.value ? 'on' : ''} onClick={() => { setDm(d.value); setTrang(0); }}>{d.label}</button>)}
    </div>
  );
  const timHang = <TimHang matHang={matHang} ton={ton} inputRef={timRef} onChon={themMon} />;
  const dongBo = () => { setMatHang((m) => [...m]); nhan('Đã đồng bộ dữ liệu'); };

  return (
    <div className={`bhq kv ${dienThoai ? 'dt' : ''}`}>
      {manHinh !== 'ban' && (
        <header className="kv-top kv-ql">
          <nav className="kv-ql-tabs">
            {Object.entries(TIEU_DE).map(([k, t]) => <button key={k} type="button" className={manHinh === k ? 'on' : ''} onClick={() => setManHinh(k)}>{t}{k === 'no' && congNo.length ? <i>{congNo.length}</i> : null}</button>)}
          </nav>
          <div className="kv-top-r">
            <button type="button" className="kv-ve-ban" onClick={() => setManHinh('ban')}><ShoppingBag size={17} /> Bán hàng</button>
            {nutMenu}
          </div>
        </header>
      )}

      {manHinh === 'ban' && !dienThoai && (
        <>
          <header className="kv-top">
            {timHang}
            {tabsHd}
            <div className="kv-top-r">
              <button type="button" className="kv-ic-tr" title="Xử lý đặt hàng" aria-label="Xử lý đặt hàng" onClick={() => nhan('Đơn đặt bánh xử lý ở mục Đơn hàng của app')}><ShoppingBag size={20} /></button>
              <button type="button" className="kv-ic-tr" title="Trả hàng" aria-label="Trả hàng" onClick={() => setHop({ loai: 'chon_hd_tra' })}><Undo2 size={20} /></button>
              <button type="button" className="kv-ic-tr" title="Đồng bộ dữ liệu" aria-label="Đồng bộ dữ liệu" onClick={dongBo}><Repeat size={20} /></button>
              <button type="button" className="kv-ic-tr" title="Thiết lập in" aria-label="Thiết lập in" onClick={() => setHop({ loai: 'thiet_lap_in' })}><Printer size={20} /></button>
              <span className="kv-user">{nguoi}</span>
              {nutMenu}
            </div>
          </header>

          <main className={`kv-ban ${cheDo}`}>
            <section className="kv-trai">
              <GioHang hd={hd} onSl={datSl} onChotSl={chotSl} onBo={boDong} onSuaDong={suaDong} />
              <div className="kv-trai-chan">
                <label className="kv-ghi-chu"><Pencil size={16} /><input value={hd.ghiChu} onChange={(e) => sua({ ghiChu: e.target.value })} placeholder="Ghi chú đơn hàng" /></label>
                {cheDo === 'thuong' && <><span className="kv-tth">Tổng tiền hàng</span><span className="kv-tth-sl">{tong.soMon}</span><b className="kv-tth-so">{so(tong.tongHang)}</b></>}
              </div>
            </section>

            <section className="kv-phai">
              {cheDo === 'nhanh' ? khungTT(null) : (
                <>
                  <div className="kv-phai-dau">
                    {oKhach}
                    <div className="kv-phai-ic">
                      <button type="button" className={`kv-ic ${xemDs ? 'on' : ''}`} title="Chế độ danh sách" aria-label="Chế độ danh sách" onClick={() => setXemDs((v) => !v)}><List size={20} /></button>
                      <button type="button" className={`kv-ic ${locMo ? 'on' : ''}`} title="Lọc theo nhóm hàng" aria-label="Lọc theo nhóm hàng" onClick={() => setLocMo((v) => !v)}><Filter size={19} /></button>
                      <button type="button" className="kv-ic" title="Chế độ hình ảnh" aria-label="Chế độ hình ảnh" onClick={() => setXemDs(false)}><IconAnh size={20} /></button>
                    </div>
                  </div>
                  {locMo && chips}
                  <ul className={`kv-luoi ${xemDs ? 'ds' : ''}`}>
                    {monLoc.slice(trangHien * MOI_TRANG, (trangHien + 1) * MOI_TRANG).map((m) => (
                      <li key={m.ma}>
                        <button type="button" className="kv-o-mon" onClick={() => themMon(m)} title={`${m.ten}${m.size ? ` ${m.size}` : ''} - Tồn: ${ton[m.ma] ?? 0}`}>
                          <AnhNho m={m} />
                          <span className="t">
                            <span className="ten">{m.ten}{m.size ? ` - ${m.size}` : ''}</span>
                            <span className="gia">{so(m.gia)}</span>
                          </span>
                          {slTrongGio[m.ma] ? <i className="dem">{slTrongGio[m.ma]}</i> : null}
                        </button>
                      </li>
                    ))}
                    {!monLoc.length && <li className="kv-rong">Đang tải hàng hóa…</li>}
                  </ul>
                  <div className="kv-phai-chan">
                    <span className="kv-trang">
                      <button type="button" aria-label="Trang trước" disabled={trangHien === 0} onClick={() => setTrang(trangHien - 1)}><ChevronLeft size={18} /></button>
                      <span>{trangHien + 1}/{soTrang}</span>
                      <button type="button" aria-label="Trang sau" disabled={trangHien >= soTrang - 1} onClick={() => setTrang(trangHien + 1)}><ChevronRight size={18} /></button>
                    </span>
                    <button type="button" className="kv-nut-in" onClick={inTamTinh}>IN</button>
                    <button type="button" className="kv-nut-tt" onClick={() => (hd.dong.length ? setTtMo(true) : nhan('Hóa đơn chưa có hàng hóa'))}>THANH TOÁN</button>
                  </div>
                  {ttMo && <div className="kv-tt-phu">{khungTT(() => setTtMo(false))}</div>}
                </>
              )}
            </section>
          </main>

          <footer className="kv-chan">
            <button type="button" className={cheDo === 'nhanh' ? 'on' : ''} onClick={() => doiCheDo('nhanh')}><span className="ic"><Zap size={17} /></span>Bán nhanh</button>
            <button type="button" className={cheDo === 'thuong' ? 'on' : ''} onClick={() => doiCheDo('thuong')}><span className="ic"><Clock size={17} /></span>Bán thường</button>
            <span className="kv-nguon">Bản xem trước · không lưu · {nguonDl}</span>
            <button type="button" className="kv-ca" onClick={() => setHop({ loai: 'ket_ca' })}>Ca {nguoi} · từ {gio(ca.moLuc)} · <b>Kết ca</b></button>
          </footer>
        </>
      )}

      {manHinh === 'ban' && dienThoai && (
        <DienThoai dtMan={dtMan} setDtMan={setDtMan} hd={hd} tong={tong} monLoc={monLoc} ton={ton} slTrongGio={slTrongGio}
          chips={chips} locMo={locMo} setLocMo={setLocMo} themMon={themMon} datSl={datSl} boDong={boDong} sua={sua}
          boChon={() => sua({ dong: [], dua: null })} luuTam={() => { themHd(); setDtMan('chon'); nhan(`Đã lưu tạm Hóa đơn ${hd.so}`); }}
          khachNo={khachNo} chonKhach={() => setHop({ loai: 'chon_khach_dt' })} onThuKhac={() => setHop({ loai: 'thu_khac' })}
          inTamTinh={inTamTinh} hoanTat={hoanTat} nutMenu={nutMenu} soHd={hds.length} onSuaDong={(ma) => setHop({ loai: 'sua_dong_dt', ma })} />
      )}

      {menuMo && (
        <div className="kv-menu-nen" onClick={() => setMenuMo(false)}>
          <div className="kv-menu" onClick={(e) => e.stopPropagation()} role="menu">
            <div className="kv-menu-ai"><User size={18} /> <b>{nguoi}</b></div>
            <div className="kv-menu-hai">
              <button type="button" onClick={() => moManHinh('ls')}><span className="ic xanh"><ReceiptText size={20} /></span>Quản lý</button>
              <button type="button" onClick={() => moManHinh('ngay')}><span className="ic cam"><Clock size={20} /></span>Báo cáo cuối ngày</button>
            </div>
            {manHinh !== 'ban' && <button type="button" onClick={() => moManHinh('ban')}><ShoppingBag size={18} /> Bán hàng</button>}
            <button type="button" onClick={() => moHop({ loai: 'chon_hd_tra' })}><Undo2 size={18} /> Chọn hóa đơn trả hàng</button>
            <button type="button" onClick={() => moManHinh('no')}><ReceiptText size={18} /> Lập phiếu thu{congNo.length ? <i>{congNo.length}</i> : null}</button>
            <button type="button" onClick={() => moManHinh('kho')}><Tag size={18} /> Kho thành phẩm</button>
            <button type="button" onClick={() => moHop({ loai: 'ket_ca' })}><Clock size={18} /> Kết ca</button>
            <hr />
            <label className="kv-menu-cn">Chi nhánh
              <select value={chiNhanh} onChange={(e) => { setChiNhanh(e.target.value); setTrang(0); }}>{CHI_NHANH.map((c) => <option key={c}>{c}</option>)}</select>
            </label>
            <button type="button" onClick={() => moHop({ loai: 'thiet_lap_in' })}><Printer size={18} /> Thiết lập in</button>
            {!dienThoai && <button type="button" onClick={() => moHop({ loai: 'phim_tat' })}><EllipsisVertical size={18} /> Phím tắt</button>}
          </div>
        </div>
      )}

      {manHinh === 'kho' && (
        <KhoThanhPham matHang={matHang} ton={ton} chiNhanh={chiNhanh} theKho={theKho.filter((t) => t.chiNhanh === chiNhanh)}
          phieuKho={phieuKho.filter((p) => p.chiNhanh === chiNhanh)}
          moPhieu={(loai, phieu) => setHop({ loai: 'phieu', phieuLoai: loai, phieu })} huyPhieu={huyPhieu} />
      )}

      {manHinh === 'ls' && (
        <main className="bhq-ds">
          <h2>Hóa đơn · {chiNhanh}</h2>
          {daBan.filter((h) => h.chiNhanh === chiNhanh).map((h) => {
            const tra = traHangs.filter((t) => t.hdGoc === h.ma);
            return (
              <div key={h.ma} className={`bhq-the ${h.daHuy ? 'huy' : ''}`}>
                <div><b>{h.ma}</b> · {ngayGio(h.luc)} · {h.khach.name} · {PT[h.phuongThuc]} · người bán: {h.nguoiBan || h.thuNgan}</div>
                {h.dong.length > 0 && <div>{h.dong.map((d) => `${d.sl}× ${d.ten}${d.size ? ` ${d.size}` : ''}`).join(', ')}</div>}
                {h.ghiChu && <div className="bhq-ghi">Ghi chú: {h.ghiChu}</div>}
                <div className="hang">
                  <b>{so(h.canTra)}</b>{h.vat > 0 && <span className="chip">VAT {so(h.vat)}</span>}{h.no > 0 && <span className="no">Nợ {so(h.no)}</span>}
                  {h.daHuy ? <span className="chip huy">Đã hủy</span> : !h.mau && (
                    <>
                      <button type="button" className="bhq-nut phu" onClick={() => setHop({ loai: 'bien_lai', hoaDon: h })}>In</button>
                      <button type="button" className="bhq-nut phu" onClick={() => setHop({ loai: 'tra_hang', hoaDon: h })}>Trả hàng</button>
                      {huyDuoc(h)
                        ? <button type="button" className="bhq-nut nguy" onClick={() => setHop({ loai: 'huy_hd', hoaDon: h })}>Hủy bỏ</button>
                        : <span className="bhq-ghi">Đã kết ca — chỉ Quản lý / Giám đốc hủy được</span>}
                    </>
                  )}
                </div>
                {tra.map((t) => <div key={t.ma} className="bhq-ghi">Trả hàng {t.ma} · {ngayGio(t.luc)} · {t.dong.map((d) => `${d.sl}× ${d.ten}`).join(', ')} · hoàn {so(t.tienTra)}{t.lyDo ? ` · ${t.lyDo}` : ''}</div>)}
                {h.daHuy && h.lyDoHuy && <div className="bhq-ghi">Hủy lúc {gio(h.lucHuy)} · {h.nguoiHuy} · lý do: {h.lyDoHuy}</div>}
              </div>
            );
          })}
          {!daBan.some((h) => h.chiNhanh === chiNhanh) && <p className="bhq-rong">Chưa có hóa đơn ở chi nhánh này.</p>}
        </main>
      )}

      {manHinh === 'no' && <CongNo ds={congNo} onThu={(k) => setHop({ loai: 'thu_no', no: k })} />}

      {manHinh === 'ngay' && (
        <CuoiNgay chiNhanh={chiNhanh}
          bc={baoCaoNgay({
            hoaDons: daBan.filter((h) => !h.mau && h.chiNhanh === chiNhanh && cungNgay(h.luc, Date.now())),
            phieuKho: phieuKho.filter((p) => p.chiNhanh === chiNhanh && p.luc && cungNgay(p.luc, Date.now())),
            thuNos: thuNos.filter((t) => t.chiNhanh === chiNhanh && cungNgay(t.luc, Date.now())),
            traHangs: traHangs.filter((t) => t.chiNhanh === chiNhanh && cungNgay(t.luc, Date.now())),
            matHang,
          })} />
      )}

      {hop?.loai === 'ket_ca' && (
        <KetCa ca={ca} chiNhanh={chiNhanh} hoaDons={daBan.filter((h) => !h.mau && trongCa(h))}
          thuNos={thuNos.filter(trongCa)} traHangs={traHangs.filter(trongCa)} onDong={() => setHop(null)}
          onKet={() => { setCa({ nguoi, dauCa: 0, moLuc: Date.now() }); setHop(null); nhan('Đã kết ca — đã in phiếu bàn giao, ca mới bắt đầu'); }} />
      )}
      {hop?.loai === 'them_khach' && (
        <ThemKhach onDong={() => setHop(null)}
          onLuu={(k) => { setKhachDs((ds) => [k, ...ds]); chonKhach(k); setHop(null); nhan(`Đã thêm khách hàng ${k.name}`); }} />
      )}
      {hop?.loai === 'chon_khach_dt' && (
        <ChonKhachDt ds={khachDs} noCua={noCua} onDong={() => setHop(null)} onThem={() => setHop({ loai: 'them_khach' })}
          onChon={(k) => { chonKhach(k); setHop(null); }} />
      )}
      {hop?.loai === 'sua_dong_dt' && (() => {
        const d = hd.dong.find((x) => x.ma === hop.ma);
        return d ? <SuaDongDt d={d} onDong={() => setHop(null)} onLuu={(thay) => { suaDong(d.ma, thay); setHop(null); }} onBo={() => { boDong(d.ma); setHop(null); }} /> : null;
      })()}
      {hop?.loai === 'thu_khac' && <ThuKhac ds={hd.thuKhac} onDong={() => setHop(null)} onLuu={(ds) => { sua({ thuKhac: ds, dua: null }); setHop(null); }} />}
      {hop?.loai === 'dong_hd' && (
        <Hop tieuDe={`Đóng Hóa đơn ${hop.so}`} onDong={() => setHop(null)}
          chan={<><button type="button" className="bhq-nut phu" onClick={() => setHop(null)}>Bỏ qua</button><button type="button" className="bhq-nut chinh" onClick={() => { dongHd(hop.id); setHop(null); }}>Đồng ý</button></>}>
          <p className="bhq-ghi">Thông tin của Hóa đơn {hop.so} sẽ không được lưu lại. Bạn có chắc chắn muốn đóng không?</p>
        </Hop>
      )}
      {hop?.loai === 'thiet_lap_in' && (
        <Hop tieuDe="Thiết lập in" onDong={() => setHop(null)} chan={<button type="button" className="bhq-nut chinh" onClick={() => setHop(null)}>Xong</button>}>
          <label className="kv-cong-tac"><span>In tự động sau khi thanh toán (F2)</span><input type="checkbox" checked={inTuDong} onChange={doiInTuDong} /><i /></label>
          <p className="bhq-ghi">Máy in hóa đơn: ZyWell ZY303 · khổ 80mm · cắm USB. Bản thật: mẫu in theo mẫu hóa đơn đang dùng ở quầy.</p>
        </Hop>
      )}
      {hop?.loai === 'bien_lai' && <BienLai hd={hop.hoaDon} onDong={() => setHop(null)} onIn={() => setBanIn({ ...hop.hoaDon })} />}
      {hop?.loai === 'phieu' && (
        <PhieuKho loai={hop.phieuLoai} phieuCu={hop.phieu} matHang={matHang} ton={ton} chiNhanh={chiNhanh} nguoi={nguoi}
          soPhieu={phieuKho.filter((p) => p.loai === hop.phieuLoai).length + 1} onDong={() => setHop(null)}
          onLuu={(p, xong) => { luuPhieu(p, xong); setHop(null); }} />
      )}
      {hop?.loai === 'huy_hd' && <HuyHoaDon hd={hop.hoaDon} onDong={() => setHop(null)} onHuy={(lyDo) => { huyHoaDon(hop.hoaDon.ma, lyDo); setHop(null); }} />}
      {hop?.loai === 'thu_no' && <ThuNo no={hop.no} onDong={() => setHop(null)} onThu={(tien, pt) => { thuNo(hop.no.khach.id, tien, pt); setHop(null); }} />}
      {hop?.loai === 'chon_hd_tra' && (
        <ChonHdTra ds={daBan.filter((h) => !h.mau && !h.daHuy && h.chiNhanh === chiNhanh)} onDong={() => setHop(null)}
          onChon={(h) => setHop({ loai: 'tra_hang', hoaDon: h })} />
      )}
      {hop?.loai === 'tra_hang' && (
        <TraHang hd={hop.hoaDon} daTra={daTraCua(hop.hoaDon.ma)} onDong={() => setHop(null)}
          onXong={(kq, pt, lyDo) => { luuTraHang(hop.hoaDon, kq, pt, lyDo); setHop(null); }} />
      )}
      {hop?.loai === 'phim_tat' && (
        <Hop tieuDe="Danh sách các phím tắt" onDong={() => setHop(null)}>
          <div className="bhq-bang">
            {[['F1', 'Thêm mới hóa đơn'], ['F2', 'Bật/tắt in tự động'], ['F3', 'Tìm hàng hóa'], ['F4', 'Tìm khách hàng'], ['F8', 'Nhập tiền khách thanh toán'], ['F9', 'Thanh toán'], ['↑ ↓ Enter', 'Chọn hàng trong ô tìm'], ['Esc', 'Đóng']].map(([k, t]) => (
              <div key={k}><span>{t}</span><b className="bhq-phim">{k}</b></div>
            ))}
          </div>
        </Hop>
      )}

      {bao && (
        <div className="kv-bao" role="status">
          <span>{bao.msg}</span>
          {bao.hoaDon && <button type="button" onClick={() => setBanIn({ ...bao.hoaDon })}>In lại</button>}
        </div>
      )}
      {banIn && createPortal(<div id="bhq-in"><NoiDungBienLai hd={banIn} /></div>, document.body)}
    </div>
  );
}

function AnhNho({ m, nho }) {
  return (
    <span className={`kv-anh ${nho ? 'nho' : ''}`} style={m.anh ? undefined : { background: mauCua(m.ten) }} aria-hidden="true">
      {m.anh ? <img src={m.anh} alt="" loading="lazy" /> : <IconAnh size={nho ? 16 : 22} strokeWidth={1.6} />}
    </span>
  );
}

// Ô "Tìm hàng hóa (F3)": gõ tên/mã → danh sách thả xuống như KiotViet (ảnh, tên, mã,
// "Tồn: n | KH đặt: 0", giá xanh). ↑↓ chọn, Enter thêm. Máy quét mã vạch gõ mã + Enter.
function TimHang({ matHang, ton, inputRef, onChon }) {
  const [q, setQ] = useState('');
  const [chon, setChon] = useState(0);
  const [mo, setMo] = useState(false);
  const loc = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return [];
    return matHang.filter((m) => m.ma.toLowerCase().includes(t) || `${m.ten} ${m.size}`.toLowerCase().includes(t)).slice(0, 10);
  }, [matHang, q]);
  const lay = (m) => { onChon(m); setQ(''); setChon(0); };
  const onKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setChon((c) => Math.min(c + 1, loc.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setChon((c) => Math.max(c - 1, 0)); }
    else if (e.key === 'Enter') {
      const t = q.trim().toUpperCase();
      const m = matHang.find((x) => x.ma === t) || loc[chon];
      if (m) lay(m);
    } else if (e.key === 'Escape') setQ('');
  };
  return (
    <div className="kv-tim">
      <Search size={17} className="ic" aria-hidden="true" />
      <input ref={inputRef} value={q} onChange={(e) => { setQ(e.target.value); setChon(0); setMo(true); }} onKeyDown={onKey}
        onFocus={() => setMo(true)} onBlur={() => setTimeout(() => setMo(false), 150)}
        placeholder="Tìm hàng hóa (F3)" autoComplete="off" aria-label="Tìm hàng hóa" />
      <button type="button" className="kv-quet" title="Quét mã vạch" aria-label="Quét mã vạch" onClick={() => inputRef.current?.focus()}><ScanBarcode size={18} /></button>
      {mo && q.trim() && (
        <div className="kv-xo">
          {loc.map((m, i) => (
            <button key={m.ma} type="button" className={i === chon ? 'on' : ''} onMouseDown={(e) => e.preventDefault()} onClick={() => lay(m)}>
              <AnhNho m={m} />
              <span className="t"><b>{m.ten}</b>{m.size ? <em className="kv-tt-tag">{m.size}</em> : null}<small>{m.ma}</small><small>Tồn: {ton[m.ma] ?? 0} | KH đặt: 0</small></span>
              <b className="gia">{so(m.gia)}</b>
            </button>
          ))}
          {!loc.length && <p className="kv-xo-rong">Không tìm thấy kết quả nào phù hợp</p>}
          <p className="kv-xo-them">+ Thêm mới hàng hóa <small>(Giám đốc thêm trong mục Sản phẩm)</small></p>
        </div>
      )}
    </div>
  );
}

// Ô "Tìm khách hàng (F4)": nền xám, dấu + bên phải; đã chọn thì hiện tên xanh + nợ như KiotViet.
function KhachO({ khach, ds, noCua, inputRef, onChon, onThem }) {
  const [q, setQ] = useState('');
  const [mo, setMo] = useState(false);
  if (khach.id) {
    const no = noCua(khach);
    return (
      <div className="kv-khach-chon">
        <div className="r1"><User size={15} /><b>{khach.name}</b>{khach.phone ? <span className="sdt">{khach.phone}</span> : null}
          <button type="button" aria-label="Bỏ chọn khách hàng" onClick={() => onChon(KHACH_LE)}><X size={16} /></button></div>
        {no > 0 && <span className="kv-nhan-no">Nợ: {so(no)}</span>}
      </div>
    );
  }
  const t = q.trim().toLowerCase();
  const loc = t ? ds.filter((k) => `${k.name} ${k.phone || ''}`.toLowerCase().includes(t)).slice(0, 8) : [];
  const lay = (k) => { onChon(k); setQ(''); };
  return (
    <div className="kv-khach">
      <Search size={15} className="ic" aria-hidden="true" />
      <input ref={inputRef} value={q} onChange={(e) => { setQ(e.target.value); setMo(true); }} onFocus={() => setMo(true)}
        onBlur={() => setTimeout(() => setMo(false), 150)} onKeyDown={(e) => { if (e.key === 'Enter' && loc[0]) lay(loc[0]); }}
        placeholder="Tìm khách hàng (F4)" autoComplete="off" aria-label="Tìm khách hàng" />
      <button type="button" className="them" title="Thêm khách hàng" aria-label="Thêm khách hàng" onClick={onThem}><Plus size={20} /></button>
      {mo && loc.length > 0 && (
        <div className="kv-xo">
          {loc.map((k) => (
            <button key={k.id} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => lay(k)}>
              <span className="t"><span>{k.name}</span><small>{k.phone ? `ĐT: ${k.phone}` : ''}{noCua(k) ? ` · Nợ: ${so(noCua(k))}` : ''}</small></span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Giỏ hàng: mỗi dòng là 1 thẻ như KiotViet — STT · 🗑 · mã · tên · SL (gạch chân) ·
// giá (bấm ra ô Đơn giá / Giảm giá VND-% / Giá bán) · thành tiền · ⋮ (ghi chú).
function GioHang({ hd, onSl, onChotSl, onBo, onSuaDong }) {
  const [mo, setMo] = useState(null); // { ma, loai: 'gia' | 'ghi' }
  if (!hd.dong.length) return <div className="kv-gio kv-gio-rong" />;
  return (
    <div className="kv-gio">
      {hd.dong.map((d, i) => {
        const tien = tienDong(d);
        const giaBan = d.sl ? tien / d.sl : d.gia;
        return (
          <div key={d.ma} className="kv-dong">
            <span className="stt">{i + 1}</span>
            <button type="button" className="xoa" title="Xóa" aria-label={`Xóa ${d.ten}`} onClick={() => onBo(d.ma)}><Trash2 size={17} /></button>
            <span className="ma">{d.ma}</span>
            <span className="ten">
              <span>{d.ten}{d.size ? <em className="kv-tt-tag">{d.size}</em> : null}</span>
              {d.ghiChu ? <small className="kv-dong-ghi">{d.ghiChu}</small> : null}
            </span>
            <span className="sl">
              <button type="button" aria-label="Giảm 1" disabled={d.sl <= 1} onClick={() => onSl(d.ma, d.sl - 1)}><Minus size={14} /></button>
              <input inputMode="numeric" value={d.sl || ''} aria-label={`Số lượng ${d.ten}`}
                onChange={(e) => onSl(d.ma, Number(soTien(e.target.value)) || 0)} onBlur={() => onChotSl(d.ma)} onFocus={(e) => e.target.select()} />
              <button type="button" aria-label="Tăng 1" onClick={() => onSl(d.ma, d.sl + 1)}><Plus size={14} /></button>
            </span>
            <button type="button" className="gia" onClick={() => setMo(mo?.ma === d.ma && mo.loai === 'gia' ? null : { ma: d.ma, loai: 'gia' })}>
              <span>{so(giaBan)}</span>
              {Number(d.giam) ? <small>- {d.giamKieu === '%' ? `${d.giam}%` : so(d.giam)}</small> : null}
            </button>
            <b className="tien">{so(tien)}</b>
            <button type="button" className="them" title="Ghi chú" aria-label={`Ghi chú ${d.ten}`} onClick={() => setMo(mo?.ma === d.ma && mo.loai === 'ghi' ? null : { ma: d.ma, loai: 'ghi' })}><EllipsisVertical size={18} /></button>
            {mo?.ma === d.ma && mo.loai === 'gia' && <PopGia d={d} onSua={(thay) => onSuaDong(d.ma, thay)} onDong={() => setMo(null)} />}
            {mo?.ma === d.ma && mo.loai === 'ghi' && (
              <div className="kv-pop kv-pop-ghi" onClick={(e) => e.stopPropagation()}>
                <label>Ghi chú<input autoFocus value={d.ghiChu || ''} onChange={(e) => onSuaDong(d.ma, { ghiChu: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter') setMo(null); }} placeholder="VD: ghi chữ Happy Birthday" /></label>
                <button type="button" className="bhq-nut chinh" onClick={() => setMo(null)}>Xong</button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// Ô giảm giá kiểu KiotViet: Đơn giá · Giảm giá [__] VND | % · Giá bán.
function PopGia({ d, onSua, onDong }) {
  const goc = d.gia;
  const giam = d.giamKieu === '%' ? goc * (Number(d.giam) || 0) / 100 : Number(d.giam) || 0;
  return (
    <div className="kv-pop kv-pop-gia" onClick={(e) => e.stopPropagation()}>
      <div className="r"><span>Đơn giá</span><b>{so(goc)}</b></div>
      <div className="r"><span>Giảm giá</span>
        <input autoFocus inputMode="numeric" value={d.giam ? (d.giamKieu === '%' ? d.giam : Number(d.giam).toLocaleString('en-US')) : ''} placeholder="0"
          onChange={(e) => onSua({ giam: Number(soTien(e.target.value)) || 0 })} onKeyDown={(e) => { if (e.key === 'Enter') onDong(); }} />
        <span className="kv-vnd">
          <button type="button" className={d.giamKieu !== '%' ? 'on' : ''} onClick={() => onSua({ giamKieu: 'vnd', giam: 0 })}>VND</button>
          <button type="button" className={d.giamKieu === '%' ? 'on' : ''} onClick={() => onSua({ giamKieu: '%', giam: 0 })}>%</button>
        </span>
      </div>
      <div className="r"><span>Giá bán</span><b>{so(Math.max(goc - giam, 0))}</b></div>
      <button type="button" className="kv-pop-dong" onClick={onDong}>Xong</button>
    </div>
  );
}

// Khung thanh toán theo KiotViet: người bán ▾ · kênh bán · ngày giờ / khách / Tổng tiền hàng ·
// Giảm giá · Thu khác · VAT · Khách cần trả (xanh) · Khách thanh toán · phương thức · gợi ý
// mệnh giá · Tiền thừa trả khách / IN · THANH TOÁN.
function KhungThanhToan({ hd, tong, bayGio, nguoiBanDs, khachNo, duaRef, onSua, oKhach, onThuKhac, onIn, onXong, onDong }) {
  const [moGiam, setMoGiam] = useState(false);
  const dua = hd.dua == null ? tong.canTra : hd.dua;
  const tt = tinhThanhToan({ canTra: tong.canTra, khachDua: dua, phuongThuc: hd.pt, laKhachLe: !hd.khach.id });
  const c = tong.canTra;
  const goiY = [...new Set([Math.ceil(c / 1000) * 1000, Math.ceil(c / 10000) * 10000, Math.ceil(c / 50000) * 50000, Math.ceil(c / 100000) * 100000, Math.ceil(c / 200000) * 200000, Math.ceil(c / 500000) * 500000])]
    .filter((v) => v >= c && v > 0).slice(0, 6);
  const phanTram = tong.tongHang ? (tong.giamHd / tong.tongHang) * 100 : 0;
  return (
    <div className={`kv-tt ${onDong ? 'phu' : ''}`}>
      <div className="kv-tt-than">
        <div className="kv-tt-dau">
          {onDong && <button type="button" className="kv-tt-ve" aria-label="Quay lại chọn hàng" onClick={onDong}><ChevronLeft size={20} /></button>}
          <label className="kv-nv"><select value={hd.nguoiBan} onChange={(e) => onSua({ nguoiBan: e.target.value })} aria-label="Người bán">
            {nguoiBanDs.map((n) => <option key={n}>{n}</option>)}
          </select><ChevronDown size={15} /></label>
          <span className="kv-kenh" title="Kênh bán: Bán trực tiếp"><PersonStanding size={17} /><ChevronDown size={15} /></span>
          <span className="kv-ngay">{ngayDayDu(bayGio)}</span>
        </div>
        {oKhach}
        <div className="r"><span>Tổng tiền hàng <i className="sl">{tong.soMon}</i></span><span>{so(tong.tongHang)}</span></div>
        <div className="r rel"><span>Giảm giá {tong.giamHd ? <i className="pt">({phanTram.toFixed(2)}%)</i> : null}</span>
          <button type="button" className="kv-gach" onClick={() => setMoGiam((v) => !v)}>{so(tong.giamHd)}</button>
          {moGiam && (
            <div className="kv-pop kv-pop-giam">
              <div className="r"><span>Giảm giá</span>
                <input autoFocus inputMode="numeric" value={hd.giam ? (hd.giamKieu === '%' ? hd.giam : Number(hd.giam).toLocaleString('en-US')) : ''} placeholder="0"
                  onChange={(e) => onSua({ giam: Number(soTien(e.target.value)) || 0, dua: null })} onKeyDown={(e) => { if (e.key === 'Enter') setMoGiam(false); }} />
                <span className="kv-vnd">
                  <button type="button" className={hd.giamKieu !== '%' ? 'on' : ''} onClick={() => onSua({ giamKieu: 'vnd', giam: 0, dua: null })}>VND</button>
                  <button type="button" className={hd.giamKieu === '%' ? 'on' : ''} onClick={() => onSua({ giamKieu: '%', giam: 0, dua: null })}>%</button>
                </span>
              </div>
              <div className="r tong"><span>Tổng giảm giá:</span><b>{so(tong.giamHd)}</b></div>
              <button type="button" className="kv-pop-dong" onClick={() => setMoGiam(false)}>Xong</button>
            </div>
          )}
        </div>
        <div className="r"><span>Thu khác {hd.thuKhac.length ? <i className="pt">({hd.thuKhac.map((t) => t.ten).join(', ')})</i> : null}</span>
          <button type="button" className="kv-gach" onClick={onThuKhac}>{so(tong.thuKhac)}</button></div>
        <div className="r"><label className="kv-cong-tac nho"><span>VAT 8%</span><input type="checkbox" checked={!!hd.vat} onChange={(e) => onSua({ vat: e.target.checked, dua: null })} /><i /></label>
          <span>{so(tong.vat)}</span></div>
        <div className="r dam"><span>Khách cần trả</span><b className="xanh">{so(tong.canTra)}</b></div>
        <div className="r dam"><span>Khách thanh toán</span>
          <input ref={duaRef} className="kv-gach kv-dua" inputMode="numeric" value={so(dua)} aria-label="Khách thanh toán (F8)"
            onChange={(e) => onSua({ dua: Number(soTien(e.target.value)) || 0 })} onFocus={(e) => e.target.select()} />
        </div>
        <div className="kv-pt" role="radiogroup" aria-label="Phương thức thanh toán">
          {Object.entries(PT).map(([k, l]) => (
            <label key={k} className={hd.pt === k ? 'on' : ''}>
              <input type="radio" name={`pt-${hd.id}`} checked={hd.pt === k} onChange={() => onSua({ pt: k, dua: null })} /><i />{l}
            </label>
          ))}
        </div>
        {hd.pt === 'tien_mat' && goiY.length > 0 && (
          <div className="kv-menh-gia">{goiY.map((v) => <button key={v} type="button" className={Number(dua) === v ? 'on' : ''} onClick={() => onSua({ dua: v })}>{so(v)}</button>)}</div>
        )}
        {hd.pt === 'chuyen_khoan' && <div className="kv-qr">Mã VietQR {so(tong.canTra)}<small>Bản thật: QR theo tài khoản chi nhánh, có sẵn số tiền + mã hóa đơn để đối chiếu sao kê.</small></div>}
        {tt.no > 0
          ? <div className="r no"><span>Tính vào công nợ</span><b>{so(tt.no)}</b></div>
          : <div className="r"><span>Tiền thừa trả khách</span><span>{so(tt.thua)}</span></div>}
        {khachNo > 0 && <div className="r nho"><span>Nợ cũ của khách</span><span>{so(khachNo)}</span></div>}
        {tt.loi && <p className="kv-loi">{tt.loi}</p>}
      </div>
      <div className="kv-tt-chan">
        <button type="button" className="kv-nut-in" onClick={onIn}>IN</button>
        <button type="button" className="kv-nut-tt" disabled={!hd.dong.length || !!tt.loi} onClick={onXong}>THANH TOÁN</button>
      </div>
    </div>
  );
}

// ĐIỆN THOẠI — theo app KiotViet: (1) "Bán hàng" danh sách hàng, chạm để chọn, có ô − n +,
// đáy "Bỏ chọn | Xong (n)" → (2) giỏ: "× Bán hàng", Khách lẻ ›, Bảng giá chung ›, đáy
// "Tổng tiền hàng (n)" + "Lưu tạm | Thanh toán" → (3) "‹ Thanh toán" … "Hoàn thành".
function DienThoai({
  dtMan, setDtMan, hd, tong, monLoc, ton, slTrongGio, chips, locMo, setLocMo, themMon, datSl, boDong, sua, boChon, luuTam,
  khachNo, chonKhach, onThuKhac, inTamTinh, hoanTat, nutMenu, soHd, onSuaDong,
}) {
  const [q, setQ] = useState('');
  const t = q.trim().toLowerCase();
  const ds = t ? monLoc.filter((m) => m.ma.toLowerCase().includes(t) || `${m.ten} ${m.size}`.toLowerCase().includes(t)) : monLoc;
  const onTimKey = (e) => {
    if (e.key !== 'Enter') return;
    const m = monLoc.find((x) => x.ma === q.trim().toUpperCase()) || (ds.length === 1 ? ds[0] : null);
    if (m) { themMon(m); setQ(''); }
  };
  const oTim = (
    <div className="kvm-tim">
      <label><Search size={17} /><input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onTimKey} placeholder="Tên, mã hàng, mã vạch, lô" aria-label="Tìm hàng hóa" /></label>
      <button type="button" aria-label="Lọc theo nhóm hàng" className={locMo ? 'on' : ''} onClick={() => setLocMo((v) => !v)}><Filter size={18} /></button>
      <button type="button" aria-label="Quét mã vạch"><ScanBarcode size={19} /></button>
    </div>
  );
  const dongKhach = (
    <button type="button" className="kvm-dong-mo" onClick={chonKhach}>
      <User size={16} />
      {hd.khach.id
        ? <span className="kvm-kh"><span><b>{hd.khach.name}</b>{hd.khach.phone ? ` • ${hd.khach.phone}` : ''}</span>{khachNo > 0 && <span className="kv-nhan-no">Nợ: {so(khachNo)}</span>}</span>
        : <span>Khách lẻ</span>}
      <ChevronRight size={18} className="mui" />
    </button>
  );

  if (dtMan === 'tt') {
    const dua = hd.dua == null ? tong.canTra : hd.dua;
    const tt = tinhThanhToan({ canTra: tong.canTra, khachDua: dua, phuongThuc: hd.pt, laKhachLe: !hd.khach.id });
    return (
      <div className="kvm">
        <header className="kvm-dau trang"><button type="button" aria-label="Quay lại" onClick={() => setDtMan('gio')}><ChevronLeft size={22} /></button><h1>Thanh toán</h1>
          <button type="button" aria-label="In tạm tính" onClick={inTamTinh}><Printer size={20} /></button></header>
        <div className="kvm-than">
          <div className="kvm-the">{dongKhach}</div>
          <div className="kvm-the"><button type="button" className="kvm-dong-mo" onClick={() => setDtMan('gio')}><span>Xem hàng trong đơn</span><ChevronRight size={18} className="mui" /></button></div>
          <div className="kvm-the kvm-tt">
            <div className="r"><span>Tổng tiền hàng <i className="kvm-tron">{tong.soMon}</i></span><span>{so(tong.tongHang)}</span></div>
            <div className="r"><span>Giảm giá{tong.giamHd ? ` (${((tong.giamHd / tong.tongHang) * 100).toFixed(2)}%)` : ''}</span>
              <input className="kv-gach" inputMode="numeric" value={hd.giam ? Number(hd.giam).toLocaleString('en-US') : ''} placeholder="0" aria-label="Giảm giá (VND)"
                onChange={(e) => sua({ giam: Number(soTien(e.target.value)) || 0, giamKieu: 'vnd', dua: null })} /></div>
            <div className="r"><label className="kv-cong-tac nho"><span>VAT 8%</span><input type="checkbox" checked={!!hd.vat} onChange={(e) => sua({ vat: e.target.checked, dua: null })} /><i /></label><span>{so(tong.vat)}</span></div>
            <div className="r"><span>Thu khác</span><button type="button" className="kv-gach" onClick={onThuKhac}>{so(tong.thuKhac)}</button></div>
            <div className="r"><span>Khách cần trả</span><b className="xanh">{so(tong.canTra)}</b></div>
            <div className="r"><span>Khách thanh toán</span>
              <input className="kv-gach" inputMode="numeric" value={so(dua)} aria-label="Khách thanh toán" onFocus={(e) => e.target.select()}
                onChange={(e) => sua({ dua: Number(soTien(e.target.value)) || 0 })} /></div>
            <div className="kvm-pt">{Object.entries(PT).map(([k, l]) => <button key={k} type="button" className={hd.pt === k ? 'on' : ''} onClick={() => sua({ pt: k, dua: null })}>{l}</button>)}</div>
            {tt.no > 0 ? <div className="r no"><span>Tính vào công nợ</span><b>{so(tt.no)}</b></div> : <div className="r"><span>Tiền thừa trả khách</span><span>{so(tt.thua)}</span></div>}
            {tt.loi && <p className="kv-loi">{tt.loi}</p>}
          </div>
        </div>
        <div className="kvm-chan"><button type="button" className="kv-nut-tt rong" disabled={!!tt.loi} onClick={hoanTat}>Hoàn thành</button></div>
      </div>
    );
  }

  if (dtMan === 'gio') {
    return (
      <div className="kvm">
        <header className="kvm-dau trang"><button type="button" aria-label="Đóng giỏ hàng" onClick={() => setDtMan('chon')}><X size={22} /></button><h1>Bán hàng</h1>{nutMenu}</header>
        <div className="kvm-than">
          {oTim}
          {t && ds.length > 0 && (
            <div className="kvm-the">{ds.slice(0, 6).map((m) => <button key={m.ma} type="button" className="kvm-goi-y" onClick={() => { themMon(m); setQ(''); }}>{m.ten}{m.size ? ` ${m.size}` : ''}<span className="xanh">{so(m.gia)}</span></button>)}</div>
          )}
          <div className="kvm-the">
            {dongKhach}
            <div className="kvm-dong-mo tinh"><Tag size={16} /><span>Bảng giá chung</span><ChevronRight size={18} className="mui" /></div>
          </div>
          <div className="kvm-the">
            {hd.dong.map((d) => (
              <div key={d.ma} className="kvm-mon chon">
                <AnhNho m={d} />
                <button type="button" className="t" onClick={() => onSuaDong(d.ma)}>
                  <span>{d.ten}{d.size ? <em className="cam"> {d.size}</em> : null}</span>
                  {d.ghiChu ? <small>{d.ghiChu}</small> : null}
                  <span className="xanh">{so(d.sl ? tienDong(d) / d.sl : d.gia)}</span>
                </button>
                <span className="kvm-bac">
                  <button type="button" aria-label="Giảm 1" onClick={() => (d.sl > 1 ? datSl(d.ma, d.sl - 1) : boDong(d.ma))}><Minus size={15} /></button>
                  <span>{d.sl}</span>
                  <button type="button" aria-label="Tăng 1" onClick={() => datSl(d.ma, d.sl + 1)}><Plus size={15} /></button>
                </span>
              </div>
            ))}
            {!hd.dong.length && <p className="kv-rong">Chưa có hàng hóa</p>}
          </div>
          <label className="kvm-the kv-ghi-chu"><Pencil size={16} /><input value={hd.ghiChu} onChange={(e) => sua({ ghiChu: e.target.value })} placeholder="Ghi chú đơn hàng" /></label>
        </div>
        <div className="kvm-chan">
          <div className="kvm-tong"><span>Tổng tiền hàng <i className="kvm-tron">{tong.soMon}</i></span><b>{so(tong.tongHang)}</b></div>
          <div className="kvm-hai">
            <button type="button" className="kvm-nut-vien" disabled={!hd.dong.length} onClick={luuTam}>Lưu tạm</button>
            <button type="button" className="kv-nut-tt" disabled={!hd.dong.length} onClick={() => setDtMan('tt')}>Thanh toán</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="kvm">
      <header className="kvm-dau"><h1>Bán hàng</h1>
        {soHd > 1 && <span className="kvm-so-hd">{soHd} hóa đơn</span>}
        {nutMenu}
      </header>
      <div className="kvm-than">
        {oTim}
        <div className="kvm-loc">
          <button type="button" onClick={chonKhach}><User size={15} />{hd.khach.id ? hd.khach.name : 'Khách lẻ'}</button>
          <span><Tag size={15} />Bảng giá chung</span>
        </div>
        {locMo && chips}
        <div className="kvm-ds">
          {ds.map((m) => {
            const sl = slTrongGio[m.ma];
            return (
              <div key={m.ma} className={`kvm-mon ${sl ? 'chon' : ''}`}>
                <button type="button" className="kvm-mon-cham" onClick={() => themMon(m)} aria-label={`Thêm ${m.ten}${m.size ? ` ${m.size}` : ''}`}>
                  <AnhNho m={m} />
                  <span className="t">
                    <span>{m.ten}{m.size ? <em className="cam"> {m.size}</em> : null}</span>
                    <span className="kvm-nhan"><span>{m.ma}</span><i>{ton[m.ma] ?? 0}</i><i>KH đặt: 0</i></span>
                    <span className="xanh">{so(m.gia)}</span>
                  </span>
                </button>
                {sl ? (
                  <span className="kvm-bac">
                    <button type="button" aria-label="Giảm 1" onClick={() => (sl > 1 ? datSl(m.ma, sl - 1) : boDong(m.ma))}><Minus size={15} /></button>
                    <span>{sl}</span>
                    <button type="button" aria-label="Tăng 1" onClick={() => datSl(m.ma, sl + 1)}><Plus size={15} /></button>
                  </span>
                ) : null}
              </div>
            );
          })}
          {!ds.length && <p className="kv-rong">{monLoc.length ? 'Không tìm thấy hàng hóa phù hợp' : 'Đang tải hàng hóa…'}</p>}
        </div>
      </div>
      {hd.dong.length > 0 && (
        <div className="kvm-chan kvm-hai">
          <button type="button" className="kvm-nut-vien" onClick={boChon}>Bỏ chọn</button>
          <button type="button" className="kv-nut-tt" onClick={() => setDtMan('gio')}>Xong <i className="kvm-tron trang">{tong.soMon}</i></button>
        </div>
      )}
    </div>
  );
}

function ChonKhachDt({ ds, noCua, onDong, onThem, onChon }) {
  const [q, setQ] = useState('');
  const t = q.trim().toLowerCase();
  const loc = ds.filter((k) => !t || `${k.name} ${k.phone || ''}`.toLowerCase().includes(t)).slice(0, 60);
  return (
    <div className="kvm kvm-phu">
      <header className="kvm-dau trang">
        <button type="button" aria-label="Quay lại" onClick={onDong}><ChevronLeft size={22} /></button>
        <label className="kvm-tim-kh"><input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm khách hàng" /></label>
        <button type="button" aria-label="Thêm khách hàng" onClick={onThem}><Plus size={22} /></button>
      </header>
      <div className="kvm-than">
        <div className="kvm-the">
          <button type="button" className="kvm-kh-dong" onClick={() => onChon(KHACH_LE)}><span className="av"><User size={18} /></span><span><b>Khách lẻ</b></span></button>
          {loc.map((k) => (
            <button key={k.id} type="button" className="kvm-kh-dong" onClick={() => onChon(k)}>
              <span className="av"><User size={18} /></span>
              <span><b>{k.name}</b><span className="kvm-nhan">{k.phone ? <i>{k.phone}</i> : null}{noCua(k) ? <i>Nợ: {so(noCua(k))}</i> : null}</span></span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function SuaDongDt({ d, onDong, onLuu, onBo }) {
  const [gia, setGia] = useState(String(d.giamKieu === '%' ? '' : d.giam || ''));
  const [ghi, setGhi] = useState(d.ghiChu || '');
  return (
    <Hop tieuDe={`${d.ten}${d.size ? ` ${d.size}` : ''}`} onDong={onDong}
      chan={<><button type="button" className="bhq-nut nguy" onClick={onBo}>Xóa</button><button type="button" className="bhq-nut chinh" onClick={() => onLuu({ giam: Number(gia) || 0, giamKieu: 'vnd', ghiChu: ghi.trim() })}>Xong</button></>}>
      <div className="bhq-bang"><div><span>Đơn giá</span><b>{so(d.gia)}</b></div></div>
      <label className="bhq-nhan">Giảm giá (VND)<input className="bhq-o" inputMode="numeric" value={gia ? Number(gia).toLocaleString('en-US') : ''} onChange={(e) => setGia(soTien(e.target.value))} placeholder="0" /></label>
      <label className="bhq-nhan">Ghi chú<input className="bhq-o" value={ghi} onChange={(e) => setGhi(e.target.value)} placeholder="VD: ghi chữ Happy Birthday" /></label>
    </Hop>
  );
}

function Hop({ tieuDe, onDong, children, chan }) {
  return (
    <div className="bhq-man" onClick={onDong}>
      <div className="bhq-hop" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={tieuDe}>
        <div className="bhq-hop-dau"><b>{tieuDe}</b><button type="button" onClick={onDong} aria-label="Đóng"><X size={20} /></button></div>
        <div className="bhq-hop-than">{children}</div>
        {chan && <div className="bhq-hop-chan">{chan}</div>}
      </div>
    </div>
  );
}

// "Thêm khách hàng" theo KiotViet: Mã khách hàng (Mã mặc định) · Tên · Điện thoại · Địa chỉ · Bỏ qua / Lưu.
function ThemKhach({ onDong, onLuu }) {
  const [ten, setTen] = useState('');
  const [sdt, setSdt] = useState('');
  const [dc, setDc] = useState('');
  const ok = ten.trim() && sdt.replace(/\D/g, '').length >= 9;
  return (
    <Hop tieuDe="Thêm khách hàng" onDong={onDong}
      chan={<><button type="button" className="bhq-nut phu" onClick={onDong}>Bỏ qua</button><button type="button" className="bhq-nut chinh" disabled={!ok} onClick={() => onLuu({ id: `moi-${Date.now()}`, name: ten.trim(), phone: sdt.replace(/\D/g, ''), address: dc.trim() })}>Lưu</button></>}>
      <label className="bhq-nhan">Mã khách hàng<input className="bhq-o" disabled placeholder="Mã mặc định" /></label>
      <label className="bhq-nhan">Tên khách hàng<input className="bhq-o" autoFocus value={ten} onChange={(e) => setTen(e.target.value)} /></label>
      <label className="bhq-nhan">Điện thoại<input className="bhq-o" inputMode="tel" value={sdt} onChange={(e) => setSdt(e.target.value)} /></label>
      <label className="bhq-nhan">Địa chỉ<input className="bhq-o" value={dc} onChange={(e) => setDc(e.target.value)} /></label>
      <p className="bhq-ghi">Bản thật: lưu vào danh sách khách của app (gộp trùng theo số điện thoại).</p>
    </Hop>
  );
}
function KetCa({ ca, chiNhanh, hoaDons, thuNos, traHangs, onDong, onKet }) {
  const [dauCa, setDauCa] = useState(String(ca.dauCa || ''));
  const [dem, setDem] = useState('');
  const soLieu = tinhKetCa({ dauCa, hoaDons, thuNos, traHangs });
  const chenh = (Number(dem) || 0) - soLieu.heThong;
  return (
    <Hop tieuDe={`Kết ca · ${ca.nguoi} · ${chiNhanh}`} onDong={onDong}
      chan={<button type="button" className="bhq-nut chinh" disabled={dem === ''} onClick={onKet}>Kết ca & in phiếu bàn giao</button>}>
      <div className="bhq-bang">
        <div><span>Ca từ</span><b>{gio(ca.moLuc)} → {gio(Date.now())}</b></div>
        <div><span>Số hoá đơn · doanh thu</span><b>{soLieu.soHoaDon} · {so(soLieu.doanhThu)}</b></div>
        <div><span>Chuyển khoản <small>(đối chiếu sao kê)</small></span><b>{so(soLieu.chuyenKhoan)}</b></div>
        <div><span>Thẻ</span><b>{so(soLieu.the)}</b></div>
        <div><span>Ghi nợ khách · thu nợ</span><b>{so(soLieu.ghiNo)} · {so(soLieu.thuNo)}</b></div>
        {soLieu.traHang > 0 && <div><span>Trả hàng (đã hoàn khách)</span><b>−{so(soLieu.traHang)}</b></div>}
        <div><span>Thu tiền mặt trong ca</span><b>{so(soLieu.tienMat)}</b></div>
      </div>
      <label className="bhq-nhan">Tiền mặt đầu ca (tiền lẻ để sẵn trong két)<input className="bhq-o" inputMode="numeric" value={dauCa} onChange={(e) => setDauCa(soTien(e.target.value))} placeholder="0" /></label>
      <div className="bhq-bang"><div className="lon"><span>Tiền mặt phải có trong két</span><b>{so(soLieu.heThong)}</b></div></div>
      <label className="bhq-nhan">Tiền mặt đếm thực tế<input className="bhq-o lon" inputMode="numeric" value={dem} onChange={(e) => setDem(soTien(e.target.value))} placeholder="Đếm két rồi nhập" /></label>
      {dem !== '' && (
        <p className={`bhq-chenh ${chenh < 0 ? 'thieu' : chenh > 0 ? 'du' : 'khop'}`}>
          {chenh === 0 ? '✅ Khớp tiền' : chenh < 0 ? `⚠️ Thiếu ${so(-chenh)}` : `Dư ${so(chenh)}`}
        </p>
      )}
    </Hop>
  );
}

function ThuKhac({ ds, onDong, onLuu }) {
  const [dong, setDong] = useState(ds?.length ? ds : []);
  return (
    <Hop tieuDe="Thu khác trên hoá đơn" onDong={onDong} chan={<button type="button" className="bhq-nut chinh" onClick={() => onLuu(dong.filter((d) => d.ten.trim() && Number(d.tien) > 0))}>Áp dụng</button>}>
      <p className="bhq-ghi">Phí ship, phụ thu, nến số… ghi ở đây — không phải tạo thành món hàng như KiotViet đang làm.</p>
      <div className="bhq-goi">{THU_KHAC_GOI_Y.map((g) => <button key={g.ten} type="button" onClick={() => setDong((x) => [...x, { ...g }])}>＋ {g.ten} {so(g.tien)}</button>)}</div>
      {dong.map((d, i) => (
        <div key={i} className="bhq-hang-o">
          <input className="bhq-o" value={d.ten} onChange={(e) => setDong((x) => x.map((y, j) => (j === i ? { ...y, ten: e.target.value } : y)))} placeholder="Tên khoản" />
          <input className="bhq-o" inputMode="numeric" value={d.tien} onChange={(e) => setDong((x) => x.map((y, j) => (j === i ? { ...y, tien: soTien(e.target.value) } : y)))} placeholder="Số tiền" />
          <button type="button" className="bhq-link" onClick={() => setDong((x) => x.filter((_, j) => j !== i))}>Bỏ</button>
        </div>
      ))}
      <button type="button" className="bhq-dong-chon" onClick={() => setDong((x) => [...x, { ten: '', tien: '' }])}>＋ Khoản khác</button>
    </Hop>
  );
}

function ChonHdTra({ ds, onDong, onChon }) {
  const [q, setQ] = useState('');
  const t = q.trim().toLowerCase();
  const loc = ds.filter((h) => !t || `${h.ma} ${h.khach.name} ${h.khach.phone || ''}`.toLowerCase().includes(t)).slice(0, 30);
  return (
    <Hop tieuDe="Chọn hoá đơn trả hàng" onDong={onDong}>
      <input className="bhq-o" autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Mã hoá đơn, tên hoặc SĐT khách" />
      {loc.map((h) => (
        <button key={h.ma} type="button" className="bhq-dong-chon" onClick={() => onChon(h)}>
          <b>{h.ma}</b> · {ngayGio(h.luc)} · {h.khach.name} · <b>{so(h.canTra)}</b>
        </button>
      ))}
      {!loc.length && <p className="bhq-rong">Chưa có hoá đơn nào ở chi nhánh này.</p>}
    </Hop>
  );
}

function TraHang({ hd, daTra, onDong, onXong }) {
  const [sl, setSl] = useState({});
  const [pt, setPt] = useState(hd.phuongThuc === 'the' ? 'chuyen_khoan' : hd.phuongThuc);
  const [lyDo, setLyDo] = useState('');
  const kq = tinhTraHang(hd, sl, daTra);
  return (
    <Hop tieuDe={`Trả hàng · ${hd.ma}`} onDong={onDong}
      chan={<button type="button" className="bhq-nut chinh" disabled={!kq.dong.length} onClick={() => onXong(kq, pt, lyDo.trim())}>Trả hàng · hoàn {so(kq.tienTra)}</button>}>
      <p className="bhq-ghi">{hd.khach.name} · mua lúc {ngayGio(hd.luc)}. Bánh trả được cộng lại vào kho. Phí ship / thu khác không hoàn.</p>
      {hd.dong.map((d) => {
        const toiDa = d.sl - (daTra[d.ma] || 0);
        const v = Math.min(Number(sl[d.ma]) || 0, toiDa);
        return (
          <div key={d.ma} className="bhq-dong">
            <div className="bhq-dong-ten"><b>{d.ten}{d.size ? ` · ${d.size}` : ''}</b><small>Đã mua {d.sl}{daTra[d.ma] ? ` · đã trả ${daTra[d.ma]}` : ''} · {so(tienDong(d) / d.sl)}/cái</small></div>
            <div className="bhq-sl">
              <button type="button" aria-label="Bớt 1" disabled={v <= 0} onClick={() => setSl((x) => ({ ...x, [d.ma]: v - 1 }))}>−</button>
              <span>{v}/{toiDa}</span>
              <button type="button" aria-label="Thêm 1" disabled={v >= toiDa} onClick={() => setSl((x) => ({ ...x, [d.ma]: v + 1 }))}>+</button>
            </div>
          </div>
        );
      })}
      <div className="bhq-goi">{['tien_mat', 'chuyen_khoan'].map((k) => <button key={k} type="button" className={pt === k ? 'on' : ''} onClick={() => setPt(k)}>Hoàn bằng {PT[k].toLowerCase()}</button>)}</div>
      <label className="bhq-nhan">Lý do<input className="bhq-o" value={lyDo} onChange={(e) => setLyDo(e.target.value)} placeholder="VD: bánh bị móp, khách đổi ý" /></label>
      <div className="bhq-bang">
        {kq.vat > 0 && <div><span>Trong đó VAT 8%</span><b>{so(kq.vat)}</b></div>}
        <div className="lon"><span>Tiền trả lại khách</span><b>{so(kq.tienTra)}</b></div>
      </div>
    </Hop>
  );
}

function BienLai({ hd, onDong, onIn }) {
  return (
    <Hop tieuDe={`Hoá đơn ${hd.ma}`} onDong={onDong}
      chan={<><button type="button" className="bhq-nut phu" onClick={onDong}>Đóng</button><button type="button" className="bhq-nut chinh" onClick={onIn}>🖨 In lại</button></>}>
      <div className="bhq-giay"><NoiDungBienLai hd={hd} /></div>
    </Hop>
  );
}

// Biên lai khổ 80mm cho máy in nhiệt ZyWell ZY303 (USB) — in bằng hộp in của
// trình duyệt; khi in chỉ phần #bhq-in hiện ra (xem @media print trong CSS).
function NoiDungBienLai({ hd }) {
  return (
    <div className="bl">
      <div className="bl-c"><b>SUMI BAKERY</b><br />{hd.chiNhanh}</div>
      <div className="bl-c">{hd.tamTinh ? 'PHIẾU TẠM TÍNH' : 'HOÁ ĐƠN BÁN HÀNG'}<br />{hd.tamTinh ? '' : `${hd.ma} · `}{new Date(hd.luc).toLocaleString('vi-VN')}</div>
      <div>Thu ngân: {hd.thuNgan}{hd.nguoiBan && hd.nguoiBan !== hd.thuNgan ? ` · NV bán: ${hd.nguoiBan}` : ''}<br />Khách: {hd.khach.name}{hd.khach.phone ? ` · ${hd.khach.phone}` : ''}</div>
      <hr />
      {hd.dong.map((d) => (
        <div key={d.ma} className="bl-d">
          <div>{d.ten}{d.size ? ` ${d.size}` : ''}{d.ghiChu ? ` (${d.ghiChu})` : ''}</div>
          <div className="bl-h"><span>{d.sl} × {so(d.gia)}{Number(d.giam) ? ` (−${d.giamKieu === '%' ? `${d.giam}%` : so(d.giam)})` : ''}</span><span>{so(tienDong(d))}</span></div>
        </div>
      ))}
      <hr />
      <div className="bl-h"><span>Tổng tiền hàng</span><span>{so(hd.tongHang)}</span></div>
      {hd.giamHd > 0 && <div className="bl-h"><span>Giảm giá</span><span>−{so(hd.giamHd)}</span></div>}
      {(hd.thuKhacDong || []).map((t, i) => <div key={i} className="bl-h"><span>{t.ten}</span><span>{so(t.tien)}</span></div>)}
      {hd.vat > 0 && <div className="bl-h"><span>VAT 8%</span><span>{so(hd.vat)}</span></div>}
      <div className="bl-h bl-to"><span>TỔNG CỘNG</span><span>{so(hd.canTra)}</span></div>
      {!hd.tamTinh && <div className="bl-h"><span>{PT[hd.phuongThuc]}</span><span>{so(hd.khachDua)}</span></div>}
      {hd.thua > 0 && <div className="bl-h"><span>Tiền thừa</span><span>{so(hd.thua)}</span></div>}
      {hd.no > 0 && <div className="bl-h"><span>Còn nợ</span><span>{so(hd.no)}</span></div>}
      {hd.ghiChu && <div>Ghi chú: {hd.ghiChu}</div>}
      <hr />
      <div className="bl-c">{hd.tamTinh ? 'Phiếu tạm tính — chưa thanh toán' : 'Cảm ơn quý khách! Hẹn gặp lại 🧁'}</div>
    </div>
  );
}

const TRANG_THAI = { tam: 'Phiếu tạm', xong: 'Hoàn thành', huy: 'Đã huỷ' };

function KhoThanhPham({ matHang, ton, chiNhanh, theKho, phieuKho, moPhieu, huyPhieu }) {
  const [q, setQ] = useState('');
  const [xemThe, setXemThe] = useState(null);
  const ds = matHang.filter((m) => !q || `${m.ten} ${m.size} ${m.ma}`.toLowerCase().includes(q.toLowerCase()));
  const tenCua = (ma) => { const m = matHang.find((x) => x.ma === ma); return m ? `${m.ten}${m.size ? ` ${m.size}` : ''}` : ma; };
  return (
    <main className="bhq-ds">
      <h2>Kho thành phẩm · {chiNhanh}</h2>
      <div className="bhq-goi">
        <button type="button" className="on" onClick={() => moPhieu('giao')}>🚚 Bếp giao ra quầy</button>
        <button type="button" onClick={() => moPhieu('huy')}>🗑 Xuất huỷ</button>
        <button type="button" onClick={() => moPhieu('noibo')}>🎁 Xuất dùng nội bộ</button>
        <button type="button" onClick={() => moPhieu('kiem')}>📋 Kiểm kho</button>
      </div>
      <p className="bhq-ghi">Mọi thay đổi tồn đều qua phiếu: <b>Phiếu tạm</b> → <b>Hoàn thành</b> (cộng/trừ kho) → <b>Huỷ</b> (tự hoàn kho). Không xoá, không sửa lùi ngày. Tồn tách riêng từng chi nhánh.</p>
      {phieuKho.length > 0 && <h3>Phiếu kho</h3>}
      {phieuKho.map((p) => (
        <div key={p.ma} className={`bhq-the ${p.trangThai === 'huy' ? 'huy' : ''}`}>
          <div><b>{p.ma}</b> · {LOAI_PHIEU[p.loai].ten} · {p.nguoi}{p.lyDo ? ` · ${p.lyDo}` : ''}</div>
          <div>{p.dong.map((d) => { const l = p.lech?.[d.ma]; return `${tenCua(d.ma)}: ${d.sl}${p.loai === 'kiem' && l != null ? ` (lệch ${l > 0 ? '+' : ''}${l})` : ''}`; }).join(' · ')}</div>
          <div className="hang">
            <span className={`chip ${p.trangThai}`}>{TRANG_THAI[p.trangThai]}</span>
            {p.trangThai === 'tam' && <button type="button" className="bhq-nut phu" onClick={() => moPhieu(p.loai, p)}>Mở tiếp</button>}
            {p.trangThai !== 'huy' && <button type="button" className="bhq-nut nguy" onClick={() => huyPhieu(p.ma)}>Huỷ phiếu</button>}
          </div>
        </div>
      ))}
      <h3>Tồn kho hiện tại <small>(chạm 1 dòng để xem thẻ kho)</small></h3>
      <input className="bhq-o" value={q} onChange={(e) => setQ(e.target.value)} placeholder="🔍 Tìm bánh" />
      <div className="bhq-ton-bang">
        {ds.slice(0, 200).map((m) => (
          <React.Fragment key={m.ma}>
            <button type="button" className="bhq-ton-dong" onClick={() => setXemThe(xemThe === m.ma ? null : m.ma)}>
              <span>{m.ten}{m.size ? ` · ${m.size}` : ''} <small>{m.ma} · vốn {so(m.giaVon)}</small></span>
              <b className={(ton[m.ma] ?? 0) <= 0 ? 'het' : ''}>{ton[m.ma] ?? 0}</b>
            </button>
            {xemThe === m.ma && (
              <div className="bhq-the-kho">
                {theKho.filter((t) => t.ma === m.ma).map((t, i) => (
                  <div key={i}><span>{ngayGio(t.luc)} · {t.chungTu} · {t.loai} · {t.nguoi}</span><b className={t.sl < 0 ? 'am' : 'duong'}>{t.sl > 0 ? '+' : ''}{t.sl}</b><span>tồn {t.tonCuoi}</span></div>
                ))}
                {!theKho.some((t) => t.ma === m.ma) && <div><span>Chưa có giao dịch trong phiên xem trước này.</span></div>}
              </div>
            )}
          </React.Fragment>
        ))}
      </div>
    </main>
  );
}

function PhieuKho({ loai, phieuCu, matHang, ton, chiNhanh, nguoi, soPhieu, onDong, onLuu }) {
  const L = LOAI_PHIEU[loai];
  const [dong, setDong] = useState(phieuCu?.dong || []);
  const [lyDo, setLyDo] = useState(phieuCu?.lyDo || (loai === 'huy' ? LY_DO_HUY[0] : loai === 'noibo' ? LOAI_NOI_BO[0] : ''));
  const [q, setQ] = useState('');
  const goiY = q ? matHang.filter((m) => `${m.ten} ${m.size} ${m.ma}`.toLowerCase().includes(q.toLowerCase())).slice(0, 8) : [];
  const them = (m) => { if (!dong.some((d) => d.ma === m.ma)) setDong((ds) => [...ds, { ma: m.ma, sl: loai === 'kiem' ? (ton[m.ma] ?? 0) : 1 }]); setQ(''); };
  const ma = phieuCu?.ma || `${L.tienTo}${String(soPhieu).padStart(5, '0')}`;
  const phieu = { ma, loai, chiNhanh, nguoi, lyDo, dong: dong.filter((d) => loai === 'kiem' || d.sl > 0) };
  const canLyDo = (loai === 'huy' || loai === 'noibo') && !lyDo.trim();
  const giaTri = phieu.dong.reduce((s, d) => s + d.sl * (matHang.find((m) => m.ma === d.ma)?.giaVon || 0), 0);
  return (
    <Hop tieuDe={`${L.ten} · ${ma}`} onDong={onDong}
      chan={<>
        <button type="button" className="bhq-nut phu" disabled={!phieu.dong.length} onClick={() => onLuu(phieu, false)}>Lưu tạm</button>
        <button type="button" className="bhq-nut chinh" disabled={!phieu.dong.length || canLyDo} onClick={() => onLuu(phieu, true)}>Hoàn thành</button>
      </>}>
      {loai === 'giao' && <p className="bhq-ghi">Thay cho "Nhập hàng" không nhà cung cấp trên KiotViet. Bản thật: nối với lúc bếp báo xong mẻ trong app.</p>}
      <input className="bhq-o" autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="🔍 Tìm hoặc quét mã bánh để thêm" />
      {goiY.map((m) => <button key={m.ma} type="button" className="bhq-dong-chon" onClick={() => them(m)}>{m.ten}{m.size ? ` · ${m.size}` : ''} <small>tồn {ton[m.ma] ?? 0}</small></button>)}
      {dong.map((d) => {
        const m = matHang.find((x) => x.ma === d.ma);
        const lech = loai === 'kiem' ? d.sl - (ton[d.ma] ?? 0) : null;
        return (
          <div key={d.ma} className="bhq-dong">
            <div className="bhq-dong-ten"><b>{m?.ten}{m?.size ? ` · ${m.size}` : ''}</b><small>Trên máy: {ton[d.ma] ?? 0}{lech != null ? ` · lệch ${lech > 0 ? '+' : ''}${lech}` : ''}</small></div>
            <label className="bhq-sl-o">{loai === 'kiem' ? 'Đếm được' : 'Số lượng'}
              <input className="bhq-o" inputMode="numeric" value={d.sl} onChange={(e) => setDong((ds) => ds.map((x) => (x.ma === d.ma ? { ...x, sl: Number(soTien(e.target.value)) || 0 } : x)))} />
            </label>
            <button type="button" className="bhq-link" onClick={() => setDong((ds) => ds.filter((x) => x.ma !== d.ma))}>Bỏ</button>
          </div>
        );
      })}
      {(loai === 'huy' || loai === 'noibo') && (
        <>
          <div className="bhq-goi">{(loai === 'huy' ? LY_DO_HUY : LOAI_NOI_BO).map((l) => <button key={l} type="button" className={lyDo === l ? 'on' : ''} onClick={() => setLyDo(l)}>{l}</button>)}</div>
          <label className="bhq-nhan">{loai === 'huy' ? 'Lý do huỷ (bắt buộc)' : 'Loại xuất (bắt buộc)'}<input className="bhq-o" value={lyDo} onChange={(e) => setLyDo(e.target.value)} /></label>
          <p className="bhq-ghi">Giá trị theo giá vốn: <b>{so(giaTri)}</b> (KiotViet hiện ghi 0đ vì chưa có giá vốn).</p>
        </>
      )}
      {(loai === 'giao' || loai === 'kiem') && <label className="bhq-nhan">Ghi chú<input className="bhq-o" value={lyDo} onChange={(e) => setLyDo(e.target.value)} placeholder={loai === 'giao' ? 'VD: Bếp giao mẻ sáng' : 'VD: Kiểm cuối ngày'} /></label>}
    </Hop>
  );
}

function CongNo({ ds, onThu }) {
  const tong = ds.reduce((s, k) => s + k.tong, 0);
  return (
    <main className="bhq-ds">
      <h2>Công nợ khách · {ds.length} khách · {so(tong)}</h2>
      <p className="bhq-ghi">Sắp theo nợ lâu nhất. Thu nợ trừ vào hoá đơn cũ nhất trước. Màu: vàng &gt; 30 ngày, đỏ &gt; 90 ngày. (2 khoản đầu là nợ MẪU để xem.)</p>
      {ds.map((k) => (
        <div key={k.khach.id} className={`bhq-the ${k.tuoiNo > 90 ? 'no-do' : k.tuoiNo > 30 ? 'no-vang' : ''}`}>
          <div><b>{k.khach.name}</b>{k.khach.phone ? ` · ${k.khach.phone}` : ''}</div>
          <div>{k.soHd} hoá đơn còn nợ · cũ nhất {k.hdCuNhat} · <b>nợ {k.tuoiNo} ngày</b></div>
          <div className="hang"><b>{so(k.tong)}</b><button type="button" className="bhq-nut chinh nho" onClick={() => onThu(k)}>Thu nợ</button></div>
        </div>
      ))}
      {!ds.length && <p className="bhq-rong">Không còn khách nào nợ.</p>}
    </main>
  );
}

function HuyHoaDon({ hd, onDong, onHuy }) {
  const [lyDo, setLyDo] = useState(LY_DO_HUY_HD[0]);
  return (
    <Hop tieuDe={`Huỷ ${hd.ma}`} onDong={onDong}
      chan={<button type="button" className="bhq-nut nguy" disabled={!lyDo.trim()} onClick={() => onHuy(lyDo.trim())}>Huỷ hoá đơn {so(hd.canTra)}</button>}>
      <p className="bhq-ghi">Hoá đơn huỷ vẫn giữ trong danh sách (không xoá), bánh được cộng lại vào kho. Bán sai thì huỷ rồi bán lại hoá đơn đúng.</p>
      <div className="bhq-goi">{LY_DO_HUY_HD.map((l) => <button key={l} type="button" className={lyDo === l ? 'on' : ''} onClick={() => setLyDo(l)}>{l}</button>)}</div>
      <label className="bhq-nhan">Lý do huỷ (bắt buộc)<input className="bhq-o" value={lyDo} onChange={(e) => setLyDo(e.target.value)} /></label>
    </Hop>
  );
}

function ThuNo({ no, onDong, onThu }) {
  const [tien, setTien] = useState(String(no.tong));
  const [pt, setPt] = useState('tien_mat');
  const so = Math.min(Number(tien) || 0, no.tong);
  return (
    <Hop tieuDe={`Thu nợ · ${no.khach.name}`} onDong={onDong}
      chan={<button type="button" className="bhq-nut chinh" disabled={!so} onClick={() => onThu(so, pt)}>Thu {so(so)}</button>}>
      <div className="bhq-can-tra">Đang nợ <b>{so(no.tong)}</b></div>
      <div className="bhq-goi">{['tien_mat', 'chuyen_khoan'].map((k) => <button key={k} type="button" className={pt === k ? 'on' : ''} onClick={() => setPt(k)}>{PT[k]}</button>)}</div>
      <label className="bhq-nhan">Số tiền thu<input className="bhq-o lon" inputMode="numeric" value={tien} onChange={(e) => setTien(soTien(e.target.value))} /></label>
    </Hop>
  );
}

function CuoiNgay({ chiNhanh, bc }) {
  const Dong = ({ t, v, lon }) => <div className={lon ? 'lon' : ''}><span>{t}</span><b>{v}</b></div>;
  return (
    <main className="bhq-ds">
      <h2>Báo cáo cuối ngày · {chiNhanh} · {new Date().toLocaleDateString('vi-VN')}</h2>
      <div className="bhq-luoi-bc">
        <div className="bhq-the bhq-bang">
          <h3>Bán hàng</h3>
          <Dong t="Số hoá đơn (đã huỷ)" v={`${bc.soHoaDon} (${bc.soHuy})`} />
          <Dong t="Tổng tiền hàng" v={so(bc.tongHang)} />
          <Dong t="Giảm giá" v={`−${so(bc.giamGia)}`} />
          <Dong t={`Trả hàng (${bc.soTra} phiếu)`} v={`−${so(bc.traHang)}`} />
          <Dong t="Doanh thu thuần" v={so(bc.doanhThuThuan)} lon />
          <Dong t="Thu khác (ship, phụ thu…)" v={so(bc.thuKhac)} />
          <Dong t="VAT 8% thu hộ" v={so(bc.vat)} />
        </div>
        <div className="bhq-the bhq-bang">
          <h3>Tiền thu <small>(đã trừ tiền hoàn trả hàng)</small></h3>
          <Dong t="Tiền mặt" v={so(bc.tienMat)} />
          <Dong t="Chuyển khoản" v={so(bc.chuyenKhoan)} />
          <Dong t="Thẻ" v={so(bc.the)} />
          <Dong t="Ghi nợ mới" v={so(bc.ghiNo)} />
          <Dong t="Thu nợ cũ" v={so(bc.thuNo)} />
        </div>
        <div className="bhq-the bhq-bang">
          <h3>Hàng hoá</h3>
          <Dong t="Bếp giao ra quầy" v={`${bc.giao.sl} cái`} />
          <Dong t="Xuất huỷ" v={`${bc.huy.sl} cái · ${so(bc.huy.giaTri)}`} />
          <Dong t="Xuất dùng nội bộ" v={`${bc.noibo.sl} cái · ${so(bc.noibo.giaTri)}`} />
        </div>
        <div className="bhq-the bhq-bang">
          <h3>Lãi gộp <small>(chỉ Giám đốc thấy)</small></h3>
          <Dong t="Doanh thu thuần" v={so(bc.doanhThuThuan)} />
          <Dong t="Giá vốn hàng bán" v={`−${so(bc.giaVon)}`} />
          <Dong t="Lãi gộp" v={so(bc.laiGop)} lon />
          <Dong t="Hàng huỷ (theo giá vốn)" v={`−${so(bc.huy.giaTri)}`} />
        </div>
      </div>
    </main>
  );
}
