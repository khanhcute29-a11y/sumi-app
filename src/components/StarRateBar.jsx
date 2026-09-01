import React, { useState } from 'react';
import { supabase } from '../lib/supabaseClient';

// Module đánh giá nhanh dùng chung — Duyệt việc / Đơn hàng / Chấm công.
// Cộng dùng cho khen thưởng nhanh, Trừ dùng cho nhắc nhở/kỷ luật nhanh —
// cả hai đi qua RPC sumi_dieu_chinh_sao (quyền do DATABASE quyết, không phải
// trình duyệt: chỉ quản lý cùng đơn vị hoặc quản lý lương mới ghi được, và
// không ai tự đánh giá cho chính mình — chặn cứng dưới database).
export default function StarRateBar({ staffId, staffName, linkType, linkId, mode = 'full', compact = false, onDone }) {
  const [loai, setLoai] = useState(null); // 'cong' | 'tru'
  const [soSao, setSoSao] = useState('');
  const [ghiChu, setGhiChu] = useState('');
  const [dangGui, setDangGui] = useState(false);
  const [loi, setLoi] = useState('');
  const [xong, setXong] = useState('');

  if (!staffId) return null;

  const gui = async () => {
    const n = Math.round(Number(soSao));
    if (!loai) { setLoi('Chọn Cộng hoặc Trừ trước.'); return; }
    if (!n || n < 1) { setLoi('Nhập số sao hợp lệ.'); return; }
    setDangGui(true); setLoi(''); setXong('');
    try {
      const { data, error } = await supabase.rpc('sumi_dieu_chinh_sao', {
        p_staff_id: staffId, p_so_sao: n, p_loai: loai,
        p_ghi_chu: ghiChu.trim() || null, p_link_type: linkType || null, p_link_id: linkId || null,
      });
      if (error) {
        if (/function .* does not exist|schema cache/i.test(error.message || '')) {
          throw new Error('Máy chủ chưa bật tính năng đánh giá sao. Báo quản trị chạy bản cập nhật database.');
        }
        throw error;
      }
      if (data && data.thanh_cong === false) throw new Error(data.thong_bao || 'Không thực hiện được.');
      setXong(data?.thong_bao || 'Đã ghi nhận.');
      setSoSao(''); setGhiChu(''); setLoai(null);
      await onDone?.();
    } catch (e) {
      setLoi(e?.message || 'Không thực hiện được. Thử lại giúp tôi.');
    } finally {
      setDangGui(false);
    }
  };

  return (
    <div style={{
      marginTop: 10, padding: compact ? 10 : 14, borderRadius: 14,
      background: '#FFF8F0', border: '1px solid #F0DFC8',
    }}>
      <div style={{ fontWeight: 800, fontSize: compact ? 12.5 : 14, color: '#8C5A3C', marginBottom: 6 }}>
        🌟 Đánh giá nhanh{staffName ? ` — ${staffName}` : ''}{' '}
        <span style={{ fontWeight: 500, fontSize: '0.9em' }}>(1 sao = 1.000đ)</span>
      </div>
      <div style={{ display: 'flex', gap: 8, marginBottom: loai ? 8 : 0 }}>
        {mode !== 'tru' && (
          <button type="button" onClick={() => setLoai(loai === 'cong' ? null : 'cong')}
            style={{
              flex: 1, minHeight: 40, borderRadius: 10, cursor: 'pointer', fontWeight: 800,
              border: loai === 'cong' ? '2px solid #1e7e4c' : '1px solid #ddd',
              background: loai === 'cong' ? '#e6f4ea' : '#fff', color: '#1e7e4c',
            }}>
            + Cộng
          </button>
        )}
        {mode !== 'cong' && (
          <button type="button" onClick={() => setLoai(loai === 'tru' ? null : 'tru')}
            style={{
              flex: 1, minHeight: 40, borderRadius: 10, cursor: 'pointer', fontWeight: 800,
              border: loai === 'tru' ? '2px solid #b42318' : '1px solid #ddd',
              background: loai === 'tru' ? '#fee2e2' : '#fff', color: '#b42318',
            }}>
            − Trừ
          </button>
        )}
      </div>
      {loai && (
        <>
          <input type="number" min={1} inputMode="numeric" value={soSao}
            onChange={(e) => setSoSao(e.target.value)} placeholder="Số sao (VD: 5)"
            style={{ width: '100%', minHeight: 40, padding: '0 10px', borderRadius: 10, border: '1px solid #ddd', marginBottom: 8, boxSizing: 'border-box', fontFamily: 'inherit', fontSize: 14 }} />
          <textarea value={ghiChu} onChange={(e) => setGhiChu(e.target.value)} rows={2}
            placeholder="Ghi chú / nhận xét…"
            style={{ width: '100%', padding: 10, borderRadius: 10, border: '1px solid #ddd', fontFamily: 'inherit', fontSize: 14, resize: 'vertical', boxSizing: 'border-box' }} />
          {loi && <div style={{ color: '#b42318', fontSize: 12.5, marginTop: 6 }}>⚠️ {loi}</div>}
          {xong && <div style={{ color: '#1e7e4c', fontSize: 12.5, marginTop: 6 }}>✅ {xong}</div>}
          <button type="button" onClick={gui} disabled={dangGui || !soSao}
            style={{
              width: '100%', minHeight: 44, marginTop: 8, border: 0, borderRadius: 10, fontWeight: 900, cursor: 'pointer',
              background: loai === 'cong' ? '#1e7e4c' : '#b42318', color: '#fff',
            }}>
            {dangGui
              ? 'Đang gửi…'
              : soSao
                ? `${loai === 'cong' ? 'CỘNG' : 'TRỪ'} ${soSao} SAO (${(Number(soSao || 0) * 1000).toLocaleString('vi-VN')}đ)`
                : 'NHẬP SỐ SAO'}
          </button>
        </>
      )}
    </div>
  );
}
