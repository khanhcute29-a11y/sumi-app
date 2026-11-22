import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowLeft, ArrowLeftRight, Check, ChevronDown, ChevronLeft, ChevronRight, CirclePlus, Clock, EllipsisVertical, Filter, Image as IconAnh,
  List, Menu, Minus, Pencil, PersonStanding, Plus, Printer, ReceiptText, Repeat, ScanBarcode, Search, ShoppingBag, Tag,
  Trash2, User, X, Zap, Copy, LayoutGrid, Save, SquarePen, CircleUser, Warehouse, Share2, ClipboardCheck, Package, House,
  Eye, EyeOff, Mail, ChartArea, FileText, FileClock, ArrowDownUp, Box, Ellipsis, PackageMinus, Bell, Truck, Users, ShoppingCart, Download,
  ListFilter, ChartColumn, Maximize2, Minimize2, Settings, Info, ChevronUp, CircleCheck, ListChecks, RefreshCw, Banknote, Gift, RotateCcw,
} from 'lucide-react';

// Rời máy bán hàng, quay về trang chủ app Sumi (nút "Bán tại quầy" ở màn Hôm nay mở vào đây).
const veApp = () => { window.location.href = '/'; };
import { supabase } from '../../../lib/supabaseClient';
import {
  CHI_NHANH, DANH_MUC, THU_KHAC_GOI_Y, LOAI_PHIEU, LY_DO_HUY, LY_DO_HUY_HD, LOAI_NOI_BO, LUAN_CHUYEN,
  taoMatHang, nhomCo, tenNhomHang, tonGia, tienDong, tinhHoaDon, tinhThanhToan, duaCua, tongChia, PT_CHIA, tinhKetCa, apPhieuKho, tinhCongNo, baoCaoNgay, khop, locXep, docSoTien, kmApDuoc,
} from './banHangQuayLogic';
import {
  kiemTraThat, taiDuLieu, taiLo, taiViecCho, laKeToan, goi, goiHoacXep, xepHang, dsCho, guiHangDoi, demCho, boViecLoi, guiLaiViecLoi, laLoiMang, chuLoi, maMoi, tachId,
  LOAI_LEN_DB, phieuTuDb, lapBanDoHang, congNoTuDb, taiAnh, docAnhBan, taiAnhDaNen,
} from './posThat';
import {
  HopT, MoCa, NhanCa, XinDuyet, ViecCho, QrChuyenKhoan, ThietLapQuay, DatCoc, LayBanhDat, NhanHang, ChupAnh, NhatKy, BaoCaoThat, KetCaThat, DoanhSoNv, XepHang, BaoCaoCuoiNgay, HangQuay, ChiKet, SoQuy, KmChon, KhuyenMai, InTem, TraHang, TraHangDs,
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
const PT = { tien_mat: 'Tiền mặt', chuyen_khoan: 'Chuyển khoản', the: 'Thẻ', vi: 'Ví', ket_hop: 'Kết hợp' }; // như KiotViet (Ví = MoMo/ZaloPay…)
const NGAY = 86400000;
// Trả tiền kết hợp: chọn "Kết hợp" → mặc định cả số cần trả vào Tiền mặt, thu ngân chia lại cho từng cách.
const chonPt = (k, hd, canTra) => (k === 'ket_hop'
  ? { pt: k, dua: null, chia: hd.chia && tongChia(hd.chia) > 0 ? hd.chia : { tien_mat: canTra } }
  : { pt: k, dua: null });
const chiaGui = (chia) => Object.fromEntries(PT_CHIA.map((k) => [k, Math.max(Math.round(Number(chia?.[k]) || 0), 0)]).filter(([, v]) => v > 0));
// Số thật lưu trên hoá đơn: phần tiền mặt trừ đi tiền thừa đã thối.
const chiaThat = (chia, thua) => { const c = chiaGui(chia); if (thua > 0) c.tien_mat = (c.tien_mat || 0) - thua; return Object.fromEntries(Object.entries(c).filter(([, v]) => v > 0)); };
const chuChia = (chia) => Object.entries(chia || {}).filter(([, v]) => Number(v) > 0).map(([k, v]) => `${PT[k]} ${so(v)}`).join(' + ');
function ChiaTien({ hd, canTra, onSua }) {
  const chia = hd.chia || {};
  const tong = tongChia(chia);
  const con = canTra - tong;
  return (
    <div className="kv-chia" role="group" aria-label="Chia tiền theo từng cách trả">
      {PT_CHIA.map((k) => (
        <label key={k} className="r">
          <span>{PT[k]}</span>
          <input className="kv-gach" inputMode="numeric" value={chia[k] ? so(chia[k]) : ''} placeholder="0" aria-label={`Trả bằng ${PT[k]}`}
            onFocus={(e) => e.target.select()}
            onChange={(e) => onSua({ chia: { ...chia, [k]: Number(soTien(e.target.value)) || 0 } })} />
          {con > 0 && !chia[k] && <button type="button" className="kv-chia-phan" onClick={() => onSua({ chia: { ...chia, [k]: con } })}>+{so(con)}</button>}
        </label>
      ))}
      <div className={`kv-chia-con ${con > 0 ? 'thieu' : ''}`}>{con > 0 ? `Còn thiếu ${so(con)}` : con < 0 ? `Dư ${so(-con)} (thối tiền mặt)` : 'Đủ số khách cần trả'}</div>
    </div>
  );
}
const MOI_TRANG = 15; // KiotViet: 15 hàng / trang ở chế độ Bán thường
const MAU_ANH = ['#F9C6D3', '#C9DCF7', '#F8D9B5', '#CDE8D2', '#E3D3F5', '#F7E3A8'];
// Thanh quản lý giống KiotViet: Hóa đơn · Hàng hóa ▾ (Danh sách hàng hóa | Kiểm kho · Xuất dùng nội bộ · Xuất hủy) · Nhập hàng · Công nợ · Báo cáo.
const TEN_DT = { ls: 'Hóa đơn', hh: 'Hàng hóa', pn: 'Nhập hàng', xh: 'Xuất hủy', xd: 'Xuất dùng nội bộ', kk: 'Kiểm kho', ch: 'Chuyển hàng', kh: 'Khách hàng', no: 'Công nợ', ngay: 'Báo cáo cuối ngày', cn: 'Báo cáo cuối ngày', them: 'Nhiều hơn' };
// Các màn con mở từ "Nhiều hơn" (có nút ← quay lại).
const MAN_CON = ['pn', 'xh', 'xd', 'kk', 'ch', 'kh', 'no', 'cn', 'sq', 'km', 'tem', 'th'];
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
  // Nhớ quầy theo từng máy (mỗi quầy thường dùng máy riêng) — mở app lần sau vẫn đúng quầy, không nhảy về Vĩnh Phú 42.
  const [chiNhanh, setChiNhanh] = useState(() => { const c = docLuu('bhq-chi-nhanh', ''); return CHI_NHANH.includes(c) ? c : CHI_NHANH[0]; });
  useEffect(() => { ghiLuu('bhq-chi-nhanh', chiNhanh); }, [chiNhanh]);
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
  const [traHangs, setTraHangs] = useState([]); // phiếu trả hàng thật (migration 202611221046)
  const [coTraHang, setCoTraHang] = useState(false); // database đã có bảng trả hàng chưa
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
  const [daDoc, setDaDoc] = useState(() => new Set());
  const [trang, setTrang] = useState(0);
  const [bao, setBao] = useState(null); // { msg, hoaDon? }
  const [banIn, setBanIn] = useState(null); // nội dung đang gửi ra máy in (#bhq-in)
  const [bayGio, setBayGio] = useState(() => Date.now());
  const timRef = useRef(null);
  const khachRef = useRef(null);
  const daNhacHet = useRef(new Set()); // món đã nhắc "hết tồn trên máy" trong phiên
  const duaRef = useRef(null);
  const baoHen = useRef(null);
  const demHd = useRef(1);
  const ton = tonCN[chiNhanh] || {};
  // ── CHẠY THẬT: bật khi cờ pos_ban_hang_that mở cho tài khoản này (xem posThat.js). Tắt → vẫn là bản xem trước như cũ.
  const [that, setThat] = useState(null); // { cap: 'gd' | 'ql' | 'nv', uid }
  // Giám đốc: chạy thật thì do database quyết (pos_cap_do — gồm cả danh sách GĐ của quầy); bản xem trước thì theo vai trò owner.
  const laChu = that ? that.cap === 'gd' : vaiTro === 'owner';
  const laGD = laChu && !xemNV;
  const [lyDoXemTruoc, setLyDoXemTruoc] = useState('');
  // Đã đăng nhập nhưng tài khoản chưa được bật bán thật → đang ở bản xem trước: nói to, kẻo nhân viên nhập cả buổi mà không lưu.
  const chuaBatThat = !that && /cờ pos_ban_hang_that đang tắt|tài khoản chưa được duyệt/.test(lyDoXemTruoc);
  const [laKT, setLaKT] = useState(false);
  const [caiDat, setCaiDat] = useState({});
  const [caMoDs, setCaMoDs] = useState({});
  const [hsd, setHsd] = useState({});
  const [loCN, setLoCN] = useState({}); // lô có HSD theo cửa hàng: { [ma]: { quaHan, homNay } }
  const [hanDung, setHanDung] = useState({}); // số ngày bán được theo product_id
  const [bangGia, setBangGia] = useState([]);
  const [khuyenMai, setKhuyenMai] = useState([]); // chương trình khuyến mại (bảng pos_promotions)
  const [noDb, setNoDb] = useState({ ds: [], du: [] });
  const [viec, setViec] = useState({ duyet: [], ck: [], ca: [] });
  const [hdCho, setHdCho] = useState([]); // hoá đơn bán lúc mất mạng, đang đợi gửi
  const [soCho, setSoCho] = useState(0);
  const [viecLoi, setViecLoi] = useState([]); // việc làm lúc mất mạng mà database từ chối — giữ lại, chờ người xử lý
  const [mang, setMang] = useState(() => typeof navigator === 'undefined' || navigator.onLine !== false);
  const [diemKhach, setDiemKhach] = useState({});
  const [dangBan, setDangBan] = useState(false);
  // Ảnh bán hàng theo từng hoá đơn đang mở: { [hd.id]: { blob, ma, url } } — chỉ nằm trên máy tới lúc thanh toán.
  const [anhBan, setAnhBan] = useState({});
  const [dangAnhBan, setDangAnhBan] = useState(false);
  const daBan = useMemo(() => (hdCho.length ? [...hdCho.filter((c) => !daBanDb.some((x) => x.id === c.id)), ...daBanDb] : daBanDb), [hdCho, daBanDb]);
  const caMo = caMoDs[chiNhanh] || null;
  const cd = caiDat[chiNhanh] || null;
  const quanLy = !!that && (that.cap === 'gd' || that.cap === 'ql');
  // Giám đốc bán luôn, không bắt vào ca (database cũng chỉ bắt nhân viên). Đang có ca người khác mở thì
  // hoá đơn vẫn vào ca đó (tiền vào két) nhưng không tính doanh số cho người đó; không có ca thì tiền Giám đốc tự giữ.
  const banKhongCa = !!that && that.cap === 'gd';
  const xemQl = that ? quanLy && !xemNV : laGD; // được xem báo cáo / công nợ / nhật ký
  const soViec = viec.duyet.length + viec.ck.length + viec.ca.length;
  const napThat = async (mh = matHang) => {
    try {
      const d = await taiDuLieu(mh);
      setCaiDat(d.caiDat); setCaMoDs(d.caMo); setDaBan(d.daBan); setPhieuKho(d.phieuKho); setNoDb(d.congNo);
      setTonCN(d.tonCN); setHsd(d.hsd); setLoCN(d.loCN || {}); setHanDung(d.hanDung || {}); setBangGia(d.bangGia); setKhuyenMai(d.khuyenMai || []); setTraHangs(d.traHangs || []); setCoTraHang(!!d.coTraHang); setNguonDl('dữ liệu thật');
      return d;
    } catch (e) { nhan(`Không tải được dữ liệu quầy: ${chuLoi(e)}`); return null; }
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
          // Hàng KiotViet ~800 món + hàng của app: tải từng trang 1000 (database giới hạn 1000 dòng/lần).
          const data = []; let error = null;
          for (let tu = 0; tu < 20000; tu += 1000) {
            const r = await supabase.from('products').select('*, product_variants(*)').eq('active', true).order('created_at').order('id').range(tu, tu + 999);
            if (r.error) { error = r.error; break; }
            data.push(...(r.data || []));
            if ((r.data || []).length < 1000) break;
          }
          if (!error && data.length) { sp = data; nguon = `${data.length} sản phẩm thật (chỉ đọc)`; }
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
        dsCho().then((cho) => { if (huy) return; setHdCho(cho.filter((v) => v.banGhi).map((v) => (v.loi ? { ...v.banGhi, guiLoi: v.loi } : v.banGhi))); setViecLoi(cho.filter((v) => v.loi)); });
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
      const { conLai: truoc } = await demCho();
      if (truoc) {
        const { conLai } = await guiHangDoi(({ viec: v, kq, loi }) => {
          if (v.ham === 'pos_ban') setHdCho((x) => (loi ? x.map((h) => (h.id === v.khoa ? { ...h, guiLoi: loi } : h)) : x.filter((h) => h.id !== v.khoa)));
          if (loi) nhan(`Có việc làm lúc mất mạng gửi không được — đã giữ lại trên máy, báo Quản lý xem: ${loi}`);
          else if (v.ham === 'pos_ban' && kq?.code) nhan(`Đã gửi hoá đơn bán lúc mất mạng → ${kq.code}${kq.canh_bao?.length ? ' · có điểm lệch, Giám đốc đã được báo' : ''}`);
        });
        if (!dung) setSoCho(conLai);
        if (conLai < truoc) napThat();
      } else setSoCho(0);
      const cho = await dsCho();
      if (!dung) {
        setViecLoi(cho.filter((x) => x.loi));
        setHdCho((ds) => ds.map((h) => { const c = cho.find((x) => x.khoa === h.id); return c?.loi && h.guiLoi !== c.loi ? { ...h, guiLoi: c.loi } : h; }));
      }
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
  // Khuyến mại (chạy thật): tính giống hệt database. hd.km: undefined = tự chọn lợi nhất · null = không áp · id = đã chọn.
  const donGiaDong = (d) => (d.sl ? Math.round(tienDong(d) / d.sl) : d.gia);
  const giaBg = (m) => (bangGia.find((b) => b.id === hd.bangGia)?.gia?.[m.ma]) || m.gia;
  const mhCua = (x) => matHang.find((m) => { const t = tachId(m); return t.product_id === x.product_id && (!x.variant_id || t.variant_id === x.variant_id); });
  const kmDs = that && hd.dong.length && khuyenMai.length
    ? kmApDuoc(khuyenMai, hd.dong.map((d) => { const t = tachId(d.id ? d : matHang.find((m) => m.ma === d.ma)); return { product_id: t.product_id, variant_id: t.variant_id, sl: d.sl, donGia: donGiaDong(d), eod: !!d.eod }; }),
      { chiNhanh, luc: bayGio, giaTang: (t) => { const m = mhCua(t); return m ? giaBg(m) * t.sl : 0; } })
      .map((x) => (x.tang && !mhCua(x.tang) ? { ...x, duoc: false, thieu: 'Món tặng không còn bán ở quầy' } : x))
    : [];
  const kmChon = hd.km === null ? null : (hd.km ? kmDs.find((x) => x.k.id === hd.km && x.duoc) : kmDs.find((x) => x.duoc)) || null;
  const mTang = kmChon?.tang ? mhCua(kmChon.tang) : null;
  const dongTang = mTang ? [{ ...mTang, gia: giaBg(mTang), sl: kmChon.tang.sl, giam: giaBg(mTang), giamKieu: 'vnd', tang: true, ghiChu: 'Tặng (khuyến mại)' }] : [];
  const tongGoc = tinhHoaDon({ ...hd, kmTien: kmChon?.tien || 0 });
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
    const q = loCN[chiNhanh]?.[ma]?.quaHan;
    if (q > 0) return <i className="kv-hsd het">Quá hạn {q}</i>;
    const con = ngayConHsd(ma);
    if (con == null || con > 1) return null;
    return <i className={`kv-hsd ${con <= 0 ? 'het' : ''}`}>{con < 0 ? 'Quá hạn' : con === 0 ? 'HSD hôm nay' : 'HSD mai'}</i>;
  };
  const gioVN = new Date(bayGio).toTimeString().slice(0, 5);
  const eodDuoc = !!(that && cd && gioVN >= String(cd.eod_from || '20:00').slice(0, 5));
  const coEod = hd.dong.some((d) => d.eod);
  // Cần xuất hủy: bánh quá hạn (luôn hiện) + bánh hết hạn hôm nay (chỉ hiện từ giờ giảm giá cuối ngày).
  const canHuy = that ? matHang.map((m) => ({ m, ...(loCN[chiNhanh]?.[m.ma] || {}) }))
    .filter((x) => x.quaHan > 0 || x.homNay > 0) : [];
  const soQuaHan = canHuy.reduce((a, x) => a + (x.quaHan || 0), 0);
  const soHomNay = canHuy.reduce((a, x) => a + (x.homNay || 0), 0);
  const hienCanHuy = soQuaHan > 0 || (eodDuoc && soHomNay > 0);
  // Phiếu hàng chờ quầy này đếm + bấm Nhận (bếp giao / cửa hàng khác chuyển sang) — nhắc nổi như KiotViet báo chuyển hàng.
  const soChoNhan = that ? phieuKho.filter((p) => p.loai === 'giao' && p.trangThai === 'cho' && p.chiNhanh === chiNhanh).length : 0;
  const lamPhieuHuy = (caHomNay) => {
    const dong = canHuy.map((x) => ({ ma: x.m.ma, sl: (x.quaHan || 0) + (caHomNay ? x.homNay || 0 : 0) })).filter((d) => d.sl > 0);
    setHop(null); moForm('huy', { dong, ghiChu: 'Hết hạn sử dụng' });
  };
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

  // Chạy thật: thêm / sửa / xoá món của quầy xong (database đã lưu) → cập nhật danh sách trên máy này.
  const xongHangQuay = (row, kieu) => {
    const cu = hop?.cu;
    setHop(null);
    if (kieu === 'xoa') { setMatHang((ds) => ds.filter((x) => x.pid !== cu?.pid)); nhan(`Đã xoá ${cu?.ma || ''} khỏi quầy`); return; }
    const moi = taoMatHang([{ ...row, active: true }])[0];
    if (!moi) return;
    if (kieu === 'sua') { setMatHang((ds) => ds.map((x) => (x.pid === moi.pid ? moi : x))); nhan(`Đã sửa ${moi.ma}`); return; }
    setMatHang((ds) => [moi, ...ds]);
    nhan(`Đã thêm ${moi.ma} — ${moi.ten}. Vào Kiểm kho để nhập số tồn.`);
  };
  const dsNhomQuay = useMemo(() => [...new Set(matHang.filter((x) => x.posCode).map((x) => x.danhMuc))].sort((a, b) => a.localeCompare(b, 'vi')), [matHang]);

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
  const dmCo = useMemo(() => nhomCo(matHang), [matHang]);
  const soTrang = Math.max(Math.ceil(monLoc.length / MOI_TRANG), 1);
  const trangHien = Math.min(trang, soTrang - 1);
  const slTrongGio = useMemo(() => Object.fromEntries(hd.dong.map((d) => [d.ma, d.sl])), [hd]);

  const loQuay = loCN[chiNhanh] || {};
  const themMon = (m) => {
    const lo = loQuay[m.ma];
    if (that && lo?.quaHan > 0 && (ton[m.ma] ?? 0) - lo.quaHan - (slTrongGio[m.ma] || 0) <= 0) {
      nhan(`⛔ ${m.ten}: còn ${lo.quaHan} cái QUÁ HẠN, hết bánh còn hạn — không bán cho khách. Xuất hủy bánh quá hạn.`);
      return;
    }
    suaHd((h) => {
      const co = h.dong.find((d) => d.ma === m.ma);
      const dong = co ? h.dong.map((d) => (d.ma === m.ma ? { ...d, sl: d.sl + 1 } : d))
        : [...h.dong, { id: m.id, ma: m.ma, ten: m.ten, size: m.size, gia: giaCua(m), giaVon: m.giaVon, sl: 1, giam: 0, giamKieu: 'vnd', ghiChu: '', danhMuc: m.danhMuc, anh: m.anh }];
      return { ...h, dong, dua: null };
    });
    const hsdCon = ngayConHsd(m.ma);
    if (lo?.quaHan > 0) nhan(`⚠️ Kệ còn ${lo.quaHan} cái ${m.ten} QUÁ HẠN — lấy bánh mới cho khách, bánh cũ để xuất hủy`);
    else if (!lo && hsdCon != null && hsdCon < 0) nhan(`⚠️ ${m.ten} trong kho đã QUÁ HẠN — kiểm lại bánh trước khi bán`);
    else if ((ton[m.ma] ?? 0) - (slTrongGio[m.ma] || 0) <= 0 && !daNhacHet.current.has(m.ma)) {
      // Như KiotViet vẫn cho bán khi hết tồn; chỉ nhắc 1 lần mỗi món trong phiên cho đỡ phiền.
      daNhacHet.current.add(m.ma);
      nhan(`${m.ten} đã hết tồn trên máy — vẫn bán được, cuối ngày nhớ kiểm kho`);
    }
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
    if (!caMo && !banKhongCa) { nhan('Chưa mở ca — nhập tiền đầu ca trước khi bán'); setManHinh('ban'); return; }
    const dua = duaCua(hd, tong.canTra);
    const tt = tinhThanhToan({ canTra: tong.canTra, khachDua: dua, phuongThuc: hd.pt, laKhachLe: !hd.khach.id, chia: hd.chia });
    if (tt.loi) { nhan(tt.loi); return; }
    const donGia = (d) => (d.sl ? Math.round(tienDong(d) / d.sl) : d.gia);
    const goc = hd.dong.reduce((a, d) => a + d.gia * d.sl, 0);
    const giam = hd.dong.filter((d) => !d.eod).reduce((a, d) => a + (d.gia - donGia(d)) * d.sl, 0) + tong.giamHd;
    const pct = goc ? (giam * 100) / goc : 0;
    const xinGiam = () => setHop({ loai: 'xin_duyet', kind: 'giam_gia', payload: { tien: Math.round(giam), mo_ta: `${nguoi} xin giảm ${so(giam)} (${pct.toFixed(1)}%) cho hoá đơn ${so(goc)}${hd.khach.id ? ` · ${hd.khach.name}` : ''}` } });
    if (that.cap === 'nv' && pct > Number(cd?.staff_discount_pct ?? 0) && !duyetId) { xinGiam(); return; }
    const anh = anhBan[hd.id];
    if (!anh) { nhan('Chọn 1 ảnh bán hàng (ảnh bánh, tiền mặt hoặc màn hình chuyển khoản) rồi mới thanh toán'); return; }
    const p = {
      id: hd.id, store: chiNhanh, customer_id: hd.khach.id || null, price_list_id: hd.bangGia || null,
      lines: [...hd.dong.map((d) => { const t = tachId(d.id ? d : matHang.find((m) => m.ma === d.ma)); return { product_id: t.product_id, variant_id: t.variant_id, size: d.size || null, name: d.ten, qty: d.sl, list_price: d.gia, unit_price: donGia(d), eod: !!d.eod, note: d.ghiChu || null }; }),
        ...dongTang.map((d) => { const t = tachId(d); return { product_id: t.product_id, variant_id: t.variant_id, size: d.size || null, name: d.ten, qty: d.sl, list_price: d.gia, unit_price: 0, km: true, note: null }; })],
      promo_id: kmChon?.k.id || null, promo_discount: kmChon?.tien || 0,
      invoice_discount: tong.giamHd, other_fees: hd.thuKhac, vat: !!hd.vat, points_used: diemDung, pay_method: hd.pt, ...(hd.pt === 'ket_hop' ? { pay_parts: chiaGui(hd.chia) } : {}),
      received: Number(dua) || 0, note: hd.ghiChu || null, seller_name: hd.nguoiBan || nguoi, approval_id: duyetId || null,
      client_created_at: new Date().toISOString(), shift_id: caMo?.id || null, photo_url: null, photo_hash: anh.ma || null,
    };
    const banGhi = {
      id: hd.id, luc: Date.now(), chiNhanh, thuNgan: nguoi, nguoiBan: hd.nguoiBan || nguoi, khach: hd.khach, dong: [...hd.dong, ...dongTang],
      thuKhacDong: hd.thuKhac, ghiChu: hd.ghiChu, ...tong, giamHd: tong.giamHd + (tong.kmTien || 0), phuongThuc: hd.pt, khachDua: Number(dua) || 0, ...tt, daHuy: false, that: true, caId: caMo?.id || null,
      kmTen: kmChon?.k.name || null, kmGiam: (kmChon?.tien || 0) + dongTang.reduce((a, d) => a + d.gia * d.sl, 0),
      chia: hd.pt === 'ket_hop' ? chiaThat(hd.chia, tt.thua) : null,
      bangGia: bgHd?.ten || null, ckTrangThai: (hd.pt === 'chuyen_khoan' || (hd.pt === 'ket_hop' && Number(hd.chia?.chuyen_khoan) > 0)) && tt.thucThu > 0 ? 'cho_xac_nhan' : 'khong',
    };
    const boAnh = () => { try { URL.revokeObjectURL(anh.url); } catch { /* bỏ qua */ } setAnhBan((x) => { const y = { ...x }; delete y[hd.id]; return y; }); };
    setDangBan(true);
    try {
      p.photo_url = await taiAnhDaNen(anh.blob, 'ban');
      const kq = await goi('pos_ban', { p });
      boAnh();
      const ghi = { ...banGhi, ma: kq.code, canTra: Number(kq.total), diemCong: kq.points_earned || 0 };
      setDaBan((ds) => [ghi, ...ds.filter((x) => x.id !== ghi.id)]);
      ghiKho(chiNhanh, [...hd.dong, ...dongTang].map((d) => ({ ma: d.ma, sl: -d.sl })), kq.code, 'Bán hàng');
      taiLo(matHang).then((l) => { if (l) setLoCN(l); }).catch(() => {});
      if (tt.no > 0) napNo();
      if (hd.khach.id) setDiemKhach((x) => { const y = { ...x }; delete y[hd.khach.id]; return y; });
      baoXong(ghi, tt, kq.points_earned ? `Thanh toán thành công ${kq.code} · ${so(kq.total)} · khách +${kq.points_earned} điểm` : null);
    } catch (e) {
      if (laLoiMang(e)) {
        const ghi = { ...banGhi, ma: `TẠM-${hd.id.slice(0, 4).toUpperCase()}`, choGui: true };
        // Ảnh chưa lên được thì giữ ảnh trên máy, có mạng tải ảnh trước rồi mới gửi hoá đơn.
        await xepHang({ ham: 'pos_ban', thamSo: { p: { ...p, offline: true } }, khoa: hd.id, banGhi: ghi, ...(p.photo_url ? {} : { anh: anh.blob }) });
        boAnh();
        setHdCho((x) => [ghi, ...x]); setSoCho((n) => n + 1);
        ghiKho(chiNhanh, [...hd.dong, ...dongTang].map((d) => ({ ma: d.ma, sl: -d.sl })), ghi.ma, 'Bán hàng (chờ gửi)');
        baoXong(ghi, tt, `Mất mạng — đã giữ hoá đơn ${so(tong.canTra)} trên máy, có mạng sẽ tự gửi. Cứ bán tiếp.`);
      } else {
        const m = chuLoi(e);
        if (/Xin duyệt/.test(m)) xinGiam(); else nhan(m);
        if (/[Kk]huyến mại|Hàng tặng|tặng/.test(m)) napThat();
      }
    } finally { setDangBan(false); }
  };

  const hoanTat = () => {
    if (that) { hoanTatThat(); return; }
    if (!hd.dong.length) return;
    const dua = duaCua(hd, tong.canTra);
    const tt = tinhThanhToan({ canTra: tong.canTra, khachDua: dua, phuongThuc: hd.pt, laKhachLe: !hd.khach.id, chia: hd.chia });
    if (tt.loi) { nhan(tt.loi); return; }
    const ma = `HD${String(daBan.filter((h) => !h.mau).length + 1).padStart(6, '0')}`;
    const banGhi = {
      ma, luc: Date.now(), chiNhanh, thuNgan: nguoi, nguoiBan: hd.nguoiBan || nguoi, khach: hd.khach, dong: hd.dong,
      thuKhacDong: hd.thuKhac, ghiChu: hd.ghiChu, ...tong, phuongThuc: hd.pt, khachDua: Number(dua) || 0, ...tt, daHuy: false,
      chia: hd.pt === 'ket_hop' ? chiaThat(hd.chia, tt.thua) : null,
    };
    setDaBan((ds) => [banGhi, ...ds]);
    ghiKho(chiNhanh, hd.dong.map((d) => ({ ma: d.ma, sl: -d.sl })), ma, 'Bán hàng');
    baoXong(banGhi, tt);
  };

  const inTamTinh = () => {
    if (!hd.dong.length) return;
    setBanIn({
      ...tong, ma: 'TẠM TÍNH', tamTinh: true, luc: Date.now(), chiNhanh, thuNgan: nguoi, khach: hd.khach,
      dong: [...hd.dong, ...dongTang], thuKhacDong: hd.thuKhac, ghiChu: hd.ghiChu, giamHd: tong.giamHd + (tong.kmTien || 0),
      kmTen: kmChon?.k.name || null, kmGiam: (kmChon?.tien || 0) + dongTang.reduce((a, d) => a + d.gia * d.sl, 0),
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
      else if (k === 'F4') {
        e.preventDefault();
        // Ô khách vẽ ở 2 chỗ (cột phải + khung thanh toán): đóng khung là ref về null → F4 câm.
        // Lấy ô khách đang hiện, ưu tiên ô trong khung thanh toán (vẽ sau).
        const ds = [...document.querySelectorAll('.bhq .kv-khach input')].filter((i) => i.offsetParent);
        (ds[ds.length - 1] || khachRef.current)?.focus();
      }
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
  const huyDuoc = (h) => h.chiNhanh === chiNhanh && (that ? !h.daHuy && !traHangs.some((x) => x.hdId === h.id) : (laGD || h.luc >= ca.moLuc));
  // Trả hàng: chỉ hoá đơn thật đã lên database (database đã chạy SQL trả hàng).
  const traDuoc = (h) => !!(that && coTraHang && h.that && h.id && !h.daHuy && !h.choGui);
  // Hoá đơn vừa bán xong trên máy chưa có mã dòng hàng của database → tải lại rồi mới mở màn trả hàng.
  const moTraHang = async (h) => {
    if (h.dong.some((d) => d.lineId != null)) { setHop({ loai: 'tra_hang', hoaDon: h }); return; }
    const d = await napThat();
    const moi = d?.daBan.find((x) => x.id === h.id);
    if (moi && moi.dong.some((x) => x.lineId != null)) setHop({ loai: 'tra_hang', hoaDon: moi });
    else nhan('Hoá đơn đang lưu lên máy chủ — thử lại sau vài giây');
  };
  const huyHoaDonThat = async (h, lyDo, duyetId = null) => {
    if (h.choGui) { nhan('Hoá đơn này chưa gửi lên (đang mất mạng) — có mạng rồi mới huỷ được'); return; }
    try {
      await goi('pos_huy_hd', { p_id: h.id, p_reason: lyDo, p_approval_id: duyetId });
      setDaBan((ds) => ds.map((x) => (x.id === h.id ? { ...x, daHuy: true, lyDoHuy: lyDo, nguoiHuy: nguoi, lucHuy: Date.now() } : x)));
      ghiKho(h.chiNhanh, h.dong.map((d) => ({ ma: d.ma, sl: d.sl })), h.ma, 'Huỷ hoá đơn');
      if (h.no) napNo();
      nhan(`Đã huỷ ${h.ma} — đã cộng lại tồn kho${(h.chia ? Number(h.chia.tien_mat) || 0 : h.phuongThuc === 'tien_mat' ? h.thucThu : 0) > 0 ? `, trả khách ${so(h.chia ? h.chia.tien_mat : h.thucThu)} tiền mặt` : ''}`);
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
      reason: phieu.loai === 'huy' ? phieu.ghiChu : phieu.loai === 'noibo' ? (phieu.nguoiNhan || null) : null,
      note: phieu.loai === 'huy' ? null : phieu.ghiChu || null,
      photo_url: phieu.anh || null,
      ...(phieu.loai === 'noibo' ? { loai_xuat: phieu.loaiXuat || '', to_store: phieu.loaiXuat === LUAN_CHUYEN ? phieu.denCN || null : null } : {}),
    };
    try {
      const r = await goiHoacXep('pos_luu_phieu', { p }, id);
      if (r.choGui) { setSoCho((n) => n + 1); nhan('Mất mạng — đã giữ phiếu trên máy, có mạng sẽ tự gửi'); return; }
      setPhieuKho((ds) => [phieuTuDb(r.kq, bdHang), ...ds.filter((x) => x.id !== id)]);
      if (hoanThanh) napThat();
      nhan(!hoanThanh ? 'Đã lưu phiếu tạm — chưa tác động tồn kho' : phieu.loai === 'giao' ? `Đã gửi ${r.kq.code} — đợi quầy đếm và bấm Nhận hàng`
        : r.kq.to_store ? `Đã chuyển ${r.kq.code} — đã trừ tồn ${phieu.chiNhanh}. ${r.kq.to_store} đếm bánh rồi bấm Nhận hàng mới cộng tồn bên đó`
          : `Đã hoàn thành ${r.kq.code} — tồn kho đã cập nhật`);
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
    setHds((ds) => ds.map((x) => (x.id === moi.id ? { ...x, khach: goc.khach || KHACH_LE, ghiChu: goc.ghiChu || '', dong: goc.dong.filter((d) => !d.tang).map((d) => ({ ...d })) } : x)));
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
    if (!caMo && !banKhongCa) { nhan('Chưa mở ca — mở ca trước để tiền cọc vào két'); return; }
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
    gom(phieuKho.filter((p) => p.trangThai === 'xong' && (p.chiNhanh === chiNhanh || (p.loai === 'chuyen' && p.denCN === chiNhanh))), (p) => `phieu:${p.loai}:${p.nguoi}:${gioCua(p.lucXong || p.luc)}`, (xs) => ({
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
  useEffect(() => { if (!xemQl && (['ngay', 'no', 'sq', 'km'].includes(manHinh) || (!that && manHinh === 'xd'))) setManHinh('ban'); }, [xemQl, manHinh, that]);
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

  const chonAnhBan = async (f) => {
    const id = hd.id;
    setDangAnhBan(true);
    try {
      const a = await docAnhBan(f);
      setAnhBan((x) => { if (x[id]?.url) { try { URL.revokeObjectURL(x[id].url); } catch { /* bỏ qua */ } } return { ...x, [id]: a }; });
    } catch (e) { nhan(chuLoi(e)); }
    setDangAnhBan(false);
  };
  const ext = that ? {
    qr: <QrChuyenKhoan caiDat={cd} tien={tong.canTra} hdId={hd.id} />,
    qrDt: <QrChuyenKhoan dt caiDat={cd} tien={tong.canTra} hdId={hd.id} />,
    qrChia: (tien, dt = false) => <QrChuyenKhoan dt={dt} caiDat={cd} tien={tien} hdId={hd.id} />,
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
    khuyenMai: kmDs.length ? <KmChon ds={kmDs} chon={kmChon} tenTang={(t) => { const m = mhCua(t); return m ? `${m.ten}${m.size ? ` ${m.size}` : ''}` : ''; }} onChon={(id) => sua({ km: id, dua: null })} /> : null,
    hsd: nhanHsd,
    dangBan,
    anh: (
      <div className="kv-anh-ban">
        <ChupAnh xem={anhBan[hd.id]?.url} dang={dangAnhBan} thuVien onChon={chonAnhBan} chu="Ảnh bán hàng (bắt buộc): bánh, tiền mặt hoặc màn hình CK" />
      </div>
    ),
  } : null;
  // Ca đang mở ở quầy này là của người khác → nhân viên không bán chen vào (database cũng chặn).
  const caNguoiKhac = !!(that && caMo && that.cap === 'nv' && caMo.opened_by && caMo.opened_by !== that.uid);
  // Ca của chính mình mở từ hôm trước (quên kết) → mời nhận ca mới, không bán lẫn vào ca hôm qua.
  const caCuCuaToi = !!(that && caMo && caMo.opened_by === that.uid && new Date(caMo.opened_at).toDateString() !== new Date().toDateString());
  const daBanCa = caMo ? daBan.filter((h) => h.that && h.caId === caMo.id && !h.daHuy && (!h.thuNganId || h.thuNganId === caMo.opened_by)).reduce((a, h) => a + Number(h.canTra || 0), 0) : 0;
  // Mục chỉ có khi chạy thật — dùng chung cho menu ☰ và màn "Nhiều hơn" của điện thoại.
  const mucThat = that ? [
    (quanLy || laKT) && ['viec_cho', `Việc chờ${soViec ? ` (${soViec})` : ''}`, Bell],
    ['dat_coc', 'Đặt bánh · lấy cọc', ShoppingCart],
    ['lay_banh', 'Khách lấy bánh đặt', Package],
    caMo && (quanLy || caMo.opened_by === that.uid) && ['chi_ket', 'Thu / chi tiền két', Banknote],
    xemQl && !laGD && ['bao_cao', 'Báo cáo', ChartColumn],
    xemQl && ['nhat_ky', 'Nhật ký thao tác', FileClock],
    ((quanLy && !xemNV) || laKT) && ['doanh_so_nv', 'Doanh số nhân viên', ChartColumn],
    ['xep_hang', 'Xếp hạng tháng', ChartColumn],
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
      onChon={chonKhach} onThem={() => setHop((h) => ({ loai: 'them_khach', sau: h?.loai === 'dat_coc' ? 'dat_coc' : null }))} />
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
      {manHinh !== 'ban' && dienThoai && !['ls', 'hh', 'them', 'ngay', 'tb', 'toi', 'xh', 'cn', 'sq', 'km', 'tem', 'th'].includes(manHinh) && (
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
            {that && !laGD && <button type="button" className={manHinh === 'toi' ? 'on' : ''} onClick={() => moManHinh('toi')}>Doanh số của tôi</button>}
          </nav>
          <div className="kv-top-r">
            <button type="button" className="kv-ve-ban" onClick={() => setManHinh('ban')}><ShoppingBag size={17} /> Bán hàng</button>
            {nutMenu}
          </div>
          {moHH && (
            <div className="kv-hh-nen" onClick={() => setMoHH(false)}>
              <div className="kv-hh-xo" onClick={(e) => e.stopPropagation()}>
                <div><small>Hàng hóa</small><button type="button" onClick={() => moManHinh('hh')}>Danh sách hàng hóa</button></div>
                <div><small>Kho hàng</small>{MENU_HH.slice(1).filter(([k]) => (laGD || that || k !== 'xd') && !(that && k === 'ch')).map(([k, l]) => <button key={k} type="button" className={manHinh === k ? 'on' : ''} onClick={() => moManHinh(k)}>{l}</button>)}</div>
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
                    {!monLoc.length && <li className="kv-rong">{nguonDl === '…' ? 'Đang tải hàng hóa…' : 'Quầy chưa có hàng hóa. Bấm + để thêm món mới.'}</li>}
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
            {that && !caMo
              ? (banKhongCa ? null : <span className="kv-ca">Chưa vào ca</span>) // Giám đốc như KiotViet: không có dòng ca
              : <button type="button" className="kv-ca" onClick={() => setHop({ loai: 'ket_ca' })}>Ca {that && caMo ? caMo.opened_by_name || nguoi : nguoi} · từ {gio(ca.moLuc)}{that && caMo ? ` · đã bán ${so(daBanCa)}` : ''} · <b>Kết ca</b></button>}
          </footer>
        </>
      )}

      {manHinh === 'ban' && dienThoai && dtMan === 'xong' && (() => {
        const h = daBan.find((x) => x.ma === hdXong);
        return h ? <ChiTietHdDt h={h} tra={traHangs.filter((x) => x.hdId === h.id)} onTra={traDuoc(h) ? () => moTraHang(h) : null} huyDuoc={huyDuoc(h)} onLui={() => setDtMan('chon')} onIn={() => setHop({ loai: 'bien_lai', hoaDon: h })}
          onHuy={() => setHop({ loai: 'huy_hd', hoaDon: h })} onChiaSe={() => chiaSe(h)} onSaoChep={() => saoChepHd(h)} /> : null;
      })()}
      {manHinh === 'ban' && dienThoai && dtMan !== 'xong' && (
        <DienThoai dangTai={nguonDl === '…'} dtMan={dtMan} setDtMan={setDtMan} hd={hd} tong={tong} monLoc={monLoc} ton={ton} slTrongGio={slTrongGio}
          chips={chips} locMo={locMo} setLocMo={setLocMo} themMon={themMon} datSl={datSl} boDong={boDong} sua={sua}
          boChon={() => sua({ dong: [], dua: null })} luuTam={() => { themHd(); setDtMan('chon'); nhan(`Đã lưu tạm Hóa đơn ${hd.so}`); }}
          khachNo={khachNo} chonKhach={() => setHop({ loai: 'chon_khach_dt' })} onThuKhac={() => setHop({ loai: 'thu_khac' })}
          inTamTinh={inTamTinh} chiaSeTamTinh={() => hd.dong.length && chiaSe({ ...tong, ma: 'TẠM TÍNH', luc: Date.now(), chiNhanh, khach: hd.khach, dong: hd.dong })} hoanTat={hoanTat} onThongTin={() => setHop({ loai: 'thong_tin_hd' })} soHd={hds.length} onThemHang={() => setHop({ loai: 'them_hang' })} onSuaDong={(ma) => setHop({ loai: 'sua_dong_dt', ma })}
          onMoHd={() => moManHinh('ls')} onMenu={() => setMenuMo(true)} onDatHang={datHang} ext={ext} giaCua={giaCua}
          hds={hds} onChonHd={(id) => { setHdId(id); const h = hds.find((x) => x.id === id); setDtMan(h && h.dong.length ? 'gio' : 'chon'); }} />
      )}

      {dienThoai && !form && !['xh', 'cn', 'sq', 'km', 'tem', 'th'].includes(manHinh) && !(manHinh === 'ban' && dtMan !== 'chon') && (
        <nav className="kvm-nav" aria-label="Điều hướng">
          {(laGD
            ? [['ngay', 'Tổng quan', ChartArea], ['hh', 'Hàng hoá', Box], ['ban', 'Bán hàng', ShoppingBag], ['ls', 'Hoá đơn', FileText], ['them', 'Khác', Menu]]
            : that // chạy thật: y app KiotViet của nhân viên (Tổng quan = doanh số của mình, 🔔 nằm trong Tổng quan)
              ? [['toi', 'Tổng quan', ChartArea], ['hh', 'Hàng hoá', Box], ['ban', 'Bán hàng', ShoppingBag], ['ls', 'Hoá đơn', FileText], ['them', 'Khác', Menu]]
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
              {laGD && <button type="button" onClick={() => moManHinh('ngay')}><span className="ic cam"><Clock size={20} /></span>{that ? 'Báo cáo' : 'Báo cáo cuối ngày'}</button>}
            </div>
            {manHinh !== 'ban' && <button type="button" onClick={() => moManHinh('ban')}><ShoppingBag size={18} /> Bán hàng</button>}
            {xemQl && <button type="button" onClick={() => moManHinh('no')}><ReceiptText size={18} /> Lập phiếu thu{congNo.length ? <i>{congNo.length}</i> : null}</button>}
            <button type="button" onClick={() => moManHinh('hh')}><Tag size={18} /> Hàng hóa &amp; kho</button>
            <button type="button" onClick={() => moManHinh('pn')}><Warehouse size={18} /> Nhập hàng (bếp giao)</button>
            <button type="button" onClick={() => moHop({ loai: 'ket_ca' })}><Clock size={18} /> Kết ca</button>
            {that && !laGD && <button type="button" onClick={() => moManHinh('toi')}><ChartArea size={18} /> Doanh số của tôi</button>}
            {that && coTraHang && <button type="button" onClick={() => moManHinh('th')}><RotateCcw size={18} /> Trả hàng</button>}
            {that && <button type="button" onClick={() => moManHinh('cn')}><FileText size={18} /> Báo cáo cuối ngày</button>}
            {that && xemQl && <button type="button" onClick={() => moManHinh('sq')}><Banknote size={18} /> Sổ quỹ</button>}
            {that && xemQl && <button type="button" onClick={() => moManHinh('km')}><Gift size={18} /> Khuyến mại</button>}
            {that && <button type="button" onClick={() => moManHinh('tem')}><ScanBarcode size={18} /> In tem mã</button>}
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

      {manHinh === 'hh' && <QlHangHoa that={!!that} matHang={matHang} tonCN={tonCN} chiNhanh={chiNhanh} theKho={theKho.filter((t) => t.chiNhanh === chiNhanh)} dienThoai={dienThoai} laGD={laGD} onThem={() => setHop({ loai: 'them_hang' })} onSua={that ? (m) => setHop({ loai: 'sua_hang', cu: m }) : null} onMoMan={moManHinh} />}
      {manHinh === 'kh' && <KhachHang ds={khachDs} hoaDons={daBan.filter((h) => !h.mau)} noCua={noCua} dienThoai={dienThoai} />}
      {manHinh === 'tb' && <ThongBao ds={thongBao} daDoc={daDoc} onDoc={(id) => setDaDoc((x) => new Set(x).add(id))} onDocHet={() => setDaDoc(new Set(thongBao.map((t) => t.id)))} />}
      {MAN_LOAI[manHinh] && (
        <QlPhieu key={manHinh} loai={MAN_LOAI[manHinh]} dienThoai={dienThoai} ds={phieuKho.filter((p) => (p.chiNhanh === chiNhanh || (p.loai === 'chuyen' && p.denCN === chiNhanh)) && p.loai === MAN_LOAI[manHinh])}
          matHang={matHang} ton={ton} onTao={() => moForm(MAN_LOAI[manHinh])} onMo={(p) => moForm(p.loai, p)}
          onSaoChep={(p) => moForm(p.loai, { dong: p.dong.map((d) => ({ ...d })), ghiChu: p.ghiChu, loaiXuat: p.loaiXuat, nguoiNhan: p.nguoiNhan })}
          onHuy={(p) => setHop({ loai: 'huy_phieu', phieu: p })} onIn={(p) => setBanIn({ phieu: p })}
          huyDuoc={(p) => !that || p.loai !== 'giao' || p.trangThai === 'tam' || that.cap === 'gd'}
          onNhan={that ? (p) => setHop({ loai: 'nhan_hang', phieu: p }) : null} onVe={() => moManHinh('them')} />
      )}
      {form && dienThoai && form.loai === 'huy' && (
        <XuatHuyDt key={form.phieu?.ma || 'moi'} phieuCu={form.phieu} matHang={matHang} ton={ton} chiNhanh={chiNhanh} nguoi={nguoi} that={!!that}
          soPhieu={phieuKho.filter((p) => p.loai === 'huy').length + 1}
          onDong={() => setForm(null)}
          onLuu={(p, xong) => { luuPhieu(p, xong); setForm(null); setManHinh('xh'); }} />
      )}
      {form && !(dienThoai && form.loai === 'huy') && (
        <FormPhieu key={form.phieu?.ma || form.loai} dienThoai={dienThoai} loai={form.loai} phieuCu={form.phieu} matHang={matHang} ton={ton} chiNhanh={chiNhanh} nguoi={nguoi} that={!!that}
          soPhieu={phieuKho.filter((p) => p.loai === form.loai).length + 1}
          ganDay={phieuKho.filter((p) => p.loai === 'kiem' && p.chiNhanh === chiNhanh && p.trangThai !== 'tam')}
          onDong={() => setForm(null)}
          onLuu={(p, xong) => { luuPhieu(p, xong); setForm(null); setManHinh(Object.keys(MAN_LOAI).find((k) => MAN_LOAI[k] === p.loai)); }} />
      )}

      {manHinh === 'ls' && (
        <QlHoaDon key={laGD ? 'gd' : 'nv'} laGD={laGD} ds={daBan.filter((h) => !h.mau && h.chiNhanh === chiNhanh)} traHangs={traHangs} dienThoai={dienThoai} huyDuoc={huyDuoc}
          traDuoc={traDuoc} onTra={moTraHang}
          onIn={(h) => setHop({ loai: 'bien_lai', hoaDon: h })}
          onHuy={(h) => setHop({ loai: 'huy_hd', hoaDon: h })} onChiaSe={chiaSe} onSaoChep={saoChepHd} onBan={() => { moManHinh('ban'); setDtMan('chon'); }} />
      )}
      {manHinh === 'them' && <NhieuHon congNo={congNo.length} chiNhanh={chiNhanh} setChiNhanh={setChiNhanh} onMo={(k) => { moManHinh(k); if (k === 'ban') setDtMan('chon'); }} onHop={setHop}
        laGD={laGD} laChu={laChu} xemNV={xemNV} setXemNV={setXemNV} onDatHang={datHang} mucThat={mucThat} onMucThat={moMucThat} anChuyen={!!that} soQuy={!!that && xemQl} khuyenMai={!!that && xemQl} traHang={!!that && coTraHang} />}

      {manHinh === 'no' && <CongNo ds={congNo} du={that ? noDb.du : null} onThu={(k) => setHop({ loai: 'thu_no', no: k })} />}

      {manHinh === 'toi' && that && <TongQuanCuaToi dienThoai={dienThoai} soTb={tbChuaDoc} onMo={(k) => { moManHinh(k); if (k === 'ban') setDtMan('chon'); }} />}
      {manHinh === 'tem' && that && <InTem matHang={matHang} tonCN={tonCN} chiNhanh={chiNhanh} bangGia={bangGia} nhan={nhan} onVe={() => moManHinh(dienThoai ? 'them' : 'ban')} />}
      {manHinh === 'km' && that && xemQl && <KhuyenMai ds={khuyenMai} matHang={matHang} chiNhanh={chiNhanh} nhan={nhan} onDoi={() => napThat()} onVe={() => moManHinh(dienThoai ? 'them' : 'ban')} />}
      {manHinh === 'sq' && that && xemQl && <SoQuy key={chiNhanh} chiNhanh={chiNhanh} onVe={() => moManHinh(dienThoai ? 'them' : 'ban')} />}
      {manHinh === 'th' && that && <TraHangDs chiNhanh={chiNhanh} traHangs={traHangs} hoaDons={daBan.filter((h) => traDuoc(h))}
        onVe={() => moManHinh(dienThoai ? 'them' : 'ban')} onTra={moTraHang} />}
      {manHinh === 'cn' && that && <BaoCaoCuoiNgay key={chiNhanh} chiNhanh={chiNhanh} onVe={() => moManHinh(dienThoai ? 'them' : 'ban')} onMoHoaDon={() => moManHinh('ls')} />}
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
        ? <KetCaThat caMo={caMo} chiNhanh={chiNhanh} matHang={matHang} onDong={() => setHop(null)}
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
        <ThemKhach onDong={() => setHop(hop.sau ? { loai: hop.sau } : null)}
          onLuu={(k) => {
            if (!that) { setKhachDs((ds) => [k, ...ds]); chonKhach(k); setHop(hop.sau ? { loai: hop.sau } : null); nhan(`Đã thêm khách hàng ${k.name}`); return; }
            goi('pos_tao_khach', { p_name: k.name, p_phone: k.phone }).then((r) => {
              const kk = { id: r.id, name: r.name, phone: r.phone || '' };
              setKhachDs((ds) => [kk, ...ds.filter((x) => x.id !== kk.id)]); chonKhach(kk); setHop(hop.sau ? { loai: hop.sau } : null);
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
        ? <HangQuay cu={null} dsNhom={dsNhomQuay} onDong={() => setHop(null)} onXong={xongHangQuay} />
        : <ThemHangHoa matHang={matHang} laGD={laGD} chuaBat={chuaBatThat} onDong={() => setHop(null)} onLuu={themHangMoi} />)}
      {hop?.loai === 'sua_hang' && that && hop.cu && <HangQuay cu={hop.cu} dsNhom={dsNhomQuay} onDong={() => setHop(null)} onXong={xongHangQuay} />}
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
      {hop?.loai === 'tra_hang' && that && <TraHang hd={hop.hoaDon} daTra={traHangs.filter((x) => x.hdId === hop.hoaDon.id)} chiNhanh={chiNhanh}
        onDong={() => setHop(null)} onXong={(r) => { setHop(null); nhan(`Đã trả hàng ${r.code} · trả khách ${so(r.refund)}`); napThat(); }} />}
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

      {(caNguoiKhac || caCuCuaToi) && manHinh === 'ban' && !hop && !form && (
        <NhanCa chiNhanh={chiNhanh} dsQuay={CHI_NHANH} onDoiChiNhanh={setChiNhanh} caMo={caMo} cuaToi={caCuCuaToi} nguoi={nguoi}
          onVeApp={veApp} onDong={() => moManHinh('ls')} onTaiLai={() => napThat()} onKetCa={() => setHop({ loai: 'ket_ca' })}
          onNhan={(row) => {
            setCaMoDs((x) => ({ ...x, [chiNhanh]: row }));
            nhan(row.ca_cu ? `Đã nhận ca · máy đã kết hộ ca ${row.ca_cu}${row.ca_cu_cua ? ` của ${row.ca_cu_cua}` : ''} · ca bạn ${row.code}` : `Đã vào ca ${row.code}`);
            napThat();
          }} />
      )}
      {hop?.loai === 'doanh_so_nv' && that && <DoanhSoNv dsCuaHang={CHI_NHANH} duocLoai={quanLy} onDong={() => setHop(null)} />}
      {hop?.loai === 'xep_hang' && that && <XepHang onDong={() => setHop(null)} />}
      {that && !caMo && manHinh === 'ban' && !hop && !form && !banKhongCa && (
        <MoCa chiNhanh={chiNhanh} dsQuay={CHI_NHANH} onDoiChiNhanh={setChiNhanh} nguoi={nguoi} onVeApp={veApp} onDong={() => moManHinh('ls')} onTaiLai={() => napThat()}
          onMo={(row) => { setCaMoDs((x) => ({ ...x, [chiNhanh]: row })); nhan(`Đã vào ca ${row.code} · đầu ca ${so(row.opening_cash)}`); }} />
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
      {chuaBatThat && <div className="bhq-chua-bat" role="alert"><b>Tài khoản này CHƯA được bật bán thật.</b> Bán hàng, thêm hàng, vào ca ở đây đều KHÔNG được lưu — báo quản lý bật cho bạn rồi tắt app mở lại.</div>}
      {hop?.loai === 'chi_ket' && that && caMo && <ChiKet caMo={caMo} laQl={quanLy} uid={that.uid} onDong={() => setHop(null)} onXong={(m) => nhan(m)} />}
      {hop?.loai === 'thiet_lap_quay' && that && <ThietLapQuay chiNhanh={chiNhanh} caiDat={cd} matHang={matHang} bangGia={bangGia} hanDung={hanDung} onLuu={() => napThat()} onDong={() => setHop(null)} />}
      {hop?.loai === 'dat_coc' && that && (
        <DatCoc hd={hd} tong={tong} chiNhanh={chiNhanh} oKhach={oKhach} onDong={() => setHop(null)}
          onXong={({ ma, coc, conLai }) => { setHop(null); baoXong(null, null, `Đã tạo đơn ${ma} ở mục Đơn hàng · cọc ${so(coc)} · còn ${so(conLai)} thu khi lấy bánh`); }} />
      )}
      {hop?.loai === 'lay_banh' && that && (
        <LayBanhDat chiNhanh={chiNhanh} onDong={() => setHop(null)}
          onXong={(don, con, kq) => { setHop(null); nhan(`${con ? `Đã thu ${so(con)} · ` : ''}${don.order_code} ${kq === 'da_xong_truoc' ? 'đã hoàn thành từ trước' : 'đã giao — đơn chuyển Hoàn thành'}`); }} />
      )}
      {hop?.loai === 'nhan_hang' && that && (
        <NhanHang phieu={hop.phieu} matHang={matHang} onDong={() => setHop(null)}
          onNhan={async (nh) => { await goi('pos_nhan_hang', { p_id: hop.phieu.id, p_received: nh, p_note: null }); setHop(null); napThat(); nhan(`Đã nhận hàng ${hop.phieu.ma} — tồn quầy đã cộng`); }} />
      )}
      {hop?.loai === 'nhat_ky' && that && <NhatKy chiNhanh={chiNhanh} onDong={() => setHop(null)} />}
      {that && !form && !hop && (viecLoi.length > 0 || hienCanHuy || (soChoNhan > 0 && manHinh !== 'pn')) && (
        <div className={`kv-noi-day ${dienThoai ? '' : 'tren'}`}>
          {soChoNhan > 0 && manHinh !== 'pn' && (
            <button type="button" className="kv-viec-loi kv-cho-nhan" onClick={() => moManHinh('pn')}>
              📦 {soChoNhan} phiếu hàng chờ nhận — bấm để đếm bánh và Nhận hàng</button>
          )}
          {hienCanHuy && (
            <button type="button" className="kv-viec-loi kv-can-huy" onClick={() => setHop({ loai: 'can_huy' })}>
              🗑️ {soQuaHan > 0 ? `${soQuaHan} bánh QUÁ HẠN` : `${soHomNay} bánh hết hạn hôm nay`} — bấm để làm phiếu xuất hủy</button>
          )}
          {viecLoi.length > 0 && (
            <button type="button" className="kv-viec-loi" onClick={() => setHop({ loai: 'viec_loi' })}>
              ⚠ {viecLoi.length} việc làm lúc mất mạng gửi không được — bấm để xem, báo Quản lý</button>
          )}
        </div>
      )}
      {hop?.loai === 'can_huy' && that && (
        <HopT tieuDe="Cần xuất hủy" onDong={() => setHop(null)}
          chan={<>
            {soQuaHan > 0 && <button type="button" className="bhq-nut chinh" onClick={() => lamPhieuHuy(false)}>Làm phiếu hủy {soQuaHan} bánh quá hạn</button>}
            {soHomNay > 0 && <button type="button" className={`bhq-nut ${soQuaHan > 0 ? 'phu' : 'chinh'}`} onClick={() => lamPhieuHuy(true)}>Hủy cả {soHomNay} bánh hết hạn hôm nay</button>}
          </>}>
          <p className="bhq-ghi">Bánh <b>quá hạn</b> máy không cho bán. Đếm lại trên kệ, chụp ảnh rồi hoàn thành phiếu — số trên phiếu sửa được nếu thực tế khác.</p>
          {canHuy.map((x) => (
            <div key={x.m.ma} className="tlq-dong"><span>{x.m.ten}{x.m.size ? ` - ${x.m.size}` : ''}</span>
              <span>{x.quaHan > 0 && <i className="bhq-nhan-tt do">Quá hạn {x.quaHan}</i>}{x.homNay > 0 && <i className="bhq-nhan-tt">Hết hạn hôm nay {x.homNay}</i>}</span></div>
          ))}
        </HopT>
      )}
      {hop?.loai === 'viec_loi' && that && (
        <HopT tieuDe="Việc gửi không được" onDong={() => setHop(null)}>
          <p className="bhq-ghi">Những việc dưới đây làm lúc mất mạng nhưng database từ chối khi gửi lại. Chúng vẫn nằm trên máy này (không mất).
            Quản lý xem lý do, xử lý tay (VD: bán lại đúng giá, thu nợ lại) rồi bấm <b>Đã xử lý</b>.</p>
          {viecLoi.length ? viecLoi.map((v) => (
            <div key={v.khoa} className="bhq-the">
              <div><b>{({ pos_ban: 'Hoá đơn bán', pos_thu_no: 'Thu nợ', pos_luu_phieu: 'Phiếu kho' })[v.ham] || v.ham}</b> · làm lúc {new Date(v.luc).toLocaleString('vi-VN')}
                {v.banGhi ? ` · ${so(v.banGhi.canTra)} · ${v.banGhi.khach?.name || 'Khách lẻ'}` : v.thamSo?.p_amount ? ` · ${so(v.thamSo.p_amount)}` : ''}</div>
              {v.banGhi?.dong?.length ? <div>{v.banGhi.dong.map((d) => `${d.sl} × ${d.ten}`).join(', ')}</div> : null}
              <div className="do">Lý do: {v.loi}</div>
              <div className="hang"><span />
                <span>
                  <button type="button" className="bhq-nut phu nho" onClick={async () => { await guiLaiViecLoi(v.khoa); setViecLoi((x) => x.filter((y) => y.khoa !== v.khoa)); setSoCho((n) => n + 1); setHop(null); nhan('Đã đưa vào hàng gửi lại'); }}>Gửi lại</button>{' '}
                  {(that.cap === 'gd' || that.cap === 'ql') && (
                    <button type="button" className="bhq-nut chinh nho" onClick={async () => {
                      await boViecLoi(v.khoa);
                      setViecLoi((x) => x.filter((y) => y.khoa !== v.khoa)); setHdCho((x) => x.filter((h) => h.id !== v.khoa)); nhan('Đã đánh dấu xử lý xong');
                    }}>Đã xử lý</button>
                  )}
                </span></div>
            </div>
          )) : <p className="bhq-rong">Không còn việc nào.</p>}
          {that.cap === 'nv' && <p className="bhq-ghi">Chỉ Quản lý / Giám đốc bấm "Đã xử lý" được.</p>}
        </HopT>
      )}
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
    return locXep(matHang, (m) => `${m.ma} ${m.ten} ${m.size} ${m.maVach || ''}`, t, 10);
  }, [matHang, q]);
  const lay = (m) => { onChon(m); setQ(''); setChon(0); };
  const onKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setChon((c) => Math.min(c + 1, loc.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setChon((c) => Math.max(c - 1, 0)); }
    else if (e.key === 'Enter') {
      const t = q.trim().toUpperCase();
      const m = matHang.find((x) => x.ma === t || (x.maVach && x.maVach === q.trim())) || loc[chon];
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
  const dua = duaCua(hd, tong.canTra);
  const tt = tinhThanhToan({ canTra: tong.canTra, khachDua: dua, phuongThuc: hd.pt, laKhachLe: !hd.khach.id, chia: hd.chia });
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
        {ext?.khuyenMai}
        <div className="r"><span>Thu khác {hd.thuKhac.length ? <i className="pt">({hd.thuKhac.map((t) => t.ten).join(', ')})</i> : null}</span>
          <button type="button" className="kv-gach" onClick={onThuKhac}>{so(tong.thuKhac)}</button></div>
        <div className="r"><label className="kv-cong-tac nho"><span>VAT 8%</span><input type="checkbox" checked={!!hd.vat} onChange={(e) => onSua({ vat: e.target.checked, dua: null })} /><i /></label>
          <span>{so(tong.vat)}</span></div>
        {ext?.truocCanTra}
        <div className="r dam"><span>Khách cần trả</span><b className="xanh">{so(tong.canTra)}</b></div>
        <div className="r dam"><span>Khách thanh toán</span>
          <input ref={duaRef} className="kv-gach kv-dua" inputMode="numeric" value={so(dua)} aria-label="Khách thanh toán (F8)" readOnly={hd.pt === 'ket_hop'}
            onChange={(e) => onSua({ dua: Number(soTien(e.target.value)) || 0 })} onFocus={(e) => e.target.select()} />
        </div>
        <div className="kv-pt" role="radiogroup" aria-label="Phương thức thanh toán">
          {Object.entries(PT).map(([k, l]) => (
            <label key={k} className={hd.pt === k ? 'on' : ''}>
              <input type="radio" name={`pt-${hd.id}`} checked={hd.pt === k} onChange={() => onSua(chonPt(k, hd, tong.canTra))} /><i />{l}
            </label>
          ))}
        </div>
        {hd.pt === 'ket_hop' && <ChiaTien hd={hd} canTra={tong.canTra} onSua={onSua} />}
        {hd.pt === 'tien_mat' && goiY.length > 0 && (
          <div className="kv-menh-gia">{goiY.map((v) => <button key={v} type="button" className={Number(dua) === v ? 'on' : ''} onClick={() => onSua({ dua: v })}>{so(v)}</button>)}</div>
        )}
        {hd.pt === 'ket_hop' && Number(hd.chia?.chuyen_khoan) > 0 && ext?.qrChia?.(Number(hd.chia.chuyen_khoan))}
        {hd.pt === 'chuyen_khoan' && (ext?.qr || <div className="kv-qr">Mã VietQR {so(tong.canTra)}<small>Bản thật: QR theo tài khoản chi nhánh, có sẵn số tiền + mã hóa đơn để đối chiếu sao kê.</small></div>)}
        {tt.no > 0
          ? <div className="r no"><span>Tính vào công nợ</span><b>{so(tt.no)}</b></div>
          : <div className="r"><span>Tiền thừa trả khách</span><span>{so(tt.thua)}</span></div>}
        {khachNo > 0 && <div className="r nho"><span>Nợ cũ của khách</span><span>{so(khachNo)}</span></div>}
        {ext?.anh}
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
  dangTai = false, dtMan, setDtMan, hd, tong, monLoc, ton, slTrongGio, chips, locMo, setLocMo, themMon, datSl, boDong, sua, boChon, luuTam,
  khachNo, chonKhach, onThuKhac, inTamTinh, chiaSeTamTinh, hoanTat, soHd, onSuaDong, onMoHd, onMenu, onDatHang, onThemHang, onThongTin, hds, onChonHd,
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
  const ds = t ? locXep(monLoc, (m) => `${m.ma} ${m.ten} ${m.size} ${m.maVach || ''}`, t) : monLoc;
  const onTimKey = (e) => {
    if (e.key !== 'Enter') return;
    const m = monLoc.find((x) => x.ma === q.trim().toUpperCase() || (x.maVach && x.maVach === q.trim())) || (ds.length === 1 ? ds[0] : null);
    if (m) { themMon(m); setQ(''); }
  };
  // Như app KiotViet: đang tìm mà chạm 1 món → thêm rồi vào thẳng giỏ hàng (xoá ô tìm).
  // Không tìm thì chạm để chọn nhiều món, bấm "Xong" như cũ.
  const chamMon = (m) => {
    themMon(m);
    if (t) { setQ(''); setDtMan('gio'); }
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
    const dua = duaCua(hd, tong.canTra);
    const tt = tinhThanhToan({ canTra: tong.canTra, khachDua: dua, phuongThuc: hd.pt, laKhachLe: !hd.khach.id, chia: hd.chia });
    const laPt = hd.giamKieu === '%';
    // Như app KiotViet: ‹ Thanh toán [chia sẻ][in] · Xem hàng trong đơn › · thẻ tiền · thanh
    // phương thức · tài khoản + VietQR · nút xanh "Thanh toán".
    return (
      <div className="kvm kvm-tt-man">
        <header className="kvm-dau trang"><button type="button" aria-label="Quay lại" onClick={() => setDtMan('gio')}><ChevronLeft size={26} /></button><h1>Thanh toán</h1>
          <button type="button" aria-label="Chia sẻ tạm tính" onClick={chiaSeTamTinh}><Share2 size={22} /></button>
          <button type="button" aria-label="In tạm tính" onClick={inTamTinh}><Printer size={22} /></button></header>
        <div className="kvm-than">
          <div className="kvm-the kvm-tt-xem"><button type="button" className="kvm-dong-mo" onClick={() => setDtMan('gio')}><span>Xem hàng trong đơn</span><ChevronRight size={20} className="mui" /></button></div>
          {hd.khach.id ? <div className="kvm-the kvm-tt-xem">{dongKhach}</div> : null}
          <div className="kvm-the kvm-tt">
            <div className="r"><span>Tổng tiền hàng <i className="kvm-tron vien">{tong.soMon}</i></span><span>{so(tong.tongHang)}</span></div>
            <div className="r"><span>Giảm giá <button type="button" className="kvm-don-vi" aria-label={`Đổi đơn vị giảm giá, đang tính theo ${laPt ? 'phần trăm' : 'tiền'}`}
              onClick={() => sua({ giamKieu: laPt ? 'vnd' : '%', giam: 0, dua: null })}>({laPt ? '%' : 'VND'})</button></span>
              <input className="kv-gach" inputMode="numeric" value={hd.giam ? (laPt ? hd.giam : Number(hd.giam).toLocaleString('en-US')) : ''} placeholder="0" aria-label={laPt ? 'Giảm giá (%)' : 'Giảm giá (VND)'}
                onFocus={(e) => e.target.select()}
                onChange={(e) => { const v = Number(soTien(e.target.value)) || 0; sua({ giam: laPt ? Math.min(v, 100) : v, dua: null }); }} /></div>
            {ext?.khuyenMai}
            <div className="r"><span>Thu khác</span><button type="button" className="kv-gach" onClick={onThuKhac}>{so(tong.thuKhac)}</button></div>
            {ext?.truocCanTra}
            <div className="r"><span>Khách cần trả</span><b className="xanh">{so(tong.canTra)}</b></div>
            <div className="r"><span>Khách thanh toán</span>
              <input className="kv-gach" inputMode="numeric" value={so(dua)} aria-label="Khách thanh toán" readOnly={hd.pt === 'ket_hop'} onFocus={(e) => e.target.select()}
                onChange={(e) => sua({ dua: Number(soTien(e.target.value)) || 0 })} /></div>
            <div className="kvm-pt2" role="radiogroup" aria-label="Phương thức thanh toán">
              {Object.entries(PT).map(([k, l]) => <button key={k} type="button" role="radio" aria-checked={hd.pt === k} className={hd.pt === k ? 'on' : ''} onClick={() => sua(chonPt(k, hd, tong.canTra))}>{l}</button>)}
            </div>
            {hd.pt === 'ket_hop' && <ChiaTien hd={hd} canTra={tong.canTra} onSua={sua} />}
            {hd.pt === 'ket_hop' && Number(hd.chia?.chuyen_khoan) > 0 && ext?.qrChia?.(Number(hd.chia.chuyen_khoan), true)}
            {hd.pt === 'chuyen_khoan' && (ext?.qrDt || ext?.qr)}
            {tt.no > 0 ? <div className="r no"><span>Tính vào công nợ</span><b>{so(tt.no)}</b></div>
              : tt.thua > 0 ? <div className="r"><span>Tiền thừa trả khách</span><b>{so(tt.thua)}</b></div> : null}
            {khachNo > 0 && <div className="r nho"><span>Nợ cũ của khách</span><span>{so(khachNo)}</span></div>}
            {ext?.anh}
            {tt.loi && <p className="kv-loi">{tt.loi}</p>}
          </div>
          <label className="kvm-the kv-ghi-chu"><Pencil size={16} /><input value={hd.ghiChu} onChange={(e) => sua({ ghiChu: e.target.value })} placeholder="Ghi chú đơn hàng" /></label>
        </div>
        <div className="kvm-chan"><button type="button" className="kv-nut-tt rong" disabled={!!tt.loi || ext?.dangBan} onClick={hoanTat}>{ext?.dangBan ? 'Đang lưu…' : 'Thanh toán'}</button></div>
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
              : <button type="button" className="kv-nut-tt" disabled={!hd.dong.length} onClick={() => { if (!Number(hd.giam) && hd.giamKieu !== '%') sua({ giamKieu: '%', giam: 0 }); setDtMan('tt'); }}>Thanh toán</button>}
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
          <div className="kvm-hd-mo" role="list" aria-label="Hóa đơn đang mở">
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
                <button type="button" className="kvm-mon-cham" onClick={() => chamMon(m)} aria-label={`Thêm ${m.ten}${m.size ? ` ${m.size}` : ''}`}>
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
          {!ds.length && <p className="kv-rong">{monLoc.length ? 'Không tìm thấy hàng hóa phù hợp' : dangTai ? 'Đang tải hàng hóa…' : 'Quầy chưa có hàng hóa. Bấm + ở trên để thêm món mới.'}</p>}
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
function ThemHangHoa({ matHang, laGD, chuaBat = false, onDong, onLuu }) {
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
      {chuaBat
        ? <p className="kv-loi" role="alert"><b>Không lưu được:</b> tài khoản của bạn chưa được bật bán thật nên món này chỉ có tạm trên máy, thoát ra là mất. Báo quản lý bật cho bạn.</p>
        : <p className="bhq-ghi">Bản xem thử: hàng mới chỉ có trong phiên này. Bản thật sẽ lưu vào danh mục Sản phẩm của app.</p>}
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
          <div key={`${x.ma}${x.tang ? ':tang' : ''}`} className="bl-mon">
            <div>{x.ten}{x.size ? ` ${x.size}` : ''}{x.ghiChu ? ` (${x.ghiChu})` : ''}</div>
            <div className="bl-cot"><span>{so(x.gia)}</span><span>{so(x.sl)}</span><span>{so(x.gia * x.sl)}</span></div>
          </div>
        ))}
      </div>
      <div className="bl-tong">
        <div><span>Tổng tiền hàng:</span><b>{so(tongGoc)}</b></div>
        <div><span>Chiết khấu :</span><b>{so(chietKhau)}</b></div>
        {hd.kmTen && <div><span>KM {hd.kmTen}:</span><b>{so(hd.kmGiam)}</b></div>}
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

function KhongCo({ chu, tieuDe = 'Không tìm thấy kết quả' }) {
  return (
    <div className="kq-rong">
      <span className="hop"><ReceiptText size={34} /></span>
      <b>{tieuDe}</b>
      <span>{chu}</span>
    </div>
  );
}

// ----- Danh sách hàng hóa -----
// Thẻ kho khi CHẠY THẬT: đọc sổ kho trên database (mọi máy, mọi phiếu: bán, huỷ HĐ, nhận hàng,
// xuất huỷ, kiểm kho...). Bản xem thử thì dùng theKho trong phiên như cũ (trả về null).
const TEN_GD_KHO = {
  ban: 'Bán hàng', huy_hd: 'Huỷ hoá đơn', nhan_hang: 'Nhận hàng bếp giao', bep_giao: 'Bếp giao', xuat_huy: 'Xuất hủy',
  kiem_kho: 'Kiểm kho', noi_bo: 'Xuất dùng nội bộ', huy_phieu: 'Huỷ phiếu',
};
function useTheKhoDb(m, chiNhanh, bat) {
  const [ds, setDs] = useState(null);
  const khoa = bat && m ? `${m.id}|${m.size || ''}|${chiNhanh}` : '';
  useEffect(() => {
    if (!khoa) { setDs(null); return undefined; }
    let huy = false;
    setDs([]);
    const t = tachId(m);
    let q = supabase.from('pos_stock_ledger').select('at, delta, balance_after, ref_type, ref_code, actor_name')
      .eq('store_location', chiNhanh).eq('product_id', t.product_id);
    q = t.size ? q.eq('size', t.size) : q.is('size', null);
    q.order('at', { ascending: false }).limit(200).then(({ data, error }) => {
      if (huy) return;
      if (error) { setDs([{ loi: true }]); return; }
      setDs((data || []).map((r) => ({
        chungTu: r.ref_code, luc: new Date(r.at).getTime(), loai: TEN_GD_KHO[r.ref_type] || r.ref_type,
        sl: Number(r.delta), tonCuoi: Number(r.balance_after), nguoi: r.actor_name,
      })));
    });
    return () => { huy = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [khoa]);
  return ds;
}

function QlHangHoa({ matHang, tonCN, chiNhanh, theKho, dienThoai, laGD, that = false, onThem, onSua, onMoMan }) {
  const ton = tonCN[chiNhanh] || {};
  const [q, setQ] = useState('');
  const [nhom, setNhom] = useState('all');
  // Như KiotViet: nhớ bộ lọc tồn lần trước (nhân viên hay để sẵn "Còn hàng").
  const [locTon, datLocTon] = useState(() => docLuu('bhq-loc-ton', 'all'));
  const setLocTon = (v) => { datLocTon(v); ghiLuu('bhq-loc-ton', v); };
  const [mo, setMo] = useState(null);
  const [tab, setTab] = useState('tt');
  const [trang, setTrang] = useState(0);
  const theDb = useTheKhoDb(!dienThoai && tab === 'the' ? matHang.find((x) => x.ma === mo) : null, chiNhanh, that);
  const dmCo = nhomCo(matHang);
  const t = q.trim().toLowerCase();
  const ds = matHang.filter((m) => khop(`${m.ma} ${m.ten} ${m.size} ${m.maVach || ''}`, t)
    && (nhom === 'all' || m.danhMuc === nhom)
    && (locTon === 'all' || (locTon === 'con' ? (ton[m.ma] ?? 0) > 0 : locTon === 'het' ? (ton[m.ma] ?? 0) <= 0 : (ton[m.ma] ?? 0) < 0)));
  const tongTon = ds.reduce((s, m) => s + (ton[m.ma] ?? 0), 0);
  const tr = Math.min(trang, Math.max(Math.ceil(ds.length / MOI_TRANG_QL), 1) - 1);
  const tenNhom = tenNhomHang;
  if (dienThoai) return <HangHoaDt laGD={laGD} that={that} matHang={matHang} ds={ds} ton={ton} tonCN={tonCN} chiNhanh={chiNhanh} theKho={theKho} tenNhom={tenNhom} dmCo={dmCo} onThem={onThem} onSua={onSua} onMoMan={onMoMan}
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
                                {(theDb ? theDb.filter((x) => !x.loi) : theKho.filter((x) => x.ma === m.ma)).map((x, i) => (
                                  <tr key={i}><td className="xanh">{x.chungTu}</td><td>{ngayDayDu(x.luc)}</td><td>{x.loai}</td>{laGD && <td className="so">{so(m.giaVon)}</td>}
                                    <td className={`so ${x.sl < 0 ? 'am' : ''}`}>{x.sl > 0 ? so(x.sl) : `-${so(-x.sl)}`}</td><td className="so">{so(x.tonCuoi)}</td><td>{x.nguoi}</td></tr>
                                ))}
                                {(theDb ? !theDb.some((x) => !x.loi) : !theKho.some((x) => x.ma === m.ma)) && <tr><td colSpan={7} className="mo">{theDb ? (theDb.some((x) => x.loi) ? 'Chưa tải được thẻ kho — kiểm tra mạng.' : 'Chưa có giao dịch kho nào ở quầy này.') : 'Chưa có giao dịch nào trong phiên xem trước này.'}</td></tr>}
                              </tbody>
                            </table></div>
                          )}
                          {tab === 'ton' && (
                            <div className="kq-cuon"><table className="phu">
                              <thead><tr><th>Chi nhánh</th><th className="so">Tồn kho</th><th className="so">KH đặt</th><th>Trạng thái</th></tr></thead>
                              <tbody>{CHI_NHANH.map((cn) => <tr key={cn} className={cn === chiNhanh ? 'dam' : ''}><td>{cn}</td><td className="so">{so(tonCN[cn]?.[m.ma] ?? 0)}</td><td className="so">0</td><td>Đang kinh doanh</td></tr>)}</tbody>
                            </table></div>
                          )}
                          <div className="kq-ct-chan">{onSua && m.posCode
                            ? <button type="button" className="bhq-nut phu" onClick={() => onSua(m)}><Pencil size={15} /> Sửa / Xoá món</button>
                            : <span className="mo">Món của app đặt đơn: sửa giá, tên trong mục Sản phẩm của app.</span>}</div>
                        </div>
                      </td></tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
            {!ds.length && <KhongCo tieuDe={matHang.length ? undefined : 'Quầy chưa có hàng hóa'} chu={matHang.length ? 'Không tìm thấy hàng hóa nào phù hợp.' : 'Bấm + để thêm món mới.'} />}
          </div>
          <PhanTrang trang={tr} soDong={ds.length} setTrang={setTrang} donVi="hàng hóa" />
        </section>
      </div>
    </main>
  );
}

// Hàng hoá trên điện thoại — như app KiotViet: tiêu đề + 🔍 + ⇅ · [lọc] [Tất cả loại hàng ▾] [Giá bán ▾]
// · Tổng tồn / N hàng hoá · mỗi dòng: ảnh, tên, mã | giá, "Tồn: x". Bấm vào → chi tiết.
// Màn "Bộ lọc" hàng hoá trên điện thoại — như app KiotViet: chọn rồi bấm Áp dụng, Đặt lại về tất cả.
const LOC_TON = [['all', 'Tất cả hàng hoá'], ['con', 'Còn hàng'], ['het', 'Hết hàng'], ['am', 'Tồn âm (bán quá số trong máy)']];
function BoLocHang({ locTon, nhom, dmCo, onApDung, onDong }) {
  const [t, setT] = useState(locTon);
  const [n, setN] = useState(nhom);
  const [moTon, setMoTon] = useState(true);
  const [moNhom, setMoNhom] = useState(nhom !== 'all');
  const chon = (dang, k, l, bam) => (
    <button key={k} type="button" className="kvm-bl-chon" onClick={bam}><span>{l}</span>{dang && <Check size={20} />}</button>
  );
  return (
    <div className="kvm kvm-phu kvm-bo-loc">
      <header className="kvm-dau trang"><button type="button" aria-label="Quay lại" onClick={onDong}><ChevronLeft size={22} /></button><h1>Bộ lọc</h1></header>
      <div className="kvm-than">
        <section className="kvm-the">
          <button type="button" className="kvm-bl-dau" onClick={() => setMoTon((v) => !v)}><b>Tồn kho</b>{moTon ? <ChevronUp size={20} /> : <ChevronDown size={20} />}</button>
          {moTon && LOC_TON.map(([k, l]) => chon(t === k, k, l, () => setT(k)))}
        </section>
        <section className="kvm-the">
          <button type="button" className="kvm-bl-dau" onClick={() => setMoNhom((v) => !v)}><b>Nhóm hàng{n !== 'all' && <i className="kvm-bl-cham" />}</b>{moNhom ? <ChevronUp size={20} /> : <ChevronDown size={20} />}</button>
          {moNhom && [['all', 'Tất cả loại hàng'], ...dmCo.map((d) => [d.value, d.label])].map(([k, l]) => chon(n === k, k, l, () => setN(k)))}
        </section>
      </div>
      <div className="kvm-chan kvm-hai">
        <button type="button" className="kvm-nut-vien" onClick={() => { setT('all'); setN('all'); }}>Đặt lại</button>
        <button type="button" className="kv-nut-tt" onClick={() => onApDung(t, n)}>Áp dụng</button>
      </div>
    </div>
  );
}

function HangHoaDt({ laGD, that = false, matHang, ds, ton, tonCN, chiNhanh, theKho, tenNhom, dmCo, onThem, onSua, onMoMan, q, setQ, nhom, setNhom, locTon, setLocTon, tongTon }) {
  const [timMo, setTimMo] = useState(false);
  const [locMo, setLocMo] = useState(false);
  const [xepTen, setXepTen] = useState(false);
  const [loaiGia, setLoaiGia] = useState('ban');
  const [mo, setMo] = useState(null);
  const [baCham, setBaCham] = useState(false);
  // Như app KiotViet: vẽ 60 món đầu, kéo gần cuối mới vẽ thêm — 900+ món vẽ 1 lần thì máy yếu giật.
  const [soHien, setSoHien] = useState(60);
  const cuoiRef = useRef(null);
  useEffect(() => { setSoHien(60); }, [q, nhom, locTon, xepTen]);
  useEffect(() => {
    const el = cuoiRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return undefined;
    const ob = new IntersectionObserver((ds2) => { if (ds2[0]?.isIntersecting) setSoHien((n) => n + 60); }, { rootMargin: '400px' });
    ob.observe(el);
    return () => ob.disconnect();
  });
  const m = matHang.find((x) => x.ma === mo);
  const theDb = useTheKhoDb(m, chiNhanh, that);
  if (m) {
    const the = theDb ? theDb.filter((x) => !x.loi) : theKho.filter((x) => x.ma === m.ma);
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
            {onSua && m.posCode && <button type="button" className="bhq-nut phu kvm-sua-hang" onClick={() => onSua(m)}><Pencil size={16} /> Sửa / Xoá món</button>}
          </div>
          <div className="kvm-the"><h2>Tồn theo chi nhánh</h2>
            {CHI_NHANH.map((cn) => <div key={cn} className="r"><span>{cn}{cn === chiNhanh ? ' (đang xem)' : ''}</span><b>{so(tonCN[cn]?.[m.ma] ?? 0)}</b></div>)}
          </div>
          <div className="kvm-the"><h2>Thẻ kho</h2>
            {the.map((x, i) => (
              <div key={i} className="kvm-the-kho"><span className="r"><b>{x.chungTu}</b><b className={x.sl < 0 ? 'do' : 'xanh'}>{x.sl > 0 ? `+${so(x.sl)}` : `-${so(-x.sl)}`}</b></span>
                <span className="r mo"><span>{x.loai} · {ngayDayDu(x.luc)}</span><span>Tồn: {so(x.tonCuoi)}</span></span></div>
            ))}
            {!the.length && <p className="mo">{theDb ? (theDb.some((x) => x.loi) ? 'Chưa tải được thẻ kho — kiểm tra mạng.' : 'Chưa có giao dịch kho nào ở quầy này.') : 'Chưa có giao dịch nào trong phiên xem trước này.'}</p>}
          </div>
          {!that && <p className="mo kvm-ghi-nho">Bản xem thử: hàng thêm mới chỉ nằm trong phiên này, chưa lưu vào hệ thống.</p>}
        </div>
      </div>
    );
  }
  if (locMo) {
    return <BoLocHang locTon={locTon} nhom={nhom} dmCo={dmCo} onDong={() => setLocMo(false)}
      onApDung={(t, n) => { setLocTon(t); setNhom(n); setLocMo(false); }} />;
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
        <button type="button" className={`kvm-loc-ic ${locTon !== 'all' || nhom !== 'all' ? 'on' : ''}`} aria-label="Bộ lọc" onClick={() => setLocMo(true)}><ListFilter size={22} /></button>
        <label className="kvm-ky xam"><select value={nhom} onChange={(e) => setNhom(e.target.value)} aria-label="Loại hàng"><option value="all">Tất cả loại hàng</option>{dmCo.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}</select><ChevronDown size={16} /></label>
        {laGD && <label className="kvm-ky xam"><select value={loaiGia} onChange={(e) => setLoaiGia(e.target.value)} aria-label="Hiện giá"><option value="ban">Giá bán</option><option value="von">Giá vốn</option></select><ChevronDown size={16} /></label>}
      </div>
      {laGD ? <div className="kvm-tong-ql"><div><b>Tổng tồn</b><small>{so(ds.length)} hàng hoá</small></div><b>{so(tongTon)}</b></div> : <div className="kvm-khe" />}
      </div>
      <section className="kvm-hh-ds">
        {hien.slice(0, soHien).map((x) => (
          <button key={x.ma} type="button" className="kvm-hh-dong" onClick={() => setMo(x.ma)}>
            <AnhNho m={x} />
            <span className="t"><span>{tenHang(x)}</span><small>{x.ma}</small></span>
            <span className="p"><span>{so(laGD && loaiGia === 'von' ? x.giaVon : x.gia)}</span><small className={(ton[x.ma] ?? 0) < 0 ? 'do' : ''}>Tồn: {so(ton[x.ma] ?? 0)}</small></span>
          </button>
        ))}
        {hien.length > soHien && <div ref={cuoiRef} className="kvm-tai-them">Đang tải thêm…</div>}
        {!ds.length && <KhongCo tieuDe={matHang.length ? undefined : 'Quầy chưa có hàng hóa'} chu={matHang.length ? 'Không tìm thấy hàng hóa nào phù hợp.' : 'Bấm + để thêm món mới.'} />}
      </section>
      <button type="button" className="kvm-fab" aria-label="Thêm hàng hoá mới" onClick={onThem}><Plus size={28} /></button>
    </main>
  );
}

// ----- Danh sách phiếu (Nhập hàng / Xuất hủy / Xuất dùng nội bộ / Kiểm kho) -----
// Chip thời gian trên danh sách phiếu (điện thoại) — như app KiotViet.
const KHOANG_TG = [['all', 'Toàn thời gian'], ['nay', 'Hôm nay'], ['qua', 'Hôm qua'], ['7n', '7 ngày qua'], ['thang', 'Tháng này']];
function khoangTg(k) {
  const d = new Date(); d.setHours(0, 0, 0, 0);
  const homNay = d.getTime(); const ngay = 86400000;
  if (k === 'nay') return [homNay, homNay + ngay];
  if (k === 'qua') return [homNay - ngay, homNay];
  if (k === '7n') return [homNay - 6 * ngay, homNay + ngay];
  if (k === 'thang') return [new Date(d.getFullYear(), d.getMonth(), 1).getTime(), homNay + ngay];
  return [-Infinity, Infinity];
}

function QlPhieu({ loai, ds, matHang, ton, onTao, onMo, onSaoChep, onHuy, onIn, dienThoai, onNhan = null, onVe = null, huyDuoc = () => true }) {
  const K = KIEU_PHIEU[loai];
  const [q, setQ] = useState('');
  const [loc, setLoc] = useState({ tam: true, cho: true, xong: true, huy: false });
  const [loaiXuat, setLoaiXuat] = useState('');
  const [mo, setMo] = useState(null);
  const [trang, setTrang] = useState(0);
  const xhDt = dienThoai && loai === 'huy'; // Xuất huỷ điện thoại: đầu trang riêng y app KiotViet
  const [tg, setTg] = useState(xhDt ? 'nay' : 'thang'); // KiotViet: Xuất huỷ mặc định "Hôm nay", phiếu khác "Tháng này"
  const [moTim, setMoTim] = useState(false);
  const [moLoc, setMoLoc] = useState(false);
  const [cuTruoc, setCuTruoc] = useState(false); // nút ⇅: cũ trước / mới trước
  const t = q.trim().toLowerCase();
  const [tu, den] = khoangTg(tg);
  const loc2 = ds.filter((p) => loc[p.trangThai] && khop(p.ma, t) && (!loaiXuat || p.loaiXuat === loaiXuat) && (!dienThoai || (p.luc >= tu && p.luc < den))).sort((a, b) => (cuTruoc ? a.luc - b.luc : b.luc - a.luc));
  const tr = Math.min(trang, Math.max(Math.ceil(loc2.length / MOI_TRANG_QL), 1) - 1);
  const soCot = { giao: 6, huy: 6, noibo: 7, kiem: 8, chuyen: 7 }[loai];
  const tenTao = loai === 'kiem' ? 'Kiểm kho' : LOAI_PHIEU[loai].ten;
  const kiem = loai === 'kiem';
  // Điện thoại: mỗi phiếu là 1 thẻ như app KiotViet (không bảng vuốt ngang).
  if (dienThoai) {
    return (
      <main className="kvm-ds-hd kvm-trang-ql">
        {xhDt && (
          <header className="kvm-dau kvm-dau-ql">
            <button type="button" aria-label="Quay lại" onClick={onVe}><ChevronLeft size={22} /></button>
            <h1>Xuất huỷ</h1>
            <button type="button" className="kv-ic-tr" aria-label="Tìm phiếu" onClick={() => setMoTim((v) => !v)}><Search size={21} /></button>
            <button type="button" className="kv-ic-tr" aria-label={cuTruoc ? 'Đang xếp cũ trước — bấm để mới trước' : 'Đang xếp mới trước — bấm để cũ trước'} onClick={() => setCuTruoc((v) => !v)}><ArrowDownUp size={20} /></button>
          </header>
        )}
        {(!xhDt || moTim) && <div className="kvm-tim"><label><Search size={17} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder={K.tim} autoFocus={xhDt} /></label></div>}
        <div className="kvm-loc">
          {xhDt && <button type="button" className={`kvm-loc-ic ${moLoc ? 'on' : ''}`} aria-label="Lọc trạng thái phiếu" onClick={() => setMoLoc((v) => !v)}><ListFilter size={19} /></button>}
          <label className={`kvm-chip-tg ${tg !== 'all' ? 'on' : ''}`}>
            <select value={tg} onChange={(e) => setTg(e.target.value)} aria-label="Thời gian">{KHOANG_TG.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
            <ChevronDown size={15} />
          </label>
          {(!xhDt || moLoc) && [['tam', 'Phiếu tạm'], ['xong', TEN_XONG[loai]], ['huy', 'Đã hủy']].map(([k, l]) => <button key={k} type="button" className={loc[k] ? 'on' : ''} onClick={() => setLoc((x) => ({ ...x, [k]: !x[k] }))}>{l}</button>)}
        </div>
        {(!xhDt || loc2.length > 0) && <div className="kvm-tong-phieu">{loc2.length} phiếu{kiem ? '' : <> - SL: {so(loc2.reduce((s2, p) => s2 + soLieuPhieu(p, matHang, ton).tongSl, 0))}</>}</div>}
        <section className="kvm-hd-ds">
          {loc2.map((p, i) => {
            const sl = soLieuPhieu(p, matHang, ton);
            const ngay = nhanNgay(p.luc);
            const dauNhom = kiem && (i === 0 || nhanNgay(loc2[i - 1].luc) !== ngay); // KiotViet: chỉ Kiểm kho chia theo ngày
            const nguon = p.loai === 'giao' ? (p.nguon || 'Bếp') : p.loai === 'chuyen' ? `${p.chiNhanh} → ${p.denCN || ''}` : p.loai === 'noibo' ? `${p.loaiXuat || 'Chưa chọn loại xuất'}${p.denCN ? ` → ${p.denCN}` : ''}` : p.loai === 'huy' ? (p.ghiChu || 'Xuất hủy') : p.chiNhanh;
            const xem = sl.dong.filter((d) => kiem || Number(d.sl) > 0);
            return (
              <React.Fragment key={p.ma}>
                {dauNhom && <div className="kvm-nhom-ngay">{ngay}</div>}
                {kiem ? (
                  <button type="button" className={`kvm-hd-dong kvm-phieu-the ${p.trangThai === 'huy' ? 'huy' : ''}`} onClick={() => setMo(mo === p.ma ? null : p.ma)}>
                    <span className="r1"><b>{xem.length} mặt hàng - Số lượng: {so(sl.tongSl)}</b><span className={`kq-tt ${p.trangThai}`}>{trangThaiCua(p)}</span></span>
                    <span className="r2"><span>{p.ma}{p.nguoi ? ` • ${p.nguoi}` : ''}</span>{p.trangThai !== 'tam' && <span>{ngayDayDu(p.lucXong || p.luc)}</span>}</span>
                    {xem.length > 0 && <span className="r3 xem">{xem.map((d) => `${tenHang(d.m)} x${so(Number(d.sl) || 0)}`).join(', ')}</span>}
                  </button>
                ) : (
                <button type="button" className={`kvm-hd-dong kvm-phieu-the ${p.trangThai === 'huy' ? 'huy' : ''}`} onClick={() => setMo(mo === p.ma ? null : p.ma)}>
                  <span className="r1"><b>{nguon}</b><span className={`kq-tt ${p.trangThai}`}>{trangThaiCua(p)}</span></span>
                  <span className="r2"><span>{ngayDayDu(p.luc)} • {p.ma}{p.nguoi ? ` • ${p.nguoi}` : ''}</span></span>
                  <span className="r2"><span>{xem.length} mặt hàng • {kiem ? `Lệch: ${so(sl.tang - sl.giam)}` : `Số lượng: ${so(sl.tongSl)}`}</span></span>
                  {xem.length > 0 && <span className="r3 xem">{xem.map((d) => `${tenHang(d.m)} x${d.sl == null || d.sl === '' ? '?' : so(d.sl)}`).join(', ')}</span>}
                  {p.ghiChu && p.loai !== 'huy' && <span className="r3">{p.ghiChu}</span>}
                </button>
                )}
                {mo === p.ma && <div className="kvm-phieu-ct"><ChiTietPhieu p={p} sl={sl} onMo={() => onMo(p)} onSaoChep={() => onSaoChep(p)} onHuy={huyDuoc(p) ? () => onHuy(p) : null} onIn={() => onIn(p)} onNhan={onNhan && p.trangThai === 'cho' ? () => onNhan(p) : null} /></div>}
              </React.Fragment>
            );
          })}
          {!loc2.length && (xhDt
            ? <div className="xhd-trong"><span className="hinh"><ReceiptText size={44} /></span><span>{q.trim() ? 'Không tìm thấy phiếu xuất huỷ' : 'Chưa có phiếu xuất huỷ'}</span></div>
            : <KhongCo chu={ds.length ? 'Không có phiếu nào khớp bộ lọc.' : `Chưa có ${/^phiếu /i.test(K.tieuDe) ? '' : 'phiếu '}${K.tieuDe.toLowerCase()} nào. Bấm + để tạo.`} />)}
        </section>
        <button type="button" className={`kvm-fab ${xhDt ? 'thap' : ''}`} aria-label={`Tạo ${tenTao}`} onClick={onTao}><Plus size={28} /></button>
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
                        {loai === 'noibo' && <td>{p.loaiXuat}{p.denCN ? ` → ${p.denCN}` : ''}</td>}
                        {loai === 'kiem' ? <><td>{ngayDayDu(p.luc)}</td><td className="so">{so(sl.tongSl)}</td><td className="so gv">{so(sl.tongGt)}</td><td className="so">{so(sl.tang)}</td><td className="so">{so(sl.giam)}</td></>
                          : loai === 'giao' ? <><td>{ngayDayDu(p.luc)}</td><td>{p.nguon || 'Bếp'}</td><td className="so">{so(sl.tongSl)}</td></>
                            : loai === 'chuyen' ? <><td>{ngayDayDu(p.luc)}</td><td>{p.chiNhanh}</td><td>{p.denCN}</td><td className="so">{so(sl.tongSl)}</td></>
                            : <><td className="so gv">{so(sl.tongGt)}</td><td>{ngayDayDu(p.luc)}</td></>}
                        {loai !== 'kiem' && <td className="ghi">{p.ghiChu}</td>}
                        <td><span className={`kq-tt ${p.trangThai}`}>{trangThaiCua(p)}</span></td>
                      </tr>
                      {mo === p.ma && (
                        <tr className="kq-mo"><td colSpan={soCot}>
                          <ChiTietPhieu p={p} sl={sl} onMo={() => onMo(p)} onSaoChep={() => onSaoChep(p)} onHuy={huyDuoc(p) ? () => onHuy(p) : null} onIn={() => onIn(p)} onNhan={onNhan && p.trangThai === 'cho' ? () => onNhan(p) : null} />
                        </td></tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
            {!loc2.length && <KhongCo chu={ds.length ? 'Không có phiếu nào khớp bộ lọc.' : `Chưa có ${/^phiếu /i.test(K.tieuDe) ? '' : 'phiếu '}${K.tieuDe.toLowerCase()} nào. Nhấn "+ ${loai === 'kiem' ? 'Kiểm kho' : LOAI_PHIEU[loai].ten}" để tạo.`} />}
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
  // Quầy nhận lệch số bếp ghi → hiện thêm cột Thực nhận (số thật đã cộng vào kho quầy).
  const coNhan = p.loai === 'giao' && sl.dong.some((d) => d.slNhan != null && d.slNhan !== Number(d.sl));
  return (
    <div className="kq-ct">
      <nav className="kq-ct-tab"><button type="button" className="on">Thông tin</button></nav>
      <div className="kq-ct-dau"><b>{p.ma}</b><span className={`kq-tt ${p.trangThai}`}>{trangThaiCua(p)}</span><span className="cn">{p.chiNhanh}</span></div>
      <div className="kq-ct-tt">
        <div><small>Người tạo:</small><span>{p.nguoi}</span></div>
        <div><small>{K.nguoi}:</small><span>{p.nguoiThucHien || p.nguoi}</span></div>
        <div><small>{K.ngay}:</small><span>{ngayDayDu(p.lucXong || p.luc)}</span></div>
        {p.loai === 'giao' && <div><small>Nguồn hàng:</small><span>{p.nguon || 'Bếp'}</span></div>}
        {p.chuyen && p.trangThai === 'cho' && <div><small>Lưu ý:</small><span>Chưa cộng tồn — đếm bánh rồi bấm Nhận hàng</span></div>}
        {p.loai === 'noibo' && <div><small>Loại xuất:</small><span>{p.loaiXuat}</span></div>}
        {p.loai === 'noibo' && p.nguoiNhan && <div><small>Người nhận:</small><span>{p.nguoiNhan}</span></div>}
        {p.denCN && <div><small>Chuyển đến:</small><span className="xanh">{p.denCN}</span></div>}
      </div>
      <div className="kq-cuon"><table className="phu">
        <thead><tr><th>Mã hàng</th><th>Tên hàng</th>
          {kiem ? <><th className="so">Tồn kho</th><th className="so">Thực tế</th><th className="so">SL lệch</th><th className="so gv">Giá trị lệch</th></>
            : <><th className="so">{K.sl}</th>{coNhan && <th className="so">Thực nhận</th>}<th className="so gv">Giá vốn</th><th className="so gv">{p.loai === 'giao' ? 'Thành tiền' : p.loai === 'huy' ? 'Giá trị hủy' : 'Giá trị xuất'}</th></>}
        </tr></thead>
        <tbody>
          {sl.dong.map((d) => (
            <tr key={d.ma}><td className="xanh">{d.ma}</td><td>{tenHang(d.m)}</td>
              {kiem ? <><td className="so">{so(d.tonTruoc)}</td><td className="so">{d.sl == null || d.sl === '' ? '—' : so(d.sl)}</td><td className={`so ${d.lech < 0 ? 'am' : ''}`}>{d.lech == null ? '—' : so(d.lech)}</td><td className="so gv">{so(d.giaTri)}</td></>
                : <><td className="so">{so(d.sl)}</td>{coNhan && <td className={`so ${d.slNhan != null && d.slNhan < Number(d.sl) ? 'am' : ''}`}>{d.slNhan == null ? '—' : so(d.slNhan)}</td>}<td className="so gv">{so(d.giaVon)}</td><td className="so gv">{so(d.giaTri)}</td></>}
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
            {coNhan && <div><span>Quầy thực nhận</span><b>{so(sl.dong.reduce((s2, d) => s2 + (d.slNhan ?? (Number(d.sl) || 0)), 0))}</b></div>}
            <div className="gv"><span>Tổng giá trị</span><b>{so(sl.tongGt)}</b></div>
          </>}
        </div>
      </div>
      <div className="kq-ct-chan">
        {p.trangThai !== 'huy' && !p.chuyen && (onHuy ? <button type="button" onClick={onHuy}><Trash2 size={17} />Hủy</button> : <span className="mo">Chỉ Giám đốc hủy được phiếu nhập</span>)}
        <button type="button" onClick={onSaoChep}><Copy size={17} />Sao chép</button>
        <span className="gian" />
        {p.trangThai === 'tam' && <button type="button" className="chinh" onClick={onMo}><SquarePen size={17} />Mở phiếu</button>}
        {onNhan && <button type="button" className="chinh" onClick={onNhan}><ClipboardCheck size={17} />Nhận hàng</button>}
        <button type="button" onClick={onIn}><Printer size={17} />In</button>
      </div>
    </div>
  );
}

// "Chọn nhanh" của phiếu kiểm kho trên điện thoại — như app KiotViet: chọn nhiều nhóm hàng
// (Chọn tất cả / Bỏ chọn tất cả) + phạm vi kiểm (chỉ hàng còn tồn) → Áp dụng thêm cả loạt vào phiếu.
function ChonNhanh({ dmCo, onApDung, onDong }) {
  const [chon, setChon] = useState([]);
  const [conTon, setConTon] = useState(false);
  const [man, setMan] = useState('chinh');
  const [q, setQ] = useState('');
  const [moPham, setMoPham] = useState(true);
  const ten = (v) => dmCo.find((d) => d.value === v)?.label || v;
  if (man === 'nhom') {
    const tatCa = dmCo.length > 0 && chon.length === dmCo.length;
    const t = q.trim().toLowerCase();
    return (
      <div className="kvm kvm-phu kvm-bo-loc">
        <header className="kvm-dau trang">
          <button type="button" aria-label="Quay lại" onClick={() => setMan('chinh')}><ChevronLeft size={22} /></button><h1>Nhóm hàng</h1>
          <button type="button" className="kvm-cn-tat" onClick={() => setChon(tatCa ? [] : dmCo.map((d) => d.value))}>{tatCa ? 'Bỏ chọn tất cả' : 'Chọn tất cả'}</button>
        </header>
        <div className="kvm-tim"><label><Search size={17} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm kiếm" /></label></div>
        <div className="kvm-than">
          <section className="kvm-the">
            {dmCo.filter((d) => khop(d.label, t)).map((d) => (
              <label key={d.value} className="kvm-bl-chon kvm-cn-o"><span>{d.label}</span>
                <input type="checkbox" checked={chon.includes(d.value)} onChange={() => setChon((x) => (x.includes(d.value) ? x.filter((v) => v !== d.value) : [...x, d.value]))} /></label>
            ))}
          </section>
        </div>
        <div className="kvm-chan"><button type="button" className="kv-nut-tt" onClick={() => setMan('chinh')}>Xong</button></div>
      </div>
    );
  }
  return (
    <div className="kvm kvm-phu kvm-bo-loc">
      <header className="kvm-dau trang"><button type="button" aria-label="Quay lại" onClick={onDong}><ChevronLeft size={22} /></button><h1>Chọn nhanh</h1></header>
      <div className="kvm-than">
        <section className="kvm-the">
          <button type="button" className="kvm-bl-dau" onClick={() => setMan('nhom')}><b>Nhóm hàng{chon.length > 0 && <i className="kvm-bl-cham" />}</b><ChevronRight size={20} /></button>
          {chon.length > 0 && <div className="kvm-cn-chip">{chon.map((v) => <span key={v}>{ten(v)}</span>)}</div>}
        </section>
        <section className="kvm-the">
          <button type="button" className="kvm-bl-dau" onClick={() => setMoPham((v) => !v)}><b>Phạm vi kiểm{conTon && <i className="kvm-bl-cham" />}</b>{moPham ? <ChevronUp size={20} /> : <ChevronDown size={20} />}</button>
          {moPham && <label className="kvm-bl-chon kvm-cn-o"><span>Kiểm hàng còn tồn kho</span><input type="checkbox" checked={conTon} onChange={() => setConTon((v) => !v)} /></label>}
        </section>
      </div>
      <div className="kvm-chan kvm-hai">
        <button type="button" className="kvm-nut-vien" onClick={() => { setChon([]); setConTon(false); }}>Đặt lại</button>
        <button type="button" className="kv-nut-tt" onClick={() => onApDung(chon, conTon)}>Áp dụng</button>
      </div>
    </div>
  );
}

// ----- Màn lập phiếu toàn trang -----
function FormPhieu({ loai, phieuCu, matHang, ton, chiNhanh, nguoi, soPhieu, ganDay, onDong, onLuu, that = false, dienThoai = false }) {
  const K = KIEU_PHIEU[loai];
  const kiem = loai === 'kiem';
  const tenPhieu = `Phiếu ${LOAI_PHIEU[loai].ten.toLowerCase()}`;
  const [dong, setDong] = useState(() => phieuCu?.dong?.map((d) => ({ ...d })) || []);
  const [ghiChu, setGhiChu] = useState(phieuCu?.ghiChu || '');
  const [loaiXuat, setLoaiXuat] = useState(phieuCu?.loaiXuat || '');
  const [nguoiNhan, setNguoiNhan] = useState(phieuCu?.nguoiNhan || '');
  const [tab, setTab] = useState('all');
  const [nhom, setNhom] = useState('');
  const [hopNhom, setHopNhom] = useState(false);
  const [chonNhanh, setChonNhanh] = useState(false);
  const [soHien, setSoHien] = useState(60); // 700+ dòng kiểm kho: vẽ dần cho máy yếu đỡ giật
  const cuoiRef = useRef(null);
  const [loi, setLoi] = useState('');
  const [anh, setAnh] = useState(phieuCu?.anh || null); // chạy thật: ảnh bánh huỷ (bắt buộc)
  const [dangAnh, setDangAnh] = useState(false);
  const timRef = useRef(null);
  const dmCo = nhomCo(matHang);
  const chonAnh = async (f) => {
    setDangAnh(true); setLoi('');
    try { setAnh(await taiAnh(f, 'xuat-huy')); } catch (e) { setLoi(`Không tải được ảnh: ${chuLoi(e)}`); }
    setDangAnh(false);
  };
  const luanChuyen = loai === 'noibo' && loaiXuat === LUAN_CHUYEN;
  const [denChon, setDenChon] = useState(phieuCu?.denCN || '');
  const cnKhac = CHI_NHANH.filter((c) => c !== chiNhanh);
  // Luân chuyển chạy thật: bắt chọn cửa hàng nhận (không tự lấy cửa hàng đầu tiên — chuyển nhầm là lệch tồn 2 bên).
  const denCN = loai === 'chuyen' || (luanChuyen && !that) ? (cnKhac.includes(denChon) ? denChon : cnKhac[0]) : luanChuyen && cnKhac.includes(denChon) ? denChon : null;
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

  useEffect(() => { if (!dienThoai) timRef.current?.focus(); }, [dienThoai]);
  useEffect(() => { setSoHien(60); }, [tab]);
  useEffect(() => {
    const el = cuoiRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return undefined;
    const ob = new IntersectionObserver((e) => { if (e[0].isIntersecting) setSoHien((n) => n + 60); }, { rootMargin: '400px' });
    ob.observe(el);
    return () => ob.disconnect();
  });
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
  // Nhập/xuất: phải chọn 1 nhóm (không thêm cả trăm bánh); kiểm kho mới có "Tất cả".
  const nhomC = !kiem && !nhom ? (dmCo[0]?.value || '') : nhom;
  const themNhom = () => {
    const moi = matHang.filter((m) => (!nhomC || m.danhMuc === nhomC) && !dong.some((d) => d.ma === m.ma));
    setDong((ds) => [...ds, ...moi.map((m) => ({ ma: m.ma, sl: null }))]);
    setHopNhom(false);
    if (kiem) setTab('chua');
  };
  // Chọn nhanh (điện thoại): nhiều nhóm + "chỉ hàng còn tồn" → để trống ô Thực tế cho đếm.
  const apChonNhanh = (dsNhom, conTon) => {
    setChonNhanh(false);
    if (!dsNhom.length && !conTon) return;
    const moi = matHang.filter((m) => (!dsNhom.length || dsNhom.includes(m.danhMuc)) && (!conTon || (ton[m.ma] ?? 0) > 0) && !dong.some((d) => d.ma === m.ma));
    setDong((ds) => [...ds, ...moi.map((m) => ({ ma: m.ma, sl: null }))]);
    setTab('all');
  };
  const datSl = (maH, v) => setDong((ds) => ds.map((d) => (d.ma === maH ? { ...d, sl: v === '' ? (kiem ? null : 0) : Number(v) } : d)));
  const bo = (maH) => setDong((ds) => ds.filter((d) => d.ma !== maH));

  const luu = (xong) => {
    const sach = { ...phieu, dong: kiem ? dong : dong.filter((d) => Number(d.sl) > 0) };
    if (!sach.dong.length) { setLoi(`${tenPhieu} đang trống.`); return; }
    if (xong) {
      if (kiem && dong.every((d) => d.sl == null || d.sl === '')) { setLoi(`${tenPhieu} đang trống.`); return; }
      if (kiem && chuaKiem) { setLoi(`Còn ${chuaKiem} hàng chưa kiểm — nhập số thực tế (đếm được 0 thì nhập 0) hoặc xóa dòng.`); setTab('chua'); return; }
      if (loai === 'noibo' && !loaiXuat) { setLoi('Chọn loại xuất trước khi hoàn thành.'); return; }
      if (luanChuyen && !denCN) { setLoi('Chọn cửa hàng nhận bánh trước khi hoàn thành.'); return; }
      if (loai === 'huy' && !ghiChu.trim()) { setLoi('Ghi lý do hủy vào ô Ghi chú (VD: hết date).'); return; }
      if (that && loai === 'huy' && !anh) { setLoi('Chụp ảnh bánh huỷ trước khi hoàn thành.'); return; }
    }
    onLuu(sach, xong);
  };

  if (chonNhanh) return <ChonNhanh dmCo={dmCo} onApDung={apChonNhanh} onDong={() => setChonNhanh(false)} />;
  return (
    <div className={`kf ${dienThoai ? 'kf-dt' : ''}`}>
      <section className="kf-trai">
        <div className="kf-dau">
          <button type="button" className="kf-ve" aria-label={dienThoai ? 'Đóng' : 'Quay lại'} onClick={onDong}>{dienThoai ? <X size={22} /> : <ArrowLeft size={20} />}</button>
          <h1>{dienThoai ? (phieuCu?.ma ? `${tenPhieu} ${phieuCu.ma}` : `${tenPhieu} mới`) : (kiem ? 'Kiểm kho' : LOAI_PHIEU[loai].ten)}</h1>
          <div className="kf-tim">
            <TimHang matHang={matHang} ton={ton} inputRef={timRef} onChon={them} goiY={dienThoai ? 'Tên, mã hàng' : 'Tìm hàng hóa theo mã hoặc tên (F3)'} nhe />
            {dienThoai && kiem
              ? <button type="button" className="kf-nut-nhom doc" onClick={() => setChonNhanh(true)}><ListChecks size={18} />Chọn nhanh</button>
              : <button type="button" className={dienThoai ? 'kf-nut-nhom doc' : 'kv-ic'} title="Thêm hàng theo nhóm" aria-label="Thêm hàng theo nhóm" onClick={() => setHopNhom(true)}>{dienThoai ? <ListChecks size={18} /> : <LayoutGrid size={18} />}{dienThoai && 'Nhóm hàng'}</button>}
          </div>
        </div>
        {kiem && (!dienThoai || dong.length > 0) && (
          <nav className="kf-tabs">
            {[['all', 'Tất cả', dong.length], ['khop', 'Khớp', soKhop], ['lech', 'Lệch', lechN], ['chua', 'Chưa kiểm', chuaKiem]].map(([k, l0, n0]) => [k, dienThoai ? `${l0} ${n0}` : `${l0} (${n0})`]).map(([k, l]) => (
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
          {dongHien.slice(0, soHien).map((d, i) => (dienThoai && kiem ? (
            <div key={d.ma} className="kf-dt-kiem">
              <AnhNho m={d.m || { ten: d.ma }} />
              <div className="tt">
                <b>{tenHang(d.m)}</b><small>{d.ma}</small>
                <small>Tồn: {so(d.tonTruoc)}{d.lech != null && d.lech !== 0 && <span className={d.lech < 0 ? 'am' : 'duong'}> · Lệch {d.lech > 0 ? '+' : ''}{so(d.lech)}</span>}</small>
              </div>
              <button type="button" className="xoa" aria-label={`Xóa ${tenHang(d.m)}`} onClick={() => bo(d.ma)}><Trash2 size={17} /></button>
              <div className="dk">
                <div className="kf-buoc">
                  <button type="button" aria-label="Bớt 1" onClick={() => datSl(d.ma, Math.max(0, (Number(d.sl) || 0) - 1))}><Minus size={18} /></button>
                  <input inputMode="numeric" value={d.sl == null ? '' : d.sl} placeholder="Nhập SL" aria-label={`Thực tế ${tenHang(d.m)}`}
                    onChange={(e) => datSl(d.ma, soTien(e.target.value))} onFocus={(e) => e.target.select()} />
                  <button type="button" aria-label="Thêm 1" onClick={() => datSl(d.ma, (Number(d.sl) || 0) + 1)}><Plus size={18} /></button>
                </div>
                <button type="button" className={`kf-khop ${d.lech === 0 ? 'on' : ''}`} onClick={() => datSl(d.ma, Math.max(0, Number(d.tonTruoc) || 0))}><CircleCheck size={17} />Khớp</button>
              </div>
            </div>
          ) : (
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
          )))}
          {dongHien.length > soHien && <div ref={cuoiRef} className="kvm-tai-them">Đang tải thêm…</div>}
          {!dong.length && (
            <div className="kf-rong">
              <ScanBarcode size={36} />
              <b>{dienThoai ? 'Chưa có hàng trong phiếu' : 'Quét mã vạch hoặc gõ tên bánh vào ô tìm (F3)'}</b>
              <span>{kiem ? `Quét từng cái để đếm — quét lại cùng loại sẽ tự cộng thêm 1. Hoặc bấm "${dienThoai ? 'Chọn nhanh' : 'nút lưới'}" để thêm cả nhóm rồi nhập số đếm.` : 'Gõ tên bánh vào ô tìm, chọn lại cùng 1 hàng sẽ tự cộng thêm 1. Hoặc bấm "Nhóm hàng" để thêm cả nhóm rồi điền số lượng.'}</span>
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
            <label className="kf-r"><span>Tới chi nhánh</span>
              <select className="kf-chon" value={denCN || ''} onChange={(e) => setDenChon(e.target.value)}>{cnKhac.map((c) => <option key={c}>{c}</option>)}</select></label>
            <div className="kf-chuyen">Hoàn thành sẽ <b>trừ tồn {chiNhanh}</b> và <b>cộng tồn {denCN}</b> cùng lúc — bên nhận không cần lập thêm phiếu.</div>
          </>}
          {loai === 'noibo' && <>
            <label className="kf-r"><span>Loại xuất</span>
              <select className="kf-chon" value={loaiXuat} onChange={(e) => { setLoaiXuat(e.target.value); setLoi(''); }}>
                <option value="">Chọn loại xuất</option>{LOAI_NOI_BO.map((l) => <option key={l}>{l}</option>)}
              </select></label>
            {luanChuyen && that && <label className="kf-r"><span>Cửa hàng nhận</span>
              <select className="kf-chon" value={denCN || ''} onChange={(e) => { setDenChon(e.target.value); setLoi(''); }}>
                <option value="">Chọn cửa hàng nhận</option>{cnKhac.map((c) => <option key={c}>{c}</option>)}</select></label>}
            {luanChuyen && (that
              ? <div className="kf-chuyen">Hoàn thành sẽ <b>trừ tồn {chiNhanh}</b> ngay. {denCN ? <b>{denCN}</b> : 'Cửa hàng nhận'} thấy phiếu <b>chờ nhận</b> ở mục Nhập hàng — đếm bánh thật rồi bấm <b>Nhận hàng</b> mới cộng tồn bên đó.</div>
              : <div className="kf-chuyen">Hoàn thành sẽ <b>trừ tồn {chiNhanh}</b> và <b>cộng tồn {denCN}</b> cùng lúc — không cần lập thêm phiếu bên kia.</div>)}
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
          {loi && !dienThoai && <p className="kv-loi">{loi}</p>}
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
            <select className="bhq-o" value={nhomC} onChange={(e) => setNhom(e.target.value)}>
              {kiem && <option value="">Tất cả nhóm hàng</option>}{dmCo.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
            </select></label>
          <p className="bhq-ghi">Thêm {matHang.filter((m) => (!nhomC || m.danhMuc === nhomC) && !dong.some((d) => d.ma === m.ma)).length} hàng vào phiếu, {kiem ? 'để trống cột "Thực tế" (mục Chưa kiểm) cho bạn đếm rồi nhập.' : 'để trống số lượng cho bạn điền — hàng nào để trống sẽ tự bỏ khi lưu.'}</p>
        </Hop>
      )}
      {dienThoai && loi && (
        <Hop tieuDe="Thông báo" onDong={() => setLoi('')} chan={<button type="button" className="bhq-nut chinh" onClick={() => setLoi('')}>OK</button>}>
          <p className="bhq-thong-bao">{loi}</p>
        </Hop>
      )}
    </div>
  );
}

// ----- Xuất huỷ trên điện thoại: y app KiotViet -----
// + → ô tìm "Tên, mã hàng, mã vạch" (Huỷ) → chạm 1 hàng → màn hàng (Số lượng huỷ · Giá vốn · Giá trị huỷ · Xong)
// → "Phiếu xuất huỷ mới" (Lưu tạm · Tiếp tục) → màn xác nhận MẶT HÀNG / SL HỦY (Lưu tạm · Hoàn thành).
// Giá vốn / giá trị huỷ: chỉ Giám đốc thấy (lớp .gv — màn nhân viên ẩn như mọi chỗ khác).
// Sumi bắt buộc thêm: lý do huỷ (Thêm ghi chú) + ảnh bánh huỷ khi chạy thật.
function XuatHuyDt({ phieuCu, matHang, ton, chiNhanh, nguoi, soPhieu, onDong, onLuu, that = false }) {
  const [dong, setDong] = useState(() => phieuCu?.dong?.map((d) => ({ ...d })) || []);
  const [ghiChu, setGhiChu] = useState(phieuCu?.ghiChu || '');
  const [anh, setAnh] = useState(phieuCu?.anh || null);
  const [dangAnh, setDangAnh] = useState(false);
  const [buoc, setBuoc] = useState('phieu'); // phieu | xac_nhan
  const [tim, setTim] = useState(!phieuCu?.dong?.length); // phiếu mới: mở ô tìm ngay như KiotViet
  const [q, setQ] = useState('');
  const [hang, setHang] = useState(null); // { ma, sl: '' | số } — màn 1 hàng
  const [moGhi, setMoGhi] = useState(!!phieuCu?.ghiChu);
  const [loi, setLoi] = useState('');
  const timRef = useRef(null);
  const slRef = useRef(null);
  const ma = phieuCu?.ma || `${LOAI_PHIEU.huy.tienTo}${String(soPhieu).padStart(6, '0')}`;
  const tenPhieu = phieuCu?.ma ? `Phiếu xuất huỷ ${phieuCu.ma}` : 'Phiếu xuất huỷ mới';
  const phieu = {
    id: phieuCu?.id, anh, ma, loai: 'huy', chiNhanh, nguoi: phieuCu?.nguoi || nguoi, nguoiThucHien: nguoi, luc: phieuCu?.luc || Date.now(),
    ghiChu: ghiChu.trim(), loaiXuat: '', nguoiNhan: '', denCN: null, nguon: '', dong: dong.filter((d) => Number(d.sl) > 0), trangThai: 'tam',
  };
  const sl = soLieuPhieu(phieu, matHang, ton);
  const ketQua = useMemo(() => {
    const t = q.trim().toLowerCase();
    return t ? locXep(matHang, (m) => `${m.ma} ${m.ten} ${m.size} ${m.maVach || ''}`, t, 40) : [];
  }, [matHang, q]);
  const mHang = hang ? matHang.find((m) => m.ma === hang.ma) : null;

  useEffect(() => { if (tim) setTimeout(() => timRef.current?.focus(), 50); }, [tim]);
  useEffect(() => { if (hang) setTimeout(() => slRef.current?.focus(), 50); }, [hang?.ma]); // eslint-disable-line react-hooks/exhaustive-deps

  const moHang = (m) => {
    const co = dong.find((d) => d.ma === m.ma);
    setHang({ ma: m.ma, sl: co ? Number(co.sl) || '' : '' });
    setTim(false); setQ('');
  };
  const xongHang = () => {
    const n = Number(hang.sl) || 0;
    if (n <= 0) { setLoi('Nhập số lượng huỷ.'); return; }
    setDong((ds) => (ds.some((d) => d.ma === hang.ma) ? ds.map((d) => (d.ma === hang.ma ? { ...d, sl: n } : d)) : [...ds, { ma: hang.ma, sl: n }]));
    setHang(null);
  };
  const doiSl = (maH, buocSl) => setDong((ds) => ds.flatMap((d) => {
    if (d.ma !== maH) return [d];
    const n = (Number(d.sl) || 0) + buocSl;
    return n <= 0 ? [] : [{ ...d, sl: n }];
  }));
  const quetEnter = (e) => {
    if (e.key !== 'Enter') return;
    const t = q.trim().toUpperCase();
    const m = matHang.find((x) => x.ma === t || (x.maVach && x.maVach === q.trim())) || (ketQua.length === 1 ? ketQua[0] : null);
    if (m) moHang(m);
  };
  const chonAnh = async (f) => {
    setDangAnh(true); setLoi('');
    try { setAnh(await taiAnh(f, 'xuat-huy')); } catch (e) { setLoi(`Không tải được ảnh: ${chuLoi(e)}`); }
    setDangAnh(false);
  };
  const tiepTuc = () => { if (!phieu.dong.length) { setLoi('Phiếu xuất huỷ đang trống.'); return; } setBuoc('xac_nhan'); };
  const luu = (xong) => {
    if (!phieu.dong.length) { setLoi('Phiếu xuất huỷ đang trống.'); return; }
    if (xong && !ghiChu.trim()) { setMoGhi(true); setLoi('Bấm "Thêm ghi chú" ghi lý do huỷ (VD: Hết date) rồi mới hoàn thành.'); return; }
    if (xong && that && !anh) { setLoi('Chụp ảnh bánh huỷ trước khi hoàn thành.'); return; }
    onLuu(phieu, xong);
  };
  const ghiChuO = (coAnh = true) => (
    <section className="xhd-the">
      {!moGhi
        ? <button type="button" className="xhd-lien" onClick={() => setMoGhi(true)}>Thêm ghi chú</button>
        : <>
          <div className="xhd-ly-do">{LY_DO_HUY.map((l) => <button key={l} type="button" className={ghiChu === l ? 'on' : ''} onClick={() => { setGhiChu(l); setLoi(''); }}>{l}</button>)}</div>
          <textarea className="xhd-ghi" rows={2} value={ghiChu} placeholder="Ghi chú (lý do huỷ)" onChange={(e) => { setGhiChu(e.target.value); setLoi(''); }} />
        </>}
      {coAnh && that && <ChupAnh path={anh} dang={dangAnh} onChon={chonAnh} />}
    </section>
  );
  const tongO = (
    <section className="xhd-the xhd-tong">
      <div><b>Tổng giá trị hủy</b><small>{sl.dong.length} mặt hàng • Số lượng: {so(sl.tongSl)}</small></div>
      <b className="gv">{so(sl.tongGt)}</b>
    </section>
  );

  let man;
  if (tim) {
    man = (
      <div className="xhd xhd-tim">
        <div className="xhd-tim-dau">
          <label><Search size={18} /><input ref={timRef} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={quetEnter}
            placeholder="Tên, mã hàng, mã vạch" autoComplete="off" enterKeyHint="search" aria-label="Tìm hàng" />
            {q ? <button type="button" className="xoa" aria-label="Xoá chữ" onClick={() => { setQ(''); timRef.current?.focus(); }}><X size={14} /></button>
              : <button type="button" className="quet" aria-label="Quét mã vạch" onClick={() => timRef.current?.focus()}><ScanBarcode size={18} /></button>}
          </label>
          <button type="button" className="huy" onClick={() => { setTim(false); setQ(''); }}>Huỷ</button>
        </div>
        <div className="xhd-kq">
          {ketQua.map((m) => (
            <button key={m.ma} type="button" onClick={() => moHang(m)}>
              <AnhNho m={m} />
              <span className="t"><b>{tenHang(m)}</b><small>{m.ma}</small></span>
              <span className="p"><b>{so(m.gia)}</b><small>Tồn: {so(ton[m.ma] ?? 0)}</small></span>
            </button>
          ))}
          {q.trim() && !ketQua.length && <p className="xhd-rong-chu">Không tìm thấy hàng hoá phù hợp</p>}
        </div>
      </div>
    );
  } else if (hang && mHang) {
    const n = Number(hang.sl) || 0;
    man = (
      <div className="xhd">
        <header className="xhd-dau"><button type="button" aria-label="Quay lại" onClick={() => setHang(null)}><ChevronLeft size={24} /></button><h1>{mHang.ma}</h1></header>
        <div className="xhd-than">
          <section className="xhd-the xhd-mon"><AnhNho m={mHang} /><div><b>{tenHang(mHang)}</b><small>Tồn: {so(ton[mHang.ma] ?? 0)}</small></div></section>
          <section className="xhd-the xhd-o">
            <div className="r"><span>Số lượng huỷ</span>
              <div className="kf-buoc xhd-buoc">
                <button type="button" aria-label="Bớt 1" onClick={() => setHang((h) => ({ ...h, sl: Math.max(0, (Number(h.sl) || 0) - 1) || '' }))}><Minus size={18} /></button>
                <input ref={slRef} inputMode="numeric" value={hang.sl} aria-label="Số lượng huỷ" onFocus={(e) => e.target.select()}
                  onChange={(e) => { setLoi(''); setHang((h) => ({ ...h, sl: soTien(e.target.value) || '' })); }} onKeyDown={(e) => { if (e.key === 'Enter') xongHang(); }} />
                <button type="button" aria-label="Thêm 1" onClick={() => { setLoi(''); setHang((h) => ({ ...h, sl: (Number(h.sl) || 0) + 1 })); }}><Plus size={18} /></button>
              </div>
            </div>
            <div className="r gv"><span>Giá vốn</span><span className="khoa">{so(mHang.giaVon || 0)}</span></div>
            <div className="r gv"><span>Giá trị huỷ</span><span className="khoa">{so(n * (mHang.giaVon || 0))}</span></div>
          </section>
          {ghiChuO(false)}
        </div>
        <footer className="xhd-chan"><button type="button" className="chinh" onClick={xongHang}>Xong</button></footer>
      </div>
    );
  } else if (buoc === 'xac_nhan') {
    man = (
      <div className="xhd">
        <header className="xhd-dau"><button type="button" aria-label="Quay lại" onClick={() => setBuoc('phieu')}><ChevronLeft size={24} /></button><h1 /></header>
        <div className="xhd-than">
          <section className="xhd-the xhd-bang">
            <div className="dau"><span>MẶT HÀNG</span><span>SL HỦY</span></div>
            {sl.dong.map((d) => (
              <div key={d.ma} className="dong"><div><b>{tenHang(d.m) || d.ma}</b><small>{d.ma}</small><small className="gv">Giá vốn {so(d.giaVon)}</small></div><span>{so(d.sl)}</span></div>
            ))}
          </section>
          {tongO}
          {ghiChuO()}
        </div>
        <footer className="xhd-chan hai">
          <button type="button" className="phu" onClick={() => luu(false)}>Lưu tạm</button>
          <button type="button" className="chinh" disabled={dangAnh} onClick={() => luu(true)}>Hoàn thành</button>
        </footer>
      </div>
    );
  } else {
    man = (
      <div className="xhd">
        <header className="xhd-dau"><button type="button" aria-label="Đóng" onClick={onDong}><X size={22} /></button><h1>{tenPhieu}</h1>
          <button type="button" className="ph" aria-label="Thông tin phiếu" onClick={() => setLoi(`${ma} · ${chiNhanh} · Người tạo: ${phieu.nguoi}`)}><Info size={20} /></button></header>
        <div className="xhd-tim-mo">
          <button type="button" className="o" onClick={() => setTim(true)}><Search size={17} /><span>Tên, mã hàng, mã vạch</span></button>
          <button type="button" className="quet" onClick={() => setTim(true)}><ScanBarcode size={20} /><small>Quét</small></button>
        </div>
        <div className="xhd-than">
          {sl.dong.length ? <>
            <section className="xhd-the xhd-ds">
              {sl.dong.map((d) => (
                <div key={d.ma} className="xhd-dong">
                  <button type="button" className="mo" onClick={() => d.m && moHang(d.m)}>
                    <AnhNho m={d.m || { ten: d.ma }} />
                    <span className="t"><b>{tenHang(d.m) || d.ma}</b><small>{d.ma}</small><small>Tồn: {so(ton[d.ma] ?? 0)}<span className="gv"> • Giá vốn: {so(d.giaVon)}</span></small></span>
                  </button>
                  <div className="kf-buoc xhd-buoc nho">
                    <button type="button" aria-label="Bớt 1" onClick={() => doiSl(d.ma, -1)}>{Number(d.sl) <= 1 ? <Trash2 size={16} /> : <Minus size={18} />}</button>
                    <input inputMode="numeric" value={d.sl} aria-label={`Số lượng huỷ ${tenHang(d.m)}`} onFocus={(e) => e.target.select()}
                      onChange={(e) => setDong((ds) => ds.map((x) => (x.ma === d.ma ? { ...x, sl: soTien(e.target.value) } : x)))} />
                    <button type="button" aria-label="Thêm 1" onClick={() => doiSl(d.ma, 1)}><Plus size={18} /></button>
                  </div>
                </div>
              ))}
            </section>
            {tongO}
            {ghiChuO()}
          </> : (
            <div className="xhd-trong"><span className="hinh"><ReceiptText size={44} /></span><span>Chưa có hàng trong phiếu</span></div>
          )}
        </div>
        <footer className="xhd-chan hai">
          <button type="button" className="phu" onClick={() => luu(false)}>Lưu tạm</button>
          <button type="button" className="chinh" onClick={tiepTuc}>Tiếp tục</button>
        </footer>
      </div>
    );
  }
  return (
    <>
      {man}
      {loi && (
        <Hop tieuDe="Thông báo" onDong={() => setLoi('')} chan={<button type="button" className="bhq-nut chinh" onClick={() => setLoi('')}>OK</button>}>
          <p className="bhq-thong-bao">{loi}</p>
        </Hop>
      )}
    </>
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

function ChiTietHd({ h, tra, huyDuoc, dienThoai, onTra = null, onIn, onHuy, onChiaSe, onSaoChep }) {
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
        <div><small>Thanh toán:</small><span>{h.chia ? chuChia(h.chia) : PT[h.phuongThuc]}</span></div>
      </div>
      {dienThoai && h.dong.length > 0 && (
        <ul className="kvm-hd-mon">
          {h.dong.map((d) => {
            const tien = tienDong(d);
            const giam = d.gia * d.sl - tien;
            return (
              <li key={`${d.ma}${d.tang ? ':tang' : ''}`}>
                <div><b>{d.ten}{d.size ? ` - ${d.size}` : ''}{d.tang ? <i className="km-tag">Tặng</i> : null}</b><small>{d.ma} · {so(d.sl)} x {so(tien / d.sl)}{giam > 0 ? <s> {so(d.gia)}</s> : null}</small>{d.ghiChu ? <small className="kv-dong-ghi">{d.ghiChu}</small> : null}</div>
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
                <tr key={`${d.ma}${d.tang ? ':tang' : ''}`}><td className="xanh">{d.ma}</td><td>{d.ten}{d.size ? ` - ${d.size}` : ''}{d.tang ? <i className="km-tag">Tặng</i> : null}{d.ghiChu ? <small className="kv-dong-ghi"> · {d.ghiChu}</small> : null}</td>
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
          {h.kmTen && <div><span>Trong đó khuyến mại ({h.kmTen})</span><b>{so(h.kmGiam)}</b></div>}
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
          {huyDuoc ? <button type="button" onClick={onHuy}><Trash2 size={17} />Hủy</button> : <span className="mo">{tra.length ? 'Đã có phiếu trả hàng — không hủy được' : 'Đã đóng ca — chỉ Quản lý / Giám đốc hủy được'}</span>}
          {onTra && <button type="button" onClick={onTra}><RotateCcw size={17} />Trả hàng</button>}
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
function ChiTietHdDt({ h, tra = [], onTra = null, huyDuoc, onLui, onIn, onHuy, onChiaSe, onSaoChep }) {
  const [cuon, setCuon] = useState(false);
  const [menu, setMenu] = useState(false);
  const [moPt, setMoPt] = useState(false);
  const [daChep, setDaChep] = useState(false);
  const daTra = h.thucThu ?? h.canTra - h.no;
  const trangThai = h.daHuy ? 'Đã hủy' : h.guiLoi ? 'Gửi lỗi' : h.choGui ? 'Chờ gửi' : 'Hoàn thành';
  const chep = () => {
    try { window.navigator.clipboard?.writeText(h.ma); } catch { /* trình duyệt chặn — bỏ qua */ }
    setDaChep(true); setTimeout(() => setDaChep(false), 1500);
  };
  const ds = [
    ['Bảng giá', h.bangGia || 'Bảng giá chung'], ['Kênh bán', 'Bán trực tiếp'],
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
          {onTra && <button type="button" onClick={onTra}><RotateCcw size={18} />Trả hàng</button>}
          {!h.daHuy && huyDuoc && <button type="button" className="do" onClick={onHuy}><Trash2 size={18} />Hủy hóa đơn</button>}
        </div></div>
      )}
      <div className="kvm-than" onScroll={(e) => setCuon(e.currentTarget.scrollTop > 56)}>
        <section className="kvm-ct-the dau">
          <div><h2>{h.ma}<button type="button" aria-label="Sao chép mã hóa đơn" onClick={chep}>{daChep ? <Check size={20} /> : <Copy size={20} />}</button></h2><span>{ngayDayDu(h.luc)}</span></div>
          <i className={`kvm-ct-tt ${h.daHuy || h.guiLoi ? 'huy' : h.choGui ? 'cho' : ''}`}>{trangThai}</i>
        </section>
        <section className="kvm-ct-the kh"><span className="av"><User size={30} fill="currentColor" strokeWidth={0} /></span><b>{h.khach?.name || 'Khách lẻ'}</b>{h.khach?.phone ? <small>{h.khach.phone}</small> : null}</section>
        <section className="kvm-ct-the">
          {h.dong.map((d) => {
            const tien = tienDong(d);
            return (
              <div key={`${d.ma}${d.tang ? ':tang' : ''}`} className="kvm-ct-mon">
                <AnhNho m={d} />
                <div className="g"><b>{d.ten}{d.size ? ` ${d.size}` : ''}{d.tang ? <i className="km-tag">Tặng</i> : null}</b><small>{d.ma}</small>{d.ghiChu ? <small className="kv-dong-ghi">{d.ghiChu}</small> : null}
                  <span className="h"><span>{so(d.sl ? tien / d.sl : d.gia)} x {so(d.sl)}</span><span className="tt">{so(tien)}</span></span></div>
              </div>
            );
          })}
        </section>
        <section className="kvm-ct-the tien">
          <div><span>Tổng tiền hàng <i className="kvm-tron vien">{h.dong.reduce((s2, d) => s2 + d.sl, 0)}</i></span><span>{so(h.tongHang)}</span></div>
          <div><span>Giảm giá</span><span>{so(h.giamHd)}</span></div>
          {h.kmTen && <div><span>Khuyến mại: {h.kmTen}</span><span>{so(h.kmGiam)}</span></div>}
          {h.thuKhac > 0 && <div><span>Thu khác</span><span>{so(h.thuKhac)}</span></div>}
          {h.vat > 0 && <div><span>VAT 8%</span><span>{so(h.vat)}</span></div>}
          <div className="dam"><span>Khách cần trả</span><span>{so(h.canTra)}</span></div>
          <div className="dam"><span>Khách đã trả</span><span className="xanh lon">{so(daTra)}</span></div>
          <button type="button" className="pt" aria-expanded={moPt} onClick={() => setMoPt((v) => !v)}>{moPt ? <ChevronUp size={18} /> : <ChevronDown size={18} />}{PT[h.phuongThuc]}</button>
          {moPt && (h.chia ? Object.entries(h.chia).filter(([, v]) => Number(v) > 0).map(([k, v]) => <div key={k} className="pt-ct"><span>{PT[k]}</span><span>{so(v)}</span></div>)
            : <div className="pt-ct"><span>{PT[h.phuongThuc]}</span><span>{so(daTra)}</span></div>)}
          {h.ckTrangThai === 'cho_xac_nhan' && <div className="ck-cho"><span>Tiền chuyển khoản chờ Quản lý / Kế toán xác nhận đã về</span></div>}
          {h.choGui && !h.guiLoi && <div className="ck-cho"><span>Đang mất mạng — hoá đơn giữ trên máy, có mạng sẽ tự gửi lên</span></div>}
          {h.guiLoi && <div className="ck-cho"><span>Gửi lên không được: {h.guiLoi} — hoá đơn vẫn giữ trên máy, báo Quản lý</span></div>}
          {h.no > 0 && <div className="no"><span>Còn nợ</span><span>{so(h.no)}</span></div>}
        </section>
        <section className="kvm-ct-the ghi"><small>GHI CHÚ</small><p className={h.ghiChu ? '' : 'mo'}>{h.ghiChu || 'Chưa có ghi chú...'}</p></section>
        {tra.length > 0 && (
          <section className="kvm-ct-the ghi"><small>ĐÃ TRẢ HÀNG</small>
            {tra.map((x) => <p key={x.ma}><b>{x.ma}</b> · {ngayDayDu(x.luc)} · {x.dong.map((d) => `${so(d.sl)} ${d.ten}`).join(', ')} · trả khách {so(x.hoan)}{x.truNo > 0 ? `, trừ nợ ${so(x.truNo)}` : ''}{x.lyDo ? ` · ${x.lyDo}` : ''}</p>)}
          </section>
        )}
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

function QlHoaDon({ ds, traHangs, dienThoai, huyDuoc, traDuoc = () => false, onTra, onIn, onHuy, onChiaSe, onSaoChep, onBan, laGD }) {
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
  // Tắt cả hai nút trạng thái = xem tất cả (không để màn trống vì lỡ bấm tắt hết).
  const tatHet = !loc.xong && !loc.huy;
  const hopKhac = ds.filter((h) => trongKy(h.luc, ky) && (!pt || h.phuongThuc === pt || Number(h.chia?.[pt]) > 0)
    && khop(`${h.ma} ${h.khach?.name || ''} ${h.khach?.phone || ''}`, t));
  const loc2 = hopKhac.filter((h) => tatHet || loc[h.daHuy ? 'huy' : 'xong']);
  // Đang ẩn hoá đơn Hoàn thành mà có hoá đơn để xem → nhắc + nút bật lại (nhân viên hay lỡ bấm tắt).
  const anXong = !tatHet && !loc.xong ? hopKhac.filter((h) => !h.daHuy).length : 0;
  const nhacAn = anXong > 0 && (
    <button type="button" className="kq-nhac-an" onClick={() => { setLoc({ xong: true, huy: false }); setTrang(0); }}>
      Đang ẩn {so(anXong)} hóa đơn Hoàn thành — bấm để xem
    </button>
  );
  const tr = Math.min(trang, Math.max(Math.ceil(loc2.length / MOI_TRANG_QL), 1) - 1);
  const traCua = (ma) => traHangs.filter((x) => x.hdGoc === ma);
  const chiTiet = (h) => (
    <ChiTietHd h={h} tra={traCua(h.ma)} huyDuoc={huyDuoc(h)} dienThoai={dienThoai} onTra={traDuoc(h) ? () => onTra(h) : null}
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
      return <ChiTietHdDt h={hdMo} tra={traCua(hdMo.ma)} onTra={traDuoc(hdMo) ? () => onTra(hdMo) : null} huyDuoc={huyDuoc(hdMo)} onLui={() => setMo(null)} onIn={() => onIn(hdMo)} onHuy={() => onHuy(hdMo)} onChiaSe={() => onChiaSe(hdMo)} onSaoChep={() => onSaoChep(hdMo)} />;
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
          {nhacAn}
          {!loc2.length && <KhongCo chu={nhacAn ? 'Không có hóa đơn đã hủy.' : 'Chưa có hóa đơn nào.'} />}
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
            {nhacAn}
            {!loc2.length && <KhongCo chu={nhacAn ? 'Không có hóa đơn đã hủy.' : 'Không tìm thấy hóa đơn nào phù hợp.'} />}
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
function NhieuHon({ congNo, chiNhanh, setChiNhanh, onMo, onHop, laGD, laChu, xemNV, setXemNV, onDatHang, mucThat = [], onMucThat, anChuyen = false, soQuy = false, khuyenMai = false, traHang = false }) {
  const nhom = laGD ? [
    ['Giao dịch', [['ban', 'Bán hàng', ShoppingBag, 'xanh'], ['ls', 'Hóa đơn', FileText, 'xanh'], ['dat', 'Đặt hàng', ShoppingCart, 'xanh'],
      ['no', 'Công nợ', ReceiptText, 'cam'], ['ket_ca', 'Kết ca', Clock, 'xanh'], ['ngay', 'Báo cáo cuối ngày', ChartArea, 'la']]],
    ['Hàng hoá', [['hh', 'Hàng hoá', Box, 'xanh'], ['kk', 'Kiểm kho', ClipboardCheck, 'la'], ['pn', 'Nhập hàng', Download, 'xanh'], ['ch', 'Chuyển hàng', Truck, 'xanh'],
      ['xh', 'Xuất hủy', PackageMinus, 'xanh'], ['xd', 'Xuất dùng nội bộ', Package, 'xanh']]],
    ['Đối tác', [['kh', 'Khách hàng', Users, 'la']]],
  ] : [
    ['Giao dịch', [['ban', 'Bán hàng', ShoppingBag, 'xanh'], ['ls', 'Hóa đơn', FileText, 'xanh'], ['dat', 'Đặt hàng', ShoppingCart, 'xanh'],
      ['ket_ca', 'Kết ca', Clock, 'xanh']]],
    ['Hàng hoá', [['hh', 'Hàng hoá', Box, 'xanh'], ['kk', 'Kiểm kho', ClipboardCheck, 'la'], ['pn', 'Nhập hàng', Download, 'xanh'], ['ch', 'Chuyển hàng', Truck, 'xanh'],
      ['xh', 'Xuất hủy', PackageMinus, 'xanh'], ...(anChuyen ? [['xd', 'Xuất dùng nội bộ', Package, 'xanh']] : [])]],
    ['Đối tác', [['kh', 'Khách hàng', Users, 'la']]],
  ];
  const bam = (k) => (k === 'ket_ca' ? onHop({ loai: 'ket_ca' }) : k === 'dat' ? onDatHang() : onMo(k));
  // Chạy thật: nhóm "Báo cáo" như KiotViet (Phân tích = báo cáo GĐ · Cuối ngày = báo cáo cuối ngày, nhân viên thấy số của mình).
  const nhomBc = anChuyen ? [['Báo cáo', [...(laGD ? [['ngay', 'Phân tích', ChartArea, 'la']] : []), ['cn', 'Cuối ngày', FileText, 'xanh'],
    ...(soQuy ? [['sq', 'Sổ quỹ', Banknote, 'cam']] : [])]]] : [];
  const nhomHien = [
    ...nhom.map(([ten, ds]) => [ten, [...ds.filter(([k]) => !(anChuyen && (k === 'ch' || k === 'ngay'))),
      ...(traHang && ten === 'Giao dịch' ? [['th', 'Trả hàng', RotateCcw, 'xanh']] : []),
      ...(khuyenMai && ten === 'Hàng hoá' ? [['km', 'Khuyến mại', Gift, 'cam']] : []),
      ...(anChuyen && ten === 'Hàng hoá' ? [['tem', 'In tem mã', ScanBarcode, 'xanh']] : [])]]),
    ...nhomBc,
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
        <Dong3 t="Tiền mặt" k="tien_mat" /><Dong3 t="Chuyển khoản" k="chuyen_khoan" /><Dong3 t="Thẻ" k="the" /><Dong3 t="Ví" k="vi" />
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
      <b>Bán hàng</b>{r('Tiền mặt', p.ban.tien_mat)}{r('Chuyển khoản', p.ban.chuyen_khoan)}{r('Thẻ', p.ban.the)}{r('Ví', p.ban.vi)}{r('Công nợ', p.ghiNo)}
      <b>Thu nợ</b>{r('Tiền mặt', p.thu.tien_mat)}{r('Chuyển khoản', p.thu.chuyen_khoan)}
      {p.donDat && (Number(p.donDat.tien_mat) || Number(p.donDat.chuyen_khoan)) ? <><b>Đơn đặt (cọc + lấy bánh)</b>{r('Tiền mặt', p.donDat.tien_mat)}{r('Chuyển khoản', p.donDat.chuyen_khoan)}</> : null}
      {p.hoanTien ? r('Trả lại khách (huỷ HĐ ca trước)', -p.hoanTien) : null}
      {p.thuKet ? <><b>Thu vào két</b>{(p.phieuThu || []).map((c) => <div key={c.code} className="bl-h"><span>{c.code} {c.ly_do}</span><span>{so(c.so_tien)}</span></div>)}{r('Tổng thu', p.thuKet)}</> : null}
      {p.chiKet ? <><b>Chi từ két</b>{(p.phieuChi || []).map((c) => <div key={c.code} className="bl-h"><span>{c.code} {c.ly_do}</span><span>{so(-c.so_tien)}</span></div>)}{r('Tổng chi', -p.chiKet)}</> : null}
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

// Tổng quan của NHÂN VIÊN (chạy thật) — y màn "Tổng quan" app KiotViet bản nhân viên: [Hôm nay ▾] ·
// "N hoá đơn / X nghìn" · biểu đồ Doanh thu · thêm "Ca của tôi": mỗi ca lưu ngày, giờ vào–ra, số HĐ, tiền bán.
// Chỉ số liệu của CHÍNH MÌNH — database lọc theo tài khoản (pos_tong_quan_cua_toi), không tin trình duyệt.
const KY_TOI = { hom_nay: 'Hôm nay', hom_qua: 'Hôm qua', '7_ngay': '7 ngày qua', thang: 'Tháng này', thang_truoc: 'Tháng trước' };
function khoangToi(k) {
  const d = new Date(); d.setHours(0, 0, 0, 0); const h = d.getTime();
  if (k === 'hom_qua') return [h - NGAY, h];
  if (k === '7_ngay') return [h - 6 * NGAY, h + NGAY];
  if (k === 'thang') return [new Date(d.getFullYear(), d.getMonth(), 1).getTime(), h + NGAY];
  if (k === 'thang_truoc') return [new Date(d.getFullYear(), d.getMonth() - 1, 1).getTime(), new Date(d.getFullYear(), d.getMonth(), 1).getTime()];
  return [h, h + NGAY];
}
// KiotViet: "512 nghìn", "1.25 triệu".
const nghin = (n) => (n >= 1e6 ? [(n / 1e6).toFixed(2).replace(/\.?0+$/, ''), 'triệu'] : n >= 1e3 ? [String(Math.floor(n / 1e3)), 'nghìn'] : [so(n), '']);
function TongQuanCuaToi({ onMo, soTb, dienThoai }) {
  const [ky, setKy] = useState('hom_nay');
  const [d, setD] = useState(null);
  const [loi, setLoi] = useState('');
  const [toBd, setToBd] = useState(false);
  const [lan, setLan] = useState(0);
  useEffect(() => {
    let huy = false; setD(null); setLoi('');
    const [a, b] = khoangToi(ky);
    goi('pos_tong_quan_cua_toi', { p_from: new Date(a).toISOString(), p_to: new Date(b).toISOString() })
      .then((r) => { if (!huy) setD(r); }).catch((e) => { if (!huy) setLoi(chuLoi(e)); });
    return () => { huy = true; };
  }, [ky, lan]);
  const p2 = (n) => String(n).padStart(2, '0');
  const homNay = new Date();
  const nhan = { ...KY_TOI, hom_nay: `Hôm nay, ${p2(homNay.getDate())}/${p2(homNay.getMonth() + 1)}/${homNay.getFullYear()}` };
  const motNgay = ky === 'hom_nay' || ky === 'hom_qua';
  const cot = new Map();
  (d?.hd || []).forEach((h) => { const t = new Date(h.luc); const k = motNgay ? `${t.getHours()}h` : `${p2(t.getDate())}/${p2(t.getMonth() + 1)}`; cot.set(k, (cot.get(k) || 0) + Number(h.tien || 0)); });
  const cots = [...cot.entries()];
  const dinh = Math.max(...cots.map(([, v]) => v), 1);
  const buoc = [1e4, 2e4, 5e4, 1e5, 2e5, 5e5, 1e6, 2e6, 5e6, 1e7, 2e7, 5e7, 1e8].find((b) => dinh / b <= 6) || 1e8;
  const lon = (Math.floor(dinh / buoc) + 1) * buoc;
  const vach = Array.from({ length: Math.round(lon / buoc) + 1 }, (_, i) => i * buoc).reverse();
  const nhanTruc = (n) => (n >= 1e6 ? `${+(n / 1e6).toFixed(1)}Tr` : n >= 1e3 ? `${n / 1e3}K` : '0');
  const ban = Number(d?.ban_tinh || 0) + Number(d?.ck_cho || 0);
  const [bSo, bDv] = nghin(ban);
  // Ca gom theo ngày vào ca (mới nhất trước).
  const theoNgay = new Map();
  (d?.ca || []).forEach((c) => { const k = new Date(c.opened_at).toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' }); theoNgay.set(k, [...(theoNgay.get(k) || []), c]); });
  return (
    <main className={`bhq-ds kvm-tq ${dienThoai ? '' : 'kvm-tq-pc'}`}>
      <div className="kvm-tq2">
        <header className="kvm-tq2-dau">
          <div className="logo"><span>S</span>Sumi Bakery</div>
          <button type="button" aria-label="Tải lại" onClick={() => setLan((x) => x + 1)}><RefreshCw size={24} /></button>
          <button type="button" aria-label="Thông báo" onClick={() => onMo('tb')}><Bell size={26} />{soTb > 0 && <i className="kvm-nav-dem">{soTb > 99 ? '99+' : soTb}</i>}</button>
        </header>
        <label className="kvm-ky xam kvm-tq2-ky"><select value={ky} onChange={(e) => setKy(e.target.value)} aria-label="Thời gian">{Object.entries(nhan).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select><ChevronDown size={16} /></label>
        {loi && <p className="kv-loi" role="alert">{loi}</p>}
        <div className="kvm-tq2-the">
          <div className="hai">
            <div><small>{d ? d.so_hd : '…'} hoá đơn</small><p className="so-lon"><b>{d ? bSo : '…'}</b> {d ? bDv : ''}</p></div>
            <div><small>Ca làm</small><p className="so-lon"><b className="cam">{d ? d.ca.length : '…'}</b></p></div>
          </div>
          {d && Number(d.ck_cho) > 0 && <div className="tra">Chuyển khoản chờ xác nhận tiền về <b>{so(d.ck_cho)}</b></div>}
          {d && Number(d.no_chua_tra) > 0 && <div className="tra">Khách còn nợ (chưa tính) <b>{so(d.no_chua_tra)}</b></div>}
          {d && Number(d.bi_loai) > 0 && <div className="tra">Quản lý loại khỏi doanh số <b>{so(d.bi_loai)}</b></div>}
          {d && Number(d.so_don_dat) > 0 && <div className="tra">Bánh đặt tại quầy · {d.so_don_dat} đơn <b>{so(d.dat_quay)}</b></div>}
        </div>
        <section className="kvm-tq2-bd">
          <div className="tieu-de"><h2>Doanh thu</h2></div>
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
                  {cots.map(([k, v]) => <div key={k} className="cot" title={`${k}: ${so(v)}`}><i style={{ height: `${Math.max((v / lon) * 100, 1)}%` }} /><small>{k}</small></div>)}
                </div>
              </div>
            </div>
          ) : <p className="mo">{d ? `Chưa bán hoá đơn nào trong ${nhan[ky].toLowerCase()}.` : 'Đang tải…'}</p>}
        </section>
        <section className="kvm-tq2-bd">
          <h2>Ca của tôi</h2>
          {[...theoNgay.entries()].map(([ngay, cas]) => (
            <div key={ngay} className="kvm-ca-ngay">
              <div className="dau"><span>{ngay}</span><b>{so(cas.reduce((s2, c) => s2 + Number(c.ban_tinh) + Number(c.ck_cho), 0))}</b></div>
              {cas.map((c) => (
                <div key={c.id} className="kvm-ca-toi">
                  <div><b>{c.code}</b><small>{c.store} · {gio(c.opened_at)} – {c.closed_at ? gio(c.closed_at) : <em>đang mở</em>}</small></div>
                  <div className="ph"><b>{so(Number(c.ban_tinh) + Number(c.ck_cho))}</b><small>{c.so_hd} hoá đơn</small></div>
                </div>
              ))}
            </div>
          ))}
          {d && !d.ca.length && <p className="mo">Chưa có ca nào trong {nhan[ky].toLowerCase()}.</p>}
        </section>
      </div>
    </main>
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
          <Dong t="Ví" v={so(bc.vi)} />
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
