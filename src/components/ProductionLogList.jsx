import React, { useEffect, useMemo, useState } from 'react';
import { Tabs } from './navigation/Tabs';
import { Button } from './forms/Button';
import { Input } from './forms/Input';
import { fetchProductionLogs } from '../lib/queries';
import { localDateStr, periodRangeFor, periodLabelFor, shiftAnchor } from '../lib/date';
import { supabase } from '../lib/supabaseClient';

export function ProductionLogList({ refreshKey }) {
  const [unit, setUnit] = useState('day');
  const [anchor, setAnchor] = useState(() => new Date());
  const today = localDateStr();
  const [customFrom, setCustomFrom] = useState(today);
  const [customTo, setCustomTo] = useState(today);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const { from, to } = unit === 'custom' ? { from: customFrom, to: customTo } : periodRangeFor(unit, anchor);

  useEffect(() => {
    setLoading(true);
    setError('');
    fetchProductionLogs({ from, to })
      .then(setLogs)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [from, to, refreshKey]);

  useEffect(() => {
    const channel = supabase
      .channel('production-logs-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'production_logs' }, () => {
        fetchProductionLogs({ from, to }).then(setLogs).catch(() => {});
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to]);

  const totals = useMemo(() => {
    return logs.reduce((acc, l) => ({
      qty: acc.qty + (Number(l.qty) || 0),
      value: acc.value + (Number(l.qty) || 0) * (Number(l.price) || 0),
    }), { qty: 0, value: 0 });
  }, [logs]);

  return (
    <div style={{ background: 'var(--surface-card)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-sm)', padding: 14, display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
      <Tabs
        tabs={[
          { key: 'day', label: 'Ngày' },
          { key: 'week', label: 'Tuần' },
          { key: 'month', label: 'Tháng' },
          { key: 'custom', label: 'Tùy chỉnh' },
        ]}
        active={unit}
        onChange={setUnit}
      />
      {unit === 'custom' ? (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Input label="Từ ngày" type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} style={{ flex: 1 }} />
          <Input label="Đến ngày" type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} style={{ flex: 1 }} />
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Button variant="ghost" size="sm" onClick={() => setAnchor((a) => shiftAnchor(unit, a, -1))}>‹</Button>
          <div style={{ font: 'var(--text-body)', color: 'var(--text-primary)' }}>{periodLabelFor(unit, anchor)}</div>
          <Button variant="ghost" size="sm" onClick={() => setAnchor((a) => shiftAnchor(unit, a, 1))}>›</Button>
        </div>
      )}

      {error ? (
        <div style={{ font: 'var(--text-body-sm)', color: 'var(--status-danger)' }}>Lỗi tải: {error}</div>
      ) : loading ? (
        <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-muted)' }}>Đang tải...</div>
      ) : logs.length === 0 ? (
        <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-muted)' }}>Chưa có sản xuất nào trong khoảng này.</div>
      ) : (
        <>
          <div style={{ overflowX: 'auto', minWidth: 0 }}>
            <table style={{ width: '100%', tableLayout: 'fixed', borderCollapse: 'collapse', font: 'var(--text-body-sm)' }}>
              <colgroup>
                <col style={{ width: '40%' }} />
                <col style={{ width: '12%' }} />
                <col style={{ width: '10%' }} />
                <col style={{ width: '18%' }} />
                <col style={{ width: '20%' }} />
              </colgroup>
              <thead>
                <tr style={{ color: 'var(--text-muted)', textAlign: 'left' }}>
                  <th style={{ padding: '6px 4px', borderBottom: '1px solid var(--border-subtle)', fontWeight: 400 }}>Sản phẩm</th>
                  <th style={{ padding: '6px 4px', borderBottom: '1px solid var(--border-subtle)', fontWeight: 400 }}>Size</th>
                  <th style={{ padding: '6px 4px', borderBottom: '1px solid var(--border-subtle)', fontWeight: 400, textAlign: 'right' }}>SL</th>
                  <th style={{ padding: '6px 4px', borderBottom: '1px solid var(--border-subtle)', fontWeight: 400, textAlign: 'right' }}>Giá trị</th>
                  <th style={{ padding: '6px 4px', borderBottom: '1px solid var(--border-subtle)', fontWeight: 400 }}>Người ghi</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((l) => (
                  <tr key={l.id}>
                    <td style={{ padding: '8px 4px', borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-primary)', wordBreak: 'break-word' }}>{l.product_name}</td>
                    <td style={{ padding: '8px 4px', borderBottom: '1px solid var(--border-subtle)', color: l.size ? 'var(--text-primary)' : 'var(--text-muted)' }}>{l.size || '—'}</td>
                    <td style={{ padding: '8px 4px', borderBottom: '1px solid var(--border-subtle)', textAlign: 'right', color: 'var(--text-primary)' }}>{l.qty}</td>
                    <td style={{ padding: '8px 4px', borderBottom: '1px solid var(--border-subtle)', textAlign: 'right', color: 'var(--text-primary)' }}>
                      {l.price ? `${(Number(l.qty) * Number(l.price)).toLocaleString('vi-VN')}đ` : '—'}
                    </td>
                    <td style={{ padding: '8px 4px', borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-secondary)' }}>{l.staff_name}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 24, paddingTop: 10, borderTop: '1px solid var(--border-subtle)' }}>
            <div style={{ font: 'var(--text-caption)', color: 'var(--text-secondary)' }}>Tổng số lượng <b style={{ color: 'var(--text-primary)' }}>{totals.qty}</b></div>
            <div style={{ font: 'var(--text-caption)', color: 'var(--text-secondary)' }}>Tổng giá trị <b style={{ color: 'var(--text-primary)' }}>{totals.value.toLocaleString('vi-VN')}đ</b></div>
          </div>
        </>
      )}
    </div>
  );
}
