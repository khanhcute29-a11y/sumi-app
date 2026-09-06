import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import './chat-screen.css';
import 'emoji-picker-element';
import UserAvatar from '../UserAvatar';
import {
  fetchAllConversations,
  fetchChatDirectory,
  fetchRoomParticipants,
  getOrCreateDmRoom,
  fetchRoomMessages,
  sendChatMessage,
  notifyChatMentions,
  subscribeToRooms,
  markRoomRead,
  markRoomUnread,
  extractOrderCode,
  setConversationPinned,
  createChatGroup,
  renameChatGroup,
  addChatGroupMembers,
  removeChatGroupMember,
  fetchUnreadCounts,
  sortConversations,
} from '../../lib/chat';
import { uploadFile } from '../../lib/queries';
import { toWebSafeImage } from '../../lib/imageConvert';
import { IconChat, IconCamera, IconTag, IconStaff } from '../icons/FrogIcons';

// Trang Chat kiểu Zalo, gắn vào thanh điều hướng (tab riêng — cửa sổ chat nổi
// ChatWindowModal/ChatLauncher cũ đã gộp hẳn vào đây và xoá, không còn song
// song nữa). Desktop: 2 cột (danh sách trái, luồng tin phải) luôn hiện cùng
// lúc. Mobile: 1 cột, bấm vào hội thoại mới chuyển sang xem luồng tin, có nút
// quay lại.
//
// Bản 06/09/2026 sửa 4 lỗi nghiêm trọng + nhiều lỗi hạng 2 phát hiện qua
// review kỹ code (xem CHAT_FEATURE_CODE.md) — mỗi chỗ sửa đều có ghi chú
// "LỖI THẬT đã vá" ngay tại chỗ, không dọn hết vào 1 đoạn dài ở đây.
const DESKTOP_BREAKPOINT = 860;
const MESSAGES_PAGE_SIZE = 50;
// Sentinel id (không phải uuid thật) cho lựa chọn "Mọi người" trong popup tag
// — chọn xong sẽ mở rộng ra ID thật của mọi thành viên đang có trong ĐÚNG
// phòng đang chat (không phải toàn công ty).
const TAG_ALL_ID = '__all__';
const TAG_ALL_TOKEN = '@MọiNgười';

function formatListTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  return d.toDateString() === now.toDateString()
    ? d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
}

// Bỏ dấu tiếng Việt để tìm kiếm không cần gõ dấu (vd "nghia" vẫn ra "Nghĩa").
function stripDiacritics(text) {
  return (text || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, (m) => (m === 'đ' ? 'd' : 'D')).toLowerCase();
}

// LỖI THẬT đã vá: extractOrderCode (lib/chat.js) đã nhận cả mã đơn viết
// thường từ vòng sửa trước, nhưng regex TÔ MÀU ở đây vẫn chỉ khớp chữ HOA
// ([A-Z]) — gõ "#sumi-001" thì lưu order_code đúng (hoa hoá khi lưu) nhưng
// bong bóng chat không tô màu chữ gõ tay, chỉ có ô "📦 Mã đơn" riêng bên
// dưới là đúng. Giờ regex nhận cả hai, không đổi cách lưu.
function renderFormattedMessage(text) {
  if (!text) return null;
  const parts = text.split(/(@\S+|#[A-Za-z]+-[A-Za-z0-9-]+)/g);
  return parts.map((part, i) => {
    if (part.startsWith('@')) return <span key={i} className="cs-mention-tag">{part}</span>;
    if (part.startsWith('#')) return <span key={i} className="cs-order-inline">{part}</span>;
    return part;
  });
}

// LỖI THẬT đã vá: trước đây check "người bị tag còn được báo không" bằng
// text.includes(token) — khớp NHẦM chuỗi con, vd token "@NguyenVanA" là 1
// chuỗi con nằm ngay trong "@NguyenVanAnh" nên câu chỉ nhắc "Anh" vẫn báo
// nhầm cho người tên "A". Sửa bằng cách xét token DÀI NHẤT trước, "xoá" khỏi
// bản nháp câu sau khi khớp để token ngắn hơn không còn khớp nhầm vào đúng
// phần chữ đã dùng cho token dài hơn (giống cách tách tên nhân viên khỏi
// câu nói ở parseVoiceTaskAssign.js — cùng 1 dạng lỗi, cùng 1 cách vá).
function matchMentionTokens(mentions, text) {
  const sorted = [...mentions].sort((a, b) => b.token.length - a.token.length);
  let remaining = text;
  const matched = [];
  for (const m of sorted) {
    const idx = remaining.indexOf(m.token);
    if (idx !== -1) {
      matched.push(m);
      remaining = remaining.slice(0, idx) + ' '.repeat(m.token.length) + remaining.slice(idx + m.token.length);
    }
  }
  return matched;
}

// Gộp 1 tin nhắn mới (từ realtime) vào mảng đang có, có dedupe 2 chiều.
// LỖI THẬT đã vá: trước đây bong bóng "tạm" (id: temp-xxx) lúc gửi tin và
// tin thật từ realtime dội về CÙNG được thêm riêng lẻ nếu realtime tới
// TRƯỚC KHI sendChatMessage() kịp trả lời — ra 2 bong bóng trùng nhau. Giờ
// nếu là tin CỦA CHÍNH MÌNH và có sẵn 1 bong bóng tạm khớp nội dung y hệt,
// THAY nó bằng bản thật thay vì thêm mới; ngược lại (tin thật đã có sẵn
// đúng id) thì bỏ qua — cả 2 hướng của cuộc đua đều không tạo bản trùng.
function mergeIncomingMessage(prev, msg, myId) {
  if (prev.some((m) => m.id === msg.id)) return prev;
  if (msg.sender_id === myId) {
    const tempIdx = prev.findIndex((m) => typeof m.id === 'string' && m.id.startsWith('temp-')
      && m.content === msg.content && m.attachment_url === msg.attachment_url);
    if (tempIdx !== -1) {
      const next = prev.slice();
      next[tempIdx] = msg;
      return next;
    }
  }
  return [...prev, msg];
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
  // LỖI THẬT đã vá: fetchUnreadCounts đã viết sẵn trong lib/chat.js nhưng
  // ChatScreen chưa bao giờ import — danh sách hội thoại không có huy hiệu
  // số tin chưa đọc trên từng dòng (chỉ có tổng số ở icon Chat dưới thanh
  // điều hướng, không biết PHÒNG NÀO đang có tin mới).
  const [unreadCounts, setUnreadCounts] = useState({});
  const [loadingList, setLoadingList] = useState(true);
  const [error, setError] = useState('');
  const [showNewChat, setShowNewChat] = useState(false);
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [groupMemberIds, setGroupMemberIds] = useState([]);
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [pendingOpenRoomId, setPendingOpenRoomId] = useState(null);

  const [activeRoomId, setActiveRoomId] = useState(null);
  const [activeConvo, setActiveConvo] = useState(null); // metadata hiển thị header (title/avatar) — không phải lúc nào cũng có sẵn trong `conversations` (vd DM vừa tạo lần đầu)
  const [messages, setMessages] = useState([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  // Phân trang tin cũ — LỖI THẬT đã vá: trước đây tải cứng 100 tin ĐẦU (xem
  // fetchRoomMessages) và không có cách nào xem thêm tin cũ hơn. Giờ tải 50
  // tin MỚI NHẤT trước, cuộn lên đầu bấm "Tải tin cũ hơn" mới tải thêm.
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasMoreOlder, setHasMoreOlder] = useState(true);

  const [inputText, setInputText] = useState('');
  const [pendingPhoto, setPendingPhoto] = useState(null);
  const [sending, setSending] = useState(false);
  // LỖI THẬT đã vá (review vòng 2, mục 2.7): nút "👍 Like" trước đây chỉ chèn
  // đúng 1 emoji cố định — không có cách chọn emoji khác. emoji-picker-element
  // là web component (custom element chuẩn, không phải thư viện React) nên
  // gắn/gỡ sự kiện "emoji-click" bằng ref + useEffect thay vì prop JSX.
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const emojiPickerRef = useRef(null);
  useEffect(() => {
    const el = emojiPickerRef.current;
    if (!el) return undefined;
    const onPick = (e) => {
      setInputText((p) => `${p}${e.detail.unicode}`);
      inputRef.current?.focus();
    };
    el.addEventListener('emoji-click', onPick);
    return () => el.removeEventListener('emoji-click', onPick);
  }, [showEmojiPicker]);

  const [showMentionPopup, setShowMentionPopup] = useState(false);
  const [mentionFilter, setMentionFilter] = useState('');
  const [selectedMentionIds, setSelectedMentionIds] = useState([]); // có thể chứa sentinel TAG_ALL_ID
  // Mỗi lượt "@" xong bấm Xong ghi lại { token, ids } thay vì chỉ mảng id —
  // để lúc gửi tin kiểm tra được token đó CÒN nằm trong chữ đang gõ hay
  // không (fix lỗi thật: xoá tay "@Tên" khỏi ô soạn rồi gửi thì người đó vẫn
  // bị báo "được nhắc đến" dù tên không còn xuất hiện trong tin gửi đi).
  const [pendingMentions, setPendingMentions] = useState([]); // [{ token, ids }]
  const [roomParticipants, setRoomParticipants] = useState([]); // [{id, full_name, role}] — thành viên phòng đang mở

  // Quản lý nhóm tự tạo — LỖI THẬT đã vá: trước đây tạo nhóm xong không có
  // cách nào đổi tên/thêm/xoá thành viên/rời nhóm.
  const [showGroupInfo, setShowGroupInfo] = useState(false);
  const [groupInfoName, setGroupInfoName] = useState('');
  const [savingGroupInfo, setSavingGroupInfo] = useState(false);
  const [showAddMembers, setShowAddMembers] = useState(false);
  const [addMemberIds, setAddMemberIds] = useState([]);

  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const photoInputRef = useRef(null);
  const feedRef = useRef(null);
  const activeRoomIdRef = useRef(null);
  // Chỉ tự cuộn xuống đáy khi ĐANG Ở GẦN ĐÁY sẵn (hoặc chính mình vừa gửi) —
  // LỖI THẬT đã vá: trước đây MỌI tin mới đều ép cuộn xuống đáy, kể cả đang
  // cuộn lên đọc tin cũ, giật người dùng xuống giữa chừng.
  const isNearBottomRef = useRef(true);
  const justSentRef = useRef(false);
  const scrollToBottom = (smooth = true) => messagesEndRef.current?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto' });

  useEffect(() => { activeRoomIdRef.current = activeRoomId; }, [activeRoomId]);

  useEffect(() => {
    if (!profile?.id) return;
    let cancelled = false;
    setLoadingList(true);
    Promise.all([fetchAllConversations(profile.id), fetchChatDirectory(), fetchUnreadCounts()])
      .then(([convos, dir, unread]) => {
        if (cancelled) return;
        setConversations(convos);
        setDirectory(dir.filter((u) => u.id !== profile.id));
        setUnreadCounts(unread);
      })
      .catch((e) => setError(e.message))
      .finally(() => { if (!cancelled) setLoadingList(false); });
    return () => { cancelled = true; };
  }, [profile?.id, refreshTick]);

  // LỖI THẬT đã vá: trước đây CHỈ subscribe realtime cho phòng đang mở — tin
  // nhắn của các phòng KHÁC hoàn toàn im lặng cho tới khi bấm vào lại (badge
  // không nhảy, preview không cập nhật). Giờ subscribe MỘT LẦN cho TẤT CẢ
  // phòng mình đang tham gia, tự định tuyến: đúng phòng đang mở -> đẩy vào
  // luồng tin; phòng khác + không phải tin của mình -> tăng số chưa đọc +
  // cập nhật preview tại chỗ (không gọi lại fetchAllConversations).
  const roomIdsKey = useMemo(() => conversations.map((c) => c.roomId).sort().join(','), [conversations]);
  useEffect(() => {
    const roomIds = roomIdsKey ? roomIdsKey.split(',') : [];
    if (!roomIds.length || !profile?.id) return undefined;
    const unsubscribe = subscribeToRooms(roomIds, (msg) => {
      setConversations((prev) => {
        const idx = prev.findIndex((c) => c.roomId === msg.room_id);
        if (idx === -1) return prev;
        const updated = {
          ...prev[idx],
          lastMessage: msg.content || (msg.attachment_url ? '📷 Đã gửi ảnh' : ''),
          lastAt: msg.created_at,
          lastSenderId: msg.sender_id,
        };
        const rest = prev.filter((_, i) => i !== idx);
        return [updated, ...rest].sort(sortConversations);
      });

      if (msg.room_id === activeRoomIdRef.current) {
        setMessages((prev) => mergeIncomingMessage(prev, msg, profile.id));
        if (msg.sender_id !== profile.id) {
          markRoomRead(msg.room_id, profile.id).then(() => window.dispatchEvent(new CustomEvent('sumi-badges-changed'))).catch(() => {});
        }
      } else if (msg.sender_id !== profile.id) {
        setUnreadCounts((prev) => ({ ...prev, [msg.room_id]: (prev[msg.room_id] || 0) + 1 }));
      }
    });
    return unsubscribe;
  }, [roomIdsKey, profile?.id]);

  // Bấm vào toast "Tin nhắn nội bộ mới" / "Bạn được nhắc đến" -> App.jsx đổi
  // tab sang 'chat' rồi bắn sự kiện này để mở thẳng đúng phòng (xem App.jsx).
  useEffect(() => {
    const onOpenRoom = (e) => { if (e.detail?.roomId) setPendingOpenRoomId(e.detail.roomId); };
    window.addEventListener('sumi-open-chat-room', onOpenRoom);
    return () => window.removeEventListener('sumi-open-chat-room', onOpenRoom);
  }, []);

  useEffect(() => {
    if (!pendingOpenRoomId || loadingList) return;
    const match = conversations.find((c) => c.roomId === pendingOpenRoomId);
    if (match) { openConversation(match); setPendingOpenRoomId(null); }
  }, [pendingOpenRoomId, conversations, loadingList]);

  useEffect(() => {
    if (!activeRoomId) return;
    let cancelled = false;
    setLoadingMessages(true);
    setMessages([]);
    setRoomParticipants([]);
    setHasMoreOlder(true);
    isNearBottomRef.current = true;
    fetchRoomMessages(activeRoomId, { limit: MESSAGES_PAGE_SIZE })
      .then((data) => { if (!cancelled) { setMessages(data); if (data.length < MESSAGES_PAGE_SIZE) setHasMoreOlder(false); } })
      .catch((e) => setError(e.message))
      .finally(() => { if (!cancelled) setLoadingMessages(false); });
    fetchRoomParticipants(activeRoomId)
      .then((rows) => { if (!cancelled) setRoomParticipants(rows); })
      .catch(() => {});

    if (profile?.id) {
      markRoomRead(activeRoomId, profile.id).then(() => {
        setUnreadCounts((prev) => ({ ...prev, [activeRoomId]: 0 }));
        window.dispatchEvent(new CustomEvent('sumi-badges-changed'));
      }).catch(() => {});
    }
    return () => { cancelled = true; };
  }, [activeRoomId]);

  useEffect(() => {
    if (isNearBottomRef.current || justSentRef.current) {
      scrollToBottom(!justSentRef.current);
      justSentRef.current = false;
    }
  }, [messages]);

  const handleFeedScroll = () => {
    const el = feedRef.current;
    if (!el) return;
    isNearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  };

  const loadOlderMessages = async () => {
    if (!activeRoomId || loadingOlder || !hasMoreOlder || !messages.length) return;
    setLoadingOlder(true);
    const el = feedRef.current;
    const prevScrollHeight = el?.scrollHeight || 0;
    try {
      const oldest = messages[0];
      const older = await fetchRoomMessages(activeRoomId, { limit: MESSAGES_PAGE_SIZE, before: oldest?.created_at, beforeId: oldest?.id });
      if (older.length < MESSAGES_PAGE_SIZE) setHasMoreOlder(false);
      if (older.length) {
        setMessages((prev) => [...older, ...prev]);
        // Giữ đúng vị trí đang đọc — không để màn hình giật khi tin cũ chèn
        // thêm phía trên làm tăng chiều cao khung cuộn.
        requestAnimationFrame(() => {
          if (el) el.scrollTop += (el.scrollHeight - prevScrollHeight);
        });
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoadingOlder(false);
    }
  };

  const openConversation = (convo) => {
    setActiveConvo(convo);
    setActiveRoomId(convo.roomId);
  };

  const startDirectChat = async (user) => {
    setShowNewChat(false);
    try {
      const roomId = await getOrCreateDmRoom(user.id);
      setActiveConvo({
        roomId, roomType: 'direct', peerId: user.id, peerAvatarPath: user.avatar_path || null, createdBy: null,
        title: user.full_name, subtitle: user.role || '', avatarEmoji: null,
      });
      setActiveRoomId(roomId);
      setRefreshTick((t) => t + 1);
    } catch (e) {
      setError(e.message);
    }
  };

  // Ghim tại chỗ trước (lạc quan) rồi mới lưu DB — ghim chỉ ảnh hưởng cách
  // CHÍNH MÌNH sắp xếp danh sách, không đụng gì tới người khác.
  const togglePin = async (convo) => {
    if (!profile?.id) return;
    const nextPinned = !convo.pinned;
    setConversations((prev) => {
      const next = prev.map((c) => (c.roomId === convo.roomId ? { ...c, pinned: nextPinned } : c));
      return next.sort(sortConversations);
    });
    try {
      await setConversationPinned(convo.roomId, profile.id, nextPinned);
    } catch (err) {
      setConversations((prev) => prev.map((c) => (c.roomId === convo.roomId ? { ...c, pinned: convo.pinned } : c)));
      setError(err.message);
    }
  };

  const handleMarkUnread = async (convo) => {
    if (!profile?.id || !convo.lastAt) return;
    setUnreadCounts((prev) => ({ ...prev, [convo.roomId]: Math.max(prev[convo.roomId] || 0, 1) }));
    try {
      await markRoomUnread(convo.roomId, profile.id, convo.lastAt);
      window.dispatchEvent(new CustomEvent('sumi-badges-changed'));
    } catch (err) {
      setError(err.message);
    }
  };

  // LỖI THẬT đã vá (review vòng 2, mục 2.5): trước đây nút ghim 📌 LUÔN LỘ
  // RA trên MỌI dòng hội thoại (mờ khi chưa ghim, đậm khi đã ghim) — Zalo
  // không có nút nào lộ sẵn như vậy, thao tác ghim/đánh dấu chưa đọc nằm
  // trong menu bấm giữ (mobile) / chuột phải (desktop). Giờ menu này mở
  // bằng bấm giữ 500ms hoặc chuột phải, đóng khi bấm ra ngoài; dòng ĐÃ ghim
  // vẫn hiện icon 📌 nhỏ cạnh giờ gửi (không phải nút bấm) để biết là đã ghim.
  const [convoMenu, setConvoMenu] = useState(null); // { convo, x, y }
  const longPressTimerRef = useRef(null);
  const openConvoMenu = (convo, x, y) => setConvoMenu({ convo, x, y });
  const closeConvoMenu = () => setConvoMenu(null);
  const handleConvoTouchStart = (e, convo) => {
    const { clientX, clientY } = e.touches[0] || {};
    longPressTimerRef.current = setTimeout(() => openConvoMenu(convo, clientX, clientY), 500);
  };
  const handleConvoTouchEnd = () => clearTimeout(longPressTimerRef.current);
  const handleConvoContextMenu = (e, convo) => {
    e.preventDefault();
    openConvoMenu(convo, e.clientX, e.clientY);
  };

  const toggleGroupMember = (userId) => {
    setGroupMemberIds((prev) => (prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]));
  };

  const handleCreateGroup = async () => {
    if (!groupMemberIds.length) { setError('Chọn ít nhất 1 thành viên cho nhóm'); return; }
    setCreatingGroup(true);
    setError('');
    try {
      const roomId = await createChatGroup(groupName, groupMemberIds);
      setShowCreateGroup(false);
      setActiveConvo({
        roomId, roomType: 'group', peerId: null, createdBy: profile?.id || null,
        title: groupName.trim() || 'Nhóm chat mới', subtitle: '', avatarEmoji: '👥',
      });
      setActiveRoomId(roomId);
      setGroupName('');
      setGroupMemberIds([]);
      setRefreshTick((t) => t + 1);
    } catch (e) {
      setError(e.message);
    } finally {
      setCreatingGroup(false);
    }
  };

  // ── Quản lý nhóm tự tạo (đổi tên/thêm-xoá thành viên/rời nhóm) ───────────
  // Chỉ nhóm created_by khác null mới cho sửa (chặn thật ở RPC, đây chỉ ẩn
  // nút cho gọn giao diện) — 4 nhóm mặc định toàn công ty không đổi được.
  const canManageActiveGroup = activeConvo?.roomType === 'group' && !!activeConvo?.createdBy;
  const isCreatorOfActiveGroup = canManageActiveGroup && activeConvo?.createdBy === profile?.id;

  const openGroupInfo = () => {
    setGroupInfoName(activeConvo?.title || '');
    setShowGroupInfo(true);
  };

  const handleRenameGroup = async () => {
    if (!activeRoomId) return;
    const name = groupInfoName.trim();
    if (!name) { setError('Tên nhóm không được để trống.'); return; }
    setSavingGroupInfo(true); setError('');
    try {
      await renameChatGroup(activeRoomId, name);
      setActiveConvo((prev) => (prev ? { ...prev, title: name } : prev));
      setConversations((prev) => prev.map((c) => (c.roomId === activeRoomId ? { ...c, title: name } : c)));
    } catch (e) {
      setError(e.message);
    } finally {
      setSavingGroupInfo(false);
    }
  };

  const handleAddMembers = async () => {
    if (!activeRoomId || !addMemberIds.length) return;
    setSavingGroupInfo(true); setError('');
    try {
      await addChatGroupMembers(activeRoomId, addMemberIds);
      const rows = await fetchRoomParticipants(activeRoomId);
      setRoomParticipants(rows);
      setAddMemberIds([]);
      setShowAddMembers(false);
    } catch (e) {
      setError(e.message);
    } finally {
      setSavingGroupInfo(false);
    }
  };

  const handleRemoveMember = async (memberId) => {
    if (!activeRoomId) return;
    const isSelf = memberId === profile?.id;
    if (!window.confirm(isSelf ? 'Rời nhóm này?' : 'Xoá người này khỏi nhóm?')) return;
    setSavingGroupInfo(true); setError('');
    try {
      await removeChatGroupMember(activeRoomId, memberId);
      if (isSelf) {
        setShowGroupInfo(false);
        setActiveRoomId(null);
        setActiveConvo(null);
        setRefreshTick((t) => t + 1);
      } else {
        setRoomParticipants((prev) => prev.filter((p) => p.id !== memberId));
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setSavingGroupInfo(false);
    }
  };

  const visibleConversations = useMemo(() => {
    const q = stripDiacritics(searchQuery.trim());
    if (!q) return conversations;
    return conversations.filter((c) => stripDiacritics(c.title).includes(q) || stripDiacritics(c.lastMessage).includes(q));
  }, [conversations, searchQuery]);

  const nameFor = (senderId) => {
    if (senderId === profile?.id) return profile?.full_name || 'Tôi';
    return directory.find((u) => u.id === senderId)?.full_name
      || roomParticipants.find((u) => u.id === senderId)?.full_name
      || conversations.find((c) => c.peerId === senderId)?.title
      || 'Nhân viên';
  };

  // Tin nhắn tới qua realtime (payload.new thô, không có join profiles) vẫn
  // cần avatar đúng người — tra theo cùng thứ tự ưu tiên với nameFor ở trên.
  const avatarPathFor = (senderId) => (
    directory.find((u) => u.id === senderId)?.avatar_path
    ?? roomParticipants.find((u) => u.id === senderId)?.avatarPath
    ?? null
  );

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

  // Chọn "Mọi người" là CHỌN RIÊNG (loại các người đã tick lẻ trước đó) và
  // ngược lại — gộp chung không có nghĩa vì "Mọi người" đã bao trọn tất cả.
  const toggleMentionSelect = (user) => {
    setSelectedMentionIds((prev) => {
      if (user.id === TAG_ALL_ID) return prev.includes(TAG_ALL_ID) ? [] : [TAG_ALL_ID];
      const withoutAll = prev.filter((id) => id !== TAG_ALL_ID);
      return withoutAll.includes(user.id) ? withoutAll.filter((id) => id !== user.id) : [...withoutAll, user.id];
    });
  };

  const roomParticipantIds = useMemo(() => roomParticipants.map((p) => p.id), [roomParticipants]);

  // LỖI THẬT đã vá: trước đây gợi ý tag lấy từ `directory` (TOÀN BỘ nhân
  // viên công ty), không lọc theo người thật sự trong phòng — nhóm 3 người
  // vẫn gõ "@" ra gợi ý cả người thứ 10 không hề ở trong nhóm, tag nhầm thì
  // họ bị báo "được nhắc đến" một tin họ không có quyền đọc (dù DB
  // notify_chat_mentions đã tự chặn không gửi thông báo cho người ngoài
  // phòng — vẫn nên sửa để KHÔNG GỢI Ý nhầm ngay từ đầu, tránh gây hiểu lầm
  // "sao tag không thấy báo"). Giờ chỉ gợi ý đúng người đang có trong phòng.
  const roomMemberOptions = useMemo(() => {
    const idSet = new Set(roomParticipantIds);
    return directory.filter((u) => idSet.has(u.id));
  }, [directory, roomParticipantIds]);

  const filteredMentionUsers = useMemo(() => (
    roomMemberOptions.filter((u) => (u.full_name || '').toLowerCase().includes(mentionFilter) || (u.role || '').toLowerCase().includes(mentionFilter))
  ), [roomMemberOptions, mentionFilter]);

  const selectAllMentions = () => {
    const ids = filteredMentionUsers.map((u) => u.id);
    setSelectedMentionIds((prev) => (ids.every((id) => prev.includes(id)) ? prev.filter((id) => !ids.includes(id)) : [...new Set([...prev.filter((id) => id !== TAG_ALL_ID), ...ids])]));
  };

  const confirmMentionSelection = () => {
    if (!selectedMentionIds.length) { setShowMentionPopup(false); return; }
    const lastAtPos = inputText.lastIndexOf('@');
    const prefix = lastAtPos !== -1 ? inputText.slice(0, lastAtPos) : inputText;
    let tags, newMention;
    if (selectedMentionIds.includes(TAG_ALL_ID)) {
      tags = TAG_ALL_TOKEN;
      newMention = { token: TAG_ALL_TOKEN, ids: roomParticipantIds.filter((id) => id !== profile?.id) };
    } else {
      const users = selectedMentionIds.map((id) => directory.find((u) => u.id === id)).filter(Boolean);
      tags = users.map((u) => `@${(u.full_name || '').replace(/\s+/g, '')}`).join(' ');
      newMention = null; // nhiều người -> tách 1 entry riêng cho từng người bên dưới
    }
    setInputText(`${prefix}${tags} `);
    setPendingMentions((prev) => {
      if (newMention) return [...prev, newMention];
      const users = selectedMentionIds.map((id) => directory.find((u) => u.id === id)).filter(Boolean);
      const entries = users.map((u) => ({ token: `@${(u.full_name || '').replace(/\s+/g, '')}`, ids: [u.id] }));
      return [...prev, ...entries];
    });
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

  // LỖI THẬT đã vá: trước đây gọi thẳng URL.createObjectURL(pendingPhoto)
  // NGAY TRONG JSX — mỗi lần component re-render (gõ thêm 1 chữ trong ô
  // nhập chẳng hạn) lại tạo 1 URL blob MỚI mà không bao giờ revoke URL cũ,
  // rò bộ nhớ dần theo thời gian dùng app. Giờ tính 1 lần bằng useMemo (chỉ
  // đổi khi pendingPhoto đổi) + revoke đúng lúc dọn dẹp.
  const pendingPhotoUrl = useMemo(() => (pendingPhoto ? URL.createObjectURL(pendingPhoto) : null), [pendingPhoto]);
  useEffect(() => () => { if (pendingPhotoUrl) URL.revokeObjectURL(pendingPhotoUrl); }, [pendingPhotoUrl]);

  const handleSendMessage = async () => {
    // LỖI THẬT đã vá: bấm "Tag người" tự chèn "@" vào ô soạn để mở popup gợi
    // ý; nếu đóng popup mà KHÔNG chọn ai rồi lỡ bấm gửi, "@" trơ trọi (không
    // rỗng) vẫn lọt qua điều kiện bên dưới và bị gửi đi thành 1 tin chỉ có
    // ký tự "@" — xoá "@" cụt cuối câu (không có tên theo sau) trước khi xét.
    const text = inputText.trim().replace(/@\s*$/, '').trim();
    if (!text && !pendingPhoto) return;
    if (!activeRoomId || !profile?.id) return;
    setSending(true);
    setError('');
    const tempId = `temp-${Date.now()}`;
    const roomIdAtSend = activeRoomId;
    const photoAtSend = pendingPhoto;
    // Chỉ báo "được nhắc đến" cho những mention mà token @Tên VẪN CÒN trong
    // chữ thật sự gửi đi — người đã bị xoá tay khỏi ô soạn thì không báo
    // nữa, và dùng matchMentionTokens (không phải includes thô) để tránh
    // khớp nhầm chuỗi con giữa 2 tên gần giống nhau.
    const mentionIdsAtSend = [...new Set(matchMentionTokens(pendingMentions, text).flatMap((m) => m.ids))];
    let attachmentUrl = null;
    justSentRef.current = true;
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
      setPendingMentions([]);

      const saved = await sendChatMessage({
        roomId: roomIdAtSend, senderId: profile.id, content: text || null, attachmentUrl, orderCode: extractOrderCode(text),
      });
      // Nếu realtime đã dội về trước và thay tempId bằng bản thật rồi
      // (mergeIncomingMessage ở effect subscribe xử lý), tempId không còn
      // tồn tại trong mảng nữa -> map dưới đây không đổi gì, KHÔNG tạo bản
      // trùng thứ 2 (đúng hướng còn lại của lỗi đua #4).
      // LỖI THẬT đã vá: KHÔNG setRefreshTick ở đây nữa — effect subscribe
      // realtime (subscribeToRooms) đã tự cập nhật `conversations` tại chỗ
      // (lastMessage/lastAt/sort) mỗi khi có tin insert, kể cả tin của
      // chính mình. Gọi lại refreshTick ở đây chỉ tải lại TOÀN BỘ danh sách
      // hội thoại + danh bạ + số chưa đọc (3 query thừa) VÀ làm cột trái
      // nháy "Đang tải..." mỗi lần bấm Enter.
      setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...saved } : m)));
      if (mentionIdsAtSend.length) {
        notifyChatMentions({ roomId: roomIdAtSend, messageId: saved.id, mentionedProfileIds: mentionIdsAtSend, preview: text }).catch(() => {});
      }
    } catch (e) {
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      setInputText(text);
      // Ảnh đã chọn (và có thể đã tải lên storage xong) không được để mất —
      // trước đây setPendingPhoto(null) chạy trước khi biết gửi có thành
      // công hay không, lỗi giữa chừng thì mất luôn ảnh, phải chọn lại từ đầu.
      if (photoAtSend) setPendingPhoto(photoAtSend);
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
      {/* LỖI THẬT đã vá: trước đây lỗi (setError) chỉ hiện BÊN TRONG khung
          nhập tin — nếu tải danh sách hội thoại/danh bạ lỗi ngay từ đầu, lúc
          CHƯA mở phòng nào, không ai thấy thông báo gì cả (màn hình trông
          như đang tải mãi). Giờ có 1 dòng lỗi LUÔN HIỆN Ở ĐẦU TRANG bất kể
          đang ở đâu. */}
      {error && (
        <div className="cs-top-error" role="alert">
          ⚠️ {error}
          <button type="button" onClick={() => setError('')}>✕</button>
        </div>
      )}

      {showList && (
        <div className="cs-list-pane">
          <div className="cs-list-header">
            <h3><IconChat size={20} /> Tin Nhắn</h3>
            <div className="cs-header-actions">
              <button className="cs-new-chat-btn" onClick={() => setShowCreateGroup(true)} title="Tạo nhóm chat"><IconStaff size={16} /></button>
              <button className="cs-new-chat-btn" onClick={() => setShowNewChat(true)} title="Nhắn tin mới">✎</button>
            </div>
          </div>
          <div className="cs-search-bar">
            <span className="cs-search-icon">🔍</span>
            <input
              type="text" placeholder="Tìm kiếm hội thoại..." value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && <button className="cs-search-clear" onClick={() => setSearchQuery('')} title="Xoá tìm kiếm">✕</button>}
          </div>
          <div className="cs-list-scroll">
            {loadingList && <div className="cs-list-empty">Đang tải...</div>}
            {!loadingList && conversations.length === 0 && (
              <div className="cs-list-empty">Chưa có hội thoại nào — bấm ✎ để bắt đầu chat với đồng nghiệp.</div>
            )}
            {!loadingList && conversations.length > 0 && visibleConversations.length === 0 && (
              <div className="cs-list-empty">Không tìm thấy hội thoại nào khớp "{searchQuery}"</div>
            )}
            {!loadingList && visibleConversations.map((c) => {
              const unread = unreadCounts[c.roomId] || 0;
              // 2.4 — Zalo hiện "Bạn: " trước preview khi tin cuối là CHÍNH
              // MÌNH gửi (dễ nhận ra "mình vừa nhắn, chưa thấy trả lời").
              const previewPrefix = c.lastMessage && c.lastSenderId === profile?.id ? 'Bạn: ' : '';
              return (
                <button
                  key={c.roomId}
                  className={`cs-convo-item ${activeRoomId === c.roomId ? 'active' : ''} ${c.pinned ? 'pinned' : ''} ${unread > 0 ? 'unread' : ''}`}
                  onClick={() => openConversation(c)}
                  onContextMenu={(e) => handleConvoContextMenu(e, c)}
                  onTouchStart={(e) => handleConvoTouchStart(e, c)}
                  onTouchEnd={handleConvoTouchEnd}
                  onTouchMove={handleConvoTouchEnd}
                >
                  {c.roomType === 'direct'
                    ? <UserAvatar profile={{ full_name: c.title, avatar_path: c.peerAvatarPath }} size={44} />
                    : <div className="cs-convo-avatar">{c.avatarEmoji}</div>}
                  <div className="cs-convo-info">
                    <div className="cs-convo-row-top">
                      <strong>{c.title}</strong>
                      <span className="cs-convo-time">{c.pinned && '📌 '}{c.lastAt ? formatListTime(c.lastAt) : ''}</span>
                    </div>
                    <div className="cs-convo-row-top">
                      <span className="cs-convo-preview">{c.lastMessage ? `${previewPrefix}${c.lastMessage}` : (c.subtitle || 'Bấm để xem hội thoại')}</span>
                      {unread > 0 && <span className="cs-unread-badge">{unread > 99 ? '99+' : unread}</span>}
                    </div>
                  </div>
                </button>
              );
            })}
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
                <button
                  className="cs-thread-header-info"
                  onClick={canManageActiveGroup ? openGroupInfo : undefined}
                  style={{ cursor: canManageActiveGroup ? 'pointer' : 'default' }}
                  disabled={!canManageActiveGroup}
                >
                  {activeConvo?.roomType === 'direct'
                    ? <UserAvatar profile={{ full_name: activeConvo?.title, avatar_path: activeConvo?.peerAvatarPath }} size={44} />
                    : <div className="cs-convo-avatar">{activeConvo?.avatarEmoji || '💬'}</div>}
                  <div className="cs-thread-title">
                    <h4>{activeConvo?.title || 'Hội thoại'}</h4>
                    <p>{canManageActiveGroup ? `${roomParticipants.length} thành viên · Bấm để xem` : (activeConvo?.subtitle || '')}</p>
                  </div>
                </button>
              </div>

              <div className="cs-thread-feed" ref={feedRef} onScroll={handleFeedScroll}>
                {loadingMessages && <div className="cs-list-empty">Đang tải tin nhắn...</div>}
                {!loadingMessages && hasMoreOlder && messages.length > 0 && (
                  <button type="button" className="cs-load-older" onClick={loadOlderMessages} disabled={loadingOlder}>
                    {loadingOlder ? 'Đang tải…' : '⬆️ Tải tin cũ hơn'}
                  </button>
                )}
                {!loadingMessages && messages.length === 0 && <div className="cs-list-empty">Chưa có tin nhắn nào — gửi lời chào đầu tiên nhé!</div>}
                {messages.map((msg) => {
                  const isMe = msg.sender_id === profile?.id;
                  const senderName = msg.profiles?.full_name || nameFor(msg.sender_id);
                  const senderAvatarPath = msg.profiles?.avatar_path ?? avatarPathFor(msg.sender_id);
                  return (
                    <div key={msg.id} className={`cs-msg-row ${isMe ? 'me' : ''}`}>
                      {!isMe && <UserAvatar profile={{ full_name: senderName, avatar_path: senderAvatarPath }} size={28} />}
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
                    {activeConvo?.roomType !== 'direct' && roomParticipantIds.length > 1 && (
                      <div className={`cs-mention-item ${selectedMentionIds.includes(TAG_ALL_ID) ? 'checked' : ''}`} onClick={() => toggleMentionSelect({ id: TAG_ALL_ID })}>
                        <div className="cs-mention-avatar">{selectedMentionIds.includes(TAG_ALL_ID) ? '✓' : '🌐'}</div>
                        <div className="cs-mention-info"><strong>Mọi người</strong><span>Tag toàn bộ {roomParticipantIds.length} người trong đoạn chat này</span></div>
                      </div>
                    )}
                    {filteredMentionUsers.map((u) => {
                      const checked = selectedMentionIds.includes(u.id);
                      return (
                        <div key={u.id} className={`cs-mention-item ${checked ? 'checked' : ''}`} onClick={() => toggleMentionSelect(u)}>
                          <div className="cs-mention-avatar">{checked ? '✓' : '👤'}</div>
                          <div className="cs-mention-info"><strong>{u.full_name}</strong><span>{u.role}</span></div>
                        </div>
                      );
                    })}
                    {filteredMentionUsers.length === 0 && roomParticipantIds.length <= 1 && <div className="cs-list-empty">Không tìm thấy</div>}
                    <button type="button" className="cs-mention-confirm" onClick={confirmMentionSelection} disabled={!selectedMentionIds.length}>
                      ✓ Xong{selectedMentionIds.includes(TAG_ALL_ID)
                        ? ' (Mọi người)'
                        : selectedMentionIds.length ? ` (${selectedMentionIds.length} người)` : ''}
                    </button>
                  </div>
                )}

                {pendingPhoto && (
                  <div className="cs-pending-photo">
                    <img src={pendingPhotoUrl} alt="preview" />
                    <span>Ảnh sẽ gửi kèm tin nhắn</span>
                    <button type="button" onClick={() => setPendingPhoto(null)}>✕</button>
                  </div>
                )}

                {showEmojiPicker && (
                  <div className="cs-emoji-picker-wrap">
                    {/* eslint-disable-next-line react/no-unknown-property */}
                    <emoji-picker ref={emojiPickerRef} class="cs-emoji-picker" />
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
                  <button type="button" onClick={() => setShowEmojiPicker((v) => !v)}>😊 Emoji</button>
                  <button type="button" onClick={() => setInputText((p) => `${p}👍`)}>👍 Like</button>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {convoMenu && (
        <div className="cs-convo-menu-overlay" onClick={closeConvoMenu} onContextMenu={(e) => e.preventDefault()}>
          <div
            className="cs-convo-menu"
            style={{ left: Math.min(convoMenu.x, window.innerWidth - 200), top: Math.min(convoMenu.y, window.innerHeight - 120) }}
            onClick={(e) => e.stopPropagation()}
          >
            <button type="button" onClick={() => { togglePin(convoMenu.convo); closeConvoMenu(); }}>
              {convoMenu.convo.pinned ? '📌 Bỏ ghim' : '📌 Ghim hội thoại'}
            </button>
            <button type="button" onClick={() => { handleMarkUnread(convoMenu.convo); closeConvoMenu(); }}>
              🔵 Đánh dấu chưa đọc
            </button>
          </div>
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
                  <UserAvatar profile={u} size={44} />
                  <div><strong>{u.full_name}</strong><span>{u.role}</span></div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {showCreateGroup && (
        <div className="cs-new-chat-overlay" onClick={() => setShowCreateGroup(false)}>
          <div className="cs-new-chat-sheet cs-create-group-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="cs-new-chat-head">
              <strong>Tạo nhóm chat</strong>
              <button onClick={() => setShowCreateGroup(false)}>✕</button>
            </div>
            <div className="cs-group-name-field">
              <input
                type="text" placeholder="Tên nhóm (không bắt buộc)"
                value={groupName} onChange={(e) => setGroupName(e.target.value)}
              />
            </div>
            <div className="cs-new-chat-list cs-group-member-list">
              {directory.map((u) => {
                const checked = groupMemberIds.includes(u.id);
                return (
                  <button key={u.id} className={`cs-new-chat-item cs-group-member-item ${checked ? 'checked' : ''}`} onClick={() => toggleGroupMember(u.id)}>
                    {checked ? <div className="cs-avatar cs-avatar-checked">✓</div> : <UserAvatar profile={u} size={44} />}
                    <div><strong>{u.full_name}</strong><span>{u.role}</span></div>
                  </button>
                );
              })}
            </div>
            <div className="cs-create-group-footer">
              <button
                className="cs-create-group-confirm" onClick={handleCreateGroup} disabled={creatingGroup || !groupMemberIds.length}
              >
                {creatingGroup ? 'Đang tạo...' : `Tạo nhóm${groupMemberIds.length ? ` (${groupMemberIds.length} người)` : ''}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Thông tin nhóm — LỖI THẬT đã vá: trước đây tạo nhóm xong không sửa
          được gì cả. Chỉ hiện cho nhóm TỰ TẠO (canManageActiveGroup). */}
      {showGroupInfo && (
        <div className="cs-new-chat-overlay" onClick={() => setShowGroupInfo(false)}>
          <div className="cs-new-chat-sheet cs-create-group-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="cs-new-chat-head">
              <strong>Thông tin nhóm</strong>
              <button onClick={() => setShowGroupInfo(false)}>✕</button>
            </div>
            <div className="cs-group-name-field" style={{ display: 'flex', gap: 8 }}>
              <input
                type="text" placeholder="Tên nhóm" value={groupInfoName}
                onChange={(e) => setGroupInfoName(e.target.value)}
                style={{ flex: 1 }}
              />
              <button type="button" className="cs-group-save-btn" onClick={handleRenameGroup} disabled={savingGroupInfo}>Lưu</button>
            </div>
            <div className="cs-group-section-head">
              <span>Thành viên ({roomParticipants.length})</span>
              <button type="button" onClick={() => setShowAddMembers(true)}>+ Thêm người</button>
            </div>
            <div className="cs-new-chat-list cs-group-member-list">
              {roomParticipants.map((u) => (
                <div key={u.id} className="cs-new-chat-item cs-group-member-row">
                  <UserAvatar profile={{ full_name: u.full_name, avatar_path: u.avatarPath }} size={44} />
                  <div style={{ flex: 1 }}><strong>{u.full_name}{u.id === profile?.id ? ' (Bạn)' : ''}</strong><span>{u.role}</span></div>
                  {(u.id === profile?.id || isCreatorOfActiveGroup) && (
                    <button type="button" className="cs-group-remove-btn" disabled={savingGroupInfo} onClick={() => handleRemoveMember(u.id)}>
                      {u.id === profile?.id ? 'Rời nhóm' : 'Xoá'}
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {showAddMembers && (
        <div className="cs-new-chat-overlay" onClick={() => setShowAddMembers(false)}>
          <div className="cs-new-chat-sheet cs-create-group-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="cs-new-chat-head">
              <strong>Thêm người vào nhóm</strong>
              <button onClick={() => setShowAddMembers(false)}>✕</button>
            </div>
            <div className="cs-new-chat-list cs-group-member-list">
              {directory.filter((u) => !roomParticipantIds.includes(u.id)).map((u) => {
                const checked = addMemberIds.includes(u.id);
                return (
                  <button key={u.id} className={`cs-new-chat-item cs-group-member-item ${checked ? 'checked' : ''}`}
                    onClick={() => setAddMemberIds((prev) => (prev.includes(u.id) ? prev.filter((id) => id !== u.id) : [...prev, u.id]))}>
                    {checked ? <div className="cs-avatar cs-avatar-checked">✓</div> : <UserAvatar profile={u} size={44} />}
                    <div><strong>{u.full_name}</strong><span>{u.role}</span></div>
                  </button>
                );
              })}
              {directory.filter((u) => !roomParticipantIds.includes(u.id)).length === 0 && (
                <div className="cs-list-empty">Mọi người đã ở trong nhóm rồi.</div>
              )}
            </div>
            <div className="cs-create-group-footer">
              <button className="cs-create-group-confirm" onClick={handleAddMembers} disabled={savingGroupInfo || !addMemberIds.length}>
                {savingGroupInfo ? 'Đang thêm...' : `Thêm${addMemberIds.length ? ` (${addMemberIds.length} người)` : ''}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
