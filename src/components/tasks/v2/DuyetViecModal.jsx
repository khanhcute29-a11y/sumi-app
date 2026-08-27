import React, { useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import { gioNgan, ngayGio, nhanKpiHoanThanh, nhanKpiNhanViec, diemDuKien, docBuocCon, duocCanThiepQuaHan, quaHan, treBaoNhieu, doDaiThoiGian } from '../../../lib/congViec';

// Hộp thoại duyệt nghiệm thu của quản lý.
//   • chiXem = true  -> chỉ xem báo cáo của thợ, không có nút duyệt
//   • chiXem = false -> có nút Duyệt và Trả lại
//
// Đây là chỗ CHỐT ĐIỂM KPI, nên nút Duyệt phải nói rõ điểm sẽ cộng/trừ bao
// nhiêu TRƯỚC khi bấm — không để quản lý bấm rồi mới biết.

// Can thiệp trực tiếp việc quá hạn >= 1 ngày — chỉ Giám đốc. Xoá mềm (deleted_at)
// hoặc gia hạn (ghi han_cu/han_moi vào task_overdue_logs, tăng overdue_count) —
// tất cả qua RPC sumi_can_thiep_qua_han, không tự sửa cột nào ở đây.
function CanThiepQuaHanPanel({ viec, onXong }) {
  const [moGiaHan, setMoGiaHan] = useState(false);
  const [hanMoi, setHanMoi] = useState('');
  const [dangChay, setDangChay] = useState('');
  const [loi, setLoi] = useState('');

  const goi = async (hanhDong, hanMoiIso) => {
    setDangChay(hanhDong); setLoi('');
    try {
      const { data, error } = await supabase.rpc('sumi_can_thiep_qua_han', {
        p_task_id: viec.id, p_hanh_dong: hanhDong, p_han_moi: hanMoiIso || null,
      });
      if (error) throw error;
      if (data && data.thanh_cong === false) throw new Error(data.thong_bao || 'Không thực hiện được.');
      await onXong?.();
    } catch (e) {
      setLoi(e?.message || 'Không thực hiện được.');
    } finally { setDangChay(''); }
  };

  return (
    <div style={{ margin: '14px 0', padding: 14, borderRadius: 14, background: '#fff5f5', border: '1.5px solid #fca5a5' }}>
      <div style={{ fontWeight: 900, fontSize: 14, color: '#b42318', marginBottom: 4 }}>
        🚨 Can thiệp trực tiếp (quá hạn ≥ 1 ngày)
      </div>
      <div style={{ fontSize: 12.5, color: '#8c5a3c', marginBottom: 10 }}>
        {viec.overdue_count > 0 ? `Đã gia hạn ${viec.overdue_count} lần trước đó. ` : ''}
        Việc này đã trễ quá lâu — Giám đốc có thể xoá hoặc dời hạn.
      </div>
      {loi && <div className="cv-error" style={{ marginBottom: 8 }}>⚠️ {loi}</div>}
      {!moGiaHan ? (
        <div className="cv-actions">
          <button className="cv-btn danger" disabled={!!dangChay}
            onClick={() => { if (window.confirm('Xoá hẳn việc này? Không thể hoàn tác.')) goi('xoa'); }}>
            {dangChay === 'xoa' ? 'Đang xoá…' : '🗑 Xoá việc'}
          </button>
          <button className="cv-btn outline" disabled={!!dangChay} onClick={() => setMoGiaHan(true)}>
            📅 Gia hạn
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <input type="datetime-local" value={hanMoi} onChange={(e) => setHanMoi(e.target.value)}
            style={{ minHeight: 44, padding: '0 10px', borderRadius: 10, border: '1px solid var(--cv-border)', fontFamily: 'inherit' }} />
          <div className="cv-actions">
            <button className="cv-btn outline" disabled={!!dangChay} onClick={() => setMoGiaHan(false)}>Huỷ</button>
            <button className="cv-btn success" disabled={!!dangChay || !hanMoi}
              onClick={() => goi('gia_han', new Date(hanMoi).toISOString())}>
              {dangChay === 'gia_han' ? 'Đang lưu…' : '✓ Xác nhận hạn mới'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function DuyetViecModal({ viec, tenTho, chiXem, hoSo, vaiTro, onClose, onXong }) {
  const [baoCao, setBaoCao] = useState([]);
  const [dangTai, setDangTai] = useState(true);
  const [ghiChu, setGhiChu] = useState('');
  const [dangLuu, setDangLuu] = useState('');
  const [loi, setLoi] = useState('');
  const [tinNhan, setTinNhan] = useState('');
  const [dangGuiTin, setDangGuiTin] = useState(false);

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

  // Chat thời gian thực — quản lý/giám đốc đang mở sẵn hộp này thấy ngay khi
  // thợ (hoặc người khác) gửi thêm, không cần đóng mở lại. Kênh riêng theo mã
  // việc, không đụng tới kênh Chat/Messenger.
  useEffect(() => {
    const kenh = supabase.channel(`duyet-viec-${viec.id}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'task_progress_reports', filter: `task_id=eq.${viec.id}` },
        (tin) => {
          const moi = tin?.new;
          if (!moi?.id) return;
          setBaoCao((ds) => (ds.some((x) => x.id === moi.id) ? ds : [...ds, moi]));
        })
      .subscribe();
    return () => { supabase.removeChannel(kenh); };
  }, [viec.id]);

  const guiTinNhan = async () => {
    const noiDung = tinNhan.trim();
    if (!noiDung || !hoSo?.id) return;
    setDangGuiTin(true); setLoi('');
    try {
      const { error } = await supabase.from('task_progress_reports').insert({
        task_id: viec.id, staff_id: hoSo.id, note: noiDung, percent: null, author_role: vaiTro || 'quan_ly',
      });
      if (error) throw error;
      setTinNhan('');
    } catch (e) {
      setLoi(e?.message || 'Không gửi được tin nhắn.');
    } finally { setDangGuiTin(false); }
  };

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

        {vaiTro === 'giam_doc' && duocCanThiepQuaHan(viec) && (
          <CanThiepQuaHanPanel viec={viec} onXong={async () => { await onXong?.(); onClose?.(); }} />
        )}
        {vaiTro === 'giam_doc' && quaHan(viec) && !duocCanThiepQuaHan(viec) && (
          <div style={{ margin: '14px 0', padding: '10px 12px', borderRadius: 12, background: '#fff8e6', border: '1px solid #f2dfae', color: '#8b5900', fontWeight: 700, fontSize: 12.5 }}>
            ⏳ Việc này mới trễ {doDaiThoiGian(treBaoNhieu(viec))} — chưa đủ 1 ngày nên chưa hiện nút Xoá/Gia hạn (đúng quy định).
          </div>
        )}

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
          const laGiamDoc = b.author_role === 'giam_doc';
          const laQuanLy = b.author_role === 'quan_ly';
          const style = laGiamDoc ? { background: '#7d420c', color: '#fff' } : laQuanLy ? { background: '#2b5bc7', color: '#fff' } : undefined;
          return (
            <div className="cv-thread-item" key={b.id}>
              <div className="cv-thread-avatar" style={style}>
                {laGiamDoc ? '👑' : laQuanLy ? '💼' : '👨‍🍳'}
              </div>
              <div className={`cv-thread-body${laGiamDoc || laQuanLy ? ' quan-ly' : ''}`}>
                {b.note || (b.percent != null ? `Đã làm được ${b.percent}%` : '(không ghi chú)')}
                {b.image_url && (
                  <a href={b.image_url} target="_blank" rel="noreferrer">
                    <img className="cv-thread-img" src={b.image_url} alt="Ảnh báo cáo" />
                  </a>
                )}
                <div className="cv-thread-meta">
                  <span>{laGiamDoc ? 'Giám đốc' : laQuanLy ? 'Quản lý' : 'Thợ'}</span>
                  <span>{gioNgan(b.created_at)}</span>
                </div>
              </div>
            </div>
          );
        })}

        {/* Khung chat — quản lý/giám đốc đang xem việc này có thể gõ trao đổi
            trực tiếp, thay vì chỉ có nút "Nhắc quản lý" tĩnh như trước. */}
        {hoSo?.id && (
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <input value={tinNhan} onChange={(e) => setTinNhan(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !dangGuiTin) { e.preventDefault(); guiTinNhan(); } }}
              placeholder="Nhắn cho thợ về việc này…"
              style={{ flex: 1, minHeight: 44, padding: '0 12px', borderRadius: 12, border: '1px solid var(--cv-border)', fontSize: 14, fontFamily: 'inherit' }} />
            <button className="cv-btn primary" disabled={dangGuiTin || !tinNhan.trim()} onClick={guiTinNhan} style={{ flex: '0 0 auto' }}>
              {dangGuiTin ? '…' : 'Gửi'}
            </button>
          </div>
        )}

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
