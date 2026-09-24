import React, { useEffect, useState } from 'react';
import { Volume2, Check, Sparkles, ThumbsUp } from 'lucide-react';
import { speakVietnamese, stopSpeaking, executeAcceptTask } from '../../lib/geminiCopilot';
import { playViecVoiceSound } from '../../lib/alarmSound';

/**
 * Hỗ trợ nhân sự không biết chữ:
 * - Khi có việc mới, phát chuông nhắc việc to rõ
 * - Trợ lý Gen cất tiếng đọc to nội dung công việc
 * - Màn hình hiện Nút Xanh Khổng Lồ để nhân viên chỉ cần lấy ngón tay chạm 1 cái là xong!
 */
export function GenVoiceTaskAlert({ task, onClose, onAccepted }) {
  if (!task) return null;

  const [busy, setBusy] = useState(false);
  const employeeName = task.assignee_name || 'Bạn';
  // kind='message' -> tin nhắn tự do từ Sếp (không phải giao việc): Gen đọc to
  // nội dung, nút "TÔI ĐÃ NGHE" chỉ đóng lại (không có bước nhận việc).
  const isMessage = task.kind === 'message';
  const taskTitle = task.title || task.content || (isMessage ? 'Tin nhắn mới' : 'Công việc mới');
  const fromLabel = task.from_title || 'Sếp';
  const speechMessage = isMessage
    ? `${employeeName} ơi! ${fromLabel} nhắn: ${taskTitle}`
    : `${employeeName} ơi! Sếp vừa giao việc mới: ${taskTitle}. Bấm nút màu xanh để nhận việc nhé!`;

  useEffect(() => {
    // 1. Kích hoạt chuông gọi việc
    try {
      playViecVoiceSound();
    } catch (e) {
      console.warn('Audio error:', e);
    }

    // 2. Trợ lý Gen đọc to nội dung việc sau 1 giây
    const timer = setTimeout(() => {
      speakVietnamese(speechMessage);
    }, 1200);

    return () => {
      clearTimeout(timer);
      stopSpeaking();
    };
  }, [task?.id]);

  const handleAccept = async () => {
    // Tin nhắn: chỉ cần xác nhận "đã nghe", không có bước nhận việc.
    if (isMessage) {
      stopSpeaking();
      if (onAccepted) onAccepted(task.id);
      onClose();
      return;
    }
    setBusy(true);
    try {
      await executeAcceptTask(task.id);
      speakVietnamese('Đã báo cáo Sếp là bạn đã nhận việc!');
      if (onAccepted) onAccepted(task.id);
      onClose();
    } catch (err) {
      alert(`Lỗi: ${err.message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 200,
        background: 'rgba(0, 0, 0, 0.75)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16
      }}
    >
      <div
        style={{
          background: '#ffffff',
          width: '100%',
          maxWidth: '420px',
          borderRadius: '28px',
          padding: '24px 20px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
          boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
          border: '4px solid #10b981'
        }}
      >
        <div
          style={{
            background: '#ecfdf5',
            color: '#10b981',
            borderRadius: '50%',
            width: 64,
            height: 64,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 12
          }}
        >
          <Sparkles size={34} />
        </div>

        <h2 style={{ margin: '0 0 6px', fontSize: 22, fontWeight: 900, color: '#111827' }}>
          {isMessage ? 'CÓ TIN NHẮN MỚI!' : 'CÓ VIỆC MỚI ĐƯỢC GIAO!'}
        </h2>

        <p style={{ margin: '0 0 16px', fontSize: 16, color: '#4b5563', lineHeight: 1.5 }}>
          <b>{employeeName}</b> ơi, {isMessage ? `${fromLabel} nhắn:` : 'Sếp vừa giao:'}
        </p>

        {/* Khung nội dung to bản */}
        <div
          style={{
            background: '#f3f4f6',
            borderRadius: '16px',
            padding: '16px',
            width: '100%',
            marginBottom: 20,
            fontSize: 18,
            fontWeight: 700,
            color: '#1f2937',
            boxSizing: 'border-box'
          }}
        >
          "{taskTitle}"
        </div>

        {/* Nút bấm nghe lại giọng đọc */}
        <button
          onClick={() => speakVietnamese(speechMessage)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '8px 16px',
            borderRadius: 20,
            border: '1px solid #d1d5db',
            background: '#ffffff',
            color: '#374151',
            fontSize: 14,
            fontWeight: 600,
            cursor: 'pointer',
            marginBottom: 20
          }}
        >
          <Volume2 size={18} color="#10b981" /> Bấm để nghe lại giọng đọc
        </button>

        {/* NÚT XANH LÁ KHỔNG LỒ 1 CHẠM DÀNH CHO NGƯỜI KHÔNG BIẾT CHỮ */}
        <button
          onClick={handleAccept}
          disabled={busy}
          style={{
            width: '100%',
            minHeight: '74px',
            borderRadius: '22px',
            border: 'none',
            background: busy ? '#6ee7b7' : 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
            color: '#ffffff',
            fontSize: 18,
            fontWeight: 900,
            boxShadow: '0 8px 24px rgba(16, 185, 129, 0.4)',
            cursor: busy ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 12,
            transition: 'transform 0.1s ease',
            outline: 'none'
          }}
          onMouseDown={(e) => (e.currentTarget.style.transform = 'scale(0.97)')}
          onMouseUp={(e) => (e.currentTarget.style.transform = 'scale(1)')}
        >
          <ThumbsUp size={28} />
          <span>{busy ? 'ĐANG BÁO CÁO...' : (isMessage ? 'TÔI ĐÃ NGHE RÕ' : 'TÔI ĐÃ HIỂU & NHẬN VIỆC')}</span>
        </button>

        <button
          onClick={onClose}
          style={{
            marginTop: 12,
            background: 'none',
            border: 'none',
            color: '#9ca3af',
            fontSize: 13,
            cursor: 'pointer'
          }}
        >
          Để tôi xem sau
        </button>
      </div>
    </div>
  );
}
