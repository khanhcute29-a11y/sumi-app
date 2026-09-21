-- Ẩn/Xoá hội thoại (riêng từng người, KHÔNG xoá dữ liệu tin nhắn thật của
-- ai cả — chat nhóm nhiều người, xoá thật sẽ mất dữ liệu của người khác) +
-- Báo xấu hội thoại.
begin;
set local lock_timeout = '10s';
set local statement_timeout = '30s';

-- "Ẩn trò chuyện": hidden_at = lúc ẩn. Khi có tin nhắn mới sau thời điểm
-- này, hội thoại tự hiện lại trong danh sách (so sánh với last_message_at
-- ở phía client) — giống hành vi thật của Zalo, không cần dọn dẹp thủ công.
-- "Xoá hội thoại" dùng LẠI CHÍNH cột này (xem giải thích trong ChatScreen.jsx
-- tại hàm handleHideConversation/handleDeleteConversation) — vì đây là dữ
-- liệu DÙNG CHUNG nhiều người (nhóm/1-1), xoá thật sẽ làm mất lịch sử của
-- người khác, nên "Xoá" ở đây chỉ có nghĩa "ẩn khỏi danh sách của TÔI",
-- không xoá tin nhắn nào cả. Rời nhóm thật (removeChatGroupMember) là tính
-- năng khác, đã có sẵn.
alter table public.chat_participants
  add column if not exists hidden_at timestamptz;

create table if not exists public.chat_reports (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.chat_rooms(id) on delete cascade,
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  reason text,
  created_at timestamptz not null default now()
);

alter table public.chat_reports enable row level security;

drop policy if exists "participants insert own report" on public.chat_reports;
create policy "participants insert own report" on public.chat_reports for insert with check (
  reporter_id = auth.uid() and public.is_chat_room_participant(room_id)
);

-- Chỉ người báo cáo hoặc Giám đốc mới xem được báo cáo - không có UI duyệt
-- báo cáo ở phiên bản này, để dành cho lúc thật sự cần.
drop policy if exists "read own report or director" on public.chat_reports;
create policy "read own report or director" on public.chat_reports for select using (
  reporter_id = auth.uid() or public.is_business_director()
);

insert into public.migration_runs(migration_key, status, finished_at, notes)
values('202609181420_chat_an_hoi_thoai_va_bao_xau', 'completed', now(),
  'Chat: thêm cột chat_participants.hidden_at (ẩn/xoá hội thoại CHỈ RIÊNG mình, tự hiện lại khi có tin mới - không xoá tin nhắn của ai) + bảng chat_reports (báo xấu, chỉ người báo cáo và Giám đốc xem được, chưa có UI duyệt).')
on conflict(migration_key) do update set status='completed', finished_at=now(), notes=excluded.notes;

commit;
