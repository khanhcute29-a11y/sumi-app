import React, { useEffect, useState } from 'react';
import { Card } from '../components/data/Card';
import { Badge } from '../components/feedback/Badge';
import { Button } from '../components/forms/Button';
import { Input } from '../components/forms/Input';
import { Select } from '../components/forms/Select';
import { Switch } from '../components/forms/Switch';
import {
  fetchProducts, createProduct, updateProduct, deleteProduct,
  addProductVariant, deleteProductVariant,
  fetchProductRecipes, addRecipeItem, deleteRecipeItem, fetchWarehouseStock,
} from '../lib/queries';
import { PhotoField } from '../components/PhotoField';
import { IconTrash, IconRuler } from '../components/icons/FrogIcons';
import { useAuth } from '../lib/AuthContext';
import { hasRole } from '../lib/roles';

const CATEGORIES = [
  { value: 'banh_kem', label: 'Bánh Kem' },
  { value: 'banh_kem_bap_choco', label: 'Bánh Kem Bắp / Chocolate' },
  { value: 'mousse_tiramisu', label: 'Mousse & Tiramisu' },
  { value: 'set_mousse', label: 'Set Mousse Ly' },
  { value: 'banh_su', label: 'Bánh Su Singapore' },
  { value: 'cupcake', label: 'Cupcake' },
  { value: 'banh_man_ngot', label: 'Bánh Mặn Ngọt' },
  { value: 'teabreak', label: 'Teabreak' },
  { value: 'macaron', label: 'Macaron' },
  { value: 'khac', label: 'Khác' },
];
const categoryLabel = (v) => CATEGORIES.find((c) => c.value === v)?.label || v;
const VARIANT_CATEGORIES = ['banh_kem', 'banh_kem_bap_choco', 'mousse_tiramisu'];

function AddProductForm({ onAdded, onClose }) {
  const [name, setName] = useState('');
  const [category, setCategory] = useState('banh_kem');
  const [unit, setUnit] = useState('cái');
  const [price, setPrice] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    if (!name) { setError('Nhập tên sản phẩm.'); return; }
    setSaving(true);
    setError('');
    try {
      await createProduct({ name, category, unit, price: Number(price) || 0, photoUrl });
      onAdded();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {error && <div style={{ font: 'var(--text-body-sm)', color: 'var(--status-danger)' }}>{error}</div>}
      <Input label="Tên sản phẩm" placeholder="VD: Bánh Kem Dâu" value={name} onChange={(e) => setName(e.target.value)} />
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <Select label="Danh mục" value={category} onChange={(e) => setCategory(e.target.value)} options={CATEGORIES} style={{ flex: '1 1 200px', minWidth: 0 }} />
        <Input label="Đơn vị" placeholder="VD: cái, kg, set" value={unit} onChange={(e) => setUnit(e.target.value)} style={{ flex: '1 1 120px', minWidth: 0 }} />
      </div>
      <Input label="Giá mặc định" type="number" placeholder="VD: 350000" value={price} onChange={(e) => setPrice(e.target.value)}
        helpText="Nếu sản phẩm có nhiều mức giá theo size, thêm ở bước sau — giá này chỉ dùng khi không chọn size." />
      <PhotoField url={photoUrl} onChange={setPhotoUrl} label="Ảnh sản phẩm (nếu có)" prefix="product" />
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <Button variant="secondary" size="sm" onClick={onClose} disabled={saving}>Hủy</Button>
        <Button variant="primary" size="sm" onClick={handleSubmit} disabled={saving}>{saving ? 'Đang lưu...' : 'Lưu'}</Button>
      </div>
    </Card>
  );
}

function VariantRow({ product, canEdit, onChanged }) {
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState('');
  const [price, setPrice] = useState('');
  const [saving, setSaving] = useState(false);
  const variants = product.product_variants || [];

  const handleAdd = async () => {
    if (!label || !price) return;
    setSaving(true);
    try {
      await addProductVariant(product.id, { label, price: Number(price) });
      setLabel(''); setPrice(''); setAdding(false);
      onChanged();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingTop: 8, borderTop: '1px solid var(--border-subtle)' }}>
      {variants.map((v) => (
        <div key={v.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', font: 'var(--text-body-sm)' }}>
          <span>{v.label}</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>{Number(v.price).toLocaleString('vi-VN')}đ</span>
            {canEdit && (
              <button onClick={async () => { await deleteProductVariant(v.id); onChanged(); }}
                style={{ border: 'none', background: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>✕</button>
            )}
          </div>
        </div>
      ))}
      {canEdit && (adding ? (
        <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end' }}>
          <Input label="Size" placeholder="VD: 22cm" value={label} onChange={(e) => setLabel(e.target.value)} style={{ flex: 1 }} />
          <Input label="Giá" type="number" placeholder="VD: 450000" value={price} onChange={(e) => setPrice(e.target.value)} style={{ flex: 1 }} />
          <Button variant="secondary" size="sm" onClick={handleAdd} disabled={saving}>Thêm</Button>
        </div>
      ) : (
        <Button variant="ghost" size="sm" onClick={() => setAdding(true)} style={{ alignSelf: 'flex-start' }}>+ Thêm mức giá theo size</Button>
      ))}
    </div>
  );
}

function RecipeEditor({ product, ingredients, onCostChange }) {
  const [recipes, setRecipes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [ingredientId, setIngredientId] = useState('');
  const [qtyPerUnit, setQtyPerUnit] = useState('');
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    fetchProductRecipes(product.id).then((data) => setRecipes(data)).finally(() => setLoading(false));
  };

  useEffect(load, [product.id]);

  const totalCost = recipes.reduce((s, r) => s + (Number(r.qty_per_unit) || 0) * (Number(r.ingredient?.cost_per_unit) || 0), 0);

  useEffect(() => { onCostChange(totalCost); }, [totalCost]);

  const handleAdd = async () => {
    if (!ingredientId || !qtyPerUnit) return;
    setSaving(true);
    try {
      await addRecipeItem({ productId: product.id, ingredientId, qtyPerUnit: Number(qtyPerUnit) });
      setIngredientId(''); setQtyPerUnit('');
      load();
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async (id) => {
    await deleteRecipeItem(id);
    load();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingTop: 8, borderTop: '1px solid var(--border-subtle)' }}>
      <div style={{ font: 'var(--text-caption)', color: 'var(--text-muted)' }}>Công thức (nguyên liệu cho 1 sản phẩm)</div>
      {loading ? (
        <div style={{ font: 'var(--text-caption)', color: 'var(--text-muted)' }}>Đang tải...</div>
      ) : recipes.length === 0 ? (
        <div style={{ font: 'var(--text-caption)', color: 'var(--text-muted)' }}>Chưa có công thức — thêm nguyên liệu bên dưới để tính giá vốn.</div>
      ) : recipes.map((r) => (
        <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', font: 'var(--text-body-sm)' }}>
          <span>{r.ingredient?.name || '(nguyên liệu đã xoá)'}: {r.qty_per_unit} {r.ingredient?.unit}</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>{((Number(r.qty_per_unit) || 0) * (Number(r.ingredient?.cost_per_unit) || 0)).toLocaleString('vi-VN')}đ</span>
            <button onClick={() => handleRemove(r.id)} style={{ border: 'none', background: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>✕</button>
          </div>
        </div>
      ))}
      <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <Select label="Nguyên liệu" value={ingredientId} onChange={(e) => setIngredientId(e.target.value)}
          options={[{ value: '', label: 'Chọn...' }, ...ingredients.map((i) => ({ value: i.id, label: `${i.name} (${Number(i.cost_per_unit).toLocaleString('vi-VN')}đ/${i.unit})` }))]}
          style={{ flex: '2 1 200px' }} />
        <Input label="Lượng dùng" type="number" placeholder="VD: 200" value={qtyPerUnit} onChange={(e) => setQtyPerUnit(e.target.value)} style={{ flex: '1 1 100px' }} />
        <Button variant="secondary" size="sm" onClick={handleAdd} disabled={saving || !ingredientId || !qtyPerUnit}>+ Thêm</Button>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', font: 'var(--text-label)', color: 'var(--text-primary)', paddingTop: 4 }}>
        <span>Tổng giá vốn</span><b>{totalCost.toLocaleString('vi-VN')}đ</b>
      </div>
    </div>
  );
}

function ProductRow({ product, ingredients, canEdit, onChanged }) {
  const variants = product.product_variants || [];
  const [showRecipe, setShowRecipe] = useState(false);
  const [showPhotoEdit, setShowPhotoEdit] = useState(false);
  const [cost, setCost] = useState(null);
  const basePrice = Number(product.price) || 0;
  const margin = cost != null ? basePrice - cost : null;
  const marginPct = cost != null && basePrice > 0 ? Math.round((margin / basePrice) * 100) : null;

  return (
    <Card style={{ display: 'flex', flexDirection: 'column', gap: 8 }} padding={14}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', minWidth: 0 }}>
          {product.photo_url && (
            <img src={product.photo_url} alt={product.name} style={{ width: 48, height: 48, borderRadius: 'var(--radius-sm)', objectFit: 'cover', flexShrink: 0 }} />
          )}
          <div style={{ minWidth: 0 }}>
          <div style={{ font: 'var(--text-label)', color: 'var(--text-primary)' }}>{product.name}</div>
          <div style={{ display: 'flex', gap: 6, marginTop: 4, alignItems: 'center', flexWrap: 'wrap' }}>
            <Badge tone="neutral">{categoryLabel(product.category)}</Badge>
            <span style={{ font: 'var(--text-caption)', color: 'var(--text-muted)' }}>
              {variants.length > 0 ? `${variants.length} mức giá` : `${Number(product.price).toLocaleString('vi-VN')}đ / ${product.unit}`}
            </span>
            {canEdit && cost != null && cost > 0 && (
              <Badge tone={margin >= 0 ? 'success' : 'danger'}>
                Giá vốn {cost.toLocaleString('vi-VN')}đ · Lãi gộp {margin.toLocaleString('vi-VN')}đ ({marginPct}%)
              </Badge>
            )}
            {!product.active && <Badge tone="neutral">Ngừng bán</Badge>}
          </div>
          </div>
        </div>
        {canEdit && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Switch checked={product.active} onChange={(v) => { updateProduct(product.id, { active: v }); onChanged(); }} />
            <button onClick={async () => { if (confirm(`Xóa "${product.name}" khỏi danh mục?`)) { await deleteProduct(product.id); onChanged(); } }}
              style={{ border: 'none', background: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 16, display: 'inline-flex' }}><IconTrash size={16} /></button>
          </div>
        )}
      </div>
      {VARIANT_CATEGORIES.includes(product.category) && <VariantRow product={product} canEdit={canEdit} onChanged={onChanged} />}
      {canEdit && (
        <React.Fragment>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Button variant="ghost" size="sm" onClick={() => setShowRecipe((v) => !v)}>
              {showRecipe ? 'Ẩn công thức & giá vốn' : <><IconRuler size={14} style={{ verticalAlign: '-2px', marginRight: 4 }} />Công thức & giá vốn</>}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setShowPhotoEdit((v) => !v)}>
              {showPhotoEdit ? 'Ẩn ảnh' : product.photo_url ? 'Đổi ảnh' : '+ Thêm ảnh'}
            </Button>
          </div>
          {showPhotoEdit && (
            <PhotoField url={product.photo_url} onChange={(url) => { updateProduct(product.id, { photo_url: url }); onChanged(); }} label="Ảnh sản phẩm" prefix="product" />
          )}
          {showRecipe && <RecipeEditor product={product} ingredients={ingredients} onCostChange={setCost} />}
        </React.Fragment>
      )}
    </Card>
  );
}

export default function ProductsScreen() {
  const { profile } = useAuth();
  const isOwner = hasRole(profile, 'owner');
  const [products, setProducts] = useState([]);
  const [ingredients, setIngredients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [filter, setFilter] = useState('all');

  const load = () => {
    fetchProducts()
      .then((data) => { setProducts(data); setError(''); })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);
  useEffect(() => { fetchWarehouseStock().then(setIngredients).catch(() => {}); }, []);

  const filtered = filter === 'all' ? products : products.filter((p) => p.category === filter);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div style={{ font: 'var(--text-display-md)', color: 'var(--text-primary)' }}>Sản Phẩm</div>
          <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-muted)' }}>Danh mục &amp; giá — dùng để tự động điền giá khi tạo đơn</div>
        </div>
        {isOwner && <Button variant="primary" onClick={() => setShowForm((v) => !v)}>{showForm ? 'Đóng' : '+ Thêm sản phẩm'}</Button>}
      </div>
      {isOwner && showForm && <AddProductForm onAdded={load} onClose={() => setShowForm(false)} />}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {[{ value: 'all', label: 'Tất cả' }, ...CATEGORIES].map((c) => (
          <Button key={c.value} variant={filter === c.value ? 'primary' : 'secondary'} size="sm" onClick={() => setFilter(c.value)}>{c.label}</Button>
        ))}
      </div>
      {error && <div style={{ font: 'var(--text-body-sm)', color: 'var(--status-danger)' }}>Lỗi tải sản phẩm: {error}</div>}
      {loading ? (
        <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-muted)' }}>Đang tải...</div>
      ) : filtered.length === 0 ? (
        <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-muted)' }}>Chưa có sản phẩm nào — bấm "+ Thêm sản phẩm" để bắt đầu nhập menu.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {filtered.map((p) => <ProductRow key={p.id} product={p} ingredients={ingredients} canEdit={isOwner} onChanged={load} />)}
        </div>
      )}
    </div>
  );
}
