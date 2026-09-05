import React, { useEffect, useState } from 'react';
import { fetchLuongDuKien } from '../../lib/luongDuKien';

// BẢNG LƯƠNG CÁ NHÂN — dùng CHUNG cho 3 nơi: màn hình chính nhân viên
// (EmployeeOverviewV4), ô "Bảng lương" của Quản lý/Bếp trưởng (MobileHomeScreen)
// và màn "Tăng ca & lương tháng" (CompensationScreen). Viết 1 lần, tránh 3 bản
// lệch nhau mỗi lần sửa công thức.
//
// Số ở đây là DỰ KIẾN cộng dồn theo ngày, tính on-the-fly dưới database
// (sumi_luong_du_kien_thang). Tiền THẬT vẫn là bảng lương do Kế toán/Giám đốc
// chốt sổ — cố ý tách rời, không để nhân viên nhầm hai thứ với nhau.
//
// Ai chưa được nhập lương cơ bản thì các dòng phụ thuộc LCB hiện 0 nhưng vẫn
// giữ nguyên khung bảng (yêu cầu Giám đốc 04/09/2026) — Giám đốc nhập lương
// sau là số tự chạy vào, không phải sửa gì thêm.

const tien = (n) => `${Math.round(Number(n) || 0).toLocaleString('vi-VN')}đ`;

function Dong({ nhan, gia_tri, mau, dam }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '6px 0', fontSize: 13.5, borderTop: '1px solid #f2ece3' }}>
      <span style={{ color: '#725f50' }}>{nhan}</span>
      <b style={{ color: mau || '#2d1c10', fontWeight: dam ? 900 : 700, whiteSpace: 'nowrap' }}>{gia_tri}</b>
    </div>
  );
}

export default function BangLuongCaNhan({ staffId, thang, tieuDe = 'Bảng lương tháng', gonGang = false }) {
  const [d, setD] = useState(undefined);   // undefined = đang tải, null = lỗi
  const [loi, setLoi] = useState('');

  useEffect(() => {
    if (!staffId) return undefined;
    let huy = false;
    setD(undefined); setLoi('');
    fetchLuongDuKien(staffId, thang)
      .then((kq) => { if (!huy) setD(kq); })
      .catch((e) => { if (!huy) { setD(null); setLoi(e?.message || 'Không tải được bảng lương.'); } });
    return () => { huy = true; };
  }, [staffId, thang]);

  if (d === undefined) return <div style={{ padding: 14, fontSize: 13, color: '#725f50' }}>Đang tải bảng lương…</div>;
  if (d === null) return <div style={{ padding: 14, fontSize: 13, color: '#b42318' }}>⚠️ {loi}</div>;

  return (
    <section style={{ padding: 14, borderRadius: 16, background: '#fff', border: '1.5px solid #eadcca' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 6 }}>
        <div>
          <div style={{ fontSize: 10.5, fontWeight: 900, letterSpacing: 1, color: '#b8692f' }}>DỰ KIẾN — CHƯA CHỐT</div>
          <div style={{ fontSize: 15, fontWeight: 900, color: '#2d1c10' }}>{tieuDe} {d.thang}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 20, fontWeight: 900, color: '#087f5b' }}>{tien(d.tong_du_kien)}</div>
          <div style={{ fontSize: 11, color: '#725f50' }}>{d.ngay_cong_thuc_te}/{d.ngay_cong_chuan} ngày công</div>
        </div>
      </div>

      {!d.co_cau_hinh && (
        <div style={{ margin: '6px 0 8px', padding: '8px 10px', borderRadius: 10, background: '#FFF8F0', border: '1px solid #F0DFC8', fontSize: 12, color: '#8C5A3C' }}>
          💡 Chưa nhập lương cơ bản nên các dòng theo lương đang để 0. Giám đốc nhập vào là số tự chạy.
        </div>
      )}

      <Dong nhan="Lương cơ bản (tháng)" gia_tri={tien(d.luong_co_ban)} />
      <Dong nhan={`Lương ngày công (${d.ngay_cong_thuc_te} ngày)`} gia_tri={tien(d.luong_ngay_cong)} />
      <Dong nhan={`Tiền cơm (${d.ngay_cong_thuc_te} × 30.000đ)`} gia_tri={tien(d.tien_com)} />
      <Dong nhan={`Tăng ca (${d.gio_tang_ca} giờ × ${tien(d.don_gia_gio_tang_ca)})`} gia_tri={tien(d.tien_tang_ca)} />
      <Dong nhan="Thưởng sao (Gieo hạt)" gia_tri={`+${tien(d.thuong_sao)}`} mau="#1e7e4c" />
      <Dong nhan={`Chuyên cần (${d.so_vi_pham} lỗi)`} gia_tri={tien(d.chuyen_can)} mau={d.so_vi_pham ? '#b45309' : '#1e7e4c'} />
      <Dong nhan="Phạt sao" gia_tri={`-${tien(d.phat_sao)}`} mau="#b42318" />
      <Dong nhan="Tạm ứng đã nhận" gia_tri={`-${tien(d.tam_ung)}`} mau="#b42318" />
      <Dong nhan="TẠM TÍNH THỰC NHẬN" gia_tri={tien(d.tong_du_kien)} mau="#087f5b" dam />

      {!gonGang && (
        <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px dashed #eadcca', fontSize: 11.5, color: '#725f50', lineHeight: 1.6 }}>
          Số này tự cập nhật mỗi ngày theo chấm công, tăng ca đã duyệt, sao thưởng/phạt và vi phạm thực tế.
          Số tiền chính thức là bảng lương do Kế toán chốt cuối tháng.
        </div>
      )}
    </section>
  );
}
