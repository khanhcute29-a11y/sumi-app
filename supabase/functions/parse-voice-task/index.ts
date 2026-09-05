import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// Phân tích giọng nói cho "+ Giao việc mới" — theo đúng mẫu parse-voice-order
// (cùng Gemini, cùng cách gọi qua supabase.functions.invoke), để sếp nói MỘT
// TRÀNG (tên việc + mô tả + hạn chót + người nhận) rồi tự tách đúng vào từng
// ô, thay vì chỉ cắt câu tại dấu phẩy như trước (không hiểu được thời gian,
// không tách được người nhận).
//
// Khác parse-voice-order ở 2 điểm bắt buộc phải có cho việc:
//  1. Cần "now" (giờ hiện tại phía client, giờ VN) để suy ra giờ tuyệt đối từ
//     cụm nói tương đối như "5 giờ chiều nay"/"mai 8 giờ sáng" — Gemini không
//     tự biết bây giờ là mấy giờ nếu không được cho biết.
//  2. Cần "staffNames" (danh sách tên nhân viên thật đang hiển thị trong danh
//     sách "Giao cho") để đối chiếu người được nhắc tới trong câu nói với
//     ĐÚNG tên thật trong hệ thống — không bịa tên không có trong danh sách.

const GEMINI_API_KEY = Deno.env.get("GOOGLE_GENAI_API_KEY");

// LỖI THẬT đã vá: gọi từ trình duyệt (supabase.functions.invoke) luôn kèm
// header Authorization -> trình duyệt bắt buộc gửi preflight OPTIONS trước.
// Hàm này trước đó chặn thẳng mọi method khác POST bằng 405 và không hề trả
// header CORS ở bất kỳ nhánh nào, nên preflight luôn bị chặn và request POST
// thật KHÔNG BAO GIỜ được gửi đi — trình duyệt báo "Failed to send a request
// to the Edge Function" dù gọi thẳng bằng curl (không qua CORS) vẫn chạy
// đúng. Test bằng dòng lệnh không phát hiện được lỗi này vì curl không áp
// dụng luật CORS như trình duyệt.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface VoiceTaskRequest {
  transcript: string;
  now?: string; // ISO, giờ hiện tại phía client
  staffNames?: string[];
  locale?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  const empty = { title: null, description: null, deadline: null, reminderAt: null, orderCode: null, assigneeNames: [] };

  try {
    const body = (await req.json()) as VoiceTaskRequest;
    const { transcript, now, staffNames = [] } = body;

    console.log("[parse-voice-task] Received:", { transcript, now, staffNames });

    if (!transcript?.trim()) {
      return new Response(JSON.stringify({ error: "Empty transcript", ...empty }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const nowIso = now || new Date().toISOString();
    const staffListText = staffNames.length ? staffNames.map((n) => `- ${n}`).join("\n") : "(chưa có danh sách)";

    const prompt = `Bạn là trợ lý phân tích lệnh giao việc nói bằng tiếng Việt cho tiệm bánh.
Giờ hiện tại (giờ Việt Nam): ${nowIso}

Danh sách nhân viên CÓ THẬT trong hệ thống (chỉ chọn tên trong danh sách này, không tự bịa tên khác):
${staffListText}

Phân tích văn bản nói dưới đây và trích xuất:
- title: Tên ngắn gọn của công việc (bắt buộc phải có, không được để trống nếu văn bản có nội dung)
- description: Mô tả/yêu cầu chi tiết thêm nếu có (khác với title, có thể null nếu không có gì thêm)
- deadline: Hạn chót phải xong, suy ra giờ TUYỆT ĐỐI từ giờ hiện tại ở trên (vd "5 giờ chiều nay", "trước 5h chiều", "mai 8 giờ sáng"), định dạng ISO 8601 có timezone +07:00, hoặc null nếu không nói tới hạn chót. TUYỆT ĐỐI không suy ra deadline PHẢI Ở TƯƠNG LAI so với giờ hiện tại — nếu giờ suy ra được lại rơi vào QUÁ KHỨ so với giờ hiện tại ở trên, đó là hiểu sai (vd nhầm giờ sáng/chiều), phải cộng thêm 12 tiếng hoặc chuyển sang ngày hôm sau cho hợp lý, không bao giờ trả về deadline trong quá khứ. Đặc biệt: SỐ LƯỢNG sản phẩm (vd "10 ổ bánh", "5 cái bánh") KHÔNG PHẢI là giờ — không được nhầm số lượng thành giờ hạn chót.
- reminderAt: Giờ nhắc chuông nếu người nói có nhắc riêng (vd "nhắc trước 30 phút", "nhắc lúc 4 giờ chiều") — ISO 8601 +07:00, hoặc null nếu không nói tới. Cùng lưu ý: không bao giờ để reminderAt rơi vào quá khứ so với giờ hiện tại.
- orderCode: Mã đơn hàng nếu có nhắc tới (dạng SUMI-xxxxxxxx-xxx), hoặc null
- assigneeNames: Mảng TÊN THẬT (đúng chữ trong danh sách nhân viên ở trên) của (những) người được giao việc nếu văn bản có nhắc tới tên ai, hoặc mảng rỗng [] nếu không nhắc tên ai

Văn bản ghi âm: "${transcript}"

CHỈ TRÍCH XUẤT THÔNG TIN RÕ RÀNG TỪ VĂN BẢN. Không đoán hoặc bổ sung thông tin không có. Với assigneeNames, CHỈ trả về tên khớp với danh sách nhân viên ở trên, không trả về tên không có trong danh sách.

Trả về đúng JSON hợp lệ theo mẫu:
{"title": null, "description": null, "deadline": null, "reminderAt": null, "orderCode": null, "assigneeNames": []}`;

    if (!GEMINI_API_KEY) {
      console.error("[parse-voice-task] Missing GOOGLE_GENAI_API_KEY");
      throw new Error("API key not configured");
    }

    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": GEMINI_API_KEY },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[parse-voice-task] Gemini error:", response.statusText, errorText);
      throw new Error(`Gemini API error: ${response.statusText} | ${errorText.slice(0, 300)}`);
    }

    const geminiData = await response.json();
    const content = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
    console.log("[parse-voice-task] Extracted content:", content);

    let result: Record<string, unknown> = {};
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) result = JSON.parse(jsonMatch[0]);
    } catch (parseErr) {
      console.error("[parse-voice-task] JSON parse error:", parseErr);
    }

    // Chỉ nhận assigneeNames thật sự khớp danh sách nhân viên đã gửi lên —
    // phòng trường hợp model lỡ bịa/biến âm tên, tránh gán nhầm việc cho
    // người không có thật hoặc không đúng người.
    const rawNames = Array.isArray(result.assigneeNames) ? (result.assigneeNames as unknown[]) : [];
    const matchedNames = rawNames
      .map((n) => String(n || "").trim())
      .filter((n) => n && staffNames.some((s) => s.trim().toLowerCase() === n.toLowerCase()));

    // Chốt an toàn: dù đã dặn trong prompt, Gemini vẫn có thể nhầm giờ (vd lẫn
    // AM/PM, hoặc lẫn SỐ LƯỢNG sản phẩm với GIỜ — thực tế đã gặp: "10 ổ bánh"
    // bị hiểu thành "10 giờ" rồi trả về hạn chót đã QUA giờ hiện tại). Loại bỏ
    // thẳng bất kỳ deadline/reminderAt nào rơi vào quá khứ thay vì tin theo
    // model, để không gán một hạn chót vô nghĩa vào việc.
    const nowMs = Date.parse(nowIso);
    const bothTuongLai = (iso: string | null) => {
      if (!iso) return null;
      const ms = Date.parse(iso);
      if (Number.isNaN(ms) || ms < nowMs) return null;
      return iso;
    };

    const response_data = {
      title: typeof result.title === "string" ? result.title : null,
      description: typeof result.description === "string" ? result.description : null,
      deadline: bothTuongLai(typeof result.deadline === "string" ? result.deadline : null),
      reminderAt: bothTuongLai(typeof result.reminderAt === "string" ? result.reminderAt : null),
      orderCode: typeof result.orderCode === "string" ? result.orderCode : null,
      assigneeNames: matchedNames,
    };

    console.log("[parse-voice-task] Returning:", response_data);
    return new Response(JSON.stringify(response_data), { headers: { "Content-Type": "application/json", ...corsHeaders } });
  } catch (error) {
    console.error("[parse-voice-task] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error", ...empty }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
});
