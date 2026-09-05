import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const GEMINI_API_KEY = Deno.env.get("GOOGLE_GENAI_API_KEY");

interface VoiceOrderRequest {
  transcript: string;
  orderType?: string;
  locale?: string;
}

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const body = await req.json() as VoiceOrderRequest;
    const { transcript, orderType = "cake", locale = "vi-VN" } = body;

    console.log("[parse-voice-order] Received:", { transcript, orderType, locale });

    if (!transcript?.trim()) {
      console.log("[parse-voice-order] Empty transcript");
      return new Response(
        JSON.stringify({ error: "Empty transcript", customerName: null, customerPhone: null, address: null, items: [], note: null }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    const prompt = `Bạn là trợ lý phân tích đơn bánh. Phân tích văn bản nói tiếng Việt này và trích xuất:
- customerName: Tên khách hàng (nếu có, viết hoa đầu tiên)
- customerPhone: Số điện thoại (nếu có, chỉ số 10 chữ số)
- address: Địa chỉ giao hàng (nếu có)
- items: Mảng các sản phẩm [{name: "tên bánh", quantity: số lượng (int), unit: "cái" hoặc "khay" hoặc "thùng"}]
- note: Ghi chú thêm (nếu có)

Văn bản ghi âm: "${transcript}"

Trả về JSON hợp lệ:
{
  "customerName": null,
  "customerPhone": null,
  "address": null,
  "items": [],
  "note": null
}

CHỈ TRÍCH XUẤT THÔNG TIN RÕ RÀNG TỪ VĂN BẢN. Không đoán hoặc bổ sung.`;

    if (!GEMINI_API_KEY) {
      console.error("[parse-voice-order] Missing GOOGLE_GENAI_API_KEY");
      throw new Error("API key not configured");
    }

    console.log("[parse-voice-order] Calling Gemini API...");
    const response = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": GEMINI_API_KEY,
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [{ text: prompt }],
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[parse-voice-order] Gemini error:", response.statusText, errorText);
      throw new Error(`Gemini API error: ${response.statusText}`);
    }

    const geminiData = await response.json();
    console.log("[parse-voice-order] Gemini response:", geminiData);

    const content = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
    console.log("[parse-voice-order] Extracted content:", content);

    let result = {};
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        result = JSON.parse(jsonMatch[0]);
        console.log("[parse-voice-order] Parsed result:", result);
      }
    } catch (parseErr) {
      console.error("[parse-voice-order] JSON parse error:", parseErr);
    }

    const response_data = {
      customerName: result.customerName || null,
      customerPhone: result.customerPhone || null,
      address: result.address || null,
      items: Array.isArray(result.items) ? result.items : [],
      note: result.note || null,
    };

    console.log("[parse-voice-order] Returning:", response_data);
    return new Response(
      JSON.stringify(response_data),
      {
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("[parse-voice-order] Error:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
        customerName: null,
        customerPhone: null,
        address: null,
        items: [],
        note: null,
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
