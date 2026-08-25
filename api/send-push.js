import webpush from 'web-push';
import { createClient } from '@supabase/supabase-js';

// LỖI CŨ: setVapidDetails() và createClient() nằm ở ngoài hàm, chạy ngay lúc
// nạp mô-đun. Chỉ cần một biến môi trường sai là mô-đun sập, Vercel trả về
// "500 FUNCTION_INVOCATION_FAILED" — một thông báo mù, không cho biết sai ở
// đâu. Ta mất rất nhiều thời gian chỉ để đoán.
// Giờ chuyển vào TRONG hàm, có kiểm tra và báo lỗi cụ thể.
//
// Bảo mật: thông báo lỗi chỉ nói TÊN biến và ĐỘ DÀI sai lệch, không bao giờ
// in ra giá trị thật của khoá.

let vapidReady = false;

function chuanBiVapid() {
  if (vapidReady) return null;

  const pub = (process.env.VITE_VAPID_PUBLIC_KEY || '').trim();
  const priv = (process.env.VAPID_PRIVATE_KEY || '').trim();
  const subject = (process.env.VAPID_SUBJECT || '').trim() || 'mailto:buitrongnghia1409@gmail.com';

  const thieu = [];
  if (!pub) thieu.push('VITE_VAPID_PUBLIC_KEY');
  if (!priv) thieu.push('VAPID_PRIVATE_KEY');
  if (thieu.length) return { loi: 'Thiếu biến môi trường: ' + thieu.join(', ') };

  // Khoá VAPID chuẩn: công khai 87 ký tự, bí mật 43 ký tự (base64url).
  // Sai độ dài thường là do lưu ở dạng Sensitive trên Vercel (hàm nhận về
  // bản đã mã hoá) hoặc dán dư/thiếu ký tự.
  if (pub.length !== 87 || priv.length !== 43) {
    return {
      loi: 'Khoá VAPID sai định dạng',
      chi_tiet: {
        VITE_VAPID_PUBLIC_KEY: `${pub.length} ký tự (đúng: 87)`,
        VAPID_PRIVATE_KEY: `${priv.length} ký tự (đúng: 43)`,
        goi_y: 'Trên Vercel, biến phải để dạng thường (Readable), KHÔNG dùng Sensitive.',
      },
    };
  }

  try {
    webpush.setVapidDetails(subject, pub, priv);
    vapidReady = true;
    return null;
  } catch (e) {
    return { loi: 'web-push từ chối cặp khoá', chi_tiet: e.message };
  }
}

function laySupabase() {
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) return { loi: 'Thiếu VITE_SUPABASE_URL hoặc VITE_SUPABASE_ANON_KEY' };
  return { client: createClient(url, key, { auth: { persistSession: false } }) };
}

export default async function handler(req, res) {
  // Cho phép GET để tự kiểm tra cấu hình mà không gửi thông báo nào.
  if (req.method === 'GET') {
    const loi = chuanBiVapid();
    return res.status(loi ? 503 : 200).json(loi || { ok: true, san_sang: true });
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const loiVapid = chuanBiVapid();
  if (loiVapid) return res.status(503).json(loiVapid);

  const sb = laySupabase();
  if (sb.loi) return res.status(503).json({ loi: sb.loi });
  const supabase = sb.client;

  const { title, body, url, staffId } = req.body || {};
  if (!title) return res.status(400).json({ error: 'Thiếu title' });

  let query = supabase.from('push_subscriptions').select('*');
  if (staffId) query = query.eq('staff_id', staffId);
  const { data: subs, error } = await query;
  if (error) return res.status(500).json({ error: error.message });

  const payload = JSON.stringify({ title, body: body || '', url: url || '/' });

  const results = await Promise.allSettled(
    (subs || []).map((s) =>
      webpush
        .sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth_key } }, payload)
        .catch(async (err) => {
          // 404/410 = trình duyệt đã huỷ đăng ký -> dọn bản ghi chết
          if (err.statusCode === 404 || err.statusCode === 410) {
            await supabase.from('push_subscriptions').delete().eq('id', s.id);
          }
          throw err;
        })
    )
  );

  const sent = results.filter((r) => r.status === 'fulfilled').length;

  // Báo rõ máy nào lỗi vì sao. Trước đây chỉ trả về con số, gặp lỗi là phải
  // ngồi suy đoán. Chỉ nêu mã lỗi và tên nhân viên — không lộ endpoint hay khoá.
  const loi = results
    .map((r, i) => (r.status === 'rejected' ? { r, s: subs[i] } : null))
    .filter(Boolean)
    .map(({ r, s }) => {
      const code = r.reason?.statusCode;
      const giai_thich =
        code === 403 ? 'Đăng ký tạo bằng khoá VAPID cũ — máy cần mở lại app để đăng ký lại'
        : code === 404 || code === 410 ? 'Đăng ký đã hết hạn (đã tự dọn)'
        : code === 413 ? 'Nội dung thông báo quá dài'
        : code === 429 ? 'Bị giới hạn tần suất, thử lại sau'
        : 'Lỗi khác';
      return { staff_id: s.staff_id, ma_loi: code || 'khong ro', ly_do: giai_thich };
    });

  res.status(200).json({ sent, total: subs?.length || 0, that_bai: loi });
}
