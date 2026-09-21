import { GoogleGenAI, Type } from '@google/genai';

// Endpoint Serverless Vercel: /api/ai-copilot
// Trợ lý AI 'Gen' - Phục vụ 22 nhân sự tiệm bánh Sumi Bakery
// Tận dụng Google Gemini 2.5 Flash

export default async function handler(req, res) {
  if (req.method === 'GET') {
    return res.status(200).json({ ok: true, name: 'Sumi AI Copilot', model: 'gemini-2.5-flash' });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = (process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY || '').trim();
  if (!apiKey) {
    return res.status(503).json({
      error: 'Chưa cấu hình GEMINI_API_KEY',
      huong_dan: 'Vui lòng thêm GEMINI_API_KEY từ tài khoản Google của tiệm vào file cấu hình môi trường.'
    });
  }

  const { message, imageBase64, userProfile, history } = req.body || {};
  if (!message && !imageBase64) {
    return res.status(400).json({ error: 'Thiếu nội dung tin nhắn hoặc hình ảnh' });
  }

  try {
    const ai = new GoogleGenAI({ apiKey });

    // Khai báo danh mục Tool / Function Calling cho tiệm bánh
    const tools = [{
      functionDeclarations: [
        {
          name: 'tao_don_hang_banh',
          description: 'Bóc tách thông tin tạo đơn bánh từ lời nói, tin nhắn Zalo hoặc ghi chú',
          parameters: {
            type: Type.OBJECT,
            properties: {
              ten_khach: { type: Type.STRING, description: 'Tên khách hàng' },
              so_dien_thoai: { type: Type.STRING, description: 'Số điện thoại nhận bánh' },
              dia_chi: { type: Type.STRING, description: 'Địa chỉ giao bánh nếu ship' },
              hinh_thuc_nhan: { type: Type.STRING, enum: ['lay_tai_tiem', 'giao_hang'], description: 'Tự lấy hay giao hàng' },
              thoi_gian_nhan: { type: Type.STRING, description: 'Ngày và giờ nhận bánh (VD: 16:00 ngày mai, 9h sáng 22/09)' },
              loai_banh: { type: Type.STRING, description: 'Tên loại bánh (Bánh kem bắp, bánh bông lan trứng muối, bánh kem socola...)' },
              size_banh: { type: Type.STRING, description: 'Kích thước bánh (size 16cm, 18cm, 20cm, 24cm...)' },
              chu_viet_len_banh: { type: Type.STRING, description: 'Chữ viết trang trí lên mặt bánh hoặc bảng tên' },
              nen_tuoi: { type: Type.STRING, description: 'Số tuổi cắm nến hoặc nến cây' },
              ghi_chu_tho_banh: { type: Type.STRING, description: 'Yêu cầu đặc biệt cho thợ làm bánh (ít ngọt, nhiều bắp, màu kem...)' },
              tam_tinh_gia: { type: Type.NUMBER, description: 'Giá ước tính nếu có' }
            },
            required: ['ten_khach', 'loai_banh']
          }
        },
        {
          name: 'xin_tam_ung_luong',
          description: 'Tạo yêu cầu xin tạm ứng lương gửi Giám đốc phê duyệt',
          parameters: {
            type: Type.OBJECT,
            properties: {
              so_tien: { type: Type.NUMBER, description: 'Số tiền muốn tạm ứng (VNĐ)' },
              ly_do: { type: Type.STRING, description: 'Lý do cần tạm ứng' },
              ngay_can: { type: Type.STRING, description: 'Ngày cần nhận tiền (YYYY-MM-DD)' }
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
              ngay_nghi: { type: Type.STRING, description: 'Ngày xin nghỉ (hoặc khoảng ngày)' },
              buoi: { type: Type.STRING, enum: ['ca_ngay', 'sang', 'chieu', 'toi'], description: 'Buổi xin nghỉ' },
              ly_do: { type: Type.STRING, description: 'Lý do xin nghỉ' }
            },
            required: ['ngay_nghi', 'ly_do']
          }
        },
        {
          name: 'bao_khoan_chi',
          description: 'Báo cáo một khoản chi tiền mặt hoặc chuyển khoản mua vật tư/lặt vặt',
          parameters: {
            type: Type.OBJECT,
            properties: {
              so_tien: { type: Type.NUMBER, description: 'Số tiền chi (VNĐ)' },
              noi_dung_chi: { type: Type.STRING, description: 'Nội dung chi (mua đá lạnh, túi nilon, tiền gửi xe...)' },
              ghi_chu: { type: Type.STRING, description: 'Ghi chú thêm' }
            },
            required: ['so_tien', 'noi_dung_chi']
          }
        },
        {
          name: 'giao_viec_nhan_su',
          description: 'Giao việc cho một nhân viên cụ thể kèm hạn chót (chỉ áp dụng khi sếp/quản lý giao việc)',
          parameters: {
            type: Type.OBJECT,
            properties: {
              ten_nhan_vien: { type: Type.STRING, description: 'Tên nhân viên được giao việc' },
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

    // Hướng dẫn nghiệp vụ chi tiết cho Gemini
    const role = userProfile?.role || 'staff';
    const name = userProfile?.name || 'Bạn';
    const isDirector = ['owner', 'admin'].includes(role);

    const systemInstruction = `Bạn là "Gen" — Trợ lý Trí tuệ Nhân tạo thông minh, ấm áp và đắc lực của tiệm bánh Sumi Bakery (sumibakery.shop).
Nhiệm vụ của bạn là hỗ trợ 22 nhân sự trong tiệm bánh làm việc nhanh chóng, chính xác bằng giọng nói, tin nhắn và hình ảnh.

NGƯỜI ĐANG NÓI CHUYỆN VỚI BẠN:
- Tên: ${name}
- Vai trò: ${role} (${isDirector ? 'GIÁM ĐỐC / CHỦ TIỆM - Toàn quyền duyệt chi và chỉ đạo' : 'Nhân viên tiệm bánh - Phải tuân thủ quy chế'})

QUY CHẾ TIỆM BÁNH SUMI BAKERY CẦN LƯU Ý:
1. Đặt bánh kem tạo hình phức tạp cần báo trước ít nhất 4 tiếng. Nếu khách đòi lấy gấp dưới 2 tiếng: Phải kích hoạt 'canh_bao_quy_dinh' báo thợ bánh trước khi nhận.
2. Mức chiết khấu tối đa nhân viên được phép giảm là 10-15%. Nếu khách đòi giảm sâu hơn, phải báo cần Giám đốc duyệt.
3. Khi nhân viên xin tạm ứng lương hoặc báo chi: Luôn bóc tách đúng số tiền và lý do, sau đó hỏi xác nhận lại để nhân viên bấm đồng ý trước khi gửi sếp.
4. Với nhân sự không rành chữ, bạn hãy trả lời thật ngắn gọn, ấm áp, rõ ràng, dễ nghe.

Khi người dùng gửi tin nhắn Zalo forward vào hoặc nói giọng nói, hãy tự động nhận diện ý định và gọi Tool tương ứng.`;

    // Chuẩn bị nội dung gửi Gemini (Multimodal text + image nếu có)
    const contents = [];
    if (imageBase64) {
      // Tách mime type và data
      const matches = imageBase64.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
      if (matches && matches.length === 3) {
        contents.push({
          role: 'user',
          parts: [
            { inlineData: { mimeType: matches[1], data: matches[2] } },
            { text: message || 'Hãy phân tích hình ảnh mẫu bánh / chứng từ này và hỗ trợ tôi' }
          ]
        });
      } else {
        contents.push({ role: 'user', parts: [{ text: message }] });
      }
    } else {
      contents.push({ role: 'user', parts: [{ text: message }] });
    }

    // Gọi mô hình Gemini 2.5 Flash
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: contents,
      config: {
        systemInstruction,
        tools: tools,
        temperature: 0.2 // Giữ độ chính xác cao cho nghiệp vụ
      }
    });

    const replyText = response.text || '';
    const functionCalls = response.functionCalls || [];

    return res.status(200).json({
      reply: replyText,
      functionCalls: functionCalls.map(fc => ({
        name: fc.name,
        args: fc.args
      }))
    });

  } catch (err) {
    console.error('[ai-copilot] Error:', err);
    return res.status(500).json({ error: err.message || 'Lỗi xử lý AI' });
  }
}
