import React, { useState } from 'react';
import { exportOrdersSummary, exportRevenueSummary, thisWeekRange } from '../lib/exportSummary';

// Hộp chọn khoảng ngày → tải 3 file CSV (theo ngày, theo tuần, chi tiết).
// Chỉ được mở từ chỗ đã giới hạn cho Giám đốc.
export default function ExportSummaryModal({ mode, onClose }) {
  const [range, setRange] = useState(thisWeekRange);
  const [format, setFormat] = useState('xlsx');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const isOrders = mode === 'orders';
  const valid = range.from && range.to && range.from <= range.to;

  const run = async () => {
    if (!valid || busy) return;
    setBusy(true); setMsg('');
    try {
      const n = await (isOrders ? exportOrdersSummary : exportRevenueSummary)(range.from, range.to, format);
      setMsg(n ? `Đã xuất ${format === 'xlsx' ? '1 file Excel (3 sheet)' : '3 file CSV'} (${n} dòng dữ liệu).` : 'Không có dữ liệu trong khoảng này — file chỉ có tiêu đề.');
    } catch (err) {
      setMsg(`Lỗi: ${err?.message || 'không xuất được.'}${isOrders ? ' (đã chạy migration orders_export_rows chưa?)' : ''}`);
    } finally { setBusy(false); }
  };

  const input = { minHeight: 42, borderRadius: 10, border: '1px solid #eadcca', padding: '0 10px', fontSize: 14 };
  const label = { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, fontWeight: 700, color: '#725f50', flex: 1 };
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 3000, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 18, padding: 18, width: '100%', maxWidth: 420, boxShadow: '0 12px 40px rgba(0,0,0,.25)' }}>
        <strong style={{ fontSize: 16, color: '#2d1c10' }}>📤 Xuất tổng hợp {isOrders ? 'đơn hàng' : 'doanh thu'}</strong>
        <p style={{ fontSize: 12, color: '#725f50', margin: '6px 0 12px', lineHeight: 1.5 }}>
          {isOrders
            ? 'Tính theo ngày cần giao, tất cả loại bánh. Tuần tính Thứ Hai – Chủ Nhật.'
            : 'Doanh thu thuần (theo ngày hoàn thành) + doanh thu dự tính (theo mốc ngày từng khoản), tách theo loại bánh.'}
        </p>
        <div style={{ display: 'flex', gap: 10 }}>
          <label style={label}>Từ ngày<input type="date" style={input} value={range.from} max={range.to} onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))} /></label>
          <label style={label}>Đến ngày<input type="date" style={input} value={range.to} min={range.from} onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))} /></label>
        </div>
        <label style={{ ...label, marginTop: 10 }}>Định dạng
          <select style={input} value={format} onChange={(e) => setFormat(e.target.value)}>
            <option value="xlsx">Excel (.xlsx) — 1 file, 3 sheet: theo ngày, theo tuần, chi tiết</option>
            <option value="csv">CSV — 3 file rời</option>
          </select>
        </label>
        {msg && <p style={{ fontSize: 12.5, fontWeight: 700, color: msg.startsWith('Lỗi') ? '#b91c1c' : '#15803d', margin: '10px 0 0' }}>{msg}</p>}
        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          <button onClick={onClose} style={{ flex: 1, minHeight: 44, borderRadius: 12, border: '1px solid #eadcca', background: '#f4efe8', fontWeight: 800, cursor: 'pointer' }}>Đóng</button>
          <button onClick={run} disabled={!valid || busy} style={{ flex: 2, minHeight: 44, borderRadius: 12, border: 'none', background: valid ? '#15803d' : '#9ca3af', color: '#fff', fontWeight: 900, cursor: 'pointer' }}>{busy ? 'Đang xuất…' : (format === 'xlsx' ? 'Xuất file Excel' : 'Xuất 3 file CSV')}</button>
        </div>
      </div>
    </div>
  );
}
