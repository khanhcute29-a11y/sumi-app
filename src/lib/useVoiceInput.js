import { useRef, useState } from 'react';

const ERROR_MESSAGES = {
  'not-allowed': 'Chưa cấp quyền micro',
  'service-not-allowed': 'Chưa cấp quyền micro',
  'no-speech': 'Không nghe thấy, thử lại',
};

export function useVoiceInput({ lang = 'vi-VN' } = {}) {
  const recognitionRef = useRef(null);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState(null);
  const [supported] = useState(() => typeof window !== 'undefined' && Boolean(window.SpeechRecognition || window.webkitSpeechRecognition));

  const start = (onResult, onInterim) => {
    if (!supported) return;
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.lang = lang;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    setError(null);
    recognition.onresult = (event) => {
      const result = event.results[event.results.length - 1];
      const transcript = result[0].transcript;
      if (result.isFinal) {
        onResult(transcript);
      } else {
        onInterim?.(transcript);
      }
    };
    recognition.onend = () => setListening(false);
    recognition.onerror = (event) => {
      setError(ERROR_MESSAGES[event.error] || 'Không nhận diện được giọng nói');
      setListening(false);
    };
    recognitionRef.current = recognition;
    setListening(true);
    recognition.start();
  };

  const stop = () => {
    recognitionRef.current?.stop();
    setListening(false);
  };

  return { supported, listening, error, start, stop };
}
