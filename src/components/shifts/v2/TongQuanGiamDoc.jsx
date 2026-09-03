import React, { useMemo, useState } from 'react';
import { chuCaiDau, doDaiPhut } from './dungChung';
import {
  LUONG, KHOI, KHOI_CO_CAP_BAC, CAP_BAC, THU_TU_CAP_BAC, capBacCuaHoSo,
  NHOM_TRANG_THAI, luongCuaHoSo, demTheoLuong,
} from './luongNhanSu';

// Khối tổng quan của GIÁM ĐỐC.
//
// BA TẦNG BẤM SÂU:
//   1. Ô đếm ("Đi muộn 5")        -> bấm ra danh sách LUỒNG có người đi muộn
//   2. Luồng ("Bếp lạnh 2")       -> bấm ra DANH SÁCH NGƯỜI trong luồng đó
//   3. Người                      -> bấm ra LỊCH SỬ CHẤM CÔNG, tương tác được
//
// Bấm lại đúng ô đang mở thì đóng lại — không cần nút "×" riêng, đỡ một cú
// bấm cho người dùng đứng trong bếp.
//
// Mọi con số đếm từ dữ liệu THẬT trên màn hình. Không gõ cứng số nào.

function nhanTrangThaiNgan(cham) {
  if (cham?.xinNghi && !cham?.vaoISO) return { chu: 'XIN NGHỈ', lop: 'cc2-staff-state late' };
  if (!cham?.vaoISO) return { chu: 'CHƯA VÀO', lop: 'cc2-staff-state absent' };
  if (cham?.chenhLech?.loaiVao === 'late') return { chu: 'ĐI MUỘN', lop: 'cc2-staff-state late' };
  return { chu: cham?.raISO ? 'ĐÃ RA CA' : 'ĐÚNG GIỜ', lop: 'cc2-staff-state' };
}

function moTaNgan(cham) {
  if (cham?.xinNghi && !cham?.vaoISO) return 'Đã gửi đơn xin nghỉ';
  if (!cham?.vaoISO) return 'Chưa có dữ liệu chấm công';
  const dev = cham.chenhLech;
  const phan = cham.raISO ? `Ra ca ${cham.ra}` : `Vào ca ${cham.vao} · Đang làm`;
  if (dev?.loaiVao === 'late') return `${phan} · muộn ${doDaiPhut(dev.lechVao)}`;
  return phan;
}

/** Danh sách người — dùng chung cho cả hai đường bấm sâu. */
function DanhSachNguoi({ nguoi, onXemNhanSu }) {
  if (!nguoi?.length) return <div className="cc2-empty">Không có ai trong nhóm này.</div>;
  return (
    <div className="cc2-team-list" style={{ marginTop: 8 }}>
      {nguoi.map(({ hoSo, cham }) => {
        const tt = nhanTrangThaiNgan(cham);
        return (
          <button className="cc2-staff" key={hoSo.id} onClick={() => onXemNhanSu?.({ hoSo, cham })}>
            <div className="cc2-staff-face">{chuCaiDau(hoSo.full_name)}</div>
            <div style={{ minWidth: 0 }}>
              <b>{hoSo.full_name}</b>
              <small>{moTaNgan(cham)}</small>
            </div>
            <span className={tt.lop}>{tt.chu}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Danh sách người trong 1 luồng, chia theo CẤP BẬC (Bếp trưởng/Bếp phó/Nhân
 * viên) nếu luồng đó có nhiều hơn 1 cấp bậc thật sự xuất hiện — bỏ luôn tiêu
 * đề cấp bậc nếu cả nhóm chỉ toàn 1 cấp (đỡ rối mắt cho khâu chỉ có nhân
 * viên, không có bếp trưởng/phó). */
function DanhSachNguoiTheoCapBac({ nguoi, onXemNhanSu }) {
  const theoCap = useMemo(() => {
    const m = new Map();
    (nguoi || []).forEach((n) => {
      const c = capBacCuaHoSo(n.hoSo);
      if (!m.has(c)) m.set(c, []);
      m.get(c).push(n);
    });
    return m;
  }, [nguoi]);

  if (theoCap.size <= 1) return <DanhSachNguoi nguoi={nguoi} onXemNhanSu={onXemNhanSu} />;

  return (
    <>
      {THU_TU_CAP_BAC.filter((c) => theoCap.has(c)).map((c) => (
        <div key={c} style={{ marginTop: 6 }}>
          <div style={{ fontSize: 11, fontWeight: 900, color: 'var(--cc2-muted)', textTransform: 'uppercase', padding: '4px 2px' }}>
            {CAP_BAC[c].icon} {CAP_BAC[c].ten} ({theoCap.get(c).length})
          </div>
          <DanhSachNguoi nguoi={theoCap.get(c)} onXemNhanSu={onXemNhanSu} />
        </div>
      ))}
    </>
  );
}

export default function TongQuanGiamDoc({ danhSach, gioHienTai, onXemNhanSu }) {
  // Tầng 1: nhóm trạng thái đang mở. Tầng 2: luồng đang mở trong nhóm đó.
  const [nhom, setNhom] = useState(null);
  const [luongMo, setLuongMo] = useState(null);
  // Khối bộ phận đang mở ở mục "Theo bộ phận" (đường bấm sâu thứ hai).
  const [khoiMo, setKhoiMo] = useState(null);
  const [luongKhoiMo, setLuongKhoiMo] = useState(null);

  const dem = useMemo(() => {
    const d = { daVao: 0, daRa: 0, muon: 0, chuaCham: 0, xinNghi: 0 };
    (danhSach || []).forEach(({ hoSo, cham }) => {
      Object.values(NHOM_TRANG_THAI).forEach((n) => { if (n.hop(cham, hoSo)) d[n.ma] += 1; });
    });
    return d;
  }, [danhSach]);

  // Luồng trong nhóm trạng thái đang mở.
  const luongTrongNhom = useMemo(
    () => (nhom ? demTheoLuong(danhSach, NHOM_TRANG_THAI[nhom].hop) : []),
    [danhSach, nhom],
  );

  // Thống kê từng luồng, dùng cho mục "Theo bộ phận".
  const thongKeLuong = useMemo(() => {
    const m = new Map();
    (danhSach || []).forEach(({ hoSo, cham }) => {
      const l = luongCuaHoSo(hoSo);
      if (!m.has(l)) m.set(l, { ma: l, tong: 0, vao: 0, muon: 0, chuaCham: 0, nghi: 0, nguoi: [] });
      const n = m.get(l);
      n.tong += 1;
      n.nguoi.push({ hoSo, cham });
      if (cham?.vaoISO) n.vao += 1;
      else if (cham?.xinNghi) n.nghi += 1;
      else n.chuaCham += 1;
      if (cham?.chenhLech?.loaiVao === 'late') n.muon += 1;
    });
    return m;
  }, [danhSach]);

  const bamNhom = (ma) => {
    setNhom((cu) => (cu === ma ? null : ma));
    setLuongMo(null);
  };

  const ngay = `${String(gioHienTai.getDate()).padStart(2, '0')}/${String(gioHienTai.getMonth() + 1).padStart(2, '0')}`;

  return (
    <>
      {/* ══ 1. TỔNG QUAN NHÂN SỰ HÔM NAY ══ */}
      <div className="cc2-section-title">
        <span>TỔNG QUAN NHÂN SỰ HÔM NAY</span>
        <span style={{ color: 'var(--cc2-muted)', fontWeight: 800, fontSize: 13 }}>{ngay}</span>
      </div>

      <div className="cc2-summary-grid">
        {['daVao', 'daRa', 'muon', 'chuaCham'].map((ma) => {
          const n = NHOM_TRANG_THAI[ma];
          const so = dem[ma];
          const dangMo = nhom === ma;
          const toDam = (ma === 'muon' || ma === 'chuaCham') && so > 0;
          return (
            <button
              key={ma}
              className={`cc2-summary bam${toDam ? ' alert' : n.lop ? ` ${n.lop}` : ''}${dangMo ? ' dang-mo' : ''}`}
              onClick={() => bamNhom(ma)}
              aria-expanded={dangMo}
            >
              <div className="symbol">{n.icon}</div>
              <strong>{so}</strong>
              <span>{n.ten}</span>
              <i className="cc2-mui-ten" aria-hidden="true">{dangMo ? '▴' : '▾'}</i>
            </button>
          );
        })}
      </div>

      {/* Tầng 2 — luồng trong nhóm vừa bấm */}
      {nhom && (
        <div className="cc2-drill">
          <div className="cc2-drill-head">
            <b>{NHOM_TRANG_THAI[nhom].icon} {NHOM_TRANG_THAI[nhom].ten} · {dem[nhom]} người</b>
            <button className="cc2-drill-close" onClick={() => bamNhom(nhom)} aria-label="Đóng">×</button>
          </div>

          {luongTrongNhom.length === 0 ? (
            <div className="cc2-empty">Không có ai trong nhóm này.</div>
          ) : luongTrongNhom.map((l) => {
            const mo = luongMo === l.ma;
            return (
              <div key={l.ma}>
                <button
                  className={`cc2-drill-row${mo ? ' dang-mo' : ''}`}
                  onClick={() => setLuongMo(mo ? null : l.ma)}
                  aria-expanded={mo}
                >
                  <span className="cc2-drill-icon">{l.icon}</span>
                  <span className="cc2-drill-ten">{l.ten}</span>
                  <span className="cc2-drill-so">{l.nguoi.length}</span>
                  <span className="cc2-mui-ten" aria-hidden="true">{mo ? '▴' : '▾'}</span>
                </button>
                {/* Tầng 3 — người, bấm vào mở lịch sử chấm công */}
                {mo && <DanhSachNguoi nguoi={l.nguoi} onXemNhanSu={onXemNhanSu} />}
              </div>
            );
          })}
        </div>
      )}

      {/* ══ 2. THEO BỘ PHẬN ══ */}
      <div className="cc2-section-title">
        <span>THEO BỘ PHẬN</span>
        <span style={{ color: 'var(--cc2-muted)', fontWeight: 800, fontSize: 13 }}>
          {(danhSach || []).length} nhân sự
        </span>
      </div>

      {KHOI.map((k) => {
        // Gộp số của các luồng con lại thành số của khối.
        const con = k.luong.map((ma) => thongKeLuong.get(ma)).filter(Boolean);
        if (!con.length) return null;

        const tong = con.reduce((s, x) => s + x.tong, 0);
        const vao = con.reduce((s, x) => s + x.vao, 0);
        const muon = con.reduce((s, x) => s + x.muon, 0);
        const chuaCham = con.reduce((s, x) => s + x.chuaCham, 0);
        const nghi = con.reduce((s, x) => s + x.nghi, 0);

        // Khối văn phòng (giám đốc, kế toán) KHÔNG theo ca cố định nên không
        // chấm điểm được. Trước đây khối này hiện "0% · THIẾU NGƯỜI" — một lời
        // báo động sai, vì họ không hề phải chấm công theo ca.
        const coCaCoDinh = k.ma !== '_khac';

        // Người xin nghỉ có phép không nằm trong mẫu số — nghỉ phép không phải
        // là vắng mặt. Nhưng cũng phải nói rõ mẫu số là bao nhiêu, nếu không
        // màn hình hiện "1/2 trong ca" mà chấm 100% thì nhìn như tính sai.
        const phaiCoMat = tong - nghi;
        const tiLe = phaiCoMat > 0 ? Math.round((vao / phaiCoMat) * 100) : 100;
        const mucDo = tiLe >= 90 ? '' : tiLe >= 70 ? ' warn' : ' bad';
        const chu = tiLe >= 90 ? 'ỔN ĐỊNH' : tiLe >= 70 ? 'CẦN XEM' : 'THIẾU NGƯỜI';

        const phan = [
          nghi
            ? `${vao}/${phaiCoMat} phải có mặt (${nghi} xin nghỉ)`
            : `${vao}/${tong} trong ca`,
        ];
        if (muon) phan.push(`${muon} đi muộn`);
        if (chuaCham) phan.push(`${chuaCham} chưa chấm`);

        const mo = khoiMo === k.ma;

        return (
          <div key={k.ma} style={{ marginTop: 8 }}>
            <button
              className={`cc2-unit bam${mo ? ' dang-mo' : ''}`}
              onClick={() => { setKhoiMo(mo ? null : k.ma); setLuongKhoiMo(null); }}
              aria-expanded={mo}
            >
              <div style={{ minWidth: 0, textAlign: 'left' }}>
                <b>{k.icon} {k.ten}</b>
                <small>{coCaCoDinh ? phan.join(' · ') : `${tong} người · không theo ca cố định`}</small>
              </div>
              {coCaCoDinh ? (
                <div className={`cc2-score${mucDo}`}>
                  {tiLe}%
                  <em>{chu}</em>
                </div>
              ) : (
                <div className="cc2-score" style={{ color: 'var(--cc2-muted)' }}>
                  —
                  <em style={{ color: 'var(--cc2-muted)' }}>KHÔNG CHẤM CA</em>
                </div>
              )}
            </button>

            {/* Cửa hàng mở ra 2 luồng con (Thu ngân/Bán hàng); các khối một
                luồng thì ra thẳng danh sách người — chia thêm theo cấp bậc
                (Bếp trưởng/Bếp phó/Nhân viên) cho các khối bếp. */}
            {mo && (
              <div className="cc2-drill" style={{ marginTop: 6 }}>
                {con.length === 1 ? (
                  KHOI_CO_CAP_BAC.has(k.ma)
                    ? <DanhSachNguoiTheoCapBac nguoi={con[0].nguoi} onXemNhanSu={onXemNhanSu} />
                    : <DanhSachNguoi nguoi={con[0].nguoi} onXemNhanSu={onXemNhanSu} />
                ) : con.map((c) => {
                  const l = LUONG[c.ma];
                  const moCon = luongKhoiMo === c.ma;
                  return (
                    <div key={c.ma}>
                      <button
                        className={`cc2-drill-row${moCon ? ' dang-mo' : ''}`}
                        onClick={() => setLuongKhoiMo(moCon ? null : c.ma)}
                        aria-expanded={moCon}
                      >
                        <span className="cc2-drill-icon">{l.icon}</span>
                        <span className="cc2-drill-ten">
                          {l.ten}
                          <small style={{ display: 'block', color: 'var(--cc2-muted)', fontWeight: 700, fontSize: 11 }}>
                            {c.vao}/{c.tong} trong ca{c.muon ? ` · ${c.muon} muộn` : ''}
                          </small>
                        </span>
                        <span className="cc2-drill-so">{c.tong}</span>
                        <span className="cc2-mui-ten" aria-hidden="true">{moCon ? '▴' : '▾'}</span>
                      </button>
                      {moCon && <DanhSachNguoi nguoi={c.nguoi} onXemNhanSu={onXemNhanSu} />}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}
