import React, { useEffect, useState, useRef } from 'react';
import { fetchOrderNotes, addOrderNote, deleteOrderNote, uploadPhoto, uploadFile } from '../lib/queries';
import { supabase } from '../lib/supabaseClient';
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
  const [noteType, setNoteType] = useState('normal');
  const [photos, setPhotos] = useState([]);
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);
  const lastCommentCountRef = useRef(0);

  const loadComments = async () => {
    const data = await fetchOrderNotes(order.id);
    setComments(data);
    lastCommentCountRef.current = data.length;
  };

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
    const channel = supabase.channel(`order-comments-${order.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_notes', filter: `order_id=eq.${order.id}` }, () => {
        if (!cancelled) loadComments().catch(() => {});
      }).subscribe();
    return () => { cancelled = true; supabase.removeChannel(channel); };
  }, [order.id]);

  const handlePhotoSelect = async (files) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    setError('');
    try {
      const results = await Promise.allSettled(Array.from(files).map(async (file, i) => {
        if (file.type.startsWith('image/') || /\.(heic|heif|jpe?g|png|webp|gif)$/i.test(file.name || '')) {
          const safeFile = await toWebSafeImage(file);
          const url = await uploadPhoto(safeFile, `comment_${Date.now()}_${i}`);
          return { url, name: safeFile.name || file.name, type: safeFile.type || 'image/jpeg' };
        }
        return uploadFile(file, `comment_${Date.now()}_${i}`);
      }));
      const newAttachments = results.filter((r) => r.status === 'fulfilled').map((r) => r.value);
      const failures = results.filter((r) => r.status === 'rejected');
      if (newAttachments.length > 0) setPhotos((prev) => [...prev, ...newAttachments]);
      if (failures.length > 0) setError(failures.map((r) => r.reason?.message || 'Lỗi tải file').join('; '));
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
      const attachments = photos.length > 0 ? photos : null;

      const saved = await addOrderNote({
        orderId: order.id, orderCode: order.order_code, authorId: profile?.id,
        authorName: profile?.full_name, authorRole: profile?.role, message, attachments, noteType,
      });
      setComments((prev) => prev.some((x) => x.id === saved?.id) ? prev : [...prev, saved]);
      playNotificationSound();
      setDraft('');
      setPhotos([]);
      setNoteType('normal');
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  };

  const handleDelete = async (comment) => {
    if (!window.confirm('Xóa bình luận này? Nội dung sẽ được ẩn nhưng lịch sử vẫn được lưu.')) return;
    setError('');
    try {
      const deleted = await deleteOrderNote(comment.id);
      setComments((prev) => prev.map((item) => item.id === comment.id ? deleted : item));
    } catch (err) { setError(err.message); }
  };

  // Historical comments (sent before the `attachments` column existed) embedded
  // attachments as text markers in `message` — parse those for backward compat.
  function legacyAttachmentsFromMessage(message) {
    const legacy = [];
    if (message.includes('[PHOTOS:')) {
      message.match(/!\[image\]\(([^)]+)\)/g)?.forEach((match) => {
        const url = match.match(/\((.*?)\)/)[1];
        legacy.push({ url, name: 'ảnh', type: 'image/jpeg' });
      });
    }
    if (message.includes('[FILES:')) {
      message.match(/\[FILES: (.+)\]/)?.[1].split(', ').forEach((entry) => {
        const [name, type, url] = entry.split('|');
        legacy.push({ url, name, type });
      });
    }
    return legacy;
  }

  return (
    <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ font: 'var(--text-label)', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}><IconChat size={18} /> Trao đổi trong đơn</div>
      {loading ? (
        <div style={{ font: 'var(--text-caption)', color: 'var(--text-muted)' }}>Đang tải...</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 200, overflowY: 'auto' }}>
          {comments.length === 0 && <div style={{ font: 'var(--text-caption)', color: 'var(--text-muted)' }}>Chưa có bình luận nào.</div>}
          {comments.map((c) => (
            <div key={c.id} style={{ background: c.note_type === 'urgent' ? '#fff1f0' : c.note_type === 'customer_update' ? '#fff8df' : 'var(--surface-sunken)', border: c.note_type === 'urgent' ? '1px solid #f3aaa4' : '1px solid transparent', borderRadius: 14, padding: '10px 12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, font: 'var(--text-caption)', color: 'var(--text-muted)', marginBottom: 4 }}>
                <span><b style={{ color: 'var(--text-primary)' }}>{c.author_name || 'Không rõ'}</b> {NOTE_ROLE_LABELS[c.author_role] ? `· ${NOTE_ROLE_LABELS[c.author_role]}` : ''}{c.note_type === 'urgent' ? ' · 🔴 Gấp' : c.note_type === 'customer_update' ? ' · 🟠 Khách cập nhật' : ''}</span>
                <span>{new Date(c.created_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' })}</span>
              </div>
              <div style={{ font: 'var(--text-body-sm)', color: c.deleted_at ? 'var(--text-muted)' : 'var(--text-secondary)', fontStyle: c.deleted_at ? 'italic' : 'normal', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                {c.deleted_at ? 'Bình luận đã được xóa' : c.message.split('[PHOTOS:')[0].split('[FILES:')[0]}
              </div>
              {!c.deleted_at && (() => {
                const attachments = (c.attachments && c.attachments.length > 0)
                  ? c.attachments
                  : legacyAttachmentsFromMessage(c.message);
                if (attachments.length === 0) return null;
                return (
                  <div style={{ marginTop: 6, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {attachments.map((p, i) => {
                      const safeUrl = /^https?:\/\//i.test(p.url || '');
                      if (p.type?.startsWith('image/') && safeUrl) {
                        return (
                          <img
                            key={i}
                            src={p.url}
                            alt={p.name}
                            style={{ maxWidth: 100, maxHeight: 100, borderRadius: 'var(--radius-sm)', cursor: 'pointer' }}
                            onClick={() => window.open(p.url, '_blank')}
                          />
                        );
                      }
                      if (!safeUrl) {
                        return (
                          <span
                            key={i}
                            style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 8px', borderRadius: 'var(--radius-sm)', background: 'var(--surface-sunken)', font: 'var(--text-caption)', color: 'var(--text-muted)' }}
                          >
                            <IconDownload size={14} /> {p.name}
                          </span>
                        );
                      }
                      return (
                        <a
                          key={i}
                          href={p.url}
                          target="_blank"
                          rel="noreferrer"
                          style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 8px', borderRadius: 'var(--radius-sm)', background: 'var(--surface-sunken)', font: 'var(--text-caption)', color: 'var(--text-primary)', textDecoration: 'none' }}
                        >
                          <IconDownload size={14} /> {p.name}
                        </a>
                      );
                    })}
                  </div>
                );
              })()}
              {!c.deleted_at && (c.author_id === profile?.id || ['owner','admin'].includes(profile?.role) || (profile?.extra_roles || []).some((r) => ['owner','admin'].includes(r))) && <button onClick={() => handleDelete(c)} style={{marginTop:6,border:0,background:'none',padding:'5px 0',color:'#a33b32',fontWeight:700}}>Xóa</button>}
            </div>
          ))}
        </div>
      )}

      {error && <div style={{ font: 'var(--text-caption)', color: 'var(--status-danger)' }}>{error}</div>}

      <div className="comment-kind-picker" role="group" aria-label="Loại trao đổi">
        {[['normal','Trao đổi'],['customer_update','Khách cập nhật'],['urgent','Gấp']].map(([key,label]) => <button key={key} className={noteType === key ? 'active' : ''} onClick={() => setNoteType(key)}>{label}</button>)}
      </div>

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
        <VoiceMicButton onTranscript={(t) => setDraft((prev) => (prev ? `${prev} ${t}` : t))} />
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

      <div style={{ font: 'var(--text-caption)', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}><IconBell size={14} /> Người tạo đơn và các bếp liên quan sẽ nhận chuông báo.</div>
    </div>
  );
}
