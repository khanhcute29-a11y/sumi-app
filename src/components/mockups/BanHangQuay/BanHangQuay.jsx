import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowLeft, ArrowLeftRight, Check, ChevronDown, ChevronLeft, ChevronRight, CirclePlus, Clock, EllipsisVertical, Filter, Image as IconAnh,
  List, Menu, Minus, Pencil, PersonStanding, Plus, Printer, ReceiptText, Repeat, ScanBarcode, Search, ShoppingBag, Tag,
  Trash2, User, X, Zap, Copy, LayoutGrid, Save, SquarePen, CircleUser, Warehouse, Share2, ClipboardCheck, Package, House,
  Eye, EyeOff, Mail, ChartArea, FileText, FileClock, ArrowDownUp, Box, Ellipsis, PackageMinus, Bell, Truck, Users, ShoppingCart, Download,
  ListFilter, ChartColumn, Maximize2, Minimize2, Settings, Info, ChevronUp,
} from 'lucide-react';

// Rời máy bán hàng, quay về trang chủ app Sumi (nút "Bán tại quầy" ở màn Hôm nay mở vào đây).
const veApp = () => { window.location.href = '/'; };
import { supabase } from '../../../lib/supabaseClient';
import {
  CHI_NHANH, DANH_MUC, THU_KHAC_GOI_Y, LOAI_PHIEU, LY_DO_HUY, LY_DO_HUY_HD, LOAI_NOI_BO, LUAN_CHUYEN,
  taoMatHang, tonGia, tienDong, tinhHoaDon, tinhThanhToan, tinhKetCa, apPhieuKho, tinhCongNo, baoCaoNgay, khop, locXep, docSoTien,
} from './banHangQuayLogic';
import {
  kiemTraThat, taiDuLieu, taiViecCho, laKeToan, goi, goiHoacXep, xepHang, dsCho, guiHangDoi, laLoiMang, chuLoi, maMoi, tachId,
  LOAI_LEN_DB, phieuTuDb, lapBanDoHang, congNoTuDb, taiAnh,
} from './posThat';
import {
  HopT, MoCa, XinDuyet, ViecCho, QrChuyenKhoan, ThietLapQuay, DatCoc, LayBanhDat, NhanHang, ChupAnh, NhatKy, BaoCaoThat, KetCaThat,
} from './QuayThat';
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
// Thanh quản lý giống KiotViet: Hóa đơn · Hàng hóa ▾ (Danh sách hàng hóa | Kiểm kho · Xuất dùng nội bộ · Xuất hủy) · Nhập hàng · Công nợ · Báo cáo.
const TEN_DT = { ls: 'Hóa đơn', hh: 'Hàng hóa', pn: 'Nhập hàng', xh: 'Xuất hủy', xd: 'Xuất dùng nội bộ', kk: 'Kiểm kho', ch: 'Chuyển hàng', kh: 'Khách hàng', no: 'Công nợ', ngay: 'Báo cáo cuối ngày', them: 'Nhiều hơn' };
// Các màn con mở từ "Nhiều hơn" (có nút ← quay lại).
const MAN_CON = ['pn', 'xh', 'xd', 'kk', 'ch', 'kh', 'no'];
const MENU_HH = [['hh', 'Danh sách hàng hóa'], ['kk', 'Kiểm kho'], ['ch', 'Chuyển hàng'], ['xd', 'Xuất dùng nội bộ'], ['xh', 'Xuất hủy']];
const gio = (t) => new Date(t).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
const ngayDayDu = (t) => { const d = new Date(t); const p = (n) => String(n).padStart(2, '0'); return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`; };
const cungNgay = (a, b) => new Date(a).toDateString() === new Date(b).toDateString();
const soTien = (v) => String(v).replace(/\D/g, '');
// KiotViet viết số tiền kiểu 450,000 (dấu phẩy, không "đ") — giữ y nguyên cho nhân viên quen mắt.
const so = (n) => Math.round(Number(n) || 0).toLocaleString('en-US');
const hdMoi = (so_, nguoiBan) => ({
  id: maMoi(), so: so_, dong: [], giam: 0, giamKieu: 'vnd', khach: KHACH_LE, thuKhac: [], vat: false,
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
  const [daBanDb, setDaBan] = useState([]);
  const [thuNos, setThuNos] = useState([]);
  const [hdXong, setHdXong] = useState(null); // điện thoại: vừa thanh toán xong → mở chi tiết hoá đơn như KiotViet
  const [traHangs] = useState([]); // tiệm không làm trả hàng — bánh hết date thì Xuất hủy cuối ngày
  const [phieuKho, setPhieuKho] = useState([]);
  const [hop, setHop] = useState(null);
  const [menuMo, setMenuMo] = useState(false);
  const [moHH, setMoHH] = useState(false); // menu "Hàng hóa ▾" ở thanh quản lý
  const [soCaDong, setSoCaDong] = useState(0);
  const [form, setForm] = useState(null); // { loai, phieu } — màn lập phiếu kho toàn trang
  const [ttMo, setTtMo] = useState(false); // Bán thường: khung thanh toán trượt ra
  const [dtMan, setDtMan] = useState('chon'); // điện thoại: chon → gio → tt (như app KiotViet)
  const [dm, setDm] = useState('all');
  const [locMo, setLocMo] = useState(false);
  const [xemDs, setXemDs] = useState(false); // "Chế độ danh sách"
  // Vai trò: chỉ tài khoản vai trò 'owner' (đọc từ database) thấy màn Giám đốc như app KiotViet của chủ tiệm;
  // mọi vai trò khác dùng màn nhân viên bán hàng. Chủ tiệm bật "Xem màn nhân viên" để duyệt màn đó.
  const [vaiTro, setVaiTro] = useState(null);
  const [xemNV, setXemNV] = useState(false);
  const laChu = vaiTro === 'owner';
  const laGD = laChu && !xemNV;
  const [daDoc, setDaDoc] = useState(() => new Set());
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
  // ── CHẠY THẬT: bật khi cờ pos_ban_hang_that mở cho tài khoản này (xem posThat.js). Tắt → vẫn là bản xem trước như cũ.
  const [that, setThat] = useState(null); // { cap: 'gd' | 'ql' | 'nv', uid }
  const [lyDoXemTruoc, setLyDoXemTruoc] = useState('');
  const [laKT, setLaKT] = useState(false);
  const [caiDat, setCaiDat] = useState({});
  const [caMoDs, setCaMoDs] = useState({});
  const [hsd, setHsd] = useState({});
  const [bangGia, setBangGia] = useState([]);
  const [noDb, setNoDb] = useState({ ds: [], du: [] });
  const [viec, setViec] = useState({ duyet: [], ck: [], ca: [] });
  const [hdCho, setHdCho] = useState([]); // hoá đơn bán lúc mất mạng, đang đợi gửi
  const [soCho, setSoCho] = useState(0);
  const [mang, setMang] = useState(() => typeof navigator === 'undefined' || navigator.onLine !== false);
  const [diemKhach, setDiemKhach] = useState({});
  const [dangBan, setDangBan] = useState(false);
  const daBan = useMemo(() => (hdCho.length ? [...hdCho.filter((c) => !daBanDb.some((x) => x.id === c.id)), ...daBanDb] : daBanDb), [hdCho, daBanDb]);
  const caMo = caMoDs[chiNhanh] || null;
  const cd = caiDat[chiNhanh] || null;
  const quanLy = !!that && (that.cap === 'gd' || that.cap === 'ql');
  const xemQl = that ? quanLy && !xemNV : laGD; // được xem báo cáo / công nợ / nhật ký
  const soViec = viec.duyet.length + viec.ck.length + viec.ca.length;
  const napThat = async (mh = matHang) => {
    try {
      const d = await taiDuLieu(mh);
      setCaiDat(d.caiDat); setCaMoDs(d.caMo); setDaBan(d.daBan); setPhieuKho(d.phieuKho); setNoDb(d.congNo);
      setTonCN(d.tonCN); setHsd(d.hsd); setBangGia(d.bangGia); setNguonDl('dữ liệu thật');
    } catch (e) { nhan(`Không tải được dữ liệu quầy: ${chuLoi(e)}`); }
  };
  const napNo = async () => {
    const { data, error } = await supabase.from('pos_debt_entries').select('customer_id, amount, entry_type, note, created_at, customers(name, phone)').order('created_at').limit(10000);
    if (!error) setNoDb(congNoTuDb(data || []));
  };

  useEffect(() => { const t = window.setInterval(() => setBayGio(Date.now()), 30000); return () => window.clearInterval(t); }, []);

  useEffect(() => {
    let huy = false;
    const choToiDa = setTimeout(() => {
      if (!huy) { setMatHang((m) => (m.length ? m : taoMatHang(SP_MAU))); setNguonDl((n) => (n === '…' ? 'dữ liệu mẫu (mạng chậm)' : n)); }
    }, 6000);
    (async () => {
      let sp = SP_MAU; let nguon = 'dữ liệu mẫu (chưa đăng nhập)'; let kh = null; let ten = null; let vt = null; let kt = null;
      try {
        const { data: s } = await supabase.auth.getSession();
        if (s?.session) {
          const { data, error } = await supabase.from('products').select('*, product_variants(*)').eq('active', true).order('created_at');
          if (!error && data?.length) { sp = data; nguon = `${data.length} sản phẩm thật (chỉ đọc)`; }
          const r = await supabase.from('customers').select('id,name,phone').eq('is_school', false).order('name').limit(500);
          kh = r.data;
          const pr = await supabase.from('profiles').select('id,full_name,role').eq('id', s.session.user.id).maybeSingle();
          ten = pr.data?.full_name || null;
          vt = pr.data?.role || null;
          kt = await kiemTraThat().catch(() => null);
        }
      } catch { /* dùng dữ liệu mẫu */ }
      if (huy) return;
      clearTimeout(choToiDa);
      const mh = taoMatHang(sp);
      if (kt?.bat) setThat({ cap: kt.cap, uid: kt.uid }); else setLyDoXemTruoc(kt?.lyDo || '');
      setMatHang(mh);
      setNguonDl(nguon);
      setVaiTro(vt);
      if (ten) { setCa((c) => ({ ...c, nguoi: ten })); setHds((ds) => ds.map((h) => ({ ...h, nguoiBan: ten }))); }
      const ds = kh?.length ? kh : KHACH_MAU;
      setKhachDs(ds);
      if (kt?.bat) {
        napThat(mh);
        laKeToan().then((x) => !huy && setLaKT(!!x));
        dsCho().then((cho) => !huy && setHdCho(cho.filter((v) => v.banGhi).map((v) => v.banGhi)));
        return; // chạy thật: không có nợ mẫu
      }
      // Nợ MẪU để thấy màn Công nợ (tuổi nợ): 2 khách đầu danh sách.
      const bay = Date.now();
      setDaBan(ds.slice(0, 2).map((k, i) => ({
        ma: `HD-MAU${i + 1}`, luc: bay - (i ? 95 : 12) * NGAY, chiNhanh: CHI_NHANH[0], thuNgan: 'Dữ liệu mẫu', khach: k,
        dong: [], tongHang: i ? 450000 : 180000, giamHd: 0, sauGiam: i ? 450000 : 180000, thuKhac: 0, vat: 0, giaVon: 0, canTra: i ? 450000 : 180000,
        phuongThuc: 'tien_mat', khachDua: 0, thucThu: 0, thua: 0, no: i ? 450000 : 180000, daHuy: false, mau: true,
      })));
    })();
    return () => { huy = true; clearTimeout(choToiDa); };
  }, []);

  // Tồn kho giả theo từng chi nhánh (nạp 1 lần khi có danh mục).
  useEffect(() => {
    if (!matHang.length || that) return;
    // Chỉ điền mã còn thiếu — hàng mới thêm giữ đúng tồn ban đầu, hàng cũ không bị nạp lại.
    setTonCN((cu) => {
      const t = {};
      for (const cn of CHI_NHANH) { t[cn] = { ...(cu[cn] || {}) }; for (const m of matHang) if (t[cn][m.ma] === undefined) t[cn][m.ma] = tonGia(m.ma, cn); }
      return t;
    });
  }, [matHang, that]);

  // Chạy thật: ca hiện tại lấy từ database.
  useEffect(() => {
    if (!that) return;
    setCa((c) => ({ ...c, dauCa: Number(caMo?.opening_cash || 0), moLuc: caMo ? new Date(caMo.opened_at).getTime() : Date.now() }));
  }, [that, caMo]);

  // Chạy thật: gửi lại việc làm lúc mất mạng + tải việc chờ duyệt (20 giây/lần), tải lại toàn bộ 2 phút/lần.
  useEffect(() => {
    if (!that) return undefined;
    let dung = false; let soDuyetCu = -1;
    const vong = async () => {
      if (dung) return;
      const truoc = (await dsCho()).length;
      if (truoc) {
        const { conLai } = await guiHangDoi(({ viec: v, kq, loi }) => {
          if (v.ham === 'pos_ban') setHdCho((x) => x.filter((h) => h.id !== v.khoa));
          if (loi) nhan(`Việc làm lúc mất mạng bị từ chối khi gửi lại: ${loi}`);
          else if (v.ham === 'pos_ban' && kq?.code) nhan(`Đã gửi hoá đơn bán lúc mất mạng → ${kq.code}`);
        });
        if (!dung) setSoCho(conLai);
        if (conLai < truoc) napThat();
      } else setSoCho(0);
      const coQuyen = that.cap === 'gd' || that.cap === 'ql' || laKT;
      if (coQuyen) {
        const v = await taiViecCho(that.cap, laKT).catch(() => null);
        if (v && !dung) {
          if (soDuyetCu >= 0 && v.duyet.length > soDuyetCu) nhan('Có yêu cầu mới cần duyệt — bấm "Việc chờ"');
          soDuyetCu = v.duyet.length; setViec(v);
        }
      }
    };
    const onMang = () => { setMang(navigator.onLine !== false); if (navigator.onLine !== false) vong(); };
    window.addEventListener('online', onMang); window.addEventListener('offline', onMang);
    vong();
    const t = setInterval(vong, 20000);
    const tLon = setInterval(() => { if (navigator.onLine !== false) napThat(); }, 120000);
    return () => { dung = true; clearInterval(t); clearInterval(tLon); window.removeEventListener('online', onMang); window.removeEventListener('offline', onMang); };
  }, [that, laKT]); // eslint-disable-line react-hooks/exhaustive-deps

  // In: đợi #bhq-in vẽ xong nội dung mới rồi mới mở hộp in (máy ZyWell 80mm qua USB).
  useEffect(() => {
    if (!banIn) return undefined;
    const t = setTimeout(() => window.print(), 80);
    return () => clearTimeout(t);
  }, [banIn]);

  useEffect(() => { if (!hdId && hds[0]) setHdId(hds[0].id); }, [hdId, hds]);
  const hd = hds.find((h) => h.id === hdId) || hds[0];
  const tongGoc = tinhHoaDon(hd);
  // Điểm thưởng (chạy thật): dùng vừa đủ điểm để trừ tiền, database kiểm lại số điểm.
  const giaDiem = Number(cd?.point_value || 0);
  const diemCo = that && cd?.points_enabled && hd.khach.id ? (diemKhach[hd.khach.id] || 0) : 0;
  const diemDung = hd.dungDiem && giaDiem > 0 ? Math.min(diemCo, Math.ceil(tongGoc.canTra / giaDiem)) : 0;
  const tienDiem = Math.min(diemDung * giaDiem, tongGoc.canTra);
  const tong = tienDiem ? { ...tongGoc, canTra: tongGoc.canTra - tienDiem, tienDiem } : tongGoc;
  const khachId = hd.khach.id;
  useEffect(() => {
    if (!that || !cd?.points_enabled || !khachId || diemKhach[khachId] != null) return;
    supabase.from('pos_points_entries').select('points').eq('customer_id', khachId)
      .then(({ data }) => setDiemKhach((x) => ({ ...x, [khachId]: (data || []).reduce((a, r) => a + Number(r.points || 0), 0) })));
  }, [that, cd?.points_enabled, khachId]); // eslint-disable-line react-hooks/exhaustive-deps
  const bgHd = bangGia.find((b) => b.id === hd.bangGia) || null;
  const giaCua = (m, bg = bgHd) => (bg?.gia?.[m.ma]) || m.gia;
  const hsdCN = hsd[chiNhanh] || {};
  const ngayConHsd = (ma) => {
    const t = hsdCN[ma];
    if (!t) return null;
    const d = new Date(); d.setHours(0, 0, 0, 0);
    return Math.round((t - d.getTime()) / NGAY);
  };
  const nhanHsd = (ma) => {
    const con = ngayConHsd(ma);
    if (con == null || con > 1) return null;
    return <i className={`kv-hsd ${con <= 0 ? 'het' : ''}`}>{con < 0 ? 'Quá hạn' : con === 0 ? 'HSD hôm nay' : 'HSD mai'}</i>;
  };
  const gioVN = new Date(bayGio).toTimeString().slice(0, 5);
  const eodDuoc = !!(that && cd && gioVN >= String(cd.eod_from || '20:00').slice(0, 5));
  const coEod = hd.dong.some((d) => d.eod);
  const batEod = () => suaHd((h) => ({
    ...h, dua: null,
    dong: h.dong.map((d) => (coEod ? { ...d, eod: false, giam: 0, giamKieu: 'vnd' } : { ...d, eod: true, giamKieu: '%', giam: Number(cd.eod_discount_pct) })),
  }));
  const doiBangGia = (id) => {
    const bg = bangGia.find((b) => b.id === id) || null;
    suaHd((h) => ({ ...h, bangGia: bg?.id || null, dua: null, dong: h.dong.map((d) => { const m = matHang.find((x) => x.ma === d.ma); return m ? { ...d, gia: giaCua(m, bg) } : d; }) }));
  };
  const suaHd = (fn) => setHds((ds) => ds.map((h) => (h.id === hd.id ? fn(h) : h)));
  const sua = (thay) => suaHd((h) => ({ ...h, ...thay }));
  const nhan = (msg, hoaDon = null) => {
    clearTimeout(baoHen.current);
    setBao({ msg, hoaDon });
    baoHen.current = setTimeout(() => setBao(null), hoaDon ? 6000 : 2600);
  };
  const nguoi = ca.nguoi;
  // Thêm hàng hoá mới (như KiotViet): chỉ thêm trong phiên xem thử, không ghi vào hệ thống.
  const themHangMoi = (m, tonDau) => {
    setTonCN((cu) => {
      const t = { ...cu };
      for (const cn of CHI_NHANH) t[cn] = { ...(cu[cn] || {}), [m.ma]: cn === chiNhanh ? tonDau : 0 };
      return t;
    });
    if (tonDau) setTheKho((x) => [{ luc: Date.now(), chiNhanh, ma: m.ma, chungTu: m.ma, loai: 'Khởi tạo', sl: tonDau, tonCuoi: tonDau, nguoi }, ...x]);
    setMatHang((ds) => [m, ...ds]);
    setHop(null);
    nhan(`Đã thêm hàng hoá ${m.ma} — ${m.ten}`);
  };

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
        : [...h.dong, { id: m.id, ma: m.ma, ten: m.ten, size: m.size, gia: giaCua(m), giaVon: m.giaVon, sl: 1, giam: 0, giamKieu: 'vnd', ghiChu: '', danhMuc: m.danhMuc, anh: m.anh }];
      return { ...h, dong, dua: null };
    });
    const hsdCon = ngayConHsd(m.ma);
    if (hsdCon != null && hsdCon < 0) nhan(`⚠️ ${m.ten} trong kho đã QUÁ HẠN — kiểm lại bánh trước khi bán`);
    else if ((ton[m.ma] ?? 0) - (slTrongGio[m.ma] || 0) <= 0) nhan(`${m.ten} đã hết tồn trên máy — vẫn bán được, cuối ngày nhớ kiểm kho`);
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

  // Bán xong: đóng giỏ, mở chi tiết (điện thoại), in, báo.
  const baoXong = (banGhi, tt, chu) => {
    if (dienThoai) {
      // Điện thoại không có thanh tab hoá đơn: bán xong phải về giỏ TRỐNG, không tự bật hoá đơn
      // đang Lưu tạm lên (thu ngân dễ bán nhầm món của khách trước). Hoá đơn tạm vẫn mở lại được ở "n hóa đơn".
      const con = hds.filter((h) => h.id !== hd.id);
      const trong = con.find((h) => !h.dong.length);
      if (trong) { setHds(con); setHdId(trong.id); } else {
        demHd.current = con.length ? demHd.current + 1 : 1;
        const moi = hdMoi(demHd.current, nguoi);
        setHds([...con, moi]); setHdId(moi.id);
      }
    } else dongHd(hd.id);
    setTtMo(false);
    if (banGhi) {
      setDtMan(dienThoai ? 'xong' : 'chon');
      setHdXong(banGhi.ma);
      if (inTuDong) setBanIn({ ...banGhi });
      nhan(chu || `Thanh toán thành công ${banGhi.ma} · ${so(banGhi.canTra)}${tt.thua ? ` · tiền thừa ${so(tt.thua)}` : ''}${tt.no ? ` · ghi nợ ${so(tt.no)}` : ''}`, banGhi);
    } else { setDtMan('chon'); if (chu) nhan(chu); }
    if (!dienThoai) setTimeout(() => timRef.current?.focus(), 50);
  };

  // CHẠY THẬT: database tính lại giá, giảm giá, nợ, điểm; mất mạng thì giữ trên máy rồi tự gửi.
  const hoanTatThat = async (duyetId = hd.duyetId) => {
    if (!hd.dong.length || dangBan) return;
    if (!caMo) { nhan('Chưa mở ca — nhập tiền đầu ca trước khi bán'); setManHinh('ban'); return; }
    const dua = hd.dua == null ? tong.canTra : hd.dua;
    const tt = tinhThanhToan({ canTra: tong.canTra, khachDua: dua, phuongThuc: hd.pt, laKhachLe: !hd.khach.id });
    if (tt.loi) { nhan(tt.loi); return; }
    const donGia = (d) => (d.sl ? Math.round(tienDong(d) / d.sl) : d.gia);
    const goc = hd.dong.reduce((a, d) => a + d.gia * d.sl, 0);
    const giam = hd.dong.filter((d) => !d.eod).reduce((a, d) => a + (d.gia - donGia(d)) * d.sl, 0) + tong.giamHd;
    const pct = goc ? (giam * 100) / goc : 0;
    const xinGiam = () => setHop({ loai: 'xin_duyet', kind: 'giam_gia', payload: { tien: Math.round(giam), mo_ta: `${nguoi} xin giảm ${so(giam)} (${pct.toFixed(1)}%) cho hoá đơn ${so(goc)}${hd.khach.id ? ` · ${hd.khach.name}` : ''}` } });
    if (that.cap === 'nv' && pct > Number(cd?.staff_discount_pct ?? 0) && !duyetId) { xinGiam(); return; }
    const p = {
      id: hd.id, store: chiNhanh, customer_id: hd.khach.id || null, price_list_id: hd.bangGia || null,
      lines: hd.dong.map((d) => { const t = tachId(d.id ? d : matHang.find((m) => m.ma === d.ma)); return { product_id: t.product_id, variant_id: t.variant_id, size: d.size || null, name: d.ten, qty: d.sl, list_price: d.gia, unit_price: donGia(d), eod: !!d.eod, note: d.ghiChu || null }; }),
      invoice_discount: tong.giamHd, other_fees: hd.thuKhac, vat: !!hd.vat, points_used: diemDung, pay_method: hd.pt,
      received: Number(dua) || 0, note: hd.ghiChu || null, seller_name: hd.nguoiBan || nguoi, approval_id: duyetId || null,
      client_created_at: new Date().toISOString(),
    };
    const banGhi = {
      id: hd.id, luc: Date.now(), chiNhanh, thuNgan: nguoi, nguoiBan: hd.nguoiBan || nguoi, khach: hd.khach, dong: hd.dong,
      thuKhacDong: hd.thuKhac, ghiChu: hd.ghiChu, ...tong, phuongThuc: hd.pt, khachDua: Number(dua) || 0, ...tt, daHuy: false, that: true, caId: caMo.id,
      bangGia: bgHd?.ten || null, ckTrangThai: hd.pt === 'chuyen_khoan' && tt.thucThu > 0 ? 'cho_xac_nhan' : 'khong',
    };
    setDangBan(true);
    try {
      const kq = await goi('pos_ban', { p });
      const ghi = { ...banGhi, ma: kq.code, canTra: Number(kq.total), diemCong: kq.points_earned || 0 };
      setDaBan((ds) => [ghi, ...ds.filter((x) => x.id !== ghi.id)]);
      ghiKho(chiNhanh, hd.dong.map((d) => ({ ma: d.ma, sl: -d.sl })), kq.code, 'Bán hàng');
      if (tt.no > 0) napNo();
      if (hd.khach.id) setDiemKhach((x) => { const y = { ...x }; delete y[hd.khach.id]; return y; });
      baoXong(ghi, tt, kq.points_earned ? `Thanh toán thành công ${kq.code} · ${so(kq.total)} · khách +${kq.points_earned} điểm` : null);
    } catch (e) {
      if (laLoiMang(e)) {
        const ghi = { ...banGhi, ma: `TẠM-${hd.id.slice(0, 4).toUpperCase()}`, choGui: true };
        await xepHang({ ham: 'pos_ban', thamSo: { p: { ...p, offline: true } }, khoa: hd.id, banGhi: ghi });
        setHdCho((x) => [ghi, ...x]); setSoCho((n) => n + 1);
        ghiKho(chiNhanh, hd.dong.map((d) => ({ ma: d.ma, sl: -d.sl })), ghi.ma, 'Bán hàng (chờ gửi)');
        baoXong(ghi, tt, `Mất mạng — đã giữ hoá đơn ${so(tong.canTra)} trên máy, có mạng sẽ tự gửi. Cứ bán tiếp.`);
      } else {
        const m = chuLoi(e);
        if (/Xin duyệt/.test(m)) xinGiam(); else nhan(m);
      }
    } finally { setDangBan(false); }
  };

  const hoanTat = () => {
    if (that) { hoanTatThat(); return; }
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
    baoXong(banGhi, tt);
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

  // Thu ngân chỉ tự huỷ được hoá đơn trong ca đang mở (bấm nhầm món / sai số lượng); đã kết ca → chỉ Giám đốc huỷ được.
  // Chạy thật: database quyết (nhân viên huỷ ca cũ thì phải xin duyệt).
  const huyDuoc = (h) => h.chiNhanh === chiNhanh && (that ? !h.daHuy : (laGD || h.luc >= ca.moLuc));
  const huyHoaDonThat = async (h, lyDo, duyetId = null) => {
    if (h.choGui) { nhan('Hoá đơn này chưa gửi lên (đang mất mạng) — có mạng rồi mới huỷ được'); return; }
    try {
      await goi('pos_huy_hd', { p_id: h.id, p_reason: lyDo, p_approval_id: duyetId });
      setDaBan((ds) => ds.map((x) => (x.id === h.id ? { ...x, daHuy: true, lyDoHuy: lyDo, nguoiHuy: nguoi, lucHuy: Date.now() } : x)));
      ghiKho(h.chiNhanh, h.dong.map((d) => ({ ma: d.ma, sl: d.sl })), h.ma, 'Huỷ hoá đơn');
      if (h.no) napNo();
      nhan(`Đã huỷ ${h.ma} — đã cộng lại tồn kho${h.phuongThuc === 'tien_mat' && h.thucThu ? `, trả khách ${so(h.thucThu)} tiền mặt` : ''}`);
    } catch (e) {
      const m = chuLoi(e);
      if (/cần Quản lý/.test(m) && !duyetId) setHop({ loai: 'xin_duyet', kind: 'huy_hd', payload: { invoice_id: h.id, tien: h.canTra, mo_ta: `${nguoi} xin huỷ ${h.ma} (${so(h.canTra)}) — ${lyDo}` }, sau: { h, lyDo } });
      else nhan(m);
    }
  };
  const huyHoaDon = (ma, lyDo) => {
    if (that) { const h = daBan.find((x) => x.ma === ma); if (h) huyHoaDonThat(h, lyDo); return; }
    const h = daBan.find((x) => x.ma === ma);
    if (!h || h.daHuy || !huyDuoc(h)) return;
    setDaBan((ds) => ds.map((x) => (x.ma === ma ? { ...x, daHuy: true, lyDoHuy: lyDo, nguoiHuy: nguoi, lucHuy: Date.now() } : x)));
    const conLai = h.dong.map((d) => ({ ma: d.ma, sl: d.sl })).filter((d) => d.sl > 0);
    if (conLai.length) ghiKho(h.chiNhanh, conLai, ma, 'Huỷ hoá đơn');
    nhan(`Đã huỷ ${ma} — đã cộng lại tồn kho${h.no ? ', xoá phần nợ' : ''}`);
  };
  const bdHang = useMemo(() => lapBanDoHang(matHang), [matHang]);
  const luuPhieuThat = async (phieu, hoanThanh) => {
    const id = phieu.id || maMoi();
    const p = {
      id, type: LOAI_LEN_DB[phieu.loai], store: phieu.chiNhanh, status: hoanThanh ? 'xong' : 'tam',
      lines: phieu.dong.map((d) => { const m = matHang.find((x) => x.ma === d.ma); const t = tachId(m); return { product_id: t.product_id, variant_id: t.variant_id, size: t.size, name: m?.ten || d.ma, qty: d.sl == null || d.sl === '' ? null : Number(d.sl) }; }),
      reason: phieu.loai === 'huy' ? phieu.ghiChu : null,
      note: phieu.loai === 'noibo' ? [phieu.loaiXuat, phieu.nguoiNhan].filter(Boolean).join(' · ') : (phieu.loai === 'huy' ? null : phieu.ghiChu || null),
      photo_url: phieu.anh || null,
    };
    try {
      const r = await goiHoacXep('pos_luu_phieu', { p }, id);
      if (r.choGui) { setSoCho((n) => n + 1); nhan('Mất mạng — đã giữ phiếu trên máy, có mạng sẽ tự gửi'); return; }
      setPhieuKho((ds) => [phieuTuDb(r.kq, bdHang), ...ds.filter((x) => x.id !== id)]);
      if (hoanThanh) napThat();
      nhan(!hoanThanh ? 'Đã lưu phiếu tạm — chưa tác động tồn kho' : phieu.loai === 'giao' ? `Đã gửi ${r.kq.code} — đợi quầy đếm và bấm Nhận hàng` : `Đã hoàn thành ${r.kq.code} — tồn kho đã cập nhật`);
    } catch (e) { nhan(chuLoi(e)); }
  };
  const luuPhieu = (phieu, hoanThanh) => {
    if (that) { luuPhieuThat(phieu, hoanThanh); return; }
    if (!hoanThanh) { setPhieuKho((ds) => [{ ...phieu, trangThai: 'tam' }, ...ds.filter((p) => p.ma !== phieu.ma)]); nhan('Đã lưu phiếu tạm — chưa tác động tồn kho'); return; }
    const { lech, the } = apPhieuKho(tonCN[phieu.chiNhanh] || {}, phieu, 1);
    ghiKho(phieu.chiNhanh, the.map((t) => ({ ma: t.ma, sl: t.sl })), phieu.ma, phieu.denCN ? `Chuyển đi ${phieu.denCN}` : LOAI_PHIEU[phieu.loai].ten);
    // Luân chuyển bánh giữa 2 cửa hàng: cùng 1 phiếu cộng luôn tồn chi nhánh nhận.
    if (phieu.denCN) ghiKho(phieu.denCN, phieu.dong.map((d) => ({ ma: d.ma, sl: Number(d.sl) })), phieu.ma, `Nhận từ ${phieu.chiNhanh}`);
    setPhieuKho((ds) => [{ ...phieu, lech, trangThai: 'xong', lucXong: Date.now() }, ...ds.filter((p) => p.ma !== phieu.ma)]);
    nhan(`Đã hoàn thành ${phieu.ma} — tồn kho đã cập nhật`);
  };
  const huyPhieu = (ma) => {
    const p = phieuKho.find((x) => x.ma === ma);
    if (!p) return;
    if (that) {
      goi('pos_huy_phieu', { p_id: p.id, p_reason: 'Huỷ tại quầy' })
        .then(() => { napThat(); nhan(`Đã hủy ${ma}${p.trangThai === 'xong' ? ' — đã hoàn lại tồn kho' : ''}`); })
        .catch((e) => nhan(chuLoi(e)));
      return;
    }
    if (p.trangThai === 'xong') {
      const { the } = apPhieuKho(tonCN[p.chiNhanh] || {}, p, -1);
      ghiKho(p.chiNhanh, the.map((t) => ({ ma: t.ma, sl: t.sl })), `${p.ma} (hủy)`, `Hủy ${LOAI_PHIEU[p.loai].ten.toLowerCase()}`);
      if (p.denCN) ghiKho(p.denCN, p.dong.map((d) => ({ ma: d.ma, sl: -Number(d.sl) })), `${p.ma} (hủy)`, 'Hủy luân chuyển');
    }
    setPhieuKho((ds) => ds.map((x) => (x.ma === ma ? { ...x, trangThai: 'huy', lucHuy: Date.now(), nguoiHuy: nguoi } : x)));
    nhan(`Đã hủy ${ma}${p.trangThai === 'xong' ? ' — đã hoàn lại tồn kho' : ''}`);
  };

  // "Sao chép" hoá đơn như KiotViet: mở 1 hoá đơn mới có sẵn hàng + khách của hoá đơn cũ (khách mua lại y đơn trước).
  const saoChepHd = (goc) => {
    const moi = themHd();
    setHds((ds) => ds.map((x) => (x.id === moi.id ? { ...x, khach: goc.khach || KHACH_LE, ghiChu: goc.ghiChu || '', dong: goc.dong.map((d) => ({ ...d })) } : x)));
    moManHinh('ban');
    setDtMan(dienThoai ? 'gio' : 'chon');
    nhan(`Đã sao chép ${goc.ma} sang Hóa đơn ${moi.so}`);
  };

  const thuNo = (idKhach, tien, phuongThuc) => {
    if (that) {
      goiHoacXep('pos_thu_no', { p_id: maMoi(), p_customer: idKhach, p_amount: tien, p_method: phuongThuc, p_store: chiNhanh, p_note: null })
        .then((r) => { if (r.choGui) { setSoCho((n) => n + 1); nhan('Mất mạng — đã giữ phiếu thu trên máy, có mạng sẽ tự gửi'); } else { napNo(); nhan(`Đã thu nợ ${so(tien)}`); } })
        .catch((e) => nhan(chuLoi(e)));
      return;
    }
    setThuNos((x) => [...x, { khachId: idKhach, tien, phuongThuc, luc: Date.now(), chiNhanh, nguoi }]);
    nhan(`Đã thu nợ ${so(tien)}`);
  };

  const datHang = () => {
    if (!that) { nhan('Bản xem trước: đơn đặt bánh thật vẫn tạo ở app Sumi → mục Đơn hàng (có cọc, ngày giao).'); return; }
    if (!hd.dong.length) { nhan('Chọn bánh khách đặt vào giỏ, chọn khách, rồi bấm Đặt hàng'); return; }
    if (!caMo) { nhan('Chưa mở ca — mở ca trước để tiền cọc vào két'); return; }
    setHop({ loai: 'dat_coc' }); setMenuMo(false);
  };
  // Thông báo như app KiotViet: gom hoạt động theo người + giờ ("X đã bán N đơn hàng với tổng trị giá Y tại …"),
  // phiếu nhập/hủy/chuyển, và cảnh báo tồn âm. Chỉ đọc dữ liệu trong phiên — không đụng chuông/thông báo đẩy của app.
  const thongBao = useMemo(() => {
    const ds = [];
    const gom = (list, khoa, tao) => {
      const nhom = new Map();
      list.forEach((x) => { const k = khoa(x); if (!nhom.has(k)) nhom.set(k, []); nhom.get(k).push(x); });
      nhom.forEach((xs, k) => ds.push({ id: `${k}:${xs.length}`, luc: Math.max(...xs.map((x) => x.luc)), ...tao(xs) }));
    };
    const gioCua = (t) => Math.floor(t / 3600000);
    gom(daBan.filter((h) => !h.mau && !h.daHuy && h.chiNhanh === chiNhanh), (h) => `ban:${h.nguoiBan}:${gioCua(h.luc)}`, (xs) => ({
      loai: 'ban', nguoi: xs[0].nguoiBan, chu: `đã bán ${xs.length} đơn hàng với tổng trị giá`, so: xs.reduce((s2, h) => s2 + h.canTra, 0), cuoi: `tại ${chiNhanh}`,
    }));
    const tenPhieu = { giao: 'phiếu nhập hàng', huy: 'phiếu xuất hủy', chuyen: 'phiếu chuyển hàng', kiem: 'phiếu kiểm kho', noibo: 'phiếu xuất dùng nội bộ' };
    gom(phieuKho.filter((p) => p.trangThai === 'xong' && (p.chiNhanh === chiNhanh || p.denCN === chiNhanh)), (p) => `phieu:${p.loai}:${p.nguoi}:${gioCua(p.lucXong || p.luc)}`, (xs) => ({
      loai: xs[0].loai === 'giao' ? 'nhap' : 'kho', nguoi: xs[0].nguoi, chu: `đã hoàn thành ${xs.length} ${tenPhieu[xs[0].loai]}`, cuoi: `tại ${xs[0].loai === 'chuyen' && xs[0].denCN === chiNhanh ? `${chiNhanh} (nhận từ ${xs[0].chiNhanh})` : chiNhanh}`,
    }));
    const am = Object.entries(tonCN[chiNhanh] || {}).filter(([, v]) => v < 0).length;
    if (am) ds.push({ id: `am:${am}`, luc: Date.now(), loai: 'ton', chu: 'Có hàng hóa', dam: 'dưới định mức tồn', cuoi: `tại ${chiNhanh} (${am} món tồn âm — cần kiểm kho)` });
    return ds.sort((a, b) => b.luc - a.luc);
  }, [daBan, phieuKho, tonCN, chiNhanh]);
  const tbChuaDoc = thongBao.filter((t) => !daDoc.has(t.id)).length;
  const trongCa = (x) => x.luc >= ca.moLuc && x.chiNhanh === chiNhanh;
  const congNo = useMemo(() => (that ? noDb.ds : tinhCongNo(daBan, thuNos)), [that, noDb, daBan, thuNos]);
  const noCua = (k) => (k?.id ? (congNo.find((x) => x.khach.id === k.id)?.tong || 0) : 0);
  const khachNo = noCua(hd.khach);
  const nguoiBanDs = [...new Set([hd.nguoiBan || nguoi, nguoi, ...(that ? [] : ['Nhân viên quầy 2 (mẫu)'])])];
  const moManHinh = (m) => { setManHinh(m); setMenuMo(false); setTtMo(false); setMoHH(false); };
  useEffect(() => { if (!xemQl && ['ngay', 'no', 'xd'].includes(manHinh)) setManHinh('ban'); }, [xemQl, manHinh]);
  const chiaSe = async (h) => {
    const text = vanBanHd(h);
    try {
      if (window.navigator.share) { await window.navigator.share({ title: `Hóa đơn ${h.ma}`, text }); return; }
      await window.navigator.clipboard.writeText(text);
      nhan('Đã sao chép hóa đơn — dán vào Zalo để gửi khách');
    } catch { /* người dùng bấm hủy chia sẻ */ }
  };
  const moForm = (loai, phieu = null) => { setForm({ loai, phieu }); setMenuMo(false); };
  const moHop = (h) => { setHop(h); setMenuMo(false); };
  const chonKhach = (k) => sua({ khach: k, dua: null });

  const ext = that ? {
    qr: <QrChuyenKhoan caiDat={cd} tien={tong.canTra} hdId={hd.id} />,
    bangGia: bangGia.length ? (
      <label className="kv-bang-gia"><Tag size={15} />
        <select value={hd.bangGia || ''} onChange={(e) => doiBangGia(e.target.value)} aria-label="Bảng giá">
          <option value="">Bảng giá chung</option>{bangGia.map((b) => <option key={b.id} value={b.id}>{b.ten}</option>)}
        </select></label>
    ) : null,
    truocCanTra: (eodDuoc || diemCo > 0) ? (
      <>
        {eodDuoc && <div className="r"><label className="kv-cong-tac nho"><span>Giảm cuối ngày {Number(cd.eod_discount_pct)}%</span><input type="checkbox" checked={coEod} onChange={batEod} /><i /></label>
          <span>{coEod ? `−${so(hd.dong.filter((d) => d.eod).reduce((a, d) => a + d.gia * d.sl - tienDong(d), 0))}` : ''}</span></div>}
        {diemCo > 0 && <div className="r"><label className="kv-cong-tac nho"><span>Dùng điểm ({so(diemCo)})</span><input type="checkbox" checked={!!hd.dungDiem} onChange={(e) => sua({ dungDiem: e.target.checked, dua: null })} /><i /></label>
          <span>{tienDiem ? `−${so(tienDiem)}` : ''}</span></div>}
      </>
    ) : null,
    hsd: nhanHsd,
    dangBan,
  } : null;
  // Mục chỉ có khi chạy thật — dùng chung cho menu ☰ và màn "Nhiều hơn" của điện thoại.
  const mucThat = that ? [
    (quanLy || laKT) && ['viec_cho', `Việc chờ${soViec ? ` (${soViec})` : ''}`, Bell],
    ['dat_coc', 'Đặt bánh · lấy cọc', ShoppingCart],
    ['lay_banh', 'Khách lấy bánh đặt', Package],
    xemQl && !laGD && ['bao_cao', 'Báo cáo', ChartColumn],
    xemQl && ['nhat_ky', 'Nhật ký thao tác', FileClock],
    that.cap === 'gd' && !xemNV && ['thiet_lap_quay', 'Thiết lập quầy', Settings],
  ].filter(Boolean) : [];
  const moMucThat = (k) => {
    setMenuMo(false);
    if (k === 'dat_coc') datHang();
    else if (k === 'bao_cao') moManHinh('ngay');
    else setHop({ loai: k });
  };
  const oKhach = (
    <KhachO khach={hd.khach} ds={khachDs} noCua={noCua} inputRef={khachRef}
      onChon={chonKhach} onThem={() => setHop({ loai: 'them_khach' })} />
  );
  const khungTT = (onDong) => (
    <KhungThanhToan hd={hd} tong={tong} bayGio={bayGio} nguoiBanDs={nguoiBanDs} khachNo={khachNo} duaRef={duaRef} onSua={sua} ext={ext}
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
  const timHang = <TimHang matHang={matHang} ton={ton} inputRef={timRef} onChon={themMon} onThemMoi={() => setHop({ loai: 'them_hang' })} />;
  const dongBo = () => { if (that) { napThat().then(() => nhan('Đã tải lại dữ liệu')); return; } setMatHang((m) => [...m]); nhan('Đã đồng bộ dữ liệu'); };

  return (
    <div className={`bhq kv ${dienThoai ? 'dt' : ''} ${laGD ? '' : 'nv'}`}>
      {manHinh !== 'ban' && dienThoai && !['ls', 'hh', 'them', 'ngay', 'tb'].includes(manHinh) && (
        <header className="kvm-dau kvm-dau-ql">
          {MAN_CON.includes(manHinh) && <button type="button" aria-label="Quay lại" onClick={() => moManHinh('them')}><ChevronLeft size={22} /></button>}
          <h1>{TEN_DT[manHinh]}</h1>{nutMenu}
        </header>
      )}
      {manHinh !== 'ban' && !dienThoai && (
        <header className="kv-top kv-ql">
          <nav className="kv-ql-tabs">
            <button type="button" className={manHinh === 'ls' ? 'on' : ''} onClick={() => moManHinh('ls')}>Hóa đơn</button>
            <button type="button" className={MENU_HH.some(([k]) => k === manHinh) ? 'on' : ''} aria-expanded={moHH} onClick={() => setMoHH((v) => !v)}>Hàng hóa <ChevronDown size={15} /></button>
            <button type="button" className={manHinh === 'pn' ? 'on' : ''} onClick={() => moManHinh('pn')}>Nhập hàng</button>
            <button type="button" className={manHinh === 'kh' ? 'on' : ''} onClick={() => moManHinh('kh')}>Khách hàng</button>
            {xemQl && <button type="button" className={manHinh === 'no' ? 'on' : ''} onClick={() => moManHinh('no')}>Công nợ{congNo.length ? <i>{congNo.length}</i> : null}</button>}
            {xemQl && <button type="button" className={manHinh === 'ngay' ? 'on' : ''} onClick={() => moManHinh('ngay')}>{that ? 'Báo cáo' : 'Báo cáo cuối ngày'}</button>}
          </nav>
          <div className="kv-top-r">
            <button type="button" className="kv-ve-ban" onClick={() => setManHinh('ban')}><ShoppingBag size={17} /> Bán hàng</button>
            {nutMenu}
          </div>
          {moHH && (
            <div className="kv-hh-nen" onClick={() => setMoHH(false)}>
              <div className="kv-hh-xo" onClick={(e) => e.stopPropagation()}>
                <div><small>Hàng hóa</small><button type="button" onClick={() => moManHinh('hh')}>Danh sách hàng hóa</button></div>
                <div><small>Kho hàng</small>{MENU_HH.slice(1).filter(([k]) => (laGD || k !== 'xd') && !(that && k === 'ch')).map(([k, l]) => <button key={k} type="button" className={manHinh === k ? 'on' : ''} onClick={() => moManHinh(k)}>{l}</button>)}</div>
              </div>
            </div>
          )}
        </header>
      )}

      {manHinh === 'ban' && !dienThoai && (
        <>
          <header className="kv-top">
            {timHang}
            {tabsHd}
            <div className="kv-top-r">
              {that && (quanLy || laKT) && <button type="button" className="kv-ic-tr kv-viec" title="Việc chờ xử lý" aria-label={`Việc chờ xử lý: ${soViec}`} onClick={() => setHop({ loai: 'viec_cho' })}><Bell size={20} />{soViec ? <i>{soViec}</i> : null}</button>}
              <button type="button" className="kv-ic-tr" title="Xử lý đặt hàng" aria-label="Xử lý đặt hàng" onClick={() => (that ? setHop({ loai: hd.dong.length ? 'dat_coc' : 'lay_banh' }) : nhan('Đơn đặt bánh xử lý ở mục Đơn hàng của app'))}><ShoppingBag size={20} /></button>
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
                            <span className="gia">{so(giaCua(m))}</span>
                          </span>
                          {ext?.hsd(m.ma)}
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
            {that
              ? <span className={`kv-nguon ${mang ? '' : 'mat'}`}>{mang ? '● Đang chạy thật' : '● Mất mạng — vẫn bán được, có mạng tự gửi'}{soCho ? ` · ${soCho} việc chờ gửi` : ''}</span>
              : <span className="kv-nguon">Bản xem trước · không lưu · {nguonDl}{lyDoXemTruoc ? ` · ${lyDoXemTruoc}` : ''}</span>}
            <button type="button" className="kv-ca" onClick={() => setHop({ loai: 'ket_ca' })}>Ca {nguoi} · từ {gio(ca.moLuc)} · <b>Kết ca</b></button>
          </footer>
        </>
      )}

      {manHinh === 'ban' && dienThoai && dtMan === 'xong' && (() => {
        const h = daBan.find((x) => x.ma === hdXong);
        return h ? <ChiTietHdDt h={h} huyDuoc={huyDuoc(h)} onLui={() => setDtMan('chon')} onIn={() => setHop({ loai: 'bien_lai', hoaDon: h })}
          onHuy={() => setHop({ loai: 'huy_hd', hoaDon: h })} onChiaSe={() => chiaSe(h)} onSaoChep={() => saoChepHd(h)} /> : null;
      })()}
      {manHinh === 'ban' && dienThoai && dtMan !== 'xong' && (
        <DienThoai dtMan={dtMan} setDtMan={setDtMan} hd={hd} tong={tong} monLoc={monLoc} ton={ton} slTrongGio={slTrongGio}
          chips={chips} locMo={locMo} setLocMo={setLocMo} themMon={themMon} datSl={datSl} boDong={boDong} sua={sua}
          boChon={() => sua({ dong: [], dua: null })} luuTam={() => { themHd(); setDtMan('chon'); nhan(`Đã lưu tạm Hóa đơn ${hd.so}`); }}
          khachNo={khachNo} chonKhach={() => setHop({ loai: 'chon_khach_dt' })} onThuKhac={() => setHop({ loai: 'thu_khac' })}
          inTamTinh={inTamTinh} hoanTat={hoanTat} onThongTin={() => setHop({ loai: 'thong_tin_hd' })} soHd={hds.length} onThemHang={() => setHop({ loai: 'them_hang' })} onSuaDong={(ma) => setHop({ loai: 'sua_dong_dt', ma })}
          onMoHd={() => moManHinh('ls')} onMenu={() => setMenuMo(true)} onDatHang={datHang} ext={ext} giaCua={giaCua}
          hds={hds} onChonHd={(id) => { setHdId(id); const h = hds.find((x) => x.id === id); setDtMan(h && h.dong.length ? 'gio' : 'chon'); }} />
      )}

      {dienThoai && !form && !(manHinh === 'ban' && dtMan !== 'chon') && (
        <nav className="kvm-nav" aria-label="Điều hướng">
          {(laGD
            ? [['ngay', 'Tổng quan', ChartArea], ['hh', 'Hàng hoá', Box], ['ban', 'Bán hàng', ShoppingBag], ['ls', 'Hoá đơn', FileText], ['them', 'Khác', Menu]]
            : [['hh', 'Hàng hoá', Box], ['ban', 'Bán hàng', ShoppingBag], ['ls', 'Hoá đơn', FileText], ['tb', 'Thông báo', Bell], ['them', 'Nhiều hơn', Menu]]
          ).map(([k, l, Ic]) => (
            <button key={k} type="button" className={manHinh === k || (k === 'them' && MAN_CON.includes(manHinh)) ? 'on' : ''}
              onClick={() => { moManHinh(k); if (k === 'ban') setDtMan('chon'); }}>
              <span className="ic"><Ic size={24} strokeWidth={manHinh === k ? 2.4 : 1.8} />{k === 'tb' && tbChuaDoc > 0 && <i className="kvm-nav-dem">{tbChuaDoc > 99 ? '99+' : tbChuaDoc}</i>}</span>{l}
            </button>
          ))}
        </nav>
      )}

      {menuMo && (
        <div className="kv-menu-nen" onClick={() => setMenuMo(false)}>
          <div className="kv-menu" onClick={(e) => e.stopPropagation()} role="menu">
            <div className="kv-menu-ai"><User size={18} /> <b>{nguoi}</b></div>
            <div className="kv-menu-hai">
              <button type="button" onClick={() => moManHinh('ls')}><span className="ic xanh"><ReceiptText size={20} /></span>Quản lý</button>
              {laGD && <button type="button" onClick={() => moManHinh('ngay')}><span className="ic cam"><Clock size={20} /></span>Báo cáo cuối ngày</button>}
            </div>
            {manHinh !== 'ban' && <button type="button" onClick={() => moManHinh('ban')}><ShoppingBag size={18} /> Bán hàng</button>}
            {xemQl && <button type="button" onClick={() => moManHinh('no')}><ReceiptText size={18} /> Lập phiếu thu{congNo.length ? <i>{congNo.length}</i> : null}</button>}
            <button type="button" onClick={() => moManHinh('hh')}><Tag size={18} /> Hàng hóa &amp; kho</button>
            <button type="button" onClick={() => moManHinh('pn')}><Warehouse size={18} /> Nhập hàng (bếp giao)</button>
            <button type="button" onClick={() => moHop({ loai: 'ket_ca' })}><Clock size={18} /> Kết ca</button>
            {mucThat.map(([k, l, Ic]) => <button key={k} type="button" onClick={() => moMucThat(k)}><Ic size={18} /> {l}</button>)}
            <hr />
            <label className="kv-menu-cn">Chi nhánh
              <select value={chiNhanh} onChange={(e) => { setChiNhanh(e.target.value); setTrang(0); }}>{CHI_NHANH.map((c) => <option key={c}>{c}</option>)}</select>
            </label>
            <button type="button" onClick={() => moHop({ loai: 'thiet_lap_in' })}><Printer size={18} /> Thiết lập in</button>
            {!dienThoai && <button type="button" onClick={() => moHop({ loai: 'phim_tat' })}><EllipsisVertical size={18} /> Phím tắt</button>}
            {laChu && <button type="button" onClick={() => { setXemNV((v) => !v); setMenuMo(false); }}><Users size={18} /> {xemNV ? 'Về màn Giám đốc' : 'Xem màn nhân viên'}</button>}
            <hr />
            <button type="button" onClick={veApp}><House size={18} /> Về app Sumi</button>
          </div>
        </div>
      )}

      {manHinh === 'hh' && <QlHangHoa matHang={matHang} tonCN={tonCN} chiNhanh={chiNhanh} theKho={theKho.filter((t) => t.chiNhanh === chiNhanh)} dienThoai={dienThoai} laGD={laGD} onThem={() => setHop({ loai: 'them_hang' })} onMoMan={moManHinh} />}
      {manHinh === 'kh' && <KhachHang ds={khachDs} hoaDons={daBan.filter((h) => !h.mau)} noCua={noCua} dienThoai={dienThoai} />}
      {manHinh === 'tb' && <ThongBao ds={thongBao} daDoc={daDoc} onDoc={(id) => setDaDoc((x) => new Set(x).add(id))} onDocHet={() => setDaDoc(new Set(thongBao.map((t) => t.id)))} />}
      {MAN_LOAI[manHinh] && (
        <QlPhieu key={manHinh} loai={MAN_LOAI[manHinh]} dienThoai={dienThoai} ds={phieuKho.filter((p) => (p.chiNhanh === chiNhanh || p.denCN === chiNhanh) && p.loai === MAN_LOAI[manHinh])}
          matHang={matHang} ton={ton} onTao={() => moForm(MAN_LOAI[manHinh])} onMo={(p) => moForm(p.loai, p)}
          onSaoChep={(p) => moForm(p.loai, { dong: p.dong.map((d) => ({ ...d })), ghiChu: p.ghiChu, loaiXuat: p.loaiXuat, nguoiNhan: p.nguoiNhan })}
          onHuy={(p) => setHop({ loai: 'huy_phieu', phieu: p })} onIn={(p) => setBanIn({ phieu: p })}
          onNhan={that ? (p) => setHop({ loai: 'nhan_hang', phieu: p }) : null} />
      )}
      {form && (
        <FormPhieu key={form.phieu?.ma || form.loai} loai={form.loai} phieuCu={form.phieu} matHang={matHang} ton={ton} chiNhanh={chiNhanh} nguoi={nguoi} that={!!that}
          soPhieu={phieuKho.filter((p) => p.loai === form.loai).length + 1}
          ganDay={phieuKho.filter((p) => p.loai === 'kiem' && p.chiNhanh === chiNhanh && p.trangThai !== 'tam')}
          onDong={() => setForm(null)}
          onLuu={(p, xong) => { luuPhieu(p, xong); setForm(null); setManHinh(Object.keys(MAN_LOAI).find((k) => MAN_LOAI[k] === p.loai)); }} />
      )}

      {manHinh === 'ls' && (
        <QlHoaDon key={laGD ? 'gd' : 'nv'} laGD={laGD} ds={daBan.filter((h) => !h.mau && h.chiNhanh === chiNhanh)} traHangs={traHangs} dienThoai={dienThoai} huyDuoc={huyDuoc}
          onIn={(h) => setHop({ loai: 'bien_lai', hoaDon: h })}
          onHuy={(h) => setHop({ loai: 'huy_hd', hoaDon: h })} onChiaSe={chiaSe} onSaoChep={saoChepHd} onBan={() => { moManHinh('ban'); setDtMan('chon'); }} />
      )}
      {manHinh === 'them' && <NhieuHon congNo={congNo.length} chiNhanh={chiNhanh} setChiNhanh={setChiNhanh} onMo={(k) => { moManHinh(k); if (k === 'ban') setDtMan('chon'); }} onHop={setHop}
        laGD={laGD} laChu={laChu} xemNV={xemNV} setXemNV={setXemNV} onDatHang={datHang} mucThat={mucThat} onMucThat={moMucThat} anChuyen={!!that} />}

      {manHinh === 'no' && <CongNo ds={congNo} du={that ? noDb.du : null} onThu={(k) => setHop({ loai: 'thu_no', no: k })} />}

      {manHinh === 'ngay' && that && <BaoCaoThat chiNhanh={chiNhanh} laGD={that.cap === 'gd' && !xemNV} dienThoai={dienThoai} />}
      {manHinh === 'ngay' && !that && (
        <CuoiNgay chiNhanh={chiNhanh} dienThoai={dienThoai} laGD={laGD} onMo={(k) => { moManHinh(k); if (k === 'ban') setDtMan('chon'); }}
          hoaDonsCN={daBan.filter((h) => !h.mau && h.chiNhanh === chiNhanh)} traHangsCN={traHangs.filter((t) => t.chiNhanh === chiNhanh)} soTb={tbChuaDoc}
          bc={baoCaoNgay({
            hoaDons: daBan.filter((h) => !h.mau && h.chiNhanh === chiNhanh && cungNgay(h.luc, Date.now())),
            phieuKho: phieuKho.filter((p) => p.chiNhanh === chiNhanh && p.luc && cungNgay(p.luc, Date.now())),
            thuNos: thuNos.filter((t) => t.chiNhanh === chiNhanh && cungNgay(t.luc, Date.now())),
            traHangs: traHangs.filter((t) => t.chiNhanh === chiNhanh && cungNgay(t.luc, Date.now())),
            matHang,
          })} />
      )}

      {hop?.loai === 'ket_ca' && that && (caMo
        ? <KetCaThat caMo={caMo} chiNhanh={chiNhanh} onDong={() => setHop(null)}
          onKet={(phieu) => { setCaMoDs((x) => ({ ...x, [chiNhanh]: null })); setHop(null); setBanIn({ banGiao: phieu }); nhan(`Đã đóng ca ${phieu.ma} — đã in phiếu bàn giao`); napThat(); }} />
        : <HopT tieuDe="Kết ca" onDong={() => setHop(null)}><p className="bhq-ghi">{chiNhanh} chưa mở ca nào.</p></HopT>)}
      {hop?.loai === 'ket_ca' && !that && (
        <KetCa ca={ca} chiNhanh={chiNhanh} hoaDons={daBan.filter((h) => !h.mau && trongCa(h))} soCa={soCaDong + 1}
          thuNos={thuNos.filter(trongCa)} traHangs={traHangs.filter(trongCa)} onDong={() => setHop(null)}
          onKet={(phieu) => {
            setSoCaDong((n) => n + 1); setCa({ nguoi, dauCa: 0, moLuc: Date.now() }); setHop(null); setBanIn({ banGiao: phieu });
            nhan(`Đã đóng ca ${phieu.ma} — đã in phiếu bàn giao, ca mới bắt đầu`);
          }} />
      )}
      {hop?.loai === 'them_khach' && (
        <ThemKhach onDong={() => setHop(null)}
          onLuu={(k) => {
            if (!that) { setKhachDs((ds) => [k, ...ds]); chonKhach(k); setHop(null); nhan(`Đã thêm khách hàng ${k.name}`); return; }
            goi('pos_tao_khach', { p_name: k.name, p_phone: k.phone }).then((r) => {
              const kk = { id: r.id, name: r.name, phone: r.phone || '' };
              setKhachDs((ds) => [kk, ...ds.filter((x) => x.id !== kk.id)]); chonKhach(kk); setHop(null);
              nhan(r.name === k.name ? `Đã thêm khách hàng ${kk.name}` : `Số này đã có: ${kk.name} — đã chọn khách cũ`);
            }).catch((e) => nhan(chuLoi(e)));
          }} />
      )}
      {hop?.loai === 'chon_khach_dt' && (
        <ChonKhachDt ds={khachDs} noCua={noCua} onDong={() => setHop(null)} onThem={() => setHop({ loai: 'them_khach' })}
          onChon={(k) => { chonKhach(k); setHop(null); }} />
      )}
      {hop?.loai === 'sua_dong_dt' && (() => {
        const d = hd.dong.find((x) => x.ma === hop.ma);
        return d ? <SuaDongDt d={d} onDong={() => setHop(null)} onLuu={(thay) => { suaDong(d.ma, thay); setHop(null); }} onBo={() => { boDong(d.ma); setHop(null); }} /> : null;
      })()}
      {hop?.loai === 'them_hang' && (that
        ? <HopT tieuDe="Thêm hàng hoá" onDong={() => setHop(null)} chan={<button type="button" className="bhq-nut chinh" onClick={() => setHop(null)}>Đã hiểu</button>}>
          <p className="bhq-ghi">Món mới thêm ở app Sumi → mục <b>Sản phẩm</b> (giá, size, ảnh dùng chung cho cả Đơn hàng và quầy). Thêm xong bấm nút Đồng bộ ở đây.</p></HopT>
        : <ThemHangHoa matHang={matHang} laGD={laGD} onDong={() => setHop(null)} onLuu={themHangMoi} />)}
      {hop?.loai === 'thong_tin_hd' && (
        <Hop tieuDe="Thông tin hóa đơn" onDong={() => setHop(null)} chan={<button type="button" className="bhq-nut chinh" onClick={() => setHop(null)}>Xong</button>}>
          <label className="bhq-nhan">Người bán<select className="bhq-o" value={hd.nguoiBan || nguoi} onChange={(e) => sua({ nguoiBan: e.target.value })}>{nguoiBanDs.map((n) => <option key={n}>{n}</option>)}</select></label>
          <div className="bhq-bang"><div><span>Kênh bán</span><b>Bán trực tiếp</b></div><div><span>Chi nhánh</span><b>{chiNhanh}</b></div></div>
          <label className="bhq-nhan">Ghi chú<input className="bhq-o" value={hd.ghiChu} onChange={(e) => sua({ ghiChu: e.target.value })} placeholder="Ghi chú đơn hàng" /></label>
        </Hop>
      )}
      {hop?.loai === 'thu_khac' && <ThuKhac ds={hd.thuKhac} onDong={() => setHop(null)} onLuu={(ds) => { sua({ thuKhac: ds, dua: null }); setHop(null); }} />}
      {hop?.loai === 'dong_hd' && (
        <Hop tieuDe={`Đóng Hóa đơn ${hop.so}`} onDong={() => setHop(null)}
          chan={<><button type="button" className="bhq-nut phu" onClick={() => setHop(null)}>Bỏ qua</button><button type="button" className="bhq-nut chinh" onClick={() => { dongHd(hop.id); setHop(null); }}>Đồng ý</button></>}>
          <p className="bhq-ghi">Thông tin của Hóa đơn {hop.so} sẽ không được lưu lại. Bạn có chắc chắn muốn đóng không?</p>
        </Hop>
      )}
      {hop?.loai === 'thiet_lap_in' && <ThietLapIn chiNhanh={chiNhanh} inTuDong={inTuDong} doiInTuDong={doiInTuDong} onDong={() => setHop(null)} />}
      {hop?.loai === 'bien_lai' && <BienLai hd={hop.hoaDon} onDong={() => setHop(null)} onIn={() => setBanIn({ ...hop.hoaDon })} />}
      {hop?.loai === 'huy_phieu' && (
        <Hop tieuDe="Hủy phiếu" onDong={() => setHop(null)}
          chan={<><button type="button" className="bhq-nut phu" onClick={() => setHop(null)}>Bỏ qua</button><button type="button" className="bhq-nut chinh" onClick={() => { huyPhieu(hop.phieu.ma); setHop(null); }}>Đồng ý</button></>}>
          <p className="bhq-ghi">Bạn có chắc chắn muốn hủy phiếu <b>{hop.phieu.ma}</b> không?{hop.phieu.trangThai === 'xong' ? ' Tồn kho sẽ được hoàn lại như trước khi lập phiếu.' : ''}</p>
        </Hop>
      )}
      {hop?.loai === 'huy_hd' && <HuyHoaDon hd={hop.hoaDon} onDong={() => setHop(null)} onHuy={(lyDo) => { huyHoaDon(hop.hoaDon.ma, lyDo); setHop(null); }} />}
      {hop?.loai === 'thu_no' && <ThuNo no={hop.no} onDong={() => setHop(null)} onThu={(tien, pt) => { thuNo(hop.no.khach.id, tien, pt); setHop(null); }} />}
      {hop?.loai === 'phim_tat' && (
        <Hop tieuDe="Danh sách các phím tắt" onDong={() => setHop(null)}>
          <div className="bhq-bang">
            {[['F1', 'Thêm mới hóa đơn'], ['F2', 'Bật/tắt in tự động'], ['F3', 'Tìm hàng hóa'], ['F4', 'Tìm khách hàng'], ['F8', 'Nhập tiền khách thanh toán'], ['F9', 'Thanh toán'], ['↑ ↓ Enter', 'Chọn hàng trong ô tìm'], ['Esc', 'Đóng']].map(([k, t]) => (
              <div key={k}><span>{t}</span><b className="bhq-phim">{k}</b></div>
            ))}
          </div>
        </Hop>
      )}

      {that && !caMo && manHinh === 'ban' && !hop && !form && (
        <MoCa chiNhanh={chiNhanh} nguoi={nguoi} onVeApp={veApp} onDong={() => moManHinh('ls')}
          onMo={(row) => { setCaMoDs((x) => ({ ...x, [chiNhanh]: row })); nhan(`Đã mở ca ${row.code} · đầu ca ${so(row.opening_cash)}`); }} />
      )}
      {hop?.loai === 'xin_duyet' && (
        <XinDuyet loai={hop.kind} chiNhanh={chiNhanh} payload={hop.payload} onDong={() => setHop(null)}
          onDuoc={(id, ai) => {
            const sau = hop.sau; const kind = hop.kind; setHop(null);
            nhan(`${ai || 'Quản lý'} đã đồng ý`);
            if (kind === 'giam_gia') { sua({ duyetId: id }); hoanTatThat(id); } else if (sau) huyHoaDonThat(sau.h, sau.lyDo, id);
          }} />
      )}
      {hop?.loai === 'viec_cho' && that && (
        <ViecCho viec={viec} cap={that.cap} laKT={laKT} onDong={() => setHop(null)}
          onTaiLai={async () => { const v = await taiViecCho(that.cap, laKT).catch(() => null); if (v) setViec(v); napThat(); }} />
      )}
      {hop?.loai === 'thiet_lap_quay' && that && <ThietLapQuay chiNhanh={chiNhanh} caiDat={cd} matHang={matHang} bangGia={bangGia} onLuu={() => napThat()} onDong={() => setHop(null)} />}
      {hop?.loai === 'dat_coc' && that && (
        <DatCoc hd={hd} tong={tong} chiNhanh={chiNhanh} onDong={() => setHop(null)}
          onXong={({ ma, coc, conLai }) => { setHop(null); baoXong(null, null, `Đã tạo đơn ${ma} ở mục Đơn hàng · cọc ${so(coc)} · còn ${so(conLai)} thu khi lấy bánh`); }} />
      )}
      {hop?.loai === 'lay_banh' && that && (
        <LayBanhDat chiNhanh={chiNhanh} onDong={() => setHop(null)}
          onXong={(don, con) => { setHop(null); nhan(con ? `Đã thu ${so(con)} · ${don.order_code} — giao bánh cho khách` : `${don.order_code} đã trả đủ — giao bánh cho khách`); }} />
      )}
      {hop?.loai === 'nhan_hang' && that && (
        <NhanHang phieu={hop.phieu} matHang={matHang} onDong={() => setHop(null)}
          onNhan={async (nh) => { await goi('pos_nhan_hang', { p_id: hop.phieu.id, p_received: nh, p_note: null }); setHop(null); napThat(); nhan(`Đã nhận hàng ${hop.phieu.ma} — tồn quầy đã cộng`); }} />
      )}
      {hop?.loai === 'nhat_ky' && that && <NhatKy chiNhanh={chiNhanh} onDong={() => setHop(null)} />}
      {that && dienThoai && (!mang || soCho > 0) && <div className="kv-mat-mang" role="status">{mang ? `Đang gửi ${soCho} việc làm lúc mất mạng…` : `Mất mạng — vẫn bán được${soCho ? ` · ${soCho} việc chờ gửi` : ''}`}</div>}
      {bao && (
        <div className="kv-bao" role="status">
          <span>{bao.msg}</span>
          {bao.hoaDon && <button type="button" onClick={() => setBanIn({ ...bao.hoaDon })}>In lại</button>}
        </div>
      )}
      {banIn && createPortal(<div id="bhq-in">{banIn.banGiao ? <NoiDungBanGiao p={banIn.banGiao} /> : banIn.phieu ? <NoiDungPhieu p={banIn.phieu} matHang={matHang} /> : <NoiDungBienLai hd={banIn} />}</div>, document.body)}
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
function TimHang({ matHang, ton, inputRef, onChon, onThemMoi, goiY = 'Tìm hàng hóa (F3)', nhe = false }) {
  const [q, setQ] = useState('');
  const [chon, setChon] = useState(0);
  const [mo, setMo] = useState(false);
  const loc = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return [];
    return locXep(matHang, (m) => `${m.ma} ${m.ten} ${m.size}`, t, 10);
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
    <div className={`kv-tim ${nhe ? 'nhe' : ''}`}>
      <Search size={17} className="ic" aria-hidden="true" />
      <input ref={inputRef} value={q} onChange={(e) => { setQ(e.target.value); setChon(0); setMo(true); }} onKeyDown={onKey}
        onFocus={() => setMo(true)} onBlur={() => setTimeout(() => setMo(false), 150)}
        placeholder={goiY} autoComplete="off" aria-label="Tìm hàng hóa" />
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
          {onThemMoi && <button type="button" className="kv-xo-them" onMouseDown={(e) => e.preventDefault()} onClick={() => { setMo(false); onThemMoi(); }}>+ Thêm mới hàng hóa</button>}
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
  const loc = t ? locXep(ds, (k) => `${k.name} ${k.phone || ''}`, t, 8) : [];
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
  // Như KiotViet: bấm ra ngoài hoặc Esc là đóng ô giá / ghi chú.
  useEffect(() => {
    if (!mo) return undefined;
    const bam = (e) => { if (!e.target.closest('.kv-pop, .kv-dong .gia, .kv-dong .them')) setMo(null); };
    const phim = (e) => { if (e.key === 'Escape') setMo(null); };
    document.addEventListener('mousedown', bam);
    document.addEventListener('keydown', phim);
    return () => { document.removeEventListener('mousedown', bam); document.removeEventListener('keydown', phim); };
  }, [mo]);
  if (!hd.dong.length) return <div className="kv-gio kv-gio-rong" />;
  // Như KiotViet: món mới thêm nằm TRÊN CÙNG, STT lớn nhất ở trên.
  const dsHien = hd.dong.map((d, i) => [d, i]).reverse();
  return (
    <div className="kv-gio">
      {dsHien.map(([d, i]) => {
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
function KhungThanhToan({ hd, tong, bayGio, nguoiBanDs, khachNo, duaRef, onSua, oKhach, onThuKhac, onIn, onXong, onDong, ext }) {
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
        {ext?.bangGia}
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
        {ext?.truocCanTra}
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
        {hd.pt === 'chuyen_khoan' && (ext?.qr || <div className="kv-qr">Mã VietQR {so(tong.canTra)}<small>Bản thật: QR theo tài khoản chi nhánh, có sẵn số tiền + mã hóa đơn để đối chiếu sao kê.</small></div>)}
        {tt.no > 0
          ? <div className="r no"><span>Tính vào công nợ</span><b>{so(tt.no)}</b></div>
          : <div className="r"><span>Tiền thừa trả khách</span><span>{so(tt.thua)}</span></div>}
        {khachNo > 0 && <div className="r nho"><span>Nợ cũ của khách</span><span>{so(khachNo)}</span></div>}
        {tt.loi && <p className="kv-loi">{tt.loi}</p>}
      </div>
      <div className="kv-tt-chan">
        <button type="button" className="kv-nut-in" onClick={onIn}>IN</button>
        <button type="button" className="kv-nut-tt" disabled={!hd.dong.length || !!tt.loi || ext?.dangBan} onClick={onXong}>{ext?.dangBan ? 'ĐANG LƯU…' : 'THANH TOÁN'}</button>
      </div>
    </div>
  );
}

// ĐIỆN THOẠI — theo app KiotViet: (1) "Bán hàng" danh sách hàng, chạm để chọn, có ô − n +,
// đáy "Bỏ chọn | Xong (n)" → (2) giỏ: "× Bán hàng", Khách lẻ ›, Bảng giá chung ›, đáy
// "Tổng tiền hàng (n)" + "Lưu tạm | Thanh toán" → (3) "‹ Thanh toán" … "Hoàn thành".
function DienThoai({
  dtMan, setDtMan, hd, tong, monLoc, ton, slTrongGio, chips, locMo, setLocMo, themMon, datSl, boDong, sua, boChon, luuTam,
  khachNo, chonKhach, onThuKhac, inTamTinh, hoanTat, soHd, onSuaDong, onMoHd, onMenu, onDatHang, onThemHang, onThongTin, hds, onChonHd,
  ext = null, giaCua = (m) => m.gia,
}) {
  const [q, setQ] = useState('');
  const [dsHdMo, setDsHdMo] = useState(false); // danh sách hoá đơn đang mở (lưu tạm) để mở lại
  // Như app KiotViet: bấm "Đặt hàng" trên thanh tròn → cả luồng đổi tên thành "Đặt hàng"
  // (danh sách, giỏ, nút chính). Bấm "Bán hàng" để quay lại.
  const [cheDo, setCheDo] = useState('ban');
  const laDat = cheDo === 'dat';
  const tieuDe = laDat ? 'Đặt hàng' : 'Bán hàng';
  const t = q.trim().toLowerCase();
  const ds = t ? locXep(monLoc, (m) => `${m.ma} ${m.ten} ${m.size}`, t) : monLoc;
  const onTimKey = (e) => {
    if (e.key !== 'Enter') return;
    const m = monLoc.find((x) => x.ma === q.trim().toUpperCase()) || (ds.length === 1 ? ds[0] : null);
    if (m) { themMon(m); setQ(''); }
  };
  const oTim = (
    <div className="kvm-tim">
      <label><Search size={17} /><input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onTimKey} placeholder="Tên, mã hàng, mã vạch, lô" aria-label="Tìm hàng hóa" /></label>
      <button type="button" className="o" aria-label="Thêm hàng hoá mới" onClick={onThemHang}><Plus size={22} /></button>
      <button type="button" className="o" aria-label="Quét mã vạch" onClick={() => document.querySelector('.kvm-tim input')?.focus()}><ScanBarcode size={20} /></button>
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
            {ext?.truocCanTra}
            <div className="r"><span>Khách cần trả</span><b className="xanh">{so(tong.canTra)}</b></div>
            <div className="r"><span>Khách thanh toán</span>
              <input className="kv-gach" inputMode="numeric" value={so(dua)} aria-label="Khách thanh toán" onFocus={(e) => e.target.select()}
                onChange={(e) => sua({ dua: Number(soTien(e.target.value)) || 0 })} /></div>
            <div className="kvm-pt">{Object.entries(PT).map(([k, l]) => <button key={k} type="button" className={hd.pt === k ? 'on' : ''} onClick={() => sua({ pt: k, dua: null })}>{l}</button>)}</div>
            {hd.pt === 'chuyen_khoan' && ext?.qr}
            {tt.no > 0 ? <div className="r no"><span>Tính vào công nợ</span><b>{so(tt.no)}</b></div> : <div className="r"><span>Tiền thừa trả khách</span><span>{so(tt.thua)}</span></div>}
            {tt.loi && <p className="kv-loi">{tt.loi}</p>}
          </div>
          <label className="kvm-the kv-ghi-chu"><Pencil size={16} /><input value={hd.ghiChu} onChange={(e) => sua({ ghiChu: e.target.value })} placeholder="Ghi chú đơn hàng" /></label>
        </div>
        <div className="kvm-chan"><button type="button" className="kv-nut-tt rong" disabled={!!tt.loi || ext?.dangBan} onClick={hoanTat}>{ext?.dangBan ? 'Đang lưu…' : 'Hoàn thành'}</button></div>
      </div>
    );
  }

  if (dtMan === 'gio') {
    return (
      <div className="kvm kvm-gio">
        <div className="kvm-gio-dau">
          <header className="kvm-dau trang"><button type="button" aria-label="Đóng giỏ hàng" onClick={() => setDtMan('chon')}><X size={24} /></button><h1>{tieuDe}</h1>
            <button type="button" className="kvm-ic-tt" aria-label="Thông tin hóa đơn" onClick={onThongTin}><FileText size={24} strokeWidth={1.7} /><Info size={13} strokeWidth={2.4} /></button></header>
          {oTim}
          {t && ds.length > 0 && (
            <div className="kvm-goi-y-ds">{ds.slice(0, 6).map((m) => <button key={m.ma} type="button" className="kvm-goi-y" onClick={() => { themMon(m); setQ(''); }}>{m.ten}{m.size ? ` ${m.size}` : ''}<span className="xanh">{so(giaCua(m))}</span></button>)}</div>
          )}
          <div className="kvm-gio-kh">
            {dongKhach}
            {ext?.bangGia ? <div className="kvm-dong-mo tinh">{ext.bangGia}</div> : <div className="kvm-dong-mo tinh"><Tag size={16} /><span>Bảng giá chung</span><ChevronRight size={20} className="mui" /></div>}
          </div>
        </div>
        <div className="kvm-than">
          <div className="kvm-gio-ds">
            {hd.dong.map((d) => (
              <div key={d.ma} className="kvm-gio-mon">
                <AnhNho m={d} />
                <div className="g">
                  <button type="button" className="t" onClick={() => onSuaDong(d.ma)}>
                    {d.ten}{d.size ? <em className="cam"> {d.size}</em> : null}
                    {d.ghiChu ? <small>{d.ghiChu}</small> : null}
                  </button>
                  <div className="h">
                    <span className="xanh">{so(d.sl ? tienDong(d) / d.sl : d.gia)}</span>
                    <span className="kvm-bac do">
                      <button type="button" aria-label="Giảm 1" onClick={() => (d.sl > 1 ? datSl(d.ma, d.sl - 1) : boDong(d.ma))}><Minus size={18} strokeWidth={1.6} /></button>
                      <span>{d.sl}</span>
                      <button type="button" aria-label="Tăng 1" onClick={() => datSl(d.ma, d.sl + 1)}><Plus size={18} strokeWidth={1.6} /></button>
                    </span>
                  </div>
                </div>
              </div>
            ))}
            {!hd.dong.length && <p className="kv-rong">Chưa có hàng hóa</p>}
          </div>
        </div>
        <div className="kvm-chan kvm-gio-chan">
          <div className="kvm-tong"><span>Tổng tiền hàng <i className="kvm-tron vien">{tong.soMon}</i></span><span>{so(tong.tongHang)}</span></div>
          <div className="kvm-hai">
            <button type="button" className="kvm-nut-vien" disabled={!hd.dong.length} onClick={luuTam}>Lưu tạm</button>
            {laDat
              ? <button type="button" className="kv-nut-tt" disabled={!hd.dong.length} onClick={onDatHang}>Đặt hàng</button>
              : <button type="button" className="kv-nut-tt" disabled={!hd.dong.length} onClick={() => setDtMan('tt')}>Thanh toán</button>}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="kvm">
      <header className="kvm-dau kvm-dau-lon"><h1>{tieuDe}</h1>
        {soHd > 1 && <button type="button" className="kvm-so-hd" aria-expanded={dsHdMo} onClick={() => setDsHdMo((v) => !v)}>{soHd} hóa đơn <ChevronDown size={14} /></button>}
        <button type="button" aria-label="Xem hóa đơn đã bán" onClick={onMoHd}><FileClock size={24} /></button>
      </header>
      <div className="kvm-than">
        {oTim}
        <div className="kvm-loc">
          <button type="button" onClick={chonKhach}><User size={15} />{hd.khach.id ? hd.khach.name : 'Khách lẻ'}</button>
          {ext?.bangGia || <span><Tag size={15} />Bảng giá chung</span>}
          <button type="button" className={`kvm-loc-phai ${locMo ? 'on' : ''}`} aria-label="Lọc theo nhóm hàng" onClick={() => setLocMo((v) => !v)}><ListFilter size={22} /></button>
        </div>
        {dsHdMo && soHd > 1 && (
          <div className="kvm-ds-hd" role="list" aria-label="Hóa đơn đang mở">
            {hds.map((h) => (
              <button key={h.id} type="button" role="listitem" className={h.id === hd.id ? 'on' : ''} onClick={() => { setDsHdMo(false); onChonHd(h.id); }}>
                <span>Hóa đơn {h.so}{h.khach.id ? ` · ${h.khach.name}` : ''}</span>
                <span>{h.dong.length ? `${h.dong.reduce((a, d) => a + d.sl, 0)} món · ${so(h.dong.reduce((a, d) => a + tienDong(d), 0))}` : 'Trống'}</span>
              </button>
            ))}
          </div>
        )}
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
                    <span className="kvm-nhan"><span>{m.ma}</span><i className={(ton[m.ma] ?? 0) <= 0 ? 'het' : ''}>{ton[m.ma] ?? 0}</i>{ext ? ext.hsd(m.ma) : <i>KH đặt: 0</i>}</span>
                    <span className="xanh">{so(giaCua(m))}</span>
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
      {!hd.dong.length && (
        <div className="kvm-pill" role="group" aria-label="Loại giao dịch">
          <button type="button" className={laDat ? 'on' : ''} onClick={() => setCheDo('dat')}>Đặt hàng</button>
          <button type="button" className={laDat ? '' : 'on'} onClick={() => setCheDo('ban')}>Bán hàng</button>
          <button type="button" aria-label="Thêm" onClick={onMenu}><Ellipsis size={22} /></button>
        </div>
      )}
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
  const loc = locXep(ds, (k) => `${k.name} ${k.phone || ''}`, t, 60);
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

// "Thêm hàng hóa" theo KiotViet: Mã hàng (tự sinh nếu để trống) · Tên · Nhóm · Giá bán · Giá vốn · Tồn kho.
function ThemHangHoa({ matHang, laGD, onDong, onLuu }) {
  const [ma, setMa] = useState('');
  const [ten, setTen] = useState('');
  const [nhom, setNhom] = useState(DANH_MUC[0]?.value || 'khac');
  const [gia, setGia] = useState('');
  const [giaVon, setGiaVon] = useState('');
  const [tonDau, setTonDau] = useState('');
  const maSach = ma.trim().toUpperCase();
  const trung = maSach && matHang.some((m) => m.ma === maSach);
  const ok = ten.trim() && Number(gia) > 0 && !trung;
  const luu = () => {
    let maTao = maSach;
    if (!maTao) {
      const lon = matHang.reduce((n, m) => Math.max(n, /^SP\d+$/.test(m.ma) ? Number(m.ma.slice(2)) : 0), 0);
      maTao = `SP${String(lon + 1).padStart(4, '0')}`;
    }
    const gv = Number(giaVon) || Math.round((Number(gia) * 0.35) / 500) * 500;
    onLuu({ id: `moi-${Date.now()}`, ma: maTao, ten: ten.trim(), size: '', gia: Number(gia), giaVon: gv, danhMuc: nhom, anh: null }, Number(tonDau) || 0);
  };
  return (
    <Hop tieuDe="Thêm hàng hóa" onDong={onDong}
      chan={<><button type="button" className="bhq-nut phu" onClick={onDong}>Bỏ qua</button><button type="button" className="bhq-nut chinh" disabled={!ok} onClick={luu}>Lưu</button></>}>
      <label className="bhq-nhan">Mã hàng<input className="bhq-o" value={ma} onChange={(e) => setMa(e.target.value)} placeholder="Mã hàng tự động" autoCapitalize="characters" /></label>
      {trung && <p className="bhq-ghi do">Mã {maSach} đã có, chọn mã khác hoặc để trống.</p>}
      <label className="bhq-nhan">Tên hàng<input className="bhq-o" autoFocus value={ten} onChange={(e) => setTen(e.target.value)} placeholder="Bắt buộc" /></label>
      <label className="bhq-nhan">Nhóm hàng<select className="bhq-o" value={nhom} onChange={(e) => setNhom(e.target.value)}>{DANH_MUC.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}</select></label>
      <label className="bhq-nhan">Giá bán<input className="bhq-o" inputMode="numeric" value={gia ? so(Number(gia)) : ''} onChange={(e) => setGia(soTien(e.target.value))} placeholder="0" /></label>
      {laGD && <label className="bhq-nhan">Giá vốn<input className="bhq-o" inputMode="numeric" value={giaVon ? so(Number(giaVon)) : ''} onChange={(e) => setGiaVon(soTien(e.target.value))} placeholder="Để trống: tạm tính 35% giá bán" /></label>}
      <label className="bhq-nhan">Tồn kho<input className="bhq-o" inputMode="numeric" value={tonDau} onChange={(e) => setTonDau(e.target.value.replace(/\D/g, ''))} placeholder="0" /></label>
      <p className="bhq-ghi">Bản xem thử: hàng mới chỉ có trong phiên này. Bản thật sẽ lưu vào danh mục Sản phẩm của app.</p>
    </Hop>
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

function BienLai({ hd, onDong, onIn }) {
  return (
    <Hop tieuDe={`Hoá đơn ${hd.ma}`} onDong={onDong}
      chan={<><button type="button" className="bhq-nut phu" onClick={onDong}>Đóng</button><button type="button" className="bhq-nut chinh" onClick={onIn}>🖨 In lại</button></>}>
      <div className="bhq-giay"><NoiDungBienLai hd={hd} /></div>
    </Hop>
  );
}

// Biên lai khổ 80mm cho máy in nhiệt ZyWell ZY303 (USB) — theo đúng mẫu hoá đơn quầy đang in từ KiotViet:
// tên tiệm + chi nhánh, địa chỉ, hotline, HÓA ĐƠN BÁN HÀNG, Số HĐ, ngày; khách; bảng Đơn giá · SL · T.Tiền;
// Tổng tiền hàng / Chiết khấu / Tổng thanh toán; số tiền bằng chữ. Địa chỉ + hotline nhập ở "Thiết lập in"
// (lưu trên máy này, không ghi vào mã nguồn). In bằng hộp in trình duyệt — chỉ #bhq-in hiện ra (@media print).
const khoaIn = (cn, k) => `bhq-in-${k}:${cn}`;
function NoiDungBienLai({ hd }) {
  const d = new Date(hd.luc);
  const diaChi = docLuu(khoaIn(hd.chiNhanh, 'dia-chi'), '');
  const hotline = docLuu(khoaIn(hd.chiNhanh, 'hotline'), '');
  const tongGoc = hd.dong.reduce((s2, x) => s2 + x.gia * x.sl, 0); // cột T.Tiền = đơn giá × SL như mẫu KiotViet
  const chietKhau = tongGoc - (hd.tongHang || 0) + (hd.giamHd || 0); // giảm từng món + giảm cả đơn
  return (
    <div className="bl">
      <div className="bl-ten">SUMIBAKERY - CN {String(hd.chiNhanh || '').toUpperCase()}</div>
      <div className="bl-nho">Địa chỉ: {diaChi}</div>
      <div className="bl-nho">Hotline: {hotline}</div>
      <div className="bl-c bl-tieu"><b>{hd.tamTinh ? 'PHIẾU TẠM TÍNH' : 'HÓA ĐƠN BÁN HÀNG'}</b>
        {!hd.tamTinh && <div>Số HĐ: {hd.ma}</div>}
        <div>Ngày {String(d.getDate()).padStart(2, '0')} tháng {String(d.getMonth() + 1).padStart(2, '0')} năm {d.getFullYear()}</div></div>
      <div className="bl-kh">
        <div>Khách hàng: {hd.khach?.name || 'Khách lẻ'}</div>
        <div>SĐT: {hd.khach?.phone || ''}</div>
        <div>Địa chỉ: - -</div>
        <div className="bl-ghi">Ghi chú: : {hd.ghiChu || ''}</div>
      </div>
      <div className="bl-bang">
        <div className="bl-cot dau"><span>Đơn giá</span><span>SL</span><span>T.Tiền</span></div>
        {hd.dong.map((x) => (
          <div key={x.ma} className="bl-mon">
            <div>{x.ten}{x.size ? ` ${x.size}` : ''}{x.ghiChu ? ` (${x.ghiChu})` : ''}</div>
            <div className="bl-cot"><span>{so(x.gia)}</span><span>{so(x.sl)}</span><span>{so(x.gia * x.sl)}</span></div>
          </div>
        ))}
      </div>
      <div className="bl-tong">
        <div><span>Tổng tiền hàng:</span><b>{so(tongGoc)}</b></div>
        <div><span>Chiết khấu :</span><b>{so(chietKhau)}</b></div>
        {(hd.thuKhacDong || []).map((t, i) => <div key={i}><span>{t.ten}:</span><b>{so(t.tien)}</b></div>)}
        {hd.vat > 0 && <div><span>VAT 8%:</span><b>{so(hd.vat)}</b></div>}
        <div><span>Tổng thanh toán:</span><b>{so(hd.canTra)}</b></div>
        {hd.no > 0 && <div><span>Còn nợ:</span><b>{so(hd.no)}</b></div>}
      </div>
      <div className="bl-chu">({docSoTien(hd.canTra)})</div>
      <div className="bl-c bl-cam">{hd.tamTinh ? 'Phiếu tạm tính — chưa thanh toán' : 'Cảm ơn và hẹn gặp lại!'}</div>
    </div>
  );
}

function ThietLapIn({ chiNhanh, inTuDong, doiInTuDong, onDong }) {
  const [diaChi, setDiaChi] = useState(() => docLuu(khoaIn(chiNhanh, 'dia-chi'), ''));
  const [hotline, setHotline] = useState(() => docLuu(khoaIn(chiNhanh, 'hotline'), ''));
  const luu = () => { ghiLuu(khoaIn(chiNhanh, 'dia-chi'), diaChi.trim()); ghiLuu(khoaIn(chiNhanh, 'hotline'), hotline.trim()); onDong(); };
  return (
    <Hop tieuDe="Thiết lập in" onDong={onDong} chan={<button type="button" className="bhq-nut chinh" onClick={luu}>Xong</button>}>
      <label className="kv-cong-tac"><span>In tự động sau khi thanh toán (F2)</span><input type="checkbox" checked={inTuDong} onChange={doiInTuDong} /><i /></label>
      <p className="bhq-ghi">Thông tin in trên đầu hoá đơn — chi nhánh {chiNhanh}:</p>
      <label className="bhq-nhan">Địa chỉ<input className="bhq-o" value={diaChi} onChange={(e) => setDiaChi(e.target.value)} placeholder="Số nhà, đường, phường, thành phố" /></label>
      <label className="bhq-nhan">Hotline<input className="bhq-o" inputMode="tel" value={hotline} onChange={(e) => setHotline(e.target.value)} placeholder="Số điện thoại in trên hoá đơn" /></label>
      <p className="bhq-ghi">Máy in hóa đơn: ZyWell ZY303 · khổ 80mm · cắm USB. Địa chỉ + hotline chỉ lưu trên máy này.</p>
    </Hop>
  );
}

// ===== KHO — bản sao các màn kho KiotViet tiệm đang dùng =====
// Danh sách hàng hóa (Thông tin / Thẻ kho / Tồn kho) · Nhập hàng (PN) · Xuất hủy (XH) ·
// Xuất dùng nội bộ (XD) · Kiểm kho (KK). Mỗi danh sách: lọc trạng thái bên trái, bảng
// bên phải, bấm 1 dòng để mở chi tiết; "+ Tạo" mở màn lập phiếu toàn trang (bảng hàng
// bên trái, thông tin phiếu bên phải, "Lưu tạm" / "Hoàn thành") y như KiotViet.
const TRANG_THAI = { tam: 'Phiếu tạm', cho: 'Chờ quầy nhận', xong: 'Hoàn thành', huy: 'Đã hủy' };
const TEN_XONG = { giao: 'Đã nhập hàng', huy: 'Hoàn thành', noibo: 'Hoàn thành', kiem: 'Đã cân bằng kho', chuyen: 'Đã nhận' };
const trangThaiCua = (p) => (p.trangThai === 'xong' ? TEN_XONG[p.loai] : TRANG_THAI[p.trangThai]);
const KIEU_PHIEU = {
  giao: { tieuDe: 'Nhập hàng', ma: 'Mã nhập hàng', tim: 'Theo mã phiếu nhập', nguoi: 'Người nhập', ngay: 'Ngày nhập', sl: 'Số lượng' },
  huy: { tieuDe: 'Xuất hủy', ma: 'Mã xuất hủy', tim: 'Theo mã xuất hủy', nguoi: 'Người xuất hủy', ngay: 'Ngày xuất hủy', sl: 'SL hủy' },
  noibo: { tieuDe: 'Xuất dùng nội bộ', ma: 'Mã xuất dùng nội bộ', tim: 'Theo mã xuất dùng nội bộ', nguoi: 'Người xuất', ngay: 'Ngày xuất', sl: 'SL xuất' },
  kiem: { tieuDe: 'Phiếu kiểm kho', ma: 'Mã kiểm kho', tim: 'Theo mã phiếu kiểm', nguoi: 'Người kiểm', ngay: 'Ngày cân bằng', sl: 'Thực tế' },
  chuyen: { tieuDe: 'Chuyển hàng', ma: 'Mã chuyển hàng', tim: 'Theo mã phiếu chuyển', nguoi: 'Người chuyển', ngay: 'Ngày chuyển', sl: 'SL chuyển' },
};
const MAN_LOAI = { pn: 'giao', xh: 'huy', xd: 'noibo', kk: 'kiem', ch: 'chuyen' };
const MOI_TRANG_QL = 15;
const tenHang = (m) => (m ? `${m.ten}${m.size ? ` - ${m.size}` : ''}` : '');

// Số liệu 1 phiếu: tổng SL, tổng giá trị (theo giá vốn), và với kiểm kho: tồn trước / lệch.
function soLieuPhieu(p, matHang, ton) {
  const tim = (ma) => matHang.find((m) => m.ma === ma);
  const dong = p.dong.map((d) => {
    const m = tim(d.ma);
    const giaVon = m?.giaVon || 0;
    if (p.loai !== 'kiem') return { ...d, m, giaVon, giaTri: (Number(d.sl) || 0) * giaVon };
    const tonTruoc = p.trangThai === 'xong' && p.lech ? (Number(d.sl) || 0) - (p.lech[d.ma] ?? 0) : (ton[d.ma] ?? 0);
    const lech = d.sl == null || d.sl === '' ? null : Number(d.sl) - tonTruoc;
    return { ...d, m, giaVon, tonTruoc, lech, giaTri: (lech || 0) * giaVon };
  });
  const tongSl = dong.reduce((s, d) => s + (Number(d.sl) || 0), 0);
  const tongGt = dong.reduce((s, d) => s + d.giaTri, 0);
  const tang = dong.reduce((s, d) => s + (d.lech > 0 ? d.lech : 0), 0);
  const giam = dong.reduce((s, d) => s + (d.lech < 0 ? d.lech : 0), 0);
  return { dong, tongSl, tongGt, tang, giam };
}

function PhanTrang({ trang, soDong, setTrang, donVi }) {
  const soTrang = Math.max(Math.ceil(soDong / MOI_TRANG_QL), 1);
  const t = Math.min(trang, soTrang - 1);
  return (
    <div className="kq-trang">
      <span>Hiển thị {MOI_TRANG_QL} dòng</span>
      <button type="button" aria-label="Trang trước" disabled={t === 0} onClick={() => setTrang(t - 1)}><ChevronLeft size={18} /></button>
      <b>{t + 1}</b>
      <button type="button" aria-label="Trang sau" disabled={t >= soTrang - 1} onClick={() => setTrang(t + 1)}><ChevronRight size={18} /></button>
      <span>{soDong ? `${t * MOI_TRANG_QL + 1} - ${Math.min((t + 1) * MOI_TRANG_QL, soDong)} trong ${soDong} ${donVi}` : `0 ${donVi}`}</span>
    </div>
  );
}

function KhongCo({ chu }) {
  return (
    <div className="kq-rong">
      <span className="hop"><ReceiptText size={34} /></span>
      <b>Không tìm thấy kết quả</b>
      <span>{chu}</span>
    </div>
  );
}

// ----- Danh sách hàng hóa -----
function QlHangHoa({ matHang, tonCN, chiNhanh, theKho, dienThoai, laGD, onThem, onMoMan }) {
  const ton = tonCN[chiNhanh] || {};
  const [q, setQ] = useState('');
  const [nhom, setNhom] = useState('all');
  const [locTon, setLocTon] = useState('all');
  const [mo, setMo] = useState(null);
  const [tab, setTab] = useState('tt');
  const [trang, setTrang] = useState(0);
  const dmCo = DANH_MUC.filter((d) => matHang.some((m) => m.danhMuc === d.value));
  const t = q.trim().toLowerCase();
  const ds = matHang.filter((m) => khop(`${m.ma} ${m.ten} ${m.size}`, t)
    && (nhom === 'all' || m.danhMuc === nhom)
    && (locTon === 'all' || (locTon === 'con' ? (ton[m.ma] ?? 0) > 0 : locTon === 'het' ? (ton[m.ma] ?? 0) === 0 : (ton[m.ma] ?? 0) < 0)));
  const tongTon = ds.reduce((s, m) => s + (ton[m.ma] ?? 0), 0);
  const tr = Math.min(trang, Math.max(Math.ceil(ds.length / MOI_TRANG_QL), 1) - 1);
  const tenNhom = (v) => DANH_MUC.find((d) => d.value === v)?.label || 'Khác';
  if (dienThoai) return <HangHoaDt laGD={laGD} matHang={matHang} ds={ds} ton={ton} tonCN={tonCN} chiNhanh={chiNhanh} theKho={theKho} tenNhom={tenNhom} dmCo={dmCo} onThem={onThem} onMoMan={onMoMan}
    q={q} setQ={setQ} nhom={nhom} setNhom={setNhom} locTon={locTon} setLocTon={setLocTon} tongTon={tongTon} />;
  return (
    <main className="kq">
      <div className="kq-dau">
        <h1>Hàng hóa</h1>
        <label className="kq-tim"><Search size={17} /><input value={q} onChange={(e) => { setQ(e.target.value); setTrang(0); }} placeholder="Theo mã, tên hàng" /></label>
        <button type="button" className="bhq-nut chinh kq-them" onClick={onThem}><Plus size={16} /> Tạo mới</button>
      </div>
      <div className="kq-than">
        <aside className="kq-loc">
          <div className="kq-hop-loc"><b>Nhóm hàng</b>
            <select value={nhom} onChange={(e) => { setNhom(e.target.value); setTrang(0); }}>
              <option value="all">Chọn nhóm hàng</option>{dmCo.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
            </select></div>
          <div className="kq-hop-loc"><b>Tồn kho</b>
            <select value={locTon} onChange={(e) => { setLocTon(e.target.value); setTrang(0); }}>
              <option value="all">Tất cả</option><option value="con">Còn hàng trong kho</option><option value="het">Hết hàng trong kho</option><option value="am">Tồn âm (cần kiểm kho)</option>
            </select></div>
        </aside>
        <section className="kq-bang">
          <div className="kq-cuon">
            <table>
              <thead><tr><th className="anh" /><th>Mã hàng</th><th>Tên hàng</th><th className="so">Giá bán</th>{laGD && <th className="so">Giá vốn</th>}<th className="so">Tồn kho</th><th className="so">Khách đặt</th></tr></thead>
              <tbody>
                <tr className="tong"><td /><td /><td /><td />{laGD && <td />}<td className="so">{so(tongTon)}</td><td className="so">0</td></tr>
                {ds.slice(tr * MOI_TRANG_QL, (tr + 1) * MOI_TRANG_QL).map((m) => (
                  <React.Fragment key={m.ma}>
                    <tr className={mo === m.ma ? 'dang-mo' : ''} onClick={() => { setMo(mo === m.ma ? null : m.ma); setTab('tt'); }}>
                      <td className="anh"><AnhNho m={m} nho /></td><td>{m.ma}</td><td>{tenHang(m)}</td>
                      <td className="so">{so(m.gia)}</td>{laGD && <td className="so">{so(m.giaVon)}</td>}
                      <td className={`so ${(ton[m.ma] ?? 0) < 0 ? 'am' : ''}`}>{so(ton[m.ma] ?? 0)}</td><td className="so">0</td>
                    </tr>
                    {mo === m.ma && (
                      <tr className="kq-mo"><td colSpan={laGD ? 7 : 6}>
                        <div className="kq-ct">
                          <nav className="kq-ct-tab">
                            {[['tt', 'Thông tin'], ['the', 'Thẻ kho'], ['ton', 'Tồn kho']].map(([k, l]) => <button key={k} type="button" className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}
                          </nav>
                          {tab === 'tt' && (
                            <div className="kq-hh">
                              <span className="kq-hh-anh"><AnhNho m={m} /></span>
                              <div className="kq-hh-than">
                                <h3>{tenHang(m)}</h3>
                                <p>Nhóm hàng: {tenNhom(m.danhMuc)}</p>
                                <p className="kq-the-nho"><i>Hàng hóa thường</i><i>Bán trực tiếp</i></p>
                                <div className="kq-luoi-tt">
                                  <div><small>Mã hàng</small><span>{m.ma}</span></div>
                                  <div><small>Mã vạch</small><span className="mo">Chưa có</span></div>
                                  <div><small>Tồn kho</small><span>{so(ton[m.ma] ?? 0)}</span></div>
                                  <div><small>Định mức tồn</small><span>0 - 999,999,999</span></div>
                                  {laGD && <div><small>Giá vốn</small><span>{so(m.giaVon)}</span></div>}
                                  <div><small>Giá bán</small><span>{so(m.gia)}</span></div>
                                </div>
                              </div>
                            </div>
                          )}
                          {tab === 'the' && (
                            <div className="kq-cuon"><table className="phu">
                              <thead><tr><th>Chứng từ</th><th>Thời gian</th><th>Loại giao dịch</th>{laGD && <th className="so">Giá vốn</th>}<th className="so">Số lượng</th><th className="so">Tồn cuối</th><th>Người thực hiện</th></tr></thead>
                              <tbody>
                                {theKho.filter((x) => x.ma === m.ma).map((x, i) => (
                                  <tr key={i}><td className="xanh">{x.chungTu}</td><td>{ngayDayDu(x.luc)}</td><td>{x.loai}</td>{laGD && <td className="so">{so(m.giaVon)}</td>}
                                    <td className={`so ${x.sl < 0 ? 'am' : ''}`}>{x.sl > 0 ? so(x.sl) : `-${so(-x.sl)}`}</td><td className="so">{so(x.tonCuoi)}</td><td>{x.nguoi}</td></tr>
                                ))}
                                {!theKho.some((x) => x.ma === m.ma) && <tr><td colSpan={7} className="mo">Chưa có giao dịch nào trong phiên xem trước này.</td></tr>}
                              </tbody>
                            </table></div>
                          )}
                          {tab === 'ton' && (
                            <div className="kq-cuon"><table className="phu">
                              <thead><tr><th>Chi nhánh</th><th className="so">Tồn kho</th><th className="so">KH đặt</th><th>Trạng thái</th></tr></thead>
                              <tbody>{CHI_NHANH.map((cn) => <tr key={cn} className={cn === chiNhanh ? 'dam' : ''}><td>{cn}</td><td className="so">{so(tonCN[cn]?.[m.ma] ?? 0)}</td><td className="so">0</td><td>Đang kinh doanh</td></tr>)}</tbody>
                            </table></div>
                          )}
                          <div className="kq-ct-chan"><span className="mo">Thêm / sửa hàng hóa, giá bán: Giám đốc làm trong mục Sản phẩm của app.</span></div>
                        </div>
                      </td></tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
            {!ds.length && <KhongCo chu="Không tìm thấy hàng hóa nào phù hợp." />}
          </div>
          <PhanTrang trang={tr} soDong={ds.length} setTrang={setTrang} donVi="hàng hóa" />
        </section>
      </div>
    </main>
  );
}

// Hàng hoá trên điện thoại — như app KiotViet: tiêu đề + 🔍 + ⇅ · [lọc] [Tất cả loại hàng ▾] [Giá bán ▾]
// · Tổng tồn / N hàng hoá · mỗi dòng: ảnh, tên, mã | giá, "Tồn: x". Bấm vào → chi tiết.
function HangHoaDt({ laGD, matHang, ds, ton, tonCN, chiNhanh, theKho, tenNhom, dmCo, onThem, onMoMan, q, setQ, nhom, setNhom, locTon, setLocTon, tongTon }) {
  const [timMo, setTimMo] = useState(false);
  const [locMo, setLocMo] = useState(false);
  const [xepTen, setXepTen] = useState(false);
  const [loaiGia, setLoaiGia] = useState('ban');
  const [mo, setMo] = useState(null);
  const [baCham, setBaCham] = useState(false);
  const m = matHang.find((x) => x.ma === mo);
  if (m) {
    const the = theKho.filter((x) => x.ma === m.ma);
    return (
      <div className="kvm kvm-phu kvm-hd">
        <header className="kvm-dau trang"><button type="button" aria-label="Quay lại" onClick={() => setMo(null)}><ChevronLeft size={22} /></button><h1>{tenHang(m)}</h1></header>
        <div className="kvm-than">
          <div className="kvm-the kvm-hh-ct">
            <span className="kq-hh-anh"><AnhNho m={m} /></span>
            <h2>{tenHang(m)}</h2>
            <p className="mo">{m.ma} · {tenNhom(m.danhMuc)}</p>
            <div className="r"><span>Giá bán</span><b className="xanh">{so(m.gia)}</b></div>
            {laGD && <div className="r"><span>Giá vốn</span><span>{so(m.giaVon)}</span></div>}
            <div className="r"><span>Tồn kho</span><b className={(ton[m.ma] ?? 0) < 0 ? 'do' : ''}>{so(ton[m.ma] ?? 0)}</b></div>
            <div className="r"><span>Khách đặt</span><span>0</span></div>
          </div>
          <div className="kvm-the"><h2>Tồn theo chi nhánh</h2>
            {CHI_NHANH.map((cn) => <div key={cn} className="r"><span>{cn}{cn === chiNhanh ? ' (đang xem)' : ''}</span><b>{so(tonCN[cn]?.[m.ma] ?? 0)}</b></div>)}
          </div>
          <div className="kvm-the"><h2>Thẻ kho</h2>
            {the.map((x, i) => (
              <div key={i} className="kvm-the-kho"><span className="r"><b>{x.chungTu}</b><b className={x.sl < 0 ? 'do' : 'xanh'}>{x.sl > 0 ? `+${so(x.sl)}` : `-${so(-x.sl)}`}</b></span>
                <span className="r mo"><span>{x.loai} · {ngayDayDu(x.luc)}</span><span>Tồn: {so(x.tonCuoi)}</span></span></div>
            ))}
            {!the.length && <p className="mo">Chưa có giao dịch nào trong phiên xem trước này.</p>}
          </div>
          <p className="mo kvm-ghi-nho">Bản xem thử: hàng thêm mới chỉ nằm trong phiên này, chưa lưu vào hệ thống.</p>
        </div>
      </div>
    );
  }
  const hien = xepTen ? [...ds].sort((a, b) => tenHang(a).localeCompare(tenHang(b), 'vi')) : ds;
  return (
    <main className="kvm-ds-hd kvm-trang-ql kvm-hh-trang">
      <div className="kvm-hh-dau">
      <header className="kvm-dau kvm-dau-lon"><h1>Hàng hoá</h1>
        <button type="button" aria-label="Tìm hàng hóa" className={timMo ? 'on' : ''} onClick={() => { setTimMo((v) => !v); if (timMo) setQ(''); }}><Search size={24} /></button>
        <button type="button" aria-label={xepTen ? 'Đang xếp theo tên' : 'Đang xếp mặc định'} className={xepTen ? 'on' : ''} onClick={() => setXepTen((v) => !v)}><ArrowDownUp size={24} /></button>
        <button type="button" aria-label="Thêm thao tác" className={baCham ? 'on' : ''} onClick={() => setBaCham((v) => !v)}><Ellipsis size={24} /></button>
      </header>
      {baCham && (
        <div className="kvm-ba-cham" onClick={() => setBaCham(false)}>
          <div onClick={(e) => e.stopPropagation()}>
            {[['them', 'Thêm hàng hóa', Plus], ['pn', 'Nhập hàng', Download], ['kk', 'Kiểm kho', ClipboardCheck], ['ch', 'Chuyển hàng', Truck]].map(([k, l, Ic]) => (
              <button key={k} type="button" onClick={() => { setBaCham(false); if (k === 'them') onThem(); else onMoMan?.(k); }}><Ic size={20} />{l}</button>
            ))}
          </div>
        </div>
      )}
      {timMo && <div className="kvm-tim"><label><Search size={17} /><input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tên, mã hàng" /></label></div>}
      <div className="kvm-loc-hd">
        <button type="button" className={`kvm-loc-ic ${locMo ? 'on' : ''}`} aria-label="Lọc tồn kho" onClick={() => setLocMo((v) => !v)}><ListFilter size={22} /></button>
        <label className="kvm-ky xam"><select value={nhom} onChange={(e) => setNhom(e.target.value)} aria-label="Loại hàng"><option value="all">Tất cả loại hàng</option>{dmCo.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}</select><ChevronDown size={16} /></label>
        {laGD && <label className="kvm-ky xam"><select value={loaiGia} onChange={(e) => setLoaiGia(e.target.value)} aria-label="Hiện giá"><option value="ban">Giá bán</option><option value="von">Giá vốn</option></select><ChevronDown size={16} /></label>}
      </div>
      {locMo && (
        <div className="kvm-loc">
          {[['all', 'Tất cả'], ['con', 'Còn hàng'], ['het', 'Hết hàng'], ['am', 'Tồn âm']].map(([k, l]) => <button key={k} type="button" className={locTon === k ? 'on' : ''} onClick={() => setLocTon(k)}>{l}</button>)}
        </div>
      )}
      {laGD ? <div className="kvm-tong-ql"><div><b>Tổng tồn</b><small>{so(ds.length)} hàng hoá</small></div><b>{so(tongTon)}</b></div> : <div className="kvm-khe" />}
      </div>
      <section className="kvm-hh-ds">
        {hien.map((x) => (
          <button key={x.ma} type="button" className="kvm-hh-dong" onClick={() => setMo(x.ma)}>
            <AnhNho m={x} />
            <span className="t"><span>{tenHang(x)}</span><small>{x.ma}</small></span>
            <span className="p"><span>{so(laGD && loaiGia === 'von' ? x.giaVon : x.gia)}</span><small className={(ton[x.ma] ?? 0) < 0 ? 'do' : ''}>Tồn: {so(ton[x.ma] ?? 0)}</small></span>
          </button>
        ))}
        {!ds.length && <KhongCo chu="Không tìm thấy hàng hóa nào phù hợp." />}
      </section>
      <button type="button" className="kvm-fab" aria-label="Thêm hàng hoá mới" onClick={onThem}><Plus size={28} /></button>
    </main>
  );
}

// ----- Danh sách phiếu (Nhập hàng / Xuất hủy / Xuất dùng nội bộ / Kiểm kho) -----
function QlPhieu({ loai, ds, matHang, ton, onTao, onMo, onSaoChep, onHuy, onIn, dienThoai, onNhan = null }) {
  const K = KIEU_PHIEU[loai];
  const [q, setQ] = useState('');
  const [loc, setLoc] = useState({ tam: true, cho: true, xong: true, huy: false });
  const [loaiXuat, setLoaiXuat] = useState('');
  const [mo, setMo] = useState(null);
  const [trang, setTrang] = useState(0);
  const t = q.trim().toLowerCase();
  const loc2 = ds.filter((p) => loc[p.trangThai] && khop(p.ma, t) && (!loaiXuat || p.loaiXuat === loaiXuat));
  const tr = Math.min(trang, Math.max(Math.ceil(loc2.length / MOI_TRANG_QL), 1) - 1);
  const soCot = { giao: 6, huy: 6, noibo: 7, kiem: 8, chuyen: 7 }[loai];
  const tenTao = loai === 'kiem' ? 'Kiểm kho' : LOAI_PHIEU[loai].ten;
  // Điện thoại: mỗi phiếu là 1 thẻ như app KiotViet (không bảng vuốt ngang).
  if (dienThoai) {
    return (
      <main className="kvm-ds-hd kvm-trang-ql">
        <div className="kvm-tim"><label><Search size={17} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder={K.tim} /></label></div>
        <div className="kvm-loc">
          {[['tam', 'Phiếu tạm'], ['xong', TEN_XONG[loai]], ['huy', 'Đã hủy']].map(([k, l]) => <button key={k} type="button" className={loc[k] ? 'on' : ''} onClick={() => setLoc((x) => ({ ...x, [k]: !x[k] }))}>{l}</button>)}
        </div>
        <section className="kvm-hd-ds">
          {loc2.map((p) => {
            const sl = soLieuPhieu(p, matHang, ton);
            return (
              <React.Fragment key={p.ma}>
                <button type="button" className={`kvm-hd-dong ${p.trangThai === 'huy' ? 'huy' : ''}`} onClick={() => setMo(mo === p.ma ? null : p.ma)}>
                  <span className="r1"><b>{p.ma}</b><b>{loai === 'kiem' ? `Lệch ${so(sl.tang - sl.giam)}` : `${so(sl.tongSl)} món`}</b></span>
                  <span className="r2"><span>{ngayDayDu(p.luc)}{p.nguoi ? ` • ${p.nguoi}` : ''}</span><span className={`kq-tt ${p.trangThai}`}>{trangThaiCua(p)}</span></span>
                  {p.loai === 'chuyen' && p.denCN && <span className="r3">{p.chiNhanh} → <b>{p.denCN}</b></span>}
                  {p.loai === 'noibo' && p.loaiXuat && <span className="r3">{p.loaiXuat}</span>}
                  {p.ghiChu && <span className="r3">{p.ghiChu}</span>}
                </button>
                {mo === p.ma && <div className="kvm-phieu-ct"><ChiTietPhieu p={p} sl={sl} onMo={() => onMo(p)} onSaoChep={() => onSaoChep(p)} onHuy={() => onHuy(p)} onIn={() => onIn(p)} onNhan={onNhan && p.trangThai === 'cho' ? () => onNhan(p) : null} /></div>}
              </React.Fragment>
            );
          })}
          {!loc2.length && <KhongCo chu={ds.length ? 'Không có phiếu nào khớp bộ lọc.' : `Chưa có phiếu ${K.tieuDe.toLowerCase()} nào. Bấm + để tạo.`} />}
        </section>
        <button type="button" className="kvm-fab" aria-label={`Tạo ${tenTao}`} onClick={onTao}><Plus size={28} /></button>
      </main>
    );
  }
  return (
    <main className="kq">
      <div className="kq-dau">
        <h1>{K.tieuDe}</h1>
        <label className="kq-tim"><Search size={17} /><input value={q} onChange={(e) => { setQ(e.target.value); setTrang(0); }} placeholder={K.tim} /></label>
        <button type="button" className="kq-nut-tao" onClick={onTao}><Plus size={18} />{loai === 'kiem' ? 'Kiểm kho' : LOAI_PHIEU[loai].ten}</button>
      </div>
      <div className="kq-than">
        <aside className="kq-loc">
          <div className="kq-hop-loc"><b>Trạng thái</b>
            {[['tam', 'Phiếu tạm'], ['xong', TEN_XONG[loai]], ['huy', 'Đã hủy']].map(([k, l]) => (
              <label key={k} className="kq-chk"><input type="checkbox" checked={loc[k]} onChange={() => { setLoc((x) => ({ ...x, [k]: !x[k] })); setTrang(0); }} /><i />{l}</label>
            ))}
          </div>
          <div className="kq-hop-loc"><b>Thời gian</b><span className="kq-gia-tri">Gần đây</span></div>
          {loai === 'noibo' && (
            <div className="kq-hop-loc"><b>Loại xuất</b>
              <select value={loaiXuat} onChange={(e) => { setLoaiXuat(e.target.value); setTrang(0); }}>
                <option value="">Chọn loại xuất</option>{LOAI_NOI_BO.map((l) => <option key={l}>{l}</option>)}
              </select></div>
          )}
        </aside>
        <section className="kq-bang">
          <div className="kq-cuon">
            <table>
              <thead><tr>
                <th>{K.ma}</th>
                {loai === 'noibo' && <th>Loại xuất</th>}
                {loai === 'kiem' ? <><th>Thời gian</th><th className="so">Tổng thực tế</th><th className="so">Tổng chênh lệch</th><th className="so">SL lệch tăng</th><th className="so">SL lệch giảm</th></>
                  : loai === 'giao' ? <><th>Thời gian</th><th>Nguồn hàng</th><th className="so">Tổng số lượng</th></>
                    : loai === 'chuyen' ? <><th>Thời gian</th><th>Từ chi nhánh</th><th>Tới chi nhánh</th><th className="so">Tổng số lượng</th></>
                    : <><th className="so gv">{loai === 'huy' ? 'Tổng giá trị hủy' : 'Tổng giá trị'}</th><th>Thời gian</th></>}
                {loai !== 'kiem' && <th>Ghi chú</th>}
                <th>Trạng thái</th>
              </tr></thead>
              <tbody>
                {loc2.slice(tr * MOI_TRANG_QL, (tr + 1) * MOI_TRANG_QL).map((p) => {
                  const sl = soLieuPhieu(p, matHang, ton);
                  return (
                    <React.Fragment key={p.ma}>
                      <tr className={`${mo === p.ma ? 'dang-mo' : ''} ${p.trangThai === 'huy' ? 'da-huy' : ''}`} onClick={() => setMo(mo === p.ma ? null : p.ma)}>
                        <td>{p.ma}</td>
                        {loai === 'noibo' && <td>{p.loaiXuat}</td>}
                        {loai === 'kiem' ? <><td>{ngayDayDu(p.luc)}</td><td className="so">{so(sl.tongSl)}</td><td className="so gv">{so(sl.tongGt)}</td><td className="so">{so(sl.tang)}</td><td className="so">{so(sl.giam)}</td></>
                          : loai === 'giao' ? <><td>{ngayDayDu(p.luc)}</td><td>{p.nguon || 'Bếp'}</td><td className="so">{so(sl.tongSl)}</td></>
                            : loai === 'chuyen' ? <><td>{ngayDayDu(p.luc)}</td><td>{p.chiNhanh}</td><td>{p.denCN}</td><td className="so">{so(sl.tongSl)}</td></>
                            : <><td className="so gv">{so(sl.tongGt)}</td><td>{ngayDayDu(p.luc)}</td></>}
                        {loai !== 'kiem' && <td className="ghi">{p.ghiChu}</td>}
                        <td><span className={`kq-tt ${p.trangThai}`}>{trangThaiCua(p)}</span></td>
                      </tr>
                      {mo === p.ma && (
                        <tr className="kq-mo"><td colSpan={soCot}>
                          <ChiTietPhieu p={p} sl={sl} onMo={() => onMo(p)} onSaoChep={() => onSaoChep(p)} onHuy={() => onHuy(p)} onIn={() => onIn(p)} onNhan={onNhan && p.trangThai === 'cho' ? () => onNhan(p) : null} />
                        </td></tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
            {!loc2.length && <KhongCo chu={ds.length ? 'Không có phiếu nào khớp bộ lọc.' : `Chưa có phiếu ${K.tieuDe.toLowerCase()} nào. Nhấn "+ ${loai === 'kiem' ? 'Kiểm kho' : LOAI_PHIEU[loai].ten}" để tạo.`} />}
          </div>
          <PhanTrang trang={tr} soDong={loc2.length} setTrang={setTrang} donVi="phiếu" />
        </section>
      </div>
    </main>
  );
}

function ChiTietPhieu({ p, sl, onMo, onSaoChep, onHuy, onIn, onNhan = null }) {
  const K = KIEU_PHIEU[p.loai];
  const kiem = p.loai === 'kiem';
  return (
    <div className="kq-ct">
      <nav className="kq-ct-tab"><button type="button" className="on">Thông tin</button></nav>
      <div className="kq-ct-dau"><b>{p.ma}</b><span className={`kq-tt ${p.trangThai}`}>{trangThaiCua(p)}</span><span className="cn">{p.chiNhanh}</span></div>
      <div className="kq-ct-tt">
        <div><small>Người tạo:</small><span>{p.nguoi}</span></div>
        <div><small>{K.nguoi}:</small><span>{p.nguoiThucHien || p.nguoi}</span></div>
        <div><small>{K.ngay}:</small><span>{ngayDayDu(p.lucXong || p.luc)}</span></div>
        {p.loai === 'giao' && <div><small>Nguồn hàng:</small><span>{p.nguon || 'Bếp'}</span></div>}
        {p.loai === 'noibo' && <div><small>Loại xuất:</small><span>{p.loaiXuat}</span></div>}
        {p.loai === 'noibo' && p.nguoiNhan && <div><small>Người nhận:</small><span>{p.nguoiNhan}</span></div>}
        {p.denCN && <div><small>Chuyển đến:</small><span className="xanh">{p.denCN}</span></div>}
      </div>
      <div className="kq-cuon"><table className="phu">
        <thead><tr><th>Mã hàng</th><th>Tên hàng</th>
          {kiem ? <><th className="so">Tồn kho</th><th className="so">Thực tế</th><th className="so">SL lệch</th><th className="so gv">Giá trị lệch</th></>
            : <><th className="so">{K.sl}</th><th className="so gv">Giá vốn</th><th className="so gv">{p.loai === 'giao' ? 'Thành tiền' : p.loai === 'huy' ? 'Giá trị hủy' : 'Giá trị xuất'}</th></>}
        </tr></thead>
        <tbody>
          {sl.dong.map((d) => (
            <tr key={d.ma}><td className="xanh">{d.ma}</td><td>{tenHang(d.m)}</td>
              {kiem ? <><td className="so">{so(d.tonTruoc)}</td><td className="so">{d.sl == null || d.sl === '' ? '—' : so(d.sl)}</td><td className={`so ${d.lech < 0 ? 'am' : ''}`}>{d.lech == null ? '—' : so(d.lech)}</td><td className="so gv">{so(d.giaTri)}</td></>
                : <><td className="so">{so(d.sl)}</td><td className="so gv">{so(d.giaVon)}</td><td className="so gv">{so(d.giaTri)}</td></>}
            </tr>
          ))}
        </tbody>
      </table></div>
      <div className="kq-ct-duoi">
        <div className={`ghi ${p.ghiChu ? '' : 'mo'}`}>{p.ghiChu || 'Ghi chú...'}</div>
        <div className="tong">
          {kiem ? <>
            <div><span>Tổng thực tế</span><b>{so(sl.tongSl)}</b></div>
            <div><span>Lệch tăng / giảm</span><b>{so(sl.tang)} / {so(sl.giam)}</b></div>
            <div className="gv"><span>Tổng giá trị lệch</span><b>{so(sl.tongGt)}</b></div>
          </> : <>
            <div><span>Tổng số lượng</span><b>{so(sl.tongSl)}</b></div>
            <div className="gv"><span>Tổng giá trị</span><b>{so(sl.tongGt)}</b></div>
          </>}
        </div>
      </div>
      <div className="kq-ct-chan">
        {p.trangThai !== 'huy' && <button type="button" onClick={onHuy}><Trash2 size={17} />Hủy</button>}
        <button type="button" onClick={onSaoChep}><Copy size={17} />Sao chép</button>
        <span className="gian" />
        {p.trangThai === 'tam' && <button type="button" className="chinh" onClick={onMo}><SquarePen size={17} />Mở phiếu</button>}
        {onNhan && <button type="button" className="chinh" onClick={onNhan}><ClipboardCheck size={17} />Nhận hàng</button>}
        <button type="button" onClick={onIn}><Printer size={17} />In</button>
      </div>
    </div>
  );
}

// ----- Màn lập phiếu toàn trang -----
function FormPhieu({ loai, phieuCu, matHang, ton, chiNhanh, nguoi, soPhieu, ganDay, onDong, onLuu, that = false }) {
  const K = KIEU_PHIEU[loai];
  const kiem = loai === 'kiem';
  const [dong, setDong] = useState(() => phieuCu?.dong?.map((d) => ({ ...d })) || []);
  const [ghiChu, setGhiChu] = useState(phieuCu?.ghiChu || '');
  const [loaiXuat, setLoaiXuat] = useState(phieuCu?.loaiXuat || '');
  const [nguoiNhan, setNguoiNhan] = useState(phieuCu?.nguoiNhan || '');
  const [tab, setTab] = useState('all');
  const [nhom, setNhom] = useState('');
  const [hopNhom, setHopNhom] = useState(false);
  const [loi, setLoi] = useState('');
  const [anh, setAnh] = useState(phieuCu?.anh || null); // chạy thật: ảnh bánh huỷ (bắt buộc)
  const [dangAnh, setDangAnh] = useState(false);
  const timRef = useRef(null);
  const dmCo = DANH_MUC.filter((d) => matHang.some((m) => m.danhMuc === d.value));
  const chonAnh = async (f) => {
    setDangAnh(true); setLoi('');
    try { setAnh(await taiAnh(f, 'xuat-huy')); } catch (e) { setLoi(`Không tải được ảnh: ${chuLoi(e)}`); }
    setDangAnh(false);
  };
  const luanChuyen = loai === 'noibo' && loaiXuat === LUAN_CHUYEN;
  const denCN = luanChuyen || loai === 'chuyen' ? CHI_NHANH.find((c) => c !== chiNhanh) : null;
  const ma = phieuCu?.ma || `${LOAI_PHIEU[loai].tienTo}${String(soPhieu).padStart(6, '0')}`;
  const phieu = {
    id: phieuCu?.id, anh, ma, loai, chiNhanh, nguoi: phieuCu?.nguoi || nguoi, nguoiThucHien: nguoi, luc: phieuCu?.luc || Date.now(),
    ghiChu: ghiChu.trim(), loaiXuat: loai === 'noibo' ? loaiXuat : '', nguoiNhan: nguoiNhan.trim(), denCN, nguon: loai === 'giao' ? 'Bếp' : '',
    dong, trangThai: 'tam',
  };
  const sl = soLieuPhieu(phieu, matHang, ton);
  const chuaKiem = kiem ? dong.filter((d) => d.sl == null || d.sl === '').length : 0;
  const soKhop = kiem ? sl.dong.filter((d) => d.lech === 0).length : 0;
  const lechN = kiem ? sl.dong.filter((d) => d.lech != null && d.lech !== 0).length : 0;
  const dongHien = sl.dong.filter((d) => !kiem || tab === 'all' || (tab === 'khop' ? d.lech === 0 : tab === 'lech' ? d.lech != null && d.lech !== 0 : d.lech == null));

  useEffect(() => { timRef.current?.focus(); }, []);
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'F3') { e.preventDefault(); timRef.current?.focus(); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Như KiotViet: quét / chọn lại 1 hàng đã có thì cộng thêm 1 (kiểm kho: quét từng cái để đếm).
  const them = (m) => {
    setLoi('');
    setDong((ds) => (ds.some((d) => d.ma === m.ma)
      ? ds.map((d) => (d.ma === m.ma ? { ...d, sl: (Number(d.sl) || 0) + 1 } : d))
      : [...ds, { ma: m.ma, sl: 1 }]));
  };
  const themNhom = () => {
    const moi = matHang.filter((m) => (!nhom || m.danhMuc === nhom) && !dong.some((d) => d.ma === m.ma));
    setDong((ds) => [...ds, ...moi.map((m) => ({ ma: m.ma, sl: null }))]);
    setHopNhom(false);
    setTab('chua');
  };
  const datSl = (maH, v) => setDong((ds) => ds.map((d) => (d.ma === maH ? { ...d, sl: v === '' ? (kiem ? null : 0) : Number(v) } : d)));
  const bo = (maH) => setDong((ds) => ds.filter((d) => d.ma !== maH));

  const luu = (xong) => {
    const sach = { ...phieu, dong: kiem ? dong : dong.filter((d) => Number(d.sl) > 0) };
    if (!sach.dong.length) { setLoi('Phiếu chưa có hàng hóa nào.'); return; }
    if (xong) {
      if (kiem && chuaKiem) { setLoi(`Còn ${chuaKiem} hàng chưa kiểm — nhập số thực tế (đếm được 0 thì nhập 0) hoặc xóa dòng.`); setTab('chua'); return; }
      if (loai === 'noibo' && !loaiXuat) { setLoi('Chọn loại xuất trước khi hoàn thành.'); return; }
      if (loai === 'huy' && !ghiChu.trim()) { setLoi('Ghi lý do hủy vào ô Ghi chú (VD: hết date).'); return; }
      if (that && loai === 'huy' && !anh) { setLoi('Chụp ảnh bánh huỷ trước khi hoàn thành.'); return; }
    }
    onLuu(sach, xong);
  };

  return (
    <div className="kf">
      <section className="kf-trai">
        <div className="kf-dau">
          <button type="button" className="kf-ve" aria-label="Quay lại" onClick={onDong}><ArrowLeft size={20} /></button>
          <h1>{loai === 'kiem' ? 'Kiểm kho' : LOAI_PHIEU[loai].ten}</h1>
          <div className="kf-tim">
            <TimHang matHang={matHang} ton={ton} inputRef={timRef} onChon={them} goiY="Tìm hàng hóa theo mã hoặc tên (F3)" nhe />
            {kiem && <button type="button" className="kv-ic" title="Thêm hàng theo nhóm" aria-label="Thêm hàng theo nhóm" onClick={() => setHopNhom(true)}><LayoutGrid size={18} /></button>}
          </div>
        </div>
        {kiem && (
          <nav className="kf-tabs">
            {[['all', `Tất cả (${dong.length})`], ['khop', `Khớp (${soKhop})`], ['lech', `Lệch (${lechN})`], ['chua', `Chưa kiểm (${chuaKiem})`]].map(([k, l]) => (
              <button key={k} type="button" className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>
            ))}
          </nav>
        )}
        <div className={`kf-bang ${kiem ? 'kiem' : ''}`}>
          <div className="kf-hang dau">
            <span className="stt">STT</span><span className="xoa" /><span className="ma">Mã hàng</span><span className="ten">Tên hàng</span>
            {kiem ? <><span className="so">Tồn kho</span><span className="so">Thực tế</span><span className="so">SL lệch</span><span className="so gv">Giá trị lệch</span></>
              : <><span className="so">{K.sl}</span><span className="so gv">Giá vốn</span><span className="so gv">{loai === 'giao' ? 'Thành tiền' : 'Giá trị'}</span></>}
          </div>
          {dongHien.map((d, i) => (
            <div key={d.ma} className="kf-hang">
              <span className="stt">{i + 1}</span>
              <button type="button" className="xoa" aria-label={`Xóa ${tenHang(d.m)}`} onClick={() => bo(d.ma)}><Trash2 size={17} /></button>
              <span className="ma">{d.ma}</span>
              <span className="ten">{tenHang(d.m)}{!kiem && <small> · Tồn: {so(ton[d.ma] ?? 0)}</small>}</span>
              {kiem && <span className="so" data-nhan="Tồn kho">{so(d.tonTruoc)}</span>}
              <span className="so o" data-nhan={kiem ? 'Thực tế' : K.sl}>
                <input inputMode="numeric" value={d.sl == null ? '' : d.sl} placeholder={kiem ? 'Nhập' : '0'} aria-label={`${kiem ? 'Thực tế' : 'Số lượng'} ${tenHang(d.m)}`}
                  onChange={(e) => datSl(d.ma, soTien(e.target.value))} onFocus={(e) => e.target.select()} />
              </span>
              {kiem ? <>
                <span className={`so ${d.lech < 0 ? 'am' : d.lech > 0 ? 'duong' : ''}`} data-nhan="SL lệch">{d.lech == null ? '—' : so(d.lech)}</span>
                <span className="so gv" data-nhan="Giá trị lệch">{so(d.giaTri)}</span>
              </> : <>
                <span className="so gv" data-nhan="Giá vốn">{so(d.giaVon)}</span>
                <span className="so dam gv" data-nhan="Giá trị">{so(d.giaTri)}</span>
              </>}
            </div>
          ))}
          {!dong.length && (
            <div className="kf-rong">
              <ScanBarcode size={36} />
              <b>Quét mã vạch hoặc gõ tên bánh vào ô tìm (F3)</b>
              <span>{kiem ? 'Quét từng cái để đếm — quét lại cùng loại sẽ tự cộng thêm 1. Hoặc bấm nút lưới để thêm cả nhóm hàng rồi nhập số đếm.' : 'Chọn lại cùng 1 hàng sẽ tự cộng thêm 1.'}</span>
            </div>
          )}
          {dong.length > 0 && !dongHien.length && <div className="kf-rong"><span>Không có hàng nào ở mục này.</span></div>}
        </div>
      </section>

      <aside className="kf-phai">
        <div className="kf-phai-than">
          <div className="kf-r dau"><span className="kf-nguoi"><CircleUser size={18} />{nguoi}</span><span className="kf-ngay">{ngayDayDu(Date.now())}</span></div>
          <div className="kf-r"><span>{K.ma}</span><span className="kf-o mo">{phieuCu?.ma || 'Mã phiếu tự động'}</span></div>
          <div className="kf-r"><span>Trạng thái</span><span>Phiếu tạm</span></div>
          {loai === 'giao' && <div className="kf-r"><span>Nguồn hàng</span><span>Bếp giao ra quầy</span></div>}
          {loai === 'chuyen' && <>
            <div className="kf-r"><span>Từ chi nhánh</span><span>{chiNhanh}</span></div>
            <div className="kf-r"><span>Tới chi nhánh</span><b>{denCN}</b></div>
            <div className="kf-chuyen">Hoàn thành sẽ <b>trừ tồn {chiNhanh}</b> và <b>cộng tồn {denCN}</b> cùng lúc — bên nhận không cần lập thêm phiếu.</div>
          </>}
          {loai === 'noibo' && <>
            <label className="kf-r"><span>Loại xuất</span>
              <select className="kf-chon" value={loaiXuat} onChange={(e) => { setLoaiXuat(e.target.value); setLoi(''); }}>
                <option value="">Chọn loại xuất</option>{LOAI_NOI_BO.filter((l) => !(that && l === LUAN_CHUYEN)).map((l) => <option key={l}>{l}</option>)}
              </select></label>
            {luanChuyen && <div className="kf-chuyen">Hoàn thành sẽ <b>trừ tồn {chiNhanh}</b> và <b>cộng tồn {denCN}</b> cùng lúc — không cần lập thêm phiếu bên kia.</div>}
            <label className="kf-r"><span>Người nhận</span><input className="kf-chon" value={nguoiNhan} onChange={(e) => setNguoiNhan(e.target.value)} placeholder="Chọn người nhận" /></label>
          </>}
          {kiem
            ? <div className="kf-r"><span>Tổng SL thực tế</span><b>{so(sl.tongSl)}</b></div>
            : <>
              <div className="kf-r"><span>Tổng số lượng</span><b>{so(sl.tongSl)}</b></div>
              <div className="kf-r gv"><b>Tổng giá trị</b><b className="xanh">{so(sl.tongGt)}</b></div>
            </>}
          {kiem && (lechN > 0) && <div className="kf-r"><span>Lệch tăng / giảm</span><b>{so(sl.tang)} / {so(sl.giam)}</b></div>}
          {loai === 'huy' && <div className="kf-goi">{LY_DO_HUY.map((l) => <button key={l} type="button" className={ghiChu === l ? 'on' : ''} onClick={() => { setGhiChu(l); setLoi(''); }}>{l}</button>)}</div>}
          {that && loai === 'huy' && <ChupAnh path={anh} dang={dangAnh} onChon={chonAnh} />}
          <textarea className="kf-ghi" value={ghiChu} onChange={(e) => { setGhiChu(e.target.value); setLoi(''); }} placeholder={loai === 'huy' ? 'Ghi chú (lý do hủy — bắt buộc)' : 'Ghi chú'} rows={3} />
          {kiem && (
            <div className="kf-gan-day"><b>Kiểm gần đây</b>
              {ganDay.length ? ganDay.slice(0, 5).map((p) => <div key={p.ma}><span className="xanh">{p.ma}</span><span>{ngayDayDu(p.lucXong || p.luc)}</span><span>{trangThaiCua(p)}</span></div>)
                : <span className="mo">Chưa có phiếu kiểm nào.</span>}
            </div>
          )}
          {loi && <p className="kv-loi">{loi}</p>}
        </div>
        <div className={`kf-phai-chan ${kiem ? 'kiem' : ''}`}>
          <button type="button" className="tam" onClick={() => luu(false)}>{kiem && <Save size={18} />}Lưu tạm</button>
          <button type="button" className="xong" disabled={dangAnh} onClick={() => luu(true)}>{kiem && <Check size={18} />}{that && loai === 'giao' ? 'Gửi quầy nhận' : 'Hoàn thành'}</button>
        </div>
      </aside>

      {hopNhom && (
        <Hop tieuDe="Thêm hàng theo nhóm" onDong={() => setHopNhom(false)}
          chan={<><button type="button" className="bhq-nut phu" onClick={() => setHopNhom(false)}>Bỏ qua</button><button type="button" className="bhq-nut chinh" onClick={themNhom}>Thêm</button></>}>
          <label className="bhq-nhan">Nhóm hàng
            <select className="bhq-o" value={nhom} onChange={(e) => setNhom(e.target.value)}>
              <option value="">Tất cả nhóm hàng</option>{dmCo.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
            </select></label>
          <p className="bhq-ghi">Thêm {matHang.filter((m) => (!nhom || m.danhMuc === nhom) && !dong.some((d) => d.ma === m.ma)).length} hàng vào phiếu, để trống cột "Thực tế" (mục Chưa kiểm) cho bạn đếm rồi nhập.</p>
        </Hop>
      )}
    </div>
  );
}

// Phiếu kho in ra máy in 80mm.
function NoiDungPhieu({ p, matHang }) {
  const sl = soLieuPhieu(p, matHang, {});
  const kiem = p.loai === 'kiem';
  return (
    <div className="bl">
      <div className="bl-c"><b>SUMI BAKERY · {p.chiNhanh}</b><br /><b className="bl-to">{kiem ? 'PHIẾU KIỂM KHO' : LOAI_PHIEU[p.loai].ten.toUpperCase()}</b><br />{p.ma} · {ngayDayDu(p.lucXong || p.luc)}</div>
      <div>Người lập: {p.nguoi}{p.loaiXuat ? ` · ${p.loaiXuat}` : ''}{p.denCN ? ` → ${p.denCN}` : ''}</div>
      <hr />
      {sl.dong.map((d) => (
        <div key={d.ma} className="bl-h"><span>{tenHang(d.m)}</span><span>{kiem ? `${d.sl ?? '—'} (lệch ${d.lech ?? '—'})` : d.sl}</span></div>
      ))}
      <hr />
      <div className="bl-h"><span>{kiem ? 'Tổng thực tế' : 'Tổng số lượng'}</span><b>{so(sl.tongSl)}</b></div>
      {p.ghiChu && <div>Ghi chú: {p.ghiChu}</div>}
      <div className="bl-h" style={{ marginTop: 18 }}><span>Người lập</span><span>Người nhận</span></div>
    </div>
  );
}

// ===== HÓA ĐƠN — máy tính: bảng + bấm dòng xem chi tiết như KiotViet;
// điện thoại: danh sách thẻ, chạm mở chi tiết, ⋮ Trả hàng / In / Chia sẻ / Hủy đơn như app KiotViet.
function vanBanHd(h) {
  return [
    `SUMI BAKERY · ${h.chiNhanh}`, `Hóa đơn ${h.ma} · ${ngayDayDu(h.luc)}`, `Khách: ${h.khach?.name || 'Khách lẻ'}`,
    ...h.dong.map((d) => `${d.sl} x ${d.ten}${d.size ? ` ${d.size}` : ''}: ${so(tienDong(d))}`),
    `Khách cần trả: ${so(h.canTra)}`,
  ].join('\n');
}

function ChiTietHd({ h, tra, huyDuoc, dienThoai, onIn, onHuy, onChiaSe, onSaoChep }) {
  const daTra = tra.reduce((s, t) => s + t.tienTra, 0);
  return (
    <div className="kq-ct">
      {!dienThoai && <nav className="kq-ct-tab"><button type="button" className="on">Thông tin</button></nav>}
      <div className="kq-ct-dau"><b>{h.ma}</b><span className={`kq-tt ${h.daHuy ? 'huy' : 'xong'}`}>{h.daHuy ? 'Đã hủy' : 'Hoàn thành'}</span><span className="cn">{h.chiNhanh}</span></div>
      <div className="kq-ct-tt">
        <div><small>Người tạo:</small><span>{h.thuNgan}</span></div>
        <div><small>Người bán:</small><span>{h.nguoiBan || h.thuNgan}</span></div>
        <div><small>Ngày bán:</small><span>{ngayDayDu(h.luc)}</span></div>
        <div><small>Khách hàng:</small><span className="xanh">{h.khach?.name || 'Khách lẻ'}</span></div>
        <div><small>Kênh bán:</small><span>Bán trực tiếp</span></div>
        <div><small>Thanh toán:</small><span>{PT[h.phuongThuc]}</span></div>
      </div>
      {dienThoai && h.dong.length > 0 && (
        <ul className="kvm-hd-mon">
          {h.dong.map((d) => {
            const tien = tienDong(d);
            const giam = d.gia * d.sl - tien;
            return (
              <li key={d.ma}>
                <div><b>{d.ten}{d.size ? ` - ${d.size}` : ''}</b><small>{d.ma} · {so(d.sl)} x {so(tien / d.sl)}{giam > 0 ? <s> {so(d.gia)}</s> : null}</small>{d.ghiChu ? <small className="kv-dong-ghi">{d.ghiChu}</small> : null}</div>
                <span>{so(tien)}</span>
              </li>
            );
          })}
        </ul>
      )}
      {!dienThoai && h.dong.length > 0 && (
        <div className="kq-cuon"><table className="phu">
          <thead><tr><th>Mã hàng</th><th>Tên hàng</th><th className="so">Số lượng</th><th className="so">Đơn giá</th><th className="so">Giảm giá</th><th className="so">Giá bán</th><th className="so">Thành tiền</th></tr></thead>
          <tbody>
            {h.dong.map((d) => {
              const tien = tienDong(d);
              return (
                <tr key={d.ma}><td className="xanh">{d.ma}</td><td>{d.ten}{d.size ? ` - ${d.size}` : ''}{d.ghiChu ? <small className="kv-dong-ghi"> · {d.ghiChu}</small> : null}</td>
                  <td className="so">{so(d.sl)}</td><td className="so">{so(d.gia)}</td><td className="so">{so(d.gia - tien / d.sl)}</td><td className="so">{so(tien / d.sl)}</td><td className="so">{so(tien)}</td></tr>
              );
            })}
          </tbody>
        </table></div>
      )}
      <div className="kq-ct-duoi">
        <div className={`ghi ${h.ghiChu ? '' : 'mo'}`}>{h.ghiChu || 'Ghi chú...'}</div>
        <div className="tong">
          <div><span>Tổng tiền hàng ({h.dong.reduce((s, d) => s + d.sl, 0)})</span><b>{so(h.tongHang)}</b></div>
          <div><span>Giảm giá hóa đơn</span><b>{so(h.giamHd)}</b></div>
          {h.thuKhac > 0 && <div><span>Thu khác</span><b>{so(h.thuKhac)}</b></div>}
          {h.vat > 0 && <div><span>VAT 8%</span><b>{so(h.vat)}</b></div>}
          <div><span>Khách cần trả</span><b className="xanh">{so(h.canTra)}</b></div>
          <div><span>Khách đã trả</span><b>{so(h.thucThu ?? h.canTra - h.no)}</b></div>
          {h.no > 0 && <div><span>Còn nợ</span><b className="do">{so(h.no)}</b></div>}
          {daTra > 0 && <div><span>Đã trả hàng</span><b>−{so(daTra)}</b></div>}
        </div>
      </div>
      {tra.map((t) => <p key={t.ma} className="kq-ct-ghi">Phiếu trả hàng <b>{t.ma}</b> · {ngayDayDu(t.luc)} · {t.dong.map((d) => `${d.sl} ${d.ten}`).join(', ')} · hoàn {so(t.tienTra)}{t.lyDo ? ` · ${t.lyDo}` : ''}</p>)}
      {h.daHuy && <p className="kq-ct-ghi">Hủy lúc {ngayDayDu(h.lucHuy)} · {h.nguoiHuy} · lý do: {h.lyDoHuy}</p>}
      {!h.daHuy && !h.mau && (
        <div className="kq-ct-chan">
          {huyDuoc ? <button type="button" onClick={onHuy}><Trash2 size={17} />Hủy</button> : <span className="mo">Đã đóng ca — chỉ Quản lý / Giám đốc hủy được</span>}
          <span className="gian" />
          <button type="button" onClick={onSaoChep}><Copy size={17} />Sao chép</button>
          {dienThoai && <button type="button" onClick={onChiaSe}><Share2 size={17} />Chia sẻ</button>}
          <button type="button" className="chinh" onClick={onIn}><Printer size={17} />In</button>
        </div>
      )}
    </div>
  );
}

// Chi tiết 1 hoá đơn trên điện thoại — y app KiotViet: thẻ mã HĐ + "Hoàn thành", thẻ khách, thẻ hàng,
// thẻ tiền (Khách đã trả + phương thức), GHI CHÚ, thẻ Bảng giá / Kênh bán / Người bán / Người tạo / Chi nhánh.
// Cuộn xuống thì mã HĐ + ngày thu lên thanh trên cùng. "…" → In / Chia sẻ / Hủy.
function ChiTietHdDt({ h, huyDuoc, onLui, onIn, onHuy, onChiaSe, onSaoChep }) {
  const [cuon, setCuon] = useState(false);
  const [menu, setMenu] = useState(false);
  const [moPt, setMoPt] = useState(false);
  const [daChep, setDaChep] = useState(false);
  const daTra = h.thucThu ?? h.canTra - h.no;
  const trangThai = h.daHuy ? 'Đã hủy' : 'Hoàn thành';
  const chep = () => {
    try { window.navigator.clipboard?.writeText(h.ma); } catch { /* trình duyệt chặn — bỏ qua */ }
    setDaChep(true); setTimeout(() => setDaChep(false), 1500);
  };
  const ds = [
    ['Bảng giá', 'Bảng giá chung'], ['Kênh bán', 'Bán trực tiếp'],
    ['Người bán', h.nguoiBan || h.thuNgan], ['Người tạo', h.thuNgan], ['Chi nhánh', h.chiNhanh],
  ];
  return (
    <div className="kvm kvm-phu kvm-ct-hd">
      <header className={`kvm-dau trang ${cuon ? 'cuon' : ''}`}>
        <button type="button" aria-label="Quay lại" onClick={onLui}><ChevronLeft size={26} /></button>
        <div className="tieu"><b>{h.ma}</b><small>{ngayDayDu(h.luc)} · <span className={h.daHuy ? 'do' : 'la'}>{trangThai}</span></small></div>
        <button type="button" aria-label="Thao tác khác" onClick={() => setMenu((v) => !v)}><Ellipsis size={26} /></button>
      </header>
      {menu && (
        <div className="kvm-ba-cham" onClick={() => setMenu(false)}><div>
          <button type="button" onClick={onIn}><Printer size={18} />In hóa đơn</button>
          <button type="button" onClick={onChiaSe}><Share2 size={18} />Chia sẻ</button>
          <button type="button" onClick={onSaoChep}><Copy size={18} />Sao chép</button>
          {!h.daHuy && huyDuoc && <button type="button" className="do" onClick={onHuy}><Trash2 size={18} />Hủy hóa đơn</button>}
        </div></div>
      )}
      <div className="kvm-than" onScroll={(e) => setCuon(e.currentTarget.scrollTop > 56)}>
        <section className="kvm-ct-the dau">
          <div><h2>{h.ma}<button type="button" aria-label="Sao chép mã hóa đơn" onClick={chep}>{daChep ? <Check size={20} /> : <Copy size={20} />}</button></h2><span>{ngayDayDu(h.luc)}</span></div>
          <i className={`kvm-ct-tt ${h.daHuy ? 'huy' : ''}`}>{trangThai}</i>
        </section>
        <section className="kvm-ct-the kh"><span className="av"><User size={30} fill="currentColor" strokeWidth={0} /></span><b>{h.khach?.name || 'Khách lẻ'}</b>{h.khach?.phone ? <small>{h.khach.phone}</small> : null}</section>
        <section className="kvm-ct-the">
          {h.dong.map((d) => {
            const tien = tienDong(d);
            return (
              <div key={d.ma} className="kvm-ct-mon">
                <AnhNho m={d} />
                <div className="g"><b>{d.ten}{d.size ? ` ${d.size}` : ''}</b><small>{d.ma}</small>{d.ghiChu ? <small className="kv-dong-ghi">{d.ghiChu}</small> : null}
                  <span className="h"><span>{so(d.sl ? tien / d.sl : d.gia)} x {so(d.sl)}</span><span className="tt">{so(tien)}</span></span></div>
              </div>
            );
          })}
        </section>
        <section className="kvm-ct-the tien">
          <div><span>Tổng tiền hàng <i className="kvm-tron vien">{h.dong.reduce((s2, d) => s2 + d.sl, 0)}</i></span><span>{so(h.tongHang)}</span></div>
          <div><span>Giảm giá</span><span>{so(h.giamHd)}</span></div>
          {h.thuKhac > 0 && <div><span>Thu khác</span><span>{so(h.thuKhac)}</span></div>}
          {h.vat > 0 && <div><span>VAT 8%</span><span>{so(h.vat)}</span></div>}
          <div className="dam"><span>Khách cần trả</span><span>{so(h.canTra)}</span></div>
          <div className="dam"><span>Khách đã trả</span><span className="xanh lon">{so(daTra)}</span></div>
          <button type="button" className="pt" aria-expanded={moPt} onClick={() => setMoPt((v) => !v)}>{moPt ? <ChevronUp size={18} /> : <ChevronDown size={18} />}{PT[h.phuongThuc]}</button>
          {moPt && <div className="pt-ct"><span>{PT[h.phuongThuc]}</span><span>{so(daTra)}</span></div>}
          {h.no > 0 && <div className="no"><span>Còn nợ</span><span>{so(h.no)}</span></div>}
        </section>
        <section className="kvm-ct-the ghi"><small>GHI CHÚ</small><p className={h.ghiChu ? '' : 'mo'}>{h.ghiChu || 'Chưa có ghi chú...'}</p></section>
        {h.daHuy && <section className="kvm-ct-the ghi"><small>ĐÃ HỦY</small><p>{ngayDayDu(h.lucHuy)} · {h.nguoiHuy} · {h.lyDoHuy}</p></section>}
        <section className="kvm-ct-the luoi">{ds.map(([k, v]) => <div key={k}><small>{k}</small><b>{v}</b></div>)}</section>
      </div>
    </div>
  );
}

// Bộ lọc Thời gian như KiotViet (mặc định "Tháng này").
const KY_LOC = [['hom_nay', 'Hôm nay'], ['hom_qua', 'Hôm qua'], ['7_ngay', '7 ngày qua'], ['thang', 'Tháng này'], ['thang_truoc', 'Tháng trước'], ['tat_ca', 'Toàn thời gian']];
function trongKy(luc, ky) {
  const n = new Date(); const dau = new Date(n.getFullYear(), n.getMonth(), n.getDate()).getTime();
  if (ky === 'hom_nay') return luc >= dau;
  if (ky === 'hom_qua') return luc >= dau - NGAY && luc < dau;
  if (ky === '7_ngay') return luc >= dau - 6 * NGAY;
  if (ky === 'thang') return luc >= new Date(n.getFullYear(), n.getMonth(), 1).getTime();
  if (ky === 'thang_truoc') return luc >= new Date(n.getFullYear(), n.getMonth() - 1, 1).getTime() && luc < new Date(n.getFullYear(), n.getMonth(), 1).getTime();
  return true;
}

// Nhãn nhóm ngày như app KiotViet: "HÔM NAY 06/11/2026", "HÔM QUA …", "THỨ BA 03/11/2026".
const THU = ['CHỦ NHẬT', 'THỨ HAI', 'THỨ BA', 'THỨ TƯ', 'THỨ NĂM', 'THỨ SÁU', 'THỨ BẢY'];
function nhanNgay(luc) {
  const d = new Date(luc); const p = (n) => String(n).padStart(2, '0');
  const ngay = `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
  const dau = new Date(); dau.setHours(0, 0, 0, 0);
  if (luc >= dau.getTime()) return `HÔM NAY ${ngay}`;
  if (luc >= dau.getTime() - NGAY) return `HÔM QUA ${ngay}`;
  return `${THU[d.getDay()]} ${ngay}`;
}

function QlHoaDon({ ds, traHangs, dienThoai, huyDuoc, onIn, onHuy, onChiaSe, onSaoChep, onBan, laGD }) {
  const [q, setQ] = useState('');
  const [ky, setKy] = useState(!laGD ? 'hom_nay' : dienThoai ? 'tat_ca' : 'thang');
  const [timMo, setTimMo] = useState(false);
  const [cuTruoc, setCuTruoc] = useState(false);
  const [locMoDt, setLocMoDt] = useState(false);
  const [loc, setLoc] = useState({ xong: true, huy: false });
  const [pt, setPt] = useState('');
  const [mo, setMo] = useState(null);
  const [trang, setTrang] = useState(0);
  const t = q.trim().toLowerCase();
  const loc2 = ds.filter((h) => loc[h.daHuy ? 'huy' : 'xong'] && trongKy(h.luc, ky) && (!pt || h.phuongThuc === pt)
    && khop(`${h.ma} ${h.khach?.name || ''} ${h.khach?.phone || ''}`, t));
  const tr = Math.min(trang, Math.max(Math.ceil(loc2.length / MOI_TRANG_QL), 1) - 1);
  const traCua = (ma) => traHangs.filter((x) => x.hdGoc === ma);
  const chiTiet = (h) => (
    <ChiTietHd h={h} tra={traCua(h.ma)} huyDuoc={huyDuoc(h)} dienThoai={dienThoai}
      onIn={() => onIn(h)} onHuy={() => onHuy(h)} onChiaSe={() => onChiaSe(h)} onSaoChep={() => onSaoChep(h)} />
  );
  const tongCan = loc2.filter((h) => !h.daHuy).reduce((s, h) => s + h.canTra, 0);
  const locTT = (
    <div className="kq-hop-loc"><b>Trạng thái</b>
      {[['xong', 'Hoàn thành'], ['huy', 'Đã hủy']].map(([k, l]) => (
        <label key={k} className="kq-chk"><input type="checkbox" checked={loc[k]} onChange={() => { setLoc((x) => ({ ...x, [k]: !x[k] })); setTrang(0); }} /><i />{l}</label>
      ))}
    </div>
  );

  if (dienThoai) {
    const hdMo = ds.find((h) => h.ma === mo);
    if (hdMo) {
      return <ChiTietHdDt h={hdMo} huyDuoc={huyDuoc(hdMo)} onLui={() => setMo(null)} onIn={() => onIn(hdMo)} onHuy={() => onHuy(hdMo)} onChiaSe={() => onChiaSe(hdMo)} onSaoChep={() => onSaoChep(hdMo)} />;
    }
    const xep = [...loc2].sort((a, b) => (cuTruoc ? a.luc - b.luc : b.luc - a.luc));
    const nhom = [];
    xep.forEach((h) => { const n = nhanNgay(h.luc); const cuoi = nhom[nhom.length - 1]; if (cuoi && cuoi[0] === n) cuoi[1].push(h); else nhom.push([n, [h]]); });
    const conHieuLuc = loc2.filter((h) => !h.daHuy);
    return (
      <main className="kvm-ds-hd kvm-trang-ql">
        <header className="kvm-dau kvm-dau-lon"><h1>Hóa đơn</h1>
          <button type="button" aria-label="Tìm hóa đơn" className={timMo ? 'on' : ''} onClick={() => { setTimMo((v) => !v); if (timMo) setQ(''); }}><Search size={24} /></button>
          <button type="button" aria-label={cuTruoc ? 'Đang xếp cũ trước' : 'Đang xếp mới trước'} onClick={() => setCuTruoc((v) => !v)}><ArrowDownUp size={24} /></button>
        </header>
        {timMo && <div className="kvm-tim"><label><Search size={17} /><input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Theo mã hóa đơn, khách hàng" /></label></div>}
        <div className="kvm-loc-hd">
          <button type="button" className={`kvm-loc-ic ${locMoDt ? 'on' : ''}`} aria-label="Lọc trạng thái" onClick={() => setLocMoDt((v) => !v)}><ListFilter size={22} /></button>
          <label className="kvm-ky"><select value={ky} onChange={(e) => setKy(e.target.value)} aria-label="Thời gian">{KY_LOC.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select><ChevronDown size={16} /></label>
        </div>
        {locMoDt && (
          <div className="kvm-loc">
            {[['xong', 'Hoàn thành'], ['huy', 'Đã hủy']].map(([k, l]) => <button key={k} type="button" className={loc[k] ? 'on' : ''} onClick={() => setLoc((x) => ({ ...x, [k]: !x[k] }))}>{l}</button>)}
          </div>
        )}
        {laGD ? (
          <div className="kvm-tong-ql">
            <div><b>Tổng tiền hàng</b><small>{so(conHieuLuc.length)} hóa đơn</small></div>
            <b>{so(conHieuLuc.reduce((s2, h) => s2 + h.tongHang, 0))}</b>
          </div>
        ) : <div className="kvm-khe" />}
        <section className="kvm-hd-ds">
          {nhom.map(([n, list]) => (
            <React.Fragment key={n}>
              {!['hom_nay', 'hom_qua'].includes(ky) && <h3>{n}</h3>}
              {list.map((h) => (
                <button key={h.ma} type="button" className={`kvm-hd-dong ${h.daHuy ? 'huy' : ''}`} onClick={() => setMo(h.ma)}>
                  <span className="r1"><b>{h.khach?.name || 'Khách lẻ'}</b><b>{so(h.canTra)}</b></span>
                  <span className="r2"><span>{ngayDayDu(h.luc)} • {h.ma}</span>
                    <span className={h.daHuy || h.no > 0 ? 'do' : ''}>{h.daHuy ? 'Đã hủy' : h.no > 0 ? `Nợ ${so(h.no)}` : PT[h.phuongThuc]}</span></span>
                  {h.dong[0] && <span className="r3">{tenHang(h.dong[0])} <b>x{h.dong[0].sl}</b></span>}
                  {h.dong.length > 1 && <span className="r3">+{h.dong.length - 1} mặt hàng khác</span>}
                </button>
              ))}
            </React.Fragment>
          ))}
          {!loc2.length && <KhongCo chu="Chưa có hóa đơn nào." />}
        </section>
        {onBan && <button type="button" className="kvm-fab" aria-label="Bán hàng mới" onClick={onBan}><Plus size={28} /></button>}
      </main>
    );
  }

  return (
    <main className="kq">
      <div className="kq-dau">
        <h1>Hóa đơn</h1>
        <label className="kq-tim"><Search size={17} /><input value={q} onChange={(e) => { setQ(e.target.value); setTrang(0); }} placeholder="Theo mã hóa đơn" /></label>
      </div>
      <div className="kq-than">
        <aside className="kq-loc">
          <div className="kq-hop-loc"><b>Thời gian</b>
            <select value={ky} onChange={(e) => { setKy(e.target.value); setTrang(0); }} aria-label="Thời gian">{KY_LOC.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
          {locTT}
          <div className="kq-hop-loc"><b>Phương thức thanh toán</b>
            <select value={pt} onChange={(e) => { setPt(e.target.value); setTrang(0); }}>
              <option value="">Chọn phương thức thanh toán</option>{Object.entries(PT).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select></div>
        </aside>
        <section className="kq-bang">
          <div className="kq-cuon">
            <table>
              <thead><tr><th>Mã hóa đơn</th><th>Thời gian</th><th>Khách hàng</th><th className="so">Tổng tiền hàng</th><th className="so">Giảm giá</th><th className="so">Khách cần trả</th><th className="so">Khách đã trả</th><th>Trạng thái</th></tr></thead>
              <tbody>
                <tr className="tong"><td /><td /><td /><td className="so">{so(loc2.filter((h) => !h.daHuy).reduce((s, h) => s + h.tongHang, 0))}</td><td className="so">{so(loc2.filter((h) => !h.daHuy).reduce((s, h) => s + h.giamHd, 0))}</td><td className="so">{so(tongCan)}</td><td className="so">{so(loc2.filter((h) => !h.daHuy).reduce((s, h) => s + (h.thucThu ?? h.canTra - h.no), 0))}</td><td /></tr>
                {loc2.slice(tr * MOI_TRANG_QL, (tr + 1) * MOI_TRANG_QL).map((h) => (
                  <React.Fragment key={h.ma}>
                    <tr className={`${mo === h.ma ? 'dang-mo' : ''} ${h.daHuy ? 'da-huy' : ''}`} onClick={() => setMo(mo === h.ma ? null : h.ma)}>
                      <td>{h.ma}</td><td>{ngayDayDu(h.luc)}</td><td>{h.khach?.name || 'Khách lẻ'}</td><td className="so">{so(h.tongHang)}</td><td className="so">{so(h.giamHd)}</td>
                      <td className="so">{so(h.canTra)}</td><td className="so">{so(h.thucThu ?? h.canTra - h.no)}</td>
                      <td><span className={`kq-tt ${h.daHuy ? 'huy' : 'xong'}`}>{h.daHuy ? 'Đã hủy' : 'Hoàn thành'}</span></td>
                    </tr>
                    {mo === h.ma && <tr className="kq-mo"><td colSpan={8}>{chiTiet(h)}</td></tr>}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
            {!loc2.length && <KhongCo chu="Không tìm thấy hóa đơn nào phù hợp." />}
          </div>
          <PhanTrang trang={tr} soDong={loc2.length} setTrang={setTrang} donVi="hóa đơn" />
        </section>
      </div>
    </main>
  );
}

// "Khác" (Giám đốc) / "Nhiều hơn" (nhân viên) trên điện thoại — như app KiotViet: thẻ cửa hàng + lưới
// Giao dịch / Hàng hoá / Đối tác. Nhân viên không thấy Công nợ, Báo cáo, Xuất dùng nội bộ (giống KiotViet);
// riêng Kiểm kho + Đóng ca vẫn giữ cho nhân viên vì tiệm cần đếm bánh và bàn giao tiền cuối ca.
function NhieuHon({ congNo, chiNhanh, setChiNhanh, onMo, onHop, laGD, laChu, xemNV, setXemNV, onDatHang, mucThat = [], onMucThat, anChuyen = false }) {
  const nhom = laGD ? [
    ['Giao dịch', [['ban', 'Bán hàng', ShoppingBag, 'xanh'], ['ls', 'Hóa đơn', FileText, 'xanh'], ['dat', 'Đặt hàng', ShoppingCart, 'xanh'],
      ['no', 'Công nợ', ReceiptText, 'cam'], ['ket_ca', 'Đóng ca', Clock, 'xanh'], ['ngay', 'Báo cáo cuối ngày', ChartArea, 'la']]],
    ['Hàng hoá', [['hh', 'Hàng hoá', Box, 'xanh'], ['kk', 'Kiểm kho', ClipboardCheck, 'la'], ['pn', 'Nhập hàng', Download, 'xanh'], ['ch', 'Chuyển hàng', Truck, 'xanh'],
      ['xh', 'Xuất hủy', PackageMinus, 'xanh'], ['xd', 'Xuất dùng nội bộ', Package, 'xanh']]],
    ['Đối tác', [['kh', 'Khách hàng', Users, 'la']]],
  ] : [
    ['Giao dịch', [['ban', 'Bán hàng', ShoppingBag, 'xanh'], ['ls', 'Hóa đơn', FileText, 'xanh'], ['dat', 'Đặt hàng', ShoppingCart, 'xanh'],
      ['ket_ca', 'Đóng ca', Clock, 'xanh']]],
    ['Hàng hoá', [['hh', 'Hàng hoá', Box, 'xanh'], ['pn', 'Nhập hàng', Download, 'xanh'], ['ch', 'Chuyển hàng', Truck, 'xanh'], ['xh', 'Xuất hủy', PackageMinus, 'xanh'],
      ['kk', 'Kiểm kho', ClipboardCheck, 'la']]],
    ['Đối tác', [['kh', 'Khách hàng', Users, 'la']]],
  ];
  const bam = (k) => (k === 'ket_ca' ? onHop({ loai: 'ket_ca' }) : k === 'dat' ? onDatHang() : onMo(k));
  const nhomHien = [
    ...nhom.map(([ten, ds]) => [ten, ds.filter(([k]) => !(anChuyen && k === 'ch'))]),
    ...(mucThat.length ? [['Quầy', mucThat.map(([k, l, Ic]) => [`that:${k}`, l, Ic, 'cam'])]] : []),
  ];
  return (
    <main className="kvm-them kvm-trang-ql">
      <section className="kvm-the kvm-cua-hang">
        <div className="dau"><span className="logo">S</span><div><b>Sumi Bakery</b>
          <label className="cn"><select value={chiNhanh} onChange={(e) => setChiNhanh(e.target.value)} aria-label="Chi nhánh">{CHI_NHANH.map((c) => <option key={c}>{c}</option>)}</select><ChevronDown size={15} /></label></div></div>
        <button type="button" className="kvm-dong-mo" onClick={() => onHop({ loai: 'thiet_lap_in' })}><span>Thiết lập máy in</span><ChevronRight size={18} className="mui" /></button>
        {laChu && (
          <button type="button" className="kvm-dong-mo" onClick={() => setXemNV((v) => !v)}>
            <span>{xemNV ? 'Đang xem màn nhân viên — bấm để về màn Giám đốc' : 'Xem thử màn nhân viên'}</span><ChevronRight size={18} className="mui" />
          </button>
        )}
      </section>
      {nhomHien.map(([ten, ds]) => (
        <section key={ten} className="kvm-the kvm-luoi-kh">
          <h2>{ten}</h2>
          <div className="luoi">
            {ds.map(([k, l, Ic, mau]) => (
              <button key={k} type="button" onClick={() => (k.startsWith('that:') ? onMucThat(k.slice(5)) : bam(k))}>
                <span className={`ic ${mau}`}><Ic size={26} strokeWidth={2.2} /></span><span>{l}</span>{k === 'no' && congNo ? <i className="kvm-dem">{congNo}</i> : null}
              </button>
            ))}
          </div>
        </section>
      ))}
      <section className="kvm-the">
        <button type="button" className="kvm-dong-mo" onClick={veApp}><House size={18} /><span>Về app Sumi</span><ChevronRight size={18} className="mui" /></button>
      </section>
    </main>
  );
}

// Khách hàng — như KiotViet: Mã KH · Tên · Điện thoại · Nợ hiện tại · Tổng bán. Chỉ xem (khách lấy từ app Sumi).
function KhachHang({ ds, hoaDons, noCua, dienThoai }) {
  const [q, setQ] = useState('');
  const [mo, setMo] = useState(null);
  const [trang, setTrang] = useState(0);
  const [chiNo, setChiNo] = useState(false);
  const tongBan = (k) => hoaDons.filter((h) => h.khach?.id === k.id && !h.daHuy).reduce((s2, h) => s2 + h.canTra, 0);
  const maKh = (i) => `KH${String(i + 1).padStart(6, '0')}`;
  const ds2 = ds.map((k, i) => ({ ...k, maKh: maKh(i) })).filter((k) => khop(`${k.maKh} ${k.name} ${k.phone || ''}`, q.trim()) && (!chiNo || noCua(k) > 0));
  const tr = Math.min(trang, Math.max(Math.ceil(ds2.length / MOI_TRANG_QL), 1) - 1);
  const chiTiet = (k) => {
    const hds = hoaDons.filter((h) => h.khach?.id === k.id);
    return (
      <div className="kh-ct">
        <div className="kq-luoi-tt">
          <div><small>Mã khách hàng</small><span>{k.maKh}</span></div>
          <div><small>Điện thoại</small><span>{k.phone || '—'}</span></div>
          <div><small>Nợ hiện tại</small><span className={noCua(k) > 0 ? 'do' : ''}>{so(noCua(k))}</span></div>
          <div><small>Tổng bán (phiên này)</small><span>{so(tongBan(k))}</span></div>
        </div>
        <h4>Lịch sử bán hàng</h4>
        {hds.map((h) => <div key={h.ma} className="kh-hd"><span>{h.ma} · {ngayDayDu(h.luc)}</span><b className={h.daHuy ? 'gach' : ''}>{so(h.canTra)}</b></div>)}
        {!hds.length && <p className="mo">Chưa mua hóa đơn nào trong phiên xem trước này.</p>}
        <p className="mo">Thêm / sửa khách hàng làm trong mục Khách hàng của app Sumi.</p>
      </div>
    );
  };
  if (dienThoai) {
    const k = ds2.find((x) => x.id === mo);
    if (k) {
      return (
        <div className="kvm kvm-phu kvm-hd">
          <header className="kvm-dau trang"><button type="button" aria-label="Quay lại" onClick={() => setMo(null)}><ChevronLeft size={22} /></button><h1>{k.name}</h1></header>
          <div className="kvm-than"><div className="kvm-the">{chiTiet(k)}</div></div>
        </div>
      );
    }
    return (
      <main className="kvm-ds-hd kvm-trang-ql">
        <div className="kvm-tim"><label><Search size={17} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tên, mã, số điện thoại" /></label></div>
        <div className="kvm-tong-ql"><div><b>Khách hàng</b><small>{so(ds2.length)} khách hàng</small></div></div>
        <section className="kvm-hh-ds">
          {ds2.slice(0, 200).map((x) => (
            <button key={x.id} type="button" className="kvm-hh-dong" onClick={() => setMo(x.id)}>
              <span className="kvm-kh-anh"><User size={20} /></span>
              <span className="t"><span>{x.name}</span><small>{x.maKh}{x.phone ? ` · ${x.phone}` : ''}</small></span>
              {noCua(x) > 0 && <span className="p"><small>Nợ</small><span className="do">{so(noCua(x))}</span></span>}
            </button>
          ))}
          {!ds2.length && <KhongCo chu="Không tìm thấy khách hàng nào." />}
        </section>
      </main>
    );
  }
  return (
    <main className="kq">
      <div className="kq-dau">
        <h1>Khách hàng</h1>
        <label className="kq-tim"><Search size={17} /><input value={q} onChange={(e) => { setQ(e.target.value); setTrang(0); }} placeholder="Theo mã, tên, số điện thoại" /></label>
      </div>
      <div className="kq-than">
        <aside className="kq-loc">
          <div className="kq-hop-loc"><b>Công nợ</b>
            {[[false, 'Tất cả khách hàng'], [true, 'Đang còn nợ']].map(([v, l]) => (
              <label key={l} className="kq-chk"><input type="radio" name="kh-no" checked={chiNo === v} onChange={() => { setChiNo(v); setTrang(0); }} /><i />{l}</label>
            ))}
          </div>
        </aside>
        <section className="kq-bang">
          <div className="kq-cuon">
            <table>
              <thead><tr><th>Mã khách hàng</th><th>Tên khách hàng</th><th>Điện thoại</th><th className="so">Nợ hiện tại</th><th className="so">Tổng bán</th></tr></thead>
              <tbody>
                <tr className="tong"><td /><td /><td /><td className="so">{so(ds2.reduce((s2, k) => s2 + noCua(k), 0))}</td><td className="so">{so(ds2.reduce((s2, k) => s2 + tongBan(k), 0))}</td></tr>
                {ds2.slice(tr * MOI_TRANG_QL, (tr + 1) * MOI_TRANG_QL).map((k) => (
                  <React.Fragment key={k.id}>
                    <tr className={mo === k.id ? 'dang-mo' : ''} onClick={() => setMo(mo === k.id ? null : k.id)}>
                      <td>{k.maKh}</td><td>{k.name}</td><td>{k.phone}</td><td className="so">{so(noCua(k))}</td><td className="so">{so(tongBan(k))}</td>
                    </tr>
                    {mo === k.id && <tr className="kq-mo"><td colSpan={5}>{chiTiet(k)}</td></tr>}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
            {!ds2.length && <KhongCo chu="Không tìm thấy khách hàng nào." />}
          </div>
          <PhanTrang trang={tr} soDong={ds2.length} setTrang={setTrang} donVi="khách hàng" />
        </section>
      </div>
    </main>
  );
}

// Thông báo (màn nhân viên) — như app KiotViet: "TẤT CẢ ▾" · "Đọc tất cả"; chấm xanh = chưa đọc.
function ThongBao({ ds, daDoc, onDoc, onDocHet }) {
  const [loai, setLoai] = useState('all');
  const [caiDat, setCaiDat] = useState(false);
  const [bat, setBat] = useState({ ban: true, nhap: true, kho: true, ton: true });
  const hien = ds.filter((t) => bat[t.loai] !== false && (loai === 'all' || (loai === 'ban' ? t.loai === 'ban' : t.loai !== 'ban')));
  const truoc = (t) => {
    const p = Math.round((Date.now() - t) / 60000);
    if (p < 1) return 'Vừa xong';
    if (p < 60) return `${p} phút trước`;
    if (p < 1440) return `${Math.floor(p / 60)} giờ trước`;
    return ngayDayDu(t);
  };
  const IC = { ban: ShoppingBag, nhap: Download, kho: Package, ton: Warehouse };
  return (
    <main className="kvm-ds-hd kvm-trang-ql kvm-tb">
      <header className="kvm-dau kvm-dau-lon"><h1>Thông báo</h1><button type="button" aria-label="Cài đặt thông báo" onClick={() => setCaiDat(true)}><Settings size={26} /></button></header>
      {caiDat && (
        <Hop tieuDe="Cài đặt thông báo" onDong={() => setCaiDat(false)} chan={<button type="button" className="bhq-nut chinh" onClick={() => setCaiDat(false)}>Xong</button>}>
          {[['ban', 'Bán hàng (tổng đơn theo nhân viên)'], ['nhap', 'Nhập hàng / chuyển hàng'], ['kho', 'Xuất hủy, xuất dùng nội bộ, kiểm kho'], ['ton', 'Cảnh báo tồn kho']].map(([k, l]) => (
            <label key={k} className="kvm-tb-bat"><span>{l}</span><input type="checkbox" checked={bat[k]} onChange={(e) => setBat((x) => ({ ...x, [k]: e.target.checked }))} /></label>
          ))}
        </Hop>
      )}
      <div className="kvm-tb-loc">
        <label className="kvm-tb-chon"><select value={loai} onChange={(e) => setLoai(e.target.value)} aria-label="Loại thông báo">
          <option value="all">TẤT CẢ</option><option value="ban">BÁN HÀNG</option><option value="kho">KHO HÀNG</option></select><ChevronDown size={16} /></label>
        <button type="button" className="kvm-tb-doc" onClick={onDocHet}>Đọc tất cả</button>
      </div>
      <section className="kvm-tb-ds">
        {hien.map((t) => {
          const Ic = IC[t.loai] || Bell;
          const moi = !daDoc.has(t.id);
          return (
            <button key={t.id} type="button" className={`kvm-tb-dong ${moi ? 'moi' : ''}`} onClick={() => onDoc(t.id)}>
              <Ic size={22} className="ic" />
              <span className="t">
                <span>{t.nguoi && <b>{t.nguoi} </b>}{t.chu} {t.dam && <b>{t.dam} </b>}{t.so != null && <b>{so(t.so)} </b>}{t.cuoi}</span>
                <small>{truoc(t.luc)}</small>
              </span>
              {moi && <i className="cham" aria-label="Chưa đọc" />}
            </button>
          );
        })}
        {!hien.length && <KhongCo chu="Chưa có thông báo nào. Bán hàng, nhập hàng… sẽ hiện ở đây." />}
      </section>
    </main>
  );
}

// ===== ĐÓNG CA LÀM VIỆC — theo KiotViet: (1) Tiền mặt bàn giao thực tế + Ghi chú → Xác nhận;
// (2) xem Phiếu bàn giao ca → "Đóng ca và in". Đóng rồi không mở lại được.
function KetCa({ ca, chiNhanh, hoaDons, thuNos, traHangs, soCa, onDong, onKet }) {
  const [buoc, setBuoc] = useState(1);
  const [dauCa, setDauCa] = useState(String(ca.dauCa || ''));
  const [dem, setDem] = useState('');
  const [ghiChu, setGhiChu] = useState('');
  const soLieu = tinhKetCa({ dauCa, hoaDons, thuNos, traHangs });
  const hopLe = hoaDons.filter((h) => !h.daHuy);
  const theoPt = (ds, truong) => Object.fromEntries(Object.keys(PT).map((k) => [k, ds.filter((x) => x.phuongThuc === k).reduce((s, x) => s + (x[truong] || 0), 0)]));
  const ban = theoPt(hopLe, 'thucThu');
  const thu = theoPt(thuNos, 'tien');
  const tra = theoPt(traHangs, 'tienTra');
  const chenh = (Number(dem) || 0) - soLieu.heThong;
  const phieu = {
    ma: `PGC${String(soCa).padStart(6, '0')}`, nguoi: ca.nguoi, chiNhanh, moLuc: ca.moLuc, dongLuc: Date.now(),
    dauCa: Number(dauCa) || 0, banGiao: Number(dem) || 0, ghiChu: ghiChu.trim(), ban, thu, tra, ghiNo: soLieu.ghiNo,
    soHoaDon: soLieu.soHoaDon, tienMatTrongCa: soLieu.tienMat, cuoiCa: soLieu.heThong, chenh,
  };
  if (buoc === 1) {
    return (
      <Hop tieuDe="Đóng ca làm việc" onDong={onDong}
        chan={<><button type="button" className="bhq-nut phu" onClick={onDong}>Bỏ qua</button><button type="button" className="bhq-nut chinh" disabled={dem === ''} onClick={() => setBuoc(2)}>Xác nhận</button></>}>
        <div className="bhq-bang">
          <div><span>Nhân viên</span><b>{ca.nguoi}</b></div>
          <div><span>Chi nhánh</span><b>{chiNhanh}</b></div>
          <div><span>Mở ca lúc</span><b>{ngayDayDu(ca.moLuc)}</b></div>
        </div>
        <label className="bhq-nhan">Tiền mặt đầu ca<input className="bhq-o" inputMode="numeric" value={dauCa ? so(dauCa) : ''} onChange={(e) => setDauCa(soTien(e.target.value))} placeholder="0" /></label>
        <label className="bhq-nhan">Tiền mặt bàn giao thực tế<input className="bhq-o lon" autoFocus inputMode="numeric" value={dem ? so(dem) : dem} onChange={(e) => setDem(soTien(e.target.value))} placeholder="Đếm tiền trong két rồi nhập" /></label>
        <label className="bhq-nhan">Ghi chú<input className="bhq-o" value={ghiChu} onChange={(e) => setGhiChu(e.target.value)} /></label>
      </Hop>
    );
  }
  const Dong3 = ({ t, k }) => <div className="pgc-3"><span>{t}</span><b>{so(ban[k])}</b><b>{so(thu[k])}</b></div>;
  return (
    <Hop tieuDe="Phiếu bàn giao ca" onDong={onDong}
      chan={<><button type="button" className="bhq-nut phu" onClick={() => setBuoc(1)}>Quay lại</button><button type="button" className="bhq-nut chinh" onClick={() => onKet(phieu)}>Đóng ca và in</button></>}>
      <div className="bhq-bang">
        <div><span>Mã ca</span><b>{phieu.ma}</b></div>
        <div><span>Nhân viên · chi nhánh</span><b>{ca.nguoi} · {chiNhanh}</b></div>
        <div><span>Thời gian</span><b>{gio(ca.moLuc)} → {gio(phieu.dongLuc)}</b></div>
        <div><span>Số hóa đơn</span><b>{soLieu.soHoaDon}</b></div>
      </div>
      <div className="pgc-bang">
        <div className="pgc-3 dau"><span /><span>Bán hàng</span><span>Thu nợ</span></div>
        <Dong3 t="Tiền mặt" k="tien_mat" /><Dong3 t="Chuyển khoản" k="chuyen_khoan" /><Dong3 t="Thẻ" k="the" />
        <div className="pgc-3"><span>Công nợ</span><b>{so(soLieu.ghiNo)}</b><b>—</b></div>
      </div>
      <div className="bhq-bang">
        <div><span>Tiền mặt đầu ca</span><b>{so(phieu.dauCa)}</b></div>
        <div><span>Tiền mặt trong ca</span><b>{so(phieu.tienMatTrongCa)}</b></div>
        <div><span>Tiền mặt cuối ca <small>(hệ thống)</small></span><b>{so(phieu.cuoiCa)}</b></div>
        <div><span>Tiền mặt bàn giao thực tế</span><b>{so(phieu.banGiao)}</b></div>
        <div className="lon"><span>Chênh lệch</span><b className={chenh < 0 ? 'do' : chenh > 0 ? 'cam' : 'xanh-la'}>{chenh > 0 ? '+' : ''}{so(chenh)}</b></div>
      </div>
      {chenh < 0 && <p className="bhq-chenh thieu">Thiếu {so(-chenh)} so với hệ thống — kiểm lại két trước khi đóng ca.</p>}
      {ghiChu && <p className="bhq-ghi">Ghi chú: {ghiChu}</p>}
      <p className="bhq-ghi">Đóng ca rồi sẽ không mở lại được. Phiếu bàn giao ca không sửa được.</p>
    </Hop>
  );
}

function NoiDungBanGiao({ p }) {
  const r = (t, v) => <div className="bl-h"><span>{t}</span><span>{so(v)}</span></div>;
  return (
    <div className="bl">
      <div className="bl-c"><b>SUMI BAKERY · {p.chiNhanh}</b><br /><b className="bl-to">PHIẾU BÀN GIAO CA</b><br />{p.ma}</div>
      <div>Nhân viên: {p.nguoi}</div>
      <div>Ca: {ngayDayDu(p.moLuc)} → {gio(p.dongLuc)}</div>
      <div>Số hóa đơn: {p.soHoaDon}</div>
      <hr />
      <b>Bán hàng</b>{r('Tiền mặt', p.ban.tien_mat)}{r('Chuyển khoản', p.ban.chuyen_khoan)}{r('Thẻ', p.ban.the)}{r('Công nợ', p.ghiNo)}
      <b>Thu nợ</b>{r('Tiền mặt', p.thu.tien_mat)}{r('Chuyển khoản', p.thu.chuyen_khoan)}
      {p.donDat && (Number(p.donDat.tien_mat) || Number(p.donDat.chuyen_khoan)) ? <><b>Đơn đặt (cọc + lấy bánh)</b>{r('Tiền mặt', p.donDat.tien_mat)}{r('Chuyển khoản', p.donDat.chuyen_khoan)}</> : null}
      {p.hoanTien ? r('Trả lại khách (huỷ HĐ ca trước)', -p.hoanTien) : null}
      <hr />
      {r('Tiền mặt đầu ca', p.dauCa)}{r('Tiền mặt trong ca', p.tienMatTrongCa)}{r('Tiền mặt cuối ca', p.cuoiCa)}{r('Bàn giao thực tế', p.banGiao)}
      <div className="bl-h bl-to"><span>Chênh lệch</span><span>{p.chenh > 0 ? '+' : ''}{so(p.chenh)}</span></div>
      {p.ghiChu && <div>Ghi chú: {p.ghiChu}</div>}
      <div className="bl-h" style={{ marginTop: 18 }}><span>Người giao ca</span><span>Người nhận ca</span></div>
    </div>
  );
}

function CongNo({ ds, onThu, du = null }) {
  const tong = ds.reduce((s, k) => s + k.tong, 0);
  return (
    <main className="bhq-ds">
      <h2>Công nợ khách · {ds.length} khách · {so(tong)}</h2>
      <p className="bhq-ghi">Sắp theo nợ lâu nhất. Thu nợ trừ vào hoá đơn cũ nhất trước. Màu: vàng &gt; 30 ngày, đỏ &gt; 90 ngày.{du ? '' : ' (2 khoản đầu là nợ MẪU để xem.)'}</p>
      {ds.map((k) => (
        <div key={k.khach.id} className={`bhq-the ${k.tuoiNo > 90 ? 'no-do' : k.tuoiNo > 30 ? 'no-vang' : ''}`}>
          <div><b>{k.khach.name}</b>{k.khach.phone ? ` · ${k.khach.phone}` : ''}</div>
          <div>{k.soHd} hoá đơn còn nợ · cũ nhất {k.hdCuNhat} · <b>nợ {k.tuoiNo} ngày</b></div>
          <div className="hang"><b>{so(k.tong)}</b><button type="button" className="bhq-nut chinh nho" onClick={() => onThu(k)}>Thu nợ</button></div>
        </div>
      ))}
      {!ds.length && <p className="bhq-rong">Không còn khách nào nợ.</p>}
      {du?.length > 0 && <>
        <h2>Khách đang dư tiền · {du.length}</h2>
        <p className="bhq-ghi">Khách đã trả bớt nợ rồi hoá đơn bị huỷ — tiệm đang giữ tiền của khách. Trả lại hoặc trừ vào lần mua sau.</p>
        {du.map((k) => <div key={k.khach.id} className="bhq-the"><div><b>{k.khach.name}</b>{k.khach.phone ? ` · ${k.khach.phone}` : ''}</div><div className="hang"><b className="xanh-la">Dư {so(k.du)}</b></div></div>)}
      </>}
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
  const thu = Math.min(Number(tien) || 0, no.tong);
  return (
    <Hop tieuDe={`Thu nợ · ${no.khach.name}`} onDong={onDong}
      chan={<button type="button" className="bhq-nut chinh" disabled={!thu} onClick={() => onThu(thu, pt)}>Thu {so(thu)}</button>}>
      <div className="bhq-can-tra">Đang nợ <b>{so(no.tong)}</b></div>
      <div className="bhq-goi">{['tien_mat', 'chuyen_khoan'].map((k) => <button key={k} type="button" className={pt === k ? 'on' : ''} onClick={() => setPt(k)}>{PT[k]}</button>)}</div>
      <label className="bhq-nhan">Số tiền thu<input className="bhq-o lon" inputMode="numeric" value={tien} onChange={(e) => setTien(soTien(e.target.value))} /></label>
    </Hop>
  );
}

// Tổng quan (Giám đốc, điện thoại) — theo app KiotViet: logo + 🔔 · [Hôm nay, dd/mm/yyyy ▾] ·
// thẻ "N hoá đơn / X triệu" + Lợi nhuận ẩn *** (bấm 👁 để hiện) + "N đơn trả hàng - X" · hàng nút tắt ·
// biểu đồ Doanh thu (theo giờ khi xem 1 ngày, theo ngày khi xem nhiều ngày) · Doanh thu theo nhân viên.
const trieu = (n) => (Math.abs(n) >= 1e6 ? [(n / 1e6).toFixed(2).replace(/\.?0+$/, ''), 'triệu'] : [so(n), '']);
function TongQuanDt({ hoaDons, traHangs, onMo, soTb }) {
  const [ky, setKy] = useState('hom_nay');
  const [hienLai, setHienLai] = useState(false);
  const [toBd, setToBd] = useState(false);
  const p2 = (n) => String(n).padStart(2, '0');
  const homNay = new Date();
  const nhanKy = { hom_nay: `Hôm nay, ${p2(homNay.getDate())}/${p2(homNay.getMonth() + 1)}/${homNay.getFullYear()}`, hom_qua: 'Hôm qua', '7_ngay': '7 ngày qua', thang: 'Tháng này', thang_truoc: 'Tháng trước' };
  const hds = hoaDons.filter((h) => !h.daHuy && trongKy(h.luc, ky));
  const tras = traHangs.filter((t) => trongKy(t.luc, ky));
  const doanhThu = hds.reduce((s2, h) => s2 + (h.sauGiam ?? h.tongHang - h.giamHd), 0);
  const tienTra = tras.reduce((s2, t) => s2 + (t.tienTra || 0), 0);
  const loiNhuan = doanhThu - tienTra - hds.reduce((s2, h) => s2 + (h.giaVon || 0), 0);
  const motNgay = ky === 'hom_nay' || ky === 'hom_qua';
  const cot = new Map();
  hds.forEach((h) => { const d = new Date(h.luc); const k = motNgay ? `${d.getHours()}h` : `${p2(d.getDate())}/${p2(d.getMonth() + 1)}`; cot.set(k, (cot.get(k) || 0) + (h.sauGiam ?? h.tongHang)); });
  const cots = [...cot.entries()].reverse();
  // Trục dọc như KiotViet: 0 · 1Tr · 2Tr … (bước tròn, tối đa ~7 vạch).
  const dinh = Math.max(...cots.map(([, v]) => v), 1);
  const buoc = [1e4, 2e4, 5e4, 1e5, 2e5, 5e5, 1e6, 2e6, 5e6, 1e7, 2e7, 5e7, 1e8].find((b) => dinh / b <= 6) || 1e8;
  const lon = (Math.floor(dinh / buoc) + 1) * buoc;
  const vach = Array.from({ length: Math.round(lon / buoc) + 1 }, (_, i) => i * buoc).reverse();
  const nhanTruc = (n) => (n >= 1e6 ? `${+(n / 1e6).toFixed(1)}Tr` : n >= 1e3 ? `${n / 1e3}K` : '0');
  const nv = new Map();
  hds.forEach((h) => nv.set(h.nguoiBan || 'Thu ngân', (nv.get(h.nguoiBan || 'Thu ngân') || 0) + (h.sauGiam ?? h.tongHang)));
  const [dtSo, dtDv] = trieu(doanhThu);
  const tat = [['ban', 'Bán hàng', ShoppingBag], ['pn', 'Nhập hàng', Download], ['kk', 'Kiểm kho', ClipboardCheck], ['no', 'Công nợ', ReceiptText], ['kh', 'Khách hàng', Users]];
  return (
    <div className="kvm-tq2">
      <header className="kvm-tq2-dau">
        <div className="logo"><span>S</span>Sumi Bakery</div>
        <button type="button" aria-label="Thông báo" onClick={() => onMo('tb')}><Bell size={26} />{soTb > 0 && <i className="kvm-nav-dem">{soTb > 99 ? '99+' : soTb}</i>}</button>
        <button type="button" aria-label="Hộp thư" onClick={() => onMo('tb')}><Mail size={26} /></button>
      </header>
      <label className="kvm-ky xam kvm-tq2-ky"><select value={ky} onChange={(e) => setKy(e.target.value)} aria-label="Thời gian">{Object.entries(nhanKy).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select><ChevronDown size={16} /></label>
      <div className="kvm-tq2-the">
        <div className="hai">
          <div><small>{hds.length} hoá đơn</small><p className="so-lon"><b>{dtSo}</b> {dtDv}</p></div>
          <div><small>Lợi nhuận <button type="button" aria-label={hienLai ? 'Ẩn lợi nhuận' : 'Hiện lợi nhuận'} onClick={() => setHienLai((v) => !v)}>{hienLai ? <Eye size={20} /> : <EyeOff size={20} />}</button></small>
            <p className="lai">{hienLai ? so(loiNhuan) : '*** ***'}</p></div>
        </div>
      </div>
      <div className="kvm-tq2-tat">
        {tat.map(([k, l, Ic]) => <button key={k} type="button" onClick={() => onMo(k)}><span><Ic size={24} /></span>{l}</button>)}
      </div>
      <section className="kvm-tq2-bd">
        <button type="button" className="tieu-de" onClick={() => onMo('ls')}><h2>Doanh thu</h2><ChevronRight size={22} /></button>
        <div className="kvm-bd-cu">
          <span className="on" aria-label="Biểu đồ cột"><ChartColumn size={22} /></span>
          <button type="button" aria-label={toBd ? 'Thu nhỏ biểu đồ' : 'Phóng to biểu đồ'} onClick={() => setToBd((v) => !v)}>{toBd ? <Minimize2 size={22} /> : <Maximize2 size={22} />}</button>
        </div>
        {cots.length ? (
          <div className={`kvm-bd ${toBd ? 'to' : ''}`}>
            <div className="truc">{vach.map((v) => <span key={v}>{nhanTruc(v)}</span>)}</div>
            <div className="vung">
              {vach.map((v) => <i key={v} className="luoi" style={{ bottom: `${(v / lon) * 100}%` }} />)}
              <div className="cot-ds">
                {cots.map(([k, v]) => (
                  <div key={k} className="cot" title={`${k}: ${so(v)}`}><i style={{ height: `${Math.max((v / lon) * 100, 1)}%` }} /><small>{k}</small></div>
                ))}
              </div>
            </div>
          </div>
        ) : <p className="mo">Chưa có doanh thu trong {nhanKy[ky].toLowerCase()}.</p>}
      </section>
      <section className="kvm-tq2-bd">
        <h2>Doanh thu theo nhân viên</h2>
        {[...nv.entries()].sort((a, b) => b[1] - a[1]).map(([ten, v]) => <div key={ten} className="r"><span>{ten}</span><b>{so(v)}</b></div>)}
        {!nv.size && <p className="mo">Chưa có.</p>}
      </section>
      <h3 className="kvm-tq2-bc">Báo cáo cuối ngày (hôm nay)</h3>
    </div>
  );
}

function CuoiNgay({ chiNhanh, bc, dienThoai, laGD, onMo, hoaDonsCN = [], traHangsCN = [], soTb = 0 }) {
  const Dong = ({ t, v, lon }) => <div className={lon ? 'lon' : ''}><span>{t}</span><b>{v}</b></div>;
  return (
    <main className={`bhq-ds ${dienThoai ? 'kvm-tq' : ''}`}>
      {dienThoai ? (
        <TongQuanDt hoaDons={hoaDonsCN} traHangs={traHangsCN} onMo={onMo} soTb={soTb} />
      ) : <h2>Báo cáo cuối ngày · {chiNhanh} · {new Date().toLocaleDateString('vi-VN')}</h2>}
      <div className="bhq-luoi-bc">
        <div className="bhq-the bhq-bang">
          <h3>Bán hàng</h3>
          <Dong t="Số hoá đơn (đã huỷ)" v={`${bc.soHoaDon} (${bc.soHuy})`} />
          <Dong t="Tổng tiền hàng" v={so(bc.tongHang)} />
          <Dong t="Giảm giá" v={`−${so(bc.giamGia)}`} />
          <Dong t="Doanh thu thuần" v={so(bc.doanhThuThuan)} lon />
          <Dong t="Thu khác (ship, phụ thu…)" v={so(bc.thuKhac)} />
          <Dong t="VAT 8% thu hộ" v={so(bc.vat)} />
        </div>
        <div className="bhq-the bhq-bang">
          <h3>Tiền thu</h3>
          <Dong t="Tiền mặt" v={so(bc.tienMat)} />
          <Dong t="Chuyển khoản" v={so(bc.chuyenKhoan)} />
          <Dong t="Thẻ" v={so(bc.the)} />
          <Dong t="Ghi nợ mới" v={so(bc.ghiNo)} />
          <Dong t="Thu nợ cũ" v={so(bc.thuNo)} />
        </div>
        <div className="bhq-the bhq-bang">
          <h3>Hàng hoá</h3>
          <Dong t="Nhập hàng (bếp giao)" v={`${bc.giao.sl} cái`} />
          <Dong t="Xuất huỷ" v={`${bc.huy.sl} cái · ${so(bc.huy.giaTri)}`} />
          <Dong t="Xuất dùng nội bộ" v={`${bc.noibo.sl} cái · ${so(bc.noibo.giaTri)}`} />
        </div>
        {laGD && <div className="bhq-the bhq-bang">
          <h3>Lãi gộp <small>(chỉ Giám đốc thấy)</small></h3>
          <Dong t="Doanh thu thuần" v={so(bc.doanhThuThuan)} />
          <Dong t="Giá vốn hàng bán" v={`−${so(bc.giaVon)}`} />
          <Dong t="Lãi gộp" v={so(bc.laiGop)} lon />
          <Dong t="Hàng huỷ (theo giá vốn)" v={`−${so(bc.huy.giaTri)}`} />
        </div>}
      </div>
    </main>
  );
}
