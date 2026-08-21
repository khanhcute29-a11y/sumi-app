import React, { useEffect, useMemo, useState } from 'react';
import { Badge } from '../feedback/Badge';
import { Button } from '../forms/Button';
import {
  fetchFinishedGoodsStock, fetchFinishedGoodsStockInLog, fetchFinishedGoodsStockOutLog, fetchProducts,
} from '../../lib/queries';
import { useAuth } from '../../lib/AuthContext';
import { hasAnyRole } from '../../lib/roles';
import AdjustStockForm from './AdjustStockForm';

const BRANCHES = [
  { value: 'bakery', label: 'Kho Bakery' },
  { value: 'xuong41', label: 'Kho Xưởng Macaron' },
  { value: 'xuong42', label: 'Kho Xưởng 42' },
];
const branchLabel = (v) => BRANCHES.find((b) => b.value === v)?.label || v;
const BRANCH_ROLE_MAP = { kho_bakery: 'bakery', kho_xuong41: 'xuong41', kho_xuong42: 'xuong42' };
const FULL_ACCESS_ROLES = ['owner', 'admin', 'warehouse'];

function HistorySection({ products, effectiveBranch, onClose }) {
  const [entries, setEntries] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([fetchFinishedGoodsStockInLog(200), fetchFinishedGoodsStockOutLog(200)])
      .then(([inLog, outLog]) => {
        const merged = [
          ...inLog.map((l) => ({ ...l, kind: 'in' })),
          ...outLog.map((l) => ({ ...l, kind: 'out' })),
        ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        setEntries(merged);
      })
      .catch((err) => setError(err.message));
  }, []);

  const filtered = entries?.filter((e) => effectiveBranch === 'all' || e.branch === effectiveBranch) || [];

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
            <div key={`${e.kind}-${e.id}`} style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--border-subtle)' }}>
              <div style={{ minWidth: 0, flex: '1 1 200px' }}>
                <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-primary)' }}>
                  <Badge tone={e.kind === 'in' ? 'success' : 'warning'}>{e.kind === 'in' ? 'Nhập' : 'Xuất'}</Badge> {e.product_name}{e.size ? ` · ${e.size}` : ''} — {e.qty}
                </div>
                <div style={{ font: 'var(--text-caption)', color: 'var(--text-muted)' }}>
                  {branchLabel(e.branch)}{e.kind === 'in' && e.source === 'adjustment' ? ' · Điều chỉnh tay' : ''}{e.kind === 'out' && e.order_code ? ` · Đơn: ${e.order_code}` : ''}{e.staff_name ? ` · ${e.staff_name}` : ''}{e.note ? ` · ${e.note}` : ''}
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

export default function FinishedGoodsPanel() {
  const { profile } = useAuth();
  const hasFullAccess = hasAnyRole(profile, FULL_ACCESS_ROLES);
  const myBranches = hasFullAccess ? [] : [...new Set([profile?.role, ...(profile?.extra_roles || [])].map((r) => BRANCH_ROLE_MAP[r]).filter(Boolean))];
  const lockedBranch = !hasFullAccess && myBranches.length === 1 ? myBranches[0] : null;
  const [viewBranch, setViewBranch] = useState(lockedBranch || 'all');
  const effectiveBranch = lockedBranch || viewBranch;

  const [stock, setStock] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const [showAdjust, setShowAdjust] = useState(false);

  const load = () => {
    setLoading(true);
    Promise.all([fetchFinishedGoodsStock(), fetchProducts()])
      .then(([stockData, productsData]) => { setStock(stockData); setProducts(productsData); setError(''); })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const productName = (id) => products.find((p) => p.id === id)?.name || 'Sản phẩm đã xoá';

  const allItems = effectiveBranch === 'all' ? stock : stock.filter((s) => s.branch === effectiveBranch);
  const negativeCount = allItems.filter((s) => Number(s.qty) < 0).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {!lockedBranch && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <label style={{ font: 'var(--text-label)', color: 'var(--text-secondary)' }}>Chọn kho:</label>
          <select
            value={effectiveBranch}
            onChange={(e) => setViewBranch(e.target.value)}
            style={{
              padding: '10px 14px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)',
              background: 'var(--surface-card)', color: 'var(--text-primary)', font: 'var(--text-body)', cursor: 'pointer', minWidth: 220,
            }}
          >
            {hasFullAccess && <option value="all">Tất cả ({stock.length})</option>}
            {BRANCHES.filter((b) => hasFullAccess || myBranches.includes(b.value)).map((b) => (
              <option key={b.value} value={b.value}>{b.label} ({stock.filter((s) => s.branch === b.value).length})</option>
            ))}
          </select>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: 12 }}>
        <div style={{ background: 'var(--surface-sunken)', borderRadius: 'var(--radius-md)', padding: 16 }}>
          <div style={{ font: 'var(--text-caption)', color: 'var(--text-muted)' }}>Tổng dòng tồn kho</div>
          <div style={{ font: 'var(--text-title)', color: 'var(--text-primary)' }}>{allItems.length}</div>
        </div>
        <div style={{ background: 'var(--surface-sunken)', borderRadius: 'var(--radius-md)', padding: 16 }}>
          <div style={{ font: 'var(--text-caption)', color: 'var(--text-muted)' }}>Sản phẩm âm kho</div>
          <div style={{ font: 'var(--text-title)', color: negativeCount ? 'var(--status-danger)' : 'var(--text-primary)' }}>{negativeCount}</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <Button variant="ghost" size="sm" onClick={() => setShowHistory((v) => !v)}>
          {showHistory ? 'Ẩn lịch sử Nhập/Xuất' : 'Xem lịch sử Nhập/Xuất'}
        </Button>
        {hasAnyRole(profile, ['owner', 'admin']) && (
          <Button variant="secondary" size="sm" onClick={() => setShowAdjust((v) => !v)}>
            {showAdjust ? 'Đóng điều chỉnh' : 'Điều chỉnh tồn kho'}
          </Button>
        )}
      </div>

      {showHistory && <HistorySection products={products} effectiveBranch={effectiveBranch} onClose={() => setShowHistory(false)} />}
      {showAdjust && (
        <AdjustStockForm products={products} defaultBranch={effectiveBranch === 'all' ? 'bakery' : effectiveBranch}
          staffName={profile?.full_name} onSaved={load} onClose={() => setShowAdjust(false)} />
      )}

      {error && <div style={{ font: 'var(--text-body-sm)', color: 'var(--status-danger)' }}>Lỗi tải kho: {error}</div>}
      {loading ? (
        <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-muted)' }}>Đang tải...</div>
      ) : allItems.length === 0 ? (
        <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-muted)' }}>Chưa có tồn kho thành phẩm nào — sẽ tự động cộng khi bếp ghi sản xuất.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {allItems.map((s) => (
            <div key={s.id} style={{ background: 'var(--surface-card)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-sm)', padding: '14px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ font: '700 17px var(--font-body)', color: 'var(--text-primary)' }}>{productName(s.product_id)}{s.size ? ` · ${s.size}` : ''}</div>
                <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-secondary)' }}>{effectiveBranch === 'all' ? branchLabel(s.branch) : ' '}</div>
              </div>
              <div style={{ font: '700 20px var(--font-body)', color: Number(s.qty) < 0 ? 'var(--status-danger)' : 'var(--text-primary)' }}>{s.qty}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
