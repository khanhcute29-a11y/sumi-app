import React from 'react';
import { TRANG_THAI, MAU_CHAM_LICH } from '../../lib/chamCong';

const THU = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

function nhanNgay(d) {
  return d.toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' });
}

// ── Lịch tháng ──────────────────────────────────────────────────────────────
function LichThang({ nam, thang, ngayList, homNay, onLui, onToi }) {
  const dauTuan = new Date(nam, thang - 1, 1).getDay();
  const soNgay = new Date(nam, thang, 0).getDate();

  const theoNgay = {};
  (ngayList || []).forEach((d) => { theoNgay[d.ngay] = d; });

  const o = [];
  for (let i = 0; i < dauTuan; i += 1) o.push(null);
  for (let d = 1; d <= soNgay; d += 1) o.push(d);

  return (
    <div className="cc-mini-cal">
      <div className="cc-cal-header">
        <button className="cc-cal-nav" onClick={onLui} aria-label="Tháng trước">‹</button>
        <span className="cc-cal-month">Tháng {thang} / {nam}</span>
        <button className="cc-cal-nav" onClick={onToi} aria-label="Tháng sau">›</button>
      </div>
      <div className="cc-cal-grid">
        {THU.map((t) => <div key={t} className="cc-cal-dow">{t}</div>)}
        {o.map((ngay, i) => {
          if (!ngay) return <div key={`t${i}`} />;
          const khoa = `${nam}-${String(thang).padStart(2, '0')}-${String(ngay).padStart(2, '0')}`;
          const muc = theoNgay[khoa];
          const laHomNay = khoa === homNay;
          const mau = muc ? MAU_CHAM_LICH[muc.trangThai] : null;
          const chuThich = muc
            ? `${khoa} · ${TRANG_THAI[muc.trangThai]?.nhan || ''}${muc.vao ? ` · vào ${muc.vao}` : ''}${muc.ra ? ` · ra ${muc.ra}` : ''}`
            : khoa;
          return (
            <div key={khoa} className={`cc-cal-day${laHomNay ? ' today' : ''}`} title={chuThich}>
              <span className="cc-cal-num">{ngay}</span>
              {mau && <span className="cc-cal-dot" style={{ background: mau }} />}
            </div>
          );
        })}
      </div>
      <div style={{ display: 'flex', gap: 12, marginTop: 10, flexWrap: 'wrap' }}>
        {[
          { mau: '#16a34a', nhan: 'Đúng giờ' },
          { mau: '#f59e0b', nhan: 'Muộn' },
          { mau: '#7c3aed', nhan: 'Xin nghỉ' },
          { mau: '#d1d5db', nhan: 'Chưa chấm' },
        ].map((l) => (
          <span key={l.nhan} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700, color: '#725f50' }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: l.mau, display: 'inline-block' }} />
            {l.nhan}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function ChamCongNhanVien({
  hoSo, homNay, ngayXem, canCham,
  tomTat, nam, thang, onLuiThang, onToiThang,
  onCheckin, onCheckout, onXinNghi,
}) {
  const n = canCham;
  const ca = n?.ca || null;
  const dev = n?.chenhLech || null;
  const tt = n ? TRANG_THAI[n.trangThai] : null;
  const daVao = !!n?.vaoISO;
  const daRa = !!n?.raISO;
  const tenCa = ca?.ten || n?.nhanCa || 'Ca làm việc';

  return (
    <>
      {/* ── Thẻ ca hôm nay ── */}
      <div className="cc-today-card">
        <div className="cc-today-label">CA HÔM NAY</div>
        <div className="cc-today-date">{nhanNgay(new Date(`${ngayXem}T00:00:00`))}</div>
        {daVao || ca ? (
          <div className="cc-today-shift">
            <span className="cc-today-shift-icon">{ca?.icon || '🕐'}</span>
            <div className="cc-today-shift-info">
              <div className="cc-today-shift-name">{tenCa}</div>
              <div className="cc-today-shift-time">
                {ca
                  ? `Quy định: ${ca.batDau}–${ca.ketThuc}${ca.soGio ? ` (${ca.soGio} tiếng)` : ''}`
                  : 'Chưa gán ca chuẩn cho lần chấm này'}
              </div>
            </div>
            {tt && (
              <span className="cc-today-status-badge" style={{ background: tt.nen, color: tt.mau }}>
                {tt.icon} {tt.nhan}
              </span>
            )}
          </div>
        ) : (
          <div style={{ background: 'rgba(255,255,255,.1)', borderRadius: 14, padding: '12px 14px', color: 'rgba(255,255,255,.65)', fontSize: 14 }}>
            Hôm nay bạn chưa chấm công. Bấm nút bên dưới để bắt đầu ca.
          </div>
        )}
      </div>

      {/* ── Chênh lệch so với quy định ── */}
      {dev ? (
        <div className="cc-deviation-card">
          <div className="cc-deviation-head">
            <span className="cc-deviation-title">⏱️ Chênh lệch so với quy định</span>
            <span style={{ fontSize: 11, fontWeight: 800, color: '#a08060' }}>
              Chuẩn {dev.chuanVao}–{dev.chuanRa}
            </span>
          </div>
          <div className="cc-deviation-grid">
            <div className={`cc-deviation-box${dev.loaiVao === 'late' ? ' alert' : dev.loaiVao === 'early' ? ' success' : ''}`}>
              <span className="cc-dev-label">Vào ca (Quy định: {dev.chuanVao})</span>
              <span className="cc-dev-val">{n.vao || 'Chưa vào ca'}</span>
              {n.vao && (
                <span className={`cc-dev-diff ${dev.loaiVao}`}>
                  {dev.loaiVao === 'late' ? '⏰ ' : dev.loaiVao === 'early' ? '🟢 ' : '✓ '}{dev.nhanVao}
                </span>
              )}
            </div>
            <div className={`cc-deviation-box${dev.loaiRa === 'ot' ? ' success' : dev.loaiRa === 'early' ? ' alert' : ''}`}>
              <span className="cc-dev-label">Ra ca (Quy định: {dev.chuanRa})</span>
              <span className="cc-dev-val">{n.ra || 'Đang trong ca…'}</span>
              {n.ra ? (
                <span className={`cc-dev-diff ${dev.loaiRa}`}>
                  {dev.loaiRa === 'ot' ? '⚡ ' : dev.loaiRa === 'early' ? '⚠️ ' : '✓ '}{dev.nhanRa}
                </span>
              ) : (
                <span style={{ fontSize: 12, color: '#725f50', fontWeight: 700 }}>Chưa chấm ra</span>
              )}
            </div>
          </div>
        </div>
      ) : daVao ? (
        <div className="cc-deviation-card">
          <div className="cc-deviation-head">
            <span className="cc-deviation-title">⏱️ Chênh lệch so với quy định</span>
          </div>
          <div style={{ fontSize: 13, color: '#725f50', lineHeight: 1.6 }}>
            Lần chấm này <b>không gắn với ca chuẩn nào</b> nên chưa tính được đi muộn / tăng ca.
            Lần sau khi chấm vào, hãy chọn đúng <b>Ca chuẩn</b> trong ô đầu tiên của biểu mẫu.
          </div>
          <div className="cc-deviation-grid" style={{ marginTop: 10 }}>
            <div className="cc-deviation-box">
              <span className="cc-dev-label">Giờ vào thực tế</span>
              <span className="cc-dev-val">{n.vao || '—'}</span>
            </div>
            <div className="cc-deviation-box">
              <span className="cc-dev-label">Giờ ra thực tế</span>
              <span className="cc-dev-val">{n.ra || 'Đang trong ca…'}</span>
            </div>
          </div>
        </div>
      ) : null}

      {/* ── Nút chấm công ── */}
      <div className="cc-checkin-area">
        {!daVao ? (
          <button className="cc-checkin-btn start" onClick={onCheckin}>
            <span>🟢 Bắt đầu ca làm</span>
            <span style={{ fontSize: 13, opacity: 0.85 }}>Nhấn để chấm vào</span>
          </button>
        ) : (
          <div className="cc-checkin-btn done" style={{ cursor: 'default' }}>
            <div>
              <span>✅ Đã vào ca {tenCa}</span>
              {dev?.loaiVao === 'late' && <span className="cc-diff-pill late" style={{ marginLeft: 8 }}>+{dev.lechVao}p muộn</span>}
              {dev?.loaiVao === 'early' && <span className="cc-diff-pill early" style={{ marginLeft: 8 }}>sớm {Math.abs(dev.lechVao)}p</span>}
            </div>
            <span className="cc-checkin-timestamp">{n.vao}</span>
          </div>
        )}

        {daVao && !daRa && (
          <button className="cc-checkin-btn end" onClick={onCheckout}>
            <span>🔴 Kết thúc {tenCa}</span>
            <span style={{ fontSize: 13, opacity: 0.85 }}>Nhấn để chấm ra</span>
          </button>
        )}
        {daRa && (
          <div className="cc-checkin-btn done" style={{ cursor: 'default' }}>
            <div>
              <span>🏁 Đã ra ca</span>
              {dev?.loaiRa === 'ot' && <span className="cc-diff-pill ot" style={{ marginLeft: 8 }}>+{dev.lechRa}p OT</span>}
              {typeof n.soGio === 'number' && (
                <span className="cc-diff-pill early" style={{ marginLeft: 8, background: '#f9fafb', borderColor: '#e5e7eb', color: '#374151' }}>
                  {Math.round(n.soGio * 10) / 10}h thực làm
                </span>
              )}
            </div>
            <span className="cc-checkin-timestamp">{n.ra}</span>
          </div>
        )}

        <button className="cc-checkin-btn leave" onClick={onXinNghi}>📋 Xin nghỉ / Báo muộn</button>
      </div>

      {/* ── Lịch sử hôm nay ── */}
      <div className="cc-section">
        <div className="cc-section-head">
          <span className="cc-section-title">⏱ Lịch sử hôm nay &amp; chênh lệch</span>
        </div>
        <div className="cc-timeline">
          {daVao && (
            <div className="cc-tl-row">
              <div className="cc-tl-dot-col">
                <div className="cc-tl-dot" style={{ background: '#16a34a' }} />
                {!daRa && <div className="cc-tl-line" />}
              </div>
              <div className="cc-tl-time">{n.vao}</div>
              <div style={{ flex: 1 }}>
                <div className="cc-tl-label" style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <span>🟢 Vào ca — {tenCa}</span>
                  {dev && <span className={`cc-diff-pill ${dev.loaiVao}`}>{dev.nhanVao}</span>}
                </div>
                {n.ghiChu && <div className="cc-tl-note">Ghi chú: {n.ghiChu}</div>}
              </div>
            </div>
          )}
          {daRa && (
            <div className="cc-tl-row">
              <div className="cc-tl-dot-col"><div className="cc-tl-dot" style={{ background: '#3b82f6' }} /></div>
              <div className="cc-tl-time">{n.ra}</div>
              <div style={{ flex: 1 }}>
                <div className="cc-tl-label" style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <span>🏁 Ra ca — {tenCa}</span>
                  {dev && <span className={`cc-diff-pill ${dev.loaiRa}`}>{dev.nhanRa}</span>}
                </div>
              </div>
            </div>
          )}
          {!daVao && !n?.xinNghi && (
            <div style={{ color: '#a08060', fontSize: 14, padding: '8px 0' }}>Chưa chấm công hôm nay</div>
          )}
          {!daVao && n?.xinNghi && (
            <div className="cc-tl-row">
              <div className="cc-tl-dot-col"><div className="cc-tl-dot" style={{ background: '#7c3aed' }} /></div>
              <div className="cc-tl-time">—</div>
              <div style={{ flex: 1 }}>
                <div className="cc-tl-label">🏖 Đã gửi đơn xin nghỉ</div>
                {n.ghiChu && <div className="cc-tl-note">Lý do: {n.ghiChu}</div>}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Tóm tắt tháng ── */}
      <div className="cc-section" style={{ marginTop: 6 }}>
        <div className="cc-section-head">
          <span className="cc-section-title">📊 Tóm tắt tháng {thang}</span>
          <span style={{ fontSize: 12, color: '#a08060', fontWeight: 800 }}>{hoSo?.full_name || ''}</span>
        </div>
        <div className="cc-stats-grid">
          <div className="cc-stat-card" style={{ background: '#f0fdf4', color: '#15803d' }}>
            <div className="cc-stat-val">{tomTat.soNgayLam}</div>
            <div className="cc-stat-label">Ngày đã làm</div>
          </div>
          <div className="cc-stat-card" style={{ background: '#eff6ff', color: '#1d4ed8' }}>
            <div className="cc-stat-val">{tomTat.tongGio}h</div>
            <div className="cc-stat-label">Tổng giờ làm</div>
          </div>
          <div className="cc-stat-card" style={{ background: '#fff7ed', color: '#c2410c' }}>
            <div className="cc-stat-val">{tomTat.phutOT}p</div>
            <div className="cc-stat-label">Tăng ca</div>
          </div>
          <div className="cc-stat-card" style={{ background: '#fffbeb', color: '#b45309' }}>
            <div className="cc-stat-val">{tomTat.soMuon}</div>
            <div className="cc-stat-label">Lần đi muộn</div>
          </div>
        </div>
      </div>

      {/* ── Lịch chấm công ── */}
      <div className="cc-section" style={{ marginTop: 14 }}>
        <div className="cc-section-head">
          <span className="cc-section-title">📅 Lịch chấm công tháng {thang}</span>
        </div>
        <LichThang
          nam={nam} thang={thang} ngayList={tomTat.ngayList}
          homNay={homNay} onLui={onLuiThang} onToi={onToiThang}
        />
      </div>
    </>
  );
}
