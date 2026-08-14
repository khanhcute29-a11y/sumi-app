import React, { useState } from 'react';
import { CameraCapture } from './CameraCapture';
import { uploadPhoto } from '../lib/queries';
import { toWebSafeImage } from '../lib/imageConvert';
import { IconCamera } from './icons/FrogIcons';

export function CameraPhotoField({ url, onChange, label = 'Ảnh (chụp trực tiếp)', prefix = 'misc' }) {
  const [showCamera, setShowCamera] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  const handleCapture = async (blob) => {
    setShowCamera(false);
    setUploading(true);
    setError('');
    try {
      const safeFile = await toWebSafeImage(blob);
      const uploadedUrl = await uploadPhoto(safeFile, prefix);
      onChange(uploadedUrl);
    } catch (err) {
      setError('Không tải ảnh lên được: ' + err.message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ font: 'var(--text-caption)', color: 'var(--text-muted)' }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {url && (
          <div style={{ position: 'relative' }}>
            <img src={url} alt="Ảnh" style={{ width: 56, height: 56, borderRadius: 'var(--radius-sm)', objectFit: 'cover' }} />
            <button type="button" onClick={() => onChange('')}
              style={{ position: 'absolute', top: -6, right: -6, width: 18, height: 18, borderRadius: '50%', border: 'none', background: 'var(--status-danger)', color: '#fff', fontSize: 11, cursor: 'pointer', lineHeight: '18px' }}>✕</button>
          </div>
        )}
        <button type="button" onClick={() => setShowCamera(true)} disabled={uploading}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)', font: 'var(--text-caption)', color: 'var(--text-secondary)', background: 'none', cursor: uploading ? 'default' : 'pointer' }}>
          <IconCamera size={14} /> {uploading ? 'Đang tải...' : url ? 'Chụp lại' : 'Chụp ảnh'}
        </button>
      </div>
      {error && <div style={{ font: 'var(--text-caption)', color: 'var(--status-danger)' }}>{error}</div>}
      {showCamera && <CameraCapture onClose={() => setShowCamera(false)} onCapture={handleCapture} />}
    </div>
  );
}
