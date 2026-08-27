import React, { useMemo, useState } from 'react';
import { TEN_BO_PHAN, caChuanCuaLog, gioLamThuc, gioPhut } from '../../../lib/chamCong';
import { LichSuCham, gioThanhChu, TheChenhLech, gomPhien, nhanChenhLech } from './dungChung';
import DonTuCuaToi from './DonTuCuaToi';
import { fetchShiftLogsRange } from '../../../lib/queries';

// Màn hình Chấm Công của NHÂN VIÊN — dựng theo mockup time-attendance-v2.html.
//
// Toàn bộ giờ ca hiển thị ở đây lấy từ `danhSachCa`, tức bảng `sumi_quy_dinh_ca`
// dưới database. KHÔNG gõ cứng "05:30 - 13:30" vào đây. Khi tiệm đổi giờ ca thì
// sửa dữ liệu trong bảng là màn hình đổi theo, không phải sửa mã nguồn.

function nhanTrangThai({ xinNghi, phienHienTai, dangTrongCa, devVao }) {
  if (xinNghi && !phienHienTai) return { chu: '● Xin nghỉ', lop: 'cc2-status warn' };
  if (dangTrongCa) {
    return devVao?.loai === 'bad'
      ? { chu: '● Đang làm · vào muộn', lop: 'cc2-status warn' }
      : { chu: '● Đang trong ca', lop: 'cc2-status' };
  }
  if (phienHienTai) return { chu: '● Đã tan ca', lop: 'cc2-status' };
  return { chu: '● Chưa vào ca', lop: 'cc2-status red' };
}

export default function NhanVienV2({
  hoSo, cham, danhSachCa, boPhan, logsHomNay, tomTat, thuong = [],
  gioHienTai, onCheckin, onCheckout, onXemThang, deXuatGia = null,
}) {
  // ── Chấm ca nhiều lần trong ngày ────────────────────────────────────
  //
  // `cham` (tham số cha truyền vào) chỉ gộp lần VÀO ĐẦU TIÊN và lần RA CUỐI
  // CÙNG trong ngày — đúng cho một ca duy nhất, nhưng sai nếu nhân sự chấm
  // lại nhiều lần (ví dụ: làm ca sáng, tan ca, rồi quay lại làm thêm buổi
  // chiều). Ở ĐÂY dùng `gomPhien` ghép trực tiếp từ nhật ký hôm nay để luôn
  // biết đúng PHIÊN GẦN NHẤT, cho phép "chấm ca mới" sau khi đã ra ca.
  const phien = useMemo(() => gomPhien(logsHomNay), [logsHomNay]);
  const phienHienTai = phien[phien.length - 1] || null;
  const dangTrongCa = !!(phienHienTai && !phienHienTai.ra);
  const soCaXong = phien.filter((p) => p.ra).length;

  // Ca chuẩn CỦA PHIÊN GẦN NHẤT — lấy từ dòng VÀO CA (nơi trigger database có
  // điền `expected_start`). Dòng RA CA không bao giờ có trường đó, nên phải
  // lấy ca của lần vào tương ứng, không tự đọc thẳng dòng ra ca.
  const caHienThi = (phienHienTai ? caChuanCuaLog(phienHienTai.vao, danhSachCa, boPhan) : null)
    || (danhSachCa || []).find((c) => c.boPhan === boPhan) || null;

  const devVao = phienHienTai ? nhanChenhLech(phienHienTai.vao, caHienThi) : null;
  const devRa = (phienHienTai && phienHienTai.ra) ? nhanChenhLech(phienHienTai.ra, caHienThi) : null;

  const gioVaoChu = phienHienTai ? gioPhut(phienHienTai.vao.checkin_time || phienHienTai.vao.created_at) : null;
  const gioRaChu = (phienHienTai && phienHienTai.ra)
    ? gioPhut(phienHienTai.ra.checkin_time || phienHienTai.ra.created_at) : null;

  // Tổng giờ làm hôm nay = cộng dồn TỪNG PHIÊN đã đóng — không phải khoảng
  // cách từ lần vào đầu tiên tới lần ra cuối cùng (sẽ tính oan cả quãng nghỉ
  // giữa hai ca thành giờ làm việc).
  const tongGioHomNay = phien.reduce((tong, p) => {
    if (!p.ra) return tong;
    return tong + (gioLamThuc(p.vao.checkin_time || p.vao.created_at, p.ra.checkin_time || p.ra.created_at) || 0);
  }, 0);

  const tt = nhanTrangThai({ xinNghi: cham?.xinNghi, phienHienTai, dangTrongCa, devVao });

  const tenBoPhan = TEN_BO_PHAN[boPhan] || 'Không theo ca cố định';
  const thuongHomNay = (thuong || []).filter((t) => {
    const hn = new Date().toISOString().slice(0, 10);
    return String(t.awarded_on || '').slice(0, 10) === hn;
  });
  const tongSao = thuongHomNay.reduce((s, t) => s + (t.so_sao || Math.round((t.amount || 0) / 1000)), 0);

  return (
    <div className="cc2">
      {/* ── Đầu trang ── */}
      <header className="cc2-hero">
        <div className="cc2-hero-top">
          <div className="cc2-identity">
            <div className="cc2-avatar">👩‍🍳</div>
            <div style={{ minWidth: 0 }}>
              <div className="cc2-eyebrow">{tenBoPhan.toUpperCase()}</div>
              <div className="cc2-name">Chào, {hoSo?.full_name || 'bạn'}</div>
            </div>
          </div>
        </div>
        <div className="cc2-clock">
          <div>
            <strong>{gioHienTai.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}</strong>
            <br />
            <span>{gioHienTai.toLocaleDateString('vi-VN', { weekday: 'long', day: 'numeric', month: 'long' })}</span>
          </div>
          {caHienThi && <div className="cc2-date-chip">{String(caHienThi.ten || '').toUpperCase()}</div>}
        </div>
      </header>

      <main style={{ padding: '0 2px' }}>
        <div className="cc2-section-title">
          <span>CA CỦA TÔI</span>
          <span className={tt.lop}>{tt.chu}</span>
        </div>

        <section className={`cc2-shift-card${phienHienTai ? (devVao?.loai === 'bad' ? ' late' : '') : ' pending'}`}>
          <div className="cc2-shift-head">
            <div style={{ minWidth: 0 }}>
              <small className="cc2-eyebrow" style={{ color: 'var(--cc2-caramel)' }}>
                HÔM NAY · {tenBoPhan.toUpperCase()}
              </small>
              <br />
              <b>
                {caHienThi
                  ? `${caHienThi.ten} · ${caHienThi.batDau}–${caHienThi.ketThuc}`
                  : 'Không theo ca cố định'}
              </b>
            </div>
            <span style={{ fontSize: 26 }}>{caHienThi?.icon || '🕐'}</span>
          </div>

          {/* Bảng quy định — CHỈ ĐỌC. Giờ lấy từ database, không gõ cứng. */}
          {caHienThi && (
            <div className="cc2-shift-rules">
              ⏱️ Có mặt trước {caHienThi.phutSom ?? 10} phút (trước {caHienThi.moc}) để được tính đúng giờ.
              <br />
              🍛 Nghỉ trưa 11:30 – 12:30 được trừ theo phần thật sự trùng với ca của bạn.
              <br />
              📋 Ngày công chuẩn {caHienThi.soGio ?? 9} tiếng.
            </div>
          )}

          <div className="cc2-timeline">
            <div className={`cc2-time-point${phienHienTai ? '' : ' pending'}`}>
              <div className="cc2-time-dot">▶</div>
              <small>Giờ vào{soCaXong > 0 ? ' (gần nhất)' : ''}</small>
              <strong>{gioVaoChu || '--:--'}</strong>
              {devVao && <TheChenhLech nhan={devVao} />}
            </div>
            <div className={`cc2-time-point${gioRaChu ? '' : ' pending'}`}>
              <div className="cc2-time-dot">■</div>
              <small>Giờ ra{soCaXong > 0 ? ' (gần nhất)' : ''}</small>
              <strong>{gioRaChu || '--:--'}</strong>
              {devRa && devRa.chu !== 'Đúng giờ tan ca' && <TheChenhLech nhan={devRa} />}
            </div>
          </div>

          {!phienHienTai && (
            <button className="cc2-primary" onClick={onCheckin}>BẮT ĐẦU CA</button>
          )}
          {dangTrongCa && (
            <button className="cc2-primary checkout" onClick={onCheckout}>KẾT THÚC CA</button>
          )}
          {phienHienTai && !dangTrongCa && (
            <>
              {/* Đã ra ca, nhưng KHÔNG khoá lại — nhân sự có thể chấm ca mới
                  ngay trong hôm nay (ví dụ: làm ca sáng, rồi quay lại làm
                  thêm buổi chiều). Mỗi lần vào đều được database tính đi
                  muộn/đúng giờ độc lập theo đúng ca của lần đó. */}
              <div className="cc2-ok">
                ✓ Đã hoàn thành {soCaXong > 1 ? `${soCaXong} ca` : 'ca'} hôm nay
                {soCaXong > 1 ? ` · lần gần nhất ${gioVaoChu}–${gioRaChu}` : ''}
              </div>
              <button className="cc2-primary" onClick={onCheckin}>➕ CHẤM CA MỚI</button>
            </>
          )}

          <div className="cc2-mini-stats">
            <div className="cc2-mini">
              <strong>{gioThanhChu(tongGioHomNay)}</strong>
              <span>Đã làm{soCaXong > 1 ? ` (${soCaXong} ca)` : ''}</span>
            </div>
            <div className="cc2-mini">
              <strong>{caHienThi?.soGio ?? 9}h</strong>
              <span>Ngày công chuẩn</span>
            </div>
            <div className="cc2-mini">
              <strong style={{
                color: devVao?.loai === 'bad' ? 'var(--cc2-red)'
                  : phienHienTai ? 'var(--cc2-green)' : 'var(--cc2-muted)',
                fontSize: 15,
              }}>
                {!phienHienTai ? 'Chưa chấm' : devVao?.loai === 'bad' ? 'Đi muộn' : 'Đúng giờ'}
              </strong>
              <span>Tình trạng</span>
            </div>
          </div>

          {tongSao > 0 && (
            <div className="cc2-star-reward">
              <div>
                <b>🌟 Khen thưởng từ Quản lý</b>
                <br />
                <small style={{ color: 'var(--cc2-muted)', fontSize: 11 }}>
                  {tongSao.toLocaleString('vi-VN')} sao · {(tongSao * 1000).toLocaleString('vi-VN')}đ vào lương
                </small>
              </div>
              <span>{'⭐'.repeat(Math.min(tongSao, 5))}</span>
            </div>
          )}
        </section>


        {/* ── Tóm tắt tháng ── */}
        {tomTat && (
          <>
            <div className="cc2-section-title">
              <span>THÁNG NÀY</span>
              {onXemThang && <button onClick={onXemThang}>Xem lịch</button>}
            </div>
            <div className="cc2-summary-grid">
              <div className="cc2-summary good">
                <div className="symbol">✅</div>
                <strong>{tomTat.soNgayLam ?? 0}</strong>
                <span>Ngày đã làm</span>
              </div>
              <div className="cc2-summary">
                <div className="symbol">⏳</div>
                <strong>{tomTat.tongGio ?? 0}h</strong>
                <span>Tổng giờ làm</span>
              </div>
              <div className={`cc2-summary${tomTat.soMuon ? ' alert' : ''}`}>
                <div className="symbol">⏰</div>
                <strong>{tomTat.soMuon ?? 0}</strong>
                <span>Lần đi muộn</span>
              </div>
              {/* Chuyên cần theo nội quy: 0 lỗi 500K · 1-2 lỗi 300K · 3 lỗi 100K · >3 lỗi 0đ.
                  "Lỗi" ở đây là đi trễ QUÁ 15 PHÚT, không phải mọi lần trễ. */}
              <div className={`cc2-summary${tomTat.chuyenCan ? ' good' : ' alert'}`}>
                <div className="symbol">🎯</div>
                <strong style={{ fontSize: 22 }}>
                  {((tomTat.chuyenCan ?? 0) / 1000).toLocaleString('vi-VN')}K
                </strong>
                <span>Chuyên cần dự kiến</span>
              </div>
            </div>
          </>
        )}

        {/* ── Đơn từ của tôi — gửi mới bằng nút ➕ ở góc phải dưới ── */}
        <DonTuCuaToi hoSo={hoSo} duLieuGia={deXuatGia} />

        {/* ── Lịch sử — tra theo khoảng ngày ── */}
        <div className="cc2-section-title"><span>LỊCH SỬ CHẤM CÔNG</span></div>
        <TraLichSuTheoNgay hoSo={hoSo} boPhan={boPhan} danhSachCa={danhSachCa} logsHomNay={logsHomNay} />
      </main>
    </div>
  );
}

/**
 * Ô tìm lịch sử theo khoảng ngày: "Từ ngày ... → Đến ngày ...".
 *
 * Mặc định (chưa chọn khoảng) hiện đúng nhật ký hôm nay, giống trước đây.
 * Chọn khoảng thì gọi `fetchShiftLogsRange` — hàm CÓ SẴN, đang dùng cho lịch
 * cả tháng — chứ không viết truy vấn mới. Lọc lại đúng nhân viên đang xem, vì
 * hàm đó trả về của cả tiệm.
 */
function TraLichSuTheoNgay({ hoSo, boPhan, danhSachCa, logsHomNay }) {
  const [tuNgay, setTuNgay] = useState('');
  const [denNgay, setDenNgay] = useState('');
  const [dsTuyChinh, setDsTuyChinh] = useState(null);   // null = đang xem hôm nay
  const [dangTai, setDangTai] = useState(false);
  const [loi, setLoi] = useState('');

  const dangLoc = dsTuyChinh !== null;

  const tim = async () => {
    if (!tuNgay || !denNgay) { setLoi('Chọn đủ cả hai ngày giúp tôi.'); return; }
    if (tuNgay > denNgay) { setLoi('Ngày bắt đầu phải trước ngày kết thúc.'); return; }
    setDangTai(true); setLoi('');
    try {
      const data = await fetchShiftLogsRange(tuNgay, denNgay);
      setDsTuyChinh((data || []).filter((l) => l.staff_id === hoSo?.id));
    } catch (e) {
      setLoi(e?.message || 'Không tra được lịch sử. Thử lại giúp tôi.');
    } finally {
      setDangTai(false);
    }
  };

  const boLoc = () => { setTuNgay(''); setDenNgay(''); setDsTuyChinh(null); setLoi(''); };

  const oNgay = {
    flex: 1, minWidth: 0, minHeight: 46, padding: '0 10px', borderRadius: 12,
    border: '1px solid var(--cc2-line)', background: '#fff',
    color: 'var(--cc2-cocoa)', font: 'inherit', fontSize: 14, boxSizing: 'border-box',
  };

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
        <input type="date" style={oNgay} value={tuNgay} onChange={(e) => setTuNgay(e.target.value)}
          aria-label="Từ ngày" />
        <span style={{ color: 'var(--cc2-muted)', fontWeight: 900 }}>→</span>
        <input type="date" style={oNgay} value={denNgay} onChange={(e) => setDenNgay(e.target.value)}
          aria-label="Đến ngày" />
        <button className="cc2-drill-close" style={{ width: 46, height: 46 }} onClick={tim}
          disabled={dangTai} aria-label="Tìm">
          {dangTai ? '…' : '🔍'}
        </button>
      </div>

      {dangLoc && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
          marginBottom: 10, padding: '8px 12px', borderRadius: 12,
          background: 'var(--cc2-navy-soft)', color: 'var(--cc2-navy)',
          fontSize: 12.5, fontWeight: 800,
        }}>
          <span>📅 Đang xem {tuNgay.split('-').reverse().join('/')} → {denNgay.split('-').reverse().join('/')}</span>
          <button onClick={boLoc} style={{
            minHeight: 32, padding: '0 10px', border: 0, borderRadius: 9,
            background: '#fff', color: 'var(--cc2-navy)', fontWeight: 900, fontSize: 12, cursor: 'pointer',
          }}>✕ Về hôm nay</button>
        </div>
      )}

      {loi && <div className="cc2-error">⚠️ {loi}</div>}

      <LichSuCham
        logs={dangLoc ? dsTuyChinh : logsHomNay}
        danhSachCa={danhSachCa}
        boPhanTheoNguoi={{ [hoSo?.id]: boPhan }}
        rong={dangLoc ? 'Không có lần chấm công nào trong khoảng ngày này.' : 'Hôm nay bạn chưa chấm công lần nào.'}
      />
    </>
  );
}
