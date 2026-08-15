import React, { useState, useRef } from 'react';
import { Button } from './forms/Button';
import { Input } from './forms/Input';
import { addIncidentReport, uploadPhoto } from '../lib/queries';
import { toWebSafeImage } from '../lib/imageConvert';
import { useAuth } from '../lib/AuthContext';
import { VoiceMicButton } from './VoiceMicButton';
import { IconWarning, IconCamera, IconImage } from './icons/FrogIcons';

const TAXONOMY = [
  { key: 'log', label: 'VẬN CHUYỂN (LOG)', items: [
    { code: 'LOG-01', label: 'Giao trễ' },
    { code: 'LOG-02', label: 'Hàng bị hư' },
    { code: 'LOG-03', label: 'Xé tuyến' },
    { code: 'LOG-04', label: 'Tài xế sự cố' },
    { code: 'LOG-05', label: 'Hoàn hàng' },
    { code: 'LOG-06', label: 'GPS sai' },
  ] },
  { key: 'kit', label: 'BẾP (KIT)', items: [
    { code: 'KIT-01', label: 'Cháy lò / Hỏng' },
    { code: 'KIT-02', label: 'Nướng bù gấp' },
    { code: 'KIT-03', label: 'Hết nhân' },
    { code: 'KIT-04', label: 'Thiết bị hỏng' },
    { code: 'KIT-05', label: 'Kiểm dịch' },
  ] },
  { key: 'inv', label: 'KHO (INV)', items: [
    { code: 'INV-01', label: 'Chênh lệch kho' },
    { code: 'INV-02', label: 'Nhập sai' },
    { code: 'INV-03', label: 'Hàng hết hạn' },
    { code: 'INV-04', label: 'Thất thoát' },
    { code: 'INV-05', label: 'Giao thiếu' },
  ] },
];

export function IncidentReportModal({ orderId, orderCode, onClose, onSent }) {
  const { profile } = useAuth();
  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);
  const [selected, setSelected] = useState(null);
  const [note, setNote] = useState('');
  const [photos, setPhotos] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  const handlePhotoSelect = async (files) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    setError('');
    try {
      const newPhotos = await Promise.all(Array.from(files).map(async (file, i) => {
        const safeFile = await toWebSafeImage(file);
        return uploadPhoto(safeFile, `incident_${Date.now()}_${i}`);
      }));
      setPhotos([...photos, ...newPhotos]);
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  };

  const handleSend = async () => {
    if (!selected) { setError('Chọn 1 loại sự cố.'); return; }
    setSending(true);
    setError('');
    try {
      await addIncidentReport({
        orderId, orderCode, category: selected.category, code: selected.code, label: selected.label, note,
        photos: photos.length > 0 ? photos : null,
        reporterId: profile?.id, reporterName: profile?.full_name, reporterRole: profile?.role,
      });
      onSent?.();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'var(--surface-overlay)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 70, padding: 16 }} onClick={onClose}>
      <div style={{ background: 'var(--surface-card)', borderRadius: 'var(--radius-lg)', width: 420, maxWidth: '100%', maxHeight: '86vh', overflowY: 'auto', boxShadow: 'var(--shadow-lg)' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ padding: '16px 20px', background: 'var(--status-danger)', color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderRadius: 'var(--radius-lg) var(--radius-lg) 0 0' }}>
          <div style={{ font: 'var(--text-title)', display: 'flex', alignItems: 'center', gap: 6 }}><IconWarning size={18} /> Báo Sự Cố 1-Chạm</div>
          <button onClick={onClose} style={{ border: 'none', background: 'none', color: '#fff', fontSize: 18, cursor: 'pointer' }}>✕</button>
        </div>
        {orderCode && <div style={{ padding: '8px 20px 0', font: 'var(--text-caption)', color: 'var(--text-muted)' }}>Đơn: {orderCode}</div>}
        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {TAXONOMY.map((group) => (
            <div key={group.key} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ font: 'var(--text-caption)', fontWeight: 'bold', color: 'var(--text-muted)' }}>{group.label}</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {group.items.map((it) => {
                  const isSelected = selected?.code === it.code;
                  return (
                    <button key={it.code} onClick={() => setSelected({ category: group.key, ...it })} style={{
                      textAlign: 'left', padding: '8px 10px', borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                      border: isSelected ? '2px solid var(--status-danger)' : '1px solid var(--border-subtle)',
                      background: isSelected ? 'var(--status-danger-soft)' : 'var(--surface-sunken)',
                      font: 'var(--text-caption)', color: 'var(--text-primary)',
                    }}>
                      <b>{it.code}</b> {it.label}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
            <Input placeholder="Ghi chú thêm (không bắt buộc)..." value={note} onChange={(e) => setNote(e.target.value)} style={{ flex: '1 1 auto', minWidth: 0 }} />
            <VoiceMicButton onTranscript={(t) => setNote(note ? `${note} ${t}` : t)} />
          </div>

          {/* Photo upload section */}
          <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 12 }}>
            <div style={{ font: 'var(--text-caption)', fontWeight: 'bold', color: 'var(--text-muted)', marginBottom: 8 }}>Chụp ảnh sự cố (tùy chọn)</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => cameraInputRef.current?.click()}
                disabled={uploading || sending}
                style={{
                  flex: 1, padding: '10px 12px', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)',
                  background: 'var(--surface-sunken)', cursor: uploading ? 'not-allowed' : 'pointer',
                  font: 'var(--text-body-sm)', color: 'var(--text-primary)', opacity: uploading ? 0.6 : 1,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                }}
              >
                <IconCamera size={16} /> Camera
              </button>
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading || sending}
                style={{
                  flex: 1, padding: '10px 12px', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)',
                  background: 'var(--surface-sunken)', cursor: uploading ? 'not-allowed' : 'pointer',
                  font: 'var(--text-body-sm)', color: 'var(--text-primary)', opacity: uploading ? 0.6 : 1,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                }}
              >
                <IconImage size={16} /> Chọn ảnh
              </button>
            </div>
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={(e) => handlePhotoSelect(e.target.files)}
              style={{ display: 'none' }}
            />
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={(e) => handlePhotoSelect(e.target.files)}
              style={{ display: 'none' }}
            />
            {photos.length > 0 && (
              <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {photos.map((url, i) => (
                  <div key={i} style={{ position: 'relative', width: 60, height: 60, borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
                    <img src={url} alt={`incident-${i}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    <button
                      onClick={() => setPhotos(photos.filter((_, idx) => idx !== i))}
                      style={{
                        position: 'absolute', top: 2, right: 2, width: 20, height: 20, borderRadius: '50%',
                        background: 'var(--status-danger)', color: '#fff', border: 'none', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', font: '12px',
                      }}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {error && <div style={{ font: 'var(--text-body-sm)', color: 'var(--status-danger)' }}>{error}</div>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <Button variant="secondary" size="sm" onClick={onClose} disabled={sending || uploading}>Huỷ</Button>
            <Button variant="danger" size="sm" onClick={handleSend} disabled={sending || uploading}>
              {uploading ? 'Đang tải ảnh...' : sending ? 'Đang gửi...' : 'Gửi sự cố'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
