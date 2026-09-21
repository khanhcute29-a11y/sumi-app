-- LỖI THẬT phát hiện khi test trực tiếp (18/9/2026): bấm bỏ 1 cảm xúc đã
-- thả (xoá đúng trong DB - verify bằng query trực tiếp, bảng rỗng đúng)
-- nhưng giao diện KHÔNG tự cập nhật, cảm xúc vẫn hiện trên màn hình như cũ
-- cho tới khi tải lại trang.
--
-- Nguyên nhân: Postgres Realtime mặc định chỉ gửi kèm PRIMARY KEY trong sự
-- kiện DELETE (payload.old chỉ có {id: ...}), không có message_id/room_id/
-- profile_id/emoji — code phía client dùng payload.old.message_id để biết
-- XOÁ cảm xúc khỏi tin nhắn nào, nhận về undefined nên không xoá được gì cả
-- trên giao diện dù DB đã xoá đúng.
--
-- Sửa: bật REPLICA IDENTITY FULL cho bảng này - sự kiện DELETE sẽ gửi kèm
-- ĐẦY ĐỦ mọi cột (không chỉ khoá chính), đúng thứ code client đang cần.
begin;
set local lock_timeout = '10s';
set local statement_timeout = '30s';

alter table public.chat_message_reactions replica identity full;

insert into public.migration_runs(migration_key, status, finished_at, notes)
values('202609181430_fix_reaction_delete_realtime', 'completed', now(),
  'LỖI THẬT đã vá: bật REPLICA IDENTITY FULL cho chat_message_reactions - sự kiện Realtime DELETE trước đây chỉ gửi kèm id (mặc định), thiếu message_id nên client không xoá được cảm xúc khỏi giao diện dù DB đã xoá đúng (phát hiện qua test tay: query trực tiếp bảng rỗng nhưng UI vẫn hiện cảm xúc cũ).')
on conflict(migration_key) do update set status='completed', finished_at=now(), notes=excluded.notes;

commit;
