import { createClient } from '@supabase/supabase-js';

// Bán tại quầy: tự dọn ẢNH HOÁ ĐƠN quá 90 ngày cho kho ảnh khỏi phình (mỗi hoá đơn 1 ảnh,
// cả trăm tấm mỗi ngày). Chỉ xoá ẢNH trong thư mục pos/ban/ — hoá đơn, số tiền, mã ảnh
// (photo_hash, dùng chặn ảnh trùng) vẫn giữ nguyên; đánh dấu pos_invoices.photo_deleted_at.
// Không đụng ảnh két, ảnh xuất huỷ, ảnh giao hàng, chấm công.
//
// Ai gọi: database, 03:00 mỗi đêm (cron sumi-pos-don-anh-cu → pos_goi_don_anh_cu → net.http_post),
// kèm header x-push-secret giống api/send-push.js. Body { thu: true } = chỉ đếm, không xoá.

export const SO_NGAY_GIU = 90;
const MOI_LUOT = 500;
const DUNG_MAU = /^pos\/ban\/[A-Za-z0-9-]+\.[a-z0-9]{2,5}$/; // chỉ đúng kiểu đường dẫn ảnh bán hàng

export async function donAnhCu(supabase, { thu = false, bayGio = Date.now() } = {}) {
  const truoc = new Date(bayGio - SO_NGAY_GIU * 86400000).toISOString();
  const { data, error } = await supabase.from('pos_invoices').select('id, photo_url')
    .like('photo_url', 'pos/ban/%').is('photo_deleted_at', null).lt('created_at', truoc)
    .order('created_at', { ascending: true }).limit(MOI_LUOT);
  if (error) throw new Error(`Đọc hoá đơn: ${error.message}`);
  const ds = (data || []).filter((r) => DUNG_MAU.test(r.photo_url || ''));
  if (thu || !ds.length) return { tim_thay: ds.length, da_xoa: 0, truoc, thu };

  const rm = await supabase.storage.from('uploads').remove(ds.map((r) => r.photo_url));
  if (rm.error) throw new Error(`Xoá ảnh: ${rm.error.message}`);
  const up = await supabase.from('pos_invoices').update({ photo_deleted_at: new Date(bayGio).toISOString() })
    .in('id', ds.map((r) => r.id));
  if (up.error) throw new Error(`Đánh dấu hoá đơn: ${up.error.message}`);
  return { tim_thay: ds.length, da_xoa: (rm.data || []).length, truoc, con_nua: ds.length === MOI_LUOT };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const secret = (process.env.PUSH_API_SECRET || '').trim();
  if (!secret) return res.status(503).json({ error: 'Chưa cấu hình PUSH_API_SECRET' });
  if (req.headers['x-push-secret'] !== secret) return res.status(401).json({ error: 'Unauthorized' });

  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return res.status(503).json({ loi: 'Thiếu VITE_SUPABASE_URL hoặc SUPABASE_SERVICE_ROLE_KEY' });
  const supabase = createClient(url, key, { auth: { persistSession: false } });
  try {
    return res.status(200).json(await donAnhCu(supabase, { thu: req.body?.thu === true }));
  } catch (e) {
    return res.status(500).json({ loi: e.message });
  }
}
