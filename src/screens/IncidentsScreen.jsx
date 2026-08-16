import React, { useEffect, useState } from 'react';
import { Tabs } from '../components/navigation/Tabs';
import { Button } from '../components/forms/Button';
import { Badge } from '../components/feedback/Badge';
import { fetchIncidentReports, resolveIncidentReport } from '../lib/queries';
import { IconCheck, IconPaperclip, IconDownload } from '../components/icons/FrogIcons';

const INCIDENT_CATEGORY_LABELS = { log: 'Vận chuyển', kit: 'Bếp', inv: 'Kho' };

function IncidentRow({ report, onResolved }) {
  const [busy, setBusy] = useState(false);
  const handleResolve = async () => {
    setBusy(true);
    try { await resolveIncidentReport(report.id); onResolved(); } finally { setBusy(false); }
  };
  return (
    <div style={{ background: 'var(--surface-card)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-sm)', padding: 14, display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <Badge tone="danger">{INCIDENT_CATEGORY_LABELS[report.category] || report.category}</Badge>
          <b style={{ font: 'var(--text-body)', color: 'var(--text-primary)' }}>{report.code}</b>
          <span style={{ font: 'var(--text-body-sm)', color: 'var(--text-secondary)' }}>{report.label}</span>
        </div>
        <span style={{ font: 'var(--text-caption)', color: 'var(--text-muted)' }}>{new Date(report.created_at).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}</span>
      </div>
      {report.order_code && <div style={{ font: 'var(--text-caption)', color: 'var(--text-muted)' }}>Đơn: {report.order_code}</div>}
      {report.note && <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-secondary)' }}>{report.note}</div>}
      {Array.isArray(report.photos) && report.photos.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {report.photos.map((p, i) => {
            const safeUrl = /^https?:\/\//i.test(p?.url || '');
            if (p?.type?.startsWith('image/') && safeUrl) {
              return (
                <img
                  key={i}
                  src={p.url}
                  alt={p.name}
                  style={{ maxWidth: 100, maxHeight: 100, borderRadius: 'var(--radius-sm)', cursor: 'pointer' }}
                  onClick={() => window.open(p.url, '_blank')}
                />
              );
            }
            if (!safeUrl) {
              return (
                <span
                  key={i}
                  style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 8px', borderRadius: 'var(--radius-sm)', background: 'var(--surface-sunken)', font: 'var(--text-caption)', color: 'var(--text-muted)' }}
                >
                  <IconPaperclip size={14} /> {p?.name || 'tệp đính kèm'}
                </span>
              );
            }
            return (
              <a
                key={i}
                href={p.url}
                target="_blank"
                rel="noreferrer"
                style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 8px', borderRadius: 'var(--radius-sm)', background: 'var(--surface-sunken)', font: 'var(--text-caption)', color: 'var(--text-primary)', textDecoration: 'none' }}
              >
                <IconDownload size={14} /> {p.name}
              </a>
            );
          })}
        </div>
      )}
      <div style={{ font: 'var(--text-caption)', color: 'var(--text-muted)' }}>Người báo: {report.reporter_name || 'Không rõ'} {report.reporter_role ? `· ${report.reporter_role}` : ''}</div>
      <div>
        {report.status === 'resolved' ? (
          <Badge tone="success" icon={<IconCheck size={13} />}>Đã xử lý{report.resolved_at ? ` lúc ${new Date(report.resolved_at).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}` : ''}</Badge>
        ) : (
          <Button variant="secondary" size="sm" onClick={handleResolve} disabled={busy}>{busy ? 'Đang lưu...' : 'Đánh dấu đã xử lý'}</Button>
        )}
      </div>
    </div>
  );
}

export default function IncidentsScreen() {
  const [status, setStatus] = useState('open');
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = () => {
    setLoading(true);
    fetchIncidentReports({ status: status === 'all' ? undefined : status, limit: 200 })
      .then((data) => { setReports(data); setError(''); })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, [status]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <div style={{ font: 'var(--text-display-md)', color: 'var(--text-primary)' }}>Báo Cáo Sự Cố</div>
        <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-muted)' }}>Toàn bộ sự cố nhân viên báo qua nút "Báo sự cố" — nhấn "Đánh dấu đã xử lý" khi giải quyết xong.</div>
      </div>
      <Tabs tabs={[{ key: 'open', label: 'Đang mở' }, { key: 'resolved', label: 'Đã xử lý' }, { key: 'all', label: 'Tất cả' }]} active={status} onChange={setStatus} />
      {error && <div style={{ font: 'var(--text-body-sm)', color: 'var(--status-danger)' }}>Lỗi tải sự cố: {error}</div>}
      {loading ? (
        <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-muted)' }}>Đang tải...</div>
      ) : reports.length === 0 ? (
        <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-muted)' }}>Không có sự cố nào.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {reports.map((r) => <IncidentRow key={r.id} report={r} onResolved={load} />)}
        </div>
      )}
    </div>
  );
}
