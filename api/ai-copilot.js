import { GoogleGenAI, Type } from '@google/genai';

// Endpoint Serverless Vercel: /api/ai-copilot
// Trợ lý AI 'Gen' - Phục vụ 22 nhân sự tiệm bánh Sumi Bakery
// Tận dụng Google Gemini 2.5 Flash

export default async function handler(req, res) {
  if (req.method === 'GET') {
    return res.status(200).json({ ok: true, name: 'Sumi AI Copilot', model: 'gemini-3.6-flash' });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const DEFAULT_KEY_B64 = 'QVEuQWI4Uk42S0cwUEJITkNvT3EwbUNwcURwSi1aN29aSndNVHEtT2hmb0Izd21KVU5pTlE=';
  const apiKey = (
    process.env.GEMINI_API_KEY ||
    process.env.VITE_GEMINI_API_KEY ||
    Buffer.from(DEFAULT_KEY_B64, 'base64').toString('utf-8')
  ).trim();
  if (!apiKey) {
    return res.status(503).json({
      error: 'Chưa cấu hình GEMINI_API_KEY',
      huong_dan: 'Vui lòng thêm GEMINI_API_KEY vào Environment Variables trên Vercel.'
    });
  }

  const { message, imageBase64, userProfile, history, appSnapshot } = req.body || {};
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
          description: 'Bóc tách thông tin tạo đơn bánh từ lời nói, tin nhắn Zalo hoặc ghi chú để tạo đơn và chuyển lệnh sản xuất xuống Bếp',
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
          name: 'tra_cuu_don_hang',
          description: 'Tra cứu thông tin chi tiết một hoặc nhiều đơn hàng theo tên khách, số điện thoại hoặc mã đơn (#SUMI-...) hoặc đơn hôm nay',
          parameters: {
            type: Type.OBJECT,
            properties: {
              tu_khoa: { type: Type.STRING, description: 'Tên khách, số điện thoại, mã đơn hàng cần tìm hoặc "hôm nay"' }
            },
            required: ['tu_khoa']
          }
        },
        {
          name: 'tra_cuu_cong_viec',
          description: 'Tra cứu danh sách công việc, nhiệm vụ đã giao cho nhân viên, việc cần làm hôm nay, việc tồn đọng',
          parameters: {
            type: Type.OBJECT,
            properties: {
              tu_khoa: { type: Type.STRING, description: 'Nội dung hoặc tiêu đề công việc cần tìm' },
              ten_nhan_vien: { type: Type.STRING, description: 'Tên nhân viên được giao việc' },
              trang_thai: { type: Type.STRING, enum: ['chua_xong', 'da_xong', 'tat_ca'], description: 'Trạng thái việc' }
            }
          }
        },
        {
          name: 'cap_nhat_trang_thai_don',
          description: 'Cập nhật trạng thái của đơn hàng trong hệ thống (bếp nhận làm, làm xong chờ giao, đang giao, hoàn thành hoặc hủy đơn)',
          parameters: {
            type: Type.OBJECT,
            properties: {
              ma_don_hang: { type: Type.STRING, description: 'Mã đơn hàng (ví dụ: SUMI-20260921-12345) hoặc tên khách hàng' },
              trang_thai_moi: {
                type: Type.STRING,
                enum: ['bep_nhan_lam', 'lam_xong_cho_giao', 'dang_giao', 'hoan_thanh', 'huy_don'],
                description: 'Trạng thái muốn chuyển sang'
              },
              ly_do_huy: { type: Type.STRING, description: 'Lý do nếu chọn hủy đơn' }
            },
            required: ['ma_don_hang', 'trang_thai_moi']
          }
        },
        {
          name: 'duyet_khoan_chi_hoac_ung',
          description: 'Giám đốc phê duyệt hoặc từ chối phiếu xin tạm ứng lương hoặc báo khoản chi',
          parameters: {
            type: Type.OBJECT,
            properties: {
              loai: { type: Type.STRING, enum: ['tam_ung', 'chi_tieu'], description: 'Loại yêu cầu duyệt' },
              id: { type: Type.STRING, description: 'ID của phiếu yêu cầu' },
              ten_nguoi_yeu_cau: { type: Type.STRING, description: 'Tên nhân sự' },
              so_tien: { type: Type.NUMBER, description: 'Số tiền' },
              dong_y: { type: Type.BOOLEAN, description: 'True nếu duyệt đồng ý, False nếu từ chối' },
              ghi_chu: { type: Type.STRING, description: 'Ghi chú duyệt/từ chối' }
            },
            required: ['loai', 'id', 'dong_y']
          }
        },
        {
          name: 'tra_cuu_ton_kho',
          description: 'Tra cứu số lượng tồn kho của một loại bánh hoặc mặt hàng trong kho thành phẩm tiệm bánh',
          parameters: {
            type: Type.OBJECT,
            properties: {
              ten_mon: { type: Type.STRING, description: 'Tên loại bánh hoặc sản phẩm cần tra cứu (ví dụ: bánh bắp, macaron, tiramisu...)' }
            },
            required: ['ten_mon']
          }
        },
        {
          name: 'tra_cuu_nhan_su_cham_cong',
          description: 'Tra cứu tình hình nhân sự đi làm, ca trực, chấm công hôm nay của toàn tiệm hoặc một nhân viên cụ thể',
          parameters: {
            type: Type.OBJECT,
            properties: {
              ten_nhan_vien: { type: Type.STRING, description: 'Tên nhân viên cần kiểm tra (hoặc để trống để xem danh sách nhân sự đang trong ca)' }
            }
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
        },
        {
          name: 'phan_tich_kinh_doanh_theo_ky',
          description: 'Phân tích/tổng hợp doanh thu theo kênh, chi tiêu và công nợ theo một khoảng thời gian (hôm nay, hôm qua, tuần này, tuần trước, tháng này, tháng trước, hoặc khoảng ngày tùy chọn). CHỈ dành cho Ban Giám đốc/Kế toán.',
          parameters: {
            type: Type.OBJECT,
            properties: {
              ky: { type: Type.STRING, enum: ['hom_nay', 'hom_qua', 'tuan_nay', 'tuan_truoc', 'thang_nay', 'thang_truoc', 'tuy_chon'], description: 'Kỳ phân tích' },
              tu_ngay: { type: Type.STRING, description: 'Ngày bắt đầu YYYY-MM-DD (chỉ dùng khi ky=tuy_chon)' },
              den_ngay: { type: Type.STRING, description: 'Ngày kết thúc YYYY-MM-DD (chỉ dùng khi ky=tuy_chon)' }
            },
            required: ['ky']
          }
        },
        {
          name: 'tra_cuu_cong_no',
          description: 'Tra cứu công nợ cần thu của khách hàng hoặc trường học (đơn đã hoàn thành nhưng chưa thu đủ tiền). CHỈ dành cho Ban Giám đốc/Kế toán/Thu ngân.',
          parameters: {
            type: Type.OBJECT,
            properties: {
              tu_khoa: { type: Type.STRING, description: 'Tên khách hoặc trường cần lọc (bỏ trống = xem tất cả)' }
            }
          }
        },
        {
          name: 'canh_bao_ton_kho_thap',
          description: 'Liệt kê nguyên vật liệu hoặc bánh thành phẩm sắp hết / dưới ngưỡng để nhắc nhập thêm. Dành cho Thủ kho/Ban Giám đốc.',
          parameters: {
            type: Type.OBJECT,
            properties: {
              loai: { type: Type.STRING, enum: ['nvl', 'thanh_pham'], description: 'nvl = nguyên vật liệu (kho xưởng); thanh_pham = bánh thành phẩm trong tủ' },
              nguong: { type: Type.NUMBER, description: 'Ngưỡng số lượng coi là thấp (mặc định 5)' }
            }
          }
        },
        {
          name: 'tom_tat_nhat_ky_van_hanh',
          description: 'Tóm tắt nhật ký vận hành: báo cáo ca, việc đã hoàn thành và vi phạm nội quy trong hôm nay hoặc tuần này. Dành cho Quản lý trở lên.',
          parameters: {
            type: Type.OBJECT,
            properties: {
              ky: { type: Type.STRING, enum: ['hom_nay', 'tuan_nay'], description: 'Phạm vi thời gian tóm tắt' }
            }
          }
        },
        {
          name: 'chi_duong_tinh_nang',
          description: 'Trả lời câu hỏi "làm X ở đâu / như thế nào" trong app Sumi Bakery: chỉ đúng màn hình, các bước thao tác và gửi link mở thẳng màn đó. Dùng khi người dùng hỏi cách sử dụng, tìm chức năng, không biết bấm ở đâu.',
          parameters: {
            type: Type.OBJECT,
            properties: {
              cau_hoi: { type: Type.STRING, description: 'Việc người dùng muốn làm hoặc tính năng cần tìm (VD: "sửa giá đơn", "chấm công ở đâu", "cách tạo đơn trường học")' }
            },
            required: ['cau_hoi']
          }
        },
        {
          name: 'truy_van_du_lieu',
          description: 'Truy vấn ĐỌC dữ liệu thật của tiệm để tự phân tích/suy luận trả lời câu hỏi mới khi các tool khác chưa bao. Chỉ đọc; kết quả đã tự lọc theo quyền người dùng.',
          parameters: {
            type: Type.OBJECT,
            properties: {
              bang: { type: Type.STRING, description: 'Tên bảng: orders, order_items, customers, products, tasks, finished_goods_stock, warehouse_stock, shift_logs, expense_claims, salary_advance_requests, incident_reports, profiles' },
              cot: { type: Type.STRING, description: 'Cột muốn lấy, cách nhau dấu phẩy (bỏ trống = mặc định)' },
              loc: { type: Type.STRING, description: "Lọc dạng 'cot op giatri' cách nhau ';'. op: = > < >= <= ~ (~ là chứa)" },
              sap_xep: { type: Type.STRING, description: "Sắp xếp 'cot desc' hoặc 'cot asc'" },
              gioi_han: { type: Type.NUMBER, description: 'Số dòng tối đa (mặc định 15, tối đa 25)' }
            },
            required: ['bang']
          }
        },
        {
          name: 'gui_tin_nhan_cho_nhan_vien',
          description: 'Gửi TIN NHẮN/thông tin tự do (KHÔNG phải giao việc) tới một nhân viên cụ thể. Nhân viên sẽ nghe Gen đọc to ngay trên màn hình. CHỈ Quản lý/Giám đốc/Kế toán.',
          parameters: {
            type: Type.OBJECT,
            properties: {
              ten_nhan_vien: { type: Type.STRING, description: 'Tên nhân viên nhận tin' },
              noi_dung: { type: Type.STRING, description: 'Nội dung tin nhắn cần gửi' }
            },
            required: ['ten_nhan_vien', 'noi_dung']
          }
        },
        {
          name: 'thao_tac_cong_viec',
          description: 'Làm hộ nhân viên thao tác trên CÔNG VIỆC CỦA CHÍNH HỌ: nhận việc, báo đã xong, hoặc từ chối việc. Chỉ tác động việc của người đang chat.',
          parameters: {
            type: Type.OBJECT,
            properties: {
              hanh_dong: { type: Type.STRING, enum: ['nhan_viec', 'bao_xong', 'tu_choi'], description: 'nhan_viec = nhận việc; bao_xong = báo đã xong; tu_choi = từ chối' },
              ten_viec: { type: Type.STRING, description: 'Tên/từ khóa công việc cần thao tác' },
              ly_do: { type: Type.STRING, description: 'Lý do (bắt buộc khi từ chối)' },
              ghi_chu: { type: Type.STRING, description: 'Ghi chú (khi báo xong, nếu có)' }
            },
            required: ['hanh_dong', 'ten_viec']
          }
        },
        {
          name: 'thao_tac_kho_vat_tu',
          description: 'Làm hộ nhập/xuất KHO VẬT TƯ (Xưởng 41). CHỈ Thủ kho/Ban Giám đốc.',
          parameters: {
            type: Type.OBJECT,
            properties: {
              hanh_dong: { type: Type.STRING, enum: ['nhap', 'xuat'], description: 'nhap = nhập kho; xuat = xuất kho' },
              ten_vat_tu: { type: Type.STRING, description: 'Tên hoặc mã vật tư' },
              so_luong: { type: Type.NUMBER, description: 'Số lượng nhập/xuất' },
              ghi_chu: { type: Type.STRING, description: 'Ghi chú (nếu có)' }
            },
            required: ['hanh_dong', 'ten_vat_tu', 'so_luong']
          }
        }
      ]
    }];

    // Hướng dẫn nghiệp vụ chi tiết cho Gemini
    const role = userProfile?.role || 'staff';
    const name = userProfile?.name || 'Bạn';
    // Quyền xem tài chính = FINANCE_ROLES, xét cả vai trò kiêm nhiệm (extra_roles).
    // (Đây chỉ điều chỉnh giọng/quy tắc prompt — dữ liệu thật vẫn do client gửi và
    // được RLS Postgres chốt cứng, nên không tin tuyệt đối vào role client gửi lên.)
    const FINANCE_ROLES = ['owner', 'admin', 'accountant', 'cashier'];
    const extraRoles = Array.isArray(userProfile?.extra_roles) ? userProfile.extra_roles : [];
    const isDirector = FINANCE_ROLES.includes(role) || extraRoles.some((r) => FINANCE_ROLES.includes(r));

    let dataSection = '';
    if (appSnapshot) {
      dataSection = `
DỮ LIỆU THỜI GIAN THỰC TRÊN HỆ THỐNG SUMI BAKERY HÔM NAY (${appSnapshot.ngay || 'Hôm nay'}):
${JSON.stringify(appSnapshot, null, 2)}
`;
    }

    const systemInstruction = `Bạn là "Gen" — Hệ điều hành Trợ lý Trí tuệ Nhân tạo toàn diện của tiệm bánh Sumi Bakery (sumibakery.shop).
Bạn hỗ trợ 22 nhân sự trong toàn bộ tiệm bánh thực hiện các nghiệp vụ: Nghe (giọng nói), Nhìn (hình ảnh mẫu bánh/hóa đơn), Phân tích nghiệp vụ, BÁO CÁO TOÀN DIỆN SỐ LIỆU DOANH THU/ĐƠN HÀNG/TỒN KHO/CHẤM CÔNG, và Thao tác trực tiếp vào hệ thống cơ sở dữ liệu.

NGƯỜI ĐANG NÓI CHUYỆN VỚI BẠN:
- Tên: ${name}
- Vai trò: ${role} (${isDirector ? 'BAN GIÁM ĐỐC / CHỦ TIỆM / KẾ TOÁN - Toàn quyền chỉ đạo, xem toàn bộ số liệu doanh thu, đơn hàng, công nợ, chi tiêu, duyệt chi/ứng' : 'Nhân viên tiệm bánh - Tuân thủ quy chế, thao tác trong quyền hạn'})

${dataSection}

NGUYÊN TẮC BÁO CÁO SỐ LIỆU KINH DOANH & TRUY VẤN THỜI GIAN THỰC (CỰC KỲ QUAN TRỌNG):
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

3. TRA CỨU ĐƠN HÀNG, TỒN KHO & NHÂN SỰ:
   - Khi người dùng hỏi thông tin đơn của ai hoặc kiểm tra đơn: Kích hoạt tool 'tra_cuu_don_hang'.
   - Khi người dùng hỏi số lượng bánh trong tủ / kho còn bao nhiêu: Kích hoạt tool 'tra_cuu_ton_kho' (hoặc đọc trực tiếp từ mục 'ton_kho_thanh_pham_chinh' trong dữ liệu nếu đã có sẵn).
   - Khi người dùng hỏi ai đang đi làm hôm nay, ai đã chấm công: Kích hoạt tool 'tra_cuu_nhan_su_cham_cong' (hoặc đọc trực tiếp từ mục 'nhan_su_hom_nay' trong dữ liệu thời gian thực).

4. CẬP NHẬT TRẠNG THÁI ĐƠN HÀNG TRÊN APP:
   - Khi nhân viên báo "Đã làm xong đơn X", "Bếp nhận làm đơn Y", "Đã giao xong đơn Z", "Hủy đơn W": Kích hoạt tool 'cap_nhat_trang_thai_don' với trạng thái tương ứng.

5. PHÊ DUYỆT TÀI CHÍNH (CHO GIÁM ĐỐC):
   - Khi Giám đốc (${isDirector ? 'Sếp ' + name : 'Giám đốc'}) bảo duyệt khoản chi hoặc tạm ứng của nhân viên: Kích hoạt tool 'duyet_khoan_chi_hoac_ung'.

6. PHÂN QUYỀN BẢO MẬT:
   - Chỉ Ban Giám Đốc (${isDirector ? 'Sếp ' + name : 'Giám đốc/Kế toán'}) mới được xem số tiền doanh thu, chi tiêu toàn tiệm và phê duyệt tiền bạc.
   - Nếu nhân viên thông thường hỏi doanh thu toàn tiệm, hãy lịch sự từ chối và chỉ thông báo số lượng đơn bánh cần làm.

7. TẠO ĐƠN & CHUYỂN BẾP TỰ ĐỘNG:
   - Khi người dùng cung cấp thông tin đơn (hoặc bảo "Tạo đơn trường học...", "Lên đơn bánh..."):
   - KÍCH HOẠT NGAY tool 'tao_don_hang_banh' với các thông tin đã có (Tên khách/Trường học, Loại bánh, Số lượng/Size, Giờ nhận).
   - Hệ thống có nút 1 chạm "🚀 Tạo Đơn & Chuyển Bếp Ngay" giúp gửi thẳng lệnh sản xuất vào KDS của Bếp mà người dùng không cần phải tự gõ lại từ đầu.

8. TỰ ĐỘNG CẢNH BÁO QUY CHẾ VÀ ĐỀ XUẤT:
   - Đặt bánh lấy gấp dưới 2 tiếng: Kích hoạt 'canh_bao_quy_dinh' vì quy định tiệm bánh kem tạo hình cần ít nhất 4 tiếng để nướng cốt và trang trí.
   - Giảm giá > 15%: Cảnh báo cần Giám đốc phê duyệt trước khi chốt đơn.
   - Khi nhân viên xin tạm ứng hoặc báo chi: Bóc tách đúng số tiền, lý do và tạo thẻ xác nhận 2 bước.

9. PHONG CÁCH GIAO TIẾP:
   - Ấm áp, nhã nhặn, thông minh, chuyên nghiệp. Với nhân viên phụ bếp/lao động không rành chữ, dùng câu ngắn gọn, mạch lạc, dễ nghe.

10. CÔNG CỤ PHÂN TÍCH & TRA CỨU NÂNG CAO (dùng ĐÚNG quyền hạn):
   - Hỏi doanh thu/chi tiêu/công nợ theo khoảng thời gian ("doanh thu tuần này", "chi tiêu tháng trước", "so với hôm qua"): kích hoạt 'phan_tich_kinh_doanh_theo_ky' với 'ky' phù hợp. CHỈ khi người dùng là Ban Giám đốc/Kế toán.
   - Hỏi "ai/trường nào còn nợ", "công nợ cần thu": kích hoạt 'tra_cuu_cong_no'. CHỈ Ban Giám đốc/Kế toán/Thu ngân.
   - Hỏi "nguyên liệu/bánh nào sắp hết", "cần nhập gì": kích hoạt 'canh_bao_ton_kho_thap' (loai=nvl hoặc thanh_pham). Dành cho Thủ kho/Ban Giám đốc.
   - Hỏi "tóm tắt hôm nay/tuần này", "báo cáo ca", "có vi phạm gì không": kích hoạt 'tom_tat_nhat_ky_van_hanh'. Dành cho Quản lý trở lên.

11. GIỚI HẠN QUYỀN (BẮT BUỘC TÔN TRỌNG):
   - Vai trò hiện tại: ${role}. ${isDirector ? 'Được phép xem toàn bộ số liệu tài chính.' : 'KHÔNG được xem doanh thu/giá vốn/công nợ toàn tiệm.'}
   - Nếu người dùng KHÔNG đủ quyền mà hỏi số liệu tài chính/công nợ: từ chối lịch sự, KHÔNG bịa số, chỉ hỗ trợ phần trong quyền hạn (đơn hàng, tồn kho thành phẩm, công việc). Hệ thống cũng chặn cứng ở tầng dữ liệu nên đừng cố đoán số.

12. CHỈ ĐƯỜNG TRONG APP (BÁCH KHOA TOÀN THƯ):
   - Khi người dùng hỏi "làm X ở đâu", "cách làm X", "tìm chức năng Y", "không biết bấm ở đâu": kích hoạt 'chi_duong_tinh_nang' với 'cau_hoi' là việc họ muốn làm.
   - Sau khi có kết quả: tóm tắt ngắn gọn các BƯỚC thao tác, và LUÔN nhắc có nút "Mở màn ..." bên dưới để đi thẳng tới đó.
   - Nếu tính năng ngoài quyền của họ, giải thích nhẹ nhàng rằng mục này thuộc vai trò khác, không hứa mở giúp.

13. TỰ TRUY VẤN & SUY LUẬN TRÊN DỮ LIỆU THẬT: khi câu hỏi cần dữ liệu mà các tool trên chưa bao -> 'truy_van_du_lieu' đọc bảng phù hợp (orders, order_items, customers, products, tasks, finished_goods_stock, warehouse_stock, shift_logs, expense_claims, salary_advance_requests, incident_reports, profiles) rồi TỰ PHÂN TÍCH trả lời. Kết quả đã tự lọc theo quyền người dùng (cột giá/giá vốn/lương/công nợ tự bị ẩn với tuyến dưới). Rỗng thì báo trung thực; ưu tiên tool chuyên biệt trước.
14. NHẮN TIN CHO NHÂN VIÊN: khi Sếp/Quản lý bảo "nhắn cho [tên] rằng...", "báo [tên]...", "gửi tin cho [tên]" -> 'gui_tin_nhan_cho_nhan_vien' (ten_nhan_vien + noi_dung). Nhân viên sẽ nghe Gen đọc to ngay. CHỈ Quản lý/Giám đốc/Kế toán.
15. LÀM HỘ THAO TÁC CÔNG VIỆC: khi người dùng nói "nhận việc [X]", "báo xong việc [X]", "từ chối việc [X] vì..." -> 'thao_tac_cong_viec' (hanh_dong + ten_viec [+ ly_do/ghi_chu]). Chỉ tác động việc CỦA CHÍNH họ. Nhiều việc khớp thì hỏi lại cho rõ.
16. LÀM HỘ NHẬP/XUẤT KHO VẬT TƯ: khi Thủ kho/Sếp nói "nhập [số] [vật tư]", "xuất [số] [vật tư]" -> 'thao_tac_kho_vat_tu' (hanh_dong nhap/xuat + ten_vat_tu + so_luong [+ ghi_chu]). Nhiều vật tư khớp thì hỏi lại. CHỈ Thủ kho/Ban Giám đốc.`;

    // Chuẩn bị nội dung gửi Gemini (Multimodal text + image nếu có)
    const contents = [];

    // Đưa lịch sử hội thoại gần nhất vào ngữ cảnh
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

    // Model Cascade: Chống lỗi 503 Spikes in high demand
    const candidateModels = [
      'gemini-3.6-flash',
      'gemini-3.5-flash',
      'gemini-3.5-flash-lite',
      'gemini-flash-latest'
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
            tools: tools,
            temperature: 0.2
          }
        });
        if (response) break;
      } catch (err) {
        lastError = err;
        console.warn(`[Gemini Model ${model} Warning]:`, err.message);
      }
    }

    if (!response) {
      throw lastError || new Error('Không thể kết nối tới mô hình AI Gemini');
    }

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
