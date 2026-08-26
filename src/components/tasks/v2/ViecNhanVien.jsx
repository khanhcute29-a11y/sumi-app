import React, { useState } from 'react';
import TheViecNhanVien from './TheViecNhanVien';
import BaoXongModal from './BaoXongModal';
import DonKiemNhiem from './DonKiemNhiem';
import { nhomViecNhanVien } from '../../../lib/congViec';

// Màn hình Công việc của THỢ — dựng theo mockup "Quản Lý Công Việc (Thợ Bếp)".
// Ba khối: Chờ xác nhận → Đang làm → Đã hoàn thành.

function Khoi({ tieuDe, danhSach, ...props }) {
  if (!danhSach.length) return null;
  return (
    <>
      <div className="cv-divider"><span>{tieuDe} ({danhSach.length})</span></div>
      <div className="cv-list">
        {danhSach.map((v) => <TheViecNhanVien key={v.id} viec={v} {...props} />)}
      </div>
    </>
  );
}

export default function ViecNhanVien({ tasks, hoSo, tenTheoId, dangTai, loi, onTaiLai }) {
  const [baoXong, setBaoXong] = useState(null);
  const [loiChung, setLoiChung] = useState('');

  const nhom = nhomViecNhanVien(tasks);
  const trong = !nhom.choNhan.length && !nhom.dangLam.length
    && !nhom.choDuyet.length && !nhom.daXong.length;

  // Thẻ con báo ngược lên: 'bao-xong' mở hộp thoại, còn lại là tải lại danh sách.
  const xuLy = async (hanhDong, viec) => {
    if (hanhDong === 'bao-xong' || hanhDong === 'bao-cao') { setBaoXong({ viec, chiBaoCao: hanhDong === 'bao-cao' }); return; }
    await onTaiLai?.();
  };

  const chung = { hoSo, tenTheoId, onDoi: xuLy, onBaoLoi: setLoiChung };

  return (
    <div>
      {loi && <div className="cv-error">⚠️ Không tải được danh sách việc: {loi}</div>}
      {loiChung && <div className="cv-error">⚠️ {loiChung}</div>}

      {dangTai && <div className="cv-empty">Đang tải công việc…</div>}

      {!dangTai && trong && (
        <div className="cv-empty">
          <div className="cv-empty-icon">🎉</div>
          <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--cv-text)', marginBottom: 4 }}>
            Không có việc nào được giao
          </div>
          <div style={{ fontSize: 13 }}>Khi quản lý giao việc, nó sẽ hiện ở đây.</div>
        </div>
      )}

      {!dangTai && (
        <>
          <DonKiemNhiem hoSo={hoSo} onDaNhan={onTaiLai} />
          <Khoi tieuDe="Chờ xác nhận" danhSach={nhom.choNhan} {...chung} />
          <Khoi tieuDe="Đang làm" danhSach={nhom.dangLam} {...chung} />
          <Khoi tieuDe="Chờ quản lý duyệt" danhSach={nhom.choDuyet} {...chung} />
          <Khoi tieuDe="Đã hoàn thành" danhSach={nhom.daXong} {...chung} />
          <Khoi tieuDe="Đã miễn trừ" danhSach={nhom.mienTru} {...chung} />
        </>
      )}

      {baoXong && (
        <BaoXongModal
          viec={baoXong.viec}
          chiBaoCao={baoXong.chiBaoCao}
          hoSo={hoSo}
          onClose={() => setBaoXong(null)}
          onXong={async () => { setBaoXong(null); await onTaiLai?.(); }}
        />
      )}
    </div>
  );
}
