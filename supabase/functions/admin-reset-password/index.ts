import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// "Cấp lại mật khẩu nhanh" — Quản lý/Giám đốc/Bếp trưởng cấp lại mật khẩu
// cho nhân sự tuyến dưới, KHÔNG qua email (nhân sự không rành công nghệ).
//
// Vì app không có backend riêng (client gọi thẳng Supabase), đây là nơi DUY
// NHẤT được phép đụng tới Supabase Auth Admin API — cần SERVICE ROLE KEY,
// tuyệt đối không đưa key này ra client. Quyền "ai được đổi mật khẩu của ai"
// KHÔNG tự chế ở đây — gọi lại đúng RPC la_quan_ly_cua_ho_so() đã có (khớp
// với quyền giao việc: quản lý cùng station), để logic phân quyền chỉ nằm ở
// MỘT chỗ duy nhất.
//
// CORS: đây là edge function ĐẦU TIÊN trong dự án được gọi trực tiếp từ
// trình duyệt (2 hàm cũ backup-order-attachments/parse-voice-order chỉ chạy
// server-to-server/cron, chưa từng cần CORS) — trình duyệt luôn gửi 1 request
// "OPTIONS" dò trước request POST thật. Thiếu xử lý OPTIONS + header CORS
// khiến request POST thật KHÔNG BAO GIỜ được gửi đi, supabase-js chỉ báo
// chung chung "Failed to send a request to the Edge Function".
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: corsHeaders });

const required = (name: string) => {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing ${name}`);
  return value;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ success: false, message: "Method not allowed" }, 405);
  try {
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) {
      return json({ success: false, message: "Chưa đăng nhập." }, 401);
    }

    const body = await req.json().catch(() => ({}));
    const staffId = typeof body.staffId === "string" ? body.staffId : "";
    const newPassword = typeof body.newPassword === "string" ? body.newPassword : "";
    if (!staffId) {
      return json({ success: false, message: "Thiếu mã nhân sự." }, 400);
    }
    if (newPassword.length < 6) {
      return json({ success: false, message: "Mật khẩu phải có ít nhất 6 ký tự." }, 400);
    }

    const supabaseUrl = required("SUPABASE_URL");
    const anonKey = required("SUPABASE_ANON_KEY");
    const serviceKey = required("SUPABASE_SERVICE_ROLE_KEY");

    // Client mang danh tính người GỌI (JWT của họ) — dùng để biết ai đang
    // thao tác và kiểm tra quyền qua RPC đã có, không dùng service role cho
    // bước xác thực danh tính.
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await callerClient.auth.getUser();
    if (userErr || !userData?.user) {
      return json({ success: false, message: "Phiên đăng nhập không hợp lệ, hãy đăng nhập lại." }, 401);
    }
    if (userData.user.id === staffId) {
      return json({ success: false, message: "Không dùng chức năng này để đổi mật khẩu của chính mình." }, 400);
    }

    const { data: allowed, error: rpcErr } = await callerClient.rpc("la_quan_ly_cua_ho_so", { p_target: staffId });
    if (rpcErr) throw rpcErr;
    if (!allowed) {
      return json({ success: false, message: "Bạn không có quyền cấp lại mật khẩu cho nhân sự này." }, 403);
    }

    // Từ đây mới dùng SERVICE ROLE — quyền admin thật của Supabase Auth.
    const adminClient = createClient(supabaseUrl, serviceKey);
    const { error: updateErr } = await adminClient.auth.admin.updateUserById(staffId, { password: newPassword });
    if (updateErr) throw updateErr;

    // Buộc đăng xuất mọi phiên cũ — không chặn kết quả thành công nếu bước
    // này lỗi, vì mật khẩu cũ dù sao cũng không còn dùng đăng nhập được nữa.
    const { error: logoutErr } = await adminClient.rpc("sumi_force_logout", { p_target: staffId });
    if (logoutErr) console.error("sumi_force_logout failed", logoutErr);

    return json({ success: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return json({ success: false, message }, 500);
  }
});
