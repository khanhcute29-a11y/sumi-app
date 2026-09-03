import React, { useState } from 'react';
import { updateTask } from '../../../lib/queries';

// Form SỬA việc đã giao — dùng chung cho Bếp trưởng/Quản lý khâu (ViecQuanLy)
// và Giám đốc (ViecGiamDoc). Chỉ sửa 3 trường cơ bản (tên/mô tả/hạn chót),
// KHÔNG đổi người nhận hay đơn liên quan — đổi người nhận là một việc khác
// hẳn (coi như giao lại), không lẫn vào form sửa này.
//
// Quyền sửa thật sự do RLS quyết định (migration
// 202609041400_quan_ly_sua_viec_da_giao — assignee_id=auth.uid() HOẶC
// la_quan_ly_cua_ho_so(assignee_id) HOẶC owner/admin). Modal này chỉ hiện ra
// ở nơi người dùng vốn đã quản lý được việc đó, nên không cần tự kiểm tra lại.

const o = {
  nhan: { display: 'block', fontWeight: 800, fontSize: 13, marginBottom: 6, color: 'var(--cv-text)' },
  o: {
    width: '100%', minHeight: 46, padding: '10px 12px', borderRadius: 12,
    border: '1px solid var(--cv-border)', fontSize: 15, fontFamily: 'inherit',
    boxSizing: 'border-box', background: '#fff', color: 'var(--cv-text)',
  },
};

function choDatetimeLocal(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export default function EditTaskModal({ viec, onClose, onXong }) {
  const [tieuDe, setTieuDe] = useState(viec?.title || '');
  const [moTa, setMoTa] = useState(viec?.description || '');
  const [hanChot, setHanChot] = useState(choDatetimeLocal(viec?.deadline));
  const [dangLuu, setDangLuu] = useState(false);
  const [loi, setLoi] = useState('');

  const luu = async () => {
    if (!tieuDe.trim()) { setLoi('Hãy đặt tên cho công việc.'); return; }
    setDangLuu(true); setLoi('');
    try {
      await updateTask(viec.id, {
        title: tieuDe.trim(),
        description: moTa.trim() || null,
        deadline: hanChot ? new Date(hanChot).toISOString() : null,
        // Sửa việc coi như đã xử lý lượt từ chối trước đó (VD: đổi hạn chót
        // vào lại đúng ca làm) — không để banner "đã từ chối" cũ còn treo ở
        // đó gây hiểu nhầm là chưa ai động tới.
        declined_at: null,
        decline_reason: null,
      });
      await onXong?.();
    } catch (e) {
      setLoi(e?.message || 'Không lưu được thay đổi. Thử lại giúp tôi.');
    } finally {
      setDangLuu(false);
    }
  };

  return (
    <div className="cv-wrap" onClick={() => !dangLuu && onClose?.()} style={{
      position: 'fixed', inset: 0, zIndex: 130, background: 'rgba(0,0,0,0.5)',
      display: 'flex', justifyContent: 'center', alignItems: 'flex-end',
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        width: '100%', maxWidth: 600, background: '#FAF6F0',
        borderRadius: '20px 20px 0 0', padding: 20, paddingBottom: 'calc(20px + env(safe-area-inset-bottom))', maxHeight: '92dvh', overflowY: 'auto',
      }}>
        <h3 style={{ margin: '0 0 14px', fontSize: 18, fontWeight: 900 }}>✏️ Sửa việc đã giao</h3>

        <label style={o.nhan}>Tên công việc <span style={{ color: '#d03027' }}>*</span></label>
        <input style={{ ...o.o, marginBottom: 12 }} value={tieuDe} autoFocus
          onChange={(e) => setTieuDe(e.target.value)} />

        <label style={o.nhan}>Mô tả chi tiết</label>
        <textarea style={{ ...o.o, minHeight: 80, marginBottom: 12 }} value={moTa}
          onChange={(e) => setMoTa(e.target.value)}
          placeholder="Yêu cầu cụ thể, lưu ý khi làm…" />

        <label style={o.nhan}>🎯 Hạn chót</label>
        <input type="datetime-local" style={{ ...o.o, marginBottom: 14 }} value={hanChot}
          onChange={(e) => setHanChot(e.target.value)} />

        {loi && <div className="cv-error">⚠️ {loi}</div>}

        <div className="cv-actions">
          <button className="cv-btn outline" onClick={onClose} disabled={dangLuu}>Huỷ</button>
          <button className="cv-btn primary" onClick={luu} disabled={dangLuu}>
            {dangLuu ? 'Đang lưu…' : '✓ Lưu thay đổi'}
          </button>
        </div>
      </div>
    </div>
  );
}
