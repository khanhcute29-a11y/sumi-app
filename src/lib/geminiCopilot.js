import { supabase } from './supabaseClient';
import { playConfirmSound } from './sound';

// Thư viện hỗ trợ Trợ lý AI 'Gen' cho giao diện React
// Tích hợp: Gọi AI, Text-to-Speech (đọc tiếng Việt), Web Speech (ghi âm) và Thực thi lệnh Supabase

/**
 * Đọc to văn bản tiếng Việt cho nhân sự (hỗ trợ nhân viên không biết chữ)
 */
export function speakVietnamese(text) {
  if (!('speechSynthesis' in window) || !text) return;
  try {
    window.speechSynthesis.cancel(); // Dừng câu cũ
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'vi-VN';
    utterance.rate = 0.95; // Tốc độ vừa phải, dễ nghe
    utterance.pitch = 1.0;

    // Tìm giọng tiếng Việt nếu có sẵn trên máy (Android/iOS/Chrome)
    const voices = window.speechSynthesis.getVoices();
    const viVoice = voices.find(v => v.lang.includes('vi') || v.name.includes('Vietnamese'));
    if (viVoice) utterance.voice = viVoice;

    window.speechSynthesis.speak(utterance);
  } catch (err) {
    console.warn('[speakVietnamese] Không thể phát giọng nói:', err);
  }
}

/**
 * Dừng giọng nói
 */
export function stopSpeaking() {
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
}

/**
 * Gửi yêu cầu tới Trợ lý Gen (Backend Serverless hoặc Direct API)
 */
export async function askGenCopilot({ message, imageBase64, userProfile }) {
  try {
    // 1. Thử gọi qua endpoint Serverless /api/ai-copilot
    const res = await fetch('/api/ai-copilot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, imageBase64, userProfile })
    });

    if (res.ok) {
      return await res.json();
    }

    // Nếu endpoint serverless chưa sẵn sàng (ví dụ đang chạy dev Vite thuần):
    // Kiểm tra VITE_GEMINI_API_KEY trong file .env.local
    const clientApiKey = import.meta.env.VITE_GEMINI_API_KEY;
    if (clientApiKey) {
      return await callDirectGemini(clientApiKey, message, imageBase64, userProfile);
    }

    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || `Lỗi máy chủ (${res.status})`);
  } catch (err) {
    console.error('[askGenCopilot] Lỗi:', err);
    throw err;
  }
}

/**
 * Fallback: Gọi trực tiếp Google GenAI nếu chạy môi trường local Vite dev
 */
async function callDirectGemini(apiKey, message, imageBase64, userProfile) {
  const { GoogleGenAI } = await import('@google/genai');
  const ai = new GoogleGenAI({ apiKey });

  const role = userProfile?.role || 'staff';
  const name = userProfile?.name || 'Bạn';

  const systemInstruction = `Bạn là Trợ lý 'Gen' của tiệm bánh Sumi Bakery.
Bạn đang hỗ trợ nhân viên: ${name} (Vai trò: ${role}).
Nhiệm vụ:
- Tự động bóc tách đơn bánh kem từ tin nhắn Zalo hoặc giọng nói (tên khách, SĐT, loại bánh, size, giờ nhận, chữ ghi bánh).
- Nhận diện yêu cầu tạm ứng lương, báo chi, xin nghỉ phép.
- Phát hiện cảnh báo vi phạm quy chế tiệm bánh (đặt gấp dưới 2 tiếng, giảm giá quá 15%).
Hãy trả lời thân thiện, ấm áp và trả về kết quả rõ ràng.`;

  const contents = [];
  if (imageBase64) {
    const matches = imageBase64.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
    if (matches && matches.length === 3) {
      contents.push({
        role: 'user',
        parts: [
          { inlineData: { mimeType: matches[1], data: matches[2] } },
          { text: message || 'Hãy phân tích hình ảnh này cho tôi' }
        ]
      });
    } else {
      contents.push({ role: 'user', parts: [{ text: message }] });
    }
  } else {
    contents.push({ role: 'user', parts: [{ text: message }] });
  }

  const response = await ai.models.generateContent({
    model: 'gemini-3.6-flash',
    contents: contents,
    config: { systemInstruction }
  });

  return {
    reply: response.text || 'Dạ em đã nhận được yêu cầu.',
    functionCalls: []
  };
}

/**
 * Thực thi lệnh Tạm Ứng Lương vào Supabase (đã có sẵn RPC)
 */
export async function executeSalaryAdvance({ soTien, lyDo, ngayCan }) {
  const neededDate = ngayCan || new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase.rpc('submit_salary_advance', {
    p_amount: Number(soTien),
    p_reason: String(lyDo || 'Tạm ứng lương qua trợ lý Gen').trim(),
    p_needed_on: neededDate,
    p_payment_method: 'cash'
  });

  if (error) throw error;
  playConfirmSound();
  return { success: true, message: `Đã gửi yêu cầu tạm ứng ${Number(soTien).toLocaleString('vi-VN')}đ tới Giám đốc!` };
}

/**
 * Thực thi lệnh Báo Chi vào Supabase
 */
export async function executeExpenseClaim({ soTien, noiDungChi, ghiChu }) {
  const { data, error } = await supabase.rpc('submit_expense_claim', {
    p_amount: Number(soTien),
    p_description: String(noiDungChi || 'Khoản chi qua Gen').trim(),
    p_note: ghiChu ? String(ghiChu).trim() : null,
    p_related_order_code: null,
    p_receipt_attachments: null,
    p_occurred_at: new Date().toISOString()
  });

  if (error) throw error;
  playConfirmSound();
  return { success: true, message: `Đã ghi nhận khoản chi ${Number(soTien).toLocaleString('vi-VN')}đ!` };
}

/**
 * Thực thi lệnh Xác Nhận Nhận Việc (cho nhân viên không biết chữ)
 */
export async function executeAcceptTask(taskId) {
  if (!taskId) return { success: false };
  const { error } = await supabase.from('tasks').update({
    status: 'dang_lam',
    started_at: new Date().toISOString()
  }).eq('id', taskId);

  if (error) throw error;
  playConfirmSound();
  return { success: true, message: 'Đã xác nhận nhận việc thành công!' };
}
