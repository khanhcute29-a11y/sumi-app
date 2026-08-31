import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { fetchFinishedGoodsStock, fetchProducts, addFinishedGoodsEntryV2, uploadFile, fetchFinishedGoodsStockInLog, fetchFinishedGoodsStockOutLog, createProduct, completeSemiFinishedToFinished } from '../../lib/queries';
import { useAuth } from '../../lib/AuthContext';
import { VoiceMicButton } from '../VoiceMicButton';
import { parseVoiceByContext } from '../../lib/parseVoiceContext';
import DonSanXuatTab from './DonSanXuatTab';

// Kho Thành Phẩm V2 — theo mockup đã duyệt
// docs/mockups/SUMI-finished-goods-inventory-v2-handoff/finished-goods-inventory-v2-approved.html
//
// PHẠM VI BẢN NÀY (V1 thật, không phải mockup tĩnh) — ghi rõ để đối chiếu:
//   ĐÃ LÀM: tồn kho realtime theo luồng Bakery/Macaron 41/Kho mù, theo cửa
//     hàng Vĩnh Phú 42/Quốc Lộ 13, thẻ sản phẩm có ảnh/hạn dùng/đếm ngược màu
//     theo mức cảnh báo, sheet "Nhập kho thành phẩm" ghi thật lên Supabase.
//   CHƯA LÀM (đợt sau nếu cần): "Oder bếp" (gửi yêu cầu sản xuất cho bếp),
//     "Kiểm kho / chỉnh số thực tế" (đã có sẵn AdjustStockForm.jsx ở màn Kho
//     Hàng cũ — chưa nối vào đây), bảng màu Macaron dạng swatch trực quan,
//     panel Kho mù liên kết trực tiếp từng đơn hàng cụ thể.
//   ĐƠN GIẢN HOÁ CÓ CHỦ Ý: mockup tách "Bakery nóng"/"Bakery lạnh" thành 2
//     tab riêng — dữ liệu hiện tại (`branch` = bakery/xuong41/xuong42) không
//     có cột nào phân biệt nóng/lạnh, nên gộp chung 1 tab "Bakery" thay vì tự
//     bịa ra một cách phân loại không có thật.

const FLOWS = [
  { key: 'bakery', label: '🍞 Bakery', hasBranchTabs: true },
  { key: 'xuong41', label: '🌈 Macaron 41', hasBranchTabs: true },
  { key: 'xuong42', label: '🚚 Kho mù (Xưởng 42)', hasBranchTabs: false },
];
const STORES = ['Vĩnh Phú 42', 'Quốc Lộ 13'];
// Bánh trang trí Macaron vừa ra khỏi Xưởng 41 chưa chắc đã gán ngay cho 1 cửa
// hàng bán lẻ cụ thể — cần chỗ đứng riêng là "Kho Xưởng 41" trước khi chuyển
// tiếp. Chỉ luồng xuong41 có thêm lựa chọn này, Bakery vẫn chỉ 2 cửa hàng cũ.
const XUONG41_WAREHOUSE = 'Kho Xưởng 41';
const storesForBranch = (branch) => (branch === 'xuong41' ? [XUONG41_WAREHOUSE, ...STORES] : STORES);

// Kho Bán Thành Phẩm (generic, finished_goods_stock.is_semi_finished) — trước
// tiên áp dụng cho vỏ Macaron Hạnh Nhân (Xưởng 41) chờ Bếp Lạnh bơm nhân,
// nhưng KHÔNG hardcode riêng macaron: bất kỳ luồng nào (bakery/xuong41/xuong42)
// đều có thể có tồn bán thành phẩm, chỉ cần lọc theo cờ này.
const STAGE_TABS = [
  { key: 'finished', label: 'Thành phẩm' },
  { key: 'semi', label: 'Bán thành phẩm' },
];

function countdown(expiryDate) {
  if (!expiryDate) return null;
  const ms = new Date(expiryDate).getTime() - Date.now();
  if (ms <= 0) return { tone: 'danger', text: '🚫 Đã hết hạn' };
  const hours = ms / 3600000;
  const days = Math.floor(hours / 24);
  const remH = Math.floor(hours % 24);
  const text = days > 0 ? `Còn ${days} ngày ${remH} giờ` : `Còn ${remH} giờ`;
  if (hours <= 24) return { tone: 'danger', text: `🚫 ${text}` };
  if (hours <= 48) return { tone: 'warn', text: `⚠️ ${text}` };
  return { tone: 'ok', text: `✅ ${text}` };
}

const toneStyle = {
  ok: { background: '#e8f8ef', color: '#078653' },
  warn: { background: '#fff4cf', color: '#8b5900' },
  danger: { background: '#fff0ee', color: '#d94a40' },
};

// Cho phép gõ tự do — không bắt buộc phải chọn đúng 1 dòng có sẵn trong
// danh mục sản phẩm. Nếu tên gõ chưa khớp sản phẩm nào, hiện gợi ý
// "+ Thêm sản phẩm mới" để tạo luôn vào danh mục (products), lần sau sẽ
// hiện sẵn trong danh sách. Giá trị cuối cùng luôn được chốt qua
// resolveProduct() ở NhapKhoSheet lúc bấm Lưu, kể cả khi không bấm gợi ý nào.
function ProductPicker({ products, query, onQueryChange, onSelectExisting, onAddNew, creating }) {
  const [focused, setFocused] = useState(false);
  const trimmed = query.trim();
  const filtered = trimmed ? products.filter((p) => p.name.toLowerCase().includes(trimmed.toLowerCase())) : products;
  const exactMatch = products.find((p) => p.name.trim().toLowerCase() === trimmed.toLowerCase());
  const showList = focused && (trimmed.length > 0 || products.length > 0);
  return (
    <div style={{ position: 'relative' }}>
      <input
        placeholder="Gõ tên sản phẩm — có thể nhập tự do nếu chưa có trong danh mục..."
        value={query}
        onFocus={() => setFocused(true)}
        onBlur={() => setTimeout(() => setFocused(false), 150)}
        onChange={(e) => onQueryChange(e.target.value)}
        style={{ width: '100%', minHeight: 48, padding: '0 12px', borderRadius: 14, border: '1px solid #e2cdb6', boxSizing: 'border-box' }}
      />
      {showList && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 5, background: '#fff', border: '1px solid #e2cdb6', borderRadius: 12, maxHeight: 220, overflowY: 'auto' }}>
          {filtered.slice(0, 30).map((p) => (
            <button type="button" key={p.id} onClick={() => onSelectExisting(p)}
              style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 12px', border: 0, background: 'none', cursor: 'pointer' }}>
              {p.name}
            </button>
          ))}
          {trimmed && !exactMatch && (
            <button type="button" disabled={creating} onClick={() => onAddNew(trimmed)}
              style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 12px', border: 0, borderTop: filtered.length ? '1px dashed #e2cdb6' : 'none', background: '#fff7ec', color: '#b7431e', fontWeight: 800, cursor: creating ? 'not-allowed' : 'pointer' }}>
              {creating ? 'Đang thêm...' : `➕ Thêm sản phẩm mới: "${trimmed}"`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function NhapKhoSheet({ defaultBranch, defaultStore, products: productsProp, staffName, onClose, onSaved }) {
  // Bản sao cục bộ của danh mục sản phẩm — cập nhật ngay khi tự thêm sản phẩm
  // mới trong lúc mở sheet này, không cần đợi load lại từ server mới thấy.
  const [products, setProducts] = useState(productsProp);
  const [productId, setProductId] = useState('');
  const [productQuery, setProductQuery] = useState('');
  const [creatingProduct, setCreatingProduct] = useState(false);
  const [size, setSize] = useState('');
  const [qty, setQty] = useState('');
  const [branch, setBranch] = useState(defaultBranch);
  const [storeLocation, setStoreLocation] = useState(defaultStore || storesForBranch(defaultBranch)[0]);
  const storeOptions = storesForBranch(branch);
  const [productionDate, setProductionDate] = useState(() => new Date().toISOString().slice(0, 16));
  const [expiryDate, setExpiryDate] = useState('');
  const [color, setColor] = useState('');
  const [packing, setPacking] = useState('');
  const [photo, setPhoto] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const selectExistingProduct = (p) => { setProductId(p.id); setProductQuery(p.name); };

  const addNewProduct = async (name) => {
    setCreatingProduct(true); setError('');
    try {
      const created = await createProduct({ name, category: 'khac', unit: 'cái', price: 0 });
      setProducts((prev) => [...prev, created]);
      selectExistingProduct(created);
    } catch (e) {
      setError('Không thêm được sản phẩm mới: ' + (e.message || ''));
    } finally {
      setCreatingProduct(false);
    }
  };

  // Chốt sản phẩm cuối cùng lúc bấm Lưu — kể cả khi nhân viên gõ tên rồi bấm
  // Lưu thẳng, không bấm chọn/thêm gì trong gợi ý cả (đúng ý "cho nhập tay").
  const resolveProduct = async () => {
    if (productId) return products.find((p) => p.id === productId) || null;
    const q = productQuery.trim();
    if (!q) return null;
    const exact = products.find((p) => p.name.trim().toLowerCase() === q.toLowerCase());
    if (exact) { setProductId(exact.id); return exact; }
    const created = await createProduct({ name: q, category: 'khac', unit: 'cái', price: 0 });
    setProducts((prev) => [...prev, created]);
    setProductId(created.id);
    return created;
  };

  const save = async () => {
    let selectedProduct;
    try {
      selectedProduct = await resolveProduct();
    } catch (e) {
      setError('Không tạo được sản phẩm mới: ' + (e.message || ''));
      return;
    }
    if (!selectedProduct) { setError('Nhập hoặc chọn tên sản phẩm.'); return; }
    const qtyNum = Number(qty);
    if (!qtyNum || qtyNum <= 0) { setError('Nhập số lượng hợp lệ.'); return; }
    if (!photo) { setError('Bắt buộc chụp ảnh thực tế.'); return; }
    setSaving(true); setError('');
    try {
      const uploaded = await uploadFile(photo, `finished-goods-v2/${branch}`);
      await addFinishedGoodsEntryV2({
        productId: selectedProduct.id, productName: selectedProduct.name, size: size || null, branch, storeLocation,
        qty: qtyNum, productionDate: productionDate ? new Date(productionDate).toISOString() : null,
        expiryDate: expiryDate ? new Date(expiryDate).toISOString() : null,
        photoUrl: uploaded.url, color: color || null, packing: packing || null, staffName,
      });
      onSaved?.();
      onClose();
    } catch (e) { setError(e.message || 'Không lưu được.'); } finally { setSaving(false); }
  };

  const field = { width: '100%', minHeight: 48, padding: '0 12px', borderRadius: 14, border: '1px solid #e2cdb6', boxSizing: 'border-box' };

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(45,27,16,.55)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 480, maxHeight: '90dvh', overflowY: 'auto', background: '#fffaf2', borderRadius: '24px 24px 0 0', padding: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 900, color: '#2d1b10' }}>Nhập kho thành phẩm</h2>
          <button onClick={onClose} style={{ width: 40, height: 40, border: '1px solid #e2cdb6', borderRadius: 12, background: '#fff', fontSize: 18 }}>✕</button>
        </div>
        <div style={{ display: 'grid', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <VoiceMicButton onTranscript={(t) => {
              const { qty: parsedQty, product, size: parsedSize } = parseVoiceByContext('warehouse', t);
              if (parsedQty) setQty(String(parsedQty));
              if (product) { setProductQuery(product); setProductId(''); }
              if (parsedSize) setSize(parsedSize);
            }} />
            <span style={{ fontSize: 12, color: '#806a58' }}>Nói VD: "Nhập 50 bánh su kem size 18cm"</span>
          </div>
          <div>
            <label style={{ display: 'block', fontWeight: 900, marginBottom: 6 }}>Sản phẩm</label>
            <ProductPicker
              products={products}
              query={productQuery}
              onQueryChange={(v) => { setProductQuery(v); setProductId(''); }}
              onSelectExisting={selectExistingProduct}
              onAddNew={addNewProduct}
              creating={creatingProduct}
            />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div><label style={{ display: 'block', fontWeight: 900, marginBottom: 6 }}>Kích thước / size</label><input style={field} value={size} onChange={(e) => setSize(e.target.value)} placeholder="VD: 18cm, 220g..." /></div>
            <div><label style={{ display: 'block', fontWeight: 900, marginBottom: 6 }}>Số lượng</label><input style={field} type="number" min="1" value={qty} onChange={(e) => setQty(e.target.value)} /></div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div><label style={{ display: 'block', fontWeight: 900, marginBottom: 6 }}>Luồng</label>
              <select style={field} value={branch} onChange={(e) => { const b = e.target.value; setBranch(b); setStoreLocation(storesForBranch(b)[0]); }}>
                {FLOWS.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
              </select>
            </div>
            <div><label style={{ display: 'block', fontWeight: 900, marginBottom: 6 }}>{branch === 'xuong41' ? 'Kho / Cửa hàng' : 'Cửa hàng'}</label>
              <select style={field} value={storeLocation} onChange={(e) => setStoreLocation(e.target.value)}>
                {storeOptions.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div><label style={{ display: 'block', fontWeight: 900, marginBottom: 6 }}>Ngày sản xuất</label><input style={field} type="datetime-local" value={productionDate} onChange={(e) => setProductionDate(e.target.value)} /></div>
            <div><label style={{ display: 'block', fontWeight: 900, marginBottom: 6 }}>Hạn dùng</label><input style={field} type="datetime-local" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} /></div>
          </div>
          {branch === 'xuong41' && (
            <div><label style={{ display: 'block', fontWeight: 900, marginBottom: 6 }}>Màu (nếu là Macaron trang trí)</label><input style={field} value={color} onChange={(e) => setColor(e.target.value)} placeholder="VD: 12 màu mix, Màu cam..." /></div>
          )}
          <div><label style={{ display: 'block', fontWeight: 900, marginBottom: 6 }}>Quy cách</label><input style={field} value={packing} onChange={(e) => setPacking(e.target.value)} placeholder="VD: 6 khay/thùng, hộp lẻ..." /></div>
          <div>
            <label style={{ display: 'block', fontWeight: 900, marginBottom: 6 }}>Ảnh thực tế (bắt buộc)</label>
            <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 52, border: '2px dashed #e2cdb6', borderRadius: 14, cursor: 'pointer' }}>
              {photo ? `📷 ${photo.name}` : '📷 Chụp / chọn ảnh'}
              <input hidden type="file" accept="image/*" capture="environment" onChange={(e) => setPhoto(e.target.files?.[0] || null)} />
            </label>
          </div>
          {error && <div style={{ color: '#d94a40', fontWeight: 700 }}>{error}</div>}
          <button onClick={save} disabled={saving} style={{ minHeight: 58, border: 0, borderRadius: 18, background: '#f05c2b', color: '#fff', fontSize: 17, fontWeight: 950, cursor: saving ? 'not-allowed' : 'pointer' }}>
            {saving ? 'Đang lưu...' : 'Lưu nhập kho'}
          </button>
        </div>
      </div>
    </div>
  );
}

// Kho Bán Thành Phẩm -> Thành Phẩm: bộ phận nhận hàng (vd Bếp Lạnh nhận vỏ
// Macaron) bấm "Đã hoàn thiện", nhập số lượng + ảnh thành phẩm cuối. Ngày SX
// giữ nguyên từ lô bán thành phẩm gốc, chỉ cập nhật HSD nếu cần đổi.
function CompleteSemiFinishedSheet({ row, productName, staffName, onClose, onSaved }) {
  const [qty, setQty] = useState(String(row.qty));
  const [expiryDate, setExpiryDate] = useState(row.expiry_date ? new Date(row.expiry_date).toISOString().slice(0, 16) : '');
  const [photo, setPhoto] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    const qtyNum = Number(qty);
    if (!qtyNum || qtyNum <= 0) { setError('Nhập số lượng hợp lệ.'); return; }
    if (qtyNum > Number(row.qty)) { setError(`Kho bán thành phẩm chỉ còn ${row.qty}.`); return; }
    if (!photo) { setError('Bắt buộc chụp ảnh thành phẩm sau khi hoàn thiện.'); return; }
    setSaving(true); setError('');
    try {
      const uploaded = await uploadFile(photo, `finished-goods-v2/${row.branch}/semi-finished`);
      await completeSemiFinishedToFinished({
        stockId: row.id, productId: row.product_id, productName, size: row.size, branch: row.branch,
        qty: qtyNum, productionDate: row.production_date,
        expiryDate: expiryDate ? new Date(expiryDate).toISOString() : row.expiry_date,
        photoUrl: uploaded.url, staffName,
      });
      onSaved?.();
      onClose();
    } catch (e) { setError(e.message || 'Không lưu được.'); } finally { setSaving(false); }
  };

  const field = { width: '100%', minHeight: 48, padding: '0 12px', borderRadius: 14, border: '1px solid #e2cdb6', boxSizing: 'border-box' };

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(45,27,16,.55)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 480, maxHeight: '90dvh', overflowY: 'auto', background: '#fffaf2', borderRadius: '24px 24px 0 0', padding: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 900, color: '#2d1b10' }}>✅ Đã hoàn thiện</h2>
          <button onClick={onClose} style={{ width: 40, height: 40, border: '1px solid #e2cdb6', borderRadius: 12, background: '#fff', fontSize: 18 }}>✕</button>
        </div>
        <div style={{ fontSize: 13, color: '#806a58', marginBottom: 12 }}>{productName}{row.size ? ` · ${row.size}` : ''} — bán thành phẩm còn <b>{row.qty}</b></div>
        <div style={{ display: 'grid', gap: 10 }}>
          <div>
            <label style={{ display: 'block', fontWeight: 900, marginBottom: 6 }}>Số lượng hoàn thiện</label>
            <input style={field} type="number" min="1" max={row.qty} value={qty} onChange={(e) => setQty(e.target.value)} />
          </div>
          <div>
            <label style={{ display: 'block', fontWeight: 900, marginBottom: 6 }}>Hạn sử dụng (thành phẩm sau khi hoàn thiện)</label>
            <input style={field} type="datetime-local" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} />
          </div>
          <div>
            <label style={{ display: 'block', fontWeight: 900, marginBottom: 6 }}>Ảnh thành phẩm (bắt buộc)</label>
            <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 52, border: '2px dashed #e2cdb6', borderRadius: 14, cursor: 'pointer' }}>
              {photo ? `📷 ${photo.name}` : '📷 Chụp / chọn ảnh'}
              <input hidden type="file" accept="image/*" onChange={(e) => setPhoto(e.target.files?.[0] || null)} />
            </label>
          </div>
          {error && <div style={{ color: '#d94a40', fontWeight: 700 }}>{error}</div>}
          <button onClick={save} disabled={saving} style={{ minHeight: 58, border: 0, borderRadius: 18, background: saving ? '#c4b5fd' : '#7c3aed', color: '#fff', fontSize: 17, fontWeight: 950, cursor: saving ? 'not-allowed' : 'pointer' }}>
            {saving ? 'Đang lưu...' : 'Xác nhận hoàn thiện'}
          </button>
        </div>
      </div>
    </div>
  );
}

// Chi tiết 1 dòng tồn kho — lịch sử nhập/xuất THẬT (từ finished_goods_stock_in_log
// / _out_log). KHÔNG bịa "mã lô", "bếp trưởng chịu trách nhiệm", hay "trạng thái QA"
// — schema hiện tại không có các trường này (xem giới hạn "1 dòng gộp, không
// FIFO nhiều lô" ghi trong migration 202608270080). Người nhập gần nhất lấy từ
// staff_name trong log, đó là dữ liệu thật gần nhất với "ai chịu trách nhiệm".
function ChiTietDongTonKho({ row, productLabel }) {
  const [logs, setLogs] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([fetchFinishedGoodsStockInLog(80), fetchFinishedGoodsStockOutLog(80)])
      .then(([inLog, outLog]) => {
        const merged = [
          ...inLog.filter((l) => l.product_id === row.product_id && (l.size || null) === (row.size || null) && l.branch === row.branch).map((l) => ({ ...l, kind: 'in' })),
          ...outLog.filter((l) => l.product_id === row.product_id && (l.size || null) === (row.size || null) && l.branch === row.branch).map((l) => ({ ...l, kind: 'out' })),
        ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        setLogs(merged);
      })
      .catch((e) => setError(e.message));
  }, [row.product_id, row.size, row.branch]);

  return (
    <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px dashed #e2cdb6' }}>
      <div style={{ fontSize: 12, fontWeight: 900, color: '#9a7f68', textTransform: 'uppercase', marginBottom: 8 }}>
        Lịch sử nhập/xuất — {productLabel}
      </div>
      {error && <div style={{ color: '#d94a40', fontWeight: 700, fontSize: 12 }}>{error}</div>}
      {logs === null ? (
        <div style={{ color: '#806a58', fontSize: 12 }}>Đang tải...</div>
      ) : logs.length === 0 ? (
        <div style={{ color: '#806a58', fontSize: 12 }}>Chưa có lịch sử nhập/xuất cho dòng này.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 260, overflowY: 'auto' }}>
          {logs.map((l) => (
            <div key={`${l.kind}-${l.id}`} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '6px 8px', borderRadius: 10, background: '#fbf5ed' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: l.kind === 'in' ? '#078653' : '#d94a40' }}>
                  {l.kind === 'in' ? '➕ Nhập' : '➖ Xuất'} {l.qty}
                  {l.kind === 'out' && l.order_code ? ` · Đơn ${l.order_code}` : ''}
                </div>
                <div style={{ fontSize: 11, color: '#806a58' }}>
                  {l.staff_name ? `Người nhập: ${l.staff_name}` : ''}{l.store_location ? ` · ${l.store_location}` : ''}
                </div>
              </div>
              <div style={{ fontSize: 11, color: '#806a58', flexShrink: 0, textAlign: 'right' }}>
                {new Date(l.created_at).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function FinishedGoodsInventoryV2({ onBack }) {
  const { profile } = useAuth();
  const [stock, setStock] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [flow, setFlow] = useState('bakery');
  const [store, setStore] = useState(STORES[0]);
  const [showNhapKho, setShowNhapKho] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  // "Đơn sản xuất" — lịch sử đơn hàng nội bộ, đặt CHUNG màn Kho Thành Phẩm
  // theo yêu cầu, tách hẳn khỏi các tab Tồn kho hiện có (view riêng, không
  // đụng logic flow/store/stock bên dưới).
  const [view, setView] = useState('stock');
  // Kho Bán Thành Phẩm — sub-tab trong mỗi luồng, lọc theo is_semi_finished.
  const [stage, setStage] = useState('finished');
  const [completingRow, setCompletingRow] = useState(null);

  const load = () => {
    setLoading(true);
    Promise.all([fetchFinishedGoodsStock(), fetchProducts()])
      .then(([s, p]) => { setStock(s); setProducts(p); setError(''); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  useEffect(() => {
    const ch = supabase.channel('kho-thanh-pham-v2')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'finished_goods_stock' }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const currentFlow = FLOWS.find((f) => f.key === flow);
  const currentStores = storesForBranch(flow);
  useEffect(() => { setStore(storesForBranch(flow)[0]); }, [flow]);
  const items = useMemo(() => {
    let ds = stock.filter((s) => s.branch === flow && !!s.is_semi_finished === (stage === 'semi'));
    if (stage === 'finished' && currentFlow?.hasBranchTabs) ds = ds.filter((s) => (s.store_location || currentStores[0]) === store);
    return ds;
  }, [stock, flow, store, stage, currentFlow, currentStores]);
  const semiFinishedCount = useMemo(() => stock.filter((s) => s.branch === flow && s.is_semi_finished && Number(s.qty) > 0).length, [stock, flow]);

  const productName = (id) => products.find((p) => p.id === id)?.name || 'Sản phẩm đã xoá';
  const expiringSoon = stock.filter((s) => { const c = countdown(s.expiry_date); return c && c.tone !== 'ok'; }).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 720, margin: '0 auto', width: '100%', boxSizing: 'border-box', padding: '0 4px' }}>
      {onBack && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={onBack} style={{ width: 44, height: 44, border: '1px solid #e2cdb6', borderRadius: 14, background: '#fff', fontSize: 20, cursor: 'pointer' }}>‹</button>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 900, color: '#2d1b10' }}>🏬 Kho Thành Phẩm</h1>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={() => setView('stock')} style={{
          flex: 1, minHeight: 46, borderRadius: 14, border: view === 'stock' ? '2px solid #f05c2b' : '1px solid #e2cdb6',
          background: view === 'stock' ? '#fff1e8' : '#fff', color: view === 'stock' ? '#b7431e' : '#806a58', fontWeight: 900, cursor: 'pointer',
        }}>📦 Tồn kho</button>
        <button onClick={() => setView('orders')} style={{
          flex: 1, minHeight: 46, borderRadius: 14, border: view === 'orders' ? '2px solid #f05c2b' : '1px solid #e2cdb6',
          background: view === 'orders' ? '#fff1e8' : '#fff', color: view === 'orders' ? '#b7431e' : '#806a58', fontWeight: 900, cursor: 'pointer',
        }}>🧾 Đơn sản xuất</button>
      </div>

      {view === 'orders' ? <DonSanXuatTab /> : (
      <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
        <div style={{ background: '#fffaf2', border: '1px solid #e2cdb6', borderRadius: 16, padding: 12, textAlign: 'center' }}>
          <div style={{ fontSize: 22, fontWeight: 900, color: '#b7431e' }}>{stock.reduce((t, s) => t + (Number(s.qty) || 0), 0)}</div>
          <div style={{ fontSize: 10, fontWeight: 900, color: '#806a58', textTransform: 'uppercase' }}>Đang tồn</div>
        </div>
        <div style={{ background: '#fffaf2', border: '1px solid #e2cdb6', borderRadius: 16, padding: 12, textAlign: 'center' }}>
          <div style={{ fontSize: 22, fontWeight: 900, color: expiringSoon ? '#d94a40' : '#078653' }}>{expiringSoon}</div>
          <div style={{ fontSize: 10, fontWeight: 900, color: '#806a58', textTransform: 'uppercase' }}>Cận/hết hạn</div>
        </div>
        <div style={{ background: '#fffaf2', border: '1px solid #e2cdb6', borderRadius: 16, padding: 12, textAlign: 'center' }}>
          <div style={{ fontSize: 22, fontWeight: 900, color: '#b7431e' }}>{stock.filter((s) => Number(s.qty) < 0).length}</div>
          <div style={{ fontSize: 10, fontWeight: 900, color: '#806a58', textTransform: 'uppercase' }}>Âm kho</div>
        </div>
      </div>

      <button onClick={() => setShowNhapKho(true)} style={{ minHeight: 54, border: 0, borderRadius: 16, background: '#078653', color: '#fff', fontWeight: 950, fontSize: 15, cursor: 'pointer' }}>
        + Nhập kho thành phẩm
      </button>

      <div style={{ display: 'flex', gap: 8, overflowX: 'auto' }}>
        {FLOWS.map((f) => (
          <button key={f.key} onClick={() => setFlow(f.key)} style={{
            flex: '0 0 auto', minHeight: 46, padding: '0 14px', borderRadius: 14,
            border: flow === f.key ? '1px solid #ca873a' : '1px solid #e2cdb6',
            background: flow === f.key ? '#fff1d4' : '#fff', color: flow === f.key ? '#7d420c' : '#705640', fontWeight: 900, cursor: 'pointer',
          }}>{f.label}</button>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        {STAGE_TABS.map((t) => (
          <button key={t.key} onClick={() => setStage(t.key)} style={{
            flex: 1, minHeight: 40, borderRadius: 12, border: stage === t.key ? '2px solid #7c3aed' : '1px solid #e2cdb6',
            background: stage === t.key ? '#f5f0ff' : '#fff', color: stage === t.key ? '#6d28d9' : '#806a58', fontWeight: 800, fontSize: 13, cursor: 'pointer',
          }}>
            {t.label}{t.key === 'semi' && semiFinishedCount > 0 ? ` (${semiFinishedCount})` : ''}
          </button>
        ))}
      </div>

      {stage === 'finished' && currentFlow?.hasBranchTabs && (
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${currentStores.length}, 1fr)`, gap: 8 }}>
          {currentStores.map((s) => (
            <button key={s} onClick={() => setStore(s)} style={{
              minHeight: 46, borderRadius: 14, border: store === s ? 'none' : '1px solid #e2cdb6',
              background: store === s ? '#078653' : '#fff', color: store === s ? '#fff' : '#806a58', fontWeight: 900, cursor: 'pointer',
            }}>{s}</button>
          ))}
        </div>
      )}

      {error && <div style={{ color: '#d94a40', fontWeight: 700 }}>⚠️ {error}</div>}
      {loading ? (
        <div style={{ color: '#806a58', textAlign: 'center', padding: 20 }}>Đang tải...</div>
      ) : items.length === 0 ? (
        <div style={{ color: '#806a58', textAlign: 'center', padding: 20 }}>Chưa có tồn kho ở đây — sẽ tự cộng khi nhập kho hoặc bếp ghi sản xuất.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {items.map((s) => {
            const cd = countdown(s.expiry_date);
            const isOpen = expandedId === s.id;
            return (
              <button key={s.id} onClick={() => setExpandedId(isOpen ? null : s.id)} style={{
                display: 'block', textAlign: 'left', font: 'inherit', cursor: 'pointer',
                padding: 12, border: `1px solid ${isOpen ? '#ca873a' : '#e2cdb6'}`, borderRadius: 20, background: '#fff',
              }}>
              <div style={{ display: 'grid', gridTemplateColumns: '68px 1fr', gap: 12 }}>
                <div style={{ borderRadius: 16, overflow: 'hidden', background: '#ffe6ad', display: 'grid', placeItems: 'center', fontSize: 30 }}>
                  {s.photo_url ? <img src={s.photo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : '🍰'}
                </div>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <div>
                      <div style={{ fontWeight: 900, fontSize: 15 }}>{productName(s.product_id)}</div>
                      <div style={{ fontSize: 12, color: '#806a58', fontWeight: 800 }}>
                        {[s.size, s.color, s.packing].filter(Boolean).join(' · ') || '—'}
                      </div>
                    </div>
                    <div style={{ minWidth: 44, textAlign: 'center', padding: '4px 8px', borderRadius: 12, background: '#f4eadc', fontWeight: 900, color: Number(s.qty) < 0 ? '#d94a40' : '#2d1b10' }}>{s.qty}</div>
                  </div>
                  {(s.production_date || s.expiry_date) && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginTop: 8 }}>
                      <div style={{ padding: '6px 8px', borderRadius: 10, background: '#fbf5ed' }}>
                        <div style={{ fontSize: 9, fontWeight: 900, color: '#9a7f68' }}>SẢN XUẤT</div>
                        <div style={{ fontSize: 11, fontWeight: 800 }}>{s.production_date ? new Date(s.production_date).toLocaleString('vi-VN') : '—'}</div>
                      </div>
                      <div style={{ padding: '6px 8px', borderRadius: 10, background: '#fbf5ed' }}>
                        <div style={{ fontSize: 9, fontWeight: 900, color: '#9a7f68' }}>HẾT HẠN</div>
                        <div style={{ fontSize: 11, fontWeight: 800 }}>{s.expiry_date ? new Date(s.expiry_date).toLocaleString('vi-VN') : '—'}</div>
                      </div>
                    </div>
                  )}
                  {cd && <div style={{ marginTop: 8, padding: '7px 9px', borderRadius: 12, fontSize: 12, fontWeight: 900, ...toneStyle[cd.tone] }}>{cd.text}</div>}
                  {stage === 'semi' && Number(s.qty) > 0 && (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setCompletingRow(s); }}
                      style={{ marginTop: 8, width: '100%', minHeight: 42, border: 0, borderRadius: 12, background: '#7c3aed', color: '#fff', fontWeight: 900, fontSize: 13, cursor: 'pointer' }}
                    >
                      ✅ Đã hoàn thiện — chuyển thành phẩm
                    </button>
                  )}
                </div>
              </div>
              {isOpen && <ChiTietDongTonKho row={s} productLabel={`${productName(s.product_id)}${s.size ? ` · ${s.size}` : ''}`} />}
              </button>
            );
          })}
        </div>
      )}

      {completingRow && (
        <CompleteSemiFinishedSheet
          row={completingRow}
          productName={productName(completingRow.product_id)}
          staffName={profile?.full_name}
          onClose={() => setCompletingRow(null)}
          onSaved={load}
        />
      )}

      {showNhapKho && (
        <NhapKhoSheet
          defaultBranch={flow === 'xuong42' ? 'bakery' : flow}
          defaultStore={store}
          products={products}
          staffName={profile?.full_name}
          onClose={() => setShowNhapKho(false)}
          onSaved={load}
        />
      )}
      </>
      )}
    </div>
  );
}
