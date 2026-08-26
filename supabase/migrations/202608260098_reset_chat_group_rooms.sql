-- Migration trước (097) dọn theo avatar_emoji nhưng KHÔNG hết trùng — vì bản
-- thân avatar_emoji (ký tự ghép ZWJ như 👨‍🍳) cũng đã bị lệch dạng qua các lần
-- copy/paste giống hệt vấn đề của cột `name`, nên vẫn không nhận diện được
-- "phòng gốc" bằng nội dung text một cách đáng tin cậy.
--
-- Vì tính năng chat vừa mới build, CHƯA có tin nhắn thật nào của người dùng
-- (chỉ có dữ liệu test khi đang dò lỗi) — xoá sạch phòng nhóm bị lỗi và tạo
-- lại đúng 1 lần bằng INSERT tường minh (không dò-so-khớp gì cả), gắn `code`
-- thuần ASCII ngay từ đầu + unique index để không bao giờ lặp lại được nữa.
-- Phòng chat riêng (room_type='direct') không đụng tới.
begin;

delete from public.chat_messages where room_id in (select id from public.chat_rooms where room_type = 'group');
delete from public.chat_participants where room_id in (select id from public.chat_rooms where room_type = 'group');
delete from public.chat_rooms where room_type = 'group';

drop index if exists idx_chat_rooms_code;

insert into public.chat_rooms (name, room_type, topic, avatar_emoji, code) values
  ('🥐 Toàn Công Ty SUMI Bakery', 'group', 'Kênh thông báo & trao đổi chung toàn hệ thống', '🥐', 'c_general'),
  ('👨‍🍳 Bếp Bánh & KDS Điều Phối', 'group', 'Trao đổi tiến độ mẻ bánh, đơn gấp, mẫu bánh đặc biệt', '👨‍🍳', 'c_kitchen'),
  ('🚚 Đội Giao Vận & Shipper', 'group', 'Điều phối giao bánh, định vị GPS & báo kẹt xe', '🚚', 'c_delivery'),
  ('🏭 Xưởng 41 & 42 (Macaron & Trường Học)', 'group', 'Điều phối số lượng khay Macaron và bánh sỉ trường học', '🏭', 'c_factory41');

insert into public.chat_participants(room_id, profile_id)
select r.id, p.id
from public.chat_rooms r
cross join public.profiles p
where r.room_type = 'group' and p.approved = true and p.active is distinct from false
on conflict (room_id, profile_id) do nothing;

create unique index if not exists idx_chat_rooms_code on public.chat_rooms(code) where code is not null;

insert into public.migration_runs(migration_key, status, finished_at, notes)
values('202608260098_reset_chat_group_rooms', 'completed', now(),
  'Migration 097s emoji-based dedup did not fully resolve duplicates because avatar_emoji (a ZWJ character sequence) had also drifted across copy/pastes. Since the feature had no real user messages yet, wiped and recreated the 4 group rooms via explicit INSERT (no text matching at all) with a stable ASCII code + unique index from the start.')
on conflict(migration_key) do update set status='completed', finished_at=now(), notes=excluded.notes;

commit;
