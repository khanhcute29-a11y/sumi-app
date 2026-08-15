import React, { useEffect, useState, useRef } from 'react';
import { fetchOrderNotes, addOrderNote, uploadPhoto, uploadFile } from '../lib/queries';
import { toWebSafeImage } from '../lib/imageConvert';
import { Input } from './forms/Input';
import { Button } from './forms/Button';
import { useAuth } from '../lib/AuthContext';
import { VoiceMicButton } from './VoiceMicButton';
import { IconChat, IconCamera, IconImage, IconBell, IconPaperclip, IconDownload } from './icons/FrogIcons';

const NOTE_ROLE_LABELS = { owner: 'Chủ', cashier: 'Thu ngân', kitchen: 'Bếp', shipper: 'Ship', admin: 'Admin', bakery: 'Bếp', sale: 'Bán hàng', accountant: 'Kế toán', warehouse: 'Kho' };

// Play notification sound when new comments arrive
function playNotificationSound() {
  // Create a simple beep using Web Audio API
  const audioContext = new (window.AudioContext || window.webkitAudioContext)();
  const oscillator = audioContext.createOscillator();
  const gainNode = audioContext.createGain();

  oscillator.connect(gainNode);
  gainNode.connect(audioContext.destination);

  oscillator.frequency.value = 800;
  oscillator.type = 'sine';
  gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
  gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);

  oscillator.start(audioContext.currentTime);
  oscillator.stop(audioContext.currentTime + 0.3);
}

export function CommentSection({ order, profile }) {
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState('');
  const [photos, setPhotos] = useState([]);
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);
  const lastCommentCountRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    fetchOrderNotes(order.id)
      .then((data) => {
        if (!cancelled) {
          setComments(data);
          lastCommentCountRef.current = data.length;
        }
      })
      .catch((err) => { if (!cancelled) setError(err.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [order.id]);

  const handlePhotoSelect = async (files) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    setError('');
    try {
      const newAttachments = await Promise.all(Array.from(files).map(async (file, i) => {
        if (file.type.startsWith('image/')) {
          const safeFile = await toWebSafeImage(file);
          const url = await uploadPhoto(safeFile, `comment_${Date.now()}_${i}`);
          return { url, name: safeFile.name || file.name, type: safeFile.type };
        }
        return uploadFile(file, `comment_${Date.now()}_${i}`);
      }));
      setPhotos([...photos, ...newAttachments]);
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  };

  const handleSend = async () => {
    const message = draft.trim();
    if (!message && photos.length === 0) return;
    setSending(true);
    setError('');
    try {
      const fullMessage = photos.length > 0
        ? `${message}\n[FILES: ${photos.map(p => `${p.name}|${p.type}|${p.url}`).join(', ')}]`
        : message;

      await addOrderNote({
        orderId: order.id, orderCode: order.order_code, authorId: profile?.id,
        authorName: profile?.full_name, authorRole: profile?.role, message: fullMessage,
      });

      // Simulate 3-4s delay before showing comment (real-time sync would show it)
      setTimeout(() => {
        setComments((prev) => [...prev, {
          id: `local-${Date.now()}`, author_name: profile?.full_name, author_role: profile?.role,
          message: fullMessage, created_at: new Date().toISOString(),
        }]);
        playNotificationSound();
        lastCommentCountRef.current += 1;
      }, 3000 + Math.random() * 1000);

      setDraft('');
      setPhotos([]);
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ font: 'var(--text-label)', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}><IconChat size={16} /> Bình Luận</div>
      {loading ? (
        <div style={{ font: 'var(--text-caption)', color: 'var(--text-muted)' }}>Đang tải...</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 200, overflowY: 'auto' }}>
          {comments.length === 0 && <div style={{ font: 'var(--text-caption)', color: 'var(--text-muted)' }}>Chưa có bình luận nào.</div>}
          {comments.map((c) => (
            <div key={c.id} style={{ background: 'var(--surface-sunken)', borderRadius: 'var(--radius-sm)', padding: '8px 10px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, font: 'var(--text-caption)', color: 'var(--text-muted)', marginBottom: 4 }}>
                <span><b style={{ color: 'var(--text-primary)' }}>{c.author_name || 'Không rõ'}</b> {NOTE_ROLE_LABELS[c.author_role] ? `· ${NOTE_ROLE_LABELS[c.author_role]}` : ''}</span>
                <span>{new Date(c.created_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' })}</span>
              </div>
              <div style={{ font: 'var(--text-body-sm)', color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                {c.message.split('[PHOTOS:')[0].split('[FILES:')[0]}
              </div>
              {c.message.includes('[PHOTOS:') && (
                <div style={{ marginTop: 6, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {c.message.match(/!\[image\]\(([^)]+)\)/g)?.map((match, i) => {
                    const url = match.match(/\((.*?)\)/)[1];
                    return (
                      <img
                        key={i}
                        src={url}
                        alt={`comment-${i}`}
                        style={{ maxWidth: 100, maxHeight: 100, borderRadius: 'var(--radius-sm)', cursor: 'pointer' }}
                        onClick={() => window.open(url, '_blank')}
                      />
                    );
                  })}
                </div>
              )}
              {c.message.includes('[FILES:') && (
                <div style={{ marginTop: 6, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {c.message.match(/\[FILES: (.+)\]/)?.[1].split(', ').map((entry, i) => {
                    const [name, type, url] = entry.split('|');
                    if (type?.startsWith('image/')) {
                      return (
                        <img
                          key={i}
                          src={url}
                          alt={name}
                          style={{ maxWidth: 100, maxHeight: 100, borderRadius: 'var(--radius-sm)', cursor: 'pointer' }}
                          onClick={() => window.open(url, '_blank')}
                        />
                      );
                    }
                    return (
                      <a
                        key={i}
                        href={url}
                        target="_blank"
                        rel="noreferrer"
                        style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 8px', borderRadius: 'var(--radius-sm)', background: 'var(--surface-sunken)', font: 'var(--text-caption)', color: 'var(--text-primary)', textDecoration: 'none' }}
                      >
                        <IconDownload size={14} /> {name}
                      </a>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {error && <div style={{ font: 'var(--text-caption)', color: 'var(--status-danger)' }}>{error}</div>}

      {/* Photo upload buttons */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <button
          onClick={() => cameraInputRef.current?.click()}
          disabled={uploading || sending}
          style={{
            flexShrink: 0, padding: '8px 10px', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)',
            background: 'var(--surface-sunken)', cursor: uploading ? 'not-allowed' : 'pointer',
            font: 'var(--text-body-sm)', color: 'var(--text-primary)', opacity: uploading ? 0.6 : 1,
          }}
        >
          <IconCamera size={16} />
        </button>
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading || sending}
          style={{
            flexShrink: 0, padding: '8px 10px', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)',
            background: 'var(--surface-sunken)', cursor: uploading ? 'not-allowed' : 'pointer',
            font: 'var(--text-body-sm)', color: 'var(--text-primary)', opacity: uploading ? 0.6 : 1,
          }}
        >
          <IconImage size={16} />
        </button>
        <Input placeholder="Viết bình luận cho đơn này..." value={draft} onChange={(e) => setDraft(e.target.value)} style={{ flex: '1 1 160px', minWidth: 0 }} />
        <VoiceMicButton onTranscript={(t) => setDraft(draft ? `${draft} ${t}` : t)} />
        <Button variant="primary" size="sm" onClick={handleSend} disabled={sending || uploading || (!draft.trim() && photos.length === 0)}>
          {uploading ? 'Tải...' : sending ? '...' : 'Gửi'}
        </Button>
      </div>

      {photos.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {photos.map((p, i) => (
            <div key={i} style={{ position: 'relative', width: 60, height: 60, borderRadius: 'var(--radius-sm)', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--surface-sunken)' }}>
              {p.type?.startsWith('image/') ? (
                <img src={p.url} alt={p.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, padding: 4 }}>
                  <IconPaperclip size={16} />
                  <span style={{ font: 'var(--text-caption)', color: 'var(--text-muted)', fontSize: 9, textAlign: 'center', wordBreak: 'break-all' }}>{p.name}</span>
                </div>
              )}
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

      <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" onChange={(e) => handlePhotoSelect(e.target.files)} style={{ display: 'none' }} />
      <input ref={fileInputRef} type="file" accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx" multiple onChange={(e) => handlePhotoSelect(e.target.files)} style={{ display: 'none' }} />

      <div style={{ font: 'var(--text-caption)', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}><IconBell size={14} /> Có delay 3-4 giây và tiếng chuông thông báo cho mọi bình luận mới.</div>
    </div>
  );
}
