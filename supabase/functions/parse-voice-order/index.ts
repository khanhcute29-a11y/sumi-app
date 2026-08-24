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
    const { transcript, orderType = "cake", locale = "vi-VN" } = (await req.json()) as VoiceOrderRequest;

    if (!transcript?.trim()) {
      return new Response(
        JSON.stringify({ error: "Empty transcript" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const prompt = `Phân tích đơn bánh từ nói tiếng Việt này. Trích xuất:
- customerName: Tên khách hàng (nếu có)
- customerPhone: Số điện thoại (nếu có, chỉ số)
- address: Địa chỉ giao hàng (nếu có)
- items: Mảng các sản phẩm: [{name: "tên bánh", quantity: số lượng, unit: "cái/khay/thùng"}]
- note: Ghi chú thêm

Transcript: "${transcript}"

Trả về JSON với format:
{
  "customerName": "tên hoặc null",
  "customerPhone": "số hoặc null",
  "address": "địa chỉ hoặc null",
  "items": [{...}],
  "note": "ghi chú hoặc null"
}`;

    const response = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": GEMINI_API_KEY || "",
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
      throw new Error(`Gemini API error: ${response.statusText}`);
    }

    const data = await response.json();
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text || "{}";

    const jsonMatch = content.match(/\{[\s\S]*\}/);
    const result = jsonMatch ? JSON.parse(jsonMatch[0]) : {};

    return new Response(
      JSON.stringify({
        customerName: result.customerName || null,
        customerPhone: result.customerPhone || null,
        address: result.address || null,
        items: result.items || [],
        note: result.note || null,
      }),
      {
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
