const { FifoTag, Button } = window.SumiBakeryDesignSystem_ade08e;

const STOCK = [
  { name: 'Bột mì số 8', qty: '40kg', status: 'fresh', date: '20/09' },
  { name: 'Kem tươi Whipping', qty: '12L', status: 'soon', date: '03/08' },
  { name: 'Dâu tây tươi', qty: '6kg', status: 'expired', date: '30/07' },
  { name: 'Bơ lạt Anchor', qty: '18kg', status: 'fresh', date: '15/10' },
];

function WarehouseScreen() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <div style={{ font: 'var(--text-display-md)', color: 'var(--text-primary)' }}>Kho Hàng — Bà Tám</div>
        <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-muted)' }}>Layout siêu to, dành cho thao tác nhanh tại kho</div>
      </div>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <Button variant="primary" size="lg" icon="🎙️" style={{ flex: 1, minWidth: 220, padding: '24px', font: '700 18px var(--font-body)' }}>Nói để nhập kho</Button>
        <Button variant="secondary" size="lg" icon="📷" style={{ flex: 1, minWidth: 220, padding: '24px', font: '700 18px var(--font-body)' }}>Chụp ảnh tem / bill</Button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {STOCK.map((s, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--surface-card)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-sm)', padding: '14px 18px' }}>
            <div>
              <div style={{ font: '700 17px var(--font-body)', color: 'var(--text-primary)' }}>{s.name}</div>
              <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-secondary)' }}>Tồn: {s.qty}</div>
            </div>
            <FifoTag status={s.status} date={s.date} />
          </div>
        ))}
      </div>
    </div>
  );
}
Object.assign(window, { WarehouseScreen });
