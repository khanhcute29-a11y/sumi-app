const { Tabs, StatCard, Button, Input, Badge } = window.SumiBakeryDesignSystem_ade08e;

const ROWS = {
  thu: [{ label: 'Thanh toán VietQR — Linh Dan', amount: '+550.000đ', time: '08:52' }, { label: 'Tiền cọc GrabFood', amount: '+120.000đ', time: '09:10' }],
  chi: [{ label: 'Mua nguyên liệu Bà Tám', amount: '-1.200.000đ', time: '07:30' }, { label: 'Xăng xe ship', amount: '-80.000đ', time: '10:00' }],
  no: [{ label: 'Sếp Lẻ — công nợ tháng 7', amount: '2.400.000đ', time: '—' }],
  pl: [],
};

function ZReportModal({ onClose }) {
  const [reason, setReason] = React.useState('');
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'var(--surface-overlay)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }} onClick={onClose}>
      <div style={{ background: 'var(--surface-card)', borderRadius: 'var(--radius-lg)', width: 380, padding: 20, boxShadow: 'var(--shadow-lg)', display: 'flex', flexDirection: 'column', gap: 12 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ font: 'var(--text-title)', color: 'var(--text-primary)' }}>Chốt ca — Z-Report</div>
        <Badge tone="danger">Lệch quỹ: 10.000đ</Badge>
        <Input label="Lý do lệch quỹ (bắt buộc)" placeholder="VD: làm tròn tiền lẻ" value={reason} onChange={(e) => setReason(e.target.value)} />
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <Button variant="secondary" size="sm" onClick={onClose}>Hủy</Button>
          <Button variant="primary" size="sm" disabled={!reason} onClick={onClose}>Khóa ca</Button>
        </div>
      </div>
    </div>
  );
}

function CashbookScreen() {
  const [tab, setTab] = React.useState('thu');
  const [showZ, setShowZ] = React.useState(false);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div style={{ font: 'var(--text-display-md)', color: 'var(--text-primary)' }}>Sổ Quỹ — Master Cashbook</div>
          <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-muted)' }}>Audit Log + Claim Ticket tích hợp</div>
        </div>
        <Button variant="danger" onClick={() => setShowZ(true)}>Chốt ca (Z-Report)</Button>
      </div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <StatCard label="Thu hôm nay" value="12.480.000đ" delta="+8%" tone="success" icon="💰" style={{ flex: 1, minWidth: 160 }} />
        <StatCard label="Chi hôm nay" value="3.200.000đ" tone="danger" icon="📉" style={{ flex: 1, minWidth: 160 }} />
        <StatCard label="Công nợ" value="2.400.000đ" icon="🧾" style={{ flex: 1, minWidth: 160 }} />
      </div>
      <Tabs tabs={[{ key: 'thu', label: 'THU' }, { key: 'chi', label: 'CHI' }, { key: 'no', label: 'CÔNG NỢ' }, { key: 'pl', label: 'P&L' }]} active={tab} onChange={setTab} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {(ROWS[tab] || []).map((r, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', background: 'var(--surface-card)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-sm)', padding: '12px 16px', font: 'var(--text-body)' }}>
            <span>{r.label}</span><b>{r.amount} <span style={{ font: 'var(--text-caption)', color: 'var(--text-muted)', fontWeight: 400 }}>{r.time}</span></b>
          </div>
        ))}
        {tab === 'pl' && <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-muted)', padding: 16 }}>P&L tổng hợp theo tháng — xem chi tiết ở Báo Cáo.</div>}
      </div>
      <div style={{ font: 'var(--text-caption)', color: 'var(--text-muted)' }}>Audit Log: 3 chỉnh sửa hôm nay · Claim Ticket: 1 đang xử lý</div>
      {showZ && <ZReportModal onClose={() => setShowZ(false)} />}
    </div>
  );
}
Object.assign(window, { CashbookScreen });
