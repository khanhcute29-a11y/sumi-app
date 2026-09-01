import React, { useMemo, useState } from 'react';
import { createAssignedTasks } from '../../../lib/queries';
import { VoiceMicButton } from '../../VoiceMicButton';
import { parseVoiceByContext } from '../../../lib/parseVoiceContext';
import { OrderCodePicker } from '../../OrderCodePicker';

// Form GIAO VIỆC của giao diện mới.
//
// ⚠️ Cố ý dùng lại đúng `createAssignedTasks` mà bản cũ vẫn dùng (nó gọi RPC
// `create_general_task`). Nhờ vậy trigger `notify_task_assigned` chạy y như cũ
// — chuông báo và push "được giao việc" KHÔNG bị đụng tới một dòng nào.
//
// Mọi ô nhập đều buộc vào state thật. Lưu xong thì đóng form và nạp lại danh
// sách NGAY TẠI CHỖ, không nhảy đi đâu cả.

const o = {
  nhan: { display: 'block', fontWeight: 800, fontSize: 13, marginBottom: 6, color: 'var(--cv-text)' },
  o: {
    width: '100%', minHeight: 46, padding: '10px 12px', borderRadius: 12,
    border: '1px solid var(--cv-border)', fontSize: 15, fontFamily: 'inherit',
    boxSizing: 'border-box', background: '#fff', color: 'var(--cv-text)',
  },
};

export default function GiaoViecModal({ hoSo, danhSachTho = [], khauMacDinh, onClose, onXong }) {
  const [tieuDe, setTieuDe] = useState('');
  const [moTa, setMoTa] = useState('');
  const [maDon, setMaDon] = useState('');
  const [hanChot, setHanChot] = useState('');
  const [nhacLuc, setNhacLuc] = useState('');
  const [chon, setChon] = useState([]);
  const [timTho, setTimTho] = useState('');
  const [dangLuu, setDangLuu] = useState(false);
  const [loi, setLoi] = useState('');

  // Bỏ dấu để gõ "nghia" cũng tìm ra "Nghĩa".
  const boDau = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

  const danhSach = useMemo(() => {
    const q = boDau(timTho).trim();
    const ds = (danhSachTho || []).filter((p) => p.id && p.full_name);
    if (!q) return ds;
    return ds.filter((p) => boDau(`${p.full_name} ${p.role || ''}`).includes(q));
  }, [danhSachTho, timTho]);

  const doiChon = (id) =>
    setChon((x) => (x.includes(id) ? x.filter((y) => y !== id) : [...x, id]));

  const luu = async () => {
    if (!tieuDe.trim()) { setLoi('Hãy đặt tên cho công việc.'); return; }
    if (!chon.length) { setLoi('Chọn ít nhất một người để giao việc.'); return; }
    if (hanChot && nhacLuc && new Date(nhacLuc) > new Date(hanChot)) {
      setLoi('Giờ nhắc phải TRƯỚC hạn chót, nhắc sau khi hết hạn thì vô nghĩa.');
      return;
    }
    setDangLuu(true); setLoi('');
    try {
      const batchId = (crypto?.randomUUID?.() || String(Date.now()));
      await createAssignedTasks(chon.map((assigneeId) => ({
        title: tieuDe.trim(),
        description: moTa.trim() || null,
        order_code: maDon.trim() || null,
        deadline: hanChot ? new Date(hanChot).toISOString() : null,
        reminder_at: nhacLuc ? new Date(nhacLuc).toISOString() : null,
        assignee_id: assigneeId,
        batch_id: batchId,
        created_by: hoSo?.id || null,
      })));
      // Nạp lại danh sách rồi mới đóng — để người giao thấy ngay việc vừa tạo.
      await onXong?.();
    } catch (e) {
      setLoi(e?.message || 'Không lưu được công việc. Thử lại giúp tôi.');
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
        width: '100%', maxWidth: 600, background: '#FAF6F0',
        borderRadius: '20px 20px 0 0', padding: 20, paddingBottom: 'calc(20px + env(safe-area-inset-bottom))', maxHeight: '92dvh', overflowY: 'auto',
      }}>
        <h3 style={{ margin: '0 0 14px', fontSize: 18, fontWeight: 900 }}>➕ Giao việc mới</h3>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <VoiceMicButton onTranscript={(t) => {
            const { title, description } = parseVoiceByContext('task', t);
            setTieuDe(title);
            if (description) setMoTa(description);
          }} />
          <span style={{ fontSize: 12, color: 'var(--cv-muted)' }}>Nói VD: "Chuẩn bị 2 cốt bánh kem lạnh size 18, giao trước 5 giờ chiều"</span>
        </div>

        <label style={o.nhan}>Tên công việc <span style={{ color: '#d03027' }}>*</span></label>
        <input style={{ ...o.o, marginBottom: 12 }} value={tieuDe} autoFocus
          onChange={(e) => setTieuDe(e.target.value)}
          placeholder="VD: Chuẩn bị 2 cốt bánh kem lạnh size 18" />

        <label style={o.nhan}>Mô tả chi tiết</label>
        <textarea style={{ ...o.o, minHeight: 80, marginBottom: 12 }} value={moTa}
          onChange={(e) => setMoTa(e.target.value)}
          placeholder="Yêu cầu cụ thể, lưu ý khi làm…" />

        <div style={{ marginBottom: 12 }}>
          <OrderCodePicker label="Mã đơn liên quan" value={maDon} onChange={setMaDon} placeholder="VD: SUMI-20260826-001" />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
          <div>
            <label style={o.nhan}>🎯 Hạn chót</label>
            <input type="datetime-local" style={o.o} value={hanChot}
              onChange={(e) => setHanChot(e.target.value)} />
          </div>
          <div>
            <label style={o.nhan}>⏰ Nhắc chuông lúc</label>
            <input type="datetime-local" style={o.o} value={nhacLuc}
              onChange={(e) => setNhacLuc(e.target.value)} />
          </div>
        </div>

        <label style={o.nhan}>
          Giao cho <span style={{ color: '#d03027' }}>*</span>
          {chon.length > 0 && (
            <span style={{ marginLeft: 6, color: 'var(--cv-primary)' }}>· đã chọn {chon.length} người</span>
          )}
        </label>
        <input style={{ ...o.o, marginBottom: 8 }} value={timTho}
          onChange={(e) => setTimTho(e.target.value)} placeholder="🔍 Gõ tên để tìm nhanh…" />

        <div style={{
          maxHeight: 240, overflowY: 'auto', border: '1px solid var(--cv-border)',
          borderRadius: 12, background: '#fff', marginBottom: 14,
        }}>
          {danhSach.length === 0 && (
            <div style={{ padding: 16, fontSize: 13.5, color: 'var(--cv-muted)' }}>
              {timTho ? 'Không tìm thấy ai khớp.' : 'Chưa tải được danh sách nhân viên.'}
            </div>
          )}
          {danhSach.map((p) => {
            const daChon = chon.includes(p.id);
            return (
              <label key={p.id} style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
                minHeight: 48, cursor: 'pointer', borderTop: '1px solid #f2ece3',
                background: daChon ? '#fff4ec' : 'transparent',
              }}>
                <input type="checkbox" checked={daChon} onChange={() => doiChon(p.id)}
                  style={{ width: 20, height: 20, flexShrink: 0, cursor: 'pointer' }} />
                <span style={{ minWidth: 0 }}>
                  <span style={{ fontSize: 14.5, fontWeight: 700, display: 'block' }}>{p.full_name}</span>
                  <span style={{ fontSize: 12, color: 'var(--cv-muted)' }}>
                    {p.station || p.role || ''}
                  </span>
                </span>
              </label>
            );
          })}
        </div>

        <div style={{
          marginBottom: 14, padding: '9px 12px', borderRadius: 12, background: '#eef3ff',
          color: '#2b5bc7', fontSize: 12.5, fontWeight: 700, lineHeight: 1.5,
        }}>
          🔔 Giao xong, người nhận sẽ nghe chuông và nhận thông báo trên điện thoại ngay
          — kể cả khi màn hình đang tắt.
        </div>

        {loi && <div className="cv-error">⚠️ {loi}</div>}

        <div className="cv-actions">
          <button className="cv-btn outline" onClick={onClose} disabled={dangLuu}>Huỷ</button>
          <button className="cv-btn primary" onClick={luu} disabled={dangLuu}>
            {dangLuu ? 'Đang giao…' : `✓ Giao việc${chon.length > 1 ? ` cho ${chon.length} người` : ''}`}
          </button>
        </div>
      </div>
    </div>
  );
}
