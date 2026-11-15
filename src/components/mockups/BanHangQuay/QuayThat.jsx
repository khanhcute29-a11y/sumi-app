import React, { useEffect, useMemo, useState } from 'react';
import { X, RefreshCw, Camera, Search } from 'lucide-react';
import { supabase } from '../../../lib/supabaseClient';
import { goi, chuLoi, anhVietQr, noiDungCk, NGAN_HANG, maMoi, tachId, linkAnh, guiHangDoi, taiAnh, lapBanDoHang } from './posThat';
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

// ── Vào ca: mỗi nhân viên vào ca bằng tài khoản của mình — đếm tiền két + chụp ảnh két ──
// Database chặn: ca người khác đang mở, chưa chấm công (nếu Giám đốc bật), thiếu ảnh.
export function MoCa({ chiNhanh, nguoi, onMo, onVeApp, onDong, onTaiLai }) {
  const [tien, setTien] = useState('');
  const [anh, setAnh] = useState(null);
  const [dangAnh, setDangAnh] = useState(false);
  const [dang, setDang] = useState(false);
  const [loi, setLoi] = useState('');
  const chonAnh = async (f) => {
    setDangAnh(true); setLoi('');
    try { setAnh(await taiAnh(f, 'ket')); } catch (e) { setLoi(`Không tải được ảnh: ${chuLoi(e)}`); }
    setDangAnh(false);
  };
  const mo = async () => {
    if (tien === '') { setLoi('Nhập số tiền mặt đang có trong két'); return; }
    if (!anh) { setLoi('Chụp ảnh két tiền trước khi vào ca'); return; }
    setDang(true); setLoi('');
    try { onMo(await goi('pos_vao_ca', { p_store: chiNhanh, p_opening_cash: Number(tien) || 0, p_photo_url: anh })); } catch (e) {
      const m = chuLoi(e); setLoi(m); setDang(false);
      if (/đang mở/.test(m)) onTaiLai?.(); // người khác vừa vào ca ở máy khác → tải lại để hiện ca của họ
    }
  };
  return (
    <HopT tieuDe={`Vào ca · ${chiNhanh}`} onDong={onDong}
      chan={<><button type="button" className="bhq-nut phu" onClick={onVeApp}>Về app Sumi</button><button type="button" className="bhq-nut chinh" disabled={dang || dangAnh} onClick={mo}>{dang ? 'Đang vào ca…' : 'Vào ca · bắt đầu bán'}</button></>}>
      <p className="bhq-ghi">Chào {nguoi}. Đếm tiền lẻ đang có trong két rồi nhập vào, chụp 1 ảnh két tiền. Mọi hoá đơn trong ca tính doanh số cho bạn.</p>
      <label className="bhq-nhan">Tiền mặt đầu ca<input className="bhq-o lon" autoFocus inputMode="numeric" value={tien ? so(tien) : tien} placeholder="0" onChange={(e) => setTien(soTien(e.target.value))} /></label>
      <ChupAnh path={anh} dang={dangAnh} onChon={chonAnh} chu="Chụp ảnh két tiền (bắt buộc)" />
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
export function ThietLapQuay({ chiNhanh, caiDat, matHang, bangGia, hanDung = {}, onLuu, onDong }) {
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
  const [chamCong, setChamCong] = useState(!!c.bat_cham_cong);
  const [dangCc, setDangCc] = useState(false);
  const doiChamCong = async (bat) => {
    setDangCc(true); setLoi(''); setOk('');
    try { await goi('pos_bat_cham_cong', { p_store: chiNhanh, p_bat: bat }); setChamCong(bat); setOk(bat ? 'Đã bật: phải chấm công mới vào ca' : 'Đã tắt yêu cầu chấm công'); await onLuu(); } catch (e) { setLoi(chuLoi(e)); }
    setDangCc(false);
  };
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
      <nav className="bhq-tab">{[['chung', 'Chung'], ['han_dung', 'Hạn dùng'], ['gia_von', 'Giá vốn'], ['bang_gia', 'Bảng giá theo kênh']].map(([k, l]) => <button key={k} type="button" className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}</nav>
      {tab === 'chung' && (
        <div className="tlq">
          <h4>Vào ca</h4>
          <label className="kv-cong-tac"><span>Phải chấm công ở {chiNhanh} mới được vào ca</span><input type="checkbox" checked={chamCong} disabled={dangCc} onChange={(e) => doiChamCong(e.target.checked)} /><i /></label>
          <p className="bhq-ghi">Bật lên: nhân viên chưa chấm công vào (hoặc chấm ở cửa hàng khác) sẽ không vào ca bán được. Giám đốc / Quản lý không bị chặn. Bật / tắt có hiệu lực ngay.</p>
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
      {tab === 'han_dung' && <HanDung matHang={matHang} hanDung={hanDung} onLuu={onLuu} />}
      {tab === 'gia_von' && <GiaVon matHang={matHang} />}
      {tab === 'bang_gia' && <BangGia matHang={matHang} bangGia={bangGia} onLuu={onLuu} />}
    </HopT>
  );
}

// Số ngày bán được của từng loại bánh (tính cả ngày nhận). Quầy nhận hàng → máy tự ghi HSD cho lô đó.
function HanDung({ matHang, hanDung, onLuu }) {
  const [sua, setSua] = useState({});
  const [q, setQ] = useState('');
  const [loi, setLoi] = useState('');
  const [ok, setOk] = useState('');
  const [dang, setDang] = useState(false);
  const mon = useMemo(() => {
    const theoSp = new Map();
    for (const m of matHang) {
      const pid = tachId(m).product_id;
      if (!theoSp.has(pid)) theoSp.set(pid, { pid, ma: m.ma, ten: m.ten, size: [] });
      if (m.size) theoSp.get(pid).size.push(m.size);
    }
    return [...theoSp.values()];
  }, [matHang]);
  const ds = locXep(mon, (m) => `${m.ma} ${m.ten}`, q, 120);
  const chuaCo = mon.filter((m) => !hanDung[m.pid]).length;
  const luu = async () => {
    setDang(true); setLoi(''); setOk('');
    try {
      for (const [pid, v] of Object.entries(sua)) await goi('pos_luu_han_dung', { p_product: pid, p_days: Number(v) || 0 });
      setOk(`Đã lưu ${Object.keys(sua).length} món — áp dụng cho lần nhận hàng tới.`); setSua({}); onLuu?.();
    } catch (e) { setLoi(chuLoi(e)); }
    setDang(false);
  };
  return (
    <div>
      <p className="bhq-ghi">Bánh bán được trong bao nhiêu ngày, <b>tính cả ngày nhận</b> (1 = chỉ bán trong ngày). Quầy bấm Nhận hàng → máy tự ghi hạn cho mẻ đó;
        hết hạn thì máy không cho bán và nhắc xuất hủy. Để trống = không theo dõi hạn. {chuaCo ? <b>{chuaCo} món chưa cài.</b> : 'Mọi món đã cài.'}</p>
      <label className="bhq-tim"><Search size={16} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm món" /></label>
      <div className="tlq-ds">
        {ds.map((m) => (
          <div key={m.pid} className="tlq-dong"><span>{m.ten}{m.size.length ? <small>{m.size.join(' · ')}</small> : null}</span>
            <input className="bhq-o" inputMode="numeric" placeholder="Không theo dõi" aria-label={`Số ngày bán được của ${m.ten}`}
              value={sua[m.pid] != null ? sua[m.pid] : hanDung[m.pid] ?? ''}
              onChange={(e) => setSua((x) => ({ ...x, [m.pid]: e.target.value.replace(/\D/g, '').slice(0, 3) }))} /></div>
        ))}
      </div>
      <Loi chu={loi} />{ok && <p className="bhq-ok">{ok}</p>}
      <button type="button" className="bhq-nut chinh" disabled={dang || !Object.keys(sua).length} onClick={luu}>{dang ? 'Đang lưu…' : `Lưu ${Object.keys(sua).length || ''} món`}</button>
    </div>
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
      // Ghi "đơn đặt nhận tại quầy" để tính doanh số cho người nhận đơn khi đơn hoàn thành. Lỗi không chặn đơn.
      try { await goi('pos_ghi_don_quay', { p_order: orderId, p_store: chiNhanh }); } catch { /* đơn vẫn tạo được */ }
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
  const [daThu, setDaThu] = useState(0); // vừa thu ở bước này (để báo lại nếu đơn chưa đóng được)
  useEffect(() => {
    if (q.trim().length < 3) { setDs([]); return undefined; }
    const t = setTimeout(() => goi('pos_tim_don', { p_q: q.trim() }).then((x) => setDs(x || [])).catch((e) => setLoi(chuLoi(e))), 300);
    return () => clearTimeout(t);
  }, [q]);
  const con = chon ? Math.max(Number(chon.total) - Number(chon.deposit) - Number(chon.da_thu_quay) - daThu, 0) : 0;
  const daGiao = chon?.status_v2 === 'completed';
  // Đưa bánh = đóng đơn bên mục Đơn hàng (giống shipper bấm "Hoàn Thành Giao").
  const giao = async (tienVuaThu) => {
    try {
      const r = await goi('pos_giao_don', { p_order: chon.id, p_store: chiNhanh });
      onXong(chon, tienVuaThu, r?.already_completed ? 'da_xong_truoc' : 'xong');
    } catch (e) { setLoi(tienVuaThu ? `Đã thu ${so(tienVuaThu)}. ${chuLoi(e)}` : chuLoi(e)); setDang(false); }
  };
  const thu = async () => {
    setDang(true); setLoi('');
    try { await goi('pos_thu_don', { p_id: maMoi(), p_order: chon.id, p_kind: 'thu_con_lai', p_amount: con, p_method: pt, p_store: chiNhanh }); }
    catch (e) { setLoi(chuLoi(e)); setDang(false); return; }
    const vuaThu = con; setDaThu((x) => x + vuaThu);
    setDs((x) => x.map((o) => (o.id === chon.id ? { ...o, da_thu_quay: Number(o.da_thu_quay) + vuaThu } : o))); // chọn lại đơn này không hiện nợ cũ
    await giao(vuaThu);
  };
  const nhanTt = (o) => (o.status_v2 === 'completed' ? ['Đã giao', 'xong'] : o.status_v2 === 'ready_for_fulfillment' ? ['Bánh đã xong', 'san'] : o.status_v2 === 'in_delivery' ? ['Đang giao shipper', 'cho'] : ['Bếp đang làm', 'cho']);
  const chonDon = (o) => { setChon(o); setDaThu(0); setLoi(''); };
  return (
    <HopT tieuDe="Khách lấy bánh đặt" onDong={onDong}
      chan={chon ? <><button type="button" className="bhq-nut phu" onClick={() => { setChon(null); setLoi(''); }}>Chọn đơn khác</button>
        {!daGiao && <button type="button" className="bhq-nut chinh" disabled={dang} onClick={con > 0 ? thu : () => { setDang(true); setLoi(''); giao(daThu); }}>
          {dang ? 'Đang lưu…' : con > 0 ? `Thu ${so(con)} · giao bánh` : 'Giao bánh cho khách'}</button>}</> : null}>
      {!chon ? <>
        <label className="bhq-tim"><Search size={16} /><input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Mã đơn, SĐT hoặc tên khách" /></label>
        {ds.map((o) => (
          <button key={o.id} type="button" className="bhq-the nut" onClick={() => chonDon(o)}>
            <div><b>{o.order_code}</b> · lấy {o.required_at ? ngayGio(o.required_at) : '—'} <i className={`bhq-nhan-tt ${nhanTt(o)[1]}`}>{nhanTt(o)[0]}</i></div>
            <div>{o.customer_name || 'Khách'} {o.customer_phone ? `· ${o.customer_phone}` : ''}</div>
            <div className="mo">{(o.items || []).map((i) => `${i.name}${i.size ? ` ${i.size}` : ''} ×${i.qty}`).join(', ')}</div>
          </button>
        ))}
        {q.trim().length >= 3 && !ds.length && <p className="bhq-rong">Không tìm thấy đơn.</p>}
      </> : <>
        <div className="bhq-bang">
          <div><span>Đơn</span><b>{chon.order_code} <i className={`bhq-nhan-tt ${nhanTt(chon)[1]}`}>{nhanTt(chon)[0]}</i></b></div>
          <div><span>Khách</span><b>{chon.customer_name} {chon.customer_phone}</b></div>
          <div><span>Tổng đơn</span><b>{so(chon.total)}</b></div>
          <div><span>Đã cọc</span><b>−{so(chon.deposit)}</b></div>
          {Number(chon.da_thu_quay) + daThu > 0 && <div><span>Đã thu tại quầy</span><b>−{so(Number(chon.da_thu_quay) + daThu)}</b></div>}
          <div className="lon"><span>Còn phải thu</span><b className="xanh">{so(con)}</b></div>
        </div>
        {con > 0 && !daGiao && <div className="bhq-goi">{['tien_mat', 'chuyen_khoan', 'the'].map((k) => <button key={k} type="button" className={pt === k ? 'on' : ''} onClick={() => setPt(k)}>{PT[k]}</button>)}</div>}
        <p className="bhq-ghi">{daGiao ? 'Đơn này đã giao xong rồi — không thu, không giao lại.'
          : 'Bấm nút xanh: thu tiền (nếu còn) rồi đưa bánh — đơn bên mục Đơn hàng tự chuyển "Hoàn thành". Bếp phải báo xong đơn trước.'}</p>
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

// ── Chụp ảnh (bánh huỷ, két tiền, ảnh bán hàng) ──
// thuVien: cho chọn ảnh có sẵn trong máy (không ép mở camera). xem: link ảnh trên máy (chưa tải lên).
export function ChupAnh({ path, xem, onChon, dang, chu = 'Chụp ảnh bánh huỷ (bắt buộc)', thuVien = false }) {
  const [url, setUrl] = useState(null);
  useEffect(() => { if (xem) return undefined; let h = false; linkAnh(path).then((u) => { if (!h) setUrl(u); }); return () => { h = true; }; }, [path, xem]);
  const co = !!(xem || path);
  const hien = xem || url;
  return (
    <label className={`kf-anh ${co ? 'co' : ''}`}>
      {hien ? <img src={hien} alt="Ảnh đã chọn" /> : <Camera size={22} />}
      <span>{dang ? 'Đang tải ảnh…' : co ? (thuVien ? 'Đổi ảnh khác' : 'Chụp lại') : chu}</span>
      <input type="file" accept="image/*" {...(thuVien ? {} : { capture: 'environment' })}
        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onChon(f); }} hidden />
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
const KY = [['hom_nay', 'Hôm nay'], ['hom_qua', 'Hôm qua'], ['7_ngay', '7 ngày'], ['thang_nay', 'Tháng này'], ['tuy_chinh', 'Tùy chỉnh']];
// Ngày theo giờ máy (yyyy-mm-dd) cho ô chọn ngày.
const ngayO = (t) => { const d = new Date(t); const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };
const dauNgay = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d).getTime(); };
function khoangKy(k) {
  const d = new Date(); d.setHours(0, 0, 0, 0); const homNay = d.getTime();
  if (k === 'hom_qua') return [homNay - 86400000, homNay];
  if (k === '7_ngay') return [homNay - 6 * 86400000, homNay + 86400000];
  if (k === 'thang_nay') { const t = new Date(d); t.setDate(1); return [t.getTime(), homNay + 86400000]; }
  return [homNay, homNay + 86400000];
}
export function BaoCaoThat({ chiNhanh, laGD, dienThoai }) {
  const [ky, setKy] = useState('hom_nay');
  const [tu, setTu] = useState(() => ngayO(Date.now()));
  const [den, setDen] = useState(() => ngayO(Date.now()));
  const [tatCa, setTatCa] = useState(false);
  const [bc, setBc] = useState(null);
  const [loi, setLoi] = useState('');
  useEffect(() => {
    setBc(null); setLoi('');
    let a; let b;
    if (ky === 'tuy_chinh') {
      if (!tu || !den) { setLoi('Chọn đủ từ ngày và đến ngày'); return; }
      if (tu > den) { setLoi('"Từ ngày" phải trước hoặc bằng "Đến ngày"'); return; }
      a = dauNgay(tu); b = dauNgay(den) + 86400000; // tính trọn ngày cuối
    } else [a, b] = khoangKy(ky);
    goi('pos_bao_cao', { p_store: tatCa ? null : chiNhanh, p_from: new Date(a).toISOString(), p_to: new Date(b).toISOString() }).then(setBc).catch((e) => setLoi(chuLoi(e)));
  }, [ky, tu, den, chiNhanh, tatCa]);
  const doiTruoc = bc ? bc.doanh_thu - bc.ky_truoc.doanh_thu : 0;
  const maxGio = useMemo(() => Math.max(1, ...(bc?.theo_gio || []).map((g) => Number(g.tien))), [bc]);
  const tru = (x) => (Number(x) ? `−${so(x)}` : '0');
  const R = ({ t, v, lon, am }) => <div className={lon ? 'lon' : ''}><span>{t}</span><b className={am ? 'do' : ''}>{v}</b></div>;
  return (
    <main className={`bhq-ds bct ${dienThoai ? 'dt' : ''}`}>
      <div className="bct-dau">
        <h2>Báo cáo · {tatCa ? 'Cả 2 cửa hàng' : chiNhanh}</h2>
        <nav className="bhq-tab">{KY.map(([k, l]) => <button key={k} type="button" className={ky === k ? 'on' : ''} onClick={() => setKy(k)}>{l}</button>)}</nav>
        {ky === 'tuy_chinh' && (
          <div className="bct-khoang">
            <label>Từ ngày<input type="date" value={tu} max={den || undefined} onChange={(e) => setTu(e.target.value)} /></label>
            <label>Đến ngày<input type="date" value={den} min={tu || undefined} max={ngayO(Date.now())} onChange={(e) => setDen(e.target.value)} /></label>
          </div>
        )}
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
            <R t="Giảm giá" v={tru(bc.giam)} /><R t="Giảm giá cuối ngày" v={tru(bc.giam_cuoi_ngay)} />{bc.diem > 0 && <R t="Khách dùng điểm" v={tru(bc.diem)} />}
            <R t="VAT thu hộ" v={so(bc.vat)} /><R t="Thu khác" v={so(bc.thu_khac)} />
            {laGD && <><R t="Giá vốn hàng bán" v={tru(bc.gia_von)} /><R t="Hàng huỷ (giá vốn)" v={tru(bc.huy_gia_von)} am={bc.huy_gia_von > 0} />
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

// ── Kết ca thật: đếm tiền "mù" + đếm nhanh bánh trên kệ + ảnh két → database tự so, báo GĐ nếu lệch ──
export function KetCaThat({ caMo, chiNhanh, matHang = [], onDong, onKet }) {
  const [dem, setDem] = useState('');
  const [ghi, setGhi] = useState('');
  const [anh, setAnh] = useState(null);
  const [dangAnh, setDangAnh] = useState(false);
  const [banh, setBanh] = useState(null); // [{ khoa, product_id, size, name }] — bánh máy đang ghi còn trên kệ
  const [demBanh, setDemBanh] = useState({});
  const [dang, setDang] = useState(false);
  const [loi, setLoi] = useState('');
  const [xong, setXong] = useState(null);
  useEffect(() => {
    let h = false;
    (async () => {
      const { data, error } = await supabase.from('finished_goods_stock').select('product_id, size, qty')
        .eq('store_location', chiNhanh).eq('is_semi_finished', false).gt('qty', 0);
      if (h) return;
      if (error) { setLoi(`Không tải được danh sách bánh trên kệ: ${chuLoi(error)}`); setBanh([]); return; }
      const bd = lapBanDoHang(matHang);
      const gom = new Map();
      for (const r of data || []) {
        const khoa = `${r.product_id}|${r.size || ''}`;
        if (gom.has(khoa)) continue;
        const m = bd.theoSize(r.product_id, r.size);
        gom.set(khoa, { khoa, product_id: r.product_id, size: r.size || null, name: m ? `${m.ten}${r.size && !String(m.ten).includes(r.size) ? ` ${r.size}` : ''}` : `Bánh khác${r.size ? ` ${r.size}` : ''}` });
      }
      setBanh([...gom.values()].sort((a, b) => a.name.localeCompare(b.name, 'vi')));
    })();
    return () => { h = true; };
  }, [chiNhanh, matHang]);
  const chonAnh = async (f) => {
    setDangAnh(true); setLoi('');
    try { setAnh(await taiAnh(f, 'ket')); } catch (e) { setLoi(`Không tải được ảnh: ${chuLoi(e)}`); }
    setDangAnh(false);
  };
  const thieuBanh = (banh || []).filter((b) => demBanh[b.khoa] == null || demBanh[b.khoa] === '');
  const dong = async () => {
    if (dem === '') { setLoi('Nhập số tiền mặt đếm được trong két'); return; }
    if (thieuBanh.length) { setLoi(`Còn ${thieuBanh.length} loại bánh chưa nhập số đếm (không còn cái nào thì nhập 0).`); return; }
    if (!anh) { setLoi('Chụp ảnh két tiền trước khi kết ca'); return; }
    setDang(true); setLoi('');
    try {
      // Việc làm lúc mất mạng phải lên database TRƯỚC khi chốt két — không thì tiền của chúng rơi sang ca sau.
      const { conLai } = await guiHangDoi();
      if (conLai > 0) {
        setLoi(`Còn ${conLai} việc làm lúc mất mạng chưa gửi lên được. Đợi có mạng (thanh đỏ trên cùng biến mất) rồi bấm Kết ca lại.`);
        setDang(false); return;
      }
      const stock = (banh || []).map((b) => ({ product_id: b.product_id, size: b.size, name: b.name, dem: Number(demBanh[b.khoa]) || 0 }));
      const s = await goi('pos_ket_ca', { p_shift: caMo.id, p_counted: Number(dem) || 0, p_note: ghi.trim() || null, p_photo_url: anh, p_stock: stock });
      const sl = s.summary || {};
      setXong({
        ma: s.code, nguoi: s.closed_by_name, chiNhanh, moLuc: new Date(s.opened_at).getTime(), dongLuc: new Date(s.closed_at).getTime(),
        dauCa: Number(s.opening_cash), banGiao: Number(s.counted_cash), ghiChu: s.note || '',
        ban: sl.ban || {}, thu: sl.thu_no || {}, donDat: sl.don_dat || {}, ghiNo: Number(sl.ban?.ghi_no || 0), soHoaDon: sl.so_hoa_don,
        hoanTien: Number(sl.hoan_tien_huy || 0), tienMatTrongCa: Number(sl.tien_mat_trong_ca || 0), cuoiCa: Number(s.expected_cash), chenh: Number(s.diff),
        ckCho: Number(sl.ck_chua_xac_nhan || 0),
        doanhSo: Number(sl.doanh_so_tinh || 0), dsCkCho: Number(sl.ck_cho || 0), dsNo: Number(sl.no_chua_tra || 0),
        banhLech: (s.stock_check || []).filter((k) => Number(k.lech) !== 0),
      });
    } catch (e) { setLoi(chuLoi(e)); }
    setDang(false);
  };
  if (xong) {
    return (
      <HopT tieuDe={`Đã kết ca ${xong.ma}`}
        chan={<button type="button" className="bhq-nut chinh" onClick={() => onKet(xong)}>In phiếu bàn giao</button>}>
        <div className="bhq-bang">
          <div className="lon"><span>Doanh số ca của {caMo.opened_by_name || 'bạn'}</span><b className="xanh-la">{so(xong.doanhSo)}</b></div>
          {xong.dsCkCho > 0 && <div><span>CK chờ xác nhận (tính khi tiền về)</span><b>{so(xong.dsCkCho)}</b></div>}
          {xong.dsNo > 0 && <div><span>Khách còn nợ (tính khi trả)</span><b>{so(xong.dsNo)}</b></div>}
          <div><span>Số hoá đơn</span><b>{xong.soHoaDon}</b></div>
          <div><span>Tiền mặt đầu ca</span><b>{so(xong.dauCa)}</b></div>
          <div><span>Tiền mặt trong ca</span><b>{so(xong.tienMatTrongCa)}</b></div>
          <div><span>Tiền mặt cuối ca (hệ thống)</span><b>{so(xong.cuoiCa)}</b></div>
          <div><span>Đếm được</span><b>{so(xong.banGiao)}</b></div>
          <div className="lon"><span>Chênh lệch két</span><b className={xong.chenh < 0 ? 'do' : xong.chenh > 0 ? 'cam' : 'xanh-la'}>{xong.chenh > 0 ? '+' : ''}{so(xong.chenh)}</b></div>
        </div>
        {xong.banhLech.length > 0 && (
          <div className="kc-lech">
            <b>Bánh đếm lệch với máy ({xong.banhLech.length})</b>
            {xong.banhLech.map((k) => <div key={`${k.product_id}|${k.size || ''}`}><span>{k.name}</span><span>máy {so(k.he_thong)} · đếm {so(k.dem)} · <b className={Number(k.lech) < 0 ? 'do' : 'cam'}>{Number(k.lech) > 0 ? '+' : ''}{so(k.lech)}</b></span></div>)}
          </div>
        )}
        {(xong.chenh !== 0 || xong.banhLech.length > 0) && <p className={`bhq-chenh ${xong.chenh < 0 || xong.banhLech.length ? 'thieu' : ''}`}>Giám đốc đã được báo. Quản lý sẽ kiểm và duyệt ca này.</p>}
        {xong.ckCho > 0 && <p className="bhq-ghi">Còn {xong.ckCho} chuyển khoản chưa ai xác nhận tiền về.</p>}
      </HopT>
    );
  }
  return (
    <HopT tieuDe="Kết ca" onDong={onDong}
      chan={<><button type="button" className="bhq-nut phu" onClick={onDong}>Bỏ qua</button><button type="button" className="bhq-nut chinh" disabled={dang || dangAnh || banh == null} onClick={dong}>{dang ? 'Đang kết ca…' : 'Kết ca'}</button></>}>
      <div className="bhq-bang">
        <div><span>Ca</span><b>{caMo.code}</b></div>
        <div><span>Vào ca lúc</span><b>{ngayGio(caMo.opened_at)} · {caMo.opened_by_name}</b></div>
        <div><span>Tiền đầu ca</span><b>{so(caMo.opening_cash)}</b></div>
      </div>
      <label className="bhq-nhan">Tiền mặt đếm được trong két<input className="bhq-o lon" autoFocus inputMode="numeric" value={dem ? so(dem) : dem} onChange={(e) => setDem(soTien(e.target.value))} placeholder="Đếm hết rồi nhập" /></label>
      <ChupAnh path={anh} dang={dangAnh} onChon={chonAnh} chu="Chụp ảnh két tiền (bắt buộc)" />
      <h4 className="kc-tieu">Đếm nhanh bánh trên kệ</h4>
      {banh == null ? <p className="bhq-ghi">Đang tải danh sách bánh…</p>
        : banh.length === 0 ? <p className="bhq-ghi">Máy ghi kệ đã hết bánh — không cần đếm.</p>
          : (
            <div className="kc-banh">
              {banh.map((b) => (
                <label key={b.khoa} className={demBanh[b.khoa] == null || demBanh[b.khoa] === '' ? '' : 'xong'}>
                  <span>{b.name}</span>
                  <input className="bhq-o" inputMode="numeric" placeholder="Đếm" aria-label={`Số đếm được: ${b.name}`} value={demBanh[b.khoa] ?? ''}
                    onChange={(e) => { const v = soTien(e.target.value); setDemBanh((x) => ({ ...x, [b.khoa]: v })); }} />
                </label>
              ))}
            </div>
          )}
      <label className="bhq-nhan">Ghi chú (nếu có chi tiền lẻ, đổi tiền…)<input className="bhq-o" value={ghi} onChange={(e) => setGhi(e.target.value)} /></label>
      <p className="bhq-ghi">Đếm thật rồi nhập — máy chỉ hiện số hệ thống SAU khi kết ca. Kết rồi không mở lại được.</p>
      <Loi chu={loi} />
    </HopT>
  );
}

// ── Doanh số nhân viên (Giám đốc / Quản lý / Kế toán) — tổng theo ca, tuần, tháng. Tiền hoa hồng anh tự tính. ──
const KY_DS = [['tuan_nay', 'Tuần này'], ['tuan_truoc', 'Tuần trước'], ['thang_nay', 'Tháng này'], ['thang_truoc', 'Tháng trước'], ['tuy_chinh', 'Tùy chỉnh']];
export function khoangDs(k, tu, den) {
  const n = new Date(); const d0 = new Date(n.getFullYear(), n.getMonth(), n.getDate());
  const thu = (d0.getDay() + 6) % 7; // thứ Hai = 0
  const dauTuan = new Date(d0); dauTuan.setDate(d0.getDate() - thu);
  const cong = (d, so) => { const x = new Date(d); x.setDate(x.getDate() + so); return x; };
  if (k === 'tuan_nay') return [dauTuan, cong(dauTuan, 7)];
  if (k === 'tuan_truoc') return [cong(dauTuan, -7), dauTuan];
  if (k === 'thang_nay') return [new Date(n.getFullYear(), n.getMonth(), 1), new Date(n.getFullYear(), n.getMonth() + 1, 1)];
  if (k === 'thang_truoc') return [new Date(n.getFullYear(), n.getMonth() - 1, 1), new Date(n.getFullYear(), n.getMonth(), 1)];
  const a = tu ? new Date(`${tu}T00:00`) : d0; const b = den ? new Date(`${den}T00:00`) : d0;
  return [a, cong(b, 1)];
}
const chuNgay = (d) => d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
const gioPhut = (t) => (t ? new Date(t).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '…');
const TEN_CANH = { anh_trung: 'ảnh dùng lại', khong_phai_ca_minh: 'bán trong ca người khác', khac_ca: 'khác ca', gia_lech: 'giá lệch',
  giam_qua_muc: 'giảm quá mức', vuot_han_muc_no: 'nợ quá hạn mức', ban_qua_han: 'bán bánh quá hạn', bang_gia_tat: 'bảng giá đã tắt',
  giam_cuoi_ngay_som: 'giảm cuối ngày sớm', giam_cuoi_ngay_qua_muc: 'giảm cuối ngày quá mức', diem_tat: 'điểm đã tắt', diem_khong_du: 'không đủ điểm' };

function MoAnh({ path, chu }) {
  const [dang, setDang] = useState(false);
  if (!path) return <span className="ds-mo">—</span>;
  const mo = async () => { setDang(true); const u = await linkAnh(path); setDang(false); if (u) window.open(u, '_blank', 'noopener'); };
  return <button type="button" className="ds-link" onClick={mo}>{dang ? '…' : chu}</button>;
}
function AnhNho({ path }) {
  const [url, setUrl] = useState(null);
  useEffect(() => { let h = false; linkAnh(path).then((u) => { if (!h) setUrl(u); }); return () => { h = true; }; }, [path]);
  if (!path) return <span className="ds-anh trong">Không ảnh</span>;
  return url ? <a href={url} target="_blank" rel="noopener noreferrer" className="ds-anh"><img src={url} alt="Ảnh bán hàng" loading="lazy" /></a> : <span className="ds-anh trong">…</span>;
}

function HoaDonCa({ ca, duocLoai, onDoi }) {
  const [ds, setDs] = useState(null);
  const [loi, setLoi] = useState('');
  const [loai, setLoai] = useState(null); // { id, lyDo }
  const [dang, setDang] = useState(false);
  const tai = async () => { try { setDs(await goi('pos_hd_ca', { p_shift: ca.id })); } catch (e) { setLoi(chuLoi(e)); } };
  useEffect(() => { tai(); }, [ca.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const doi = async (id, la, lyDo) => {
    setDang(true); setLoi('');
    try { await goi('pos_loai_doanh_so', { p_invoice: id, p_loai: la, p_ly_do: lyDo || null }); setLoai(null); await tai(); onDoi(); } catch (e) { setLoi(chuLoi(e)); }
    setDang(false);
  };
  if (!ds) return loi ? <Loi chu={loi} /> : <p className="bhq-ghi">Đang tải hoá đơn…</p>;
  if (!ds.length) return <p className="bhq-ghi">Ca này chưa có hoá đơn nào.</p>;
  return (
    <div className="ds-hd">
      {ds.map((h) => {
        const canh = Array.isArray(h.canh_bao) ? h.canh_bao : [];
        return (
          <div key={h.invoice_id} className={`ds-hd-dong ${h.loai || h.mua_nv ? 'loai' : ''}`}>
            <AnhNho path={h.photo_url} />
            <div className="ds-hd-than">
              <div><b>{h.code}</b> · {gioPhut(h.created_at)} · {PT[h.pay_method] || h.pay_method}{h.offline ? ' · lúc mất mạng' : ''}</div>
              <div className="ds-hd-so">Hoá đơn {so(h.total)} · <b>tính {so(h.tinh)}</b>{Number(h.ck_cho) > 0 ? ` · CK chờ ${so(h.ck_cho)}` : ''}{Number(h.no_chua_tra) > 0 ? ` · nợ ${so(h.no_chua_tra)}` : ''}</div>
              <div className="ds-hd-phu">{h.cashier_name}{h.customer_name && h.customer_name !== 'Khách lẻ' ? ` · khách ${h.customer_name}` : ''}</div>
              {h.mua_nv && <div className="ds-nhan cam">Nhân viên mua — không tính</div>}
              {h.loai && <div className="ds-nhan do">Đã loại: {h.ly_do_loai || '—'}</div>}
              {canh.length > 0 && <div className="ds-nhan cam">Cảnh báo: {canh.map((c) => TEN_CANH[c.loai] || c.loai).join(', ')}</div>}
              {duocLoai && (loai?.id === h.invoice_id ? (
                <div className="ds-loai">
                  <input className="bhq-o" autoFocus placeholder="Lý do loại (bắt buộc)" value={loai.lyDo} onChange={(e) => setLoai({ ...loai, lyDo: e.target.value })} />
                  <button type="button" className="bhq-nut chinh nho" disabled={dang || !loai.lyDo.trim()} onClick={() => doi(h.invoice_id, true, loai.lyDo.trim())}>Loại</button>
                  <button type="button" className="bhq-nut phu nho" onClick={() => setLoai(null)}>Thôi</button>
                </div>
              ) : h.loai
                ? <button type="button" className="bhq-nut phu nho" disabled={dang} onClick={() => doi(h.invoice_id, false)}>Bỏ loại</button>
                : <button type="button" className="bhq-nut phu nho" onClick={() => setLoai({ id: h.invoice_id, lyDo: '' })}>Loại khỏi doanh số</button>)}
            </div>
          </div>
        );
      })}
      <Loi chu={loi} />
    </div>
  );
}

export function DoanhSoNv({ dsCuaHang = [], duocLoai, onDong }) {
  const [ky, setKy] = useState('tuan_nay');
  const [tu, setTu] = useState(() => ngayO(new Date()));
  const [den, setDen] = useState(() => ngayO(new Date()));
  const [cn, setCn] = useState('');
  const [dl, setDl] = useState(null);
  const [dang, setDang] = useState(false);
  const [loi, setLoi] = useState('');
  const [moNv, setMoNv] = useState(null);
  const [moCa, setMoCa] = useState(null);
  const [a, b] = useMemo(() => khoangDs(ky, tu, den), [ky, tu, den]);
  const tai = async () => {
    setDang(true); setLoi('');
    try { setDl(await goi('pos_doanh_so_nv', { p_from: a.toISOString(), p_to: b.toISOString(), p_store: cn || null })); } catch (e) { setLoi(chuLoi(e)); }
    setDang(false);
  };
  useEffect(() => { if (b > a) tai(); else setLoi('Ngày "đến" phải sau ngày "từ"'); }, [a.getTime(), b.getTime(), cn]); // eslint-disable-line react-hooks/exhaustive-deps
  const nv = dl?.nhan_vien || [];
  const ca = dl?.ca || [];
  const xuat = () => {
    const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const dong = [['Doanh số nhân viên', `${chuNgay(a)} - ${chuNgay(new Date(b.getTime() - 1))}`, cn || 'Tất cả cửa hàng'], [],
      ['Nhân viên', 'Số ca', 'Số hoá đơn', 'Doanh số bán (tính)', 'CK chờ xác nhận', 'Nợ chưa trả', 'Đơn đặt tại quầy (hoàn thành)', 'Số đơn đặt', 'TỔNG TÍNH', 'Bị loại / NV mua', 'Số HĐ có cảnh báo'],
      ...nv.map((r) => [r.ten, r.so_ca, r.so_hd, r.ban_tinh, r.ck_cho, r.no_chua_tra, r.dat_quay, r.so_don_dat, r.tong, r.bi_loai, r.so_hd_canh_bao]),
      [], ['Chi tiết ca'],
      ['Mã ca', 'Cửa hàng', 'Nhân viên', 'Vào ca', 'Kết ca', 'Số HĐ', 'Doanh số (tính)', 'CK chờ', 'Người khác bán trong ca', 'Tiền đầu ca', 'Đếm cuối ca', 'Lệch két', 'Số món bánh lệch'],
      ...ca.map((c) => [c.code, c.store, c.ten, new Date(c.opened_at).toLocaleString('vi-VN'), c.closed_at ? new Date(c.closed_at).toLocaleString('vi-VN') : 'đang mở',
        c.so_hd, c.ban_tinh, c.ck_cho, c.nguoi_khac, c.tien_dau, c.dem ?? '', c.lech ?? '', c.so_banh_lech])];
    const csv = `﻿${dong.map((r) => r.map(q).join(',')).join('\r\n')}`;
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const el = document.createElement('a'); el.href = url; el.download = `doanh-so-nhan-vien_${ngayO(a)}_${ngayO(new Date(b.getTime() - 1))}.csv`;
    document.body.appendChild(el); el.click(); el.remove(); setTimeout(() => URL.revokeObjectURL(url), 5000);
  };
  const tongAll = nv.reduce((s, r) => s + Number(r.tong || 0), 0);
  return (
    <HopT tieuDe="Doanh số nhân viên" onDong={onDong} rong
      chan={<><button type="button" className="bhq-nut phu" disabled={!nv.length} onClick={xuat}>Xuất Excel (CSV)</button><button type="button" className="bhq-nut chinh" onClick={onDong}>Xong</button></>}>
      <nav className="bhq-tab">{KY_DS.map(([k, l]) => <button key={k} type="button" className={ky === k ? 'on' : ''} onClick={() => setKy(k)}>{l}</button>)}</nav>
      {ky === 'tuy_chinh' && (
        <div className="tlq-2">
          <label className="bhq-nhan">Từ ngày<input className="bhq-o" type="date" value={tu} onChange={(e) => setTu(e.target.value)} /></label>
          <label className="bhq-nhan">Đến ngày<input className="bhq-o" type="date" value={den} onChange={(e) => setDen(e.target.value)} /></label>
        </div>
      )}
      <div className="ds-loc">
        <span>{chuNgay(a)} – {chuNgay(new Date(b.getTime() - 1))}</span>
        <select className="bhq-o" value={cn} onChange={(e) => setCn(e.target.value)} aria-label="Cửa hàng">
          <option value="">Tất cả cửa hàng</option>{dsCuaHang.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <button type="button" className="bhq-nut phu nho" onClick={tai} disabled={dang} aria-label="Tải lại"><RefreshCw size={16} /></button>
      </div>
      <p className="bhq-ghi">Doanh số tính = tiền đã thu (CK tính khi đã xác nhận tiền về, nợ tính khi khách trả), không gồm VAT/phí, bỏ hoá đơn nhân viên tự mua và hoá đơn bị loại. Bánh đặt tại quầy tính toàn bộ giá trị đơn khi đơn hoàn thành.</p>
      <Loi chu={loi} />
      {dang && !dl && <p className="bhq-ghi">Đang tải…</p>}
      {dl && !nv.length && <p className="bhq-ghi">Chưa có doanh số trong khoảng này.</p>}
      {nv.length > 0 && <div className="ds-tong"><span>Tổng {nv.length} nhân viên</span><b>{so(tongAll)}</b></div>}
      <div className="ds-nv">
        {nv.map((r, i) => {
          const caCua = ca.filter((c) => c.staff_id === r.staff_id);
          const mo = moNv === r.staff_id;
          return (
            <div key={r.staff_id} className={`ds-the ${mo ? 'mo' : ''}`}>
              <button type="button" className="ds-dau" onClick={() => { setMoNv(mo ? null : r.staff_id); setMoCa(null); }} aria-expanded={mo}>
                <span className="ds-hang">{i + 1}</span>
                <span className="ds-ten"><b>{r.ten}</b><small>{r.so_ca} ca · {r.so_hd} hoá đơn{r.so_don_dat ? ` · ${r.so_don_dat} đơn đặt` : ''}</small></span>
                <b className="ds-so">{so(r.tong)}</b>
              </button>
              <div className="ds-luoi">
                <div><span>Bán tại quầy</span><b>{so(r.ban_tinh)}</b></div>
                <div><span>Đặt tại quầy</span><b>{so(r.dat_quay)}</b></div>
                {Number(r.ck_cho) > 0 && <div><span>CK chờ xác nhận</span><b className="cam">{so(r.ck_cho)}</b></div>}
                {Number(r.no_chua_tra) > 0 && <div><span>Nợ chưa trả</span><b className="cam">{so(r.no_chua_tra)}</b></div>}
                {Number(r.so_hd_loai) > 0 && <div><span>Loại / NV mua ({r.so_hd_loai})</span><b className="do">{so(r.bi_loai)}</b></div>}
                {Number(r.so_hd_canh_bao) > 0 && <div><span>HĐ có cảnh báo</span><b className="cam">{r.so_hd_canh_bao}</b></div>}
              </div>
              {mo && (
                <div className="ds-ca">
                  {!caCua.length && <p className="bhq-ghi">Không có ca nào trong khoảng này (doanh số từ đơn đặt hoặc bán trong ca người khác).</p>}
                  {caCua.map((c) => (
                    <div key={c.id} className="ds-ca-dong">
                      <button type="button" className="ds-ca-dau" onClick={() => setMoCa(moCa === c.id ? null : c.id)} aria-expanded={moCa === c.id}>
                        <span><b>{c.code} · {c.store}</b><small>{new Date(c.opened_at).toLocaleDateString('vi-VN', { weekday: 'short', day: '2-digit', month: '2-digit' })} · {gioPhut(c.opened_at)}–{c.status === 'open' ? 'đang mở' : gioPhut(c.closed_at)} · {c.so_hd} HĐ</small></span>
                        <b>{so(c.ban_tinh)}</b>
                      </button>
                      <div className="ds-ca-phu">
                        {Number(c.ck_cho) > 0 && <span>CK chờ {so(c.ck_cho)}</span>}
                        {Number(c.nguoi_khac) > 0 && <span className="cam">Người khác bán {so(c.nguoi_khac)}</span>}
                        {c.lech != null && <span className={Number(c.lech) < 0 ? 'do' : Number(c.lech) > 0 ? 'cam' : ''}>Lệch két {Number(c.lech) > 0 ? '+' : ''}{so(c.lech)}</span>}
                        {Number(c.so_banh_lech) > 0 && <span className="do">{c.so_banh_lech} món bánh lệch</span>}
                        <MoAnh path={c.anh_vao} chu="Ảnh két vào" /><MoAnh path={c.anh_ket} chu="Ảnh két ra" />
                      </div>
                      {Number(c.so_banh_lech) > 0 && (
                        <div className="ds-ca-phu">{(c.kiem_banh || []).filter((k) => Number(k.lech) !== 0).map((k) => <span key={`${k.product_id}|${k.size || ''}`}>{k.name}: máy {so(k.he_thong)}, đếm {so(k.dem)}</span>)}</div>
                      )}
                      {moCa === c.id && <HoaDonCa ca={c} duocLoai={duocLoai} onDoi={tai} />}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </HopT>
  );
}

// ── Xếp hạng tháng: ai cũng xem — chỉ thấy tên + hạng, không thấy tiền của người khác ──
export function XepHang({ onDong }) {
  const [thang, setThang] = useState(0); // 0 = tháng này, -1 = tháng trước
  const [dl, setDl] = useState(null);
  const [loi, setLoi] = useState('');
  useEffect(() => {
    let h = false;
    const n = new Date(); const d = new Date(n.getFullYear(), n.getMonth() + thang, 1);
    setDl(null); setLoi('');
    goi('pos_xep_hang_thang', { p_thang: ngayO(d) }).then((v) => { if (!h) setDl(v); }).catch((e) => { if (!h) setLoi(chuLoi(e)); });
    return () => { h = true; };
  }, [thang]);
  return (
    <HopT tieuDe={`Xếp hạng bán hàng${dl ? ` · tháng ${dl.thang}` : ''}`} onDong={onDong}
      chan={<button type="button" className="bhq-nut chinh" onClick={onDong}>Xong</button>}>
      <nav className="bhq-tab">{[[0, 'Tháng này'], [-1, 'Tháng trước']].map(([k, l]) => <button key={k} type="button" className={thang === k ? 'on' : ''} onClick={() => setThang(k)}>{l}</button>)}</nav>
      <Loi chu={loi} />
      {!dl && !loi && <p className="bhq-ghi">Đang tải…</p>}
      {dl && (
        <>
          <div className="xh-toi">
            {dl.cua_toi ? <>Bạn đang <b>hạng {dl.cua_toi.hang}</b> · doanh số của bạn <b>{so(dl.cua_toi.tong)}</b></>
              : <>Bạn chưa có doanh số tháng này{Number(dl.tong_cua_toi) > 0 ? ` (${so(dl.tong_cua_toi)})` : ''}.</>}
          </div>
          {!dl.bang.length ? <p className="bhq-ghi">Chưa có ai bán trong tháng này.</p> : (
            <ol className="xh-ds">
              {dl.bang.map((r, i) => (
                <li key={`${r.hang}-${i}`} className={r.la_toi ? 'toi' : ''}>
                  <span className={`xh-hang h${r.hang <= 3 ? r.hang : ''}`}>{r.hang}</span><span>{r.ten}{r.la_toi ? ' (bạn)' : ''}</span>
                </li>
              ))}
            </ol>
          )}
          <p className="bhq-ghi">Chỉ hiện thứ hạng — mỗi người chỉ xem được doanh số của chính mình.</p>
        </>
      )}
    </HopT>
  );
}
