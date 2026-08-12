import React, { useState } from 'react';
import { uploadPhoto } from '../lib/queries';
import { toWebSafeImage } from '../lib/imageConvert';

export function PhotoField({ url, onChange, label = 'Ảnh (nếu có)', prefix = 'misc' }) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const inputId = React.useId();

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploading(true);
    setError('');
    try {
      const safeFile = await toWebSafeImage(file);
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
        <label htmlFor={inputId} style={{ cursor: 'pointer' }}>
          <input id={inputId} type="file" accept="image/*" onChange={handleFile} style={{ display: 'none' }} disabled={uploading} />
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)', font: 'var(--text-caption)', color: 'var(--text-secondary)' }}>
            📎 {uploading ? 'Đang tải...' : url ? 'Đổi ảnh' : 'Thêm ảnh'}
          </span>
        </label>
      </div>
      {error && <div style={{ font: 'var(--text-caption)', color: 'var(--status-danger)' }}>{error}</div>}
    </div>
  );
}
