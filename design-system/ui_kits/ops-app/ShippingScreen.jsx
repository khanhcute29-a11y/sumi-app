const { Badge, Button } = window.SumiBakeryDesignSystem_ade08e;

const DELIVERIES = [
  { id: 'd1', customer: 'Linh Dan', address: '12 Nguyễn Trãi, Q.1', item: 'Bánh Kem Dâu 22cm', eta: '10:30' },
  { id: 'd2', customer: 'Khách Cần Lưu Ý', address: '88 Lê Lợi, Q.3', item: 'Bánh Kem Dâu Size 22cm', eta: '11:00', flagged: true },
  { id: 'd3', customer: 'Fanpage khách', address: '5 Phan Xích Long, Q.Phú Nhuận', item: 'Set Teabreak 20 khách', eta: '13:00' },
];

function DeliveryCard({ d }) {
  const [status, setStatus] = React.useState('cho_nhan');
  const [photoTaken, setPhotoTaken] = React.useState(false);
  return (
    <div style={{ background: 'var(--surface-card)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-sm)', padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <div style={{ font: 'var(--text-label)', color: 'var(--text-primary)' }}>Tên khách hàng: {d.customer}</div>
          <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-secondary)' }}>Sản phẩm: {d.item}</div>
          <div style={{ font: 'var(--text-caption)', color: 'var(--text-muted)' }}>Địa chỉ: {d.address}</div>
          <div style={{ font: 'var(--text-caption)', color: 'var(--text-muted)' }}>Thời gian giao: {d.eta}</div>
        </div>
        {d.flagged && <Badge tone="danger">⚠ Cần Lưu Ý</Badge>}
      </div>

      {status === 'cho_nhan' && (
        <Button variant="primary" size="sm" onClick={() => setStatus('dang_giao')}>Nhận đơn vận chuyển</Button>
      )}

      {status === 'dang_giao' && (
        <React.Fragment>
          <Badge tone="warning" style={{ alignSelf: 'flex-start' }}>Đang giao</Badge>
          <div onClick={() => setPhotoTaken(true)} style={{ height: 90, borderRadius: 'var(--radius-md)', background: 'var(--surface-sunken)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', font: 'var(--text-body-sm)', cursor: 'pointer' }}>
            {photoTaken ? '📷 Ảnh bánh hoàn thành đã chụp' : '📷 Chụp ảnh bánh hoàn thành'}
          </div>
          <Button variant="primary" size="sm" disabled={!photoTaken} onClick={() => setStatus('hoan_thanh')}>Hoàn thành</Button>
        </React.Fragment>
      )}

      {status === 'hoan_thanh' && (
        <Badge tone="success" style={{ alignSelf: 'flex-start' }}>Đơn giao hoàn thành</Badge>
      )}
    </div>
  );
}

function ShippingScreen() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <div style={{ font: 'var(--text-display-md)', color: 'var(--text-primary)' }}>Vận Chuyển</div>
        <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-muted)' }}>Nhận đơn &amp; giao hàng — offline-first</div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(260px,1fr))', gap: 12 }}>
        {DELIVERIES.map((d) => <DeliveryCard key={d.id} d={d} />)}
      </div>
    </div>
  );
}
Object.assign(window, { ShippingScreen });
