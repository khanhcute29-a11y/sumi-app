import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../../lib/supabaseClient';
import {
  CHI_NHANH, DANH_MUC, vnd, taoMatHang, tonGia, tienDong, tinhHoaDon, tinhThanhToan, tinhKetCa, apPhieuKho,
} from './banHangQuayLogic';
import './ban-hang-quay.css';

// BẢN XEM TRƯỚC "Bán tại quầy" kiểu KiotViet (Giám đốc yêu cầu 30/10/2026).
// Mở bằng ?mockup=ban-hang. Đọc danh mục sản phẩm/khách THẬT (chỉ đọc) nếu đã
// đăng nhập, không thì dùng dữ liệu mẫu. MỌI THAO TÁC chỉ nằm trong bộ nhớ
// trình duyệt — tải lại trang là mất, KHÔNG ghi gì vào database.

const SP_MAU = [
  { id: 'm1', name: 'Bánh mì bơ tỏi', category: 'banh_man_ngot', price: 25000 },
  { id: 'm2', name: 'Bánh su kem', category: 'banh_su', price: 12000 },
  { id: 'm3', name: 'Tiramisu ly', category: 'mousse_tiramisu', price: 45000 },
  { id: 'm4', name: 'Cupcake socola', category: 'cupcake', price: 30000 },
  { id: 'm5', name: 'Bánh kem bắp', category: 'banh_kem', price: 0, product_variants: [{ id: 's16', label: 'Size 16', price: 220000 }, { id: 's20', label: 'Size 20', price: 320000 }] },
  { id: 'm6', name: 'Macaron hộp 6', category: 'macaron', price: 120000 },
];
const KHACH_MAU = [{ id: 'k1', name: 'Chị Lan', phone: '0909000111' }, { id: 'k2', name: 'Anh Minh', phone: '0911222333' }];
const KHACH_LE = { id: null, name: 'Khách lẻ', phone: '' };
const PT = { tien_mat: '💵 Tiền mặt', chuyen_khoan: '🏦 Chuyển khoản', qr: '📱 Quét QR' };
const gio = (t) => new Date(t).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
const hdMoi = (n) => ({ id: `${Date.now()}-${n}`, ten: `Hoá đơn ${n}`, dong: [], giam: 0, giamKieu: 'vnd', khach: KHACH_LE });

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
  const [ton, setTon] = useState({});
  const [ca, setCa] = useState(null);
  const [daBan, setDaBan] = useState([]);
  const [phieuKho, setPhieuKho] = useState([]);
  const [hop, setHop] = useState(null); // { loai, ... } — cửa sổ đang mở
  const [gioMo, setGioMo] = useState(false); // điện thoại: giỏ hàng dạng tấm trượt
  const [bao, setBao] = useState('');
  const timRef = useRef(null);

  useEffect(() => {
    let huy = false;
    // Mạng chậm / chưa đăng nhập: tối đa 6 giây là hiện dữ liệu mẫu, không treo màn hình.
    const choToiDa = setTimeout(() => {
      if (!huy) { setMatHang((m) => (m.length ? m : taoMatHang(SP_MAU))); setNguonDl((n) => (n === '…' ? 'dữ liệu mẫu (mạng chậm)' : n)); }
    }, 6000);
    (async () => {
      let sp = SP_MAU; let nguon = 'dữ liệu mẫu (chưa đăng nhập)';
      try {
        const { data: s } = await supabase.auth.getSession();
        if (s?.session) {
          const { data, error } = await supabase.from('products').select('*, product_variants(*)').eq('active', true).order('created_at');
          if (!error && data?.length) { sp = data; nguon = `${data.length} sản phẩm thật (chỉ đọc)`; }
          const { data: kh } = await supabase.from('customers').select('id,name,phone').eq('is_school', false).order('name').limit(500);
          if (!huy && kh?.length) setKhachDs(kh);
        }
      } catch { /* dùng dữ liệu mẫu */ }
      if (huy) return;
      clearTimeout(choToiDa);
      setMatHang(taoMatHang(sp));
      setNguonDl(nguon);
    })();
    return () => { huy = true; clearTimeout(choToiDa); };
  }, []);

  // Tồn kho giả theo chi nhánh (đổi chi nhánh -> nạp lại).
  useEffect(() => {
    const t = {};
    for (const m of matHang) t[m.ma] = tonGia(m.ma, chiNhanh);
    setTon(t);
  }, [matHang, chiNhanh]);

  useEffect(() => { if (!hdId && hds[0]) setHdId(hds[0].id); }, [hdId, hds]);
  const hd = hds.find((h) => h.id === hdId) || hds[0];
  const tong = hd ? tinhHoaDon(hd) : null;
  const suaHd = (fn) => setHds((ds) => ds.map((h) => (h.id === hd.id ? fn(h) : h)));
  const nhan = (msg) => { setBao(msg); setTimeout(() => setBao(''), 2200); };

  const loc = useMemo(() => {
    const q = tim.trim().toLowerCase();
    return matHang.filter((m) => (dm === 'all' || m.danhMuc === dm)
      && (!q || m.ten.toLowerCase().includes(q) || m.ma.toLowerCase() === q || `${m.ten} ${m.size}`.toLowerCase().includes(q)));
  }, [matHang, tim, dm]);
  const dmCo = useMemo(() => DANH_MUC.filter((d) => matHang.some((m) => m.danhMuc === d.value)), [matHang]);

  const themMon = (m) => {
    if (!ca) { setHop({ loai: 'mo_ca' }); return; }
    suaHd((h) => {
      const co = h.dong.find((d) => d.ma === m.ma);
      const dong = co ? h.dong.map((d) => (d.ma === m.ma ? { ...d, sl: d.sl + 1 } : d))
        : [...h.dong, { ma: m.ma, ten: m.ten, size: m.size, gia: m.gia, sl: 1, giam: 0, giamKieu: 'vnd' }];
      return { ...h, dong };
    });
    if ((ton[m.ma] ?? 0) <= 0) nhan(`⚠️ ${m.ten} đang hết hàng trên máy — vẫn bán được, nhớ kiểm kho`);
  };

  // Máy quét mã vạch gõ mã + Enter vào ô tìm -> thêm thẳng vào giỏ.
  const onTimEnter = (e) => {
    if (e.key !== 'Enter') return;
    const q = tim.trim().toUpperCase();
    const m = matHang.find((x) => x.ma === q) || (loc.length === 1 ? loc[0] : null);
    if (m) { themMon(m); setTim(''); } else nhan('Không thấy mã hàng này');
  };

  const doiSl = (ma, delta) => suaHd((h) => ({ ...h, dong: h.dong.map((d) => (d.ma === ma ? { ...d, sl: Math.max(d.sl + delta, 1) } : d)) }));
  const boDong = (ma) => suaHd((h) => ({ ...h, dong: h.dong.filter((d) => d.ma !== ma) }));
  const themHd = () => { const h = hdMoi(hds.length + 1); setHds((ds) => [...ds, h]); setHdId(h.id); };
  const dongHd = (id) => setHds((ds) => { const con = ds.filter((h) => h.id !== id); const kq = con.length ? con : [hdMoi(1)]; if (id === hdId) setHdId(kq[0].id); return kq; });

  const hoanTatThanhToan = ({ phuongThuc, khachDua }) => {
    const tt = tinhThanhToan({ canTra: tong.canTra, khachDua, phuongThuc, laKhachLe: !hd.khach.id });
    if (tt.loi) return tt.loi;
    const banGhi = {
      ma: `HD${String(daBan.length + 1).padStart(6, '0')}`, luc: Date.now(), chiNhanh, thuNgan: ca.nguoi,
      khach: hd.khach, dong: hd.dong, ...tong, phuongThuc, khachDua: Number(khachDua) || 0, ...tt, daHuy: false,
    };
    setDaBan((ds) => [banGhi, ...ds]);
    setTon((t) => { const n = { ...t }; for (const d of hd.dong) n[d.ma] = (n[d.ma] ?? 0) - d.sl; return n; });
    dongHd(hd.id);
    setGioMo(false);
    setHop({ loai: 'bien_lai', hoaDon: banGhi });
    return '';
  };

  const huyHoaDon = (ma) => {
    const h = daBan.find((x) => x.ma === ma);
    if (!h || h.daHuy) return;
    setDaBan((ds) => ds.map((x) => (x.ma === ma ? { ...x, daHuy: true } : x)));
    setTon((t) => { const n = { ...t }; for (const d of h.dong) n[d.ma] = (n[d.ma] ?? 0) + d.sl; return n; });
    nhan(`Đã huỷ ${ma} — đã cộng lại tồn kho`);
  };

  const luuPhieu = (phieu, hoanThanh) => {
    if (!hoanThanh) { setPhieuKho((ds) => [{ ...phieu, trangThai: 'tam' }, ...ds.filter((p) => p.ma !== phieu.ma)]); return; }
    const { tonMoi, lech } = apPhieuKho(ton, phieu, 1);
    setTon(tonMoi);
    setPhieuKho((ds) => [{ ...phieu, lech, trangThai: 'xong', luc: Date.now() }, ...ds.filter((p) => p.ma !== phieu.ma)]);
  };
  const huyPhieu = (ma) => {
    const p = phieuKho.find((x) => x.ma === ma);
    if (!p) return;
    if (p.trangThai === 'xong') setTon((t) => apPhieuKho(t, p, -1).tonMoi);
    setPhieuKho((ds) => ds.map((x) => (x.ma === ma ? { ...x, trangThai: 'huy' } : x)));
  };

  const hdTrongCa = ca ? daBan.filter((h) => h.luc >= ca.moLuc && h.chiNhanh === chiNhanh) : [];

  return (
    <div className="bhq">
      <header className="bhq-top">
        <div className="bhq-brand"><b>🧁 Bán tại quầy</b><span className="bhq-tag">BẢN XEM TRƯỚC · không lưu</span></div>
        <select className="bhq-select" value={chiNhanh} onChange={(e) => setChiNhanh(e.target.value)} aria-label="Chi nhánh">
          {CHI_NHANH.map((c) => <option key={c}>{c}</option>)}
        </select>
        <nav className="bhq-nav">
          {[['ban', '🛒 Bán hàng'], ['kho', '📦 Kho thành phẩm'], ['ls', '🧾 Hoá đơn']].map(([k, l]) => (
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
              placeholder="🔍 Tìm tên bánh hoặc quét mã vạch (SP0001…)" autoComplete="off" />
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
                    <span className={`bhq-ton ${t <= 0 ? 'het' : ''}`}>{t <= 0 ? 'Hết hàng' : `Tồn ${t}`} · {m.ma}</span>
                  </button>
                );
              })}
              {!loc.length && <p className="bhq-rong">Không có bánh nào khớp.</p>}
            </div>
            <p className="bhq-nguon">Nguồn: {nguonDl}. Tồn kho là số giả để xem trước.</p>
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
              👤 {hd.khach.name}{hd.khach.phone ? ` · ${hd.khach.phone}` : ''} <span>Đổi ›</span>
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
              {!hd.dong.length && <p className="bhq-rong">Chạm vào bánh bên trái hoặc quét mã vạch để thêm.</p>}
            </div>

            <div className="bhq-tong">
              <div><span>Tổng tiền hàng ({tong.soMon} món)</span><b>{vnd(tong.tongHang)}</b></div>
              <div><button type="button" className="bhq-link" onClick={() => setHop({ loai: 'giam_hd' })}>Giảm giá hoá đơn ›</button><b>−{vnd(tong.giamHd)}</b></div>
              <div className="lon"><span>Khách cần trả</span><b>{vnd(tong.canTra)}</b></div>
              <button type="button" className="bhq-thanh-toan" disabled={!hd.dong.length} onClick={() => setHop({ loai: 'thanh_toan' })}>
                THANH TOÁN {vnd(tong.canTra)}
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
        <KhoThanhPham matHang={matHang} ton={ton} chiNhanh={chiNhanh} phieuKho={phieuKho.filter((p) => p.chiNhanh === chiNhanh)}
          moPhieu={(loai, phieu) => setHop({ loai: 'phieu', phieuLoai: loai, phieu })} huyPhieu={huyPhieu} />
      )}

      {manHinh === 'ls' && (
        <main className="bhq-ds">
          <h2>Hoá đơn đã bán · {chiNhanh}</h2>
          {daBan.filter((h) => h.chiNhanh === chiNhanh).map((h) => (
            <div key={h.ma} className={`bhq-the ${h.daHuy ? 'huy' : ''}`}>
              <div><b>{h.ma}</b> · {gio(h.luc)} · {h.khach.name} · {PT[h.phuongThuc]}</div>
              <div>{h.dong.map((d) => `${d.sl}× ${d.ten}${d.size ? ` ${d.size}` : ''}`).join(', ')}</div>
              <div className="hang">
                <b>{vnd(h.canTra)}</b>{h.no > 0 && <span className="no">Nợ {vnd(h.no)}</span>}
                {h.daHuy ? <span className="chip huy">Đã huỷ</span> : (
                  <>
                    <button type="button" className="bhq-nut phu" onClick={() => setHop({ loai: 'bien_lai', hoaDon: h })}>In lại</button>
                    <button type="button" className="bhq-nut nguy" onClick={() => huyHoaDon(h.ma)}>Huỷ hoá đơn</button>
                  </>
                )}
              </div>
            </div>
          ))}
          {!daBan.some((h) => h.chiNhanh === chiNhanh) && <p className="bhq-rong">Chưa bán hoá đơn nào ở chi nhánh này.</p>}
        </main>
      )}

      {hop?.loai === 'mo_ca' && <MoCa onDong={() => setHop(null)} onMo={(nguoi, dauCa) => { setCa({ nguoi, dauCa, moLuc: Date.now() }); setHop(null); setTimeout(() => timRef.current?.focus(), 50); }} />}
      {hop?.loai === 'ket_ca' && ca && (
        <KetCa ca={ca} chiNhanh={chiNhanh} soLieu={tinhKetCa({ dauCa: ca.dauCa, hoaDons: hdTrongCa })}
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
      {hop?.loai === 'thanh_toan' && <ThanhToan canTra={tong.canTra} khach={hd.khach} onDong={() => setHop(null)} onXong={hoanTatThanhToan} />}
      {hop?.loai === 'bien_lai' && <BienLai hd={hop.hoaDon} onDong={() => { setHop(null); setTimeout(() => timRef.current?.focus(), 50); }} />}
      {hop?.loai === 'phieu' && (
        <PhieuKho loai={hop.phieuLoai} phieuCu={hop.phieu} matHang={matHang} ton={ton} chiNhanh={chiNhanh} nguoi={ca?.nguoi || 'Quản lý quầy'}
          soPhieu={phieuKho.length + 1} onDong={() => setHop(null)} onLuu={(p, xong) => { luuPhieu(p, xong); setHop(null); }} />
      )}

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

function MoCa({ onDong, onMo }) {
  const [nguoi, setNguoi] = useState('');
  const [dauCa, setDauCa] = useState('500000');
  return (
    <Hop tieuDe="Mở ca bán hàng" onDong={onDong}
      chan={<button type="button" className="bhq-nut chinh" disabled={!nguoi.trim()} onClick={() => onMo(nguoi.trim(), Number(dauCa) || 0)}>Mở ca</button>}>
      <p className="bhq-ghi">Như KiotViet: phải mở ca mới bán được. Mỗi thu ngân 1 ca / chi nhánh.</p>
      <label className="bhq-nhan">Thu ngân<input className="bhq-o" value={nguoi} onChange={(e) => setNguoi(e.target.value)} placeholder="Tên nhân viên quầy" /></label>
      <label className="bhq-nhan">Tiền mặt đầu ca<input className="bhq-o" inputMode="numeric" value={dauCa} onChange={(e) => setDauCa(e.target.value.replace(/\D/g, ''))} /></label>
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
        <div><span>Số hoá đơn</span><b>{soLieu.soHoaDon}</b></div>
        <div><span>Doanh thu</span><b>{vnd(soLieu.doanhThu)}</b></div>
        <div><span>Chuyển khoản / QR</span><b>{vnd(soLieu.chuyenKhoan)}</b></div>
        <div><span>Ghi nợ khách</span><b>{vnd(soLieu.ghiNo)}</b></div>
        <div><span>Tiền mặt đầu ca</span><b>{vnd(ca.dauCa)}</b></div>
        <div><span>Thu tiền mặt trong ca</span><b>{vnd(soLieu.tienMat)}</b></div>
        <div className="lon"><span>Tiền mặt phải có</span><b>{vnd(soLieu.heThong)}</b></div>
      </div>
      <label className="bhq-nhan">Tiền mặt đếm thực tế<input className="bhq-o" inputMode="numeric" value={dem} onChange={(e) => setDem(e.target.value.replace(/\D/g, ''))} placeholder="Đếm tiền trong két rồi nhập" /></label>
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
    <Hop tieuDe="Chọn khách hàng" onDong={onDong}>
      <input className="bhq-o" autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tên hoặc số điện thoại" />
      <button type="button" className="bhq-dong-chon" onClick={() => onChon(KHACH_LE)}>👤 Khách lẻ (không lưu tên)</button>
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
      <input className="bhq-o" autoFocus inputMode="numeric" value={v} onChange={(e) => setV(e.target.value.replace(/\D/g, ''))} placeholder={k === '%' ? 'VD 10' : 'VD 5000'} />
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
      {pt === 'qr' && <div className="bhq-qr">▦ Mã VietQR {vnd(canTra)} hiện ở đây<br /><small>(bản thật: QR theo số tài khoản tiệm, khách quét là có số tiền)</small></div>}
      <label className="bhq-nhan">{pt === 'tien_mat' ? 'Tiền khách đưa' : 'Số tiền nhận'}
        <input className="bhq-o lon" inputMode="numeric" value={dua} onChange={(e) => { setDua(e.target.value.replace(/\D/g, '')); setLoi(''); }} />
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
      <div className="bl-h bl-to"><span>TỔNG CỘNG</span><span>{vnd(hd.canTra)}</span></div>
      <div className="bl-h"><span>{PT[hd.phuongThuc]}</span><span>{vnd(hd.khachDua)}</span></div>
      {hd.thua > 0 && <div className="bl-h"><span>Tiền thừa</span><span>{vnd(hd.thua)}</span></div>}
      {hd.no > 0 && <div className="bl-h"><span>Còn nợ</span><span>{vnd(hd.no)}</span></div>}
      <hr />
      <div className="bl-c">Cảm ơn quý khách! Hẹn gặp lại 🧁</div>
    </div>
  );
}

const TEN_PHIEU = { nhap: 'Nhập thành phẩm', huy: 'Xuất huỷ', kiem: 'Kiểm kho' };
const TRANG_THAI = { tam: 'Phiếu tạm', xong: 'Hoàn thành', huy: 'Đã huỷ' };

function KhoThanhPham({ matHang, ton, chiNhanh, phieuKho, moPhieu, huyPhieu }) {
  const [q, setQ] = useState('');
  const ds = matHang.filter((m) => !q || `${m.ten} ${m.size} ${m.ma}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <main className="bhq-ds">
      <h2>Kho thành phẩm · {chiNhanh}</h2>
      <div className="bhq-goi">
        <button type="button" className="on" onClick={() => moPhieu('nhap')}>＋ Nhập thành phẩm</button>
        <button type="button" onClick={() => moPhieu('huy')}>🗑 Xuất huỷ</button>
        <button type="button" onClick={() => moPhieu('kiem')}>📋 Kiểm kho</button>
      </div>
      <p className="bhq-ghi">Mọi thay đổi tồn đều qua phiếu: <b>Phiếu tạm</b> (chưa tác động) → <b>Hoàn thành</b> (cộng/trừ kho) → <b>Huỷ</b> (tự hoàn kho). Không xoá phiếu.</p>
      {phieuKho.length > 0 && <h3>Phiếu kho</h3>}
      {phieuKho.map((p) => (
        <div key={p.ma} className={`bhq-the ${p.trangThai === 'huy' ? 'huy' : ''}`}>
          <div><b>{p.ma}</b> · {TEN_PHIEU[p.loai]} · {p.nguoi}{p.lyDo ? ` · ${p.lyDo}` : ''}</div>
          <div>{p.dong.map((d) => {
            const m = matHang.find((x) => x.ma === d.ma);
            const l = p.lech?.[d.ma];
            return `${m?.ten || d.ma}${m?.size ? ` ${m.size}` : ''}: ${d.sl}${p.loai === 'kiem' && l != null ? ` (lệch ${l > 0 ? '+' : ''}${l})` : ''}`;
          }).join(' · ')}</div>
          <div className="hang">
            <span className={`chip ${p.trangThai}`}>{TRANG_THAI[p.trangThai]}</span>
            {p.trangThai === 'tam' && <button type="button" className="bhq-nut phu" onClick={() => moPhieu(p.loai, p)}>Mở tiếp</button>}
            {p.trangThai !== 'huy' && <button type="button" className="bhq-nut nguy" onClick={() => huyPhieu(p.ma)}>Huỷ phiếu</button>}
          </div>
        </div>
      ))}
      <h3>Tồn kho hiện tại</h3>
      <input className="bhq-o" value={q} onChange={(e) => setQ(e.target.value)} placeholder="🔍 Tìm bánh" />
      <div className="bhq-ton-bang">
        {ds.slice(0, 200).map((m) => (
          <div key={m.ma}><span>{m.ten}{m.size ? ` · ${m.size}` : ''} <small>{m.ma}</small></span><b className={(ton[m.ma] ?? 0) <= 0 ? 'het' : ''}>{ton[m.ma] ?? 0}</b></div>
        ))}
      </div>
    </main>
  );
}

function PhieuKho({ loai, phieuCu, matHang, ton, chiNhanh, nguoi, soPhieu, onDong, onLuu }) {
  const [dong, setDong] = useState(phieuCu?.dong || []);
  const [lyDo, setLyDo] = useState(phieuCu?.lyDo || (loai === 'huy' ? 'Hết hạn cuối ngày' : ''));
  const [q, setQ] = useState('');
  const goiY = q ? matHang.filter((m) => `${m.ten} ${m.size} ${m.ma}`.toLowerCase().includes(q.toLowerCase())).slice(0, 8) : [];
  const them = (m) => { if (!dong.some((d) => d.ma === m.ma)) setDong((ds) => [...ds, { ma: m.ma, sl: loai === 'kiem' ? (ton[m.ma] ?? 0) : 1 }]); setQ(''); };
  const ma = phieuCu?.ma || `${{ nhap: 'NK', huy: 'XH', kiem: 'KK' }[loai]}${String(soPhieu).padStart(5, '0')}`;
  const phieu = { ma, loai, chiNhanh, nguoi, lyDo, dong: dong.filter((d) => loai === 'kiem' || d.sl > 0) };
  const thieuLyDo = loai === 'huy' && !lyDo.trim();
  return (
    <Hop tieuDe={`${TEN_PHIEU[loai]} · ${ma}`} onDong={onDong}
      chan={<>
        <button type="button" className="bhq-nut phu" disabled={!phieu.dong.length} onClick={() => onLuu(phieu, false)}>Lưu tạm</button>
        <button type="button" className="bhq-nut chinh" disabled={!phieu.dong.length || thieuLyDo} onClick={() => onLuu(phieu, true)}>Hoàn thành</button>
      </>}>
      <input className="bhq-o" autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="🔍 Tìm hoặc quét mã bánh để thêm" />
      {goiY.map((m) => <button key={m.ma} type="button" className="bhq-dong-chon" onClick={() => them(m)}>{m.ten}{m.size ? ` · ${m.size}` : ''} <small>tồn {ton[m.ma] ?? 0}</small></button>)}
      {dong.map((d) => {
        const m = matHang.find((x) => x.ma === d.ma);
        const lech = loai === 'kiem' ? d.sl - (ton[d.ma] ?? 0) : null;
        return (
          <div key={d.ma} className="bhq-dong">
            <div className="bhq-dong-ten"><b>{m?.ten}{m?.size ? ` · ${m.size}` : ''}</b><small>Trên máy: {ton[d.ma] ?? 0}{lech != null ? ` · lệch ${lech > 0 ? '+' : ''}${lech}` : ''}</small></div>
            <label className="bhq-sl-o">{loai === 'kiem' ? 'Đếm được' : 'Số lượng'}
              <input className="bhq-o" inputMode="numeric" value={d.sl} onChange={(e) => setDong((ds) => ds.map((x) => (x.ma === d.ma ? { ...x, sl: Number(e.target.value.replace(/\D/g, '')) || 0 } : x)))} />
            </label>
            <button type="button" className="bhq-link" onClick={() => setDong((ds) => ds.filter((x) => x.ma !== d.ma))}>Bỏ</button>
          </div>
        );
      })}
      {loai === 'huy' && <label className="bhq-nhan">Lý do huỷ (bắt buộc)<input className="bhq-o" value={lyDo} onChange={(e) => setLyDo(e.target.value)} /></label>}
      {loai !== 'huy' && <label className="bhq-nhan">Ghi chú<input className="bhq-o" value={lyDo} onChange={(e) => setLyDo(e.target.value)} placeholder={loai === 'nhap' ? 'VD: Bếp giao mẻ sáng' : 'VD: Kiểm cuối ngày'} /></label>}
    </Hop>
  );
}
