import React, { useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import {
  TRANG_THAI, ngayGio, gioNgan, nhanKpiNhanViec, nhanKpiHoanThanh,
  quaHan, docBuocCon, tienDoBuocCon, treBaoNhieu, doDaiThoiGian,
} from '../../../lib/congViec';
import { viecNgoaiGioLamViec } from '../../../lib/chamCong';
import { tuChoiViecNgoaiGio } from '../../../lib/queries';
import VongDoiViec from './VongDoiViec';

// Thẻ một công việc của thợ. Bấm vào mở rộng ra để xem chi tiết, các bước con
// và luồng báo cáo tiến độ — đúng như bản mockup.
//
// Mọi thao tác đổi trạng thái đều gọi RPC dưới database (sumi_nhan_viec,
// sumi_bao_xong_viec, sumi_luu_buoc_con). Màn hình KHÔNG tự cập nhật bảng
// tasks, để trạng thái và điểm KPI chỉ có một nơi quyết.

// "2026-08-30T07:36" cho input datetime-local — theo giờ ĐỊA PHƯƠNG trình
// duyệt (khớp cách GiaoViecModal/AssignTaskModal đang làm: gõ giờ VN, lúc
// lưu convert new Date(x).toISOString()), không phải cắt chuỗi ISO (sẽ lệch
// múi giờ UTC/VN 7 tiếng).
function chuoiDatetimeLocal(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function HuyHieuKpi({ viec }) {
  const nhan = viec.status === 'open' && !viec.accepted_at
    ? { loai: 'cho', chu: '⏳ Yêu cầu xác nhận nhận việc' }
    : nhanKpiHoanThanh(viec) || nhanKpiNhanViec(viec);
  if (!nhan) return null;
  const mau = nhan.loai === 'tre'
    ? { background: '#fee2e2', color: '#d03027' }
    : nhan.loai === 'cho'
      ? { background: '#fff3cd', color: '#856404' }
      : { background: '#e6f4ea', color: '#1e7e4c' };
  return <span className="cv-badge" style={mau}>{nhan.chu}</span>;
}

export default function TheViecNhanVien({ viec, hoSo, tenTheoId = {}, onDoi, onBaoLoi, danhSachCa = [] }) {
  const [mo, setMo] = useState(false);
  const [dangChay, setDangChay] = useState('');
  // Từ chối việc ngoài giờ — QUYỀN của nhân sự, không phải đề xuất chờ duyệt
  // (khác hẳn "Xin miễn trừ" hiện có). Xem chamCong.viecNgoaiGioLamViec() +
  // migration 202609042200.
  const [moTuChoi, setMoTuChoi] = useState(false);
  const [lyDoTuChoi, setLyDoTuChoi] = useState('');
  const [dangTuChoi, setDangTuChoi] = useState(false);
  const [buoc, setBuoc] = useState(() => docBuocCon(viec));
  const [buocMoi, setBuocMoi] = useState('');
  const [baoCao, setBaoCao] = useState([]);
  const [dangTaiBaoCao, setDangTaiBaoCao] = useState(false);
  const [loiThe, setLoiThe] = useState('');
  const [tinNhan, setTinNhan] = useState('');
  const [dangGuiTin, setDangGuiTin] = useState(false);
  // Sửa "Nhắc nhở tôi" / "Hạn chót" — 2 ô này trước đây chỉ hiện chữ tĩnh,
  // không sửa lại được sau khi tạo việc.
  const [suaNhacHan, setSuaNhacHan] = useState(false);
  const [nhacMoi, setNhacMoi] = useState('');
  const [hanMoi, setHanMoi] = useState('');
  const [dangLuuNhacHan, setDangLuuNhacHan] = useState(false);

  useEffect(() => { setBuoc(docBuocCon(viec)); }, [viec.id, viec.version]);

  // Luồng báo cáo chỉ tải khi người dùng thật sự mở thẻ ra xem.
  useEffect(() => {
    if (!mo) return;
    let huy = false;
    setDangTaiBaoCao(true);
    supabase.from('task_progress_reports')
      .select('id,note,percent,image_url,author_role,staff_id,created_at')
      .eq('task_id', viec.id).order('created_at', { ascending: true })
      .then(({ data, error }) => {
        if (huy) return;
        if (error) { setLoiThe('Chưa tải được lịch sử báo cáo.'); setBaoCao([]); }
        else { setBaoCao(data || []); setLoiThe(''); }
      })
      .catch(() => { if (!huy) { setLoiThe('Chưa tải được lịch sử báo cáo.'); setBaoCao([]); } })
      .finally(() => { if (!huy) setDangTaiBaoCao(false); });
    return () => { huy = true; };
  }, [mo, viec.id, viec.version]);

  // Quản lý trả lời thì tin nảy lên NGAY, không phải đóng mở lại thẻ.
  //
  // ⚠️ Kênh riêng, đặt tên theo mã việc (`bao-cao-<id>`) nên độc lập hoàn toàn
  // với cổng truyền nhận của phân hệ Chat. Không đụng gì tới kênh chat.
  useEffect(() => {
    if (!mo) return;
    const kenh = supabase.channel(`bao-cao-${viec.id}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'task_progress_reports',
          filter: `task_id=eq.${viec.id}` },
        (tin) => {
          const moi = tin?.new;
          if (!moi?.id) return;
          setBaoCao((ds) => (ds.some((x) => x.id === moi.id) ? ds : [...ds, moi]));
        })
      .subscribe();
    return () => { supabase.removeChannel(kenh); };
  }, [mo, viec.id]);

  const laCuaToi = viec.assignee_id === hoSo?.id;
  // Trước đây chỉ thợ (laCuaToi) mới có ô nhắn — người giao việc/quản lý xem
  // được luồng báo cáo nhưng không trả lời được từ đây. Giờ ai liên quan tới
  // việc (thợ HOẶC người giao việc) đều nhắn được, RPC tự xác định vai trò.
  const coQuyenNhan = laCuaToi || viec.created_by === hoSo?.id;
  const tt = TRANG_THAI[quaHan(viec) ? 'qua_han' : viec.status] || TRANG_THAI.open;
  const daNhan = !!viec.accepted_at;
  const choDuyet = viec.status === 'pending_approval';
  const daXong = viec.status === 'done';
  const tienDo = tienDoBuocCon(viec);
  // Chỉ áp dụng việc Giám đốc/Quản lý giao tay (category='assigned'), CHƯA
  // nhận, và hạn chót rơi ngoài mọi ca quy định của chính người này.
  const ngoaiGio = laCuaToi && !daNhan && !daXong && viec.category === 'assigned'
    && viecNgoaiGioLamViec(viec.deadline, hoSo, danhSachCa);

  const goi = async (ten, thamSo, nhan) => {
    setDangChay(nhan); setLoiThe('');
    try {
      const { data, error } = await supabase.rpc(ten, thamSo);
      if (error) throw error;
      if (data && data.thanh_cong === false) throw new Error(data.thong_bao || 'Không thực hiện được.');
      await onDoi?.();
    } catch (e) {
      // Báo lỗi ngay trên thẻ để người dùng biết chuyện gì xảy ra, thay vì
      // im lặng hoặc làm sập cả màn hình.
      const msg = e?.message || 'Có lỗi xảy ra.';
      setLoiThe(msg);
      onBaoLoi?.(msg);
    } finally { setDangChay(''); }
  };

  const guiTinNhan = async () => {
    const noiDung = tinNhan.trim();
    if (!noiDung || !hoSo?.id) return;
    setDangGuiTin(true); setLoiThe('');
    try {
      const { error } = await supabase.rpc('sumi_gui_tin_nhan_viec', {
        p_task_id: viec.id, p_noi_dung: noiDung,
      });
      if (error) throw error;
      setTinNhan('');
    } catch (e) {
      setLoiThe(e?.message || 'Không gửi được tin nhắn.');
    } finally { setDangGuiTin(false); }
  };

  const luuNhacHan = async () => {
    setDangLuuNhacHan(true); setLoiThe('');
    try {
      const { error } = await supabase.rpc('sumi_dat_nhac_han', {
        p_task_id: viec.id,
        p_reminder_at: nhacMoi ? new Date(nhacMoi).toISOString() : null,
        p_deadline: hanMoi ? new Date(hanMoi).toISOString() : null,
        p_xoa_nhac: !nhacMoi,
        p_xoa_han: !hanMoi,
      });
      if (error) throw error;
      setSuaNhacHan(false);
      await onDoi?.();
    } catch (e) {
      setLoiThe(e?.message || 'Không lưu được nhắc nhở/hạn chót.');
    } finally { setDangLuuNhacHan(false); }
  };

  const tuChoi = async () => {
    const ly = lyDoTuChoi.trim();
    if (!ly) { setLoiThe('Hãy ghi lý do từ chối để người giao việc hiểu.'); return; }
    setDangTuChoi(true); setLoiThe('');
    try {
      await tuChoiViecNgoaiGio(viec.id, ly);
      setMoTuChoi(false); setLyDoTuChoi('');
      await onDoi?.();
    } catch (e) {
      const msg = e?.message || 'Không từ chối được việc này.';
      setLoiThe(msg);
      onBaoLoi?.(msg);
    } finally { setDangTuChoi(false); }
  };

  const luuBuoc = async (ds) => {
    setBuoc(ds);
    await goi('sumi_luu_buoc_con', { p_task_id: viec.id, p_buoc: ds }, 'buoc');
  };

  const themBuoc = () => {
    const ten = buocMoi.trim();
    if (!ten) return;
    setBuocMoi('');
    luuBuoc([...buoc, { ten, xong: false }]);
  };

  const lop = ['cv-card',
    !daNhan && !daXong && !choDuyet ? 'moi' : '',
    quaHan(viec) ? 'tre' : '',
    daXong ? 'xong' : '',
    mo ? 'mo-rong' : ''].filter(Boolean).join(' ');

  const tre = treBaoNhieu(viec);

  return (
    <div className={lop} id={`task-item-${viec.id}`}>
      <div className="cv-card-top">
        <div className={`cv-tick${daXong ? ' done' : ''}`} aria-hidden="true">✓</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          {viec.order_code && (
            <button className="cv-order-link" onClick={() => {
              window.dispatchEvent(new CustomEvent('sumi-navigate', { detail: { tab: 'orders', filter: 'all' } }));
            }}>📦 Đơn {viec.order_code}</button>
          )}
          <h3 className={`cv-title${daXong ? ' gach' : ''}`}>{viec.title}</h3>

          <div className="cv-meta">
            {tenTheoId[viec.created_by] && (
              <span className="cv-meta-item">👤 Giao bởi: {tenTheoId[viec.created_by]}</span>
            )}
            <span className="cv-meta-item">🕒 Lúc: {gioNgan(viec.created_at)}</span>
            {viec.deadline && <span className="cv-meta-item">🎯 Hạn: {ngayGio(viec.deadline)}</span>}
          </div>

          <div className="cv-meta">
            {viec.accepted_at && <span className="cv-meta-item">▶ Nhận lúc: {gioNgan(viec.accepted_at)}</span>}
            {viec.completed_at && <span className="cv-meta-item">✓ Báo xong: {gioNgan(viec.completed_at)}</span>}
            <HuyHieuKpi viec={viec} />
            {quaHan(viec) && tre > 0 && (
              <span className="cv-badge" style={{ background: '#fee2e2', color: '#d03027' }}>
                ⚠️ Quá hạn {doDaiThoiGian(tre)}
              </span>
            )}
            {choDuyet && (
              <span className="cv-badge" style={{ background: tt.nen, color: tt.mau }}>
                📤 Chờ quản lý duyệt
              </span>
            )}
          </div>

          {tienDo.tong > 0 && !daXong && (
            <div className="cv-meta">
              <span className="cv-meta-item">🧩 Bước con: {tienDo.xong}/{tienDo.tong}</span>
            </div>
          )}
        </div>
      </div>

      {/* Không hiện dải vòng đời cho việc đã miễn trừ — 6 bước không còn
          nghĩa gì với một việc bị huỷ giữa chừng. */}
      {!viec.exclusion_reason_code && <VongDoiViec viec={viec} />}

      {loiThe && <div className="cv-error">⚠️ {loiThe}</div>}

      {/* Đã từng từ chối — hiện lại lý do để không phải hỏi lại từ đầu, dù
          nút "Xác nhận nhận việc" vẫn còn (đổi ý thì vẫn nhận được). */}
      {viec.declined_at && (
        <div style={{
          margin: '4px 0 10px', padding: '10px 12px', borderRadius: 12,
          background: '#fee2e2', border: '1px solid #fca5a5', color: '#a52c22',
          fontSize: 12.5, fontWeight: 700, lineHeight: 1.5,
        }}>
          🚫 Bạn đã từ chối việc này lúc {gioNgan(viec.declined_at)} (ngoài giờ làm) — lý do: {viec.decline_reason}
        </div>
      )}

      {/* Chưa nhận việc: chỉ hiện đúng một nút, không rối */}
      {laCuaToi && !daNhan && !daXong && (
        <button className="cv-btn success full" disabled={!!dangChay}
          onClick={() => goi('sumi_nhan_viec', { p_task_id: viec.id }, 'nhan')}>
          {dangChay === 'nhan' ? 'Đang gửi…' : '✓ Xác nhận nhận việc'}
        </button>
      )}

      {/* Việc rơi ngoài ca làm quy định — cho QUYỀN từ chối ngay, không cần
          ai duyệt (khác "Xin miễn trừ": việc đó phải chờ Quản lý rồi Giám
          đốc). Ẩn nếu đã từng từ chối, tránh mời bấm lại một việc đã xử lý. */}
      {ngoaiGio && !viec.declined_at && (
        <div style={{ marginTop: 8 }}>
          <div style={{
            padding: '8px 12px', borderRadius: '12px 12px 0 0',
            background: '#fff3cd', color: '#8a5a00', fontSize: 12, fontWeight: 800,
          }}>
            ⏰ Việc này ngoài ca làm của bạn hôm nay — bạn có quyền từ chối, không cần chờ duyệt.
          </div>
          {!moTuChoi ? (
            <button type="button" className="cv-btn outline full"
              style={{ borderRadius: '0 0 12px 12px', borderColor: '#f5d76e', color: '#a52c22' }}
              onClick={() => setMoTuChoi(true)}>
              ✕ Từ chối việc này
            </button>
          ) : (
            <div style={{ padding: 10, border: '1px solid #f5d76e', borderTop: 0, borderRadius: '0 0 12px 12px' }}>
              <textarea
                value={lyDoTuChoi}
                onChange={(e) => setLyDoTuChoi(e.target.value)}
                placeholder="Lý do từ chối (VD: đã hết ca, không thể ở lại)…"
                rows={2}
                style={{
                  width: '100%', padding: '8px 10px', borderRadius: 10,
                  border: '1px solid var(--cv-border)', fontSize: 13.5, fontFamily: 'inherit',
                  boxSizing: 'border-box', resize: 'vertical',
                }}
              />
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button type="button" className="cv-btn outline" disabled={dangTuChoi}
                  onClick={() => { setMoTuChoi(false); setLyDoTuChoi(''); }}>Huỷ</button>
                <button type="button" className="cv-btn danger" disabled={dangTuChoi || !lyDoTuChoi.trim()}
                  onClick={tuChoi}>
                  {dangTuChoi ? 'Đang gửi…' : 'Xác nhận từ chối'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {(daNhan || daXong || choDuyet) && (
        <button className="cv-btn outline full" onClick={() => setMo((x) => !x)}>
          {mo ? '▲ Thu gọn' : '▼ Xem chi tiết & báo cáo'}
        </button>
      )}

      {mo && (
        <div className="cv-detail">
          {viec.description && <p className="cv-desc">{viec.description}</p>}

          {!suaNhacHan ? (
            <div
              className="cv-detail-grid"
              style={coQuyenNhan ? { cursor: 'pointer' } : undefined}
              onClick={() => {
                if (!coQuyenNhan) return;
                setNhacMoi(chuoiDatetimeLocal(viec.reminder_at));
                setHanMoi(chuoiDatetimeLocal(viec.deadline));
                setSuaNhacHan(true);
              }}
            >
              <div className="cv-detail-box">
                <strong>⏰ Nhắc nhở tôi</strong>
                {viec.reminder_at ? `${ngayGio(viec.reminder_at)} (Chuông báo)` : 'Không đặt nhắc'}
                {coQuyenNhan && <span style={{ marginLeft: 6, color: 'var(--cv-primary)' }}>✏️</span>}
              </div>
              <div className="cv-detail-box">
                <strong>🎯 Hạn chót</strong>
                {viec.deadline ? ngayGio(viec.deadline) : 'Không đặt hạn'}
                {coQuyenNhan && <span style={{ marginLeft: 6, color: 'var(--cv-primary)' }}>✏️</span>}
              </div>
            </div>
          ) : (
            <div className="cv-detail-grid" style={{ gap: 10 }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, fontWeight: 700 }}>
                ⏰ Nhắc nhở tôi
                <input type="datetime-local" value={nhacMoi} onChange={(e) => setNhacMoi(e.target.value)}
                  style={{ minHeight: 42, padding: '0 10px', borderRadius: 10, border: '1px solid var(--cv-border)', fontFamily: 'inherit' }} />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, fontWeight: 700 }}>
                🎯 Hạn chót
                <input type="datetime-local" value={hanMoi} onChange={(e) => setHanMoi(e.target.value)}
                  style={{ minHeight: 42, padding: '0 10px', borderRadius: 10, border: '1px solid var(--cv-border)', fontFamily: 'inherit' }} />
              </label>
              <div style={{ display: 'flex', gap: 8, gridColumn: '1 / -1' }}>
                <button className="cv-btn outline" style={{ flex: 1 }} disabled={dangLuuNhacHan} onClick={() => setSuaNhacHan(false)}>Huỷ</button>
                <button className="cv-btn primary" style={{ flex: 1 }} disabled={dangLuuNhacHan} onClick={luuNhacHan}>
                  {dangLuuNhacHan ? 'Đang lưu…' : '✓ Lưu'}
                </button>
              </div>
            </div>
          )}

          {/* ── Các bước con ── */}
          <div className="cv-sub-title">Các bước thực hiện</div>
          {buoc.length === 0 && (
            <div style={{ fontSize: 13, color: 'var(--cv-muted)', marginBottom: 6 }}>
              Chưa chia bước nào. Việc dài thì chia nhỏ ra cho dễ theo dõi.
            </div>
          )}
          {buoc.map((b, i) => (
            <label key={`${b.ten}-${i}`} className={`cv-step${b.xong ? ' xong' : ''}`}>
              <input type="checkbox" checked={!!b.xong} disabled={!laCuaToi || daXong}
                onChange={() => luuBuoc(buoc.map((x, j) => (j === i ? { ...x, xong: !x.xong } : x)))} />
              <span>{b.ten}</span>
            </label>
          ))}
          {laCuaToi && !daXong && (
            <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
              <input value={buocMoi} onChange={(e) => setBuocMoi(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); themBuoc(); } }}
                placeholder="Tên bước mới…"
                style={{
                  flex: '1 1 160px', minHeight: 44, padding: '0 12px', borderRadius: 12,
                  border: '1px solid var(--cv-border)', fontSize: 14, fontFamily: 'inherit',
                }} />
              <button className="cv-step-add" onClick={themBuoc} disabled={!buocMoi.trim()}>+ Thêm bước con</button>
            </div>
          )}

          {/* ── Luồng báo cáo ── */}
          <div className="cv-sub-title" style={{ marginTop: 16 }}>Tiến trình báo cáo</div>
          {dangTaiBaoCao && <div style={{ fontSize: 13, color: 'var(--cv-muted)' }}>Đang tải…</div>}
          {!dangTaiBaoCao && baoCao.length === 0 && (
            <div style={{ fontSize: 13, color: 'var(--cv-muted)' }}>Chưa có báo cáo nào.</div>
          )}
          {baoCao.map((b) => {
            const laGiamDoc = b.author_role === 'giam_doc';
            const laQuanLy = b.author_role === 'quan_ly';
            const style = laGiamDoc ? { background: '#7d420c', color: '#fff' } : laQuanLy ? { background: '#2b5bc7', color: '#fff' } : undefined;
            return (
              <div className="cv-thread-item" key={b.id}>
                <div className="cv-thread-avatar" style={style}>
                  {laGiamDoc ? '👑' : laQuanLy ? '💼' : '👨‍🍳'}
                </div>
                <div className={`cv-thread-body${laGiamDoc || laQuanLy ? ' quan-ly' : ''}`}>
                  {b.note || (b.percent != null ? `Đã làm được ${b.percent}%` : '(không ghi chú)')}
                  {b.image_url && (
                    <a href={b.image_url} target="_blank" rel="noreferrer">
                      <img className="cv-thread-img" src={b.image_url} alt="Ảnh báo cáo" />
                    </a>
                  )}
                  <div className="cv-thread-meta">
                    <span>{laGiamDoc ? 'Giám đốc' : laQuanLy ? 'Quản lý' : (tenTheoId[b.staff_id] || 'Nhân viên')}</span>
                    <span>{gioNgan(b.created_at)}</span>
                  </div>
                </div>
              </div>
            );
          })}

          {/* Khung chat 2 chiều — thợ và người giao việc đều gõ trực tiếp ở
              đây, không cần mở modal khác */}
          {coQuyenNhan && (
            <div style={{ display: 'flex', gap: 8, marginTop: 8, marginBottom: 4 }}>
              <input value={tinNhan} onChange={(e) => setTinNhan(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !dangGuiTin) { e.preventDefault(); guiTinNhan(); } }}
                placeholder={laCuaToi ? 'Nhắn cho quản lý về việc này…' : 'Nhắn cho thợ về việc này…'}
                style={{ flex: 1, minHeight: 44, padding: '0 12px', borderRadius: 12, border: '1px solid var(--cv-border)', fontSize: 14, fontFamily: 'inherit' }} />
              <button className="cv-btn primary" disabled={dangGuiTin || !tinNhan.trim()} onClick={guiTinNhan} style={{ flex: '0 0 auto' }}>
                {dangGuiTin ? '…' : 'Gửi'}
              </button>
            </div>
          )}

          {laCuaToi && !daXong && !choDuyet && (
            <div className="cv-actions" style={{ marginTop: 14 }}>
              <button className="cv-btn outline" onClick={() => onDoi?.('bao-cao', viec)}>📷 Thêm tiến trình</button>
              <button className="cv-btn primary" disabled={!!dangChay}
                onClick={() => onDoi?.('bao-xong', viec)}>
                Xong hoàn toàn
              </button>
            </div>
          )}
          {choDuyet && (
            <div style={{
              marginTop: 14, padding: '10px 12px', borderRadius: 12,
              background: '#e6f4ea', color: '#1e7e4c', fontWeight: 800, fontSize: 13,
            }}>
              📤 Đã báo xong lúc {gioNgan(viec.completed_at)}. Đang chờ quản lý duyệt nghiệm thu.
            </div>
          )}
          {daXong && (
            <div style={{
              marginTop: 14, padding: '10px 12px', borderRadius: 12,
              background: '#e6f4ea', color: '#1e7e4c', fontWeight: 800, fontSize: 13,
            }}>
              ✅ Quản lý đã duyệt lúc {viec.approved_at ? ngayGio(viec.approved_at) : '—'}.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
