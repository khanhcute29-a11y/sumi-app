import React, { useState } from 'react';
import { exportOrdersSummary, exportRevenueSummary, thisWeekRange, EXPORT_FLOWS } from '../lib/exportSummary';

// Hộp chọn khoảng ngày → tải 3 file CSV (theo ngày, theo tuần, chi tiết).
// Chỉ được mở từ chỗ đã giới hạn cho Giám đốc.
export default function ExportSummaryModal({ mode, onClose }) {
  const [range, setRange] = useState(thisWeekRange);
  const [flows, setFlows] = useState([]);
  const [format, setFormat] = useState('xlsx');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const isOrders = mode === 'orders';
  const valid = range.from && range.to && range.from <= range.to;

  const run = async () => {
    if (!valid || busy) return;
    setBusy(true); setMsg('');
    try {
      const n = await (isOrders ? exportOrdersSummary : exportRevenueSummary)(range.from, range.to, format, flows);
      setMsg(n ? `Đã xuất ${isOrders ? `${n} đơn hàng` : `${n} dòng dữ liệu`} (${isOrders ? (format === 'xlsx' ? '1 file Excel' : '1 file CSV') : (format === 'xlsx' ? '1 file Excel, 3 sheet' : '3 file CSV')}).` : 'Không có dữ liệu trong khoảng này — file chỉ có tiêu đề.');
    } catch (err) {
      setMsg(`Lỗi: ${err?.message || 'không xuất được.'}${isOrders ? ' (đã chạy đủ migration orders_export_rows / orders_export_item_rows chưa?)' : ''}`);
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
            ? 'Tính theo ngày cần giao. Mỗi đơn 1 khối: thông tin đơn, tổng tiền và từng sản phẩm.'
            : 'Doanh thu thuần (theo ngày hoàn thành) + doanh thu dự tính (theo mốc ngày từng khoản), tách theo loại bánh.'}
        </p>
        <div style={{ display: 'flex', gap: 10 }}>
          <label style={label}>Từ ngày<input type="date" style={input} value={range.from} max={range.to} onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))} /></label>
          <label style={label}>Đến ngày<input type="date" style={input} value={range.to} min={range.from} onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))} /></label>
        </div>
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#725f50', marginBottom: 6 }}>
            Luồng cần xuất {flows.length === 0 ? '(đang chọn: tất cả)' : `(${flows.length} luồng)`}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {EXPORT_FLOWS.map((f) => {
              const on = flows.includes(f.key);
              return (
                <button key={f.key} type="button" onClick={() => setFlows((cur) => (on ? cur.filter((k) => k !== f.key) : [...cur, f.key]))}
                  style={{ minHeight: 36, padding: '0 12px', borderRadius: 999, cursor: 'pointer', fontSize: 12.5, fontWeight: 800,
                    border: on ? '2px solid #15803d' : '1px solid #eadcca', background: on ? '#f0fdf4' : '#fff', color: on ? '#15803d' : '#725f50' }}>
                  {on ? '✓ ' : ''}{f.title}
                </button>
              );
            })}
          </div>
          {flows.length > 0 && <button type="button" onClick={() => setFlows([])} style={{ marginTop: 6, background: 'none', border: 'none', color: '#b93e13', fontSize: 12, fontWeight: 800, cursor: 'pointer', padding: 0 }}>Bỏ chọn (xuất tất cả)</button>}
        </div>
        <label style={{ ...label, marginTop: 10 }}>Định dạng
          <select style={input} value={format} onChange={(e) => setFormat(e.target.value)}>
            <option value="xlsx">{isOrders ? 'Excel (.xlsx) — chi tiết từng đơn, từng sản phẩm' : 'Excel (.xlsx) — 1 file, 3 sheet: theo ngày, theo tuần, chi tiết'}</option>
            <option value="csv">{isOrders ? 'CSV — 1 bảng phẳng' : 'CSV — 3 file rời'}</option>
          </select>
        </label>
        {msg && <p style={{ fontSize: 12.5, fontWeight: 700, color: msg.startsWith('Lỗi') ? '#b91c1c' : '#15803d', margin: '10px 0 0' }}>{msg}</p>}
        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          <button onClick={onClose} style={{ flex: 1, minHeight: 44, borderRadius: 12, border: '1px solid #eadcca', background: '#f4efe8', fontWeight: 800, cursor: 'pointer' }}>Đóng</button>
          <button onClick={run} disabled={!valid || busy} style={{ flex: 2, minHeight: 44, borderRadius: 12, border: 'none', background: valid ? '#15803d' : '#9ca3af', color: '#fff', fontWeight: 900, cursor: 'pointer' }}>{busy ? 'Đang xuất…' : (format === 'xlsx' ? 'Xuất file Excel' : (isOrders ? 'Xuất file CSV' : 'Xuất 3 file CSV'))}</button>
        </div>
      </div>
    </div>
  );
}
