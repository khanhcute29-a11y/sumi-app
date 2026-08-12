import React, { useEffect, useRef, useState } from 'react';
import { Button } from './forms/Button';

export function CameraCapture({ onCapture, onClose }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [error, setError] = useState('');
  const [captured, setCaptured] = useState(null);

  useEffect(() => {
    navigator.mediaDevices?.getUserMedia?.({ video: { facingMode: 'environment' } })
      .then((stream) => {
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
      })
      .catch((err) => setError('Không truy cập được camera: ' + err.message));
    return () => streamRef.current?.getTracks().forEach((t) => t.stop());
  }, []);

  useEffect(() => {
    if (!captured && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
    }
  }, [captured]);

  const handleSnap = () => {
    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    canvas.toBlob((blob) => setCaptured(blob), 'image/jpeg', 0.85);
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'var(--surface-overlay)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60 }} onClick={onClose}>
      <div style={{ background: 'var(--surface-card)', borderRadius: 'var(--radius-lg)', padding: 16, display: 'flex', flexDirection: 'column', gap: 10, width: 360 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ font: 'var(--text-title)', color: 'var(--text-primary)' }}>Chụp ảnh</div>
        {error && <div style={{ font: 'var(--text-body-sm)', color: 'var(--status-danger)' }}>{error}</div>}
        {!captured ? (
          <video ref={videoRef} autoPlay playsInline muted style={{ width: '100%', borderRadius: 'var(--radius-md)', background: '#000', aspectRatio: '4/3', objectFit: 'cover' }} />
        ) : (
          <img src={URL.createObjectURL(captured)} alt="Ảnh đã chụp" style={{ width: '100%', borderRadius: 'var(--radius-md)' }} />
        )}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <Button variant="secondary" size="sm" onClick={onClose}>Hủy</Button>
          {!captured ? (
            <Button variant="primary" size="sm" onClick={handleSnap} disabled={!!error}>Chụp</Button>
          ) : (
            <React.Fragment>
              <Button variant="secondary" size="sm" onClick={() => setCaptured(null)}>Chụp lại</Button>
              <Button variant="primary" size="sm" onClick={() => onCapture(captured)}>Dùng ảnh này</Button>
            </React.Fragment>
          )}
        </div>
      </div>
    </div>
  );
}
