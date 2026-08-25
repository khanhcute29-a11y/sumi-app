// Hàm thử tối giản để khoanh vùng lỗi máy chủ. Không nạp thư viện nào,
// chỉ báo xem các biến môi trường có tới được hàm hay không.
// (Chỉ trả về CÓ/KHÔNG và độ dài — không bao giờ lộ giá trị thật.)
export default function handler(req, res) {
  const check = (name) => {
    const v = process.env[name];
    return v ? `co (${v.length} ky tu)` : 'THIEU';
  };
  res.status(200).json({
    ok: true,
    node: process.version,
    bien: {
      VITE_VAPID_PUBLIC_KEY: check('VITE_VAPID_PUBLIC_KEY'),
      VAPID_PRIVATE_KEY: check('VAPID_PRIVATE_KEY'),
      VAPID_SUBJECT: check('VAPID_SUBJECT'),
      VITE_SUPABASE_URL: check('VITE_SUPABASE_URL'),
      VITE_SUPABASE_ANON_KEY: check('VITE_SUPABASE_ANON_KEY'),
    },
  });
}
