import React, { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { CameraPhotoField } from './CameraPhotoField';

// Module đánh giá nhanh dùng chung — Duyệt việc / Đơn hàng / Chấm công.
// Cộng dùng cho khen thưởng nhanh, Trừ dùng cho nhắc nhở/kỷ luật nhanh —
// cả hai đi qua RPC sumi_dieu_chinh_sao (quyền do DATABASE quyết, không phải
// trình duyệt: chỉ quản lý cùng đơn vị hoặc quản lý lương mới ghi được, và
// không ai tự đánh giá cho chính mình — chặn cứng dưới database).
//
// ⚠️ LUÔN hiện LỊCH SỬ ngay dưới form (view star_transactions, lọc đúng
// staffId + linkType + linkId của công đoạn đang xem) — trước đây không có,
// quản lý đánh giá xong không thấy lại nên bấm đánh giá trùng lần 2 mà không
// biết. Sửa/Xóa cũng đi qua RPC riêng (sumi_sua_danh_gia_sao/sumi_xoa_danh_gia_sao),
// dùng CHUNG cho cả 3 luồng — không tách riêng từng nơi.
const formatVND = (n) => Number(n || 0).toLocaleString('vi-VN') + 'đ';
const formatNgay = (iso) => iso ? new Date(iso).toLocaleDateString('vi-VN') : '';

export default function StarRateBar({ staffId, staffName, linkType, linkId, mode = 'full', compact = false, onDone, readOnly = false }) {
  const [loai, setLoai] = useState(null); // 'cong' | 'tru'
  const [soSao, setSoSao] = useState('');
  const [ghiChu, setGhiChu] = useState('');
  const [anhUrl, setAnhUrl] = useState('');
  const [dangGui, setDangGui] = useState(false);
  const [loi, setLoi] = useState('');
  const [xong, setXong] = useState('');

  const [lichSu, setLichSu] = useState(null); // null = đang tải
  const [dangSua, setDangSua] = useState(null); // id đang sửa
  const [suaSoSao, setSuaSoSao] = useState('');
  const [suaGhiChu, setSuaGhiChu] = useState('');
  const [suaAnhUrl, setSuaAnhUrl] = useState('');
  const [dangXuLy, setDangXuLy] = useState('');
  const [xemAnh, setXemAnh] = useState('');

  const taiLichSu = useCallback(async () => {
    if (!staffId) return;
    try {
      let q = supabase.from('star_transactions').select('*').eq('staff_id', staffId)
        .order('created_at', { ascending: false }).limit(15);
      if (linkType) q = q.eq('link_type', linkType);
      if (linkId) q = q.eq('link_id', linkId);
      const { data, error } = await q;
      if (error) throw error;
      setLichSu(data || []);
    } catch {
      setLichSu([]);
    }
  }, [staffId, linkType, linkId]);

  useEffect(() => { taiLichSu(); }, [taiLichSu]);

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
        p_photo_url: anhUrl || null,
      });
      if (error) {
        if (/function .* does not exist|schema cache/i.test(error.message || '')) {
          throw new Error('Máy chủ chưa bật tính năng đánh giá sao. Báo quản trị chạy bản cập nhật database.');
        }
        throw error;
      }
      if (data && data.thanh_cong === false) throw new Error(data.thong_bao || 'Không thực hiện được.');
      setXong(data?.thong_bao || 'Đã ghi nhận.');
      setSoSao(''); setGhiChu(''); setLoai(null); setAnhUrl('');
      await taiLichSu();
      await onDone?.();
    } catch (e) {
      setLoi(e?.message || 'Không thực hiện được. Thử lại giúp tôi.');
    } finally {
      setDangGui(false);
    }
  };

  const batDauSua = (item) => {
    setDangSua(item.id);
    setSuaSoSao(String(item.so_sao || ''));
    setSuaGhiChu(item.note || '');
    setSuaAnhUrl(item.photo_url || '');
  };

  const luuSua = async (item) => {
    const n = Math.round(Number(suaSoSao));
    if (!n || n < 1) { setLoi('Nhập số sao hợp lệ.'); return; }
    setDangXuLy(item.id); setLoi('');
    try {
      const { data, error } = await supabase.rpc('sumi_sua_danh_gia_sao', {
        p_id: item.id, p_loai: item.loai, p_so_sao: n, p_ghi_chu: suaGhiChu.trim() || null,
        p_photo_url: suaAnhUrl || null,
      });
      if (error) throw error;
      if (data && data.thanh_cong === false) throw new Error(data.thong_bao || 'Không sửa được.');
      setDangSua(null);
      await taiLichSu();
      await onDone?.();
    } catch (e) {
      setLoi(e?.message || 'Không sửa được. Thử lại giúp tôi.');
    } finally {
      setDangXuLy('');
    }
  };

  const xoa = async (item) => {
    if (!window.confirm(`Xoá đánh giá ${item.loai === 'cong' ? '+' : '-'}${item.so_sao} sao này?`)) return;
    setDangXuLy(item.id); setLoi('');
    try {
      const { data, error } = await supabase.rpc('sumi_xoa_danh_gia_sao', { p_id: item.id, p_loai: item.loai });
      if (error) throw error;
      if (data && data.thanh_cong === false) throw new Error(data.thong_bao || 'Không xoá được.');
      await taiLichSu();
      await onDone?.();
    } catch (e) {
      setLoi(e?.message || 'Không xoá được. Thử lại giúp tôi.');
    } finally {
      setDangXuLy('');
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
      {!readOnly && (
      <>
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
          <div style={{ marginTop: 8 }}>
            <CameraPhotoField url={anhUrl} onChange={setAnhUrl} label="Ảnh chứng từ (không bắt buộc)" prefix="sao" facingMode="environment" />
          </div>
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

      {!loai && loi && <div style={{ color: '#b42318', fontSize: 12.5, marginTop: 6 }}>⚠️ {loi}</div>}
      </>
      )}

      {/* ── Lịch sử — luôn hiện ngay dưới form, kể cả khi chưa mở Cộng/Trừ ── */}
      <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px dashed #E5D3B8' }}>
        <div style={{ fontSize: 11.5, fontWeight: 800, color: '#8C5A3C', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.3 }}>
          Lịch sử đánh giá
        </div>
        {lichSu === null && <div style={{ fontSize: 12.5, color: '#8C5A3C' }}>Đang tải…</div>}
        {lichSu && lichSu.length === 0 && <div style={{ fontSize: 12.5, color: '#8C5A3C' }}>Chưa có đánh giá nào.</div>}
        {lichSu && lichSu.map((it) => (
          <div key={it.id} style={{
            display: 'flex', flexDirection: 'column', gap: 4, padding: '8px 0',
            borderBottom: '1px solid #F0E4D0', fontSize: 12.5,
          }}>
            {dangSua === it.id ? (
              <>
                <input type="number" min={1} value={suaSoSao} onChange={(e) => setSuaSoSao(e.target.value)}
                  style={{ minHeight: 34, padding: '0 8px', borderRadius: 8, border: '1px solid #ddd', fontFamily: 'inherit' }} />
                <textarea value={suaGhiChu} onChange={(e) => setSuaGhiChu(e.target.value)} rows={2}
                  style={{ padding: 8, borderRadius: 8, border: '1px solid #ddd', fontFamily: 'inherit', fontSize: 12.5, resize: 'vertical' }} />
                <CameraPhotoField url={suaAnhUrl} onChange={setSuaAnhUrl} label="Ảnh chứng từ" prefix="sao" facingMode="environment" />
                <div style={{ display: 'flex', gap: 6 }}>
                  <button type="button" disabled={dangXuLy === it.id} onClick={() => luuSua(it)}
                    style={{ flex: 1, minHeight: 32, border: 0, borderRadius: 8, background: '#1e7e4c', color: '#fff', fontWeight: 800, cursor: 'pointer' }}>
                    {dangXuLy === it.id ? 'Đang lưu…' : 'Lưu'}
                  </button>
                  <button type="button" onClick={() => setDangSua(null)}
                    style={{ flex: 1, minHeight: 32, border: '1px solid #ddd', borderRadius: 8, background: '#fff', cursor: 'pointer' }}>
                    Huỷ
                  </button>
                </div>
              </>
            ) : (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
                  <span style={{ fontWeight: 800, color: it.loai === 'cong' ? '#1e7e4c' : '#b42318' }}>
                    {it.loai === 'cong' ? '+' : '−'}{it.so_sao} sao ({formatVND(it.so_tien)})
                  </span>
                  <span style={{ color: '#8C5A3C', whiteSpace: 'nowrap' }}>{formatNgay(it.ngay || it.created_at)}</span>
                </div>
                {it.note && <div style={{ color: 'var(--text-secondary, #555)' }}>{it.note}</div>}
                {it.photo_url && (
                  <button type="button" onClick={() => setXemAnh(it.photo_url)}
                    style={{ alignSelf: 'flex-start', border: 'none', background: 'none', color: '#1d4ed8', fontWeight: 700, cursor: 'pointer', padding: 0, fontSize: 12 }}>
                    📷 Xem ảnh
                  </button>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#a08a6f' }}>
                  <span>{it.created_by_name ? `bởi ${it.created_by_name}` : ''}{it.auto_generated ? ' · Tự động' : ''}</span>
                  {!readOnly && !it.auto_generated && (
                    <span style={{ display: 'flex', gap: 10 }}>
                      <button type="button" onClick={() => batDauSua(it)}
                        style={{ border: 'none', background: 'none', color: '#8C5A3C', fontWeight: 700, cursor: 'pointer', padding: 0, fontSize: 12 }}>
                        Sửa
                      </button>
                      <button type="button" disabled={dangXuLy === it.id} onClick={() => xoa(it)}
                        style={{ border: 'none', background: 'none', color: '#b42318', fontWeight: 700, cursor: 'pointer', padding: 0, fontSize: 12 }}>
                        {dangXuLy === it.id ? 'Đang xoá…' : 'Xoá'}
                      </button>
                    </span>
                  )}
                </div>
              </>
            )}
          </div>
        ))}
      </div>

      {xemAnh && (
        <div onClick={() => setXemAnh('')} style={{ position: 'fixed', inset: 0, zIndex: 3000, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <img src={xemAnh} alt="Ảnh chứng từ" style={{ maxWidth: '100%', maxHeight: '100%', borderRadius: 12 }} />
        </div>
      )}
    </div>
  );
}
