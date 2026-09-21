import { supabase } from './supabaseClient';
import { playConfirmSound } from './sound';

// Thư viện hỗ trợ Trợ lý AI 'Gen' cho giao diện React
// Tích hợp: Gọi AI, Text-to-Speech (đọc tiếng Việt), Web Speech (ghi âm) và Thực thi lệnh Supabase

let persistentAudio = null;

function getAudioPlayer() {
  if (typeof window === 'undefined') return null;
  if (!persistentAudio) {
    persistentAudio = new Audio();
  }
  return persistentAudio;
}

/**
 * Dừng giọng nói đang phát
 */
export function stopSpeaking() {
  if (persistentAudio) {
    try {
      persistentAudio.pause();
      persistentAudio.currentTime = 0;
    } catch (_) {}
  }
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
}

/**
 * Đọc to văn bản bằng GIỌNG NAM MINH chuẩn tiếng Việt (vi-VN-NamMinhNeural)
 * Hỗ trợ cho nhân viên nghe rõ ràng, tự nhiên như người thật đọc.
 */
export function speakVietnamese(text) {
  if (!text) return;
  stopSpeaking();

  // Loại bỏ các ký tự định dạng markdown như *, #, _, ` để đọc tự nhiên nhất
  const cleanText = text
    .replace(/[*_#`~>]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleanText) return;

  // 1. Ưu tiên phát qua Endpoint Nam Minh Neural TTS (/api/tts)
  try {
    const player = getAudioPlayer();
    if (player) {
      player.src = `/api/tts?text=${encodeURIComponent(cleanText.slice(0, 800))}`;
      const playPromise = player.play();
      if (playPromise !== undefined) {
        playPromise.catch(err => {
          console.warn('[NamMinh TTS] Không thể tự động phát, dùng giọng dự phòng:', err);
          fallbackSpeechSynthesis(cleanText);
        });
      }
      return;
    }
  } catch (err) {
    console.warn('[speakVietnamese] Audio init error:', err);
    fallbackSpeechSynthesis(cleanText);
  }
}

/**
 * Fallback khi mất mạng hoặc không gọi được audio stream
 */
function fallbackSpeechSynthesis(cleanText) {
  if (!('speechSynthesis' in window)) return;
  try {
    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = 'vi-VN';
    utterance.rate = 0.95;
    utterance.pitch = 1.0;

    const voices = window.speechSynthesis.getVoices();
    // Ưu tiên giọng NamMinh hoặc Natural tiếng Việt nếu có trên hệ thống
    const namMinhVoice = voices.find(v => v.name.includes('NamMinh') || (v.name.includes('Natural') && v.lang.includes('vi')));
    const viVoice = namMinhVoice || voices.find(v => v.lang.includes('vi') || v.name.includes('Vietnamese'));
    if (viVoice) utterance.voice = viVoice;

    window.speechSynthesis.speak(utterance);
  } catch (e) {
    console.warn('[fallbackSpeechSynthesis] Error:', e);
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
/**
 * Fallback: Gọi trực tiếp Google GenAI nếu chạy môi trường local Vite dev
 */
async function callDirectGemini(apiKey, message, imageBase64, userProfile) {
  const { GoogleGenAI, Type } = await import('@google/genai');
  const ai = new GoogleGenAI({ apiKey });

  const role = userProfile?.role || 'staff';
  const name = userProfile?.name || 'Bạn';
  const isDirector = ['owner', 'admin'].includes(role);

  const tools = [{
    functionDeclarations: [
      {
        name: 'tao_don_hang_banh',
        description: 'Tạo đơn đặt bánh kem mới từ thông tin khách gửi qua Zalo hoặc đọc miệng',
        parameters: {
          type: Type.OBJECT,
          properties: {
            ten_khach: { type: Type.STRING, description: 'Họ tên khách hàng' },
            so_dien_thoai: { type: Type.STRING, description: 'Số điện thoại liên hệ' },
            loai_banh: { type: Type.STRING, description: 'Tên loại bánh (Bánh kem bắp, Tiramisu...)' },
            size_banh: { type: Type.STRING, description: 'Kích thước bánh (16cm, 20cm, 25cm...)' },
            ngay_giao: { type: Type.STRING, description: 'Ngày và giờ khách hẹn lấy' },
            noi_dung_ghi_banh: { type: Type.STRING, description: 'Chữ viết lên mặt bánh (Happy Birthday...)' },
            dia_chi_giao: { type: Type.STRING, description: 'Địa chỉ giao bánh nếu ship tận nơi' },
            ghi_chu: { type: Type.STRING, description: 'Yêu cầu đặc biệt về màu sắc, phụ kiện' }
          },
          required: ['loai_banh']
        }
      },
      {
        name: 'xin_tam_ung_luong',
        description: 'Tạo phiếu xin tạm ứng lương gửi Giám đốc phê duyệt',
        parameters: {
          type: Type.OBJECT,
          properties: {
            so_tien: { type: Type.NUMBER, description: 'Số tiền muốn tạm ứng (VNĐ)' },
            ly_do: { type: Type.STRING, description: 'Lý do cần tạm ứng' },
            ngay_can: { type: Type.STRING, description: 'Ngày cần nhận tiền' }
          },
          required: ['so_tien', 'ly_do']
        }
      },
      {
        name: 'xin_nghi_phep',
        description: 'Tạo yêu cầu xin nghỉ phép gửi quản lý / giám đốc duyệt',
        parameters: {
          type: Type.OBJECT,
          properties: {
            ngay_nghi: { type: Type.STRING, description: 'Ngày xin nghỉ' },
            buoi: { type: Type.STRING, enum: ['ca_ngay', 'sang', 'chieu', 'toi'], description: 'Buổi xin nghỉ' },
            ly_do: { type: Type.STRING, description: 'Lý do xin nghỉ' }
          },
          required: ['ngay_nghi', 'ly_do']
        }
      },
      {
        name: 'bao_khoan_chi',
        description: 'Báo cáo một khoản chi tiền mặt mua vật tư/lặt vặt (mua đá lạnh, túi nilon...)',
        parameters: {
          type: Type.OBJECT,
          properties: {
            so_tien: { type: Type.NUMBER, description: 'Số tiền chi (VNĐ)' },
            noi_dung_chi: { type: Type.STRING, description: 'Nội dung chi (mua đá, phụ liệu...)' },
            ghi_chu: { type: Type.STRING, description: 'Ghi chú thêm' }
          },
          required: ['so_tien', 'noi_dung_chi']
        }
      },
      {
        name: 'giao_viec_nhan_su',
        description: 'Giao việc cho một nhân viên cụ thể kèm hạn chót',
        parameters: {
          type: Type.OBJECT,
          properties: {
            ten_nhan_vien: { type: Type.STRING, description: 'Tên nhân viên được giao việc (ví dụ: Tiến, Lan, Nam...)' },
            noi_dung_viec: { type: Type.STRING, description: 'Mô tả công việc cần làm' },
            han_chot: { type: Type.STRING, description: 'Thời hạn hoàn thành' },
            yeu_cau_anh: { type: Type.BOOLEAN, description: 'Có bắt buộc chụp ảnh nghiệm thu không' }
          },
          required: ['ten_nhan_vien', 'noi_dung_viec']
        }
      },
      {
        name: 'canh_bao_quy_dinh',
        description: 'Kích hoạt cảnh báo vi phạm quy chế tiệm bánh (đặt gấp dưới 2h, chiết khấu quá 15%)',
        parameters: {
          type: Type.OBJECT,
          properties: {
            muc_do: { type: Type.STRING, enum: ['canh_bao', 'nghiem_trong'], description: 'Mức độ cảnh báo' },
            noi_dung_vi_pham: { type: Type.STRING, description: 'Nội dung vi phạm quy chế' },
            huong_giai_quyet: { type: Type.STRING, description: 'Gợi ý giải quyết cho nhân viên' }
          },
          required: ['muc_do', 'noi_dung_vi_pham']
        }
      }
    ]
  }];

  const systemInstruction = `Bạn là "Gen" — Trợ lý Trí tuệ Nhân tạo thông minh, ấm áp và đắc lực của tiệm bánh Sumi Bakery (sumibakery.shop).
Nhiệm vụ của bạn là hỗ trợ 22 nhân sự trong tiệm bánh làm việc nhanh chóng, chính xác bằng giọng nói, tin nhắn và hình ảnh.

NGƯỜI ĐANG NÓI CHUYỆN VỚI BẠN:
- Tên: ${name}
- Vai trò: ${role} (${isDirector ? 'GIÁM ĐỐC / CHỦ TIỆM - Toàn quyền duyệt chi và chỉ đạo' : 'Nhân viên tiệm bánh - Phải tuân thủ quy chế'})

CÁCH HƯỚNG DẪN VÀ TƯƠNG TÁC TỰ NHIÊN:
1. Khi người dùng mới chưa biết sử dụng, hỏi "chưa biết dùng", "bạn làm được gì", "hướng dẫn tôi": Hãy hướng dẫn thật ngắn gọn, ấm áp: Bạn có thể giúp Sếp giao việc cho nhân viên, lên đơn bánh kem từ tin nhắn Zalo, ghi nhận khoản chi mua đồ, hoặc xin tạm ứng lương. Sếp/bạn chỉ cần nói hoặc gõ tự nhiên như đang nói chuyện với một người trợ lý thật.
2. Khi người dùng muốn giao việc: Gọi ngay tool 'giao_viec_nhan_su'.
3. Khi khách gửi tin nhắn Zalo hoặc ảnh mẫu bánh: Tự động bóc tách và gọi 'tao_don_hang_banh'.
4. Khi nhân viên xin tạm ứng lương hoặc báo chi: Luôn bóc tách đúng số tiền và lý do, sau đó kích hoạt tool tương ứng.
5. Với nhân sự không rành chữ, bạn hãy trả lời thật ngắn gọn, ấm áp, rõ ràng, dễ nghe.`;

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

  // Model Cascade: Tự động dự phòng nếu model bị 503 quá tải
  const candidateModels = [
    'gemini-3.5-flash-lite',
    'gemini-3.5-flash',
    'gemini-flash-latest',
    'gemini-3.6-flash'
  ];

  let response = null;
  let lastError = null;

  for (const model of candidateModels) {
    try {
      response = await ai.models.generateContent({
        model,
        contents,
        config: {
          systemInstruction,
          tools,
          temperature: 0.2
        }
      });
      if (response) break;
    } catch (err) {
      lastError = err;
      console.warn(`[Client Gemini Model ${model} Warning]:`, err.message);
    }
  }

  if (!response) {
    throw lastError || new Error('Không thể kết nối tới mô hình AI');
  }

  return {
    reply: response.text || '',
    functionCalls: (response.functionCalls || []).map(fc => ({
      name: fc.name,
      args: fc.args
    }))
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

/**
 * Thực thi lệnh Giao Việc Cho Nhân Sự vào Supabase
 */
export async function executeAssignTask({ tenNhanVien, noiDungViec, hanChot, yeuCauAnh }) {
  let assigneeId = null;
  let targetStaffName = tenNhanVien || 'Nhân sự';

  try {
    const { data: staffList } = await supabase.from('profiles').select('id, full_name, station, role');
    if (staffList && staffList.length > 0) {
      const searchKey = (tenNhanVien || '').toLowerCase().trim();
      const match = staffList.find(s => s.full_name?.toLowerCase().includes(searchKey));
      if (match) {
        assigneeId = match.id;
        targetStaffName = match.full_name;
      }
    }
  } catch (e) {
    console.warn('Không thể query profiles:', e);
  }

  let success = false;
  if (assigneeId) {
    const { error: rpcErr } = await supabase.rpc('create_general_task', {
      p_category: 'assigned',
      p_title: noiDungViec || 'Công việc từ Sếp',
      p_description: `Giao bởi Sếp qua Trợ lý Gen. Hạn chót: ${hanChot || 'Trong ngày'}${yeuCauAnh ? ' (Có chụp ảnh)' : ''}`,
      p_order_code: null,
      p_assignee_id: assigneeId,
      p_deadline: null,
      p_reminder_at: null
    });
    if (!rpcErr) success = true;
  }

  if (!success) {
    const { error: insErr } = await supabase.from('tasks').insert({
      title: noiDungViec || 'Công việc từ Sếp',
      description: `Giao cho: ${targetStaffName}. Hạn chót: ${hanChot || 'Trong ngày'}`,
      category: 'assigned',
      status: 'pending',
      assignee_id: assigneeId || null,
      created_at: new Date().toISOString()
    });
    if (insErr) {
      console.warn('Fallback insert tasks error:', insErr);
    }
  }

  playConfirmSound();
  return {
    success: true,
    message: `Đã giao việc "${noiDungViec}" cho bạn ${targetStaffName} thành công!`
  };
}

