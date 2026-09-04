import { supabase } from './supabaseClient';

// Toàn bộ nhân viên đã duyệt & đang hoạt động — dùng cho danh sách "Chat riêng 1-1" và gợi ý @mention.
export async function fetchChatDirectory() {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, role, station')
    .eq('approved', true)
    .neq('active', false)
    .order('full_name');
  if (error) throw error;
  return data || [];
}

export async function getOrCreateDmRoom(otherProfileId) {
  const { data, error } = await supabase.rpc('get_or_create_dm_room', { p_other_id: otherProfileId });
  if (error) throw error;
  return data;
}

export async function fetchRoomMessages(roomId, { limit = 100 } = {}) {
  const { data, error } = await supabase
    .from('chat_messages')
    .select('id, room_id, sender_id, content, attachment_url, order_code, created_at, profiles(full_name, role)')
    .eq('room_id', roomId)
    .order('created_at', { ascending: true })
    .limit(limit);
  if (error) throw error;
  return data || [];
}

export async function sendChatMessage({ roomId, senderId, content, attachmentUrl = null, orderCode = null }) {
  const { data, error } = await supabase
    .from('chat_messages')
    .insert({ room_id: roomId, sender_id: senderId, content: content || null, attachment_url: attachmentUrl, order_code: orderCode })
    .select('id, room_id, sender_id, content, attachment_url, order_code, created_at')
    .single();
  if (error) throw error;
  return data;
}

// Báo riêng cho từng người bị "@Tên" trong tin nhắn — best-effort, không
// chặn luồng gửi tin nếu lỗi (mention chỉ là phần thêm, không phải cốt lõi).
export async function notifyChatMentions({ roomId, messageId, mentionedProfileIds, preview }) {
  if (!mentionedProfileIds?.length) return;
  const { error } = await supabase.rpc('notify_chat_mentions', {
    p_room_id: roomId, p_message_id: messageId, p_mentioned_profile_ids: mentionedProfileIds, p_preview: preview || null,
  });
  if (error) console.error('[chat] notify_chat_mentions lỗi:', error.message);
}

export function subscribeToRoomMessages(roomId, onInsert) {
  const channel = supabase
    .channel(`chat-room-${roomId}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `room_id=eq.${roomId}` }, (payload) => {
      onInsert(payload.new);
    })
    .subscribe();
  return () => supabase.removeChannel(channel);
}

// ---- Danh sách hội thoại kiểu Messenger + huy hiệu tin chưa đọc ----

// Thành viên hiện tại của 1 phòng chat — dùng cho "@Mọi người" (tag toàn bộ
// người đang ở trong đúng cuộc hội thoại này, không phải toàn công ty).
export async function fetchRoomParticipants(roomId) {
  const { data, error } = await supabase.from('chat_participants').select('profile_id').eq('room_id', roomId);
  if (error) throw error;
  return (data || []).map((r) => r.profile_id);
}

// Danh sách hội thoại HỢP NHẤT (nhóm + riêng) kèm tin nhắn gần nhất, sắp xếp
// theo thời gian mới nhất — dùng cho trang Chat kiểu Zalo (ChatScreen).
export async function fetchAllConversations(myId) {
  const { data: parts, error } = await supabase
    .from('chat_participants')
    .select('room_id, pinned, chat_rooms(id, name, room_type, topic, avatar_emoji)')
    .eq('profile_id', myId);
  if (error) throw error;
  const pinnedByRoom = Object.fromEntries((parts || []).map((p) => [p.room_id, !!p.pinned]));
  const rooms = (parts || []).map((p) => p.chat_rooms).filter(Boolean);
  const roomIds = rooms.map((r) => r.id);
  if (!roomIds.length) return [];

  const directRoomIds = rooms.filter((r) => r.room_type === 'direct').map((r) => r.id);
  const peerByRoom = {};
  if (directRoomIds.length) {
    const { data: peers, error: peerErr } = await supabase
      .from('chat_participants')
      .select('room_id, profiles(id, full_name, role, station)')
      .in('room_id', directRoomIds)
      .neq('profile_id', myId);
    if (peerErr) throw peerErr;
    for (const p of peers || []) peerByRoom[p.room_id] = p.profiles;
  }

  const { data: msgs, error: msgErr } = await supabase
    .from('chat_messages')
    .select('room_id, content, attachment_url, created_at')
    .in('room_id', roomIds)
    .order('created_at', { ascending: false });
  if (msgErr) throw msgErr;
  const lastByRoom = {};
  for (const m of msgs || []) { if (!lastByRoom[m.room_id]) lastByRoom[m.room_id] = m; }

  return rooms
    .map((r) => {
      const last = lastByRoom[r.id];
      const peer = peerByRoom[r.id];
      const isDirect = r.room_type === 'direct';
      return {
        roomId: r.id,
        roomType: r.room_type,
        peerId: peer?.id || null,
        title: isDirect ? (peer?.full_name || 'Người dùng') : (r.name || 'Nhóm chat'),
        subtitle: isDirect ? (peer?.role || '') : (r.topic || ''),
        avatarEmoji: isDirect ? '👤' : (r.avatar_emoji || '💬'),
        lastMessage: last ? (last.content || (last.attachment_url ? '📷 Đã gửi ảnh' : '')) : '',
        lastAt: last?.created_at || null,
        pinned: !!pinnedByRoom[r.id],
      };
    })
    .filter((c) => c.roomType !== 'direct' || c.peerId)
    .sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      if (a.lastAt && b.lastAt) return new Date(b.lastAt) - new Date(a.lastAt);
      if (a.lastAt) return -1;
      if (b.lastAt) return 1;
      return a.title.localeCompare(b.title);
    });
}

// Ghim/bỏ ghim 1 phòng chat — CHỈ ảnh hưởng cách chính mình sắp xếp danh
// sách, không đụng gì tới người khác (mỗi người có 1 dòng chat_participants
// riêng, RLS chỉ cho tự sửa dòng của mình — xem migration 202609010100).
export async function setConversationPinned(roomId, myId, pinned) {
  const { error } = await supabase
    .from('chat_participants')
    .update({ pinned })
    .eq('room_id', roomId)
    .eq('profile_id', myId);
  if (error) throw error;
}

// Tự tạo nhóm chat mới với người mình chọn (khác 4 nhóm mặc định cố định).
export async function createChatGroup(name, memberIds) {
  const { data, error } = await supabase.rpc('create_chat_group', { p_name: name, p_member_ids: memberIds });
  if (error) throw error;
  return data;
}

// Số tin nhắn chưa đọc theo từng phòng, dựa trên chat_participants.last_read_at.
export async function fetchUnreadCounts(myId) {
  const { data: parts, error: pErr } = await supabase
    .from('chat_participants')
    .select('room_id, last_read_at')
    .eq('profile_id', myId);
  if (pErr) throw pErr;
  if (!parts?.length) return {};
  const roomIds = parts.map((p) => p.room_id);
  const lastReadByRoom = Object.fromEntries(parts.map((p) => [p.room_id, p.last_read_at]));

  const { data: msgs, error: mErr } = await supabase
    .from('chat_messages')
    .select('room_id, sender_id, created_at')
    .in('room_id', roomIds)
    .neq('sender_id', myId);
  if (mErr) throw mErr;

  const counts = {};
  for (const m of msgs || []) {
    const lastRead = lastReadByRoom[m.room_id];
    if (!lastRead || new Date(m.created_at) > new Date(lastRead)) {
      counts[m.room_id] = (counts[m.room_id] || 0) + 1;
    }
  }
  return counts;
}

export async function markRoomRead(roomId, myId) {
  const { error } = await supabase
    .from('chat_participants')
    .update({ last_read_at: new Date().toISOString() })
    .eq('room_id', roomId)
    .eq('profile_id', myId);
  if (error) throw error;
}

// Trích mã đơn dạng #ORD-1234 / #SUMI-... khỏi nội dung tin nhắn để lưu kèm (tiện lọc/click sau này).
export function extractOrderCode(text) {
  const m = (text || '').match(/#([A-Z]+-[A-Z0-9-]+)/);
  return m ? m[1] : null;
}
