import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../lib/AuthContext';
import { hasAnyRole } from '../../lib/roles';
import {
  CAP_MOI_KHAY, BANH_DON_MOI_CAP, chuKhay, goiYChiaDeu,
  fetchTonMacaron, fetchSoGiaoDichMacaron,
  nhapMacaron, tronMacaron, kiemKeMacaron, suaLoNhapMacaron,
} from '../../lib/khoMacaron';

// KHO MACARON — XƯỞNG 41.
//
// Tách riêng khỏi "Kho Thành Phẩm" chung (FinishedGoodsInventoryV2) vì kho
// chung khớp dòng theo product+size và BỎ QUA màu — 12 màu macaron sẽ đụng
// nhau vào một dòng. Toàn bộ ghi dữ liệu đi qua RPC (xem migration
// 202609042000), màn hình này không tự UPDATE bảng tồn.
//
// Đơn vị: DB lưu theo CẶP, màn hình quy đổi ra khay (1 khay = 36 cặp).

const o = {
  the: { background: '#fff', border: '1.5px solid #e2cdb6', borderRadius: 16, padding: 12 },
  o: {
    width: '100%', minHeight: 44, padding: '0 10px', borderRadius: 12,
    border: '1.5px solid #e2cdb6', fontSize: 14, fontFamily: 'inherit',
    boxSizing: 'border-box', background: '#fffdf9', color: '#2d1b10',
  },
  nhan: { display: 'block', fontSize: 11.5, fontWeight: 900, color: '#806a58', marginBottom: 4 },
  nut: {
    minHeight: 48, border: 0, borderRadius: 14, background: '#f05c2b', color: '#fff',
    fontSize: 15, fontWeight: 900, cursor: 'pointer', width: '100%',
  },
};

const MAU_HIEN_THI = {
  cam: '#f97316', vang_nhat: '#fde68a', vang_dam: '#f59e0b', hong: '#f9a8d4',
  trang: '#f8fafc', tim: '#a78bfa', do: '#ef4444', xanh_la: '#4ade80',
  nau: '#92400e', den: '#334155', xanh_dam: '#1d4ed8', xanh_nhat: '#7dd3fc',
};

export default function KhoMacaronX41({ onBack }) {
  const { profile } = useAuth();
  const [tab, setTab] = useState('ton');
  const [ton, setTon] = useState([]);
  const [dangTai, setDangTai] = useState(true);
  const [loi, setLoi] = useState('');
  const [xong, setXong] = useState('');

  // Quyền kiểm kê: Giám đốc/Admin, hoặc quản lý ĐÚNG khâu Xưởng 41. Đây chỉ
  // là lớp ẩn nút cho gọn mắt — chặn thật nằm ở RPC sumi_macaron_kiem_ke
  // (la_quan_ly_cua_khau('xuong41')) dưới database.
  const laQuanLy = hasAnyRole(profile, ['owner', 'admin'])
    || (profile?.station === 'xuong41' && hasAnyRole(profile, ['kitchen_lead', 'deputy_director_x41']));

  const taiLai = useCallback(async () => {
    setDangTai(true); setLoi('');
    try { setTon(await fetchTonMacaron()); }
    catch (e) { setLoi(e?.message || 'Không tải được kho macaron.'); setTon([]); }
    finally { setDangTai(false); }
  }, []);
  useEffect(() => { taiLai(); }, [taiLai]);

  const mauDon = useMemo(() => ton.filter((t) => t.loai === 'mau_don'), [ton]);
  const cacMix = useMemo(() => ton.filter((t) => t.loai === 'mix'), [ton]);
  const tongCapMauDon = mauDon.reduce((s, t) => s + t.soCap, 0);

  const bao = (msg) => { setXong(msg); setTimeout(() => setXong(''), 3000); };

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '0 14px 40px', color: '#2d1b10' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 0 14px' }}>
        {onBack && (
          <button onClick={onBack} style={{ width: 40, height: 40, borderRadius: 12, background: '#f4efe8', border: 0, fontSize: 20, fontWeight: 900, cursor: 'pointer' }}>‹</button>
        )}
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 900 }}>🍬 Kho Macaron — Xưởng 41</h1>
          <div style={{ fontSize: 11.5, color: '#806a58' }}>
            1 khay = {CAP_MOI_KHAY} cặp = {CAP_MOI_KHAY * BANH_DON_MOI_CAP} bánh đơn
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        {[['ton', '📦 Tồn kho'], ['tron', '🎨 Trộn màu'], ['kiemke', '📋 Kiểm kê']].map(([k, ten]) => (
          <button key={k} onClick={() => setTab(k)} style={{
            flex: 1, minHeight: 46, borderRadius: 14,
            border: tab === k ? '2px solid #f05c2b' : '1px solid #e2cdb6',
            background: tab === k ? '#fff1e8' : '#fff',
            color: tab === k ? '#b7431e' : '#806a58', fontWeight: 900, cursor: 'pointer', fontSize: 13,
          }}>{ten}</button>
        ))}
      </div>

      {loi && <div style={{ background: '#fff0ee', border: '1px solid #f5c2bd', borderRadius: 12, padding: 10, color: '#b7431e', fontWeight: 700, fontSize: 13, marginBottom: 12 }}>⚠️ {loi}</div>}
      {xong && <div style={{ background: '#e8f8ef', border: '1px solid #a7e8c6', borderRadius: 12, padding: 10, color: '#078653', fontWeight: 800, fontSize: 13, marginBottom: 12 }}>✅ {xong}</div>}
      {dangTai && <div style={{ color: '#806a58', fontSize: 13, padding: '10px 0' }}>Đang tải…</div>}

      {!dangTai && tab === 'ton' && (
        <TabTonKho mauDon={mauDon} cacMix={cacMix} tongCapMauDon={tongCapMauDon}
          onXong={(m) => { bao(m); taiLai(); }} onLoi={setLoi} />
      )}
      {!dangTai && tab === 'tron' && (
        <TabTronMau mauDon={mauDon} cacMix={cacMix}
          onXong={(m) => { bao(m); taiLai(); setTab('ton'); }} onLoi={setLoi} />
      )}
      {!dangTai && tab === 'kiemke' && (
        <TabKiemKe ton={ton} laQuanLy={laQuanLy}
          onXong={(m) => { bao(m); taiLai(); }} onLoi={setLoi} />
      )}
    </div>
  );
}

// ── TAB 1: TỒN KHO + nhập nhanh ────────────────────────────────────────────
function TabTonKho({ mauDon, cacMix, tongCapMauDon, onXong, onLoi }) {
  const [dangNhap, setDangNhap] = useState(null); // ma đang mở form nhập
  const [soKhay, setSoKhay] = useState('');
  const [soCapLe, setSoCapLe] = useState('');
  const [ghiChu, setGhiChu] = useState('');
  const [ngaySx, setNgaySx] = useState('');
  const [hanSuDung, setHanSuDung] = useState('');
  const [luu, setLuu] = useState(false);

  const moNhap = (ma) => { setDangNhap(ma); setSoKhay(''); setSoCapLe(''); setGhiChu(''); setNgaySx(''); setHanSuDung(''); };

  const nhap = async () => {
    const tong = (Number(soKhay) || 0) * CAP_MOI_KHAY + (Number(soCapLe) || 0);
    if (tong <= 0) { onLoi('Nhập số khay hoặc số cặp lớn hơn 0.'); return; }
    if (hanSuDung && ngaySx && hanSuDung < ngaySx) { onLoi('Hạn sử dụng không được sớm hơn Ngày sản xuất.'); return; }
    setLuu(true); onLoi('');
    try {
      const kq = await nhapMacaron({ ma: dangNhap, soCap: tong, ghiChu, ngaySx: ngaySx || null, hanSuDung: hanSuDung || null });
      setDangNhap(null);
      onXong(kq?.thong_bao || 'Đã nhập kho.');
    } catch (e) { onLoi(e?.message || 'Không nhập kho được.'); }
    finally { setLuu(false); }
  };

  const veThe = (t) => (
    <div key={t.ma} style={{ ...o.the, padding: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {t.loai === 'mau_don' && (
          <span style={{ width: 16, height: 16, borderRadius: '50%', flexShrink: 0, background: MAU_HIEN_THI[t.ma] || '#ddd', border: '1px solid rgba(0,0,0,.15)' }} />
        )}
        <b style={{ fontSize: 13.5, minWidth: 0 }}>{t.ten}</b>
      </div>
      <div style={{ fontSize: 17, fontWeight: 900, color: t.soCap > 0 ? '#b7431e' : '#b9a898', marginTop: 4 }}>
        {chuKhay(t.soCap)}
      </div>
      <div style={{ fontSize: 11, color: '#806a58' }}>{t.soCap} cặp · {t.soCap * BANH_DON_MOI_CAP} bánh đơn</div>
      {dangNhap === t.ma ? (
        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', gap: 6 }}>
            <input style={{ ...o.o, minHeight: 40 }} inputMode="numeric" placeholder="Khay" value={soKhay} onChange={(e) => setSoKhay(e.target.value)} />
            <input style={{ ...o.o, minHeight: 40 }} inputMode="numeric" placeholder="Cặp lẻ" value={soCapLe} onChange={(e) => setSoCapLe(e.target.value)} />
          </div>
          {/* Ngày SX/HSD — bắt buộc bổ sung cho macaron MÀU ĐƠN (yêu cầu
              04/09/2026), không bắt với khay mix trộn sẵn (không có lô SX
              riêng, đã ghép từ nhiều màu/nhiều mẻ khác nhau). */}
          {t.loai === 'mau_don' && (
            <div style={{ display: 'flex', gap: 6 }}>
              <label style={{ flex: 1 }}>
                <span style={{ ...o.nhan, marginBottom: 2 }}>Ngày SX</span>
                <input type="date" style={{ ...o.o, minHeight: 40, fontSize: 12.5, padding: '0 6px' }} value={ngaySx} onChange={(e) => setNgaySx(e.target.value)} />
              </label>
              <label style={{ flex: 1 }}>
                <span style={{ ...o.nhan, marginBottom: 2 }}>Hạn SD</span>
                <input type="date" style={{ ...o.o, minHeight: 40, fontSize: 12.5, padding: '0 6px' }} value={hanSuDung} onChange={(e) => setHanSuDung(e.target.value)} />
              </label>
            </div>
          )}
          <input style={{ ...o.o, minHeight: 40 }} placeholder="Ghi chú (không bắt buộc)" value={ghiChu} onChange={(e) => setGhiChu(e.target.value)} />
          <div style={{ display: 'flex', gap: 6 }}>
            <button disabled={luu} onClick={nhap} style={{ ...o.nut, minHeight: 40, fontSize: 13 }}>{luu ? 'Đang lưu…' : '✓ Nhập'}</button>
            <button disabled={luu} onClick={() => setDangNhap(null)} style={{ ...o.nut, minHeight: 40, fontSize: 13, background: '#fff', color: '#806a58', border: '1px solid #e2cdb6' }}>Huỷ</button>
          </div>
        </div>
      ) : (
        <button onClick={() => moNhap(t.ma)} style={{ marginTop: 8, width: '100%', minHeight: 36, borderRadius: 10, border: '1.5px dashed #e2cdb6', background: 'transparent', color: '#b7431e', fontWeight: 800, fontSize: 12, cursor: 'pointer' }}>
          ＋ Nhập kho
        </button>
      )}
    </div>
  );

  return (
    <>
      <div style={{ ...o.the, background: '#fff7ec', marginBottom: 12 }}>
        <div style={{ fontSize: 11.5, fontWeight: 900, color: '#806a58', textTransform: 'uppercase' }}>Tổng tồn màu đơn</div>
        <div style={{ fontSize: 24, fontWeight: 900, color: '#b7431e' }}>{chuKhay(tongCapMauDon)}</div>
        <div style={{ fontSize: 11.5, color: '#806a58' }}>{tongCapMauDon} cặp · {tongCapMauDon * BANH_DON_MOI_CAP} bánh đơn</div>
      </div>

      <div style={{ fontSize: 12, fontWeight: 900, color: '#806a58', textTransform: 'uppercase', margin: '4px 0 8px' }}>
        Màu đơn ({mauDon.length})
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 8 }}>
        {mauDon.map(veThe)}
      </div>

      <div style={{ fontSize: 12, fontWeight: 900, color: '#806a58', textTransform: 'uppercase', margin: '18px 0 8px' }}>
        Khay mix trộn sẵn ({cacMix.length})
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 8 }}>
        {cacMix.map(veThe)}
      </div>
    </>
  );
}

// ── TAB 2: TRỘN MÀU ────────────────────────────────────────────────────────
function TabTronMau({ mauDon, cacMix, onXong, onLoi }) {
  const [maMix, setMaMix] = useState(cacMix[0]?.ma || 'mix_12');
  const [soKhay, setSoKhay] = useState('1');
  const [kieu, setKieu] = useState('ton_kho');
  const [orderCode, setOrderCode] = useState('');
  const [ghiChu, setGhiChu] = useState('');
  const [dong, setDong] = useState({});   // { ma: { cap, hao } }
  const [luu, setLuu] = useState(false);

  const mix = cacMix.find((m) => m.ma === maMix);
  const soMau = mix?.so_mau || 12;

  // Gợi ý chia đều — CHỈ gợi ý, thủ kho sửa từng màu được (36 không chia hết
  // cho 10 màu nên không ép công thức cứng).
  const dienGoiY = () => {
    const chia = goiYChiaDeu(soMau, Number(soKhay) || 1);
    const moi = {};
    mauDon.forEach((m, i) => { moi[m.ma] = { cap: i < soMau ? String(chia[i]) : '', hao: '' }; });
    setDong(moi);
  };
  useEffect(() => { dienGoiY(); }, [maMix, soKhay]); // eslint-disable-line react-hooks/exhaustive-deps

  const dat = (ma, truong, gt) => setDong((cu) => ({ ...cu, [ma]: { ...(cu[ma] || {}), [truong]: gt } }));

  const tongDung = mauDon.reduce((s, m) => s + (Number(dong[m.ma]?.cap) || 0), 0);
  const tongHao = mauDon.reduce((s, m) => s + (Number(dong[m.ma]?.hao) || 0), 0);
  const canCo = CAP_MOI_KHAY * (Number(soKhay) || 0);

  const tron = async () => {
    const chiTiet = mauDon
      .map((m) => ({ ma: m.ma, cap: Number(dong[m.ma]?.cap) || 0, hao_hut: Number(dong[m.ma]?.hao) || 0 }))
      .filter((d) => d.cap > 0 || d.hao_hut > 0);
    if (!chiTiet.length) { onLoi('Chưa nhập số cặp màu nào.'); return; }
    if (kieu === 'theo_don' && !orderCode.trim()) { onLoi('Trộn theo đơn thì cần nhập mã đơn.'); return; }
    setLuu(true); onLoi('');
    try {
      const kq = await tronMacaron({
        maMix, soKhay: Number(soKhay) || 1, kieu, chiTiet,
        orderCode: orderCode.trim() || null, ghiChu,
      });
      onXong(kq?.thong_bao || 'Đã trộn xong.');
    } catch (e) { onLoi(e?.message || 'Không trộn được.'); }
    finally { setLuu(false); }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ ...o.the, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ flex: 1 }}>
            <label style={o.nhan}>Loại mix</label>
            <select style={o.o} value={maMix} onChange={(e) => setMaMix(e.target.value)}>
              {cacMix.map((m) => <option key={m.ma} value={m.ma}>{m.ten}</option>)}
            </select>
          </div>
          <div style={{ width: 110 }}>
            <label style={o.nhan}>Số khay</label>
            <input style={o.o} inputMode="numeric" value={soKhay} onChange={(e) => setSoKhay(e.target.value)} />
          </div>
        </div>

        <div>
          <label style={o.nhan}>Kiểu trộn</label>
          <div style={{ display: 'flex', gap: 8 }}>
            {[['ton_kho', '📦 Trộn trước để tồn kho'], ['theo_don', '🚚 Trộn theo đơn (giao thẳng)']].map(([k, ten]) => (
              <button key={k} onClick={() => setKieu(k)} style={{
                flex: 1, minHeight: 42, borderRadius: 12, cursor: 'pointer', fontSize: 12, fontWeight: 800,
                border: kieu === k ? '2px solid #f05c2b' : '1px solid #e2cdb6',
                background: kieu === k ? '#fff1e8' : '#fff', color: kieu === k ? '#b7431e' : '#806a58',
              }}>{ten}</button>
            ))}
          </div>
        </div>

        {kieu === 'theo_don' && (
          <div>
            <label style={o.nhan}>Mã đơn hàng *</label>
            <input style={o.o} value={orderCode} onChange={(e) => setOrderCode(e.target.value)} placeholder="VD: SUMI-20260904-12345" />
          </div>
        )}
      </div>

      <div style={{ ...o.the }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <b style={{ fontSize: 13 }}>Số cặp lấy ra từng màu</b>
          <button onClick={dienGoiY} style={{ border: 0, background: 'none', color: '#b7431e', fontWeight: 800, fontSize: 12, cursor: 'pointer' }}>
            ↻ Gợi ý chia đều
          </button>
        </div>
        <div style={{ fontSize: 11.5, color: '#806a58', marginBottom: 10 }}>
          Cột <b>Hao hụt</b> = số cặp vỡ/móp/không đều khi ghép — bị trừ kho THÊM ngoài số đưa vào khay.
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', gap: 6, fontSize: 10.5, fontWeight: 900, color: '#9a7f68', textTransform: 'uppercase' }}>
            <span style={{ flex: 1 }}>Màu (tồn)</span>
            <span style={{ width: 74, textAlign: 'center' }}>Cặp</span>
            <span style={{ width: 74, textAlign: 'center' }}>Hao hụt</span>
          </div>
          {mauDon.map((m) => {
            const dung = Number(dong[m.ma]?.cap) || 0;
            const hao = Number(dong[m.ma]?.hao) || 0;
            const thieu = dung + hao > m.soCap;
            return (
              <div key={m.ma} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <span style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5 }}>
                  <span style={{ width: 12, height: 12, borderRadius: '50%', flexShrink: 0, background: MAU_HIEN_THI[m.ma] || '#ddd', border: '1px solid rgba(0,0,0,.15)' }} />
                  <span style={{ minWidth: 0 }}>
                    {m.ten}
                    <span style={{ color: thieu ? '#d94a40' : '#9a7f68', fontWeight: thieu ? 900 : 400 }}> · còn {m.soCap}</span>
                  </span>
                </span>
                <input style={{ ...o.o, width: 74, minHeight: 40, textAlign: 'center', borderColor: thieu ? '#f5a99f' : '#e2cdb6' }}
                  inputMode="numeric" value={dong[m.ma]?.cap ?? ''} onChange={(e) => dat(m.ma, 'cap', e.target.value)} />
                <input style={{ ...o.o, width: 74, minHeight: 40, textAlign: 'center', borderColor: hao > 0 ? '#f5a99f' : '#e2cdb6' }}
                  inputMode="numeric" placeholder="0" value={dong[m.ma]?.hao ?? ''} onChange={(e) => dat(m.ma, 'hao', e.target.value)} />
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ ...o.the, background: '#fff7ec' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
          <span>Cặp đưa vào khay</span>
          <b style={{ color: tongDung === canCo ? '#078653' : '#b7431e' }}>{tongDung} / {canCo} cặp</b>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
          <span>Hao hụt</span><b style={{ color: tongHao ? '#d94a40' : '#806a58' }}>{tongHao} cặp</b>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, borderTop: '1px dashed #e2cdb6', paddingTop: 6 }}>
          <span><b>Tổng trừ kho màu đơn</b></span><b style={{ color: '#b7431e' }}>{tongDung + tongHao} cặp</b>
        </div>
        {tongDung !== canCo && (
          <div style={{ fontSize: 11.5, color: '#8b5900', marginTop: 6 }}>
            ⚠️ Tổng cặp đang lệch so với {soKhay || 0} khay ({canCo} cặp) — vẫn trộn được nếu đây đúng thực tế.
          </div>
        )}
      </div>

      <input style={o.o} placeholder="Ghi chú (không bắt buộc)" value={ghiChu} onChange={(e) => setGhiChu(e.target.value)} />
      <button disabled={luu} onClick={tron} style={o.nut}>{luu ? 'Đang trộn…' : '🎨 Chốt trộn màu'}</button>
    </div>
  );
}

// ── TAB 3: KIỂM KÊ & ĐIỀU CHỈNH ────────────────────────────────────────────
function TabKiemKe({ ton, laQuanLy, onXong, onLoi }) {
  const [dem, setDem] = useState({});
  const [ghiChu, setGhiChu] = useState({});
  const [luu, setLuu] = useState('');
  const [lichSu, setLichSu] = useState([]);

  // Sửa 1 dòng "Nhập kho" đã ghi sai — chỉ Quản lý Xưởng 41/Giám đốc, xem
  // RPC sumi_macaron_sua_lo_nhap (migration 202609043000).
  const [dangSua, setDangSua] = useState(null); // id dòng log đang mở form sửa
  const [suaSoCap, setSuaSoCap] = useState('');
  const [suaNgaySx, setSuaNgaySx] = useState('');
  const [suaHanSuDung, setSuaHanSuDung] = useState('');
  const [suaGhiChu, setSuaGhiChu] = useState('');
  const [dangLuuSua, setDangLuuSua] = useState(false);

  const taiLichSu = useCallback(async () => {
    try { setLichSu(await fetchSoGiaoDichMacaron({ limit: 30 })); } catch { setLichSu([]); }
  }, []);
  useEffect(() => { taiLichSu(); }, [taiLichSu]);

  const moSua = (l) => {
    setDangSua(l.id);
    setSuaSoCap(String(l.so_cap_thay_doi ?? ''));
    setSuaNgaySx(l.ngay_sx || '');
    setSuaHanSuDung(l.han_su_dung || '');
    setSuaGhiChu('');
  };

  const luuSua = async (l) => {
    const soCapMoi = Number(suaSoCap);
    if (!suaSoCap || Number.isNaN(soCapMoi) || soCapMoi <= 0) { onLoi('Số cặp phải lớn hơn 0.'); return; }
    if (suaNgaySx && suaHanSuDung && suaHanSuDung < suaNgaySx) { onLoi('Hạn sử dụng không được sớm hơn Ngày sản xuất.'); return; }
    if (!suaGhiChu.trim()) { onLoi('Bắt buộc ghi lý do sửa.'); return; }
    setDangLuuSua(true); onLoi('');
    try {
      const kq = await suaLoNhapMacaron({
        logId: l.id, soCapMoi, ngaySx: suaNgaySx || null, hanSuDung: suaHanSuDung || null, ghiChu: suaGhiChu.trim(),
      });
      setDangSua(null);
      onXong(kq?.thong_bao || 'Đã sửa dòng nhập kho.');
      taiLichSu();
    } catch (e) { onLoi(e?.message || 'Không sửa được dòng nhập kho.'); }
    finally { setDangLuuSua(false); }
  };

  const luuMot = async (t) => {
    const thucTe = Number(dem[t.ma]);
    if (dem[t.ma] === '' || dem[t.ma] == null || Number.isNaN(thucTe)) { onLoi('Nhập số cặp đếm được.'); return; }
    if (!String(ghiChu[t.ma] || '').trim()) { onLoi('Bắt buộc ghi lý do điều chỉnh.'); return; }
    setLuu(t.ma); onLoi('');
    try {
      const kq = await kiemKeMacaron({ ma: t.ma, soCapThucTe: thucTe, ghiChu: ghiChu[t.ma] });
      setDem((c) => ({ ...c, [t.ma]: '' })); setGhiChu((c) => ({ ...c, [t.ma]: '' }));
      onXong(kq?.thong_bao || 'Đã điều chỉnh.');
      taiLichSu();
    } catch (e) { onLoi(e?.message || 'Không điều chỉnh được.'); }
    finally { setLuu(''); }
  };

  const TEN_GD = {
    nhap: '📥 Nhập kho', xuat: '📤 Xuất kho', mix_tru: '🎨 Trộn — lấy ra',
    mix_nhap: '🎨 Trộn — nhập khay', hao_hut: '💔 Hao hụt', kiem_ke: '📋 Kiểm kê',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {!laQuanLy && (
        <div style={{ ...o.the, background: '#fff7ec', fontSize: 12.5, color: '#8b5900', fontWeight: 700 }}>
          🔒 Chỉ Quản lý Xưởng 41 hoặc Giám đốc mới điều chỉnh được tồn kho. Bạn vẫn xem được số tồn và lịch sử bên dưới.
        </div>
      )}

      {laQuanLy && (
        <div style={{ ...o.the }}>
          <b style={{ fontSize: 13 }}>Nhập số đếm THỰC TẾ trên kệ (theo cặp)</b>
          <div style={{ fontSize: 11.5, color: '#806a58', margin: '4px 0 10px' }}>
            Chênh lệch với số hệ thống sẽ được ghi thành 1 dòng "Kiểm kê" trong sổ — không xoá lịch sử cũ.
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {ton.map((t) => {
              const thucTe = dem[t.ma] === '' || dem[t.ma] == null ? null : Number(dem[t.ma]);
              const lech = thucTe == null || Number.isNaN(thucTe) ? null : thucTe - t.soCap;
              return (
                <div key={t.ma} style={{ borderTop: '1px dashed #eadcca', paddingTop: 8 }}>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <span style={{ flex: 1, minWidth: 0, fontSize: 12.5 }}>
                      <b>{t.ten}</b>
                      <span style={{ color: '#9a7f68' }}> · hệ thống {t.soCap} cặp</span>
                    </span>
                    <input style={{ ...o.o, width: 90, minHeight: 40, textAlign: 'center' }} inputMode="numeric"
                      placeholder="Đếm" value={dem[t.ma] ?? ''} onChange={(e) => setDem((c) => ({ ...c, [t.ma]: e.target.value }))} />
                  </div>
                  {lech != null && lech !== 0 && (
                    <div style={{ fontSize: 11.5, fontWeight: 800, color: lech > 0 ? '#078653' : '#d94a40', marginTop: 4 }}>
                      {lech > 0 ? `Thừa +${lech} cặp` : `Thiếu ${lech} cặp`}
                    </div>
                  )}
                  {lech != null && lech !== 0 && (
                    <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                      <input style={{ ...o.o, minHeight: 40 }} placeholder="Lý do *" value={ghiChu[t.ma] ?? ''}
                        onChange={(e) => setGhiChu((c) => ({ ...c, [t.ma]: e.target.value }))} />
                      <button disabled={luu === t.ma} onClick={() => luuMot(t)}
                        style={{ ...o.nut, width: 'auto', minHeight: 40, padding: '0 14px', fontSize: 13 }}>
                        {luu === t.ma ? '…' : 'Lưu'}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div style={{ ...o.the }}>
        <b style={{ fontSize: 13 }}>📋 Tổng kho chi tiết — Sổ giao dịch gần đây</b>
        <div style={{ fontSize: 11, color: '#9a7f68', margin: '2px 0 8px' }}>
          Mỗi lượt nhập ghi rõ người nhập, Ngày SX/HSD (macaron màu đơn). Quản lý bấm "✏️ Sửa" để chỉnh lại dòng nhập ghi sai — tồn kho tự cập nhật theo.
        </div>
        {lichSu.length === 0 && <div style={{ fontSize: 12.5, color: '#806a58', marginTop: 8 }}>Chưa có giao dịch nào.</div>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
          {lichSu.map((l) => (
            <div key={l.id} style={{ borderTop: '1px dashed #eadcca', paddingTop: 6, fontSize: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <span><b>{TEN_GD[l.loai_gd] || l.loai_gd}</b> · {l.ma}{l.da_sua && <span style={{ color: '#b7431e', fontWeight: 900 }}> · đã sửa</span>}</span>
                <b style={{ color: Number(l.so_cap_thay_doi) >= 0 ? '#078653' : '#d94a40', whiteSpace: 'nowrap' }}>
                  {Number(l.so_cap_thay_doi) > 0 ? '+' : ''}{l.so_cap_thay_doi} cặp
                </b>
              </div>
              <div style={{ color: '#9a7f68', fontSize: 11 }}>
                {l.so_cap_truoc} → {l.so_cap_sau} cặp
                {/* Người nhập — bắt buộc phải thấy được ai đã nhập lô này (yêu cầu 04/09/2026) */}
                {l.staff_name ? ` · 👤 ${l.staff_name}` : ''}
                {l.order_code ? ` · ${l.order_code}` : ''}
                {' · '}{new Date(l.created_at).toLocaleString('vi-VN')}
              </div>
              {(l.ngay_sx || l.han_su_dung) && (
                <div style={{ color: '#0284c7', fontSize: 11, fontWeight: 700 }}>
                  {l.ngay_sx ? `SX ${new Date(l.ngay_sx).toLocaleDateString('vi-VN')}` : ''}
                  {l.ngay_sx && l.han_su_dung ? ' · ' : ''}
                  {l.han_su_dung ? `HSD ${new Date(l.han_su_dung).toLocaleDateString('vi-VN')}` : ''}
                </div>
              )}
              {l.ghi_chu && <div style={{ color: '#806a58', fontSize: 11 }}>{l.ghi_chu}</div>}
              {l.da_sua && l.sua_boi_ten && (
                <div style={{ color: '#b7431e', fontSize: 10.5 }}>
                  Số cặp gốc trước sửa: {l.so_cap_thay_doi_goc} · sửa bởi {l.sua_boi_ten} lúc {new Date(l.sua_luc).toLocaleString('vi-VN')}
                </div>
              )}

              {laQuanLy && l.loai_gd === 'nhap' && (
                dangSua === l.id ? (
                  <div style={{ marginTop: 6, padding: 8, background: '#fff7ec', borderRadius: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <label style={{ flex: 1 }}>
                        <span style={{ ...o.nhan, marginBottom: 2 }}>Số cặp</span>
                        <input style={{ ...o.o, minHeight: 38, fontSize: 12.5 }} inputMode="numeric" value={suaSoCap} onChange={(e) => setSuaSoCap(e.target.value)} />
                      </label>
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <label style={{ flex: 1 }}>
                        <span style={{ ...o.nhan, marginBottom: 2 }}>Ngày SX</span>
                        <input type="date" style={{ ...o.o, minHeight: 38, fontSize: 12.5, padding: '0 6px' }} value={suaNgaySx} onChange={(e) => setSuaNgaySx(e.target.value)} />
                      </label>
                      <label style={{ flex: 1 }}>
                        <span style={{ ...o.nhan, marginBottom: 2 }}>Hạn SD</span>
                        <input type="date" style={{ ...o.o, minHeight: 38, fontSize: 12.5, padding: '0 6px' }} value={suaHanSuDung} onChange={(e) => setSuaHanSuDung(e.target.value)} />
                      </label>
                    </div>
                    <input style={{ ...o.o, minHeight: 38, fontSize: 12.5 }} placeholder="Lý do sửa *" value={suaGhiChu} onChange={(e) => setSuaGhiChu(e.target.value)} />
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button disabled={dangLuuSua} onClick={() => luuSua(l)} style={{ ...o.nut, minHeight: 36, fontSize: 12.5 }}>{dangLuuSua ? 'Đang lưu…' : '✓ Lưu sửa'}</button>
                      <button disabled={dangLuuSua} onClick={() => setDangSua(null)} style={{ ...o.nut, minHeight: 36, fontSize: 12.5, background: '#fff', color: '#806a58', border: '1px solid #e2cdb6' }}>Huỷ</button>
                    </div>
                  </div>
                ) : (
                  <button onClick={() => moSua(l)} style={{ marginTop: 6, border: 0, background: 'none', color: '#b7431e', fontWeight: 800, fontSize: 11.5, cursor: 'pointer', padding: 0 }}>
                    ✏️ Sửa dòng nhập này
                  </button>
                )
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
