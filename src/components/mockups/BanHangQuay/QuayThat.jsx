import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, RefreshCw, Camera, Search, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, ListFilter, Check } from 'lucide-react';
import { supabase } from '../../../lib/supabaseClient';
import { goi, chuLoi, anhVietQr, noiDungCk, NGAN_HANG, maMoi, tachId, linkAnh, linkAnhHoaDon, guiHangDoi, taiAnh, lapBanDoHang, themHangQuay, suaHangQuay, xoaHangQuay, vaoCa, nhanCa, lapPhieuQuy, huyChiKet, luuKm, batKm, thongKeKm } from './posThat';
import { locXep, LOAI_KM, THU_KM, kmKhongChay, moTaKm, CHI_NHANH, maVachCode128, maInTem } from './banHangQuayLogic';

// Các hộp thoại chỉ có ở chế độ CHẠY THẬT (ca, duyệt, chuyển khoản, thiết lập, đặt cọc, nhận hàng, báo cáo, nhật ký).
const so = (n) => Math.round(Number(n) || 0).toLocaleString('en-US');
const soTien = (v) => String(v).replace(/\D/g, '');
const ngayGio = (t) => new Date(t).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });
const PT = { tien_mat: 'Tiền mặt', chuyen_khoan: 'Chuyển khoản', the: 'Thẻ', vi: 'Ví', ket_hop: 'Kết hợp' };

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

// Lỗi thường nằm cuối hộp đang cuộn — tự cuộn tới để người bấm thấy ngay (không tưởng nút "chết").
function Loi({ chu }) {
  const ref = useRef(null);
  useEffect(() => { if (chu) ref.current?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' }); }, [chu]);
  return chu ? <p ref={ref} className="kv-loi" role="alert">{chu}</p> : null;
}

// ── Thêm / sửa hàng hoá của quầy (như KiotViet). Món tạo ở đây chỉ có ở Bán tại quầy, không lẫn vào Tạo đơn.
// cu = món đang sửa (null = thêm mới). Database kiểm quyền + mã trùng; trả về dòng sản phẩm để nạp lại danh sách.
export function HangQuay({ cu, dsNhom, onDong, onXong }) {
  const [ma, setMa] = useState('');
  const [ten, setTen] = useState(cu?.ten || '');
  const [nhom, setNhom] = useState(cu ? cu.danhMuc || '' : '');
  const [gia, setGia] = useState(cu ? String(cu.gia ?? '') : '');
  const [maVach, setMaVach] = useState(cu?.maVach || '');
  const [dang, setDang] = useState(false);
  const [loi, setLoi] = useState('');
  const [hoiXoa, setHoiXoa] = useState(false);
  const ok = ten.trim() && gia !== '' && !dang;
  const luu = async () => {
    setDang(true); setLoi('');
    try {
      const row = cu ? await suaHangQuay({ pid: cu.pid, ten, nhom, gia, maVach }) : await themHangQuay({ ten, nhom, gia, ma, maVach });
      onXong(row, cu ? 'sua' : 'them');
    } catch (e) { setLoi(chuLoi(e)); setDang(false); }
  };
  const xoa = async () => {
    if (!hoiXoa) { setHoiXoa(true); return; }
    setDang(true); setLoi('');
    try { await xoaHangQuay(cu.pid); onXong(null, 'xoa'); } catch (e) { setLoi(chuLoi(e)); setDang(false); setHoiXoa(false); }
  };
  return (
    <HopT tieuDe={cu ? `Sửa ${cu.ma}` : 'Thêm hàng hoá'} onDong={dang ? undefined : onDong}
      chan={<>
        {cu && <button type="button" className="bhq-nut phu do" disabled={dang} onClick={xoa}>{hoiXoa ? 'Bấm lần nữa để xoá' : 'Xoá khỏi quầy'}</button>}
        <button type="button" className="bhq-nut phu" disabled={dang} onClick={onDong}>Bỏ qua</button>
        <button type="button" className="bhq-nut chinh" disabled={!ok} onClick={luu}>{dang ? 'Đang lưu…' : 'Lưu'}</button>
      </>}>
      {!cu && <label className="bhq-nhan">Mã hàng<input className="bhq-o" value={ma} onChange={(e) => setMa(e.target.value.toUpperCase().replace(/\s/g, ''))} placeholder="Để trống: máy tự đặt (SP…)" autoCapitalize="characters" maxLength={40} /></label>}
      <label className="bhq-nhan">Tên hàng<input className="bhq-o" autoFocus={!cu} value={ten} onChange={(e) => setTen(e.target.value)} placeholder="Bắt buộc" maxLength={150} /></label>
      <label className="bhq-nhan">Nhóm hàng<input className="bhq-o" list="hq-ds-nhom" value={nhom} onChange={(e) => setNhom(e.target.value)} placeholder="VD: 42Bánh mì (chọn hoặc gõ nhóm mới)" maxLength={60} />
        <datalist id="hq-ds-nhom">{dsNhom.map((n) => <option key={n} value={n} />)}</datalist></label>
      <label className="bhq-nhan">Giá bán<input className="bhq-o" inputMode="numeric" value={gia ? so(gia) : gia} onChange={(e) => setGia(soTien(e.target.value).slice(0, 9))} placeholder="0" /></label>
      <label className="bhq-nhan">Mã vạch<input className="bhq-o" value={maVach} onChange={(e) => setMaVach(e.target.value.trim())} placeholder="Không bắt buộc" maxLength={40} /></label>
      <p className="bhq-ghi">{cu ? 'Sửa tên, nhóm, giá chỉ đổi ở Bán tại quầy, không đổi app đặt đơn. Hoá đơn đã bán giữ giá cũ.'
        : 'Món mới chỉ có ở Bán tại quầy (cả 3 quầy), không hiện ở Tạo đơn. Số tồn: thêm xong vào Kiểm kho nhập số đếm thực tế.'}</p>
      {hoiXoa && <p className="kv-loi" role="alert">Xoá {cu.ma} khỏi quầy? Hoá đơn cũ vẫn giữ. Món còn tồn thì máy không cho xoá.</p>}
      <Loi chu={loi} />
    </HopT>
  );
}

// ── Vào ca: mỗi nhân viên vào ca bằng tài khoản của mình — đếm tiền két + chụp ảnh két ──
// Database chặn: ca người khác đang mở, chưa chấm công (nếu Giám đốc bật), thiếu ảnh.
// Chọn quầy ngay trong hộp Vào ca: app nhớ quầy theo từng máy, nhưng vẫn cho đổi trước khi vào ca
// (bán ở Quốc Lộ 13 mà quên đổi thì cả ca, két, tồn sẽ ghi nhầm sang quầy khác).
export function ChonQuay({ chiNhanh, dsQuay, onDoi }) {
  if (!onDoi || !dsQuay?.length) return null;
  return (
    <label className="bhq-nhan chon-quay">Quầy đang bán
      <span className="chon-quay-o"><select className="bhq-o lon" value={chiNhanh} onChange={(e) => onDoi(e.target.value)} aria-label="Quầy đang bán">
        {dsQuay.map((c) => <option key={c} value={c}>{c}</option>)}
      </select><ChevronDown size={20} /></span>
      <small>Đúng quầy mình đang đứng chưa? Sai thì chọn lại ở đây.</small>
    </label>
  );
}

// Bản nháp "Vào ca" giữ trên máy: nhân viên nhập tiền + chụp ảnh rồi lỡ thoát ra (hoặc điện thoại yếu tự tải lại
// app lúc mở camera) thì mở lại vẫn còn, chỉ việc bấm Vào ca. Giữ 8 giờ, theo từng quầy.
const KHOA_NHAP_CA = 'bhq-nhap-vao-ca';
function docNhapCa(store) {
  try {
    const d = JSON.parse(localStorage.getItem(KHOA_NHAP_CA) || 'null');
    if (d && d.store === store && Date.now() - Number(d.luc || 0) < 8 * 3600000) return d;
  } catch { /* trình duyệt chặn bộ nhớ: bỏ qua */ }
  return null;
}
function ghiNhapCa(d) {
  try { if (d) localStorage.setItem(KHOA_NHAP_CA, JSON.stringify({ ...d, luc: Date.now() })); else localStorage.removeItem(KHOA_NHAP_CA); } catch { /* bỏ qua */ }
}

export function MoCa({ chiNhanh, dsQuay, onDoiChiNhanh, nguoi, onMo, onVeApp, onDong, onTaiLai }) {
  const [tien, setTien] = useState('');
  const [lyDoChi, setLyDoChi] = useState(''); // két ít hơn ca trước vì đã chi tiền ra — ghi rõ chi gì
  const [anh, setAnh] = useState(null);
  const [dangAnh, setDangAnh] = useState(false);
  const [dang, setDang] = useState(false);
  const [loi, setLoi] = useState('');
  // Két ca trước đã đếm — máy tính két theo số này (chống gõ khống tiền đầu ca để rút két).
  const [truoc, setTruoc] = useState(null);
  const [hoiRoi, setHoiRoi] = useState(false); // đã nhập mà chưa bấm Vào ca, lại bấm thoát → nhắc 1 lần
  const [demLai, setDemLai] = useState(false); // như KiotViet: không bắt nhập tiền đầu ca, muốn đếm lại thì mở ô nhập
  const nhap = useRef({});
  const oLoi = useRef(null);
  const luuNhap = (p) => { nhap.current = { ...nhap.current, ...p, store: chiNhanh }; ghiNhapCa(nhap.current); setHoiRoi(false); };
  useEffect(() => { if (loi) oLoi.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }, [loi]);
  useEffect(() => {
    let huy = false;
    const nh = docNhapCa(chiNhanh); // đổi quầy → két ca trước là của quầy khác; lấy lại bản nháp của quầy này nếu có
    nhap.current = nh || { store: chiNhanh };
    setTruoc(null); setTien(nh?.tien ?? ''); setAnh(nh?.anh || null); setLoi(''); setLyDoChi(nh?.lyDo || ''); setHoiRoi(false);
    setDemLai(!!(nh?.tien ?? ''));
    goi('pos_tien_dau_ca', { p_store: chiNhanh }).then((r) => { if (!huy && r?.co) setTruoc(r); }).catch(() => {});
    return () => { huy = true; };
  }, [chiNhanh]);
  const lech = truoc && demLai && tien !== '' ? Number(tien) - Number(truoc.so) : 0;
  const chonAnh = async (f) => {
    setDangAnh(true); setLoi('');
    try { const a = await taiAnh(f, 'ket'); setAnh(a); luuNhap({ anh: a }); } catch (e) { setLoi(`Không tải được ảnh: ${chuLoi(e)}`); }
    setDangAnh(false);
  };
  // Thoát khi đã nhập mà chưa vào ca: nhắc 1 lần (bấm lần nữa mới thoát) — số tiền + ảnh vẫn giữ lại.
  const roi = (fn) => () => {
    if (!dang && (tien !== '' || anh) && !hoiRoi) { setHoiRoi(true); return; }
    fn?.();
  };
  const mo = async () => {
    const ly = lech < 0 ? lyDoChi.trim() : '';
    if (ly && ly.length < 3) { setLoi('Ghi rõ đã chi tiền làm gì (ít nhất vài chữ)'); return; }
    setDang(true); setLoi('');
    try { const r = await vaoCa({ store: chiNhanh, tien: demLai ? tien : '', anh, lyDoChi: ly, duPhong: truoc?.so }); ghiNhapCa(null); onMo(r); } catch (e) {
      const m = chuLoi(e); setLoi(m); setDang(false);
      if (/đang mở/.test(m)) onTaiLai?.(); // người khác vừa vào ca ở máy khác → tải lại để hiện ca của họ
    }
  };
  return (
    <HopT tieuDe={`Vào ca · ${chiNhanh}`} onDong={roi(onDong)}
      chan={<><button type="button" className="bhq-nut phu" onClick={roi(onVeApp)}>{hoiRoi ? 'Vẫn thoát' : 'Về app Sumi'}</button><button type="button" className="bhq-nut chinh" disabled={dang || dangAnh} onClick={mo}>{dang ? 'Đang vào ca…' : 'Vào ca · bắt đầu bán'}</button></>}>
      <ChonQuay chiNhanh={chiNhanh} dsQuay={dsQuay} onDoi={dang ? null : onDoiChiNhanh} />
      <p className="bhq-ghi">Chào {nguoi}. Bấm Vào ca là bán được. Mọi hoá đơn trong ca tính doanh số cho bạn.</p>
      <div className="mc-dau">
        <div><span>Tiền đầu ca</span><b>{so(truoc ? truoc.so : 0)}</b></div>
        <small>{truoc
          ? <>Két ca trước <b>{truoc.ca}</b>{truoc.ten ? ` (${truoc.ten})` : ''} để lại lúc {ngayGio(truoc.luc)}{truoc.chua_dem ? ' — chưa ai đếm két, máy tự tính' : ''}. Không cần nhập, máy tự lấy số này.</>
          : 'Chưa có ca trước — máy tính két từ 0. Không cần nhập.'}</small>
        {!demLai && <button type="button" className="mc-dem" onClick={() => setDemLai(true)}>Đếm lại két / nhập số khác</button>}
      </div>
      {lech > 0 && <p className="kv-loi" role="alert">Bạn nhập nhiều hơn ca trước {so(lech)}. Vẫn vào ca được, nhưng máy giữ số ca trước và báo Giám đốc kiểm lại.</p>}
      {lech < 0 && (
        <div className="mc-chi">
          <p><b>Két ít hơn ca trước {so(-lech)}.</b> Vẫn vào ca được. Nếu có người đã <b>chi tiền ra</b> lúc chưa ai vào ca (mua đồ, trả tiền ship…), ghi rõ ở đây — máy ghi thành phiếu chi {so(-lech)}, két ca bạn tính đúng {so(tien)}.</p>
          <textarea className="bhq-o" rows={2} maxLength={300} value={lyDoChi} onChange={(e) => { setLyDoChi(e.target.value); luuNhap({ lyDo: e.target.value }); }}
            placeholder="VD: tối qua chi 364k mua bột, trả tiền ship" aria-label="Đã chi tiền làm gì" />
          <small>{lyDoChi.trim() ? 'Giám đốc sẽ nhận báo phiếu chi này.' : 'Để trống: máy tính két theo ca trước, cuối ca sẽ thấy thiếu và báo Giám đốc.'}</small>
        </div>
      )}
      {demLai && <label className="bhq-nhan">Tiền mặt đếm được trong két (không bắt buộc)<input className="bhq-o lon" autoFocus inputMode="numeric" value={tien ? so(tien) : tien} placeholder={truoc ? so(truoc.so) : '0'} onChange={(e) => { const v = soTien(e.target.value); setTien(v); luuNhap({ tien: v }); }} /></label>}
      <ChupAnh path={anh} dang={dangAnh} onChon={chonAnh} chu="Chụp ảnh két tiền (không bắt buộc)" />
      <div ref={oLoi}><Loi chu={loi} /></div>
      {hoiRoi && <p className="kv-loi mc-chua-vao" role="alert"><b>Bạn CHƯA vào ca.</b> Số tiền và ảnh đã giữ lại — bấm nút xanh <b>"Vào ca · bắt đầu bán"</b> để bắt đầu bán. Bấm "Vẫn thoát" nếu muốn ra ngoài.</p>}
    </HopT>
  );
}

// ── Nhận ca: người trước quên kết ca → người sau bán tiếp ngay, không phải chờ ──
// Máy kết hộ ca cũ (ghi "X không kết ca — Y nhận ca", báo Giám đốc) rồi mở ca của mình.
// Đếm két và ảnh két đều KHÔNG bắt buộc (như KiotViet); có đếm thì ca cũ biết thiếu/dư bao nhiêu.
export function NhanCa({ chiNhanh, dsQuay, onDoiChiNhanh, caMo, cuaToi = false, nguoi, onNhan, onKetCa, onVeApp, onDong, onTaiLai }) {
  const [dem, setDem] = useState('');
  const [moDem, setMoDem] = useState(false);
  const [anh, setAnh] = useState(null);
  const [dangAnh, setDangAnh] = useState(false);
  const [dang, setDang] = useState(false);
  const [loi, setLoi] = useState('');
  const oLoi = useRef(null);
  useEffect(() => { if (loi) oLoi.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }, [loi]);
  useEffect(() => { setDem(''); setMoDem(false); setAnh(null); setLoi(''); }, [caMo.id]);
  const ten = caMo.opened_by_name || 'người trước';
  const homQua = new Date(caMo.opened_at).toDateString() !== new Date().toDateString();
  const chonAnh = async (f) => {
    setDangAnh(true); setLoi('');
    try { setAnh(await taiAnh(f, 'ket')); } catch (e) { setLoi(`Không tải được ảnh: ${chuLoi(e)}`); }
    setDangAnh(false);
  };
  const nhan = async () => {
    setDang(true); setLoi('');
    try { const r = await nhanCa({ store: chiNhanh, caId: caMo.id, dem: moDem ? dem : '', anh }); onNhan(r); } catch (e) {
      const m = chuLoi(e); setLoi(m); setDang(false);
      if (/vừa thay đổi/.test(m)) onTaiLai?.();
    }
  };
  return (
    <HopT tieuDe={cuaToi ? 'Ca hôm trước của bạn chưa kết' : `Ca của ${ten} chưa kết`} onDong={dang ? undefined : onDong}
      chan={<><button type="button" className="bhq-nut phu" disabled={dang} onClick={onVeApp}>Về app Sumi</button><button type="button" className="bhq-nut chinh" disabled={dang || dangAnh} onClick={nhan}>{dang ? 'Đang nhận ca…' : 'Nhận ca · bán tiếp'}</button></>}>
      <ChonQuay chiNhanh={chiNhanh} dsQuay={dsQuay} onDoi={dang ? null : onDoiChiNhanh} />
      <p className="bhq-ghi">{chiNhanh} còn ca <b>{caMo.code}</b> của <b>{ten}</b> mở từ {ngayGio(caMo.opened_at)}{homQua ? ' (hôm trước)' : ''}.
        {cuaToi ? ' Bấm Nhận ca để mở ca mới cho hôm nay.' : ` Không cần chờ ${ten} — bấm Nhận ca là bán được ngay.`}</p>
      <div className="mc-dau">
        <small>Máy sẽ <b>tự kết ca {caMo.code}</b> (vẫn giữ đủ hoá đơn, doanh số tính cho {cuaToi ? 'bạn' : ten}), báo Giám đốc, rồi mở ca mới cho {cuaToi ? 'bạn' : nguoi || 'bạn'}.</small>
        {!moDem && <button type="button" className="mc-dem" onClick={() => setMoDem(true)}>Đếm két giúp ca cũ (không bắt buộc)</button>}
      </div>
      {moDem && <label className="bhq-nhan">Tiền mặt đếm được trong két<input className="bhq-o lon" autoFocus inputMode="numeric" value={dem ? so(dem) : dem} placeholder="Để trống nếu không đếm" onChange={(e) => setDem(soTien(e.target.value))} /></label>}
      <ChupAnh path={anh} dang={dangAnh} onChon={chonAnh} chu="Chụp ảnh két tiền lúc nhận ca (không bắt buộc)" />
      {cuaToi && onKetCa && <button type="button" className="bhq-nut phu mc-ket-thuong" disabled={dang} onClick={onKetCa}>Hoặc kết ca {caMo.code} như thường (đếm két + bánh)</button>}
      <div ref={oLoi}><Loi chu={loi} /></div>
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
        <div key={c.id} className={`bhq-the ${Number(c.diff) < 0 ? 'no-do' : Number(c.diff) > 0 || c.counted_cash == null ? 'no-vang' : ''}`}>
          <div><b>{c.code}</b> · {c.store_location} · {c.closed_by_name} · đóng {ngayGio(c.closed_at)}</div>
          <div>Hệ thống {so(c.expected_cash)} · {c.counted_cash == null ? <b>chưa ai đếm két (máy kết hộ)</b> : <>đếm được {so(c.counted_cash)} · <b>{Number(c.diff) > 0 ? '+' : ''}{so(c.diff)}</b></>}{c.note ? ` · "${c.note}"` : ''}</div>
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
export function DatCoc({ hd, tong, chiNhanh, oKhach = null, onXong, onDong }) {
  const [ngay, setNgay] = useState(() => { const d = new Date(Date.now() + 86400000); d.setHours(9, 0, 0, 0); const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T09:00`; });
  const [coc, setCoc] = useState(String(Math.round(tong.canTra / 2 / 1000) * 1000));
  const [pt, setPt] = useState('tien_mat');
  const [ghi, setGhi] = useState(hd.ghiChu || '');
  const [dang, setDang] = useState(false);
  const [loi, setLoi] = useState('');
  const coKhach = !!hd.khach?.id;
  const tao = async () => {
    if (!coKhach) { setLoi('Đặt bánh phải có khách (tên + SĐT) — tìm khách ở ô trên, chưa có thì bấm + để thêm.'); return; }
    if (!ngay) { setLoi('Chọn ngày giờ khách lấy bánh.'); return; }
    setDang(true); setLoi('');
    try {
      const n = new Date(); const p2 = (x) => String(x).padStart(2, '0');
      const ma = `SUMI-${n.getFullYear()}${p2(n.getMonth() + 1)}${p2(n.getDate())}-${String(n.getHours() * 3600 + n.getMinutes() * 60 + n.getSeconds()).padStart(5, '0')}`;
      // Nhóm hàng KiotViet (42Bánh kem, 13Bánh lạnh…) cũng đi luồng bếp bánh kem.
      const coKem = hd.dong.some((d) => NHOM_KEM.includes(d.danhMuc) || /bánh kem|bánh lạnh/i.test(d.danhMuc || ''));
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
        {!coKhach && oKhach && <div className="bhq-dc-khach">{oKhach}</div>}
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
      <p className="bhq-ghi">{phieu.chuyen ? <><b>{phieu.tuCN || 'Cửa hàng khác'}</b> ({phieu.nguoi}) chuyển sang lúc {ngayGio(phieu.luc)}.</> : <>{phieu.nguoi} ghi giao lúc {ngayGio(phieu.luc)}.</>} Đếm bánh thật rồi sửa số nếu thiếu. Lệch số → Giám đốc được báo.</p>
      {phieu.dong.map((d) => { const m = matHang.find((x) => x.ma === d.ma); return (
        <div key={d.ma} className="tlq-dong"><span>{m ? `${m.ten}${m.size ? ` - ${m.size}` : ''}` : d.ma}<small>{phieu.chuyen ? 'Bên gửi ghi' : 'Bếp ghi giao'} {so(d.sl)}</small></span>
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
  tu_choi_giam_gia: 'Từ chối giảm giá', dong_y_huy_hd: 'Duyệt huỷ HĐ', tu_choi_huy_hd: 'Từ chối huỷ HĐ', thu_don_coc: 'Thu cọc', thu_don_thu_con_lai: 'Thu tiền lấy bánh', chi_ket: 'Chi từ két', huy_chi_ket: 'Huỷ phiếu chi',
  them_hang: 'Thêm hàng', sua_hang: 'Sửa hàng', xoa_hang: 'Xoá hàng khỏi quầy', hien_hang: 'Hiện lại hàng' };
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
        <h2>Báo cáo · {tatCa ? 'Tất cả cửa hàng' : chiNhanh}</h2>
        <nav className="bhq-tab">{KY.map(([k, l]) => <button key={k} type="button" className={ky === k ? 'on' : ''} onClick={() => setKy(k)}>{l}</button>)}</nav>
        {ky === 'tuy_chinh' && (
          <div className="bct-khoang">
            <label>Từ ngày<input type="date" value={tu} max={den || undefined} onChange={(e) => setTu(e.target.value)} /></label>
            <label>Đến ngày<input type="date" value={den} min={tu || undefined} max={ngayO(Date.now())} onChange={(e) => setDen(e.target.value)} /></label>
          </div>
        )}
        <label className="kv-cong-tac nho"><span>Gộp tất cả cửa hàng</span><input type="checkbox" checked={tatCa} onChange={(e) => setTatCa(e.target.checked)} /><i /></label>
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
            <R t="Thẻ" v={so(bc.the)} /><R t="Ví" v={so(bc.vi)} /><R t="Ghi nợ mới" v={so(bc.ghi_no)} /><R t="Thu nợ cũ" v={so(bc.thu_no)} /><R t="Thu đơn đặt (cọc + lấy bánh)" v={so(bc.thu_don)} />
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
// ── Phiếu chi tiền từ két (như KiotViet): lấy tiền mặt trong két ra trả/mua gì → ghi ở đây để máy trừ vào két phải có.
// Người đang giữ ca hoặc Quản lý ghi; báo Giám đốc mỗi phiếu. Ghi nhầm thì huỷ (khi ca còn mở).
// Như KiotViet "Lập phiếu thu / Lập phiếu chi" (quỹ tiền mặt két).
export const LOAI_PHIEU_CHI = ['Chi phí nguyên vật liệu', 'Chi tiền mua hàng', 'Chi trả lương, ứng lương', 'Chi phí vận chuyển, ship', 'Chi tiền điện nước, mặt bằng', 'Chi nộp tiền về công ty', 'Chi phí khác'];
export const LOAI_PHIEU_THU = ['Thu tiền nộp thêm vào két', 'Thu tiền khách trả', 'Thu tiền hoàn ứng', 'Thu khác'];
export function ChiKet({ caMo, laQl = false, uid, onDong, onXong }) {
  const [ds, setDs] = useState(null);
  const [kind, setKind] = useState('chi');
  const [loai, setLoai] = useState('');
  const [doiTuong, setDoiTuong] = useState('');
  const [tien, setTien] = useState('');
  const [lyDo, setLyDo] = useState('');
  const [anh, setAnh] = useState(null);
  const [dangAnh, setDangAnh] = useState(false);
  const [dang, setDang] = useState(false);
  const [loi, setLoi] = useState('');
  const [huy, setHuy] = useState(null); // { id, lyDo }
  const maPhieu = useRef(maMoi());
  const tai = async () => {
    const { data, error } = await supabase.from('pos_cash_outs').select('*')
      .eq('shift_id', caMo.id).order('created_at', { ascending: false });
    setDs(error ? [] : data || []);
  };
  useEffect(() => { tai(); }, [caMo.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const chonAnh = async (f) => {
    setDangAnh(true); setLoi('');
    try { setAnh(await taiAnh(f, 'chi')); } catch (e) { setLoi(`Không tải được ảnh: ${chuLoi(e)}`); }
    setDangAnh(false);
  };
  const luu = async () => {
    const thu = kind === 'thu';
    if (!(Number(tien) > 0)) { setLoi(thu ? 'Nhập số tiền thu vào két' : 'Nhập số tiền đã chi'); return; }
    if (lyDo.trim().length < 3) { setLoi(thu ? 'Ghi rõ thu tiền gì' : 'Ghi rõ chi tiền làm gì'); return; }
    setDang(true); setLoi('');
    try {
      const p = await lapPhieuQuy({ id: maPhieu.current, caId: caMo.id, kind, tien, lyDo: lyDo.trim(), loai, doiTuong: doiTuong.trim(), anh });
      maPhieu.current = maMoi(); setTien(''); setLyDo(''); setAnh(null); setLoai(''); setDoiTuong('');
      await tai(); onXong?.(`Đã ghi phiếu ${thu ? 'thu' : 'chi'} ${p.code}: ${so(p.amount)}`);
    } catch (e) { setLoi(chuLoi(e)); }
    setDang(false);
  };
  const xacNhanHuy = async () => {
    if (!huy?.lyDo?.trim()) { setLoi('Ghi lý do huỷ phiếu'); return; }
    setDang(true); setLoi('');
    try { await huyChiKet(huy.id, huy.lyDo.trim()); setHuy(null); await tai(); } catch (e) { setLoi(chuLoi(e)); }
    setDang(false);
  };
  const thu = kind === 'thu';
  const conHieuLuc = (ds || []).filter((p) => p.status === 'xong');
  const tongChi = conHieuLuc.filter((p) => (p.kind || 'chi') === 'chi').reduce((a, p) => a + Number(p.amount), 0);
  const tongThu = conHieuLuc.filter((p) => p.kind === 'thu').reduce((a, p) => a + Number(p.amount), 0);
  return (
    <HopT tieuDe={`Thu / chi tiền két · ${caMo.code}`} onDong={dang ? undefined : onDong}
      chan={<><button type="button" className="bhq-nut phu" disabled={dang} onClick={onDong}>Đóng</button>
        <button type="button" className="bhq-nut chinh" disabled={dang || dangAnh} onClick={luu}>{dang ? 'Đang lưu…' : thu ? 'Ghi phiếu thu' : 'Ghi phiếu chi'}</button></>}>
      <div className="bhq-goi pq-loai" role="radiogroup" aria-label="Loại phiếu">
        {[['chi', 'Phiếu chi (lấy tiền ra)'], ['thu', 'Phiếu thu (bỏ tiền vào)']].map(([k, l]) => (
          <button key={k} type="button" role="radio" aria-checked={kind === k} className={kind === k ? 'on' : ''} onClick={() => { setKind(k); setLoai(''); setLoi(''); }}>{l}</button>))}
      </div>
      <p className="bhq-ghi">{thu ? 'Bỏ thêm tiền mặt vào két (VD: chủ tiệm nộp tiền lẻ) thì ghi ở đây — máy cộng vào két phải có lúc kết ca.'
        : 'Lấy tiền mặt trong két ra trả/mua gì thì ghi ở đây — máy trừ vào két phải có lúc kết ca.'} Giám đốc nhận báo từng phiếu.</p>
      <label className="bhq-nhan">{thu ? 'Số tiền thu' : 'Số tiền chi'}<input className="bhq-o lon" inputMode="numeric" value={tien ? so(tien) : ''} onChange={(e) => setTien(soTien(e.target.value).slice(0, 9))} placeholder="0" /></label>
      <label className="bhq-nhan">{thu ? 'Loại thu' : 'Loại chi'}
        <select className="bhq-o" value={loai} onChange={(e) => setLoai(e.target.value)}>
          <option value="">{thu ? 'Chọn loại thu' : 'Chọn loại chi'}</option>{(thu ? LOAI_PHIEU_THU : LOAI_PHIEU_CHI).map((l) => <option key={l}>{l}</option>)}
        </select></label>
      <label className="bhq-nhan">{thu ? 'Người nộp' : 'Người nhận'}<input className="bhq-o" maxLength={120} value={doiTuong} onChange={(e) => setDoiTuong(e.target.value)} placeholder={thu ? 'VD: chủ tiệm' : 'VD: anh giao đá'} /></label>
      <label className="bhq-nhan">{thu ? 'Thu tiền gì' : 'Chi làm gì'}<textarea className="bhq-o" rows={2} maxLength={300} value={lyDo} onChange={(e) => setLyDo(e.target.value)} placeholder={thu ? 'VD: nộp thêm tiền lẻ để thối' : 'VD: mua đá viên, trả tiền ship, ứng lương…'} /></label>
      <ChupAnh path={anh} dang={dangAnh} onChon={chonAnh} chu={thu ? 'Chụp ảnh tiền (nên có)' : 'Chụp hoá đơn / biên nhận (nên có)'} />
      <Loi chu={loi} />
      <h4 className="kc-tieu">Phiếu ca này{tongThu ? ` · thu ${so(tongThu)}` : ''}{tongChi ? ` · chi ${so(tongChi)}` : ''}</h4>
      {ds == null ? <p className="bhq-ghi">Đang tải…</p> : !ds.length ? <p className="bhq-ghi">Chưa có phiếu nào.</p> : (
        <div className="pc-ds">
          {ds.map((p) => (
            <div key={p.id} className={`pc-dong ${p.status === 'huy' ? 'huy' : ''}`}>
              <div className="r"><b>{p.code}{p.truoc_ca ? ' · trước khi vào ca' : ''}</b><b className={p.status === 'huy' ? '' : p.kind === 'thu' ? 'xanh-la' : 'do'}>{p.status === 'huy' ? 'Đã huỷ' : `${p.kind === 'thu' ? '+' : '-'}${so(p.amount)}`}</b></div>
              <div className="mo">{[p.loai, p.reason, p.doi_tuong && `${p.kind === 'thu' ? 'nộp' : 'nhận'}: ${p.doi_tuong}`, p.created_by_name, ngayGio(p.created_at)].filter(Boolean).join(' · ')}</div>
              {p.status === 'huy' && p.cancel_reason && <div className="mo">Lý do huỷ: {p.cancel_reason}</div>}
              {p.status === 'xong' && (laQl || p.created_by === uid) && (huy?.id === p.id
                ? <div className="pc-huy"><input className="bhq-o" autoFocus value={huy.lyDo} onChange={(e) => setHuy({ id: p.id, lyDo: e.target.value })} placeholder="Lý do huỷ (vd: ghi nhầm số)" />
                  <button type="button" className="bhq-nut phu" disabled={dang} onClick={() => setHuy(null)}>Thôi</button>
                  <button type="button" className="bhq-nut phu do" disabled={dang} onClick={xacNhanHuy}>Huỷ phiếu</button></div>
                : <button type="button" className="pc-nut-huy" onClick={() => setHuy({ id: p.id, lyDo: '' })}>Huỷ phiếu này</button>)}
            </div>
          ))}
        </div>
      )}
    </HopT>
  );
}

export function KetCaThat({ caMo, chiNhanh, matHang = [], onDong, onKet }) {
  const [dem, setDem] = useState('');
  const [ghi, setGhi] = useState('');
  const [anh, setAnh] = useState(null);
  const [dangAnh, setDangAnh] = useState(false);
  const [banh, setBanh] = useState(null); // [{ khoa, product_id, size, name }] — bánh máy đang ghi còn trên kệ
  const [demBanh, setDemBanh] = useState({});
  const [moBanh, setMoBanh] = useState(false); // như KiotViet: đếm bánh không bắt buộc — bấm mới mở
  const [dang, setDang] = useState(false);
  const [loi, setLoi] = useState('');
  const [xong, setXong] = useState(null);
  const [phieuChi, setPhieuChi] = useState([]); // phiếu chi từ két của ca này (đã trừ vào két phải có)
  useEffect(() => {
    let h = false;
    supabase.from('pos_cash_outs').select('*').eq('shift_id', caMo.id).eq('status', 'xong').order('created_at')
      .then(({ data, error }) => { if (!h && !error) setPhieuChi(data || []); });
    return () => { h = true; };
  }, [caMo.id]);
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
  const daDem = (banh || []).filter((b) => demBanh[b.khoa] != null && demBanh[b.khoa] !== '');
  const dong = async () => {
    if (dem === '') { setLoi('Nhập số tiền mặt đếm được trong két'); return; }
    setDang(true); setLoi('');
    try {
      // Việc làm lúc mất mạng phải lên database TRƯỚC khi chốt két — không thì tiền của chúng rơi sang ca sau.
      const { conLai } = await guiHangDoi();
      if (conLai > 0) {
        setLoi(`Còn ${conLai} việc làm lúc mất mạng chưa gửi lên được. Đợi có mạng (thanh đỏ trên cùng biến mất) rồi bấm Kết ca lại.`);
        setDang(false); return;
      }
      const stock = daDem.map((b) => ({ product_id: b.product_id, size: b.size, name: b.name, dem: Number(demBanh[b.khoa]) || 0 }));
      const s = await goi('pos_ket_ca', { p_shift: caMo.id, p_counted: Number(dem) || 0, p_note: ghi.trim() || null, p_photo_url: anh, p_stock: stock });
      const sl = s.summary || {};
      setXong({
        ma: s.code, nguoi: s.closed_by_name, chiNhanh, moLuc: new Date(s.opened_at).getTime(), dongLuc: new Date(s.closed_at).getTime(),
        dauCa: Number(s.opening_cash), banGiao: Number(s.counted_cash), ghiChu: s.note || '',
        ban: sl.ban || {}, thu: sl.thu_no || {}, donDat: sl.don_dat || {}, ghiNo: Number(sl.ban?.ghi_no || 0), soHoaDon: sl.so_hoa_don,
        hoanTien: Number(sl.hoan_tien_huy || 0), tienMatTrongCa: Number(sl.tien_mat_trong_ca || 0), cuoiCa: Number(s.expected_cash), chenh: Number(s.diff),
        chiKet: Number(sl.chi_ket || 0), phieuChi: sl.phieu_chi || [], thuKet: Number(sl.thu_ket || 0), phieuThu: sl.phieu_thu || [],
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
          {(xong.chiKet > 0 || xong.thuKet > 0) && <div><span>Thu tiền mặt bán hàng trong ca</span><b>{so(xong.tienMatTrongCa + xong.chiKet - xong.thuKet)}</b></div>}
          {xong.thuKet > 0 && <div><span>Phiếu thu vào két ({xong.phieuThu.length} phiếu)</span><b className="xanh-la">+{so(xong.thuKet)}</b></div>}
          {xong.chiKet > 0 && <div><span>Chi từ két ({xong.phieuChi.length} phiếu)</span><b className="do">-{so(xong.chiKet)}</b></div>}
          <div><span>Tiền mặt trong ca{xong.chiKet > 0 || xong.thuKet > 0 ? ' (sau thu/chi)' : ''}</span><b>{so(xong.tienMatTrongCa)}</b></div>
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
      chan={<><button type="button" className="bhq-nut phu" onClick={onDong}>Bỏ qua</button><button type="button" className="bhq-nut chinh" disabled={dang || dangAnh} onClick={dong}>{dang ? 'Đang kết ca…' : 'Kết ca'}</button></>}>
      <div className="bhq-bang">
        <div><span>Ca</span><b>{caMo.code}</b></div>
        <div><span>Vào ca lúc</span><b>{ngayGio(caMo.opened_at)} · {caMo.opened_by_name}</b></div>
        <div><span>Tiền đầu ca</span><b>{so(caMo.opening_cash)}</b></div>
        {phieuChi.some((p) => p.kind === 'thu') && <div><span>Phiếu thu vào két ({phieuChi.filter((p) => p.kind === 'thu').length})</span><b className="xanh-la">+{so(phieuChi.filter((p) => p.kind === 'thu').reduce((a, p) => a + Number(p.amount), 0))}</b></div>}
        {phieuChi.some((p) => (p.kind || 'chi') === 'chi') && <div><span>Phiếu chi từ két ({phieuChi.filter((p) => (p.kind || 'chi') === 'chi').length})</span><b className="do">-{so(phieuChi.filter((p) => (p.kind || 'chi') === 'chi').reduce((a, p) => a + Number(p.amount), 0))}</b></div>}
      </div>
      {phieuChi.length > 0 && <p className="bhq-ghi">{phieuChi.map((p) => `${p.code}${p.truoc_ca ? ' (trước khi vào ca)' : ''}: ${p.kind === 'thu' ? '+' : '-'}${so(p.amount)} — ${p.reason}`).join(' · ')}</p>}
      <label className="bhq-nhan">Tiền mặt đếm được trong két<input className="bhq-o lon" autoFocus inputMode="numeric" value={dem ? so(dem) : dem} onChange={(e) => setDem(soTien(e.target.value))} placeholder="Đếm hết rồi nhập" /></label>
      <ChupAnh path={anh} dang={dangAnh} onChon={chonAnh} chu="Chụp ảnh két tiền (không bắt buộc)" />
      <button type="button" className="kc-tieu kc-mo" onClick={() => setMoBanh((v) => !v)} aria-expanded={moBanh}>
        <span>Đếm bánh trên kệ <small>(không bắt buộc{daDem.length ? ` · đã đếm ${daDem.length} món` : ''})</small></span>{moBanh ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
      </button>
      {!moBanh ? null : banh == null ? <p className="bhq-ghi">Đang tải danh sách bánh…</p>
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
      <label className="bhq-nhan">Ghi chú (đổi tiền, giao ca…). Có chi tiền thì ghi ở mục "Chi tiền từ két" (menu Khác) để máy trừ.<input className="bhq-o" value={ghi} onChange={(e) => setGhi(e.target.value)} /></label>
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
  const [url, setUrl] = useState(null); // null = đang tải · 'mat' = ảnh quá 90 ngày đã dọn · '' = lỗi mạng
  useEffect(() => { let h = false; setUrl(null); linkAnhHoaDon(path).then((u) => { if (!h) setUrl(u); }); return () => { h = true; }; }, [path]);
  if (!path) return <span className="ds-anh trong">Không ảnh</span>;
  if (url === 'mat') return <span className="ds-anh trong">Ảnh đã xoá</span>;
  if (url === '') return <span className="ds-anh trong">Chưa tải được</span>;
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

// ── Báo cáo cuối ngày (y app KiotViet: Khác → Báo cáo → Cuối ngày) ──
// Nhân viên: database tự khoá chỉ số của chính mình (không có lọc Nhân viên / Người tạo).
const PT_LOC = [['tien_mat', 'Tiền mặt'], ['chuyen_khoan', 'Chuyển khoản'], ['the', 'Thẻ'], ['vi', 'Ví điện tử'], ['diem', 'Điểm'], ['voucher', 'Voucher']];
const LOAI_THU = { hd: 'Bán hàng', thu_no: 'Thu nợ', coc: 'Cọc đơn đặt', lay_banh: 'Thu lấy bánh đặt' };
const LOC_DAU = { nhan_vien: [], nguoi_tao: [], pttt: [], ban: ['giao', 'khong_giao'] };
export function BaoCaoCuoiNgay({ chiNhanh, onVe, onMoHoaDon }) {
  const [ky, setKy] = useState('hom_nay');
  const [loc, setLoc] = useState(LOC_DAU);
  const [nhap, setNhap] = useState(LOC_DAU); // bộ lọc đang chỉnh (chưa Áp dụng)
  const [man, setMan] = useState('bc'); // bc | loc | chon_nv | chon_tao | thu | hang
  const [nhanh, setNhanh] = useState(false); // mở chọn nhân viên thẳng từ nút "Nhân viên" ở đầu báo cáo
  const [moPt, setMoPt] = useState(true);
  const [moBan, setMoBan] = useState(true);
  const [q, setQ] = useState('');
  const [bc, setBc] = useState(null);
  const [loi, setLoi] = useState('');
  useEffect(() => {
    let huy = false;
    setLoi('');
    const [a, b] = khoangKy(ky);
    const gui = { ...loc, pttt: loc.pttt.filter((x) => !['diem', 'voucher'].includes(x)) };
    goi('pos_bao_cao_cuoi_ngay', { p_store: chiNhanh, p_from: new Date(a).toISOString(), p_to: new Date(b).toISOString(), p_loc: gui })
      .then((r) => { if (!huy) setBc(r); }).catch((e) => { if (!huy) setLoi(chuLoi(e)); });
    return () => { huy = true; };
  }, [ky, loc, chiNhanh]);
  const R = ({ t, v, mo }) => (mo
    ? <button type="button" className="bcn-r" onClick={mo}><span>{t}</span><b>{v}<ChevronRight size={16} /></b></button>
    : <div className="bcn-r"><span>{t}</span><b>{v}</b></div>);
  const doi = (k, x) => setNhap((n) => ({ ...n, [k]: n[k].includes(x) ? n[k].filter((y) => y !== x) : [...n[k], x] }));
  const O = ({ on, onClick, chu }) => (
    <button type="button" className="bcn-chk" onClick={onClick} aria-pressed={on}><span>{chu}</span><i className={on ? 'on' : ''}>{on && <Check size={14} strokeWidth={3} />}</i></button>
  );
  const coLoc = loc.nhan_vien.length + loc.nguoi_tao.length + loc.pttt.length > 0 || loc.ban.length < 2;

  if (man === 'chon_nv' || man === 'chon_tao') {
    const nv = man === 'chon_nv';
    const ds = nv ? (bc?.ds_nhan_vien || []).map((t) => [t, t]) : (bc?.ds_nguoi_tao || []).map((x) => [x.id, x.ten]);
    const k = nv ? 'nhan_vien' : 'nguoi_tao';
    const t = q.trim().toLowerCase();
    const hien = ds.filter(([, ten]) => !t || String(ten).toLowerCase().includes(t));
    const du = ds.length > 0 && ds.every(([id]) => nhap[k].includes(id));
    return (
      <div className="xhd bcn">
        <header className="xhd-dau"><button type="button" aria-label="Quay lại" onClick={() => { setQ(''); setMan(nhanh ? 'bc' : 'loc'); }}><ChevronLeft size={24} /></button><h1>{nv ? 'Nhân viên' : 'Người tạo'}</h1>
          {ds.length > 0 && <button type="button" className="bcn-tat-ca" onClick={() => setNhap((n) => ({ ...n, [k]: du ? [] : ds.map(([id]) => id) }))}>{du ? 'Bỏ chọn tất cả' : 'Chọn tất cả'}</button>}</header>
        {ds.length > 8 && <div className="xhd-tim-mo"><label className="o bcn-tim"><Search size={17} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm tên" /></label></div>}
        <div className="xhd-than"><section className="xhd-the">
          {hien.map(([id, ten]) => <O key={id} chu={ten} on={nhap[k].includes(id)} onClick={() => doi(k, id)} />)}
          {!ds.length && <p className="bhq-ghi">Chưa có nhân viên nào được bán hàng.</p>}
          {ds.length > 0 && !hien.length && <p className="bhq-ghi">Không có ai tên như vậy.</p>}
        </section></div>
        {nhanh
          ? <footer className="xhd-chan hai">
            <button type="button" className="phu" onClick={() => setNhap((n) => ({ ...n, [k]: [] }))}>Đặt lại</button>
            <button type="button" className="chinh" onClick={() => { setQ(''); setLoc(nhap); setMan('bc'); }}>Áp dụng</button>
          </footer>
          : <footer className="xhd-chan"><button type="button" className="chinh" onClick={() => { setQ(''); setMan('loc'); }}>Xong</button></footer>}
      </div>
    );
  }
  if (man === 'loc') {
    const tenChon = (k) => (nhap[k].length ? `${nhap[k].length} đã chọn` : 'Tất cả');
    // Tên người đã chọn hiện ngay dưới dòng (như KiotViet)
    const chip = (k) => {
      const ten = k === 'nhan_vien' ? nhap[k] : nhap[k].map((id) => (bc?.ds_nguoi_tao || []).find((x) => x.id === id)?.ten || '?');
      return ten.length ? <span className="bcn-chips">{ten.map((x, i) => <i key={`${x}-${i}`}>{String(x).trim()}</i>)}</span> : null;
    };
    return (
      <div className="xhd bcn">
        <header className="xhd-dau"><button type="button" aria-label="Quay lại" onClick={() => setMan('bc')}><ChevronLeft size={24} /></button><h1>Bộ lọc</h1></header>
        <div className="xhd-than bcn-loc">
          {!bc?.chi_cua_toi && <>
            <button type="button" className="xhd-the bcn-dong" onClick={() => { setNhanh(false); setMan('chon_nv'); }}><span>Nhân viên</span><small>{tenChon('nhan_vien')}</small><ChevronRight size={18} />{chip('nhan_vien')}</button>
            <button type="button" className="xhd-the bcn-dong" onClick={() => { setNhanh(false); setMan('chon_tao'); }}><span>Người tạo</span><small>{tenChon('nguoi_tao')}</small><ChevronRight size={18} />{chip('nguoi_tao')}</button>
          </>}
          <section className="xhd-the">
            <button type="button" className="bcn-nhom" onClick={() => setMoPt((v) => !v)}><span>Phương thức thanh toán</span>{moPt ? <ChevronUp size={18} /> : <ChevronDown size={18} />}</button>
            {moPt && PT_LOC.map(([k, l]) => <O key={k} chu={l} on={nhap.pttt.includes(k)} onClick={() => doi('pttt', k)} />)}
          </section>
          <section className="xhd-the">
            <button type="button" className="bcn-nhom" onClick={() => setMoBan((v) => !v)}><span>Phương thức bán hàng</span>{moBan ? <ChevronUp size={18} /> : <ChevronDown size={18} />}</button>
            {moBan && [['giao', 'Giao hàng'], ['khong_giao', 'Không giao hàng']].map(([k, l]) => <O key={k} chu={l} on={nhap.ban.includes(k)} onClick={() => doi('ban', k)} />)}
          </section>
        </div>
        <footer className="xhd-chan hai">
          <button type="button" className="phu" onClick={() => setNhap(LOC_DAU)}>Đặt lại</button>
          <button type="button" className="chinh" onClick={() => { setLoc(nhap); setMan('bc'); }}>Áp dụng</button>
        </footer>
      </div>
    );
  }
  if (man === 'thu' || man === 'hang') {
    const t = q.trim().toLowerCase();
    const dsThu = (bc?.phieu || []).filter((p) => !t || `${p.ma} ${p.nguoi || ''} ${p.khach || ''}`.toLowerCase().includes(t));
    return (
      <div className="xhd bcn">
        <header className="xhd-dau"><button type="button" aria-label="Quay lại" onClick={() => { setMan('bc'); setQ(''); }}><ChevronLeft size={24} /></button><h1>{man === 'thu' ? 'Thu - Chi' : 'Hàng bán'}</h1></header>
        {man === 'thu' && <div className="xhd-tim-mo"><label className="o bcn-tim"><Search size={17} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Mã phiếu, người bán, khách" autoFocus /></label></div>}
        <div className="xhd-than"><section className="xhd-the">
          {man === 'thu' ? dsThu.map((p, i) => (
            <div key={`${p.ma}-${i}`} className="bcn-phieu"><div><b>{LOAI_THU[p.loai] || p.loai}{p.ma ? ` · ${p.ma}` : ''}</b><small>{ngayGio(p.luc)} · {PT[p.pt] || p.pt}{p.nguoi ? ` · ${p.nguoi}` : ''}{p.khach ? ` · ${p.khach}` : ''}</small></div><b className="xanh">{so(p.tien)}</b></div>
          )) : (bc?.hang?.ds || []).map((m, i) => (
            <div key={i} className="bcn-phieu"><div><b>{m.ten}</b><small>{so(m.tien)}</small></div><b>{so(m.sl)}</b></div>
          ))}
          {man === 'thu' && !dsThu.length && <p className="bhq-ghi">Chưa có phiếu thu nào.</p>}
          {man === 'hang' && !(bc?.hang?.ds || []).length && <p className="bhq-ghi">Chưa bán hàng nào.</p>}
        </section></div>
      </div>
    );
  }
  const pt = bc?.pttt || {};
  const h = bc?.hd || {};
  return (
    <div className="xhd bcn">
      <header className="xhd-dau"><button type="button" aria-label="Quay lại" onClick={onVe}><ChevronLeft size={24} /></button><h1>Báo cáo cuối ngày</h1>
        <button type="button" aria-label="Tìm phiếu thu" onClick={() => setMan('thu')}><Search size={21} /></button></header>
      <div className="bcn-loc-dau">
        <button type="button" className={`bcn-ic ${coLoc ? 'on' : ''}`} aria-label="Bộ lọc" onClick={() => { setNhap(loc); setMan('loc'); }}><ListFilter size={19} /></button>
        <label className="bcn-chip"><select value={ky} onChange={(e) => setKy(e.target.value)} aria-label="Thời gian">{KY.filter(([k]) => k !== 'tuy_chinh').map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select><ChevronDown size={14} /></label>
        {bc && !bc.chi_cua_toi && (
          <button type="button" className={`bcn-chip ${loc.nhan_vien.length ? 'on' : ''}`} onClick={() => { setNhap(loc); setNhanh(true); setMan('chon_nv'); }}>
            <span>{loc.nhan_vien.length === 1 ? loc.nhan_vien[0].trim() : loc.nhan_vien.length ? `${loc.nhan_vien.length} nhân viên` : 'Tất cả nhân viên'}</span><ChevronDown size={14} />
          </button>
        )}
      </div>
      <div className="xhd-than bcn-than">
        <Loi chu={loi} />
        {!bc && !loi && <p className="bhq-ghi">Đang tính…</p>}
        {bc && <>
          {bc.chi_cua_toi && <p className="bcn-ghi">Số liệu của riêng bạn tại {chiNhanh}</p>}
          <section className="xhd-the">
            <R t="Tổng thu" v={so(bc.tong_thu)} /><R t="Tổng chi" v={so(bc.tong_chi)} />
            <R t="Thu - Chi" v={so(Number(bc.tong_thu) - Number(bc.tong_chi))} mo={() => setMan('thu')} />
          </section>
          <section className="xhd-the">
            <h3>Phương thức thanh toán</h3>
            <R t="Tiền mặt" v={so(pt.tien_mat)} /><R t="Chuyển khoản" v={so(pt.chuyen_khoan)} /><R t="Thẻ" v={so(pt.the)} />
            <R t="Điểm" v={so(pt.diem)} /><R t="Voucher" v={so(pt.voucher)} /><R t="Ví điện tử" v={so(pt.vi)} />
          </section>
          <section className="xhd-the">
            <h3>Tổng kết bán hàng</h3>
            <h4>HÓA ĐƠN</h4>
            <R t="Số lượng hóa đơn" v={so(h.so)} mo={onMoHoaDon} />
            <R t="Tổng tiền hàng" v={so(h.tong_hang)} /><R t="Giảm giá" v={so(h.giam)} />
            {Number(h.thu_khac) > 0 && <R t="Thu khác" v={so(h.thu_khac)} />}
            <R t="Doanh thu" v={so(h.doanh_thu)} />
            {Number(h.ghi_no) > 0 && <R t="Khách nợ" v={so(h.ghi_no)} />}
            <R t="Hóa đơn hủy" v={Number(h.so_huy) ? `${so(h.so_huy)} · ${so(h.tien_huy)}` : '0'} />
            <h4>HÀNG HÓA</h4>
            <R t="Số lượng mặt hàng" v={so(bc.hang?.so_mat_hang)} />
            <R t="Số lượng hàng bán" v={so(bc.hang?.so_luong)} mo={() => setMan('hang')} />
            <h4>ĐẶT HÀNG · CÔNG NỢ</h4>
            <R t={`Thu đơn đặt (${so(bc.dat?.so)} phiếu)`} v={so(bc.dat?.tien)} />
            <R t="Thu nợ khách" v={so(bc.thu_no)} />
          </section>
        </>}
      </div>
    </div>
  );
}

// ── Sổ quỹ (như KiotViet): mọi khoản thu / chi theo quỹ Tiền mặt · Ngân hàng · Ví ──
const TEN_QUY = [['tong', 'Tổng quỹ'], ['tien_mat', 'Tiền mặt'], ['ngan_hang', 'Ngân hàng'], ['vi', 'Ví']];
const LOAI_SQ = { ban_hang: 'Thu tiền bán hàng', thu_no: 'Thu nợ khách', thu_coc: 'Thu cọc đơn đặt', lay_banh: 'Thu khi lấy bánh đặt', phieu_thu: 'Phiếu thu', phieu_chi: 'Phiếu chi' };
export function SoQuy({ chiNhanh, onVe }) {
  const [ky, setKy] = useState('hom_nay');
  const [quy, setQuy] = useState('tong');
  const [loc, setLoc] = useState(''); // '' | thu | chi
  const [q, setQ] = useState('');
  const [tatCa, setTatCa] = useState(false);
  const [sq, setSq] = useState(null);
  const [loi, setLoi] = useState('');
  useEffect(() => {
    let huy = false;
    setSq(null); setLoi('');
    const [a, b] = khoangKy(ky);
    goi('pos_so_quy', { p_store: tatCa ? null : chiNhanh, p_from: new Date(a).toISOString(), p_to: new Date(b).toISOString() })
      .then((r) => { if (!huy) setSq(r); }).catch((e) => { if (!huy) setLoi(chuLoi(e)); });
    return () => { huy = true; };
  }, [ky, chiNhanh, tatCa]);
  const so4 = sq?.quy?.[quy] || { dau_ky: 0, thu: 0, chi: 0 };
  const ton = Number(so4.dau_ky) + Number(so4.thu) - Number(so4.chi);
  const t = q.trim().toLowerCase();
  const ds = (sq?.dong || []).filter((d) => (quy === 'tong' || d.quy === quy) && (!loc || (loc === 'thu' ? Number(d.thu) > 0 : Number(d.chi) > 0))
    && (!t || `${d.ma} ${d.doi_tuong || ''} ${d.nguoi || ''} ${d.ghi_chu || ''}`.toLowerCase().includes(t)));
  return (
    <div className="xhd bcn sq">
      <header className="xhd-dau"><button type="button" aria-label="Quay lại" onClick={onVe}><ChevronLeft size={24} /></button><h1>Sổ quỹ</h1></header>
      <div className="xhd-than">
        <div className="sq-chip">{KY.filter(([k]) => k !== 'tuy_chinh').map(([k, l]) => <button key={k} type="button" className={ky === k ? 'on' : ''} onClick={() => setKy(k)}>{l}</button>)}
          <button type="button" className={tatCa ? 'on' : ''} onClick={() => setTatCa((v) => !v)}>{tatCa ? 'Mọi cửa hàng' : chiNhanh}</button></div>
        <div className="sq-chip quy" role="tablist">{TEN_QUY.map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={quy === k} className={quy === k ? 'on' : ''} onClick={() => setQuy(k)}>{l}</button>)}</div>
        {loi ? <p className="kv-loi">{loi}</p> : !sq ? <p className="bhq-ghi">Đang tải sổ quỹ…</p> : <>
          <section className="xhd-the sq-tong">
            <div><span>Quỹ đầu kỳ</span><b>{so(so4.dau_ky)}</b></div>
            <button type="button" className={loc === 'thu' ? 'on' : ''} onClick={() => setLoc((x) => (x === 'thu' ? '' : 'thu'))}><span>Tổng thu</span><b className="xanh-la">{so(so4.thu)}</b></button>
            <button type="button" className={loc === 'chi' ? 'on' : ''} onClick={() => setLoc((x) => (x === 'chi' ? '' : 'chi'))}><span>Tổng chi</span><b className="do">{Number(so4.chi) ? `-${so(so4.chi)}` : '0'}</b></button>
            <div className="lon"><span>Tồn quỹ</span><b className="xanh">{so(ton)}</b></div>
          </section>
          <div className="xhd-tim-mo"><label className="o bcn-tim"><Search size={17} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Mã phiếu, người nộp / nhận, ghi chú" /></label></div>
          <section className="xhd-the">
            {ds.map((d, i) => (
              <div key={`${d.ma}-${d.pt}-${i}`} className="bcn-phieu">
                <div><b>{LOAI_SQ[d.loai] || d.loai}{d.ma ? ` · ${d.ma}` : ''}</b>
                  <small>{ngayGio(d.luc)} · {PT[d.pt] || d.pt}{d.doi_tuong ? ` · ${d.doi_tuong}` : ''}{d.nguoi ? ` · ${d.nguoi}` : ''}{tatCa && d.cn ? ` · ${d.cn}` : ''}</small>
                  {d.ghi_chu && <small>{d.ghi_chu}</small>}</div>
                <b className={Number(d.chi) > 0 ? 'do' : 'xanh'}>{Number(d.chi) > 0 ? `-${so(d.chi)}` : so(d.thu)}</b>
              </div>
            ))}
            {!ds.length && <p className="bhq-ghi">Không có phiếu thu / chi nào trong kỳ này.</p>}
            {sq.so_dong > (sq.dong || []).length && <p className="bhq-ghi">Đang hiện {(sq.dong || []).length} / {sq.so_dong} dòng mới nhất — chọn kỳ ngắn hơn để xem hết.</p>}
          </section>
        </>}
      </div>
    </div>
  );
}

// ===== KHUYẾN MẠI (như KiotViet) =====
// Lúc thanh toán: dòng "Khuyến mại" — máy tự chọn chương trình lợi nhất, thu ngân bấm để đổi / bỏ.
// ds = kết quả kmApDuoc (chương trình đang chạy, có duoc / tien / tang / thieu); chon = chương trình đang áp.
export function KmChon({ ds, chon, tenTang, onChon }) {
  const [mo, setMo] = useState(false);
  if (!ds.length) return null;
  const nhan = (x) => (x.tang ? `Tặng ${so(x.tang.sl)} ${tenTang(x.tang)}` : `−${so(x.tien)}`);
  return (
    <div className="r rel km-dong">
      <span>Khuyến mại {chon ? <i className="pt">({chon.k.name})</i> : <i className="pt">({ds.filter((x) => x.duoc).length ? 'đang bỏ' : 'chưa đủ điều kiện'})</i>}</span>
      <button type="button" className="kv-gach" onClick={() => setMo((v) => !v)}>{chon ? nhan(chon) : 'Chọn'}</button>
      {mo && (
        <div className="kv-pop km-pop" role="dialog" aria-label="Chọn khuyến mại">
          <b>Chương trình khuyến mại</b>
          {ds.map((x) => (
            <button key={x.k.id} type="button" disabled={!x.duoc} className={chon?.k.id === x.k.id ? 'on' : ''}
              onClick={() => { onChon(x.k.id); setMo(false); }}>
              <span><b>{x.k.name}</b><small>{moTaKm(x.k)}</small>{!x.duoc && x.thieu && <small className="cam">{x.thieu}</small>}</span>
              {x.duoc && <em>{nhan(x)}</em>}
            </button>
          ))}
          <button type="button" className={!chon ? 'on' : ''} onClick={() => { onChon(null); setMo(false); }}><span><b>Không áp dụng khuyến mại</b></span></button>
        </div>
      )}
    </div>
  );
}

const KM_TRONG = { name: '', kind: 'hd_giam', active: true, from_date: '', to_date: '', days: [], time_from: '', time_to: '', stores: [], note: '',
  rule: { muc: [{ tu: '', giam: '', kieu: 'tien', toi_da: '' }] } };
const ruleMoi = (kind) => (kind === 'hd_giam' ? { muc: [{ tu: '', giam: '', kieu: 'tien', toi_da: '' }] }
  : kind === 'hang_giam' ? { product_id: '', variant_id: null, ten: '', sl_tu: 2, kieu: 'tien', giam: '' }
    : { mua: { product_id: '', variant_id: null, ten: '', sl: 2 }, tang: { product_id: '', variant_id: null, ten: '', sl: 1 } });
const tenMh = (m) => `${m.ten}${m.size ? ` ${m.size}` : ''}`;

// Chọn 1 món: gõ tên / mã → danh sách gọn (quầy có ~800 món, không dùng <select> dài).
function ChonMon({ matHang, gia, onChon, nhan }) {
  const [q, setQ] = useState('');
  const t = q.trim().toLowerCase();
  const ds = t ? matHang.filter((m) => `${tenMh(m)} ${m.ma}`.toLowerCase().includes(t)).slice(0, 8) : [];
  return (
    <div className="km-mon">
      <span>{nhan}</span>
      {gia.product_id ? (
        <div className="km-mon-chon"><b>{gia.ten}</b><button type="button" onClick={() => onChon(null)}>Đổi</button></div>
      ) : (
        <>
          <label className="o bcn-tim"><Search size={16} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Gõ tên hoặc mã hàng" /></label>
          {ds.map((m) => <button key={m.id} type="button" className="km-mon-goi" onClick={() => { onChon(m); setQ(''); }}>{tenMh(m)}<small>{m.ma}</small></button>)}
        </>
      )}
    </div>
  );
}

function FormKm({ km, matHang, onDong, onXong }) {
  const [f, setF] = useState(() => (km ? {
    ...km, from_date: km.from_date || '', to_date: km.to_date || '', days: km.days || [], stores: km.stores || [],
    time_from: km.time_from ? String(km.time_from).slice(0, 5) : '', time_to: km.time_to ? String(km.time_to).slice(0, 5) : '', note: km.note || '',
    rule: JSON.parse(JSON.stringify(km.rule || {})),
  } : { ...KM_TRONG, rule: ruleMoi('hd_giam') }));
  const [loi, setLoi] = useState('');
  const [dang, setDang] = useState(false);
  const sua = (x) => setF((o) => ({ ...o, ...x }));
  const suaR = (x) => setF((o) => ({ ...o, rule: { ...o.rule, ...x } }));
  const monTu = (m) => (m ? (() => { const t = tachId(m); return { product_id: t.product_id, variant_id: t.variant_id, ten: tenMh(m) }; })() : { product_id: '', variant_id: null, ten: '' });
  const bat = (ds, v) => (ds.includes(v) ? ds.filter((x) => x !== v) : [...ds, v]);
  const r = f.rule;
  const luu = async () => {
    setLoi(''); setDang(true);
    try {
      const rule = f.kind === 'hd_giam'
        ? { muc: (r.muc || []).map((m) => ({ tu: Number(soTien(m.tu)) || 0, giam: Number(String(m.giam).replace(/[^\d.]/g, '')) || 0, kieu: m.kieu, toi_da: Number(soTien(m.toi_da)) || 0 })) }
        : f.kind === 'hang_giam' ? { ...r, sl_tu: Number(r.sl_tu) || 0, giam: Number(String(r.giam).replace(/[^\d.]/g, '')) || 0 }
          : { mua: { ...r.mua, sl: Number(r.mua?.sl) || 0 }, tang: { ...r.tang, sl: Number(r.tang?.sl) || 0 } };
      await luuKm({ id: km?.id || maMoi(), name: f.name, kind: f.kind, rule, active: f.active, from_date: f.from_date || null, to_date: f.to_date || null,
        days: f.days, time_from: f.time_from || null, time_to: f.time_to || null, stores: f.stores, note: f.note });
      onXong(km ? 'Đã lưu khuyến mại' : 'Đã tạo khuyến mại');
    } catch (e) { setLoi(chuLoi(e)); } finally { setDang(false); }
  };
  const oSo = (v, on, ph = '0') => <input inputMode="numeric" value={v === '' || v == null ? '' : so(soTien(v))} placeholder={ph} onChange={(e) => on(soTien(e.target.value))} />;
  return (
    <HopT tieuDe={km ? `Sửa khuyến mại ${km.code}` : 'Tạo khuyến mại'} onDong={onDong} rong
      chan={<><button type="button" className="bhq-nut phu" onClick={onDong}>Bỏ qua</button>
        <button type="button" className="bhq-nut chinh" disabled={dang} onClick={luu}>{dang ? 'Đang lưu…' : 'Lưu'}</button></>}>
      <div className="km-form">
        <label className="km-o"><span>Tên chương trình</span><input value={f.name} onChange={(e) => sua({ name: e.target.value })} placeholder="VD: Mua 2 bánh mì tặng 1 bánh su" /></label>
        <div className="km-o"><span>Hình thức</span>
          <div className="sq-chip">{Object.entries(LOAI_KM).map(([k, l]) => (
            <button key={k} type="button" className={f.kind === k ? 'on' : ''} onClick={() => f.kind !== k && sua({ kind: k, rule: ruleMoi(k) })}>{l}</button>))}</div></div>

        {f.kind === 'hd_giam' && (
          <div className="km-o"><span>Mức giảm theo tổng tiền hàng</span>
            {(r.muc || []).map((m, i) => {
              const doi = (x) => suaR({ muc: r.muc.map((y, j) => (j === i ? { ...y, ...x } : y)) });
              return (
                <div key={i} className="km-muc">
                  <label>Từ {oSo(m.tu, (v) => doi({ tu: v }))}</label>
                  <label>Giảm <input inputMode="decimal" value={m.giam} placeholder="0" onChange={(e) => doi({ giam: e.target.value.replace(/[^\d.]/g, '') })} /></label>
                  <span className="kv-vnd"><button type="button" className={m.kieu !== 'pt' ? 'on' : ''} onClick={() => doi({ kieu: 'tien' })}>VND</button>
                    <button type="button" className={m.kieu === 'pt' ? 'on' : ''} onClick={() => doi({ kieu: 'pt' })}>%</button></span>
                  {m.kieu === 'pt' && <label>Tối đa {oSo(m.toi_da, (v) => doi({ toi_da: v }), 'không giới hạn')}</label>}
                  {r.muc.length > 1 && <button type="button" className="km-bo" aria-label="Bỏ mức này" onClick={() => suaR({ muc: r.muc.filter((_, j) => j !== i) })}><X size={16} /></button>}
                </div>
              );
            })}
            {(r.muc || []).length < 10 && <button type="button" className="km-them" onClick={() => suaR({ muc: [...r.muc, { tu: '', giam: '', kieu: 'tien', toi_da: '' }] })}>+ Thêm mức</button>}
          </div>
        )}
        {f.kind === 'hang_giam' && (
          <div className="km-o">
            <ChonMon nhan="Món được giảm" matHang={matHang} gia={r} onChon={(m) => suaR(monTu(m))} />
            <div className="km-muc">
              <label>Mua từ <input inputMode="numeric" value={r.sl_tu} onChange={(e) => suaR({ sl_tu: soTien(e.target.value) })} /> cái</label>
              <span className="kv-vnd">{[['tien', 'Giảm đ'], ['pt', 'Giảm %'], ['gia', 'Đồng giá']].map(([k, l]) => (
                <button key={k} type="button" className={r.kieu === k ? 'on' : ''} onClick={() => suaR({ kieu: k })}>{l}</button>))}</span>
              <label>{r.kieu === 'gia' ? 'Giá mỗi cái' : r.kieu === 'pt' ? '% mỗi cái' : 'Giảm mỗi cái'}
                <input inputMode="decimal" value={r.giam} placeholder="0" onChange={(e) => suaR({ giam: e.target.value.replace(/[^\d.]/g, '') })} /></label>
            </div>
          </div>
        )}
        {f.kind === 'tang_hang' && (
          <div className="km-o">
            <ChonMon nhan="Món khách mua" matHang={matHang} gia={r.mua} onChon={(m) => suaR({ mua: { ...monTu(m), sl: r.mua.sl } })} />
            <label className="km-sl">Mua đủ <input inputMode="numeric" value={r.mua.sl} onChange={(e) => suaR({ mua: { ...r.mua, sl: soTien(e.target.value) } })} /> cái</label>
            <ChonMon nhan="Món tặng" matHang={matHang} gia={r.tang} onChon={(m) => suaR({ tang: { ...monTu(m), sl: r.tang.sl } })} />
            <label className="km-sl">Tặng <input inputMode="numeric" value={r.tang.sl} onChange={(e) => suaR({ tang: { ...r.tang, sl: soTien(e.target.value) } })} /> cái (mua gấp đôi thì tặng gấp đôi)</label>
          </div>
        )}

        <div className="km-o"><span>Thời gian áp dụng (để trống = luôn luôn)</span>
          <div className="km-muc"><label>Từ ngày <input type="date" value={f.from_date} onChange={(e) => sua({ from_date: e.target.value })} /></label>
            <label>Đến ngày <input type="date" value={f.to_date} onChange={(e) => sua({ to_date: e.target.value })} /></label></div>
          <div className="km-muc"><label>Từ giờ <input type="time" value={f.time_from} onChange={(e) => sua({ time_from: e.target.value })} /></label>
            <label>Đến giờ <input type="time" value={f.time_to} onChange={(e) => sua({ time_to: e.target.value })} /></label></div>
          <div className="sq-chip">{THU_KM.map(([n, l]) => <button key={n} type="button" className={f.days.includes(n) ? 'on' : ''} onClick={() => setF((o) => ({ ...o, days: bat(o.days, n) }))}>{l}</button>)}</div>
          <small className="bhq-ghi">{f.days.length ? 'Chỉ các ngày đã chọn' : 'Không chọn ngày nào = mọi ngày trong tuần'}</small>
        </div>
        <div className="km-o"><span>Chi nhánh</span>
          <div className="sq-chip">{CHI_NHANH.map((c) => <button key={c} type="button" className={f.stores.includes(c) ? 'on' : ''} onClick={() => setF((o) => ({ ...o, stores: bat(o.stores, c) }))}>{c}</button>)}</div>
          <small className="bhq-ghi">{f.stores.length ? 'Chỉ các chi nhánh đã chọn' : 'Không chọn = cả 3 chi nhánh'}</small>
        </div>
        <label className="km-o"><span>Ghi chú</span><input value={f.note} onChange={(e) => sua({ note: e.target.value })} placeholder="Không bắt buộc" /></label>
        <label className="kv-cong-tac"><span>Đang áp dụng</span><input type="checkbox" checked={!!f.active} onChange={(e) => sua({ active: e.target.checked })} /><i /></label>
        <Loi chu={loi} />
      </div>
    </HopT>
  );
}

// Màn "Khuyến mại": danh sách chương trình, bật/tắt nhanh, tạo / sửa (Quản lý / Giám đốc).
export function KhuyenMai({ ds, matHang, chiNhanh, onDoi, onVe, nhan }) {
  const [form, setForm] = useState(null); // null | 'moi' | chương trình
  const [loc, setLoc] = useState('chay');
  const [tk, setTk] = useState({});
  const [loi, setLoi] = useState('');
  useEffect(() => { thongKeKm().then((r) => setTk(r || {})).catch(() => {}); }, [ds]);
  const ten = (k) => kmKhongChay(k, null);
  const hien = ds.filter((k) => (loc === 'chay' ? !ten(k) : loc === 'tat' ? !!ten(k) : true));
  const doiBat = async (k) => {
    setLoi('');
    try { await batKm(k.id, !k.active); nhan(k.active ? `Đã tắt "${k.name}"` : `Đã bật "${k.name}"`); onDoi(); } catch (e) { setLoi(chuLoi(e)); }
  };
  return (
    <div className="xhd bcn km">
      <header className="xhd-dau"><button type="button" aria-label="Quay lại" onClick={onVe}><ChevronLeft size={24} /></button><h1>Khuyến mại</h1>
        <button type="button" className="km-tao" onClick={() => setForm('moi')}>+ Tạo</button></header>
      <div className="xhd-than">
        <div className="sq-chip">{[['chay', 'Đang chạy'], ['tat', 'Tắt / hết hạn'], ['het', 'Tất cả']].map(([k, l]) => (
          <button key={k} type="button" className={loc === k ? 'on' : ''} onClick={() => setLoc(k)}>{l}</button>))}</div>
        <Loi chu={loi} />
        <section className="xhd-the">
          {hien.map((k) => {
            const ly = ten(k); const t = tk[k.id];
            const noiCN = k.stores?.length && !k.stores.includes(chiNhanh);
            return (
              <div key={k.id} className="bcn-phieu km-the">
                <button type="button" className="km-mo" onClick={() => setForm(k)}>
                  <b>{k.name}</b>
                  <small>{k.code} · {LOAI_KM[k.kind]}</small>
                  <small>{moTaKm(k)}</small>
                  <small>{[k.from_date || k.to_date ? `${k.from_date || '…'} → ${k.to_date || '…'}` : 'Không hạn',
                    k.days?.length ? THU_KM.filter(([n]) => k.days.includes(n)).map(([, l]) => l).join(' ') : '',
                    k.time_from ? `${String(k.time_from).slice(0, 5)}–${String(k.time_to).slice(0, 5)}` : '',
                    k.stores?.length ? k.stores.join(', ') : 'Cả 3 chi nhánh'].filter(Boolean).join(' · ')}</small>
                  {t && <small>Đã dùng {so(t.so_hd)} hoá đơn · giảm {so(t.tien)}đ</small>}
                  <small className={ly ? 'cam' : 'xanh-la'}>{ly || (noiCN ? `Đang chạy (không áp ở ${chiNhanh})` : 'Đang chạy')}</small>
                </button>
                <label className="kv-cong-tac nho" aria-label={k.active ? 'Tắt chương trình' : 'Bật chương trình'}><input type="checkbox" checked={!!k.active} onChange={() => doiBat(k)} /><i /></label>
              </div>
            );
          })}
          {!hien.length && <p className="bhq-ghi">{ds.length ? 'Không có chương trình nào ở mục này.' : 'Chưa có chương trình khuyến mại nào — bấm "+ Tạo".'}</p>}
        </section>
      </div>
      {form && <FormKm km={form === 'moi' ? null : form} matHang={matHang} onDong={() => setForm(null)} onXong={(chu) => { setForm(null); nhan(chu); onDoi(); }} />}
    </div>
  );
}

// ===== IN TEM MÃ VẠCH (như "In tem mã" KiotViet) =====
// Khổ tem: tem cuộn (máy in tem nhiệt, mỗi hàng tem = 1 trang) hoặc giấy A4 decal 65 tem.
export const KHO_TEM = [
  { id: '2c', ten: 'Tem cuộn 2 tem/hàng · 35×22mm', cot: 2, w: 35, h: 22, khe: 2 },
  { id: '3c', ten: 'Tem cuộn 3 tem/hàng · 35×22mm', cot: 3, w: 35, h: 22, khe: 2 },
  { id: '1c', ten: 'Tem cuộn 1 tem · 50×30mm', cot: 1, w: 50, h: 30, khe: 0 },
  { id: 'a4', ten: 'Giấy A4 · 65 tem 38×21mm', cot: 5, w: 38.1, h: 21.2, khe: 2.5, a4: true },
];
function VachSvg({ ma }) {
  const bit = maVachCode128(ma);
  if (!bit) return null;
  const vach = [];
  for (let i = 0; i < bit.length;) {
    if (bit[i] === '1') { let j = i; while (bit[j] === '1') j++; vach.push(<rect key={i} x={i + 10} y="0" width={j - i} height="1" />); i = j; } else i++;
  }
  // 10 mô-đun trắng 2 bên (vùng yên tĩnh) để máy quét bắt được.
  return <svg className="tem-vach" viewBox={`0 0 ${bit.length + 20} 1`} preserveAspectRatio="none" shapeRendering="crispEdges" aria-label={`Mã vạch ${ma}`}>{vach}</svg>;
}
function MotTem({ m, gia, ma, kho, tenCH, hienCH, hienGia }) {
  return (
    <div className="tem" style={{ width: `${kho.w}mm`, height: `${kho.h}mm` }}>
      {hienCH && <div className="tem-ch">{tenCH}</div>}
      <div className="tem-ten">{m.ten}{m.size ? ` ${m.size}` : ''}</div>
      <VachSvg ma={ma} />
      <div className="tem-ma">{ma}</div>
      {hienGia && <div className="tem-gia">{so(gia)}đ</div>}
    </div>
  );
}
const docLuuTem = (k, md) => { try { return localStorage.getItem(k) ?? md; } catch { return md; } };
const ghiLuuTem = (k, v) => { try { localStorage.setItem(k, v); } catch { /* bỏ qua */ } };

export function InTem({ matHang, tonCN = {}, chiNhanh, bangGia = [], onVe, nhan }) {
  const [ds, setDs] = useState([]); // [{ ma, sl }]
  const [q, setQ] = useState('');
  const [kho, setKho] = useState(() => docLuuTem('bhq-tem-kho', '2c'));
  const [bg, setBg] = useState('');
  const [hienCH, setHienCH] = useState(() => docLuuTem('bhq-tem-ch', '1') === '1');
  const [hienGia, setHienGia] = useState(() => docLuuTem('bhq-tem-gia', '1') === '1');
  const [dangIn, setDangIn] = useState(false);
  const k = KHO_TEM.find((x) => x.id === kho) || KHO_TEM[0];
  const theoMa = useMemo(() => Object.fromEntries(matHang.map((m) => [m.ma, m])), [matHang]);
  const giaCua = (m) => (bangGia.find((b) => b.id === bg)?.gia?.[m.ma]) || m.gia;
  const t = q.trim().toLowerCase();
  const goiY = t ? locXep(matHang, (m) => `${m.ma} ${m.ten} ${m.size} ${m.maVach || ''}`, t, 8) : [];
  const them = (m, sl = 1) => { setDs((x) => (x.some((d) => d.ma === m.ma) ? x.map((d) => (d.ma === m.ma ? { ...d, sl: d.sl + sl } : d)) : [...x, { ma: m.ma, sl }])); setQ(''); };
  const ton = tonCN[chiNhanh] || {};
  const themConTon = () => {
    const co = matHang.filter((m) => (ton[m.ma] || 0) > 0 && !m.dichVu);
    if (!co.length) { nhan(`${chiNhanh} chưa có hàng còn tồn`); return; }
    setDs(co.map((m) => ({ ma: m.ma, sl: Math.min(Math.floor(ton[m.ma]), 500) })));
  };
  const dong = ds.map((d) => ({ ...d, m: theoMa[d.ma] })).filter((d) => d.m).map((d) => ({ ...d, maIn: maInTem(d.m) }));
  const inDuoc = dong.filter((d) => d.maIn && d.sl > 0);
  const thieuMa = dong.filter((d) => !d.maIn);
  const tong = inDuoc.reduce((s2, d) => s2 + d.sl, 0);
  const tems = inDuoc.flatMap((d) => Array.from({ length: Math.min(d.sl, 500) }, (_, i) => ({ key: `${d.ma}-${i}`, d })));
  const tenCH = `SUMI BAKERY${chiNhanh ? ` · ${chiNhanh}` : ''}`;
  const tem = (x) => <MotTem key={x.key} m={x.d.m} gia={giaCua(x.d.m)} ma={x.d.maIn} kho={k} tenCH={tenCH} hienCH={hienCH} hienGia={hienGia} />;
  // Tem cuộn: mỗi hàng tem = 1 trang giấy (máy in tem tự cắt theo khe). A4: 65 tem / trang.
  const hang = [];
  const moiTrang = k.a4 ? 65 : k.cot;
  for (let i = 0; i < tems.length; i += moiTrang) hang.push(tems.slice(i, i + moiTrang));
  const rongHang = k.cot * k.w + (k.cot - 1) * k.khe;
  const inNgay = () => {
    if (!tong) { nhan('Chọn hàng cần in tem trước'); return; }
    if (tong > 2000) { nhan('In tối đa 2.000 tem mỗi lần — chia làm nhiều lần'); return; }
    const st = document.createElement('style');
    st.id = 'bhq-tem-trang';
    st.textContent = `@media print{@page{size:${k.a4 ? 'A4' : `${rongHang}mm ${k.h}mm`};margin:0}}`;
    document.head.appendChild(st);
    document.documentElement.classList.add('in-tem');
    setDangIn(true);
    const xong = () => { document.documentElement.classList.remove('in-tem'); st.remove(); setDangIn(false); window.removeEventListener('afterprint', xong); };
    window.addEventListener('afterprint', xong);
    setTimeout(() => { window.print(); setTimeout(() => { if (document.getElementById('bhq-tem-trang')) xong(); }, 1500); }, 120);
  };
  return (
    <div className="xhd bcn km tem-man">
      <header className="xhd-dau"><button type="button" aria-label="Quay lại" onClick={onVe}><ChevronLeft size={24} /></button><h1>In tem mã</h1></header>
      <div className="xhd-than">
        <section className="xhd-the km-form">
          <label className="km-o"><span>Khổ tem</span>
            <select className="bhq-o" value={kho} onChange={(e) => { setKho(e.target.value); ghiLuuTem('bhq-tem-kho', e.target.value); }}>
              {KHO_TEM.map((x) => <option key={x.id} value={x.id}>{x.ten}</option>)}
            </select></label>
          {bangGia.length > 0 && (
            <label className="km-o"><span>Giá in trên tem</span>
              <select className="bhq-o" value={bg} onChange={(e) => setBg(e.target.value)}>
                <option value="">Bảng giá chung</option>{bangGia.map((b) => <option key={b.id} value={b.id}>{b.ten}</option>)}
              </select></label>
          )}
          <label className="kv-cong-tac"><span>In tên cửa hàng</span><input type="checkbox" checked={hienCH} onChange={(e) => { setHienCH(e.target.checked); ghiLuuTem('bhq-tem-ch', e.target.checked ? '1' : '0'); }} /><i /></label>
          <label className="kv-cong-tac"><span>In giá bán</span><input type="checkbox" checked={hienGia} onChange={(e) => { setHienGia(e.target.checked); ghiLuuTem('bhq-tem-gia', e.target.checked ? '1' : '0'); }} /><i /></label>
        </section>
        <section className="xhd-the km-form">
          <div className="km-mon">
            <span>Hàng cần in tem</span>
            <label className="o bcn-tim"><Search size={16} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Gõ tên, mã hàng hoặc quét mã vạch"
              onKeyDown={(e) => { if (e.key === 'Enter') { const m = matHang.find((x) => x.ma === q.trim().toUpperCase() || (x.maVach && x.maVach === q.trim())) || (goiY.length === 1 ? goiY[0] : null); if (m) them(m); } }} /></label>
            {goiY.map((m) => <button key={m.id} type="button" className="km-mon-goi" onClick={() => them(m)}>{m.ten}{m.size ? ` ${m.size}` : ''}<small>{m.ma} · tồn {so(ton[m.ma] || 0)}</small></button>)}
          </div>
          <div className="tem-nut">
            <button type="button" className="km-them" onClick={themConTon}>+ Tất cả hàng còn tồn ({chiNhanh})</button>
            {ds.length > 0 && <button type="button" className="km-them" onClick={() => setDs([])}>Bỏ hết</button>}
          </div>
          {dong.map((d) => (
            <div key={d.ma} className="bcn-phieu tem-dong">
              <div><b>{d.m.ten}{d.m.size ? ` ${d.m.size}` : ''}</b>
                <small>{d.maIn ? `Mã in: ${d.maIn}` : 'Chưa có mã cố định — vào Hàng hoá đặt Mã vạch cho món này'} · {so(giaCua(d.m))}đ</small></div>
              <label className="tem-sl"><input inputMode="numeric" aria-label={`Số tem ${d.m.ten}`} value={d.sl}
                onChange={(e) => { const v = Math.min(Number(soTien(e.target.value)) || 0, 500); setDs((x) => x.map((y) => (y.ma === d.ma ? { ...y, sl: v } : y))); }} /> tem</label>
              <button type="button" className="km-bo" aria-label={`Bỏ ${d.m.ten}`} onClick={() => setDs((x) => x.filter((y) => y.ma !== d.ma))}><X size={16} /></button>
            </div>
          ))}
          {!dong.length && <p className="bhq-ghi">Chưa chọn hàng. Gõ tên bánh ở ô trên, hoặc bấm "Tất cả hàng còn tồn".</p>}
          {thieuMa.length > 0 && <p className="kv-loi">{thieuMa.length} món chưa có mã cố định nên không in được (mã SP… tự đánh sẽ đổi khi thêm món mới).</p>}
        </section>
        {inDuoc.length > 0 && (
          <section className="xhd-the">
            <span className="tem-xem-nhan">Xem trước ({so(tong)} tem)</span>
            <div className="tem-xem">{tems.slice(0, k.a4 ? 10 : k.cot * 2).map(tem)}</div>
          </section>
        )}
        <button type="button" className="bhq-nut chinh tem-in" disabled={!tong || dangIn} onClick={inNgay}>{dangIn ? 'Đang mở hộp in…' : `In ${so(tong)} tem`}</button>
      </div>
      {dangIn && createPortal(
        <div id="bhq-tem" className={k.a4 ? 'a4' : 'cuon'}>
          {hang.map((h, i) => (
            <div key={i} className="tem-trang" style={k.a4 ? undefined : { width: `${rongHang}mm`, height: `${k.h}mm`, gap: `${k.khe}mm` }}>
              {h.map(tem)}
            </div>
          ))}
        </div>, document.body)}
    </div>
  );
}
