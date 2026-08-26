import React, { useState } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import DuyetViecModal from './DuyetViecModal';
import TheViecNhanVien from './TheViecNhanVien';
import {
  TRANG_THAI, nhomViecQuanLy, ngayGio, gioNgan, quaHan,
  nhanKpiHoanThanh, doDaiThoiGian, treBaoNhieu, khauCuaViec, nhanKhau,
} from '../../../lib/congViec';

// Màn hình Công việc của BẾP TRƯỞNG — dựng theo mockup "Quản Lý Công Việc
// (Bếp Trưởng)": điều phối đơn mới → theo dõi thợ đang làm → duyệt nghiệm thu.

function chuCaiDau(ten) {
  const t = (ten || '?').trim().split(/\s+/);
  if (t.length === 1) return t[0].slice(0, 2).toUpperCase();
  return (t[t.length - 2][0] + t[t.length - 1][0]).toUpperCase();
}

// ── Thẻ việc chưa có người làm: bếp trưởng phải điều phối ──
function TheDieuPhoi({ viec, hoSo, tenTheoId, onGiao, onTuLam, dangChay }) {
  return (
    <div className="cv-card moi">
      {viec.order_code && <span className="cv-order-link">📦 Đơn {viec.order_code}</span>}
      <h3 className="cv-title">{viec.title}</h3>
      <div className="cv-meta">
        <span className="cv-meta-item">
          Giao bởi: {tenTheoId[viec.created_by] || 'Hệ thống (đơn khách)'}
        </span>
        {viec.deadline && <span className="cv-meta-item">🎯 Hạn chót: {ngayGio(viec.deadline)}</span>}
      </div>
      <div className="cv-actions">
        <button className="cv-btn outline" disabled={dangChay === viec.id}
          style={{ borderColor: 'var(--cv-primary)', color: 'var(--cv-primary)' }}
          onClick={() => onTuLam(viec)}>
          👤 Tự làm
        </button>
        <button className="cv-btn primary" disabled={dangChay === viec.id} onClick={() => onGiao(viec)}>
          👨‍🍳 Giao nhân viên
        </button>
      </div>
    </div>
  );
}

// ── Thẻ theo dõi thợ ──
function TheTheoDoi({ viec, tenTheoId, onDuyet, onXemBaoCao }) {
  const choDuyet = viec.status === 'pending_approval';
  const tt = TRANG_THAI[quaHan(viec) ? 'qua_han' : viec.status] || TRANG_THAI.open;
  const kpi = nhanKpiHoanThanh(viec);
  const tre = treBaoNhieu(viec);
  const ten = tenTheoId[viec.assignee_id] || 'Chưa rõ';

  return (
    <div className={`cv-card${quaHan(viec) ? ' tre' : ''}`}
      style={choDuyet ? { borderColor: 'var(--cv-success)' } : undefined}>
      <div>
        <span className="cv-dept-tag">{nhanKhau(khauCuaViec(viec))}</span>
        <h3 className="cv-title" style={{ marginTop: 6 }}>{viec.title}</h3>
        <div className="cv-meta">
          <span className="cv-meta-item">Giao lúc: {gioNgan(viec.created_at)}</span>
          {viec.deadline && <span className="cv-meta-item">🎯 Hạn: {ngayGio(viec.deadline)}</span>}
          {/* Quá hạn thì gộp luôn số giờ trễ vào một huy hiệu, khỏi hiện hai lần */}
          <span className="cv-badge" style={{ background: tt.nen, color: tt.mau }}>
            {tt.icon} {tt.nhan}{quaHan(viec) && tre > 0 ? ` ${doDaiThoiGian(tre)}` : ''}
          </span>
          {choDuyet && kpi && (
            <span className="cv-badge" style={kpi.loai === 'tre'
              ? { background: '#fee2e2', color: '#d03027' }
              : { background: '#e6f4ea', color: '#1e7e4c' }}>
              Thợ báo xong ({kpi.chu})
            </span>
          )}
        </div>
      </div>

      <div className="cv-emp">
        <div className="cv-emp-info">
          <div className="cv-avatar">{chuCaiDau(ten)}</div>
          <div className="cv-emp-name">
            {ten}
            <span className="cv-emp-role">
              {viec.accepted_at
                ? `Đã nhận việc lúc ${gioNgan(viec.accepted_at)}`
                : 'Chưa xác nhận nhận việc'}
              {viec.photo_url ? ' · có ảnh nghiệm thu' : ''}
            </span>
          </div>
        </div>
        <button className="cv-order-link" onClick={() => onXemBaoCao(viec)}>Xem báo cáo</button>
      </div>

      {choDuyet && (
        <button className="cv-btn success full" onClick={() => onDuyet(viec)}>
          ✓ Duyệt nghiệm thu
        </button>
      )}
    </div>
  );
}

export default function ViecQuanLy({
  tasks, hoSo, tenTheoId, danhSachTho, dangTai, loi, onTaiLai, onMoGiaoViec,
}) {
  const [tab, setTab] = useState('daGiao');
  const [duyet, setDuyet] = useState(null);
  const [xemBaoCao, setXemBaoCao] = useState(null);
  const [dangChay, setDangChay] = useState('');
  const [loiChung, setLoiChung] = useState('');

  const nhom = nhomViecQuanLy(tasks, hoSo?.id);

  // Bếp trưởng bấm "Tự làm": nhận việc về mình.
  const tuLam = async (viec) => {
    setDangChay(viec.id); setLoiChung('');
    try {
      const { error } = await supabase.from('tasks')
        .update({ assignee_id: hoSo?.id }).eq('id', viec.id);
      if (error) throw error;
      await onTaiLai?.();
    } catch (e) {
      setLoiChung(e?.message || 'Không nhận được việc này về mình.');
    } finally { setDangChay(''); }
  };

  const cacTab = [
    { key: 'dieuPhoi', nhan: `Điều phối (${nhom.choDieuPhoi.length})` },
    { key: 'daGiao', nhan: `Đã giao (${nhom.daGiao.length})` },
    { key: 'choDuyet', nhan: `Chờ duyệt (${nhom.choDuyet.length})` },
    { key: 'cuaToi', nhan: `Của tôi (${nhom.duocGiao.length})` },
  ];

  const chungTheoDoi = { tenTheoId, onDuyet: setDuyet, onXemBaoCao: setXemBaoCao };

  return (
    <div>
      {loi && <div className="cv-error">⚠️ Không tải được danh sách việc: {loi}</div>}
      {loiChung && <div className="cv-error">⚠️ {loiChung}</div>}

      <button className="cv-btn-create" onClick={onMoGiaoViec}>➕ Tạo việc &amp; giao cho thợ</button>

      <div className="cv-tabs">
        {cacTab.map((t) => (
          <button key={t.key} className={`cv-tab${tab === t.key ? ' active' : ''}`}
            onClick={() => setTab(t.key)}>{t.nhan}</button>
        ))}
      </div>

      {dangTai && <div className="cv-empty">Đang tải công việc…</div>}

      {!dangTai && tab === 'dieuPhoi' && (
        nhom.choDieuPhoi.length ? (
          <div className="cv-list">
            {nhom.choDieuPhoi.map((v) => (
              <TheDieuPhoi key={v.id} viec={v} hoSo={hoSo} tenTheoId={tenTheoId}
                dangChay={dangChay} onTuLam={tuLam}
                onGiao={() => onMoGiaoViec(v)} />
            ))}
          </div>
        ) : <div className="cv-empty"><div className="cv-empty-icon">✨</div>Không có việc nào đang chờ điều phối.</div>
      )}

      {!dangTai && tab === 'daGiao' && (
        nhom.daGiao.length ? (
          <div className="cv-list">
            {nhom.daGiao.map((v) => <TheTheoDoi key={v.id} viec={v} {...chungTheoDoi} />)}
          </div>
        ) : <div className="cv-empty"><div className="cv-empty-icon">📭</div>Chưa giao việc nào cho thợ.</div>
      )}

      {!dangTai && tab === 'choDuyet' && (
        nhom.choDuyet.length ? (
          <div className="cv-list">
            {nhom.choDuyet.map((v) => <TheTheoDoi key={v.id} viec={v} {...chungTheoDoi} />)}
          </div>
        ) : <div className="cv-empty"><div className="cv-empty-icon">👍</div>Không có việc nào chờ duyệt.</div>
      )}

      {!dangTai && tab === 'cuaToi' && (
        nhom.duocGiao.length ? (
          <div className="cv-list">
            {nhom.duocGiao.map((v) => (
              <TheViecNhanVien key={v.id} viec={v} hoSo={hoSo} tenTheoId={tenTheoId}
                onDoi={onTaiLai} onBaoLoi={setLoiChung} />
            ))}
          </div>
        ) : <div className="cv-empty"><div className="cv-empty-icon">☕</div>Bạn chưa nhận việc nào về mình.</div>
      )}

      {duyet && (
        <DuyetViecModal viec={duyet} tenTho={tenTheoId[duyet.assignee_id]}
          onClose={() => setDuyet(null)}
          onXong={async () => { setDuyet(null); await onTaiLai?.(); }} />
      )}

      {xemBaoCao && (
        <DuyetViecModal viec={xemBaoCao} tenTho={tenTheoId[xemBaoCao.assignee_id]}
          chiXem onClose={() => setXemBaoCao(null)} onXong={() => setXemBaoCao(null)} />
      )}
    </div>
  );
}
