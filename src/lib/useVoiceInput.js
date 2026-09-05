import { useRef, useState } from 'react';

// Cấu hình + triết lý lấy từ 1 tính năng giọng nói khác của sếp (đặc tả
// "so-chi-tieu-tai-khoan.html") mà sếp và anh đánh giá rất nhạy, vào đúng ô
// cần — ưu tiên người nói chậm, nói khàn, nói ngập ngừng thay vì cắt ngang
// giữa chừng như hành vi mặc định (continuous=false) của trình duyệt.
const SILENCE_MS = 4000;

const ERROR_MESSAGES = {
  'not-allowed': 'Bạn cần cho phép quyền micro — kiểm tra icon 🔒 cạnh thanh địa chỉ.',
  'service-not-allowed': 'Bạn cần cho phép quyền micro — kiểm tra icon 🔒 cạnh thanh địa chỉ.',
  'no-speech': 'Không nghe thấy gì, thử lại nhé — nói to và rõ nhất có thể.',
};

export function useVoiceInput({ lang = 'vi-VN' } = {}) {
  const recognitionRef = useRef(null);
  const silenceTimerRef = useRef(null);
  const finalTranscriptRef = useRef('');
  const onResultRef = useRef(null);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState(null);
  const [supported] = useState(() => typeof window !== 'undefined' && Boolean(window.SpeechRecognition || window.webkitSpeechRecognition));

  const start = (onResult, onInterim) => {
    if (!supported) return;
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.lang = lang;
    // continuous=true: không tự ngắt khi người nói dừng lấy hơi giữa câu —
    // chỉ dừng thật khi im lặng đủ SILENCE_MS (tự đặt timer bên dưới) hoặc
    // người dùng tự bấm dừng.
    recognition.continuous = true;
    recognition.interimResults = true;
    // Lấy tối đa 3 phương án, chọn phương án có độ tin cậy (confidence) cao
    // nhất thay vì luôn lấy phương án đầu tiên — trình duyệt không hỗ trợ thì
    // tự động chỉ trả về 1 phương án, không lỗi.
    recognition.maxAlternatives = 3;
    setError(null);
    finalTranscriptRef.current = '';
    onResultRef.current = onResult;

    const resetSilenceTimer = () => {
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = setTimeout(() => {
        recognition.stop();
      }, SILENCE_MS);
    };

    const bestAlternative = (result) => {
      let best = result[0];
      for (let j = 1; j < result.length; j++) {
        if (result[j].confidence > best.confidence) best = result[j];
      }
      return best.transcript;
    };

    recognition.onresult = (event) => {
      resetSilenceTimer();
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const transcript = bestAlternative(result);
        if (result.isFinal) {
          // Cộng dồn — vì continuous=true có thể sinh nhiều đoạn "đã chốt"
          // (isFinal) cho CÙNG một lượt nói khi người nói ngắt quãng tự nhiên
          // giữa câu (vd lấy hơi), không phải mỗi đoạn là một câu riêng.
          finalTranscriptRef.current = finalTranscriptRef.current
            ? `${finalTranscriptRef.current} ${transcript}`
            : transcript;
        } else {
          const lienTuc = finalTranscriptRef.current
            ? `${finalTranscriptRef.current} ${transcript}`
            : transcript;
          onInterim?.(lienTuc);
        }
      }
    };
    recognition.onend = () => {
      setListening(false);
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      // Chỉ báo kết quả MỘT LẦN DUY NHẤT khi phiên nói thật sự kết thúc (im
      // lặng đủ lâu hoặc tự bấm dừng), dùng câu đã cộng dồn đầy đủ — không
      // báo theo từng đoạn isFinal riêng lẻ như trước (từng gây gọi API phân
      // tích nhiều lần cho cùng 1 câu nói ở màn Giao việc).
      const finalText = finalTranscriptRef.current.trim();
      if (finalText) onResultRef.current?.(finalText);
    };
    recognition.onerror = (event) => {
      // 'aborted' = người dùng tự bấm dừng, không phải lỗi thật — im lặng.
      if (event.error === 'aborted') return;
      setError(ERROR_MESSAGES[event.error] || 'Có lỗi khi nhận diện giọng nói, thử lại nhé.');
      setListening(false);
    };
    recognitionRef.current = recognition;
    setListening(true);
    resetSilenceTimer();
    recognition.start();
  };

  const stop = () => {
    // Không tự setListening(false) ở đây — để onend (chạy ngay sau khi
    // recognition.stop() thật sự dừng) là nơi DUY NHẤT vừa tắt trạng thái
    // listening vừa báo kết quả, tránh 2 nơi cập nhật state chồng chéo nhau.
    recognitionRef.current?.stop();
  };

  return { supported, listening, error, start, stop };
}
