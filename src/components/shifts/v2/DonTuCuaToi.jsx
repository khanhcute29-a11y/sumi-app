import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchApprovalRequests, guiDeXuat } from '../../../lib/queries';
import TheDeXuat, { LOAI_DON, PHAM_VI_NGHI, LOAI_NGHI } from './TheDeXuat';

// Màn hình "ĐƠN TỪ" của nhân viên — dựng theo ảnh mẫu anh Nghĩa gửi.
// Ba thẻ lọc (Chờ duyệt · Đã duyệt · Không duyệt) + nút ➕ gửi đơn mới.
//
// Đơn gửi từ đây chạy qua ĐÚNG hai cấp: Quản lý -> Giám đốc. Người gửi nhìn
// thấy đơn đang nằm ở bậc nào ngay trên thẻ, không phải đi hỏi.

const THE_LOC = [
  { ma: 'pending', ten: 'Chờ duyệt' },
  { ma: 'approved', ten: 'Đã duyệt' },
  { ma: 'rejected', ten: 'Không duyệt' },
];

const o = {
  nhan: { display: 'block', fontWeight: 900, fontSize: 13, marginBottom: 6 },
  o: {
    width: '100%', minHeight: 48, padding: '11px 12px', borderRadius: 13,
    border: '1px solid var(--cc2-line)', background: '#fff',
    color: 'var(--cc2-cocoa)', font: 'inherit', fontSize: 15,
    boxSizing: 'border-box',
  },
};

function FormGuiDon({ onClose, onXong }) {
  const [loai, setLoai] = useState('leave_request');
  const [tuNgay, setTuNgay] = useState(new Date().toISOString().slice(0, 10));
  const [denNgay, setDenNgay] = useState('');
  const [phamVi, setPhamVi] = useState('ca_ngay');
  const [loaiNghi, setLoaiNghi] = useState('phep_nam');
  const [maDon, setMaDon] = useState('');
  const [lyDo, setLyDo] = useState('');
  const [dangGui, setDangGui] = useState(false);
  const [loi, setLoi] = useState('');

  const laDonNghi = loai === 'leave_request';
  const laDonHang = loai.startsWith('order_');

  const gui = async () => {
    if (!lyDo.trim()) { setLoi('Hãy ghi lý do để quản lý hiểu và duyệt nhanh hơn.'); return; }
    if (laDonNghi && !tuNgay) { setLoi('Chọn ngày nghỉ giúp tôi.'); return; }
    if (denNgay && tuNgay && denNgay < tuNgay) { setLoi('Ngày kết thúc phải sau ngày bắt đầu.'); return; }

    setDangGui(true); setLoi('');
    try {
      await guiDeXuat({
        type: loai,
        reason: lyDo.trim(),
        leaveDate: laDonNghi ? tuNgay : null,
        leaveTo: laDonNghi && denNgay ? denNgay : null,
        leaveScope: laDonNghi ? phamVi : null,
        leaveKind: laDonNghi ? loaiNghi : null,
        orderCode: laDonHang ? maDon.trim() || null : null,
      });
      await onXong?.();
    } catch (e) {
      setLoi(e?.message || 'Không gửi được đơn. Thử lại giúp tôi.');
    } finally {
      setDangGui(false);
    }
  };

  return (
    <div className="cc2 cc2-sheet-backdrop" onClick={() => !dangGui && onClose?.()}>
      <div className="cc2-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="cc2-sheet-head">
          <h2>Gửi đề xuất</h2>
          <button className="cc2-close" onClick={onClose} aria-label="Đóng">×</button>
        </div>

        <div style={{ marginTop: 14 }}>
          <label style={o.nhan}>Loại đơn</label>
          <select style={o.o} value={loai} onChange={(e) => setLoai(e.target.value)}>
            {Object.entries(LOAI_DON).map(([ma, x]) => (
              <option key={ma} value={ma}>{x.icon} {x.ten}</option>
            ))}
          </select>
        </div>

        {laDonNghi && (
          <>
            <div style={{ marginTop: 12 }}>
              <label style={o.nhan}>Nghỉ bao nhiêu</label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 6 }}>
                {Object.entries(PHAM_VI_NGHI).map(([ma, ten]) => (
                  <button
                    key={ma}
                    type="button"
                    onClick={() => setPhamVi(ma)}
                    style={{
                      minHeight: 48, borderRadius: 12, cursor: 'pointer',
                      fontWeight: 850, fontSize: 13,
                      border: `2px solid ${phamVi === ma ? 'var(--cc2-caramel)' : 'var(--cc2-line)'}`,
                      background: phamVi === ma ? '#fff4ec' : '#fff',
                      color: phamVi === ma ? '#a64829' : 'var(--cc2-cocoa)',
                    }}
                  >{ten}</button>
                ))}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 12 }}>
              <div>
                <label style={o.nhan}>Từ ngày</label>
                <input type="date" style={o.o} value={tuNgay} onChange={(e) => setTuNgay(e.target.value)} />
              </div>
              <div>
                <label style={o.nhan}>Đến ngày</label>
                <input type="date" style={o.o} value={denNgay} onChange={(e) => setDenNgay(e.target.value)} />
              </div>
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--cc2-muted)', marginTop: 5, fontWeight: 700 }}>
              Nghỉ một ngày thì để trống ô “Đến ngày”.
            </div>

            <div style={{ marginTop: 12 }}>
              <label style={o.nhan}>Lý do nghỉ</label>
              <select style={o.o} value={loaiNghi} onChange={(e) => setLoaiNghi(e.target.value)}>
                {Object.entries(LOAI_NGHI).map(([ma, ten]) => (
                  <option key={ma} value={ma}>{ten}</option>
                ))}
              </select>
            </div>
          </>
        )}

        {laDonHang && (
          <div style={{ marginTop: 12 }}>
            <label style={o.nhan}>Mã đơn hàng</label>
            <input style={o.o} value={maDon} onChange={(e) => setMaDon(e.target.value)}
              placeholder="VD: SUMI-20260826-014" />
          </div>
        )}

        <div style={{ marginTop: 12 }}>
          <label style={o.nhan}>
            Nội dung trình bày <span style={{ color: '#d03027' }}>*</span>
          </label>
          <textarea
            style={{ ...o.o, minHeight: 110, resize: 'vertical' }}
            value={lyDo}
            onChange={(e) => setLyDo(e.target.value)}
            placeholder="VD: Gửi anh Quân, gia đình em có việc nên em xin phép nghỉ làm chiều nay để về quê ạ. Em cảm ơn!"
          />
        </div>

        <div style={{
          marginTop: 12, padding: '10px 12px', borderRadius: 12,
          background: 'var(--cc2-navy-soft)', color: 'var(--cc2-navy)',
          fontSize: 12.5, fontWeight: 800, lineHeight: 1.5,
        }}>
          📨 Đơn sẽ đi qua <b>Quản lý</b> duyệt trước, rồi mới tới <b>Giám đốc</b>.
          Bạn theo dõi được đơn đang nằm ở bậc nào ngay trên màn hình này.
        </div>

        {loi && <div className="cc2-error" style={{ marginTop: 10 }}>⚠️ {loi}</div>}

        <button className="cc2-primary" style={{ marginTop: 14 }} onClick={gui} disabled={dangGui}>
          {dangGui ? 'Đang gửi…' : 'GỬI ĐỀ XUẤT'}
        </button>
      </div>
    </div>
  );
}

export default function DonTuCuaToi({ hoSo, duLieuGia = null }) {
  const [ds, setDs] = useState([]);
  const [the, setThe] = useState('pending');
  const [dangTai, setDangTai] = useState(true);
  const [loi, setLoi] = useState('');
  const [moForm, setMoForm] = useState(false);
  const [moDanhSach, setMoDanhSach] = useState(false);   // ⬅ modal đơn từ

  // Chỉ đơn CỦA CHÍNH MÌNH. Hàng rào RLS dưới database đã giới hạn rồi, nhưng
  // lọc thêm ở đây cho chắc — quản lý và giám đốc cũng dùng màn hình này để
  // xem đơn của riêng họ, không phải để xem đơn cả tiệm.
  const cuaToi = useCallback(
    (ds2) => (ds2 || []).filter((r) => !hoSo?.id || r.requester_id === hoSo.id),
    [hoSo?.id],
  );

  const tai = useCallback(async () => {
    if (duLieuGia) { setDs(cuaToi(duLieuGia)); setDangTai(false); return; }
    setDangTai(true);
    try {
      const data = await fetchApprovalRequests({});
      setDs(cuaToi(data));
      setLoi('');
    } catch (e) {
      setLoi(e?.message || 'Không tải được đơn từ.');
    } finally {
      setDangTai(false);
    }
  }, [duLieuGia, cuaToi]);

  // Nạp ngay khi màn hình mở, KHÔNG đợi bấm vào nút — để số "đang chờ" trên
  // nút luôn đúng ngay từ đầu, không phải bấm vào mới biết có mấy đơn.
  useEffect(() => { tai(); }, [tai]);

  const dem = useMemo(() => {
    const d = { pending: 0, approved: 0, rejected: 0 };
    ds.forEach((r) => { if (d[r.status] !== undefined) d[r.status] += 1; });
    return d;
  }, [ds]);

  const hien = ds.filter((r) => r.status === the);

  return (
    <>
      {/* ── Trên màn hình chính: CHỈ MỘT NÚT, không bày cả danh sách ra ──
          Bấm vào mới mở đơn từ dạng modal trượt lên, giống hộp chi tiết nhân
          sự và form gửi đơn đã có sẵn — nhất quán một kiểu tương tác. */}
      <div className="cc2-section-title"><span>ĐƠN TỪ</span></div>
      <button className="cc2-dontu-btn" onClick={() => setMoDanhSach(true)}>
        <span className="cc2-dontu-icon">📝</span>
        <span className="cc2-dontu-chu">
          <b>Đơn Từ / Xin Nghỉ</b>
          <small>
            {dangTai ? 'Đang tải…' : dem.pending
              ? `${dem.pending} đơn đang chờ duyệt`
              : 'Xem đơn đã gửi hoặc tạo đơn mới'}
          </small>
        </span>
        {dem.pending > 0 && <span className="cc2-dontu-badge">{dem.pending}</span>}
        <span className="cc2-dontu-mui" aria-hidden="true">›</span>
      </button>

      {moDanhSach && (
        <div className="cc2 cc2-sheet-backdrop" onClick={() => setMoDanhSach(false)}>
          <div className="cc2-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="cc2-sheet-head">
              <h2>Đơn từ của tôi</h2>
              <button className="cc2-close" onClick={() => setMoDanhSach(false)} aria-label="Đóng">×</button>
            </div>

            <div className="cc2-tab-loc" role="tablist" style={{ marginTop: 14 }}>
              {THE_LOC.map((t) => (
                <button
                  key={t.ma}
                  role="tab"
                  aria-selected={the === t.ma}
                  className={`cc2-tab${the === t.ma ? ' active' : ''}`}
                  onClick={() => setThe(t.ma)}
                >
                  {t.ten}{dem[t.ma] ? ` (${dem[t.ma]})` : ''}
                </button>
              ))}
            </div>

            {loi && <div className="cc2-error">⚠️ {loi}</div>}

            {dangTai ? (
              <div className="cc2-empty">Đang tải đơn từ…</div>
            ) : hien.length === 0 ? (
              <div className="cc2-empty">
                {the === 'pending' ? 'Bạn không có đơn nào đang chờ duyệt.'
                  : the === 'approved' ? 'Chưa có đơn nào được duyệt.'
                    : 'Chưa có đơn nào bị từ chối.'}
              </div>
            ) : (
              <div className="cc2-history">
                {hien.map((r) => <TheDeXuat key={r.id} don={r} hienNguoiGui={false} />)}
              </div>
            )}

            <button className="cc2-primary" style={{ marginTop: 16 }} onClick={() => setMoForm(true)}>
              ＋ GỬI ĐƠN TỪ MỚI
            </button>
          </div>
        </div>
      )}

      {moForm && (
        <FormGuiDon
          onClose={() => setMoForm(false)}
          onXong={async () => { setMoForm(false); await tai(); }}
        />
      )}
    </>
  );
}
