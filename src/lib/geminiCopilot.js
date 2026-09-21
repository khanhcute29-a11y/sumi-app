import { supabase } from './supabaseClient';
import { playConfirmSound } from './sound';
import { fetchRevenueByChannel, fetchDoanhThuDuTinh, fetchExpenseAndAdvanceLedgerToday } from './bossOverviewV3';
import { countNewOrders, countKitchenActiveOrders } from './queries';
import { localDateStr } from './date';
import { newId } from './ids';
import { broadcastEvent, BroadcastEvents, notifyOtherTabs } from './realtimeSync';

// Thư viện hỗ trợ Trợ lý AI 'Gen' cho giao diện React
// Tích hợp: Gọi AI, Text-to-Speech (đọc tiếng Việt), Web Speech (ghi âm) và Thực thi lệnh Supabase

/**
 * Thu thập số liệu kinh doanh thời gian thực từ Supabase của Sumi Bakery
 * Cung cấp cho Trợ lý Gen toàn bộ dữ liệu: Đơn hàng, Doanh thu, Công nợ, Chi tiêu
 */
export async function fetchSumiAppSnapshot(userProfile) {
  const role = userProfile?.role || 'staff';
  const isDirector = ['owner', 'admin', 'accountant'].includes(role);
  const today = localDateStr();
  const snapshot = {
    ngay: today,
    vai_tro_nguoi_dung: role,
    ten_nguoi_dung: userProfile?.name || 'Nhân sự'
  };

  try {
    // 1. Tình hình đơn hàng hôm nay
    const [newCount, kitchenCount, todayOrdersRes] = await Promise.all([
      countNewOrders().catch(() => ({ count: 0 })),
      countKitchenActiveOrders().catch(() => ({ count: 0 })),
      supabase
        .from('orders')
        .select('id, order_code, status, status_v2, order_type, customer_name, created_at')
        .gte('created_at', `${today}T00:00:00`)
        .catch(() => ({ data: [] }))
    ]);

    const todayOrders = todayOrdersRes?.data || [];
    snapshot.don_hang = {
      tong_don_tao_hom_nay: todayOrders.length,
      don_moi_cho_bep_nhan: newCount?.count || 0,
      bep_dang_lam: kitchenCount?.count || 0,
      don_dang_giao: todayOrders.filter(o => o.status_v2 === 'in_delivery').length,
      don_hoan_thanh: todayOrders.filter(o => o.status_v2 === 'completed' || o.status === 'hoan_thanh').length
    };

    // 2. Nếu là Ban Giám Đốc hoặc Kế toán -> Lấy toàn bộ số liệu Tài chính & Doanh thu
    if (isDirector) {
      const [revenueRes, duTinhRes, expenseRes] = await Promise.all([
        fetchRevenueByChannel({ from: `${today}T00:00:00`, to: new Date().toISOString() }).catch(err => {
          console.warn('[Snapshot] Doanh thu error:', err);
          return null;
        }),
        fetchDoanhThuDuTinh().catch(err => {
          console.warn('[Snapshot] Doanh thu du tinh error:', err);
          return null;
        }),
        fetchExpenseAndAdvanceLedgerToday().catch(err => {
          console.warn('[Snapshot] Expense error:', err);
          return null;
        })
      ]);

      if (revenueRes) {
        snapshot.tai_chinh = {
          doanh_thu_thuan_hom_nay: revenueRes.total || 0,
          doanh_thu_theo_kenh: (revenueRes.channels || []).map(c => ({
            kenh: c.title || c.name || c.key,
            so_tien: c.amount,
            so_don: c.count,
            ty_le: c.percentage
          }))
        };
      }

      if (duTinhRes) {
        snapshot.doanh_thu_du_tinh = {
          tong_du_tinh: duTinhRes.total || 0,
          tien_dat_coc_da_thu: duTinhRes.buckets?.find(b => b.id === 'deposit')?.amount || 0,
          cong_no_can_thu: duTinhRes.buckets?.find(b => b.id === 'cong_no_can_thu')?.amount || 0,
          don_dang_giao_chua_hoan_tat: duTinhRes.buckets?.find(b => b.id === 'in_delivery')?.amount || 0,
          cong_no_truong_hoc_so_sach: duTinhRes.buckets?.find(b => b.id === 'debt')?.amount || 0
        };
      }

      if (expenseRes) {
        const rows = expenseRes.rows || expenseRes || [];
        const totalChi = rows.reduce((s, r) => s + (Number(r.amount || r.so_tien) || 0), 0);
        snapshot.chi_tieu_so_quy_hom_nay = {
          tong_chi: totalChi,
          so_khoan_chi: rows.length,
          danh_sach: rows.slice(0, 5).map(r => ({
            noi_dung: r.content || r.noi_dung_chi || r.reason || 'Khoản chi',
            so_tien: Number(r.amount || r.so_tien) || 0,
            loai: r.type || 'chi_tieu'
          }))
        };
      }
    }
  } catch (e) {
    console.warn('[fetchSumiAppSnapshot] Lỗi thu thập dữ liệu:', e);
  }

  return snapshot;
}

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
export async function askGenCopilot({ message, imageBase64, userProfile, history, appSnapshot }) {
  try {
    // Tự động trích xuất ảnh chụp số liệu thời gian thực từ Supabase nếu chưa truyền vào
    const liveSnapshot = appSnapshot || await fetchSumiAppSnapshot(userProfile).catch(() => null);

    // 1. Thử gọi qua endpoint Serverless /api/ai-copilot
    const res = await fetch('/api/ai-copilot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, imageBase64, userProfile, history, appSnapshot: liveSnapshot })
    });

    if (res.ok) {
      return await res.json();
    }

    // Nếu endpoint serverless chưa sẵn sàng (ví dụ đang chạy dev Vite thuần):
    // Kiểm tra VITE_GEMINI_API_KEY trong file .env.local
    const clientApiKey = import.meta.env.VITE_GEMINI_API_KEY;
    if (clientApiKey) {
      return await callDirectGemini(clientApiKey, message, imageBase64, userProfile, history, liveSnapshot);
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
async function callDirectGemini(apiKey, message, imageBase64, userProfile, history, liveSnapshot) {
  const { GoogleGenAI, Type } = await import('@google/genai');
  const ai = new GoogleGenAI({ apiKey });

  const role = userProfile?.role || 'staff';
  const name = userProfile?.name || 'Bạn';
  const isDirector = ['owner', 'admin', 'accountant'].includes(role);

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

  let dataSection = '';
  if (liveSnapshot) {
    dataSection = `
DỮ LIỆU THỜI GIAN THỰC TRÊN HỆ THỐNG SUMI BAKERY HÔM NAY (${liveSnapshot.ngay || 'Hôm nay'}):
${JSON.stringify(liveSnapshot, null, 2)}
`;
  }

  const systemInstruction = `Bạn là "Gen" — Hệ điều hành Trợ lý Trí tuệ Nhân tạo toàn diện của tiệm bánh Sumi Bakery (sumibakery.shop).
Bạn hỗ trợ 22 nhân sự trong toàn bộ tiệm bánh thực hiện các nghiệp vụ: Nghe (giọng nói), Nhìn (hình ảnh mẫu bánh/hóa đơn), Phân tích nghiệp vụ, BÁO CÁO TOÀN DIỆN SỐ LIỆU DOANH THU/ĐƠN HÀNG, và Thao tác trực tiếp vào hệ thống cơ sở dữ liệu.

NGƯỜI ĐANG NÓI CHUYỆN VỚI BẠN:
- Tên: ${name}
- Vai trò: ${role} (${isDirector ? 'BAN GIÁM ĐỐC / CHỦ TIỆM / KẾ TOÁN - Toàn quyền chỉ đạo, xem toàn bộ số liệu doanh thu, đơn hàng, công nợ, chi tiêu' : 'Nhân viên tiệm bánh - Tuân thủ quy chế, thao tác trong quyền hạn'})

${dataSection}

NGUYÊN TẮC BÁO CÁO SỐ LIỆU KINH DOANH (CỰC KỲ QUAN TRỌNG):
1. BẠN ĐÃ ĐƯỢC KẾT NỐI TRỰC TIẾP VỚI CƠ SỞ DỮ LIỆU THẬT CỦA TIỆM BÁNH:
   - TUYỆT ĐỐI KHÔNG BAO GIỜ NÓI: "em chưa được kết nối với dữ liệu thu ngân/POS", "chưa thể trích xuất báo cáo", hoặc "vui lòng gửi sao kê hóa đơn".
   - Khi được hỏi về doanh thu, đơn hàng, công nợ, chi tiêu: HÃY ĐỌC TRỰC TIẾP CÁC CON SỐ TRONG [DỮ LIỆU THỜI GIAN THỰC] Ở TRÊN ĐỂ BÁO CÁO NGAY LẬP TỨC.
   - Nếu số tiền là 0 hoặc chưa có đơn phát sinh, báo cáo trung thực: "Hôm nay tiệm chưa có đơn hoàn thành ghi nhận doanh thu thuần, hiện có X đơn đang làm/đang giao...".

2. CÁCH TRÌNH BÀY BÁO CÁO DOANH THU CHO SẾP:
   - Tổng kết rõ ràng theo cấu trúc tài chính chuẩn của Sumi Bakery:
     * 💰 Doanh thu thuần (Đơn hoàn thành & xác minh thu tiền): Tổng tiền + chi tiết theo kênh (Bánh kem, Bánh mặn/ngọt, Macaron, Teabreak, Trường học...).
     * 📊 Doanh thu dự tính & Công nợ: Tiền cọc đã nhận + Công nợ cần thu từ khách + Giá trị đơn đang trên đường giao.
     * 📦 Tình hình đơn hàng hôm nay: Số đơn mới, bếp đang làm, đang giao, đã giao.
     * 💸 Chi tiêu & Tạm ứng hôm nay (nếu có): Tổng số tiền chi, nội dung chi.
   - Luôn định dạng tiền tệ Việt Nam rõ ràng (VD: 1.500.000đ hoặc 0đ), dùng dấu gạch đầu dòng và icon emoji trang nhã, dễ nhìn trên điện thoại.

3. PHÂN QUYỀN BẢO MẬT DOANH THU:
   - Chỉ Ban Giám Đốc (${isDirector ? 'Sếp ' + name : 'Giám đốc/Kế toán'}) mới được xem số tiền doanh thu và chi tiêu của toàn tiệm.
   - Nếu nhân viên thông thường (thợ làm bánh, shipper) hỏi doanh thu của tiệm, hãy lịch sự từ chối và chỉ thông báo số lượng đơn bánh cần làm.

NGUYÊN TẮC TƯ DUY & PHÂN TÍCH NGHIỆP VỤ (CỰC KỲ QUAN TRỌNG):
1. KHÔNG LÊN ĐƠN BÁNH KHI THIẾU THÔNG TIN CỐT LÕI:
   - Một đơn bánh kem chuẩn cần tối thiểu: [Tên khách/SĐT], [Loại bánh], [Size bánh (cm/tấc)], [Giờ lấy bánh/giao bánh].
   - Ví dụ: Nếu người dùng chỉ nói "Lên đơn bánh kem cho chị Hoa", bạn KHÔNG được tự ý tạo đơn thiếu, mà PHẢI phân tích và hỏi lại rõ ràng:
     "Dạ em đã ghi nhận bánh kem cho chị Hoa. Để em lên đơn chính xác cho thợ làm, chị Hoa đặt size bao nhiêu cm và hẹn lấy lúc mấy giờ vậy ạ? Có số điện thoại và chữ ghi lên bánh không ạ?"
   - Chỉ khi đã có tương đối đủ các yếu tố (hoặc tin nhắn Zalo/ảnh đã bóc tách rõ), bạn mới kích hoạt tool 'tao_don_hang_banh'.

2. PHÂN QUYỀN VÀ GIỚI HẠN THAO TÁC:
   - Chỉ BAN GIÁM ĐỐC (${isDirector ? 'Sếp ' + name : 'Giám đốc'}) mới có quyền giao việc nhân sự ('giao_viec_nhan_su') và duyệt các khoản chi/tạm ứng.
   - Nếu nhân viên yêu cầu việc vượt quyền hạn, hãy lịch sự từ chối và hướng dẫn báo cáo Giám đốc.

3. TỰ ĐỘNG CẢNH BÁO QUY CHẾ VÀ ĐỀ XUẤT:
   - Đặt bánh lấy gấp dưới 2 tiếng: Kích hoạt 'canh_bao_quy_dinh' vì quy định tiệm bánh kem tạo hình cần ít nhất 4 tiếng để nướng cốt và trang trí.
   - Giảm giá > 15%: Cảnh báo cần Giám đốc phê duyệt trước khi chốt đơn.
   - Khi nhân viên xin tạm ứng hoặc báo chi: Bóc tách đúng số tiền, lý do và tạo thẻ xác nhận 2 bước.

4. PHONG CÁCH GIAO TIẾP:
   - Ấm áp, nhã nhặn, thông minh, chuyên nghiệp. Với nhân viên phụ bếp/lao động không rành chữ, dùng câu ngắn gọn, mạch lạc, dễ nghe.`;

  const contents = [];

  // Đưa lịch sử hội thoại gần nhất vào ngữ cảnh (trừ tin nhắn hiện tại)
  if (history && Array.isArray(history)) {
    for (const h of history.slice(-6)) {
      if (!h.text) continue;
      contents.push({
        role: h.sender === 'user' ? 'user' : 'model',
        parts: [{ text: h.text }]
      });
    }
  }

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

/**
 * Thực thi lệnh Tạo Đơn Hàng Trực Tiếp và Chuyển Bếp vào Supabase (create_order_v2)
 * Tự động phân loại đơn (Trường học, Bánh kem, Bánh mặn, Macaron), khớp khách hàng và gửi lệnh xuống Bếp
 */
export async function executeCreateOrderDirectly(orderArgs, userProfile) {
  if (!orderArgs) throw new Error('Thiếu thông tin đơn bánh');

  const trimmedName = (orderArgs.ten_khach || 'Khách lẻ').trim();
  const trimmedPhone = (orderArgs.so_dien_thoai || '').trim();
  const cakeName = (orderArgs.loai_banh || 'Bánh kem').trim();
  const sizeText = (orderArgs.size_banh || '').trim();

  // 1. Phân loại luồng đơn
  let orderType = 'cake';
  const nameLower = trimmedName.toLowerCase();
  const cakeLower = cakeName.toLowerCase();

  if (
    nameLower.includes('trường') ||
    nameLower.includes('tiểu học') ||
    nameLower.includes('mầm non') ||
    nameLower.includes('thcs') ||
    nameLower.includes('thpt') ||
    nameLower.includes('mẫu giáo') ||
    nameLower.includes('school')
  ) {
    orderType = 'school';
  } else if (cakeLower.includes('macaron')) {
    orderType = 'macaron';
  } else if (cakeLower.includes('teabreak')) {
    orderType = 'teabreak';
  } else if (
    cakeLower.includes('bánh mì') ||
    cakeLower.includes('bông lan') ||
    cakeLower.includes('croissant') ||
    cakeLower.includes('bánh bao') ||
    cakeLower.includes('chà bông')
  ) {
    orderType = 'bakery';
  } else {
    orderType = 'cake';
  }

  // 2. Khớp hoặc tạo khách hàng
  let customerId = null;
  if (orderType === 'school') {
    const { data: schools } = await supabase
      .from('customers')
      .select('id, name')
      .eq('is_school', true);

    const norm = (s) => (s || '').toLowerCase().trim().replace(/\s+/g, ' ');
    const hit = (schools || []).find(
      s => norm(s.name) === norm(trimmedName) || norm(s.name).includes(norm(trimmedName)) || norm(trimmedName).includes(norm(s.name))
    );

    if (hit) {
      customerId = hit.id;
    } else {
      const { data: newSc, error: scErr } = await supabase
        .from('customers')
        .insert({
          name: trimmedName,
          phone: trimmedPhone || null,
          address: orderArgs.dia_chi || null,
          is_school: true,
          channel: 'school'
        })
        .select('id')
        .single();
      if (!scErr && newSc) {
        customerId = newSc.id;
      }
    }
  } else {
    if (trimmedPhone) {
      const { data: cByPhone } = await supabase
        .from('customers')
        .select('id, name')
        .eq('phone', trimmedPhone)
        .maybeSingle();
      if (cByPhone) customerId = cByPhone.id;
    }
    if (!customerId && trimmedName && trimmedName !== 'Khách lẻ') {
      const { data: cByName } = await supabase
        .from('customers')
        .select('id, name')
        .eq('name', trimmedName)
        .maybeSingle();
      if (cByName) customerId = cByName.id;
    }
    if (!customerId) {
      const { data: newCust, error: cErr } = await supabase
        .from('customers')
        .insert({
          name: trimmedName,
          phone: trimmedPhone || null,
          address: orderArgs.dia_chi || null,
          channel: 'retail'
        })
        .select('id')
        .single();
      if (!cErr && newCust) {
        customerId = newCust.id;
      }
    }
  }

  // 3. Xử lý thời gian giao bánh
  let requiredAt = null;
  const timeRaw = (orderArgs.thoi_gian_nhan || '').toLowerCase();
  const now = new Date();

  let hours = 8;
  let minutes = 0;
  const timeMatch = timeRaw.match(/(\d{1,2})(?:[:h](\d{2}))?/);
  if (timeMatch) {
    hours = parseInt(timeMatch[1], 10);
    if (timeMatch[2]) minutes = parseInt(timeMatch[2], 10);
  }

  if (timeRaw.includes('mai') || timeRaw.includes('ngày mai') || timeRaw.includes('sáng mai')) {
    const tmr = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, hours, minutes, 0);
    requiredAt = tmr.toISOString();
  } else if (timeRaw.includes('hôm nay') || timeRaw.includes('chiều nay') || timeRaw.includes('tối nay')) {
    const todayTarget = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes, 0);
    requiredAt = todayTarget.toISOString();
  } else {
    // Mặc định 8h sáng mai nếu không rõ mốc ngày
    const defaultTarget = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, hours, minutes, 0);
    requiredAt = defaultTarget.toISOString();
  }

  // 4. Bóc tách số lượng món
  let qty = 1;
  const qtyMatch = sizeText.match(/(\d+)\s*(?:cái|ổ|hộp|phần|bánh)/i) || cakeName.match(/(\d+)\s*(?:cái|ổ|hộp|phần|bánh)/i);
  if (qtyMatch) {
    qty = parseInt(qtyMatch[1], 10);
  } else {
    const numOnly = parseInt(sizeText, 10);
    if (!isNaN(numOnly) && numOnly > 0) qty = numOnly;
  }

  const items = [
    {
      name: cakeName,
      quantity: qty,
      display_order: 0,
      unit: 'cái',
      specification: {
        size: sizeText || `${qty} cái`,
        product_flow: orderType,
        writing: orderArgs.chu_viet_len_banh || null,
        cake_note: orderArgs.ghi_chu_tho_banh || null,
        candles: orderArgs.nen_tuoi || null
      }
    }
  ];

  // 5. Sinh mã đơn hàng
  const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  const timeStr = String(now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds()).padStart(5, '0');
  const orderCode = `SUMI-${dateStr}-${timeStr}`;
  const idempotencyKey = newId();

  const customerNote = [
    trimmedName && `Khách: ${trimmedName}`,
    trimmedPhone && `SĐT: ${trimmedPhone}`,
    orderArgs.chu_viet_len_banh && `Chữ: "${orderArgs.chu_viet_len_banh}"`,
    orderArgs.nen_tuoi && `Nến: ${orderArgs.nen_tuoi}`,
    orderArgs.ghi_chu_tho_banh,
    '⚡ Đơn tạo trực tiếp qua Trợ lý AI Gen'
  ].filter(Boolean).join(' · ');

  // 6. Thực thi tạo đơn và tự động chuyển gói việc Bếp (create_order_v2)
  const { data: orderId, error: orderErr } = await supabase.rpc('create_order_v2', {
    p_idempotency_key: idempotencyKey,
    p_order_code: orderCode,
    p_order_type: orderType,
    p_customer_id: customerId,
    p_required_at: requiredAt,
    p_fulfillment_method: orderArgs.dia_chi ? 'delivery' : (orderArgs.hinh_thuc_nhan || 'delivery'),
    p_address: orderArgs.dia_chi || null,
    p_note: customerNote,
    p_confidentiality: orderType === 'school' ? 'school_restricted' : 'normal',
    p_items: items,
    p_ship_fee: 0,
    p_deposit: 0,
    p_payment_method: orderType === 'school' ? 'debt' : 'cod',
    p_total: Number(orderArgs.tam_tinh_gia) || 0,
    p_discount_amount: 0,
    p_promotion_note: null,
    p_tax_code: null,
    p_vat_amount: 0
  });

  if (orderErr) throw orderErr;

  // 7. Bắn sự kiện Realtime thông báo cho Bếp và các màn hình khác
  try {
    await broadcastEvent(BroadcastEvents.ORDER_CREATED, {
      orderId,
      orderCode,
      orderType,
      customerName: trimmedName,
      createdAt: new Date().toISOString()
    });
    notifyOtherTabs(BroadcastEvents.ORDER_CREATED, { orderId });
  } catch (e) {
    console.warn('[executeCreateOrderDirectly] Broadcast event warning:', e);
  }

  playConfirmSound();
  return {
    success: true,
    orderId,
    orderCode,
    orderType,
    customerName: trimmedName,
    message: `Đã tạo thành công đơn hàng #${orderCode} cho ${trimmedName} (${cakeName} - ${qty} cái) và chuyển ngay xuống Bếp làm bánh!`
  };
}


