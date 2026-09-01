import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import './chat-screen.css';
import {
  fetchAllConversations,
  fetchChatDirectory,
  getOrCreateDmRoom,
  fetchRoomMessages,
  sendChatMessage,
  notifyChatMentions,
  subscribeToRoomMessages,
  markRoomRead,
  extractOrderCode,
} from '../../lib/chat';
import { uploadFile } from '../../lib/queries';
import { toWebSafeImage } from '../../lib/imageConvert';
import { IconChat, IconCamera, IconTag, IconUser } from '../icons/FrogIcons';

// Trang Chat kiểu Zalo, gắn vào thanh điều hướng (tab riêng, khác với cửa sổ
// chat nổi ChatWindowModal/ChatLauncher vẫn giữ nguyên song song). Desktop: 2
// cột (danh sách trái, luồng tin phải) luôn hiện cùng lúc. Mobile: 1 cột,
// bấm vào hội thoại mới chuyển sang xem luồng tin, có nút quay lại.
const DESKTOP_BREAKPOINT = 860;

function formatListTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  return d.toDateString() === now.toDateString()
    ? d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
}

function renderFormattedMessage(text) {
  if (!text) return null;
  const parts = text.split(/(@\S+|#[A-Z]+-[A-Z0-9-]+)/g);
  return parts.map((part, i) => {
    if (part.startsWith('@')) return <span key={i} className="cs-mention-tag">{part}</span>;
    if (part.startsWith('#')) return <span key={i} style={{ color: '#0284C7', fontWeight: 700 }}>{part}</span>;
    return part;
  });
}

export default function ChatScreen({ profile }) {
  const [isDesktop, setIsDesktop] = useState(() => window.innerWidth >= DESKTOP_BREAKPOINT);
  useEffect(() => {
    const onResize = () => setIsDesktop(window.innerWidth >= DESKTOP_BREAKPOINT);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const [conversations, setConversations] = useState([]);
  const [directory, setDirectory] = useState([]);
  const [loadingList, setLoadingList] = useState(true);
  const [error, setError] = useState('');
  const [showNewChat, setShowNewChat] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);

  const [activeRoomId, setActiveRoomId] = useState(null);
  const [activeConvo, setActiveConvo] = useState(null); // metadata hiển thị header (title/avatar) — không phải lúc nào cũng có sẵn trong `conversations` (vd DM vừa tạo lần đầu)
  const [messages, setMessages] = useState([]);
  const [loadingMessages, setLoadingMessages] = useState(false);

  const [inputText, setInputText] = useState('');
  const [pendingPhoto, setPendingPhoto] = useState(null);
  const [sending, setSending] = useState(false);
  const [showMentionPopup, setShowMentionPopup] = useState(false);
  const [mentionFilter, setMentionFilter] = useState('');
  const [selectedMentionIds, setSelectedMentionIds] = useState([]);
  const [pendingMentionIds, setPendingMentionIds] = useState([]);

  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const photoInputRef = useRef(null);
  const scrollToBottom = () => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });

  useEffect(() => {
    if (!profile?.id) return;
    let cancelled = false;
    setLoadingList(true);
    Promise.all([fetchAllConversations(profile.id), fetchChatDirectory()])
      .then(([convos, dir]) => {
        if (cancelled) return;
        setConversations(convos);
        setDirectory(dir.filter((u) => u.id !== profile.id));
      })
      .catch((e) => setError(e.message))
      .finally(() => { if (!cancelled) setLoadingList(false); });
    return () => { cancelled = true; };
  }, [profile?.id, refreshTick]);

  useEffect(() => {
    if (!activeRoomId) return;
    let cancelled = false;
    setLoadingMessages(true);
    setMessages([]);
    fetchRoomMessages(activeRoomId)
      .then((data) => { if (!cancelled) setMessages(data); })
      .catch((e) => setError(e.message))
      .finally(() => { if (!cancelled) setLoadingMessages(false); });

    if (profile?.id) {
      markRoomRead(activeRoomId, profile.id).then(() => window.dispatchEvent(new CustomEvent('sumi-badges-changed'))).catch(() => {});
    }

    const unsubscribe = subscribeToRoomMessages(activeRoomId, (msg) => {
      setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
      if (msg.sender_id !== profile?.id && profile?.id) {
        markRoomRead(activeRoomId, profile.id).then(() => window.dispatchEvent(new CustomEvent('sumi-badges-changed'))).catch(() => {});
      }
    });
    return () => { cancelled = true; unsubscribe(); };
  }, [activeRoomId]);

  useEffect(() => { scrollToBottom(); }, [messages]);

  const openConversation = (convo) => {
    setActiveConvo(convo);
    setActiveRoomId(convo.roomId);
  };

  const startDirectChat = async (user) => {
    setShowNewChat(false);
    try {
      const roomId = await getOrCreateDmRoom(user.id);
      setActiveConvo({
        roomId, roomType: 'direct', peerId: user.id,
        title: user.full_name, subtitle: user.role || '', avatarEmoji: '👤',
      });
      setActiveRoomId(roomId);
      setRefreshTick((t) => t + 1);
    } catch (e) {
      setError(e.message);
    }
  };

  const nameFor = (senderId) => {
    if (senderId === profile?.id) return profile?.full_name || 'Tôi';
    return directory.find((u) => u.id === senderId)?.full_name
      || conversations.find((c) => c.peerId === senderId)?.title
      || 'Nhân viên';
  };

  const handleInputChange = (e) => {
    const val = e.target.value;
    setInputText(val);
    const lastAtPos = val.lastIndexOf('@');
    if (lastAtPos !== -1 && lastAtPos === val.length - 1) {
      setShowMentionPopup(true);
      setMentionFilter('');
    } else if (lastAtPos !== -1 && lastAtPos < val.length - 1) {
      const query = val.slice(lastAtPos + 1).toLowerCase();
      if (!query.includes(' ')) { setShowMentionPopup(true); setMentionFilter(query); }
      else { setShowMentionPopup(false); setSelectedMentionIds([]); }
    } else {
      setShowMentionPopup(false);
      setSelectedMentionIds([]);
    }
  };

  const toggleMentionSelect = (user) => {
    setSelectedMentionIds((prev) => (prev.includes(user.id) ? prev.filter((id) => id !== user.id) : [...prev, user.id]));
  };

  const filteredMentionUsers = useMemo(() => (
    directory.filter((u) => (u.full_name || '').toLowerCase().includes(mentionFilter) || (u.role || '').toLowerCase().includes(mentionFilter))
  ), [directory, mentionFilter]);

  const selectAllMentions = () => {
    const ids = filteredMentionUsers.map((u) => u.id);
    setSelectedMentionIds((prev) => (ids.every((id) => prev.includes(id)) ? prev.filter((id) => !ids.includes(id)) : [...new Set([...prev, ...ids])]));
  };

  const confirmMentionSelection = () => {
    if (!selectedMentionIds.length) { setShowMentionPopup(false); return; }
    const lastAtPos = inputText.lastIndexOf('@');
    const prefix = lastAtPos !== -1 ? inputText.slice(0, lastAtPos) : inputText;
    const tags = selectedMentionIds.map((id) => directory.find((u) => u.id === id)).filter(Boolean)
      .map((u) => `@${(u.full_name || '').replace(/\s+/g, '')}`).join(' ');
    setInputText(`${prefix}${tags} `);
    setPendingMentionIds((prev) => [...new Set([...prev, ...selectedMentionIds])]);
    setSelectedMentionIds([]);
    setShowMentionPopup(false);
    inputRef.current?.focus();
  };

  const handlePickPhoto = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    try {
      const safe = await toWebSafeImage(f);
      setPendingPhoto(safe);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleSendMessage = async () => {
    const text = inputText.trim();
    if (!text && !pendingPhoto) return;
    if (!activeRoomId || !profile?.id) return;
    setSending(true);
    setError('');
    const tempId = `temp-${Date.now()}`;
    const roomIdAtSend = activeRoomId;
    const mentionIdsAtSend = pendingMentionIds;
    let attachmentUrl = null;
    try {
      if (pendingPhoto) attachmentUrl = (await uploadFile(pendingPhoto, `chat-attachments/${profile.id}`)).url;
      const optimisticMsg = {
        id: tempId, room_id: roomIdAtSend, sender_id: profile.id,
        content: text || null, attachment_url: attachmentUrl, order_code: extractOrderCode(text),
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, optimisticMsg]);
      setInputText('');
      setPendingPhoto(null);
      setShowMentionPopup(false);
      setSelectedMentionIds([]);
      setPendingMentionIds([]);

      const saved = await sendChatMessage({
        roomId: roomIdAtSend, senderId: profile.id, content: text || null, attachmentUrl, orderCode: extractOrderCode(text),
      });
      setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...saved } : m)));
      setRefreshTick((t) => t + 1);
      if (mentionIdsAtSend.length) {
        notifyChatMentions({ roomId: roomIdAtSend, messageId: saved.id, mentionedProfileIds: mentionIdsAtSend, preview: text }).catch(() => {});
      }
    } catch (e) {
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      setInputText(text);
      setError(e.message);
    } finally {
      setSending(false);
    }
  };

  const backToList = useCallback(() => {
    setActiveRoomId(null);
    setActiveConvo(null);
  }, []);

  const showThread = isDesktop || !!activeRoomId;
  const showList = isDesktop || !activeRoomId;

  return (
    <div className="sumi-chat-page">
      {showList && (
        <div className="cs-list-pane">
          <div className="cs-list-header">
            <h3><IconChat size={20} /> Tin Nhắn</h3>
            <button className="cs-new-chat-btn" onClick={() => setShowNewChat(true)} title="Nhắn tin mới">✎</button>
          </div>
          <div className="cs-list-scroll">
            {loadingList && <div className="cs-list-empty">Đang tải...</div>}
            {!loadingList && conversations.length === 0 && (
              <div className="cs-list-empty">Chưa có hội thoại nào — bấm ✎ để bắt đầu chat với đồng nghiệp.</div>
            )}
            {!loadingList && conversations.map((c) => (
              <button key={c.roomId} className={`cs-convo-item ${activeRoomId === c.roomId ? 'active' : ''}`} onClick={() => openConversation(c)}>
                <div className="cs-convo-avatar">{c.avatarEmoji}</div>
                <div className="cs-convo-info">
                  <div className="cs-convo-row-top">
                    <strong>{c.title}</strong>
                    {c.lastAt && <span className="cs-convo-time">{formatListTime(c.lastAt)}</span>}
                  </div>
                  <div className="cs-convo-preview">{c.lastMessage || c.subtitle || 'Bấm để xem hội thoại'}</div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {showThread && (
        <div className="cs-thread-pane">
          {!activeRoomId ? (
            <div className="cs-thread-placeholder">Chọn một hội thoại để bắt đầu</div>
          ) : (
            <>
              <div className="cs-thread-header">
                {!isDesktop && <button className="cs-back-btn" onClick={backToList}>←</button>}
                <div className="cs-convo-avatar">{activeConvo?.avatarEmoji || '💬'}</div>
                <div className="cs-thread-title">
                  <h4>{activeConvo?.title || 'Hội thoại'}</h4>
                  <p>{activeConvo?.subtitle || ''}</p>
                </div>
              </div>

              <div className="cs-thread-feed">
                {loadingMessages && <div className="cs-list-empty">Đang tải tin nhắn...</div>}
                {!loadingMessages && messages.length === 0 && <div className="cs-list-empty">Chưa có tin nhắn nào — gửi lời chào đầu tiên nhé!</div>}
                {messages.map((msg) => {
                  const isMe = msg.sender_id === profile?.id;
                  const senderName = msg.profiles?.full_name || nameFor(msg.sender_id);
                  return (
                    <div key={msg.id} className={`cs-msg-row ${isMe ? 'me' : ''}`}>
                      {!isMe && <div className="cs-msg-avatar"><IconUser size={16} /></div>}
                      <div className="cs-msg-body">
                        {!isMe && <span className="cs-sender-label">{senderName}</span>}
                        <div className="cs-msg-bubble">
                          {renderFormattedMessage(msg.content)}
                          {msg.order_code && <div><span className="cs-order-chip">📦 Mã đơn: #{msg.order_code}</span></div>}
                          {msg.attachment_url && <img src={msg.attachment_url} alt="Đính kèm" className="cs-msg-img" onClick={() => window.open(msg.attachment_url, '_blank')} />}
                        </div>
                        <span className="cs-msg-timestamp">{new Date(msg.created_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>

              <div className="cs-input-bar">
                {showMentionPopup && (
                  <div className="cs-mention-menu">
                    <div className="cs-mention-menu-head">
                      <span>👥 Chọn 1 hoặc nhiều người để tag:</span>
                      {filteredMentionUsers.length > 0 && <button type="button" onClick={selectAllMentions}>Chọn tất cả</button>}
                    </div>
                    {filteredMentionUsers.map((u) => {
                      const checked = selectedMentionIds.includes(u.id);
                      return (
                        <div key={u.id} className={`cs-mention-item ${checked ? 'checked' : ''}`} onClick={() => toggleMentionSelect(u)}>
                          <div className="cs-mention-avatar">{checked ? '✓' : '👤'}</div>
                          <div className="cs-mention-info"><strong>{u.full_name}</strong><span>{u.role}</span></div>
                        </div>
                      );
                    })}
                    {filteredMentionUsers.length === 0 && <div className="cs-list-empty">Không tìm thấy</div>}
                    <button type="button" className="cs-mention-confirm" onClick={confirmMentionSelection} disabled={!selectedMentionIds.length}>
                      ✓ Xong{selectedMentionIds.length ? ` (${selectedMentionIds.length} người)` : ''}
                    </button>
                  </div>
                )}

                {pendingPhoto && (
                  <div className="cs-pending-photo">
                    <img src={URL.createObjectURL(pendingPhoto)} alt="preview" />
                    <span>Ảnh sẽ gửi kèm tin nhắn</span>
                    <button type="button" onClick={() => setPendingPhoto(null)}>✕</button>
                  </div>
                )}

                <form className="cs-input-form" onSubmit={(e) => { e.preventDefault(); handleSendMessage(); }}>
                  <textarea
                    ref={inputRef} rows={1} placeholder="Gõ tin nhắn (@ để tag tên)..."
                    value={inputText} onChange={handleInputChange}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendMessage(); } }}
                    disabled={sending || !activeRoomId}
                  />
                  <button type="submit" title="Gửi" disabled={sending || !activeRoomId}>➤</button>
                </form>

                <div className="cs-tool-chips">
                  <input ref={photoInputRef} type="file" accept="image/*" hidden onChange={handlePickPhoto} />
                  <button type="button" onClick={() => photoInputRef.current?.click()}><IconCamera size={16} /> Gửi ảnh</button>
                  <button type="button" onClick={() => { setInputText((p) => `${p}@`); setShowMentionPopup(true); setMentionFilter(''); setSelectedMentionIds([]); inputRef.current?.focus(); }}><IconTag size={16} /> Tag người</button>
                  <button type="button" onClick={() => setInputText((p) => `${p}👍`)}>👍 Like</button>
                </div>

                {error && <div className="cs-error">⚠️ {error}</div>}
              </div>
            </>
          )}
        </div>
      )}

      {showNewChat && (
        <div className="cs-new-chat-overlay" onClick={() => setShowNewChat(false)}>
          <div className="cs-new-chat-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="cs-new-chat-head">
              <strong>Nhắn tin mới</strong>
              <button onClick={() => setShowNewChat(false)}>✕</button>
            </div>
            <div className="cs-new-chat-list">
              {directory.map((u) => (
                <button key={u.id} className="cs-new-chat-item" onClick={() => startDirectChat(u)}>
                  <div className="cs-convo-avatar">👤</div>
                  <div><strong>{u.full_name}</strong><span>{u.role}</span></div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
