import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  fetchMyChatRooms,
  fetchChatDirectory,
  fetchDirectConversations,
  getOrCreateDmRoom,
  fetchRoomMessages,
  sendChatMessage,
  subscribeToRoomMessages,
  markRoomRead,
  extractOrderCode,
} from '../../lib/chat';
import { uploadFile } from '../../lib/queries';
import { toWebSafeImage } from '../../lib/imageConvert';
import { IconStaff, IconUser, IconCamera, IconTag } from '../icons/FrogIcons';

export default function ChatWindowModal({ onClose, profile, initialRoomId = null, unreadCounts = {}, onRoomRead, onActiveRoomChange }) {
  const [navTab, setNavTab] = useState('group'); // 'group' | 'direct'
  const [rooms, setRooms] = useState([]);
  const [directory, setDirectory] = useState([]);
  const [loadingLists, setLoadingLists] = useState(true);
  const [error, setError] = useState('');

  const [directConversations, setDirectConversations] = useState([]);
  const [directListLoading, setDirectListLoading] = useState(true);
  const [directListRefreshTick, setDirectListRefreshTick] = useState(0);
  const initialRoomHandledRef = useRef(false);

  const [currentRoomId, setCurrentRoomId] = useState(null);
  const [currentDirectUserId, setCurrentDirectUserId] = useState(null); // for highlighting the pill while DM room resolves
  const [messages, setMessages] = useState([]);
  const [loadingMessages, setLoadingMessages] = useState(false);

  const [inputText, setInputText] = useState('');
  const [pendingPhoto, setPendingPhoto] = useState(null);
  const [sending, setSending] = useState(false);

  const [showMentionPopup, setShowMentionPopup] = useState(false);
  const [mentionFilter, setMentionFilter] = useState('');
  const [selectedMentionIds, setSelectedMentionIds] = useState([]);

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
    setMessages([]); // tránh chớp tin nhắn của phòng cũ trong lúc tải phòng mới
    fetchRoomMessages(currentRoomId)
      .then((data) => { if (!cancelled) setMessages(data); })
      .catch((e) => setError(e.message))
      .finally(() => { if (!cancelled) setLoadingMessages(false); });

    // Đang mở phòng này tức là đã đọc -> đánh dấu đã đọc + báo ChatLauncher
    // xoá tại chỗ huy hiệu chưa đọc của đúng phòng này (không quét lại DB).
    onActiveRoomChange?.(currentRoomId);
    if (profile?.id) {
      markRoomRead(currentRoomId, profile.id).then(() => onRoomRead?.(currentRoomId)).catch(() => {});
    }

    const unsubscribe = subscribeToRoomMessages(currentRoomId, (msg) => {
      setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
      if (msg.sender_id !== profile?.id && profile?.id) {
        markRoomRead(currentRoomId, profile.id).then(() => onRoomRead?.(currentRoomId)).catch(() => {});
      }
    });
    return () => { cancelled = true; unsubscribe(); };
  }, [currentRoomId]);

  useEffect(() => { scrollToBottom(); }, [messages]);

  // Danh sách hội thoại "Chat riêng" kiểu Messenger: mọi đồng nghiệp, ai đã
  // từng nhắn thì lên đầu kèm tin nhắn gần nhất, chưa từng nhắn thì xếp theo
  // tên A-Z ở dưới.
  useEffect(() => {
    if (loadingLists || !profile?.id) return;
    let cancelled = false;
    setDirectListLoading(true);
    fetchDirectConversations(profile.id)
      .then((convos) => {
        if (cancelled) return;
        const byPeer = new Map();
        for (const c of convos) byPeer.set(c.peer.id, c);
        for (const u of directory) {
          if (!byPeer.has(u.id)) byPeer.set(u.id, { roomId: null, peer: u, lastMessage: null, lastAt: null });
        }
        const list = Array.from(byPeer.values()).sort((a, b) => {
          if (a.lastAt && b.lastAt) return new Date(b.lastAt) - new Date(a.lastAt);
          if (a.lastAt) return -1;
          if (b.lastAt) return 1;
          return (a.peer.full_name || '').localeCompare(b.peer.full_name || '');
        });
        setDirectConversations(list);
      })
      .catch((e) => setError(e.message))
      .finally(() => { if (!cancelled) setDirectListLoading(false); });
    return () => { cancelled = true; };
  }, [profile?.id, directory, loadingLists, directListRefreshTick]);

  // Mở thẳng 1 phòng cụ thể khi bấm từ toast thông báo tin nhắn mới (chỉ chạy
  // 1 lần khi đủ dữ liệu để biết đó là phòng nhóm hay phòng chat riêng).
  useEffect(() => {
    if (!initialRoomId || initialRoomHandledRef.current) return;
    if (loadingLists || directListLoading) return;
    initialRoomHandledRef.current = true;
    const groupMatch = rooms.find((r) => r.id === initialRoomId && r.room_type === 'group');
    if (groupMatch) { openGroupRoom(groupMatch.id); return; }
    const dmMatch = directConversations.find((c) => c.roomId === initialRoomId);
    if (dmMatch) openDirectUser(dmMatch.peer.id, dmMatch.roomId);
  }, [initialRoomId, loadingLists, directListLoading, rooms, directConversations]);

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

  const openDirectUser = async (userId, knownRoomId) => {
    setNavTab('direct');
    setCurrentDirectUserId(userId);
    try {
      const roomId = knownRoomId || await getOrCreateDmRoom(userId);
      setCurrentRoomId(roomId);
    } catch (e) {
      setError(e.message);
    }
  };

  // Quay lại danh sách hội thoại kiểu Messenger (không đóng cả cửa sổ chat).
  const handleBackToDirectList = () => {
    setCurrentDirectUserId(null);
    setDirectListRefreshTick((t) => t + 1);
  };

  // Bấm tab "Nhóm Chat" trong lúc đang xem 1 luồng Chat riêng: `rooms` chứa
  // CẢ phòng nhóm lẫn phòng riêng, nên nếu chỉ đổi navTab mà không đổi lại
  // currentRoomId thì activeRoom vẫn trỏ tới phòng riêng cũ (name/topic đều
  // rỗng) -> header hiện chữ rác "Hộp thoại" / "👥 Nhóm chat" và không pill
  // nào được bôi đậm. Luôn đưa currentRoomId về đúng 1 phòng nhóm hợp lệ.
  const switchToGroupTab = () => {
    if (navTab === 'group') return;
    const fallback = groupRooms.find((r) => r.id === currentRoomId) || groupRooms[0];
    if (fallback) openGroupRoom(fallback.id);
    else { setNavTab('group'); setCurrentDirectUserId(null); }
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

  // Bấm 1 người trong popup chỉ TICK chọn (không chèn ngay, không đóng popup)
  // — cho phép chọn nhiều người liên tiếp rồi bấm "Xong" chèn tất cả 1 lượt,
  // thay vì phải gõ lại "@" cho từng người.
  const toggleMentionSelect = (user) => {
    setSelectedMentionIds((prev) => (
      prev.includes(user.id) ? prev.filter((id) => id !== user.id) : [...prev, user.id]
    ));
  };

  const selectAllMentions = () => {
    const ids = filteredMentionUsers.map((u) => u.id);
    setSelectedMentionIds((prev) => (
      ids.every((id) => prev.includes(id)) ? prev.filter((id) => !ids.includes(id)) : [...new Set([...prev, ...ids])]
    ));
  };

  const confirmMentionSelection = () => {
    if (!selectedMentionIds.length) { setShowMentionPopup(false); return; }
    const lastAtPos = inputText.lastIndexOf('@');
    const prefix = lastAtPos !== -1 ? inputText.slice(0, lastAtPos) : inputText;
    const tags = selectedMentionIds
      .map((id) => directory.find((u) => u.id === id))
      .filter(Boolean)
      .map((u) => `@${(u.full_name || '').replace(/\s+/g, '')}`)
      .join(' ');
    setInputText(`${prefix}${tags} `);
    setSelectedMentionIds([]);
    setShowMentionPopup(false);
    inputRef.current?.focus();
  };

  const handlePickPhoto = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    try {
      // Ảnh HEIC (mặc định iPhone) không hiển thị được trên trình duyệt —
      // convert sang JPEG trước khi lưu, tránh gửi ảnh "chết" vào chat.
      const safe = await toWebSafeImage(f);
      setPendingPhoto(safe);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleSendMessage = async () => {
    const text = inputText.trim();
    if (!text && !pendingPhoto) return;
    if (!currentRoomId || !profile?.id) return;
    setSending(true);
    setError('');
    // Cập nhật lạc quan: hiện tin nhắn ngay trên màn hình của người gửi
    // trước khi chờ round-trip DB + realtime echo. Nếu gửi thất bại thì gỡ
    // lại dòng tạm và trả input về để nhập lại. Ảnh đính kèm vẫn phải chờ
    // upload xong thật (không có ảnh giả để hiện lạc quan).
    const tempId = `temp-${Date.now()}`;
    const roomIdAtSend = currentRoomId;
    let attachmentUrl = null;
    try {
      if (pendingPhoto) {
        attachmentUrl = (await uploadFile(pendingPhoto, `chat-attachments/${profile.id}`)).url;
      }
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

      const saved = await sendChatMessage({
        roomId: roomIdAtSend,
        senderId: profile.id,
        content: text || null,
        attachmentUrl,
        orderCode: extractOrderCode(text),
      });
      // Thay id tạm bằng id thật — để lúc realtime echo cùng dòng này về,
      // dedup theo id nhận ra đã có sẵn, không hiện trùng 2 lần.
      setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...saved } : m)));
      if (navTab === 'direct') setDirectListRefreshTick((t) => t + 1);
    } catch (e) {
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      setInputText(text);
      setError(e.message);
    } finally {
      setSending(false);
    }
  };

  const filteredMentionUsers = useMemo(() => (
    directory.filter((u) => (u.full_name || '').toLowerCase().includes(mentionFilter) || (u.role || '').toLowerCase().includes(mentionFilter))
  ), [directory, mentionFilter]);

  const inDirectList = navTab === 'direct' && !currentDirectUserId;

  return (
    <div className="mobile-chat-fullscreen-modal">
      {/* 1. MOBILE CHAT HEADER */}
      <div className="m-chat-header">
        <div className="m-chat-header-info">
          {navTab === 'direct' && currentDirectUserId && (
            <button className="m-back-btn" title="Quay lại danh sách" onClick={handleBackToDirectList}>←</button>
          )}
          <div className="m-room-avatar">{roomAvatar}</div>
          <div className="m-room-text">
            <h4>{inDirectList ? 'Chat riêng' : roomTitle}</h4>
            <p>{navTab === 'group' && activeRoom ? activeRoom.topic || `👥 Nhóm chat` : (inDirectList ? `${directConversations.length} đồng nghiệp` : '💬 Chat riêng')}</p>
          </div>
        </div>
        <button className="m-close-chat-btn" title="Đóng chat" onClick={onClose}>✕</button>
      </div>

      {/* 2. TABS */}
      <div className="m-chat-category-tabs">
        <button className={`m-cat-tab-btn ${navTab === 'group' ? 'active' : ''}`} onClick={switchToGroupTab}>
          <IconStaff size={16} /> Nhóm Chat ({groupRooms.length})
        </button>
        <button className={`m-cat-tab-btn ${navTab === 'direct' ? 'active' : ''}`} onClick={() => { setNavTab('direct'); setCurrentDirectUserId(null); }}>
          <IconUser size={16} /> Chat Riêng 1-1 ({directConversations.length || directory.length})
        </button>
      </div>

      {/* 3. PILLS (chỉ hiện ở tab Nhóm Chat — Chat Riêng dùng danh sách kiểu Messenger bên dưới) */}
      {navTab === 'group' && (
        <div className="m-channel-pills-bar">
          {loadingLists ? (
            <span style={{ fontSize: 12, color: '#8C7A6B', padding: '4px 8px' }}>Đang tải...</span>
          ) : (
            groupRooms.map((r) => (
              <button key={r.id} className={`m-pill-btn ${currentRoomId === r.id ? 'active' : ''}`} onClick={() => openGroupRoom(r.id)}>
                <span>{r.avatar_emoji || '💬'}</span>
                <span>{(r.name || '').replace(/^\S+\s/, '')}</span>
                {unreadCounts[r.id] > 0 && <span className="m-pill-unread-dot">{unreadCounts[r.id]}</span>}
              </button>
            ))
          )}
        </div>
      )}

      {inDirectList ? (
        /* 3b. DANH SÁCH HỘI THOẠI KIỂU MESSENGER */
        <div className="m-dm-list">
          {(loadingLists || directListLoading) && <div className="m-dm-list-empty">Đang tải...</div>}
          {!loadingLists && !directListLoading && directConversations.length === 0 && (
            <div className="m-dm-list-empty">Chưa có đồng nghiệp nào để chat riêng</div>
          )}
          {!loadingLists && !directListLoading && directConversations.map((c) => (
            <button key={c.peer.id} className="m-dm-list-item" onClick={() => openDirectUser(c.peer.id, c.roomId)}>
              <div className="m-dm-avatar">👤</div>
              <div className="m-dm-info">
                <div className="m-dm-row-top">
                  <strong>{c.peer.full_name}</strong>
                  {c.lastAt && <span className="m-dm-time">{formatDmTime(c.lastAt)}</span>}
                </div>
                <div className="m-dm-preview">{c.lastMessage || c.peer.role || 'Bấm để bắt đầu trò chuyện'}</div>
              </div>
              {c.roomId && unreadCounts[c.roomId] > 0 && <span className="m-dm-unread-dot">{unreadCounts[c.roomId]}</span>}
            </button>
          ))}
        </div>
      ) : (
      <>
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
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '2px 6px' }}>
              <span style={{ fontSize: 10.5, fontWeight: 700, color: '#8C7A6B' }}>👥 Chọn 1 hoặc nhiều người để tag:</span>
              {filteredMentionUsers.length > 0 && (
                <button type="button" onClick={selectAllMentions} style={{ border: 'none', background: 'none', color: '#C88A4B', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                  Chọn tất cả
                </button>
              )}
            </div>
            {filteredMentionUsers.map((u) => {
              const checked = selectedMentionIds.includes(u.id);
              return (
                <div key={u.id} className="m-mention-item" onClick={() => toggleMentionSelect(u)} style={{ background: checked ? '#FDECE3' : undefined }}>
                  <div className="m-mention-avatar" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: checked ? '#C88A4B' : '#F5EBE1', color: checked ? '#fff' : undefined }}>
                    {checked ? '✓' : '👤'}
                  </div>
                  <div className="m-mention-info">
                    <strong>{u.full_name}</strong>
                    <span>{u.role}</span>
                  </div>
                </div>
              );
            })}
            {filteredMentionUsers.length === 0 && <div style={{ fontSize: 12, color: '#8C7A6B', padding: '4px 8px' }}>Không tìm thấy</div>}
            <button
              type="button"
              onClick={confirmMentionSelection}
              disabled={!selectedMentionIds.length}
              style={{
                width: '100%', marginTop: 6, padding: '8px 0', borderRadius: 8, border: 'none',
                background: selectedMentionIds.length ? '#C88A4B' : '#EFE6DC',
                color: selectedMentionIds.length ? '#fff' : '#8C7A6B',
                fontWeight: 800, fontSize: 12.5, cursor: selectedMentionIds.length ? 'pointer' : 'not-allowed',
              }}
            >
              ✓ Xong{selectedMentionIds.length ? ` (${selectedMentionIds.length} người)` : ''}
            </button>
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
          <button type="button" className="m-tool-btn" onClick={() => photoInputRef.current?.click()}><IconCamera size={16} /> Gửi ảnh</button>
          <button type="button" className="m-tool-btn" onClick={() => { setInputText((p) => `${p}@`); setShowMentionPopup(true); setMentionFilter(''); setSelectedMentionIds([]); inputRef.current?.focus(); }}><IconTag size={16} /> Tag người</button>
          <button type="button" className="m-tool-btn" onClick={() => setInputText((p) => `${p}👍`)}>👍 Like</button>
        </div>

        {error && <div style={{ fontSize: 11.5, color: '#B42318', padding: '4px 8px' }}>⚠️ {error}</div>}
      </div>
      </>
      )}
    </div>
  );
}

function formatDmTime(iso) {
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
    if (part.startsWith('@')) return <span key={i} className="m-mention-tag">{part}</span>;
    if (part.startsWith('#')) return <span key={i} style={{ color: '#0284C7', fontWeight: 700 }}>{part}</span>;
    return part;
  });
}
