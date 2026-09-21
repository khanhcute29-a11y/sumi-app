-- Phân loại hội thoại theo màu (Khách hàng/Gia đình/Công việc/Bạn bè/Trả lời
-- sau/Đồng nghiệp/Yêu) + Tắt thông báo có hẹn giờ, kiểu Zalo — cả 2 đều là
-- lựa chọn RIÊNG của từng người, không ảnh hưởng người khác trong cùng
-- phòng chat, nên lưu thẳng vào chat_participants (giống cách "pinned" đã
-- làm ở 202609010100) — KHÔNG cần policy RLS mới vì UPDATE policy "self
-- update own participant row" (profile_id = auth.uid()) đã cho phép sửa
-- MỌI cột trên đúng dòng của mình, kể cả cột mới thêm ở đây.
begin;
set local lock_timeout = '10s';
set local statement_timeout = '30s';

alter table public.chat_participants
  add column if not exists label_color text,
  add column if not exists muted_until timestamptz;

alter table public.chat_participants drop constraint if exists chat_participants_label_color_check;
alter table public.chat_participants add constraint chat_participants_label_color_check
  check (label_color is null or label_color in ('customer', 'family', 'work', 'friend', 'reply_later', 'colleague', 'love'));

insert into public.migration_runs(migration_key, status, finished_at, notes)
values('202609181410_chat_phan_loai_va_tat_thong_bao', 'completed', now(),
  'Chat: thêm cột chat_participants.label_color (phân loại màu, có check constraint 7 giá trị cố định) và muted_until (tắt thông báo có hẹn giờ, NULL = không tắt, thời điểm rất xa trong tương lai = tắt vĩnh viễn) - dùng chung UPDATE RLS "self update own participant row" đã có sẵn từ trước, không cần thêm policy.')
on conflict(migration_key) do update set status='completed', finished_at=now(), notes=excluded.notes;

commit;
