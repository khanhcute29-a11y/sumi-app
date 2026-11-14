import React, { useEffect, useMemo, useState } from 'react';
import { X, RefreshCw, Camera, Search } from 'lucide-react';
import { supabase } from '../../../lib/supabaseClient';
import { goi, chuLoi, anhVietQr, noiDungCk, NGAN_HANG, maMoi, tachId, linkAnh } from './posThat';
import { locXep } from './banHangQuayLogic';

// Các hộp thoại chỉ có ở chế độ CHẠY THẬT (ca, duyệt, chuyển khoản, thiết lập, đặt cọc, nhận hàng, báo cáo, nhật ký).
const so = (n) => Math.round(Number(n) || 0).toLocaleString('en-US');
const soTien = (v) => String(v).replace(/\D/g, '');
const ngayGio = (t) => new Date(t).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });
const PT = { tien_mat: 'Tiền mặt', chuyen_khoan: 'Chuyển khoản', the: 'Thẻ' };

export function HopT({ tieuDe, onDong, children, chan, rong }) {
  return (
    <div className="bhq-man" onClick={onDong}>
      <div className={`bhq-hop ${rong ? 'rong' : ''}`} onClick={(e) => e.stopPropagation()} role="dialog" aria-label={tieuDe}>
        <div className="bhq-hop-dau"><b>{tieuDe}</b>{onDong && <button type="button" onClick={onDong} aria-label="Đóng"><X size={20} /></button>}</div>
        <div className="bhq-hop-than">{children}</div>
        {chan && <div className="bhq-hop-chan">{chan}</div>}
      </div>
    </div>
  );
}

const Loi = ({ chu }) => (chu ? <p className="kv-loi">{chu}</p> : null);

// ── Mở ca: đếm tiền lẻ trong két trước khi bán ──
export function MoCa({ chiNhanh, nguoi, onMo, onVeApp, onDong }) {
  const [tien, setTien] = useState('');
  const [dang, setDang] = useState(false);
  const [loi, setLoi] = useState('');
  const mo = async () => {
    setDang(true); setLoi('');
    try { onMo(await goi('pos_mo_ca', { p_store: chiNhanh, p_opening_cash: Number(tien) || 0 })); } catch (e) { setLoi(chuLoi(e)); setDang(false); }
  };
  return (
    <HopT tieuDe={`Mở ca · ${chiNhanh}`} onDong={onDong}
      chan={<><button type="button" className="bhq-nut phu" onClick={onVeApp}>Về app Sumi</button><button type="button" className="bhq-nut chinh" disabled={dang} onClick={mo}>{dang ? 'Đang mở…' : 'Bắt đầu bán'}</button></>}>
      <p className="bhq-ghi">Chào {nguoi}. Đếm tiền lẻ đang có trong két rồi nhập vào — cuối ca máy so với số này để biết thiếu hay dư.</p>
      <label className="bhq-nhan">Tiền mặt đầu ca<input className="bhq-o lon" autoFocus inputMode="numeric" value={tien ? so(tien) : ''} placeholder="0" onChange={(e) => setTien(soTien(e.target.value))} onKeyDown={(e) => { if (e.key === 'Enter') mo(); }} /></label>
      <Loi chu={loi} />
    </HopT>
  );
}

// ── Nhân viên xin Quản lý duyệt (giảm giá vượt mức / huỷ hoá đơn ca cũ) — chờ ngay trên máy ──
export function XinDuyet({ loai, chiNhanh, payload, onDuoc, onDong }) {
  const [id, setId] = useState(null);
  const [tt, setTt] = useState('');
  const [loi, setLoi] = useState('');
  useEffect(() => {
    let huy = false;
    goi('pos_xin_duyet', { p_kind: loai, p_store: chiNhanh, p_payload: payload }).then((x) => { if (!huy) { setId(x); setTt('cho'); } }).catch((e) => setLoi(chuLoi(e)));
    return () => { huy = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!id || tt !== 'cho') return undefined;
    const t = setInterval(async () => {
      const { data } = await supabase.from('pos_approvals').select('status, decided_by_name').eq('id', id).maybeSingle();
      if (data?.status === 'dong_y') { setTt('dong_y'); clearInterval(t); onDuoc(id, data.decided_by_name); }
      else if (data?.status === 'tu_choi') { setTt('tu_choi'); clearInterval(t); setLoi(`${data.decided_by_name || 'Quản lý'} không đồng ý.`); }
    }, 3000);
    return () => clearInterval(t);
  }, [id, tt]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <HopT tieuDe={loai === 'giam_gia' ? 'Xin duyệt giảm giá' : 'Xin duyệt huỷ hoá đơn'} onDong={onDong}
      chan={<button type="button" className="bhq-nut phu" onClick={onDong}>{tt === 'cho' ? 'Thôi, không xin nữa' : 'Đóng'}</button>}>
      <div className="bhq-can-tra">{payload.mo_ta}</div>
      {tt === 'cho' && <p className="bhq-ghi"><RefreshCw size={14} className="quay" /> Đã báo Quản lý / Giám đốc. Đợi họ bấm <b>Đồng ý</b> trên điện thoại — máy sẽ tự làm tiếp.</p>}
      {!tt && !loi && <p className="bhq-ghi">Đang gửi yêu cầu…</p>}
      <Loi chu={loi} />
    </HopT>
  );
}

// ── Việc chờ của Quản lý / GĐ / Kế toán ──
export function ViecCho({ viec, cap, laKT, onTaiLai, onDong }) {
  const [tab, setTab] = useState(viec.duyet.length ? 'duyet' : viec.ck.length ? 'ck' : 'ca');
  const [dang, setDang] = useState(null);
  const [loi, setLoi] = useState('');
  const lam = async (khoa, ham, thamSo) => {
    setDang(khoa); setLoi('');
    try { await goi(ham, thamSo); await onTaiLai(); } catch (e) { setLoi(chuLoi(e)); }
    setDang(null);
  };
  const tabs = [
    (cap === 'gd' || cap === 'ql') && ['duyet', `Chờ duyệt (${viec.duyet.length})`],
    ['ck', `Chuyển khoản chờ xác nhận (${viec.ck.length})`],
    (cap === 'gd' || cap === 'ql') && ['ca', `Duyệt ca (${viec.ca.length})`],
  ].filter(Boolean);
  return (
    <HopT tieuDe="Việc chờ xử lý" onDong={onDong} rong>
      <nav className="bhq-tab">{tabs.map(([k, l]) => <button key={k} type="button" className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}</nav>
      <Loi chu={loi} />
      {tab === 'duyet' && (viec.duyet.length ? viec.duyet.map((a) => (
        <div key={a.id} className="bhq-the">
          <div><b>{a.kind === 'giam_gia' ? '🏷️ Giảm giá' : a.kind === 'huy_hd' ? '🧾 Huỷ hoá đơn' : '📦 Huỷ phiếu'}</b> · {a.requested_by_name} · {a.store_location} · {ngayGio(a.created_at)}</div>
          <div>{a.payload?.mo_ta}</div>
          <div className="hang">
            <button type="button" className="bhq-nut phu nho" disabled={!!dang} onClick={() => lam(a.id, 'pos_quyet_duyet', { p_id: a.id, p_dong_y: false })}>Từ chối</button>
            <button type="button" className="bhq-nut chinh nho" disabled={!!dang} onClick={() => lam(a.id, 'pos_quyet_duyet', { p_id: a.id, p_dong_y: true })}>Đồng ý</button>
          </div>
        </div>
      )) : <p className="bhq-rong">Không có yêu cầu nào.</p>)}
      {tab === 'ck' && (
        <>
          <p className="bhq-ghi">Mở app ngân hàng, dò nội dung <b>SUMI …</b> hoặc số tiền + giờ. Thấy tiền rồi mới bấm "Đã về". Không thấy → bấm "Không thấy", Giám đốc được báo ngay.</p>
          {viec.ck.length ? viec.ck.map((h) => (
            <div key={h.id} className="bhq-the">
              <div><b>{h.code}</b> · {h.store_location} · {ngayGio(h.created_at)} · thu ngân {h.cashier_name}</div>
              <div>Nội dung: <b>{noiDungCk(h.id)}</b>{h.customer_name && h.customer_name !== 'Khách lẻ' ? ` · ${h.customer_name}` : ''}</div>
              <div className="hang"><b>{so(h.paid_amount)}</b>
                <span>
                  <button type="button" className="bhq-nut phu nho" disabled={!!dang} onClick={() => lam(h.id, 'pos_xac_nhan_ck', { p_id: h.id, p_da_ve: false })}>Không thấy</button>{' '}
                  <button type="button" className="bhq-nut chinh nho" disabled={!!dang} onClick={() => lam(h.id, 'pos_xac_nhan_ck', { p_id: h.id, p_da_ve: true })}>Đã về</button>
                </span></div>
            </div>
          )) : <p className="bhq-rong">Không còn chuyển khoản nào chờ.</p>}
        </>
      )}
      {tab === 'ca' && (viec.ca.length ? viec.ca.map((c) => (
        <div key={c.id} className={`bhq-the ${Number(c.diff) < 0 ? 'no-do' : Number(c.diff) > 0 ? 'no-vang' : ''}`}>
          <div><b>{c.code}</b> · {c.store_location} · {c.closed_by_name} · đóng {ngayGio(c.closed_at)}</div>
          <div>Hệ thống {so(c.expected_cash)} · đếm được {so(c.counted_cash)} · <b>{Number(c.diff) > 0 ? '+' : ''}{so(c.diff)}</b>{c.note ? ` · "${c.note}"` : ''}</div>
          <div className="hang"><span /><button type="button" className="bhq-nut chinh nho" disabled={!!dang} onClick={() => lam(c.id, 'pos_duyet_ca', { p_shift: c.id, p_note: null })}>Đã kiểm, duyệt ca</button></div>
        </div>
      )) : <p className="bhq-rong">Không còn ca nào chờ duyệt.</p>)}
      {!laKT && cap === 'nv' && <p className="bhq-ghi">Bạn không có việc nào phải duyệt.</p>}
    </HopT>
  );
}

// ── Mã VietQR có sẵn số tiền + nội dung ──
export function QrChuyenKhoan({ caiDat, tien, hdId, dt = false }) {
  const [anh, setAnh] = useState(null);
  const nd = noiDungCk(hdId);
  useEffect(() => {
    let huy = false;
    if (caiDat?.bank_bin && caiDat?.bank_account && tien > 0) {
      anhVietQr({ bin: caiDat.bank_bin, soTk: caiDat.bank_account, tien, noiDung: nd }).then((u) => { if (!huy) setAnh(u); }).catch(() => setAnh(null));
    } else setAnh(null);
    return () => { huy = true; };
  }, [caiDat?.bank_bin, caiDat?.bank_account, tien, nd]);
  if (!caiDat?.bank_bin || !caiDat?.bank_account) {
    return <div className="kv-qr">Chưa cài tài khoản nhận tiền<small>Giám đốc vào ☰ → Thiết lập quầy để nhập ngân hàng + số tài khoản. Tiền chuyển khoản sẽ chờ Quản lý / Kế toán xác nhận đã về.</small></div>;
  }
  const nh = NGAN_HANG.find(([b]) => b === caiDat.bank_bin)?.[1] || caiDat.bank_bin;
  // Điện thoại — như app KiotViet: dòng "Ngân hàng - số TK / tên chủ TK", dưới là thẻ VietQR to.
  if (dt) {
    return (
      <div className="kvm-ck">
        <div className="kvm-ck-tk"><b>{nh} - {caiDat.bank_account}</b>{caiDat.bank_account_name ? <span>{caiDat.bank_account_name}</span> : null}</div>
        <div className="kvm-ck-the">
          <div className="kvm-vietqr" aria-hidden="true"><i>V</i>IET<b>QR</b></div>
          {anh ? <img src={anh} alt={`Mã QR chuyển ${so(tien)}`} width={240} height={240} /> : <span className="kv-qr-cho">Đang tạo mã…</span>}
          <span className="kvm-ck-tien">{so(tien)}</span>
          <small>Nội dung: <b>{nd}</b></small>
        </div>
        <small className="kvm-ck-ghi">Khách quét mã là đúng số tiền. Quản lý / Kế toán xác nhận tiền về sau.</small>
      </div>
    );
  }
  return (
    <div className="kv-qr co">
      {anh ? <img src={anh} alt={`Mã QR chuyển ${so(tien)}`} width={180} height={180} /> : <span className="kv-qr-cho">Đang tạo mã…</span>}
      <div><b>{so(tien)}</b><small>{nh} · {caiDat.bank_account_name || ''}</small><small>Nội dung: <b>{nd}</b></small>
        <small>Khách quét mã là đúng số tiền. Quản lý / Kế toán xác nhận tiền về sau.</small></div>
    </div>
  );
}

// ── Thiết lập quầy (Giám đốc) ──
export function ThietLapQuay({ chiNhanh, caiDat, matHang, bangGia, onLuu, onDong }) {
  const [tab, setTab] = useState('chung');
  const c = caiDat || {};
  const [f, setF] = useState({
    staff_discount_pct: c.staff_discount_pct ?? 10, eod_discount_pct: c.eod_discount_pct ?? 30, eod_from: String(c.eod_from || '20:00').slice(0, 5),
    bank_bin: c.bank_bin || '', bank_account: c.bank_account || '', bank_account_name: c.bank_account_name || '',
    points_enabled: !!c.points_enabled, points_per_amount: c.points_per_amount ?? 10000, point_value: c.point_value ?? 100,
    debt_limit: c.debt_limit ?? 2000000, debt_days: c.debt_days ?? 30,
  });
  const [dang, setDang] = useState(false);
  const [loi, setLoi] = useState('');
  const [ok, setOk] = useState('');
  const dat = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  const luuChung = async () => {
    setDang(true); setLoi(''); setOk('');
    try {
      await goi('pos_luu_thiet_lap', { p_store: chiNhanh, p: { ...f, staff_discount_pct: Number(f.staff_discount_pct), eod_discount_pct: Number(f.eod_discount_pct),
        points_per_amount: Number(soTien(f.points_per_amount)), point_value: Number(soTien(f.point_value)), debt_limit: Number(soTien(f.debt_limit)), debt_days: Number(f.debt_days) } });
      setOk('Đã lưu'); await onLuu();
    } catch (e) { setLoi(chuLoi(e)); }
    setDang(false);
  };
  return (
    <HopT tieuDe={`Thiết lập quầy · ${chiNhanh}`} onDong={onDong} rong
      chan={tab === 'chung' ? <button type="button" className="bhq-nut chinh" disabled={dang} onClick={luuChung}>{dang ? 'Đang lưu…' : 'Lưu thiết lập'}</button> : null}>
      <nav className="bhq-tab">{[['chung', 'Chung'], ['gia_von', 'Giá vốn'], ['bang_gia', 'Bảng giá theo kênh']].map(([k, l]) => <button key={k} type="button" className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}</nav>
      {tab === 'chung' && (
        <div className="tlq">
          <h4>Giảm giá</h4>
          <label className="bhq-nhan">Nhân viên được tự giảm tối đa (%)<input className="bhq-o" inputMode="decimal" value={f.staff_discount_pct} onChange={dat('staff_discount_pct')} /></label>
          <p className="bhq-ghi">Giảm quá mức này thì máy bắt "Xin duyệt" — Quản lý / Giám đốc bấm Đồng ý trên điện thoại.</p>
          <div className="tlq-2">
            <label className="bhq-nhan">Giảm giá cuối ngày (%)<input className="bhq-o" inputMode="decimal" value={f.eod_discount_pct} onChange={dat('eod_discount_pct')} /></label>
            <label className="bhq-nhan">Bắt đầu từ<input className="bhq-o" type="time" value={f.eod_from} onChange={dat('eod_from')} /></label>
          </div>
          <h4>Tài khoản nhận chuyển khoản (in lên mã QR)</h4>
          <label className="bhq-nhan">Ngân hàng<select className="bhq-o" value={f.bank_bin} onChange={dat('bank_bin')}><option value="">Chọn ngân hàng</option>{NGAN_HANG.map(([b, t]) => <option key={b} value={b}>{t}</option>)}</select></label>
          <div className="tlq-2">
            <label className="bhq-nhan">Số tài khoản<input className="bhq-o" inputMode="numeric" value={f.bank_account} onChange={dat('bank_account')} autoComplete="off" /></label>
            <label className="bhq-nhan">Tên chủ tài khoản<input className="bhq-o" value={f.bank_account_name} onChange={dat('bank_account_name')} /></label>
          </div>
          <h4>Công nợ</h4>
          <div className="tlq-2">
            <label className="bhq-nhan">Nhân viên cho nợ tối đa mỗi khách<input className="bhq-o" inputMode="numeric" value={so(soTien(f.debt_limit))} onChange={dat('debt_limit')} /></label>
            <label className="bhq-nhan">Hạn trả (ngày)<input className="bhq-o" inputMode="numeric" value={f.debt_days} onChange={dat('debt_days')} /></label>
          </div>
          <h4>Khách thân thiết</h4>
          <label className="kv-cong-tac"><span>Tích điểm cho khách có tên + SĐT</span><input type="checkbox" checked={f.points_enabled} onChange={dat('points_enabled')} /><i /></label>
          {f.points_enabled && (
            <div className="tlq-2">
              <label className="bhq-nhan">Mỗi bao nhiêu tiền được 1 điểm<input className="bhq-o" inputMode="numeric" value={so(soTien(f.points_per_amount))} onChange={dat('points_per_amount')} /></label>
              <label className="bhq-nhan">1 điểm trừ được (đồng)<input className="bhq-o" inputMode="numeric" value={so(soTien(f.point_value))} onChange={dat('point_value')} /></label>
            </div>
          )}
          <Loi chu={loi} />{ok && <p className="bhq-ok">{ok}</p>}
        </div>
      )}
      {tab === 'gia_von' && <GiaVon matHang={matHang} />}
      {tab === 'bang_gia' && <BangGia matHang={matHang} bangGia={bangGia} onLuu={onLuu} />}
    </HopT>
  );
}

function GiaVon({ matHang }) {
  const [gv, setGv] = useState({});
  const [sua, setSua] = useState({});
  const [q, setQ] = useState('');
  const [loi, setLoi] = useState('');
  const [dang, setDang] = useState(false);
  useEffect(() => {
    supabase.from('pos_product_costs').select('*').then(({ data }) => {
      const m = {};
      for (const r of data || []) { const h = matHang.find((x) => { const t = tachId(x); return t.product_id === r.product_id && (t.variant_id || null) === (r.variant_id || null); }); if (h) m[h.ma] = Number(r.cost); }
      setGv(m);
    });
  }, [matHang]);
  const ds = locXep(matHang, (m) => `${m.ma} ${m.ten} ${m.size}`, q, 80);
  const luu = async () => {
    setDang(true); setLoi('');
    try {
      for (const [ma, v] of Object.entries(sua)) {
        const t = tachId(matHang.find((m) => m.ma === ma));
        await goi('pos_luu_gia_von', { p_product: t.product_id, p_variant: t.variant_id, p_cost: Number(v) || 0 });
      }
      setGv((x) => ({ ...x, ...Object.fromEntries(Object.entries(sua).map(([k, v]) => [k, Number(v) || 0])) })); setSua({});
    } catch (e) { setLoi(chuLoi(e)); }
    setDang(false);
  };
  const chuaCo = matHang.filter((m) => gv[m.ma] == null).length;
  return (
    <div>
      <p className="bhq-ghi">Chỉ Giám đốc thấy. Dùng để tính lãi gộp và giá trị hàng huỷ. {chuaCo ? <b>{chuaCo} món chưa có giá vốn.</b> : 'Mọi món đã có giá vốn.'}</p>
      <label className="bhq-tim"><Search size={16} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm món" /></label>
      <div className="tlq-ds">
        {ds.map((m) => (
          <div key={m.ma} className="tlq-dong"><span>{m.ten}{m.size ? ` - ${m.size}` : ''}<small>Giá bán {so(m.gia)}</small></span>
            <input className="bhq-o" inputMode="numeric" placeholder="Chưa có" value={sua[m.ma] != null ? so(sua[m.ma]) : gv[m.ma] != null ? so(gv[m.ma]) : ''}
              onChange={(e) => setSua((x) => ({ ...x, [m.ma]: soTien(e.target.value) }))} /></div>
        ))}
      </div>
      <Loi chu={loi} />
      <button type="button" className="bhq-nut chinh" disabled={dang || !Object.keys(sua).length} onClick={luu}>{dang ? 'Đang lưu…' : `Lưu ${Object.keys(sua).length || ''} giá vốn`}</button>
    </div>
  );
}

function BangGia({ matHang, bangGia, onLuu }) {
  const [chon, setChon] = useState(bangGia[0]?.id || 'moi');
  const goc = bangGia.find((b) => b.id === chon);
  const [ten, setTen] = useState(goc?.ten || '');
  const [gia, setGia] = useState(goc?.gia || {});
  const [q, setQ] = useState('');
  const [loi, setLoi] = useState('');
  const [dang, setDang] = useState(false);
  useEffect(() => { const b = bangGia.find((x) => x.id === chon); setTen(b?.ten || ''); setGia(b?.gia || {}); }, [chon, bangGia]);
  const ds = locXep(matHang, (m) => `${m.ma} ${m.ten} ${m.size}`, q, 80);
  const luu = async (active = true) => {
    if (!ten.trim()) { setLoi('Đặt tên bảng giá (VD: GrabFood)'); return; }
    setDang(true); setLoi('');
    try {
      const items = Object.entries(gia).filter(([, v]) => Number(v) > 0).map(([ma, v]) => { const t = tachId(matHang.find((m) => m.ma === ma)); return { product_id: t.product_id, variant_id: t.variant_id, price: Number(v) }; });
      const id = await goi('pos_luu_bang_gia', { p_id: chon === 'moi' ? null : chon, p_name: ten.trim(), p_items: items, p_active: active });
      await onLuu(); setChon(active ? id : 'moi');
    } catch (e) { setLoi(chuLoi(e)); }
    setDang(false);
  };
  return (
    <div>
      <p className="bhq-ghi">Mỗi kênh một bảng giá (VD: GrabFood, ShopeeFood, Khách sỉ). Món để trống = dùng giá chung. Thu ngân chọn bảng giá ở dòng "Bảng giá chung ›" trong giỏ.</p>
      <div className="tlq-2">
        <label className="bhq-nhan">Bảng giá<select className="bhq-o" value={chon} onChange={(e) => setChon(e.target.value)}>{bangGia.map((b) => <option key={b.id} value={b.id}>{b.ten}</option>)}<option value="moi">+ Tạo bảng giá mới</option></select></label>
        <label className="bhq-nhan">Tên<input className="bhq-o" value={ten} onChange={(e) => setTen(e.target.value)} placeholder="VD: GrabFood" /></label>
      </div>
      <label className="bhq-tim"><Search size={16} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm món" /></label>
      <div className="tlq-ds">
        {ds.map((m) => (
          <div key={m.ma} className="tlq-dong"><span>{m.ten}{m.size ? ` - ${m.size}` : ''}<small>Giá chung {so(m.gia)}</small></span>
            <input className="bhq-o" inputMode="numeric" placeholder="Giá chung" value={gia[m.ma] ? so(gia[m.ma]) : ''} onChange={(e) => setGia((x) => ({ ...x, [m.ma]: Number(soTien(e.target.value)) || 0 }))} /></div>
        ))}
      </div>
      <Loi chu={loi} />
      <div className="hang">
        {chon !== 'moi' && <button type="button" className="bhq-nut phu" disabled={dang} onClick={() => luu(false)}>Ngưng dùng bảng này</button>}
        <button type="button" className="bhq-nut chinh" disabled={dang} onClick={() => luu(true)}>{dang ? 'Đang lưu…' : 'Lưu bảng giá'}</button>
      </div>
    </div>
  );
}

// ── Đặt bánh lấy cọc: tạo đơn ở mục Đơn hàng (create_order_v2) + ghi tiền cọc vào két ca ──
const NHOM_KEM = ['banh_kem', 'banh_kem_bap_choco', 'mousse_tiramisu', 'banh_su', 'cupcake'];
export function DatCoc({ hd, tong, chiNhanh, onXong, onDong }) {
  const [ngay, setNgay] = useState(() => { const d = new Date(Date.now() + 86400000); d.setHours(9, 0, 0, 0); const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T09:00`; });
  const [coc, setCoc] = useState(String(Math.round(tong.canTra / 2 / 1000) * 1000));
  const [pt, setPt] = useState('tien_mat');
  const [ghi, setGhi] = useState(hd.ghiChu || '');
  const [dang, setDang] = useState(false);
  const [loi, setLoi] = useState('');
  const coKhach = !!hd.khach?.id;
  const tao = async () => {
    if (!coKhach) { setLoi('Đặt bánh phải có khách (tên + SĐT) — chọn khách trước.'); return; }
    if (!ngay) { setLoi('Chọn ngày giờ khách lấy bánh.'); return; }
    setDang(true); setLoi('');
    try {
      const n = new Date(); const p2 = (x) => String(x).padStart(2, '0');
      const ma = `SUMI-${n.getFullYear()}${p2(n.getMonth() + 1)}${p2(n.getDate())}-${String(n.getHours() * 3600 + n.getMinutes() * 60 + n.getSeconds()).padStart(5, '0')}`;
      const coKem = hd.dong.some((d) => NHOM_KEM.includes(d.danhMuc));
      const items = hd.dong.map((d, i) => { const t = tachId(d.mh || d); return { product_id: t.product_id, name: d.ten, quantity: d.sl, unit: 'cái', unit_price: Math.round(d.sl ? d.thanhTien / d.sl : d.gia), display_order: i, specification: { size: d.size || null, catalog_category: d.danhMuc || null, product_flow: coKem ? 'cake' : 'bakery' } }; });
      const orderId = await goi('create_order_v2', {
        p_idempotency_key: maMoi(), p_order_code: ma, p_order_type: coKem ? 'cake' : 'bakery', p_customer_id: hd.khach.id,
        p_required_at: new Date(ngay).toISOString(), p_fulfillment_method: 'pickup', p_address: null,
        p_note: [`Đặt tại quầy ${chiNhanh}`, ghi.trim()].filter(Boolean).join(' · '), p_confidentiality: 'normal', p_items: items,
        p_ship_fee: 0, p_deposit: Number(coc) || 0, p_payment_method: pt === 'tien_mat' ? 'cash' : 'bank_transfer', p_total: tong.canTra,
        p_discount_amount: tong.giamHd || 0, p_promotion_note: null, p_tax_code: null, p_vat_amount: tong.vat || 0,
      });
      if (Number(coc) > 0) await goi('pos_thu_don', { p_id: maMoi(), p_order: orderId, p_kind: 'coc', p_amount: Number(coc), p_method: pt, p_store: chiNhanh });
      onXong({ ma, coc: Number(coc) || 0, conLai: tong.canTra - (Number(coc) || 0) });
    } catch (e) { setLoi(chuLoi(e)); setDang(false); }
  };
  return (
    <HopT tieuDe="Đặt bánh · lấy cọc" onDong={onDong}
      chan={<button type="button" className="bhq-nut chinh" disabled={dang || !hd.dong.length} onClick={tao}>{dang ? 'Đang tạo đơn…' : `Tạo đơn · thu cọc ${so(coc)}`}</button>}>
      <div className="bhq-bang">
        <div><span>Khách</span><b>{coKhach ? `${hd.khach.name} · ${hd.khach.phone}` : 'Chưa chọn khách'}</b></div>
        <div><span>{tong.soMon} món · tổng đơn</span><b>{so(tong.canTra)}</b></div>
      </div>
      <label className="bhq-nhan">Ngày giờ khách lấy<input className="bhq-o" type="datetime-local" value={ngay} onChange={(e) => setNgay(e.target.value)} /></label>
      <label className="bhq-nhan">Tiền cọc<input className="bhq-o lon" inputMode="numeric" value={coc ? so(coc) : ''} onChange={(e) => setCoc(soTien(e.target.value))} placeholder="0" /></label>
      <div className="bhq-goi">{['tien_mat', 'chuyen_khoan'].map((k) => <button key={k} type="button" className={pt === k ? 'on' : ''} onClick={() => setPt(k)}>{PT[k]}</button>)}</div>
      <label className="bhq-nhan">Ghi chú cho bếp (chữ trên bánh, vị…)<input className="bhq-o" value={ghi} onChange={(e) => setGhi(e.target.value)} /></label>
      <p className="bhq-ghi">Đơn hiện ngay ở mục <b>Đơn hàng</b> của app Sumi, bếp nhận làm như đơn thường. Tiền cọc vào két ca này. Hôm lấy bánh: ☰ → <b>Khách lấy bánh đặt</b> để thu phần còn lại.</p>
      <Loi chu={loi} />
    </HopT>
  );
}

// ── Khách tới lấy bánh đã đặt: tìm đơn, thu phần còn lại ──
export function LayBanhDat({ chiNhanh, onXong, onDong }) {
  const [q, setQ] = useState('');
  const [ds, setDs] = useState([]);
  const [chon, setChon] = useState(null);
  const [pt, setPt] = useState('tien_mat');
  const [dang, setDang] = useState(false);
  const [loi, setLoi] = useState('');
  useEffect(() => {
    if (q.trim().length < 3) { setDs([]); return undefined; }
    const t = setTimeout(() => goi('pos_tim_don', { p_q: q.trim() }).then((x) => setDs(x || [])).catch((e) => setLoi(chuLoi(e))), 300);
    return () => clearTimeout(t);
  }, [q]);
  const con = chon ? Math.max(Number(chon.total) - Number(chon.deposit) - Number(chon.da_thu_quay), 0) : 0;
  const thu = async () => {
    setDang(true); setLoi('');
    try { await goi('pos_thu_don', { p_id: maMoi(), p_order: chon.id, p_kind: 'thu_con_lai', p_amount: con, p_method: pt, p_store: chiNhanh }); onXong(chon, con); } catch (e) { setLoi(chuLoi(e)); setDang(false); }
  };
  return (
    <HopT tieuDe="Khách lấy bánh đặt" onDong={onDong}
      chan={chon ? <><button type="button" className="bhq-nut phu" onClick={() => setChon(null)}>Chọn đơn khác</button>
        <button type="button" className="bhq-nut chinh" disabled={dang} onClick={con > 0 ? thu : () => onXong(chon, 0)}>{con > 0 ? `Thu ${so(con)}` : 'Đã trả đủ — giao bánh'}</button></> : null}>
      {!chon ? <>
        <label className="bhq-tim"><Search size={16} /><input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Mã đơn, SĐT hoặc tên khách" /></label>
        {ds.map((o) => (
          <button key={o.id} type="button" className="bhq-the nut" onClick={() => setChon(o)}>
            <div><b>{o.order_code}</b> · lấy {o.required_at ? ngayGio(o.required_at) : '—'}</div>
            <div>{o.customer_name || 'Khách'} {o.customer_phone ? `· ${o.customer_phone}` : ''}</div>
            <div className="mo">{(o.items || []).map((i) => `${i.name}${i.size ? ` ${i.size}` : ''} ×${i.qty}`).join(', ')}</div>
          </button>
        ))}
        {q.trim().length >= 3 && !ds.length && <p className="bhq-rong">Không tìm thấy đơn.</p>}
      </> : <>
        <div className="bhq-bang">
          <div><span>Đơn</span><b>{chon.order_code}</b></div>
          <div><span>Khách</span><b>{chon.customer_name} {chon.customer_phone}</b></div>
          <div><span>Tổng đơn</span><b>{so(chon.total)}</b></div>
          <div><span>Đã cọc</span><b>−{so(chon.deposit)}</b></div>
          {Number(chon.da_thu_quay) > 0 && <div><span>Đã thu tại quầy</span><b>−{so(chon.da_thu_quay)}</b></div>}
          <div className="lon"><span>Còn phải thu</span><b className="xanh">{so(con)}</b></div>
        </div>
        {con > 0 && <div className="bhq-goi">{['tien_mat', 'chuyen_khoan', 'the'].map((k) => <button key={k} type="button" className={pt === k ? 'on' : ''} onClick={() => setPt(k)}>{PT[k]}</button>)}</div>}
        <p className="bhq-ghi">Trạng thái đơn (đã giao / hoàn thành) vẫn cập nhật ở mục Đơn hàng như cũ.</p>
      </>}
      <Loi chu={loi} />
    </HopT>
  );
}

// ── Quầy nhận hàng bếp giao: nhập số thực nhận từng món ──
export function NhanHang({ phieu, matHang, onNhan, onDong }) {
  const [nhan, setNhan] = useState(() => Object.fromEntries(phieu.dong.map((d) => [d.ma, String(d.sl)])));
  const [dang, setDang] = useState(false);
  const [loi, setLoi] = useState('');
  const lech = phieu.dong.filter((d) => Number(nhan[d.ma]) !== d.sl);
  const xong = async () => {
    setDang(true); setLoi('');
    try {
      const nh = {};
      for (const d of phieu.dong) { const m = matHang.find((x) => x.ma === d.ma); const t = tachId(m); nh[`${t.product_id}:${t.size || ''}`] = Number(nhan[d.ma]) || 0; }
      await onNhan(nh);
    } catch (e) { setLoi(chuLoi(e)); setDang(false); }
  };
  return (
    <HopT tieuDe={`Nhận hàng ${phieu.ma}`} onDong={onDong}
      chan={<button type="button" className="bhq-nut chinh" disabled={dang} onClick={xong}>{dang ? 'Đang lưu…' : lech.length ? `Nhận (lệch ${lech.length} món — báo GĐ)` : 'Đã nhận đủ'}</button>}>
      <p className="bhq-ghi">{phieu.nguoi} ghi giao lúc {ngayGio(phieu.luc)}. Đếm bánh thật rồi sửa số nếu thiếu. Lệch số → Giám đốc được báo.</p>
      {phieu.dong.map((d) => { const m = matHang.find((x) => x.ma === d.ma); return (
        <div key={d.ma} className="tlq-dong"><span>{m ? `${m.ten}${m.size ? ` - ${m.size}` : ''}` : d.ma}<small>Bếp ghi giao {so(d.sl)}</small></span>
          <input className={`bhq-o ${Number(nhan[d.ma]) !== d.sl ? 'lech' : ''}`} inputMode="numeric" value={nhan[d.ma]} onChange={(e) => setNhan((x) => ({ ...x, [d.ma]: soTien(e.target.value) }))} /></div>
      ); })}
      <Loi chu={loi} />
    </HopT>
  );
}

// ── Chụp ảnh bánh huỷ ──
export function ChupAnh({ path, onChon, dang }) {
  const [url, setUrl] = useState(null);
  useEffect(() => { let h = false; linkAnh(path).then((u) => { if (!h) setUrl(u); }); return () => { h = true; }; }, [path]);
  return (
    <label className={`kf-anh ${path ? 'co' : ''}`}>
      {url ? <img src={url} alt="Ảnh bánh huỷ" /> : <Camera size={22} />}
      <span>{dang ? 'Đang tải ảnh…' : path ? 'Chụp lại' : 'Chụp ảnh bánh huỷ (bắt buộc)'}</span>
      <input type="file" accept="image/*" capture="environment" onChange={(e) => e.target.files?.[0] && onChon(e.target.files[0])} hidden />
    </label>
  );
}

// ── Nhật ký thao tác (Giám đốc / Quản lý) ──
const TEN_VIEC = { ban: 'Bán (giảm/nợ)', huy_hd: 'Huỷ hoá đơn', mo_ca: 'Mở ca', dong_ca: 'Đóng ca', duyet_ca: 'Duyệt ca', thu_no: 'Thu nợ',
  ck_da_ve: 'CK đã về', ck_khong_thay: 'CK không thấy', xuat_huy: 'Xuất huỷ', kiem_kho: 'Kiểm kho', noi_bo: 'Xuất nội bộ', bep_giao: 'Bếp giao',
  nhan_hang: 'Nhận hàng', huy_phieu: 'Huỷ phiếu', thiet_lap: 'Đổi thiết lập', bang_gia: 'Bảng giá', dong_y_giam_gia: 'Duyệt giảm giá',
  tu_choi_giam_gia: 'Từ chối giảm giá', dong_y_huy_hd: 'Duyệt huỷ HĐ', tu_choi_huy_hd: 'Từ chối huỷ HĐ', thu_don_coc: 'Thu cọc', thu_don_thu_con_lai: 'Thu tiền lấy bánh' };
export function NhatKy({ chiNhanh, onDong }) {
  const [ds, setDs] = useState(null);
  const [loc, setLoc] = useState('');
  useEffect(() => {
    supabase.from('pos_audit_log').select('*').or(`store_location.eq.${chiNhanh},store_location.is.null`).order('at', { ascending: false }).limit(300)
      .then(({ data }) => setDs(data || []));
  }, [chiNhanh]);
  const hien = (ds || []).filter((x) => !loc || x.action === loc);
  const moTa = (x) => { const d = x.detail || {}; return [d.ly_do && `Lý do: ${d.ly_do}`, d.giam && `giảm ${so(d.giam)}`, d.giam_cuoi_ngay && `giảm cuối ngày ${so(d.giam_cuoi_ngay)}`,
    d.ghi_no && `nợ ${so(d.ghi_no)}`, d.tong && `tổng ${so(d.tong)}`, d.tien && `${so(d.tien)}`, d.chenh != null && `chênh ${so(d.chenh)}`, d.lech && `lệch: ${d.lech}`,
    d.offline && 'bán lúc mất mạng', d.duyet && 'có phiếu duyệt', d.nguoi_xin && `${d.nguoi_xin} xin`].filter(Boolean).join(' · '); };
  return (
    <HopT tieuDe={`Nhật ký thao tác · ${chiNhanh}`} onDong={onDong} rong>
      <select className="bhq-o" value={loc} onChange={(e) => setLoc(e.target.value)}><option value="">Tất cả thao tác</option>{Object.entries(TEN_VIEC).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
      {ds == null ? <p className="bhq-ghi">Đang tải…</p> : hien.map((x) => (
        <div key={x.id} className="nk-dong"><span>{ngayGio(x.at)}</span><b>{x.actor_name}</b><span>{TEN_VIEC[x.action] || x.action} {x.ref && x.ref.length < 30 ? x.ref : ''}</span><small>{moTa(x)}</small></div>
      ))}
      {ds && !hien.length && <p className="bhq-rong">Chưa có thao tác nào.</p>}
    </HopT>
  );
}

// ── Báo cáo (Quản lý / Giám đốc) — số liệu tính trên database ──
const KY = [['hom_nay', 'Hôm nay'], ['hom_qua', 'Hôm qua'], ['7_ngay', '7 ngày'], ['thang_nay', 'Tháng này']];
function khoangKy(k) {
  const d = new Date(); d.setHours(0, 0, 0, 0); const homNay = d.getTime();
  if (k === 'hom_qua') return [homNay - 86400000, homNay];
  if (k === '7_ngay') return [homNay - 6 * 86400000, homNay + 86400000];
  if (k === 'thang_nay') { const t = new Date(d); t.setDate(1); return [t.getTime(), homNay + 86400000]; }
  return [homNay, homNay + 86400000];
}
export function BaoCaoThat({ chiNhanh, laGD, dienThoai }) {
  const [ky, setKy] = useState('hom_nay');
  const [tatCa, setTatCa] = useState(false);
  const [bc, setBc] = useState(null);
  const [loi, setLoi] = useState('');
  useEffect(() => {
    const [a, b] = khoangKy(ky); setBc(null); setLoi('');
    goi('pos_bao_cao', { p_store: tatCa ? null : chiNhanh, p_from: new Date(a).toISOString(), p_to: new Date(b).toISOString() }).then(setBc).catch((e) => setLoi(chuLoi(e)));
  }, [ky, chiNhanh, tatCa]);
  const doiTruoc = bc ? bc.doanh_thu - bc.ky_truoc.doanh_thu : 0;
  const maxGio = useMemo(() => Math.max(1, ...(bc?.theo_gio || []).map((g) => Number(g.tien))), [bc]);
  const R = ({ t, v, lon, am }) => <div className={lon ? 'lon' : ''}><span>{t}</span><b className={am ? 'do' : ''}>{v}</b></div>;
  return (
    <main className={`bhq-ds bct ${dienThoai ? 'dt' : ''}`}>
      <div className="bct-dau">
        <h2>Báo cáo · {tatCa ? 'Cả 2 cửa hàng' : chiNhanh}</h2>
        <nav className="bhq-tab">{KY.map(([k, l]) => <button key={k} type="button" className={ky === k ? 'on' : ''} onClick={() => setKy(k)}>{l}</button>)}</nav>
        <label className="kv-cong-tac nho"><span>Gộp 2 cửa hàng</span><input type="checkbox" checked={tatCa} onChange={(e) => setTatCa(e.target.checked)} /><i /></label>
      </div>
      <Loi chu={loi} />
      {!bc && !loi && <p className="bhq-ghi">Đang tính…</p>}
      {bc && <>
        <div className="bct-the">
          <div><small>Doanh thu thuần</small><b>{so(bc.doanh_thu)}</b><small className={doiTruoc >= 0 ? 'xanh-la' : 'do'}>{doiTruoc >= 0 ? '▲' : '▼'} {so(Math.abs(doiTruoc))} so với kỳ trước</small></div>
          <div><small>Số hoá đơn</small><b>{bc.so_hd}</b><small>kỳ trước {bc.ky_truoc.so_hd}</small></div>
          {laGD && <div><small>Lãi gộp</small><b>{so(bc.doanh_thu - bc.gia_von)}</b><small>{bc.chua_co_gia_von ? `${bc.chua_co_gia_von} món chưa có giá vốn` : 'giá vốn đủ'}</small></div>}
          <div><small>Huỷ hoá đơn</small><b className={bc.so_huy ? 'do' : ''}>{bc.so_huy}</b><small>{so(bc.tien_huy_hd)}</small></div>
        </div>
        <div className="bct-2">
          <section className="bhq-bang">
            <h4>Tiền</h4>
            <R t="Tiền mặt" v={so(bc.tien_mat)} /><R t="Chuyển khoản" v={so(bc.chuyen_khoan)} />
            {bc.ck_cho > 0 && <R t="  ↳ chưa xác nhận tiền về" v={so(bc.ck_cho)} am />}
            {bc.ck_khong_thay > 0 && <R t="  ↳ KHÔNG thấy tiền về" v={so(bc.ck_khong_thay)} am />}
            <R t="Thẻ" v={so(bc.the)} /><R t="Ghi nợ mới" v={so(bc.ghi_no)} /><R t="Thu nợ cũ" v={so(bc.thu_no)} /><R t="Thu đơn đặt (cọc + lấy bánh)" v={so(bc.thu_don)} />
            <R t="Giảm giá" v={`−${so(bc.giam)}`} /><R t="Giảm giá cuối ngày" v={`−${so(bc.giam_cuoi_ngay)}`} />{bc.diem > 0 && <R t="Khách dùng điểm" v={`−${so(bc.diem)}`} />}
            <R t="VAT thu hộ" v={so(bc.vat)} /><R t="Thu khác" v={so(bc.thu_khac)} />
            {laGD && <><R t="Giá vốn hàng bán" v={`−${so(bc.gia_von)}`} /><R t="Hàng huỷ (giá vốn)" v={`−${so(bc.huy_gia_von)}`} am={bc.huy_gia_von > 0} />
              <R t="Lãi gộp sau huỷ" v={so(bc.doanh_thu - bc.gia_von - bc.huy_gia_von)} lon /></>}
          </section>
          <section className="bhq-bang">
            <h4>Doanh thu theo giờ</h4>
            <div className="bct-gio">{(bc.theo_gio || []).map((g) => (
              <div key={g.gio}><span>{g.gio}h</span><i style={{ width: `${(Number(g.tien) / maxGio) * 100}%` }} /><b>{so(g.tien)}</b><small>{g.so_hd} HĐ</small></div>
            ))}{!(bc.theo_gio || []).length && <p className="bhq-rong">Chưa bán</p>}</div>
          </section>
        </div>
        <div className="bct-2">
          <section className="bhq-bang">
            <h4>Món bán chạy</h4>
            {(bc.theo_mon || []).slice(0, 15).map((m, i) => <R key={i} t={`${i + 1}. ${m.ten} × ${so(m.sl)}`} v={so(m.tien)} />)}
            {(bc.theo_mon || []).length > 15 && <p className="bhq-ghi">Món ít bán nhất: {(bc.theo_mon || []).slice(-5).map((m) => `${m.ten} (${so(m.sl)})`).join(', ')}</p>}
          </section>
          <section className="bhq-bang">
            <h4>Theo nhân viên</h4>
            {(bc.theo_nv || []).map((n) => <R key={n.ten} t={`${n.ten} · ${n.so_hd} HĐ`} v={so(n.tien)} />)}
            <h4>Hàng huỷ</h4>
            {(bc.huy_hang || []).map((h) => <R key={h.ten} t={h.ten} v={`${so(h.sl)} cái`} am />)}{!(bc.huy_hang || []).length && <p className="bhq-rong">Không huỷ món nào</p>}
            <h4>Ca lệch tiền</h4>
            {(bc.chenh_ca || []).map((c) => <R key={c.ma} t={`${c.ma} · ${c.nguoi}${c.duyet ? ' · đã duyệt' : ''}`} v={`${c.chenh > 0 ? '+' : ''}${so(c.chenh)}`} am={c.chenh < 0} />)}
            {!(bc.chenh_ca || []).length && <p className="bhq-rong">Không ca nào lệch</p>}
          </section>
        </div>
      </>}
    </main>
  );
}

// ── Kết ca thật: đếm tiền "mù" (không thấy số máy tính trước) → database tự so, báo GĐ nếu lệch ──
export function KetCaThat({ caMo, chiNhanh, onDong, onKet }) {
  const [dem, setDem] = useState('');
  const [ghi, setGhi] = useState('');
  const [dang, setDang] = useState(false);
  const [loi, setLoi] = useState('');
  const [xong, setXong] = useState(null);
  const dong = async () => {
    setDang(true); setLoi('');
    try {
      const s = await goi('pos_dong_ca', { p_shift: caMo.id, p_counted: Number(dem) || 0, p_note: ghi.trim() || null });
      const sl = s.summary || {};
      setXong({
        ma: s.code, nguoi: s.closed_by_name, chiNhanh, moLuc: new Date(s.opened_at).getTime(), dongLuc: new Date(s.closed_at).getTime(),
        dauCa: Number(s.opening_cash), banGiao: Number(s.counted_cash), ghiChu: s.note || '',
        ban: sl.ban || {}, thu: sl.thu_no || {}, donDat: sl.don_dat || {}, ghiNo: Number(sl.ban?.ghi_no || 0), soHoaDon: sl.so_hoa_don,
        hoanTien: Number(sl.hoan_tien_huy || 0), tienMatTrongCa: Number(sl.tien_mat_trong_ca || 0), cuoiCa: Number(s.expected_cash), chenh: Number(s.diff),
        ckCho: Number(sl.ck_chua_xac_nhan || 0),
      });
    } catch (e) { setLoi(chuLoi(e)); }
    setDang(false);
  };
  if (xong) {
    return (
      <HopT tieuDe={`Đã đóng ca ${xong.ma}`}
        chan={<button type="button" className="bhq-nut chinh" onClick={() => onKet(xong)}>In phiếu bàn giao</button>}>
        <div className="bhq-bang">
          <div><span>Số hoá đơn</span><b>{xong.soHoaDon}</b></div>
          <div><span>Tiền mặt đầu ca</span><b>{so(xong.dauCa)}</b></div>
          <div><span>Tiền mặt trong ca</span><b>{so(xong.tienMatTrongCa)}</b></div>
          <div><span>Tiền mặt cuối ca (hệ thống)</span><b>{so(xong.cuoiCa)}</b></div>
          <div><span>Đếm được</span><b>{so(xong.banGiao)}</b></div>
          <div className="lon"><span>Chênh lệch</span><b className={xong.chenh < 0 ? 'do' : xong.chenh > 0 ? 'cam' : 'xanh-la'}>{xong.chenh > 0 ? '+' : ''}{so(xong.chenh)}</b></div>
        </div>
        {xong.chenh !== 0 && <p className={`bhq-chenh ${xong.chenh < 0 ? 'thieu' : ''}`}>Giám đốc đã được báo. Quản lý sẽ kiểm và duyệt ca này.</p>}
        {xong.ckCho > 0 && <p className="bhq-ghi">Còn {xong.ckCho} chuyển khoản chưa ai xác nhận tiền về.</p>}
      </HopT>
    );
  }
  return (
    <HopT tieuDe="Đóng ca làm việc" onDong={onDong}
      chan={<><button type="button" className="bhq-nut phu" onClick={onDong}>Bỏ qua</button><button type="button" className="bhq-nut chinh" disabled={dem === '' || dang} onClick={dong}>{dang ? 'Đang đóng…' : 'Đóng ca'}</button></>}>
      <div className="bhq-bang">
        <div><span>Ca</span><b>{caMo.code}</b></div>
        <div><span>Mở lúc</span><b>{ngayGio(caMo.opened_at)} · {caMo.opened_by_name}</b></div>
        <div><span>Tiền đầu ca</span><b>{so(caMo.opening_cash)}</b></div>
      </div>
      <label className="bhq-nhan">Tiền mặt đếm được trong két<input className="bhq-o lon" autoFocus inputMode="numeric" value={dem ? so(dem) : dem} onChange={(e) => setDem(soTien(e.target.value))} placeholder="Đếm hết tiền trong két rồi nhập" /></label>
      <label className="bhq-nhan">Ghi chú (nếu có chi tiền lẻ, đổi tiền…)<input className="bhq-o" value={ghi} onChange={(e) => setGhi(e.target.value)} /></label>
      <p className="bhq-ghi">Đếm thật rồi nhập — máy chỉ hiện số hệ thống SAU khi đóng ca. Đóng rồi không mở lại được.</p>
      <Loi chu={loi} />
    </HopT>
  );
}
