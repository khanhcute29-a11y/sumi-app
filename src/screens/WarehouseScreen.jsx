import React, { useEffect, useState } from 'react';
import { FifoTag } from '../components/feedback/FifoTag';
import { Badge } from '../components/feedback/Badge';
import { Button } from '../components/forms/Button';
import { Input } from '../components/forms/Input';
import { Select } from '../components/forms/Select';
import { CameraCapture } from '../components/CameraCapture';
import { IncidentReportModal } from '../components/IncidentReportModal';
import { fetchWarehouseStock, addWarehouseStock, updateWarehouseStock, deductWarehouseStock, uploadPhoto, fetchWarehouseStockInLog, fetchWarehouseStockOutLog } from '../lib/queries';
import { useVoiceInput } from '../lib/useVoiceInput';
import { useAuth } from '../lib/AuthContext';
import { hasAnyRole } from '../lib/roles';
import { enqueue, getQueue } from '../lib/offlineQueue';
import { IconMic, IconCamera, IconWarning, IconAdd, IconDownload } from '../components/icons/FrogIcons';

const UNITS = ['g', 'kg', 'ml', 'lít', 'quả', 'cái', 'gói'];
const BRANCHES = [
  { value: 'bakery', label: 'Kho Bakery' },
  { value: 'xuong41', label: 'Kho Xưởng 41' },
  { value: 'xuong42', label: 'Kho Xưởng 42' },
];
const branchLabel = (v) => BRANCHES.find((b) => b.value === v)?.label || v;

function AddStockForm({ onAdded, onQueued, onClose, defaultBranch, lockedBranch, staffName }) {
  const [name, setName] = useState('');
  const [qty, setQty] = useState('');
  const [unit, setUnit] = useState('kg');
  const [costPerUnit, setCostPerUnit] = useState('');
  const [status, setStatus] = useState('fresh');
  const [expiryDate, setExpiryDate] = useState('');
  const [branch, setBranch] = useState(lockedBranch || defaultBranch || 'bakery');
  const [photoBlob, setPhotoBlob] = useState(null);
  const [showCamera, setShowCamera] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const voice = useVoiceInput();
  const offline = !navigator.onLine;
  const qtyLabel = qty ? `${qty} ${unit}` : '';

  const handleVoice = () => {
    voice.start((transcript) => setName(transcript));
  };

  const queueOffline = () => {
    const payload = { name, qtyLabel, unit, qty: Number(qty) || 0, costPerUnit: Number(costPerUnit) || 0, status, expiryDate, photoUrl: null, branch, staffName };
    const queued = enqueue('addWarehouseStock', payload);
    onQueued({ id: queued.id, name, qty_label: qtyLabel, status, expiry_date: expiryDate || null, branch, pendingSync: true });
  };

  const handleSubmit = async () => {
    if (!name || !qty) { setError('Nhập tên và số lượng nguyên liệu.'); return; }
    setSaving(true);
    setError('');
    if (offline) {
      queueOffline();
      onClose();
      setSaving(false);
      return;
    }
    try {
      let photoUrl = null;
      if (photoBlob) photoUrl = await uploadPhoto(photoBlob, 'warehouse');
      await addWarehouseStock({ name, qtyLabel, unit, qty: Number(qty) || 0, costPerUnit: Number(costPerUnit) || 0, status, expiryDate, photoUrl, branch, staffName });
      onAdded();
      onClose();
    } catch (err) {
      queueOffline();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ background: 'var(--surface-card)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-sm)', padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
      {error && <div style={{ font: 'var(--text-body-sm)', color: 'var(--status-danger)' }}>{error}</div>}
      {offline && <div style={{ font: 'var(--text-caption)', color: 'var(--status-warning)' }}>Đang mất mạng — sẽ lưu tạm và tự đồng bộ khi có mạng lại (ảnh chụp sẽ không đính kèm được lúc offline).</div>}
      {lockedBranch ? (
        <div style={{ font: 'var(--text-caption)', color: 'var(--text-muted)' }}>Thêm vào: <b>{branchLabel(lockedBranch)}</b></div>
      ) : (
        <Select label="Thuộc kho" value={branch} onChange={(e) => setBranch(e.target.value)} options={BRANCHES} />
      )}
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
        <Input label="Tên nguyên liệu" placeholder="VD: Bột mì số 8" value={name} onChange={(e) => setName(e.target.value)} style={{ flex: 1 }} />
        {voice.supported && (
          <Button variant={voice.listening ? 'danger' : 'secondary'} size="sm" icon={<IconMic size={16} />} onClick={handleVoice}>
            {voice.listening ? 'Đang nghe...' : 'Nói'}
          </Button>
        )}
      </div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <Input label="Số lượng nhập" type="number" placeholder="VD: 40" value={qty} onChange={(e) => setQty(e.target.value)} style={{ flex: '1 1 100px' }} />
        <Select label="Đơn vị" value={unit} onChange={(e) => setUnit(e.target.value)} options={UNITS.map((u) => ({ value: u, label: u }))} style={{ flex: '1 1 100px' }} />
        <Input label="Hạn dùng" type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} style={{ flex: '1 1 150px' }} />
      </div>
      <Input label={`Giá nhập / ${unit}`} type="number" placeholder="VD: 25000" value={costPerUnit} onChange={(e) => setCostPerUnit(e.target.value)}
        helpText="Dùng để tính giá vốn sản phẩm ở màn Sản Phẩm." />
      <Select label="Tình trạng" value={status} onChange={(e) => setStatus(e.target.value)}
        options={[{ value: 'fresh', label: 'Còn hạn' }, { value: 'soon', label: 'Sắp hết hạn' }, { value: 'expired', label: 'Quá hạn' }]} />
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <Button variant="secondary" size="sm" icon={<IconCamera size={16} />} disabled={offline} onClick={() => setShowCamera(true)}>{photoBlob ? 'Chụp lại ảnh tem/bill' : 'Chụp ảnh tem/bill'}</Button>
        {photoBlob && <img src={URL.createObjectURL(photoBlob)} alt="preview" style={{ width: 40, height: 40, borderRadius: 'var(--radius-sm)', objectFit: 'cover' }} />}
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <Button variant="secondary" size="sm" onClick={onClose} disabled={saving}>Hủy</Button>
        <Button variant="primary" size="sm" onClick={handleSubmit} disabled={saving}>{saving ? 'Đang lưu...' : 'Lưu'}</Button>
      </div>
      {showCamera && <CameraCapture onClose={() => setShowCamera(false)} onCapture={(blob) => { setPhotoBlob(blob); setShowCamera(false); }} />}
    </div>
  );
}

function StockOutForm({ stock, staffName, onDone, onClose }) {
  const [search, setSearch] = useState('');
  const filteredStock = search.trim() ? stock.filter((s) => s.name.toLowerCase().includes(search.trim().toLowerCase())) : stock;
  const [stockId, setStockId] = useState(stock[0]?.id || '');
  const [qty, setQty] = useState('');
  const [orderCode, setOrderCode] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const voice = useVoiceInput();
  const item = stock.find((s) => s.id === stockId);

  useEffect(() => {
    if (!filteredStock.some((s) => s.id === stockId)) setStockId(filteredStock[0]?.id || '');
  }, [search]);

  const handleSubmit = async () => {
    const qtyNum = Number(qty);
    if (!item || !qtyNum || qtyNum <= 0) { setError('Chọn nguyên liệu và nhập số lượng xuất hợp lệ.'); return; }
    if (qtyNum > Number(item.qty)) { setError(`Kho chỉ còn ${item.qty_label}, không đủ để xuất.`); return; }
    setSaving(true);
    setError('');
    try {
      await deductWarehouseStock({
        stockId: item.id, name: item.name, qty: qtyNum, unit: item.unit,
        remainingQty: Number(item.qty) - qtyNum, orderCode, note, staffName,
      });
      onDone();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ background: 'var(--surface-card)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-sm)', padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
      {error && <div style={{ font: 'var(--text-body-sm)', color: 'var(--status-danger)' }}>{error}</div>}
      {stock.length === 0 ? (
        <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-muted)' }}>Kho chưa có nguyên liệu nào để xuất.</div>
      ) : (
        <React.Fragment>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
            <Input label="Tìm nguyên liệu" placeholder="Gõ hoặc nói tên nguyên liệu..." value={search} onChange={(e) => setSearch(e.target.value)} style={{ flex: 1 }} />
            {voice.supported && (
              <Button variant={voice.listening ? 'danger' : 'secondary'} size="sm" icon={<IconMic size={16} />} onClick={() => voice.start((t) => setSearch(t))}>
                {voice.listening ? 'Đang nghe...' : 'Nói'}
              </Button>
            )}
          </div>
          <Select label="Nguyên liệu" value={stockId} onChange={(e) => setStockId(e.target.value)}
            options={filteredStock.map((s) => ({ value: s.id, label: `${s.name} (còn ${s.qty_label})` }))} />
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <Input label={`Số lượng xuất (${item?.unit || ''})`} type="number" placeholder="VD: 2" value={qty} onChange={(e) => setQty(e.target.value)} style={{ flex: '1 1 140px' }} />
            <Input label="Mã đơn hàng (nếu có)" placeholder="VD: DH-0231" value={orderCode} onChange={(e) => setOrderCode(e.target.value)} style={{ flex: '1 1 160px' }} />
          </div>
          <Input label="Ghi chú (nếu có)" placeholder="VD: Làm bánh kem sinh nhật" value={note} onChange={(e) => setNote(e.target.value)} />
        </React.Fragment>
      )}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <Button variant="secondary" size="sm" onClick={onClose} disabled={saving}>Hủy</Button>
        <Button variant="primary" size="sm" onClick={handleSubmit} disabled={saving || stock.length === 0}>{saving ? 'Đang lưu...' : 'Xác nhận xuất kho'}</Button>
      </div>
    </div>
  );
}

function EditCostForm({ item, onSaved, onClose }) {
  const [qty, setQty] = useState(String(item.qty ?? ''));
  const [unit, setUnit] = useState(item.unit || 'kg');
  const [costPerUnit, setCostPerUnit] = useState(String(item.cost_per_unit ?? ''));
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateWarehouseStock(item.id, {
        qty: Number(qty) || 0, unit, cost_per_unit: Number(costPerUnit) || 0,
        qty_label: `${qty} ${unit}`,
      });
      onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap', padding: '10px 0' }}>
      <Input label="Tồn kho" type="number" value={qty} onChange={(e) => setQty(e.target.value)} style={{ flex: '1 1 100px' }} />
      <Select label="Đơn vị" value={unit} onChange={(e) => setUnit(e.target.value)} options={UNITS.map((u) => ({ value: u, label: u }))} style={{ flex: '1 1 100px' }} />
      <Input label={`Giá / ${unit}`} type="number" value={costPerUnit} onChange={(e) => setCostPerUnit(e.target.value)} style={{ flex: '1 1 120px' }} />
      <Button variant="secondary" size="sm" onClick={onClose} disabled={saving}>Hủy</Button>
      <Button variant="primary" size="sm" onClick={handleSave} disabled={saving}>{saving ? '...' : 'Lưu'}</Button>
    </div>
  );
}

function HistorySection({ stock, effectiveBranch, onClose }) {
  const [entries, setEntries] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([fetchWarehouseStockInLog(200), fetchWarehouseStockOutLog(200)])
      .then(([inLog, outLog]) => {
        const merged = [
          ...inLog.map((l) => ({ ...l, kind: 'in' })),
          ...outLog.map((l) => ({ ...l, kind: 'out' })),
        ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        setEntries(merged);
      })
      .catch((err) => setError(err.message));
  }, []);

  const branchOf = (stockId) => stock.find((s) => s.id === stockId)?.branch || null;
  const filtered = entries?.filter((e) => effectiveBranch === 'all' || branchOf(e.stock_id) === effectiveBranch || branchOf(e.stock_id) == null) || [];

  return (
    <div style={{ background: 'var(--surface-card)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-sm)', padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ font: 'var(--text-label)', color: 'var(--text-primary)' }}>Lịch sử Nhập/Xuất</div>
        <Button variant="ghost" size="sm" onClick={onClose}>Đóng</Button>
      </div>
      {error && <div style={{ font: 'var(--text-body-sm)', color: 'var(--status-danger)' }}>{error}</div>}
      {entries === null ? (
        <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-muted)' }}>Đang tải...</div>
      ) : filtered.length === 0 ? (
        <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-muted)' }}>Chưa có lịch sử nhập/xuất nào.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 420, overflowY: 'auto' }}>
          {filtered.map((e) => (
            <div key={`${e.kind}-${e.id}`} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--border-subtle)' }}>
              <div>
                <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-primary)' }}>
                  <Badge tone={e.kind === 'in' ? 'success' : 'warning'}>{e.kind === 'in' ? 'Nhập' : 'Xuất'}</Badge> {e.name} — {e.qty} {e.unit}
                </div>
                <div style={{ font: 'var(--text-caption)', color: 'var(--text-muted)' }}>
                  {e.staff_name || 'Không rõ'}{e.kind === 'out' && e.order_code ? ` · Đơn: ${e.order_code}` : ''}{e.note ? ` · ${e.note}` : ''}
                </div>
              </div>
              <div style={{ font: 'var(--text-caption)', color: 'var(--text-muted)', flexShrink: 0, textAlign: 'right' }}>
                {new Date(e.created_at).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const BRANCH_ROLE_MAP = { kho_bakery: 'bakery', kho_xuong41: 'xuong41', kho_xuong42: 'xuong42' };
const WAREHOUSE_FULL_ACCESS_ROLES = ['owner', 'admin', 'warehouse'];

export default function WarehouseScreen({ branch: viewBranch = 'all', onBranchChange }) {
  const { profile } = useAuth();
  const hasFullAccess = hasAnyRole(profile, WAREHOUSE_FULL_ACCESS_ROLES);
  const myBranches = hasFullAccess ? [] : [...new Set([profile?.role, ...(profile?.extra_roles || [])].map((r) => BRANCH_ROLE_MAP[r]).filter(Boolean))];
  const lockedBranch = !hasFullAccess && myBranches.length === 1 ? myBranches[0] : null;
  const effectiveBranch = lockedBranch || (myBranches.length > 1 && !myBranches.includes(viewBranch) ? myBranches[0] : viewBranch);
  const [stock, setStock] = useState([]);
  const [pendingItems, setPendingItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [showStockOut, setShowStockOut] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [showIncident, setShowIncident] = useState(false);

  const load = () => {
    setLoading(true);
    fetchWarehouseStock()
      .then((data) => { setStock(data); setError(''); })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    const onQueueChange = () => {
      const queue = getQueue();
      setPendingItems((prev) => prev.filter((p) => queue.some((q) => q.id === p.id)));
      load();
    };
    window.addEventListener('sumi-queue-changed', onQueueChange);
    return () => window.removeEventListener('sumi-queue-changed', onQueueChange);
  }, []);

  const statusRank = { expired: 0, soon: 1, fresh: 2 };
  const combined = [...pendingItems, ...stock].sort((a, b) => (statusRank[a.status] ?? 2) - (statusRank[b.status] ?? 2));
  const allItems = effectiveBranch === 'all' ? combined : combined.filter((s) => (s.branch || 'bakery') === effectiveBranch);
  const expiredCount = allItems.filter((s) => s.status === 'expired').length;
  const soonCount = allItems.filter((s) => s.status === 'soon').length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <div style={{ font: 'var(--text-display-md)', color: 'var(--text-primary)' }}>Kho Hàng — Bà Tám{effectiveBranch !== 'all' ? ` · ${branchLabel(effectiveBranch)}` : ''}</div>
        <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-muted)' }}>Layout siêu to, dành cho thao tác nhanh tại kho</div>
      </div>
      {!lockedBranch && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <label style={{ font: 'var(--text-label)', color: 'var(--text-secondary)' }}>Chọn kho:</label>
          <select
            value={effectiveBranch}
            onChange={(e) => onBranchChange && onBranchChange(e.target.value)}
            style={{
              padding: '10px 14px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)',
              background: 'var(--surface-card)', color: 'var(--text-primary)', font: 'var(--text-body)', cursor: 'pointer', minWidth: 200,
            }}
          >
            {hasFullAccess && <option value="all">Tất cả ({combined.length})</option>}
            {BRANCHES.filter((b) => hasFullAccess || myBranches.includes(b.value)).map((b) => (
              <option key={b.value} value={b.value}>{b.label} ({combined.filter((s) => (s.branch || 'bakery') === b.value).length})</option>
            ))}
          </select>
        </div>
      )}
      {(expiredCount > 0 || soonCount > 0) && (
        <div style={{
          display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center',
          background: 'var(--status-danger-soft)', border: '1px solid var(--status-danger)',
          borderRadius: 'var(--radius-md)', padding: '14px 18px',
        }}>
          <span style={{ font: '700 17px var(--font-body)', color: 'var(--status-danger)', display: 'inline-flex', alignItems: 'center', gap: 6 }}><IconWarning size={18} /> Cảnh báo tồn kho:</span>
          {expiredCount > 0 && <Badge tone="danger">{expiredCount} nguyên liệu đã quá hạn</Badge>}
          {soonCount > 0 && <Badge tone="warning">{soonCount} nguyên liệu sắp hết hạn</Badge>}
        </div>
      )}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <Button variant="primary" size="lg" icon={<IconAdd size={18} />} style={{ flex: 1, minWidth: 220, padding: '24px', font: '700 18px var(--font-body)' }} onClick={() => { setShowForm((v) => !v); setShowStockOut(false); }}>
          {showForm ? 'Đóng form nhập kho' : 'Thêm nguyên liệu vào kho'}
        </Button>
        <Button variant="secondary" size="lg" icon={<IconDownload size={18} />} style={{ flex: 1, minWidth: 220, padding: '24px', font: '700 18px var(--font-body)' }} onClick={() => { setShowStockOut((v) => !v); setShowForm(false); }}>
          {showStockOut ? 'Đóng form xuất kho' : 'Xuất kho theo đơn hàng'}
        </Button>
        <Button variant="danger" size="lg" icon={<IconWarning size={18} />} style={{ flex: 1, minWidth: 220, padding: '24px', font: '700 18px var(--font-body)' }} onClick={() => setShowIncident(true)}>
          Báo sự cố kho
        </Button>
      </div>
      <Button variant="ghost" size="sm" onClick={() => setShowHistory((v) => !v)} style={{ alignSelf: 'flex-start' }}>
        {showHistory ? 'Ẩn lịch sử Nhập/Xuất' : 'Xem lịch sử Nhập/Xuất'}
      </Button>
      {showHistory && <HistorySection stock={stock} effectiveBranch={effectiveBranch} onClose={() => setShowHistory(false)} />}
      {showForm && (
        <AddStockForm onAdded={load} onQueued={(item) => setPendingItems((prev) => [item, ...prev])} onClose={() => setShowForm(false)}
          defaultBranch={effectiveBranch === 'all' ? 'bakery' : effectiveBranch} lockedBranch={lockedBranch} staffName={profile?.full_name} />
      )}
      {showStockOut && (
        <StockOutForm stock={effectiveBranch === 'all' ? stock : stock.filter((s) => (s.branch || 'bakery') === effectiveBranch)}
          staffName={profile?.full_name} onDone={load} onClose={() => setShowStockOut(false)} />
      )}
      {showIncident && <IncidentReportModal onClose={() => setShowIncident(false)} onSent={() => setShowIncident(false)} />}
      {error && <div style={{ font: 'var(--text-body-sm)', color: 'var(--status-danger)' }}>Lỗi tải kho: {error}</div>}
      {loading ? (
        <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-muted)' }}>Đang tải...</div>
      ) : allItems.length === 0 ? (
        <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-muted)' }}>Kho chưa có nguyên liệu nào — bấm "Thêm nguyên liệu vào kho" để bắt đầu.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {allItems.map((s) => (
            <div key={s.id} style={{ background: 'var(--surface-card)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-sm)', padding: '14px 18px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  {s.photo_url && <img src={s.photo_url} alt="" style={{ width: 44, height: 44, borderRadius: 'var(--radius-sm)', objectFit: 'cover' }} />}
                  <div>
                    <div style={{ font: '700 17px var(--font-body)', color: 'var(--text-primary)' }}>{s.name}</div>
                    <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-secondary)' }}>
                      Tồn: {s.qty_label}{s.cost_per_unit ? ` · ${Number(s.cost_per_unit).toLocaleString('vi-VN')}đ/${s.unit}` : ''}
                      {effectiveBranch === 'all' && ` · ${branchLabel(s.branch || 'bakery')}`}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {s.pendingSync ? <Badge tone="neutral">Chưa đồng bộ</Badge> : <FifoTag status={s.status} date={s.expiry_date ? new Date(s.expiry_date).toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }) : undefined} />}
                  {!s.pendingSync && (
                    <Button variant="ghost" size="sm" onClick={() => setEditingId(editingId === s.id ? null : s.id)}>{editingId === s.id ? 'Đóng' : 'Sửa'}</Button>
                  )}
                </div>
              </div>
              {editingId === s.id && <EditCostForm item={s} onSaved={load} onClose={() => setEditingId(null)} />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
