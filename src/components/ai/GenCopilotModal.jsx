import React, { useState, useRef, useEffect } from 'react';
import { 
  X, Mic, MicOff, Send, Image as ImageIcon, Volume2, 
  VolumeX, AlertTriangle, CheckCircle2, Bot, Sparkles, 
  CornerDownLeft, FileText, DollarSign, Cake, ArrowRight 
} from 'lucide-react';
import { 
  askGenCopilot, speakVietnamese, stopSpeaking, 
  executeSalaryAdvance, executeExpenseClaim 
} from '../../lib/geminiCopilot';
import { playConfirmSound } from '../../lib/sound';

export function GenCopilotModal({ isOpen, onClose, userProfile, onOpenOrderForm }) {
  if (!isOpen) return null;

  const [input, setInput] = useState('');
  const [messages, setMessages] = useState([
    {
      id: 1,
      sender: 'gen',
      text: `Chào ${userProfile?.name || 'bạn'}! Em là Gen — Trợ lý AI tiệm bánh Sumi Bakery. Anh/chị có thể nói, dán tin nhắn Zalo hoặc gửi ảnh mẫu bánh để em xử lý nhé!`,
      action: null
    }
  ]);
  const [isListening, setIsListening] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedImage, setSelectedImage] = useState(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [pendingAction, setPendingAction] = useState(null); // Hành động chờ xác nhận 2 bước

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
        userProfile
      });

      let replyText = data.reply || '';
      let actionToConfirm = null;

      // Kiểm tra xem Gemini có gọi Function Calling không
      if (data.functionCalls && data.functionCalls.length > 0) {
        const fc = data.functionCalls[0];
        actionToConfirm = {
          name: fc.name,
          args: fc.args
        };

        if (fc.name === 'xin_tam_ung_luong') {
          replyText = `Dạ, em thấy bạn muốn xin tạm ứng số tiền: ${Number(fc.args.so_tien).toLocaleString('vi-VN')}đ (Lý do: ${fc.args.ly_do}). Bạn bấm xác nhận bên dưới để em gửi Giám đốc duyệt nhé!`;
        } else if (fc.name === 'tao_don_hang_banh') {
          replyText = `Dạ, em đã bóc tách thông tin đơn bánh cho khách ${fc.args.ten_khach || 'chưa rõ'}: Loại ${fc.args.loai_banh || 'bánh kem'} size ${fc.args.size_banh || 'chuẩn'}. Mời bạn kiểm tra thẻ bên dưới:`;
        } else if (fc.name === 'canh_bao_quy_dinh') {
          replyText = `⚠️ CẢNH BÁO QUY CHẾ: ${fc.args.noi_dung_vi_pham} (Gợi ý: ${fc.args.huong_giai_quyet || 'Báo cáo Giám đốc'})`;
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

      // Đọc to câu trả lời cho nhân sự (hỗ trợ người không biết chữ)
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
  const handleConfirmAction = async (action) => {
    if (!action) return;
    setIsLoading(true);

    try {
      if (action.name === 'xin_tam_ung_luong') {
        const res = await executeSalaryAdvance({
          soTien: action.args.so_tien,
          lyDo: action.args.ly_do,
          ngayCan: action.args.ngay_can
        });
        setMessages((prev) => [
          ...prev,
          { id: Date.now(), sender: 'gen', text: `✅ ${res.message}` }
        ]);
        speakVietnamese(res.message);
        setPendingAction(null);
      } else if (action.name === 'tao_don_hang_banh') {
        // Mở form tạo đơn có sẵn của Sumi Bakery và truyền dữ liệu bóc tách
        if (onOpenOrderForm) {
          onOpenOrderForm(action.args);
        }
        setPendingAction(null);
        onClose();
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
                {m.text}
              </div>

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
                  <button
                    onClick={() => handleConfirmAction(m.action)}
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      borderRadius: 10,
                      border: 'none',
                      background: '#f05c2b',
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
                    Mở Form Hoàn Tất Đơn <ArrowRight size={16} />
                  </button>
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

        {/* Gợi ý nhanh (Quick Chips) */}
        <div
          style={{
            padding: '8px 12px',
            background: '#ffffff',
            borderTop: '1px solid #f0e6dd',
            display: 'flex',
            gap: 8,
            overflowX: 'auto',
            whiteSpace: 'nowrap'
          }}
        >
          <button
            onClick={() => handleSend('Lên đơn bánh kem bắp 20cm cho chị Lan 0988123456 giao 4h chiều mai')}
            style={{
              padding: '6px 12px',
              borderRadius: '20px',
              border: '1px solid #eadcca',
              background: '#faf6f0',
              fontSize: 12,
              color: '#524338',
              cursor: 'pointer'
            }}
          >
            🎂 Lên đơn bánh kem bắp
          </button>
          <button
            onClick={() => handleSend('Xin tạm ứng lương 2 triệu lo tiền nhà')}
            style={{
              padding: '6px 12px',
              borderRadius: '20px',
              border: '1px solid #eadcca',
              background: '#faf6f0',
              fontSize: 12,
              color: '#524338',
              cursor: 'pointer'
            }}
          >
            💵 Xin tạm ứng lương
          </button>
          <button
            onClick={() => handleSend('Chi 120k mua thêm đá lạnh cho tủ bánh')}
            style={{
              padding: '6px 12px',
              borderRadius: '20px',
              border: '1px solid #eadcca',
              background: '#faf6f0',
              fontSize: 12,
              color: '#524338',
              cursor: 'pointer'
            }}
          >
            🧾 Báo chi tiền đá
          </button>
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
