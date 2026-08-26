import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  fetchMyChatRooms,
  fetchChatDirectory,
  getOrCreateDmRoom,
  fetchRoomMessages,
  sendChatMessage,
  subscribeToRoomMessages,
  extractOrderCode,
} from '../../../lib/chat';
import { uploadFile } from '../../../lib/queries';

export default function ChatWindowModal({ onClose, profile }) {
  const [navTab, setNavTab] = useState('group'); // 'group' | 'direct'
  const [rooms, setRooms] = useState([]);
  const [directory, setDirectory] = useState([]);
  const [loadingLists, setLoadingLists] = useState(true);
  const [error, setError] = useState('');

  const [currentRoomId, setCurrentRoomId] = useState(null);
  const [currentDirectUserId, setCurrentDirectUserId] = useState(null); // for highlighting the pill while DM room resolves
  const [messages, setMessages] = useState([]);
  const [loadingMessages, setLoadingMessages] = useState(false);

  const [inputText, setInputText] = useState('');
  const [pendingPhoto, setPendingPhoto] = useState(null);
  const [sending, setSending] = useState(false);

  const [showMentionPopup, setShowMentionPopup] = useState(false);
  const [mentionFilter, setMentionFilter] = useState('');

  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const photoInputRef = useRef(null);

  const scrollToBottom = () => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });

  // Danh sách phòng chat nhóm + toàn bộ nhân sự (cho tab Chat riêng + gợi ý @mention)
  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchMyChatRooms(), fetchChatDirectory()])
      .then(([roomList, dirList]) => {
        if (cancelled) return;
        setRooms(roomList);
        setDirectory(dirList.filter((u) => u.id !== profile?.id));
        const firstGroup = roomList.find((r) => r.room_type === 'group');
        if (firstGroup) setCurrentRoomId(firstGroup.id);
      })
      .catch((e) => setError(e.message))
      .finally(() => { if (!cancelled) setLoadingLists(false); });
    return () => { cancelled = true; };
  }, [profile?.id]);

  // Tải tin nhắn + lắng nghe Realtime mỗi khi đổi phòng
  useEffect(() => {
    if (!currentRoomId) return;
    let cancelled = false;
    setLoadingMessages(true);
    fetchRoomMessages(currentRoomId)
      .then((data) => { if (!cancelled) setMessages(data); })
      .catch((e) => setError(e.message))
      .finally(() => { if (!cancelled) setLoadingMessages(false); });

    const unsubscribe = subscribeToRoomMessages(currentRoomId, (msg) => {
      setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
    });
    return () => { cancelled = true; unsubscribe(); };
  }, [currentRoomId]);

  useEffect(() => { scrollToBottom(); }, [messages]);

  const nameFor = (senderId) => {
    if (senderId === profile?.id) return profile?.full_name || 'Tôi';
    return directory.find((u) => u.id === senderId)?.full_name || 'Nhân viên';
  };

  const groupRooms = useMemo(() => rooms.filter((r) => r.room_type === 'group'), [rooms]);
  const activeRoom = rooms.find((r) => r.id === currentRoomId);
  const activeDirectUser = directory.find((u) => u.id === currentDirectUserId);
  const roomTitle = navTab === 'direct' && activeDirectUser
    ? `${activeDirectUser.full_name}${activeDirectUser.role ? ` (${activeDirectUser.role})` : ''}`
    : (activeRoom?.name || 'Hộp thoại');
  const roomAvatar = navTab === 'direct' ? '👤' : (activeRoom?.avatar_emoji || '💬');

  const openGroupRoom = (roomId) => {
    setNavTab('group');
    setCurrentDirectUserId(null);
    setCurrentRoomId(roomId);
  };

  const openDirectUser = async (userId) => {
    setNavTab('direct');
    setCurrentDirectUserId(userId);
    try {
      const roomId = await getOrCreateDmRoom(userId);
      setCurrentRoomId(roomId);
    } catch (e) {
      setError(e.message);
    }
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
      else setShowMentionPopup(false);
    } else {
      setShowMentionPopup(false);
    }
  };

  const handleSelectMention = (user) => {
    const lastAtPos = inputText.lastIndexOf('@');
    const prefix = inputText.slice(0, lastAtPos);
    const tag = (user.full_name || '').replace(/\s+/g, '');
    setInputText(`${prefix}@${tag} `);
    setShowMentionPopup(false);
    inputRef.current?.focus();
  };

  const handlePickPhoto = (e) => {
    const f = e.target.files?.[0];
    if (f) setPendingPhoto(f);
    e.target.value = '';
  };

  const handleSendMessage = async () => {
    const text = inputText.trim();
    if (!text && !pendingPhoto) return;
    if (!currentRoomId || !profile?.id) return;
    setSending(true);
    setError('');
    try {
      let attachmentUrl = null;
      if (pendingPhoto) {
        const uploaded = await uploadFile(pendingPhoto, `chat-attachments/${profile.id}`);
        attachmentUrl = uploaded.url;
      }
      await sendChatMessage({
        roomId: currentRoomId,
        senderId: profile.id,
        content: text || null,
        attachmentUrl,
        orderCode: extractOrderCode(text),
      });
      setInputText('');
      setPendingPhoto(null);
      setShowMentionPopup(false);
    } catch (e) {
      setError(e.message);
    } finally {
      setSending(false);
    }
  };

  const filteredMentionUsers = useMemo(() => (
    directory.filter((u) => (u.full_name || '').toLowerCase().includes(mentionFilter) || (u.role || '').toLowerCase().includes(mentionFilter))
  ), [directory, mentionFilter]);

  return (
    <div className="mobile-chat-fullscreen-modal">
      {/* 1. MOBILE CHAT HEADER */}
      <div className="m-chat-header">
        <div className="m-chat-header-info">
          <div className="m-room-avatar">{roomAvatar}</div>
          <div className="m-room-text">
            <h4>{roomTitle}</h4>
            <p>{navTab === 'group' && activeRoom ? activeRoom.topic || `👥 Nhóm chat` : '💬 Chat riêng'}</p>
          </div>
        </div>
        <button className="m-close-chat-btn" title="Đóng chat" onClick={onClose}>✕</button>
      </div>

      {/* 2. TABS */}
      <div className="m-chat-category-tabs">
        <button className={`m-cat-tab-btn ${navTab === 'group' ? 'active' : ''}`} onClick={() => setNavTab('group')}>
          🥐 Nhóm Chat ({groupRooms.length})
        </button>
        <button className={`m-cat-tab-btn ${navTab === 'direct' ? 'active' : ''}`} onClick={() => setNavTab('direct')}>
          👤 Chat Riêng 1-1 ({directory.length})
        </button>
      </div>

      {/* 3. PILLS */}
      <div className="m-channel-pills-bar">
        {loadingLists ? (
          <span style={{ fontSize: 12, color: '#8C7A6B', padding: '4px 8px' }}>Đang tải...</span>
        ) : navTab === 'group' ? (
          groupRooms.map((r) => (
            <button key={r.id} className={`m-pill-btn ${currentRoomId === r.id ? 'active' : ''}`} onClick={() => openGroupRoom(r.id)}>
              <span>{r.avatar_emoji || '💬'}</span>
              <span>{(r.name || '').replace(/^\S+\s/, '')}</span>
            </button>
          ))
        ) : (
          directory.map((u) => (
            <button key={u.id} className={`m-pill-btn ${currentDirectUserId === u.id ? 'active' : ''}`} onClick={() => openDirectUser(u.id)}>
              <span>👤</span>
              <span>{(u.full_name || '').split(' ').slice(-1)[0]}</span>
            </button>
          ))
        )}
      </div>

      {/* 4. FEED */}
      <div className="m-chat-feed">
        {loadingMessages && <div style={{ textAlign: 'center', color: '#8C7A6B', fontSize: 12, padding: 12 }}>Đang tải tin nhắn...</div>}
        {!loadingMessages && messages.length === 0 && (
          <div style={{ textAlign: 'center', color: '#8C7A6B', fontSize: 12, padding: 12 }}>Chưa có tin nhắn nào — gửi lời chào đầu tiên nhé!</div>
        )}
        {messages.map((msg) => {
          const isMe = msg.sender_id === profile?.id;
          const senderName = msg.profiles?.full_name || nameFor(msg.sender_id);
          return (
            <div key={msg.id} className={`m-msg-row ${isMe ? 'me' : ''}`}>
              {!isMe && <div className="m-msg-avatar" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F5EBE1', fontSize: 14 }}>👤</div>}
              <div className="m-msg-body">
                {!isMe && <span className="m-sender-label">{senderName}</span>}
                <div className="m-msg-bubble">
                  {renderFormattedMessage(msg.content)}
                  {msg.order_code && (
                    <div>
                      <span style={{ background: '#E0F2FE', color: '#0369A1', fontSize: 11, padding: '2px 6px', borderRadius: 4, fontWeight: 700 }}>
                        📦 Mã đơn: #{msg.order_code}
                      </span>
                    </div>
                  )}
                  {msg.attachment_url && (
                    <img src={msg.attachment_url} alt="Đính kèm" className="m-chat-img-thumb" onClick={() => window.open(msg.attachment_url, '_blank')} />
                  )}
                </div>
                <span className="m-msg-timestamp">{new Date(msg.created_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}</span>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* 5. INPUT BAR */}
      <div className="m-chat-input-bottom">
        {showMentionPopup && (
          <div className="m-mention-autocomplete-menu">
            <div style={{ fontSize: 10.5, fontWeight: 700, color: '#8C7A6B', padding: '2px 6px' }}>👥 Tag tên người vào trò chuyện:</div>
            {filteredMentionUsers.map((u) => (
              <div key={u.id} className="m-mention-item" onClick={() => handleSelectMention(u)}>
                <div className="m-mention-avatar" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F5EBE1' }}>👤</div>
                <div className="m-mention-info">
                  <strong>{u.full_name}</strong>
                  <span>{u.role}</span>
                </div>
              </div>
            ))}
            {filteredMentionUsers.length === 0 && <div style={{ fontSize: 12, color: '#8C7A6B', padding: '4px 8px' }}>Không tìm thấy</div>}
          </div>
        )}

        {pendingPhoto && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', background: '#FAF6F0', borderRadius: 10, marginBottom: 6 }}>
            <img src={URL.createObjectURL(pendingPhoto)} alt="preview" style={{ width: 36, height: 36, borderRadius: 8, objectFit: 'cover' }} />
            <span style={{ fontSize: 11, color: '#4A3B2C', flex: 1 }}>Ảnh sẽ gửi kèm tin nhắn</span>
            <button type="button" onClick={() => setPendingPhoto(null)} style={{ border: 0, background: 'none', cursor: 'pointer' }}>✕</button>
          </div>
        )}

        <form className="m-input-form-row" onSubmit={(e) => { e.preventDefault(); handleSendMessage(); }}>
          <textarea
            ref={inputRef}
            rows={1}
            className="m-input-field"
            placeholder="Gõ tin nhắn (@ để tag tên)..."
            value={inputText}
            onChange={handleInputChange}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendMessage(); } }}
            disabled={sending || !currentRoomId}
          />
          <button type="submit" className="m-send-btn" title="Gửi" disabled={sending || !currentRoomId}>➤</button>
        </form>

        <div className="m-tool-chips-row">
          <input ref={photoInputRef} type="file" accept="image/*" hidden onChange={handlePickPhoto} />
          <button type="button" className="m-tool-btn" onClick={() => photoInputRef.current?.click()}>📷 Gửi ảnh</button>
          <button type="button" className="m-tool-btn" onClick={() => { setInputText((p) => `${p}@`); setShowMentionPopup(true); setMentionFilter(''); inputRef.current?.focus(); }}>🏷️ Tag người</button>
          <button type="button" className="m-tool-btn" onClick={() => setInputText((p) => `${p}👍`)}>👍 Like</button>
        </div>

        {error && <div style={{ fontSize: 11.5, color: '#B42318', padding: '4px 8px' }}>⚠️ {error}</div>}
      </div>
    </div>
  );
}

function renderFormattedMessage(text) {
  if (!text) return null;
  const parts = text.split(/(@\S+|#[A-Z]+-[A-Z0-9-]+)/g);
  return parts.map((part, i) => {
    if (part.startsWith('@')) return <span key={i} className="m-mention-tag">{part}</span>;
    if (part.startsWith('#')) return <span key={i} style={{ color: '#0284C7', fontWeight: 700 }}>{part}</span>;
    return part;
  });
}
