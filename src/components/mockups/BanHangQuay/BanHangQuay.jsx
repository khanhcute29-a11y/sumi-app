import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../../lib/supabaseClient';
import {
  CHI_NHANH, DANH_MUC, THU_KHAC_GOI_Y, LOAI_PHIEU, LY_DO_HUY, LOAI_NOI_BO,
  vnd, taoMatHang, tonGia, tienDong, tinhHoaDon, tinhThanhToan, tinhKetCa, apPhieuKho, tinhCongNo, baoCaoNgay,
} from './banHangQuayLogic';
import './ban-hang-quay.css';

// BẢN XEM TRƯỚC "Bán tại quầy" — thiết kế giai đoạn 1 (30/10/2026, sau khi khảo
// sát KiotViet thật của tiệm: .scratch/ban-hang-quay/03-thiet-ke-giai-doan-1.md).
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
const PT = { tien_mat: '💵 Tiền mặt', chuyen_khoan: '🏦 Chuyển khoản / QR', the: '💳 Thẻ' };
const NGAY = 86400000;
const gio = (t) => new Date(t).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
const ngayGio = (t) => new Date(t).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });
const cungNgay = (a, b) => new Date(a).toDateString() === new Date(b).toDateString();
const hdMoi = (n) => ({ id: `${Date.now()}-${n}`, ten: `Hoá đơn ${n}`, dong: [], giam: 0, giamKieu: 'vnd', khach: KHACH_LE, thuKhac: [], vat: false });

export default function BanHangQuay() {
  const [matHang, setMatHang] = useState([]);
  const [khachDs, setKhachDs] = useState(KHACH_MAU);
  const [nguonDl, setNguonDl] = useState('…');
  const [chiNhanh, setChiNhanh] = useState(CHI_NHANH[0]);
  const [manHinh, setManHinh] = useState('ban');
  const [tim, setTim] = useState('');
  const [dm, setDm] = useState('all');
  const [hds, setHds] = useState([hdMoi(1)]);
  const [hdId, setHdId] = useState(null);
  const [tonCN, setTonCN] = useState({}); // { chiNhanh: { ma: tồn } }
  const [theKho, setTheKho] = useState([]); // [{ luc, chiNhanh, ma, chungTu, loai, sl, tonCuoi, nguoi }]
  const [ca, setCa] = useState(null);
  const [daBan, setDaBan] = useState([]);
  const [thuNos, setThuNos] = useState([]);
  const [phieuKho, setPhieuKho] = useState([]);
  const [hop, setHop] = useState(null);
  const [gioMo, setGioMo] = useState(false);
  const [bao, setBao] = useState('');
  const timRef = useRef(null);
  const ton = tonCN[chiNhanh] || {};

  useEffect(() => {
    let huy = false;
    const choToiDa = setTimeout(() => {
      if (!huy) { setMatHang((m) => (m.length ? m : taoMatHang(SP_MAU))); setNguonDl((n) => (n === '…' ? 'dữ liệu mẫu (mạng chậm)' : n)); }
    }, 6000);
    (async () => {
      let sp = SP_MAU; let nguon = 'dữ liệu mẫu (chưa đăng nhập)'; let kh = null;
      try {
        const { data: s } = await supabase.auth.getSession();
        if (s?.session) {
          const { data, error } = await supabase.from('products').select('*, product_variants(*)').eq('active', true).order('created_at');
          if (!error && data?.length) { sp = data; nguon = `${data.length} sản phẩm thật (chỉ đọc)`; }
          const r = await supabase.from('customers').select('id,name,phone').eq('is_school', false).order('name').limit(500);
          kh = r.data;
        }
      } catch { /* dùng dữ liệu mẫu */ }
      if (huy) return;
      clearTimeout(choToiDa);
      const mh = taoMatHang(sp);
      setMatHang(mh);
      setNguonDl(nguon);
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

  useEffect(() => { if (!hdId && hds[0]) setHdId(hds[0].id); }, [hdId, hds]);
  const hd = hds.find((h) => h.id === hdId) || hds[0];
  const tong = hd ? tinhHoaDon(hd) : null;
  const suaHd = (fn) => setHds((ds) => ds.map((h) => (h.id === hd.id ? fn(h) : h)));
  const nhan = (msg) => { setBao(msg); setTimeout(() => setBao(''), 2400); };
  const nguoi = ca?.nguoi || 'Quản lý quầy';

  // Ghi tồn + thẻ kho cho 1 chi nhánh. thay = [{ ma, sl(±) }].
  const ghiKho = (cn, thay, chungTu, loai) => {
    const truoc = tonCN[cn] || {};
    const sau = { ...truoc };
    const dong = [];
    for (const t of thay) { sau[t.ma] = (sau[t.ma] ?? 0) + t.sl; dong.push({ luc: Date.now(), chiNhanh: cn, ma: t.ma, chungTu, loai, sl: t.sl, tonCuoi: sau[t.ma], nguoi }); }
    setTonCN((x) => ({ ...x, [cn]: sau }));
    setTheKho((x) => [...dong, ...x]);
  };

  const loc = useMemo(() => {
    const q = tim.trim().toLowerCase();
    return matHang.filter((m) => (dm === 'all' || m.danhMuc === dm)
      && (!q || m.ma.toLowerCase() === q || `${m.ten} ${m.size}`.toLowerCase().includes(q)));
  }, [matHang, tim, dm]);
  const dmCo = useMemo(() => DANH_MUC.filter((d) => matHang.some((m) => m.danhMuc === d.value)), [matHang]);

  const themMon = (m) => {
    if (!ca) { setHop({ loai: 'mo_ca' }); return; }
    suaHd((h) => {
      const co = h.dong.find((d) => d.ma === m.ma);
      const dong = co ? h.dong.map((d) => (d.ma === m.ma ? { ...d, sl: d.sl + 1 } : d))
        : [...h.dong, { ma: m.ma, ten: m.ten, size: m.size, gia: m.gia, giaVon: m.giaVon, sl: 1, giam: 0, giamKieu: 'vnd' }];
      return { ...h, dong };
    });
    if ((ton[m.ma] ?? 0) <= 0) nhan(`⚠️ ${m.ten} trên máy đã hết — vẫn bán được, cuối ngày nhớ kiểm kho`);
  };

  // Máy quét mã vạch gõ mã + Enter vào ô tìm -> thêm thẳng vào giỏ.
  const onTimEnter = (e) => {
    if (e.key !== 'Enter') return;
    const q = tim.trim().toUpperCase();
    const m = matHang.find((x) => x.ma === q) || (loc.length === 1 ? loc[0] : null);
    if (m) { themMon(m); setTim(''); } else nhan('Không thấy mã hàng này');
  };

  // Phím tắt như KiotViet: F1 hoá đơn mới · F3 tìm hàng · F4 tìm khách · F9 thanh toán.
  useEffect(() => {
    const onKey = (e) => {
      if (manHinh !== 'ban' || hop) return;
      if (e.key === 'F1') { e.preventDefault(); themHd(); }
      else if (e.key === 'F3') { e.preventDefault(); timRef.current?.focus(); }
      else if (e.key === 'F4') { e.preventDefault(); setHop({ loai: 'khach' }); }
      else if (e.key === 'F9' && hd?.dong.length) { e.preventDefault(); setHop({ loai: 'thanh_toan' }); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const doiSl = (ma, delta) => suaHd((h) => ({ ...h, dong: h.dong.map((d) => (d.ma === ma ? { ...d, sl: Math.max(d.sl + delta, 1) } : d)) }));
  const boDong = (ma) => suaHd((h) => ({ ...h, dong: h.dong.filter((d) => d.ma !== ma) }));
  const themHd = () => { const h = hdMoi(hds.length + 1); setHds((ds) => [...ds, h]); setHdId(h.id); };
  const dongHd = (id) => setHds((ds) => { const con = ds.filter((h) => h.id !== id); const kq = con.length ? con : [hdMoi(1)]; if (id === hdId) setHdId(kq[0].id); return kq; });

  const hoanTatThanhToan = ({ phuongThuc, khachDua }) => {
    const tt = tinhThanhToan({ canTra: tong.canTra, khachDua, phuongThuc, laKhachLe: !hd.khach.id });
    if (tt.loi) return tt.loi;
    const ma = `HD${String(daBan.filter((h) => !h.mau).length + 1).padStart(6, '0')}`;
    const banGhi = {
      ma, luc: Date.now(), chiNhanh, thuNgan: ca.nguoi, khach: hd.khach, dong: hd.dong, thuKhacDong: hd.thuKhac,
      ...tong, phuongThuc, khachDua: Number(khachDua) || 0, ...tt, daHuy: false,
    };
    setDaBan((ds) => [banGhi, ...ds]);
    ghiKho(chiNhanh, hd.dong.map((d) => ({ ma: d.ma, sl: -d.sl })), ma, 'Bán hàng');
    dongHd(hd.id);
    setGioMo(false);
    setHop({ loai: 'bien_lai', hoaDon: banGhi });
    return '';
  };

  const huyHoaDon = (ma) => {
    const h = daBan.find((x) => x.ma === ma);
    if (!h || h.daHuy) return;
    setDaBan((ds) => ds.map((x) => (x.ma === ma ? { ...x, daHuy: true } : x)));
    if (h.dong.length) ghiKho(h.chiNhanh, h.dong.map((d) => ({ ma: d.ma, sl: d.sl })), ma, 'Huỷ hoá đơn');
    nhan(`Đã huỷ ${ma} — đã cộng lại tồn kho${h.no ? ', xoá phần nợ' : ''}`);
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

  const hdTrongCa = ca ? daBan.filter((h) => !h.mau && h.luc >= ca.moLuc && h.chiNhanh === chiNhanh) : [];
  const thuNoTrongCa = ca ? thuNos.filter((t) => t.luc >= ca.moLuc && t.chiNhanh === chiNhanh) : [];
  const congNo = useMemo(() => tinhCongNo(daBan, thuNos), [daBan, thuNos]);

  return (
    <div className="bhq">
      <header className="bhq-top">
        <div className="bhq-brand"><b>🧁 Bán tại quầy</b><span className="bhq-tag">BẢN XEM TRƯỚC · không lưu</span></div>
        <select className="bhq-select" value={chiNhanh} onChange={(e) => setChiNhanh(e.target.value)} aria-label="Chi nhánh">
          {CHI_NHANH.map((c) => <option key={c}>{c}</option>)}
        </select>
        <nav className="bhq-nav">
          {[['ban', '🛒 Bán'], ['kho', '📦 Kho'], ['ls', '🧾 Hoá đơn'], ['no', `💳 Công nợ${congNo.length ? ` (${congNo.length})` : ''}`], ['ngay', '📊 Cuối ngày']].map(([k, l]) => (
            <button key={k} type="button" className={manHinh === k ? 'on' : ''} onClick={() => setManHinh(k)}>{l}</button>
          ))}
        </nav>
        <button type="button" className={`bhq-ca ${ca ? 'mo' : ''}`} onClick={() => setHop({ loai: ca ? 'ket_ca' : 'mo_ca' })}>
          {ca ? `● Ca từ ${gio(ca.moLuc)} · Kết ca` : 'Mở ca'}
        </button>
      </header>

      {manHinh === 'ban' && hd && (
        <main className="bhq-ban">
          <section className="bhq-trai">
            <input ref={timRef} className="bhq-tim" value={tim} onChange={(e) => setTim(e.target.value)} onKeyDown={onTimEnter}
              placeholder="🔍 Tìm bánh hoặc quét mã vạch (F3)" autoComplete="off" />
            <div className="bhq-chips">
              <button type="button" className={dm === 'all' ? 'on' : ''} onClick={() => setDm('all')}>Tất cả</button>
              {dmCo.map((d) => <button key={d.value} type="button" className={dm === d.value ? 'on' : ''} onClick={() => setDm(d.value)}>{d.label}</button>)}
            </div>
            <div className="bhq-luoi">
              {loc.map((m) => {
                const t = ton[m.ma] ?? 0;
                return (
                  <button key={m.ma} type="button" className="bhq-sp" onClick={() => themMon(m)}>
                    <span className="bhq-anh">{m.anh ? <img src={m.anh} alt="" loading="lazy" /> : '🍰'}</span>
                    <span className="bhq-ten">{m.ten}{m.size ? <em> · {m.size}</em> : null}</span>
                    <span className="bhq-gia">{vnd(m.gia)}</span>
                    <span className={`bhq-ton ${t <= 0 ? 'het' : ''}`}>{t <= 0 ? `Hết (${t})` : `Tồn ${t}`} · {m.ma}</span>
                  </button>
                );
              })}
              {!loc.length && <p className="bhq-rong">Không có bánh nào khớp.</p>}
            </div>
            <p className="bhq-nguon">Nguồn: {nguonDl}. Tồn kho, giá vốn (35% giá bán) và nợ là số mẫu để xem trước. Phím tắt: F1 HĐ mới · F3 tìm · F4 khách · F9 thanh toán.</p>
          </section>

          <section className={`bhq-phai ${gioMo ? 'mo' : ''}`}>
            <div className="bhq-tabs">
              {hds.map((h) => (
                <span key={h.id} className={`bhq-tab ${h.id === hd.id ? 'on' : ''}`}>
                  <button type="button" onClick={() => setHdId(h.id)}>{h.ten}{h.dong.length ? ` (${h.dong.length})` : ''}</button>
                  {hds.length > 1 && <button type="button" className="x" onClick={() => dongHd(h.id)} aria-label="Đóng hoá đơn">✕</button>}
                </span>
              ))}
              <button type="button" className="bhq-tab-them" onClick={themHd} aria-label="Thêm hoá đơn">＋</button>
              <button type="button" className="bhq-dong-gio" onClick={() => setGioMo(false)}>Đóng ▾</button>
            </div>

            <button type="button" className="bhq-khach" onClick={() => setHop({ loai: 'khach' })}>
              👤 {hd.khach.name}{hd.khach.phone ? ` · ${hd.khach.phone}` : ''} <span>Đổi (F4) ›</span>
            </button>

            <div className="bhq-dongs">
              {hd.dong.map((d) => (
                <div key={d.ma} className="bhq-dong">
                  <div className="bhq-dong-ten">
                    <b>{d.ten}{d.size ? ` · ${d.size}` : ''}</b>
                    <button type="button" className="bhq-link" onClick={() => setHop({ loai: 'giam_dong', ma: d.ma })}>
                      {vnd(d.gia)}{Number(d.giam) ? ` · giảm ${d.giamKieu === '%' ? `${d.giam}%` : vnd(d.giam)}` : ' · giảm giá'}
                    </button>
                  </div>
                  <div className="bhq-sl">
                    <button type="button" onClick={() => (d.sl > 1 ? doiSl(d.ma, -1) : boDong(d.ma))} aria-label="Bớt">−</button>
                    <span>{d.sl}</span>
                    <button type="button" onClick={() => doiSl(d.ma, 1)} aria-label="Thêm">＋</button>
                  </div>
                  <b className="bhq-dong-tien">{vnd(tienDong(d))}</b>
                </div>
              ))}
              {!hd.dong.length && <p className="bhq-rong">Chạm vào bánh hoặc quét mã vạch để thêm.</p>}
            </div>

            <div className="bhq-tong">
              <div><span>Tổng tiền hàng ({tong.soMon} món)</span><b>{vnd(tong.tongHang)}</b></div>
              <div><button type="button" className="bhq-link" onClick={() => setHop({ loai: 'giam_hd' })}>Giảm giá hoá đơn ›</button><b>−{vnd(tong.giamHd)}</b></div>
              <div><button type="button" className="bhq-link" onClick={() => setHop({ loai: 'thu_khac' })}>Thu khác (ship, phụ thu…) ›</button><b>+{vnd(tong.thuKhac)}</b></div>
              <div>
                <label className="bhq-vat"><input type="checkbox" checked={!!hd.vat} onChange={(e) => suaHd((h) => ({ ...h, vat: e.target.checked }))} /> Xuất VAT 8%</label>
                <b>+{vnd(tong.vat)}</b>
              </div>
              <div className="lon"><span>Khách cần trả</span><b>{vnd(tong.canTra)}</b></div>
              <button type="button" className="bhq-thanh-toan" disabled={!hd.dong.length} onClick={() => setHop({ loai: 'thanh_toan' })}>
                THANH TOÁN (F9) {vnd(tong.canTra)}
              </button>
            </div>
          </section>

          {!gioMo && hd.dong.length > 0 && (
            <button type="button" className="bhq-gio-nho" onClick={() => setGioMo(true)}>
              🛒 {tong.soMon} món · <b>{vnd(tong.canTra)}</b> <span>Xem giỏ ›</span>
            </button>
          )}
        </main>
      )}

      {manHinh === 'kho' && (
        <KhoThanhPham matHang={matHang} ton={ton} chiNhanh={chiNhanh} theKho={theKho.filter((t) => t.chiNhanh === chiNhanh)}
          phieuKho={phieuKho.filter((p) => p.chiNhanh === chiNhanh)}
          moPhieu={(loai, phieu) => setHop({ loai: 'phieu', phieuLoai: loai, phieu })} huyPhieu={huyPhieu} />
      )}

      {manHinh === 'ls' && (
        <main className="bhq-ds">
          <h2>Hoá đơn · {chiNhanh}</h2>
          {daBan.filter((h) => h.chiNhanh === chiNhanh).map((h) => (
            <div key={h.ma} className={`bhq-the ${h.daHuy ? 'huy' : ''}`}>
              <div><b>{h.ma}</b> · {ngayGio(h.luc)} · {h.khach.name} · {PT[h.phuongThuc]} · người bán: {h.thuNgan}</div>
              {h.dong.length > 0 && <div>{h.dong.map((d) => `${d.sl}× ${d.ten}${d.size ? ` ${d.size}` : ''}`).join(', ')}</div>}
              <div className="hang">
                <b>{vnd(h.canTra)}</b>{h.vat > 0 && <span className="chip">VAT {vnd(h.vat)}</span>}{h.no > 0 && <span className="no">Nợ {vnd(h.no)}</span>}
                {h.daHuy ? <span className="chip huy">Đã huỷ</span> : !h.mau && (
                  <>
                    <button type="button" className="bhq-nut phu" onClick={() => setHop({ loai: 'bien_lai', hoaDon: h })}>In lại</button>
                    <button type="button" className="bhq-nut nguy" onClick={() => huyHoaDon(h.ma)}>Huỷ hoá đơn</button>
                  </>
                )}
              </div>
            </div>
          ))}
          {!daBan.some((h) => h.chiNhanh === chiNhanh) && <p className="bhq-rong">Chưa có hoá đơn ở chi nhánh này.</p>}
        </main>
      )}

      {manHinh === 'no' && <CongNo ds={congNo} onThu={(k) => setHop({ loai: 'thu_no', no: k })} />}

      {manHinh === 'ngay' && (
        <CuoiNgay chiNhanh={chiNhanh} matHang={matHang}
          bc={baoCaoNgay({
            hoaDons: daBan.filter((h) => !h.mau && h.chiNhanh === chiNhanh && cungNgay(h.luc, Date.now())),
            phieuKho: phieuKho.filter((p) => p.chiNhanh === chiNhanh && p.luc && cungNgay(p.luc, Date.now())),
            thuNos: thuNos.filter((t) => t.chiNhanh === chiNhanh && cungNgay(t.luc, Date.now())),
            matHang,
          })} />
      )}

      {hop?.loai === 'mo_ca' && <MoCa onDong={() => setHop(null)} onMo={(ng, dauCa) => { setCa({ nguoi: ng, dauCa, moLuc: Date.now() }); setHop(null); setTimeout(() => timRef.current?.focus(), 50); }} />}
      {hop?.loai === 'ket_ca' && ca && (
        <KetCa ca={ca} chiNhanh={chiNhanh} soLieu={tinhKetCa({ dauCa: ca.dauCa, hoaDons: hdTrongCa, thuNos: thuNoTrongCa })}
          onDong={() => setHop(null)} onKet={() => { setCa(null); setHop(null); nhan('Đã kết ca — ca đã đóng không mở lại được'); }} />
      )}
      {hop?.loai === 'khach' && <ChonKhach ds={khachDs} onDong={() => setHop(null)} onChon={(k) => { suaHd((h) => ({ ...h, khach: k })); setHop(null); }} />}
      {hop?.loai === 'giam_hd' && (
        <NhapGiam tieuDe="Giảm giá hoá đơn" giam={hd.giam} kieu={hd.giamKieu} onDong={() => setHop(null)}
          onLuu={(giam, kieu) => { suaHd((h) => ({ ...h, giam, giamKieu: kieu })); setHop(null); }} />
      )}
      {hop?.loai === 'giam_dong' && (() => {
        const d = hd.dong.find((x) => x.ma === hop.ma);
        return d ? (
          <NhapGiam tieuDe={`Giảm giá · ${d.ten}`} giam={d.giam} kieu={d.giamKieu} onDong={() => setHop(null)}
            onLuu={(giam, kieu) => { suaHd((h) => ({ ...h, dong: h.dong.map((x) => (x.ma === d.ma ? { ...x, giam, giamKieu: kieu } : x)) })); setHop(null); }} />
        ) : null;
      })()}
      {hop?.loai === 'thu_khac' && <ThuKhac ds={hd.thuKhac} onDong={() => setHop(null)} onLuu={(ds) => { suaHd((h) => ({ ...h, thuKhac: ds })); setHop(null); }} />}
      {hop?.loai === 'thanh_toan' && <ThanhToan canTra={tong.canTra} khach={hd.khach} onDong={() => setHop(null)} onXong={hoanTatThanhToan} />}
      {hop?.loai === 'bien_lai' && <BienLai hd={hop.hoaDon} onDong={() => { setHop(null); setTimeout(() => timRef.current?.focus(), 50); }} />}
      {hop?.loai === 'phieu' && (
        <PhieuKho loai={hop.phieuLoai} phieuCu={hop.phieu} matHang={matHang} ton={ton} chiNhanh={chiNhanh} nguoi={nguoi}
          soPhieu={phieuKho.filter((p) => p.loai === hop.phieuLoai).length + 1} onDong={() => setHop(null)}
          onLuu={(p, xong) => { luuPhieu(p, xong); setHop(null); }} />
      )}
      {hop?.loai === 'thu_no' && <ThuNo no={hop.no} onDong={() => setHop(null)} onThu={(tien, pt) => { thuNo(hop.no.khach.id, tien, pt); setHop(null); }} />}

      {bao && <div className="bhq-bao">{bao}</div>}
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

const soTien = (v) => v.replace(/\D/g, '');

function MoCa({ onDong, onMo }) {
  const [ng, setNg] = useState('');
  const [dauCa, setDauCa] = useState('500000');
  return (
    <Hop tieuDe="Mở ca bán hàng" onDong={onDong}
      chan={<button type="button" className="bhq-nut chinh" disabled={!ng.trim()} onClick={() => onMo(ng.trim(), Number(dauCa) || 0)}>Mở ca</button>}>
      <p className="bhq-ghi">Phải mở ca mới bán được. Bản thật: tên lấy từ tài khoản đăng nhập — mỗi người 1 tài khoản, không dùng chung "ca1/Ca2".</p>
      <label className="bhq-nhan">Thu ngân<input className="bhq-o" value={ng} onChange={(e) => setNg(e.target.value)} placeholder="Tên nhân viên quầy" /></label>
      <label className="bhq-nhan">Tiền mặt đầu ca<input className="bhq-o" inputMode="numeric" value={dauCa} onChange={(e) => setDauCa(soTien(e.target.value))} /></label>
      <div className="bhq-goi">{[0, 200000, 500000, 1000000].map((v) => <button key={v} type="button" onClick={() => setDauCa(String(v))}>{vnd(v)}</button>)}</div>
    </Hop>
  );
}

function KetCa({ ca, chiNhanh, soLieu, onDong, onKet }) {
  const [dem, setDem] = useState('');
  const chenh = (Number(dem) || 0) - soLieu.heThong;
  return (
    <Hop tieuDe={`Kết ca · ${ca.nguoi} · ${chiNhanh}`} onDong={onDong}
      chan={<button type="button" className="bhq-nut chinh" disabled={dem === ''} onClick={onKet}>Kết ca & in phiếu bàn giao</button>}>
      <div className="bhq-bang">
        <div><span>Mở ca lúc</span><b>{gio(ca.moLuc)}</b></div>
        <div><span>Số hoá đơn · doanh thu</span><b>{soLieu.soHoaDon} · {vnd(soLieu.doanhThu)}</b></div>
        <div><span>Chuyển khoản / QR <small>(đối chiếu sao kê)</small></span><b>{vnd(soLieu.chuyenKhoan)}</b></div>
        <div><span>Thẻ</span><b>{vnd(soLieu.the)}</b></div>
        <div><span>Ghi nợ khách · thu nợ</span><b>{vnd(soLieu.ghiNo)} · {vnd(soLieu.thuNo)}</b></div>
        <div><span>Tiền mặt đầu ca</span><b>{vnd(ca.dauCa)}</b></div>
        <div><span>Thu tiền mặt trong ca</span><b>{vnd(soLieu.tienMat)}</b></div>
        <div className="lon"><span>Tiền mặt phải có trong két</span><b>{vnd(soLieu.heThong)}</b></div>
      </div>
      <label className="bhq-nhan">Tiền mặt đếm thực tế<input className="bhq-o" inputMode="numeric" value={dem} onChange={(e) => setDem(soTien(e.target.value))} placeholder="Đếm két rồi nhập" /></label>
      {dem !== '' && (
        <p className={`bhq-chenh ${chenh < 0 ? 'thieu' : chenh > 0 ? 'du' : 'khop'}`}>
          {chenh === 0 ? '✅ Khớp tiền' : chenh < 0 ? `⚠️ Thiếu ${vnd(-chenh)}` : `Dư ${vnd(chenh)}`}
        </p>
      )}
    </Hop>
  );
}

function ChonKhach({ ds, onDong, onChon }) {
  const [q, setQ] = useState('');
  const loc = ds.filter((k) => !q || `${k.name} ${k.phone || ''}`.toLowerCase().includes(q.toLowerCase())).slice(0, 40);
  return (
    <Hop tieuDe="Chọn khách hàng (F4)" onDong={onDong}>
      <input className="bhq-o" autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tên hoặc số điện thoại" />
      <button type="button" className="bhq-dong-chon" onClick={() => onChon(KHACH_LE)}>👤 Khách lẻ (không lưu tên, không được nợ)</button>
      {loc.map((k) => <button key={k.id} type="button" className="bhq-dong-chon" onClick={() => onChon(k)}><b>{k.name}</b> {k.phone}</button>)}
    </Hop>
  );
}

function NhapGiam({ tieuDe, giam, kieu, onDong, onLuu }) {
  const [v, setV] = useState(String(giam || ''));
  const [k, setK] = useState(kieu || 'vnd');
  return (
    <Hop tieuDe={tieuDe} onDong={onDong} chan={<button type="button" className="bhq-nut chinh" onClick={() => onLuu(Number(v) || 0, k)}>Áp dụng</button>}>
      <div className="bhq-goi">
        <button type="button" className={k === 'vnd' ? 'on' : ''} onClick={() => setK('vnd')}>Theo tiền (đ)</button>
        <button type="button" className={k === '%' ? 'on' : ''} onClick={() => setK('%')}>Theo %</button>
      </div>
      <input className="bhq-o" autoFocus inputMode="numeric" value={v} onChange={(e) => setV(soTien(e.target.value))} placeholder={k === '%' ? 'VD 10' : 'VD 5000'} />
    </Hop>
  );
}

function ThuKhac({ ds, onDong, onLuu }) {
  const [dong, setDong] = useState(ds?.length ? ds : []);
  return (
    <Hop tieuDe="Thu khác trên hoá đơn" onDong={onDong} chan={<button type="button" className="bhq-nut chinh" onClick={() => onLuu(dong.filter((d) => d.ten.trim() && Number(d.tien) > 0))}>Áp dụng</button>}>
      <p className="bhq-ghi">Phí ship, phụ thu, nến số… ghi ở đây — KHÔNG tạo thành món hàng như KiotViet đang làm.</p>
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

function ThanhToan({ canTra, khach, onDong, onXong }) {
  const [pt, setPt] = useState('tien_mat');
  const [dua, setDua] = useState(String(canTra));
  const [loi, setLoi] = useState('');
  const tt = tinhThanhToan({ canTra, khachDua: dua, phuongThuc: pt, laKhachLe: !khach.id });
  const goiY = [...new Set([canTra, Math.ceil(canTra / 50000) * 50000, Math.ceil(canTra / 100000) * 100000, 500000])].filter((v) => v >= canTra).slice(0, 4);
  return (
    <Hop tieuDe={`Thanh toán · ${khach.name}`} onDong={onDong}
      chan={<button type="button" className="bhq-nut chinh" onClick={() => setLoi(onXong({ phuongThuc: pt, khachDua: dua }))}>Hoàn tất & in hoá đơn</button>}>
      <div className="bhq-can-tra">Khách cần trả <b>{vnd(canTra)}</b></div>
      <div className="bhq-goi">{Object.entries(PT).map(([k, l]) => <button key={k} type="button" className={pt === k ? 'on' : ''} onClick={() => { setPt(k); setDua(String(canTra)); }}>{l}</button>)}</div>
      {pt === 'chuyen_khoan' && <div className="bhq-qr">▦ Mã VietQR {vnd(canTra)}<br /><small>(bản thật: QR theo tài khoản của chi nhánh, khách quét là có sẵn số tiền + mã hoá đơn để đối chiếu sao kê)</small></div>}
      <label className="bhq-nhan">{pt === 'tien_mat' ? 'Tiền khách đưa' : 'Số tiền nhận'}
        <input className="bhq-o lon" inputMode="numeric" value={dua} onChange={(e) => { setDua(soTien(e.target.value)); setLoi(''); }} />
      </label>
      {pt === 'tien_mat' && <div className="bhq-goi">{goiY.map((v) => <button key={v} type="button" onClick={() => setDua(String(v))}>{vnd(v)}</button>)}</div>}
      <div className="bhq-bang">
        {tt.thua > 0 && <div className="lon"><span>Trả lại khách</span><b>{vnd(tt.thua)}</b></div>}
        {tt.no > 0 && <div className="lon no"><span>Ghi nợ</span><b>{vnd(tt.no)}</b></div>}
      </div>
      {(loi || tt.loi) && <p className="bhq-loi">{loi || tt.loi}</p>}
    </Hop>
  );
}

// Biên lai khổ 80mm cho máy in nhiệt ZyWell ZY303 (USB) — in bằng hộp in của
// trình duyệt; khi in chỉ phần #bhq-in hiện ra (xem @media print trong CSS).
function BienLai({ hd, onDong }) {
  return (
    <>
      <Hop tieuDe={`Đã bán ${hd.ma}`} onDong={onDong}
        chan={<><button type="button" className="bhq-nut phu" onClick={onDong}>Đơn mới</button><button type="button" className="bhq-nut chinh" onClick={() => window.print()}>🖨 In hoá đơn</button></>}>
        <div className="bhq-giay"><NoiDungBienLai hd={hd} /></div>
      </Hop>
      {createPortal(<div id="bhq-in"><NoiDungBienLai hd={hd} /></div>, document.body)}
    </>
  );
}

function NoiDungBienLai({ hd }) {
  return (
    <div className="bl">
      <div className="bl-c"><b>SUMI BAKERY</b><br />{hd.chiNhanh}</div>
      <div className="bl-c">HOÁ ĐƠN BÁN HÀNG<br />{hd.ma} · {new Date(hd.luc).toLocaleString('vi-VN')}</div>
      <div>Thu ngân: {hd.thuNgan}<br />Khách: {hd.khach.name}{hd.khach.phone ? ` · ${hd.khach.phone}` : ''}</div>
      <hr />
      {hd.dong.map((d) => (
        <div key={d.ma} className="bl-d">
          <div>{d.ten}{d.size ? ` ${d.size}` : ''}</div>
          <div className="bl-h"><span>{d.sl} × {vnd(d.gia)}{Number(d.giam) ? ` (−${d.giamKieu === '%' ? `${d.giam}%` : vnd(d.giam)})` : ''}</span><span>{vnd(tienDong(d))}</span></div>
        </div>
      ))}
      <hr />
      <div className="bl-h"><span>Tổng tiền hàng</span><span>{vnd(hd.tongHang)}</span></div>
      {hd.giamHd > 0 && <div className="bl-h"><span>Giảm giá</span><span>−{vnd(hd.giamHd)}</span></div>}
      {(hd.thuKhacDong || []).map((t, i) => <div key={i} className="bl-h"><span>{t.ten}</span><span>{vnd(t.tien)}</span></div>)}
      {hd.vat > 0 && <div className="bl-h"><span>VAT 8%</span><span>{vnd(hd.vat)}</span></div>}
      <div className="bl-h bl-to"><span>TỔNG CỘNG</span><span>{vnd(hd.canTra)}</span></div>
      <div className="bl-h"><span>{PT[hd.phuongThuc]}</span><span>{vnd(hd.khachDua)}</span></div>
      {hd.thua > 0 && <div className="bl-h"><span>Tiền thừa</span><span>{vnd(hd.thua)}</span></div>}
      {hd.no > 0 && <div className="bl-h"><span>Còn nợ</span><span>{vnd(hd.no)}</span></div>}
      <hr />
      <div className="bl-c">Cảm ơn quý khách! Hẹn gặp lại 🧁</div>
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
          <Dong t="Doanh thu thuần" v={vnd(bc.doanhThuThuan)} lon />
          <Dong t="Thu khác (ship, phụ thu…)" v={vnd(bc.thuKhac)} />
          <Dong t="VAT 8% thu hộ" v={vnd(bc.vat)} />
        </div>
        <div className="bhq-the bhq-bang">
          <h3>Tiền thu</h3>
          <Dong t="Tiền mặt" v={vnd(bc.tienMat)} />
          <Dong t="Chuyển khoản / QR" v={vnd(bc.chuyenKhoan)} />
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
