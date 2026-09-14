import React, { useCallback, useEffect, useState } from 'react';
import { fetchTonVatTu, fetchSoGiaoDichVatTu, nhapVatTu, xuatVatTu } from '../../lib/khoVatTu';

// KHO VẬT TƯ — XƯỞNG 41.
//
// Tách riêng khỏi Kho Macaron (KhoMacaronX41.jsx): 9 mã vật tư trang trí
// (Quy bơ 6 màu, Quy bơ mít, Sô Cô La, Trái tim đỏ), mỗi mã 1 đơn vị tính cố
// định riêng (Khay/Thùng/Hộp), không theo lô/ngày SX/hạn dùng như macaron —
// chỉ nhập/xuất/xem tồn đơn giản. Xem migration 202609141000.

const o = {
  the: { background: '#fff', border: '1.5px solid #e2cdb6', borderRadius: 16, padding: 12 },
  o: {
    width: '100%', minHeight: 40, padding: '0 10px', borderRadius: 12,
    border: '1.5px solid #e2cdb6', fontSize: 14, fontFamily: 'inherit',
    boxSizing: 'border-box', background: '#fffdf9', color: '#2d1b10',
  },
  nut: {
    minHeight: 40, border: 0, borderRadius: 14, background: '#f05c2b', color: '#fff',
    fontSize: 13, fontWeight: 900, cursor: 'pointer', width: '100%',
  },
};

export default function KhoVatTuX41({ onBack }) {
  const [ton, setTon] = useState([]);
  const [dangTai, setDangTai] = useState(true);
  const [loi, setLoi] = useState('');
  const [xong, setXong] = useState('');
  const [dangNhap, setDangNhap] = useState(null); // ma đang mở form nhập
  const [dangXuat, setDangXuat] = useState(null); // ma đang mở form xuất
  const [soLuong, setSoLuong] = useState('');
  const [ghiChu, setGhiChu] = useState('');
  const [luu, setLuu] = useState(false);
  const [xemSo, setXemSo] = useState(null); // ma đang xem lịch sử
  const [so, setSo] = useState([]);
  const [dangTaiSo, setDangTaiSo] = useState(false);

  const taiLai = useCallback(async () => {
    setDangTai(true); setLoi('');
    try { setTon(await fetchTonVatTu()); }
    catch (e) { setLoi(e?.message || 'Không tải được kho vật tư.'); setTon([]); }
    finally { setDangTai(false); }
  }, []);
  useEffect(() => { taiLai(); }, [taiLai]);

  const bao = (msg) => { setXong(msg); setTimeout(() => setXong(''), 3000); };

  const moNhap = (ma) => { setDangXuat(null); setXemSo(null); setDangNhap(ma); setSoLuong(''); setGhiChu(''); };
  const moXuat = (ma) => { setDangNhap(null); setXemSo(null); setDangXuat(ma); setSoLuong(''); setGhiChu(''); };
  const moSo = async (ma) => {
    setDangNhap(null); setDangXuat(null); setXemSo(ma);
    setDangTaiSo(true);
    try { setSo(await fetchSoGiaoDichVatTu({ ma })); }
    catch { setSo([]); }
    finally { setDangTaiSo(false); }
  };

  const nhap = async (ma) => {
    const n = Number(soLuong);
    if (!n || n <= 0) { setLoi('Nhập số lượng lớn hơn 0.'); return; }
    setLuu(true); setLoi('');
    try {
      const kq = await nhapVatTu({ ma, soLuong: n, ghiChu });
      setDangNhap(null);
      bao(kq?.thong_bao || 'Đã nhập kho.');
      taiLai();
    } catch (e) { setLoi(e?.message || 'Không nhập kho được.'); }
    finally { setLuu(false); }
  };

  const xuat = async (ma) => {
    const n = Number(soLuong);
    if (!n || n <= 0) { setLoi('Nhập số lượng lớn hơn 0.'); return; }
    setLuu(true); setLoi('');
    try {
      const kq = await xuatVatTu({ ma, soLuong: n, ghiChu });
      setDangXuat(null);
      bao(kq?.thong_bao || 'Đã xuất kho.');
      taiLai();
    } catch (e) { setLoi(e?.message || 'Không xuất kho được.'); }
    finally { setLuu(false); }
  };

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '0 14px 40px', color: '#2d1b10' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 0 14px' }}>
        {onBack && (
          <button onClick={onBack} style={{ width: 40, height: 40, borderRadius: 12, background: '#f4efe8', border: 0, fontSize: 20, fontWeight: 900, cursor: 'pointer' }}>‹</button>
        )}
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 900 }}>🧴 Kho Vật Tư — Xưởng 41</h1>
      </div>

      {loi && <div style={{ background: '#fff0ee', border: '1px solid #f5c2bd', borderRadius: 12, padding: 10, color: '#b7431e', fontWeight: 700, fontSize: 13, marginBottom: 12 }}>⚠️ {loi}</div>}
      {xong && <div style={{ background: '#e8f8ef', border: '1px solid #a7e8c6', borderRadius: 12, padding: 10, color: '#078653', fontWeight: 800, fontSize: 13, marginBottom: 12 }}>✅ {xong}</div>}
      {dangTai && <div style={{ color: '#806a58', fontSize: 13, padding: '10px 0' }}>Đang tải…</div>}

      {!dangTai && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 8 }}>
          {ton.map((t) => (
            <div key={t.ma} style={{ ...o.the, padding: 10 }}>
              <div style={{ fontSize: 10.5, color: '#a68f7a', fontWeight: 700 }}>{t.ma}</div>
              <b style={{ fontSize: 13.5, display: 'block' }}>{t.ten}</b>
              <div style={{ fontSize: 17, fontWeight: 900, color: t.soLuong > 0 ? '#b7431e' : '#b9a898', marginTop: 4 }}>
                {t.soLuong} {t.don_vi}
              </div>

              {dangNhap === t.ma ? (
                <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <input style={o.o} inputMode="numeric" placeholder={`Số ${t.don_vi} nhập`} value={soLuong} onChange={(e) => setSoLuong(e.target.value)} />
                  <input style={o.o} placeholder="Ghi chú (không bắt buộc)" value={ghiChu} onChange={(e) => setGhiChu(e.target.value)} />
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button disabled={luu} onClick={() => nhap(t.ma)} style={o.nut}>{luu ? 'Đang lưu…' : '✓ Nhập'}</button>
                    <button disabled={luu} onClick={() => setDangNhap(null)} style={{ ...o.nut, background: '#fff', color: '#806a58', border: '1px solid #e2cdb6' }}>Huỷ</button>
                  </div>
                </div>
              ) : dangXuat === t.ma ? (
                <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <input style={o.o} inputMode="numeric" placeholder={`Số ${t.don_vi} xuất`} value={soLuong} onChange={(e) => setSoLuong(e.target.value)} />
                  <input style={o.o} placeholder="Ghi chú (không bắt buộc)" value={ghiChu} onChange={(e) => setGhiChu(e.target.value)} />
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button disabled={luu} onClick={() => xuat(t.ma)} style={{ ...o.nut, background: '#b7431e' }}>{luu ? 'Đang lưu…' : '✓ Xuất'}</button>
                    <button disabled={luu} onClick={() => setDangXuat(null)} style={{ ...o.nut, background: '#fff', color: '#806a58', border: '1px solid #e2cdb6' }}>Huỷ</button>
                  </div>
                </div>
              ) : (
                <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={() => moNhap(t.ma)} style={{ flex: 1, minHeight: 34, borderRadius: 10, border: '1.5px dashed #e2cdb6', background: 'transparent', color: '#b7431e', fontWeight: 800, fontSize: 12, cursor: 'pointer' }}>＋ Nhập</button>
                    <button onClick={() => moXuat(t.ma)} disabled={t.soLuong <= 0} style={{ flex: 1, minHeight: 34, borderRadius: 10, border: '1.5px dashed #e2cdb6', background: 'transparent', color: t.soLuong <= 0 ? '#c9baa9' : '#b7431e', fontWeight: 800, fontSize: 12, cursor: t.soLuong <= 0 ? 'not-allowed' : 'pointer' }}>− Xuất</button>
                  </div>
                  <button onClick={() => moSo(t.ma)} style={{ minHeight: 30, border: 0, background: 'transparent', color: '#806a58', fontWeight: 700, fontSize: 11.5, cursor: 'pointer', textDecoration: 'underline' }}>Xem lịch sử</button>
                </div>
              )}

              {xemSo === t.ma && (
                <div style={{ marginTop: 8, borderTop: '1px dashed #e2cdb6', paddingTop: 8, display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 200, overflowY: 'auto' }}>
                  {dangTaiSo ? <div style={{ fontSize: 11.5, color: '#806a58' }}>Đang tải…</div> : so.length === 0 ? (
                    <div style={{ fontSize: 11.5, color: '#806a58' }}>Chưa có giao dịch nào.</div>
                  ) : so.map((g) => (
                    <div key={g.id} style={{ fontSize: 11.5, color: '#2d1b10' }}>
                      <b style={{ color: g.loai_gd === 'nhap' ? '#078653' : '#b7431e' }}>{g.loai_gd === 'nhap' ? '+' : ''}{g.so_luong_thay_doi}</b>
                      {' · '}{new Date(g.created_at).toLocaleString('vi-VN')}
                      {g.staff_name ? ` · ${g.staff_name}` : ''}
                      {g.ghi_chu ? ` · ${g.ghi_chu}` : ''}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
