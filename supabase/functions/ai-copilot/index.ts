// Edge Function "ai-copilot" — "bộ não" Trợ lý Gen chạy TRÊN SUPABASE của tiệm
// (thay cho serverless Vercel /api/ai-copilot). Dùng lại secret GOOGLE_GENAI_API_KEY
// đã có sẵn (các function voice đang xài) — KHÔNG phụ thuộc env trên Vercel, KHÔNG
// có khóa hardcode. verify_jwt = true nên chỉ người dùng đã đăng nhập mới gọi được.
//
// Trả về ĐÚNG shape mà client GenCopilotModal cần: { reply, functionCalls: [{name,args}] }.
// Các tool CHỈ khai báo ở đây; việc thực thi (RPC/RLS) vẫn nằm ở client như cũ.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const GEMINI_API_KEY = Deno.env.get("GOOGLE_GENAI_API_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ---- Khai báo Tool (OpenAPI schema, type viết HOA theo chuẩn Gemini REST) ----
const functionDeclarations = [
  {
    name: "tao_don_hang_banh",
    description: "Bóc tách thông tin tạo đơn bánh từ lời nói, tin nhắn Zalo hoặc ghi chú để tạo đơn và chuyển lệnh sản xuất xuống Bếp",
    parameters: {
      type: "OBJECT",
      properties: {
        ten_khach: { type: "STRING", description: "Tên khách hàng" },
        so_dien_thoai: { type: "STRING", description: "Số điện thoại nhận bánh" },
        dia_chi: { type: "STRING", description: "Địa chỉ giao bánh nếu ship" },
        hinh_thuc_nhan: { type: "STRING", enum: ["lay_tai_tiem", "giao_hang"], description: "Tự lấy hay giao hàng" },
        thoi_gian_nhan: { type: "STRING", description: "Ngày và giờ nhận bánh" },
        loai_banh: { type: "STRING", description: "Tên loại bánh" },
        size_banh: { type: "STRING", description: "Kích thước bánh" },
        chu_viet_len_banh: { type: "STRING", description: "Chữ viết trang trí lên mặt bánh" },
        nen_tuoi: { type: "STRING", description: "Số tuổi cắm nến" },
        ghi_chu_tho_banh: { type: "STRING", description: "Yêu cầu đặc biệt cho thợ làm bánh" },
        tam_tinh_gia: { type: "NUMBER", description: "Giá ước tính nếu có" },
      },
      required: ["ten_khach", "loai_banh"],
    },
  },
  {
    name: "tra_cuu_don_hang",
    description: "Tra cứu thông tin chi tiết một hoặc nhiều đơn hàng theo tên khách, số điện thoại hoặc mã đơn (#SUMI-...) hoặc đơn hôm nay",
    parameters: {
      type: "OBJECT",
      properties: { tu_khoa: { type: "STRING", description: "Tên khách, số điện thoại, mã đơn hoặc 'hôm nay'" } },
      required: ["tu_khoa"],
    },
  },
  {
    name: "tra_cuu_cong_viec",
    description: "Tra cứu danh sách công việc, nhiệm vụ đã giao cho nhân viên, việc cần làm hôm nay, việc tồn đọng",
    parameters: {
      type: "OBJECT",
      properties: {
        tu_khoa: { type: "STRING", description: "Nội dung hoặc tiêu đề công việc" },
        ten_nhan_vien: { type: "STRING", description: "Tên nhân viên được giao việc" },
        trang_thai: { type: "STRING", enum: ["chua_xong", "da_xong", "tat_ca"], description: "Trạng thái việc" },
      },
    },
  },
  {
    name: "cap_nhat_trang_thai_don",
    description: "Cập nhật trạng thái của đơn hàng (bếp nhận làm, làm xong chờ giao, đang giao, hoàn thành hoặc hủy đơn)",
    parameters: {
      type: "OBJECT",
      properties: {
        ma_don_hang: { type: "STRING", description: "Mã đơn hàng hoặc tên khách hàng" },
        trang_thai_moi: { type: "STRING", enum: ["bep_nhan_lam", "lam_xong_cho_giao", "dang_giao", "hoan_thanh", "huy_don"], description: "Trạng thái muốn chuyển sang" },
        ly_do_huy: { type: "STRING", description: "Lý do nếu chọn hủy đơn" },
      },
      required: ["ma_don_hang", "trang_thai_moi"],
    },
  },
  {
    name: "duyet_khoan_chi_hoac_ung",
    description: "Giám đốc phê duyệt hoặc từ chối phiếu xin tạm ứng lương hoặc báo khoản chi",
    parameters: {
      type: "OBJECT",
      properties: {
        loai: { type: "STRING", enum: ["tam_ung", "chi_tieu"], description: "Loại yêu cầu duyệt" },
        id: { type: "STRING", description: "ID của phiếu yêu cầu" },
        ten_nguoi_yeu_cau: { type: "STRING", description: "Tên nhân sự" },
        so_tien: { type: "NUMBER", description: "Số tiền" },
        dong_y: { type: "BOOLEAN", description: "True nếu duyệt, False nếu từ chối" },
        ghi_chu: { type: "STRING", description: "Ghi chú duyệt/từ chối" },
      },
      required: ["loai", "id", "dong_y"],
    },
  },
  {
    name: "tra_cuu_ton_kho",
    description: "Tra cứu số lượng tồn kho của một loại bánh hoặc mặt hàng trong kho thành phẩm",
    parameters: {
      type: "OBJECT",
      properties: { ten_mon: { type: "STRING", description: "Tên loại bánh hoặc sản phẩm cần tra cứu" } },
      required: ["ten_mon"],
    },
  },
  {
    name: "tra_cuu_nhan_su_cham_cong",
    description: "Tra cứu tình hình nhân sự đi làm, ca trực, chấm công hôm nay của toàn tiệm hoặc một nhân viên cụ thể",
    parameters: {
      type: "OBJECT",
      properties: { ten_nhan_vien: { type: "STRING", description: "Tên nhân viên cần kiểm tra (để trống = xem danh sách đang trong ca)" } },
    },
  },
  {
    name: "xin_tam_ung_luong",
    description: "Tạo yêu cầu xin tạm ứng lương gửi Giám đốc phê duyệt",
    parameters: {
      type: "OBJECT",
      properties: {
        so_tien: { type: "NUMBER", description: "Số tiền muốn tạm ứng (VNĐ)" },
        ly_do: { type: "STRING", description: "Lý do cần tạm ứng" },
        ngay_can: { type: "STRING", description: "Ngày cần nhận tiền (YYYY-MM-DD)" },
      },
      required: ["so_tien", "ly_do"],
    },
  },
  {
    name: "xin_nghi_phep",
    description: "Tạo yêu cầu xin nghỉ phép gửi quản lý / giám đốc duyệt",
    parameters: {
      type: "OBJECT",
      properties: {
        ngay_nghi: { type: "STRING", description: "Ngày xin nghỉ (hoặc khoảng ngày)" },
        buoi: { type: "STRING", enum: ["ca_ngay", "sang", "chieu", "toi"], description: "Buổi xin nghỉ" },
        ly_do: { type: "STRING", description: "Lý do xin nghỉ" },
      },
      required: ["ngay_nghi", "ly_do"],
    },
  },
  {
    name: "bao_khoan_chi",
    description: "Báo cáo một khoản chi tiền mặt hoặc chuyển khoản mua vật tư/lặt vặt",
    parameters: {
      type: "OBJECT",
      properties: {
        so_tien: { type: "NUMBER", description: "Số tiền chi (VNĐ)" },
        noi_dung_chi: { type: "STRING", description: "Nội dung chi" },
        ghi_chu: { type: "STRING", description: "Ghi chú thêm" },
      },
      required: ["so_tien", "noi_dung_chi"],
    },
  },
  {
    name: "giao_viec_nhan_su",
    description: "Giao việc cho một nhân viên cụ thể kèm hạn chót (chỉ khi sếp/quản lý giao việc)",
    parameters: {
      type: "OBJECT",
      properties: {
        ten_nhan_vien: { type: "STRING", description: "Tên nhân viên được giao việc" },
        noi_dung_viec: { type: "STRING", description: "Mô tả công việc cần làm" },
        han_chot: { type: "STRING", description: "Thời hạn hoàn thành" },
        yeu_cau_anh: { type: "BOOLEAN", description: "Có bắt buộc chụp ảnh nghiệm thu không" },
      },
      required: ["ten_nhan_vien", "noi_dung_viec"],
    },
  },
  {
    name: "canh_bao_quy_dinh",
    description: "Kích hoạt cảnh báo vi phạm quy chế tiệm bánh (đặt gấp dưới 2h, chiết khấu quá 15%)",
    parameters: {
      type: "OBJECT",
      properties: {
        muc_do: { type: "STRING", enum: ["canh_bao", "nghiem_trong"], description: "Mức độ cảnh báo" },
        noi_dung_vi_pham: { type: "STRING", description: "Nội dung vi phạm quy chế" },
        huong_giai_quyet: { type: "STRING", description: "Gợi ý giải quyết cho nhân viên" },
      },
      required: ["muc_do", "noi_dung_vi_pham"],
    },
  },
  {
    name: "phan_tich_kinh_doanh_theo_ky",
    description: "Phân tích/tổng hợp doanh thu theo kênh, chi tiêu và công nợ theo khoảng thời gian. CHỈ dành cho Ban Giám đốc/Kế toán.",
    parameters: {
      type: "OBJECT",
      properties: {
        ky: { type: "STRING", enum: ["hom_nay", "hom_qua", "tuan_nay", "tuan_truoc", "thang_nay", "thang_truoc", "tuy_chon"], description: "Kỳ phân tích" },
        tu_ngay: { type: "STRING", description: "Ngày bắt đầu YYYY-MM-DD (khi ky=tuy_chon)" },
        den_ngay: { type: "STRING", description: "Ngày kết thúc YYYY-MM-DD (khi ky=tuy_chon)" },
      },
      required: ["ky"],
    },
  },
  {
    name: "tra_cuu_cong_no",
    description: "Tra cứu công nợ cần thu của khách hàng hoặc trường học. CHỈ dành cho Ban Giám đốc/Kế toán/Thu ngân.",
    parameters: {
      type: "OBJECT",
      properties: { tu_khoa: { type: "STRING", description: "Tên khách hoặc trường cần lọc (bỏ trống = tất cả)" } },
    },
  },
  {
    name: "canh_bao_ton_kho_thap",
    description: "Liệt kê nguyên vật liệu hoặc bánh thành phẩm sắp hết / dưới ngưỡng. Dành cho Thủ kho/Ban Giám đốc.",
    parameters: {
      type: "OBJECT",
      properties: {
        loai: { type: "STRING", enum: ["nvl", "thanh_pham"], description: "nvl = nguyên vật liệu; thanh_pham = bánh thành phẩm" },
        nguong: { type: "NUMBER", description: "Ngưỡng số lượng coi là thấp (mặc định 5)" },
      },
    },
  },
  {
    name: "tom_tat_nhat_ky_van_hanh",
    description: "Tóm tắt nhật ký vận hành: báo cáo ca, việc đã hoàn thành và vi phạm nội quy trong hôm nay hoặc tuần này. Dành cho Quản lý trở lên.",
    parameters: {
      type: "OBJECT",
      properties: { ky: { type: "STRING", enum: ["hom_nay", "tuan_nay"], description: "Phạm vi thời gian tóm tắt" } },
    },
  },
  {
    name: "chi_duong_tinh_nang",
    description: "Trả lời 'làm X ở đâu / như thế nào' trong app: chỉ đúng màn hình, các bước và gửi link mở màn đó.",
    parameters: {
      type: "OBJECT",
      properties: { cau_hoi: { type: "STRING", description: "Việc người dùng muốn làm hoặc tính năng cần tìm" } },
      required: ["cau_hoi"],
    },
  },
];

const FINANCE_ROLES = ["owner", "admin", "accountant", "cashier"];

function buildSystemInstruction(userProfile: any, appSnapshot: any) {
  const role = userProfile?.role || "staff";
  const name = userProfile?.name || "Bạn";
  const extraRoles = Array.isArray(userProfile?.extra_roles) ? userProfile.extra_roles : [];
  const isDirector = FINANCE_ROLES.includes(role) || extraRoles.some((r: string) => FINANCE_ROLES.includes(r));

  let dataSection = "";
  if (appSnapshot) {
    dataSection = `\nDỮ LIỆU THỜI GIAN THỰC TRÊN HỆ THỐNG SUMI BAKERY HÔM NAY (${appSnapshot.ngay || "Hôm nay"}):\n${JSON.stringify(appSnapshot, null, 2)}\n`;
  }

  return `Bạn là "Gen" — Hệ điều hành Trợ lý Trí tuệ Nhân tạo toàn diện của tiệm bánh Sumi Bakery (sumibakery.shop).
Bạn hỗ trợ 22 nhân sự thực hiện các nghiệp vụ: Nghe (giọng nói), Nhìn (hình ảnh mẫu bánh/hóa đơn), Phân tích nghiệp vụ, BÁO CÁO SỐ LIỆU DOANH THU/ĐƠN HÀNG/TỒN KHO/CHẤM CÔNG, và Thao tác trực tiếp vào cơ sở dữ liệu.

NGƯỜI ĐANG NÓI CHUYỆN VỚI BẠN:
- Tên: ${name}
- Vai trò: ${role} (${isDirector ? "BAN GIÁM ĐỐC / CHỦ TIỆM / KẾ TOÁN - Toàn quyền xem doanh thu, đơn hàng, công nợ, chi tiêu, duyệt chi/ứng" : "Nhân viên tiệm bánh - Tuân thủ quy chế, thao tác trong quyền hạn"})
${dataSection}
NGUYÊN TẮC BÁO CÁO & TRUY VẤN THỜI GIAN THỰC:
1. BẠN ĐÃ KẾT NỐI TRỰC TIẾP CƠ SỞ DỮ LIỆU THẬT: khi được hỏi doanh thu/đơn/công nợ/chi tiêu, ĐỌC TRỰC TIẾP các con số trong [DỮ LIỆU THỜI GIAN THỰC] để báo cáo ngay. Nếu chưa có số liệu, báo trung thực, không bịa.
2. Trình bày báo cáo doanh thu gọn gàng theo cấu trúc: Doanh thu thuần theo kênh, Doanh thu dự tính & công nợ, Tình hình đơn hôm nay, Chi tiêu & tạm ứng. Định dạng tiền VNĐ rõ ràng, emoji trang nhã.
3. Tra cứu: dùng 'tra_cuu_don_hang', 'tra_cuu_ton_kho', 'tra_cuu_nhan_su_cham_cong', 'tra_cuu_cong_viec' đúng nhu cầu. LƯU Ý: hỏi "bao nhiêu đơn chờ làm / đang làm / đang giao / đã giao / tạo hôm nay" thì ĐỌC TRỰC TIẾP mục 'don_hang' trong [DỮ LIỆU THỜI GIAN THỰC] (don_moi_cho_bep_nhan, bep_dang_lam, don_dang_giao, don_hoan_thanh, tong_don_tao_hom_nay), KHÔNG cần gọi tool. Chỉ dùng 'tra_cuu_don_hang' khi cần tìm/ mở CHI TIẾT một đơn cụ thể.
4. Cập nhật trạng thái đơn: dùng 'cap_nhat_trang_thai_don'.
5. Phê duyệt tài chính (Giám đốc): dùng 'duyet_khoan_chi_hoac_ung'.
6. PHÂN QUYỀN: chỉ Ban Giám đốc/Kế toán mới xem số tiền doanh thu/chi tiêu toàn tiệm. Nhân viên thường hỏi doanh thu toàn tiệm thì từ chối lịch sự, chỉ báo số lượng đơn cần làm.
7. Tạo đơn & chuyển bếp: khi có thông tin đơn, KÍCH HOẠT 'tao_don_hang_banh'.
8. Cảnh báo quy chế: đặt gấp <2h hoặc giảm giá >15% -> 'canh_bao_quy_dinh'. Xin tạm ứng/báo chi -> bóc tách đúng số tiền, tạo thẻ xác nhận 2 bước.
9. PHONG CÁCH: ấm áp, nhã nhặn, chuyên nghiệp; với người không rành chữ dùng câu ngắn gọn dễ nghe.
10. CÔNG CỤ PHÂN TÍCH NÂNG CAO (đúng quyền): doanh thu/chi/công nợ theo kỳ -> 'phan_tich_kinh_doanh_theo_ky' (CHỈ GĐ/Kế toán); công nợ -> 'tra_cuu_cong_no' (GĐ/Kế toán/Thu ngân); tồn kho sắp hết -> 'canh_bao_ton_kho_thap' (Thủ kho/GĐ); tóm tắt vận hành -> 'tom_tat_nhat_ky_van_hanh' (Quản lý trở lên).
11. GIỚI HẠN QUYỀN: Vai trò hiện tại ${role}. ${isDirector ? "Được xem toàn bộ số liệu tài chính." : "KHÔNG được xem doanh thu/giá vốn/công nợ toàn tiệm."} Nếu không đủ quyền mà hỏi tài chính/công nợ: từ chối lịch sự, KHÔNG bịa số.
12. CHỈ ĐƯỜNG TRONG APP: hỏi "làm X ở đâu / cách làm X / tìm chức năng Y" -> 'chi_duong_tinh_nang'. Sau đó tóm tắt các BƯỚC và nhắc có nút "Mở màn ..." bên dưới.`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method === "GET") {
    return new Response(JSON.stringify({ ok: true, name: "Sumi AI Copilot (Supabase)", model: "gemini-3.6-flash" }), {
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  if (!GEMINI_API_KEY) {
    return new Response(JSON.stringify({ error: "Chưa cấu hình GOOGLE_GENAI_API_KEY (Supabase secret)" }), {
      status: 503, headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }

  try {
    const { message, imageBase64, userProfile, history, appSnapshot } = await req.json();
    if (!message && !imageBase64) {
      return new Response(JSON.stringify({ error: "Thiếu nội dung tin nhắn hoặc hình ảnh" }), {
        status: 400, headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const systemInstruction = buildSystemInstruction(userProfile, appSnapshot);

    // Ghép lịch sử + tin hiện tại (+ ảnh) thành contents
    const contents: any[] = [];
    if (Array.isArray(history)) {
      for (const h of history.slice(-6)) {
        if (!h?.text) continue;
        contents.push({ role: h.sender === "user" ? "user" : "model", parts: [{ text: h.text }] });
      }
    }
    if (imageBase64) {
      const matches = String(imageBase64).match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
      if (matches && matches.length === 3) {
        contents.push({ role: "user", parts: [{ inlineData: { mimeType: matches[1], data: matches[2] } }, { text: message || "Hãy phân tích hình ảnh này giúp tôi" }] });
      } else {
        contents.push({ role: "user", parts: [{ text: message }] });
      }
    } else {
      contents.push({ role: "user", parts: [{ text: message }] });
    }

    const requestBody = {
      systemInstruction: { parts: [{ text: systemInstruction }] },
      contents,
      tools: [{ functionDeclarations }],
      generationConfig: { temperature: 0.2 },
    };

    const candidateModels = ["gemini-3.6-flash", "gemini-3.5-flash", "gemini-3.5-flash-lite", "gemini-flash-latest"];
    let data: any = null;
    let lastErr = "";
    for (const model of candidateModels) {
      try {
        const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": GEMINI_API_KEY },
          body: JSON.stringify(requestBody),
        });
        if (resp.ok) { data = await resp.json(); break; }
        lastErr = `${resp.status} ${await resp.text()}`;
        console.warn(`[ai-copilot] model ${model} lỗi:`, lastErr);
      } catch (e) {
        lastErr = String(e);
        console.warn(`[ai-copilot] model ${model} exception:`, lastErr);
      }
    }

    if (!data) throw new Error(lastErr || "Không thể kết nối mô hình AI");

    const parts = data?.candidates?.[0]?.content?.parts || [];
    let reply = "";
    const functionCalls: any[] = [];
    for (const p of parts) {
      if (p?.text) reply += p.text;
      if (p?.functionCall) functionCalls.push({ name: p.functionCall.name, args: p.functionCall.args || {} });
    }

    return new Response(JSON.stringify({ reply, functionCalls }), {
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error) {
    console.error("[ai-copilot] Error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500, headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
});
