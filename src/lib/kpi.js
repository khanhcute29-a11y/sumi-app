import { haversineKm } from './geo';

export function computeShipperKpi(orders, staffFullName) {
  const matched = orders.filter((o) => o.shipper_staff_name === staffFullName && o.status === 'hoan_thanh');
  const orderCount = matched.length;
  const totalKm = matched.reduce((sum, o) => {
    const km = haversineKm(o.pickup_lat, o.pickup_lng, o.delivery_lat, o.delivery_lng);
    return sum + (km || 0);
  }, 0);
  return { orderCount, totalKm: Math.round(totalKm * 10) / 10 };
}

export function computeKitchenKpi(orders, productionLogs, staffFullName) {
  const matched = orders.filter((o) => o.kitchen_staff_name === staffFullName && o.status !== 'huy');
  const orderCount = matched.length;
  const productsFromOrders = matched.reduce((sum, o) => {
    const items = o.order_items || [];
    return sum + items.reduce((s, it) => s + (Number(it.qty) || 0), 0);
  }, 0);
  const productsProduced = productionLogs
    .filter((p) => p.staff_name === staffFullName)
    .reduce((sum, p) => sum + (Number(p.qty) || 0), 0);
  return { orderCount, productsFromOrders, productsProduced };
}
