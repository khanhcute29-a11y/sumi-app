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

// LỖI THẬT đã vá (review vòng 3, P0.2): trước đây dùng ANON_KEY — key này
// công khai, nhúng sẵn trong bundle client, nên MỌI quyền hạn của nó (kể cả
// đọc push_subscriptions) đều là quyền công khai theo RLS. Giờ dùng
// SERVICE_ROLE_KEY (bí mật, chỉ server biết) — bỏ qua RLS hoàn toàn, đúng
// bản chất "đây là code server, không phải code client" — đi cùng việc khoá
// chặt RLS của push_subscriptions lại (migration 202609061800) để dù lỡ lộ
// ANON_KEY ở đâu đó, không ai đọc được bảng này qua đường client nữa.
function laySupabase() {
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return { loi: 'Thiếu VITE_SUPABASE_URL hoặc SUPABASE_SERVICE_ROLE_KEY' };
  return { client: createClient(url, key, { auth: { persistSession: false } }) };
}

export default async function handler(req, res) {
  // Cho phép GET để tự kiểm tra cấu hình mà không gửi thông báo nào.
  if (req.method === 'GET') {
    const loi = chuanBiVapid();
    return res.status(loi ? 503 : 200).json(loi || { ok: true, san_sang: true });
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // LỖI THẬT đã vá (review vòng 3, P0.1): endpoint này trước đây KHÔNG xác
  // thực gì cả — bất kỳ ai trên Internet biết URL là gửi được push tuỳ ý
  // nội dung, tuỳ ý người nhận (kể cả staffId của người khác). Giờ bắt buộc
  // header x-push-secret khớp đúng PUSH_API_SECRET (đặt trên Vercel) —
  // chỉ trigger DB (biết khoá qua private.get_push_secret()) mới gọi được.
  const secret = (process.env.PUSH_API_SECRET || '').trim();
  if (!secret) return res.status(503).json({ error: 'Chưa cấu hình PUSH_API_SECRET' });
  if (req.headers['x-push-secret'] !== secret) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const loiVapid = chuanBiVapid();
  if (loiVapid) return res.status(503).json(loiVapid);

  const sb = laySupabase();
  if (sb.loi) return res.status(503).json({ loi: sb.loi });
  const supabase = sb.client;

  const { title, body, url, staffId, staffIds, broadcast, tag } = req.body || {};
  if (!title) return res.status(400).json({ error: 'Thiếu title' });

  // staffIds (mảng, dùng cho tin nhắn Chat — báo NHIỀU người cùng lúc trong
  // 1 lượt gọi thay vì mỗi trigger DB gọi HTTP riêng cho từng người) — vẫn
  // giữ nguyên staffId (1 người, dùng cho giao việc) để không đổi API cũ.
  // LỖI THẬT đã vá (review vòng 3, P0.1): trước đây KHÔNG truyền staffId lẫn
  // staffIds thì query không lọc gì cả — gửi cho TOÀN BỘ subscription trong
  // bảng. Giờ bắt buộc phải nêu rõ `broadcast: true` mới cho gửi diện rộng
  // (dùng có chủ đích cho Bảng tin) — thiếu cả 3 thì từ chối luôn, không để
  // lỡ tay/lỗi code phía gọi biến thành broadcast toàn công ty.
  let query = supabase.from('push_subscriptions').select('*');
  if (staffId) query = query.eq('staff_id', staffId);
  else if (Array.isArray(staffIds) && staffIds.length) query = query.in('staff_id', staffIds);
  else if (broadcast !== true) {
    return res.status(400).json({ error: 'Phải có staffId, staffIds, hoặc broadcast:true' });
  }
  const { data: subs, error } = await query;
  if (error) return res.status(500).json({ error: error.message });

  const payload = JSON.stringify({ title, body: body || '', url: url || '/', tag: tag || undefined });

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
