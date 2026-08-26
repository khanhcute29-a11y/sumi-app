import { supabase } from './supabaseClient';

// Danh sách phòng chat nhóm mà mình là thành viên + phòng chat riêng đang có.
export async function fetchMyChatRooms() {
  const { data, error } = await supabase
    .from('chat_participants')
    .select('room_id, chat_rooms(id,name,room_type,topic,avatar_emoji)')
    .order('room_id');
  if (error) throw error;
  return (data || []).map((r) => r.chat_rooms).filter(Boolean);
}

// Toàn bộ nhân viên đã duyệt & đang hoạt động — dùng cho danh sách "Chat riêng 1-1" và gợi ý @mention.
export async function fetchChatDirectory() {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, role, station, avatar_url')
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

export function subscribeToRoomMessages(roomId, onInsert) {
  const channel = supabase
    .channel(`chat-room-${roomId}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `room_id=eq.${roomId}` }, (payload) => {
      onInsert(payload.new);
    })
    .subscribe();
  return () => supabase.removeChannel(channel);
}

// Trích mã đơn dạng #ORD-1234 / #SUMI-... khỏi nội dung tin nhắn để lưu kèm (tiện lọc/click sau này).
export function extractOrderCode(text) {
  const m = (text || '').match(/#([A-Z]+-[A-Z0-9-]+)/);
  return m ? m[1] : null;
}
