// Các danh mục sản phẩm được gộp hiển thị chung dưới tab "Bánh Kem" lúc tạo đơn — mỗi
// danh mục tự quyết định cách tính giá (xem SIZE_VARIANT_CATEGORIES/QTY_ONLY_CATEGORIES
// trong OrdersScreen.jsx), riêng 'banh_kem' vẫn dùng công thức Size+Cốt+Nhân bên dưới.
export const KEM_GROUP_CATEGORIES = ['banh_kem', 'banh_kem_bap_choco', 'mousse_tiramisu', 'banh_su', 'cupcake', 'set_mousse'];
export const MAN_GROUP_CATEGORIES = ['banh_man_ngot', 'banh_trung_thu', 'trung_thu_combo', 'phu_kien_trung_thu'];
export const SIZE_VARIANT_CATEGORIES = ['banh_kem_bap_choco', 'mousse_tiramisu', 'banh_trung_thu'];
export const QTY_ONLY_CATEGORIES = ['banh_su', 'cupcake', 'set_mousse', 'trung_thu_combo', 'phu_kien_trung_thu'];

// Bảng giá bánh sinh nhật kem tươi / bánh trứng muối — cập nhật 12/08/2026.
export const CAKE_SIZES_CM = [12, 14, 16, 18, 20, 22, 24, 26, 28, 30, 32, 34, 36, 38, 40];

export const CAKE_BASES = ['Matcha', 'Choco', 'Bông lan'];

const CAKE_BASE_SURCHARGE = { Matcha: 30000, Choco: 30000 };

export function baseSurcharge(base) {
  return CAKE_BASE_SURCHARGE[base] || 0;
}

const BASE_PRICE_BY_SIZE = {
  12: 150000, 14: 180000, 16: 220000, 18: 260000, 20: 300000,
  22: 360000, 24: 420000, 26: 480000, 28: 600000, 30: 700000,
  32: 750000, 34: 800000, 36: 850000, 38: 900000, 40: 1000000,
};

const MUT_CO_BAN_SURCHARGE = {
  12: 20000, 14: 20000, 16: 30000, 18: 30000, 20: 30000,
  22: 40000, 24: 40000, 26: 50000, 28: 70000, 30: 70000,
  32: 80000, 34: 80000, 36: 80000, 38: 100000, 40: 100000,
};

const TRAI_CAY_DAU_SURCHARGE = {
  12: 30000, 14: 30000, 16: 40000, 18: 60000, 20: 60000,
  22: 70000, 24: 80000, 26: 80000, 28: 100000, 30: 100000,
  32: 100000, 34: 120000, 36: 120000, 38: 150000, 40: 150000,
};

const TRAI_CAY_XOAI_SURCHARGE = {
  12: 20000, 14: 20000, 16: 30000, 18: 30000, 20: 30000,
  22: 40000, 24: 40000, 26: 50000, 28: 50000, 30: 50000,
  32: 60000, 34: 60000, 36: 70000, 38: 70000, 40: 100000,
};

export const CAKE_FILLINGS = [
  { value: 'mut_thom', label: 'Mứt thơm (mặc định)', surcharge: null },
  { value: 'viet_quat', label: 'Mứt Việt quất', surcharge: MUT_CO_BAN_SURCHARGE },
  { value: 'mut_dau', label: 'Mứt Dâu', surcharge: MUT_CO_BAN_SURCHARGE },
  { value: 'chocolate', label: 'Mứt Chocolate', surcharge: MUT_CO_BAN_SURCHARGE },
  { value: 'trai_cay_dau', label: 'Trái cây tươi - Dâu', surcharge: TRAI_CAY_DAU_SURCHARGE },
  { value: 'trai_cay_xoai', label: 'Trái cây tươi - Xoài', surcharge: TRAI_CAY_XOAI_SURCHARGE },
];

export function basePriceForSize(size) {
  return BASE_PRICE_BY_SIZE[Number(size)] || 0;
}

export function fillingSurchargeForSize(fillingValue, size) {
  const filling = CAKE_FILLINGS.find((f) => f.value === fillingValue);
  if (!filling || !filling.surcharge) return 0;
  return filling.surcharge[Number(size)] || 0;
}

export function computeCakePrice(size, fillingValue, base) {
  return basePriceForSize(size) + fillingSurchargeForSize(fillingValue, size) + baseSurcharge(base);
}

export function fillingLabel(fillingValue) {
  return CAKE_FILLINGS.find((f) => f.value === fillingValue)?.label || '';
}

// Dòng tóm tắt 1 sản phẩm trong đơn: "Bánh Kem Dâu x1 (18cm · Matcha · Mứt Việt quất · ...)" —
// dùng chung cho OrdersScreen/KdsScreen/ShippingScreen thay vì lặp lại filter+join ở từng nơi.
export function formatOrderItemLine(it, { withQty = true } = {}) {
  const details = [it.size && `Size ${it.size}`, it.cot && `Cốt ${it.cot}`, it.vi && `Vị ${it.vi}`, it.content && `Nội dung "${it.content}"`, it.candle && `Nến ${it.candle}`, it.note].filter(Boolean).join(' · ');
  const qty = withQty && it.qty != null ? ` x${it.qty}` : '';
  return details ? `${it.name}${qty} (${details})` : `${it.name}${qty}`;
}
