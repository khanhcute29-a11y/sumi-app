import React, { useMemo } from 'react';
import { TEN_BO_PHAN } from '../../../lib/chamCong';

// Khối tổng quan của GIÁM ĐỐC — nằm phía trên danh sách nhân sự.
// Dựng theo mockup: 4 ô đếm + tỉ lệ có mặt theo từng bộ phận.
//
// Mọi con số đếm từ dữ liệu THẬT đang có trên màn hình, không gõ cứng.

const ICON_BO_PHAN = {
  bakery: '🎂',
  xuong41: '🏭',
  xuong42: '🏫',
  van_tai: '🚚',
  _khac: '👤',
};

export default function TongQuanGiamDoc({ danhSach, boPhanTheoNguoi, gioHienTai }) {
  const { dem, theoBoPhan } = useMemo(() => {
    const d = { daVao: 0, daRa: 0, muon: 0, chuaCham: 0, xinNghi: 0 };
    const nhom = new Map();

    (danhSach || []).forEach(({ hoSo, cham }) => {
      const bp = boPhanTheoNguoi?.[hoSo.id] || '_khac';
      if (!nhom.has(bp)) nhom.set(bp, { ma: bp, tong: 0, vao: 0, muon: 0, chuaCham: 0, nghi: 0 });
      const n = nhom.get(bp);
      n.tong += 1;

      if (cham?.raISO) { d.daRa += 1; d.daVao += 1; n.vao += 1; }
      else if (cham?.vaoISO) { d.daVao += 1; n.vao += 1; }
      else if (cham?.xinNghi) { d.xinNghi += 1; n.nghi += 1; }
      else { d.chuaCham += 1; n.chuaCham += 1; }

      if (cham?.chenhLech?.loaiVao === 'late') { d.muon += 1; n.muon += 1; }
    });

    return {
      dem: d,
      theoBoPhan: [...nhom.values()].sort((a, b) => b.tong - a.tong),
    };
  }, [danhSach, boPhanTheoNguoi]);

  const tong = (danhSach || []).length;

  return (
    <>
      <div className="cc2-section-title">
        <span>TỔNG QUAN HÔM NAY</span>
        <span style={{ color: 'var(--cc2-muted)', fontWeight: 800, fontSize: 13 }}>
          {`${String(gioHienTai.getDate()).padStart(2, '0')}/${String(gioHienTai.getMonth() + 1).padStart(2, '0')}`}
        </span>
      </div>

      <div className="cc2-summary-grid">
        <div className="cc2-summary good">
          <div className="symbol">🟢</div>
          <strong>{dem.daVao}</strong>
          <span>Đã vào ca</span>
        </div>
        <div className="cc2-summary">
          <div className="symbol">🏁</div>
          <strong>{dem.daRa}</strong>
          <span>Đã ra ca</span>
        </div>
        <div className={`cc2-summary${dem.muon ? ' alert' : ''}`}>
          <div className="symbol">🟠</div>
          <strong>{dem.muon}</strong>
          <span>Đi muộn</span>
        </div>
        <div className={`cc2-summary${dem.chuaCham ? ' alert' : ''}`}>
          <div className="symbol">🔴</div>
          <strong>{dem.chuaCham}</strong>
          <span>Chưa chấm</span>
        </div>
      </div>

      <div className="cc2-section-title">
        <span>THEO BỘ PHẬN</span>
        <span style={{ color: 'var(--cc2-muted)', fontWeight: 800, fontSize: 13 }}>
          {tong} nhân sự
        </span>
      </div>

      {theoBoPhan.length === 0 ? (
        <div className="cc2-empty">Chưa có dữ liệu nhân sự.</div>
      ) : theoBoPhan.map((n) => {
        // Người xin nghỉ không tính vào mẫu số — nghỉ có phép không phải là vắng.
        const mau = Math.max(1, n.tong - n.nghi);
        const tiLe = Math.round((n.vao / mau) * 100);
        const mucDo = tiLe >= 90 ? '' : tiLe >= 70 ? ' warn' : ' bad';
        const chu = tiLe >= 90 ? 'ỔN ĐỊNH' : tiLe >= 70 ? 'CẦN XEM' : 'THIẾU NGƯỜI';

        const phan = [];
        phan.push(`${n.vao}/${n.tong} trong ca`);
        if (n.muon) phan.push(`${n.muon} đi muộn`);
        if (n.chuaCham) phan.push(`${n.chuaCham} chưa chấm`);
        if (n.nghi) phan.push(`${n.nghi} xin nghỉ`);

        return (
          <div className="cc2-unit" key={n.ma}>
            <div style={{ minWidth: 0 }}>
              <b>{ICON_BO_PHAN[n.ma] || '👤'} {TEN_BO_PHAN[n.ma] || 'Chưa gán bộ phận'}</b>
              <small>{phan.join(' · ')}</small>
            </div>
            <div className={`cc2-score${mucDo}`}>
              {tiLe}%
              <em>{chu}</em>
            </div>
          </div>
        );
      })}
    </>
  );
}
