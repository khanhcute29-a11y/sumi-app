import React, { useState } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import { uploadFile } from '../../../lib/queries';

// Một hộp thoại dùng cho hai việc:
//   • chiBaoCao = true  -> gửi báo cáo tiến độ giữa chừng (ảnh + ghi chú)
//   • chiBaoCao = false -> báo XONG HOÀN TOÀN, chuyển sang chờ quản lý duyệt
//
// Ảnh dùng lại đúng đường tải lên cũ (`uploadFile`) để không đẻ thêm cách làm
// mới cho cùng một chuyện.

export default function BaoXongModal({ viec, chiBaoCao, hoSo, onClose, onXong }) {
  const [anh, setAnh] = useState(null);
  const [xemTruoc, setXemTruoc] = useState('');
  const [ghiChu, setGhiChu] = useState('');
  const [phanTram, setPhanTram] = useState(50);
  const [dangLuu, setDangLuu] = useState(false);
  const [loi, setLoi] = useState('');

  const chonAnh = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (xemTruoc) URL.revokeObjectURL(xemTruoc);
    setAnh(f);
    setXemTruoc(URL.createObjectURL(f));
  };

  const boAnh = () => {
    if (xemTruoc) URL.revokeObjectURL(xemTruoc);
    setAnh(null); setXemTruoc('');
  };

  const luu = async () => {
    if (!chiBaoCao && !anh) { setLoi('Bắt buộc chụp ảnh trước khi báo xong việc.'); return; }
    if (chiBaoCao && !anh && !ghiChu.trim()) { setLoi('Ghi vài chữ hoặc chụp một tấm ảnh để báo tiến độ.'); return; }
    setDangLuu(true); setLoi('');
    try {
      let url = null;
      if (anh) {
        const kq = await uploadFile(anh, `task-progress/${hoSo?.id || 'unknown'}`);
        url = kq?.url || null;
      }

      if (chiBaoCao) {
        const { error } = await supabase.from('task_progress_reports').insert({
          task_id: viec.id,
          staff_id: hoSo?.id,
          note: ghiChu.trim() || null,
          percent: Number(phanTram) || null,
          image_url: url,
          author_role: 'tho',
        });
        if (error) throw error;
      } else {
        const { data, error } = await supabase.rpc('sumi_bao_xong_viec', {
          p_task_id: viec.id,
          p_photo_url: url,
          p_note: ghiChu.trim() || null,
        });
        if (error) throw error;
        if (data && data.thanh_cong === false) throw new Error(data.thong_bao || 'Không báo xong được.');
      }
      await onXong?.();
    } catch (e) {
      setLoi(e?.message || 'Không lưu được. Thử lại giúp tôi.');
    } finally {
      setDangLuu(false);
    }
  };

  return (
    <div className="cv-wrap" onClick={() => !dangLuu && onClose?.()} style={{
      position: 'fixed', inset: 0, zIndex: 120, background: 'rgba(0,0,0,0.5)',
      display: 'flex', justifyContent: 'center', alignItems: 'flex-end',
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        width: '100%', maxWidth: 560, background: '#FAF6F0',
        borderRadius: '20px 20px 0 0', padding: 20, paddingBottom: 'calc(20px + env(safe-area-inset-bottom))', maxHeight: '90dvh', overflowY: 'auto',
      }}>
        <h3 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 900 }}>
          {chiBaoCao ? '📷 Thêm tiến trình' : '✅ Báo xong việc'}
        </h3>
        <div style={{ fontSize: 13, color: 'var(--cv-muted)', marginBottom: 14 }}>{viec.title}</div>

        {!chiBaoCao && (
          <div style={{
            marginBottom: 14, padding: '10px 12px', borderRadius: 12,
            background: '#fff3cd', border: '1px solid #f5d76e', color: '#856404',
            fontSize: 13, fontWeight: 700, lineHeight: 1.5,
          }}>
            Việc chưa đóng ngay đâu — quản lý phải duyệt nghiệm thu thì mới xong và mới chấm điểm.
          </div>
        )}

        <label style={{ display: 'block', fontWeight: 800, fontSize: 13, marginBottom: 6 }}>
          Ảnh {chiBaoCao ? '(không bắt buộc)' : 'xác nhận (bắt buộc)'}
        </label>
        {xemTruoc ? (
          <div style={{ position: 'relative', width: 110, height: 110, borderRadius: 12, overflow: 'hidden', border: '1.5px solid var(--cv-border)', marginBottom: 14 }}>
            <img src={xemTruoc} alt="Ảnh đã chọn" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            <button type="button" onClick={boAnh} aria-label="Bỏ ảnh" style={{
              position: 'absolute', top: 4, right: 4, minWidth: 28, minHeight: 28, borderRadius: '50%',
              background: 'rgba(0,0,0,0.7)', color: '#fff', border: 0, fontSize: 13, cursor: 'pointer',
            }}>✕</button>
          </div>
        ) : (
          <label style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 52,
            border: '2px dashed var(--cv-border)', borderRadius: 14, cursor: 'pointer',
            fontSize: 14, color: 'var(--cv-muted)', marginBottom: 14, fontWeight: 700,
          }}>
            📷 Chụp ảnh
            <input hidden type="file" accept="image/*" capture="environment" onChange={chonAnh} />
          </label>
        )}

        {chiBaoCao && (
          <>
            <label style={{ display: 'block', fontWeight: 800, fontSize: 13, marginBottom: 6 }}>
              Đã làm được bao nhiêu phần? ({phanTram}%)
            </label>
            <input type="range" min="0" max="100" step="10" value={phanTram}
              onChange={(e) => setPhanTram(e.target.value)}
              style={{ width: '100%', marginBottom: 14 }} />
          </>
        )}

        <label style={{ display: 'block', fontWeight: 800, fontSize: 13, marginBottom: 6 }}>Ghi chú</label>
        <textarea value={ghiChu} onChange={(e) => setGhiChu(e.target.value)}
          placeholder={chiBaoCao ? 'VD: Đã nặn xong vỏ, đang cho vào lò 150 độ' : 'VD: Đã xong, để trong tủ mát ngăn 2'}
          style={{
            width: '100%', minHeight: 80, padding: 10, borderRadius: 12,
            border: '1px solid var(--cv-border)', fontSize: 14, fontFamily: 'inherit', marginBottom: 14,
          }} />

        {loi && <div className="cv-error">⚠️ {loi}</div>}

        <div className="cv-actions">
          <button className="cv-btn outline" onClick={onClose} disabled={dangLuu}>Huỷ</button>
          <button className={`cv-btn ${chiBaoCao ? 'primary' : 'success'}`} onClick={luu} disabled={dangLuu}>
            {dangLuu ? 'Đang gửi…' : chiBaoCao ? 'Gửi tiến trình' : 'Báo xong việc'}
          </button>
        </div>
      </div>
    </div>
  );
}
