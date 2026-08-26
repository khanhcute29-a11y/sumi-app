import React from 'react';
import { TEN_BO_PHAN } from '../../../lib/chamCong';
import { LichSuCham, gioThanhChu, TheChenhLech, doDaiPhut } from './dungChung';

// Màn hình Chấm Công của NHÂN VIÊN — dựng theo mockup time-attendance-v2.html.
//
// Toàn bộ giờ ca hiển thị ở đây lấy từ `danhSachCa`, tức bảng `sumi_quy_dinh_ca`
// dưới database. KHÔNG gõ cứng "05:30 - 13:30" vào đây. Khi tiệm đổi giờ ca thì
// sửa dữ liệu trong bảng là màn hình đổi theo, không phải sửa mã nguồn.

function nhanTrangThai(cham) {
  if (cham?.xinNghi) return { chu: '● Xin nghỉ', lop: 'cc2-status warn' };
  if (cham?.raISO) return { chu: '● Đã tan ca', lop: 'cc2-status' };
  if (cham?.vaoISO) {
    return cham?.chenhLech?.loaiVao === 'late'
      ? { chu: '● Đang làm · vào muộn', lop: 'cc2-status warn' }
      : { chu: '● Đang trong ca', lop: 'cc2-status' };
  }
  return { chu: '● Chưa vào ca', lop: 'cc2-status red' };
}

export default function NhanVienV2({
  hoSo, cham, danhSachCa, boPhan, logsHomNay, tomTat, thuong = [],
  gioHienTai, onCheckin, onCheckout, onXinNghi, onXemThang,
}) {
  const ca = cham?.ca || null;
  const daVao = !!cham?.vaoISO;
  const daRa = !!cham?.raISO;
  const dev = cham?.chenhLech || null;
  const tt = nhanTrangThai(cham);

  // Ca chuẩn của bộ phận mình, kể cả khi hôm nay chưa chấm — để nhân viên luôn
  // nhìn thấy mình phải có mặt lúc mấy giờ.
  const caHienThi = ca || (danhSachCa || []).find((c) => c.boPhan === boPhan) || null;

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

        <section className={`cc2-shift-card${daVao ? (dev?.loaiVao === 'late' ? ' late' : '') : ' pending'}`}>
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
            <div className={`cc2-time-point${daVao ? '' : ' pending'}`}>
              <div className="cc2-time-dot">▶</div>
              <small>Giờ vào</small>
              <strong>{cham?.vao || '--:--'}</strong>
              {daVao && dev && (
                <TheChenhLech
                  nhan={dev.loaiVao === 'late'
                    ? { chu: `Trễ ${doDaiPhut(dev.lechVao)}`, loai: 'bad' }
                    : dev.loaiVao === 'early'
                      ? { chu: `Sớm ${doDaiPhut(dev.lechVao)}`, loai: 'good' }
                      : { chu: 'Đúng mốc', loai: 'good' }}
                />
              )}
            </div>
            <div className={`cc2-time-point${daRa ? '' : ' pending'}`}>
              <div className="cc2-time-dot">■</div>
              <small>Giờ ra</small>
              <strong>{cham?.ra || '--:--'}</strong>
              {daRa && dev && dev.loaiRa !== 'on_time' && (
                <TheChenhLech
                  nhan={dev.loaiRa === 'ot'
                    ? { chu: `Tăng ca +${doDaiPhut(dev.lechRa)}`, loai: 'warn' }
                    : { chu: `Về sớm ${doDaiPhut(dev.lechRa)}`, loai: 'bad' }}
                />
              )}
            </div>
          </div>

          {!daVao && (
            <button className="cc2-primary" onClick={onCheckin}>BẮT ĐẦU CA</button>
          )}
          {daVao && !daRa && (
            <button className="cc2-primary checkout" onClick={onCheckout}>KẾT THÚC CA</button>
          )}
          {daRa && (
            <button className="cc2-primary" disabled>ĐÃ HOÀN THÀNH CA HÔM NAY</button>
          )}

          <div className="cc2-mini-stats">
            <div className="cc2-mini">
              <strong>{gioThanhChu(cham?.soGio)}</strong>
              <span>Đã làm</span>
            </div>
            <div className="cc2-mini">
              <strong>{caHienThi?.soGio ?? 9}h</strong>
              <span>Ngày công chuẩn</span>
            </div>
            <div className="cc2-mini">
              <strong style={{
                color: dev?.loaiVao === 'late' ? 'var(--cc2-red)'
                  : daVao ? 'var(--cc2-green)' : 'var(--cc2-muted)',
                fontSize: 15,
              }}>
                {!daVao ? 'Chưa chấm' : dev?.loaiVao === 'late' ? 'Đi muộn' : 'Đúng giờ'}
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

        <button className="cc2-quiet-action" onClick={onXinNghi}>📋 XIN NGHỈ / ĐỀ XUẤT</button>

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

        {/* ── Lịch sử ── */}
        <div className="cc2-section-title"><span>LỊCH SỬ CHẤM CÔNG</span></div>
        <LichSuCham
          logs={logsHomNay}
          danhSachCa={danhSachCa}
          boPhanTheoNguoi={{ [hoSo?.id]: boPhan }}
          rong="Hôm nay bạn chưa chấm công lần nào."
        />
      </main>
    </div>
  );
}
