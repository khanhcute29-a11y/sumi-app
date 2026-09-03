import React, { useEffect, useState } from 'react';
import { fetchUpcomingShiftOverrides, setStaffShiftOverride, cancelStaffShiftOverride } from '../../lib/staffShiftOverride';
import { localDateStr } from '../../lib/date';

// Yêu cầu giờ làm riêng cho 1 ngày cụ thể — sổ tay + form đặt mới.
//
// TÁCH RIÊNG khỏi StaffScreen.jsx (nơi component này được viết ban đầu) để
// dùng lại được ở ChiTietNhanSuModal.jsx — màn hình Giám đốc THẬT SỰ đang
// dùng để xem/quản lý nhân sự hằng ngày (mở từ ô "ĐANG LÀM VIỆC" trên
// Dashboard), khác với StaffScreen.jsx (mở từ tab "Nhân Viên" ở thanh điều
// hướng dưới — ít khi được dùng tới). Giữ NGUYÊN logic gốc, không đổi hành
// vi, chỉ đổi chỗ ở.
export default function GioLamRiengPanel({ hoSo, onDone }) {
  const [danhSach, setDanhSach] = useState(null);
  const [ngay, setNgay] = useState('');
  const [gio, setGio] = useState('');
  const [gioRa, setGioRa] = useState('');
  const [lyDo, setLyDo] = useState('');
  const [dangGui, setDangGui] = useState(false);
  const [loi, setLoi] = useState('');
  const [xong, setXong] = useState('');

  const taiLai = async () => {
    try { setDanhSach(await fetchUpcomingShiftOverrides(hoSo.id)); }
    catch { setDanhSach([]); }
  };
  useEffect(() => { taiLai(); }, [hoSo.id]);

  const dat = async () => {
    if (!ngay || !gio) { setLoi('Chọn ngày và giờ vào ca trước.'); return; }
    if (gioRa && gioRa <= gio) { setLoi('Giờ kết thúc phải sau giờ bắt đầu.'); return; }
    setDangGui(true); setLoi(''); setXong('');
    try {
      await setStaffShiftOverride({ staffId: hoSo.id, workDate: ngay, gioBatDau: gio, gioKetThuc: gioRa || null, lyDo });
      setXong('Đã đặt giờ làm riêng.');
      setNgay(''); setGio(''); setGioRa(''); setLyDo('');
      await taiLai();
      await onDone?.();
    } catch (e) {
      setLoi(e?.message || 'Không đặt được giờ làm riêng.');
    } finally { setDangGui(false); }
  };

  const huy = async (workDate) => {
    if (!window.confirm(`Huỷ giờ làm riêng ngày ${new Date(workDate).toLocaleDateString('vi-VN')}?`)) return;
    try { await cancelStaffShiftOverride({ staffId: hoSo.id, workDate }); await taiLai(); await onDone?.(); }
    catch (e) { setLoi(e?.message || 'Không huỷ được.'); }
  };

  return (
    <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px dashed var(--border-subtle)' }}>
      <div style={{ font: 'var(--text-caption)', fontWeight: 800, color: 'var(--text-primary)', marginBottom: 6 }}>
        ⏰ Yêu cầu giờ làm riêng (khác giờ chuẩn, cho 1 ngày cụ thể)
      </div>
      <div style={{ font: 'var(--text-caption)', color: 'var(--text-muted)', marginBottom: 8 }}>
        Giờ vào ca bắt buộc chọn. Giờ kết thúc để trống thì giữ giờ tan ca mặc định của bộ phận; có chọn thì hệ thống tính tăng ca theo ĐÚNG mốc này.
      </div>

      {danhSach === null && <div style={{ font: 'var(--text-caption)', color: 'var(--text-muted)' }}>Đang tải…</div>}
      {danhSach && danhSach.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8 }}>
          {danhSach.map((o) => (
            <div key={o.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--surface-card)', borderRadius: 10, padding: '6px 10px', fontSize: 12.5 }}>
              <span>
                <strong>{new Date(o.work_date).toLocaleDateString('vi-VN')}</strong> — vào lúc <strong>{o.gio_bat_dau?.slice(0, 5)}</strong>
                {o.gio_ket_thuc ? <> – kết thúc lúc <strong>{o.gio_ket_thuc.slice(0, 5)}</strong></> : ''}
                {o.ly_do ? ` · ${o.ly_do}` : ''}
              </span>
              <button type="button" onClick={() => huy(o.work_date)} style={{ border: 'none', background: 'none', color: 'var(--status-danger)', fontWeight: 700, cursor: 'pointer', fontSize: 12 }}>Huỷ</button>
            </div>
          ))}
        </div>
      )}
      {danhSach && danhSach.length === 0 && (
        <div style={{ font: 'var(--text-caption)', color: 'var(--text-muted)', marginBottom: 8 }}>Chưa có ngày nào được đặt giờ riêng sắp tới.</div>
      )}

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        <input type="date" value={ngay} min={localDateStr()} onChange={(e) => setNgay(e.target.value)}
          style={{ minHeight: 38, borderRadius: 8, border: '1px solid var(--border-default)', padding: '0 8px', fontSize: 12.5, fontFamily: 'inherit' }} />
        <input type="time" value={gio} onChange={(e) => setGio(e.target.value)} title="Giờ vào ca"
          style={{ minHeight: 38, borderRadius: 8, border: '1px solid var(--border-default)', padding: '0 8px', fontSize: 12.5, fontFamily: 'inherit' }} />
        <input type="time" value={gioRa} onChange={(e) => setGioRa(e.target.value)} title="Giờ kết thúc (không bắt buộc — để trống thì giữ giờ tan ca mặc định)"
          style={{ minHeight: 38, borderRadius: 8, border: '1px solid var(--border-default)', padding: '0 8px', fontSize: 12.5, fontFamily: 'inherit' }} />
        <input type="text" value={lyDo} onChange={(e) => setLyDo(e.target.value)} placeholder="Lý do (VD: đơn đặc biệt)"
          style={{ flex: 1, minWidth: 140, minHeight: 38, borderRadius: 8, border: '1px solid var(--border-default)', padding: '0 8px', fontSize: 12.5, fontFamily: 'inherit' }} />
        <button type="button" disabled={dangGui} onClick={dat}
          style={{ minHeight: 38, padding: '0 14px', borderRadius: 8, border: 'none', background: 'var(--action-primary)', color: '#fff', fontWeight: 800, fontSize: 12.5, cursor: 'pointer' }}>
          {dangGui ? 'Đang lưu…' : '+ Đặt giờ'}
        </button>
      </div>
      {loi && <div style={{ color: 'var(--status-danger)', fontSize: 12, marginTop: 6 }}>⚠️ {loi}</div>}
      {xong && <div style={{ color: '#087f5b', fontSize: 12, marginTop: 6 }}>✅ {xong}</div>}
    </div>
  );
}
