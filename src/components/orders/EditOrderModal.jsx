import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { CAKE_BASES, CAKE_FILLINGS, baseSurcharge } from '../../lib/cakePricing';

// Màn hình sửa đơn hàng.
//
// Nút bấm ở đây KHÔNG tự quyết ai được sửa. Nó hỏi database qua
// `sumi_quyen_sua_don` — đúng hàm mà API sửa đơn dùng để chặn. Nhờ vậy không bao
// giờ có chuyện giao diện cho bấm nhưng server từ chối, và quan trọng hơn: sửa
// giao diện cũng không mở được cửa, vì cửa nằm ở database.

const CACH_TRA = [
  { value: 'cod', label: 'COD (thu khi giao)' },
  { value: 'bank_transfer', label: 'Chuyển khoản' },
  { value: 'cash', label: 'Tiền mặt' },
];

const oNen = { background: 'var(--surface-card, #fff)', borderRadius: 14, padding: 14, marginBottom: 12, border: '1px solid var(--border-default, #e7ddd2)' };
const oNhan = { display: 'block', fontWeight: 800, fontSize: 13, marginBottom: 6, color: 'var(--text-primary)' };
const oO = { width: '100%', padding: 10, borderRadius: 10, border: '1px solid var(--border-default, #e7ddd2)', fontSize: 15, fontFamily: 'inherit', boxSizing: 'border-box' };

function dinhDangConLai(giay) {
  if (giay <= 0) return 'đã hết giờ';
  const p = Math.floor(giay / 60);
  const g = giay % 60;
  if (p >= 1) return `còn ${p} phút ${g} giây`;
  return `còn ${g} giây`;
}

// Chuyển ISO -> chuỗi cho ô datetime-local, giữ đúng giờ địa phương.
function sangGioMay(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const b = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return b.toISOString().slice(0, 16);
}

export default function EditOrderModal({ orderId, onClose, onSaved }) {
  const [dangTai, setDangTai] = useState(true);
  const [dangLuu, setDangLuu] = useState(false);
  const [loi, setLoi] = useState('');
  const [xong, setXong] = useState('');
  const [quyen, setQuyen] = useState(null);
  const [don, setDon] = useState(null);
  const [mon, setMon] = useState([]);
  const [sanPham, setSanPham] = useState([]);
  const [themId, setThemId] = useState('');
  const [lyDo, setLyDo] = useState('');
  const [conLai, setConLai] = useState(0);
  // Món nào đang mở khung "Sửa chi tiết" (size/cốt/nhân/chữ trên bánh/nến...).
  const [moRong, setMoRong] = useState({});

  const tai = async () => {
    setDangTai(true);
    setLoi('');
    try {
      // LỖI THẬT đã vá (quét codebase 06/09/2026): trước đây select thẳng
      // ship_fee/deposit/payment_method/total và order_items.unit_price —
      // các cột này giờ đã bị khoá ở tầng DB (đã có 3 lỗ hổng thật xác nhận
      // qua query trực tiếp), tách riêng qua RPC get_order_financials/
      // get_order_item_prices. Modal này chỉ mở được bởi owner/admin ở giao
      // diện hiện tại, nhưng khoá cả ở DB cho chắc (phòng thân sau này có
      // màn khác gọi lại đúng modal này cho vai trò rộng hơn).
      const [q, o, m, fin, itemPrices] = await Promise.all([
        supabase.rpc('sumi_quyen_sua_don', { p_order_id: orderId }),
        supabase.from('orders')
          .select('id,order_code,order_type,address,note,required_at,version,created_at,status_v2,customer_id,customers(name,phone)')
          .eq('id', orderId).single(),
        supabase.from('order_items')
          .select('id,product_id,name,name_snapshot,quantity,unit,specification,display_order')
          .eq('order_id', orderId).order('display_order'),
        supabase.rpc('get_order_financials', { p_order_id: orderId }),
        supabase.rpc('get_order_item_prices', { p_order_id: orderId }),
      ]);
      if (q.error) throw q.error;
      if (o.error) throw o.error;
      if (m.error) throw m.error;

      const finRow = fin?.data?.[0] || {};
      const priceByItemId = Object.fromEntries((itemPrices?.data || []).map((r) => [r.item_id, r.unit_price]));

      setQuyen(q.data);
      setConLai(Number(q.data?.con_lai_giay) || 0);
      setDon({
        ...o.data,
        ...finRow,
        required_at_may: sangGioMay(o.data.required_at),
        ten_khach: o.data.customers?.name || '',
        sdt_khach: o.data.customers?.phone || '',
      });
      setMon((m.data || []).map((x, i) => ({
        khoa: x.id || `moi-${i}`,
        product_id: x.product_id || null,
        name: x.name_snapshot || x.name || 'Sản phẩm',
        quantity: Number(x.quantity) || 0,
        unit: x.unit || 'cái',
        unit_price: Number(priceByItemId[x.id]) || 0,
        specification: x.specification || {},
        display_order: x.display_order ?? i,
      })));
    } catch (e) {
      setLoi(e.message || 'Không tải được đơn hàng.');
    } finally {
      setDangTai(false);
    }
  };

  useEffect(() => { tai(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [orderId]);

  // Danh sách sản phẩm chỉ cần khi thật sự được sửa.
  useEffect(() => {
    if (!quyen?.duoc_sua) return;
    // Lấy đủ id/price của từng mức giá (product_variants) — không chỉ label —
    // để khi anh đổi size ở "Sửa chi tiết", giá tự nhảy đúng theo size đó
    // (giống hệt màn Tạo đơn), thay vì để anh gõ tay size rồi giá đứng yên.
    supabase.from('products').select('id,name,category,price,unit,product_variants(id,label,price)')
      .eq('active', true).order('name')
      .then(({ data }) => setSanPham(data || []))
      .catch(() => setSanPham([]));
  }, [quyen?.duoc_sua]);

  // Đồng hồ đếm ngược, chỉ chạy khi đang trong khung 1 giờ.
  useEffect(() => {
    if (quyen?.ly_do !== 'trong_gio' || conLai <= 0) return;
    const t = setInterval(() => setConLai((x) => Math.max(0, x - 1)), 1000);
    return () => clearInterval(t);
  }, [quyen?.ly_do, conLai > 0]);

  const doiMon = (khoa, thay) =>
    setMon((ds) => ds.map((x) => (x.khoa === khoa ? { ...x, ...thay } : x)));
  const boMon = (khoa) => setMon((ds) => ds.filter((x) => x.khoa !== khoa));
  // Sửa 1 trường bên trong specification (jsonb) của 1 món — cùng cách CreateOrderV2Modal
  // lưu size/cốt/nhân/chữ trên bánh/nến, để "Sửa đơn" đọc/ghi đúng chỗ dữ liệu đã có sẵn.
  const doiSpec = (khoa, truong, giaTri) =>
    setMon((ds) => ds.map((x) => (x.khoa === khoa ? { ...x, specification: { ...x.specification, [truong]: giaTri } } : x)));
  // Nhận diện luồng của món để hiện đúng bộ trường chi tiết — dựa vào product_flow đã
  // lưu lúc tạo đơn (CreateOrderV2Modal), phòng khi thiếu thì suy ra từ dữ liệu cốt/nhân/
  // chữ trên bánh đã có sẵn (đơn tạo trước khi có product_flow).
  const luongMon = (x) => x.specification?.product_flow
    || (x.specification?.cot || x.specification?.filling || x.specification?.content || x.specification?.candle ? 'cake' : null)
    // Đơn tạo qua Trợ lý AI Gen chưa gắn product_flow vào specification từng món —
    // rơi về loại đơn (orders.order_type) để vẫn hiện đúng bộ trường cho bánh kem.
    || (['cake', 'mixed'].includes(don?.order_type) ? 'cake' : null);

  const themMon = () => {
    const p = sanPham.find((x) => x.id === themId);
    if (!p) return;
    setMon((ds) => [...ds, {
      khoa: `moi-${Date.now()}`,
      product_id: p.id,
      name: p.name,
      quantity: 1,
      unit: p.unit || 'cái',
      unit_price: Number(p.price) || 0,
      specification: {},
      display_order: ds.length,
    }]);
    setThemId('');
  };

  const tienHang = mon.reduce((t, x) => t + (Number(x.quantity) || 0) * (Number(x.unit_price) || 0), 0);
  const tongDon = tienHang + (Number(don?.ship_fee) || 0);

  const luu = async () => {
    if (!mon.length) { setLoi('Đơn phải có ít nhất một món.'); return; }
    if (mon.some((x) => !(Number(x.quantity) > 0))) { setLoi('Số lượng của mỗi món phải lớn hơn 0.'); return; }
    setDangLuu(true); setLoi(''); setXong('');
    try {
      const { data, error } = await supabase.rpc('update_order_v2', {
        p_order_id: orderId,
        p_expected_version: don.version,
        p_patch: {
          address: don.address || '',
          note: don.note || '',
          required_at: don.required_at_may ? new Date(don.required_at_may).toISOString() : '',
          ship_fee: String(Number(don.ship_fee) || 0),
          deposit: String(Number(don.deposit) || 0),
          payment_method: don.payment_method || 'cod',
          total: String(tongDon),
        },
        // Tên/SĐT nằm ở bảng customers, không phải cột của orders — orders bị
        // khoá update trực tiếp (RLS orders_update_disabled), nên phải đi qua
        // RPC. RPC tự tạo customer mới nếu đơn chưa có customer_id.
        p_customer_patch: (don.ten_khach || don.sdt_khach) ? { name: don.ten_khach || '', phone: don.sdt_khach || '' } : null,
        p_items: mon.map((x, i) => ({
          product_id: x.product_id,
          name: x.name,
          quantity: Number(x.quantity) || 0,
          unit: x.unit || 'cái',
          unit_price: Number(x.unit_price) || 0,
          display_order: i,
          specification: x.specification || {},
        })),
      });
      if (error) throw error;
      if (data && data.thanh_cong === false) throw new Error(data.thong_bao || 'Lưu không thành công.');

      setXong('Đã lưu thay đổi.');
      // Nạp lại dữ liệu mới nhất rồi mới đóng — không để màn hình đứng im.
      try { await onSaved?.(); } catch (e) { console.error('[SuaDon] Tải lại sau khi lưu lỗi (bỏ qua):', e); }
      setTimeout(() => { try { onClose?.(); } catch (e) { console.error('[SuaDon] Đóng lỗi (bỏ qua):', e); } }, 600);
    } catch (e) {
      setLoi(e.message || 'Không lưu được.');
      // Đơn có thể đã bị người khác sửa -> nạp lại để người dùng thấy bản mới.
      tai();
    } finally {
      setDangLuu(false);
    }
  };

  const guiYeuCau = async () => {
    if (!lyDo.trim()) { setLoi('Hãy ghi rõ lý do cần sửa để Giám đốc biết mà duyệt.'); return; }
    setDangLuu(true); setLoi(''); setXong('');
    try {
      const { data, error } = await supabase.rpc('request_order_edit_approval', {
        p_order_id: orderId, p_user_id: null, p_user_name: null, p_reason: lyDo.trim(),
      });
      if (error) throw error;
      setXong(data?.thong_bao || 'Đã gửi yêu cầu tới Giám đốc.');
      setLyDo('');
      await tai();
    } catch (e) {
      setLoi(e.message || 'Không gửi được yêu cầu.');
    } finally {
      setDangLuu(false);
    }
  };

  const bocNgoai = (noiDung) => (
    <div onClick={() => !dangLuu && onClose?.()} style={{
      position: 'fixed', inset: 0, zIndex: 120, background: 'rgba(0,0,0,0.5)',
      display: 'flex', justifyContent: 'center', alignItems: 'flex-end',
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        width: '100%', maxWidth: 640, background: 'var(--surface-app, #FDFBF7)',
        borderRadius: '20px 20px 0 0', padding: 20, paddingBottom: 'calc(20px + env(safe-area-inset-bottom))', maxHeight: '90dvh', overflowY: 'auto',
      }}>
        {noiDung}
      </div>
    </div>
  );

  if (dangTai) return bocNgoai(<div style={{ padding: 30, textAlign: 'center', color: 'var(--text-secondary)' }}>Đang tải…</div>);

  const dau = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
      <button onClick={onClose} aria-label="Đóng" style={{ minWidth: 44, minHeight: 44, border: 0, borderRadius: 12, background: 'var(--surface-sunken, #f0e9e0)', fontSize: 18, cursor: 'pointer' }}>←</button>
      <h3 style={{ margin: 0, fontSize: 18, fontWeight: 900, color: 'var(--text-primary)' }}>
        ✏️ Sửa đơn {quyen?.ma_don || ''}
      </h3>
    </div>
  );

  const hopLoi = loi ? (
    <div style={{ marginBottom: 12, padding: 12, background: '#fee2e2', borderRadius: 12, color: '#b42318', fontWeight: 700, fontSize: 14, lineHeight: 1.5 }}>⚠️ {loi}</div>
  ) : null;
  const hopXong = xong ? (
    <div style={{ marginBottom: 12, padding: 12, background: '#e6f6ed', borderRadius: 12, color: '#087f5b', fontWeight: 800, fontSize: 14 }}>✓ {xong}</div>
  ) : null;

  // ---- Không được sửa ----
  if (!quyen?.duoc_sua) {
    const quaHan = quyen?.ly_do === 'qua_han';
    return bocNgoai(<>
      {dau}
      <div style={{ ...oNen, background: '#fdf3ec', border: '1px solid #f0d3bf' }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#8c5a3c', lineHeight: 1.6 }}>
          {quyen?.ly_do === 'qua_han' ? '⏰ ' : '🔒 '}{quyen?.thong_bao}
        </div>
      </div>
      {hopLoi}{hopXong}
      {quaHan && !quyen?.dang_cho_duyet && (
        <div style={oNen}>
          <label style={oNhan}>Lý do cần sửa</label>
          <textarea value={lyDo} onChange={(e) => setLyDo(e.target.value)} disabled={dangLuu}
            placeholder="VD: Khách gọi lại đổi từ bánh 16cm sang 20cm và dời giờ giao sang 17h"
            style={{ ...oO, minHeight: 90 }} />
          <button onClick={guiYeuCau} disabled={dangLuu}
            style={{ width: '100%', minHeight: 52, marginTop: 12, border: 0, borderRadius: 14, background: dangLuu ? '#c7b6a3' : '#D96B43', color: '#fff', fontSize: 16, fontWeight: 900, cursor: dangLuu ? 'not-allowed' : 'pointer' }}>
            {dangLuu ? 'Đang gửi…' : '📨 Gửi yêu cầu chỉnh sửa'}
          </button>
          <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', marginTop: 8, lineHeight: 1.5 }}>
            Giám đốc duyệt xong, bạn quay lại đây là sửa được. Mỗi lần duyệt dùng cho một lần sửa.
          </div>
        </div>
      )}
      {quyen?.dang_cho_duyet && (
        <div style={{ ...oNen, background: '#fff8e6', border: '1px solid #f2dfae' }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: '#96690a' }}>⏳ Đang chờ Giám đốc duyệt</div>
        </div>
      )}
    </>);
  }

  // ---- Được sửa ----
  const nhan = quyen.ly_do === 'trong_gio'
    ? { mau: '#087f5b', nen: '#e6f6ed', vien: '#bfe3d1', chu: `⏱️ Sửa trực tiếp — ${dinhDangConLai(conLai)}` }
    : quyen.ly_do === 'giam_doc'
      ? { mau: '#1e5aa8', nen: '#e8f1fc', vien: '#c5daf5', chu: '👑 Giám đốc — sửa được bất cứ lúc nào' }
      : { mau: '#96690a', nen: '#fff8e6', vien: '#f2dfae', chu: '✅ Giám đốc đã duyệt — lượt duyệt này dùng cho MỘT lần sửa' };

  return bocNgoai(<>
    {dau}
    <div style={{ padding: '10px 14px', borderRadius: 12, background: nhan.nen, border: `1px solid ${nhan.vien}`, color: nhan.mau, fontWeight: 800, fontSize: 13.5, marginBottom: 12 }}>
      {nhan.chu}
    </div>
    {conLai === 0 && quyen.ly_do === 'trong_gio' && (
      <div style={{ marginBottom: 12, padding: 12, background: '#fee2e2', borderRadius: 12, color: '#b42318', fontWeight: 700, fontSize: 13.5 }}>
        Vừa hết 1 giờ. Bấm Lưu lúc này sẽ bị từ chối — hãy đóng lại và gửi yêu cầu chỉnh sửa.
      </div>
    )}
    {hopLoi}{hopXong}

    {/* ----- Món ----- */}
    <div style={oNen}>
      <div style={{ ...oNhan, marginBottom: 10 }}>🍰 Các món trong đơn</div>
      {mon.map((x) => {
        const luong = luongMon(x);
        const daMo = !!moRong[x.khoa];
        return (
        <div key={x.khoa} style={{ padding: '8px 0', borderTop: '1px dashed #ece4da' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {x.name}{x.specification?.size ? ` (${x.specification.size})` : ''}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                {(Number(x.unit_price) || 0).toLocaleString('vi-VN')}đ / {x.unit}
                {!x.product_id && ' · không theo dõi tồn kho'}
              </div>
              {(() => {
                const s0 = x.specification || {};
                const fillingLabel = CAKE_FILLINGS.find((f) => f.value === s0.filling)?.label;
                const chiTiet = [s0.cot, fillingLabel, s0.content && `chữ: ${s0.content}`, s0.candle && `nến: ${s0.candle}`, s0.packing].filter(Boolean).join(' · ');
                return chiTiet ? <div style={{ fontSize: 11.5, color: '#8c5a3c', marginTop: 2 }}>{chiTiet}</div> : null;
              })()}
            </div>
            <button onClick={() => doiMon(x.khoa, { quantity: Math.max(1, (Number(x.quantity) || 0) - 1) })}
              style={{ minWidth: 44, minHeight: 44, borderRadius: 12, border: '1.5px solid #e0d5c7', background: '#fff', fontSize: 20, fontWeight: 900, cursor: 'pointer' }}>−</button>
            <input type="number" min="1" inputMode="numeric" value={x.quantity}
              onChange={(e) => doiMon(x.khoa, { quantity: e.target.value === '' ? '' : Number(e.target.value) })}
              style={{ width: 62, minHeight: 44, textAlign: 'center', borderRadius: 12, border: '1.5px solid #e0d5c7', fontSize: 16, fontWeight: 800, boxSizing: 'border-box' }} />
            <button onClick={() => doiMon(x.khoa, { quantity: (Number(x.quantity) || 0) + 1 })}
              style={{ minWidth: 44, minHeight: 44, borderRadius: 12, border: '1.5px solid #e0d5c7', background: '#fff', fontSize: 20, fontWeight: 900, cursor: 'pointer' }}>+</button>
            <button onClick={() => boMon(x.khoa)} aria-label="Bỏ món này"
              style={{ minWidth: 44, minHeight: 44, borderRadius: 12, border: '1.5px solid #f3c9c2', background: '#fdeceb', fontSize: 16, cursor: 'pointer' }}>🗑</button>
          </div>
          <button onClick={() => setMoRong((m) => ({ ...m, [x.khoa]: !m[x.khoa] }))}
            style={{ marginTop: 6, border: 'none', background: 'none', color: '#D96B43', fontWeight: 800, fontSize: 12.5, cursor: 'pointer', padding: '4px 0' }}>
            {daMo ? '▲ Ẩn chi tiết' : '✏️ Sửa chi tiết (size / chữ trên bánh / nến...)'}
          </button>
          {daMo && (() => {
            // Sản phẩm có sẵn mức giá theo size (product_variants) -> chọn size là NHẢY
            // GIÁ THEO ĐÚNG SIZE ĐÓ (giống hệt màn Tạo đơn), không cho sửa tay giá nữa —
            // tránh gõ nhầm lệch với bảng giá đã niêm yết. Sản phẩm KHÔNG có size nào
            // (giá cố định một mức) thì cho gõ tay size (ghi chú, không đổi giá) và có
            // thêm ô sửa giá tay riêng, vì không có bảng giá nào để đối chiếu.
            const bienThe = sanPham.find((p) => p.id === x.product_id)?.product_variants || [];
            return (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 4, padding: 10, background: '#fbf7f1', borderRadius: 12 }}>
              {bienThe.length > 0 ? (
                <select value={x.specification?.size || ''} onChange={(e) => {
                  const v = bienThe.find((b) => b.label === e.target.value);
                  doiMon(x.khoa, { unit_price: v ? Number(v.price) : x.unit_price, specification: { ...x.specification, size: e.target.value } });
                }} style={{ ...oO, minHeight: 40, gridColumn: luong === 'cake' ? '1 / -1' : 'auto' }}>
                  <option value="">Chọn size...</option>
                  {bienThe.map((v) => <option key={v.id} value={v.label}>{v.label} — {Number(v.price).toLocaleString('vi-VN')}đ</option>)}
                </select>
              ) : (
                <>
                  <input placeholder="Size (18cm...)" value={x.specification?.size || ''} onChange={(e) => doiSpec(x.khoa, 'size', e.target.value)} style={{ ...oO, minHeight: 40 }} />
                  <input type="number" inputMode="numeric" placeholder="Giá bánh (đ)" value={x.unit_price ?? ''} onChange={(e) => doiMon(x.khoa, { unit_price: e.target.value === '' ? '' : Number(e.target.value) })} style={{ ...oO, minHeight: 40 }} />
                </>
              )}
              {luong === 'cake' ? (
                <>
                  <select value={x.specification?.cot || ''} onChange={(e) => doiSpec(x.khoa, 'cot', e.target.value)} style={{ ...oO, minHeight: 40 }}>
                    <option value="">Chọn cốt bánh...</option>
                    {CAKE_BASES.map((b) => <option key={b} value={b}>{baseSurcharge(b) ? `${b} (+${baseSurcharge(b).toLocaleString('vi-VN')}đ)` : b}</option>)}
                  </select>
                  <select value={x.specification?.filling || ''} onChange={(e) => doiSpec(x.khoa, 'filling', e.target.value)} style={{ ...oO, minHeight: 40 }}>
                    <option value="">Chọn nhân...</option>
                    {CAKE_FILLINGS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                  </select>
                  <input placeholder="Chữ trên bánh" value={x.specification?.content || ''} onChange={(e) => doiSpec(x.khoa, 'content', e.target.value)} style={{ ...oO, minHeight: 40, gridColumn: '1 / -1' }} />
                  <input placeholder="Loại nến (VD: Nến số 25)" value={x.specification?.candle || ''} onChange={(e) => doiSpec(x.khoa, 'candle', e.target.value)} style={{ ...oO, minHeight: 40, gridColumn: '1 / -1' }} />
                </>
              ) : (
                <input placeholder="Ghi chú thêm (quy cách, đóng gói...)" value={x.specification?.packing || ''} onChange={(e) => doiSpec(x.khoa, 'packing', e.target.value)} style={{ ...oO, minHeight: 40, gridColumn: '1 / -1' }} />
              )}
            </div>
            );
          })()}
        </div>
        );
      })}
      {!mon.length && <div style={{ fontSize: 13.5, color: '#b42318', padding: '8px 0' }}>Đơn đang không có món nào. Thêm ít nhất một món trước khi lưu.</div>}

      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <select value={themId} onChange={(e) => setThemId(e.target.value)} style={{ ...oO, flex: 1, minHeight: 44 }}>
          <option value="">+ Thêm món…</option>
          {sanPham.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <button onClick={themMon} disabled={!themId}
          style={{ minWidth: 88, minHeight: 44, borderRadius: 12, border: 0, background: themId ? '#087f5b' : '#c7c0b8', color: '#fff', fontWeight: 800, cursor: themId ? 'pointer' : 'not-allowed' }}>Thêm</button>
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 8, lineHeight: 1.5 }}>
        Đơn "Bánh có sẵn" đã trừ kho: bớt món sẽ <b>trả lại kho</b>, thêm món sẽ <b>trừ tiếp</b>. Kho không đủ thì hệ thống chặn và giữ nguyên đơn cũ.
      </div>
    </div>

    {/* ----- Khách hàng ----- */}
    <div style={oNen}>
      <label style={oNhan}>👤 Tên khách hàng</label>
      <input type="text" value={don.ten_khach || ''} onChange={(e) => setDon({ ...don, ten_khach: e.target.value })} style={{ ...oO, minHeight: 44, marginBottom: 12 }} />
      <label style={oNhan}>📞 Số điện thoại</label>
      <input type="tel" value={don.sdt_khach || ''} onChange={(e) => setDon({ ...don, sdt_khach: e.target.value })} style={{ ...oO, minHeight: 44 }} />
    </div>

    {/* ----- Giao hàng ----- */}
    <div style={oNen}>
      <label style={oNhan}>📍 Địa chỉ giao</label>
      <textarea value={don.address || ''} onChange={(e) => setDon({ ...don, address: e.target.value })} style={{ ...oO, minHeight: 60, marginBottom: 12 }} />
      <label style={oNhan}>📅 Thời điểm cần giao</label>
      <input type="datetime-local" value={don.required_at_may || ''} onChange={(e) => setDon({ ...don, required_at_may: e.target.value })} style={{ ...oO, minHeight: 44, marginBottom: 12 }} />
      <label style={oNhan}>📝 Ghi chú</label>
      <textarea value={don.note || ''} onChange={(e) => setDon({ ...don, note: e.target.value })} style={{ ...oO, minHeight: 60 }} />
    </div>

    {/* ----- Tiền ----- */}
    <div style={oNen}>
      <label style={oNhan}>🚚 Phí ship</label>
      <input type="number" inputMode="numeric" value={don.ship_fee ?? 0} onChange={(e) => setDon({ ...don, ship_fee: e.target.value })} style={{ ...oO, minHeight: 44, marginBottom: 12 }} />
      <label style={oNhan}>💵 Đã cọc</label>
      <input type="number" inputMode="numeric" value={don.deposit ?? 0} onChange={(e) => setDon({ ...don, deposit: e.target.value })} style={{ ...oO, minHeight: 44, marginBottom: 12 }} />
      <label style={oNhan}>💳 Cách trả tiền</label>
      <select value={don.payment_method || 'cod'} onChange={(e) => setDon({ ...don, payment_method: e.target.value })} style={{ ...oO, minHeight: 44 }}>
        {CACH_TRA.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}
      </select>
      <div style={{ marginTop: 14, padding: 12, borderRadius: 12, background: '#f5f1eb', border: '2px solid #e0d5c7' }}>
        <div style={{ fontSize: 11.5, color: '#725f50', fontWeight: 800 }}>TỔNG ĐƠN SAU KHI SỬA</div>
        <div style={{ fontSize: 26, fontWeight: 900, color: '#D96B43' }}>{tongDon.toLocaleString('vi-VN')}đ</div>
        <div style={{ fontSize: 11.5, color: '#8c5a3c' }}>
          Tiền hàng {tienHang.toLocaleString('vi-VN')}đ
          {Number(don.ship_fee) > 0 ? ` + ship ${Number(don.ship_fee).toLocaleString('vi-VN')}đ` : ''}
          {Number(don.deposit) > 0 ? ` · đã cọc ${Number(don.deposit).toLocaleString('vi-VN')}đ · còn lại ${(tongDon - Number(don.deposit)).toLocaleString('vi-VN')}đ` : ''}
        </div>
      </div>
    </div>

    <div style={{ display: 'flex', gap: 10, paddingBottom: 8 }}>
      <button onClick={onClose} disabled={dangLuu}
        style={{ flex: 1, minHeight: 54, border: 0, borderRadius: 14, background: 'var(--surface-sunken, #f0e9e0)', color: 'var(--text-primary)', fontWeight: 800, fontSize: 15, cursor: 'pointer' }}>Huỷ</button>
      <button onClick={luu} disabled={dangLuu}
        style={{ flex: 2, minHeight: 54, border: 0, borderRadius: 14, background: dangLuu ? '#c7b6a3' : '#D96B43', color: '#fff', fontWeight: 900, fontSize: 16, cursor: dangLuu ? 'not-allowed' : 'pointer' }}>
        {dangLuu ? 'Đang lưu…' : '✓ Lưu thay đổi'}
      </button>
    </div>
  </>);
}
