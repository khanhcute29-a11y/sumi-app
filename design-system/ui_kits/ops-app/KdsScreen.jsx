const { Badge, Tabs, Button } = window.SumiBakeryDesignSystem_ade08e;

const DAILY = [
  { name: 'Bánh Kem Dâu 22cm', qty: 1, table: 'Sếp Lẻ', status: 'warning', note: 'Khách yêu cầu chữ "Happy Birthday" màu đỏ' },
  { name: '2x Bánh Croissant', qty: 2, table: 'GrabFood', status: 'warning' },
  { name: 'Bánh Bam custom', qty: 1, table: 'Boss', status: 'success', note: 'Không hạt, giao trước 9h' },
];
const TEA_STATIONS = {
  banh: [{ name: 'Bánh Su Kem', qty: 40 }, { name: 'Bánh Mousse mini', qty: 20 }],
  douong: [{ name: 'Trà Đào', qty: 20 }, { name: 'Cà phê sữa', qty: 20 }],
  dungcu: [{ name: 'Khay inox', qty: 4, due: 'Trả trước 18:00' }, { name: 'Bình giữ nhiệt', qty: 2, due: 'Trả trước 20:00' }],
};

function Ticket({ title, subtitle, initialTone, note }) {
  const [status, setStatus] = React.useState(initialTone === 'success' ? 'ready' : 'cho_nhan');
  return (
    <div style={{ background: 'var(--surface-card)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-sm)', padding: 14, display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ font: 'var(--text-label)', color: 'var(--text-primary)' }}>{title}</div>
      <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-secondary)' }}>{subtitle}</div>
      {note && <div style={{ font: 'var(--text-caption)', color: 'var(--text-muted)', background: 'var(--surface-sunken)', borderRadius: 'var(--radius-sm)', padding: '6px 8px' }}>📝 {note}</div>}
      {status === 'cho_nhan' && <Button variant="primary" size="sm" onClick={() => setStatus('dang_lam')}>Nhận đơn</Button>}
      {status === 'dang_lam' && <Badge tone="warning">Đang làm</Badge>}
      {status === 'ready' && <Badge tone="success">Sẵn sàng</Badge>}
    </div>
  );
}

function KdsScreen() {
  const [mode, setMode] = React.useState('daily');
  const [station, setStation] = React.useState('banh');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <div style={{ font: 'var(--text-display-md)', color: 'var(--text-primary)' }}>Bếp KDS</div>
        <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-muted)' }}>Sản Xuất Bếp — hằng ngày &amp; Tiệc Teabreak</div>
      </div>
      <Tabs tabs={[{ key: 'daily', label: 'Bếp hằng ngày' }, { key: 'tea', label: 'Tiệc Teabreak' }]} active={mode} onChange={setMode} />
      {mode === 'daily' ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))', gap: 12 }}>
          {DAILY.map((d, i) => <Ticket key={i} title={d.name} subtitle={`SL: ${d.qty} · ${d.table}`} initialTone={d.status} note={d.note} />)}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Tabs tabs={[{ key: 'banh', label: 'Bánh' }, { key: 'douong', label: 'Đồ uống' }, { key: 'dungcu', label: 'Dụng cụ cho mượn' }]} active={station} onChange={setStation} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))', gap: 12 }}>
            {TEA_STATIONS[station].map((item, i) => (
              <Ticket key={i} title={item.name} subtitle={item.due ? item.due : `SL: ${item.qty}`} initialTone={item.due ? 'warning' : 'success'} />
            ))}
          </div>
        </div>
      )}
      <Button variant="danger" size="sm" icon="⛔" style={{ alignSelf: 'flex-start' }}>Emergency Stop — Khách hủy đơn</Button>
    </div>
  );
}
Object.assign(window, { KdsScreen });
