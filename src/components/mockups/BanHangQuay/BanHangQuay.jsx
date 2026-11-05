import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../../lib/supabaseClient';
import {
  CHI_NHANH, DANH_MUC, THU_KHAC_GOI_Y, LOAI_PHIEU, LY_DO_HUY, LY_DO_HUY_HD, LOAI_NOI_BO,
  vnd, taoMatHang, tonGia, tienDong, tinhHoaDon, tinhThanhToan, tinhKetCa, tinhTraHang, apPhieuKho, tinhCongNo, baoCaoNgay,
} from './banHangQuayLogic';
import './ban-hang-quay.css';

// BẢN XEM TRƯỚC "Bán tại quầy" — thiết kế giai đoạn 1 (.scratch/ban-hang-quay/03-thiet-ke-giai-doan-1.md).
// 05/11/2026: làm lại màn bán theo đúng bố cục màn bán KiotViet tiệm đang dùng
// (thanh trên: tìm hàng F3 + tab hoá đơn; trái: giỏ; phải: khách F4 + lưới hàng
// + IN/THANH TOÁN; dưới: Bán nhanh/Bán thường; ☰ menu quản lý). Không bắt mở ca.
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
const MOI_TRANG = 15; // KiotViet: 15 món / trang ở chế độ Bán thường
const MAU_ANH = ['#F2C6A0', '#E9B7C2', '#BFD8C0', '#C9D3EC', '#F3D9A4', '#D9C2E8'];
const TIEU_DE = { kho: 'Kho thành phẩm', ls: 'Hoá đơn', no: 'Công nợ khách', ngay: 'Báo cáo cuối ngày' };
const gio = (t) => new Date(t).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
const ngayGio = (t) => new Date(t).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });
const cungNgay = (a, b) => new Date(a).toDateString() === new Date(b).toDateString();
const soTien = (v) => String(v).replace(/\D/g, '');
const hdMoi = (so, nguoiBan) => ({
  id: `${Date.now()}-${so}`, so, dong: [], giam: 0, giamKieu: 'vnd', khach: KHACH_LE, thuKhac: [], vat: false,
  ghiChu: '', nguoiBan, pt: 'tien_mat', dua: null, // dua = null: "khách thanh toán" tự bằng "khách cần trả" như KiotViet
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
  // Ca tự bắt đầu theo tài khoản đăng nhập — không bắt bấm "Mở ca" (KiotViet cũng không có bước này).
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
  const [ttMo, setTtMo] = useState(false); // máy tính: khung thanh toán · điện thoại: tấm giỏ hàng
  const [dm, setDm] = useState('all');
  const [locMo, setLocMo] = useState(false);
  const [trang, setTrang] = useState(0);
  const [bao, setBao] = useState(null); // { msg, hoaDon? }
  const [banIn, setBanIn] = useState(null); // nội dung đang gửi ra máy in (#bhq-in)
  const timRef = useRef(null);
  const khachRef = useRef(null);
  const duaRef = useRef(null);
  const baoHen = useRef(null);
  const demHd = useRef(1);
  const ton = tonCN[chiNhanh] || {};

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
        : [...h.dong, { ma: m.ma, ten: m.ten, size: m.size, gia: m.gia, giaVon: m.giaVon, sl: 1, giam: 0, giamKieu: 'vnd', ghiChu: '' }];
      return { ...h, dong };
    });
    if ((ton[m.ma] ?? 0) - (slTrongGio[m.ma] || 0) <= 0) nhan(`⚠️ ${m.ten} trên máy đã hết — vẫn bán được, cuối ngày nhớ kiểm kho`);
  };
  const datSl = (ma, sl) => suaHd((h) => ({ ...h, dong: h.dong.map((d) => (d.ma === ma ? { ...d, sl: Math.max(sl, 0) } : d)) }));
  const chotSl = (ma) => suaHd((h) => ({ ...h, dong: h.dong.map((d) => (d.ma === ma && d.sl < 1 ? { ...d, sl: 1 } : d)) }));
  const boDong = (ma) => suaHd((h) => ({ ...h, dong: h.dong.filter((d) => d.ma !== ma) }));
  const themHd = () => { demHd.current += 1; const h = hdMoi(demHd.current, nguoi); setHds((ds) => [...ds, h]); setHdId(h.id); setTtMo(false); };
  const dongHd = (id) => setHds((ds) => {
    const con = ds.filter((h) => h.id !== id);
    if (!con.length) demHd.current = 1;
    const kq = con.length ? con : [hdMoi(1, nguoi)];
    if (id === hd.id) setHdId(kq[kq.length - 1].id);
    return kq;
  });
  const doiCheDo = (c) => { setCheDo(c); ghiLuu('bhq-che-do', c); setTtMo(false); };
  const doiInTuDong = () => setInTuDong((v) => { ghiLuu('bhq-in-tu-dong', v ? '0' : '1'); nhan(`In tự động: ${v ? 'TẮT' : 'BẬT'}`); return !v; });

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
    if (inTuDong) setBanIn({ ...banGhi });
    nhan(`✅ Đã thanh toán ${ma} · ${vnd(tong.canTra)}${tt.thua ? ` · trả lại khách ${vnd(tt.thua)}` : ''}${tt.no ? ` · ghi nợ ${vnd(tt.no)}` : ''}`, banGhi);
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
  const huyHoaDon = (ma, lyDo) => {
    const h = daBan.find((x) => x.ma === ma);
    if (!h || h.daHuy || !huyDuoc(h)) return;
    setDaBan((ds) => ds.map((x) => (x.ma === ma ? { ...x, daHuy: true, lyDoHuy: lyDo, nguoiHuy: nguoi, lucHuy: Date.now() } : x)));
    const conLai = h.dong.map((d) => ({ ma: d.ma, sl: d.sl - (daTraCua(ma)[d.ma] || 0) })).filter((d) => d.sl > 0);
    if (conLai.length) ghiKho(h.chiNhanh, conLai, ma, 'Huỷ hoá đơn');
    nhan(`Đã huỷ ${ma} — đã cộng lại tồn kho${h.no ? ', xoá phần nợ' : ''}`);
  };

  const daTraCua = (maHd) => {
    const kq = {};
    for (const t of traHangs) if (t.hdGoc === maHd) for (const d of t.dong) kq[d.ma] = (kq[d.ma] || 0) + d.sl;
    return kq;
  };
  const luuTraHang = (hdGoc, ketQua, phuongThuc, lyDo) => {
    const ma = `TH${String(traHangs.length + 1).padStart(6, '0')}`;
    setTraHangs((x) => [{ ma, luc: Date.now(), chiNhanh: hdGoc.chiNhanh, hdGoc: hdGoc.ma, khach: hdGoc.khach, nguoi, phuongThuc, lyDo, ...ketQua }, ...x]);
    ghiKho(hdGoc.chiNhanh, ketQua.dong.map((d) => ({ ma: d.ma, sl: d.sl })), ma, 'Trả hàng');
    nhan(`Đã trả hàng ${ma} · trả lại khách ${vnd(ketQua.tienTra)} (${PT[phuongThuc].toLowerCase()})`);
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
    nhan(`Đã thu nợ ${vnd(tien)}`);
  };

  const trongCa = (x) => x.luc >= ca.moLuc && x.chiNhanh === chiNhanh;
  const congNo = useMemo(() => tinhCongNo(daBan, thuNos), [daBan, thuNos]);
  const khachNo = hd.khach.id ? (congNo.find((k) => k.khach.id === hd.khach.id)?.tong || 0) : 0;
  const nguoiBanDs = [...new Set([hd.nguoiBan || nguoi, nguoi, 'Nhân viên quầy 2 (mẫu)'])];
  const moManHinh = (m) => { setManHinh(m); setMenuMo(false); setTtMo(false); };
  const moHop = (h) => { setHop(h); setMenuMo(false); };

  const oKhach = (
    <KhachO khach={hd.khach} ds={khachDs} khachNo={khachNo} inputRef={khachRef}
      onChon={(k) => sua({ khach: k, dua: null })} onThem={() => setHop({ loai: 'them_khach' })} />
  );
  const khungTT = (onDong) => (
    <KhungThanhToan hd={hd} tong={tong} nguoiBanDs={nguoiBanDs} khachNo={khachNo} duaRef={duaRef} onSua={sua}
      onGiam={() => setHop({ loai: 'giam_hd' })} onThuKhac={() => setHop({ loai: 'thu_khac' })}
      onIn={inTamTinh} onXong={hoanTat} onDong={onDong} />
  );
  const gio1 = (
    <GioHang hd={hd} onSl={datSl} onChotSl={chotSl} onBo={boDong}
      onGiam={(ma) => setHop({ loai: 'giam_dong', ma })} onGhiChu={(ma) => setHop({ loai: 'ghi_chu_dong', ma })} />
  );
  const tabsHd = (
    <div className="bhq-hd-tabs">
      {hds.map((h) => (
        <span key={h.id} className={`bhq-hd-tab ${h.id === hd.id ? 'on' : ''}`}>
          <button type="button" onClick={() => { setHdId(h.id); setTtMo(false); }}>
            ⇄ Hoá đơn {h.so}{h.dong.length ? <i>{h.dong.reduce((s, d) => s + d.sl, 0)}</i> : null}
          </button>
          <button type="button" className="x" aria-label={`Đóng hoá đơn ${h.so}`}
            onClick={() => (h.dong.length ? setHop({ loai: 'dong_hd', id: h.id, so: h.so }) : dongHd(h.id))}>✕</button>
        </span>
      ))}
      <button type="button" className="bhq-hd-them" aria-label="Thêm hoá đơn (F1)" onClick={themHd}>⊕</button>
    </div>
  );
  const chonCN = (
    <select className="bhq-cn" value={chiNhanh} onChange={(e) => { setChiNhanh(e.target.value); setTrang(0); }} aria-label="Chi nhánh">
      {CHI_NHANH.map((c) => <option key={c}>{c}</option>)}
    </select>
  );
  const nutMenu = <button type="button" className="bhq-ic-tr" aria-label="Menu" onClick={() => setMenuMo((v) => !v)}>☰</button>;
  const chips = (
    <div className="bhq-chips">
      <button type="button" className={dm === 'all' ? 'on' : ''} onClick={() => { setDm('all'); setTrang(0); }}>Tất cả</button>
      {dmCo.map((d) => <button key={d.value} type="button" className={dm === d.value ? 'on' : ''} onClick={() => { setDm(d.value); setTrang(0); }}>{d.label}</button>)}
    </div>
  );
  const timHang = <TimHang matHang={matHang} ton={ton} inputRef={timRef} onChon={themMon} onKhongThay={() => nhan('Không thấy mã hàng này')} />;

  return (
    <div className={`bhq ${dienThoai ? 'dt' : ''}`}>
      {manHinh !== 'ban' && (
        <header className="bhq-thanh con">
          <button type="button" className="bhq-ve" onClick={() => setManHinh('ban')}>‹ Bán hàng</button>
          <b className="bhq-thanh-ten">{TIEU_DE[manHinh]}</b>
          <div className="bhq-thanh-phai">{chonCN}{nutMenu}</div>
        </header>
      )}

      {manHinh === 'ban' && !dienThoai && (
        <>
          <header className="bhq-thanh">
            {timHang}
            {tabsHd}
            <div className="bhq-thanh-phai">
              <button type="button" className="bhq-ic-tr" aria-label="Chọn hoá đơn trả hàng" title="Trả hàng" onClick={() => setHop({ loai: 'chon_hd_tra' })}>↩</button>
              <button type="button" className="bhq-ic-tr" aria-label="In tạm tính" title="In tạm tính" onClick={inTamTinh}>🖨</button>
              {chonCN}
              <span className="bhq-ten-tk">{nguoi}</span>
              {nutMenu}
            </div>
          </header>

          <main className={`bhq-ban ${cheDo}`}>
            <section className="bhq-trai">
              {gio1}
              <div className="bhq-trai-chan">
                <label className="bhq-ghi-chu">✎<input value={hd.ghiChu} onChange={(e) => sua({ ghiChu: e.target.value })} placeholder="Ghi chú đơn hàng" /></label>
                <span>Tổng tiền hàng <i>{tong.soMon}</i></span>
                <b>{vnd(tong.tongHang)}</b>
              </div>
            </section>

            <section className="bhq-phai">
              {cheDo === 'nhanh' ? (
                <>
                  <div className="bhq-phai-dau">{oKhach}</div>
                  {khungTT(null)}
                </>
              ) : (
                <>
                  <div className="bhq-phai-dau">
                    {oKhach}
                    <button type="button" className={`bhq-ic ${locMo ? 'on' : ''}`} aria-label="Lọc nhóm hàng" title="Lọc nhóm hàng" onClick={() => setLocMo((v) => !v)}>⏷</button>
                  </div>
                  {locMo && chips}
                  <div className="bhq-luoi">
                    {monLoc.slice(trangHien * MOI_TRANG, (trangHien + 1) * MOI_TRANG).map((m) => (
                      <button key={m.ma} type="button" className="bhq-o-mon" onClick={() => themMon(m)}>
                        <AnhNho m={m} />
                        <span className="t">{m.ten}{m.size ? ` · ${m.size}` : ''}<small className={(ton[m.ma] ?? 0) <= 0 ? 'het' : ''}>Tồn {ton[m.ma] ?? 0}</small></span>
                        <b className="g">{vnd(m.gia)}</b>
                        {slTrongGio[m.ma] ? <i className="dem">{slTrongGio[m.ma]}</i> : null}
                      </button>
                    ))}
                    {!monLoc.length && <p className="bhq-rong">Đang tải danh sách bánh…</p>}
                  </div>
                  <div className="bhq-phai-chan">
                    <span className="bhq-trang">
                      <button type="button" aria-label="Trang trước" disabled={trangHien === 0} onClick={() => setTrang(trangHien - 1)}>‹</button>
                      {trangHien + 1}/{soTrang}
                      <button type="button" aria-label="Trang sau" disabled={trangHien >= soTrang - 1} onClick={() => setTrang(trangHien + 1)}>›</button>
                    </span>
                    <button type="button" className="bhq-nut-in" disabled={!hd.dong.length} onClick={inTamTinh}>IN</button>
                    <button type="button" className="bhq-nut-tt" disabled={!hd.dong.length} onClick={() => setTtMo(true)}>THANH TOÁN</button>
                  </div>
                  {ttMo && <div className="bhq-tt-phu">{khungTT(() => setTtMo(false))}</div>}
                </>
              )}
            </section>
          </main>

          <footer className="bhq-chan">
            <div className="bhq-che">
              <button type="button" className={cheDo === 'nhanh' ? 'on' : ''} onClick={() => doiCheDo('nhanh')}>⚡ Bán nhanh</button>
              <button type="button" className={cheDo === 'thuong' ? 'on' : ''} onClick={() => doiCheDo('thuong')}>🕘 Bán thường</button>
            </div>
            <span className="bhq-nguon">Bản xem trước · không lưu · {nguonDl}</span>
            <button type="button" className="bhq-chan-nut" onClick={doiInTuDong}>🖨 In tự động: <b>{inTuDong ? 'Bật' : 'Tắt'}</b> (F2)</button>
            <button type="button" className="bhq-chan-nut" onClick={() => setHop({ loai: 'ket_ca' })}>● Ca {nguoi} · từ {gio(ca.moLuc)} · <b>Kết ca</b></button>
          </footer>
        </>
      )}

      {manHinh === 'ban' && dienThoai && (
        <>
          <header className="bhq-thanh">{tabsHd}{nutMenu}</header>
          <div className="bhq-dt-tim">{timHang}</div>
          {chips}
          <main className="bhq-dt-ds">
            {monLoc.map((m) => (
              <button key={m.ma} type="button" className="bhq-dt-mon" onClick={() => themMon(m)}>
                <AnhNho m={m} />
                <span className="t"><b>{m.ten}{m.size ? ` · ${m.size}` : ''}</b><small className={(ton[m.ma] ?? 0) <= 0 ? 'het' : ''}>{m.ma} · Tồn {ton[m.ma] ?? 0}</small></span>
                <b className="g">{vnd(m.gia)}</b>
                {slTrongGio[m.ma] ? <i className="dem">{slTrongGio[m.ma]}</i> : <span className="cong" aria-hidden="true">+</span>}
              </button>
            ))}
            {!monLoc.length && <p className="bhq-rong">Đang tải danh sách bánh…</p>}
          </main>
          {hd.dong.length > 0 && !ttMo && (
            <div className="bhq-dt-chan">
              <button type="button" className="bhq-dt-gio" onClick={() => setTtMo(true)}>🛒 <b>{tong.soMon}</b> món · <b>{vnd(tong.canTra)}</b></button>
              <button type="button" className="bhq-nut-tt" onClick={() => setTtMo(true)}>THANH TOÁN</button>
            </div>
          )}
          {ttMo && (
            <div className="bhq-dt-tam">
              <div className="bhq-dt-tam-dau">
                <button type="button" onClick={() => setTtMo(false)}>‹ Chọn thêm bánh</button>
                <b>Hoá đơn {hd.so}</b>
              </div>
              <div className="bhq-dt-tam-than">
                {oKhach}
                {gio1}
                <label className="bhq-ghi-chu">✎<input value={hd.ghiChu} onChange={(e) => sua({ ghiChu: e.target.value })} placeholder="Ghi chú đơn hàng" /></label>
                {khungTT(null)}
              </div>
            </div>
          )}
        </>
      )}

      {menuMo && (
        <div className="bhq-menu-nen" onClick={() => setMenuMo(false)}>
          <div className="bhq-menu" onClick={(e) => e.stopPropagation()} role="menu">
            <div className="bhq-menu-ai">👤 <b>{nguoi}</b><small>{chiNhanh} · ca từ {gio(ca.moLuc)}</small></div>
            {dienThoai && <div className="bhq-menu-cn">{chonCN}</div>}
            <div className="bhq-menu-hai">
              <button type="button" onClick={() => moManHinh('kho')}>📦<span>Quản lý kho</span></button>
              <button type="button" onClick={() => moManHinh('ngay')}>📊<span>Báo cáo cuối ngày</span></button>
            </div>
            <button type="button" onClick={() => moManHinh('ban')}>🛒 Màn bán hàng</button>
            <button type="button" onClick={() => moManHinh('ls')}>🧾 Danh sách hoá đơn</button>
            <button type="button" onClick={() => moHop({ loai: 'chon_hd_tra' })}>↩ Chọn hoá đơn trả hàng</button>
            <button type="button" onClick={() => moManHinh('no')}>💳 Lập phiếu thu (thu nợ khách){congNo.length ? <i>{congNo.length}</i> : null}</button>
            <button type="button" onClick={() => moHop({ loai: 'ket_ca' })}>● Kết ca</button>
            <button type="button" onClick={doiInTuDong}>🖨 In tự động: {inTuDong ? 'Bật' : 'Tắt'}</button>
            {!dienThoai && <button type="button" onClick={() => moHop({ loai: 'phim_tat' })}>⌨ Phím tắt</button>}
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
          <h2>Hoá đơn · {chiNhanh}</h2>
          {daBan.filter((h) => h.chiNhanh === chiNhanh).map((h) => {
            const tra = traHangs.filter((t) => t.hdGoc === h.ma);
            return (
              <div key={h.ma} className={`bhq-the ${h.daHuy ? 'huy' : ''}`}>
                <div><b>{h.ma}</b> · {ngayGio(h.luc)} · {h.khach.name} · {PT[h.phuongThuc]} · người bán: {h.nguoiBan || h.thuNgan}</div>
                {h.dong.length > 0 && <div>{h.dong.map((d) => `${d.sl}× ${d.ten}${d.size ? ` ${d.size}` : ''}`).join(', ')}</div>}
                {h.ghiChu && <div className="bhq-ghi">✎ {h.ghiChu}</div>}
                <div className="hang">
                  <b>{vnd(h.canTra)}</b>{h.vat > 0 && <span className="chip">VAT {vnd(h.vat)}</span>}{h.no > 0 && <span className="no">Nợ {vnd(h.no)}</span>}
                  {h.daHuy ? <span className="chip huy">Đã huỷ</span> : !h.mau && (
                    <>
                      <button type="button" className="bhq-nut phu" onClick={() => setHop({ loai: 'bien_lai', hoaDon: h })}>Xem · In lại</button>
                      <button type="button" className="bhq-nut phu" onClick={() => setHop({ loai: 'tra_hang', hoaDon: h })}>Trả hàng</button>
                      {huyDuoc(h)
                        ? <button type="button" className="bhq-nut nguy" onClick={() => setHop({ loai: 'huy_hd', hoaDon: h })}>Huỷ hoá đơn</button>
                        : <span className="bhq-ghi">Đã kết ca — chỉ Quản lý / Giám đốc huỷ được</span>}
                    </>
                  )}
                </div>
                {tra.map((t) => <div key={t.ma} className="bhq-ghi">↩ {t.ma} · {ngayGio(t.luc)} · trả {t.dong.map((d) => `${d.sl}× ${d.ten}`).join(', ')} · hoàn {vnd(t.tienTra)}{t.lyDo ? ` · ${t.lyDo}` : ''}</div>)}
                {h.daHuy && h.lyDoHuy && <div className="bhq-ghi">Huỷ lúc {gio(h.lucHuy)} · {h.nguoiHuy} · lý do: {h.lyDoHuy}</div>}
              </div>
            );
          })}
          {!daBan.some((h) => h.chiNhanh === chiNhanh) && <p className="bhq-rong">Chưa có hoá đơn ở chi nhánh này.</p>}
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
          onLuu={(k) => { setKhachDs((ds) => [k, ...ds]); sua({ khach: k, dua: null }); setHop(null); nhan(`Đã thêm khách ${k.name}`); }} />
      )}
      {hop?.loai === 'giam_hd' && (
        <NhapGiam tieuDe="Giảm giá hoá đơn" giam={hd.giam} kieu={hd.giamKieu} onDong={() => setHop(null)}
          onLuu={(giam, kieu) => { sua({ giam, giamKieu: kieu, dua: null }); setHop(null); }} />
      )}
      {hop?.loai === 'giam_dong' && (() => {
        const d = hd.dong.find((x) => x.ma === hop.ma);
        return d ? (
          <NhapGiam tieuDe={`Giảm giá · ${d.ten}`} giam={d.giam} kieu={d.giamKieu} onDong={() => setHop(null)}
            onLuu={(giam, kieu) => { suaHd((h) => ({ ...h, dua: null, dong: h.dong.map((x) => (x.ma === d.ma ? { ...x, giam, giamKieu: kieu } : x)) })); setHop(null); }} />
        ) : null;
      })()}
      {hop?.loai === 'ghi_chu_dong' && (() => {
        const d = hd.dong.find((x) => x.ma === hop.ma);
        return d ? (
          <GhiChuDong d={d} onDong={() => setHop(null)}
            onLuu={(ghiChu) => { suaHd((h) => ({ ...h, dong: h.dong.map((x) => (x.ma === d.ma ? { ...x, ghiChu } : x)) })); setHop(null); }} />
        ) : null;
      })()}
      {hop?.loai === 'thu_khac' && <ThuKhac ds={hd.thuKhac} onDong={() => setHop(null)} onLuu={(ds) => { sua({ thuKhac: ds, dua: null }); setHop(null); }} />}
      {hop?.loai === 'dong_hd' && (
        <Hop tieuDe={`Đóng Hoá đơn ${hop.so}?`} onDong={() => setHop(null)}
          chan={<><button type="button" className="bhq-nut phu" onClick={() => setHop(null)}>Không</button><button type="button" className="bhq-nut nguy" onClick={() => { dongHd(hop.id); setHop(null); }}>Đóng, bỏ hàng đã chọn</button></>}>
          <p className="bhq-ghi">Hoá đơn này đang có hàng chưa thanh toán. Đóng lại thì mất các món đã chọn.</p>
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
        <Hop tieuDe="Phím tắt (giống KiotViet)" onDong={() => setHop(null)}>
          <div className="bhq-bang">
            {[['F1', 'Thêm hoá đơn mới'], ['F2', 'Bật/tắt in tự động'], ['F3', 'Tìm hàng hoá / quét mã'], ['F4', 'Tìm khách hàng'], ['F8', 'Nhập tiền khách thanh toán'], ['F9', 'Thanh toán'], ['↑ ↓ Enter', 'Chọn món trong ô tìm'], ['Esc', 'Đóng khung / menu']].map(([k, t]) => (
              <div key={k}><span>{t}</span><b className="bhq-phim">{k}</b></div>
            ))}
          </div>
        </Hop>
      )}

      {bao && (
        <div className="bhq-bao" role="status">
          <span>{bao.msg}</span>
          {bao.hoaDon && <button type="button" onClick={() => setBanIn({ ...bao.hoaDon })}>In lại</button>}
        </div>
      )}
      {banIn && createPortal(<div id="bhq-in"><NoiDungBienLai hd={banIn} /></div>, document.body)}
    </div>
  );
}

function AnhNho({ m }) {
  return (
    <span className="bhq-anh-nho" style={{ background: mauCua(m.danhMuc) }} aria-hidden="true">
      {m.anh ? <img src={m.anh} alt="" loading="lazy" /> : (m.ten.trim()[0] || '?').toUpperCase()}
    </span>
  );
}

// Ô tìm hàng (F3): gõ tên/mã → danh sách thả xuống, ↑↓ chọn, Enter thêm. Máy quét
// mã vạch gõ mã + Enter → thêm thẳng vào giỏ.
function TimHang({ matHang, ton, inputRef, onChon, onKhongThay }) {
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
      if (m) lay(m); else if (t) onKhongThay();
    } else if (e.key === 'Escape') setQ('');
  };
  return (
    <div className="bhq-tim-hang">
      <span className="ic" aria-hidden="true">🔍</span>
      <input ref={inputRef} value={q} onChange={(e) => { setQ(e.target.value); setChon(0); setMo(true); }} onKeyDown={onKey}
        onFocus={() => setMo(true)} onBlur={() => setTimeout(() => setMo(false), 150)}
        placeholder="Tìm hàng hoá (F3) hoặc quét mã vạch" autoComplete="off" aria-label="Tìm hàng hoá" />
      {mo && loc.length > 0 && (
        <div className="bhq-xo">
          {loc.map((m, i) => (
            <button key={m.ma} type="button" className={i === chon ? 'on' : ''} onMouseDown={(e) => e.preventDefault()} onClick={() => lay(m)}>
              <AnhNho m={m} />
              <span className="t"><b>{m.ten}{m.size ? ` · ${m.size}` : ''}</b><small>{m.ma} · Tồn {ton[m.ma] ?? 0}</small></span>
              <b className="g">{vnd(m.gia)}</b>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Ô khách hàng (F4): tìm theo tên/SĐT, ＋ thêm nhanh; đã chọn thì hiện tên + nợ cũ.
function KhachO({ khach, ds, khachNo, inputRef, onChon, onThem }) {
  const [q, setQ] = useState('');
  const [mo, setMo] = useState(false);
  if (khach.id) {
    return (
      <div className="bhq-khach-chon">
        <span>👤 <b>{khach.name}</b> {khach.phone}</span>
        {khachNo > 0 && <span className="no">Nợ {vnd(khachNo)}</span>}
        <button type="button" aria-label="Bỏ chọn khách" onClick={() => onChon(KHACH_LE)}>✕</button>
      </div>
    );
  }
  const t = q.trim().toLowerCase();
  const loc = t ? ds.filter((k) => `${k.name} ${k.phone || ''}`.toLowerCase().includes(t)).slice(0, 8) : [];
  const lay = (k) => { onChon(k); setQ(''); };
  return (
    <div className="bhq-khach-o">
      <span className="ic" aria-hidden="true">🔍</span>
      <input ref={inputRef} value={q} onChange={(e) => { setQ(e.target.value); setMo(true); }} onFocus={() => setMo(true)}
        onBlur={() => setTimeout(() => setMo(false), 150)} onKeyDown={(e) => { if (e.key === 'Enter' && loc[0]) lay(loc[0]); }}
        placeholder="Tìm khách hàng (F4)" autoComplete="off" aria-label="Tìm khách hàng" />
      <button type="button" className="them" aria-label="Thêm khách hàng mới" onClick={onThem}>＋</button>
      {mo && loc.length > 0 && (
        <div className="bhq-xo">
          {loc.map((k) => (
            <button key={k.id} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => lay(k)}>
              <span className="t"><b>{k.name}</b><small>{k.phone}</small></span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function GioHang({ hd, onSl, onChotSl, onBo, onGiam, onGhiChu }) {
  if (!hd.dong.length) {
    return (
      <div className="bhq-gio-rong">
        <div aria-hidden="true">🛒</div>
        <b>Chưa có hàng trong hoá đơn</b>
        <span>Chạm vào bánh hoặc quét mã vạch để thêm</span>
      </div>
    );
  }
  return (
    <div className="bhq-gio">
      {hd.dong.map((d, i) => (
        <div key={d.ma} className="bhq-gio-dong">
          <span className="stt">{i + 1}</span>
          <button type="button" className="xoa" aria-label={`Xoá ${d.ten}`} onClick={() => onBo(d.ma)}>🗑</button>
          <span className="ma">{d.ma}</span>
          <span className="ten">
            <b>{d.ten}{d.size ? ` · ${d.size}` : ''}</b>
            <button type="button" className="bhq-link" onClick={() => onGhiChu(d.ma)}>{d.ghiChu ? `✎ ${d.ghiChu}` : 'Ghi chú'}</button>
          </span>
          <span className="sl">
            <button type="button" aria-label="Bớt 1" disabled={d.sl <= 1} onClick={() => onSl(d.ma, d.sl - 1)}>−</button>
            <input inputMode="numeric" value={d.sl || ''} aria-label={`Số lượng ${d.ten}`}
              onChange={(e) => onSl(d.ma, Number(soTien(e.target.value)) || 0)} onBlur={() => onChotSl(d.ma)} onFocus={(e) => e.target.select()} />
            <button type="button" aria-label="Thêm 1" onClick={() => onSl(d.ma, d.sl + 1)}>+</button>
          </span>
          <button type="button" className="gia" onClick={() => onGiam(d.ma)} title="Bấm để giảm giá dòng này">
            {vnd(d.gia)}{Number(d.giam) ? <small>−{d.giamKieu === '%' ? `${d.giam}%` : vnd(d.giam)}</small> : null}
          </button>
          <b className="tien">{vnd(tienDong(d))}</b>
        </div>
      ))}
    </div>
  );
}

// Khung thanh toán như KiotViet: người bán · tổng · giảm · thu khác · VAT · cần trả ·
// khách thanh toán (mặc định = cần trả) · phương thức · tiền thừa · IN / THANH TOÁN.
function KhungThanhToan({ hd, tong, nguoiBanDs, khachNo, duaRef, onSua, onGiam, onThuKhac, onIn, onXong, onDong }) {
  const dua = hd.dua == null ? tong.canTra : hd.dua;
  const tt = tinhThanhToan({ canTra: tong.canTra, khachDua: dua, phuongThuc: hd.pt, laKhachLe: !hd.khach.id });
  const c = tong.canTra;
  const goiY = [...new Set([c, Math.ceil(c / 10000) * 10000, Math.ceil(c / 50000) * 50000, Math.ceil(c / 100000) * 100000, Math.ceil(c / 200000) * 200000, Math.ceil(c / 500000) * 500000])]
    .filter((v) => v >= c && v > 0).slice(0, 6);
  return (
    <div className="bhq-tt">
      {onDong && <div className="bhq-tt-dau"><b>Thanh toán · Hoá đơn {hd.so}</b><button type="button" aria-label="Đóng khung thanh toán" onClick={onDong}>✕</button></div>}
      <div className="bhq-tt-than">
        <div className="bhq-tt-nv">
          <select value={hd.nguoiBan} onChange={(e) => onSua({ nguoiBan: e.target.value })} aria-label="Người bán">
            {nguoiBanDs.map((n) => <option key={n}>{n}</option>)}
          </select>
          <span>{ngayGio(Date.now())}</span>
        </div>
        <div className="r"><span>Tổng tiền hàng <i>{tong.soMon}</i></span><b>{vnd(tong.tongHang)}</b></div>
        <div className="r"><button type="button" className="bhq-link" onClick={onGiam}>Giảm giá{hd.giam ? ` (${hd.giamKieu === '%' ? `${hd.giam}%` : vnd(hd.giam)})` : ''}</button><b>{tong.giamHd ? `−${vnd(tong.giamHd)}` : '0'}</b></div>
        <div className="r"><button type="button" className="bhq-link" onClick={onThuKhac}>Thu khác{hd.thuKhac.length ? ` (${hd.thuKhac.map((t) => t.ten).join(', ')})` : ''}</button><b>{vnd(tong.thuKhac)}</b></div>
        <div className="r"><label className="bhq-vat"><input type="checkbox" checked={!!hd.vat} onChange={(e) => onSua({ vat: e.target.checked, dua: null })} /> Xuất VAT 8%</label><b>{vnd(tong.vat)}</b></div>
        <div className="r lon"><span>Khách cần trả</span><b className="nhan">{vnd(tong.canTra)}</b></div>
        <div className="r"><span>Khách thanh toán <small>(F8)</small></span>
          <input ref={duaRef} className="bhq-tt-dua" inputMode="numeric" value={Number(dua).toLocaleString('vi-VN')} aria-label="Khách thanh toán"
            onChange={(e) => onSua({ dua: Number(soTien(e.target.value)) || 0 })} onFocus={(e) => e.target.select()} />
        </div>
        <div className="bhq-pt" role="radiogroup" aria-label="Phương thức thanh toán">
          {Object.entries(PT).map(([k, l]) => (
            <label key={k} className={hd.pt === k ? 'on' : ''}>
              <input type="radio" name={`pt-${hd.id}`} checked={hd.pt === k} onChange={() => onSua({ pt: k, dua: null })} /> {l}
            </label>
          ))}
        </div>
        {hd.pt === 'tien_mat' && goiY.length > 1 && (
          <div className="bhq-menh-gia">{goiY.map((v) => <button key={v} type="button" className={Number(dua) === v ? 'on' : ''} onClick={() => onSua({ dua: v })}>{v.toLocaleString('vi-VN')}</button>)}</div>
        )}
        {hd.pt === 'chuyen_khoan' && <div className="bhq-qr">▦ Mã VietQR {vnd(tong.canTra)}<small>Bản thật: QR theo tài khoản chi nhánh, có sẵn số tiền + mã hoá đơn để đối chiếu sao kê.</small></div>}
        {tt.thua > 0 && <div className="r lon"><span>Tiền thừa trả khách</span><b>{vnd(tt.thua)}</b></div>}
        {tt.no > 0 && <div className="r no"><span>Tính vào công nợ</span><b>{vnd(tt.no)}</b></div>}
        {khachNo > 0 && <div className="r nho"><span>Khách đang nợ cũ</span><b>{vnd(khachNo)}</b></div>}
        {tt.loi && <p className="bhq-loi">{tt.loi}</p>}
      </div>
      <div className="bhq-tt-chan">
        <button type="button" className="bhq-nut-in" disabled={!hd.dong.length} onClick={onIn}>IN</button>
        <button type="button" className="bhq-nut-tt" disabled={!hd.dong.length || !!tt.loi} onClick={onXong}>THANH TOÁN</button>
      </div>
    </div>
  );
}

function Hop({ tieuDe, onDong, children, chan }) {
  return (
    <div className="bhq-man" onClick={onDong}>
      <div className="bhq-hop" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={tieuDe}>
        <div className="bhq-hop-dau"><b>{tieuDe}</b><button type="button" onClick={onDong} aria-label="Đóng">✕</button></div>
        <div className="bhq-hop-than">{children}</div>
        {chan && <div className="bhq-hop-chan">{chan}</div>}
      </div>
    </div>
  );
}

function ThemKhach({ onDong, onLuu }) {
  const [ten, setTen] = useState('');
  const [sdt, setSdt] = useState('');
  const ok = ten.trim() && sdt.replace(/\D/g, '').length >= 9;
  return (
    <Hop tieuDe="Thêm khách hàng" onDong={onDong}
      chan={<button type="button" className="bhq-nut chinh" disabled={!ok} onClick={() => onLuu({ id: `moi-${Date.now()}`, name: ten.trim(), phone: sdt.replace(/\D/g, '') })}>Lưu & chọn khách</button>}>
      <label className="bhq-nhan">Tên khách<input className="bhq-o" autoFocus value={ten} onChange={(e) => setTen(e.target.value)} /></label>
      <label className="bhq-nhan">Số điện thoại<input className="bhq-o" inputMode="tel" value={sdt} onChange={(e) => setSdt(e.target.value)} /></label>
      <p className="bhq-ghi">Bản thật: lưu vào danh sách khách của app (gộp trùng theo số điện thoại).</p>
    </Hop>
  );
}

function GhiChuDong({ d, onDong, onLuu }) {
  const [v, setV] = useState(d.ghiChu || '');
  return (
    <Hop tieuDe={`Ghi chú · ${d.ten}`} onDong={onDong} chan={<button type="button" className="bhq-nut chinh" onClick={() => onLuu(v.trim())}>Lưu</button>}>
      <input className="bhq-o" autoFocus value={v} onChange={(e) => setV(e.target.value)} placeholder="VD: ghi chữ Happy Birthday, ít ngọt…" />
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
        <div><span>Số hoá đơn · doanh thu</span><b>{soLieu.soHoaDon} · {vnd(soLieu.doanhThu)}</b></div>
        <div><span>Chuyển khoản <small>(đối chiếu sao kê)</small></span><b>{vnd(soLieu.chuyenKhoan)}</b></div>
        <div><span>Thẻ</span><b>{vnd(soLieu.the)}</b></div>
        <div><span>Ghi nợ khách · thu nợ</span><b>{vnd(soLieu.ghiNo)} · {vnd(soLieu.thuNo)}</b></div>
        {soLieu.traHang > 0 && <div><span>Trả hàng (đã hoàn khách)</span><b>−{vnd(soLieu.traHang)}</b></div>}
        <div><span>Thu tiền mặt trong ca</span><b>{vnd(soLieu.tienMat)}</b></div>
      </div>
      <label className="bhq-nhan">Tiền mặt đầu ca (tiền lẻ để sẵn trong két)<input className="bhq-o" inputMode="numeric" value={dauCa} onChange={(e) => setDauCa(soTien(e.target.value))} placeholder="0" /></label>
      <div className="bhq-bang"><div className="lon"><span>Tiền mặt phải có trong két</span><b>{vnd(soLieu.heThong)}</b></div></div>
      <label className="bhq-nhan">Tiền mặt đếm thực tế<input className="bhq-o lon" inputMode="numeric" value={dem} onChange={(e) => setDem(soTien(e.target.value))} placeholder="Đếm két rồi nhập" /></label>
      {dem !== '' && (
        <p className={`bhq-chenh ${chenh < 0 ? 'thieu' : chenh > 0 ? 'du' : 'khop'}`}>
          {chenh === 0 ? '✅ Khớp tiền' : chenh < 0 ? `⚠️ Thiếu ${vnd(-chenh)}` : `Dư ${vnd(chenh)}`}
        </p>
      )}
    </Hop>
  );
}

function NhapGiam({ tieuDe, giam, kieu, onDong, onLuu }) {
  const [v, setV] = useState(String(giam || ''));
  const [k, setK] = useState(kieu || 'vnd');
  return (
    <Hop tieuDe={tieuDe} onDong={onDong} chan={<button type="button" className="bhq-nut chinh" onClick={() => onLuu(Number(v) || 0, k)}>Áp dụng</button>}>
      <div className="bhq-goi">
        <button type="button" className={k === 'vnd' ? 'on' : ''} onClick={() => setK('vnd')}>VND</button>
        <button type="button" className={k === '%' ? 'on' : ''} onClick={() => setK('%')}>%</button>
      </div>
      <input className="bhq-o" autoFocus inputMode="numeric" value={v} onChange={(e) => setV(soTien(e.target.value))} placeholder={k === '%' ? 'VD 10' : 'VD 5000'} />
    </Hop>
  );
}

function ThuKhac({ ds, onDong, onLuu }) {
  const [dong, setDong] = useState(ds?.length ? ds : []);
  return (
    <Hop tieuDe="Thu khác trên hoá đơn" onDong={onDong} chan={<button type="button" className="bhq-nut chinh" onClick={() => onLuu(dong.filter((d) => d.ten.trim() && Number(d.tien) > 0))}>Áp dụng</button>}>
      <p className="bhq-ghi">Phí ship, phụ thu, nến số… ghi ở đây — không phải tạo thành món hàng như KiotViet đang làm.</p>
      <div className="bhq-goi">{THU_KHAC_GOI_Y.map((g) => <button key={g.ten} type="button" onClick={() => setDong((x) => [...x, { ...g }])}>＋ {g.ten} {vnd(g.tien)}</button>)}</div>
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
          <b>{h.ma}</b> · {ngayGio(h.luc)} · {h.khach.name} · <b>{vnd(h.canTra)}</b>
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
      chan={<button type="button" className="bhq-nut chinh" disabled={!kq.dong.length} onClick={() => onXong(kq, pt, lyDo.trim())}>Trả hàng · hoàn {vnd(kq.tienTra)}</button>}>
      <p className="bhq-ghi">{hd.khach.name} · mua lúc {ngayGio(hd.luc)}. Bánh trả được cộng lại vào kho. Phí ship / thu khác không hoàn.</p>
      {hd.dong.map((d) => {
        const toiDa = d.sl - (daTra[d.ma] || 0);
        const v = Math.min(Number(sl[d.ma]) || 0, toiDa);
        return (
          <div key={d.ma} className="bhq-dong">
            <div className="bhq-dong-ten"><b>{d.ten}{d.size ? ` · ${d.size}` : ''}</b><small>Đã mua {d.sl}{daTra[d.ma] ? ` · đã trả ${daTra[d.ma]}` : ''} · {vnd(tienDong(d) / d.sl)}/cái</small></div>
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
        {kq.vat > 0 && <div><span>Trong đó VAT 8%</span><b>{vnd(kq.vat)}</b></div>}
        <div className="lon"><span>Tiền trả lại khách</span><b>{vnd(kq.tienTra)}</b></div>
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
          <div className="bl-h"><span>{d.sl} × {vnd(d.gia)}{Number(d.giam) ? ` (−${d.giamKieu === '%' ? `${d.giam}%` : vnd(d.giam)})` : ''}</span><span>{vnd(tienDong(d))}</span></div>
        </div>
      ))}
      <hr />
      <div className="bl-h"><span>Tổng tiền hàng</span><span>{vnd(hd.tongHang)}</span></div>
      {hd.giamHd > 0 && <div className="bl-h"><span>Giảm giá</span><span>−{vnd(hd.giamHd)}</span></div>}
      {(hd.thuKhacDong || []).map((t, i) => <div key={i} className="bl-h"><span>{t.ten}</span><span>{vnd(t.tien)}</span></div>)}
      {hd.vat > 0 && <div className="bl-h"><span>VAT 8%</span><span>{vnd(hd.vat)}</span></div>}
      <div className="bl-h bl-to"><span>TỔNG CỘNG</span><span>{vnd(hd.canTra)}</span></div>
      {!hd.tamTinh && <div className="bl-h"><span>{PT[hd.phuongThuc]}</span><span>{vnd(hd.khachDua)}</span></div>}
      {hd.thua > 0 && <div className="bl-h"><span>Tiền thừa</span><span>{vnd(hd.thua)}</span></div>}
      {hd.no > 0 && <div className="bl-h"><span>Còn nợ</span><span>{vnd(hd.no)}</span></div>}
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
              <span>{m.ten}{m.size ? ` · ${m.size}` : ''} <small>{m.ma} · vốn {vnd(m.giaVon)}</small></span>
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
          <p className="bhq-ghi">Giá trị theo giá vốn: <b>{vnd(giaTri)}</b> (KiotViet hiện ghi 0đ vì chưa có giá vốn).</p>
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
      <h2>Công nợ khách · {ds.length} khách · {vnd(tong)}</h2>
      <p className="bhq-ghi">Sắp theo nợ lâu nhất. Thu nợ trừ vào hoá đơn cũ nhất trước. Màu: vàng &gt; 30 ngày, đỏ &gt; 90 ngày. (2 khoản đầu là nợ MẪU để xem.)</p>
      {ds.map((k) => (
        <div key={k.khach.id} className={`bhq-the ${k.tuoiNo > 90 ? 'no-do' : k.tuoiNo > 30 ? 'no-vang' : ''}`}>
          <div><b>{k.khach.name}</b>{k.khach.phone ? ` · ${k.khach.phone}` : ''}</div>
          <div>{k.soHd} hoá đơn còn nợ · cũ nhất {k.hdCuNhat} · <b>nợ {k.tuoiNo} ngày</b></div>
          <div className="hang"><b>{vnd(k.tong)}</b><button type="button" className="bhq-nut chinh nho" onClick={() => onThu(k)}>Thu nợ</button></div>
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
      chan={<button type="button" className="bhq-nut nguy" disabled={!lyDo.trim()} onClick={() => onHuy(lyDo.trim())}>Huỷ hoá đơn {vnd(hd.canTra)}</button>}>
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
      chan={<button type="button" className="bhq-nut chinh" disabled={!so} onClick={() => onThu(so, pt)}>Thu {vnd(so)}</button>}>
      <div className="bhq-can-tra">Đang nợ <b>{vnd(no.tong)}</b></div>
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
          <Dong t="Tổng tiền hàng" v={vnd(bc.tongHang)} />
          <Dong t="Giảm giá" v={`−${vnd(bc.giamGia)}`} />
          <Dong t={`Trả hàng (${bc.soTra} phiếu)`} v={`−${vnd(bc.traHang)}`} />
          <Dong t="Doanh thu thuần" v={vnd(bc.doanhThuThuan)} lon />
          <Dong t="Thu khác (ship, phụ thu…)" v={vnd(bc.thuKhac)} />
          <Dong t="VAT 8% thu hộ" v={vnd(bc.vat)} />
        </div>
        <div className="bhq-the bhq-bang">
          <h3>Tiền thu <small>(đã trừ tiền hoàn trả hàng)</small></h3>
          <Dong t="Tiền mặt" v={vnd(bc.tienMat)} />
          <Dong t="Chuyển khoản" v={vnd(bc.chuyenKhoan)} />
          <Dong t="Thẻ" v={vnd(bc.the)} />
          <Dong t="Ghi nợ mới" v={vnd(bc.ghiNo)} />
          <Dong t="Thu nợ cũ" v={vnd(bc.thuNo)} />
        </div>
        <div className="bhq-the bhq-bang">
          <h3>Hàng hoá</h3>
          <Dong t="Bếp giao ra quầy" v={`${bc.giao.sl} cái`} />
          <Dong t="Xuất huỷ" v={`${bc.huy.sl} cái · ${vnd(bc.huy.giaTri)}`} />
          <Dong t="Xuất dùng nội bộ" v={`${bc.noibo.sl} cái · ${vnd(bc.noibo.giaTri)}`} />
        </div>
        <div className="bhq-the bhq-bang">
          <h3>Lãi gộp <small>(chỉ Giám đốc thấy)</small></h3>
          <Dong t="Doanh thu thuần" v={vnd(bc.doanhThuThuan)} />
          <Dong t="Giá vốn hàng bán" v={`−${vnd(bc.giaVon)}`} />
          <Dong t="Lãi gộp" v={vnd(bc.laiGop)} lon />
          <Dong t="Hàng huỷ (theo giá vốn)" v={`−${vnd(bc.huy.giaTri)}`} />
        </div>
      </div>
    </main>
  );
}
