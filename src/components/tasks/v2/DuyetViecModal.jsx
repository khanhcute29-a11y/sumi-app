import React, { useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import { gioNgan, ngayGio, nhanKpiHoanThanh, nhanKpiNhanViec, diemDuKien, docBuocCon } from '../../../lib/congViec';

// Hộp thoại duyệt nghiệm thu của quản lý.
//   • chiXem = true  -> chỉ xem báo cáo của thợ, không có nút duyệt
//   • chiXem = false -> có nút Duyệt và Trả lại
//
// Đây là chỗ CHỐT ĐIỂM KPI, nên nút Duyệt phải nói rõ điểm sẽ cộng/trừ bao
// nhiêu TRƯỚC khi bấm — không để quản lý bấm rồi mới biết.

export default function DuyetViecModal({ viec, tenTho, chiXem, onClose, onXong }) {
  const [baoCao, setBaoCao] = useState([]);
  const [dangTai, setDangTai] = useState(true);
  const [ghiChu, setGhiChu] = useState('');
  const [dangLuu, setDangLuu] = useState('');
  const [loi, setLoi] = useState('');

  useEffect(() => {
    let huy = false;
    supabase.from('task_progress_reports')
      .select('id,note,percent,image_url,author_role,created_at')
      .eq('task_id', viec.id).order('created_at', { ascending: true })
      .then(({ data, error }) => {
        if (huy) return;
        if (error) setLoi('Chưa tải được lịch sử báo cáo của thợ.');
        else setBaoCao(data || []);
      })
      .catch(() => { if (!huy) setLoi('Chưa tải được lịch sử báo cáo của thợ.'); })
      .finally(() => { if (!huy) setDangTai(false); });
    return () => { huy = true; };
  }, [viec.id]);

  const quyet = async (dongY) => {
    if (!dongY && !ghiChu.trim()) { setLoi('Trả lại việc thì phải ghi rõ lý do cho thợ biết mà sửa.'); return; }
    setDangLuu(dongY ? 'duyet' : 'tra'); setLoi('');
    try {
      const { data, error } = await supabase.rpc('sumi_duyet_viec', {
        p_task_id: viec.id, p_dong_y: dongY, p_ghi_chu: ghiChu.trim() || null,
      });
      if (error) throw error;
      if (data && data.thanh_cong === false) throw new Error(data.thong_bao || 'Không xử lý được.');
      await onXong?.();
    } catch (e) {
      setLoi(e?.message || 'Không xử lý được. Thử lại giúp tôi.');
    } finally { setDangLuu(''); }
  };

  const kpiXong = nhanKpiHoanThanh(viec);
  const kpiNhan = nhanKpiNhanViec(viec);
  const diem = diemDuKien(viec);
  const buoc = docBuocCon(viec);

  return (
    <div className="cv-wrap" onClick={() => !dangLuu && onClose?.()} style={{
      position: 'fixed', inset: 0, zIndex: 120, background: 'rgba(0,0,0,0.5)',
      display: 'flex', justifyContent: 'center', alignItems: 'flex-end',
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        width: '100%', maxWidth: 620, background: '#FAF6F0',
        borderRadius: '20px 20px 0 0', padding: 20, paddingBottom: 'calc(20px + env(safe-area-inset-bottom))', maxHeight: '92dvh', overflowY: 'auto',
      }}>
        <h3 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 900 }}>
          {chiXem ? '📋 Báo cáo của thợ' : '✅ Duyệt nghiệm thu'}
        </h3>
        <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 2 }}>{viec.title}</div>
        <div style={{ fontSize: 13, color: 'var(--cv-muted)', marginBottom: 14 }}>
          Người làm: {tenTho || 'Chưa rõ'}
        </div>

        {/* ── Đối chiếu giờ giấc ── */}
        <div className="cv-detail-grid">
          <div className="cv-detail-box">
            <strong>🎯 Hạn chót</strong>
            {viec.deadline ? ngayGio(viec.deadline) : 'Không đặt hạn'}
          </div>
          <div className="cv-detail-box">
            <strong>✓ Thợ báo xong</strong>
            {viec.completed_at ? ngayGio(viec.completed_at) : 'Chưa báo xong'}
          </div>
          <div className="cv-detail-box">
            <strong>▶ Nhận việc</strong>
            {viec.accepted_at ? gioNgan(viec.accepted_at) : 'Chưa xác nhận'}
            {kpiNhan && (
              <div style={{ marginTop: 4, fontWeight: 800, color: kpiNhan.loai === 'tre' ? '#d03027' : '#1e7e4c' }}>
                {kpiNhan.chu}
              </div>
            )}
          </div>
          <div className="cv-detail-box">
            <strong>⏱ So với hạn</strong>
            {kpiXong
              ? <span style={{ fontWeight: 800, color: kpiXong.loai === 'tre' ? '#d03027' : '#1e7e4c' }}>{kpiXong.chu}</span>
              : 'Không chấm được (thiếu hạn hoặc chưa báo xong)'}
          </div>
        </div>

        {viec.photo_url && (
          <>
            <div className="cv-sub-title">Ảnh nghiệm thu</div>
            <a href={viec.photo_url} target="_blank" rel="noreferrer">
              <img src={viec.photo_url} alt="Ảnh nghiệm thu" style={{
                width: 120, height: 120, objectFit: 'cover', borderRadius: 12,
                border: '1px solid var(--cv-border)', marginBottom: 14, display: 'block',
              }} />
            </a>
          </>
        )}

        {buoc.length > 0 && (
          <>
            <div className="cv-sub-title">Các bước thợ đã làm</div>
            <div style={{ marginBottom: 14 }}>
              {buoc.map((b, i) => (
                <div key={`${b.ten}-${i}`} style={{ fontSize: 13, padding: '4px 0', color: b.xong ? 'var(--cv-muted)' : 'var(--cv-text)' }}>
                  {b.xong ? '☑' : '☐'} <span style={b.xong ? { textDecoration: 'line-through' } : undefined}>{b.ten}</span>
                </div>
              ))}
            </div>
          </>
        )}

        <div className="cv-sub-title">Tiến trình báo cáo</div>
        {dangTai && <div style={{ fontSize: 13, color: 'var(--cv-muted)' }}>Đang tải…</div>}
        {!dangTai && baoCao.length === 0 && (
          <div style={{ fontSize: 13, color: 'var(--cv-muted)', marginBottom: 14 }}>Thợ chưa gửi báo cáo nào.</div>
        )}
        {baoCao.map((b) => {
          const laQuanLy = b.author_role === 'quan_ly';
          return (
            <div className="cv-thread-item" key={b.id}>
              <div className="cv-thread-avatar" style={laQuanLy ? { background: '#2b5bc7', color: '#fff' } : undefined}>
                {laQuanLy ? '💼' : '👨‍🍳'}
              </div>
              <div className={`cv-thread-body${laQuanLy ? ' quan-ly' : ''}`}>
                {b.note || (b.percent != null ? `Đã làm được ${b.percent}%` : '(không ghi chú)')}
                {b.image_url && (
                  <a href={b.image_url} target="_blank" rel="noreferrer">
                    <img className="cv-thread-img" src={b.image_url} alt="Ảnh báo cáo" />
                  </a>
                )}
                <div className="cv-thread-meta">
                  <span>{laQuanLy ? 'Quản lý' : 'Thợ'}</span>
                  <span>{gioNgan(b.created_at)}</span>
                </div>
              </div>
            </div>
          );
        })}

        {loi && <div className="cv-error" style={{ marginTop: 12 }}>⚠️ {loi}</div>}

        {chiXem ? (
          <button className="cv-btn outline full" style={{ marginTop: 14 }} onClick={onClose}>Đóng</button>
        ) : (
          <>
            <label style={{ display: 'block', fontWeight: 800, fontSize: 13, margin: '14px 0 6px' }}>
              Nhận xét {viec.status === 'pending_approval' ? '(bắt buộc nếu trả lại)' : ''}
            </label>
            <textarea value={ghiChu} onChange={(e) => setGhiChu(e.target.value)}
              placeholder="VD: Viền bánh chưa đều, làm lại giúp anh"
              style={{
                width: '100%', minHeight: 70, padding: 10, borderRadius: 12,
                border: '1px solid var(--cv-border)', fontSize: 14, fontFamily: 'inherit',
              }} />

            {diem !== null && (
              <div style={{
                margin: '12px 0', padding: '10px 12px', borderRadius: 12,
                background: diem >= 0 ? '#e6f4ea' : '#fee2e2',
                border: `1px solid ${diem >= 0 ? '#8fd6ae' : '#fca5a5'}`,
                color: diem >= 0 ? '#1e7e4c' : '#b42318', fontWeight: 800, fontSize: 13, lineHeight: 1.5,
              }}>
                Duyệt xong sẽ ghi vào sổ KPI của thợ: <b>{diem >= 0 ? '+' : ''}{diem} điểm</b>
                {viec.nhan_viec_tre ? ' (đã trừ 2 điểm vì nhận việc chậm)' : ''}
              </div>
            )}

            <div className="cv-actions" style={{ marginTop: 8 }}>
              <button className="cv-btn danger" disabled={!!dangLuu} onClick={() => quyet(false)}>
                {dangLuu === 'tra' ? 'Đang gửi…' : '↩ Trả lại cho thợ'}
              </button>
              <button className="cv-btn success" disabled={!!dangLuu} onClick={() => quyet(true)}>
                {dangLuu === 'duyet' ? 'Đang duyệt…' : '✓ Duyệt ngay'}
              </button>
            </div>
            <button className="cv-btn outline full" style={{ marginTop: 8 }} onClick={onClose} disabled={!!dangLuu}>
              Đóng, để sau
            </button>
          </>
        )}
      </div>
    </div>
  );
}
