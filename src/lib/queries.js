import { supabase } from './supabaseClient';
import { isSyntheticPhoneEmail } from './authPhone';
import { branchForCategory, KEM_GROUP_CATEGORIES } from './cakePricing';
import { newId } from './ids';
import { broadcastEvent, BroadcastEvents, notifyOtherTabs } from './realtimeSync';
import { playShipperReceiveSound } from './sound';

// Báo cho App.jsx biết cần đếm lại chấm đỏ thông báo ngay — không chờ Supabase Realtime
// (bảng mới có thể chưa bật Realtime replication, khiến chấm đỏ bị kẹt tới khi tải lại trang).
function notifyBadgesChanged() {
  window.dispatchEvent(new Event('sumi-badges-changed'));
}

// ---- Profiles (tài khoản & phân quyền nhân viên) ----

export async function fetchMyProfile() {
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr) throw userErr;
  const user = userData.user;
  const { data, error } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle();
  if (error) throw error;
  const realEmail = isSyntheticPhoneEmail(user.email) ? null : user.email;
  return { ...data, email: realEmail, phone: data?.phone || user.phone };
}

export async function fetchAllProfiles() {
  const { data, error } = await supabase.from('profiles').select('*').order('created_at', { ascending: true });
  if (error) throw error;
  return data;
}

export async function fetchAuditLog({ limit = 200, from, to } = {}) {
  let q = supabase.from('audit_log').select('*').order('created_at', { ascending: false }).limit(limit);
  if (from) q = q.gte('created_at', `${from}T00:00:00+07:00`);
  if (to) q = q.lte('created_at', `${to}T23:59:59.999+07:00`);
  const { data, error } = await q;
  if (error) throw error;
  return data;
}

export async function updateMyProfile(fields) {
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr) throw userErr;
  const { error } = await supabase.from('profiles').update(fields).eq('id', userData.user.id);
  if (error) throw error;
}

export async function updateProfileRole(id, role) {
  const { error } = await supabase.from('profiles').update({ role }).eq('id', id);
  if (error) throw error;
}

export async function updateProfileExtraRoles(id, extraRoles) {
  const { error } = await supabase.from('profiles').update({ extra_roles: extraRoles }).eq('id', id);
  if (error) throw error;
}

export async function approveStaff(id, role) {
  const { error } = await supabase.from('profiles').update({ role, approved: true }).eq('id', id);
  if (error) throw error;
}

export async function updateProfileActive(id, active) {
  const { error } = await supabase.from('profiles').update({ active }).eq('id', id);
  if (error) throw error;
}

// ---- Customers ----

export async function fetchCustomers() {
  const { data, error } = await supabase.from('customers').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function findOrCreateCustomer({ name, phone, channel }) {
  if (phone) {
    const { data: existing, error: findErr } = await supabase.from('customers').select('*').eq('phone', phone).maybeSingle();
    if (findErr) throw findErr;
    if (existing) return existing;
  }
  const { data, error } = await supabase.from('customers').insert({ name, phone, channel }).select().single();
  if (error) throw error;
  return data;
}

// ---- Products (menu + giá) ----

export async function fetchProducts({ activeOnly } = {}) {
  let q = supabase.from('products').select('*, product_variants(*)').order('created_at', { ascending: true });
  if (activeOnly) q = q.eq('active', true);
  const { data, error } = await q;
  if (error) throw error;
  return data;
}

export async function addProductionLog({ productId, productName, qty, size, price, staffId, staffName, workDate, photoUrl }) {
  const { error } = await supabase.from('production_logs').insert({
    product_id: productId || null, product_name: productName, qty,
    size: size || null, price: price || null,
    staff_id: staffId || null, staff_name: staffName, work_date: workDate,
    photo_url: photoUrl || null,
  });
  if (error) throw error;

  if (productId) {
    try {
      const { data: product } = await supabase.from('products').select('category').eq('id', productId).maybeSingle();
      // Bánh làm theo đơn (bánh kem, mousse, bánh su...) không phải hàng sản
      // xuất theo lô cố định — bỏ qua khỏi kho thành phẩm (xem KEM_GROUP_CATEGORIES).
      if (!KEM_GROUP_CATEGORIES.includes(product?.category)) {
        const branch = branchForCategory(product?.category);
        await upsertFinishedGoodsStock({ productId, size, branch }, Number(qty) || 0);
        await supabase.from('finished_goods_stock_in_log').insert({
          product_id: productId, product_name: productName, size: size || null, branch,
          qty: Number(qty) || 0, source: 'production_log', staff_name: staffName || null,
        });
      }
    } catch (stockErr) {
      // Ghi sản xuất đã lưu thành công — không chặn luồng chính nếu cộng kho
      // thất bại, chỉ cảnh báo để không mất dữ liệu sản xuất thật.
      console.error('Không cộng được kho thành phẩm:', stockErr);
    }
  }
}

// Trừ kho thành phẩm cho từng sản phẩm trong đơn khi đơn được đánh dấu Hoàn
// thành. Chỉ áp dụng cho dòng có product_id (chọn từ menu) — dòng nhập tay
// tự do ("Khác") không có sản phẩm để trừ, bỏ qua theo đúng thiết kế đã
// thống nhất. Cho phép âm kho (bánh custom làm theo đơn, chưa từng "nhập").
// Bánh làm theo đơn (KEM_GROUP_CATEGORIES) bị bỏ qua giống hệt luồng nhập.
export async function deductFinishedGoodsStockForOrder(order) {
  const items = order.order_items || [];
  const productIds = [...new Set(items.filter((it) => it.product_id).map((it) => it.product_id))];
  let productCategoryById = {};
  if (productIds.length) {
    const { data: productsData, error: productsErr } = await supabase.from('products').select('id, category').in('id', productIds);
    if (productsErr) {
      // Không tra được category thật của sản phẩm — KHÔNG được rơi về
      // category ghi trên order_item (không đáng tin, gây trừ nhầm kho
      // Macaron Sỉ/Teabreak và bỏ sót KEM_GROUP_CATEGORIES). An toàn hơn là
      // bỏ qua toàn bộ lần trừ kho này (không ghi gì) hơn là ghi sai.
      console.error('Không tra được category sản phẩm để trừ kho thành phẩm, bỏ qua toàn bộ đơn', order.order_code, productsErr);
      return;
    }
    productCategoryById = Object.fromEntries(productsData.map((p) => [p.id, p.category]));
  }
  for (const item of items) {
    if (!item.product_id) continue;
    // Ưu tiên category thật của sản phẩm (nguồn đúng cho mọi kênh bán) —
    // chỉ rơi về category ghi trên order_item nếu sản phẩm đã bị xoá.
    const category = item.product_id in productCategoryById ? productCategoryById[item.product_id] : item.category;
    if (KEM_GROUP_CATEGORIES.includes(category)) continue;
    const branch = branchForCategory(category);
    const qty = Number(item.qty) || 0;
    if (!qty) continue;
    try {
      await upsertFinishedGoodsStock({ productId: item.product_id, size: item.size, branch }, -qty);
      await supabase.from('finished_goods_stock_out_log').insert({
        product_id: item.product_id, product_name: item.name, size: item.size || null, branch,
        qty, order_id: order.id, order_code: order.order_code,
      });
    } catch (stockErr) {
      // Đơn đã được xác nhận giao xong — không chặn luồng giao hàng nếu trừ
      // kho thất bại, chỉ cảnh báo.
      console.error('Không trừ được kho thành phẩm cho đơn', order.order_code, stockErr);
    }
  }
}

export async function fetchProductionLogs({ from, to } = {}) {
  let q = supabase.from('production_logs').select('*').order('work_date', { ascending: false });
  if (from) q = q.gte('work_date', from);
  if (to) q = q.lte('work_date', to);
  const { data, error } = await q;
  if (error) throw error;
  return data;
}

export async function createProduct({ name, category, unit, price, photoUrl }) {
  const { data, error } = await supabase.from('products').insert({ name, category, unit, price: price || 0, photo_url: photoUrl || null }).select().single();
  if (error) throw error;
  return data;
}

export async function updateProduct(id, fields) {
  const { error } = await supabase.from('products').update(fields).eq('id', id);
  if (error) throw error;
}

export async function deleteProduct(id) {
  const { error } = await supabase.from('products').delete().eq('id', id);
  if (error) throw error;
}

export async function addProductVariant(productId, { label, price }) {
  const { error } = await supabase.from('product_variants').insert({ product_id: productId, label, price: price || 0 });
  if (error) throw error;
}

export async function deleteProductVariant(id) {
  const { error } = await supabase.from('product_variants').delete().eq('id', id);
  if (error) throw error;
}

// ---- Orders ----

const ORDER_SELECT = '*, customer:customers(id, name, phone, trust_score, vip, locked), order_items(*), order_stages(*)';

export async function fetchOrders({ statuses, from, to, dateField = 'created_at', excludeOrderTypes } = {}) {
  let q = supabase.from('orders').select(ORDER_SELECT).order('created_at', { ascending: false });
  if (statuses?.length) q = q.in('status', statuses);
  if (excludeOrderTypes?.length) q = q.not('order_type', 'in', `(${excludeOrderTypes.join(',')})`);
  if (from) q = q.gte(dateField, `${from}T00:00:00+07:00`);
  if (to) q = q.lte(dateField, `${to}T23:59:59.999+07:00`);
  const { data, error } = await q;
  if (error) throw error;
  return data;
}

// Tìm nhanh đơn hàng theo mã đơn HOẶC tên khách — trả về danh sách gọn để
// hiện dropdown gợi ý (mã đơn, khách, bánh, địa chỉ), dùng chung cho mọi ô
// "Mã đơn liên quan" đang gõ tay tự do (giao việc, báo chi, tăng ca, xuất
// kho...). Không lấy full order (ORDER_SELECT quá nặng cho việc gõ-là-tìm).
export async function searchOrdersForPicker(keyword, limit = 15) {
  const q = (keyword || '').trim();
  if (!q) return [];
  const { data, error } = await supabase
    .from('order_operations_list')
    .select('id,order_code,customer_name,product_names,address,required_at')
    .or(`order_code.ilike.%${q}%,customer_name.ilike.%${q}%`)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data || [];
}

export async function fetchOrderById(id) {
  const { data, error } = await supabase.from('orders').select(ORDER_SELECT).eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
}

async function nextOrderCode() {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const { count, error } = await supabase
    .from('orders')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', startOfDay);
  if (error) throw error;
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const seq = String((count || 0) + 1).padStart(4, '0');
  return `#${mm}${dd}-${seq}`;
}

export async function createOrder({ customer, channel, items, total, note, address, deliveryDate, deliveryTime, deposit, paymentMethod, deliveryMethod, shipFee, createdByName }) {
  const cust = await findOrCreateCustomer(customer);
  const orderCode = await nextOrderCode();
  const { data: order, error } = await supabase
    .from('orders')
    .insert({
      customer_id: cust.id, channel, total: total || 0, note, address,
      delivery_date: deliveryDate, delivery_time: deliveryTime,
      delivery_method: deliveryMethod || 'giao_tan_noi', ship_fee: shipFee || 0,
      order_code: orderCode, created_by_name: createdByName || null,
      deposit: deposit || 0, paid_amount: deposit || 0, payment_method: paymentMethod, status: 'moi',
    })
    .select(ORDER_SELECT)
    .single();
  if (error) throw error;
  if (items?.length) {
    const rows = items.filter((it) => it.name).map((it) => ({
      order_id: order.id, product_id: it.productId || null, name: it.name, qty: Number(it.qty) || 1,
      size: it.size || null, cot: it.cot || null, vi: it.vi || null, price: Number(it.price) || 0,
      ref_photo_url: it.refPhotoUrl || null, category: it.category || null,
      content: it.content || null, candle: it.candle || null,
    }));
    if (rows.length) {
      const { error: itemsErr } = await supabase.from('order_items').insert(rows);
      if (itemsErr) throw itemsErr;
    }
  }
  notifyBadgesChanged();
  return order;
}

export async function updateOrderStatus(id, status) {
  const { error } = await supabase.from('orders').update({ status }).eq('id', id);
  if (error) throw error;
  notifyBadgesChanged();
  // Broadcast status change to all listeners
  await broadcastEvent(BroadcastEvents.ORDER_STATUS_CHANGED, { orderId: id, status });
  notifyOtherTabs(BroadcastEvents.ORDER_STATUS_CHANGED, { orderId: id, status });
}

export async function updateOrder(id, fields) {
  // .select() để phân biệt "đã ghi" với "RLS lọc hết hàng ở mệnh đề USING" — trường hợp
  // sau PostgREST trả về thành công nhưng 0 dòng, không có lỗi. Gắn thêm mã lỗi để phía
  // giao diện coi đây là từ chối từ server (hiện lỗi) chứ không phải mất mạng (xếp hàng).
  const { data, error } = await supabase.from('orders').update(fields).eq('id', id).select('id');
  if (error) throw error;
  if (!data || data.length === 0) {
    const err = new Error('Không cập nhật được đơn hàng — bạn không có quyền hoặc đơn không còn ở trạng thái phù hợp.');
    err.code = 'RLS_NO_ROWS';
    throw err;
  }
  notifyBadgesChanged();
  // Broadcast order update to all listeners
  await broadcastEvent(BroadcastEvents.ORDER_STATUS_CHANGED, { orderId: id, fields });
  notifyOtherTabs(BroadcastEvents.ORDER_STATUS_CHANGED, { orderId: id });
}

export async function updateOrderFull(id, { customerName, customerPhone, address, deliveryDate, deliveryTime, deliveryMethod, shipFee, total, deposit, paymentMethod, note, items }) {
  const { error } = await supabase.from('orders').update({
    address, delivery_date: deliveryDate, delivery_time: deliveryTime, delivery_method: deliveryMethod || 'giao_tan_noi',
    ship_fee: shipFee || 0, total: total || 0, deposit: deposit || 0, payment_method: paymentMethod, note,
  }).eq('id', id);
  if (error) throw error;

  if (customerName != null) {
    const { data: order, error: fetchErr } = await supabase.from('orders').select('customer_id').eq('id', id).single();
    if (fetchErr) throw fetchErr;
    if (order?.customer_id) {
      const { error: custErr } = await supabase.from('customers').update({ name: customerName, phone: customerPhone || null }).eq('id', order.customer_id);
      if (custErr) throw custErr;
    }
  }

  if (items) {
    const { error: delErr } = await supabase.from('order_items').delete().eq('order_id', id);
    if (delErr) throw delErr;
    const rows = items.filter((it) => it.name).map((it) => ({
      order_id: id, product_id: it.productId || null, name: it.name, qty: Number(it.qty) || 1,
      size: it.size || null, cot: it.cot || null, vi: it.vi || null, price: Number(it.price) || 0,
      ref_photo_url: it.refPhotoUrl || null, category: it.category || null,
      content: it.content || null, candle: it.candle || null,
    }));
    if (rows.length) {
      const { error: insErr } = await supabase.from('order_items').insert(rows);
      if (insErr) throw insErr;
    }
  }
}

export async function cancelOrder(id, { reason, photoUrl, staffName } = {}) {
  const { error } = await supabase.from('orders').update({
    status: 'huy', cancel_reason: reason || null, cancel_photo_url: photoUrl || null, cancel_staff_name: staffName || null,
  }).eq('id', id);
  if (error) throw error;
  notifyBadgesChanged();
}

export async function fetchIncidentReports({ status, limit = 100 } = {}) {
  let q = supabase.from('incident_reports').select('*').order('created_at', { ascending: false }).limit(limit);
  if (status) q = q.eq('status', status);
  const { data, error } = await q;
  if (error) throw error;
  return data;
}

export async function addIncidentReport({ orderId, orderCode, category, code, label, note, photos, reporterId, reporterName, reporterRole }) {
  const { error } = await supabase.from('incident_reports').insert({
    order_id: orderId || null, order_code: orderCode || null, category, code, label, note: note || null,
    photos: photos && photos.length > 0 ? photos : null,
    reporter_id: reporterId || null, reporter_name: reporterName || null, reporter_role: reporterRole || null,
  });
  if (error) throw error;
  notifyBadgesChanged();
}

export async function resolveIncidentReport(id) {
  const { error } = await supabase.from('incident_reports').update({ status: 'resolved', resolved_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
  notifyBadgesChanged();
}

export async function fetchOrderNotes(orderId) {
  const { data, error } = await supabase.from('order_notes').select('*').eq('order_id', orderId).order('created_at', { ascending: true });
  if (error) throw error;
  return data;
}

// Đếm số bình luận theo nhiều đơn cùng lúc — dùng cho badge 💬 trên thẻ đơn
// trong danh sách, không tải nội dung bình luận (nhẹ hơn fetchOrderNotes).
export async function fetchOrderNoteCounts(orderIds) {
  if (!orderIds || orderIds.length === 0) return {};
  const { data, error } = await supabase.from('order_notes').select('order_id').in('order_id', orderIds);
  if (error) throw error;
  const counts = {};
  (data || []).forEach((r) => { counts[r.order_id] = (counts[r.order_id] || 0) + 1; });
  return counts;
}

export async function addOrderNote({ orderId, message, attachments, noteType = 'normal', mentionedProfileIds = [] }) {
  const { data, error } = await supabase.rpc('add_order_comment', {
    p_order_id: orderId,
    p_message: message || '',
    p_attachments: attachments && attachments.length > 0 ? attachments : null,
    p_note_type: noteType,
    p_mentioned_profile_ids: mentionedProfileIds,
  });
  if (error) throw error;
  return data;
}

export async function deleteOrderNote(commentId) {
  const { data, error } = await supabase.rpc('soft_delete_order_comment', { p_comment_id: commentId });
  if (error) throw error;
  return data;
}

export async function deleteOrder(id, { reason, photoUrl, staffName, snapshot } = {}) {
  const { error: logErr } = await supabase.from('order_deletion_log').insert({
    order_code: snapshot?.orderCode || null,
    customer_name: snapshot?.customerName || null,
    items_summary: snapshot?.itemsSummary || null,
    total: snapshot?.total || 0,
    reason: reason || null,
    photo_url: photoUrl || null,
    deleted_by: staffName || null,
  });
  if (logErr) throw logErr;
  const { error: itemsErr } = await supabase.from('order_items').delete().eq('order_id', id);
  if (itemsErr) throw itemsErr;
  const { error } = await supabase.from('orders').delete().eq('id', id);
  if (error) throw error;
  notifyBadgesChanged();
}

export async function markOrderPaid(id, total) {
  const { error } = await supabase.from('orders').update({ paid_amount: total }).eq('id', id);
  if (error) throw error;
}

// ---- Storage (ảnh chụp: tem/bill kho, ảnh giao hàng) ----

const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

export async function uploadPhoto(blob, pathPrefix) {
  if (blob.size > MAX_ATTACHMENT_BYTES) throw new Error('File vượt quá 25MB');
  const contentType = blob.type || 'image/jpeg';
  const ext = contentType === 'image/png' ? 'png' : 'jpg';
  const path = `${pathPrefix}/${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from('uploads').upload(path, blob, { contentType });
  if (error) throw error;
  const { data } = supabase.storage.from('uploads').getPublicUrl(path);
  return data.publicUrl;
}

export async function fetchSchoolRevenue({ from, to } = {}) {
  let q = supabase.from('orders').select('id,order_code,total,created_at,completed_at,status_v2,address')
    .eq('order_type', 'school').neq('status_v2', 'cancelled').order('created_at', { ascending: true });
  if (from) q = q.gte('created_at', `${from}T00:00:00+07:00`);
  if (to) q = q.lte('created_at', `${to}T23:59:59.999+07:00`);
  const { data, error } = await q;
  if (error) throw error;
  return data;
}

export async function uploadFile(file, pathPrefix) {
  if (file.size > MAX_ATTACHMENT_BYTES) throw new Error('File vượt quá 25MB');
  const contentType = file.type || 'application/octet-stream';
  const originalName = file.name || 'file';
  const extMatch = originalName.match(/\.[^.]+$/);
  const ext = extMatch ? extMatch[0] : '';
  const path = `${pathPrefix}/${Date.now()}${ext}`;
  const { error } = await supabase.storage.from('uploads').upload(path, file, { contentType });
  if (error) throw error;
  const { data } = supabase.storage.from('uploads').getPublicUrl(path);
  return { url: data.publicUrl, name: originalName, type: contentType, size: file.size };
}

// ---- Warehouse ----

export async function fetchWarehouseStock() {
  const { data, error } = await supabase.from('warehouse_stock').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function addWarehouseStock({ name, qtyLabel, unit, qty, costPerUnit, status, expiryDate, photoUrl, branch, staffName }) {
  const trimmedName = (name || '').trim();
  const targetBranch = branch || 'bakery';
  const { data: existing, error: findErr } = await supabase
    .from('warehouse_stock').select('*').eq('branch', targetBranch).ilike('name', trimmedName).maybeSingle();
  if (findErr) throw findErr;

  let stockId;
  if (existing) {
    const newQty = Number(existing.qty || 0) + Number(qty || 0);
    const { error: updErr } = await supabase.from('warehouse_stock').update({
      qty: newQty, qty_label: `${newQty} ${unit || existing.unit}`,
      cost_per_unit: costPerUnit || existing.cost_per_unit,
      status: status || existing.status, expiry_date: expiryDate || existing.expiry_date,
      photo_url: photoUrl || existing.photo_url,
    }).eq('id', existing.id);
    if (updErr) throw updErr;
    stockId = existing.id;
  } else {
    const { data: created, error: insErr } = await supabase.from('warehouse_stock').insert({
      name: trimmedName, qty_label: qtyLabel, unit: unit || 'g', qty: qty || 0, cost_per_unit: costPerUnit || 0,
      status, expiry_date: expiryDate || null, photo_url: photoUrl || null, branch: targetBranch,
    }).select('id').single();
    if (insErr) throw insErr;
    stockId = created.id;
  }

  const { error: logErr } = await supabase.from('warehouse_stock_in_log').insert({
    stock_id: stockId, name: trimmedName, qty: qty || 0, unit: unit || 'g', cost_per_unit: costPerUnit || 0,
    photo_url: photoUrl || null, staff_name: staffName || null,
  });
  if (logErr) throw logErr;
  notifyBadgesChanged();
}

export async function updateWarehouseStock(id, fields) {
  const { error } = await supabase.from('warehouse_stock').update(fields).eq('id', id);
  if (error) throw error;
}

export async function deductWarehouseStock({ stockId, name, qty, unit, remainingQty, orderCode, note, staffName }) {
  const { error: logErr } = await supabase.from('warehouse_stock_out_log').insert({
    stock_id: stockId, name, qty, unit: unit || 'g', order_code: orderCode || null, note: note || null, staff_name: staffName || null,
  });
  if (logErr) throw logErr;
  const { error } = await supabase.from('warehouse_stock').update({ qty: remainingQty, qty_label: `${remainingQty} ${unit}` }).eq('id', stockId);
  if (error) throw error;
}

export async function fetchWarehouseStockOutLog(limit = 100) {
  const { data, error } = await supabase.from('warehouse_stock_out_log').select('*').order('created_at', { ascending: false }).limit(limit);
  if (error) throw error;
  return data;
}

export async function fetchWarehouseStockInLog(limit = 100) {
  const { data, error } = await supabase.from('warehouse_stock_in_log').select('*').order('created_at', { ascending: false }).limit(limit);
  if (error) throw error;
  return data;
}

// ---- Kho bánh thành phẩm ----

// Cộng/trừ tồn kho thành phẩm cho đúng 1 dòng (product_id, size, branch).
// delta dương = nhập, âm = xuất (được phép âm nếu bán trước khi kịp ghi
// sản xuất). Trả về số dư mới để caller ghi log đúng số.
async function upsertFinishedGoodsStock({ productId, size, branch }, delta) {
  const normalizedSize = size || null;
  let row, findError;
  if (normalizedSize === null) {
    const res = await supabase.from('finished_goods_stock').select('*')
      .eq('product_id', productId).eq('branch', branch).is('size', null).maybeSingle();
    row = res.data; findError = res.error;
  } else {
    const res = await supabase.from('finished_goods_stock').select('*')
      .eq('product_id', productId).eq('branch', branch).eq('size', normalizedSize).maybeSingle();
    row = res.data; findError = res.error;
  }
  if (findError) throw findError;

  if (row) {
    const newQty = Number(row.qty || 0) + delta;
    const { error } = await supabase.from('finished_goods_stock')
      .update({ qty: newQty, updated_at: new Date().toISOString() }).eq('id', row.id);
    if (error) throw error;
    return newQty;
  }
  const { error } = await supabase.from('finished_goods_stock')
    .insert({ product_id: productId, size: normalizedSize, branch, qty: delta });
  if (error) throw error;
  return delta;
}

// Nhập kho thành phẩm V2 (mockup finished-goods-inventory-v2) — có hạn dùng,
// ảnh, ngày sản xuất, cửa hàng (Vĩnh Phú 42/Quốc Lộ 13), quy cách, màu
// (Macaron). Ghi đè metadata lô lên dòng tồn gộp sẵn có — xem giới hạn "1 lô
// đại diện, không FIFO nhiều lô" ghi trong migration 202608270080.
export async function addFinishedGoodsEntryV2({
  productId, productName, size, branch, storeLocation, qty,
  productionDate, expiryDate, photoUrl, color, packing, staffName,
  // Kho Bán Thành Phẩm (generic, mặc định false — không đổi hành vi cũ cho
  // bất kỳ nơi gọi nào khác): true = đây là hàng CHƯA hoàn thiện (vd vỏ
  // Macaron chưa bơm nhân), giữ tách riêng khỏi tồn thành phẩm cùng product/branch.
  isSemiFinished = false,
}) {
  const normalizedSize = size || null;
  const normalizedStore = storeLocation || null;
  let q = supabase.from('finished_goods_stock').select('*')
    .eq('product_id', productId).eq('branch', branch).eq('is_semi_finished', isSemiFinished);
  q = normalizedSize === null ? q.is('size', null) : q.eq('size', normalizedSize);
  q = normalizedStore === null ? q.is('store_location', null) : q.eq('store_location', normalizedStore);
  const { data: row, error: findErr } = await q.maybeSingle();
  if (findErr) throw findErr;

  const meta = {
    production_date: productionDate || null, expiry_date: expiryDate || null,
    photo_url: photoUrl || null, color: color || null, packing: packing || null,
  };
  const delta = Number(qty) || 0;

  if (row) {
    const newQty = Number(row.qty || 0) + delta;
    const { error } = await supabase.from('finished_goods_stock')
      .update({ qty: newQty, updated_at: new Date().toISOString(), ...meta }).eq('id', row.id);
    if (error) throw error;
  } else {
    const { error } = await supabase.from('finished_goods_stock').insert({
      product_id: productId, size: normalizedSize, branch, store_location: normalizedStore, qty: delta,
      is_semi_finished: isSemiFinished, ...meta,
    });
    if (error) throw error;
  }

  await supabase.from('finished_goods_stock_in_log').insert({
    product_id: productId, product_name: productName, size: normalizedSize, branch,
    store_location: normalizedStore, qty: delta, source: 'nhap_kho_v2', staff_name: staffName || null,
    ...meta,
  });
}

// Kho Bán Thành Phẩm -> Thành Phẩm: bộ phận nhận hàng bán thành phẩm (vd Bếp
// Lạnh nhận vỏ Macaron) bấm "Đã hoàn thiện" — trừ đúng dòng bán thành phẩm,
// cộng vào dòng thành phẩm CÙNG branch (chuyển trạng thái, không đổi khâu sở
// hữu kho). Generic — không hardcode riêng macaron, dùng lại được cho luồng
// bán thành phẩm khác sau này.
export async function completeSemiFinishedToFinished({
  stockId, productId, productName, size, branch, qty,
  productionDate, expiryDate, photoUrl, staffName,
}) {
  const { data: row, error: rowErr } = await supabase.from('finished_goods_stock').select('*').eq('id', stockId).single();
  if (rowErr) throw rowErr;
  const delta = Number(qty) || 0;
  if (delta <= 0) throw new Error('Số lượng phải lớn hơn 0');
  if (Number(row.qty || 0) < delta) throw new Error(`Kho bán thành phẩm chỉ còn ${row.qty}, không đủ ${delta}`);

  const { error: updErr } = await supabase.from('finished_goods_stock')
    .update({ qty: Number(row.qty) - delta, updated_at: new Date().toISOString() }).eq('id', stockId);
  if (updErr) throw updErr;

  await supabase.from('finished_goods_stock_out_log').insert({
    product_id: productId, product_name: productName, size: size || null, branch, qty: delta,
  });

  await addFinishedGoodsEntryV2({
    productId, productName, size: size || null, branch, storeLocation: null, qty: delta,
    productionDate: productionDate || row.production_date, expiryDate: expiryDate || row.expiry_date,
    photoUrl: photoUrl || row.photo_url, staffName, isSemiFinished: false,
  });
}

export async function fetchFinishedGoodsStock() {
  const { data, error } = await supabase.from('finished_goods_stock').select('*').order('updated_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function fetchFinishedGoodsStockInLog(limit = 100) {
  const { data, error } = await supabase.from('finished_goods_stock_in_log').select('*').order('created_at', { ascending: false }).limit(limit);
  if (error) throw error;
  return data;
}

export async function fetchFinishedGoodsStockOutLog(limit = 100) {
  const { data, error } = await supabase.from('finished_goods_stock_out_log').select('*').order('created_at', { ascending: false }).limit(limit);
  if (error) throw error;
  return data;
}

export async function adjustFinishedGoodsStock({ productId, productName, size, branch, newQty, note, staffName }) {
  const normalizedSize = size || null;
  let current;
  if (normalizedSize === null) {
    const { data, error } = await supabase.from('finished_goods_stock').select('*')
      .eq('product_id', productId).eq('branch', branch).is('size', null).maybeSingle();
    if (error) throw error;
    current = data;
  } else {
    const { data, error } = await supabase.from('finished_goods_stock').select('*')
      .eq('product_id', productId).eq('branch', branch).eq('size', normalizedSize).maybeSingle();
    if (error) throw error;
    current = data;
  }
  const currentQty = Number(current?.qty || 0);
  const delta = Number(newQty) - currentQty;
  if (delta === 0) return;

  if (current) {
    const { error } = await supabase.from('finished_goods_stock')
      .update({ qty: Number(newQty), updated_at: new Date().toISOString() }).eq('id', current.id);
    if (error) throw error;
  } else {
    const { error } = await supabase.from('finished_goods_stock')
      .insert({ product_id: productId, size: normalizedSize, branch, qty: Number(newQty) });
    if (error) throw error;
  }

  const logTable = delta > 0 ? 'finished_goods_stock_in_log' : 'finished_goods_stock_out_log';
  const logRow = {
    product_id: productId, product_name: productName, size: normalizedSize, branch,
    qty: Math.abs(delta), note: note || null, source: 'adjustment', staff_name: staffName || null,
  };
  const { error: logErr } = await supabase.from(logTable).insert(logRow);
  if (logErr) throw logErr;
}

// ---- Công thức sản phẩm (BOM) — tính giá vốn ----

export async function fetchProductRecipes(productId) {
  const { data, error } = await supabase
    .from('product_recipes')
    .select('*, ingredient:warehouse_stock(id, name, unit, cost_per_unit)')
    .eq('product_id', productId);
  if (error) throw error;
  return data;
}

export async function addRecipeItem({ productId, ingredientId, qtyPerUnit }) {
  const { error } = await supabase.from('product_recipes').insert({ product_id: productId, ingredient_id: ingredientId, qty_per_unit: qtyPerUnit || 0 });
  if (error) throw error;
}

export async function deleteRecipeItem(id) {
  const { error } = await supabase.from('product_recipes').delete().eq('id', id);
  if (error) throw error;
}

// ---- Cashbook ----

export async function fetchCashbookEntries({ since } = {}) {
  let q = supabase.from('cashbook_entries').select('*').order('occurred_at', { ascending: false });
  if (since) q = q.gte('occurred_at', since);
  const { data, error } = await q;
  if (error) throw error;
  return data;
}

export async function addCashbookEntry({ type, label, amount }) {
  const { error } = await supabase.from('cashbook_entries').insert({ type, label, amount });
  if (error) throw error;
}

// ---- Công nợ nhà cung cấp ----

export async function fetchDebts() {
  const { data, error } = await supabase.from('debts').select('*').order('due_date', { ascending: true, nullsFirst: false });
  if (error) throw error;
  return data;
}

export async function addDebt({ supplierName, amount, dueDate, note }) {
  const { error } = await supabase.from('debts').insert({ supplier_name: supplierName, amount: amount || 0, due_date: dueDate || null, note: note || null });
  if (error) throw error;
}

export async function markDebtPaid(id, { supplierName, amount }) {
  const { error: e1 } = await supabase.from('debts').update({ status: 'da_tra', paid_at: new Date().toISOString() }).eq('id', id);
  if (e1) throw e1;
  const { error: e2 } = await supabase.from('cashbook_entries').insert({ type: 'chi', label: `Trả nợ NCC — ${supplierName}`, amount: amount || 0 });
  if (e2) throw e2;
}

// ---- Chốt ca / đối chiếu tiền mặt cuối ngày ----

export async function fetchCashReconciliations({ date } = {}) {
  let q = supabase.from('cash_reconciliations').select('*').order('created_at', { ascending: false });
  if (date) q = q.eq('work_date', date);
  const { data, error } = await q;
  if (error) throw error;
  return data;
}

export async function addCashReconciliation({ workDate, branch, expectedCash, actualCash, staffName, note }) {
  const difference = (Number(actualCash) || 0) - (Number(expectedCash) || 0);
  const { error } = await supabase.from('cash_reconciliations').insert({
    work_date: workDate, branch: branch || null, expected_cash: expectedCash || 0, actual_cash: actualCash || 0,
    difference, staff_name: staffName || null, note: note || null,
  });
  if (error) throw error;
}

// ---- Ca làm việc (chấm công / trễ giờ / xin nghỉ đột xuất) ----

export async function fetchShiftConfigs() {
  const { data, error } = await supabase.from('shift_configs').select('*').order('start_time', { ascending: true });
  if (error) throw error;
  return data;
}

export async function addShiftConfig({ label, branch, startTime, endTime, wagePerShift }) {
  const { error } = await supabase.from('shift_configs').insert({ label, branch: branch || null, start_time: startTime, end_time: endTime || null, wage_per_shift: wagePerShift || 0 });
  if (error) throw error;
}

export async function deleteShiftConfig(id) {
  const { error } = await supabase.from('shift_configs').delete().eq('id', id);
  if (error) throw error;
}

export async function updateShiftConfig(id, { label, branch, startTime, endTime, wagePerShift } = {}) {
  const fields = {};
  if (label !== undefined) fields.label = label;
  if (branch !== undefined) fields.branch = branch || null;
  if (startTime !== undefined) fields.start_time = startTime;
  if (endTime !== undefined) fields.end_time = endTime || null;
  if (wagePerShift !== undefined) fields.wage_per_shift = wagePerShift;
  const { error } = await supabase.from('shift_configs').update(fields).eq('id', id);
  if (error) throw error;
}

export async function fetchShiftLogs({ date } = {}) {
  let q = supabase.from('shift_logs').select('*').order('created_at', { ascending: false });
  if (date) q = q.eq('work_date', date);
  const { data, error } = await q;
  if (error) throw error;
  return data;
}

export async function fetchShiftLogsRange(fromDate, toDate) {
  const { data, error } = await supabase
    .from('shift_logs').select('*')
    .gte('work_date', fromDate).lte('work_date', toDate)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

// Tách chuỗi "10.912,106.735" mà màn hình chấm công gửi lên thành hai số.
//
// ⚠️ LỖI CŨ ĐÃ TỪNG XẢY RA Ở ĐÂY: hàm `addShiftCheckin` nhận `gpsCoords` trong
// payload nhưng KHÔNG khai báo trường đó, nên JavaScript âm thầm bỏ qua và chưa
// một lần chấm công nào có toạ độ được lưu. Nhân viên vẫn thấy "đã lấy vị trí"
// trên màn hình và tin là hệ thống có ghi. Không có lỗi nào bắn ra.
// => Thêm trường mới vào đây thì PHẢI thêm cả vào lệnh insert bên dưới.
function tachToaDo(gpsCoords) {
  if (!gpsCoords) return { lat: null, lng: null };
  const [lat, lng] = String(gpsCoords).split(',').map((x) => Number(String(x).trim()));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return { lat: null, lng: null };
  return { lat, lng };
}

export async function addShiftCheckin({ staffId, staffName, workDate, shiftLabel, branch, expectedStart, lateMinutes, wageEarned, reason, photoUrl, gpsCoords, gpsAccuracy }) {
  const { lat, lng } = tachToaDo(gpsCoords);
  const { error } = await supabase.from('shift_logs').insert({
    staff_id: staffId, staff_name: staffName, work_date: workDate, shift_label: shiftLabel, branch: branch || null,
    expected_start: expectedStart, type: 'checkin', checkin_time: new Date().toISOString(),
    late_minutes: lateMinutes || 0, wage_earned: wageEarned || 0, reason: reason || null, photo_url: photoUrl || null,
    gps_lat: lat, gps_lng: lng, gps_accuracy_m: Number.isFinite(gpsAccuracy) ? gpsAccuracy : null,
  });
  if (error) {
    if (error.code === '23505') throw new Error('Bạn đã chấm công vào ca này rồi.');
    throw error;
  }
}

export async function addLeaveRequest({ staffId, staffName, workDate, shiftLabel, branch, reason, photoUrl, leaveFromAt, leaveToAt }) {
  const { error } = await supabase.from('shift_logs').insert({
    staff_id: staffId, staff_name: staffName, work_date: workDate, shift_label: shiftLabel, branch: branch || null,
    type: 'leave_request', reason: reason || null, photo_url: photoUrl || null,
    leave_from_at: leaveFromAt || null, leave_to_at: leaveToAt || null,
  });
  if (error) throw error;
}

export async function addShiftCheckout({ staffId, staffName, workDate, shiftLabel, branch, photoUrl, gpsCoords, gpsAccuracy }) {
  const { lat, lng } = tachToaDo(gpsCoords);
  const { error } = await supabase.from('shift_logs').insert({
    staff_id: staffId, staff_name: staffName, work_date: workDate, shift_label: shiftLabel, branch: branch || null,
    type: 'checkout', checkin_time: new Date().toISOString(), photo_url: photoUrl || null,
    gps_lat: lat, gps_lng: lng, gps_accuracy_m: Number.isFinite(gpsAccuracy) ? gpsAccuracy : null,
  });
  if (error) {
    // Ca này đã kết thúc rồi (bấm trùng, hoặc index cũ chưa gỡ dưới database) —
    // hiện thông báo dễ hiểu thay vì để lộ nguyên câu lỗi Postgres ra màn hình.
    if (error.code === '23505') throw new Error('Ca này đã được kết thúc rồi, không thể ghi thêm lần nữa.');
    throw error;
  }
}

export async function deleteShiftLog(id) {
  const { error } = await supabase.from('shift_logs').delete().eq('id', id);
  if (error) throw error;
}

export async function fetchShiftSchedule({ station, from, to }) {
  const { data, error } = await supabase
    .from('shift_schedule').select('*')
    .eq('station', station).gte('work_date', from).lte('work_date', to)
    .order('work_date', { ascending: true });
  if (error) throw error;
  return data;
}

export async function addShiftScheduleEntry({ station, workDate, shiftConfigId, staffId, staffName, createdBy }) {
  const { error } = await supabase.from('shift_schedule').insert({
    station, work_date: workDate, shift_config_id: shiftConfigId,
    staff_id: staffId, staff_name: staffName, created_by: createdBy || null,
  });
  if (error) {
    if (error.code === '23505') {
      throw new Error(station === 'bakery' ? 'Bakery chỉ được 1 người/ca.' : 'Người này đã có trong ca này.');
    }
    throw error;
  }
}

export async function removeShiftScheduleEntry(id) {
  const { data, error } = await supabase.from('shift_schedule').delete().eq('id', id).select();
  if (error) throw error;
  if (!data || data.length === 0) throw new Error('Không thể xoá — có thể bạn không có quyền.');
}

export async function updateProfileStation(id, station) {
  const { error } = await supabase.from('profiles').update({ station: station || null }).eq('id', id);
  if (error) throw error;
}

export async function updateStaffPermissions(id, { role, station, extraRoles }) {
  const { error } = await supabase.from('profiles').update({
    role: role || null,
    station: station || null,
    extra_roles: extraRoles || []
  }).eq('id', id);
  if (error) throw error;
}

// Trách nhiệm + Ngày bắt đầu làm việc — cùng cách ghi trực tiếp như
// updateStaffPermissions ở trên (RLS profiles đã cho phép quản lý ghi thẳng).
export async function updateStaffWorkInfo(id, { responsibilities, startDate }) {
  const { error } = await supabase.from('profiles').update({
    responsibilities: responsibilities?.trim() || null,
    start_date: startDate || null,
  }).eq('id', id);
  if (error) throw error;
}

// Giờ quy định ca làm việc (sumi_quy_dinh_ca) — ghi thẳng, RLS chỉ cho
// is_business_director() (owner/admin) qua policy thêm ở migration
// 202609022200. Sửa ở đây ảnh hưởng NGAY tới toàn bộ nhân sự bộ phận đó
// (Chấm công, làm tròn giờ trễ, Audio Push nhắc trễ đều đọc lại bảng này).
export async function updateShiftRule(id, { gioBatDau, soGioChuan, phutDenSomToiThieu }) {
  const { error } = await supabase.from('sumi_quy_dinh_ca').update({
    gio_bat_dau: gioBatDau,
    so_gio_chuan: soGioChuan,
    phut_den_som_toi_thieu: phutDenSomToiThieu,
    updated_at: new Date().toISOString(),
  }).eq('id', id);
  if (error) throw error;
}

// ---- Ca làm QUY ĐỊNH riêng cho TỪNG cá nhân (Individual Shift Override) ----
// Tái dùng ĐÚNG bảng sumi_quy_dinh_ca (dùng id nhân viên làm bo_phan) — cơ
// chế này đã tồn tại từ migration 202608300800 (11 người đã được set thẳng
// bằng SQL, chưa có UI). RLS bảng này chỉ owner/admin ghi được
// (is_business_director(), 202609022200) — cùng quyền với "Sửa giờ quy định
// cả bộ phận" nên ghi thẳng, không cần RPC riêng.
export function tinhSoGioChuan(gioBatDau, gioKetThuc) {
  const [h1, m1] = gioBatDau.split(':').map(Number);
  const [h2, m2] = gioKetThuc.split(':').map(Number);
  let phut = (h2 * 60 + m2) - (h1 * 60 + m1);
  if (phut <= 0) phut += 1440; // ca qua đêm
  return Math.round((phut / 60) * 100) / 100;
}

export async function fetchCaRiengCaNhan(staffId) {
  const { data, error } = await supabase.from('sumi_quy_dinh_ca')
    .select('*').eq('bo_phan', staffId).eq('active', true).maybeSingle();
  if (error) throw error;
  return data;
}

export async function upsertCaRiengCaNhan({ staffId, staffName, gioBatDau, gioKetThuc, khongNghiTrua }) {
  if (!gioBatDau || !gioKetThuc) throw new Error('Chọn đủ giờ bắt đầu và giờ kết thúc.');
  const soGioChuan = tinhSoGioChuan(gioBatDau, gioKetThuc);
  const hienCo = await fetchCaRiengCaNhan(staffId);
  const payload = {
    bo_phan: staffId, ma_ca: 'rieng', ten_ca: `Ca riêng — ${staffName || 'Nhân sự'}`,
    gio_bat_dau: gioBatDau, so_gio_chuan: soGioChuan,
    phut_den_som_toi_thieu: hienCo?.phut_den_som_toi_thieu ?? 10,
    khong_nghi_trua: !!khongNghiTrua, active: true, updated_at: new Date().toISOString(),
  };
  const { error } = hienCo
    ? await supabase.from('sumi_quy_dinh_ca').update(payload).eq('id', hienCo.id)
    : await supabase.from('sumi_quy_dinh_ca').insert(payload);
  if (error) throw error;
}

export async function xoaCaRiengCaNhan(staffId) {
  const { error } = await supabase.from('sumi_quy_dinh_ca')
    .update({ active: false, updated_at: new Date().toISOString() })
    .eq('bo_phan', staffId).eq('active', true);
  if (error) throw error;
}

// ---- Chia công đoạn bếp (gán nhân viên đang trực vào công đoạn của đơn) ----

export async function createOrderStages(rows) {
  const { error } = await supabase.from('order_stages').insert(rows);
  if (error) throw error;
  notifyBadgesChanged();
}

export async function fetchOrderStagesRange(fromDate, toDate) {
  const { data, error } = await supabase
    .from('order_stages')
    .select('*')
    .gte('started_at', `${fromDate}T00:00:00+07:00`)
    .lte('started_at', `${toDate}T23:59:59.999+07:00`);
  if (error) throw error;
  return data;
}

export async function startOrderStage(id) {
  const { error } = await supabase.from('order_stages').update({ status: 'dang_lam', started_at: new Date().toISOString() }).eq('id', id).eq('status', 'cho_lam');
  if (error) throw error;
  notifyBadgesChanged();
}

export async function completeOrderStage(id) {
  const { error } = await supabase.from('order_stages').update({ status: 'hoan_thanh', ended_at: new Date().toISOString() }).eq('id', id).eq('status', 'dang_lam');
  if (error) throw error;
  notifyBadgesChanged();
}

export async function reassignOrderStage(id, { assigneeId, assigneeName }) {
  const { error } = await supabase.from('order_stages').update({ assignee_id: assigneeId, assignee_name: assigneeName }).eq('id', id);
  if (error) throw error;
  notifyBadgesChanged();
}

// ---- Yêu cầu duyệt hợp nhất (sửa/hủy/xoá đơn, chấm công lại) ----

export async function createApprovalRequest({ type, orderId, orderCode, shiftLogId, requesterId, requesterName, requesterRole, reason, photoUrl, leaveDate, taskId }) {
  const { error } = await supabase.from('approval_requests').insert({
    type, order_id: orderId || null, order_code: orderCode || null, shift_log_id: shiftLogId || null,
    requester_id: requesterId || null, requester_name: requesterName || null, requester_role: requesterRole || null,
    reason: reason || null, photo_url: photoUrl || null, leave_date: leaveDate || null, task_id: taskId || null,
  });
  if (error) throw error;
  notifyBadgesChanged();
}

export async function fetchApprovalRequests({ status, type, leaveFrom, leaveTo } = {}) {
  let q = supabase.from('approval_requests').select('*').order('created_at', { ascending: false });
  if (status) q = q.eq('status', status);
  if (type) q = q.eq('type', type);
  if (leaveFrom) q = q.gte('leave_date', leaveFrom);
  if (leaveTo) q = q.lte('leave_date', leaveTo);
  const { data, error } = await q;
  if (error) throw error;
  return data;
}

export async function countNewOrders() {
  const { count, error } = await supabase.from('orders').select('id', { count: 'exact', head: true }).eq('status', 'moi');
  if (error) throw error;
  return count || 0;
}

export async function countKitchenActiveOrders() {
  const { count, error } = await supabase.from('orders').select('id', { count: 'exact', head: true }).in('status', ['moi', 'dang_lam']);
  if (error) throw error;
  return count || 0;
}

export async function countPendingApprovals() {
  const { count, error } = await supabase.from('approval_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending');
  if (error) throw error;
  return count || 0;
}

export async function countOpenIncidents({ categories } = {}) {
  let q = supabase.from('incident_reports').select('id', { count: 'exact', head: true }).eq('status', 'open');
  if (categories?.length) q = q.in('category', categories);
  const { count, error } = await q;
  if (error) throw error;
  return count || 0;
}

export async function fetchOpenIncidentOrderIds() {
  const { data, error } = await supabase.from('incident_reports').select('order_id').eq('status', 'open').not('order_id', 'is', null);
  if (error) throw error;
  return new Set(data.map((r) => r.order_id));
}

// Duyệt / từ chối một đề xuất.
//
// ⚠️ TRƯỚC 26/08/2026 hàm này ghi THẲNG vào bảng. Nghĩa là ai đã đăng nhập, mở
// F12 lên, cũng tự duyệt được đơn xin nghỉ CỦA CHÍNH MÌNH — giao diện ẩn nút
// nhưng ẩn nút không phải là chặn. Nay quyền UPDATE đã bị rút khỏi vai trò
// `authenticated`, mọi quyết định đi qua RPC `sumi_duyet_de_xuat`. Chính hàm
// dưới database quyết người bấm đang đứng cấp nào, và chặn tự duyệt.
//
// `resolvedBy` giữ lại cho tương thích với màn hình cũ nhưng KHÔNG còn được
// dùng — tên người duyệt lấy từ phiên đăng nhập, không lấy từ trình duyệt.
export async function resolveApprovalRequest(id, { status, note } = {}) {
  const { data, error } = await supabase.rpc('sumi_duyet_de_xuat', {
    p_id: id,
    p_dong_y: status === 'approved',
    p_ghi_chu: note || null,
  });
  if (error) {
    if (/function .* does not exist|schema cache/i.test(error.message || '')) {
      throw new Error('Máy chủ chưa bật luồng duyệt hai cấp. Báo quản trị chạy bản cập nhật database.');
    }
    throw error;
  }
  if (data && data.thanh_cong === false) throw new Error(data.thong_bao || 'Không duyệt được đề xuất.');
  notifyBadgesChanged();
  return data;
}

// Gửi một đề xuất mới. Người gửi luôn là người đang đăng nhập — hàm dưới
// database lấy từ phiên, không nhận từ trình duyệt, nên không ai gửi được đơn
// dưới tên đồng nghiệp.
export async function guiDeXuat({ type, reason, leaveDate, leaveTo, leaveScope, leaveKind, orderCode, photoUrl }) {
  const { data, error } = await supabase.rpc('sumi_gui_de_xuat', {
    p_type: type,
    p_reason: reason,
    p_leave_date: leaveDate || null,
    p_leave_to: leaveTo || null,
    p_leave_scope: leaveScope || null,
    p_leave_kind: leaveKind || null,
    p_order_code: orderCode || null,
    p_photo_url: photoUrl || null,
  });
  if (error) {
    if (/function .* does not exist|schema cache/i.test(error.message || '')) {
      throw new Error('Máy chủ chưa bật tính năng gửi đề xuất. Báo quản trị chạy bản cập nhật database.');
    }
    throw error;
  }
  if (data && data.thanh_cong === false) throw new Error(data.thong_bao || 'Không gửi được đề xuất.');
  notifyBadgesChanged();
  return data;
}

// ---- Cấu hình tiệm (vị trí GPS, giá xăng, tốc độ trung bình) ----

export async function fetchShopSettings() {
  const { data, error } = await supabase.from('shop_settings').select('*').eq('id', 1).maybeSingle();
  if (error) throw error;
  return data;
}

export async function updateShopSettings(fields) {
  const { error } = await supabase.from('shop_settings').update(fields).eq('id', 1);
  if (error) throw error;
}

// ---- Sao lưu toàn bộ dữ liệu (owner) — xuất ra 1 file JSON để lưu trữ ngoài ----

export async function backupAllData() {
  const [orders, customers, products, warehouseStock, incidentReports, staff] = await Promise.all([
    fetchOrders(),
    fetchCustomers(),
    fetchProducts(),
    fetchWarehouseStock(),
    fetchIncidentReports({ limit: 1000 }),
    fetchAllProfiles(),
  ]);
  return {
    exported_at: new Date().toISOString(),
    orders, customers, products, warehouse_stock: warehouseStock, incident_reports: incidentReports, staff,
  };
}

// ---- RBAC & Role-based access control ----

export async function fetchReportsForUser(userId, userRole, { limit = 100, from, to } = {}) {
  let q = supabase.from('reports').select('*, creator:profiles(id, name, role)').order('created_at', { ascending: false }).limit(limit);

  // Role-based filtering
  const roleLevel = { admin: 6, accountant: 5, warehouse: 4, sale: 3, bakery: 2, shipper: 1 }[userRole] || 0;

  if (userRole === 'admin') {
    // Admin sees all reports
  } else if (['accountant', 'warehouse', 'sale', 'bakery'].includes(userRole)) {
    // Managers see reports from own role and subordinates
    const subordinateRoles = {
      accountant: ['accountant', 'sale', 'bakery', 'shipper'],
      warehouse: ['warehouse', 'bakery'],
      sale: ['sale'],
      bakery: ['bakery'],
    }[userRole] || [userRole];
    q = q.in('creator_role', subordinateRoles).or(`creator_id.eq.${userId}`);
  } else {
    // Staff only see own reports
    q = q.eq('creator_id', userId);
  }

  if (from) q = q.gte('created_at', `${from}T00:00:00+07:00`);
  if (to) q = q.lte('created_at', `${to}T23:59:59.999+07:00`);

  const { data, error } = await q;
  if (error) throw error;
  return data;
}

export async function createReport({ creatorId, creatorName, creatorRole, title, content, reportType, relatedOrderId }) {
  const { data, error } = await supabase.from('reports').insert({
    creator_id: creatorId,
    creator_name: creatorName,
    creator_role: creatorRole,
    title,
    content,
    report_type: reportType,
    related_order_id: relatedOrderId,
    created_at: new Date().toISOString(),
  }).select().single();
  if (error) throw error;
  return data;
}

// "Cấp lại mật khẩu nhanh" — không qua email, gọi Edge Function
// admin-reset-password (giữ SERVICE_ROLE_KEY phía server, không lộ ra
// client). Quyền ai được đổi mật khẩu của ai do chính hàm đó kiểm tra qua
// RPC la_quan_ly_cua_ho_so — không kiểm tra lại phía client vì không đáng
// tin (client luôn có thể bị sửa).
export async function resetStaffPassword({ staffId, newPassword }) {
  const { data, error } = await supabase.functions.invoke('admin-reset-password', {
    body: { staffId, newPassword },
  });
  if (error) throw error;
  if (data && data.success === false) throw new Error(data.message || 'Không cấp lại được mật khẩu.');
  return data;
}

export async function fetchProfilesByRole(role) {
  const { data, error } = await supabase.from('profiles').select('*').eq('role', role).order('created_at', { ascending: true });
  if (error) throw error;
  return data;
}

export async function fetchSubordinates(userRole, managerId) {
  const subordinateRoles = {
    admin: ['admin', 'accountant', 'warehouse', 'sale', 'bakery', 'shipper'],
    accountant: ['accountant', 'sale', 'bakery', 'shipper'],
    warehouse: ['warehouse', 'bakery'],
    sale: ['sale'],
    bakery: ['bakery'],
  }[userRole] || [userRole];

  const { data, error } = await supabase.from('profiles').select('*').in('role', subordinateRoles).eq('manager_id', managerId).order('created_at', { ascending: true });
  if (error) throw error;
  return data;
}

// --- Task management: daily checklist templates ---

export async function fetchTaskTemplates({ active = true } = {}) {
  let q = supabase.from('task_templates').select('*').order('created_at', { ascending: true });
  if (active !== null) q = q.eq('active', active);
  const { data, error } = await q;
  if (error) throw error;
  return data;
}

export async function createTaskTemplate({ title, description, station, assigneeId, recurrence='daily', weekdays=[], dayOfMonth=null, scheduledTime=null, remindMinutes=15, kpiDiem=0 }) {
  const { error } = await supabase.rpc('create_recurring_todo', {
    p_title:title,p_description:description||null,p_assignee_id:assigneeId||null,p_station:station||null,p_recurrence:recurrence,
    p_weekdays:weekdays,p_day_of_month:dayOfMonth,p_scheduled_time:scheduledTime||null,p_remind_minutes:remindMinutes,p_kpi_diem:kpiDiem||0,
  });
  if (error) throw error;
  notifyBadgesChanged();
}

export async function deleteTaskTemplate(id) {
  const { error } = await supabase.rpc('delete_recurring_todo',{p_template_id:id});
  if(error)throw error;notifyBadgesChanged();
}

export async function updateTaskTemplate(id, { title, station, active }) {
  const fields = {};
  if (title !== undefined) fields.title = title;
  if (station !== undefined) fields.station = station || null;
  if (active !== undefined) fields.active = active;
  const { error } = await supabase.from('task_templates').update(fields).eq('id', id);
  if (error) throw error;
  notifyBadgesChanged();
}

// --- Task management: daily checklist completions ---

export async function fetchTaskCompletions({ date, staffId } = {}) {
  let q = supabase.from('task_completions').select('*').eq('date', date);
  if (staffId) q = q.eq('staff_id', staffId);
  const { data, error } = await q;
  if (error) throw error;
  return data;
}

export async function setTaskCompletion({ templateId, staffId, date, completed }) {
  const { error } = await supabase.rpc('set_daily_todo_completion',{p_template_id:templateId,p_date:date,p_completed:completed});
  if (error) throw error;
  notifyBadgesChanged();
}

// Xác nhận checklist qua RPC (không UPDATE thẳng bảng nữa) — RPC vừa xác
// nhận vừa ghi điểm KPI vào task_kpi_logs theo kpi_diem của template, xem
// migration 202609031600_diem_kpi_checklist_hang_ngay.sql.
export async function confirmTaskCompletion(id) {
  const { data, error } = await supabase.rpc('sumi_xac_nhan_checklist', { p_completion_id: id });
  if (error) throw error;
  if (data && data.thanh_cong === false) throw new Error(data.thong_bao || 'Không xác nhận được.');
  notifyBadgesChanged();
  return data;
}

// --- Task management: assigned & ad-hoc tasks ---

export async function fetchTasks({ assigneeId, category, status, createdFrom, createdTo } = {}) {
  let q = supabase.from('tasks').select('*').order('created_at', { ascending: false });
  if (assigneeId) q = q.eq('assignee_id', assigneeId);
  if (category) q = q.eq('category', category);
  if (status) q = q.eq('status', status);
  if (createdFrom) q = q.gte('created_at', `${createdFrom}T00:00:00+07:00`);
  if (createdTo) q = q.lte('created_at', `${createdTo}T23:59:59.999+07:00`);
  const { data, error } = await q;
  if (error) throw error;
  return data;
}

export async function createAssignedTasks(rows) {
  for(const r of rows){const{error}=await supabase.rpc('create_general_task',{p_category:'assigned',p_title:r.title,p_description:r.description||null,p_order_code:r.order_code||null,p_assignee_id:r.assignee_id,p_deadline:r.deadline||null,p_reminder_at:r.reminder_at||null});if(error)throw error;}
  notifyBadgesChanged();
}

export async function reportTaskProgress(taskId, percent, note) {
  const { data: userData } = await supabase.auth.getUser();
  const { error } = await supabase.from('task_progress_reports').insert({
    task_id: taskId, staff_id: userData.user.id, percent, note: note || null,
  });
  if (error) throw error;
}

export async function fetchTaskProgressReports(taskId) {
  const { data, error } = await supabase.from('task_progress_reports').select('*').eq('task_id', taskId).order('created_at', { ascending: true });
  if (error) throw error;
  return data;
}

export async function createAdhocTask({ assigneeId, title, description, orderCode, createdBy }) {
  const { error } = await supabase.rpc('create_general_task',{p_category:'adhoc',p_title:title,p_description:description||null,p_order_code:orderCode||null,p_assignee_id:assigneeId,p_deadline:null,p_reminder_at:null});
  if (error) throw error;

  // 🎵 TING TING - Phát âm thanh giao việc cho tất cả người dùng
  playShipperReceiveSound();
  broadcastEvent(BroadcastEvents.SOUND_NOTIFICATION, {
    soundType: 'task_assigned'
  }).catch(e => console.error('Broadcast error:', e));

  notifyBadgesChanged();
}

export async function completeTask(id, photoUrl) {
  const { data: task, error: findErr } = await supabase.from('tasks').select('deadline,version,work_package_id').eq('id', id).single();
  if (findErr) throw findErr;
  const { error } = await supabase.rpc('complete_task_v2', {
    p_idempotency_key: `task-complete:${id}:${newId()}`,
    p_task_id: id,
    p_expected_version: task.version,
    p_note: null,
    p_photo_url: photoUrl,
  });
  if (error) throw error;
  if (task.work_package_id) {
    await supabase.rpc('complete_kitchen_work_package_with_proof', {
      p_package_id: task.work_package_id,
      p_proof_storage_path: null
    }).catch(() => {});
  }
  notifyBadgesChanged();
}

export async function startTask(id) {
  const {data:task,error:findErr}=await supabase.from('tasks').select('version').eq('id',id).single();
  if(findErr)throw findErr;
  const{error}=await supabase.rpc('start_task_v2',{p_idempotency_key:`task-start:${id}:${newId()}`,p_task_id:id,p_expected_version:task.version});
  if(error)throw error;notifyBadgesChanged();
}

export async function updateTask(id, fields) {
  const { error } = await supabase.from('tasks').update(fields).eq('id', id);
  if (error) throw error;
  notifyBadgesChanged();
}

export async function deleteTask(id) {
  const { error } = await supabase.rpc('delete_personal_task',{p_task_id:id});
  if (error) throw error;
  notifyBadgesChanged();
}

export async function requestTaskExemption({ taskId, orderCode, requesterId, requesterName, requesterRole, reason, photoUrl }) {
  await createApprovalRequest({ type: 'task_exemption', taskId, orderCode, reason, photoUrl, requesterId, requesterName, requesterRole });
}

export async function exemptTask(id) {
  const { error } = await supabase.from('tasks').update({ status: 'exempted' }).eq('id', id);
  if (error) throw error;
  notifyBadgesChanged();
}
