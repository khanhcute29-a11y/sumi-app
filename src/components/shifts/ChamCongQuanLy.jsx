import React, { useState } from 'react';
import { TRANG_THAI, tongHopChenhLech, boPhanCuaHoSo } from '../../lib/chamCong';

// Khâu lấy từ `profiles.station`. Phần lớn hồ sơ đang để trống nên có thêm
// nhóm "Chưa gán khâu" để không ai bị rơi ra khỏi danh sách.
export const KHAU = [
  { key: 'all', nhan: 'Toàn xưởng', icon: '🏭' },
  { key: 'bakery', nhan: 'Bakery', icon: '🧊', lop: 'cold' },
  { key: 'xuong41', nhan: 'Xưởng 41', icon: '🧁', lop: 'macaron' },
  { key: 'xuong42', nhan: 'Xưởng 42', icon: '🏫', lop: 'x42' },
  { key: 'van_tai', nhan: 'Vận tải', icon: '🛵', lop: 'ship' },
  { key: '_khac', nhan: 'Không theo ca', icon: '🏬', lop: 'owner' },
];

// Nhóm theo BỘ PHẬN CHẤM CÔNG (giống hệt cách database chia ca), không theo
// cột `station` thô — vì 21/25 hồ sơ bỏ trống cột đó, mà shipper thì vẫn thuộc
// Vận tải và thu ngân vẫn thuộc Bakery.
export function khauCua(hoSo) {
  return boPhanCuaHoSo(hoSo) || '_khac';
}

// Nhãn hiển thị thì chi tiết hơn: phân biệt Bếp Lạnh với Bếp Nóng nếu có.
export function nhanKhau(hoSo) {
  const st = (hoSo?.station || '').trim();
  if (st === 'lanh') return 'Bếp Lạnh';
  if (st === 'nong') return 'Bếp Nóng';
  const k = khauCua(hoSo);
  return KHAU.find((x) => x.key === k)?.nhan || 'Không theo ca';
}

function lopAvatar(key) {
  return KHAU.find((k) => k.key === key)?.lop || 'owner';
}

function chuCaiDau(ten) {
  const t = (ten || '?').trim().split(/\s+/);
  if (t.length === 1) return t[0].slice(0, 2).toUpperCase();
  return (t[t.length - 2][0] + t[t.length - 1][0]).toUpperCase();
}

// ── Bốn ô tổng hợp ──────────────────────────────────────────────────────────
function BangTongHop({ danhSach, tieuDe }) {
  const t = tongHopChenhLech(danhSach.map((x) => x.cham));
  const o = [
    { so: t.soMuon, nhan: 'Đi muộn', phu: `+${t.phutMuon}p`, nen: '#fffbeb', vien: '#fcd34d', mau: '#b45309', mauPhu: '#78350f' },
    { so: t.soOT, nhan: 'Tăng ca (OT)', phu: `+${t.phutOT}p`, nen: '#eff6ff', vien: '#93c5fd', mau: '#1d4ed8', mauPhu: '#1e40af' },
    { so: t.soDungGio, nhan: 'Đúng/Sớm', phu: 'Chuẩn giờ', nen: '#f0fdf4', vien: '#86efac', mau: '#15803d', mauPhu: '#166534' },
    { so: t.soChuaCham, nhan: 'Chưa chấm', phu: 'Chưa vào ca', nen: '#fef2f2', vien: '#fca5a5', mau: '#dc2626', mauPhu: '#991b1b' },
    { so: t.soViPham, nhan: 'Lỗi trễ >15p', phu: 'Tính vi phạm', nen: '#fdf2f8', vien: '#f9a8d4', mau: '#be185d', mauPhu: '#9d174d' },
  ];
  return (
    <div className="cc-summary-card">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, gap: 8 }}>
        <span className="cc-section-title">⏱️ {tieuDe}</span>
        <span style={{ fontSize: 11, fontWeight: 800, color: '#C88A4B', whiteSpace: 'nowrap' }}>
          {danhSach.length} nhân sự
        </span>
      </div>
      <div className="cc-summary-grid">
        {o.map((x) => (
          <div key={x.nhan} style={{ background: x.nen, border: `1.5px solid ${x.vien}`, borderRadius: 12, padding: '8px 6px', textAlign: 'center' }}>
            <div style={{ fontSize: 18, fontWeight: 900, color: x.mau }}>{x.so}</div>
            <div style={{ fontSize: 11, fontWeight: 800, color: x.mauPhu }}>{x.nhan}</div>
            <div style={{ fontSize: 10, color: x.mau, fontWeight: 700, marginTop: 2 }}>{x.phu}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Huy hiệu chênh lệch ─────────────────────────────────────────────────────
function VienChenhLech({ cham }) {
  const d = cham?.chenhLech;
  if (!d) {
    if (!cham?.vaoISO) return null;
    return <span className="cc-diff-pill" style={{ background: '#f9fafb', borderColor: '#e5e7eb', color: '#6b7280' }}>Không theo ca cố định</span>;
  }
  return (
    <>
      {d.loaiVao === 'late' && <span className="cc-diff-pill late">⏰ Muộn +{d.lechVao}p</span>}
      {d.loaiVao === 'early' && <span className="cc-diff-pill early">🟢 Sớm {Math.abs(d.lechVao)}p</span>}
      {d.loaiVao === 'on_time' && (
        <span className="cc-diff-pill" style={{ background: '#f9fafb', borderColor: '#e5e7eb', color: '#374151' }}>✓ Đúng {d.chuanVao}</span>
      )}
      {d.loaiRa === 'ot' && <span className="cc-diff-pill ot">⚡ OT +{d.lechRa}p</span>}
      {d.viPhamDiTre && (
        <span className="cc-diff-pill" style={{ background: '#fee2e2', borderColor: '#fca5a5', color: '#b42318' }}>
          ⚠️ Trễ &gt;15p
        </span>
      )}
    </>
  );
}

// ── Thẻ một nhân viên ───────────────────────────────────────────────────────
function TheNhanVien({ muc, laToi, onClick }) {
  const { hoSo, cham } = muc;
  const tt = TRANG_THAI[cham.trangThai];
  const k = khauCua(hoSo);
  return (
    <div className={`cc-staff-card${laToi ? ' is-me' : ''}`} onClick={onClick} role="button" tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } }}>
      <div className={`cc-avatar ${lopAvatar(k)}`}>{chuCaiDau(hoSo.full_name)}</div>
      <div className="cc-staff-info">
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span className="cc-staff-name">{hoSo.full_name || '?'}</span>
          {laToi && <span className="cc-me-tag">● TÔI</span>}
        </div>
        <div className="cc-staff-role">
          {nhanKhau(hoSo)}{hoSo.phone ? ` · SĐT: ${hoSo.phone}` : ''}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
          {cham.ca ? (
            <>
              <span style={{ fontSize: 12, color: '#725f50', fontWeight: 800 }}>
                {cham.ca.icon} {cham.ca.batDau}–{cham.ca.ketThuc} · mốc {cham.ca.moc}
              </span>
              <span style={{ fontSize: 12, color: '#a08060' }}>➔</span>
            </>
          ) : null}
          <span style={{ fontSize: 12, color: '#2d1c10', fontWeight: 900 }}>
            Thực tế: {cham.vao || '—'}{cham.ra ? ` ➔ ${cham.ra}` : ''}
          </span>
        </div>
      </div>
      <div className="cc-staff-right">
        <span className="cc-staff-status" style={{ background: tt.nen, color: tt.mau, border: `1.5px solid ${tt.vien}` }}>
          {tt.icon} {tt.nhan}
        </span>
        <VienChenhLech cham={cham} />
      </div>
    </div>
  );
}

// ── Ngăn kéo chi tiết ───────────────────────────────────────────────────────
function NganKeo({ muc, onClose }) {
  const { hoSo, cham } = muc;
  const tt = TRANG_THAI[cham.trangThai];
  const d = cham.chenhLech;
  const k = khauCua(hoSo);
  return (
    <div className="cc-drawer-overlay" onClick={onClose}>
      <div className="cc-drawer" onClick={(e) => e.stopPropagation()}>
        <div className="cc-drawer-handle" />
        <div className="cc-drawer-head">
          <div className={`cc-avatar ${lopAvatar(k)}`}>{chuCaiDau(hoSo.full_name)}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="cc-staff-name">{hoSo.full_name || '?'}</div>
            <div className="cc-staff-role">{nhanKhau(hoSo)}{hoSo.phone ? ` · SĐT: ${hoSo.phone}` : ''}</div>
          </div>
          <button className="cc-drawer-close" onClick={onClose} aria-label="Đóng">×</button>
        </div>

        <span className="cc-staff-status" style={{ background: tt.nen, color: tt.mau, border: `1.5px solid ${tt.vien}`, alignSelf: 'flex-start' }}>
          {tt.icon} {tt.nhan}
        </span>

        {cham.ca && (
          <div style={{ marginTop: 12, padding: '10px 12px', borderRadius: 12, background: '#eff6ff', color: '#1d4ed8', fontWeight: 800, fontSize: 13 }}>
            {cham.ca.icon} {cham.ca.ten} · {cham.ca.batDau} – {cham.ca.ketThuc} ({cham.ca.soGio} tiếng có mặt)
            <div style={{ fontSize: 12, fontWeight: 700, marginTop: 2 }}>Phải có mặt trước {cham.ca.moc}</div>
          </div>
        )}

        <div className="cc-deviation-card" style={{ margin: '12px 0 0' }}>
          <div className="cc-deviation-head">
            <span className="cc-deviation-title">⏱️ Đối chiếu &amp; chênh lệch giờ làm</span>
          </div>
          {d ? (
            <div className="cc-deviation-grid">
              <div className={`cc-deviation-box${d.loaiVao === 'late' ? ' alert' : d.loaiVao === 'early' ? ' success' : ''}`}>
                <span className="cc-dev-label">Mốc phải có mặt: {d.moc} (vào ca {d.chuanVao})</span>
                <span className="cc-dev-val">{cham.vao || 'Chưa vào ca'}</span>
                {cham.vao && <span className={`cc-dev-diff ${d.loaiVao}`}>{d.nhanVao}</span>}
              </div>
              <div className={`cc-deviation-box${d.loaiRa === 'ot' ? ' success' : d.loaiRa === 'early' ? ' alert' : ''}`}>
                <span className="cc-dev-label">Giờ tan ca: {d.chuanRa}</span>
                <span className="cc-dev-val">{cham.ra || 'Đang làm…'}</span>
                {cham.ra
                  ? <span className={`cc-dev-diff ${d.loaiRa}`}>{d.nhanRa}</span>
                  : <span style={{ fontSize: 12, color: '#725f50', fontWeight: 700 }}>Chưa kết thúc ca</span>}
              </div>
            </div>
          ) : (
            <div style={{ fontSize: 13, color: '#725f50', lineHeight: 1.6 }}>
              {/* Chưa bấm vào ca lần nào thì nói thẳng như vậy — đừng để câu
                  "không gắn ca chuẩn" làm người xem tưởng có lỗi dữ liệu. */}
              {cham.vaoISO
                ? 'Lần chấm này không gắn với ca chuẩn nào nên chưa tính được đi muộn / tăng ca.'
                : cham.xinNghi
                  ? 'Nhân viên đã gửi đơn xin nghỉ cho hôm nay.'
                  : 'Chưa chấm công hôm nay nên chưa có gì để đối chiếu.'}
              <div className="cc-deviation-grid" style={{ marginTop: 10 }}>
                <div className="cc-deviation-box">
                  <span className="cc-dev-label">Giờ vào thực tế</span>
                  <span className="cc-dev-val">{cham.vao || '—'}</span>
                </div>
                <div className="cc-deviation-box">
                  <span className="cc-dev-label">Giờ ra thực tế</span>
                  <span className="cc-dev-val">{cham.ra || (cham.vaoISO ? 'Đang làm…' : '—')}</span>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="cc-section" style={{ padding: '14px 0 0' }}>
          <div className="cc-section-head"><span className="cc-section-title">Timeline hôm nay</span></div>
          <div className="cc-timeline">
            {cham.vao && (
              <div className="cc-tl-row">
                <div className="cc-tl-dot-col">
                  <div className="cc-tl-dot" style={{ background: '#16a34a' }} />
                  {!cham.ra && <div className="cc-tl-line" />}
                </div>
                <div className="cc-tl-time">{cham.vao}</div>
                <div style={{ flex: 1 }}><div className="cc-tl-label">Vào ca</div></div>
              </div>
            )}
            {cham.ra && (
              <div className="cc-tl-row">
                <div className="cc-tl-dot-col"><div className="cc-tl-dot" style={{ background: '#3b82f6' }} /></div>
                <div className="cc-tl-time">{cham.ra}</div>
                <div style={{ flex: 1 }}>
                  <div className="cc-tl-label">Ra ca{typeof cham.soGio === 'number' ? ` · ${Math.round(cham.soGio * 10) / 10}h thực làm` : ''}</div>
                </div>
              </div>
            )}
            {!cham.vao && <div style={{ color: '#a08060', fontSize: 14 }}>Chưa chấm công hôm nay</div>}
          </div>
        </div>

        {cham.ghiChu && (
          <div style={{ marginTop: 12, padding: '10px 12px', borderRadius: 12, background: '#fffbeb', border: '1px solid #fcd34d', fontSize: 13, color: '#78350f' }}>
            📝 Ghi chú: {cham.ghiChu}
          </div>
        )}

        <button onClick={onClose} style={{ marginTop: 16, width: '100%', minHeight: 50, border: 0, borderRadius: 14, background: '#f4efe8', color: '#2d1c10', fontWeight: 900, fontSize: 15, cursor: 'pointer' }}>
          Đóng
        </button>
      </div>
    </div>
  );
}

// ── Màn hình quản lý ────────────────────────────────────────────────────────
export default function ChamCongQuanLy({ danhSach, toi, laGiamDoc, tieuDeTongHop, onXemChamCongCuaToi }) {
  const [locKhau, setLocKhau] = useState('all');
  const [locLech, setLocLech] = useState('all');
  const [dangXem, setDangXem] = useState(null);

  const nhomKhac = danhSach.filter((x) => x.hoSo.id !== toi?.hoSo?.id);

  let theoKhau = laGiamDoc ? danhSach : nhomKhac;
  if (laGiamDoc && locKhau !== 'all') theoKhau = theoKhau.filter((x) => khauCua(x.hoSo) === locKhau);

  const daLoc = locLech === 'all' ? theoKhau : theoKhau.filter(({ cham }) => {
    const d = cham.chenhLech;
    if (locLech === 'late') return d?.loaiVao === 'late';
    if (locLech === 'ot') return d?.loaiRa === 'ot';
    if (locLech === 'early') return d?.loaiVao === 'early';
    if (locLech === 'chua') return !cham.vaoISO && !cham.xinNghi;
    return true;
  });

  const tabLoc = [
    { key: 'all', nhan: '🧾 Tất cả' },
    { key: 'late', nhan: '⏰ Đi muộn (+)' },
    { key: 'ot', nhan: '⚡ Tăng ca (OT)' },
    { key: 'early', nhan: '🟢 Đến sớm (−)' },
    { key: 'chua', nhan: '⏳ Chưa chấm' },
  ];

  return (
    <>
      <BangTongHop danhSach={laGiamDoc ? theoKhau : nhomKhac} tieuDe={tieuDeTongHop} />

      {/* Thẻ bản thân — dành cho bếp trưởng / quản lý khâu */}
      {!laGiamDoc && toi && (
        <div className="cc-section" style={{ marginTop: 10 }}>
          <div className="cc-section-head"><span className="cc-section-title">👤 Chấm công của tôi</span></div>
          <div className="cc-staff-card is-me" onClick={onXemChamCongCuaToi} role="button" tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter') onXemChamCongCuaToi(); }} style={{ cursor: 'pointer' }}>
            <div className={`cc-avatar ${lopAvatar(khauCua(toi.hoSo))}`}>{chuCaiDau(toi.hoSo.full_name)}</div>
            <div className="cc-staff-info">
              <div className="cc-staff-name">
                {toi.hoSo.full_name} <span style={{ fontSize: 11, color: '#C88A4B', fontWeight: 900 }}>● Tôi</span>
              </div>
              <div className="cc-staff-role">{nhanKhau(toi.hoSo)}</div>
              {toi.cham.ca && (
                <div className="cc-staff-shift">{toi.cham.ca.icon} {toi.cham.ca.ten} ({toi.cham.ca.batDau}–{toi.cham.ca.ketThuc})</div>
              )}
            </div>
            <div className="cc-staff-right">
              <span className="cc-staff-status" style={{
                background: TRANG_THAI[toi.cham.trangThai].nen,
                color: TRANG_THAI[toi.cham.trangThai].mau,
                border: `1.5px solid ${TRANG_THAI[toi.cham.trangThai].vien}`,
              }}>
                {TRANG_THAI[toi.cham.trangThai].icon} {TRANG_THAI[toi.cham.trangThai].nhan}
              </span>
              {toi.cham.vao && <span className="cc-staff-time">Vào: {toi.cham.vao}</span>}
              <span style={{ fontSize: 12, color: '#C88A4B', fontWeight: 800 }}>Xem đối chiếu →</span>
            </div>
          </div>
        </div>
      )}

      {/* Lọc theo khâu — chỉ Giám đốc */}
      {laGiamDoc && (
        <div className="cc-section" style={{ marginTop: 12 }}>
          <div className="cc-section-head"><span className="cc-section-title">🏭 Lọc theo bộ phận / khâu</span></div>
          <div className="cc-chip-row">
            {KHAU.map((k) => (
              <button key={k.key} onClick={() => setLocKhau(k.key)}
                className={`cc-chip${locKhau === k.key ? ' active' : ''}`}>
                {k.icon} {k.nhan}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Danh sách */}
      <div className="cc-section" style={{ marginTop: 12 }}>
        <div className="cc-section-head">
          <span className="cc-section-title">
            {laGiamDoc ? '👥 Danh sách & chênh lệch nhân sự' : '👥 Nhân viên trong khâu'}
          </span>
          <span style={{ fontSize: 13, color: '#a08060', fontWeight: 800 }}>{daLoc.length} người</span>
        </div>

        <div className="cc-filter-tabs" style={{ paddingLeft: 0, paddingRight: 0, marginBottom: 12 }}>
          {tabLoc.map((t) => (
            <button key={t.key} className={`cc-filter-tab${locLech === t.key ? ' active' : ''}`} onClick={() => setLocLech(t.key)}>
              {t.nhan}
            </button>
          ))}
        </div>

        <div className="cc-staff-list">
          {daLoc.length === 0 ? (
            <div className="cc-empty">
              <div className="cc-empty-icon">🔍</div>
              <div style={{ fontSize: 15, fontWeight: 800, color: '#2d1c10', marginBottom: 4 }}>Không có nhân viên nào ở bộ lọc này</div>
              <div style={{ fontSize: 13 }}>Thử chọn thẻ lọc khác</div>
            </div>
          ) : daLoc.map((muc) => (
            <TheNhanVien key={muc.hoSo.id} muc={muc}
              laToi={muc.hoSo.id === toi?.hoSo?.id}
              onClick={() => setDangXem(muc)} />
          ))}
        </div>
      </div>

      {dangXem && <NganKeo muc={dangXem} onClose={() => setDangXem(null)} />}
    </>
  );
}
