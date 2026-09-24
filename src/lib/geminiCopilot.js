import { supabase } from './supabaseClient';
import { playConfirmSound } from './sound';
import {
  fetchRevenueByChannel, fetchDoanhThuDuTinh, fetchExpenseAndAdvanceLedgerToday,
  fetchCongNoCanThu, fetchTodayShiftReports, fetchCompletedTasksReport, fetchTodayViolationsReport
} from './bossOverviewV3';
import { countNewOrders, countKitchenActiveOrders, fetchSchoolRevenue, fetchWarehouseStock } from './queries';
import { localDateStr, mondayOf, weekDates, startOfMonth, endOfMonth } from './date';
import { FINANCE_ROLES, INVENTORY_VIEW_ROLES, MANAGER_ROLES, hasAnyRole, canViewFinancials } from './roles';
import { findAppGuide } from './genAppGuide';
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
  // Quyền xem tài chính = FINANCE_ROLES, xét cả vai trò kiêm nhiệm (extra_roles).
  const isDirector = canViewFinancials(userProfile);
  const today = localDateStr();
  const snapshot = {
    ngay: today,
    vai_tro_nguoi_dung: role,
    ten_nguoi_dung: userProfile?.name || 'Nhân sự'
  };

  try {
    // 1. Tình hình đơn hàng hôm nay
    const [newCount, kitchenCount, todayOrdersRes, todayShiftLogsRes, stockRes] = await Promise.all([
      countNewOrders().catch(() => ({ count: 0 })),
      countKitchenActiveOrders().catch(() => ({ count: 0 })),
      supabase
        .from('orders')
        .select('id, order_code, status, status_v2, order_type, created_at')
        .gte('created_at', `${today}T00:00:00`)
        .catch(() => ({ data: [] })),
      supabase
        .from('shift_logs')
        .select('staff_id, staff_name, type, checkin_time, shift_label')
        .eq('work_date', today)
        .order('created_at', { ascending: true })
        .catch(() => ({ data: [] })),
      supabase
        .from('finished_goods_stock')
        .select('id, size, qty, branch, store_location, products(name)')
        .gt('qty', 0)
        .limit(15)
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

    // 2. Tình hình nhân sự & chấm công hôm nay
    const shiftLogs = todayShiftLogsRes?.data || [];
    const workingStaffMap = {};
    for (const log of shiftLogs) {
      if (log.type === 'checkin') {
        workingStaffMap[log.staff_id] = { name: log.staff_name, in: true, time: log.checkin_time, shift: log.shift_label };
      } else if (log.type === 'checkout') {
        if (workingStaffMap[log.staff_id]) workingStaffMap[log.staff_id].in = false;
      }
    }
    const currentlyWorking = Object.values(workingStaffMap).filter(s => s.in).map(s => s.name);
    snapshot.nhan_su_hom_nay = {
      so_nhan_su_dang_trong_ca: currentlyWorking.length,
      danh_sach_dang_lam: currentlyWorking,
      tong_so_luot_cham_cong: shiftLogs.length
    };

    // 3. Tồn kho thành phẩm có sẵn trong tủ
    const stockItems = stockRes?.data || [];
    if (stockItems.length > 0) {
      snapshot.ton_kho_thanh_pham_chinh = stockItems.map(s => ({
        ten_banh: s.products?.name || 'Bánh',
        size: s.size || 'Tiêu chuẩn',
        so_luong: Number(s.qty) || 0,
        chi_nhanh: s.branch || s.store_location || 'Kho tiệm'
      }));
    }

    // 4. Nếu là Ban Giám Đốc hoặc Kế toán -> Lấy toàn bộ số liệu Tài chính & Doanh thu & Yêu cầu chờ duyệt
    if (isDirector) {
      const [revenueRes, duTinhRes, expenseRes, pendingClaimsRes, pendingAdvancesRes] = await Promise.all([
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
        }),
        supabase
          .from('expense_claims')
          .select('id, claimant_name, amount, description')
          .eq('status', 'pending_director')
          .catch(() => ({ data: [] })),
        supabase
          .from('salary_advance_requests')
          .select('id, employee_name, amount, reason')
          .eq('status', 'pending_director')
          .catch(() => ({ data: [] }))
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

      const pendingClaims = pendingClaimsRes?.data || [];
      const pendingAdvances = pendingAdvancesRes?.data || [];
      if (pendingClaims.length > 0 || pendingAdvances.length > 0) {
        snapshot.yeu_cau_cho_giam_doc_duyet = {
          khoan_chi_cho_duyet: pendingClaims.map(c => ({
            id: c.id,
            nguoi_bao: c.claimant_name,
            so_tien: Number(c.amount) || 0,
            noi_dung: c.description
          })),
          tam_ung_cho_duyet: pendingAdvances.map(a => ({
            id: a.id,
            nguoi_xin: a.employee_name,
            so_tien: Number(a.amount) || 0,
            ly_do: a.reason
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
    const payload = { message, imageBase64, userProfile, history, appSnapshot: liveSnapshot };

    // 1. ƯU TIÊN: Edge Function 'ai-copilot' trên Supabase của tiệm — "bộ não" AI
    //    mới, dùng secret khóa trên Supabase (không phụ thuộc Vercel, không khóa
    //    hardcode). Nếu chưa deploy / lỗi -> TỰ QUAY VỀ /api/ai-copilot cũ để Gen
    //    không gián đoạn (zero downtime trong lúc chuyển đổi).
    try {
      const { data, error } = await supabase.functions.invoke('ai-copilot', { body: payload });
      if (!error && data && !data.error) return data;
      console.warn('[askGenCopilot] ai-copilot (Supabase) chưa dùng được, thử /api:', error?.message || data?.error || 'unknown');
    } catch (invErr) {
      console.warn('[askGenCopilot] Không gọi được ai-copilot (Supabase), thử /api:', invErr?.message || invErr);
    }

    // 2. FALLBACK: endpoint Serverless /api/ai-copilot (Vercel) — đường cũ.
    const res = await fetch('/api/ai-copilot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (res.ok) {
      return await res.json();
    }

    // 3. FALLBACK DEV: chạy dev Vite thuần (không có serverless) -> gọi thẳng Gemini
    //    bằng VITE_GEMINI_API_KEY trong .env.local.
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
  const isDirector = canViewFinancials(userProfile);

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
            dia_chi: { type: Type.STRING, description: 'Địa chỉ giao bánh nếu ship' },
            hinh_thuc_nhan: { type: Type.STRING, enum: ['lay_tai_tiem', 'giao_hang'], description: 'Tự lấy hay giao hàng' },
            thoi_gian_nhan: { type: Type.STRING, description: 'Ngày và giờ nhận bánh' },
            loai_banh: { type: Type.STRING, description: 'Tên loại bánh (Bánh kem bắp, Tiramisu...)' },
            size_banh: { type: Type.STRING, description: 'Kích thước bánh (16cm, 20cm, 25cm...)' },
            chu_viet_len_banh: { type: Type.STRING, description: 'Chữ viết lên mặt bánh' },
            nen_tuoi: { type: Type.STRING, description: 'Số tuổi cắm nến' },
            ghi_chu_tho_banh: { type: Type.STRING, description: 'Yêu cầu thợ làm bánh' },
            tam_tinh_gia: { type: Type.NUMBER, description: 'Giá ước tính nếu có' }
          },
          required: ['ten_khach', 'loai_banh']
        }
      },
      {
        name: 'tra_cuu_don_hang',
        description: 'Tra cứu thông tin chi tiết một hoặc nhiều đơn hàng theo tên khách, số điện thoại hoặc mã đơn (#SUMI-...)',
        parameters: {
          type: Type.OBJECT,
          properties: {
            tu_khoa: { type: Type.STRING, description: 'Tên khách, số điện thoại hoặc mã đơn hàng cần tìm' }
          },
          required: ['tu_khoa']
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
            ten_mon: { type: Type.STRING, description: 'Tên loại bánh hoặc sản phẩm cần tra cứu' }
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
            ten_nhan_vien: { type: Type.STRING, description: 'Tên nhân viên cần kiểm tra' }
          }
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
   - Nếu tính năng ngoài quyền của họ, giải thích nhẹ nhàng rằng mục này thuộc vai trò khác, không hứa mở giúp.`;

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
  let createdTaskId = null;
  if (assigneeId) {
    const { data: rpcRes, error: rpcErr } = await supabase.rpc('create_general_task', {
      p_category: 'assigned',
      p_title: noiDungViec || 'Công việc từ Sếp',
      p_description: `Giao bởi Sếp qua Trợ lý Gen. Hạn chót: ${hanChot || 'Trong ngày'}${yeuCauAnh ? ' (Có chụp ảnh)' : ''}`,
      p_order_code: null,
      p_assignee_id: assigneeId,
      p_deadline: null,
      p_reminder_at: null
    });
    if (!rpcErr) {
      success = true;
      createdTaskId = rpcRes;
    }
  }

  if (!success) {
    const { data: insData, error: insErr } = await supabase.from('tasks').insert({
      title: noiDungViec || 'Công việc từ Sếp',
      description: `Giao cho: ${targetStaffName}. Hạn chót: ${hanChot || 'Trong ngày'}`,
      category: 'assigned',
      status: 'pending',
      assignee_id: assigneeId || null,
      created_at: new Date().toISOString()
    }).select('id').single();
    if (!insErr && insData?.id) {
      createdTaskId = insData.id;
    } else if (insErr) {
      console.warn('Fallback insert tasks error:', insErr);
    }
  }

  playConfirmSound();
  return {
    success: true,
    taskId: createdTaskId,
    staffName: targetStaffName,
    title: noiDungViec,
    deadline: hanChot,
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

/**
 * Tra cứu thông tin đơn hàng theo tên khách, số điện thoại hoặc mã đơn
 */
export async function executeSearchOrder({ query }) {
  const rawQ = (query || '').trim();
  const cleanQ = rawQ.replace(/^#/, '');

  try {
    let q = supabase
      .from('orders')
      .select(`
        id, order_code, status, status_v2, order_type, address, note,
        required_at, created_at, customer_id, total,
        customers(name, phone),
        order_items(name_snapshot, quantity, unit, specification)
      `)
      .order('created_at', { ascending: false })
      .limit(8);

    const lower = cleanQ.toLowerCase();
    if (lower === 'hôm nay' || lower === 'hom nay' || lower === 'today') {
      const today = new Date().toISOString().slice(0, 10);
      q = q.gte('created_at', `${today}T00:00:00`);
    } else if (cleanQ) {
      // Tên/SĐT khách nằm ở bảng customers (không phải cột trên orders) — tìm theo
      // mã đơn ở đây; nếu không ra thì nhánh fallback bên dưới tra qua customers.
      q = q.or(`order_code.ilike.%${cleanQ}%`);
    }

    const { data: orders, error } = await q;
    if (error) throw error;
    let results = orders || [];

    if (results.length === 0 && cleanQ) {
      // Thử tìm qua bảng customers
      const { data: custs } = await supabase
        .from('customers')
        .select('id')
        .or(`name.ilike.%${cleanQ}%,phone.ilike.%${cleanQ}%`)
        .limit(8);

      if (custs && custs.length > 0) {
        const cIds = custs.map(c => c.id);
        const { data: ordsByCust } = await supabase
          .from('orders')
          .select(`
            id, order_code, status, status_v2, order_type, address, note,
            required_at, created_at, customer_id, total,
            customers(name, phone),
            order_items(name_snapshot, quantity, unit, specification)
          `)
          .in('customer_id', cIds)
          .order('created_at', { ascending: false })
          .limit(8);
        results = ordsByCust || [];
      }
    }

    return {
      success: true,
      orders: results
    };
  } catch (err) {
    console.error('[executeSearchOrder] Lỗi:', err);
    return { success: false, error: err.message, orders: [] };
  }
}

/**
 * Tra cứu danh sách công việc/nhiệm vụ theo nhân viên, nội dung hoặc trạng thái
 */
export async function executeSearchTasks({ tu_khoa, ten_nhan_vien, trang_thai }) {
  try {
    let q = supabase
      .from('tasks')
      .select(`
        id, title, description, category, status, deadline, reminder_at,
        created_at, accepted_at, completed_at, assignee_id,
        assignee:profiles!tasks_assignee_id_fkey(full_name, station)
      `)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(10);

    if (tu_khoa && tu_khoa.trim()) {
      q = q.ilike('title', `%${tu_khoa.trim()}%`);
    }

    if (trang_thai) {
      if (trang_thai === 'chua_xong' || trang_thai === 'pending') {
        q = q.in('status', ['pending', 'open', 'assigned', 'accepted']);
      } else if (trang_thai === 'da_xong' || trang_thai === 'completed') {
        q = q.eq('status', 'completed');
      }
    }

    const { data: tasks, error } = await q;
    if (error) throw error;

    let filtered = tasks || [];
    if (ten_nhan_vien && ten_nhan_vien.trim()) {
      const sKey = ten_nhan_vien.toLowerCase().trim();
      filtered = filtered.filter(t => {
        const aName = t.assignee?.full_name?.toLowerCase() || '';
        const desc = t.description?.toLowerCase() || '';
        return aName.includes(sKey) || desc.includes(sKey);
      });
    }

    return {
      success: true,
      tasks: filtered
    };
  } catch (err) {
    console.error('[executeSearchTasks] Lỗi:', err);
    return { success: false, error: err.message, tasks: [] };
  }
}

/**
 * Cập nhật trạng thái đơn hàng (bếp làm, xong chờ giao, đang giao, hoàn thành, hủy)
 */
export async function executeOrderStatusUpdate({ orderCodeOrId, newStatus, reason, userProfile }) {
  if (!orderCodeOrId) throw new Error('Thiếu mã đơn hàng hoặc tên khách');
  const cleanQ = orderCodeOrId.trim().replace(/^#/, '');

  // 1. Tìm đơn hàng tương ứng
  const { data: orders, error: findErr } = await supabase
    .from('orders')
    .select('id, order_code, status, status_v2, customer_id, customers(name)')
    .or(`order_code.ilike.%${cleanQ}%`)
    .order('created_at', { ascending: false })
    .limit(1);

  if (findErr || !orders || orders.length === 0) {
    throw new Error(`Không tìm thấy đơn hàng nào khớp với "${orderCodeOrId}"`);
  }

  const order = orders[0];
  const now = new Date().toISOString();
  let fieldsToUpdate = {};
  let statusTextVN = '';

  switch (newStatus) {
    case 'bep_nhan_lam':
    case 'dang_lam':
    case 'in_production':
      fieldsToUpdate = {
        status: 'dang_lam',
        status_v2: 'in_production',
        production_started_at: now
      };
      statusTextVN = 'Bếp đang làm bánh';
      break;

    case 'lam_xong_cho_giao':
    case 'cho_giao':
    case 'ready_for_fulfillment':
      fieldsToUpdate = {
        status: 'cho_giao',
        status_v2: 'ready_for_fulfillment',
        production_completed_at: now
      };
      statusTextVN = 'Làm xong, chờ giao';
      break;

    case 'dang_giao':
    case 'in_delivery':
      fieldsToUpdate = {
        status: 'dang_giao',
        status_v2: 'in_delivery',
        delivery_started_at: now
      };
      statusTextVN = 'Đang trên đường giao hàng';
      break;

    case 'hoan_thanh':
    case 'completed':
      fieldsToUpdate = {
        status: 'hoan_thanh',
        status_v2: 'completed',
        completed_at: now,
        delivery_completed_at: now
      };
      statusTextVN = 'Hoàn thành đơn hàng';
      break;

    case 'huy_don':
    case 'huy':
    case 'cancelled':
      fieldsToUpdate = {
        status: 'huy',
        status_v2: 'cancelled',
        cancel_reason: reason || 'Hủy qua Trợ lý Gen',
        cancel_staff_name: userProfile?.name || 'Gen Copilot'
      };
      statusTextVN = 'Đã hủy đơn hàng';
      break;

    default:
      fieldsToUpdate = { status: newStatus };
      statusTextVN = newStatus;
  }

  const { error: updErr } = await supabase
    .from('orders')
    .update(fieldsToUpdate)
    .eq('id', order.id);

  if (updErr) throw updErr;

  // Đồng bộ thời gian thực tới tất cả màn hình (KDS Bếp, Shipper, Thu ngân)
  try {
    await broadcastEvent(BroadcastEvents.ORDER_STATUS_CHANGED, {
      orderId: order.id,
      orderCode: order.order_code,
      status: fieldsToUpdate.status,
      status_v2: fieldsToUpdate.status_v2,
      updatedAt: now
    });
    notifyOtherTabs(BroadcastEvents.ORDER_STATUS_CHANGED, {
      orderId: order.id,
      status: fieldsToUpdate.status
    });
  } catch (e) {
    console.warn('[executeOrderStatusUpdate] Broadcast warning:', e);
  }

  playConfirmSound();
  const custName = order.customers?.name || 'Khách';
  return {
    success: true,
    orderCode: order.order_code,
    customerName: custName,
    newStatus: statusTextVN,
    message: `Đã cập nhật đơn #${order.order_code} (${custName}) sang trạng thái: "${statusTextVN}"!`
  };
}

/**
 * Tra cứu số lượng tồn kho thành phẩm trong tủ/kho tiệm bánh
 */
export async function executeCheckInventory({ keyword }) {
  try {
    const { data: stockList, error } = await supabase
      .from('finished_goods_stock')
      .select(`
        id, product_id, size, qty, branch, store_location, expiry_date,
        products(id, name, category, unit, price)
      `)
      .gt('qty', 0)
      .order('qty', { ascending: false });

    if (error) throw error;
    let filtered = stockList || [];

    if (keyword) {
      const kw = keyword.toLowerCase().trim();
      filtered = filtered.filter(item => {
        const pName = (item.products?.name || '').toLowerCase();
        const pCat = (item.products?.category || '').toLowerCase();
        const size = (item.size || '').toLowerCase();
        return pName.includes(kw) || pCat.includes(kw) || size.includes(kw);
      });
    }

    return {
      success: true,
      items: filtered.slice(0, 15).map(item => ({
        name: item.products?.name || 'Sản phẩm',
        size: item.size || 'Chuẩn',
        qty: Number(item.qty) || 0,
        branch: item.branch || item.store_location || 'Kho tiệm',
        expiry: item.expiry_date || null
      }))
    };
  } catch (err) {
    console.error('[executeCheckInventory] Error:', err);
    return { success: false, error: err.message, items: [] };
  }
}

/**
 * Tra cứu tình hình nhân sự đi làm & chấm công hôm nay
 */
export async function executeGetStaffAttendance({ keyword }) {
  const today = localDateStr();
  try {
    const [logsRes, profilesRes] = await Promise.all([
      supabase
        .from('shift_logs')
        .select('staff_id, staff_name, type, checkin_time, shift_label, late_minutes')
        .eq('work_date', today)
        .order('created_at', { ascending: true }),
      supabase
        .from('profiles')
        .select('id, full_name, station, role')
        .eq('approved', true)
        .neq('active', false)
    ]);

    const logs = logsRes.data || [];
    const profiles = profilesRes.data || [];

    const staffMap = {};
    for (const p of profiles) {
      staffMap[p.id] = {
        id: p.id,
        name: p.full_name,
        station: p.station,
        role: p.role,
        hasCheckedIn: false,
        isCurrentlyWorking: false,
        checkinTime: null,
        shiftLabel: null
      };
    }

    for (const l of logs) {
      if (!staffMap[l.staff_id]) {
        staffMap[l.staff_id] = {
          id: l.staff_id,
          name: l.staff_name,
          station: null,
          role: 'staff',
          hasCheckedIn: false,
          isCurrentlyWorking: false,
          checkinTime: null,
          shiftLabel: null
        };
      }
      if (l.type === 'checkin') {
        staffMap[l.staff_id].hasCheckedIn = true;
        staffMap[l.staff_id].isCurrentlyWorking = true;
        staffMap[l.staff_id].checkinTime = l.checkin_time;
        staffMap[l.staff_id].shiftLabel = l.shift_label;
      } else if (l.type === 'checkout') {
        staffMap[l.staff_id].isCurrentlyWorking = false;
      }
    }

    let list = Object.values(staffMap);
    if (keyword) {
      const kw = keyword.toLowerCase().trim();
      list = list.filter(s => s.name.toLowerCase().includes(kw) || (s.station && s.station.toLowerCase().includes(kw)));
    }

    const workingNow = list.filter(s => s.isCurrentlyWorking);
    return {
      success: true,
      totalWorking: workingNow.length,
      workingList: workingNow,
      allStaffToday: list.filter(s => s.hasCheckedIn)
    };
  } catch (err) {
    console.error('[executeGetStaffAttendance] Error:', err);
    return { success: false, error: err.message, workingList: [], allStaffToday: [] };
  }
}

/**
 * Phê duyệt hoặc từ chối khoản chi / tạm ứng lương (Dành cho Giám đốc)
 */
export async function executeReviewClaimOrAdvance({ type, id, approve, note }) {
  if (!id) throw new Error('Thiếu ID yêu cầu cần phê duyệt');

  if (type === 'chi_tieu' || type === 'expense') {
    const { error } = await supabase.rpc('review_expense_claim', {
      p_id: id,
      p_approve: Boolean(approve),
      p_note: note ? String(note).trim() : null
    });
    if (error) throw error;
  } else {
    // Tạm ứng lương
    const { error } = await supabase.rpc('review_salary_advance', {
      p_id: id,
      p_approve: Boolean(approve),
      p_note: note ? String(note).trim() : null
    });
    if (error) throw error;
  }

  playConfirmSound();
  const actName = approve ? 'Đã phê duyệt' : 'Đã từ chối';
  const targetLabel = (type === 'chi_tieu' || type === 'expense') ? 'khoản chi tiêu' : 'phiếu tạm ứng lương';
  return {
    success: true,
    message: `${actName} ${targetLabel} thành công!`
  };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * DEEP-LINK: đổi mã đơn (SUMI-...) sang UUID `id` mà OrderV2DetailModal cần để
 * mở ĐÚNG chi tiết đơn. Nếu đã là UUID thì trả nguyên; nếu là mã đơn thì tra
 * bảng orders lấy id; không tìm thấy thì trả lại giá trị gốc (không làm gãy luồng).
 */
export async function resolveOrderId(codeOrId) {
  const val = String(codeOrId || '').trim().replace(/^#/, '');
  if (!val) return null;
  if (UUID_RE.test(val)) return val;
  try {
    const { data, error } = await supabase
      .from('orders')
      .select('id')
      .ilike('order_code', val)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return data?.id || val;
  } catch (err) {
    console.warn('[resolveOrderId] Không resolve được, dùng giá trị gốc:', err);
    return val;
  }
}

// Tính khoảng {from, to} (YYYY-MM-DD) + nhãn cho một "kỳ" phân tích.
function rangeForKy(ky, tuNgay, denNgay) {
  const now = new Date();
  if (ky === 'tuy_chon' && tuNgay && denNgay) {
    return { from: tuNgay, to: denNgay, label: `${tuNgay} → ${denNgay}` };
  }
  if (ky === 'hom_nay') {
    const s = localDateStr(now);
    return { from: s, to: s, label: 'Hôm nay' };
  }
  if (ky === 'hom_qua') {
    const y = new Date(now); y.setDate(y.getDate() - 1);
    const s = localDateStr(y);
    return { from: s, to: s, label: 'Hôm qua' };
  }
  if (ky === 'tuan_nay') {
    const days = weekDates(mondayOf(now));
    return { from: localDateStr(days[0]), to: localDateStr(days[6]), label: 'Tuần này' };
  }
  if (ky === 'tuan_truoc') {
    const lastWeek = new Date(now); lastWeek.setDate(lastWeek.getDate() - 7);
    const days = weekDates(mondayOf(lastWeek));
    return { from: localDateStr(days[0]), to: localDateStr(days[6]), label: 'Tuần trước' };
  }
  if (ky === 'thang_truoc') {
    const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return { from: localDateStr(startOfMonth(prev)), to: localDateStr(endOfMonth(prev)), label: `Tháng ${prev.getMonth() + 1}/${prev.getFullYear()}` };
  }
  // Mặc định thang_nay
  return { from: localDateStr(startOfMonth(now)), to: localDateStr(endOfMonth(now)), label: `Tháng ${now.getMonth() + 1}/${now.getFullYear()}` };
}

/**
 * TOOL MỚI: Phân tích kinh doanh theo kỳ (doanh thu theo kênh + chi tiêu + công nợ).
 * Gate FINANCE_ROLES (xét cả extra_roles). Dữ liệu chốt cứng thêm bởi RLS phía DB.
 */
export async function executeBusinessAnalysis({ ky, tu_ngay, den_ngay, userProfile }) {
  if (!canViewFinancials(userProfile)) {
    return { success: false, denied: true, message: 'Xin lỗi, số liệu doanh thu/chi tiêu chỉ dành cho Ban Giám đốc và Kế toán.' };
  }
  const { from, to, label } = rangeForKy(ky, tu_ngay, den_ngay);
  const fromIso = `${from}T00:00:00+07:00`;
  const toIso = `${to}T23:59:59.999+07:00`;

  const [revenueRes, expenseRes, schoolRes] = await Promise.all([
    fetchRevenueByChannel({ from: fromIso, to: toIso }).catch((e) => { console.warn('[BusinessAnalysis] revenue:', e); return null; }),
    fetchExpenseAndAdvanceLedgerToday({ from: fromIso, to: toIso }).catch((e) => { console.warn('[BusinessAnalysis] expense:', e); return []; }),
    fetchSchoolRevenue({ from, to }).catch((e) => { console.warn('[BusinessAnalysis] school:', e); return []; }),
  ]);

  const expenseRows = Array.isArray(expenseRes) ? expenseRes : (expenseRes?.rows || []);
  const tongChi = expenseRows.reduce((s, r) => s + (Number(r.amount ?? r.so_tien) || 0), 0);
  const schoolRows = Array.isArray(schoolRes) ? schoolRes : [];
  const tongTruong = schoolRows.reduce((s, r) => s + (Number(r.total) || 0), 0);

  return {
    success: true,
    ky: label,
    doanh_thu_thuan: revenueRes?.total || 0,
    kenh: (revenueRes?.channels || []).map((c) => ({
      kenh: c.title || c.name || c.key, so_tien: Number(c.amount) || 0, so_don: c.count || 0,
    })),
    tong_chi: tongChi,
    so_khoan_chi: expenseRows.length,
    doanh_thu_truong_hoc: tongTruong,
    so_don_truong: schoolRows.length,
  };
}

/**
 * TOOL MỚI: Tra cứu công nợ cần thu (đơn hoàn thành chưa thu đủ). Gate FINANCE_ROLES.
 */
export async function executeDebtLookup({ tu_khoa, userProfile }) {
  if (!canViewFinancials(userProfile)) {
    return { success: false, denied: true, message: 'Xin lỗi, thông tin công nợ chỉ dành cho Ban Giám đốc, Kế toán và Thu ngân.' };
  }
  try {
    let rows = await fetchCongNoCanThu();
    if (tu_khoa && tu_khoa.trim()) {
      const kw = tu_khoa.toLowerCase().trim();
      rows = (rows || []).filter((r) =>
        (r.customerName || '').toLowerCase().includes(kw) ||
        (r.orderCode || '').toLowerCase().includes(kw)
      );
    }
    const items = (rows || []).slice(0, 20).map((r) => ({
      ma_don: r.orderCode, khach: r.customerName, con_lai: r.conLai, tong: r.total, da_coc: r.deposit,
    }));
    const tongConLai = (rows || []).reduce((s, r) => s + (Number(r.conLai) || 0), 0);
    return { success: true, tong_con_lai: tongConLai, so_don: (rows || []).length, items };
  } catch (err) {
    console.error('[executeDebtLookup] Lỗi:', err);
    return { success: false, error: err.message, items: [] };
  }
}

/**
 * TOOL MỚI: Cảnh báo tồn kho thấp (NVL kho xưởng hoặc thành phẩm trong tủ). Gate INVENTORY_VIEW_ROLES.
 */
export async function executeLowStockAlert({ loai, nguong, userProfile }) {
  if (!hasAnyRole(userProfile, INVENTORY_VIEW_ROLES)) {
    return { success: false, denied: true, message: 'Xin lỗi, thông tin tồn kho chỉ dành cho Thủ kho và Ban Giám đốc.' };
  }
  const threshold = Number.isFinite(Number(nguong)) && Number(nguong) > 0 ? Number(nguong) : 5;
  try {
    if (loai === 'thanh_pham') {
      const { data, error } = await supabase
        .from('finished_goods_stock')
        .select('id, size, qty, branch, store_location, products(name)')
        .lte('qty', threshold)
        .order('qty', { ascending: true });
      if (error) throw error;
      const items = (data || []).slice(0, 20).map((s) => ({
        ten: s.products?.name || 'Bánh', size: s.size || 'Chuẩn', so_luong: Number(s.qty) || 0,
        don_vi: 'cái', chi_nhanh: s.branch || s.store_location || 'Kho tiệm',
      }));
      return { success: true, loai: 'thanh_pham', nguong: threshold, items };
    }
    // Mặc định: nguyên vật liệu kho xưởng
    const stock = await fetchWarehouseStock();
    const items = (stock || [])
      .filter((s) => (Number(s.qty) || 0) <= threshold)
      .slice(0, 20)
      .map((s) => ({
        ten: s.name || 'Vật tư', so_luong: Number(s.qty) || 0, don_vi: s.unit || '', chi_nhanh: s.branch || 'Kho',
      }));
    return { success: true, loai: 'nvl', nguong: threshold, items };
  } catch (err) {
    console.error('[executeLowStockAlert] Lỗi:', err);
    return { success: false, error: err.message, items: [] };
  }
}

/**
 * TOOL MỚI: Tóm tắt nhật ký vận hành (báo cáo ca + việc hoàn thành + vi phạm). Gate MANAGER_ROLES.
 */
export async function executeOpsSummary({ ky, userProfile }) {
  if (!hasAnyRole(userProfile, MANAGER_ROLES)) {
    return { success: false, denied: true, message: 'Xin lỗi, báo cáo vận hành tổng hợp chỉ dành cho Quản lý trở lên.' };
  }
  const now = new Date();
  let from, to, label;
  if (ky === 'tuan_nay') {
    const days = weekDates(mondayOf(now));
    from = localDateStr(days[0]); to = localDateStr(days[6]); label = 'Tuần này';
  } else {
    from = to = localDateStr(now); label = 'Hôm nay';
  }
  const [shiftRes, taskRes, violRes] = await Promise.all([
    fetchTodayShiftReports({ from, to }).catch((e) => { console.warn('[OpsSummary] shift:', e); return []; }),
    fetchCompletedTasksReport({ from: `${from}T00:00:00+07:00`, to: `${to}T23:59:59.999+07:00` }).catch((e) => { console.warn('[OpsSummary] tasks:', e); return []; }),
    fetchTodayViolationsReport({ from, to }).catch((e) => { console.warn('[OpsSummary] violations:', e); return []; }),
  ]);
  const violList = (violRes || []).slice(0, 8).map((v) => ({
    nhan_su: v.staff_name, noi_dung: v.title, phat: Number(v.penalty_amount) || 0,
  }));
  const taskList = (taskRes || []).slice(0, 8).map((t) => ({
    viec: t.title, nguoi_lam: t.assignee?.full_name || '—',
  }));
  return {
    success: true,
    ky: label,
    so_bao_cao_ca: (shiftRes || []).length,
    so_viec_hoan_thanh: (taskRes || []).length,
    so_vi_pham: (violRes || []).length,
    vi_pham: violList,
    viec_tieu_bieu: taskList,
  };
}

/**
 * TOOL MỚI (Bách khoa toàn thư): tra cứu "làm X ở đâu / thế nào" trong app.
 * Trả về các màn hình khớp + bước thao tác + key tab để Gen gửi link điều hướng.
 */
export async function executeAppGuide({ cau_hoi, userProfile }) {
  const matches = findAppGuide(cau_hoi, userProfile, 3);
  return { success: true, matches };
}



