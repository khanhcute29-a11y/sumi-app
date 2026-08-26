import React, { useMemo, useState } from 'react';
import { chuCaiDau, doDaiPhut } from './dungChung';

// Màn hình Chấm Công của QUẢN LÝ (bếp trưởng / bếp phó / trợ lý GĐ xưởng).
// Dựng theo mockup: ca của chính mình -> việc cần xử lý -> nhân sự trong ca.
//
// Phạm vi nhìn thấy do MÀN HÌNH CHA quyết (`danhSach` đã lọc theo khâu), và
// bên dưới còn một lớp nữa: hàng rào RLS của database. Màn hình không tự nới.

function trangThaiNhanSu(cham) {
  if (cham?.xinNghi) return { chu: 'XIN NGHỈ', lop: 'cc2-staff-state late' };
  if (!cham?.vaoISO) return { chu: 'CHƯA VÀO', lop: 'cc2-staff-state absent' };
  if (cham?.chenhLech?.loaiVao === 'late') return { chu: 'ĐI MUỘN', lop: 'cc2-staff-state late' };
  return { chu: cham?.raISO ? 'ĐÃ RA CA' : 'ĐÚNG GIỜ', lop: 'cc2-staff-state' };
}

function moTaNhanSu(cham) {
  if (cham?.xinNghi) return 'Đã gửi đơn xin nghỉ';
  if (!cham?.vaoISO) return 'Chưa có dữ liệu chấm công';
  const dev = cham.chenhLech;
  const phan = cham.raISO ? `Ra ca ${cham.ra}` : `Vào ca ${cham.vao} · Đang làm`;
  if (dev?.loaiVao === 'late') return `${phan} · muộn ${doDaiPhut(dev.lechVao)}`;
  return phan;
}

export default function QuanLyV2({
  hoSo, danhSach, toi, laGiamDoc, danhSachCa, boPhanTheoNguoi,
  gioHienTai, onCheckin, onCheckout, onXemNhanSu,
}) {
  const [loc, setLoc] = useState('all');

  const cuaToi = toi?.cham || null;
  const caToi = cuaToi?.ca || null;
  const devToi = cuaToi?.chenhLech || null;

  // Người khác mình — mình đã có thẻ riêng ở trên rồi.
  const nguoiKhac = useMemo(
    () => (danhSach || []).filter((x) => x.hoSo.id !== hoSo?.id),
    [danhSach, hoSo?.id],
  );

  // "Cần xử lý": đi muộn, hoặc quá mốc mà vẫn chưa chấm.
  const canXuLy = useMemo(() => {
    const ra = [];
    nguoiKhac.forEach(({ hoSo: h, cham }) => {
      if (cham?.chenhLech?.loaiVao === 'late') {
        ra.push({
          id: h.id, icon: '⏰', ten: h.full_name,
          chinh: `${h.full_name} đi muộn ${doDaiPhut(cham.chenhLech.lechVao)}`,
          phu: `${cham.ca?.ten || 'Ca'} (${cham.ca?.batDau}–${cham.ca?.ketThuc}) · Có mặt: ${cham.vao}`,
        });
      } else if (!cham?.vaoISO && !cham?.xinNghi && cham?.ca) {
        ra.push({
          id: h.id, icon: '❓', ten: h.full_name,
          chinh: `${h.full_name} chưa vào ca`,
          phu: `Ca bắt đầu ${cham.ca.batDau} (mốc: ${cham.ca.moc})`,
        });
      }
    });
    return ra;
  }, [nguoiKhac]);

  const daLoc = useMemo(() => {
    if (loc === 'late') return nguoiKhac.filter((x) => x.cham?.chenhLech?.loaiVao === 'late');
    if (loc === 'absent') return nguoiKhac.filter((x) => !x.cham?.vaoISO && !x.cham?.xinNghi);
    if (loc === 'working') return nguoiKhac.filter((x) => x.cham?.vaoISO && !x.cham?.raISO);
    return nguoiKhac;
  }, [nguoiKhac, loc]);

  const daVaoCa = nguoiKhac.filter((x) => x.cham?.vaoISO).length;

  return (
    <div className="cc2">
      <header className="cc2-hero navy">
        <div className="cc2-hero-top">
          <div className="cc2-identity">
            <div className="cc2-avatar">🧑‍🍳</div>
            <div style={{ minWidth: 0 }}>
              <div className="cc2-eyebrow">
                {laGiamDoc ? 'QUẢN LÝ · TOÀN XƯỞNG' : 'QUẢN LÝ · KHÂU CỦA TÔI'}
              </div>
              <div className="cc2-name">Ca của đội hôm nay</div>
            </div>
          </div>
        </div>
        <div className="cc2-clock">
          <div>
            <strong>{daVaoCa}/{nguoiKhac.length}</strong>
            <br />
            <span>nhân sự đã vào ca</span>
          </div>
          <div className="cc2-date-chip">
            {`${String(gioHienTai.getDate()).padStart(2, '0')}/${String(gioHienTai.getMonth() + 1).padStart(2, '0')}/${gioHienTai.getFullYear()}`}
          </div>
        </div>
      </header>

      <main style={{ padding: '0 2px' }}>
        {/* ── Ca của chính quản lý ── */}
        <div className="cc2-section-title"><span>CHẤM CÔNG CỦA TÔI</span></div>
        <section className="cc2-lead-own">
          <div className="cc2-lead-own-top">
            <div style={{ minWidth: 0 }}>
              <small className="cc2-eyebrow" style={{ color: 'var(--cc2-navy)' }}>
                {(caToi?.ten || 'KHÔNG THEO CA CỐ ĐỊNH').toUpperCase()}
              </small>
              <br />
              <b>{caToi ? `${caToi.ten} · ${caToi.batDau}–${caToi.ketThuc}` : 'Giờ linh hoạt'}</b>
            </div>
            <span className={`cc2-status${cuaToi?.vaoISO ? (cuaToi?.raISO ? '' : '') : ' red'}`}>
              {cuaToi?.raISO ? '● Đã tan ca' : cuaToi?.vaoISO ? '● Đang trong ca' : '● Chưa vào ca'}
            </span>
          </div>

          <div className="cc2-lead-own-times">
            <div className="cc2-lead-own-time">
              <small>Giờ vào</small>
              <strong>
                {cuaToi?.vao || '--:--'}
                {devToi && cuaToi?.vaoISO && (
                  <span className={`cc2-kpi-tag ${devToi.loaiVao === 'late' ? 'cc2-kpi-bad' : 'cc2-kpi-good'}`}
                    style={{ fontSize: 9 }}>
                    {devToi.loaiVao === 'late' ? `TRỄ ${doDaiPhut(devToi.lechVao)}`
                      : devToi.loaiVao === 'early' ? `SỚM ${doDaiPhut(devToi.lechVao)}` : 'ĐÚNG MỐC'}
                  </span>
                )}
              </strong>
            </div>
            <div className="cc2-lead-own-time">
              <small>Giờ ra</small>
              <strong>{cuaToi?.ra || '--:--'}</strong>
            </div>
          </div>

          <div className="cc2-lead-own-action">
            <button onClick={() => onXemNhanSu?.({ hoSo, cham: cuaToi })}>🕘 XEM LỊCH SỬ</button>
            {!cuaToi?.vaoISO && (
              <button className="primary-small" onClick={onCheckin}>▶ BẮT ĐẦU CA</button>
            )}
            {cuaToi?.vaoISO && !cuaToi?.raISO && (
              <button className="primary-small" onClick={onCheckout}>🏁 KẾT THÚC CA</button>
            )}
            {cuaToi?.raISO && (
              <button className="primary-small" disabled style={{ opacity: .55 }}>✓ ĐÃ XONG CA</button>
            )}
          </div>
        </section>

        {/* ── Cần xử lý ── */}
        {canXuLy.length > 0 && (
          <>
            <div className="cc2-section-title">
              <span>CẦN XỬ LÝ</span>
              <span style={{ color: 'var(--cc2-red)', fontWeight: 950 }}>{canXuLy.length}</span>
            </div>
            {canXuLy.map((c) => (
              <div className="cc2-callout" key={c.id}>
                <div className="mark">{c.icon}</div>
                <div style={{ minWidth: 0 }}>
                  <b>{c.chinh}</b>
                  <small>{c.phu}</small>
                </div>
                <button onClick={() => {
                  const item = nguoiKhac.find((x) => x.hoSo.id === c.id);
                  if (item) onXemNhanSu?.(item);
                }}>XEM</button>
              </div>
            ))}
          </>
        )}

        {/* ── Nhân sự trong ca ── */}
        <div className="cc2-section-title">
          <span>NHÂN SỰ TRONG CA</span>
          <button onClick={() => setLoc(loc === 'all' ? 'late' : loc === 'late' ? 'absent' : loc === 'absent' ? 'working' : 'all')}>
            {loc === 'all' ? 'Tất cả' : loc === 'late' ? 'Đi muộn' : loc === 'absent' ? 'Chưa vào' : 'Đang làm'} ▾
          </button>
        </div>

        {daLoc.length === 0 ? (
          <div className="cc2-empty">Không có ai trong nhóm này.</div>
        ) : (
          <div className="cc2-team-list">
            {daLoc.map(({ hoSo: h, cham }) => {
              const tt = trangThaiNhanSu(cham);
              return (
                <button className="cc2-staff" key={h.id} onClick={() => onXemNhanSu?.({ hoSo: h, cham })}>
                  <div className="cc2-staff-face">{chuCaiDau(h.full_name)}</div>
                  <div style={{ minWidth: 0 }}>
                    <b>{h.full_name}</b>
                    <small>{moTaNhanSu(cham)}</small>
                  </div>
                  <span className={tt.lop}>{tt.chu}</span>
                </button>
              );
            })}
          </div>
        )}
      </main>

    </div>
  );
}
