import React, { useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import DuyetViecModal from './DuyetViecModal';
import SoKetToanKpi from './SoKetToanKpi';
import {
  TRANG_THAI, tomTatViec, sapXepQuaHan, khauCuaViec, KHAU, nhanKhau,
  locTheoTuKhoa, ngayGio, doDaiThoiGian, treBaoNhieu, tienDoDuAn, quaHan,
} from '../../../lib/congViec';

// Trạm Kiểm Soát Công Việc — màn hình Giám đốc.
// Dựng theo mockup: tìm kiếm → lọc khâu → hai nút quyền lực → ô đếm →
// dự án đang chạy → danh sách QUÁ HẠN đẩy lên đầu.

// Bộ lọc khâu dựng từ DỮ LIỆU THẬT trong database, không gõ cứng trong code.
// Trước đây tôi gõ cứng 6 khâu theo `profiles.station` — cột đó gần như cả tiệm
// bỏ trống nên bộ lọc hiện toàn số 0, trông như một bức ảnh tĩnh.
function dungBoLocKhau(danhSachKhau, tasks) {
  const tong = (tasks || []).length;
  const ds = [{ ma: 'all', ten: 'Tất cả', so_viec: tong }];
  (danhSachKhau || []).forEach((k) => ds.push(k));
  return ds;
}

function chuCaiDau(ten) {
  const t = (ten || '?').trim().split(/\s+/);
  if (t.length === 1) return t[0].slice(0, 2).toUpperCase();
  return (t[t.length - 2][0] + t[t.length - 1][0]).toUpperCase();
}

function TheQuaHan({ viec, tenTheoId, tenKhau, onNhacNho, onXem, dangNhac }) {
  const tre = treBaoNhieu(viec);
  const tho = tenTheoId[viec.assignee_id];
  const quanLy = tenTheoId[viec.created_by];
  return (
    <div className="cv-card tre">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
        <div style={{ minWidth: 0 }}>
          <span className="cv-dept-tag">{tenKhau(viec)}</span>
          <h3 className="cv-title" style={{ marginTop: 6 }}>{viec.title}</h3>
          {viec.deadline && (
            <div className="cv-meta"><span className="cv-meta-item">🎯 Hạn: {ngayGio(viec.deadline)}</span></div>
          )}
        </div>
        {tre > 0 && (
          <span className="cv-badge" style={{ background: '#fee2e2', color: '#d03027' }}>
            Trễ {doDaiThoiGian(tre)}
          </span>
        )}
      </div>

      <div className="cv-emp">
        <div className="cv-emp-info">
          <div className="cv-avatar" style={{ background: '#c35a22' }}>{chuCaiDau(tho || '?')}</div>
          <div className="cv-emp-name">{tho || 'Chưa giao ai'}<span className="cv-emp-role">Thực hiện</span></div>
        </div>
        <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--cv-muted)' }}>→</span>
        <div className="cv-emp-info">
          <div className="cv-avatar" style={{ background: '#2b5bc7' }}>{chuCaiDau(quanLy || '?')}</div>
          <div className="cv-emp-name">{quanLy || 'Không rõ'}<span className="cv-emp-role">Giám sát</span></div>
        </div>
      </div>

      <div className="cv-actions">
        <button className="cv-btn outline" onClick={() => onXem(viec)}>Xem báo cáo</button>
        <button className="cv-btn danger" disabled={dangNhac === viec.id} onClick={() => onNhacNho(viec)}>
          {dangNhac === viec.id ? 'Đang gửi…' : '🚨 Nhắc quản lý'}
        </button>
      </div>
    </div>
  );
}

// Trang riêng "Quá hạn" — phân theo khâu (Bakery Nóng/Lạnh, Macaron X41, Xưởng
// 42…) giống hệt cách chia luồng khi tạo đơn hàng, dùng ĐÚNG danh sách khâu
// thật KHAU đã có sẵn (không bịa thêm "Luồng Vận tải" — việc order_work do
// bếp/vận tải tự có màn riêng ở Đơn hàng, không nằm trong hệ Việc này).
function TrangQuaHanTheoLuong({ quaHanDs, tenTheoId, tenKhau, onNhacNho, onXem, dangNhac, onBack }) {
  const [khauDangXem, setKhauDangXem] = useState('all');
  const dsTheoKhau = khauDangXem === 'all' ? quaHanDs : quaHanDs.filter((t) => khauCuaViec(t) === khauDangXem);
  const demTheoKhau = (key) => key === 'all' ? quaHanDs.length : quaHanDs.filter((t) => khauCuaViec(t) === key).length;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <button className="cv-btn outline" onClick={onBack} style={{ flex: '0 0 auto', minWidth: 44 }}>‹</button>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 900 }}>⚠️ Quá hạn — phân luồng</h2>
      </div>
      <div className="cv-chips">
        {KHAU.map((k) => (
          <button key={k.key} className={`cv-chip${khauDangXem === k.key ? ' active' : ''}`}
            onClick={() => setKhauDangXem(k.key)}>
            {k.icon} {k.nhan} ({demTheoKhau(k.key)})
          </button>
        ))}
      </div>
      {dsTheoKhau.length ? (
        <div className="cv-list" style={{ marginTop: 12 }}>
          {dsTheoKhau.map((v) => (
            <TheQuaHan key={v.id} viec={v} tenTheoId={tenTheoId} tenKhau={tenKhau}
              onNhacNho={onNhacNho} onXem={onXem} dangNhac={dangNhac} />
          ))}
        </div>
      ) : (
        <div className="cv-empty">
          <div className="cv-empty-icon">✅</div>
          <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--cv-text)' }}>Không có việc quá hạn ở luồng này</div>
        </div>
      )}
    </div>
  );
}

export default function ViecGiamDoc({
  tasks, duAn, tenTheoId, dangTai, loi, onTaiLai, onMoGiaoViec, onMoTaoDuAn, onNhacNho, hoSo,
}) {
  const [moTrangQuaHan, setMoTrangQuaHan] = useState(false);
  const [tuKhoa, setTuKhoa] = useState('');
  const [khau, setKhau] = useState('all');
  const [danhSachKhau, setDanhSachKhau] = useState([]);

  useEffect(() => {
    let huy = false;
    supabase.rpc('sumi_danh_sach_khau_viec')
      .then(({ data, error }) => { if (!huy) setDanhSachKhau(error ? [] : (data || [])); })
      .catch(() => { if (!huy) setDanhSachKhau([]); });
    return () => { huy = true; };
  }, [tasks.length]);
  const [xem, setXem] = useState(null);
  const [dangNhac, setDangNhac] = useState('');
  const [loiChung, setLoiChung] = useState('');

  const tenKhau = (t) => {
    const ma = t?.station_id || '_khac';
    return danhSachKhau.find((k) => k.ma === ma)?.ten || 'Chưa gán khâu';
  };
  const theoKhau = khau === 'all'
    ? (tasks || [])
    : (tasks || []).filter((t) => (t.station_id || '_khac') === khau);
  const daLoc = locTheoTuKhoa(theoKhau, tuKhoa, tenTheoId);
  const tomTat = tomTatViec(daLoc);
  const quaHanDs = sapXepQuaHan(daLoc);
  const choDuyetDs = daLoc.filter((t) => t.status === 'pending_approval');

  const nhac = async (viec) => {
    setDangNhac(viec.id); setLoiChung('');
    try {
      await onNhacNho?.(viec);
    } catch (e) {
      setLoiChung(e?.message || 'Không gửi được lời nhắc.');
    } finally { setDangNhac(''); }
  };

  if (moTrangQuaHan) {
    return (
      <div className="cv-wrap">
        <TrangQuaHanTheoLuong quaHanDs={quaHanDs} tenTheoId={tenTheoId} tenKhau={tenKhau}
          onNhacNho={nhac} onXem={setXem} dangNhac={dangNhac} onBack={() => setMoTrangQuaHan(false)} />
        {xem && (
          <DuyetViecModal viec={xem} tenTho={tenTheoId[xem.assignee_id]} hoSo={hoSo} vaiTro="giam_doc"
            chiXem={xem.status !== 'pending_approval'}
            onClose={() => setXem(null)}
            onXong={async () => { setXem(null); await onTaiLai?.(); }} />
        )}
      </div>
    );
  }

  return (
    <div>
      {loi && <div className="cv-error">⚠️ Không tải được danh sách việc: {loi}</div>}
      {loiChung && <div className="cv-error">⚠️ {loiChung}</div>}

      <div className="cv-search">
        <span className="cv-search-icon">🔍</span>
        <input value={tuKhoa} onChange={(e) => setTuKhoa(e.target.value)}
          placeholder="Tìm tên nhân viên, mã đơn, công việc…" />
      </div>

      <div className="cv-chips">
        {dungBoLocKhau(danhSachKhau, tasks).map((k) => (
          <button key={k.ma} className={`cv-chip${khau === k.ma ? ' active' : ''}`}
            onClick={() => setKhau(k.ma)}>
            {k.ten} ({k.so_viec})
          </button>
        ))}
      </div>

      <div className="cv-director-actions" style={{ marginTop: 14 }}>
        <button className="cv-btn-big task" onClick={() => onMoGiaoViec?.()}>
          <i>➕</i> Giao Việc Mới
        </button>
        <button className="cv-btn-big project" onClick={() => onMoTaoDuAn?.()}>
          <i>📁</i> Tạo Dự Án
        </button>
      </div>

      <div className="cv-metrics">
        <div className="cv-metric">
          <span>Đang làm</span><strong style={{ color: 'var(--cv-primary)' }}>{tomTat.dangLam}</strong>
        </div>
        <div className={`cv-metric${tomTat.quaHan ? ' danger' : ''}`}>
          <span>Quá hạn</span><strong>{tomTat.quaHan}</strong>
        </div>
        <div className="cv-metric">
          <span>Chờ duyệt</span><strong style={{ color: '#1e7e4c' }}>{tomTat.choDuyet}</strong>
        </div>
        <div className="cv-metric">
          <span>Hoàn thành</span><strong style={{ color: '#1e7e4c' }}>{tomTat.hoanThanh}</strong>
        </div>
      </div>

      {dangTai && <div className="cv-empty">Đang tải công việc…</div>}

      {/* ── Dự án ── */}
      {!!(duAn || []).length && (
        <>
          <div className="cv-divider"><span>🚀 Dự án đang chạy</span></div>
          <div className="cv-project-list">
            {duAn.map((d) => {
              const td = tienDoDuAn(tasks, d.id);
              return (
                <div className="cv-project" key={d.id}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                    <h3>{d.ten}</h3>
                    {d.nhan && (
                      <span style={{
                        fontSize: 10, background: 'var(--cv-warning)', color: '#3a2517',
                        padding: '3px 8px', borderRadius: 8, fontWeight: 800, whiteSpace: 'nowrap',
                      }}>{d.nhan}</span>
                    )}
                  </div>
                  <div className="cv-project-meta">
                    {(d.cac_khau || []).map(nhanKhau).join(' + ') || 'Chưa gán khâu'}
                    {d.deadline ? ` • Hạn: ${ngayGio(d.deadline)}` : ''}
                  </div>
                  <div className="cv-progress"><i style={{ width: `${td.phanTram}%` }} /></div>
                  <div style={{ fontSize: 11, textAlign: 'right', fontWeight: 800 }}>
                    Hoàn thành {td.phanTram}% ({td.xong}/{td.tong} việc)
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* ── Quá hạn: chỉ hiện tóm tắt, bấm vào mới sang trang riêng phân luồng ── */}
      <button onClick={() => setMoTrangQuaHan(true)} disabled={!quaHanDs.length} style={{
        width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginTop: 14, padding: '14px 16px', borderRadius: 16, border: 0, textAlign: 'left', font: 'inherit',
        cursor: quaHanDs.length ? 'pointer' : 'default',
        background: quaHanDs.length ? '#fee2e2' : 'var(--cv-sunken)',
        color: quaHanDs.length ? '#d03027' : 'var(--cv-muted)',
      }}>
        <span style={{ fontWeight: 900, fontSize: 15 }}>⚠️ Quá hạn: {quaHanDs.length} việc</span>
        {quaHanDs.length > 0 && <span style={{ fontWeight: 800 }}>Xem chi tiết →</span>}
      </button>

      {/* ── Chờ duyệt ── */}
      {!!choDuyetDs.length && (
        <>
          <div className="cv-divider"><span>📤 Thợ báo xong, chờ duyệt</span></div>
          <div className="cv-list">
            {choDuyetDs.map((v) => {
              const tt = TRANG_THAI.pending_approval;
              return (
                <div className="cv-card" key={v.id} style={{ borderColor: 'var(--cv-success)' }}>
                  <span className="cv-dept-tag">{tenKhau(v)}</span>
                  <h3 className="cv-title" style={{ marginTop: 6 }}>{v.title}</h3>
                  <div className="cv-meta">
                    <span className="cv-meta-item">👨‍🍳 {tenTheoId[v.assignee_id] || 'Chưa rõ'}</span>
                    <span className="cv-badge" style={{ background: tt.nen, color: tt.mau }}>{tt.icon} {tt.nhan}</span>
                  </div>
                  <button className="cv-btn success full" onClick={() => setXem(v)}>Xem &amp; duyệt</button>
                </div>
              );
            })}
          </div>
        </>
      )}

      <SoKetToanKpi />

      {xem && (
        <DuyetViecModal viec={xem} tenTho={tenTheoId[xem.assignee_id]} hoSo={hoSo} vaiTro="giam_doc"
          chiXem={xem.status !== 'pending_approval'}
          onClose={() => setXem(null)}
          onXong={async () => { setXem(null); await onTaiLai?.(); }} />
      )}
    </div>
  );
}
