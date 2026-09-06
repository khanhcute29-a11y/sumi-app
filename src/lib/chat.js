import { supabase } from './supabaseClient';

// Toàn bộ nhân viên đã duyệt & đang hoạt động — dùng cho danh sách "Chat riêng 1-1" và gợi ý @mention.
export async function fetchChatDirectory() {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, role, station, avatar_path')
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

// LỖI THẬT đã vá: trước đây order('created_at',{ascending:true}).limit(100)
// lấy đúng 100 tin CŨ NHẤT (sắp tăng dần rồi cắt ở 100 đầu tiên), KHÔNG PHẢI
// 100 tin MỚI NHẤT — phòng nào quá 100 tin là mở lên chỉ thấy tin từ hồi
// khai trương, tin hôm nay hoàn toàn biến mất cho tới khi có realtime đẩy
// tin mới vào. Sửa: sắp giảm dần (mới nhất trước) rồi cắt, xong đảo lại để
// hiển thị đúng thứ tự cũ→mới như khung chat bình thường.
// `before`/`beforeId` (optional) hỗ trợ TẢI THÊM tin CŨ HƠN khi cuộn lên đầu
// (phân trang) — không truyền thì lấy đúng N tin mới nhất.
// LỖI THẬT đã vá: trước đây chỉ cắt trang bằng `created_at < before` — nếu
// 2 tin trong CÙNG phòng ghi trùng y hệt 1 mili-giây (gửi dồn dập/insert
// hàng loạt), tin nào có created_at BẰNG mốc `before` sẽ bị RỚT MẤT vĩnh
// viễn khỏi cả 2 trang (trang trước không có vì đã cắt ở limit, trang sau
// không có vì bị `lt` loại). Giờ sắp thêm `id` làm tiêu chí phụ (đồng nhất
// khi tie) và cắt trang bằng cặp (created_at, id) qua `.or()` — không tin
// nào lọt qua kẽ hở giữa 2 trang nữa.
export async function fetchRoomMessages(roomId, { limit = 50, before, beforeId } = {}) {
  let q = supabase
    .from('chat_messages')
    .select('id, room_id, sender_id, content, attachment_url, order_code, created_at, profiles(full_name, role, avatar_path)')
    .eq('room_id', roomId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(limit);
  if (before) {
    q = beforeId
      ? q.or(`created_at.lt.${before},and(created_at.eq.${before},id.lt.${beforeId})`)
      : q.lt('created_at', before);
  }
  const { data, error } = await q;
  if (error) throw error;
  return (data || []).reverse();
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

// LỖI THẬT đã vá: trước đây MỖI PHÒNG đang mở mới có 1 kênh realtime riêng —
// tin nhắn của các phòng KHÁC (không đang mở) hoàn toàn im lặng, không cập
// nhật preview/badge cho tới khi người dùng tự bấm vào lại phòng đó. Hàm
// mới subscribe MỘT LẦN cho TẤT CẢ phòng mình đang tham gia (Supabase
// Realtime hỗ trợ filter "room_id=in.(...)"), gọi callback cho MỌI tin nhắn
// mới bất kể đang mở phòng nào — ChatScreen tự định tuyến vào đúng chỗ
// (đẩy vào luồng đang xem, hoặc chỉ cập nhật preview/số chưa đọc).
export function subscribeToRooms(roomIds, onInsert) {
  if (!roomIds?.length) return () => {};
  const ids = [...roomIds].sort();
  const channel = supabase
    .channel(`chat-rooms-${ids.join('-').slice(0, 100)}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `room_id=in.(${ids.join(',')})` }, (payload) => {
      onInsert(payload.new);
    })
    .subscribe();
  return () => supabase.removeChannel(channel);
}

// ---- Danh sách hội thoại kiểu Messenger + huy hiệu tin chưa đọc ----

// Thành viên hiện tại của 1 phòng chat KÈM TÊN/VAI TRÒ — dùng cho "@Mọi
// người"/gợi ý tag (chỉ người thật sự đang ở trong ĐÚNG phòng, không phải
// toàn công ty) và cho màn "Thành viên nhóm".
export async function fetchRoomParticipants(roomId) {
  const { data, error } = await supabase.from('chat_participants')
    .select('profile_id, profiles(id, full_name, role, avatar_path)')
    .eq('room_id', roomId);
  if (error) throw error;
  return (data || []).map((r) => ({ id: r.profile_id, full_name: r.profiles?.full_name || '', role: r.profiles?.role || '', avatarPath: r.profiles?.avatar_path || null }));
}

// LỖI THẬT đã vá: trước đây quét TOÀN BỘ chat_messages của MỌI phòng (không
// giới hạn dòng) chỉ để lấy 1 dòng preview/phòng — chạy lại sau MỖI lần gửi
// tin (do refreshTick), càng nhiều tin nhắn tích luỹ càng chậm/tốn. Giờ đọc
// thẳng chat_rooms.last_message_* (tự cập nhật qua TRIGGER database khi có
// tin mới — xem migration 202609061200), không đụng tới chat_messages nữa.
export async function fetchAllConversations(myId) {
  const { data: parts, error } = await supabase
    .from('chat_participants')
    .select('room_id, pinned, chat_rooms(id, name, room_type, topic, avatar_emoji, created_by, last_message_at, last_message_preview, last_message_sender_id)')
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
      .select('room_id, profiles(id, full_name, role, station, avatar_path)')
      .in('room_id', directRoomIds)
      .neq('profile_id', myId);
    if (peerErr) throw peerErr;
    for (const p of peers || []) peerByRoom[p.room_id] = p.profiles;
  }

  return rooms
    .map((r) => {
      const peer = peerByRoom[r.id];
      const isDirect = r.room_type === 'direct';
      return {
        roomId: r.id,
        roomType: r.room_type,
        peerId: peer?.id || null,
        peerAvatarPath: isDirect ? (peer?.avatar_path || null) : null,
        createdBy: r.created_by || null,
        title: isDirect ? (peer?.full_name || 'Người dùng') : (r.name || 'Nhóm chat'),
        subtitle: isDirect ? (peer?.role || '') : (r.topic || ''),
        avatarEmoji: isDirect ? null : (r.avatar_emoji || '💬'),
        lastMessage: r.last_message_preview || '',
        lastAt: r.last_message_at || null,
        lastSenderId: r.last_message_sender_id || null,
        pinned: !!pinnedByRoom[r.id],
      };
    })
    .filter((c) => c.roomType !== 'direct' || c.peerId)
    .sort(sortConversations);
}

// Thứ tự sắp xếp hội thoại — tách riêng thành hàm dùng chung để cập nhật
// TẠI CHỖ (khi có tin mới đẩy tới qua realtime) vẫn sắp đúng như lúc tải lại
// từ đầu, không lệch nhau.
export function sortConversations(a, b) {
  if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
  if (a.lastAt && b.lastAt) return new Date(b.lastAt) - new Date(a.lastAt);
  if (a.lastAt) return -1;
  if (b.lastAt) return 1;
  return a.title.localeCompare(b.title);
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

// Quản lý nhóm tự tạo — CHỈ áp dụng nhóm created_by IS NOT NULL, chặn ở RPC
// (migration 202609061200) nên 4 nhóm mặc định toàn công ty không đổi/rời
// được qua đây, dù có gọi nhầm.
export async function renameChatGroup(roomId, newName) {
  const { error } = await supabase.rpc('rename_chat_group', { p_room_id: roomId, p_new_name: newName });
  if (error) throw error;
}

export async function addChatGroupMembers(roomId, memberIds) {
  const { error } = await supabase.rpc('add_chat_group_members', { p_room_id: roomId, p_member_ids: memberIds });
  if (error) throw error;
}

// p_member_id === chính mình -> tự rời nhóm; khác mình -> chỉ người tạo
// nhóm mới xoá được (chặn ở RPC).
export async function removeChatGroupMember(roomId, memberId) {
  const { error } = await supabase.rpc('remove_chat_group_member', { p_room_id: roomId, p_member_id: memberId });
  if (error) throw error;
}

// LỖI THẬT đã vá: trước đây kéo MỌI tin nhắn (không giới hạn dòng) của mọi
// phòng về JS rồi đếm bằng tay — vượt quá giới hạn mặc định 1000 dòng của
// PostgREST là ĐẾM SAI mà không báo lỗi gì cả, lại tốn băng thông/tiền
// Supabase mỗi lần gọi (App.jsx gọi lại trên MỌI tin nhắn hệ thống). Giờ
// đếm hẳn trong SQL qua RPC get_chat_unread_counts (migration 202609061200)
// — luôn đúng bất kể số dòng, không kéo dữ liệu thô về client.
export async function fetchUnreadCounts() {
  const { data, error } = await supabase.rpc('get_chat_unread_counts');
  if (error) throw error;
  const counts = {};
  for (const row of data || []) counts[row.room_id] = Number(row.cnt) || 0;
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

// "Đánh dấu chưa đọc" (menu ngữ cảnh, kiểu Zalo) — lùi last_read_at về TRƯỚC
// đúng 1ms so với tin cuối cùng, để CHỈ tin cuối hiện lại "chưa đọc" (không
// lùi về null, vì null sẽ tính TOÀN BỘ lịch sử phòng là chưa đọc nếu phòng
// đã có sẵn rất nhiều tin cũ — sai số đếm không cần thiết).
export async function markRoomUnread(roomId, myId, lastMessageAt) {
  if (!lastMessageAt) return;
  const before = new Date(new Date(lastMessageAt).getTime() - 1).toISOString();
  const { error } = await supabase
    .from('chat_participants')
    .update({ last_read_at: before })
    .eq('room_id', roomId)
    .eq('profile_id', myId);
  if (error) throw error;
}

// Trích mã đơn dạng #ORD-1234 / #SUMI-... khỏi nội dung tin nhắn để lưu kèm
// (tiện lọc/click sau này).
// LỖI THẬT đã vá: trước đây chỉ nhận chữ HOA ([A-Z]) nên gõ thường
// "#sumi-20260826-001" không nhận ra là mã đơn — giờ nhận cả hai, luôn
// chuẩn hoá về chữ hoa khi lưu (mã đơn thật trong hệ thống luôn viết hoa).
export function extractOrderCode(text) {
  const m = (text || '').match(/#([A-Za-z]+-[A-Za-z0-9-]+)/);
  return m ? m[1].toUpperCase() : null;
}
