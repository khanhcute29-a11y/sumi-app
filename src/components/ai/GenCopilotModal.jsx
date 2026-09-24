import React, { useState, useRef, useEffect } from 'react';
import { 
  X, Mic, MicOff, Send, Image as ImageIcon, Volume2, 
  VolumeX, AlertTriangle, CheckCircle2, Bot, Sparkles, 
  CornerDownLeft, FileText, DollarSign, Cake, ArrowRight,
  ClipboardList, ReceiptText, RotateCcw, Truck, Check, XCircle, Search, Users, Boxes, Eye
} from 'lucide-react';
import {
  askGenCopilot, speakVietnamese, stopSpeaking,
  executeSalaryAdvance, executeExpenseClaim, executeAssignTask,
  executeCreateOrderDirectly, executeSearchOrder, executeSearchTasks, executeOrderStatusUpdate,
  executeCheckInventory, executeGetStaffAttendance, executeReviewClaimOrAdvance,
  executeBusinessAnalysis, executeDebtLookup, executeLowStockAlert, executeOpsSummary,
  executeAppGuide, resolveOrderId
} from '../../lib/geminiCopilot';
import { executeDataQuery } from '../../lib/genDataQuery';
import { playConfirmSound } from '../../lib/sound';

function getStatusMeta(st) {
  const map = {
    'awaiting_assignment': { label: 'Chờ nhận làm', color: '#6b7280', bg: '#f3f4f6' },
    'awaiting_acceptance': { label: 'Chờ nhận làm', color: '#6b7280', bg: '#f3f4f6' },
    'in_production': { label: 'Bếp đang làm bánh', color: '#ea580c', bg: '#ffedd5' },
    'ready_for_fulfillment': { label: 'Làm xong, chờ giao', color: '#0284c7', bg: '#e0f2fe' },
    'in_delivery': { label: 'Đang trên đường giao', color: '#7c3aed', bg: '#ede9fe' },
    'completed': { label: 'Hoàn thành', color: '#16a34a', bg: '#dcfce7' },
    'cancelled': { label: 'Đã hủy', color: '#dc2626', bg: '#fee2e2' },
    'bep_nhan_lam': { label: 'Bếp nhận làm', color: '#ea580c', bg: '#ffedd5' },
    'lam_xong_cho_giao': { label: 'Làm xong, chờ giao', color: '#0284c7', bg: '#e0f2fe' },
    'dang_giao': { label: 'Đang giao hàng', color: '#7c3aed', bg: '#ede9fe' },
    'hoan_thanh': { label: 'Hoàn thành', color: '#16a34a', bg: '#dcfce7' },
    'huy_don': { label: 'Hủy đơn', color: '#dc2626', bg: '#fee2e2' },
    'moi': { label: 'Đơn mới', color: '#d97706', bg: '#fef3c7' },
    'dang_lam': { label: 'Bếp đang làm', color: '#ea580c', bg: '#ffedd5' },
    'cho_giao': { label: 'Chờ giao hàng', color: '#0284c7', bg: '#e0f2fe' },
    'huy': { label: 'Đã hủy', color: '#dc2626', bg: '#fee2e2' }
  };
  return map[st] || { label: st || 'Mới', color: '#4b5563', bg: '#f3f4f6' };
}

function getStatusLabelVN(st) {
  return getStatusMeta(st).label;
}

export function GenCopilotModal({ isOpen, onClose, userProfile, onOpenOrderForm, onViewOrder, onViewTask }) {
  if (!isOpen) return null;

  const storageKey = `sumi_gen_chat_${userProfile?.id || 'default'}`;

  const [input, setInput] = useState('');
  const [messages, setMessages] = useState(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch (e) {
      console.warn('Lỗi đọc lịch sử chat:', e);
    }
    return [
      {
        id: 1,
        sender: 'gen',
        text: `Chào ${userProfile?.name || 'bạn'}! Em là Gen — Trợ lý AI tiệm bánh Sumi Bakery. Anh/chị có thể nói, dán tin nhắn Zalo hoặc gửi ảnh mẫu bánh để em xử lý nhé!`,
        action: null
      }
    ];
  });
  const [isListening, setIsListening] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedImage, setSelectedImage] = useState(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [pendingAction, setPendingAction] = useState(null); // Hành động chờ xác nhận 2 bước

  // Tự động lưu lịch sử chat vào localStorage mỗi khi có tin nhắn mới
  useEffect(() => {
    try {
      if (messages && messages.length > 0) {
        localStorage.setItem(storageKey, JSON.stringify(messages.slice(-50)));
      }
    } catch (e) {
      console.warn('Lỗi lưu lịch sử chat:', e);
    }
  }, [messages, storageKey]);

  const handleOpenOrder = async (orderIdOrCode) => {
    if (!orderIdOrCode) return;
    // Deep-link: OrderV2DetailModal cần UUID `id` — nếu nhận mã đơn (SUMI-...) thì
    // đổi sang id trước khi mở, để bấm vào là ra ĐÚNG chi tiết đơn (không rơi về
    // màn tổng khi đơn không nằm trong bộ lọc hiện tại).
    let target = orderIdOrCode;
    try {
      target = (await resolveOrderId(orderIdOrCode)) || orderIdOrCode;
    } catch (_) {}
    if (onViewOrder) {
      onViewOrder(target);
    } else {
      window.dispatchEvent(new CustomEvent('sumi-navigate', { detail: { tab: 'orders', entityId: target } }));
      onClose();
    }
  };

  const handleOpenTask = (taskId) => {
    if (!taskId) return;
    if (onViewTask) {
      onViewTask(taskId);
    } else {
      window.dispatchEvent(new CustomEvent('sumi-navigate', { detail: { tab: 'tasks', entityId: taskId } }));
      onClose();
    }
  };

  // Chỉ đường: mở thẳng một màn hình theo tab key (bách khoa toàn thư).
  const handleOpenScreen = (tab) => {
    if (!tab) return;
    window.dispatchEvent(new CustomEvent('sumi-navigate', { detail: { tab } }));
    onClose();
  };

  const renderMessageContent = (text) => {
    if (!text) return null;
    const parts = text.split(/(#?SUMI-\d{8}-\d{3,6})/gi);
    if (parts.length === 1) return text;
    return parts.map((part, idx) => {
      if (/#?SUMI-\d{8}-\d{3,6}/i.test(part)) {
        return (
          <button
            key={idx}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleOpenOrder(part.replace(/^#/, ''));
            }}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 3,
              padding: '1px 7px',
              margin: '0 2px',
              borderRadius: 6,
              background: '#fff0eb',
              color: '#ea580c',
              border: '1px solid #fbd0be',
              fontWeight: 800,
              fontSize: 12.5,
              cursor: 'pointer',
              verticalAlign: 'baseline',
              textDecoration: 'none'
            }}
            title="Bấm để mở xem chi tiết đơn hàng này"
          >
            🔍 {part}
          </button>
        );
      }
      return part;
    });
  };

  const recognitionRef = useRef(null);
  const fileInputRef = useRef(null);
  const chatEndRef = useRef(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, pendingAction]);

  // Khởi tạo Web Speech Recognition (Giọng nói tiếng Việt)
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.lang = 'vi-VN';
      recognition.continuous = false;
      recognition.interimResults = false;

      recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        setInput(transcript);
        handleSend(transcript);
      };

      recognition.onerror = (event) => {
        console.warn('[Speech] Error:', event.error);
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = recognition;
    }
  }, []);

  const toggleListening = () => {
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
    } else {
      if (!recognitionRef.current) {
        alert('Trình duyệt chưa hỗ trợ nhận diện giọng nói. Bạn hãy gõ chữ hoặc dán tin nhắn nhé!');
        return;
      }
      try {
        recognitionRef.current.start();
        setIsListening(true);
      } catch (e) {
        console.warn('Speech start error:', e);
      }
    }
  };

  const handleImageSelect = (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      setSelectedImage(e.target.result);
    };
    reader.readAsDataURL(file);
  };

  const handleSend = async (textOverride = null) => {
    const text = (textOverride !== null ? textOverride : input).trim();
    const image = selectedImage;

    if (!text && !image) return;

    // Thêm tin nhắn của user vào hội thoại
    const userMsg = {
      id: Date.now(),
      sender: 'user',
      text: text || 'Gửi hình ảnh đính kèm',
      image: image
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setSelectedImage(null);
    setIsLoading(true);

    try {
      const data = await askGenCopilot({
        message: text,
        imageBase64: image,
        userProfile,
        history: messages.slice(-6)
      });

      let replyText = data.reply || '';
      let actionToConfirm = null;

      // Kiểm tra xem Gemini có gọi Function Calling không
      if (data.functionCalls && data.functionCalls.length > 0) {
        const fc = data.functionCalls[0];

        if (fc.name === 'tra_cuu_don_hang') {
          const ordData = await executeSearchOrder({ query: fc.args.tu_khoa });
          if (ordData.orders && ordData.orders.length > 0) {
            replyText = `🔍 Em đã tra cứu thấy ${ordData.orders.length} đơn hàng khớp với "${fc.args.tu_khoa || 'yêu cầu'}". Bạn bấm vào nút "Xem chi tiết" của từng đơn bên dưới để mở thẳng đơn nhé:`;
            actionToConfirm = {
              type: 'card_display',
              cardType: 'order_list',
              orders: ordData.orders
            };
          } else {
            replyText = `🔍 Em không tìm thấy đơn hàng nào khớp với từ khóa "${fc.args.tu_khoa}". Bạn kiểm tra lại mã đơn, tên khách hoặc số điện thoại giúp em nhé!`;
          }
        } else if (fc.name === 'tra_cuu_cong_viec') {
          const taskData = await executeSearchTasks({
            tu_khoa: fc.args.tu_khoa,
            ten_nhan_vien: fc.args.ten_nhan_vien,
            trang_thai: fc.args.trang_thai
          });
          if (taskData.tasks && taskData.tasks.length > 0) {
            replyText = `📋 Em tìm thấy ${taskData.tasks.length} công việc${fc.args.ten_nhan_vien ? ` của bạn ${fc.args.ten_nhan_vien}` : ''}. Bạn bấm vào nút "Xem chi tiết" để mở thẳng đầu việc nhé:`;
            actionToConfirm = {
              type: 'card_display',
              cardType: 'task_list',
              tasks: taskData.tasks
            };
          } else {
            replyText = `📋 Hiện không tìm thấy công việc nào khớp với yêu cầu của bạn.`;
          }
        } else if (fc.name === 'tra_cuu_ton_kho') {
          const stockData = await executeCheckInventory({ keyword: fc.args.ten_mon });
          if (stockData.items && stockData.items.length > 0) {
            const itemsStr = stockData.items.map(i => `• ${i.name} (Size: ${i.size}): ${i.qty} cái [${i.branch}]`).join('\n');
            replyText = `📦 Tồn kho thành phẩm cho "${fc.args.ten_mon || 'kho'}":\n${itemsStr}`;
          } else {
            replyText = `📦 Hiện tại trong kho thành phẩm không còn tồn bánh "${fc.args.ten_mon || 'này'}".`;
          }
        } else if (fc.name === 'tra_cuu_nhan_su_cham_cong') {
          const attData = await executeGetStaffAttendance({ keyword: fc.args.ten_nhan_vien });
          if (fc.args.ten_nhan_vien) {
            const hit = (attData.allStaffToday || []).find(s => s.name.toLowerCase().includes(fc.args.ten_nhan_vien.toLowerCase()));
            if (hit) {
              replyText = `👤 Nhân viên ${hit.name}:\n• Chấm công vào ca lúc: ${hit.checkinTime ? new Date(hit.checkinTime).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '--:--'}\n• Ca: ${hit.shiftLabel || 'Ca chuẩn'}\n• Trạng thái: ${hit.isCurrentlyWorking ? '🟢 Đang làm việc' : '⚪ Đã ra ca'}`;
            } else {
              replyText = `👤 Hôm nay hệ thống chưa ghi nhận bạn "${fc.args.ten_nhan_vien}" chấm công vào ca.`;
            }
          } else {
            const names = (attData.workingList || []).map(s => `• ${s.name} (${s.station || 'Nhân sự'})`).join('\n');
            replyText = `👥 Hiện có ${attData.totalWorking} nhân sự đang trong ca làm việc hôm nay:\n${names || 'Chưa có nhân sự nào trong ca'}`;
          }
        } else if (fc.name === 'phan_tich_kinh_doanh_theo_ky') {
          const r = await executeBusinessAnalysis({ ...fc.args, userProfile });
          if (r.denied) {
            replyText = r.message;
          } else if (r.success) {
            const kenhStr = (r.kenh || []).filter(k => k.so_tien > 0).map(k => `   • ${k.kenh}: ${Number(k.so_tien).toLocaleString('vi-VN')}đ (${k.so_don} đơn)`).join('\n');
            replyText = `📊 PHÂN TÍCH KINH DOANH — ${r.ky}\n\n💰 Doanh thu thuần: ${Number(r.doanh_thu_thuan).toLocaleString('vi-VN')}đ${kenhStr ? '\n' + kenhStr : ''}\n💸 Chi tiêu: ${Number(r.tong_chi).toLocaleString('vi-VN')}đ (${r.so_khoan_chi} khoản)\n🏫 Doanh thu trường học: ${Number(r.doanh_thu_truong_hoc).toLocaleString('vi-VN')}đ (${r.so_don_truong} đơn)`;
          } else {
            replyText = `⚠️ Không lấy được số liệu phân tích: ${r.error || 'lỗi không xác định'}.`;
          }
        } else if (fc.name === 'tra_cuu_cong_no') {
          const r = await executeDebtLookup({ tu_khoa: fc.args.tu_khoa, userProfile });
          if (r.denied) {
            replyText = r.message;
          } else if (r.success && r.items.length > 0) {
            const lines = r.items.map(i => `   • ${i.khach} — ${i.ma_don}: còn ${Number(i.con_lai).toLocaleString('vi-VN')}đ`).join('\n');
            replyText = `🧾 CÔNG NỢ CẦN THU (${r.so_don} đơn · tổng ${Number(r.tong_con_lai).toLocaleString('vi-VN')}đ):\n${lines}`;
          } else if (r.success) {
            replyText = `✅ Không có công nợ nào${fc.args.tu_khoa ? ` khớp "${fc.args.tu_khoa}"` : ''} cần thu.`;
          } else {
            replyText = `⚠️ Không tra cứu được công nợ: ${r.error || 'lỗi'}.`;
          }
        } else if (fc.name === 'canh_bao_ton_kho_thap') {
          const r = await executeLowStockAlert({ loai: fc.args.loai, nguong: fc.args.nguong, userProfile });
          if (r.denied) {
            replyText = r.message;
          } else if (r.success && r.items.length > 0) {
            const loaiLabel = r.loai === 'thanh_pham' ? 'Bánh thành phẩm' : 'Nguyên vật liệu';
            const lines = r.items.map(i => `   • ${i.ten}${i.size ? ` (${i.size})` : ''}: còn ${i.so_luong}${i.don_vi ? ' ' + i.don_vi : ''}${i.chi_nhanh ? ` [${i.chi_nhanh}]` : ''}`).join('\n');
            replyText = `⚠️ ${loaiLabel} SẮP HẾT (≤ ${r.nguong}):\n${lines}`;
          } else if (r.success) {
            replyText = `✅ Không có mặt hàng nào dưới ngưỡng cảnh báo.`;
          } else {
            replyText = `⚠️ Không kiểm tra được tồn kho: ${r.error || 'lỗi'}.`;
          }
        } else if (fc.name === 'tom_tat_nhat_ky_van_hanh') {
          const r = await executeOpsSummary({ ky: fc.args.ky, userProfile });
          if (r.denied) {
            replyText = r.message;
          } else if (r.success) {
            const viStr = (r.vi_pham || []).length > 0 ? '\n' + r.vi_pham.map(v => `   • ${v.nhan_su}: ${v.noi_dung}${v.phat ? ` (phạt ${Number(v.phat).toLocaleString('vi-VN')}đ)` : ''}`).join('\n') : '';
            replyText = `📋 TÓM TẮT VẬN HÀNH — ${r.ky}\n\n• Báo cáo ca: ${r.so_bao_cao_ca}\n• Việc hoàn thành: ${r.so_viec_hoan_thanh}\n• Vi phạm nội quy: ${r.so_vi_pham}${viStr}`;
          } else {
            replyText = `⚠️ Không lấy được tóm tắt vận hành: ${r.error || 'lỗi'}.`;
          }
        } else if (fc.name === 'chi_duong_tinh_nang') {
          const r = await executeAppGuide({ cau_hoi: fc.args.cau_hoi, userProfile });
          const list = r.matches || [];
          if (list.length > 0) {
            const steps = list.map(m => `📍 ${m.ten}${m.duocPhep ? '' : ' (thuộc vai trò khác)'}\n${m.mo_ta}\n➡️ ${m.lam_sao}`).join('\n\n');
            replyText = `Dạ, đây là hướng dẫn:\n\n${steps}\n\nBấm nút bên dưới để em mở thẳng màn hình giúp anh/chị nhé!`;
            actionToConfirm = { type: 'card_display', cardType: 'nav_screen', screens: list };
          } else {
            replyText = `Em chưa tìm thấy chức năng khớp với "${fc.args.cau_hoi}". Anh/chị mô tả rõ hơn giúp em nhé (VD: "sửa giá đơn", "chấm công", "công nợ khách").`;
          }
        } else if (fc.name === 'truy_van_du_lieu') {
          const r = await executeDataQuery(fc.args, userProfile);
          if (r.denied) {
            replyText = r.message;
          } else if (!r.success) {
            replyText = `⚠️ Em chưa truy vấn được dữ liệu: ${r.error || 'lỗi không xác định'}.`;
          } else if (!r.rows || r.rows.length === 0) {
            replyText = `Em đã tra bảng "${fc.args.bang}" nhưng chưa thấy dữ liệu nào khớp yêu cầu.`;
          } else {
            // Suy luận: gửi dữ liệu THẬT về Gen để tự phân tích & trả lời (chỗ tạo
            // cảm giác "biết nghĩ" thay vì rập khuôn). Không kèm history để tránh loop.
            const follow = await askGenCopilot({
              message: `Câu hỏi của người dùng: "${text}".\nDưới đây là DỮ LIỆU THẬT vừa truy vấn từ bảng "${fc.args.bang}" (đã lọc đúng quyền, ${r.rows.length} dòng):\n${JSON.stringify(r.rows).slice(0, 6000)}\n\nHãy PHÂN TÍCH và trả lời ngắn gọn, chính xác bằng tiếng Việt, định dạng tiền VNĐ nếu có. CHỈ trả lời bằng lời, TUYỆT ĐỐI KHÔNG gọi thêm công cụ.`,
              userProfile,
              history: []
            });
            replyText = (follow?.reply && follow.reply.trim())
              ? follow.reply
              : `Em tìm thấy ${r.rows.length} kết quả trong "${fc.args.bang}" nhưng chưa tổng hợp được, anh/chị hỏi cụ thể hơn giúp em nhé.`;
          }
        } else {
          actionToConfirm = {
            name: fc.name,
            args: fc.args
          };

          if (fc.name === 'xin_tam_ung_luong') {
            replyText = `Dạ, em thấy bạn muốn xin tạm ứng số tiền: ${Number(fc.args.so_tien).toLocaleString('vi-VN')}đ (Lý do: ${fc.args.ly_do}). Bạn bấm xác nhận bên dưới để em gửi Giám đốc duyệt nhé!`;
          } else if (fc.name === 'giao_viec_nhan_su') {
            replyText = `Dạ, em đã lập phiếu giao việc cho bạn ${fc.args.ten_nhan_vien || 'nhân sự'}: "${fc.args.noi_dung_viec}". Sếp bấm 'Giao việc ngay' bên dưới để em gửi lệnh nhé!`;
          } else if (fc.name === 'bao_khoan_chi') {
            replyText = `Dạ, em đã lập phiếu ghi nhận khoản chi ${Number(fc.args.so_tien).toLocaleString('vi-VN')}đ (${fc.args.noi_dung_chi}). Bạn kiểm tra và bấm xác nhận bên dưới nhé!`;
          } else if (fc.name === 'tao_don_hang_banh') {
            replyText = `Dạ, em đã bóc tách thông tin đơn bánh cho khách ${fc.args.ten_khach || 'chưa rõ'}: Món ${fc.args.loai_banh || 'bánh'} - Số lượng/Size: ${fc.args.size_banh || 'chuẩn'}. Sếp/bạn bấm "🚀 Tạo Đơn & Chuyển Bếp Ngay" bên dưới để em gửi lệnh sản xuất xuống Bếp ngay lập tức nhé!`;
          } else if (fc.name === 'cap_nhat_trang_thai_don') {
            replyText = `Dạ, em đã chuẩn bị đổi trạng thái đơn ${fc.args.ma_don_hang} sang "${getStatusLabelVN(fc.args.trang_thai_moi)}". Bạn bấm xác nhận bên dưới để em cập nhật ngay nhé!`;
          } else if (fc.name === 'duyet_khoan_chi_hoac_ung') {
            const typeLabel = fc.args.loai === 'chi_tieu' ? 'khoản chi' : 'phiếu tạm ứng';
            replyText = `Dạ Sếp, Sếp đang xem xét ${typeLabel} của ${fc.args.ten_nguoi_yeu_cau || 'nhân sự'}: ${Number(fc.args.so_tien || 0).toLocaleString('vi-VN')}đ. Sếp bấm duyệt hoặc từ chối bên dưới nhé!`;
          } else if (fc.name === 'canh_bao_quy_dinh') {
            replyText = `⚠️ CẢNH BÁO QUY CHẾ: ${fc.args.noi_dung_vi_pham} (Gợi ý: ${fc.args.huong_giai_quyet || 'Báo cáo Giám đốc'})`;
          }
        }
      }

      const genMsg = {
        id: Date.now() + 1,
        sender: 'gen',
        text: replyText,
        action: actionToConfirm
      };

      setMessages((prev) => [...prev, genMsg]);
      setPendingAction(actionToConfirm);

      // Đọc to câu trả lời cho nhân sự bằng giọng Nam Minh
      speakVietnamese(replyText);
      setIsSpeaking(true);

    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now() + 1,
          sender: 'gen',
          text: `⚠️ Có lỗi xảy ra: ${err.message}. Vui lòng thử lại!`
        }
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  // Xác nhận thực thi hành động 2 bước
  const handleConfirmAction = async (action, actionOverride = null) => {
    const act = actionOverride || action;
    if (!act) return;
    setIsLoading(true);

    try {
      if (act.name === 'giao_viec_nhan_su') {
        const res = await executeAssignTask({
          tenNhanVien: act.args.ten_nhan_vien,
          noiDungViec: act.args.noi_dung_viec,
          hanChot: act.args.han_chot,
          yeuCauAnh: act.args.yeu_cau_anh
        });
        setMessages((prev) => [
          ...prev,
          {
            id: Date.now(),
            sender: 'gen',
            text: `✅ ${res.message}`,
            action: {
              type: 'card_display',
              cardType: 'created_task',
              task: {
                id: res.taskId,
                staff_name: res.staffName || act.args.ten_nhan_vien,
                title: res.title || act.args.noi_dung_viec,
                deadline: res.deadline || act.args.han_chot
              }
            }
          }
        ]);
        speakVietnamese(res.message);
        setPendingAction(null);
      } else if (act.name === 'bao_khoan_chi') {
        const res = await executeExpenseClaim({
          soTien: act.args.so_tien,
          noiDungChi: act.args.noi_dung_chi,
          ghiChu: act.args.ghi_chu
        });
        setMessages((prev) => [
          ...prev,
          { id: Date.now(), sender: 'gen', text: `✅ ${res.message}` }
        ]);
        speakVietnamese(res.message);
        setPendingAction(null);
      } else if (act.name === 'xin_tam_ung_luong') {
        const res = await executeSalaryAdvance({
          soTien: act.args.so_tien,
          lyDo: act.args.ly_do,
          ngayCan: act.args.ngay_can
        });
        setMessages((prev) => [
          ...prev,
          { id: Date.now(), sender: 'gen', text: `✅ ${res.message}` }
        ]);
        speakVietnamese(res.message);
        setPendingAction(null);
      } else if (act.name === 'tao_don_hang_banh') {
        const res = await executeCreateOrderDirectly(act.args, userProfile);
        setMessages((prev) => [
          ...prev,
          {
            id: Date.now(),
            sender: 'gen',
            text: `✅ ${res.message}`,
            action: {
              type: 'card_display',
              cardType: 'created_order',
              order: {
                id: res.orderId,
                order_code: res.orderCode,
                customer_name: res.customerName || act.args.ten_khach,
                cake_name: act.args.loai_banh,
                size: act.args.size_banh,
                required_at: act.args.thoi_gian_nhan,
                address: act.args.dia_chi
              }
            }
          }
        ]);
        speakVietnamese(res.message);
        setPendingAction(null);
      } else if (act.name === 'cap_nhat_trang_thai_don') {
        const res = await executeOrderStatusUpdate({
          orderCodeOrId: act.args.ma_don_hang,
          newStatus: act.args.trang_thai_moi,
          reason: act.args.ly_do_huy,
          userProfile
        });
        setMessages((prev) => [
          ...prev,
          {
            id: Date.now(),
            sender: 'gen',
            text: `✅ ${res.message}`,
            action: {
              type: 'card_display',
              cardType: 'status_updated',
              orderCode: act.args.ma_don_hang,
              newStatus: act.args.trang_thai_moi
            }
          }
        ]);
        speakVietnamese(res.message);
        setPendingAction(null);
      } else if (act.name === 'duyet_khoan_chi_hoac_ung') {
        const res = await executeReviewClaimOrAdvance({
          type: act.args.loai,
          id: act.args.id,
          approve: act.args.dong_y,
          note: act.args.ghi_chu
        });
        setMessages((prev) => [
          ...prev,
          { id: Date.now(), sender: 'gen', text: `✅ ${res.message}` }
        ]);
        speakVietnamese(res.message);
        setPendingAction(null);
      }
    } catch (err) {
      alert(`Lỗi khi thực hiện: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        background: 'rgba(0, 0, 0, 0.45)',
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center'
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: '#ffffff',
          width: '100%',
          maxWidth: '480px',
          height: '85vh',
          maxHeight: '720px',
          borderRadius: '24px 24px 0 0',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: '0 -10px 40px rgba(0,0,0,0.2)'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 20px',
            background: 'linear-gradient(135deg, #f05c2b 0%, #ff8c42 100%)',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: '50%',
                background: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#f05c2b'
              }}
            >
              <Bot size={22} />
            </div>
            <div>
              <div style={{ fontWeight: 800, fontSize: 16, display: 'flex', alignItems: 'center', gap: 6 }}>
                Trợ Lý Gen <Sparkles size={14} color="#ffd166" />
              </div>
              <div style={{ fontSize: 12, opacity: 0.9 }}>Sumi Bakery Copilot</div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              onClick={() => {
                if (isSpeaking) {
                  stopSpeaking();
                  setIsSpeaking(false);
                } else {
                  const lastGenMsg = [...messages].reverse().find(m => m.sender === 'gen');
                  if (lastGenMsg) speakVietnamese(lastGenMsg.text);
                  setIsSpeaking(true);
                }
              }}
              style={{
                background: 'rgba(255,255,255,0.2)',
                border: 'none',
                color: '#fff',
                borderRadius: '50%',
                width: 34,
                height: 34,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer'
              }}
              title="Đọc to nội dung"
            >
              {isSpeaking ? <VolumeX size={18} /> : <Volume2 size={18} />}
            </button>

            <button
              onClick={() => {
                if (window.confirm('Bạn có muốn bắt đầu một cuộc trò chuyện mới với Gen không? (Lịch sử cũ sẽ được làm mới)')) {
                  const defaultMsg = [
                    {
                      id: Date.now(),
                      sender: 'gen',
                      text: `Dạ em đã sẵn sàng! Sếp/bạn cần em hỗ trợ công việc gì tiếp theo ạ?`,
                      action: null
                    }
                  ];
                  setMessages(defaultMsg);
                  try {
                    localStorage.removeItem(storageKey);
                  } catch (_) {}
                  stopSpeaking();
                }
              }}
              style={{
                background: 'rgba(255,255,255,0.2)',
                border: 'none',
                color: '#fff',
                borderRadius: '50%',
                width: 34,
                height: 34,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer'
              }}
              title="Cuộc trò chuyện mới"
            >
              <RotateCcw size={16} />
            </button>

            <button
              onClick={onClose}
              style={{
                background: 'rgba(255,255,255,0.2)',
                border: 'none',
                color: '#fff',
                borderRadius: '50%',
                width: 34,
                height: 34,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer'
              }}
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Khung tin nhắn */}
        <div
          style={{
            flex: 1,
            padding: '16px',
            overflowY: 'auto',
            background: '#faf8f5',
            display: 'flex',
            flexDirection: 'column',
            gap: 12
          }}
        >
          {messages.map((m) => (
            <div
              key={m.id}
              style={{
                alignSelf: m.sender === 'user' ? 'flex-end' : 'flex-start',
                maxWidth: '85%',
                display: 'flex',
                flexDirection: 'column',
                gap: 6
              }}
            >
              <div
                style={{
                  background: m.sender === 'user' ? '#f05c2b' : '#ffffff',
                  color: m.sender === 'user' ? '#ffffff' : '#2b231d',
                  padding: '12px 16px',
                  borderRadius: m.sender === 'user' ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
                  fontSize: 14,
                  lineHeight: 1.5,
                  boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
                  whiteSpace: 'pre-wrap'
                }}
              >
                {m.image && (
                  <img
                    src={m.image}
                    alt="Đính kèm"
                    style={{
                      width: '100%',
                      maxHeight: '180px',
                      objectFit: 'cover',
                      borderRadius: '10px',
                      marginBottom: '8px'
                    }}
                  />
                )}
                {m.sender === 'user' ? m.text : renderMessageContent(m.text)}
              </div>

              {/* Thẻ hiển thị dữ liệu truy xuất hoặc kết quả (Card Display) */}
              {m.action && m.action.type === 'card_display' && m.action.cardType === 'order_list' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4, width: '100%' }}>
                  {(m.action.orders || []).map((o) => {
                    const stMeta = getStatusMeta(o.status_v2 || o.status);
                    const itemsStr = (o.order_items || []).map(i => `${i.name_snapshot || 'Bánh'} (SL: ${i.quantity || 1})`).join(', ');
                    const timeStr = o.required_at ? new Date(o.required_at).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }) : 'Trong ngày';
                    return (
                      <div
                        key={o.id}
                        style={{
                          background: '#ffffff',
                          border: '1.5px solid #fed7aa',
                          borderRadius: '14px',
                          padding: '12px 14px',
                          boxShadow: '0 2px 6px rgba(0,0,0,0.04)',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 6
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontWeight: 800, color: '#ea580c', fontSize: 13.5 }}>
                            #{o.order_code}
                          </span>
                          <span style={{
                            fontSize: 11.5, fontWeight: 800, padding: '2px 8px', borderRadius: 999,
                            background: stMeta.bg, color: stMeta.color
                          }}>
                            {stMeta.label}
                          </span>
                        </div>
                        <div style={{ fontSize: 13, color: '#451a03', lineHeight: 1.5 }}>
                          <div><b>👤 {o.customer_name || o.customers?.name || 'Khách lẻ'}</b> {o.customers?.phone || o.customer_phone ? `· ${o.customers?.phone || o.customer_phone}` : ''}</div>
                          <div>🎂 {itemsStr || 'Bánh kem'}</div>
                          <div style={{ fontSize: 12, color: '#78350f' }}>⏰ Hẹn: {timeStr}</div>
                          {o.address && <div style={{ fontSize: 12, color: '#78350f' }}>📍 {o.address}</div>}
                        </div>
                        <button
                          type="button"
                          onClick={() => handleOpenOrder(o.id || o.order_code)}
                          style={{
                            marginTop: 4,
                            width: '100%',
                            padding: '9px 12px',
                            borderRadius: 10,
                            border: 'none',
                            background: 'linear-gradient(135deg, #f05c2b 0%, #ff8c42 100%)',
                            color: '#fff',
                            fontSize: 13,
                            fontWeight: 700,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 6,
                            boxShadow: '0 2px 6px rgba(240, 92, 43, 0.25)'
                          }}
                        >
                          <Eye size={15} /> Xem chi tiết đơn hàng
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              {m.action && m.action.type === 'card_display' && m.action.cardType === 'nav_screen' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4, width: '100%' }}>
                  {(m.action.screens || []).map((s) => (
                    <button
                      key={s.key}
                      type="button"
                      disabled={!s.duocPhep}
                      onClick={() => handleOpenScreen(s.key)}
                      style={{
                        width: '100%',
                        padding: '10px 14px',
                        borderRadius: 10,
                        border: 'none',
                        background: s.duocPhep ? 'linear-gradient(135deg, #f05c2b 0%, #ff8c42 100%)' : '#f3e8df',
                        color: s.duocPhep ? '#fff' : '#a1887f',
                        fontSize: 13.5,
                        fontWeight: 700,
                        cursor: s.duocPhep ? 'pointer' : 'not-allowed',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 6,
                        boxShadow: s.duocPhep ? '0 2px 6px rgba(240, 92, 43, 0.25)' : 'none'
                      }}
                      title={s.duocPhep ? `Mở màn ${s.ten}` : 'Mục này thuộc vai trò khác'}
                    >
                      <ArrowRight size={15} /> Mở màn: {s.ten}
                    </button>
                  ))}
                </div>
              )}

              {m.action && m.action.type === 'card_display' && m.action.cardType === 'created_order' && (
                <div
                  style={{
                    background: '#f0fdf4',
                    border: '1.5px solid #86efac',
                    borderRadius: '14px',
                    padding: '14px',
                    marginTop: '4px',
                    width: '100%'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <span style={{ fontWeight: 800, color: '#16a34a', fontSize: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <CheckCircle2 size={16} /> Đã chuyển Bếp thành công!
                    </span>
                    <span style={{ background: '#dcfce7', color: '#15803d', fontSize: 12, fontWeight: 800, padding: '2px 8px', borderRadius: 999 }}>
                      #{m.action.order.order_code}
                    </span>
                  </div>
                  <div style={{ fontSize: 13, color: '#166534', lineHeight: 1.6, marginBottom: 10 }}>
                    <div>• Khách hàng: <b>{m.action.order.customer_name}</b></div>
                    <div>• Món: <b>{m.action.order.cake_name}</b> {m.action.order.size ? `(${m.action.order.size})` : ''}</div>
                    {m.action.order.required_at && <div>• Hẹn giao: <b>{m.action.order.required_at}</b></div>}
                    {m.action.order.address && <div>• Địa chỉ: {m.action.order.address}</div>}
                  </div>
                  <button
                    type="button"
                    onClick={() => handleOpenOrder(m.action.order.id || m.action.order.order_code)}
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      borderRadius: 10,
                      border: 'none',
                      background: 'linear-gradient(135deg, #16a34a 0%, #15803d 100%)',
                      color: '#fff',
                      fontSize: 13.5,
                      fontWeight: 800,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                      boxShadow: '0 3px 10px rgba(22, 163, 74, 0.25)'
                    }}
                  >
                    <Eye size={16} /> Mở Xem Chi Tiết Đơn Hàng Ngay
                  </button>
                </div>
              )}

              {m.action && m.action.type === 'card_display' && m.action.cardType === 'task_list' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4, width: '100%' }}>
                  {(m.action.tasks || []).map((t) => {
                    const isDone = t.status === 'completed';
                    return (
                      <div
                        key={t.id}
                        style={{
                          background: '#ffffff',
                          border: '1.5px solid #fed7aa',
                          borderRadius: '14px',
                          padding: '12px 14px',
                          boxShadow: '0 2px 6px rgba(0,0,0,0.04)',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 6
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                          <span style={{ fontWeight: 800, color: '#2b231d', fontSize: 13.5 }}>
                            📋 {t.title}
                          </span>
                          <span style={{
                            fontSize: 11.5, fontWeight: 800, padding: '2px 8px', borderRadius: 999,
                            background: isDone ? '#dcfce7' : '#fef3c7',
                            color: isDone ? '#15803d' : '#b45309'
                          }}>
                            {isDone ? 'Đã xong' : 'Đang làm'}
                          </span>
                        </div>
                        <div style={{ fontSize: 12.5, color: '#524338', lineHeight: 1.5 }}>
                          <div>👤 Người làm: <b>{t.assignee?.full_name || 'Chưa nhận'}</b> {t.assignee?.station ? `(${t.assignee.station})` : ''}</div>
                          {t.deadline && <div>⏰ Hạn chót: {new Date(t.deadline).toLocaleString('vi-VN')}</div>}
                          {t.description && <div style={{ color: '#78350f', fontSize: 12 }}>{t.description}</div>}
                        </div>
                        <button
                          type="button"
                          onClick={() => handleOpenTask(t.id)}
                          style={{
                            marginTop: 4,
                            width: '100%',
                            padding: '8px 12px',
                            borderRadius: 10,
                            border: '1.5px solid #d97706',
                            background: '#fffbeb',
                            color: '#b45309',
                            fontSize: 13,
                            fontWeight: 700,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 6
                          }}
                        >
                          <ClipboardList size={15} /> Xem chi tiết công việc
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              {m.action && m.action.type === 'card_display' && m.action.cardType === 'created_task' && (
                <div
                  style={{
                    background: '#f0fdf4',
                    border: '1.5px solid #86efac',
                    borderRadius: '14px',
                    padding: '14px',
                    marginTop: '4px',
                    width: '100%'
                  }}
                >
                  <div style={{ fontWeight: 800, color: '#16a34a', marginBottom: 6, fontSize: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <CheckCircle2 size={16} /> Đã giao việc thành công!
                  </div>
                  <div style={{ fontSize: 13, color: '#166534', lineHeight: 1.6, marginBottom: 10 }}>
                    <div>• Nhân sự: <b>{m.action.task.staff_name}</b></div>
                    <div>• Nội dung: <b>{m.action.task.title}</b></div>
                    {m.action.task.deadline && <div>• Hạn chót: <b>{m.action.task.deadline}</b></div>}
                  </div>
                  <button
                    type="button"
                    onClick={() => handleOpenTask(m.action.task.id)}
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      borderRadius: 10,
                      border: 'none',
                      background: 'linear-gradient(135deg, #16a34a 0%, #15803d 100%)',
                      color: '#fff',
                      fontSize: 13.5,
                      fontWeight: 800,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                      boxShadow: '0 3px 10px rgba(22, 163, 74, 0.25)'
                    }}
                  >
                    <ClipboardList size={16} /> Mở Xem Chi Tiết Công Việc Ngay
                  </button>
                </div>
              )}

              {m.action && m.action.type === 'card_display' && m.action.cardType === 'status_updated' && (
                <div
                  style={{
                    background: '#f0f9ff',
                    border: '1.5px solid #bae6fd',
                    borderRadius: '14px',
                    padding: '14px',
                    marginTop: '4px',
                    width: '100%'
                  }}
                >
                  <div style={{ fontWeight: 800, color: '#0284c7', marginBottom: 6, fontSize: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <CheckCircle2 size={16} /> Đã cập nhật trạng thái đơn!
                  </div>
                  <div style={{ fontSize: 13, color: '#0369a1', lineHeight: 1.6, marginBottom: 10 }}>
                    <div>• Đơn: <b>#{m.action.orderCode}</b></div>
                    <div>• Trạng thái mới: <b>{getStatusMeta(m.action.newStatus).label}</b></div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleOpenOrder(m.action.orderCode)}
                    style={{
                      width: '100%',
                      padding: '9px 14px',
                      borderRadius: 10,
                      border: 'none',
                      background: '#0284c7',
                      color: '#fff',
                      fontSize: 13,
                      fontWeight: 800,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6
                    }}
                  >
                    <Eye size={15} /> Xem chi tiết đơn hàng
                  </button>
                </div>
              )}

              {/* Thẻ hành động chờ xác nhận (Action Card) */}
              {m.action && m.action.name === 'xin_tam_ung_luong' && (
                <div
                  style={{
                    background: '#fff9f5',
                    border: '1.5px solid #fbd0be',
                    borderRadius: '14px',
                    padding: '14px',
                    marginTop: '4px'
                  }}
                >
                  <div style={{ fontWeight: 700, color: '#f05c2b', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <DollarSign size={18} /> Yêu Cầu Tạm Ứng Lương
                  </div>
                  <div style={{ fontSize: 13, color: '#524338', marginBottom: 10 }}>
                    <div>• Số tiền: <b>{Number(m.action.args.so_tien).toLocaleString('vi-VN')}đ</b></div>
                    <div>• Lý do: {m.action.args.ly_do}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      onClick={() => setPendingAction(null)}
                      style={{
                        flex: 1,
                        padding: '9px 12px',
                        borderRadius: 10,
                        border: '1px solid #ddd',
                        background: '#fff',
                        fontSize: 13,
                        fontWeight: 600,
                        cursor: 'pointer'
                      }}
                    >
                      Hủy bỏ
                    </button>
                    <button
                      onClick={() => handleConfirmAction(m.action)}
                      style={{
                        flex: 2,
                        padding: '9px 12px',
                        borderRadius: 10,
                        border: 'none',
                        background: '#10b981',
                        color: '#fff',
                        fontSize: 13,
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 6
                      }}
                    >
                      <CheckCircle2 size={16} /> Xác nhận gửi Sếp
                    </button>
                  </div>
                </div>
              )}

              {m.action && m.action.name === 'tao_don_hang_banh' && (
                <div
                  style={{
                    background: '#fffbf0',
                    border: '1.5px solid #fed7aa',
                    borderRadius: '14px',
                    padding: '14px',
                    marginTop: '4px'
                  }}
                >
                  <div style={{ fontWeight: 700, color: '#d97706', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Cake size={18} /> Đơn Bánh Đã Bóc Tách
                  </div>
                  <div style={{ fontSize: 13, color: '#524338', marginBottom: 10, lineHeight: 1.6 }}>
                    <div>• Khách hàng: <b>{m.action.args.ten_khach || 'Khách lẻ'}</b> {m.action.args.so_dien_thoai ? `(${m.action.args.so_dien_thoai})` : ''}</div>
                    <div>• Món: <b>{m.action.args.loai_banh}</b> - Size: {m.action.args.size_banh || 'Tiêu chuẩn'}</div>
                    {m.action.args.thoi_gian_nhan && <div>• Giờ nhận: <b>{m.action.args.thoi_gian_nhan}</b></div>}
                    {m.action.args.chu_viet_len_banh && <div>• Chữ ghi bánh: <i>"{m.action.args.chu_viet_len_banh}"</i></div>}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <button
                      onClick={() => handleConfirmAction(m.action)}
                      style={{
                        width: '100%',
                        padding: '11px 14px',
                        borderRadius: 10,
                        border: 'none',
                        background: 'linear-gradient(135deg, #16a34a 0%, #15803d 100%)',
                        color: '#fff',
                        fontSize: 14,
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 6,
                        boxShadow: '0 4px 12px rgba(22, 163, 74, 0.3)'
                      }}
                    >
                      🚀 Tạo Đơn & Chuyển Bếp Ngay
                    </button>
                    {onOpenOrderForm && (
                      <button
                        onClick={() => {
                          onOpenOrderForm(m.action.args);
                          setPendingAction(null);
                          onClose();
                        }}
                        style={{
                          width: '100%',
                          padding: '8px 12px',
                          borderRadius: 8,
                          border: '1px solid #fed7aa',
                          background: '#fff',
                          color: '#c2410c',
                          fontSize: 12,
                          fontWeight: 600,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 6
                        }}
                      >
                        ✏️ Mở form tự chỉnh sửa thêm <ArrowRight size={14} />
                      </button>
                    )}
                  </div>
                </div>
              )}

              {m.action && m.action.name === 'giao_viec_nhan_su' && (
                <div
                  style={{
                    background: '#f0fdf4',
                    border: '1.5px solid #86efac',
                    borderRadius: '14px',
                    padding: '14px',
                    marginTop: '8px'
                  }}
                >
                  <div style={{ fontWeight: 700, color: '#16a34a', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <ClipboardList size={18} /> Phiếu Giao Việc Nhân Sự
                  </div>
                  <div style={{ fontSize: 13, color: '#166534', marginBottom: 12, lineHeight: 1.6 }}>
                    <div>• Nhân sự: <b style={{ fontSize: 14, color: '#14532d' }}>{m.action.args.ten_nhan_vien || 'Nhân sự'}</b></div>
                    <div>• Nội dung việc: <b>{m.action.args.noi_dung_viec}</b></div>
                    {m.action.args.han_chot && <div>• Hạn chót: <b>{m.action.args.han_chot}</b></div>}
                    {m.action.args.yeu_cau_anh && <div>• Yêu cầu: <i>Bắt buộc chụp ảnh nghiệm thu</i></div>}
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      onClick={() => setPendingAction(null)}
                      style={{
                        flex: 1,
                        padding: '9px 12px',
                        borderRadius: 10,
                        border: '1px solid #ddd',
                        background: '#fff',
                        fontSize: 13,
                        fontWeight: 600,
                        cursor: 'pointer'
                      }}
                    >
                      Hủy
                    </button>
                    <button
                      onClick={() => handleConfirmAction(m.action)}
                      style={{
                        flex: 2,
                        padding: '9px 12px',
                        borderRadius: 10,
                        border: 'none',
                        background: '#16a34a',
                        color: '#fff',
                        fontSize: 13,
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 6
                      }}
                    >
                      <CheckCircle2 size={16} /> Giao việc ngay
                    </button>
                  </div>
                </div>
              )}

              {m.action && m.action.name === 'bao_khoan_chi' && (
                <div
                  style={{
                    background: '#fef2f2',
                    border: '1.5px solid #fca5a5',
                    borderRadius: '14px',
                    padding: '14px',
                    marginTop: '8px'
                  }}
                >
                  <div style={{ fontWeight: 700, color: '#dc2626', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <ReceiptText size={18} /> Phiếu Ghi Nhận Khoản Chi
                  </div>
                  <div style={{ fontSize: 13, color: '#991b1b', marginBottom: 12, lineHeight: 1.6 }}>
                    <div>• Số tiền: <b style={{ fontSize: 15, color: '#dc2626' }}>{Number(m.action.args.so_tien).toLocaleString('vi-VN')} đ</b></div>
                    <div>• Nội dung chi: <b>{m.action.args.noi_dung_chi}</b></div>
                    {m.action.args.ghi_chu && <div>• Ghi chú: {m.action.args.ghi_chu}</div>}
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      onClick={() => setPendingAction(null)}
                      style={{
                        flex: 1,
                        padding: '9px 12px',
                        borderRadius: 10,
                        border: '1px solid #ddd',
                        background: '#fff',
                        fontSize: 13,
                        fontWeight: 600,
                        cursor: 'pointer'
                      }}
                    >
                      Hủy
                    </button>
                    <button
                      onClick={() => handleConfirmAction(m.action)}
                      style={{
                        flex: 2,
                        padding: '9px 12px',
                        borderRadius: 10,
                        border: 'none',
                        background: '#dc2626',
                        color: '#fff',
                        fontSize: 13,
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 6
                      }}
                    >
                      <CheckCircle2 size={16} /> Xác nhận ghi chi
                    </button>
                  </div>
                </div>
              )}

              {m.action && m.action.name === 'cap_nhat_trang_thai_don' && (
                <div
                  style={{
                    background: '#f0f9ff',
                    border: '1.5px solid #bae6fd',
                    borderRadius: '14px',
                    padding: '14px',
                    marginTop: '8px'
                  }}
                >
                  <div style={{ fontWeight: 700, color: '#0284c7', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Truck size={18} /> Cập Nhật Trạng Thái Đơn Hàng
                  </div>
                  <div style={{ fontSize: 13, color: '#0369a1', marginBottom: 12, lineHeight: 1.6 }}>
                    <div>• Mã đơn / Khách: <b style={{ fontSize: 14, color: '#0c4a6e' }}>{m.action.args.ma_don_hang}</b></div>
                    <div>• Chuyển sang trạng thái: <b style={{ color: '#0284c7', fontSize: 14 }}>{getStatusLabelVN(m.action.args.trang_thai_moi)}</b></div>
                    {m.action.args.ly_do_huy && <div>• Lý do hủy: <i>{m.action.args.ly_do_huy}</i></div>}
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      onClick={() => setPendingAction(null)}
                      style={{
                        flex: 1,
                        padding: '9px 12px',
                        borderRadius: 10,
                        border: '1px solid #ddd',
                        background: '#fff',
                        fontSize: 13,
                        fontWeight: 600,
                        cursor: 'pointer'
                      }}
                    >
                      Hủy
                    </button>
                    <button
                      onClick={() => handleConfirmAction(m.action)}
                      style={{
                        flex: 2,
                        padding: '9px 12px',
                        borderRadius: 10,
                        border: 'none',
                        background: '#0284c7',
                        color: '#fff',
                        fontSize: 13,
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 6
                      }}
                    >
                      <CheckCircle2 size={16} /> Xác nhận đổi trạng thái
                    </button>
                  </div>
                </div>
              )}

              {m.action && m.action.name === 'duyet_khoan_chi_hoac_ung' && (
                <div
                  style={{
                    background: '#fdf4ff',
                    border: '1.5px solid #f0abfc',
                    borderRadius: '14px',
                    padding: '14px',
                    marginTop: '8px'
                  }}
                >
                  <div style={{ fontWeight: 700, color: '#a21caf', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <DollarSign size={18} /> Phê Duyệt Tài Chính (Ban Giám Đốc)
                  </div>
                  <div style={{ fontSize: 13, color: '#86198f', marginBottom: 12, lineHeight: 1.6 }}>
                    <div>• Loại yêu cầu: <b>{m.action.args.loai === 'chi_tieu' ? 'Khoản chi tiêu' : 'Tạm ứng lương'}</b></div>
                    <div>• Người yêu cầu: <b>{m.action.args.ten_nguoi_yeu_cau || 'Nhân sự'}</b></div>
                    <div>• Số tiền: <b style={{ fontSize: 15, color: '#a21caf' }}>{Number(m.action.args.so_tien || 0).toLocaleString('vi-VN')} đ</b></div>
                    {m.action.args.ghi_chu && <div>• Ghi chú: {m.action.args.ghi_chu}</div>}
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      onClick={() => handleConfirmAction(m.action, { ...m.action, args: { ...m.action.args, dong_y: false } })}
                      style={{
                        flex: 1,
                        padding: '9px 12px',
                        borderRadius: 10,
                        border: '1px solid #f87171',
                        background: '#fff',
                        color: '#dc2626',
                        fontSize: 13,
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 4
                      }}
                    >
                      <XCircle size={15} /> Từ chối
                    </button>
                    <button
                      onClick={() => handleConfirmAction(m.action, { ...m.action, args: { ...m.action.args, dong_y: true } })}
                      style={{
                        flex: 1.5,
                        padding: '9px 12px',
                        borderRadius: 10,
                        border: 'none',
                        background: '#16a34a',
                        color: '#fff',
                        fontSize: 13,
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 6
                      }}
                    >
                      <CheckCircle2 size={16} /> Phê duyệt ngay
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}

          {isLoading && (
            <div
              style={{
                alignSelf: 'flex-start',
                background: '#fff',
                padding: '10px 16px',
                borderRadius: '18px',
                fontSize: 13,
                color: '#725f50',
                display: 'flex',
                alignItems: 'center',
                gap: 6
              }}
            >
              <Sparkles size={16} color="#f05c2b" className="animate-spin" /> Gen đang suy nghĩ và xử lý...
            </div>
          )}

          <div ref={chatEndRef} />
        </div>

        {/* Preview ảnh đính kèm nếu có */}
        {selectedImage && (
          <div style={{ padding: '6px 16px', background: '#fff', display: 'flex', alignItems: 'center', gap: 10 }}>
            <img src={selectedImage} alt="Preview" style={{ width: 44, height: 44, borderRadius: 8, objectFit: 'cover' }} />
            <span style={{ fontSize: 12, color: '#524338', flex: 1 }}>Đã chọn 1 ảnh mẫu bánh / chứng từ</span>
            <button onClick={() => setSelectedImage(null)} style={{ border: 'none', background: 'none', color: '#999', cursor: 'pointer' }}>
              <X size={18} />
            </button>
          </div>
        )}

        {/* Khung nhập liệu & Micro */}
        <div
          style={{
            padding: '12px 16px',
            background: '#ffffff',
            borderTop: '1px solid #eee',
            display: 'flex',
            alignItems: 'center',
            gap: 10
          }}
        >
          <input
            type="file"
            ref={fileInputRef}
            hidden
            accept="image/*"
            onChange={(e) => handleImageSelect(e.target.files?.[0])}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            style={{
              width: 42,
              height: 42,
              borderRadius: '50%',
              border: '1px solid #eadcca',
              background: '#faf6f0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#725f50',
              cursor: 'pointer'
            }}
            title="Gửi ảnh mẫu bánh"
          >
            <ImageIcon size={20} />
          </button>

          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder={isListening ? 'Đang lắng nghe bạn nói...' : 'Nói, gõ hoặc dán tin Zalo...'}
            style={{
              flex: 1,
              height: 44,
              borderRadius: 22,
              border: isListening ? '2px solid #ef4444' : '1px solid #eadcca',
              padding: '0 16px',
              fontSize: 14,
              outline: 'none',
              background: isListening ? '#fef2f2' : '#ffffff'
            }}
          />

          <button
            onClick={toggleListening}
            style={{
              width: 44,
              height: 44,
              borderRadius: '50%',
              border: 'none',
              background: isListening ? '#ef4444' : '#faf6f0',
              color: isListening ? '#ffffff' : '#725f50',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              transition: 'all 0.2s ease'
            }}
            title={isListening ? 'Dừng ghi âm' : 'Bấm để nói tiếng Việt'}
          >
            {isListening ? <MicOff size={22} className="animate-pulse" /> : <Mic size={22} />}
          </button>

          <button
            onClick={() => handleSend()}
            disabled={!input.trim() && !selectedImage}
            style={{
              width: 44,
              height: 44,
              borderRadius: '50%',
              border: 'none',
              background: (!input.trim() && !selectedImage) ? '#f3e8df' : '#f05c2b',
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: (!input.trim() && !selectedImage) ? 'not-allowed' : 'pointer'
            }}
          >
            <Send size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}
