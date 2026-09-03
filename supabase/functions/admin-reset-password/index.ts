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
const required = (name: string) => {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing ${name}`);
  return value;
};

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  try {
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) {
      return Response.json({ success: false, message: "Chưa đăng nhập." }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const staffId = typeof body.staffId === "string" ? body.staffId : "";
    const newPassword = typeof body.newPassword === "string" ? body.newPassword : "";
    if (!staffId) {
      return Response.json({ success: false, message: "Thiếu mã nhân sự." }, { status: 400 });
    }
    if (newPassword.length < 6) {
      return Response.json({ success: false, message: "Mật khẩu phải có ít nhất 6 ký tự." }, { status: 400 });
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
      return Response.json({ success: false, message: "Phiên đăng nhập không hợp lệ, hãy đăng nhập lại." }, { status: 401 });
    }
    if (userData.user.id === staffId) {
      return Response.json({ success: false, message: "Không dùng chức năng này để đổi mật khẩu của chính mình." }, { status: 400 });
    }

    const { data: allowed, error: rpcErr } = await callerClient.rpc("la_quan_ly_cua_ho_so", { p_target: staffId });
    if (rpcErr) throw rpcErr;
    if (!allowed) {
      return Response.json({ success: false, message: "Bạn không có quyền cấp lại mật khẩu cho nhân sự này." }, { status: 403 });
    }

    // Từ đây mới dùng SERVICE ROLE — quyền admin thật của Supabase Auth.
    const adminClient = createClient(supabaseUrl, serviceKey);
    const { error: updateErr } = await adminClient.auth.admin.updateUserById(staffId, { password: newPassword });
    if (updateErr) throw updateErr;

    // Buộc đăng xuất mọi phiên cũ — không chặn kết quả thành công nếu bước
    // này lỗi, vì mật khẩu cũ dù sao cũng không còn dùng đăng nhập được nữa.
    const { error: logoutErr } = await adminClient.rpc("sumi_force_logout", { p_target: staffId });
    if (logoutErr) console.error("sumi_force_logout failed", logoutErr);

    return Response.json({ success: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return Response.json({ success: false, message }, { status: 500 });
  }
});
