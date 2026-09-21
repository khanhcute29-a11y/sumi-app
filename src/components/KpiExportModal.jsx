import React, { useState } from 'react';
import { exportKpiSummary } from '../lib/exportKpi';

// Hộp xuất KPI từng người → 1 file Excel (sheet Tổng hợp + mỗi người 1 sheet).
// Chỉ mở từ màn Tổng quan KPI của Giám đốc; các RPC KPI cũng chặn phía server.
export default function KpiExportModal({ initialFrom, initialTo, onClose }) {
  const [range, setRange] = useState({ from: initialFrom, to: initialTo });
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [msg, setMsg] = useState('');
  const valid = range.from && range.to && range.from <= range.to;

  const run = async () => {
    if (!valid || busy) return;
    setBusy(true); setMsg(''); setProgress('');
    try {
      const n = await exportKpiSummary(range.from, range.to, (done, total) => setProgress(`Đang lấy dữ liệu ${done}/${total} nhân viên…`));
      setMsg(n ? `Đã xuất KPI của ${n} nhân viên (1 file Excel).` : 'Chưa có nhân viên nào trong danh sách.');
    } catch (err) {
      setMsg(`Lỗi: ${err?.message || 'không xuất được.'}`);
    } finally { setBusy(false); setProgress(''); }
  };

  const input = { minHeight: 42, borderRadius: 10, border: '1px solid #eadcca', padding: '0 10px', fontSize: 14 };
  const label = { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, fontWeight: 700, color: '#725f50', flex: 1 };
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 3000, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 18, padding: 18, width: '100%', maxWidth: 420, boxShadow: '0 12px 40px rgba(0,0,0,.25)' }}>
        <strong style={{ fontSize: 16, color: '#2d1c10' }}>Xuất KPI từng người</strong>
        <p style={{ fontSize: 12, color: '#725f50', margin: '6px 0 12px', lineHeight: 1.5 }}>
          Tất cả nhân viên đang làm. Sheet "Tổng hợp" mỗi người 1 dòng, sau đó mỗi người 1 sheet chi tiết (điểm KPI, công việc, giờ làm, giao hàng, thưởng chuyên cần, chấm công từng ngày). Số liệu khớp màn Tổng quan KPI.
        </p>
        <div style={{ display: 'flex', gap: 10 }}>
          <label style={label}>Từ ngày<input type="date" style={input} value={range.from} max={range.to} onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))} /></label>
          <label style={label}>Đến ngày<input type="date" style={input} value={range.to} min={range.from} onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))} /></label>
        </div>
        {progress && <p style={{ fontSize: 12.5, fontWeight: 700, color: '#725f50', margin: '10px 0 0' }}>{progress}</p>}
        {msg && <p style={{ fontSize: 12.5, fontWeight: 700, color: msg.startsWith('Lỗi') ? '#b91c1c' : '#15803d', margin: '10px 0 0' }}>{msg}</p>}
        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          <button onClick={onClose} style={{ flex: 1, minHeight: 44, borderRadius: 12, border: '1px solid #eadcca', background: '#f4efe8', fontWeight: 800, cursor: 'pointer' }}>Đóng</button>
          <button onClick={run} disabled={!valid || busy} style={{ flex: 2, minHeight: 44, borderRadius: 12, border: 'none', background: valid ? '#15803d' : '#9ca3af', color: '#fff', fontWeight: 900, cursor: 'pointer' }}>{busy ? 'Đang xuất…' : 'Xuất file Excel'}</button>
        </div>
      </div>
    </div>
  );
}
