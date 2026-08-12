const { Badge, TrustScoreBadge, KanbanCard, Button, Input, Select, Checkbox, Tabs } = window.SumiBakeryDesignSystem_ade08e;

const ORDERS = {
  moi: [
    { id: 'o1', customer: 'Linh Dan', phone: '09123••••', item: 'Bánh Kem Dâu 22cm', channel: 'Zalo', sla: '08:43', vip: true, thumbnail: null },
    { id: 'o2', customer: 'Boss Quảng Đơn Nhanh', phone: '09123••••', item: 'Bánh Bam | Bánh Kem Dâu Size 22cm', channel: 'Sếp Lẻ', sla: 'Quảng Đơn N', vip: false },
    { id: 'o3', customer: 'Fanpage khách', phone: '09123••••', item: 'Set Teabreak 20 khách', channel: 'Fanpage', sla: '08:43', vip: false },
  ],
  dangLam: [
    { id: 'o4', customer: 'GrabFood khách', phone: '09123••••', item: '2x Bánh Croissant', channel: 'GrabFood', sla: '08:43', vip: false },
  ],
  dangGiao: [
    { id: 'o5', customer: 'Khách Cần Lưu Ý', phone: '09123••••', item: 'Bánh Kem Dâu Size 22cm', channel: 'Sếp Lẻ', sla: 'Đã xác nhận', vip: false, flagged: true },
  ],
};

function Column({ title, count, orders, onOpen }) {
  return (
    <div style={{ flex: 1, minWidth: 260, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, font: 'var(--text-label)', color: 'var(--text-secondary)' }}>
        {title} <Badge tone="neutral">{count}</Badge>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {orders.map((o) => (
          <KanbanCard key={o.id} customer={o.customer} phone={o.phone} item={o.item} channel={o.channel}
            onClick={() => onOpen(o)}
            badges={[
              <Badge tone={o.flagged ? 'danger' : 'warning'} key="sla">{o.flagged ? 'Khách Cần Lưu Ý ⚠' : `SLA ${o.sla}`}</Badge>,
              o.vip && <Badge tone="primary" icon="⭐" key="vip">VIP</Badge>,
            ].filter(Boolean)}
          />
        ))}
      </div>
    </div>
  );
}

const BLANK_KEM = { name: '', qty: 1, size: '', cot: '', vi: '' };
const BLANK_MAN = { name: '', qty: 1 };
const BLANK_TB_ITEM = { name: '', qty: '', unit: 'cái', price: '' };

function TeabreakItemRow({ item, onChange, onRemove, canRemove }) {
  const set = (k, v) => onChange({ ...item, [k]: v });
  const total = (Number(item.qty) || 0) * (Number(item.price) || 0);
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end', flexWrap: 'wrap' }}>
      <Input label="Tên hàng hóa" value={item.name} onChange={(e) => set('name', e.target.value)} style={{ flex: '3 1 160px', minWidth: 0 }} />
      <Input label="SL" type="number" value={item.qty} onChange={(e) => set('qty', e.target.value)} style={{ flex: '1 1 60px', minWidth: 0 }} />
      <Input label="ĐVT" value={item.unit} onChange={(e) => set('unit', e.target.value)} style={{ flex: '1 1 60px', minWidth: 0 }} />
      <Input label="Đơn giá" type="number" value={item.price} onChange={(e) => set('price', e.target.value)} style={{ flex: '1 1 90px', minWidth: 0 }} />
      <div style={{ flex: '1 1 100px', font: 'var(--text-body-sm)', color: 'var(--text-secondary)', paddingBottom: 8, textAlign: 'right' }}>{total.toLocaleString('vi-VN')}đ</div>
      {canRemove && <button onClick={onRemove} style={{ border: 'none', background: 'none', color: 'var(--text-muted)', cursor: 'pointer', paddingBottom: 8 }}>✕</button>}
    </div>
  );
}

function TeabreakOrderModal({ onClose }) {
  const [customer, setCustomer] = React.useState({ name: '', mst: '', email: '', address: '', phone: '' });
  const [date, setDate] = React.useState('');
  const [time, setTime] = React.useState('');
  const [guestCount, setGuestCount] = React.useState('');
  const [items, setItems] = React.useState([{ ...BLANK_TB_ITEM }]);
  const [note, setNote] = React.useState('');
  const setC = (k, v) => setCustomer({ ...customer, [k]: v });
  const updateItem = (i, next) => setItems(items.map((it, idx) => (idx === i ? next : it)));
  const removeItem = (i) => setItems(items.filter((_, idx) => idx !== i));
  const subtotal = items.reduce((s, it) => s + (Number(it.qty) || 0) * (Number(it.price) || 0), 0);
  const vat = Math.round(subtotal * 0.08);
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'var(--surface-overlay)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }} onClick={onClose}>
      <div style={{ background: 'var(--surface-card)', borderRadius: 'var(--radius-lg)', width: 560, maxHeight: '86vh', overflowY: 'auto', boxShadow: 'var(--shadow-lg)' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ font: 'var(--text-title)', color: 'var(--text-primary)' }}>Tạo đơn Teabreak</div>
          <button onClick={onClose} style={{ border: 'none', background: 'none', fontSize: 18, cursor: 'pointer', color: 'var(--text-muted)' }}>✕</button>
        </div>
        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ font: 'var(--text-label)' }}>Thông tin đơn vị đặt hàng</div>
          <Input label="Tên công ty / khách" placeholder="VD: Công ty Cổ phần Bệnh viện ĐHQT Hồng Bàng" value={customer.name} onChange={(e) => setC('name', e.target.value)} />
          <div style={{ display: 'flex', gap: 12 }}>
            <Input label="MST" value={customer.mst} onChange={(e) => setC('mst', e.target.value)} style={{ flex: 1 }} />
            <Input label="Email" value={customer.email} onChange={(e) => setC('email', e.target.value)} style={{ flex: 1 }} />
          </div>
          <Input label="Địa chỉ" value={customer.address} onChange={(e) => setC('address', e.target.value)} />
          <Input label="Số điện thoại" value={customer.phone} onChange={(e) => setC('phone', e.target.value)} />

          <div style={{ font: 'var(--text-label)', paddingTop: 6, borderTop: '1px solid var(--border-subtle)' }}>Giao hàng</div>
          <div style={{ display: 'flex', gap: 12 }}>
            <Input label="Ngày giao" placeholder="dd/mm/yyyy" value={date} onChange={(e) => setDate(e.target.value)} style={{ flex: 1 }} />
            <Input label="Thời gian" placeholder="VD: 7h15-11h30" value={time} onChange={(e) => setTime(e.target.value)} style={{ flex: 1 }} />
          </div>
          <Input label="Số khách Teabreak" placeholder="VD: 300 khách" value={guestCount} onChange={(e) => setGuestCount(e.target.value)} />

          <div style={{ font: 'var(--text-label)', paddingTop: 6, borderTop: '1px solid var(--border-subtle)' }}>Danh sách món (tên hàng hóa · SL · ĐVT · đơn giá)</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {items.map((it, i) => (
              <TeabreakItemRow key={i} item={it} canRemove={items.length > 1}
                onChange={(next) => updateItem(i, next)} onRemove={() => removeItem(i)} />
            ))}
          </div>
          <Button variant="secondary" size="sm" onClick={() => setItems([...items, { ...BLANK_TB_ITEM }])}>+ Thêm món</Button>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingTop: 6, borderTop: '1px solid var(--border-subtle)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', font: 'var(--text-body)' }}><span>Tổng</span><b>{subtotal.toLocaleString('vi-VN')}đ</b></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', font: 'var(--text-body)' }}><span>VAT 8%</span><b>{vat.toLocaleString('vi-VN')}đ</b></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', font: 'var(--text-title)', color: 'var(--text-primary)' }}><span>Tổng cộng</span><b>{(subtotal + vat).toLocaleString('vi-VN')}đ</b></div>
          </div>
          <Input label="Ghi chú" placeholder="Đơn giá chưa gồm VAT, thời gian đặt hàng, thanh toán..." value={note} onChange={(e) => setNote(e.target.value)} />

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, paddingTop: 8 }}>
            <Button variant="secondary" size="sm" onClick={onClose}>Hủy</Button>
            <Button variant="primary" size="sm" onClick={onClose}>Tạo đơn Teabreak</Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ProductRow({ item, onChange, onRemove, isKem, canRemove }) {
  const set = (k, v) => onChange({ ...item, [k]: v });
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 10, borderRadius: 'var(--radius-md)', background: 'var(--surface-sunken)' }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <Input label="Tên sản phẩm" placeholder={isKem ? 'VD: Bánh Kem Dâu' : 'VD: Bánh Bông Lan Mặn'} value={item.name} onChange={(e) => set('name', e.target.value)} style={{ flex: '3 1 200px', minWidth: 0 }} />
        <Input label="Số lượng" type="number" value={item.qty} onChange={(e) => set('qty', e.target.value)} style={{ flex: '1 1 80px', minWidth: 0 }} />
      </div>
      {isKem && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', minWidth: 0 }}>
          <Input label="Kích thước" placeholder="VD: 18cm" value={item.size} onChange={(e) => set('size', e.target.value)} style={{ flex: '1 1 100px', minWidth: 0 }} />
          <Input label="Cốt bánh" placeholder="VD: Vani" value={item.cot} onChange={(e) => set('cot', e.target.value)} style={{ flex: '1 1 100px', minWidth: 0 }} />
          <Input label="Vị nhân" placeholder="VD: Dâu" value={item.vi} onChange={(e) => set('vi', e.target.value)} style={{ flex: '1 1 100px', minWidth: 0 }} />
        </div>
      )}
      {canRemove && <Button variant="ghost" size="sm" onClick={onRemove} style={{ alignSelf: 'flex-end' }}>✕ Xoá sản phẩm</Button>}
    </div>
  );
}

function NewOrderModal({ onClose }) {
  const [step, setStep] = React.useState(1);
  const [cakeType, setCakeType] = React.useState('kem');
  const [kemProducts, setKemProducts] = React.useState([{ ...BLANK_KEM }]);
  const [manProducts, setManProducts] = React.useState([{ ...BLANK_MAN }]);
  const isKem = cakeType === 'kem';
  const products = isKem ? kemProducts : manProducts;
  const setProducts = isKem ? setKemProducts : setManProducts;
  const updateAt = (i, next) => setProducts(products.map((p, idx) => (idx === i ? next : p)));
  const removeAt = (i) => setProducts(products.filter((_, idx) => idx !== i));
  const addRow = () => setProducts([...products, isKem ? { ...BLANK_KEM } : { ...BLANK_MAN }]);
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'var(--surface-overlay)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }} onClick={onClose}>
      <div style={{ background: 'var(--surface-card)', borderRadius: 'var(--radius-lg)', width: 480, maxHeight: '86vh', overflowY: 'auto', boxShadow: 'var(--shadow-lg)' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ font: 'var(--text-title)', color: 'var(--text-primary)' }}>Linh Dan <Badge tone="neutral" style={{ marginLeft: 6 }}>Pre-List L9123</Badge></div>
            <div style={{ font: 'var(--text-caption)', color: 'var(--text-muted)' }}>Bước {step}/4</div>
          </div>
          <button onClick={onClose} style={{ border: 'none', background: 'none', fontSize: 18, cursor: 'pointer', color: 'var(--text-muted)' }}>✕</button>
        </div>
        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <TrustScoreBadge score={2} locked />
          {step === 1 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ font: 'var(--text-label)' }}>Thông tin sản phẩm</div>
              <Tabs tabs={[{ key: 'kem', label: 'Bánh Kem' }, { key: 'man', label: 'Bánh Mặn Ngọt' }]} active={isKem ? 'kem' : 'man'} onChange={(k) => setCakeType(k === 'kem' ? 'kem' : 'man')} />
              <div style={{ font: 'var(--text-caption)', color: 'var(--text-muted)' }}>Nhập gộp nhiều sản phẩm cùng loại vào một đơn, mỗi sản phẩm có số lượng riêng.</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {products.map((item, i) => (
                  <ProductRow key={i} item={item} isKem={isKem} canRemove={products.length > 1}
                    onChange={(next) => updateAt(i, next)} onRemove={() => removeAt(i)} />
                ))}
              </div>
              <Button variant="secondary" size="sm" onClick={addRow}>+ Thêm sản phẩm {isKem ? 'bánh kem' : 'bánh mặn ngọt'}</Button>
              {isKem && (
                <React.Fragment>
                  <div style={{ font: 'var(--text-label)', display: 'flex', justifyContent: 'space-between' }}>Bánh Custom <span style={{ color: 'var(--text-link)', cursor: 'pointer' }}>✏️ Draw &amp; Annotate</span></div>
                  <div style={{ height: 160, borderRadius: 'var(--radius-md)', background: 'var(--surface-sunken)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', font: 'var(--text-body-sm)' }}>Ảnh mẫu bánh</div>
                  <Input label="Ghi chú cho ảnh mẫu" placeholder="Ghi chú thêm về mẫu bánh custom..." />
                </React.Fragment>
              )}
              <div style={{ font: 'var(--text-label)', paddingTop: 6, borderTop: '1px solid var(--border-subtle)' }}>Thông tin khách hàng</div>
              <Input label="Địa chỉ giao" placeholder="Số nhà, đường, quận..." />
              <div style={{ display: 'flex', gap: 12 }}>
                <Input label="Ngày giao" placeholder="dd/mm/yyyy" style={{ flex: 1 }} />
                <Input label="Giờ giao" placeholder="hh:mm" style={{ flex: 1 }} />
              </div>
              <Input label="Số điện thoại" placeholder="09xx xxx xxx" />
            </div>
          )}
          {step === 2 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ font: 'var(--text-label)' }}>Ghi chú</div>
              <Input label="Ghi chú của khách" placeholder="Yêu cầu, lưu ý từ khách..." />
              <Input label="Ghi chú bên mình" placeholder="Lưu ý nội bộ, bên mình ghi..." />
            </div>
          )}
          {step === 3 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', font: 'var(--text-body)' }}><span>Tổng tiền</span><b>580.000đ</b></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', font: 'var(--text-body)' }}><span>Giảm giá VIP</span><b>-30.000đ</b></div>
              <Select label="Phương thức thanh toán" options={[{ value: 'cod', label: 'COD' }, { value: 'bank', label: 'Chuyển khoản Ngân hàng' }]} />
              <div style={{ height: 120, borderRadius: 'var(--radius-md)', background: 'var(--surface-sunken)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', font: 'var(--text-body-sm)' }}>Chụp ảnh thanh toán</div>
              <Input label="Đặt cọc" placeholder="VD: 100.000đ" />
            </div>
          )}
          {step === 4 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <Badge tone="neutral">Version Control · V1</Badge>
              <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-secondary)' }}>Xem lại toàn bộ đơn hàng trước khi chuyển bếp.</div>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, paddingTop: 8 }}>
            <Button variant="danger" size="sm" icon="⛔">Emergency Stop</Button>
            <div style={{ display: 'flex', gap: 8 }}>
              {step > 1 && <Button variant="secondary" size="sm" onClick={() => setStep(step - 1)}>Quay lại</Button>}
              {step < 4 ? <Button variant="primary" size="sm" onClick={() => setStep(step + 1)}>Tiếp tục</Button> : <Button variant="primary" size="sm" onClick={onClose}>Chuyển Bếp &amp; In Tem</Button>}
            </div>
          </div>
          <Button variant="ghost" size="sm">👑 VIP Override — Sếp duyệt làm lại</Button>
        </div>
      </div>
    </div>
  );
}

function vipOnly(orders, filter) {
  return filter === 'vip' ? orders.filter((o) => o.vip) : orders;
}

function OrdersScreen() {
  const [filter, setFilter] = React.useState('all');
  const [modalOrder, setModalOrder] = React.useState(null);
  const [showNew, setShowNew] = React.useState(false);
  const [showTeabreak, setShowTeabreak] = React.useState(false);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, height: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div style={{ font: 'var(--text-display-md)', color: 'var(--text-primary)' }}>Omnichannel Inbox</div>
          <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-muted)' }}>Trạm Thu Phát Đa Kênh · SLA còn hạn</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button variant="primary" onClick={() => setShowNew(true)}>+ TẠO ĐƠN MỚI</Button>
          <Button variant="secondary" onClick={() => setShowTeabreak(true)}>+ Tạo đơn Teabreak</Button>
        </div>
      </div>
      <Tabs tabs={[{ key: 'all', label: 'Tất cả' }, { key: 'cho-coc', label: 'Chờ cọc' }, { key: 'bep', label: 'Bếp đang làm' }, { key: 'dang-giao', label: 'Đang giao' }, { key: 'vip', label: 'VIP' }]} active={filter} onChange={setFilter} />
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', flex: 1 }}>
        {(filter === 'all' || filter === 'cho-coc' || filter === 'vip') && (
          <Column title="Mới" count={vipOnly(ORDERS.moi, filter).length} orders={vipOnly(ORDERS.moi, filter)} onOpen={setModalOrder} />
        )}
        {(filter === 'all' || filter === 'bep' || filter === 'vip') && (
          <Column title="Đang làm" count={vipOnly(ORDERS.dangLam, filter).length} orders={vipOnly(ORDERS.dangLam, filter)} onOpen={setModalOrder} />
        )}
        {(filter === 'all' || filter === 'dang-giao' || filter === 'vip') && (
          <Column title="Đang giao" count={vipOnly(ORDERS.dangGiao, filter).length} orders={vipOnly(ORDERS.dangGiao, filter)} onOpen={setModalOrder} />
        )}
      </div>
      {(showNew || modalOrder) && <NewOrderModal onClose={() => { setShowNew(false); setModalOrder(null); }} />}
      {showTeabreak && <TeabreakOrderModal onClose={() => setShowTeabreak(false)} />}
    </div>
  );
}

Object.assign(window, { OrdersScreen });
